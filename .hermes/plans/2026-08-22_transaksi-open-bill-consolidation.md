# Plan: Konsolidasi Simpan Orderan + Riwayat menjadi Transaksi

## Status

Draft plan — belum ada implementasi.

## Tujuan

Mengubah navigasi POS agar hanya memiliki **satu tombol utama bernama `Transaksi`**.

Di dalam halaman/panel `Transaksi` terdapat dua fungsi:

1. **Riwayat Pesanan** — pesanan yang sudah selesai atau memiliki status pembayaran final.
2. **Open Bill** — seluruh pesanan yang belum selesai dibayar, termasuk pesanan yang sebelumnya berada di `Simpan Orderan`.

Navigasi utama tidak lagi menampilkan tombol terpisah:

```text
❌ Simpan Orderan
❌ Riwayat Order
✅ Transaksi
   ├── Riwayat Pesanan
   └── Open Bill
```

## Konteks Existing

Hasil inspeksi source menunjukkan tab POS saat ini berada di:

- `apps/pos/src/components/pos/menu-sidebar.tsx`
  - `parkir` → label `Simpan Orderan`
  - `history` → label `Riwayat Order`
  - `kas` → `Shift & Kas`
  - `antrian` → `Antrian`
- Komponen order history dan action print berada di area `menu-sidebar.tsx`.
- `apps/pos/src/components/pos/transaction-history-sidebar.tsx` menangani sebagian fungsi cetak Open Bill.
- `apps/pos/src/routes/admin/orders.lazy.tsx` juga menggunakan istilah `Riwayat Pesanan` dan `Open Bill`, tetapi ini merupakan halaman orders/admin dan harus diaudit terpisah agar tidak ikut berubah tanpa kebutuhan.

Perubahan ini ditujukan untuk navigasi POS `/menu`, bukan penghapusan fungsi order history atau penghapusan data.

## Target Navigasi UI

### Navigasi utama

Urutan navigasi diperbarui agar `Notifikasi` menjadi tombol tepat di sebelah kiri `Transaksi`.

Target visual utama:

```text
┌────────────────────┬────────────────────┐
│ Notifikasi         │ Transaksi          │
└────────────────────┴────────────────────┘
```

Aturan posisi:

- `Notifikasi` berada di sisi kiri `Transaksi`;
- `Transaksi` tetap menjadi satu-satunya tombol untuk `Riwayat Pesanan` dan `Open Bill`;
- item navigasi yang sebelumnya berada di atas pasangan ini dipindahkan ke bawah;
- jangan membuat tombol terpisah untuk `Simpan Orderan` atau `Riwayat Order`;
- pada mobile, pasangan `Notifikasi` + `Transaksi` tetap bersebelahan jika lebar memungkinkan, atau menjadi dua item berurutan tanpa mengubah prioritasnya.

Urutan target konseptual:

```text
Dashboard
Notifikasi | Transaksi
Shift & Kas
Stok
Antrian
Djiwa Tentram AI
Pengaturan
```

Jika layout existing menggunakan grid, `Notifikasi` dan `Transaksi` harus menempati satu row yang sama. Jika layout existing menggunakan daftar vertikal, keduanya ditempatkan berurutan dengan `Notifikasi` tepat sebelum `Transaksi`, lalu item yang sebelumnya berada di atasnya dipindahkan setelah pasangan tersebut.

Sebelum:

```text
Dashboard
Simpan Orderan
Riwayat Order
Shift & Kas
Stok
Antrian
Djiwa Tentram AI
Pengaturan
```

Sesudah:

```text
Dashboard
Notifikasi | Transaksi
Shift & Kas
Stok
Antrian
Djiwa Tentram AI
Pengaturan
```

`Transaksi` tetap memiliki dua tab internal:

```text
[ Riwayat Pesanan ] [ Open Bill ]
```

Tab yang aktif harus terlihat jelas dengan warna primary Djiwa Tentram, tetapi tetap compact agar cocok dengan layout POS saat ini.

## Definisi Data per Tab

### Riwayat Pesanan

Menampilkan order yang sudah final, misalnya:

- `paid`;
- `completed`;
- status final lain yang sudah digunakan oleh mapper existing;
- `cancelled` hanya jika riwayat pembatalan memang sudah ditampilkan oleh behavior existing.

Fungsi yang dipertahankan:

- buka detail pesanan;
- cetak struk lunas;
- cetak kitchen/bar;
- lihat status produksi;
- toggle status pengantaran;
- lihat nomor transaksi dan nomor order.

### Open Bill

Menampilkan order yang masih aktif atau belum selesai dibayar, termasuk gabungan dari `Simpan Orderan`.

Kandidat status yang perlu dipetakan dan diverifikasi terhadap data production:

