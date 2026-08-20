# Plan: Upgrade End-to-End Checkout Order Mie Yamin Menjadi Marketplace-Style

## Status

- **Mode:** Implemented
- **Implementasi:** UI/UX checkout dan tracking selesai di source; build tervalidasi
- **Target:** `apps/ordermieyamin`
- **Route:** `/` dengan `stage=order`
- **Referensi visual:** screenshot marketplace yang diberikan user

## 1. Tujuan

Meng-upgrade seluruh pengalaman checkout Order Mie Yamin agar terasa seperti marketplace yang familiar, mudah dipahami, dan mobile-friendly—bukan hanya Langkah 1. Upgrade mencakup pemilihan produk, pengiriman, data penerima, review, pembayaran, recovery, dan tracking, tanpa mengubah input, sistem, payment flow, database, atau aturan bisnis yang sedang berjalan.

Prinsip utama:

1. **Marketplace-like presentation, bukan marketplace system baru.**
2. **Semua input existing dipertahankan.**
3. **Satu order utama tetap satu order.** Tidak menambahkan multi-product cart.
4. **Checkout existing tiga langkah tetap dipakai, tetapi semua langkah di-upgrade secara visual dan UX.**
5. **Review, payment recovery, dan tracking ikut dirapikan karena merupakan bagian dari pengalaman checkout.**
6. **Harga dan aturan bisnis tetap berasal dari settings/database.**
7. **Perubahan fokus pada hierarchy, grouping, copywriting, feedback, dan interaction.**

## 2. Kondisi Existing yang Harus Dipertahankan

File utama saat ini:

- `apps/ordermieyamin/src/routes/index.lazy.tsx`

State/input existing yang wajib tetap berfungsi:

| Input / State | Fungsi bisnis | Keputusan |
|---|---|---|
| `kg` | Jumlah Mie Yamin Mentah | Tetap, minimum order tetap berlaku |
| `readyPackCount` | Jumlah Mie Yamin Kemasan Siap Masak | Aktif hanya jika pilihan produk = kemasan |
| `repack` | Layanan repack 100 gram | Tetap, ditampilkan sebagai service add-on |
| `deliveryProvider` | Gojek/Maxim | Tetap di Langkah 2 |
| `deliveryDate` | Tanggal pengiriman | Tetap di Langkah 2 |
| `name` | Nama penerima | Tetap di Langkah 3 |
| `phone` | WhatsApp penerima | Tetap di Langkah 3 |
| `address` | Alamat pengiriman | Tetap di Langkah 3 |
| `notes` | Catatan pengiriman | Tetap di Langkah 3 |
| `email` | Bukti pembayaran opsional | Tetap di Langkah 3 |

Business logic yang tidak boleh berubah:

- `minimumOrderKg`
- `noodlePricePerKg`
- `readyPackPrice`
- `repackFeePer100g`
- `freeShippingPromo`
- `shippingFee`
- `orderCutoffHour`
- `maxOrdersPerDate`
- `businessUnit = ordermieyamin`
- `brandSlug = mie-yamin`
- `source = ordermieyamin_b2b`
- Mayar invoice creation
- Pending payment recovery
- Retry invoice memakai order yang sama
- Tracking order
- Settlement/webhook
- Order dan financial integrity

## 3. Reference → Existing Feature Mapping

| Elemen referensi marketplace | Adaptasi ke Mie Yamin | Tidak dilakukan |
|---|---|---|
| Product hero/image | Card produk utama Mie Yamin | Tidak menambah katalog baru |
| Harga dan promo | Harga per kg dari site settings | Tidak hardcode harga |
| Quantity selector | Stepper jumlah kg | Tidak menghapus input quantity |
| Product card kedua | Mie Yamin Kemasan Siap Masak | Tidak mengubah cara perhitungan |
| Service/variant option | Toggle repack 100 gram | Tidak mengubah formula repack |
| Add to cart | `Lanjutkan ke pengiriman` / `Review pesanan` | Tidak membuat multi-item cart |
| Sticky purchase bar | Ringkasan total + CTA di mobile | Tidak melewati langkah checkout |
| Product benefit/info | Benefit produksi dan aturan order | Tidak membuat klaim bisnis baru tanpa sumber |

## 4. Proposed UI/UX Structure

### 4.1 Header langkah

Tetap tampilkan progress:

```text
Langkah 1 dari 3
Pilih produk
```

Tambahkan copy yang lebih marketplace-friendly:

