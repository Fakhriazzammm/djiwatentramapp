# Plan: Otomatis Pindah dari Tiket Pembayaran ke Struk Lunas

## Goal

Membuat alur pembayaran tunai di kasir lebih jelas:

- Customer menerima **Tiket Pembayaran**, bukan struk lunas.
- Tiket menampilkan status `BELUM LUNAS` dan instruksi membayar ke kasir.
- Setelah kasir mengonfirmasi order menjadi `paid` atau `completed`, halaman customer secara otomatis berpindah dari tampilan tiket ke tampilan **Struk Lunas**.
- Perpindahan terjadi pada halaman/route yang sama tanpa redirect URL, tetapi secara visual menggunakan dua state halaman yang berbeda.
- Animasi tiket pembayaran dan animasi struk lunas harus berbeda.
- Djiwa Pay dan QRIS tetap langsung menggunakan alur struk pembayaran digital; tidak ikut memakai tiket tunai.

## Current Context (hasil inspeksi)

Alur yang sudah ada:

1. Customer memilih `Bayar Tunai di Kasir`.
2. Customer checkout membuat order dengan:
   - `paymentMethod: "cash"`
   - `paymentChoice: "cashier"`
   - `paymentReceiptKind: "cashier_pending"`
   - `isOpenBill: true`
3. Customer tetap berada pada route order dan masuk ke `step: "receipt"`.
4. Receipt section sudah mengambil `currentOrder` berdasarkan `receipt.orderId`.
5. Receipt section sudah menentukan mode:
   - `paid` jika status order `paid` atau `completed`
   - selain itu tetap memakai mode receipt sebelumnya, termasuk `cashier_pending`
6. Saat status live berubah menjadi `paid`/`completed`, label existing sudah dapat berubah menjadi `LUNAS`, tetapi transisi visual khusus tiket → struk dan animasi berbeda belum dirancang sebagai state transition eksplisit.
7. Admin Orders sudah memiliki `useHybridUpdateOrderStatus` dan alur update status order ke `paid`/`completed`.
8. Laporan Admin menghitung pembayaran tunai dari order berstatus `paid` atau `completed` dengan `paymentMethod` `cash`/`tunai`.

## Scope boundary

### In scope

- Customer order receipt state untuk metode `cashier`.
- Distingsi UI antara tiket pembayaran dan struk lunas.
- Deteksi transisi status dari pending ke paid/completed.
- Animasi berbeda untuk tiket dan struk.
- Verifikasi bahwa status terbaru dibaca ulang dari sumber order yang live.
- QA alur cashier pending → paid.

### Out of scope

- Mengubah skema pembayaran atau status order.
- Mengubah nominal pajak/service charge.
- Menambah input uang diterima atau kembalian.
- Mengubah alur Djiwa Pay atau QRIS selain memastikan tidak terkena state tiket tunai.
- Mengubah proses konfirmasi kasir di Admin/POS.
- Redirect ke route baru atau membuat route receipt baru.

## Recommended approach

Gunakan **same-route state transition** dengan state presentation yang eksplisit:

```text
receipt + paymentChoice=cashier + order.status=pending/open
    → CashierPaymentTicketView

order.status changes to paid/completed
    → PaidReceiptView
```

Perubahan visual dilakukan setelah status order dari data live benar-benar `paid` atau `completed`. Jangan mengubah status berdasarkan timer, animasi selesai, atau asumsi customer.

### Mengapa tidak memakai redirect

- Nomor order dan context tidak hilang.
- Tidak ada loading ulang route.
- Customer melihat hubungan langsung antara tiket dan hasil pembayaran.
- Aman untuk guest karena receipt state dan `orderId` sudah tersedia di halaman yang sama.
- Dapat menggunakan animasi exit tiket lalu enter struk lunas.

## User flow

