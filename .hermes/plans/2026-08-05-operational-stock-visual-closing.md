# Operational Visual Stock & Simplified Closing Implementation Plan

> **For Hermes:** Use the `subagent-driven-development` skill to implement this plan task-by-task, with spec review and code-quality review after each task.

**Goal:** Mengubah pengalaman stock opname restoran dari input unit teknis menjadi laporan stok operasional berbasis kemasan yang terlihat—contoh `Susu Greenfields · 5 box`—tanpa merusak unit teknis untuk resep, HPP, purchasing, dan auto-deduct.

**Architecture:** Gunakan dual-layer inventory. `pos.inventory.quantity/unit` dan field konversi teknis tetap menjadi sumber perhitungan resep/HPP/auto-deduct; tambahkan atribut stok operasional untuk `operational_quantity`, `operational_unit`, `operational_status`, icon/presentation key, dan threshold. UI karyawan/admin memakai lapisan operasional, sedangkan backend menyimpan audit report setiap closing dan hanya mengubah stok operasional melalui closing final/admin confirmation sesuai aturan yang disetujui.

**Tech Stack:** React 19, Vite, TypeScript, TanStack Router, Tailwind v4, shared YumiPOS components/theme, Supabase PostgreSQL (`pos.inventory`, `pos.stock_opname_logs`, `pos.inventory_transactions`), Supabase Edge Functions/Deno, Telegram Mini App.

**Design Standard:** `frontend-design/ai-product-design-dna` + `frontend-design/ui-ux-design-standard` + `frontend-design/react-design-system-styling`. UI wajib memakai shared theme, Plus Jakarta Sans/display hierarchy, light surface, 24px cards, 14px controls, soft shadows, one blue accent, Lucide 2px line icons (bukan emoji sebagai icon UI), iOS easing, 44px touch targets, WCAG AA, reduced-motion, dan semua loading/empty/error/success/confirmation state.

**Current verified ownership:**
- Karyawan main attendance page: `apps/karyawan/src/routes/$username/absensi.lazy.tsx` → membuka `@yumihrdbot`.
- Karyawan browser closing: `apps/karyawan/src/routes/$username/absen-keluar.lazy.tsx`.
- Telegram Mini App closing: `apps/karyawan/src/routes/absen-keluar-mini.lazy.tsx`.
- Closing payload helper: `apps/karyawan/src/hooks/use-closing-submit.ts`.
- Admin/POS legacy stock opname: `apps/admin/src/routes/attendance/stock-opname.lazy.tsx`, `apps/admin/src/components/attendance/stock-opname-panel.tsx`, `apps/admin/src/hooks/use-stock-opname.ts` dan mirror di `apps/pos/`.
- Main inventory pages: `apps/admin/src/routes/admin/inventory.lazy.tsx` dan `apps/pos/src/routes/admin/inventory.lazy.tsx`.
- Closing Edge Function: `supabase/functions/process-closing/index.ts`.
- Inventory write/read layers: app-local `use-hybrid-pos-data.ts` dan `use-hybrid-write-actions.ts`, plus shared package equivalents.

---

## 0. Product Decisions & Non-Goals

### Product decisions

1. **Primary user-facing unit:** kemasan/benda yang terlihat, seperti `box`, `botol`, `dus`, `pack`, `pcs`, `karung`.
2. **Primary employee task:** melihat dan melaporkan stok operasional, bukan menimbang gram/ml.
3. **Statuses:** `Aman`, `Menipis`, `Habis`.
4. **Closing data:** employee dapat mengubah jumlah visual, menandai bahan habis, dan menulis catatan bahan kurang.
5. **Partial/open package rule:** phase pertama menghitung kemasan utuh; kemasan terbuka/parsial masuk catatan, bukan dipaksa menjadi angka presisi.
6. **Source separation:** stok area kerja/operasional harus dibedakan dari total stok gudang bila keduanya memang berbeda.
7. **No destructive migration:** jangan menghapus/mengganti `unit`, `quantity`, conversion fields, atau recipe data pada phase pertama.

