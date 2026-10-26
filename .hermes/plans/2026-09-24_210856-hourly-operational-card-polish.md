# Hourly Operational Card Visual Polish Implementation Plan

> **For Hermes:** Use the screenshot-grounded UI refinement workflow and implement task-by-task. This plan is intentionally additive: preserve the existing dashboard data flow and settled-transaction semantics.

**Goal:** Improve the `Analisa jam operasional` widget so it is more premium, compact, readable, symmetric, and operationally useful without changing the underlying transaction data or existing dashboard sections.

**Architecture:** Keep the existing `HourlyTransactionAnalysis` component and `hourly-transaction-analysis` helper as the single source of truth. Refine presentation in the widget, add a bounded custom-date mode, and add view modes (`Chart`, `Heatmap`, `Jam teratas`) inside the same card. Preserve the existing bounded WIB query and settled status filter.

**Tech Stack:** React, TypeScript, Tailwind CSS, Recharts, Bun tests, Vite/PWA Admin build.

**Scope:** `apps/admin` only. No database migration, no Edge Function change, no API contract change, no new dependency.

---

## 1. Current Context and Screenshot Reconciliation

The screenshot was inspected and reconciled against the current source on 2026-09-24.

Already present in `apps/admin/src/routes/admin/-HourlyTransactionAnalysis.tsx`:

- Period selector: `Hari ini`, `7 hari`, `30 hari`.
- Metric selector: `Order`, `Revenue`.
- 24-hour Recharts bar chart.
- Settled transaction context and sample-day count.
- Tooltip showing hour, order count, and revenue.
- Summary cards for peak, quiet, and active range.
- Sparse-data warning.
- Loading and error states.
- Responsive `sm:grid-cols-3` summary layout.

New requested additions included in this plan:

- A custom WIB date filter so the operator can inspect one exact calendar date.
- A view switch inside the same card:
  - `Chart` — 24-hour bar chart.
  - `Heatmap` — 24 compact hourly cells with intensity based on the active metric.
  - `Jam teratas` — ranked table of the busiest hours with order and revenue context.

Existing data semantics in `apps/admin/src/lib/hourly-transaction-analysis.ts` remain unchanged:

- Settled statuses are exactly `paid` and `completed`.
- Buckets use `Asia/Jakarta` / WIB.
- Every selected date/range returns 24 hourly points.
- Quiet hour excludes zero-transaction hours.
- Presets remain `today`, `7d`, and `30d`; custom date adds a bounded one-day mode.

The screenshot is therefore treated as a visual-polish reference, not as evidence that a new data feature is required.

---

## 2. Design Direction — Executive Compact Card

Recommended direction: **Operational Command Card**.

### Design principles

| Principle | Implementation |
|---|---|
| Decision-first | Make peak hour and order count the strongest visual signal. |
| Compact, not cramped | Reduce unnecessary vertical spacing while preserving 44px touch targets. |
| One metric at a time | When `Order` is active, chart title and primary values use order language; revenue remains secondary context. |
| Navy + restrained gold | Keep blue for normal chart bars; use navy for typography and gold only for peak emphasis. |
| Honest data quality | Make `Sampel terbatas` more visible when `sampleDays < 2` or existing sparse logic is true. |
| Responsive symmetry | Header controls, chart, and three summary cards align consistently on desktop and stack cleanly on mobile. |

### Target hierarchy

```text
Title + context
→ period and metric controls
→ data coverage badge
→ chart title + unit
→ 24-hour chart
→ peak / quiet / active summaries
→ data-quality note
```

---

## 3. UI/UX Specification

### 3.1 Header and controls

Modify `apps/admin/src/routes/admin/-HourlyTransactionAnalysis.tsx`:

- Keep the current title and subtitle.
- Group period selector and metric selector into a consistent control area.
- Preserve keyboard-accessible native buttons and visible active states.
- Keep controls at least 44px effective touch height on mobile, even if the visual label remains compact.
- Improve contrast of `29 order settled · 1 hari data`.
- Add a compact data-quality badge beside coverage text when `insight.isSparse`:
  - `Sampel terbatas`
  - optional info icon with accessible label.
- Do not add a fake refresh timestamp unless a real source timestamp exists. No hardcoded “Diperbarui” value.

