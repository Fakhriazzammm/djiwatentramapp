# Plan: Integrasi Djiwa Pay, Voucher, Checkout Customer, dan Marketing Admin

## Status

Draft implementasi — belum ada perubahan kode, database, deployment, atau data production yang dilakukan.

## Goal

Menyatukan checkout `apps/customer` dengan sistem marketing/promo di `apps/admin`, serta mengganti seluruh benefit loyalty aktif dari Yumi Poin menjadi saldo Djiwa Pay.

Aturan bisnis utama:

- Setiap transaksi yang benar-benar berhasil (`paid`/`completed`) memberikan **Rp1.000 saldo Djiwa Pay**.
- Reward diberikan maksimal satu kali untuk satu order.
- Reward tidak diberikan saat order masih `pending`, invoice baru dibuat, redirect payment, atau halaman receipt dibuka.
- Saldo Djiwa Pay hanya dapat digunakan untuk checkout di DjiwaApp.
- Setiap pembayaran yang benar-benar diselesaikan menggunakan **Djiwa Pay** mendapatkan voucher/promo otomatis **diskon 20% dari total transaksi yang memenuhi syarat**.
- Pembayaran **Bayar di Kasir/Tunai** dan **QRIS Mayar tidak mendapatkan diskon 20% Djiwa Pay**.
- Diskon 20% hanya berlaku pada jalur pembayaran Djiwa Pay; customer tidak boleh memilih metode lain setelah diskon diterapkan tanpa sistem menghitung ulang harga.
- Diskon 20% tidak boleh mengurangi pajak/service charge secara diam-diam; basis diskon, urutan perhitungan, batas maksimum, dan apakah promo dapat digabung dengan Happy Hour harus dikunci server-side sebelum implementasi.
- Tidak ada withdrawal, cash-out, transfer saldo, atau konversi ke uang tunai.
- Data dan ledger loyalty lama tidak dihapus; hanya disembunyikan dari UI baru dan dipertahankan untuk audit jika masih diperlukan.
- Harga, promo, diskon, pajak, service charge, payment, reward, finance, dan notifikasi harus memiliki sumber kebenaran server-side.

## Current Context

### Yang sudah ditemukan di codebase

- Checkout customer berada di:
  - `apps/customer/src/routes/$username/order.lazy.tsx`
  - `apps/customer/src/components/customer/checkout-section.tsx`
- Checkout sudah memiliki detail item, data customer, metode pembayaran, Djiwa Pay/wallet, QRIS/Mayar, bayar di kasir, pajak, service charge, Happy Hour, dan `checkoutRequestKeyRef` untuk idempotency.
- `apps/customer/src/routes/$username/promo.lazy.tsx` sudah menampilkan promo aktif, kode promo, tombol salin kode, masa berlaku, dan tombol `Gunakan promo`.
- Checkout saat ini belum memiliki alur voucher end-to-end yang jelas: input kode → validasi → terapkan → hitung ulang total → simpan snapshot.
- Admin promo berada di:
  - `apps/admin/src/routes/admin/discounts.tsx`
  - `apps/admin/src/routes/admin/discounts.lazy.tsx`
- Database live memiliki:
  - `pos.discounts`
  - `public.pos_discounts`
  - `public.pos_active_discounts`
- Kolom promo yang tersedia:
  - `source_id`, `name`, `code`, `discount_type`, `value`
  - `target_type`, `target_id`, `target_ids`
  - `is_active`, `min_order_value`
  - `start_date`, `end_date`, `start_time`, `end_time`, `days`
  - `is_happy_hour`, `product_prices`
  - `is_free_refill`, `refill_price`, `refill_availability`
