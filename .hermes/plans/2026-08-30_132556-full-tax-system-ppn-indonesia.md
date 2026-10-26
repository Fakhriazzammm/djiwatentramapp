# Full Tax System & PPN Indonesia Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Membangun sistem pajak end-to-end yang authoritative, konsisten, dan dapat diaudit di `apps/pos`, `apps/admin`, dan `apps/customer`, dengan basis pajak subtotal setelah diskon dan service charge tidak menjadi dasar pajak.

**Architecture:** Admin menjadi tempat pengaturan tax policy, tetapi browser hanya menampilkan preview. Perhitungan final dan validasi dilakukan server-side melalui PostgreSQL RPC/transaction boundary. Order menyimpan snapshot tarif dan nominal pajak agar historical order tidak berubah ketika tarif baru diterapkan. Settlement, finance, accounting, receipt, dan report membaca snapshot order yang sama.

**Tech Stack:** React + Vite + TanStack Router, shared workspace package, Supabase PostgreSQL, SQL migration/RPC/trigger, existing hybrid hooks, existing accounting COA, Vitest/Bun tests, PWA/static VPS deployment.

---

## 1. Research Result: Standar PPN Indonesia

### 1.1 Koreksi asumsi tarif 10%

Tarif umum PPN Indonesia **bukan 10%** untuk kondisi saat ini.

- Tarif PPN umum berubah dari 10% menjadi **11% mulai 1 April 2022** berdasarkan UU Harmonisasi Peraturan Perpajakan (UU HPP).
- Mulai **1 Januari 2025**, tarif PPN secara nominal menjadi 12%, tetapi untuk barang/jasa non-mewah digunakan Dasar Pengenaan Pajak nilai lain sebesar 11/12 dari harga jual, sehingga tarif efektifnya tetap **11%**.
- Tarif 12% penuh ditujukan untuk barang kena pajak/jasa kena pajak yang tergolong mewah dan mengikuti ketentuan PPnBM/aturan turunannya.
- Karena status usaha, objek pajak, PB1/PPN daerah, dan klasifikasi barang dapat mengubah perlakuan, aplikasi tidak boleh mengklaim bahwa semua transaksi restoran otomatis PPN 11% tanpa konfirmasi status pajak usaha.

### 1.2 Sumber resmi yang digunakan

1. Direktorat Jenderal Pajak — Pemungutan Pajak Pertambahan Nilai:
   - https://www.pajak.go.id/id/pemungutan-pajak-pertambahan-nilai
2. Kementerian Keuangan — PPN 12 Persen Hanya untuk Barang Mewah:
   - https://www.kemenkeu.go.id/informasi-publik/publikasi/berita-utama/PPN-12-Persen-Hanya-Untuk-Barang-Mewah
3. Landasan kebijakan yang perlu dikonfirmasi kembali oleh finance/tax advisor sebelum production activation:
   - UU HPP dan aturan pelaksanaan PPN terbaru yang berlaku pada tanggal aktivasi.

### 1.3 Keputusan aplikasi

Keputusan user untuk implementasi saat ini:

```text
Tax base = subtotal setelah seluruh diskon yang relevan
Service charge tidak masuk tax base
PPN rate default aplikasi = 11% hanya jika bisnis dikonfirmasi sebagai pemungut PPN
Rate harus dapat diubah dari Admin Settings tanpa hardcode
```

Catatan: nilai default 11% tidak boleh mengaktifkan pajak secara otomatis apabila database bisnis saat ini masih memilih `0%`. Konfigurasi live tetap menjadi keputusan operator.

### 1.4 Kebijakan berdasarkan channel pembayaran

Kebijakan channel yang disepakati:

| Channel pembayaran | Pajak/service charge |
|---|---|
| **Bayar Tunai di Kasir** | **Gratis / Rp0** |
| **QRIS di Kasir** | Mengikuti tax policy |
| **Djiwa App - QRIS** | Mengikuti tax policy |
| **Djiwa App - Djiwa Pay** | Mengikuti tax policy |
| **Djiwa App - Bayar Tunai di Kasir** | **Gratis / Rp0** |