### 3.1.1 Filter tanggal spesifik

Tambahkan mode `Tanggal` sebagai filter keempat, tanpa menghapus preset periode:

- Preset tetap: `Hari ini`, `7 hari`, `30 hari`.
- Tambahkan tombol/trigger `Pilih tanggal` dengan native date input atau calendar popover yang sudah tersedia di project.
- Saat tanggal dipilih:
  - query hanya mencakup `00.00–23.59 WIB` pada tanggal tersebut;
  - coverage text berubah menjadi contoh `29 order settled · 1 hari data`;
  - judul konteks menampilkan tanggal terpilih dalam format Indonesia;
  - semua view (`Chart`, `Heatmap`, `Jam teratas`) memakai dataset tanggal yang sama.
- Default custom date adalah tanggal WIB saat ini.
- Tanggal masa depan harus disabled atau menghasilkan empty state yang jelas.
- Jangan mengandalkan timezone browser; konversi batas tanggal memakai helper WIB yang sudah ada.
- Pertahankan URL/state dashboard yang ada; filter ini tidak perlu mengubah route.

Data-layer design:

- Extend the period model minimally, for example with `customDate` plus an ISO date value, or a dedicated bounded range parameter.
- Prefer a reusable helper such as `getHourlyAnalysisDateRange(dateKey)` rather than constructing local midnight in the browser.
- Keep the Supabase query bounded to the selected WIB day.

### 3.1.2 View switch dalam satu card

Tambahkan segmented control kedua, terpisah secara visual dari period/date filter:

```text
[Chart] [Heatmap] [Jam teratas]
```

Rules:

- Hanya satu card yang digunakan; view switch mengganti isi area visual utama.
- `Chart` menjadi default agar perilaku saat ini tetap familiar.
- `Heatmap` menampilkan 24 sel jam `00–23`:
  - intensitas dihitung dari active metric (`orderCount` atau `revenue`);
  - legend minimum/maximum atau `Sepi → Ramai` wajib tersedia;
  - jam peak diberi outline gold, bukan hanya warna, agar tidak bergantung pada warna saja;
  - cell tetap punya tooltip/accessibility text berisi jam, order, dan revenue.
- `Jam teratas` menampilkan ranked table compact:
  - default top 5 jam aktif;
  - kolom: `Jam`, metric aktif, dan metric sekunder;
  - urutkan berdasarkan metric aktif descending, tie-break berdasarkan hour ascending;
  - zero-transaction hours tidak masuk ranking;
  - empty state tetap muncul jika tidak ada transaksi.
- Pada mobile, table tidak boleh menyebabkan page overflow; gunakan kolom ringkas dan wrapping terkontrol.
- View switch tidak mengubah peak/quiet/range calculations; hanya mengubah representasi data.

### 3.2 Chart labeling

- Add a small chart heading:
  - `Order settled per jam` when metric is `orders`.
  - `Revenue settled per jam` when metric is `revenue`.
- Add a unit label or accessible description:
  - `Jumlah order` for order mode.
  - `Revenue (Rp)` for revenue mode.
- Replace the hidden Y-axis with a compact visible scale where it remains readable. Use a derived domain/tick strategy so low-volume days do not produce a misleading oversized scale.
- Preserve the 24 buckets and WIB hour labels.
- Keep desktop X-axis labels every 3 hours.
- Use fewer labels on narrow screens if Recharts responsive behavior requires it; do not allow overlap or horizontal overflow.
- Keep the existing tooltip, but update its heading and active metric emphasis:
  - hour range, e.g. `12.00–13.00`;
  - primary active metric;
  - secondary revenue/order context.
- Highlight the peak bar with gold while non-peak bars remain Djiwa blue.
- Add an accessible chart summary using `aria-label` or visually-hidden text containing the current metric and peak hour.

### 3.3 Summary cards

Refine `SummaryItem`:

- Keep equal-height cards and equal padding.
- Remove truncation where it can hide meaningful values; allow controlled wrapping for labels/details.
- Promote the primary value:
  - peak hour and value are visually dominant;
  - revenue/order detail is secondary.
- Use label changes already supported by the component:
  - `Order terbanyak` in order mode;
  - `Revenue tertinggi` in revenue mode.