- Data live saat audit berisi 3 Happy Hour aktif; satu promo Ramadhan sudah melewati `end_date` tetapi masih bertanda `is_active = true`. Data tersebut tidak dihapus; perlu lifecycle status/auto-expiry.
- `pos.orders` sudah memiliki field historis terkait voucher/discount seperti `voucher_source_id`, `discount_amount`, `tax_amount`, `service_charge_amount`, `receipt_meta`, dan payment metadata. Kolom aktual wajib diverifikasi sebelum migration.
- Checkout menggunakan `source: "customer_self_service"` dan payment method internal `cash` atau `djiwaapp` sesuai pilihan. Mapping final ke Djiwa Pay/QRIS harus dipastikan di server dan POS.
- Customer checkout sudah memerlukan `customerDescription` sebagai ciri khusus customer; perubahan voucher tidak boleh merusak validasi tersebut.
- Djiwa Pay adalah saldo customer utama. Ledger wajib dibaca dan dipetakan berdasarkan field terstruktur (`wallet_hold`, `order_debit`, `wallet_release`, reward credit), bukan catatan bebas.

### Scope yang berbeda tetapi tetap hidup berdampingan

- Halaman `/promo` adalah katalog/etalase promo customer.
- Halaman admin `/admin/discounts` adalah workspace konfigurasi promo.
- Checkout adalah tempat promo diterapkan dan harga final dikunci.
- POS/finance adalah konsumen rekonsiliasi, bukan tempat customer mengubah promo.
- Yumi Poin lama tidak dihapus dari database secara destruktif; UI baru menggunakan Djiwa Pay.

## Architecture Decision

### Approach yang dipilih

Gunakan **satu pricing/validation contract server-side** yang dipakai oleh:

```text
Admin discount configuration
        ↓
Active promotion read model
        ↓
Customer checkout preview/apply voucher
        ↓
Server-side order creation/settlement
        ↓
POS + Finance + Djiwa Pay reward + notifications
```

Frontend boleh menghitung preview untuk respons cepat, tetapi server wajib menghitung ulang dan menyimpan snapshot final.

### Alasan

- Menghindari perbedaan harga antara customer, POS, dan laporan finance.
- Mencegah voucher expired atau tidak memenuhi syarat tetap dipakai melalui manipulasi browser.
- Memungkinkan webhook/retry aman tanpa reward atau invoice ganda.
- Menjaga integrasi dengan pricing engine Happy Hour yang sudah ada.
- Memudahkan admin melihat performa dan riwayat promo.

## Business Rules

### Promo otomatis vs voucher manual

| Jenis | Cara aktif | Contoh |
|---|---|---|
| Happy Hour | Otomatis berdasarkan waktu/hari | Harga produk Rp15.000 pukul 11:00–13:00 |
| Promo produk/kategori | Otomatis berdasarkan target | Harga khusus menu/kategori |
| Voucher | Customer memasukkan kode atau memilih promo | `HEMAT4600` |
| Free Refill | Benefit tambahan berdasarkan konfigurasi | Refill gratis/harga khusus |
| Benefit Djiwa Pay | Diberikan setelah order settled | `+Rp1.000 saldo` |
| Voucher Djiwa Pay | Otomatis hanya saat metode Djiwa Pay | `20% dari total transaksi yang memenuhi syarat` |
| Bayar di Kasir/Tunai | Tidak mendapat voucher Djiwa Pay | `0% voucher Djiwa Pay` |
| QRIS Mayar | Tidak mendapat voucher Djiwa Pay | `0% voucher Djiwa Pay` |

Default rule yang harus dikunci sebelum implementasi:

- Satu voucher diskon utama per order.
- Voucher Djiwa Pay 20% diterapkan otomatis hanya jika metode pembayaran final adalah Djiwa Pay.
- Jika metode pembayaran diganti dari Djiwa Pay ke Tunai/Bayar di Kasir atau QRIS Mayar, diskon 20% langsung dihapus dan total dihitung ulang.
- Tunai/Bayar di Kasir dan QRIS Mayar tidak pernah memperoleh voucher Djiwa Pay 20%.
- Happy Hour dan voucher tidak digabung kecuali promo secara eksplisit mengizinkan kombinasi.
- Basis default voucher Djiwa Pay adalah subtotal produk setelah promo produk/Happy Hour yang diizinkan, sebelum pajak dan service charge; keputusan final wajib dikunci sebelum implementasi.
- Wajib menetapkan batas maksimum diskon 20% atau menyatakan tanpa batas sebelum rollout; jangan mengasumsikan provider/default.
- Free Refill diproses sebagai benefit terpisah, bukan diskon tersembunyi.
- Promo yang tidak punya kode tetap dapat digunakan otomatis jika memenuhi waktu/target.
- Promo expired tidak boleh diterapkan walaupun `is_active` masih true.
- Promo yang dinonaktifkan admin tidak boleh diterapkan.
- Semua nominal final dibulatkan dan diformat sebagai IDR tanpa pecahan desimal.

