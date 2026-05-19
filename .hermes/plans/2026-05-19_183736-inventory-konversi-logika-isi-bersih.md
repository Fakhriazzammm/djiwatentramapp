# Plan: Pengembangan Logika Kolom Beli/Satuan + Isi Bersih + Konversi (Inventory)

## Goal
Merapikan dan memperjelas model pembelian inventory agar sesuai praktik operasional:
- **Beli + Satuan** = kebiasaan beli (contoh: `1 dus`)
- Tambah kolom baru: **Isi Bersih** (berapa isi dari unit beli, contoh `12`)
- Tambah kolom baru: **Satuan Isi Bersih** (unit isi, contoh `botol`)
- **Konversi** dipakai untuk konversi unit isi ke unit stok dasar (contoh `1 botol = 500 ml`)

Hasil akhir yang diinginkan:
- Formula konversi jelas, tidak ambigu
- Input user lebih natural sesuai kebiasaan pembelian
- Perhitungan stok/nilai stok tetap konsisten

---

## Current Context (hasil cek codebase)
Berdasarkan file `apps/web/src/routes/admin/inventory.lazy.tsx`, saat ini sudah ada field/logika:
- `preferredPurchaseQuantity` (Beli)
- `preferredPurchaseUnit` (Satuan beli)
- `unit` (satuan stok dasar)
- `displayUnit`
- `conversionFactor`
- `unitConversions`

Artinya fitur mirip **sudah ada sebagian**, tapi belum dipisahkan eksplisit menjadi model:
1) kemasan beli,
2) isi bersih kemasan,
3) konversi isi ke stok dasar.

Jadi request ini adalah **evolusi logika**, bukan fitur dari nol.

---

## Proposed Data Model (direkomendasikan)

### Konsep inti
Untuk setiap item inventory:
1. **Kemasan Beli**: `preferred_purchase_quantity` + `preferred_purchase_unit` (existing)
   - contoh: `1 dus`
2. **Isi Bersih per Kemasan**: `pack_net_quantity` + `pack_net_unit` (baru)
   - contoh: `12 botol`
3. **Konversi Isi ke Unit Stok Dasar**: `content_to_base_factor` (baru) — menggantikan peran `conversion_factor` lama
   - contoh: `1 botol = 500 ml`
4. **Unit Stok Dasar**: `unit` (existing)
   - contoh: `ml`

### Formula turunan
```
total_base_unit = preferred_purchase_quantity * pack_net_quantity * content_to_base_factor
```

- Contoh mineral:
  - `1 dus` × `12 botol` × `500 ml` = **6000 ml** per pembelian.
  - Stok di database tersimpan dalam **ml**.

### Hubungan dengan kolom existing `conversion_factor` lama
Di model lama:
```
conversion_factor = konversi dari 1 satuan display ke unit dasar
stok_per_beli = preferred_purchase_quantity * conversion_factor
```

Di model baru:
```
stok_per_beli = preferred_purchase_quantity * pack_net_quantity * content_to_base_factor
```

**Kesamaan:** Jika user tidak pernah pakai `display_unit` (langsung pakai `unit` dasar),
maka konversi lamanya bisa di-map sebagai:
```
conversion_factor_legacy = pack_net_quantity * content_to_base_factor
```
atau alternatif:
```
conversion_factor_legacy = content_to_base_factor
```
tergantung apakah `pack_net_unit == unit` (isi bersih langsung dalam unit dasar, tanpa "pack_net" sebagai lapisan perantara).

Untuk menghindari ambiguitas, **model baru memisahkan**:
- `pack_net_quantity` = jumlah unit isi per kemasan beli
- `content_to_base_factor` = konversi dari 1 unit isi ke unit stok dasar

→ **Keduanya bersama-sama** menggantikan `conversion_factor` lama.

---

## Kolom terbaru di pos.inventory

### Tabel `pos.inventory` — tambahan kolom (additive, tidak destructive)

