# Plan: Tambah Kolom "Beli" di Tabel Inventory

## Goal

Menambahkan kolom **"Beli"** di tabel `/admin/inventory` di sebelah kanan kolom **Min**, yang menunjukkan jumlah pembelian tipikal (preferensi) setiap bahan saat restock. Contoh: galon air biasanya dibeli 2 galon, minyak goreng biasanya 5 liter, dll.

## Current Context

### Data yang sudah ada
- **`InventoryWorkspaceRow.preferredPurchaseQuantity`** (line 91) — field jumlah beli preferensi, sudah ada di tipe data
- **`InventoryWorkspaceRow.preferredPurchaseUnit`** (line 92) — field satuan beli preferensi
- **Inline value system** sudah support `preferredPurchaseQuantity` (line 3961, 4257-4262, 4289)
- **`saveMeta()`** (line 4414-4416, 4513) — sudah menyimpan `preferredPurchaseQuantity` ke database via `updateItemMutation`
- **Data fallback** di `getInlineValue()`: pakai `latestTransaction.purchaseQuantity` jika ada, baru fallback ke `row.preferredPurchaseQuantity`
- **Database** (`pos_inventory`) sudah punya kolom `preferredPurchaseQuantity` dan `preferredPurchaseUnit`

### Yang belum ada
- ❌ **Kolom "Beli" tidak tampil** di tabel utama — hanya bisa diedit di mode detail/expanded
- ❌ Tidak ada `<th>Beli</th>` di header
- ❌ Tidak ada `<td>` input untuk preferredPurchaseQuantity di baris tabel

### Column layout saat ini (line 5000-5019)
```
Bahan | Kategori | Menu | Supplier | Stok | Min | Satuan
```
Yang diminta: tambah **Beli** setelah Min → jadi:
```
Bahan | Kategori | Menu | Supplier | Stok | Min | Beli | Satuan
```

## Approach

Karena data, inline state, dan save logic **sudah ada**, yang perlu dilakukan adalah **penambahan UI column di 3 tempat**:
1. **Header** — tambah `<th>Beli</th>` di line 5018 (setelah Min, sebelum Satuan)
2. **Data cell** — tambah `<td>` input number setelah Min input (line 5370 area)
3. **Skeleton/loading** — tambah placeholder untuk kolom Beli di skeleton rows

### Detail implementasi

#### A. Header column (line 5018-5019)
Insert setelah `<th>Min</th>` (line 5018):
```tsx
<th className="px-2 py-1.5 text-center font-semibold text-muted-foreground/70 text-[10px]">Beli</th>
```

#### B. Data cell input (after line 5370, after Min input `</td>`)
```tsx
<td className="px-2 py-1.5 align-middle text-center">
  <input
    className="mx-auto w-14 rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-center font-semibold text-[10px] text-muted-foreground outline-none focus:border-border focus:bg-background"
    onBlur={() => void saveMeta(row)}
    onChange={(e) => setInlineField(row, "preferredPurchaseQuantity", e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        void saveMeta(row);
        (e.target as HTMLInputElement).blur();
      }
    }}
    type="number"
    value={inline.preferredPurchaseQuantity}
  />
</td>
```

#### C. Skeleton loading (line ~5210 area)
Tambah placeholder `<td>` kosong untuk kolom Beli di baris skeleton.

#### D. Quick-add row (line ~5276 area)
Tambah `<td>—</td>` placeholder di baris quick-add (tambah bahan baru).

### Kompleksitas
- **Rendah** — semua logika bisnis (data fetching, save, validation) sudah ada
- Tidak perlu perubahan di Supabase, hooks, atau API layer
- Hanya perubahan UI murni di 1 file: `inventory.lazy.tsx`

## Files Berubah

| File | Perubahan |
|---|---|
| `apps/web/src/routes/admin/inventory.lazy.tsx` | +4 lokasi: header, data cell, skeleton, quick-add |

Tidak ada file lain yang berubah.

## Daftar Lokasi Edit (line numbers akurat)

1. **Header** — setelah line 5018 (`<th>Min</th>`), sebelum line 5019 (`<th>Satuan</th>`)
2. **Data cell** — setelah block Min input (sekitar line 5370), di antara `</td>` Min dan `<td>` Satuan
3. **Skeleton** — cari `skeleton` atau `loading` row yang punya jumlah kolom sama
4. **Quick-add** — cari quick-add row yang define `<td>` untuk setiap kolom

## Verifikasi

1. ✅ Build TypeScript — `npx tsc --noEmit` di `apps/web`
2. ✅ Build production — `npx vite build`
3. ✅ Manual test: ubah kolom Beli → blur → cek apakah tersimpan
4. ✅ Manual test: refresh page → cek apakah data persist

## Risks & Open Questions

- **Tidak ada risk** karena data dan save logic sudah mature
- **Open question:** Apakah kolom Beli perlu auto-fill dari angka sebelumnya (seperti stok)? Fungsi `getInlineValue()` sudah handle ini — pakai `latestTransaction.purchaseQuantity` jika ada.
- **Open question:** Apakah perlu menampilkan satuan beli (preferredPurchaseUnit) juga? Saat ini satuan beli ditampilkan di tooltip kolom Satuan, jadi sepertinya cukup.