### Reward Djiwa Pay

```text
order dibuat                 → belum ada reward
payment pending              → belum ada reward
payment provider confirmed   → settlement server
order menjadi paid/completed → grant reward idempotent
read-back ledger berhasil    → tampilkan saldo bertambah Rp1.000
```

Idempotency reward harus berbasis order, misalnya unique reference:

```text
transaction_reward:<order_source_id>
```

Nama field final harus mengikuti ledger existing setelah audit schema; jangan membuat dua sumber saldo baru.

## Database Schema Plan

### Existing entities yang harus diaudit

```text
pos.discounts
pos.orders
pos.order_items
pos.financial_transactions
pos.customers
[pos wallet ledger existing table/view]
public.pos_discounts
public.pos_active_discounts
public.pos_orders / read model terkait
```

Sebelum migration, discovery wajib:

- `\d+ pos.discounts`
- `\d+ pos.orders`
- `\d+ pos.financial_transactions`
- inventory/ledger wallet table dan semua index/constraint
- trigger order paid/completed yang sudah memberi benefit lama
- RPC checkout, payment hold/capture/release, dan settlement
- grants/RLS/view definitions

### Additive schema yang kemungkinan diperlukan

Nama final harus mengikuti schema existing setelah discovery. Jika field belum tersedia, tambahkan secara additive:

#### Promo usage / redemption

```text
pos.discount_redemptions
- source_id / id
- discount_id
- voucher_code_snapshot
- order_id
- customer_source_id nullable
- amount_discounted
- status: applied | reversed | cancelled
- created_at
- unique(discount_id, order_id)
```

Tujuan:

- Audit penggunaan voucher
- Limit pemakaian per customer
- Pencegahan pemakaian ulang
- Laporan performa promo

Jika project sudah memiliki tabel redemption yang setara, gunakan tabel tersebut; jangan membuat duplikasi.

#### Order snapshot fields

Tambahkan hanya jika belum ada:

```text
pos.orders
- promo_source_id
- promo_name_snapshot
- voucher_code_snapshot
- promo_discount_amount
- discount_snapshot jsonb
- djiwa_pay_reward_amount default 0
- djiwa_pay_reward_status
- djiwa_pay_reward_reference
```

`discount_snapshot` minimal memuat:

```json
{
  "promoId": "...",
  "promoName": "...",
  "voucherCode": "...",
  "discountType": "...",
  "discountValue": 0,
  "discountAmount": 0,
  "ruleVersion": "..."
}
```

Jangan menaruh secret, token, atau data pribadi yang tidak diperlukan.

#### Promo lifecycle fields

Jika tidak dapat dihitung aman hanya dari field existing, tambahkan secara additive:

```text
pos.discounts
- lifecycle_status: draft | scheduled | active | expired | archived
- stacking_mode: exclusive | combinable
- audience_type: all | member | new_customer | targeted
- usage_limit_total nullable
- usage_limit_per_customer nullable
```

Alternatif yang lebih sederhana: derive `scheduled/active/expired` dari tanggal, jam, hari, dan `is_active`, lalu hanya menambah field yang benar-benar dibutuhkan.

### Read models/views

Buat atau ubah view secara backward-compatible bila diperlukan:

```text
public.pos_active_discounts
→ hanya promo yang aktif secara lifecycle + tanggal + hari + aturan waktu

public.pos_customer_promo_eligibility
→ opsional, hanya jika eligibility query terlalu kompleks

public.pos_promo_performance
→ agregasi redemption/order settled/discount/revenue

public.pos_djiwa_pay_balance_summary
→ saldo tersedia, saldo ditahan, saldo terpakai, reward credit
```

