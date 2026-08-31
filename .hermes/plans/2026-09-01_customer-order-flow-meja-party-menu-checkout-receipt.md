# Plan: Reorder Customer App Order Flow

## Goal

Mengubah flow pemesanan Customer App Djiwa App menjadi:

```text
Step 1 — Pilih Meja
Step 2 — Berapa Orang yang Memesan?
Step 3 — Pilih Menu
Step 4 — Checkout / Pembayaran
Step 5 — Selesai / Struk
```

Tulisan **Step 1**, **Step 2**, **Step 3**, **Step 4**, dan **Step 5** wajib terlihat jelas pada progress indicator dan/atau heading setiap tahap. Jangan hanya menampilkan nama tahap tanpa nomor.

## Current Context

Yang sudah ada:

- `partySize` sudah menjadi state dan UI awal pada order flow.
- `tableNumber` sudah ada di `useOrderContext`.
- Data meja saat ini juga dikumpulkan pada `daftar.lazy.tsx` dan dapat datang dari parameter URL `?table=`.
- Route order saat ini menggunakan search `step` dengan nilai `party`, `refill`, `menu`, `checkout`, `payment`, dan `receipt`.
- Checkout/payment dan receipt sudah memiliki lifecycle penting untuk QRIS, Djiwa Pay, dan Bayar Tunai di Kasir.
- Receipt harus tetap membaca status order authoritative/live; perubahan urutan step tidak boleh dianggap sebagai pembayaran.

Target perubahan ini adalah **mengubah urutan dan presentasi flow**, bukan mengubah business logic pembayaran atau membuat order lebih awal.

## Proposed Flow

### Step 1 — Pilih Meja

Customer memilih meja sebelum masuk ke jumlah orang.

Prioritas sumber meja:

1. QR meja/deep link dengan parameter `table`.
2. Daftar meja resmi dari konfigurasi/settings jika tersedia.
3. Input manual sebagai fallback.

UI harus memperlihatkan:

- heading: `Step 1 — Pilih meja`;
- meja yang sudah terdeteksi dari QR jika ada;
- pilihan meja yang tersedia;
- aksi lanjut yang disabled jika dine-in belum memiliki meja valid;
- opsi layanan non-dine-in jika flow takeaway memang didukung.

Jangan mengasumsikan meja kosong berarti takeaway secara otomatis.

### Step 2 — Berapa Orang yang Memesan?

Pindahkan UI party size yang sekarang menjadi tahap kedua.

UI harus memperlihatkan:

- heading: `Step 2 — Berapa orang yang memesan?`;
- pilihan 1–8 dan 9+;
- nilai terpilih;
- tombol dengan copy seperti `Lanjut dengan 1 orang`.

Step ini tidak boleh membuat order atau mengubah cart.

### Step 3 — Pilih Menu

Menu katalog existing tetap dipakai.

UI harus memperlihatkan:

- heading atau progress label: `Step 3 — Pilih menu`;
- kategori, pencarian, scanner/menu number, product sheet, promo, cart, dan upsell existing;
- cart mutation tetap melalui flow yang sudah ada;
- customer belum membuat order database pada tahap ini.

### Step 4 — Checkout / Pembayaran

Gabungkan presentasi checkout dan payment sebagai satu tahap visual bernomor:

```text
Step 4 — Checkout / Pembayaran
```

Payment state internal boleh tetap memakai `checkout` dan `payment` untuk menjaga kompatibilitas logic, tetapi progress UI tidak boleh menampilkan angka tambahan yang membingungkan.

Pertahankan seluruh aturan existing:

- QRIS Mayar memakai `gateway_pending` sampai webhook/provider verification.
- Djiwa Pay memakai settlement wallet authoritative.
- Bayar Tunai di Kasir memakai `cashier_pending` dan provenance `Djiwa App - Bayar Tunai di Kasir`.
- Submit imperatively locked/idempotent.
- Tidak ada order/payment sebelum checkout dikonfirmasi.