```text
Atur pesanan Mie Yamin sesuai kebutuhan Anda.
```

Progress bar dan navigasi antar langkah tetap menggunakan `checkoutStep` existing.

### 4.2 Product hero card

Buat satu card utama dengan hierarchy:

```text
[Product image]
Djiwa Tentram B2B
Mie Yamin Mentah
Produksi sendiri tanpa bahan pengawet.
Rp... / kg
```

Sumber data:

- Image: `mieYaminSettings.productImageUrl`
- Product name: existing product name
- Description: existing copy atau copy yang sudah disetujui
- Harga: `mieYaminSettings.noodlePricePerKg`
- Harga normal/promo: tetap mengikuti data existing jika tersedia

Visual target:

- Mobile-first
- Card radius mengikuti design system existing
- Harga primary dan mudah discan
- Tidak menambah field baru

### 4.3 Quantity section

Tampilkan sebagai kontrol belanja:

```text
Jumlah mie
Minimum 1 kg

[ − ]   1 kg   [ + ]
```

Aturan:

- Tombol minus tidak boleh melewati `minOrderKg`.
- Tombol plus tetap menambah `kg` seperti behavior sekarang.
- Jika input manual tetap diperlukan, sediakan input numerik yang aksesibel atau tidak hilang dari DOM secara tidak aman.
- Total produk langsung berubah ketika quantity berubah.

### 4.4 Produk kedua: Mie Yamin Kemasan Siap Masak

Tampilkan sebagai card opsional terpisah:

```text
Kemasan siap masak
Praktis untuk langsung dimasak
Rp... / pcs

[ − ]   0 pcs   [ + ]
```

Input/state existing tetap memakai `readyPackCount` sebagai quantity saat pilihan produk = kemasan.

Aturan:

- Nilai minimum tetap 0.
- Total kemasan = `readyPackCount * readyPackPrice`, dan hanya dihitung saat kemasan dipilih.
- Jangan mengubah payload order.
- Jangan mengubah item name/variant yang dikirim ke backend.

### 4.5 Service add-on: Repack

Tampilkan sebagai service, bukan produk utama:

```text
Layanan tambahan
[ ] Repack dari mie kiloan
Rp... / 100 gram
1 kg = 10 pcs
```

Saat dipilih, tampilkan informasi hasil kalkulasi:

```text
Jumlah repack: 10 pcs
Biaya layanan: Rp...
```

Aturan existing:

```text
repackCount = kg * 10
repackTotal = repackCount * repackFeePer100g
```

Tidak boleh mengubah nilai `repack`, `repackCount`, ataupun item payload.

### 4.6 Benefit dan informasi order

Tampilkan compact benefit block, misalnya:

```text
✓ Produksi sendiri
✓ Tanpa bahan pengawet
✓ Minimum order ... kg
✓ Status order dapat dipantau live
```

Hanya gunakan klaim yang sudah benar-benar berlaku di sistem. Jangan menampilkan benefit yang tidak dapat diverifikasi.

### 4.7 Total dan CTA

Desktop:

```text
Total sementara: Rp...
[Lanjutkan ke pengiriman]
```

Mobile:

```text
┌────────────────────────────┐
│ Total pesanan              │
│ Rp...          [Lanjutkan] │
└────────────────────────────┘
```

Rules:

- Total mengambil formula existing: mie + kemasan + repack + ongkir.
- CTA tetap menuju `checkoutStep=2`.
- CTA tidak membuat order.
- Order baru dibuat hanya pada `confirmSubmit()` setelah review.
- Bottom bar tidak tampil ketika review/payment recovery membutuhkan fokus berbeda.

## 5. Upgrade Flow End-to-End

### 5.1 Langkah 1 — Pilih produk

Target UX: terasa seperti product detail marketplace.

Struktur:

```text
Progress: 1 dari 3

[Hero product card]
Mie Yamin Mentah
Foto, deskripsi, harga per kg

[Quantity]
Jumlah mie
[−] 1 kg [+]

[Produk 2]
Mie Yamin Kemasan Siap Masak
[−] 0 pcs [+]

[Service]
☐ Repack dari mie kiloan

[Benefit/info]
Aturan minimum, promo, informasi produksi

[Sticky summary]
Total sementara       [Lanjutkan]
```

Tetap menggunakan state `productType`, `kg`, `readyPackCount`, dan `repack`. Hanya satu produk yang dikirim dalam satu order; `repack` hanya tersedia untuk mie mentah kiloan.

