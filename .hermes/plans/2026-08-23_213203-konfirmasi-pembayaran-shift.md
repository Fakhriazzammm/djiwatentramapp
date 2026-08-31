# Plan: Konfirmasi Pembayaran Shift

## Status
Plan only — belum ada implementasi kode, migration, deployment, commit, atau perubahan database.

## Goal
Merombak bagian tutup kasir POS menjadi **Konfirmasi Pembayaran Shift** dengan bahasa yang sederhana dan mobile-first. Sistem membandingkan nominal menurut sistem dengan nominal aktual yang dikonfirmasi kasir untuk pembayaran langsung dan transaksi online food.

## Ruang lingkup

### Pembayaran Langsung
- QRIS Kasir
- Tunai Kasir
- Djiwa Pay
- DjiwaApp — QRIS
- DjiwaApp — Bayar Kasir

### TRANSAKSI ONLINE FOOD
- GoFood
- GrabFood
- ShopeeFood

### Yang dipertahankan
- Input pecahan uang kertas dan logam.
- Total uang fisik dihitung otomatis dari pecahan.
- Status absensi tim dan jadwal tutup kasir.
- Catatan shift.
- Historical shift dan transaksi.

### Yang dihapus dari UI/logic
- Tulisan dan perhitungan **Saran Setoran Tunai**.
- Rincian fee platform, net settlement, status pencairan, dan detail order online pada form tutup kasir.

## Terminologi UI final

| Lama | Baru |
|---|---|
| Rekonsiliasi Tutup Kasir | **Konfirmasi Pembayaran Shift** |
| Pembayaran Kasir | **Pembayaran Langsung** |
| Aktual | **Nominal Aktual** |
| Selisih | **Perbedaan** |
| Transaksi Online | **TRANSAKSI ONLINE FOOD** |
| Akhiri & Kirim Laporan | **Akhiri Shift & Kirim Laporan** |
| Saran Setoran Tunai | Dihapus |

## Analisis arsitektur

Expected tidak boleh berasal dari input browser. Expected dihitung dari order settled dalam rentang shift aktif menggunakan sumber data order dan metadata pembayaran.

```text
pos.orders / public.pos_orders
  → filter shift aktif + paid/completed
  → klasifikasi source + payment_method + payment_receipt_kind + metadata
  → expected per kanal
  → kasir mengisi nominal aktual
  → tunai dihitung dari cash_breakdown
  → hitung perbedaan
  → validasi closing
  → simpan snapshot closing secara atomic/idempotent
  → kirim laporan
```

Perlu audit data live read-only sebelum mapping final, karena codebase saat ini memakai variasi seperti `cash`, `tunai`, `qris`, `transfer`, `wallet`, `djiwa_pay`, `djiwaapp`, serta source `pos` dan `customer_self_service`.

## Mapping awal yang harus diverifikasi

| Kanal | Kandidat mapping |
|---|---|
| QRIS Kasir | `source=pos` + metode QRIS |
| Tunai Kasir | `source=pos` + metode cash/tunai |
| Djiwa Pay | metode wallet/Djiwa Pay dengan metadata wallet yang valid |
| DjiwaApp — QRIS | `source=customer_self_service` + QRIS |
| DjiwaApp — Bayar Kasir | `source=customer_self_service` + cash/tunai/cashier |
| GoFood | field platform/source/order metadata yang menandakan GoFood |
| GrabFood | field platform/source/order metadata yang menandakan GrabFood |
| ShopeeFood | field platform/source/order metadata yang menandakan ShopeeFood |

Jika identitas platform online belum konsisten, tahap implementasi harus menambahkan normalisasi pada layer data terlebih dahulu. Jangan mengklasifikasikan hanya dari nama pelanggan atau teks order.

## Database schema plan

### Existing fields yang dipertahankan
Pada `pos.shifts` dan view terkait, pertahankan:

```text
cash_breakdown
non_cash_expected
non_cash_confirmed
ending_cash_expected
ending_cash_physical
summary
raw
```

### Additive fields yang dipertimbangkan
Setelah audit schema existing:

```text
payment_breakdown_expected jsonb
payment_breakdown_actual jsonb
payment_breakdown_variance jsonb
closing_reconciliation_status text
closing_notes text
closing_approved_by text/null
closing_approved_at timestamp/null
```