```text
Customer pilih menu
  → pilih Bayar Tunai di Kasir
  → review total tunai
  → tekan Buat Tiket Pembayaran
  → order dibuat cashier_pending/open bill
  → animasi Tiket Pembayaran
  → tampil BELUM LUNAS + nomor order + total
  → customer menunjukkan tiket ke kasir
  → kasir menerima uang
  → kasir update order menjadi paid/completed
  → customer page membaca status terbaru
  → animasi tiket keluar/fade
  → animasi struk lunas masuk
  → tampil LUNAS / Pembayaran Diterima
```

Untuk Djiwa Pay dan QRIS:

```text
Djiwa Pay berhasil settle
  → paid
  → PaidReceiptView langsung

QRIS invoice dibuat
  → tetap pending sampai webhook/verifikasi
  → setelah verified paid
  → PaidReceiptView
```

## UI/UX specification

### State A — Tiket Pembayaran Tunai

Copy utama:

```text
TIKET PEMBAYARAN
BELUM LUNAS
Bayar di Kasir
```

Isi minimum:

- Nomor order
- Total yang harus dibayar
- Metode: `Bayar Tunai di Kasir`
- Instruksi: `Tunjukkan tiket ini ke kasir untuk menyelesaikan pembayaran.`
- Status: `Menunggu pembayaran`
- Tombol salin nomor order jika pola existing mendukungnya
- CTA opsional: `Hubungi staff`

Visual:

- Amber/oranye lembut untuk status belum lunas.
- Tidak menggunakan ikon centang hijau.
- Tidak menggunakan label `Struk Lunas`.
- Nomor order dan total menjadi fokus utama.
- Surface tetap mobile-first, compact, dan aman di atas bottom bar.

Animasi tiket:

1. Container printer masuk dengan opacity/y transition.
2. Kertas tiket muncul dari bawah printer.
3. Isi tiket muncul setelah kertas selesai.
4. Status akhir tetap `BELUM LUNAS`.
5. Hormati `prefers-reduced-motion`.

### State B — Struk Lunas

Copy utama:

```text
STRUK LUNAS
PEMBAYARAN DITERIMA
```

Isi minimum:

- Nomor order yang sama.
- Total authoritative dari order.
- Metode: `Bayar Tunai di Kasir`.
- Status `LUNAS`.
- Detail menu dan customer tetap tersedia.
- Tombol existing seperti `Lihat struk`, `Pesan lagi`, atau `Kembali ke Home` dipertahankan jika sudah ada.

Visual:

- Biru/hijau sebagai status berhasil.
- Ikon centang atau receipt-success.
- Berbeda jelas dari amber ticket.
- Tidak mengklaim lunas sebelum status backend berubah.

Animasi struk:

1. Tiket lama exit dengan shrink/fade singkat.
2. Struk lunas masuk dengan slide/fade dari bawah.
3. Ikon centang memiliki satu pulse ringan, bukan loop terus-menerus.
4. Copy `Pembayaran diterima` muncul setelah status paid terdeteksi.
5. Jika reduced motion aktif, gunakan crossfade tanpa transform.

### Transition state

Saat status berubah:

```text
cashier_pending → paid/completed
```

Gunakan transition key/state agar React tidak hanya mengganti teks dalam card yang sama. Targetnya adalah perpindahan visual dari `CashierPaymentTicketView` ke `PaidReceiptView`.

Guard:

- `paid` dan `completed` sama-sama dianggap lunas.
- `pending`, `open`, `cashier_pending`, atau status lain tetap ticket.
- Jika query order sedang loading/undefined, jangan menampilkan `LUNAS`.
- Jika query error, pertahankan status terakhir yang aman dan tampilkan retry/indikator netral; jangan menganggap error sebagai paid.
- Jangan mengubah state paid berdasarkan timeout atau optimistic client action.

## Data flow

```text
Admin/POS cashier confirmation
  → update orders.status = paid/completed
  → Supabase/order read model
  → useHybridOrderById(receipt.orderId)
  → OrderPage currentOrder
  → receipt-section derives paid state
  → CashierPaymentTicketView / PaidReceiptView
```

Receipt financial values:

- Sebelum paid: gunakan total order yang tersimpan/preview yang telah dibuat.
- Setelah paid: gunakan total authoritative dari `currentOrder`, bukan menghitung ulang dari cart.
- Jangan membuat nominal kembalian atau uang diterima jika tidak ada field sumbernya.