- Rename the visual concept from a generic “active range” presentation to a clearer operational label only if the underlying helper semantics remain the same.
- Preserve exact calculated values; do not infer staffing decisions.
- Consider displaying the active-range concentration as a real derived percentage only if it can be calculated from the existing 24 points without changing the data contract. Otherwise retain `Sampel terbatas` / `Pola transaksi aktif` and do not invent a percentage.

### 3.4 Sparse-data message

- Improve the existing message to:
  - `Sampel terbatas — gunakan sebagai indikasi awal. Validasi dengan 7 atau 30 hari sebelum mengubah jadwal operasional.`
- Keep it visibly subordinate to the chart but more legible than the current 10px low-contrast text.
- Do not alter `isSparse` logic in this visual-only phase unless tests prove the current threshold is incorrect.

### 3.5 Responsive behavior

Desktop/tablet:

- Header remains two logical groups with aligned controls.
- Chart remains full card width with compact height around the current 150px target; adjust only if visible Y-axis labels need safe space.
- Summary cards remain three equal columns from `sm` upward.

Mobile 390–430px:

- Title/subtitle occupy the first row group.
- Period selector may wrap or use a full-width compact row without overflow.
- Metric selector stays near the chart heading.
- Chart labels are reduced to avoid collisions; no horizontal page scroll.
- Summary cards become one column or a compact stacked layout with equal spacing.
- All controls retain readable labels and touch targets.
- Long sparse-data note wraps naturally.

---

## 4. Data, Database, and No-Hardcode Audit

### Database schema

No schema change is planned.

```text
pos_orders
  → bounded query in use-hybrid-pos-data.ts
  → HourlyTransactionSample
  → aggregateHourlySales()
  → HourlySalesInsight
  → HourlyTransactionAnalysis presentation
```

No new Supabase view, RPC, table, REST path, or migration is needed.

### No-hardcode audit

Allowed fixed values:

- Display labels: `Hari ini`, `7 hari`, `30 hari`, `Order`, `Revenue`.
- Chart presentation values: 24 hour buckets, visual colors, spacing, and label intervals.
- Existing business definition: settled statuses `paid` and `completed`.

Must remain data-derived:

- Peak hour.
- Quiet hour.
- Active range.
- Order count.
- Revenue amount.
- Sample day count.
- Any future percentage or concentration indicator.
- Data freshness timestamp, if added later.

Do not hardcode screenshot numbers such as `29`, `6 order`, or `Rp368.000`.

---

## 5. Integration Points

### Existing Admin dashboard

- Keep the widget mounted in `OperationalDecisionDashboard` without moving or deleting other cards.
- Preserve current dashboard refresh behavior through `useHybridHourlySales(period)` and `triggerHybridRefresh()`.

### POS / database

- Reuse existing `pos_orders` data access and status semantics.
- Do not query a separate summary source that could disagree with existing dashboard totals.

### Karyawan / staffing

- No automatic staffing recommendation will be added in this phase.
- Copy must remain an indication, especially for one-day data.

### Telegram / AI / purchasing agent

- No integration changes.
- No AI-generated operational decision should be introduced from sparse transaction data.

---

## 6. Implementation Tasks

### Task 1: Add presentation helpers and view/date state model

**Files:**
- Modify: `apps/admin/src/routes/admin/-HourlyTransactionAnalysis.tsx`
- Modify: `apps/admin/src/lib/hourly-transaction-analysis.ts` if pure date/ranking helpers belong in the data layer

**Work:**

- Add local state for selected date mode and active view (`chart`, `heatmap`, `top-hours`).
- Add small pure helpers/constants for active metric label, chart title, unit label, primary tooltip value, top-hour ranking, and custom WIB date label.
- Keep helpers local unless a reusable date/ranking helper is demonstrably needed.
- Ensure `Order` and `Revenue` mode copy remains synchronized across chart, heatmap, table, tooltip, and summary cards.
- Keep `Chart` as the default view and preserve the existing default period behavior.

**Verification:**

- Static source inspection confirms no duplicated contradictory labels.
- Existing hourly unit tests continue to pass.

### Task 2: Add bounded custom-date data range