### 5.2 Langkah 2 — Atur pengiriman

Target UX: terasa seperti memilih metode dan jadwal pengiriman di marketplace.

Struktur:

```text
Progress: 2 dari 3

Atur pengiriman
Pilih area dan jadwal yang tersedia.

[Kurir]
┌─────────────┐ ┌─────────────┐
│ Gojek       │ │ Maxim       │
│ Ongkir ...  │ │ Ongkir ...  │
└─────────────┘ └─────────────┘

[Tanggal pengiriman]
Besok / Lusa / Pilih tanggal lain

[Ringkasan mini]
1 kg mie · Gojek · Besok

[Kembali]                 [Lanjutkan]
```

Upgrade yang direncanakan:

- Kurir tampil sebagai selection card, bukan sekadar pilihan teknis.
- Provider disabled diberi alasan yang jelas.
- Kalender tetap memakai data availability dan `maxOrdersPerDate` existing.
- Promo gratis ongkir tetap tampil sebagai benefit jika aktif.
- Tanggal terpilih selalu terlihat jelas di ringkasan.
- Tidak mengubah `deliveryProvider` atau `deliveryDate` payload.

### 5.3 Langkah 3 — Data penerima

Target UX: terasa seperti address/contact form marketplace, tetapi tetap singkat dan tidak menakutkan.

Struktur:

```text
Progress: 3 dari 3

Data penerima
Digunakan kurir untuk mengantar pesanan.

[ Nama penerima ]
[ WhatsApp      ]
[ Alamat lengkap             ]
[ Catatan pengiriman         ]
[ Email opsional             ]

[Order summary]
Produk · Pengiriman · Total

[Sebelumnya]              [Review pesanan]
```

Upgrade yang direncanakan:

- Grouping field berdasarkan kebutuhan kurir.
- Label dan helper text dibuat lebih jelas.
- Error per field tetap menggunakan validation existing/toast sesuai pola saat ini.
- WhatsApp admin tidak muncul pada form normal.
- WhatsApp admin hanya muncul pada kartu error checkout/payment.
- Semua input tetap dipertahankan: nama, WhatsApp, alamat, catatan, email.

### 5.4 Review pesanan

Target UX: menjadi halaman konfirmasi seperti marketplace sebelum side effect terjadi.

Struktur:

```text
Review pesanan

Produk
Mie Yamin Mentah · 1 kg
Kemasan · 0 pcs
Repack · Tidak dipilih

Pengiriman
Gojek · Besok

Penerima
Nama · WhatsApp
Alamat

Total
Rp...

[Kembali edit]          [Konfirmasi & bayar]
```

Rules:

- Review harus membaca state yang sama dengan payload `createOrder`.
- Tidak boleh ada perbedaan antara review dan order payload.
- `Konfirmasi & bayar` baru menjalankan `confirmSubmit()`.
- Double click tetap dicegah oleh `checkoutLockRef`.
- Jika gagal, review tidak kehilangan data input.

### 5.5 Payment preparation dan redirect

Target UX: customer memahami apa yang sedang terjadi setelah menekan bayar.

State yang perlu dirapikan:

```text
Menyiapkan pesanan...
Menyiapkan invoice pembayaran...
Membuka halaman pembayaran...
```

Rules existing yang dipertahankan:

- Order dibuat satu kali.
- Invoice memakai `extraData.orderId`.
- Metadata payment gateway boleh gagal sync tanpa menahan redirect jika invoice sudah valid.
- Redirect ke link Mayar tetap dilakukan.
- Tidak membuat invoice duplikat ketika pending reference masih valid.

### 5.6 Payment failure dan recovery

Target UX: customer selalu tahu apakah order sudah dibuat atau belum.

#### Gagal sebelum order dibuat

```text
Checkout belum berhasil
Pesan error aman yang relevan.

[Coba lagi]
[Chat WhatsApp admin]
```

#### Order sudah dibuat, invoice gagal

```text
Order sudah tersimpan
Invoice belum berhasil dibuat.

[Coba buat pembayaran lagi]
[Chat WhatsApp admin]
```

Rules:

- Retry wajib memakai `pendingPaymentOrderId` yang sama.
- Tidak membuat order baru.
- WhatsApp hanya muncul sebagai fallback setelah error.
- Error validasi input biasa tetap tidak memunculkan WhatsApp.

### 5.7 Tracking order