## Database schema / read model

Tidak perlu migration baru untuk rencana ini.

### `orders`

Field yang relevan:

- `_id` — order identity.
- `status` — `pending`, `paid`, `completed`, atau `cancelled`.
- `paymentMethod` / `payment_method` — untuk tunai nilainya `cash`.
- `paymentChoice` — untuk customer tunai nilainya `cashier`.
- `paymentReceiptKind` — untuk tiket tunai `cashier_pending`.
- `isOpenBill` — true saat order menunggu penyelesaian tunai.
- `totalAmount` / `total_amount` — total authoritative.
- `orderNumber` — nomor order yang ditampilkan.
- `dailyReceiptNo` / `daily_receipt_no` — fallback sequence/receipt number.
- `items` — detail menu.
- `receiptMeta` — metadata promo/tax/payment snapshot jika tersedia.
- `createdAt` — waktu order.

### Read path

```text
useHybridOrderById(receipt.orderId)
  → source order read model / Supabase adapter
  → currentOrder
```

### Write path yang sudah ada

```text
Admin Orders
  → useHybridUpdateOrderStatus({ id, status: "paid" | "completed" })
```

Tidak mengubah endpoint atau status contract. Implementasi harus memanfaatkan read/write path existing.

## Files likely to change

### Primary

- `apps/customer/src/components/customer/receipt-section.tsx`
  - Pisahkan render ticket dan paid receipt.
  - Tambahkan state transition/animation key.
  - Pertahankan authoritative order data dan existing actions.

- `apps/customer/src/routes/$username/order.lazy.tsx`
  - Hanya bila diperlukan untuk meneruskan status transition key, payment choice, atau callback refresh.
  - Jangan mengubah checkout payload atau payment status contract.

### Existing animation/shared primitives to inspect and reuse

- `apps/customer/src/components/customer/receipt-printer-animation.tsx` atau file pemilik `ReceiptPrinterAnimation` jika lokasinya berbeda.
- `apps/customer/src/components/customer/shared-components.tsx` untuk receipt totals dan shared buttons.
- `apps/customer/src/components/customer/types.ts` untuk `ReceiptState`.
- `apps/customer/src/hooks/use-hybrid-pos-data.ts` untuk semantics `useHybridOrderById` dan refresh/realtime behavior.

### Verification-only references

- `apps/admin/src/routes/admin/orders.lazy.tsx`
- `apps/admin/src/hooks/use-hybrid-write-actions.ts`
- `apps/customer/src/components/customer/checkout-section.tsx`

Jangan mengubah file Admin dalam scope ini karena konfirmasi kasir sudah berada di luar permintaan.

## No-hardcode audit

### Harus tetap berasal dari order/backend

- Nomor order.
- Total pembayaran.
- Status paid/completed.
- Nama customer.
- Item dan quantity.
- Metode pembayaran.
- Timestamp/order reference.
- Tax/service-charge persisted values jika ditampilkan.

### Boleh menjadi copy UI statis

- `Tiket Pembayaran`.
- `Belum Lunas`.
- `Bayar di Kasir`.
- `Struk Lunas`.
- `Pembayaran Diterima`.
- Instruksi menampilkan tiket.

### Tidak boleh di-hardcode

- Nilai total.
- Status paid.
- Nomor order.
- Nilai kembalian.
- Nama kasir.
- Waktu konfirmasi.

## Testing and validation

### Unit/component states

- `cashier_pending` menampilkan Ticket View.
- `pending` tetap bukan paid.
- `paid` menampilkan Paid Receipt View.
- `completed` menampilkan Paid Receipt View.
- `cancelled` tidak menampilkan LUNAS.
- `currentOrder` undefined/loading tidak menampilkan LUNAS.
- Query error tidak memalsukan paid state.
- Djiwa Pay paid langsung tidak masuk Ticket View.
- QRIS pending tetap menunggu verifikasi, lalu paid receipt setelah verified.

### Transition tests

