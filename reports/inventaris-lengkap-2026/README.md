# Katalog bahan baku lengkap dari seluruh foto struk (Juli–November 2026)

Laporan ini menutup permintaan: *cek lagi seluruh gambar struk yang ada di database
sejak fitur simpan gambar struk ada, buat daftar seluruh bahan baku, pastikan tidak ada
duplikasi, buat alias untuk nama yang mirip, lalu perbarui data yang ada.*

## 1. Cakupan

- Bucket `receipt-images`: **572 objek**, `2026-07-07` … `2026-11-12`.
- 567 di antaranya struk asli; 5 sisanya file uji (`test_direct.jpg`,
  `test_python.jpg`, `test_storage_direct.jpg`, `test_upload.jpg`, `test_vps_now.jpg`).
- **554 objek punya bukti OCR** (dokumen struk / item struk / hasil AI run).
- **13 struk asli belum punya bukti OCR** dan karena itu belum masuk katalog
  (daftar di bagian 7).

Bukti yang dipakai (bukan OCR ulang, agar tidak menimbulkan biaya dan duplikasi):

| Sumber | Isi |
| --- | --- |
| `pos.financial_transactions.metadata.scanItems` | 2.631 baris item |
| `pos.expense_receipt_items` | 2.546 baris item |
| `pos.expense_receipt_ai_runs.result.items` | 1.499 baris item |

Total **6.676 baris bukti**, terdeduplikasi menjadi **1.488 nama unik**.

## 2. Metode (`analyze.py`)

1. Normalisasi nama (NFKC, casefold, buang tanda baca) → kunci pembanding.
2. Cocokkan berurutan: nama sama persis → alias persis → alias yang tertanam dalam
   nama (mis. `MAIZENAKU 300 GR`) → fuzzy (`rapidfuzz`) dengan ambang 90 dan selisih
   minimal 4 poin terhadap kandidat kedua.
3. **Tanda varian** (`variant_signature` dari `yumi-finance-agent/item_identity.py`):
   angka/ukuran/isi kemasan berbeda = identitas berbeda. Bahan generik boleh cocok
   dengan nama spesifik, tetapi dua nama dengan isi kemasan berbeda tidak digabung.
4. Lapisan keputusan manual (`OVERRIDES_RAW`) untuk nama berfrekuensi tinggi yang
   berbahaya bila diserahkan ke fuzzy.
5. Penyaring kemasan/operasional (kresek, cup, thermal, semen, usuk, tang, dll.)
   supaya barang non-bahan tidak masuk inventaris.

Keluaran:

- `semua-nama-bahan.csv` — 1.488 nama + keputusan.
- `aksi-bahan.csv` — 534 nama yang butuh aksi DB (527 alias + 7 baris bahan baru).
- `kandidat-bahan.csv` — 462 nama yang sengaja ditahan untuk konfirmasi.
- `build_migration.py` — menghasilkan migrasi SQL dari CSV di atas.

## 3. Hasil klasifikasi

| Keputusan | Nama | Arti |
| --- | ---: | --- |
| `ALIAS` | 627 | Nama struk dipetakan ke bahan yang sudah ada |
| `EXACT` | 111 | Nama struk sudah sama dengan nama inventaris |
| `SUDAH_ALIAS` | 1 | Sudah terdaftar sebagai alias di DB |
| `NEW` | 7 | Bahan baru (6 nama bahan unik) |
| `EXCLUDE` | 280 | Kemasan/operasional, bukan bahan baku |
| `REVIEW` | 462 | Belum aman digabung otomatis, perlu konfirmasi |

Dari 627 `ALIAS`, **527 nama benar-benar baru** (100 lainnya sudah ada di daftar alias
sebelumnya) dan tersebar ke **115 bahan** yang sudah ada.

## 4. Bahan baru (6)

| Bahan | Satuan | Bukti |
| --- | --- | --- |
| `Freshmilk Cimory 950ml` | pcs | Cimory Full Cream 950 ml, merek berbeda dari Diamond/Greenfield |
| `Kikil Sapi` | kg | kikil putih, Rp18.000/kg |
| `Tempe` | pcs | tempe papan, Rp8.000/pcs |
| `Caisim` | kg | sayur caisim |
| `Cabe Besar` | kg | cabe merah besar, dibedakan dari cabe keriting/rawit |
| `Cumi` | kg | cumi segar (termasuk "10kg cumi") |

Semua dibuat dengan `quantity = 0` dan `unit_status = 'AMBIGUOUS'` sehingga tidak
menambah stok fisik dan tidak mengubah perhitungan apa pun.

## 5. Keputusan alias yang perlu diketahui

Merek → bahan generik (agar satu baris stok, bukan banyak baris kembar):

- **Minyak goreng**: Rose Brand, VIPCO, Sania, Minyak Kita, Kunci Mas, "2 LT",
  "Cooking Oil" → alias `Minyak Goreng`.
- **Margarin**: Simas / Sinas / Cimas / Sinar / Filma → alias `Margarine (Filma)`.
  Simas dkk. adalah **margarin** (Rp12.500/pcs), bukan minyak goreng; baris
  `Margarine (Filma)` kini menjadi baris generik margarin.
- **Krim masak**: Rich Gold / Richgold / Gold Label → alias `Cream` (harga sama,
  Rp57.500–58.500).
- **Saus Del Monte**: "Hot"/"Del bbq" dkk. → `Delmonte Saus Cabe` / `Barbeque Sauce`.
- **Bawang putih bubuk**: Desaku 100 g → `Bawang Putih Bubuk (YOA)`.
- **Sosis**: "Sosis", "SOSIS SAPI" → `Bernardi Horeca Sosis`.
- **Susu**: `FM 6F`/`Fm Ef`/`Fm 6P` dkk. → `Freshmilk Diamond`; `Fn GF`/`Fn gr` →
  `Freshmilk Greenfield`; Cimory → baris baru.