### Step 5 — Selesai / Struk

UI receipt harus memperlihatkan:

```text
Step 5 — Selesai / Struk
```

Pertahankan:

- nomor order;
- customer name dan customer description/ciri;
- meja dan tipe layanan;
- item, subtotal, diskon, pajak, service charge, total;
- barcode transaksi Code 128;
- status live order;
- CTA pembayaran hanya bila lifecycle memang masih pending;
- barcode tidak melakukan settlement.

## State Machine

```text
new order
  → Step 1: table
  → Step 2: party
  → Step 3: menu
  → Step 4a: checkout
  → Step 4b: payment
  → Step 5: receipt
```

Rules:

- Dine-in: `tableNumber` wajib sebelum lanjut dari Step 1.
- Party size wajib sebelum lanjut dari Step 2.
- Cart tidak boleh kosong sebelum checkout.
- Receipt hanya muncul setelah order berhasil dibuat.
- Refresh pada route harus mempertahankan step dan state yang aman.
- Back navigation tidak boleh menghapus meja atau cart secara tidak sengaja.
- `startNewOrder` harus membersihkan state order lama sesuai aturan existing.

## URL and Routing

Update search schema pada:

```text
apps/customer/src/routes/$username/order.tsx
```

Rencana route state:

```text
/$username/order?step=table
/$username/order?step=party
/$username/order?step=menu
/$username/order?step=checkout
/$username/order?step=payment
/$username/order?step=receipt&orderId=<id>
```

`payment` tetap dapat menjadi internal substep dari Step 4. `receipt` tetap menjadi Step 5.

Pastikan:

- navigasi dari Home/Pesan membuka `step=table` untuk order baru;
- navigasi Riwayat → Lihat Struk tetap langsung ke `step=receipt`;
- route tree TanStack di-regenerate setelah perubahan route schema;
- parent `/$username` tetap meneruskan child route ke `<Outlet />` dan tidak bounce ke home.

## Files Likely to Change

### Primary

```text
apps/customer/src/hooks/use-order-context.tsx
apps/customer/src/routes/$username/order.tsx
apps/customer/src/routes/$username/order.lazy.tsx
apps/customer/src/components/customer/shared-components.tsx
```

### Table and guest entry

```text
apps/customer/src/routes/daftar.lazy.tsx
apps/customer/src/routes/index.tsx
apps/customer/src/routes/$username/route.lazy.tsx
```

### Existing components to audit, not necessarily modify

```text
apps/customer/src/components/customer/checkout-section.tsx
apps/customer/src/components/customer/receipt-section.tsx
apps/customer/src/components/customer/menu-section.tsx
apps/customer/src/components/customer/types.ts
apps/customer/src/hooks/use-hybrid-write-actions.ts
```

### Generated

```text
apps/customer/src/routeTree.gen.ts
apps/customer/public/version.json
apps/customer/src/lib/version.ts
scripts/BUILD_NUMBER
```

Generated files hanya diubah/di-commit jika memang dihasilkan oleh build release dan hanya untuk app yang terkena dampak.

## Database Schema and Data Contract

Tidak merencanakan migration database pada fase pertama sebelum schema live diverifikasi.

Data order yang harus tetap kompatibel:

```text
pos.orders
├── _id / id
├── order_number
├── source
├── order_type
├── table_number / tableNumber
├── party_size / partySize
├── customer_name / customerName
├── customer_description / customerDescription
├── notes
├── payment_method / paymentMethod
├── payment_receipt_kind / paymentReceiptKind
├── status
├── total_amount / totalAmount
└── created_at / createdAt
```

Read/write audit wajib memastikan:

- `tableNumber` dan `partySize` dikirim ke order creation yang sama seperti sebelumnya;
- tidak menyimpan meja/party hanya di localStorage tanpa masuk payload order;
- mixed camelCase/snake_case tetap dinormalisasi;
- order existing yang tidak memiliki meja/party tetap dapat dibaca dan tidak dimutasi;
- REST/view mapping tidak perlu diubah jika field existing sudah tersedia.