| Nama Kolom | Tipe | Null | Default | Keterangan |
|---|---|---|---|---|
| `pack_net_quantity` | `numeric` | YES | `null` | Isi bersih per kemasan beli (angka). Contoh: 12 |
| `pack_net_unit` | `text` | YES | `null` | Satuan isi bersih. Contoh: 'botol' |
| `content_to_base_factor` | `numeric` | YES | `null` | Konversi dari 1 unit isi ke unit stok dasar. Contoh: 500 (ml/botol) |

### Visual tabel final

| Kolom | Sumber | Contoh Isi |
|---|---|---|
| Beli | `preferred_purchase_quantity` (existing) | 1 |
| Satuan (Beli) | `preferred_purchase_unit` (existing) | 'dus' |
| **Isi Bersih** | **`pack_net_quantity`** (baru) | 12 |
| **Satuan Isi** | **`pack_net_unit`** (baru) | 'botol' |
| **Konversi** | **`content_to_base_factor`** (baru) | 500 |
| Unit Dasar | `unit` (existing) | 'ml' |

---

### Detail Migration SQL

#### Migration: `20260520000001_inventory_packnet_conversion.sql`

Mengikuti pola migration existing `20260518000001_inventory_image_column.sql`:

```sql
-- 1. Add 3 new columns
ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS pack_net_quantity numeric;
ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS pack_net_unit text;
ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS content_to_base_factor numeric;

-- 2. Add column comment
COMMENT ON COLUMN pos.inventory.pack_net_quantity IS 'Isi bersih per kemasan beli (contoh: 12 botol per dus)';
COMMENT ON COLUMN pos.inventory.pack_net_unit IS 'Satuan isi bersih (contoh: botol)';
COMMENT ON COLUMN pos.inventory.content_to_base_factor IS 'Faktor konversi dari 1 pack_net_unit ke unit stok dasar (contoh: 500 ml/botol)';

-- 3. Drop + recreate public view (pos_inventory) — baris baru ditambahkan di akhir
DROP VIEW IF EXISTS public.pos_inventory CASCADE;

CREATE VIEW public.pos_inventory WITH (security_invoker = true) AS
SELECT
  source_id AS _id,
  ingredient_name AS "ingredientName",
  unit,
  quantity,
  low_stock_threshold AS "lowStockThreshold",
  display_unit AS "displayUnit",
  conversion_factor AS "conversionFactor",
  unit_conversions AS "unitConversions",
  base_recipe_source_id AS "baseRecipeId",
  default_brand_name AS "defaultBrandName",
  preferred_store_source_id AS "preferredStoreId",
  preferred_purchase_quantity AS "preferredPurchaseQuantity",
  preferred_purchase_unit AS "preferredPurchaseUnit",
  last_purchase_price AS "lastPurchasePrice",
  last_purchase_at AS "lastPurchaseAt",
  last_purchase_store_source_id AS "lastPurchaseStoreId",
  net_weight AS "netWeight",
  category,
  image_path AS "imagePath",
  pack_net_quantity AS "packNetQuantity",
  pack_net_unit AS "packNetUnit",
  content_to_base_factor AS "contentToBaseFactor",
  raw
FROM pos.inventory;

GRANT SELECT ON public.pos_inventory TO anon, authenticated;

-- 4. Recreate dependent view yang di-drop oleh CASCADE
CREATE OR REPLACE VIEW public.pos_inventory_latest_costs
WITH (security_invoker = true) AS
SELECT
  inventory._id AS "inventoryId",
  inventory."ingredientName",
  inventory.unit,
  inventory."displayUnit",
  inventory."conversionFactor",
  -- prefer new model: use content_to_base_factor * pack_net_quantity * preferred_purchase_quantity
  -- fallback to legacy conversion_factor * preferred_purchase_quantity
  COALESCE(
    inventory."contentToBaseFactor"::numeric * inventory."packNetQuantity"::numeric * inventory."preferredPurchaseQuantity"::numeric,
    inventory."conversionFactor"::numeric * inventory."preferredPurchaseQuantity"::numeric,
    inventory."conversionFactor"::numeric,
    inventory."lastPurchasePrice"::numeric
  ) AS "latestUnitCost",
  inventory."lastPurchaseAt" AS "latestRestockDate",
  NULL::numeric AS "avgCostPerUnit"
FROM public.pos_inventory AS inventory;
```