Target UX: terasa seperti halaman order tracking marketplace, dengan **visual peta journey** di bagian atas.

#### Visual peta yang direncanakan

Peta pada tahap ini adalah **map journey visual**, bukan GPS kurir live:

```text
┌──────────────────────────────┐
│       [Visual peta]          │
│                              │
│   🏭 Produksi        📍       │
│          ────────             │
│              ─────→ Tujuan   │
│                              │
│   Pesanan sedang diproses    │
└──────────────────────────────┘
```

Visual map mengikuti status existing:

| Status | Visual journey |
|---|---|
| `pending_payment` | Fokus di titik pembayaran, map belum aktif |
| `paid` | Titik produksi aktif |
| `preparing` | Jalur produksi aktif |
| `packing` | Titik packing aktif |
| `ready_to_ship` | Titik pengiriman aktif |
| `out_for_delivery` | Animasi perjalanan menuju titik tujuan |
| `delivered` | Titik tujuan selesai/terkonfirmasi |

Map dapat menampilkan data yang memang tersedia:

```text
Area pengiriman
Tanggal pengiriman
Provider pengiriman
Alamat tujuan sebagai teks
Status order
Waktu refresh terakhir dari UI
```

Map tidak boleh mengklaim data yang belum tersedia:

```text
Tidak menampilkan posisi GPS kurir
Tidak menampilkan ETA menit-ke-menit
Tidak menampilkan route jalan aktual
Tidak menampilkan driver location
```

Sistem realtime tetap menggunakan mekanisme existing:

```text
useHybridOrderById(orderId)
→ polling setiap 4 detik
→ pause ketika tab hidden
→ refresh saat tab kembali aktif
→ update status, timeline, dan visual map
```

Label yang digunakan harus jujur:

```text
Status diperbarui otomatis
```

Bukan:

```text
Kurir berada 2 menit dari lokasi Anda
```

#### Struktur tracking

```text
← Track Order

[Map journey card]
🏭 Produksi Mie Yamin ─────→ 📍 Tujuan

Sedang dibuat
Mie Yamin sedang diproduksi.
Status diperbarui otomatis.

Tanggal pengiriman
21 Agustus 2026

Order
ORD...

[Timeline status]
✓ Pesanan dibuat
✓ Pembayaran diterima
● Sedang dibuat
○ Sedang dipacking
○ Siap dikirim
○ Sedang dikirim
○ Selesai
```

Upgrade yang direncanakan:

- Status aktif lebih dominan.
- Timeline dibuat mudah dipindai.
- Visual map berubah berdasarkan status aktif.
- Status payment tidak tertutup oleh status delivery.
- Invoice yang masih valid tetap bisa dibuka kembali.
- Tombol WhatsApp tidak ditampilkan pada tracking normal/success.
- Jika tracking mengalami error kritis, tampilkan support fallback dengan konteks order.

#### Scope peta

Termasuk dalam plan:

- UI map journey statis/animatif berbasis status existing.
- Marker produksi dan tujuan sebagai visual UI.
- Jalur visual yang berubah sesuai tahap order.
- Responsive mobile-first.
- Reduced-motion support.

Tidak termasuk dalam plan tahap ini:

- Google Maps/Mapbox integration.
- Geocoding alamat menjadi koordinat.
- GPS customer atau driver.
- ETA provider.
- Live route jalan aktual.
- Tracking API Gojek/Maxim.
- Database location event baru.

Peta nyata/GPS dapat menjadi fase terpisah jika provider delivery menyediakan tracking ID dan location API resmi.

### 5.8 Riwayat pesanan

`MyOrders` tetap dipertahankan, tetapi dapat dirapikan agar lebih marketplace-like:

- Card order menampilkan nomor order, status, total, dan tanggal.
- CTA `Tracking` tetap tersedia.
- CTA `Pesan lagi` tetap menggunakan draft reorder existing.
- Tidak mengubah localStorage registry atau format order reference.

## 6. State UX yang Wajib Ditangani

### Loading

Saat site settings belum tersedia:

- Tetap gunakan skeleton existing.
- Jangan menampilkan harga default seolah-olah sudah final.
- Jangan mengizinkan checkout sebelum settings tervalidasi.

### Empty / default

- `readyPackCount` wajib minimal 1 saat produk kemasan dipilih; tidak relevan saat mie kiloan dipilih.
- `repack = false` tetap valid.
- Produk utama default mengikuti minimum order existing.