Semua view harus:

- Memakai status `paid/completed` untuk performa transaksi.
- Mengecualikan `pending/cancelled` dari omzet settled.
- Tidak mengekspos data customer yang tidak diperlukan ke anon customer app.
- Memiliki grant yang tepat untuk `anon`, `authenticated`, dan `service_role`.

### RPC/Edge Function contract

Promo apply/checkout sebaiknya melalui RPC atau Edge Function yang:

1. Validasi cart/product IDs terhadap DB.
2. Ambil harga DB dan promo aktif.
3. Validasi voucher dan eligibility.
4. Validasi minimum order, target, waktu, hari, usage limit, dan stacking.
5. Hitung subtotal, diskon, pajak, service charge, dan total.
6. Menyimpan order pending dengan idempotency key.
7. Menyimpan promo snapshot.
8. Mengembalikan hasil deterministik untuk retry.

Jangan menerima `discountAmount` atau `totalAmount` dari browser sebagai nilai final.

## Customer Checkout UI/UX Specification

### Layout mobile-first yang dituju

```text
CHECKOUT PESANAN

[Detail Pesanan]
  item, qty, varian, harga, subtotal

[Data Customer]
  Nama customer                 Opsional
  Ciri khusus customer           Wajib
  Nomor meja                    Sesuai konfigurasi
  Catatan order                 Opsional

[Promo & Voucher]
  [Masukkan kode promo       ] [Pakai]
  Promo terpilih: HEMAT4600
  Diskon: -Rp4.600             [Hapus]
  [Lihat promo yang tersedia]

[Pembayaran]
Djiwa Pay — saldo tersedia
Jika Djiwa Pay dipilih dan eligible: voucher otomatis 20%
QRIS
Bayar di Kasir

[RINGKASAN]
  Subtotal
  Voucher Djiwa Pay (jika metode Djiwa Pay) -20%
  Diskon promo
  Pajak
  Service charge
  TOTAL
  Setelah pembayaran berhasil:
  +Rp1.000 Saldo Djiwa Pay

[Checkout Rp...]
```

### UX rules

- Section promo diletakkan dekat total, bukan tersembunyi di halaman promo saja.
- Gunakan bottom sheet untuk daftar promo yang memenuhi syarat.
- Promo yang tidak memenuhi syarat boleh ditampilkan di halaman promo, tetapi jangan ditampilkan sebagai pilihan apply di checkout tanpa alasan yang jelas.
- Input voucher memiliki state:
  - kosong
  - mengetik
  - memvalidasi
  - valid
  - invalid
  - expired
  - tidak memenuhi minimum order
  - tidak berlaku untuk isi keranjang
  - sudah mencapai limit
- Tombol checkout disabled saat validasi harga/payment sedang berjalan.
- Total final selalu terlihat sebelum submit.
- Djiwa Pay menampilkan saldo tersedia dan status saldo tidak cukup.
- Reward `+Rp1.000` diberi label sebagai benefit setelah transaksi berhasil, bukan saldo yang sudah masuk.
- Sticky CTA harus memiliki bottom padding dan safe-area agar tidak menutup footer maupun isi checkout.
- Semua kontrol minimal 44px.
- Gunakan IDR formatter terpusat.

### Error copy

```text
Kode promo tidak ditemukan.
Kode promo sudah berakhir.
Promo belum aktif pada waktu ini.
Promo ini tidak berlaku untuk item di keranjang.
Minimal transaksi untuk promo ini Rp50.000.
Promo ini sudah mencapai batas penggunaan.
Voucher tidak dapat digabung dengan promo yang sedang aktif.
Saldo Djiwa Pay belum cukup. Kurang Rp...
Pembayaran belum terkonfirmasi. Pesanan tetap menunggu verifikasi.
```

Jangan menampilkan stack trace, provider secret, atau detail internal database.

## Admin Marketing UI/UX Specification

### Struktur workspace `/admin/discounts`

Pisahkan secara visual:

```text
Promo Otomatis | Voucher | Happy Hour | Free Refill | Performa
```