Implementasi wajib memakai kombinasi `source`, `paymentMethod`, `paymentChoice`, dan `paymentReceiptKind` untuk menentukan channel canonical. Jangan hanya memeriksa `paymentMethod === "cash"`, karena `cash` dari POS dan `cash` dari Djiwa App memiliki provenance berbeda.

Mapping canonical:

```text
source=pos + cash/tunai
  → Bayar Tunai di Kasir
  → tax=0, service_charge=0

source=pos + qris/qris_mayar
  → QRIS di Kasir
  → mengikuti active tax policy

source=customer_self_service + paymentChoice=mayar / paymentMethod=qris
  → Djiwa App - QRIS
  → mengikuti active tax policy

source=customer_self_service + paymentChoice=wallet / paymentMethod=wallet
  → Djiwa App - Djiwa Pay
  → mengikuti active tax policy

source=customer_self_service + paymentChoice=cashier / paymentReceiptKind=cashier_pending
  → Djiwa App - Bayar Tunai di Kasir
  → tax=0, service_charge=0
```

Aturan gratis harus diterapkan di server-side sebelum order disimpan. Client hanya menampilkan preview. Order dengan channel gratis tetap menyimpan snapshot policy dan alasan exemption agar dapat diaudit.

---

## 2. Current Context / Existing Findings

### Existing and reusable

- `pos.site_settings.tax_rate` dan `service_charge_rate` sudah tersedia.
- `pos.orders.tax_amount` dan `service_charge_amount` sudah tersedia.
- `public.pos_orders` sudah expose `taxAmount` dan `serviceChargeAmount`.
- Admin sudah memiliki input `Pajak (%)` dan `Service Charge (%)`.
- POS/Admin sudah menghitung tax dan service charge di Cart Context.
- Customer sudah menghitung dan menampilkan tax/service charge di checkout dan history.
- Receipt/printer POS/Admin sudah memiliki baris `PAJAK` dan `SERVICE`.

### Gaps yang harus diperbaiki

- Kalkulasi final masih dipercaya dari browser; belum ada server-side recomputation umum.
- Customer saat ini mengenakan pajak atas service charge, sedangkan POS/Admin tidak. Harus disamakan dengan keputusan user.
- `financial_transactions.amount` menyimpan total gabungan tanpa pemisahan net sales, tax payable, dan service charge.
- Accounting saat ini mengkredit seluruh total ke revenue, tanpa tax-liability COA.
- P&L, cash flow, dan shift report belum memiliki breakdown pajak/service charge.
- Customer receipt confirmation hanya menampilkan total final, belum breakdown lengkap.
- Rate belum divalidasi untuk NaN, negatif, atau nilai tidak wajar.
- Customer memiliki potensi floating-point mismatch karena order menyimpan total asli sementara wallet memakai `Math.round(total)`.
- `apps/admin/vercel.json` masih menunjuk `build:pos`; perlu diperbaiki agar Admin tidak menghasilkan artifact POS.
- Existing historical orders harus tetap memakai nominal/snapshot lama; tidak boleh dihitung ulang massal.

---

## 3. Canonical Tax Contract

### 3.1 Formula

```text
product_subtotal = sum(item.price × item.quantity)
gross_subtotal   = sum(item.original_price × item.quantity)
promo_discount   = gross_subtotal - product_subtotal
voucher_discount = voucher discount on eligible product subtotal
subtotal_after_discount = max(0, product_subtotal - voucher_discount)

service_charge = roundRupiah(subtotal_after_discount × effective_service_charge_rate / 100)
tax_base       = subtotal_after_discount
tax_amount     = roundRupiah(tax_base × effective_tax_rate / 100)
raw_total      = subtotal_after_discount + service_charge + tax_amount
final_total    = roundToThousandHalfDown(raw_total)
rounding       = final_total - raw_total
```

`promo_discount` yang sudah tercermin pada item price tidak boleh dikurangkan dua kali.

```text
effective_service_charge_rate = service_charge_rate
effective_tax_rate = tax_rate
```

Untuk channel gratis, server menetapkan:

```text
effective_tax_rate = 0
service_charge_rate = 0
tax_amount = 0
service_charge_amount = 0
exemption_reason = "cashier_payment_channel"
```