### Validation

Error input yang dapat diperbaiki customer tetap menggunakan toast:

- Minimum order belum terpenuhi.
- Kurir belum dipilih.
- Tanggal belum dipilih.
- Nama/WhatsApp/alamat belum lengkap.
- Nomor WhatsApp tidak valid.
- Email tidak valid.

WhatsApp admin tidak ditampilkan untuk kesalahan input biasa.

### Checkout/payment error

Kartu error tetap muncul hanya setelah `confirmSubmit()` atau `retryPayment()` gagal:

```text
Checkout belum berhasil
[Pesan error yang aman]
[Chat WhatsApp admin]
```

Jika order sudah berhasil dibuat tetapi invoice gagal:

- Tetap tampilkan retry invoice.
- Tetap gunakan order ID yang sama.
- WhatsApp menjadi fallback support.
- Jangan membuat order kedua.

### Success

Tidak menampilkan WhatsApp admin pada success/tracking normal. Customer diarahkan ke payment/tracking sesuai flow existing.

## 7. Data Flow dan Integration Points

```text
site settings
  → mieYaminSettings
  → product price, image, min order, shipping/promo config

Langkah 1 state
  → kg, readyPackCount, repack
  → total calculation
  → review summary

Langkah 2 state
  → deliveryProvider, deliveryDate

Langkah 3 state
  → name, phone, address, notes, email

review
  → confirmSubmit()
  → useHybridCreateOrder()
  → ordermieyamin_b2b order
  → useHybridMayarCreateInvoice()
  → attach invoice metadata
  → redirect payment
  → webhook/reconciliation
  → tracking
```

Tidak ada perubahan yang direncanakan pada:

- Supabase schema
- Supabase views
- Edge Function
- Mayar webhook
- Telegram notification
- Admin/POS routing
- Financial transaction

## 8. Database Schema / REST Impact

### Expected existing tables/views

Plan ini tidak membutuhkan perubahan schema.

Order write tetap memakai abstraksi existing `useHybridCreateOrder`, dengan metadata bisnis:

```text
businessUnit = ordermieyamin
brandSlug = mie-yamin
source = ordermieyamin_b2b
paymentMethod = djiwaapp
orderType = delivery
```

Payment update tetap memakai:

```text
useHybridUpdateOrderPaymentGateway
paymentReceiptKind = gateway_pending
```

Invoice creation tetap melalui:

```text
useHybridMayarCreateInvoice
```

### Schema safety

- Tidak membuat migration baru.
- Tidak mengubah kolom.
- Tidak mengubah view.
- Tidak mengubah RLS.
- Tidak mengubah endpoint.

## 9. No-Hardcode Audit

Nilai yang harus tetap berasal dari settings/database:

- Harga mie per kg
- Harga kemasan
- Biaya repack
- Minimum order
- Ongkir
- Provider aktif
- Cutoff hour
- Batas order per tanggal
- Image produk jika sudah dikonfigurasi
- Nomor WhatsApp support

Hardcode yang boleh dipertahankan hanya:

- Label UI
- Copy instruksi generik
- Fallback visual ketika record settings belum tersedia

Harga dan aturan bisnis tidak boleh dimasukkan ke JSX secara permanen.

## 10. Files Likely to Change Saat Implementasi

File utama:

- `apps/ordermieyamin/src/routes/index.lazy.tsx`

Kemungkinan file tambahan, hanya jika pola existing memang membutuhkan:

- `apps/ordermieyamin/src/components/...` untuk memecah ProductCard/AddOnCard/StickySummary
- `apps/ordermieyamin/src/index.css` hanya jika token/layout existing tidak mencukupi

Tidak direncanakan berubah:

- `apps/ordermieyamin/src/hooks/use-hybrid-write-actions.ts`
- `apps/ordermieyamin/src/hooks/use-hybrid-ops-data.ts`
- Supabase migrations
- Edge Functions
- Apps lain

## 11. Implementation Order Setelah Plan Disetujui