> **Catatan:** Nama view dan kolom disesuaikan dengan existing proyek. Sesuaikan nama view publik yang benar (cek `supabase/migrations` eksisting).

#### Pola pengerjaan migration
1. Generate file baru dengan timestamp > file terakhir
2. Apply migration via Supabase dashboard atau `supabase db push`
3. Verifikasi: `SELECT * FROM pos.inventory LIMIT 1` harus tampilkan kolom baru

---

---

## UI/UX Specification (table-first)

## Kolom yang ditampilkan (urutan inti)
1. Beli
2. Satuan (Beli)
3. **Isi Bersih** (baru)
4. **Satuan Isi Bersih** (baru)
5. Konversi (label berubah jadi `1 [pack_net_unit] = ? [unit]`)
6. Unit Stok Dasar
7. Nilai turunan ringkas (tooltip): `1 beli = X unit dasar`

### Detail UX per kolom

#### 1. Beli (`preferredPurchaseQuantity`)
| Aspek | Detail |
|---|---|
| Tipe input | `<input type="number" min={0} step="any" />` |
| States | `saving`: disabled + opacity-50; `error`: border-red focus:ring-red |
| Keyboard | Enter → blur → `saveMeta(row)`. Tab → fokus ke kolom Satuan Beli |
| Validation | OnBlur: jika < 0, reset ke 0 + toast warning. Jika > 0 dan kolom lain kosong, warning kecil. |
| Placeholder | "0" |
| Initial empty state | `""` (string kosong, bukan 0) agar user bisa null |

#### 2. Satuan (Beli) (`preferredPurchaseUnit`)
| Aspek | Detail |
|---|---|
| Tipe input | `<input list="...">` text dengan autocomplete dropdown unit kemasan |
| States | saving: disabled; error: focus-visible ring-red |
| Keyboard | Enter → saveMeta(row). Tab → Isi Bersih. Escape → cancel edit |
| Validation | OnBlur: jika kolom terisi tapi unit tidak dikenali, warning "satuan tidak dikenal" (non-blocking) |
| Placeholder | "dus" |
| Datalist | `inventory-unit-options-table` (existing) |

#### 3. Isi Bersih (`packNetQuantity`) — BARU
| Aspek | Detail |
|---|---|
| Tipe input | `<input type="number" min={0} step="any" />` |
| States | saving: disabled; error: border-red; computed: `w-[8ch]` |
| Keyboard | Enter → saveMeta(row). Tab → Satuan Isi. |
| Validation | **OnBlur**: jika <= 0 dan Satuan Isi terisi, highlight merah + tooltip "Isi bersih harus > 0". Jika Satuan Isi kosong, warning kecil saja. |
| Placeholder | "1" |
| Computed preview | Jika ketiga angka (isi bersih × konversi × beli) terisi, muncul `= X [unit]` di sebelah kanan sebagai teks muted |

#### 4. Satuan Isi Bersih (`packNetUnit`) — BARU
| Aspek | Detail |
|---|---|
| Tipe input | `<input list="...">` text dengan autocomplete |
| States | saving: disabled; error: border-red |
| Keyboard | Enter → saveMeta(row). Tab → Konversi |
| Validation | OnBlur: jika isi bersih terisi tapi satuan kosong, non-blocking warning |
| Placeholder | "botol" |
| Datalist | `inventory-unit-options-table` (existing) |
| Special | Jika user tulis satuan yang sama dengan `unit` dasar, Konversi otomatis di-preset ke `1` |