## Table Source Decision

Sebelum implementasi, verifikasi apakah settings/backend sudah memiliki katalog meja resmi.

### Option A — QR meja + parameter URL (recommended)

Pros:

- paling cepat untuk customer;
- mengurangi salah input;
- cocok dengan alur dine-in;
- tidak membutuhkan customer mencari meja secara manual.

Risiko:

- QR dapat dibuka atau diedit dari device lain;
- perlu fallback jika QR rusak atau tidak ada.

### Option B — Daftar meja dari settings

Pros:

- pilihan lebih terkontrol;
- nama meja dapat mengikuti konfigurasi admin.

Risiko:

- membutuhkan source konfigurasi meja yang jelas;
- daftar stale dapat menyebabkan meja valid tidak tampil.

### Option C — Input manual saja

Pros:

- perubahan paling kecil.

Risiko:

- salah ketik;
- data meja tidak konsisten;
- UX lebih buruk.

Rekomendasi: implementasikan QR/deep-link sebagai jalur utama setelah source settings diverifikasi, lalu sediakan daftar/input manual sebagai fallback.

## UI/UX Specification

Progress indicator harus selalu menunjukkan lima label bernomor:

```text
Step 1
Pilih Meja

Step 2
Jumlah Orang

Step 3
Menu

Step 4
Checkout / Pembayaran

Step 5
Selesai / Struk
```

Aturan UI:

- mobile-first, touch target minimal sekitar 44px;
- active step memakai warna primary dan kontras yang jelas;
- completed step dapat diketuk kembali jika state masih valid;
- step berikutnya tidak aktif sebelum prasyarat terpenuhi;
- tombol utama sticky di area thumb-zone;
- tidak ada bottom navigation yang menutupi CTA atau checkout sheet;
- heading step tetap terlihat saat customer scroll.

States yang wajib:

- loading: konfigurasi/meja sedang dimuat;
- empty: tidak ada meja terkonfigurasi, tampilkan input manual/fallback yang jelas;
- error: gagal memuat meja, tampilkan retry tanpa menghapus state yang sudah dipilih;
- selected: meja/party size aktif terlihat jelas;
- invalid: alasan tombol lanjut disabled dijelaskan;
- saving/submitting: hanya terjadi pada checkout, bukan Step 1–3;
- success: Step 5 menampilkan receipt dari live order.

## Multi-Source Data Flow

```text
QR meja / URL table
       ↓
OrderContext.tableNumber
       ↓
Step 1 validation
       ↓
partySize pada Step 2
       ↓
cart/menu pada Step 3
       ↓
checkout payload pada Step 4
       ↓
pos.orders + pos.order_items
       ↓
live order read-back
       ↓
Step 5 receipt + barcode
```

Guest flow:

```text
/daftar
  → identitas guest tersimpan di guest-data
  → table dari QR/Step 1 disinkronkan ke OrderContext
  → order flow
```

Member flow:

```text
session customer
  → customer identity autofill
  → table/party dari current order context
  → checkout
```

Riwayat flow:

```text
Riwayat Pesanan
  → Lihat Struk
  → /$username/order?step=receipt&orderId=<id>
  → useHybridOrderById
  → receipt live
```

## Integration Points

### Payment

Tidak ada perubahan provider/payment contract. Hanya visual step grouping yang berubah.

### POS scanner

Tidak ada perubahan barcode identifier. Barcode tetap memakai canonical order reference dan POS tetap mencari order Customer App berdasarkan identifier yang sama.

### Telegram/notification

Tidak ada perubahan notification source atau provenance. Order Customer App cash tetap dapat masuk ke notifikasi operasional sesuai aturan existing dan belum settled sebelum konfirmasi kasir.