### Non-goals phase pertama

- Mengubah formula resep.
- Mengubah HPP.
- Mengubah auto-deduct order → inventory teknis.
- Mengotomatisasi purchase order hanya dari laporan karyawan.
- Menghapus halaman/flow stock opname lama sebelum mirror usage diaudit.
- Menyelesaikan seluruh unit conversion legacy sekaligus.

---

## 1. Product Model & Data Contract

### Task 1: Finalize operational inventory contract

**Objective:** Menetapkan field, status, dan aturan unit visual sebelum migration/UI dibuat.

**Files:**
- Reference: `pos.inventory`, `pos.stock_opname_logs`, `pos.inventory_transactions`.
- Create: `supabase/migrations/20260805000000_operational_stock_fields.sql`.
- Modify later: `public.pos_inventory` view definition/migration source.

**Proposed additive fields on `pos.inventory`:**

```sql
ALTER TABLE pos.inventory
  ADD COLUMN IF NOT EXISTS operational_unit text,
  ADD COLUMN IF NOT EXISTS operational_quantity numeric(18,4),
  ADD COLUMN IF NOT EXISTS operational_low_stock_threshold numeric(18,4),
  ADD COLUMN IF NOT EXISTS operational_icon_key text,
  ADD COLUMN IF NOT EXISTS operational_area text DEFAULT 'general';
```

**Rules:**
- `operational_unit` is human-facing: `box|botol|dus|pack|pcs|karung|lainnya`.
- `operational_quantity` is nullable during rollout; fallback display to existing data must be explicit and never silently infer a wrong conversion.
- `operational_low_stock_threshold` controls `Aman/Menipis/Habis`.
- `operational_icon_key` stores a semantic key, not rendered JSX or emoji.
- `operational_area` supports future separation such as `bar`, `kitchen`, `warehouse`.
- Preserve `unit`, `quantity`, `conversion_factor`, `preferred_purchase_*`, recipe links, and all existing technical fields.

**Acceptance criteria:**
- Migration is additive and idempotent.
- No existing order, recipe, HPP, or transaction data is rewritten.
- The contract documents behavior for `NULL`, zero, partial/open package, and area scope.

### Task 2: Define status and display helpers

**Objective:** Create one reusable pure domain helper so Admin, POS, and Karyawan calculate status identically.