Nama final harus mengikuti convention schema existing. Migration wajib additive, idempotent, tidak drop/rename data lama.

Contoh breakdown:

```json
{
  "qris_kasir": 0,
  "tunai_kasir": 0,
  "djiwa_pay": 0,
  "djiwaapp_qris": 0,
  "djiwaapp_bayar_kasir": 0,
  "gofood": 0,
  "grabfood": 0,
  "shopeefood": 0
}
```

REST/view mapping perlu memastikan field tersedia dalam camelCase dan snake_case sesuai pola hybrid data. Closing read-back harus membaca record shift yang sama setelah penyimpanan.

## UI/UX specification

Perombakan tidak hanya menambah field pada form lama. Struktur visual, card, section, hierarchy, spacing, warna, state, dan interaksi tutup kasir akan disusun ulang agar cocok untuk aplikasi POS mobile.

### Prinsip desain utama

| Prinsip | Penerapan |
|---|---|
| Fungsi diutamakan | Kasir langsung melihat apa yang harus dikonfirmasi dan tindakan berikutnya. |
| Cepat dipindai | Satu card untuk satu kelompok fungsi; label singkat; nominal sistem dan aktual berdampingan. |
| Mobile-first | Layout satu kolom, kontrol minimal 44px, nyaman digunakan satu tangan, aman untuk layar sempit. |
| iOS-inspired | Surface terang, accent biru Djiwa Tentram, radius card 20–24px, kontrol 14px, shadow lembut, divider tipis. |
| Tidak berlebihan | Tidak ada gradient/dekorasi yang tidak membantu, tidak ada card bertumpuk tanpa tujuan, hanya motion yang memberi feedback. |
| Data aman dibaca | Status `Pas`, `Kurang`, `Lebih`, dan `Belum diisi` terlihat melalui teks, warna, dan ikon Lucide. |
| Performa | Hitung perbedaan di client secara lokal saat mengetik; hindari request per digit; fetch expected secara terkontrol. |

### Struktur layout baru

```text
Sticky header
  └─ Konfirmasi Pembayaran Shift + status shift

Info card
  └─ jadwal tutup + status absensi tim

Card Pembayaran Langsung
  ├─ QRIS Kasir
  ├─ Tunai Kasir + accordion pecahan
  ├─ Djiwa Pay
  ├─ DjiwaApp — QRIS
  └─ DjiwaApp — Bayar Kasir

Card TRANSAKSI ONLINE FOOD
  ├─ GoFood
  ├─ GrabFood
  └─ ShopeeFood

Card Ringkasan
  ├─ total sistem
  ├─ total aktual
  └─ total perbedaan + status

Card Catatan Shift
  └─ catatan hanya wajib saat ada perbedaan sesuai policy

Sticky bottom CTA
  └─ Akhiri Shift & Kirim Laporan
```

### Card dan section specification

- Gunakan satu outer page shell dengan background surface ringan; jangan membuat setiap baris menjadi card besar.
- **Pembayaran Langsung** dan **TRANSAKSI ONLINE FOOD** adalah section card utama yang jelas.
- Setiap kanal memakai row/card compact: icon kecil, nama kanal, nominal sistem, input aktual, dan chip perbedaan.
- Tunai memiliki disclosure/accordion khusus pecahan agar form tetap pendek saat dibuka.
- Section online dapat collapsed secara default jika tidak ada transaksi online; jika ada expected online, tampilkan ringkasan singkat dan field konfirmasi.
- Ringkasan diletakkan setelah semua kanal agar hasil akhir mudah dipahami.
- CTA utama dibuat sticky di area bawah dengan safe-area padding; tidak boleh tertutup keyboard atau bottom navigation.
- Tombol sekunder seperti `Auto-fill` harus subordinate dan tidak mengambil perhatian dari CTA closing.

### Warna dan visual token

- Background: surface terang existing shared theme.
- Card: putih dengan border tipis dan shadow lembut.
- Accent utama: token primary/accent existing Djiwa Tentram, bukan warna baru per halaman.
- Status `Pas`: emerald yang memenuhi kontras.
- Status `Kurang`: amber/rose sesuai tingkat risiko.
- Status `Lebih`: blue/amber agar tidak disamakan dengan error.
- Status `Belum diisi`: neutral dengan label eksplisit.
- Ikon: Lucide/line icon konsisten, sekitar 2px stroke; tidak memakai emoji sebagai icon.
- Radius: card sekitar 20–24px, control sekitar 14px.
- Spacing: rhythm 8/12/16/24px; hindari padding yang terlalu rapat pada input nominal.