**Files:**
- Modify: `apps/admin/src/lib/hourly-transaction-analysis.ts`
- Modify: `apps/admin/src/hooks/use-hybrid-pos-data.ts`
- Test: `apps/admin/src/lib/__tests__/hourly-transaction-analysis.test.ts`

**Work:**

- Add a WIB-safe helper for one selected ISO calendar date.
- Extend the hourly hook/query input without breaking existing `today`, `7d`, or `30d` callers.
- Ensure the selected date produces a bounded start/end range and 24 buckets.
- Keep future-date behavior explicit and safe.

**Tests:**

- Selected date starts at WIB `00.00` and ends at WIB `23.59:59.999`.
- Transactions around UTC midnight map to the correct WIB date.
- Future date returns zero/empty insight without querying unbounded history.
- Existing presets remain unchanged.

### Task 3: Add the single-card view switch

**Files:**
- Modify: `apps/admin/src/routes/admin/-HourlyTransactionAnalysis.tsx`

**Work:**

- Add segmented control: `Chart`, `Heatmap`, `Jam teratas`.
- Keep all three views inside the existing card and share the same `insight`, `metric`, period/date filter, and summary cards.
- Add heatmap with accessible labels, `Sepi → Ramai` legend, 24 hourly cells, and gold peak outline.
- Add compact top-hours table with top 5 active hours, metric-driven sorting, and zero-hour exclusion.
- Preserve loading, empty, error, and sparse states for all views.

**Verification:**

- Switching views does not trigger a second query.
- Switching metric updates all views consistently.
- Switching period/date updates all views consistently.
- Table remains readable at 390–430px without page-level horizontal overflow.

### Task 4: Improve chart scale, peak emphasis, and accessibility

**Files:**
- Modify: `apps/admin/src/routes/admin/-HourlyTransactionAnalysis.tsx`

**Work:**

- Add readable Y-axis ticks/domain.
- Add chart heading and unit description.
- Highlight the calculated peak bar without changing the underlying metric.
- Preserve tooltip order/revenue context.
- Add accessible summary text.

**Verification:**

- Order mode peak uses `getPeakPoint(points, "orders")`.
- Revenue mode peak uses `getPeakPoint(points, "revenue")`.
- No chart overflow at 390px and desktop widths.

### Task 5: Refine summary cards and sparse-data treatment

**Files:**
- Modify: `apps/admin/src/routes/admin/-HourlyTransactionAnalysis.tsx`

**Work:**

- Improve number hierarchy and card symmetry.
- Prevent meaningful values from being hidden by aggressive truncation.
- Add the clearer sparse-data copy.
- Keep existing `isSparse` semantics and calculated data intact.

**Verification:**

- Peak, quiet, and active-range cards render with live calculated values.
- Empty and error states remain intact.
- Sparse data displays a warning without implying permanent staffing policy.

### Task 6: Add/adjust focused tests for presentation-facing derivations

**Files:**
- Modify: `apps/admin/src/lib/__tests__/hourly-transaction-analysis.test.ts` only if new pure helper logic is moved into the library.
- Optional: add component test only if the repository already has a stable React test harness for Admin.

**Work:**

- Prefer testing pure helper logic over introducing a new test dependency.
- Cover metric label/peak selection if extracted.
- Keep existing settled filtering, WIB bucket, peak, quiet, and range tests.

**Expected:**

```text
bun test src/lib/__tests__/hourly-transaction-analysis.test.ts
PASS
```

### Task 7: Responsive/build/static verification

**Files:**
- No additional source files unless verification identifies a real issue.

**Commands:**

```bash
git diff --check
bun test src/lib/__tests__/hourly-transaction-analysis.test.ts
bun run --cwd apps/admin check-types
bun run build:admin
```

**Bundle checks:**

- `Analisa jam operasional` exists in the emitted dashboard chunk.
- `Order settled per jam` and `Revenue settled per jam` exist in the emitted widget code.
- Existing dashboard markers remain present.
- `dist/sw.js` continues to include the configured update/cache controls.

### Task 8: Visual QA and release gate

**Verification viewports:**

- Desktop: 1440px wide.
- Tablet: 768px wide.
- Mobile: 390px and 430px wide.

**Check:**