**Files:**
- Create: `packages/yumipos-web-shared/src/lib/operational-stock.ts`.
- Modify: `packages/yumipos-web-shared/src/index.ts`.
- Test: `packages/yumipos-web-shared/src/lib/operational-stock.test.ts` (or the repository's existing test location after audit).

**Required functions:**

```ts
getOperationalStockStatus(quantity, threshold)
// => "healthy" | "low" | "out"

formatOperationalStock(quantity, unit)
// => "5 box", "0 botol"

isOperationalStockConfigured(item)

normalizeOperationalStockReport(payload)
```

**Acceptance criteria:**
- `0` always maps to `out`.
- `quantity > 0 && quantity <= threshold` maps to `low`.
- Missing operational fields do not fabricate a conversion.
- Tests cover zero, null, fractional values if allowed, threshold zero, unknown unit, and malformed payload.

### Task 3: Extend inventory view/read/write mapping

**Objective:** Make operational fields available across Admin and POS without breaking mixed-case/snake-case compatibility.

**Files:**
- Modify migration/view source for `public.pos_inventory`.
- Modify: `apps/admin/src/hooks/use-hybrid-pos-data.ts`.
- Modify: `apps/pos/src/hooks/use-hybrid-pos-data.ts`.
- Modify: `packages/yumipos-web-shared/src/hooks/use-hybrid-pos-data.ts` if the shared hook is the active source.
- Modify corresponding `use-hybrid-write-actions.ts` files only where the active inventory CRUD path requires it.

**Acceptance criteria:**
- Read mapping uses `row.camelCase ?? row.snake_case` consistently.
- Create/edit inventory can save operational fields.
- Existing technical fields still round-trip unchanged.
- Realtime refresh/invalidation remains intact.

---

## 2. Shared UI/UX Foundation

### Task 4: Create reusable operational stock card/list primitives

**Objective:** Prevent three apps from implementing different stock cards and interaction rules.

**Files:**
- Create under existing shared component convention: `packages/yumipos-web-shared/src/components/attendance/OperationalStockCard.tsx`.
- Create: `packages/yumipos-web-shared/src/components/attendance/OperationalStockList.tsx`.
- Modify: `packages/yumipos-web-shared/src/index.ts`.

**UI specification:**
- Card hierarchy: ingredient name → visual package/unit → quantity/status → one primary action.
- Use Lucide semantic line icons (`Package`, `Container`, or verified installed equivalent), never emoji as UI icon.
- Use the existing shared theme; no page-local global CSS or copied standalone CSS.
- Cards: 24px radius, soft shadow, 16–24px padding.
- Controls: 14px radius, minimum 44px target, visible focus ring.
- Quantity control: large readable number with `−` and `+`; prevent accidental destructive changes with clear feedback.
- `Habis` is a secondary explicit action, not hidden inside a tiny icon.
- Status color is supplementary; text must always say `Aman`, `Menipis`, or `Habis`.
- No dense spreadsheet-like table for the employee flow.

**Required states:**
- Loading: skeleton cards/shimmer.
- Empty: “Belum ada bahan operasional untuk role ini” + admin/configuration guidance.
- Error: inline message + retry action.
- Success: confirmation toast/banner after save.
- Confirmation: only for destructive reset/mark-all-habis actions.
- Reduced motion: disable decorative transitions.

### Task 5: Define mobile-first closing interaction

**Objective:** Specify the employee workflow before implementation so the form is fast in a real restaurant environment.

**Interaction model:**

```text
Header: Closing Shift + employee + shift
↓
Section: Stok Operasional
  Search/filter only if list is long
  Operational stock cards
↓
Section: Bahan Habis
  Selected items, removable chips/rows
↓
Section: Catatan Bahan Kurang
  One textarea with concrete placeholder
↓
Optional: Kebersihan
↓
Sticky primary CTA: Kirim Laporan Closing
```

**UX constraints:**
- Main task completable with minimal taps.
- Do not force employee to open technical detail.
- Preserve scroll position and draft state while switching sections.
- Sticky CTA must not cover the last input; respect safe area.
- Copy must be Indonesian, concise, and operational.
- Explicitly explain partial package rule near the stock section.

**Preview contract:**

```text
Susu Greenfields
[package icon] 5 box
Aman
[−]       [+]
[Tandai habis]
```

---

## 3. Employee Closing Implementation

### Task 6: Replace Mini App technical opname input

**Objective:** Make Telegram Mini App use operational stock data while retaining hygiene and closing submission.

**Files:**
- Modify: `apps/karyawan/src/routes/absen-keluar-mini.lazy.tsx`.
- Modify: `apps/karyawan/src/hooks/use-closing-submit.ts`.
- Reuse shared components from Task 4 where compatible.

**Behavior:**
- Load BAR/KITCHEN operational items from `pos.inventory`/view.
- Show only fields needed by the employee.
- Allow quantity visual adjustment, explicit `Tandai habis`, and closing note.
- Keep kebersihan tab/photo behavior intact.
- Submit normalized payload with operational fields and report metadata.
- Do not send technical unit conversion fields as employee-facing payload.

**Acceptance criteria:**
- A BAR/KITCHEN employee can complete closing without entering gram/ml.
- All selected out-of-stock items are persisted.
- Low-stock note is persisted even when no item is marked out.
- Existing kebersihan photo upload and success/error states continue working.
- The Telegram Mini App remains usable at 375px width and within Telegram safe areas.

### Task 7: Align browser closing route

**Objective:** Avoid two different stock opname experiences in the karyawan app.

**Files:**
- Modify: `apps/karyawan/src/routes/$username/absen-keluar.lazy.tsx`.
- Modify: `apps/karyawan/src/hooks/use-closing-submit.ts` only if payload contract requires it.

**Acceptance criteria:**
- Browser closing uses the same operational stock semantics as Mini App.
- No duplicated hardcoded ingredient/unit logic remains in the two routes.
- `$username` path edits must use Python/open-based editing and be verified with `git diff` because the literal `$` path is known to silently fail with generic patch/write tools.

### Task 8: Decide and migrate legacy Admin/POS stock opname routes

**Objective:** Ensure Admin/POS does not retain a conflicting technical stock opname form.

**Files:**
- Modify: `apps/admin/src/routes/attendance/stock-opname.lazy.tsx`.
- Modify: `apps/admin/src/components/attendance/stock-opname-panel.tsx`.
- Modify: `apps/admin/src/hooks/use-stock-opname.ts`.
- Mirror/audit: `apps/pos/src/routes/attendance/stock-opname.lazy.tsx`.
- Mirror/audit: `apps/pos/src/components/attendance/stock-opname-panel.tsx`.
- Mirror/audit: `apps/pos/src/hooks/use-stock-opname.ts`.

**Decision rule:**
- If route is still used operationally → migrate to the shared operational component.
- If it is admin-only historical review → relabel as “Laporan Kondisi Stok” and keep technical audit data behind detail view.
- Do not delete a route until references/navigation are audited.

---

## 4. Closing Backend & Audit Trail

### Task 9: Extend closing payload and `stock_opname_logs`

**Objective:** Persist operational report data without destroying historical technical opname records.

**Files:**
- Create additive migration: `supabase/migrations/20260805000001_operational_stock_report.sql` if dedicated columns/indexes are needed.
- Modify: `supabase/functions/process-closing/index.ts`.
- Modify: `apps/karyawan/src/hooks/use-closing-submit.ts`.

**Preferred payload shape:**

```json
{
  "operationalItems": [
    {
      "inventoryId": "inv_xxx",
      "name": "Susu Greenfields",
      "operationalUnit": "box",
      "operationalQuantity": 5,
      "status": "healthy",
      "isOutOfStock": false,
      "note": ""
    }
  ],
  "outOfStockItems": [],
  "lowStockNote": "Susu tinggal satu box untuk shift pagi",
  "closingNote": ""
}
```

**Acceptance criteria:**
- Existing `items` payload remains readable for historical rows during rollout.
- New payload is validated server-side.
- Invalid inventory IDs, negative quantities, unknown statuses, and malformed note payloads return safe errors.
- `stock_opname_logs` records who, role, shift, timestamp, operational snapshot, and whether final.
- Inventory update only occurs according to the approved final-person rule; no silent per-person destructive update.
- `inventory_transactions` uses a distinct transaction type/metadata for operational closing adjustment and preserves audit fields.

### Task 10: Harden close-time and check-out sequence before changing closing logic

**Objective:** Prevent the new closing feature from preserving known validation inconsistencies.

**Files:**
- Modify: `supabase/functions/process-closing/index.ts`.
- Modify: `supabase/functions/verify-closing-link/index.ts`.
- Review: `supabase/functions/record-attendance/index.ts`.

**Required checks:**
- All schedule reads use `.schema("pos").from("site_settings")`.
- All comparisons use WIB consistently.
- Shift matching is case-insensitive/variant-safe.
- BAR/KITCHEN closing validates an active check-in and minimum duration before writing checkout, or explicitly delegates that validation to one centralized server path.
- Do not silently allow validation failures unless the fallback is an explicitly approved safety rule.

**Tests:**
- Before close time → blocked.
- At/after close time → allowed.
- UTC container simulation → still compares WIB correctly.
- No check-in → blocked.
- Less than 30 minutes → blocked if the business rule remains applicable.
- Duplicate checkout → blocked.

---

## 5. Admin Inventory & Operational Review

### Task 11: Add operational fields to inventory create/edit UI

**Objective:** Admin can configure how each item appears operationally without exposing technical complexity by default.

**Files:**
- Modify: `apps/admin/src/routes/admin/inventory.lazy.tsx`.
- Modify: `apps/pos/src/routes/admin/inventory.lazy.tsx` as a mirror only after comparison.
- Modify corresponding inventory hooks/write actions.

**Form fields:**
- Satuan operasional: box/botol/dus/pack/pcs/karung.
- Icon/presentation key: semantic Lucide mapping, not arbitrary SVG/emoji.
- Jumlah operasional.
- Batas menipis.
- Area stok: Bar/Kitchen/Gudang if required.
- Optional note/instruction for partial packages.

**Design:**
- Technical fields go under a secondary “Detail teknis” disclosure.
- Primary form asks only what is needed to operate the inventory.
- Use helper text: “Satuan ini adalah bentuk yang terlihat oleh tim saat closing.”
- Avoid a giant form; group fields into `Tampilan operasional` and `Perhitungan sistem`.

### Task 12: Add operational stock overview/filter

**Objective:** Admin can see what requires attention without reading every closing log.

**Files:**
- Modify: `apps/admin/src/routes/admin/stock-overview.lazy.tsx`.
- Modify relevant admin inventory data hook.
- Optional new component: `apps/admin/src/components/inventory/OperationalStockSummary.tsx`.

**Views:**
- All.
- Habis.
- Menipis.
- Report terbaru.
- Per area/role.

**Required states:** loading skeleton, empty, error+retry, success refresh, confirmation before manual adjustment.

**No automatic purchase order in phase one:** show actionable CTA `Review bahan`/`Buat restock` only if the existing purchasing flow is confirmed and mapped.

---

## 6. Cross-App Integration Mapping

### apps/karyawan (`karyawan.djiwatentram.web.id`)

| Data | Source | Used in |
|---|---|---|
| Operational inventory items | `public.pos_inventory` / approved hook | `absen-keluar-mini.lazy.tsx`, `$username/absen-keluar.lazy.tsx` |
| Shift + role | existing staff/closing context | closing header and item filtering |
| Closing report | `process-closing` | Mini App/browser closing submission |
| Success/error state | Edge response | closing result UI |

### apps/admin (`admindjiwatentram.web.id`)

| Data | Source | Used in |
|---|---|---|
| Operational unit/config | `pos.inventory` via inventory hook | `/admin/inventory` edit form |
| Current operational status | view/hook | inventory table/cards and stock overview |
| Closing reports | `pos.stock_opname_logs` | review, filters, detail |
| Technical detail | existing fields | secondary disclosure only |

### apps/pos (`pos.djiwatentram.web.id`)

| Data | Source | Used in |
|---|---|---|
| Inventory operational display | same shared/view contract | POS inventory/admin mirror |
| Stock closing | existing POS stock opname route | migrate or relabel after usage audit |
| Technical auto-deduct | existing recipe/order hooks | must remain unchanged in phase one |

### Backend/Edge Functions

| Function/table | Responsibility |
|---|---|
| `pos.inventory` | technical + operational inventory metadata |
| `public.pos_inventory` | safe read projection for frontend |
| `pos.stock_opname_logs` | operational closing snapshot/audit |
| `pos.inventory_transactions` | auditable final adjustment, if approved |
| `process-closing` | validate, lock, persist report, finalize closing |
| `verify-closing-link` | secure Mini App entry and shift context |
| `record-attendance` | ordinary attendance path; do not conflate with operational report |

---

## 7. Dependency Graph & Wave Planning

### Level 1 — Independent foundation work 🔥

```text
├── Task 1: Data contract + additive migration design
├── Task 2: Pure status/format helpers + tests
├── Task 4: Shared operational stock UI primitives
└── Task 10: Closing validation audit/tests
```

### Level 2 — Dependent implementation

```text
├── Task 3: View/read/write mapping          ← Task 1 + 2
├── Task 5: Mobile closing interaction       ← Task 4
├── Task 11: Admin inventory configuration   ← Task 1 + 3 + 4
├── Task 6: Mini App migration               ← Task 3 + 4 + 5
├── Task 7: Browser closing alignment        ← Task 4 + 5
└── Task 8: Admin/POS legacy route alignment ← Task 4 + 5
```

### Level 3 — Backend integration and review

```text
├── Task 9: Closing payload + final audit    ← Task 1 + 3 + 6 + 7
├── Task 12: Admin operational overview      ← Task 3 + 9 + 11
└── Full regression/build/visual QA          ← all implementation tasks
```

### Recommended waves

```text
Wave 1: Contract, pure helpers/tests, shared UI primitive, validation audit
Wave 2: View/hooks mapping, admin config UI, Mini App UI, browser closing UI
Wave 3: process-closing integration, Admin/POS legacy route reconciliation, overview
Wave 4: build, DB verification, API verification, browser screenshots, regression review
```

Tasks touching the same file/app must be sequential. Admin and POS mirror files can be parallel only after same-relative-path/content comparison confirms they are true mirrors.

---

## 8. UI/UX Acceptance Criteria — Global Product Design Standard

### Visual DNA

- Light theme, white/soft-gray surfaces.
- Existing shared theme reused; no duplicated global tokens or page-level stylesheet leakage.
- Cards 24px radius; controls 14px radius.
- Soft shadows only; one brand accent (`#1a5dc6` where current theme applies).
- Plus Jakarta Sans/display hierarchy and existing project body typography; no random font import per route.
- Lucide/Feather-style 2px line icons; no colorful emoji icons in product UI.
- No decorative gradients or excessive badges/pills.

### Interaction

- Primary CTA visible within 3 seconds.
- Main task usable one-handed on 375px viewport.
- Touch targets minimum 44px.
- Clear focus-visible state and keyboard support where browser UI is used.
- Press feedback `scale(.97)` and iOS easing only when it communicates action.
- `prefers-reduced-motion` supported.
- No destructive stock reset without confirmation.

### UX states

Every touched page must have:

```text
Loading/skeleton
Empty/configuration-needed
Error + retry
Success confirmation
Toast feedback
Destructive confirmation
Offline/network failure guidance where applicable
```

### Content

- Employee copy: “Sisa 5 box”, “Tandai habis”, “Catatan bahan kurang”.
- Admin copy distinguishes “Stok operasional” from “Stok teknis”.
- Do not use “stock opname” for a lightweight report unless the detail/audit mode is clear.
- Partial package instruction must be visible but concise.

---

## 9. Test & Verification Plan

### Unit/domain tests

- Operational status calculation.
- Unit formatting.
- Payload validation/normalization.
- Empty/null/malformed item handling.
- Partial package note behavior.

### Integration/API tests

- Submit closing with operational quantities.
- Submit out-of-stock list only.
- Submit low-stock note only.
- Reject invalid inventory IDs/negative values.
- Last-person finalization updates only approved operational fields.
- Non-last-person report is stored without final inventory adjustment.
- Duplicate submit/lock behavior.
- Close-time and WIB validation.

### Database verification

- Migration is additive.
- Existing technical quantities unchanged after rollout.
- New operational fields visible through `public.pos_inventory`.
- New `stock_opname_logs` rows contain employee, role, shift, operational snapshot, and audit metadata.
- `inventory_transactions` are present only for approved final adjustments.
- Existing recipes still resolve inventory IDs.

### Build/typecheck

```bash
cd /opt/djiwatentramapp
TMPDIR=/opt/djiwatentramapp/.tmp bun run build:admin
TMPDIR=/opt/djiwatentramapp/.tmp bun run build:pos
TMPDIR=/opt/djiwatentramapp/.tmp bun run build:karyawan
```

Use the repository's actual package scripts after confirming them; do not use a broad `turbo build` as a substitute for app-specific verification.

### Visual QA

Verify at minimum:

```text
Karyawan Mini App: 375×812
Karyawan browser closing: 375×812 and desktop
Admin inventory: mobile/tablet/desktop
Admin stock overview: mobile/tablet/desktop
POS mirror route: supported terminal viewport
```

Capture screenshots with browser vision and check:
- No horizontal overflow.
- No clipped item names.
- Sticky CTA does not cover fields.
- Status remains readable without color.
- Loading/empty/error/success states are visually complete.
- Console has no new runtime errors.

---

## 10. Risks & Rollback

| Risk | Mitigation |
|---|---|
| Replacing technical unit breaks recipe/HPP | Dual-layer fields; no destructive rename/drop |
| Visual quantity diverges from technical quantity | Explicit source-of-truth policy; show “operasional” vs “teknis”; audit adjustment events |
| Open package cannot be counted | Count full packages; use note for partial package in phase one |
| Bar/Kitchen and warehouse stock mixed | Add `operational_area` or explicitly define one scope before rollout |
| Admin/POS mirror drifts | Compare same-relative files before edits; verify both builds |
| Closing submitted twice | Existing distributed lock plus idempotency/deduplication key review |
| Edge validation silently skipped | Fix schema/timezone and add negative tests before integration |
| Employee UI becomes dense | Shared card/list, mobile-first hierarchy, no technical fields in primary view |
| Existing historical logs become unreadable | Backward-compatible parser for legacy `items` payload |
| Migration affects production data | Additive migration only; staging/local verification before production |

**Rollback strategy:**
- Feature flag operational UI/configuration per role or per inventory item.
- Keep legacy technical fields and legacy payload parser.
- Disable operational final adjustment while retaining report capture if inventory reconciliation is not safe.
- Do not delete historical `stock_opname_logs` or `inventory_transactions`.

---

## 11. Definition of Done

- [ ] Operational unit/configuration can be managed by authorized admin.
- [ ] Employee sees physical package language, not gram/ml/conversion details.
- [ ] Employee can submit visual quantity, out-of-stock items, and low-stock notes.
- [ ] Mini App and browser closing behavior are consistent.
- [ ] Admin/POS stock opname route has no conflicting legacy experience.
- [ ] Technical recipe/HPP/auto-deduct paths remain unchanged and verified.
- [ ] Closing report is auditable and backward-compatible.
- [ ] All seven UX states are implemented on touched screens.
- [ ] UI passes DNA v2.0 visual/accessibility checks.
- [ ] App-specific builds pass.
- [ ] Database/API verification returns real evidence.
- [ ] Browser screenshots and console checks completed.
- [ ] Only session-owned files are committed/deployed selectively.

---

## Approved Execution Decisions

Approved by user before implementation:

1. **Kemasan terbuka tidak dihitung.** Hanya kemasan utuh yang menjadi `operational_quantity`; kondisi kemasan terbuka ditulis di catatan bila diperlukan.
2. **Scope stok visual berdasarkan area dan role:** area `bar` untuk role `barista`, area `kitchen` untuk role `chef`.
3. **Final closing langsung mengubah inventory.** Orang terakhir pada shift/role yang relevan memicu final operational inventory update, dengan audit transaction dan distributed-lock/idempotency protection.

Implementation proceeds wave-by-wave from contract and preview UI through backend integration, build, database/API verification, and browser visual QA.
