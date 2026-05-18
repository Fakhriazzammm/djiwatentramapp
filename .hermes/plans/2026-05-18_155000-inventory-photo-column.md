# Plan: Kolom Foto di Tabel Inventory

**Date:** 2026-05-18
**Project:** djiwatentramapp (apps/web)

## Goal

Menambahkan kolom **Foto/Thumbnail** di tabel inventory, di paling kiri sebelum kolom **Bahan**. User bisa:
1. **Upload file** dari lokal komputer
2. **Copy-paste URL gambar** dari internet
- Keduanya otomatis tersimpan di Supabase Storage + kolom DB.

## Current Context

### Database
- **Table:** `pos.inventory` (private schema), tidak punya kolom image/photo
- **Public view:** `public.pos_inventory` — mapping kolom dari `pos.inventory`, juga tidak punya image
- **Existing storage:** `app-assets` bucket sudah ada (public, 5MB, image types)
- **Existing pattern:** Produk (`pos.products`) punya kolom `image` yang nyimpen storage path → `getPublicUrl()` untuk render

### Frontend
- `InventoryTable` komponen render tabel di `inventory.lazy.tsx`
- `InventoryWorkspaceRow` type — definisi kolom per baris tabel
- `loadWorkspace()` — fetch data, panggil `fetchInventoryRows()` → `useSupabaseValue`
- `saveMeta()` — udah handle update field `displayUnit`, `conversionFactor`, dll via `updateItemMutation`
- `useHybridStorageUpload()` — udah ada untuk upload ke `app-assets`
- `useHybridUpdateInventoryItem()` — udah ada untuk update inventory record

### Existing image flow (products)
```
User pilih file → compress → upload ke supabase.storage("app-assets") → dapat publicUrl 
    → simpan path ke DB kolom image → render <img src={publicUrl} />
```

## Proposed Approach

### Storage strategy
**Opsi: Simpan storage path (bukan full URL).**
- Kenapa: Konsisten dengan produk, lebih portabel (ganti bucket name ga perlu update data), existing code sudah handle ini.
- Kecuali user paste URL eksternal → simpan URL langsung (bukan upload ke storage dulu).

### UX flow

#### Flow 1: Upload file
```
[Klik area foto] → [File picker (image/*)]
    → Kompres auto (pakai compression pattern existing) 
    → Upload ke app-assets/inventory/
    → Simpan storage path ke pos.inventory.image_path
    → Render thumbnail
```

#### Flow 2: Paste URL dari internet
```
[Click kanan → Paste di input URL (modal popup)]
    → Validasi URL valid
    → Simpan URL langsung ke pos.inventory.image_path (raw URL, bukan storage path)
    → Render thumbnail via <img src={url} />
```

**Deteksi:** Kalau value diawali `http://` atau `https://` → external URL. Kalau tidak → storage path (pake `getPublicUrl()`).

## Step-by-Step Plan

### Step 1: Database Migration
**File:** `supabase/migrations/20260518000001_inventory_image_column.sql`

```sql
-- Add image_path column to pos.inventory
ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS image_path TEXT;

-- Update public view to include image_path
CREATE OR REPLACE VIEW public.pos_inventory
WITH (security_invoker = true) AS
SELECT
  source_id as _id,
  ingredient_name as "ingredientName",
  unit,
  quantity,
  low_stock_threshold as "lowStockThreshold",
  display_unit as "displayUnit",
  conversion_factor as "conversionFactor",
  unit_conversions as "unitConversions",
  base_recipe_source_id as "baseRecipeId",
  default_brand_name as "defaultBrandName",
  preferred_store_source_id as "preferredStoreId",
  preferred_purchase_quantity as "preferredPurchaseQuantity",
  preferred_purchase_unit as "preferredPurchaseUnit",
  last_purchase_price as "lastPurchasePrice",
  last_purchase_at as "lastPurchaseAt",
  last_purchase_store_source_id as "lastPurchaseStoreId",
  image_path as "imagePath",
  category,
  raw
FROM pos.inventory;
```