- `pending`;
- `cashier_pending`;
- `awaiting_payment`, jika status tersebut benar-benar dipakai;
- order parkir/tersimpan yang masih dapat dilanjutkan.

Fungsi yang dipertahankan/ditambahkan:

- lanjutkan order;
- edit isi order;
- proses pembayaran;
- cetak Open Bill;
- lihat detail customer/meja;
- batalkan order sesuai aturan existing.

## Aturan Penggabungan Data

1. Jangan menampilkan order yang sama dua kali jika record tersimpan di state parkir dan sudah memiliki row database.
2. Gunakan identifier stabil seperti `_id`/`source_id`/`orderNumber` sesuai mapper existing untuk deduplikasi.
3. Order yang sudah `paid` atau `completed` harus berpindah ke `Riwayat Pesanan`, bukan tetap berada di `Open Bill`.
4. Order `pending` dari DjiwaApp yang menunggu pembayaran kasir harus masuk `Open Bill`, bukan hilang dari POS.
5. Order yang dibatalkan tidak boleh muncul sebagai Open Bill aktif.
6. Jangan menghapus record database saat menghapus tombol navigasi `Simpan Orderan`; yang dihapus hanya entry navigasinya dan view terpisahnya.
7. Jika `Simpan Orderan` memiliki draft lokal yang belum menjadi order database, normalisasi object-nya ke model Open Bill tanpa membuat order baru secara otomatis.

## Rencana File dan Perubahan

### Wave 1 — audit dan model data

1. `apps/pos/src/components/pos/menu-sidebar.tsx`
   - audit struktur `TABS`, state tab, render `parkir`, render `history`;
   - tentukan tab internal `transaksi`;
   - satukan data parked/saved orders dan database orders;
   - pertahankan component order card dan action print yang sudah ada.

2. `apps/pos/src/hooks/use-hybrid-pos-data.ts`
   - audit mapper order dan field status/payment/source;
   - pastikan field yang diperlukan untuk Open Bill tetap dipetakan eksplisit;
   - jangan menambah query baru jika data existing sudah cukup.

3. `apps/pos/src/components/pos/transaction-history-sidebar.tsx`
   - audit apakah komponen dapat dipakai sebagai bagian dari tab `Transaksi`;
   - cegah duplikasi Open Bill antara komponen ini dan `menu-sidebar.tsx`;
   - pertahankan fungsi print Open Bill.

### Wave 2 — konsolidasi UI

4. `apps/pos/src/components/pos/menu-sidebar.tsx`
   - ganti dua entry navigasi `parkir` dan `history` menjadi satu entry `transaksi`;
   - label tombol utama menjadi `Transaksi`;
   - ikon memakai ikon transaksi/receipt yang sudah tersedia;
   - render dua tab internal: `Riwayat Pesanan` dan `Open Bill`;
   - pastikan tidak ada tombol utama terpisah bernama `Simpan Orderan` atau `Riwayat Order`;
   - jangan menghapus action `Simpan` di dalam alur checkout jika itu memang action untuk menyimpan order; yang dihapus adalah tombol navigasi terpisah.

5. Touchpoint navigasi lain di Apps POS
   - cari semua `setActiveTab("parkir")`, `setActiveTab("history")`, `initialTab="parkir"`, `initialTab="history"`, dan link yang membuka kedua tab lama;
   - arahkan semuanya ke `transaksi` dengan subtab yang sesuai;
   - audit popup order/notification yang mengarahkan kasir ke history atau parked order.

6. `apps/pos/src/routes/admin/orders.lazy.tsx`
   - hanya ubah jika ditemukan referensi langsung ke tab POS yang terdampak;
   - jangan mengganti label halaman admin secara global tanpa alasan karena halaman admin tetap boleh memiliki `Riwayat Pesanan` sebagai konteks tabel.

### Wave 3 — verifikasi

7. Build Apps POS saja.
8. Verifikasi static bundle dan route `/menu`.
9. Uji data dengan setidaknya empat kondisi:
   - order paid/completed → Riwayat Pesanan;
   - order pending/cashier_pending → Open Bill;
   - saved/parked order → Open Bill;
   - order yang berubah dari pending ke paid → berpindah tab dan tidak duplikat.
10. Uji mobile dan desktop:
    - satu tombol `Transaksi` terlihat di navigasi;
    - tab internal tidak overflow;
    - action lanjutkan/bayar/cetak tetap mudah ditekan;
    - tidak ada horizontal overflow pada lebar mobile POS.

## UI/UX Specification

### Header Transaksi

```text
Transaksi
Kelola pesanan aktif dan riwayat pembayaran

[Riwayat Pesanan] [Open Bill]
```

Subtitle boleh dibuat lebih ringkas jika layout saat ini sudah padat.

### Empty state

Riwayat Pesanan kosong:

```text
Belum ada riwayat pesanan.
```