### AI/purchasing agent

Tidak ada integrasi AI atau purchasing agent yang diperlukan untuk perubahan ini. Pastikan payload order dan item tidak berubah agar downstream agent tidak kehilangan data.

## Implementation Order

1. Audit schema/view payload meja dan party size secara read-only.
2. Audit semua call-site `setStep`, URL search schema, dan progress indicator.
3. Tentukan sumber meja resmi dan fallback.
4. Tambahkan state/route contract `table` tanpa mengubah payment logic.
5. Pindahkan UI meja ke **Step 1**.
6. Pindahkan party selector ke **Step 2**.
7. Label menu sebagai **Step 3**.
8. Gabungkan presentasi checkout/payment sebagai **Step 4**.
9. Label receipt sebagai **Step 5**.
10. Update Home/Pesan/Daftar/deep-link navigation.
11. Regenerate route tree.
12. Jalankan typecheck dan build Customer.
13. Verifikasi bundle route order, checkout, dan receipt.
14. Uji browser pada viewport mobile.
15. Commit source terlebih dahulu, lalu release metadata terpisah jika diperlukan.

## Acceptance Criteria

- [ ] Customer melihat tulisan `Step 1` dan label `Pilih Meja`.
- [ ] Customer melihat tulisan `Step 2` dan label jumlah orang.
- [ ] Customer melihat tulisan `Step 3` dan label Menu.
- [ ] Customer melihat tulisan `Step 4` dan label Checkout/Pembayaran.
- [ ] Customer melihat tulisan `Step 5` dan label Selesai/Struk.
- [ ] Dine-in tidak dapat melewati Step 1 tanpa meja valid.
- [ ] Step 2 tetap mempertahankan pilihan party size 1–8 dan 9+.
- [ ] Step 3 tidak membuat order database.
- [ ] Checkout/payment payload tetap sama secara business logic.
- [ ] QRIS, Djiwa Pay, dan cash cashier lifecycle tidak berubah.
- [ ] Receipt tetap memakai live order status dan barcode transaksi.
- [ ] Riwayat → Lihat Struk tetap membuka order yang benar.
- [ ] Order lama tanpa meja/party tidak rusak.
- [ ] Guest dan member flow sama-sama teruji.
- [ ] Browser back/refresh tidak menghilangkan meja atau cart secara tidak sengaja.
- [ ] Customer typecheck berhasil.
- [ ] Customer build berhasil.
- [ ] Tidak ada order/payment production yang dibuat saat QA.
- [ ] Bundle deployed memuat kelima label Step 1–5.

## Risks and Mitigations

| Risiko | Mitigasi |
|---|---|
| Meja hilang saat navigasi dari `/daftar` | Sinkronkan URL `table`, localStorage guest-data, dan OrderContext |
| Takeaway dipaksa memilih meja | Pisahkan service type; meja wajib hanya untuk dine-in |
| Payment logic ikut berubah saat step dipindah | Pertahankan internal `checkout`/`payment`, ubah hanya presentation grouping |
| Route langsung bounce ke home | Pertahankan kontrak parent `/$username` dan `<Outlet />` sibling |
| Route tree stale | Regenerate dan verifikasi route tree setelah perubahan |
| Order lama tidak punya metadata baru | Render fallback kosong; jangan backfill/mutasi production |
| PWA menyajikan bundle lama | Verifikasi `version.json`, hashed chunks, hard refresh/incognito |
| Customer salah memilih meja | Prioritaskan QR meja dan tampilkan konfirmasi meja sebelum lanjut |

## Verification Evidence Required

```text
🖼️ Preview Efek:
- Screenshot mobile Step 1 sampai Step 5 dengan nomor terlihat
- Browser URL pada setiap step
- Console tanpa error baru
- Customer build output
- Deployed order chunk berisi label Step 1–5
```

Tidak ada implementasi atau perubahan database pada tahap pembuatan plan ini.