Untuk channel yang mengikuti policy, `effective_tax_rate` dan `service_charge_rate` berasal dari active tax policy yang berlaku pada waktu order dibuat.

### 3.2 Pembulatan nominal

Semua nominal yang dibayar customer dan `total` pada struk harus menjadi kelipatan Rp1.000.
Aturannya **nearest thousand, half down**: sisa tepat Rp500 dibulatkan ke bawah, sedangkan sisa di atas Rp500 dibulatkan ke atas.

```text
Rp20.120 → Rp20.000
Rp20.500 → Rp20.000
Rp20.600 → Rp21.000
```

Implementasi shared/client:

```ts
function roundToThousandHalfDown(amount: number): number {
  const floor = Math.floor(amount / 1000) * 1000;
  return amount - floor > 500 ? floor + 1000 : floor;
}
```

PostgreSQL harus memakai formula numerik yang setara, bukan `round(amount / 1000)` karena nilai tepat Rp500 harus turun.

Prinsip accounting:

- Komponen perhitungan tetap disimpan untuk audit.
- `final_total` dan nominal settlement adalah kelipatan Rp1.000.
- Harga item, tax base, tax, dan service charge tidak dipaksa menjadi kelipatan Rp1.000 karena dapat mengubah rekonsiliasi; selisih final ditampilkan transparan sebagai `Pembulatan`.
- Accounting mencatat pembulatan secara eksplisit agar jurnal tetap balance.
- Jangan mengubah `tax_amount` hanya untuk menyamakan total.

### 3.3 Snapshot

Order baru menyimpan:

- `tax_policy_version`
- `payment_channel_canonical`
- `tax_exemption_reason`
- `tax_rate_snapshot`
- `tax_base_amount`
- `tax_amount`
- `service_charge_rate_snapshot`
- `service_charge_base_amount`
- `service_charge_amount`
- `raw_total_amount`
- `rounding_adjustment`
- `total_amount`
- optional `tax_jurisdiction` / `tax_type` jika dibutuhkan setelah status usaha dikonfirmasi

Historical order dengan field snapshot kosong tetap dibaca menggunakan field lama dan tidak di-backfill otomatis.

---

## 4. Database Schema & Migration Plan

### Task 1: Add tax policy metadata additively

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_tax_policy_foundation.sql`
- Reference: `supabase/migrations/0002_core_pos.sql`

**Changes:**
- Add nullable/default-safe fields to `pos.site_settings` or a dedicated `pos.tax_policies` table.
- Preferred design: dedicated `pos.tax_policies` with one active policy per business scope, while retaining existing `site_settings.tax_rate` for backward compatibility during rollout.
- Fields:
  - `source_id`
  - `policy_name`
  - `tax_type` (`ppn`, `pb1`, `none`, `custom`)
  - `rate_percent`
  - `tax_base_mode` (`subtotal_after_discount`)
  - `service_charge_taxable` boolean default false
  - `rounding_mode` (`rupiah_nearest_thousand_half_down`)
  - `is_active`
  - `effective_from`
  - `effective_until`
  - `created_by`
  - `raw`
- Add indexes and unique/active policy guard without deleting legacy columns.

### Task 2: Add order tax snapshot columns

**Files:**
- Create: same migration or separate additive migration
- Reference: `pos.orders` and all `public.pos_orders` view migrations

**Fields:**

```sql
subtotal_amount numeric(18,2)
tax_base_amount numeric(18,2)
tax_rate_snapshot numeric(10,4)
tax_amount numeric(18,2)
service_charge_base_amount numeric(18,2)
service_charge_rate_snapshot numeric(10,4)
service_charge_amount numeric(18,2)
raw_total_amount numeric(18,2)
rounding_adjustment numeric(18,2)
payment_channel_canonical text
tax_exemption_reason text
tax_policy_version text
```

- Preserve existing `total_amount`, `discount_amount`, `tax_amount`, and `service_charge_amount`.
- Update order views with camelCase aliases.
- No destructive rename/drop.

### Task 3: Add tax ledger / audit tables

**Tables:**

```text
pos.tax_audit_events
- id
- order_source_id
- event_type
- old_values jsonb
- new_values jsonb
- actor_source_id
- reason
- created_at