Open Bill kosong:

```text
Tidak ada Open Bill aktif.
```

Jangan menampilkan empty state `0` yang terlihat seperti data gagal dimuat.

### Loading state

- Gunakan skeleton/card loading existing.
- Jangan menampilkan empty state sebelum query/state loading selesai.

### Error state

- Tampilkan error lokal pada area Transaksi.
- Sediakan tombol `Coba lagi` jika hook existing mendukung refresh.
- Jangan menghapus parked order hanya karena query database gagal.

### Open Bill card

Informasi minimum:

- nomor transaksi/order;
- waktu dibuat;
- customer atau nomor meja;
- jumlah item dan total;
- status pembayaran;
- sumber order jika penting, misalnya DjiwaApp atau Kasir;
- action utama `Lanjutkan` atau `Bayar`.

### Riwayat card

Pertahankan pola existing:

- nomor transaksi prominent;
- status Lunas/Selesai;
- order ID;
- shift/order type;
- waktu dan kasir;
- total dan metode pembayaran;
- action cetak/detail/pengantaran.

## Database dan Data Flow

Tidak ada perubahan schema yang direncanakan.

Data flow target:

```text
POS checkout / DjiwaApp / saved order
        ↓
pos.orders + pos.order_items + status/payment metadata
        ↓
useHybridOrders / parked-order state
        ↓
normalisasi + deduplikasi
        ↓
Transaksi
   ├── Riwayat Pesanan
   └── Open Bill
```

Audit wajib memastikan filter memakai field yang benar antara:

- `status`;
- `paymentStatus` atau metadata pembayaran;
- `source`/`orderSource`;
- `isSaved`/parked state jika ada;
- `orderNumber`/`_id`.

Jangan membuat filter berdasarkan label UI saja.

## Integrasi dan Dampak

- **Payment:** status paid/completed harus menjadi sumber perpindahan ke Riwayat.
- **DjiwaApp:** order customer yang menunggu bayar kasir harus tetap masuk Open Bill.
- **Printer:** action Struk/Open Bill/Kitchen tetap dipertahankan dan tidak dipindah ke menu terpisah.
- **Antrian produksi:** tidak diubah; hanya navigasi transaksi yang dikonsolidasikan.
- **Telegram notification:** tidak diubah oleh fitur UI ini.
- **Finance:** tidak membuat transaksi finansial baru; hanya membaca status order existing.

## Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Order tersimpan tampil dua kali | Deduplicate berdasarkan ID stabil sebelum render |
| Order pending hilang dari kasir | Uji `pending` dan `cashier_pending` dari database live/staging |
| Saved order lokal hilang saat query gagal | Pisahkan fallback state lokal dari error query database |
| Link/popup lama masih membuka tab `parkir` | Audit semua referensi `parkir` dan `history` |
| Status payment tidak konsisten | Definisikan fungsi `isOpenBill` dan `isHistoryOrder` di satu tempat |
| Label `Transaksi` terlalu panjang di navigasi mobile | Gunakan ikon receipt dan label pendek satu baris |
| Perubahan tidak terlihat karena PWA cache | Build POS, deploy bundle, verifikasi hashed chunk dan service worker |

## Acceptance Criteria

- [ ] Navigasi `/menu` hanya memiliki satu tombol `Transaksi` untuk domain ini.
- [ ] Tombol `Notifikasi` berada tepat di sebelah kiri `Transaksi` pada layout utama.
- [ ] Item yang sebelumnya berada di atas pasangan `Notifikasi`/`Transaksi` dipindahkan ke bawah sesuai urutan target.
- [ ] Tidak ada tombol navigasi terpisah `Simpan Orderan`.
- [ ] Tidak ada tombol navigasi terpisah `Riwayat Order`.
- [ ] `Transaksi` memiliki dua tab: `Riwayat Pesanan` dan `Open Bill`.
- [ ] Saved/parked orders muncul di `Open Bill`.
- [ ] Pending/cashier-pending orders yang belum bayar muncul di `Open Bill`.
- [ ] Paid/completed orders muncul di `Riwayat Pesanan`.
- [ ] Order yang sama tidak tampil dua kali.
- [ ] Action lanjutkan, bayar, detail, Struk, Open Bill, Kitchen, dan delivered tetap berfungsi sesuai konteks.
- [ ] Loading, empty, error, dan refresh state tetap ditangani.
- [ ] Tidak ada perubahan database schema.
- [ ] Build Apps POS berhasil.
- [ ] Production `/menu` dan hashed chunk baru terverifikasi setelah implementasi.

## Belum Dicakup

- Redesign besar tampilan kartu order.
- Perubahan lifecycle pembayaran.
- Perubahan status order di database.
- Perubahan bot Telegram.
- Perubahan halaman Admin Orders kecuali ditemukan touchpoint langsung.