#### 5. Konversi (`contentToBaseFactor`)
| Aspek | Detail |
|---|---|
| Tipe input | `<input type="number" min={0} step="any" />` |
| Label dinamis | `1 [pack_net_unit] = ? [unit]` — berubah realtime sesuai input satuan. Contoh: pack_net_unit="botol", unit="ml" → label: `1 botol = ? ml` |
| States | saving: disabled; error: border-red; computed: `w-[10ch]` |
| Keyboard | Enter → saveMeta(row). Tab → kolom berikutnya |
| Validation | **OnBlur**: jika <= 0, border merah + toast "Konversi harus > 0". Jika isi bersih = 0, warning. |
| Placeholder | "1" |
| Live compute | Saat user mengetik, di kanan muncul preview: `= [beli] x [isi] x [konversi] [unit]` dalam teks muted berukuran kecil |

#### 6. Unit Stok Dasar (`unit`)
| Aspek | Detail |
|---|---|
| Tipe | kolom read-only / small badge |
| Fungsi | Ditampilkan sebagai unit referensi di label konversi dan preview. |
| Edit | Bisa diedit langsung dari cell satuan existing (yang sekarang) |

#### 7. Preview Baris: `1 beli = X unit dasar`
| Aspek | Detail |
|---|---|
| Posisi | Tooltip pada icon info di sebelah judul kolom, ATAU teks muted di baris baru di bawah konversi |
| Format | `1 dus × 12 botol × 500 ml/botol = 6000 ml` |
| Update | Realtime saat user mengetik (debounce 300ms) |

### States tabel secara keseluruhan

| State | Visual | Trigger |
|---|---|---|
| **loading** | 3 skeleton row dengan shimmer | Data belum siap |
| **empty** | Tabel kosong + CTA "Tambah Bahan Baru" | `filteredRows.length === 0` |
| **normal** | Tabel penuh dengan data | Normal |
| **saving row** | Cell currently editing jadi disabled + spinner kecil di sebelah kanan field | `saveState[row.id] === "saving"` |
| **save error row** | Border merah pada cell yang gagal + toast di pojok | `saveState[row.id] === "error"` |
| **saved success** | Checkmark hijau kecil di sebelah cell (hilang setelah 2 detik) | `saveState[row.id] === "saved"` |

### Error handling per skenario

| Skenario | Validasi waktu | Feedback |
|---|---|---|
| Isi Bersih <= 0 tapi Satuan Isi terisi | OnBlur | Border merah + tooltip "Isi bersih harus > 0" |
| Konversi <= 0 | OnBlur | Border merah + toast "Nilai konversi harus lebih dari 0" |
| Isi Bersih kosong tapi Konversi terisi | OnBlur | Warning muted "Isi bersih belum diisi, konversi diabaikan" |
| Beli = 0 | OnBlur | Warning "Jumlah beli 0, periksa kembali" |
| Save gagal (network) | OnSave | Toast error + border merah permanen sampai edit ulang |
| Kombinasi menghasilkan 0 | Compute time | Preview `= 0 ml` dengan warna oranye, tooltip "Periksa input angka" |

---

## Integration Points

### AI/LLM integration
- Autofill AI inventory perlu output tambahan:
  - `packNetQuantity`
  - `packNetUnit`
  - `contentToBaseFactor`
- Prompt AI diperbarui agar mengenali pola kemasan umum (dus→botol, renteng→sachet, dll).

### Telegram bot integration
- Pesan notifikasi stok/restock dapat menampilkan format baru:
  - `Beli: 1 dus | Isi: 12 botol | 1 botol = 500 ml`
- Pastikan parser bot tetap kompatibel dengan data legacy.

### Purchasing agent sync
- Agent pembelian membaca `Beli + Satuan + Isi Bersih + Konversi` untuk estimasi pembelian.
- Hindari langsung pakai `conversion_factor` legacy saat kolom baru tersedia.

---