Jika tab baru akan menambah kompleksitas berlebihan, gunakan filter/chip di satu workspace table-first; keputusan final dibuat saat implementasi setelah audit route existing.

### Table columns

```text
Nama promo
Tipe
Target
Nilai
Periode
Jam
Audiens
Status lifecycle
Stacking
Digunakan
Diskon total
Omzet terkait
Aksi
```

### CRUD behavior

- Create: nama, tipe, nilai, target, periode, jam, hari, audience, min order, stacking, usage limit.
- Read: compact table desktop + mobile cards.
- Update: inline untuk field aman; modal/review untuk perubahan yang memengaruhi harga.
- Activate/deactivate: confirmation + alasan opsional.
- Archive: non-destructive; tidak menghapus redemption/order history.
- Duplicate: membuat draft baru dengan ID baru dan status draft, tidak langsung aktif.
- Preview: tampilkan contoh harga sebelum/sesudah untuk beberapa produk target.
- Margin warning: jika HPP tersedia, tampilkan harga promo, HPP, margin nominal, dan margin percentage.
- Expired promo: badge `Berakhir`; tidak tampil sebagai aktif customer.
- Usage detail: buka detail redemption dan order settled tanpa mengekspos PII berlebihan.

### Admin states

```text
Loading       → skeleton table/cards
Empty         → Belum ada promo
Error         → error jelas + Muat ulang
Saving        → disable action + Menyimpan...
Conflict      → promo bentrok/stacking conflict
Expired       → status Berakhir
Scheduled     → status Terjadwal
Active        → status Aktif sekarang
Archived      → status Diarsipkan
```

### Voucher Djiwa Pay 20% di Admin

Voucher/promo khusus ini harus dikelola sebagai promo system-owned yang hanya dapat diterapkan pada metode pembayaran Djiwa Pay:

```text
Nama             : Voucher Djiwa Pay 20%
Tipe             : Persentase
Nilai            : 20%
Payment channel  : Djiwa Pay saja
Tunai/kasir      : Tidak eligible
QRIS Mayar       : Tidak eligible
Reward settlement: +Rp1.000 saldo Djiwa Pay
Status           : Aktif/nonaktif dari Admin Marketing
```

Admin boleh mengatur lifecycle dan parameter yang disetujui, tetapi tidak boleh mengubah payment-channel restriction menjadi Tunai atau QRIS tanpa audit/confirmation. Customer checkout, POS, dan server harus membaca restriction yang sama.

## Multi-Source Data Flow

```text
Admin /admin/discounts
  → pos.discounts
  → public.pos_active_discounts

Customer menu
  → active discounts
  → pricing engine
  → product display price/badge

Customer checkout
  → cart + active discount + voucher
  → server validator/pricing
  → pending order + discount snapshot
  → payment channel

Payment settlement
  → provider verification / cashier settlement
  → order paid/completed
  → financial transaction
  → inventory deduction
  → Djiwa Pay order debit if wallet
  → Djiwa Pay reward credit Rp1.000
  → promo redemption finalized
  → customer history
  → POS notification / Telegram supervisor

Admin reporting
  → settled orders + redemption + ledger
  → promo performance
  → finance reconciliation
```

### Important boundaries

- Voucher validation is separate from payment settlement.
- Djiwa Pay hold/capture/release is separate from reward credit.
- Wallet top-up is separate from ordinary order payment.
- Booking payment is separate unless an explicit integration path already exists.
- Notification delivery is best-effort after financial/order commit and must be deduplicated server-side.

## Integration Points

### apps/customer

Likely files:

- `apps/customer/src/components/customer/checkout-section.tsx`
- `apps/customer/src/routes/$username/order.lazy.tsx`
- `apps/customer/src/routes/$username/promo.lazy.tsx`
- Customer pricing utilities/hooks
- Customer wallet/Djiwa Pay hooks
- Customer receipt/history mappers

Changes:

- Add voucher input/apply/remove contract.
- Add promo picker bottom sheet or inline selector.
- Show applied promo and discount line.
- Show Djiwa Pay balance and `+Rp1.000` post-settlement benefit copy.
- Preserve mandatory `customerDescription` validation.
- Preserve idempotency key and pending payment state.