### Step 2: Update Type Definitions
**File:** `apps/web/src/routes/admin/inventory.lazy.tsx`

- Tambah `imagePath?: string | null;` ke `InventoryWorkspaceRow`
- Update `getInlineValue()` fallback untuk include `imagePath`
- Update `setInlineField()` type union untuk include `"imagePath"`
- Update `inlineValues` default shape include `imagePath: ""`

### Step 3: Update Workspace Fetch
**File:** `apps/web/src/hooks/use-hybrid-inventory-admin-data.ts`

Di `fetchInventoryRows()`, pastikan `imagePath` ikut di-select dari view.

### Step 4: Update colgroup — geser kolom
**File:** `apps/web/src/routes/admin/inventory.lazy.tsx`

Sisipkan `<col className="w-[3.5rem]" />` paling pertama, geser semua kolom lain ke kanan. Total kolom: 15.

### Step 5: Tambah Photo Cell di Table Header + Body
**File:** `apps/web/src/routes/admin/inventory.lazy.tsx`

**Header:** `<th className="w-[3.5rem] px-1 py-2 text-center">📷</th>`

**Body cell (setiap row):**
- Tampilkan thumbnail lingkaran 28×28px
- Kalau `imagePath` kosong: lingkaran dotted dengan icon kamera (plus tooltip "Klik untuk upload/paste URL")
- Kalau ada gambar: tampilkan thumbnail dengan loading state
- **Klik cell:** muncul popup/modal kecil dengan 2 tab:
  - Tab **Upload**: input file (accept="image/*"), auto-compress, upload, save
  - Tab **URL**: input text untuk paste URL, validasi, save

**Pertimbangan UX:**
- Modal cukup kecil, posisi di atas cell (popover, bukan full modal)
- Jangan pakai state per-row yang berat — cukup satu modal global dengan `selectedImageRow`
- Saat upload: loading spinner di thumbnail, setelah selesai refresh
- **Hindari click-to-edit pattern** karena image ga bisa di-inline kayak text input. Pakai click-to-open-popover.

### Step 6: Image Upload Logic
**File:** `apps/web/src/routes/admin/inventory.lazy.tsx`

```typescript
const handleInventoryImageUpload = async (row: InventoryWorkspaceRow, file: File) => {
  let uploadBlob: Blob = file;
  let contentType = file.type || "image/jpeg";
  
  // Compress if oversized (>1MB)
  if (file.size > 1_000_000) {
    const compressed = await compressFileToLimit(file);
    uploadBlob = await fetch(compressed).then(r => r.blob());
    contentType = "image/jpeg";
  }
  
  const storageId = await generateUploadUrl({
    file: uploadBlob,
    contentType,
    fileName: `inventory-${row.inventoryId}.${extFromMime(contentType)}`,
    folder: "inventory",
  });
  
  // Save storage path to DB
  await updateItemMutation({
    id: row.inventoryId,
    imagePath: storageId,  // storage path
  });
};
```

### Step 7: Image Render Utility
**File:** `apps/web/src/routes/admin/inventory.lazy.tsx`

```typescript
function getInventoryImageUrl(imagePath?: string | null): string | null {
  if (!imagePath) return null;
  // External URL
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  // Storage path → get public URL
  const supabase = createClient();
  const { data } = supabase.storage.from("app-assets").getPublicUrl(imagePath);
  return data.publicUrl;
}
```

### Step 8: Update saveMeta — include imagePath
**File:** `apps/web/src/routes/admin/inventory.lazy.tsx`

`saveMeta()` harus handle field `imagePath`:

```typescript
// Perubahan deteksi: tambah imagePath comparison
inline.imagePath.trim() === (row.imagePath ?? "") &&
```

```typescript
// Perubahan update: include imagePath
await updateItemMutation({
  ...,
  imagePath: inline.imagePath.trim() || undefined,
});
```

## UI/UX Specification

### States