## Multi-source Data Flow
1. **Purchasing / transaksi masuk** menambah stok berdasarkan kemasan beli
2. **Normalisasi**: kemasan beli → isi bersih → unit dasar stok
3. **Inventory ledger** menyimpan stok dalam unit dasar konsisten
4. **Recipe / costing** mengonsumsi unit dasar yang sama agar HPP akurat
5. **Reporting** (nilai stok, low stock, prediksi habis) memakai angka turunan final

Ringkas: `Pembelian (kemasan) -> Konversi berlapis -> Stok dasar -> Recipe/HPP/Reporting`.

---

## Import/Export Symmetry
Karena fitur ini berhubungan template operasional, import/export harus simetris:

### Import
Template minimal memuat kolom:
- nama bahan
- beli_qty
- beli_unit
- isi_bersih_qty
- isi_bersih_unit
- konversi_ke_unit_dasar (content_to_base_factor)
- unit_dasar

### Export
Export harus mengeluarkan format visual/template yang sama (bukan hanya flatten tanpa konteks), agar bisa:
- diekspor
- diedit user
- diimpor kembali tanpa kehilangan makna kolom

### Round-trip validation
- Import file A -> simpan -> export -> import ulang
- Nilai turunan `1 beli = X unit dasar` harus tetap identik.

---

## No-hardcode Audit
Yang **wajib data-driven** (tidak hardcode):
- daftar unit kemasan
- daftar unit isi
- mapping konversi default per kategori bahan
- label template import/export
- threshold/aturan validasi bisnis (jika configurable admin)

Yang boleh sementara hardcoded hanya placeholder unresolved record (mis. unit belum dipetakan), dengan badge warning dan action perbaikan.

---

## Mapping Backfill dari Data Lama ke Kolom Baru

### Masalah
Data lama hanya punya `conversion_factor` + `display_unit`. Tidak ada pemisahan eksplisit antara "isi bersih per kemasan" dan "konversi per unit isi". Backfill harus menerka nilai `pack_net_quantity`, `pack_net_unit`, dan `content_to_base_factor` dari data yang ada.

### Strategi backfill bertahap

#### Fase 1: Detect mode lama
Deteksi pola data yang umum:

**Pola A: display_unit = unit (atau display_unit = null), conversion_factor ada**
- Artinya: tidak ada kemasan/kemasan langsung dalam unit dasar.
- Contoh: `conversion_factor = 1`, `unit = "kg"`, `display_unit = "kg"`
- Backfill:
  - `pack_net_quantity = preferred_purchase_quantity ?? 1`
  - `pack_net_unit = display_unit ?? unit`
  - `content_to_base_factor = conversion_factor`

**Pola B: display_unit ≠ unit, conversion_factor ada**
- Artinya: ada lapisan kemasan.
- Contoh: `preferred_purchase_quantity = 1`, `preferred_purchase_unit = "dus"`, `unit = "ml"`, `display_unit = "botol"`, `conversion_factor = 500`
- Backfill:
  - `pack_net_quantity = 1` (default: 1 kemasan = 1 unit isi)
  - `pack_net_unit = display_unit`
  - `content_to_base_factor = conversion_factor`

**Pola C: conversion_factor null**
- Tidak ada data konversi.
- Backfill:
  - Semua kolom baru = `null` (user harus isi manual)
  - Tandai item dengan warning badge "Konversi belum diatur"

#### Fase 2: Script SQL backfill
```sql
-- Backfill untuk data dengan display_unit dan conversion_factor
UPDATE pos.inventory
SET
  pack_net_quantity = COALESCE(preferred_purchase_quantity, 1),
  pack_net_unit = COALESCE(display_unit, unit),
  content_to_base_factor = conversion_factor
WHERE
  pack_net_quantity IS NULL
  AND conversion_factor IS NOT NULL;
```