- **Kentang beku**: `Kentang 2.5kg` (Rp79.000) → `Kentang Shoestring`.

Sengaja **tidak** digabung:

- `Minyak Bimoli` tetap baris sendiri (riwayatnya terpisah, qty 0). Bisa
  dijadikan alias `Minyak Goreng` nanti bila disetujui.
- Pasangan yang sudah ada dan dibiarkan: Beans Robusta/Robusta Beans,
  Schweppes Soda/Soda Water Schweppes, Basil/Basil Leaves,
  Mayonaise/Mayones Maestro 1L, Sapi Cincang/Sapi Cincang 200gr,
  Ayam Cincang/Ayam Giling, Minyak Sunco/Tropical/Rizki/Goreng.

## 6. Penerapan ke produksi

Migrasi: `packages/backend/supabase/migrations/20261113150000_inventory_catalog_all_receipts.sql`

Sifat migrasi: **aditif dan idempoten** — tidak menghapus bahan, tidak mengganti nama,
tidak menyentuh riwayat stok/resep/pesanan. Yang dilakukan:

1. Snapshot `pos.inventory` → `pos.inventory_allreceipts_snapshot` (sekali saja).
2. Tambah 6 bahan baru (`inv_nov26_*`).
3. Gabungkan 527 alias baru tanpa menghapus alias lama (`pg_temp.merge_alias`).
4. Catat audit di `pos.inventory_catalog_update_log`.
5. Segarkan antrean `pos.inventory_item_candidates` tanpa menimpa keputusan manusia
   (`reviewed_by IS NULL`).

Backup sebelum eksekusi:
`~/backups/inventory-catalog-20261113/pre-allreceipts-20261113-035233.sql.gz`
(pada `vps-djiwa-tentram`).

Hasil verifikasi di produksi:

| Pemeriksaan | Sebelum | Sesudah | Harus |
| --- | ---: | ---: | --- |
| Baris inventaris | 166 | **172** | +6 |
| Total alias | 491 | **1.024** | naik |
| Nama bahan duplikat | 0 | **0** | 0 |
| Baris lama hilang | — | **0** | 0 |
| Nama lama berubah | — | **0** | 0 |
| `quantity` berubah | — | **0** | 0 |
| Alias lama hilang | — | **0** | 0 |
| Alias dimiliki 2 bahan | 1 | **1** | tetap (pasangan disengaja `Beans Robusta`/`Robusta Beans`) |

Bot `yumi-finance-agent.service` di-restart dan memuat ulang:
`Loaded 1029 alias entries for 172 inventory items`.

## 7. Yang masih perlu konfirmasi

### a. 462 nama di antrean review

Lihat `kandidat-bahan.csv`. Nama berfrekuensi tertinggi:

| Nama | Kemunculan | Dugaan |
| --- | ---: | --- |
| `MULTI MP08 1000G` / `MULTI MP08` | 69 | kemasan plastik (MP-08) |
| `TTL GRNLTDMSHROOM400` | 34 | jamur kaleng 400 g |
| `Juho` / `Djuho` | 45 | kecap ikan Djoe Hoa? perlu cek foto |
| `Tomat 12x25` | 18 | kemasan tomat, bukan buah tomat |
| `WINGS PORS BIRU 700` | 16 | sabun/deterjen? |
| `MAMALMN PP LEMON 610` | 15 | kemasan (PP cup) |
| `J. Lemo` | 14 | jus lemon? |
| `Belagu` | 12 | ? |
| `Jmimay` | 12 | mayones? |

Nama-nama ini tidak digabung karena bukti harga/satuan belum cukup untuk memastikan
identitasnya. Setelah dikonfirmasi, cukup tambahkan alias lewat halaman Stok Manual
atau migrasi kecil berikutnya.

### b. 13 struk tanpa bukti OCR

```
receipt_20260710_103859_rcpt_15.jpg
receipt_20260712_114245_rcpt_15.jpg
receipt_20260712_115426_rcpt_15.jpg
receipt_20260712_120801_rcpt_15.jpg
receipt_20260910_134216_rcpt_16.jpg
receipt_20260910_134341_rcpt_17.jpg
receipt_20260911_104939_rcpt_19.jpg
receipt_20260926_151735_rcpt_16.jpg
receipt_20261012_154340_rcpt_16.jpg
receipt_20261021_150624_rcpt_16.jpg
receipt_20261021_150758_rcpt_16.jpg
receipt_20261021_150828_rcpt_16.jpg
receipt_20261026_131814_rcpt_16.jpg
```

Item di dalamnya belum masuk hitungan. Bila perlu, struk ini bisa di-OCR ulang lalu
dijalankan melalui `analyze.py` yang sama.

## 8. Menjalankan ulang

```bash
# 1. ambil bukti (butuh akses DB produksi)
#    -> /tmp/ev_tx.json, /tmp/ev_items_ctx.json, /tmp/ev_ai_ctx.json, /tmp/live_inv.json
# 2. klasifikasi
/tmp/djiwa-stock-match-py311/bin/python reports/inventaris-lengkap-2026/analyze.py
# 3. bangun migrasi
python3 reports/inventaris-lengkap-2026/build_migration.py
```

`analyze.py` memakai `OVERRIDES_RAW` sebagai satu-satunya tempat keputusan manual;
ubah di sana bila ada nama yang salah target, lalu jalankan ulang dua langkah terakhir.