### Typography dan interaction

- Heading section jelas tetapi compact; body minimal 14px; caption hanya untuk helper text.
- Nominal sistem dibuat lebih tenang; nominal aktual menjadi focus input; perbedaan diberi emphasis semantic.
- Semua input dan button memiliki touch target minimal 44px.
- Gunakan focus-visible ring, keyboard support, dan label yang dapat dibaca screen reader.
- Press feedback ringan `scale(.97)` sekitar 180ms pada CTA/interaktif.
- Gunakan iOS easing `cubic-bezier(.32,.72,0,1)` untuk card disclosure dan state transition.
- Jangan memakai motion dekoratif, looping animation, atau animasi yang memperlambat submit.

### Header

```text
Konfirmasi Pembayaran Shift
Sebelum mengakhiri shift, pastikan nominal sudah sesuai.
```

### Pembayaran Langsung
Setiap kanal menampilkan:

```text
Menurut Sistem       Rp...
Nominal Aktual       [Rp...]
Perbedaan            Rp...
```

Untuk Tunai Kasir:

```text
Menurut Sistem       Rp...
Pecahan Uang         [buka/tutup]
Total Uang Fisik     Rp...
Perbedaan            Rp...
```

`Total Uang Fisik` read-only dan selalu dihitung dari pecahan. `Rp0` valid; kosong berarti belum dikonfirmasi.

### TRANSAKSI ONLINE FOOD
Bagian compact/collapsible bila diperlukan, tanpa detail settlement:

```text
GoFood
Menurut Sistem       Rp...
Nominal Aktual       [Rp...]
Perbedaan            Rp...

GrabFood
Menurut Sistem       Rp...
Nominal Aktual       [Rp...]
Perbedaan            Rp...

ShopeeFood
Menurut Sistem       Rp...
Nominal Aktual       [Rp...]
Perbedaan            Rp...
```

Tidak menampilkan fee, net settlement, status pencairan, atau daftar order pada form ini.

### Ringkasan
```text
Total Menurut Sistem     Rp...
Total Nominal Aktual     Rp...
Total Perbedaan          Rp...
Status                   Sesuai / Perlu Penjelasan
```

Total tidak boleh menutupi perbedaan antar kanal. Perbedaan setiap kanal tetap terlihat.

### Perhitungan realtime dan motion

Nilai **Nominal Aktual**, **Perbedaan**, dan ringkasan total dihitung setiap kali kasir mengetik angka, tanpa menunggu submit atau blur.

Contoh:

```text
Menurut Sistem     Rp500.000
Nominal Aktual     Rp400.000
Perbedaan          Kurang Rp100.000

Kasir mengubah input menjadi Rp300.000
Perbedaan          Kurang Rp200.000
```

Perilaku UI yang direncanakan:

- setiap perubahan digit langsung memicu kalkulasi lokal;
- format Rupiah diperbarui saat mengetik tanpa menghilangkan posisi cursor;
- angka perbedaan dianimasikan dengan transisi singkat saat nilainya berubah;
- perubahan nominal diberi `motion-safe` pulse/slide ringan, bukan animasi berulang yang mengganggu;
- warna berubah realtime: hijau untuk `Pas`, amber/merah untuk `Kurang`, biru/amber untuk `Lebih`;
- angka baru dapat memakai count-up/count-down singkat atau highlight background sekitar 250–350 ms;
- animasi wajib menghormati `prefers-reduced-motion`;
- kalkulasi tetap benar walaupun animasi belum selesai atau browser mematikan motion;
- nilai raw numeric dan nilai tampilan terformat harus dipisahkan agar perhitungan tidak bergantung pada string `Rp` atau separator;
- input kosong tetap berarti `belum dikonfirmasi`, sedangkan `Rp0` berarti kasir mengonfirmasi nol;
- perubahan pada satu kanal langsung memperbarui total aktual dan total perbedaan.

Contoh status visual:

```text
Rp400.000 → Rp300.000
Perbedaan: Kurang Rp100.000 → Kurang Rp200.000
                         [highlight 300 ms]
```

Motion hanya menjadi feedback perubahan data. Tidak boleh dipakai untuk menyamarkan selisih atau menggantikan label/status yang jelas.