- Simulasikan perubahan `cashier_pending → paid`.
- Pastikan ticket exit dan receipt enter menggunakan animasi berbeda.
- Pastikan tidak terjadi redirect URL.
- Pastikan order ID dan order number tetap sama.
- Pastikan refresh/re-render tidak memutar animasi paid berulang-ulang tanpa status transition baru.
- Pastikan status `completed` langsung masuk paid receipt jika customer membuka ulang halaman.

### Build/runtime checks

```bash
cd /opt/djiwatentramapp
bun run --cwd apps/customer check-types
TMPDIR=/opt/djiwatentramapp/.tmp bun run --cwd apps/customer build
git diff --check
```

Inspect:

- Route chunk Customer memuat marker `Tiket Pembayaran`.
- Route chunk Customer memuat marker `Struk Lunas`.
- Route chunk memuat status guard `cashier_pending` dan `paid`/`completed`.
- Route chunk memuat animation markers untuk dua state.
- Production homepage/route HTTP 200 setelah deploy.

### Manual QA matrix

1. Cashier pending, kasir belum konfirmasi → ticket tetap terlihat.
2. Kasir konfirmasi `paid` → otomatis berubah ke paid receipt.
3. Kasir langsung set `completed` → paid receipt.
4. Refresh browser setelah paid → paid receipt, bukan ticket.
5. QRIS invoice belum dibayar → bukan ticket tunai dan bukan paid.
6. QRIS webhook verified → paid receipt.
7. Djiwa Pay settle berhasil → paid receipt.
8. Status cancelled/error → tidak mengklaim lunas.
9. Reduced motion → transisi tetap jelas tanpa gerakan berlebihan.
10. Mobile viewport sempit → tidak ada overlap dengan bottom navigation.

## Risks and mitigations

| Risiko | Mitigasi |
|---|---|
| UI mengklaim lunas sebelum kasir benar-benar membayar | Paid view hanya berdasarkan `currentOrder.status` paid/completed dari backend |
| Realtime/read model terlambat | Tampilkan ticket sampai status paid terbaca; sediakan refresh/retry jika pola existing mendukung |
| Animasi berulang pada setiap polling | Simpan transition key/status sebelumnya dan animasikan hanya saat crossing ke paid |
| Ticket terlihat seperti struk lunas | Gunakan nomenklatur, warna, dan CTA yang berbeda |
| Total client berbeda dari total tersimpan | Paid receipt membaca persisted authoritative total |
| QRIS ikut masuk state ticket | Gate ticket dengan `paymentChoice === "cashier"` atau `paymentReceiptKind === "cashier_pending"` |
| User menutup halaman sebelum paid | Order dapat dibuka kembali dari receipt/order reference; status paid tetap menentukan view |
| Bottom navigation menutupi receipt | Pertahankan safe-area dan z-index/layout existing pada receipt route |

## Acceptance criteria

- [ ] Metode tunai menghasilkan tampilan `Tiket Pembayaran` dengan label `BELUM LUNAS`.
- [ ] Tiket memiliki animasi printer/tiket sendiri.
- [ ] Setelah kasir mengubah status menjadi `paid` atau `completed`, customer otomatis melihat `Struk Lunas` tanpa refresh manual dan tanpa redirect URL.
- [ ] Perpindahan tiket → struk memakai animasi berbeda.
- [ ] Djiwa Pay dan QRIS tidak menampilkan tiket tunai.
- [ ] QRIS baru menampilkan paid setelah verifikasi pembayaran.
- [ ] Status error/loading/cancelled tidak pernah menampilkan `LUNAS` secara palsu.
- [ ] Nomor order dan total paid receipt berasal dari order live/authoritative.
- [ ] Build, typecheck, diff check, route bundle, dan HTTP production verification berhasil.
- [ ] Manual QA mencakup pending → paid, refresh-after-paid, Djiwa Pay, QRIS, cancelled, dan reduced-motion.

## Rollback

Rollback cukup dengan mengembalikan perubahan pada receipt presentation component. Tidak ada migration atau perubahan status/database contract. Order data historical tidak disentuh.
