# Usulan inventaris dari struk Oktober 2026

Analisis baca-saja, 13 November 2026. Tidak ada penambahan atau perubahan data inventaris.

Keputusan pemilik: nama yang belum jelas, termasuk Gold Label, BLP, dan FM EF, dipertahankan untuk verifikasi; jangan digabung otomatis. Angka, ukuran, satuan, dan isi kemasan yang berbeda harus diperlakukan sebagai identitas berbeda. Jumlah pembelian pada struk sendiri bukan bukti perbedaan ukuran kemasan. FM EF tercatat sebagai “Fm Ef” pada dua struk; identitasnya belum dipastikan.

## Cakupan

- 112 dokumen masuk rentang Oktober berdasarkan tanggal struk jika tersedia, jika tidak menggunakan tanggal transaksi (WIB).
- 96 dokumen memiliki foto; 30 punya tanggal struk terstruktur dan 66 hanya tanggal transaksi. Seluruh 96 foto berhasil diunduh dan teridentifikasi sebagai JPEG/PNG; tidak ada file foto yang identik secara byte. Foto berbeda masih dapat merepresentasikan struk yang sama.
- 16 dokumen lain merupakan catatan tanpa foto, ditampilkan hanya di rincian. Total 285 baris; 269 baris berasal dari dokumen bergambar.
- Nama item berasal dari hasil parsing yang belum disetujui. Beberapa foto dibaca langsung sebagai sampel; seluruh 96 foto belum ditinjau satu per satu. Tidak ada dasar untuk menjamin seluruh item atau seluruh tanggal sudah benar.
- Terdapat 53 produk, 41 berstatus tersedia; 14 produk tersedia tidak memiliki resep terkait. Karena itu pembelian pada struk belum membuktikan seluruh kebutuhan bahan per menu.

## Hasil awal dari foto

- 40 nama dikelompokkan ke nama yang sudah ada; identitas barang tetap perlu dicek pada foto.
- 2 calon nama baru perlu verifikasi sebelum ditambah.
- 64 kelompok nama/produk ambigu perlu ditinjau.
- 37 kelompok dikeluarkan sebagai kemasan, biaya atau barang operasional.

## Calon bahan baru

| Nama | Bukti | Status |
|---|---|---|
| Panir Mix | 3 struk · 2026-10-04, 2026-10-15, 2026-10-25 | Cek padanan dan pemakaian pada menu sebelum ditambah |
| Thyme | 1 struk · 2026-10-26 | Cek padanan dan pemakaian pada menu sebelum ditambah |

Panir Mix terlihat pada foto Merpati tanggal 25 Oktober; Thyme terlihat sebagai YOA Thyme 24g pada foto tanggal 26 Oktober.

## Nama yang cocok dengan inventaris saat ini

Angkak, Ayam Cincang, Bawang Bombai, Bawang Daun, Bawang Goreng, Bawang Merah, Bawang Putih, Beras, Bernardi Horeca Sosis, Biji Wijen, Butter, Cabe Kering, Cabe Keriting Merah, Cabe Rawit, Coklat Powder, Delmonte Saus Cabe, Ebi (500gr), Freshmilk Greenfield, Frisianflag Coconut Delight, Gula Aren, Gula Pasir Putih, Jeruk Limau, Kecap Asin ABC, Kemiri, Kentang Shoestring, Lada Bubuk, Lada Hitam Bubuk, Margarine (Filma), Minyak Wijen, Mix Vegetable, Paprika Powder, Peach Tea Max Tea, Roti Tawar Gandum, Saus Tiram (Mahsuri), Saus Tomat (Del Monte), Selada (Ibu Teti Pasar), Sunquick Lemon, Tepung Jagung, Timun, Tongcai.

## Potensi duplikasi yang sudah ada

- **Beans Robusta / Robusta Beans**: alias `Beans Robusta` tercatat pada kedua bahan. Periksa asal dan penggunaannya sebelum menggabungkan.
- **Schweppes Soda / Soda Water Schweppes**: kemungkinan produk sama; pastikan jenis dan kemasan.
- **Sapi Cincang / Sapi Cincang 200gr** dan **Kentang Shoestring / French Fries Shoestring 2,5 Kg**: periksa apakah hanya beda kemasan/satuan atau memang item berbeda.
- **Basil / Basil Leaves**, **Mayonaise / Mayones Maestro 1L**: pastikan bentuk dan merek sebelum menyatukan.
- **Pangsit / pangst**, **Selada / Selada (Ibu Teti Pasar)**, dan nama singkat lain di laporan masih perlu pemeriksaan sebelum digabung.

## Berkas

- `ringkasan-foto-struk.csv`: satu baris per nama hasil pengelompokan, status, tanggal dan ID struk. Tidak ada nama yang identik setelah normalisasi huruf besar/kecil dan spasi; ini bukan jaminan tidak ada sinonim yang belum dikenali.
- `rincian-seluruh-item.csv`: seluruh baris, termasuk 16 catatan tanpa foto, dengan tautan foto dan dasar tanggal.

Jangan menghapus atau menggabungkan barang secara otomatis: periksa foto, satuan, merek dan referensi menu terlebih dahulu.

## Penerapan ke inventaris produksi (13 November 2026)

Migrasi `packages/backend/supabase/migrations/20261113120000_inventory_catalog_october_2026.sql` sudah diterapkan. Sifatnya aditif: tidak ada bahan, riwayat stok, resep, atau pesanan yang dihapus atau diganti nama.

- `peta-bahan-baku.csv` mencatat keputusan untuk seluruh 172 nama OCR: 27 cocok persis, 74 menjadi alias, 9 bahan baru, 27 tetap review, 35 kemasan/operasional.
- Bahan baru: Panir Mix, Thyme, Kecap Anggur, Saus Tiram Panda, Kemangi Segar (beda dari Kemangi Instant), Freshmilk Diamond, Minyak Bimoli. Stok awal 0 dan satuan ditandai `AMBIGUOUS` sampai opname manual.
- Alias OCR ditambahkan ke 48 bahan yang sudah ada. Alias yang mengandung angka/ukuran tetap tidak dipercaya otomatis oleh bot (mis. `Ebi` vs `Ebi (500gr)`, `Telor Omega 30 butir`).
- Nama yang belum pasti (Gold Label, BLP, FM EF, Rose Brand, Simas/Sinas, Tomat 12x25, dan sejenisnya) tetap di antrean `pos.inventory_item_candidates` berstatus REVIEW; tidak digabung otomatis.
- `pos.inventory_oct2026_snapshot` menyimpan salinan inventaris sebelum perubahan, dan `pos.inventory_catalog_update_log` mencatat setiap alias/bahan yang ditambahkan.
- Indeks unik `inventory_ingredient_name_unique` mencegah dua bahan bernama sama.
- Bot Telegram pengeluaran membaca `pos.inventory` + alias, jadi daftar ini langsung dipakai saat menganalisis foto struk baru. Kecocokan hanya otomatis untuk nama persis/alias tunggal; sisanya masuk review.

Duplikasi lama yang masih perlu keputusan pemilik (tidak digabung otomatis): Beans Robusta / Robusta Beans, Schweppes Soda / Soda Water Schweppes, Basil / Basil Leaves, Mayonaise / Mayones Maestro 1L, Sapi Cincang / Sapi Cincang 200gr.
