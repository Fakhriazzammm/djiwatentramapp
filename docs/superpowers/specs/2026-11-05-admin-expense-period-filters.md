# Filter Periode Pengeluaran Admin

## Tujuan

Memudahkan admin meninjau pengeluaran untuk periode umum atau rentang tanggal tertentu sambil mempertahankan filter kategori, pencarian, pengurutan, pagination, dan ekspor yang sudah ada.

## Desain

- Tombol utama: Hari Ini, Minggu Ini, Bulan Ini, dan Tahun Berjalan (YTD).
- Kontrol **Periode lainnya**: Kemarin, Bulan Lalu, Tahun Kalender (mempertahankan filter Tahun Ini yang lama), dan Rentang Tanggal.
- Rentang tanggal memakai tanggal lokal, menyertakan seluruh hari awal dan akhir, dan hanya diterapkan setelah pengguna menekan Terapkan.
- Tolak rentang yang belum lengkap atau tanggal awal setelah tanggal akhir; jangan mengubah periode yang sudah aktif saat input tidak valid.
- Hasil, jumlah, total, dan ekspor CSV mengikuti periode serta filter kategori/pencarian yang sama. Hasil kosong mengekspor nol baris.
- Perubahan hanya pada halaman Pengeluaran. Pemilih periode bersama dan perilaku modul laporan lain tetap sama.

## Batasan

- Gunakan kontrak date range pada hook transaksi keuangan yang sudah ada.
- Minta batas baca 2.000 baris pada laporan transaksi detail agar konsisten dengan `pageSize` yang sudah digunakan halaman; jangan ubah perilaku pembaca keuangan lain.
- Tidak mengubah skema, otorisasi, atau perilaku transaksi.
- Pertahankan tampilan responsif yang sekarang; kontrol periode tambahan boleh membungkus ke baris berikutnya.

## Kriteria penerimaan

1. Preset utama dan periode tambahan menghasilkan batas tanggal yang benar, termasuk Tahun Kalender yang tetap mencakup satu tahun penuh.
2. YTD dimulai 1 Januari tahun berjalan dan berakhir pada akhir hari ini.
3. Rentang tanggal kustom inklusif dan tervalidasi.
4. Filter lain dan ekspor hanya memakai hasil yang terlihat pada filter aktif.
5. Tidak ada perubahan pada pemilih periode halaman laporan.