| State | Display |
|---|---|
| **Empty (no image)** | Lingkaran border-dashed, icon kamera, tooltip "Klik untuk tambah foto" |
| **Loading/saving** | Lingkaran dengan spinner |
| **Image loaded** | Lingkaran dengan thumbnail crop (object-fit: cover) |
| **Error (broken URL)** | Lingkaran border-dashed merah, icon broken image |
| **Uploading** | Lingkaran dengan progress spinner + overlay "Uploading..." |

### Image Popover
- Trigger: click on photo cell
- Position: anchored to cell
- Width: ~280px
- Tabs: **Upload** | **URL**
- Tombol: "Hapus Foto" (confirm, clear imagePath), "Simpan", "Batal"

### Mobile
- Thumbnail tetap sama (28×28px)
- Popover full-width di mobile
- File picker via native `<input type="file" accept="image/*" capture="environment">`

## Integration Points

### Existing hooks (reuse)
| Hook | Digunakan untuk |
|---|---|
| `useHybridStorageUpload()` | Upload file ke app-assets |
| `useHybridUpdateInventoryItem()` | Simpan imagePath ke DB |
| `compressFileToLimit()` | Kompres gambar besar (dari products.lazy.tsx) |
| `createClient()` | Supabase client untuk getPublicUrl |

### Purchasing Agent
- Saat Yumi Purchasing Agent kirim marketlist, bisa include foto bahan
- Foto dari hasil scrapping/search → disimpan sebagai external URL

## Multi-Source Data Flow
```
User upload file → compress → Supabase Storage (app-assets/inventory/) → storage path → DB
User paste URL   → validasi → simpan raw URL → DB
Render           → check prefix: storage path → getPublicUrl() / raw URL → <img>
```

## Hardcode Audit
- `imagePath`: ga ada hardcode — semua dari user action (upload/paste)
- Bucket name `app-assets`: sudah diambil dari config, bukan hardcode
- Folder path `inventory/`: bisa dijadikan constant

## Files Likely to Change

| File | Changes |
|---|---|
| `supabase/migrations/20260518000001_inventory_image_column.sql` | **New** — alter table + recreate view |
| `apps/web/src/hooks/use-hybrid-inventory-admin-data.ts` | Add `imagePath` to select |
| `apps/web/src/routes/admin/inventory.lazy.tsx` | Type, colgroup, header cell, body cell, popover, upload logic, saveMeta |
| `apps/web/src/types/backend-compat.ts` (maybe) | Tambah `imagePath` di Doc<"inventory"> type |

## Risks & Tradeoffs

| Risk | Mitigation |
|---|---|
| **Storage cost** — gambar inventori bisa banyak | Kompres auto ke <1MB, ukuran thumbnail kecil |
| **Broken external URLs** — gambar dari internet bisa ilang | Tampilkan fallback icon, kasih tombol "Upload ulang" |
| **UX lambat** — upload butuh waktu | Kompres + upload async, loading state di thumbnail |
| **Storage path vs URL ambiguity** — sulit bedain storage path dan external URL | Prefix check: `http` → URL, sisanya → storage path. Jelas dan proven (existing pattern produk) |
| **CORS issues** — external URLs mungkin diblok | Udah di-handle browser native, fallback broken icon |

## Open Questions

1. **Apakah perlu dua mode input (upload + URL) atau cukup upload doang?** — User request menyebut "upload atau copy paste link gambar dari internet", jadi dua-duanya.
2. **Image di popover full-size atau thumbnail preview?** — Thumbnail preview di popover + link "Buka gambar asli" untuk external URL.
3. **Kompresi otomatis atau manual?** — Auto-compress >1MB (ikuti pattern produk yang sudah ada).
4. **Apakah foto perlu muncul di Yumi Purchasing Agent response?** — Bisa jadi fitur tambahan nanti.

## Verification

1. Buka `/admin/inventory` → kolom foto muncul di kiri Bahan
2. Klik cell kosong → popover muncul dengan Upload / URL tab
3. Upload file → thumbnail muncul setelah save
4. Paste URL dari internet (contoh: Google Images) → thumbnail muncul
5. Hapus foto → kembali ke icon kamera
6. Refresh halaman → foto tetap muncul (persist)
7. Hover tooltip pada foto yang broken → pesan error
