# Plan: Sinkron Resep Ala Carte + Process View di `/admin/recipe/view`

## Goal
Menyelaraskan resep **Ala Carte** (berdasarkan gambar referensi) ke sistem recipe yang ada, lalu menampilkan **alur proses/step-by-step** pada halaman `/admin/recipe/view` agar konsisten dengan format operasional di gambar.

## Current Context (hasil audit singkat)
- Route terkait recipe sudah ada:
  - `/admin/recipe/` → matrix/editor (`RecipeMatrixPage`)
  - `/admin/recipe/view` → read mode (`RecipeViewPage`)
  - `/admin/recipe/hpp` → HPP page
- `/admin/recipe/view` sudah punya konsep step-by-step (`ProductRecipeDetail`), tapi masih perlu disesuaikan ke format process ala gambar.
- Data existing sempat tercampur antara versi nasi/set menu vs ala carte.
- Koreksi penting dari user: bahan ayam harus **"1 paha utuh"** (bukan `1 gr`).

## Scope
### In scope
1. Finalisasi mapping resep ala carte untuk:
   - Ayam Rempah Kemangi
   - Ayam Mentega
2. Update recipe data agar tidak ikut komponen non-ala-carte (contoh: beras untuk versi nasi).
3. Buat/rapikan **Base Recipe** khusus:
   - Based Ayam Mentega Sauce
   - Based Kemangi Sauce
   - Based Paha Ayam Mentega
4. Perbaikan tampilan `/admin/recipe/view` agar process mengikuti gambar:
   - urutan step jelas
   - label process lebih operasional
   - satuan tampil konsisten dengan resep

### Out of scope
- Redesign total `/admin/recipe/hpp`
- Perubahan schema database destruktif
- Migrasi massal menu lain di luar 2 menu target

## Proposed Approach
Gunakan pendekatan **minimal-change, additive, aman**:
1. Kunci dulu definisi resep ala carte (single source of truth untuk 2 menu target).
2. Terapkan update recipe data (targeted update by product/menu, bukan bulk rewrite).
3. Sinkronkan render process di `/admin/recipe/view` supaya menampilkan alur sesuai gambar tanpa memecah arsitektur existing.

## Detailed Plan

### Phase 1 — Final Mapping & Normalisasi Satuan
1. Ambil final resep ala carte dari review user (approved basis):
   - Daging/Paha Ayam → `1 paha utuh`
   - Sauce + garnish sesuai gram/pcs pada gambar
2. Definisikan aturan satuan tampilan:
   - `gr` untuk gram
   - `pcs` untuk piece
   - `paha utuh` sebagai unit tekstual khusus
3. Buat mapping internal nama bahan agar tidak mismatch:
   - nama display (UI) vs nama inventory (DB)

**Output phase:** dokumen mapping final yang siap dipakai untuk update data.

---

### Phase 2 — Update Data Resep Ala Carte (Targeted)
1. Identifikasi product ID target:
   - Nasi/Ayam Rempah Kemangi (variant ala carte yang dimaksud)
   - Nasi/Ayam Mentega (variant ala carte yang dimaksud)
2. Cek recipe existing per product:
   - bahan mana yang harus dihapus (contoh: beras untuk versi non ala carte)
   - bahan mana yang dipertahankan/diganti takaran
3. Eksekusi update recipe secara idempotent:
   - overwrite `ingredients` untuk recipe target (bukan append liar)
   - pastikan referensi inventoryId valid
4. Trigger sinkronisasi turunan (HPP sync hook yang sudah ada) agar cost source ikut update.

**Output phase:** recipe data untuk 2 menu target konsisten ala carte.

---

### Phase 3 — Pembuatan/Rapikan Base Recipe (3 item wajib)
1. Identifikasi apakah base recipe berikut sudah ada atau belum:
   - Based Ayam Mentega Sauce
   - Based Kemangi Sauce
   - Based Paha Ayam Mentega
2. Jika sudah ada:
   - audit komposisi bahan + takaran + target output unit
   - normalisasi nama agar konsisten dengan naming di gambar