### States
- Loading expected: tampilkan skeleton/teks memuat; CTA disabled.
- Empty: kanal tetap tampil dengan expected `Rp0` dan membutuhkan konfirmasi actual.
- Error: tampilkan alasan yang aman; CTA disabled; jangan memakai nilai nol sebagai fallback diam-diam.
- Saving: cegah double submit dan tampilkan status menyimpan.
- Success: tampilkan closing berhasil hanya setelah database mengonfirmasi hasil.
- Variance: jika ada perbedaan, tampilkan kanal penyebab; catatan wajib sesuai aturan.

## Aturan validasi closing

Closing tetap membutuhkan:

- jadwal tutup shift sudah tercapai;
- staf yang wajib checkout sudah absen keluar;
- expected berhasil dimuat;
- semua nominal aktual non-tunai dan online food sudah dikonfirmasi;
- pecahan tunai valid dan total fisik dihitung;
- tidak ada nilai negatif atau input invalid;
- pengeluaran tambahan valid;
- catatan diisi jika terdapat perbedaan sesuai kebijakan;
- mutation closing tidak sedang berjalan.

Kebijakan selisih yang direkomendasikan:

```text
Perbedaan Rp0       → boleh tutup
Perbedaan kecil     → catatan wajib
Perbedaan besar     → approval supervisor sesuai settings
```

Threshold harus berasal dari settings, bukan hardcode. Detail threshold dan apakah approval wajib perlu dikonfirmasi sebelum implementasi.

## Multi-source data flow

```text
POS order settled
  ├─ source + payment metadata → pembayaran langsung
  └─ platform metadata         → TRANSAKSI ONLINE FOOD

Financial transactions
  └─ expense shift → konteks operasional, bukan kanal pembayaran

Cash breakdown
  └─ nominal × jumlah → total uang fisik

Shift closing
  ├─ expected breakdown
  ├─ actual breakdown
  ├─ variance breakdown
  └─ notes/status/audit
```

Online food tidak masuk ke total uang fisik. DjiwaApp — Bayar Kasir masuk konteks uang tunai sesuai definisi bisnis yang disepakati, sedangkan DjiwaApp — QRIS dan Djiwa Pay tetap digital.

## Integration points

### POS
- `apps/pos/src/components/pos/menu-sidebar.tsx` sebagai pemilik form tutup shift.
- `useHybridOrders`, `useHybridAllTransactions`, `useHybridShiftStatus` sebagai sumber data yang perlu diaudit.
- `useHybridEndShift` dan implementasi write hybrid sebagai jalur closing yang harus diperbarui.
- `apps/pos/src/lib/public-pos-write-helpers.ts` dan hook write terkait jika payload/schema berubah.

### Laporan
- `apps/pos/src/lib/shift-report-pdf.ts` untuk laporan PDF jika breakdown baru perlu ditampilkan.
- Formatter laporan Telegram/agent yang membaca `summary`, `cash_breakdown`, dan field shift perlu disinkronkan.
- Notifikasi tidak boleh menjadi sumber kebenaran; database closing harus tersimpan lebih dulu.

### Admin dan report
- Audit view laporan shift/admin agar breakdown kanal tidak hilang.
- Pastikan query membaca shift berdasarkan ID/source ID, bukan hanya nama kasir atau judul shift.

## No-hardcode audit

Tidak boleh hardcode:

- nominal expected;
- platform yang memiliki transaksi pada hari tertentu;
- payment mapping yang seharusnya berasal dari metadata order;
- threshold selisih;
- jadwal shift;
- nama kasir/staf;
- default transaksi settled.

Yang boleh menjadi constant teknis:

- daftar label kanal resmi;
- urutan tampilan kanal;
- key schema seperti `gofood`, `grabfood`, `shopeefood`;
- daftar denomination yang memang merupakan pecahan resmi dan sudah dipakai sistem.

## Implementation waves

### Wave 1 — Read-only audit
1. Audit source form, hook, mutation, RPC/API, view, dan report formatter.
2. Query kombinasi live `source`, `payment_method`, `payment_receipt_kind`, `business_unit`, platform metadata, status, dan total.
3. Cocokkan order settled dengan transaksi finansial tanpa mengubah data.
4. Dokumentasikan mapping final dan data gap.