### apps/admin

Likely files:

- `apps/admin/src/routes/admin/discounts.lazy.tsx`
- `apps/admin/src/routes/admin/discounts.tsx`
- Admin sidebar/page title/navigation if new subviews are introduced.
- Shared/admin hooks for discounts, order aggregates, customer aggregates, wallet summaries.

Changes:

- Add lifecycle status and filters.
- Add promo/voucher configuration fields.
- Add preview price and conflict warnings.
- Add performance view based only on settled orders.
- Add reward-related reporting: number of orders rewarded, total Djiwa Pay credit, deduped reward failures.

### POS

Likely consumers:

- `apps/pos/src/components/pos/menu-sidebar.tsx`
- POS order detail/history and notification mappers.
- Shared hybrid order/pricing data.

Changes should be limited to:

- Display applied promo/voucher snapshot.
- Display final payment/reward labels consistently.
- Ensure cashier-settled `paid` order triggers reward once.
- Do not let cashier alter a customer voucher after order creation without an explicit operational policy.

### Finance

- Include discount amount as contra-revenue/discount reporting, not as an income transaction by itself.
- Include Djiwa Pay reward credit in wallet liability/ledger reporting according to existing accounting model.
- Distinguish reward credit from customer payment and wallet top-up.
- Verify settled order, financial transaction, wallet debit, and reward credit counts separately.

### Telegram / supervisor agent

- Notify only after payment/order settlement is authoritative.
- Include source and payment labels without exposing voucher internals or secrets.
- Use server-side dedupe key for order-paid notification and reward notification.
- Optional future campaign feature must not be mixed with operational settlement notifications.

### AI / LLM

No AI is required for the first rollout.

If later used for campaign recommendations:

- AI may rank eligible promo IDs only.
- Candidate promo, eligibility, price, and discount values come from DB.
- AI must not invent promo codes, prices, or eligibility.
- Use deterministic fallback to active DB promos.

### Purchasing agent

No direct write integration for phase 1.

Possible future read-only signal:

```text
promo usage / uplift → demand forecast → purchasing recommendation
```

Do not let marketing code directly change purchasing or inventory quantities in this rollout.

## No-Hardcode Audit

Values that must come from DB/admin settings or validated provider data:

- Promo names, codes, prices, percentages, date/time, days.
- Product/category targets.
- Minimum order and usage limits.
- Stacking rules and audience eligibility.
- Tax and service charge.
- Djiwa Pay balance and ledger status.
- Order totals and discount amounts.
- Reward amount configuration if the business later makes it configurable.
- Payment provider status and invoice IDs.
- Customer identity/contact data.

Allowed constant in phase 1:

```text
TRANSACTION_REWARD_AMOUNT = 1000
```

Prefer storing this in an admin-controlled site setting or a server-side configuration table if the amount may change without deployment. Do not hardcode a second copy in customer, POS, admin, and bot independently.

Temporary fallback policy:

- A missing customer name may use an existing neutral order fallback where current contract requires it.
- A missing promo may show no promo; never invent a promo.
- A missing wallet balance is loading/error, not Rp0 unless the API explicitly returns zero.
- A failed query must not be presented as an empty marketing catalog without an error state.

## Implementation Waves

### Wave 0 — Contract and schema audit

1. Inventory all discount, voucher, pricing, wallet, order, payment, reward, and finance code paths.
2. Verify live schema, views, RPCs, triggers, grants, and existing wallet ledger.
3. Identify any existing Yumi Poin reward trigger and disable/migrate only after proof of call path.
4. Produce a field mapping matrix from admin form → database → customer display → order snapshot → finance/POS.
5. Decide final stacking rule and whether reward amount is DB-configured.

### Wave 1 — Server-side pricing and voucher contract

1. Implement/extend one authoritative validator.
2. Add idempotent redemption/usage recording.
3. Add order discount snapshot fields if needed.
4. Add lifecycle filtering for expired/scheduled promo.
5. Add tests for invalid code, expired code, target mismatch, min order, limit, stacking, price tampering, and duplicate apply.