- Header alignment and control wrapping.
- Chart Y-axis readability.
- Peak bar highlight.
- Summary card equal heights and readable values.
- No horizontal overflow.
- Existing revenue chart, payment mix, order status, stock alerts, and action center remain unchanged.
- Heatmap cells show correct 24-hour labels, intensity legend, and peak outline.
- Top-hours table shows top 5 active hours, correct ordering, and no horizontal overflow.
- Date filter updates the coverage label and all three views to the same selected WIB date.
- Future date and no-data states remain clear.
- Loading, empty, error, and sparse states remain legible.

**Release:**

- Inspect `git diff --name-only HEAD`.
- Stage only authored Admin source/test files from this task.
- Build Admin only.
- Deploy only `apps/admin/dist/` to the canonical webroot:
  `/var/www/admindjiwatentram.web.id/`.
- Preserve `models/`, `face-models/`, `sounds/`, and `test-upload.html`.
- Verify the correct canonical domain:
  `https://admindjiwatentram.web.id/admin`.
- Verify `version.json`, index bundle, dashboard chunk, and production marker.

---

## 7. Dependency Graph

```text
Level 1 — data and state foundations
  ├── Task 1: metric/date/view model and pure presentation helpers
  └── Task 2: bounded custom WIB date range + tests

Level 2 — same component integration, sequential
  ├── Task 3: Chart / Heatmap / Jam teratas switch
  ├── Task 4: chart scale, peak emphasis, and accessibility
  └── Task 5: summary cards and sparse-data treatment

Level 3 — verification
  └── Task 6: focused tests
      ↓
      Task 7: typecheck/build/static markers
      ↓
      Task 8: screenshot/browser QA and Admin deployment
```

All changes to `-HourlyTransactionAnalysis.tsx` must be applied sequentially to avoid merge conflicts.

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Chart becomes visually crowded after adding Y-axis | Use compact ticks and responsive label interval; test 390px. |
| Gold highlight overpowers the dashboard | Apply gold to peak bar/marker only; keep normal bars blue. |
| Revenue mode labels become inconsistent | Centralize metric copy helpers and test both modes. |
| Sparse one-day data is interpreted as staffing truth | Keep prominent warning and avoid automatic recommendations. |
| Existing dashboard sections shift or break | Additive widget-only changes; verify neighboring sections before release. |
| Generated version files pollute commit | Revert unrelated generated metadata; selective stage only. |
| Wrong production target | Use canonical `admindjiwatentram.web.id` mapping and verify public `version.json`. |
| Browser cache hides a valid deploy | Verify public index/bundle/version first; then test fresh browser or clear Service Worker once. |

---

## 9. Acceptance Criteria

- [ ] Widget remains compact and symmetric on desktop.
- [ ] Widget remains readable at 390–430px without horizontal overflow.
- [ ] Chart clearly states whether it shows orders or revenue.
- [ ] Y-axis has a meaningful scale/unit.
- [ ] Peak hour is visually emphasized without hardcoded values.
- [ ] Tooltip shows exact hour, active metric, and secondary context.
- [ ] Summary cards have stronger numeric hierarchy and equal height.
- [ ] `Sampel terbatas` is visible and correctly caveated.
- [ ] Order and Revenue modes remain semantically consistent.
- [ ] Date filter selects one exact WIB calendar date with bounded query.
- [ ] Future date and no-transaction date have clear safe states.
- [ ] `Chart`, `Heatmap`, and `Jam teratas` switch inside the same card.
- [ ] Heatmap has 24 cells, metric-driven intensity, legend, and peak outline.
- [ ] Top-hours table ranks the top 5 active hours correctly.
- [ ] All views stay synchronized with period, date, and metric controls.
- [ ] Existing dashboard statistics/charts/data are not removed or changed.
- [ ] Existing unit tests pass.
- [ ] Admin build passes.
- [ ] Production bundle and marker are verified on `admindjiwatentram.web.id`.
- [ ] No database, payment, inventory, auth, or Telegram behavior is changed.

---

## 10. Explicit Non-Goals

- No automatic staff scheduling or staffing recommendation.
- No new database table/view/RPC.
- No AI-generated insight.
- No redesign of the rest of the Admin dashboard.
- No change to settled status definitions or WIB aggregation.