3. Jika belum ada:
   - buat base recipe baru dari editor base recipe existing
   - pastikan otomatis terhubung ke inventory item base (`baseRecipeId`) bila flow hook mendukung
4. Sinkronkan pemakaian base recipe pada resep ala carte target:
   - Ayam Mentega menggunakan Based Ayam Mentega Sauce + Based Paha Ayam Mentega
   - Ayam Rempah Kemangi menggunakan Based Kemangi Sauce + Based Paha Ayam Mentega (jika sesuai SOP final)

**Output phase:** tiga base recipe tersedia dan terhubung ke resep ala carte target.

---

### Phase 4 — Perbaikan `/admin/recipe/view` agar “process seperti gambar”
1. Audit komponen existing di `ProductRecipeDetail`:
   - Step 1 (siapkan bahan)
   - Step 2 (base recipe opsional)
   - Step akhir (sajikan)
2. Sesuaikan semantics process agar lebih dekat ke gambar:
   - gunakan naming step yang operasional
   - tampilkan komponen ayam sebagai `1 paha utuh` secara eksplisit
   - kelompokkan bahan base/sauce/garnish secara jelas
3. Tambahkan aturan render satuan:
   - unit teks custom tetap tampil apa adanya (`paha utuh`)
   - fallback aman bila item inventory orphan/missing
4. Rapikan microcopy agar tidak ambigu antara “nasi menu” vs “ala carte”.

**Output phase:** halaman `/admin/recipe/view` menampilkan process yang terbaca seperti SOP pada gambar.

---

### Phase 5 — Validasi
1. Verifikasi data:
   - cek dua menu target di `/admin/recipe` matrix
   - cek detail list bahan dan takaran
2. Verifikasi process view:
   - buka `/admin/recipe/view`
   - klik 2 menu target
   - cek urutan step + unit + label
3. Verifikasi side effect:
   - tidak mengubah recipe menu lain
   - tidak ada crash saat inventory item missing
4. Jika tersedia, jalankan build/typecheck minimal area web app.

## Files Likely to Change
- `apps/web/src/components/admin/recipe-view.tsx`
- (opsional jika perlu helper bersama) `apps/web/src/components/admin/recipe-book.tsx`
- data update path melalui hook write action existing (tanpa ubah schema)

## Database / Data Impact
- Tidak ada migration schema.
- Hanya update data recipe untuk product target.
- Risiko rendah, tapi perlu validasi menu varian agar tidak salah tembak (ala carte vs paket/nasi).

## UI/UX Specification (ringkas)
- Process harus terbaca sebagai urutan kerja dapur.
- Step berisi:
  - apa yang disiapkan
  - takaran jelas
  - output akhir
- Terminologi konsisten:
  - hindari campur “set menu / paket” bila konteks ala carte.

## Risks & Mitigation
1. **Salah target product varian**
   - Mitigasi: lock product ID + nama sebelum write.
2. **Unit campur (gr vs paha utuh) tidak konsisten**
   - Mitigasi: formatter unit eksplisit + pengecekan manual di view.
3. **Recipe view salah klasifikasi base ingredient**
   - Mitigasi: fallback by explicit ingredient mapping untuk 2 menu ini bila heuristic nama tidak cukup.

## Open Questions (untuk review sebelum eksekusi)
1. Nama final yang dipakai di UI: tetap `Nasi Ayam ...` atau diganti `Ayam ...` untuk mode ala carte?
2. Untuk `Selada 20 pcs`, apakah ingin tetap `pcs` atau disesuaikan ke unit operasional lain (mis. `gr`) jika nanti standar gudang berubah?
3. Apakah process view perlu menampilkan **prep time**/catatan plating seperti di SOP gambar (jika ada)?

## Acceptance Criteria
- Dua menu target punya resep ala carte sesuai gambar review.
- `Daging/Paha Ayam` tampil sebagai **1 paha utuh** di context process.
- `/admin/recipe/view` menampilkan process yang konsisten dengan alur gambar.
- Tidak ada regresi pada menu recipe lain.