### Wave 2 — Customer checkout UX

1. Add Promo & Voucher section.
2. Add code apply/remove and available promo picker.
3. Add loading/error/success states.
4. Add Djiwa Pay balance and reward-after-settlement copy.
5. Keep customer description mandatory and preserve existing checkout/payment idempotency.
6. Add receipt/history display for applied promo and reward status.

### Wave 3 — Admin marketing workspace

1. Add lifecycle status and filters.
2. Add CRUD fields for voucher/limits/audience/stacking.
3. Add price preview and margin warning.
4. Add usage/performance summary from settled orders.
5. Archive expired promo safely; do not delete historical records.

### Wave 4 — Settlement and Djiwa Pay reward

1. Grant `+Rp1.000` only on authoritative `paid/completed` transition.
2. Use unique reward reference/order ID for dedupe.
3. Keep wallet hold/capture/release separate from reward credit.
4. Read back wallet balance/ledger before showing success.
5. Add retry and duplicate webhook tests.

### Wave 5 — POS, finance, Telegram, and release

1. Verify POS displays applied promo/payment/reward provenance.
2. Verify finance classifications and totals.
3. Verify Telegram notification dedupe and source/payment labels.
4. Build customer/admin/POS one app at a time.
5. Deploy only affected apps/functions.
6. Run production smoke tests without charging a real customer unless explicitly approved.

## Test Plan

### Unit tests

- Price calculation with no promo.
- Happy Hour price.
- Voucher flat discount.
- Voucher percentage discount.
- Djiwa Pay voucher applies exactly 20% only on Djiwa Pay.
- Djiwa Pay voucher is absent for cash/cashier and QRIS Mayar.
- Minimum order.
- Target product/category.
- Expired/scheduled/day/time boundaries in WIB.
- Stacking exclusive/combinable.
- Discount cannot exceed eligible subtotal.
- Reward amount exactly Rp1.000.

### Integration tests

- Customer voucher apply against production-like DB.
- Order snapshot stores promo/code/discount.
- Duplicate idempotency key returns original order.
- Duplicate redemption does not create a second usage.
- Payment pending does not reward.
- Verified paid transition rewards once.
- Duplicate webhook rewards once.
- Wallet hold/capture/release remains distinct from reward credit.
- POS, finance, and customer read the same settled order totals.

### UI/E2E tests

- Guest checkout with no voucher.
- Customer applies valid voucher.
- Customer removes voucher.
- Invalid/expired voucher message.
- Promo picker shows eligible promos.
- Djiwa Pay insufficient balance.
- Bayar di Kasir order remains pending until cashier settles.
- After settlement, balance increases exactly Rp1.000.
- Customer description remains required.
- Sticky checkout CTA does not cover footer or content.
- Admin creates draft promo, activates it, sees it in customer app, then archives it.
- Admin sees expired promo as Berakhir, not active.

## Verification and Release Gates

### Source/build

- `git diff --check`.
- Build `apps/customer` directly and inspect checkout lazy chunk.
- Build `apps/admin` and inspect discount/marketing chunk.
- Build POS if shared contract changes.
- Run relevant unit/integration tests.
- Check no secrets/provider keys are included in Vite bundles.

### Production artifact

Follow each domain’s asset chain:

```text
index.html → entry bundle → lazy route chunk → referenced API/view
```

Verify:

- `/version.json` has expected commit/build.
- Customer checkout chunk contains voucher/apply/remove and Djiwa Pay reward markers.
- Admin discount chunk contains lifecycle/usage/performance markers.
- `sw.js` and entrypoint use no-cache behavior where configured.
- PWA update path is tested; stale service worker is considered.
- HTTP status and live asset availability are checked from canonical domains.

### Live data evidence

Before claiming success, read back:

```text
order.status
order.discount snapshot
financial transaction count
wallet hold/debit/reward ledger rows
promo redemption row
notification dedupe row/status
customer balance before/after
```