1. Audit penuh JSX checkout, Tracking, dan MyOrders; petakan semua state/handler yang dipakai.
2. Tetapkan shared visual language untuk progress, cards, spacing, CTA, status, dan error surfaces.
3. Refactor visual sections tanpa mengubah state atau handler.
4. Upgrade Langkah 1: product hero, dua product card, quantity, repack service, benefit, sticky total.
5. Upgrade Langkah 2: courier cards, date selection summary, availability, promo shipping.
6. Upgrade Langkah 3: recipient form grouping, helper text, validation presentation, summary.
7. Upgrade review: satu produk terpilih, repack service bila mie kiloan, shipping, recipient, total, edit/back behavior.
8. Upgrade submit/payment states: preparing, redirect, failed, retry, support fallback.
9. Upgrade tracking timeline, invoice recovery, status hierarchy, dan CTA order ulang.
10. Upgrade MyOrders card hanya pada presentation tanpa mengubah registry/order reference.
11. Pastikan WhatsApp admin hanya tampil pada error yang actionable, bukan normal/validation/success.
12. Pastikan review dan payload memakai sumber state yang sama.
13. Jalankan typecheck/build package.
14. QA mobile untuk setiap state tanpa membuat payment production.
15. Deploy hanya `ordermieyamin.yumme.id` setelah approval/verifikasi.

## 12. Validation / Acceptance Criteria

### Functional

- [ ] Semua input existing masih tersedia.
- [ ] Quantity kg masih mengikuti minimum order.
- [ ] Kemasan dapat diubah 0 atau lebih.
- [ ] Repack tetap menghitung `kg * 10`.
- [ ] Total tetap akurat.
- [ ] Langkah 1 → Langkah 2 tidak membuat order.
- [ ] Review tetap menampilkan pilihan customer.
- [ ] Confirm tetap membuat satu order.
- [ ] Retry invoice tetap memakai order ID yang sama.
- [ ] Payment redirect dan tracking tidak berubah.

### UX

- [ ] Langkah 1 terasa seperti product detail marketplace.
- [ ] Langkah 2 terasa seperti pemilihan kurir dan jadwal marketplace.
- [ ] Langkah 3 terasa seperti address/contact form marketplace.
- [ ] Review menampilkan seluruh data yang akan dikirim.
- [ ] Payment preparation dan redirect memiliki feedback yang jelas.
- [ ] Tracking memiliki timeline dan status aktif yang mudah dipindai.
- [ ] Tracking memiliki visual map journey yang berubah sesuai status.
- [ ] Map tidak mengklaim GPS, ETA, driver location, atau route aktual.
- [ ] Map tetap berfungsi tanpa koordinat atau API map eksternal.
- [ ] MyOrders menampilkan card order yang mudah dipahami.
- [ ] CTA utama jelas di mobile.
- [ ] Tidak ada horizontal overflow.
- [ ] Tombol touch target minimal 44px.
- [ ] Tidak ada WhatsApp pada kondisi normal.
- [ ] WhatsApp hanya muncul untuk error checkout/payment.

### Quality

- [ ] `git diff --check` lulus.
- [ ] Typecheck/build package lulus.
- [ ] Tidak ada perubahan schema yang tidak diperlukan.
- [ ] Tidak ada hardcoded business price.
- [ ] Tidak ada order/payment production yang dibuat selama QA tanpa otorisasi.
- [ ] Production bundle dan `version.json` diverifikasi setelah deploy.
- [ ] Screenshot mobile final diambil setelah implementasi.

## 13. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| UI baru mengubah formula total | Pertahankan calculator existing dan uji kombinasi input |
| Stepper menghilangkan kemampuan input angka | Pertahankan input numerik/aksesibilitas |
| Sticky CTA menutupi konten | Tambahkan bottom padding dan uji mobile viewport |
| Dua pilihan produk terlihat bisa digabung | Gunakan exclusive selector/radio dan kirim hanya produk yang dipilih; repack tetap service khusus mie kiloan |
| Review tidak sinkron dengan state | Render review dari state yang sama dengan payload |
| Payment failure membuat order ganda | Pertahankan pending payment order ID dan retry existing |
| Harga tampak hardcoded | Semua angka berasal dari `mieYaminSettings` |
| PWA menyajikan bundle lama | Verifikasi `/version.json`, `sw.js`, dan lazy chunk live |
| Perubahan desain terlalu besar | Implementasi bertahap, satu route, tanpa redesign app lain |

## 14. Out of Scope

- Membuat cart multi-produk.
- Menambah login/member requirement.
- Mengubah metode pembayaran.
- Mengubah Mayar integration.
- Mengubah database atau migration.
- Mengubah Telegram/Supervisor notification.
- Mengubah sistem, input, payload, payment, atau business logic pada Langkah 2 dan Langkah 3.
- Menghapus input existing.
- Mengubah harga atau formula bisnis.