#### Fase 3: Validasi hasil backfill
- `SELECT COUNT(*) FROM pos.inventory WHERE pack_net_quantity IS NULL` → jumlah item yang belum di-backfill
- Cek 10 item random: pastikan `content_to_base_factor * pack_net_quantity * preferred_purchase_quantity` ≈ `conversion_factor * preferred_purchase_quantity` (konsisten dengan formula lama)

#### Fase 4: User-facing migration assistant
Di halaman inventory, tambahkan banner:
> "⚠️ [N] item belum memiliki data Isi Bersih + Konversi. [Perbaiki Sekarang]"
Filter otomatis menampilkan item yang `pack_net_quantity IS NULL`.

---

## Step-by-step Implementation Plan
1. Finalisasi naming kolom DB (snake_case + mapping camelCase frontend)
2. Buat additive migration SQL (3 kolom + view update + GRANT)
3. Backfill script jalankan di DB
4. Update hook read/write inventory agar baca/tulis kolom baru + fallback legacy
5. Tambah 2 kolom UI baru (Isi Bersih, Satuan Isi Bersih) di tabel `/admin/inventory`
6. Ubah label/logika kolom Konversi menjadi eksplisit `1 [pack_net_unit] = ? [unit]`
7. Tambah computed helper `computeBasePerPurchase(row)` dan `formatBasePerPurchaseText(row)`
8. Update validasi UX (OnBlur, boundary, warning) sesuai tabel detail per kolom
9. Update import/export template + validator
10. Update AI autofill contract
11. Update notifikasi Telegram/purchasing summary
12. QA regresi (stok, nilai stok, HPP, low stock alert)

---

## Files Likely to Change
- `apps/web/src/routes/admin/inventory.lazy.tsx`
- `apps/web/src/hooks/use-hybrid-write-actions.ts`
- `apps/web/src/hooks/use-hybrid-pos-data.ts`
- `apps/web/src/hooks/use-hybrid-inventory-admin-data.ts`
- `supabase/migrations/20260520000001_inventory_packnet_conversion.sql`
- file export/import inventory (jika terpisah util/service)
- edge function terkait AI/Telegram bila membaca format inventory

---

## Tests / Validation
- Typecheck frontend: `npx tsc --noEmit`
- Build frontend: `npx vite build`
- Manual test inventory:
  1) input 1 dus, isi 12 botol, konversi 500 ml
  2) cek preview `1 beli = 6000 ml`
  3) cek label konversi dinamis: `1 botol = ? ml`
  4) test validasi: isi bersih 0 → border merah, konversi negative → toast
  5) tambah stok & lihat perubahan nilai stok
  6) pastikan save row cepat (no freeze)
- Round-trip import/export template
- Regression: data lama tanpa kolom baru tetap bisa edit/simpan

---

## Risks, Tradeoffs, Open Questions

### Risks
- Ambiguitas unit jika user isi unit bebas tanpa normalisasi
- Data lama bisa tidak konsisten saat fallback
- Integrasi bot/AI bisa baca field lama jika tidak sinkron

### Tradeoffs
- Model baru lebih panjang inputnya, tapi jauh lebih akurat & audit-friendly
- Menjaga fallback legacy menambah kompleksitas sementara, tapi aman untuk transisi

### Open Questions (perlu klarifikasi user)
1. Apakah **label konversi** akan berubah realtime (1 botol = ... ml) saat user mengetik satuan isi?
2. Untuk tooltip `1 beli = X unit dasar`, lebih suka posisi tooltip atau inline teks muted di cell?
3. Apakah prefer untuk backfill otomatis (Fase 2 script SQL langsung) atau manual per item via UI assistant?
4. Apakah perlu dukung multi-level kemasan di fase 2 (mis. 1 karton = 6 dus, 1 dus = 12 botol)?

---

## Rekomendasi implementasi
Mulai dari **single-level conversion** dulu (seperti contoh mineral), karena paling cepat stabil dan sesuai kebutuhan saat ini. Setelah stabil, baru pertimbangkan multi-level packaging sebagai fase 2.