Use controlled test data or an approved sandbox/test order. Do not create a real charge without explicit approval.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Voucher accepted in browser but rejected by server | Server-side revalidation and final snapshot |
| Discount differs between customer and POS | One authoritative pricing contract |
| Duplicate reward from retry/webhook | Unique order-based reward reference |
| Old Yumi Poin trigger still awards points | Audit triggers/call paths before rollout; regression test |
| Expired promo remains visible/usable | Derived lifecycle filter + admin status |
| Promo stacks unexpectedly | Explicit stacking mode and conflict test |
| Reward credited before payment settlement | Grant only after verified `paid/completed` |
| Wallet reward mixed with payment debit | Separate ledger transaction types and references |
| PWA continues showing old checkout | Verify `version.json`, SW, hashed lazy chunk, and update prompt |
| Admin reports include pending/cancelled orders | Settled-status filter in read model |
| Margin becomes negative | HPP/margin preview and activation warning |
| Customer PII overexposed in marketing reports | Aggregate metrics; restrict detail access |
| Existing dirty monorepo files get committed | Selective staging only; never `git add -A` |
| Database migration breaks production | Additive/idempotent migration, staging test, rollback/read-back plan |

## Acceptance Criteria

- Customer can see and apply eligible voucher/promo in checkout.
- Invalid, expired, and ineligible voucher states are understandable.
- Final checkout total is server-authoritative and auditable.
- Admin can manage lifecycle, eligibility, usage limit, stacking, and performance.
- Expired promo is not usable and remains available for historical reporting.
- Every settled transaction grants exactly `Rp1.000` Djiwa Pay saldo once.
- No Yumi Poin appears in new customer checkout/reward UI.
- Djiwa Pay cannot be withdrawn, transferred, or converted to cash.
- POS, customer, finance, wallet ledger, and Telegram use consistent provenance.
- Duplicate requests/webhooks do not create duplicate order, redemption, financial transaction, or reward.
- Customer and admin production bundles are verified after deployment.

## Open Decisions Before Implementation

1. Apakah Happy Hour boleh digabung dengan voucher manual, atau selalu exclusive?
2. Apakah reward Rp1.000 disimpan di `site_settings.raw` agar dapat diubah admin, atau tetap sebagai server-side constant untuk phase 1?
3. Apakah benefit diberikan untuk transaksi Bayar di Kasir setelah kasir klik lunas, dan untuk QRIS hanya setelah webhook verified? (Rekomendasi: ya.)
4. Berapa batas maksimum nominal diskon Voucher Djiwa Pay 20% per transaksi? (Wajib ditetapkan sebelum aktivasi; plan tidak mengasumsikan tanpa batas.)
5. Apakah Voucher Djiwa Pay 20% berlaku untuk seluruh produk atau hanya produk/kategori tertentu?
6. Apakah Voucher Djiwa Pay 20% dapat digabung dengan Happy Hour atau harus exclusive?
7. Apakah reward Rp1.000 tetap diberikan ketika customer menggunakan Voucher Djiwa Pay 20%?
8. Apakah Voucher Djiwa Pay 20% berlaku untuk semua customer, atau hanya customer yang sudah login/member Djiwa Pay?
9. Apakah satu customer boleh memakai voucher yang sama berkali-kali, dan berapa batas total/per customer?
10. Apakah promo berlaku untuk guest, member, atau segment tertentu?
11. Apakah performance dashboard cukup agregat settled orders, atau membutuhkan detail redemption per customer untuk role marketing tertentu?
12. Apakah reward saldo Djiwa Pay perlu notifikasi customer in-app/Telegram setelah credit berhasil?

## Recommended First Implementation Boundary

Mulai dari tiga vertical slice yang dapat diverifikasi end-to-end:

```text
1. Voucher valid sederhana + snapshot order
2. Admin lifecycle expired/active + performance dasar
3. Reward Djiwa Pay Rp1.000 idempotent setelah paid/completed
```

Setelah tiga slice tersebut lolos, baru tambahkan audience, usage limit, stacking kompleks, dan campaign automation. Ini menjaga perubahan tetap kecil, dapat direview, dan tidak mencampur marketing dengan settlement payment secara berisiko.