### Wave 2 — Data contract/backend
1. Tentukan schema additive setelah memastikan field belum ada.
2. Buat helper klasifikasi payment channel yang reusable dan tested.
3. Hitung expected per kanal dari order settled dalam window shift.
4. Update payload closing untuk actual breakdown + cash breakdown.
5. Pastikan transaction/closing atomic dan idempotent.
6. Simpan status/perbedaan/catatan sebagai snapshot audit.

### Wave 3 — UI POS
1. Ganti judul menjadi **Konfirmasi Pembayaran Shift**.
2. Ganti section menjadi **Pembayaran Langsung**.
3. Pecah satu non-cash menjadi kanal pembayaran yang diminta.
4. Pertahankan dan perbaiki input pecahan tunai.
5. Tambahkan section **TRANSAKSI ONLINE FOOD** dengan tiga kanal ringkas.
6. Hapus seluruh Saran Setoran Tunai dari UI dan formula.
7. Tambahkan nominal actual, perbedaan, states, dan CTA guard.

### Wave 4 — Reports and read-back
1. Update PDF/admin/Telegram bila breakdown memang ditampilkan di sana.
2. Read-back shift setelah closing.
3. Pastikan closing yang tersimpan sama dengan yang ditampilkan.
4. Pastikan notification failure tidak mengubah hasil closing.

### Wave 5 — Verification and release
1. Unit test klasifikasi channel dan perhitungan cash breakdown.
2. Integration test closing payload dan idempotency.
3. Build/typecheck POS.
4. Browser test route pemilik form pada mobile viewport.
5. Screenshot preview sebelum/sesudah.
6. Deploy hanya app yang berubah.
7. Verify production bundle, API/read-back, dan service worker.
8. Commit file sesi secara selektif.

## Test matrix

### Payment mapping
- POS QRIS.
- POS cash/tunai.
- Djiwa Pay.
- DjiwaApp QRIS.
- DjiwaApp bayar kasir.
- GoFood.
- GrabFood.
- ShopeeFood.
- Tidak ada transaksi di salah satu kanal.
- Metadata platform tidak lengkap — harus masuk error/data-review, bukan salah klasifikasi diam-diam.

### Input
- Actual kosong.
- Actual `Rp0`.
- Actual negatif.
- Actual non-numeric.
- Pecahan semua nol.
- Pecahan menghasilkan total non-zero.
- Total fisik harus mengikuti pecahan.
- Pengeluaran tambahan.
- Perbedaan dengan catatan.

### Closing gates
- Sebelum close time.
- Staf belum checkout.
- Expected gagal dimuat.
- Semua input valid dan sesuai.
- Perbedaan kecil.
- Perbedaan besar.
- Double click.
- Retry setelah network failure.
- Refresh setelah closing.

## Acceptance criteria

- UI menggunakan **Konfirmasi Pembayaran Shift**.
- Section menggunakan **Pembayaran Langsung**.
- Section online menggunakan **TRANSAKSI ONLINE FOOD**.
- Saran Setoran Tunai tidak muncul dan tidak dihitung.
- QRIS Kasir, Tunai Kasir, Djiwa Pay, DjiwaApp QRIS, dan DjiwaApp Bayar Kasir tampil terpisah.
- GoFood, GrabFood, dan ShopeeFood tampil ringkas dengan Sistem, Nominal Aktual, dan Perbedaan.
- Input pecahan uang tetap tersedia.
- Total uang fisik selalu berasal dari pecahan.
- Kosong berbeda dari Rp0.
- Expected berasal dari order settled dan metadata yang terverifikasi.
- Closing menyimpan breakdown expected/actual/variance secara audit-able.
- Tidak ada duplicate closing atau duplicate financial transaction.
- Laporan yang relevan membaca breakdown yang sama.
- Build, test, browser preview, production read-back, dan deployment terverifikasi.

## Open questions before implementation

1. Apakah `DjiwaApp — Bayar Kasir` harus masuk ke expected uang tunai/laci, atau hanya dilaporkan sebagai kanal terpisah?
2. Field mana yang paling konsisten untuk menandai GoFood, GrabFood, dan ShopeeFood pada order existing?
3. Apakah actual untuk transaksi online wajib diisi walaupun expected `Rp0`?
4. Berapa threshold perbedaan yang memerlukan approval supervisor?
5. Apakah detail breakdown harus ikut tampil di Telegram dan PDF, atau cukup disimpan di database dan UI POS?