pos.tax_period_summaries
- id
- period_start
- period_end
- tax_type
- taxable_base
- tax_amount
- service_charge_base
- service_charge_amount
- order_count
- status
- generated_at
```

- Keep audit append-only.
- Add indexes by `order_source_id`, period, and tax type.
- Do not expose internal audit payloads to public customer views.

### Task 4: Add tax COA entries

**Files:**
- Add idempotent seed in migration or existing COA seed migration.

**Recommended accounts:**

```text
4-1000 Pendapatan Penjualan
2-2100 Pajak Keluaran / PPN Terutang
2-2200 Service Charge Terutang  (only if business treats it as payable/pass-through)
1-1000 Kas Tunai
1-1100 Kas Non-Tunai
```

Account classification must be confirmed with the business accountant before activation. The plan assumes tax collected is a liability, not revenue.

### Task 5: Create server-side calculate/validate RPC

**Function:**

```text
pos.calculate_order_tax(
  p_items jsonb,
  p_discount_amount numeric,
  p_tax_policy_id text default null,
  p_service_charge_override numeric default null
) returns jsonb
```

**Responsibilities:**

- Read active tax policy.
- Validate rate range and policy status.
- Calculate subtotal, discount, tax base, service charge, tax, and final total.
- Round consistently.
- Return a breakdown and policy version.
- Never write an order.

### Task 6: Create atomic order creation/validation boundary

Preferred options, to be selected after reading current RLS and write patterns:

1. Extend existing order RPC/write path to calculate authoritative amounts before insert.
2. Add a `pos.validate_order_tax` trigger that rejects inconsistent totals while preserving client-side order creation.
3. Use both RPC calculation and database constraint/trigger as defense-in-depth.

Minimum invariants:

```text
subtotal_amount >= 0
tax_rate_snapshot >= 0
service_charge_rate_snapshot >= 0
tax_amount = round(tax_base × rate)
service_charge_amount = round(service_base × rate)
total_amount = subtotal + tax + service
```

Existing historical rows must remain readable even if they predate the new constraints; constraints should apply safely to new writes or use nullable compatibility guards.

---

## 5. Backend & Settlement Integration

### Task 7: Make order creation authoritative

**Files likely to change:**

- `packages/yumipos-web-shared/src/hooks/use-hybrid-write-actions.ts`
- `apps/pos/src/hooks/use-hybrid-write-actions.ts`
- `apps/admin/src/hooks/use-hybrid-write-actions.ts`
- `apps/customer/src/hooks/use-hybrid-write-actions.ts`
- Any Edge Function/RPC adapter used by the actual production write path.

**Rules:**

- Client sends items and discount context for preview/correlation.
- Server recalculates from canonical product/order inputs and active tax policy.
- Server returns authoritative order totals.
- Do not trust `totalAmount`, `taxAmount`, or `serviceChargeAmount` without validation.
- Preserve idempotency behavior.
- Return a clear error if client preview differs from server total.

### Task 8: Update settlement paths

Audit and update:

- `pos.settle_cashier_order`
- `pos.wallet_settle_order`
- Mayar webhook settlement
- auto financial transaction path
- direct POS/Admin settled-order path

Settlement must use the stored order snapshot, not recalculate using today’s rate.

### Task 9: Split financial transaction and accounting entries

For new settled order:

```text
Debit  Kas / Kas Non-Tunai                 total collected
Credit Pendapatan Penjualan                tax-exclusive sales
Credit Pajak Keluaran / PPN Terutang       tax amount
Credit Service Charge Terutang             service charge, if pass-through
```

Backward compatibility:

- Historical financial transactions remain unchanged.
- New report logic derives tax from linked order snapshot where available.
- Do not double-count tax as expense.
- Keep HPP/COGS separate from tax and cash flow.

---

## 6. Shared Frontend Calculator & Components

### Task 10: Create canonical shared tax calculator

**Create:**

```text
packages/yumipos-web-shared/src/lib/tax-calculator.ts
packages/yumipos-web-shared/src/lib/tax-calculator.test.ts
```

Exports:

```ts
calculateOrderTax(input): TaxCalculation
roundRupiah(value): number
validateTaxRate(rate): ValidationResult
```

The function must be pure, deterministic, and independent of Supabase/React.

### Task 11: Create reusable breakdown component

**Create:**

```text
packages/yumipos-web-shared/src/components/finance/TaxBreakdown.tsx
```

Props:

```ts
subtotal
promoDiscount
voucherDiscount
serviceChargeRate
serviceChargeAmount
taxRate
taxBaseAmount
taxAmount
total
mode: "checkout" | "receipt" | "report"
```

Display rules:

- Hide zero-value rows only when the context explicitly allows compact mode.
- Show `Dasar pajak` in receipt/report mode.
- Show policy label: `PPN`, `PB1`, `Pajak`, or custom label from settings.
- Never label a configured rate as legally valid without policy metadata.

### Task 12: Align POS/Admin/Customer calculations

Update:

- `packages/yumipos-web-shared/src/context/cart-context.tsx`
- `apps/pos/src/context/cart-context.tsx` if still app-local
- `apps/admin/src/context/cart-context.tsx` if still app-local
- `apps/customer/src/routes/$username/order.lazy.tsx`

All must call the same calculator with:

```text
service_charge_taxable = false
```

Client calculation remains a responsive preview; server result becomes final before settlement/payment.

---

## 7. UI/UX Specification

### Admin `/admin/settings`

Add a calm, compact tax policy card:

- Tax type selector: `Tidak ada`, `PPN`, `PB1`, `Custom`.
- Rate input with min/max validation and inline error.
- Tax-base explanation: `Subtotal setelah diskon`.
- Toggle: `Service charge dikenai pajak` locked/off according to current decision.
- Rounding display: `Pembulatan ke rupiah terdekat`.
- Effective date and policy version.
- Warning when changing active rate:
  - New orders use new rate.
  - Historical orders remain unchanged.
- Preview calculator with sample subtotal and visible breakdown.
- Saving state, success state, retryable error state.

### POS checkout

Add reusable breakdown:

```text
Subtotal Produk        Rp xxx
Diskon                 -Rp xxx
Dasar Pajak            Rp xxx
Service Charge (x%)    Rp xxx
PPN (x%)               Rp xxx
Total                  Rp xxx
```

Rules:

- Do not show duplicate “Biaya Tambahan” and detailed tax lines simultaneously.
- If server recalculation changes the preview, show a non-blocking but clear adjustment message before payment.
- Payment button uses authoritative total.

Channel behavior visible to kasir:

| Channel | Preview pajak/service |
|---|---|
| Bayar Tunai di Kasir | `Gratis / Rp0` |
| QRIS di Kasir | `Mengikuti tax policy` |

Do not show the free label only because the browser sends `cash`; show it after the canonical channel is resolved.

### POS/Admin receipt and printer

- Printed receipt includes:
  - subtotal
  - discount
  - tax base when tax is active
  - service charge
  - tax label + rate
  - rounding adjustment
  - total
- Tambahkan penjelasan pada semua mode struk:
  - `Pembulatan ke Rp1.000`
  - `Sisa ≤ Rp500 dibulatkan ke bawah; sisa > Rp500 dibulatkan ke atas.`
- Jika `rounding_adjustment` negatif, tampilkan sebagai pengurang; jika positif, tampilkan sebagai penambah.
- Customer, kasir, dan admin harus melihat nominal final yang sama.
- Existing historical receipts remain renderable with fallback fields.
- Do not expose internal policy IDs or audit JSON.

### Admin finance/P&L/cash flow/shift report

Add separate lines:

```text
Gross sales
Discount
Net sales sebelum pajak
Service charge
Pajak keluaran
Cash collected
HPP/COGS
Operating expenses
Net profit
```

Use a tooltip/help panel to distinguish:

- Revenue
- Tax collected on behalf of government
- Service charge liability/pass-through
- Actual cash inflow

### Customer checkout

- Use same shared breakdown as POS/Admin.
- Tampilkan baris `Pembulatan` dan total final kelipatan Rp1.000.
- Tambahkan helper text: `Total dibulatkan ke Rp1.000; tepat Rp500 dibulatkan ke bawah.`
- Channel `Djiwa App - Bayar Tunai di Kasir` menampilkan badge `Pajak/service charge gratis`.
- Channel `Djiwa App - QRIS` dan `Djiwa App - Djiwa Pay` menampilkan `Mengikuti tax policy`.
- Copy should be clear and non-legalistic:
  - `Pajak (11%)`
  - `Service Charge (5%)`
  - `Dasar pajak`
- On receipt confirmation, show the full breakdown, not only total.
- History and tracking remain compatible with old orders.
- Mobile layout target: 390–430px shell, compact two-column amount rows, no overflow.

### Loading / empty / error states

- Settings loading: skeleton card.
- Missing policy: neutral `Pajak belum dikonfigurasi` state, not an implied 0% legal decision.
- Invalid rate: field-level validation.
- Server mismatch: explain that order total was recalculated securely.
- Report with no tax: show `Tidak ada pajak tercatat pada periode ini`, distinguish from query failure.

---

## 8. Cross-App Integration Map

| Source | Canonical data | Consumers |
|---|---|---|
| Admin tax settings | `pos.tax_policies` / `pos.site_settings` | POS, Customer, Admin preview |
| Shared calculator | `tax-calculator.ts` | POS/Admin/Customer checkout |
| Order snapshot | `pos.orders.tax_*` | Receipts, history, settlement, reports |
| Tax ledger | `pos.tax_period_summaries` / accounting entries | Admin finance/accounting |
| Financial transaction | tax-exclusive revenue + tax liability metadata | P&L, cash flow, shift report |
| Existing HPP snapshot | `pos.order_items.hpp_snapshot` | COGS only, never tax base |
| Mayar settlement | linked `order_source_id` | payment reconciliation |
| Djiwa Pay settlement | linked order snapshot | wallet settlement and accounting |

No Telegram/purchasing/AI integration should infer tax from free-text. If notification/reporting later needs tax, it must read structured order/accounting fields.

---

## 9. No-Hardcode Audit

Remove or avoid hardcoded business values for:

- `taxRate: 10`
- `taxRate: 11`
- `taxRate: 12`
- tax labels (`PPN`, `PB1`) when policy is configurable
- rounding behavior
- effective dates
- tax-base rules
- service-charge taxability

Allowed defaults:

- Safe inactive default: `0%` when no active policy exists.
- Suggested Admin preset: `PPN 11%`, but it must require explicit save/activation.
- UI labels may use neutral `Pajak` until policy type is selected.

---

## 10. Testing Plan

### Unit tests

```text
subtotal after discount tax base
service charge excluded from tax base
multiple discounts without double subtraction
rounding to Rp1.000 with half-down
Rp20.120 → Rp20.000
Rp20.500 → Rp20.000
Rp20.600 → Rp21.000
zero rate
invalid negative/NaN/over-limit rate
historical snapshot remains unchanged
```

### Integration tests

```text
server recalculates manipulated client total
server rejects inconsistent tax fields
new order stores tax snapshot
settlement uses snapshot, not current settings
financial split balances debit and credit
tax liability COA is used
old order without snapshot still renders
idempotent retry does not duplicate tax ledger
```

### Report tests

```text
net sales excludes tax
cash collected includes tax
tax liability equals order tax sum
service charge is not tax
HPP is not counted as tax or operating expense
P&L and cash flow do not double count
```

### UI verification

- POS mobile checkout screenshot.
- Admin settings screenshot with valid/invalid/loading states.
- Customer checkout and receipt screenshot.
- Desktop finance report screenshot.
- Browser console must have no new errors.

---

## 11. Deployment & Rollout

### Migration rollout

1. Apply additive migration in staging/self-hosted test DB.
2. Verify schema, RLS, indexes, RPC, COA, and trigger behavior.
3. Do not backfill historical orders automatically.
4. Enable policy only after finance confirms tax type and business status.

### Build order

Build one app at a time:

```bash
cd /opt/djiwatentramapp/apps/pos && npm run build
cd /opt/djiwatentramapp/apps/admin && npm run build
cd /opt/djiwatentramapp/apps/customer && npm run build
```

Fix `apps/admin/vercel.json` before deployment:

```json
"buildCommand": "cd ../.. && bun run build:admin",
"ignoreCommand": "bash ../../scripts/vercel-ignore.sh apps/admin packages/backend packages/env packages/config supabase"
```

### Canonical deployment mapping

```text
apps/admin    → admindjiwatentram.web.id
apps/pos      → pos.djiwatentram.web.id
apps/customer → djiwatentram.web.id
```

### Production verification

- Check `version.json` commit hash.
- Check `index.html` and lazy chunk hash chain.
- Check tax calculator marker in each affected bundle.
- Query read-only order samples and tax period totals.
- Verify receipt asset/printer bundle.
- Do not create a real order/payment solely for smoke testing without explicit approval.

---

## 12. Risks & Tradeoffs

| Risk | Mitigation |
|---|---|
| Tax rule legally differs between PPN/PB1 | Require policy type and accountant confirmation before activation |
| Existing orders change unexpectedly | Use immutable order tax snapshots; no destructive backfill |
| Client/server total mismatch | Server authoritative response before payment/settlement |
| Finance totals change | Version reports and reconcile before/after; keep historical ledger unchanged |
| Double accounting entries | Idempotent source keys and one settlement path per order |
| Customer/ POS formula drift | One shared calculator and tests |
| Service charge classification unclear | Make liability/pass-through classification configurable and documented |
| Admin deploys POS artifact | Fix `apps/admin/vercel.json`, build and verify Admin bundle |
| Floating-point mismatch | Round centrally on server and client preview |
| RLS blocks RPC | Test grants/RLS in staging before production |

---

## 13. Acceptance Criteria

- [ ] Admin can configure policy type, rate, effective date, and rounding.
- [ ] Default inactive state remains safe at 0% until explicitly activated.
- [ ] POS/Admin/Customer use identical tax formula.
- [ ] Tax base is subtotal after discount.
- [ ] Service charge is excluded from tax base.
- [ ] Bayar Tunai di Kasir menghasilkan pajak/service charge Rp0.
- [ ] Djiwa App - Bayar Tunai di Kasir menghasilkan pajak/service charge Rp0.
- [ ] QRIS di Kasir, Djiwa App - QRIS, dan Djiwa App - Djiwa Pay mengikuti active tax policy.
- [ ] Payment channel canonical dan alasan exemption tersimpan di order snapshot.
- [ ] Total pembayaran selalu kelipatan Rp1.000.
- [ ] Rp20.120 → Rp20.000, Rp20.500 → Rp20.000, Rp20.600 → Rp21.000.
- [ ] `rounding_adjustment` tersimpan dan masuk accounting secara eksplisit.
- [ ] Semua struk menampilkan baris dan penjelasan pembulatan.
- [ ] Server rejects manipulated/inconsistent totals.
- [ ] New orders store immutable tax snapshots.
- [ ] Historical orders remain unchanged and readable.
- [ ] Cashier, wallet, Mayar, and automatic settlement use order snapshot.
- [ ] Financial entries split revenue, tax liability, service charge, and cash correctly.
- [ ] Debit equals credit for every new settled order.
- [ ] P&L, cash flow, and shift report expose tax separately.
- [ ] POS/Admin receipts and printer output show tax breakdown.
- [ ] Customer checkout, receipt, history, and tracking are clear and mobile-safe.
- [ ] Admin deployment builds Admin, not POS.
- [ ] Unit/integration tests pass for formula, tampering, rounding, settlement, and reports.
- [ ] Three app builds pass and production bundles are verified.

---

## Recommended execution waves

### Wave 1 — Foundation

- Canonical calculator tests
- Tax policy schema
- Order snapshot migration
- Tax policy read/write contract

### Wave 2 — Authority

- Server RPC/validation
- Order creation integration
- Settlement integration
- Accounting split

### Wave 3 — Shared UI

- Shared breakdown component
- POS/Admin/Customer checkout alignment
- Receipt/printer alignment

### Wave 4 — Reporting/Admin

- Tax report
- P&L/cash flow/shift breakdown
- Admin policy UX
- Admin Vercel mapping fix

### Wave 5 — Verification/release

- Regression and integration tests
- Build each app sequentially
- Deploy canonical domains
- Production read-back and rollback readiness
