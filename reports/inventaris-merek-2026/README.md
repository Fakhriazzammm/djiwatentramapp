# Audit merek bahan baku (13 Nov 2026)

Folder ini menyimpan bukti dan generator untuk migrasi
`packages/backend/supabase/migrations/20261113170000_inventory_brand_groups.sql`.

## Keputusan

- **Kategori = bahan dasar.** Satu bahan (mis. `Minyak Goreng`) punya beberapa baris
  merek. Merek tetap tertulis di nama baris supaya bisa dibandingkan harganya.
- **Baris = merek + ukuran.** Contoh `Minyak Goreng Rose Brand 2L`,
  `Minyak Goreng Sania 2L`.
- **Alias = ejaan/OCR dari merek yang sama.** Contoh `ROSE BRAND POUCH 2L` → baris
  Rose Brand 2L. Alias tidak dipakai untuk mencampur dua merek berbeda.
- **Baris generik dipertahankan** untuk pembelian tanpa merek (`Minyak`,
  `Cooking Oil`, `Gula pasir`).
- Hanya merek yang benar-benar berbeda yang dibuat baris baru (15 baris).
  Varian OCR seperti `Sinas`/`Cimas`/`Sinar` tetap alias `Simas`, dan
  `Rich Gold` tetap alias `Gold Label`, karena harga & produknya sama.

## Isi folder

| Berkas | Isi |
| --- | --- |
| `audit_merek.py` | Membaca 172 baris inventaris + 1.488 nama struk, memetakan grup bahan, mendeteksi merek dan ukuran. Menghasilkan CSV di bawah. `GROUP_MAP` adalah tempat utama untuk mengubah pemetaan grup. |
| `build_migration.py` | Menghasilkan SQL migrasi dari `NEW_ROWS`, `ALIAS_MOVES`, dan `ALIAS_ADDS`. |
| `grup-bahan.csv` | 172 baris lama + grup bahan yang diusulkan. |
| `calon-baris-merek.csv` | Kandidat baris merek sebelum disaring (37 kandidat, 15 dipakai). |
| `pindah-alias.csv` | Alias merek yang harus pindah dari baris generik. |
| `nama-tanpa-merek.csv` | Nama struk tanpa merek (calon baris generik / review). |

## Menjalankan ulang

```bash
# butuh /tmp/live_inv2.json, /tmp/ev_items_ctx.json, /tmp/ev_ai_ctx.json
python3 reports/inventaris-merek-2026/audit_merek.py
python3 reports/inventaris-merek-2026/build_migration.py
```

`build_migration.py` menulis langsung ke
`packages/backend/supabase/migrations/20261113170000_inventory_brand_groups.sql`.
Periksa diff sebelum menerapkan. Migrasi bersifat aditif: tidak menghapus baris,
tidak mengubah `quantity`, tidak menyentuh riwayat stok/resep/pesanan.

## Verifikasi produksi

Lihat `reports/inventaris-lengkap-2026/README.md` bagian 5 dan 6b.
