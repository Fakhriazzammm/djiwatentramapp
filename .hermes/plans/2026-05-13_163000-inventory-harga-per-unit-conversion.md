# Plan: Harga Per-Unit & Auto-Konversi ke Satuan Terkecil

## Goal

Meningkatkan kolom Harga Terakhir di `/admin/inventory` agar:
1. Menampilkan harga per satuan beli (contoh: `Rp 22.000 / galon`)
2. Menambahkan auto-konversi ke satuan terkecil di sebelah kanan (contoh: `Rp 5,81 / ml`)
3. Mendukung semua jenis konversi: kg→gr, liter→ml, dus→pcs, dll.
4. Hanya 1 kolom input harga (tetap seperti sekarang) + 1 kolom baru hasil konversi otomatis

---

## Current Context

### Yang sudah ada
- **Kolom Harga Terakhir**: input number + label `per X unit` + `inventoryCosts` per-unit display
- **Data konversi**: `unitConversions[]` (array `{unit, factor}`) + `conversionFactor`/`displayUnit` legacy pada setiap item
- **Unit list**: `INVENTORY_UNIT_OPTIONS = [gram, ml, pcs, dus, karton, pack, box, botol, sachet, liter, kg]`
- **`latestCostPerUnit`**: dari view `pos_inventory_latest_costs` — sudah per-unit, tapi dalam purchase unit
- **Fungsi utility**: `normalizeUnitOption()`, `parseUnitConversionsText()`, `buildConversionHint()`, `getPrimaryConversionFromChain()`, `formatUnitConversionsText()`
- **Total kolom saat ini**: 10 (setelah split Stok/Min)

### Yang belum ada
- **Unit hierarchy mapping** — tidak ada sistem yang tahu bahwa "kg" parent dari "gram", "liter" parent dari "ml", dll.
- **Auto-convert logic** — tidak ada fungsi yang mengkonversi harga dari unit besar ke unit terkecil secara otomatis
- **UI column** — tidak ada kolom "Harga Satuan Terkecil"

### Data flow
```
InventoryCostMapRecord (dari pos_inventory_latest_costs)
  → latestCostPerUnit: number (harga per unit purchase)
  → unit, displayUnit, conversionFactor

InventoryItem (dari pos_inventory)
  → unitConversions: [{unit: "gram", factor: 1000}]
  → conversionFactor, displayUnit (legacy)
```

---

## Proposed Approach

### A. Unit Hierarchy Definition

Buat mapping konstan untuk hierarki satuan dan faktor konversi default:

```typescript
// Satuan massal: kg → gram (1000)
// Satuan volume: liter → ml (1000)
// Satuan kuantitas: dus/karton/box/pack → pcs (diambil dari unitConversions item)
// Satuan lain: tidak ada konversi otomatis
```

Logic:
1. **Mass group**: `["kg", "gram", "gr", "g"]` → smallest: "gram" (faktor 1000)
2. **Volume group**: `["liter", "ml", "l"]` → smallest: "ml" (faktor 1000)
3. **Count group**: `["dus", "karton", "box", "pack", "botol", "sachet"]` → smallest: "pcs" (faktor dari `unitConversions`)
4. **Singular items**: "pcs" → tidak ada konversi lebih kecil

### B. Conversion Logic Function

```typescript
function computeMinUnitPrice(
  unit: string,
  lastPurchasePrice: number,
  unitConversions?: Array<{unit: string, factor: number}>,
  conversionFactor?: number,
  displayUnit?: string
): { price: number; minUnit: string; label: string } | null
```

Steps:
1. Deteksi grup unit dari `unit`
2. Jika mass group → faktor 1000, price = lastPurchasePrice / 1000, minUnit = "gram"
3. Jika volume group → faktor 1000, price = lastPurchasePrice / 1000, minUnit = "ml"
4. Jika count group:
   - Cari di `unitConversions` untuk konversi ke "pcs", ambil faktornya
   - Jika ada `conversionFactor` + `displayUnit`, gunakan itu
   - price = lastPurchasePrice / factor, minUnit = "pcs"
5. Jika tidak dikenal → return null (tidak ditampilkan)
6. Return: `{price, minUnit, label: "Rp X / minUnit"}`

### C. Tambah Kolom Baru: "Harga/Unit Kecil"

**Posisi**: Setelah kolom "Nilai Stok", sebelum "Status" (kolom ke-9 dari 11)

**Layout perubahan**:
| # | Kolom | Lebar |
|---|-------|-------|
| 1 | Insight | 2.2rem |
| 2 | Bahan | 14% |
| 3 | Supplier | 10% |
| 4 | Stok | 8% |
| 5 | Min | 6% |
| 6 | Satuan | 8% |
| 7 | Harga Terakhir | 9% (diperlebar) |
| 8 | Nilai Stok | 7% |
| 9 | **Harga/Unit Kecil** 🆕 | 8% |
| 10 | Status | 6% |
| 11 | Aksi | 11rem |

**Kolom Harga Terakhir sekarang menampilkan**:
- Input number (price edit — tetap)
- Label `Rp X / [purchaseUnit]` (bold)

**Kolom Harga/Unit Kecil 🆕 menampilkan**:
- `Rp X / gram` atau `Rp X / ml` atau `Rp X / pcs`
- Warna muted (`text-muted-foreground/60`) supaya tidak kompetisi dengan harga utama
- Jika tidak ada konversi → `—` (dash)

### D. Edge Cases

| Skenario | Perilaku |
|----------|----------|
| Purchase unit sudah "gram" | Tidak perlu konversi → tampilkan sama, label "Harga langsung/gram" |
| Purchase unit "pcs", tidak ada konversi | Tidak bisa konversi → `—` |
| Purchase unit "dus", `unitConversions: [{unit: "pcs", factor: 12}]` | `price = lastPurchasePrice / 12`, label "Rp X / pcs" |
| Purchase unit "liter", tidak ada `unitConversions` | Tetap pakai faktor default 1000 → "Rp X / ml" |
| `lastPurchasePrice` null/0 | Kedua kolom `—` |
| `inventoryCosts` belum selesai loading | Skeleton loading di kedua kolom |

---

## Step-by-Step Plan

### Step 1: Buat unit hierarchy constant + computeMinUnitPrice()
**File**: `apps/web/src/routes/admin/inventory.lazy.tsx`

- Tambah `UNIT_GROUP` constant mapping
- Implementasi `computeMinUnitPrice()` function
- Function ditempatkan setelah `buildConversionHint()`

### Step 2: Tambah kolom "Harga/Unit Kecil" di header
**File**: `apps/web/src/routes/admin/inventory.lazy.tsx` (header section ~line 4903)

- Tambah `<th>` baru setelah "Nilai Stok" header
- Update colgroup — tambah `w-[8%]` sebelum Status

### Step 3: Tambah kolom di data rows
**File**: `apps/web/src/routes/admin/inventory.lazy.tsx` (data row ~line 5207)

- Setelah Nilai Stok `<td>` (line 5207-5210), tambah `<td>` baru
- Panggil `computeMinUnitPrice()` dengan data dari `row` + `inventoryCosts?.[row.inventoryId]`
- Render hasil: formatted currency + "/" + minUnit

### Step 4: Tambah kolom di skeleton rows
**File**: `apps/web/src/routes/admin/inventory.lazy.tsx` (skeleton ~line 5045)

- Tambah `<td>` dengan `<Skeleton>` setelah Nilai Stok skeleton

### Step 5: Tambah kolom di quick-add
**File**: `apps/web/src/routes/admin/inventory.lazy.tsx` (quick-add ~line 4992)

- Tambah `<td>` dengan `—` setelah Nilai Stok quick-add

### Step 6: Update empty state colSpan
**File**: `apps/web/src/routes/admin/inventory.lazy.tsx` (line ~5276)

- colSpan 10 → 11

### Step 7: Build, commit, push

---

## Files Likely to Change

| File | Perubahan |
|------|-----------|
| `apps/web/src/routes/admin/inventory.lazy.tsx` | Tambah fungsi konversi, kolom header, data, skeleton, quick-add, colgroup, colSpan |
| `apps/web/dist/assets/inventory.lazy-*.js` | Akan regenerasi (build artifact) |

Tidak ada perubahan di:
- Database schema (tidak perlu migration baru)
- Backend hooks (data sudah tersedia dari existing system)
- Route structure

---

## Validation

1. **Build**: `bun run build` sukses (tanpa error TS/JSX)
2. **Visual**: Buka `/admin/inventory`, verifikasi:
   - Item "Gula Pasir" (unit: kg) → kolom baru `Rp X / gram`
   - Item "Minyak Goreng" (unit: liter) → kolom baru `Rp X / ml`
   - Item "Telur" (unit: dus, unitConversions: [{unit:"pcs", factor:30}]) → `Rp X / pcs`
   - Item tanpa konversi → `—`
3. **Edge case**: Item dengan `lastPurchasePrice = null` → kedua kolom `—`

---

## Risks & Tradeoffs

| Risiko | Mitigasi |
|--------|----------|
| `unitConversions` tidak konsisten formatnya | Pakai `getPrimaryConversionFromChain()` + fallback ke `conversionFactor`/`displayUnit` legacy |
| Unit tidak dikenal di hierarchy | Return null → tampilkan `—`, tidak error |
| Kolom jadi terlalu banyak (11 kolom) | Ini maksimal — kalau user mau lebih ringkas, bisa toggle visibility |
| Floating point precision untuk harga/unit kecil | Pakai `Math.round()` — harga per gram/ml/pcs dalam Rupiah integer |
| Server-side: `pos_inventory_latest_costs` mungkin tidak punya semua entry | Fallback: hitung manual dari `lastPurchasePrice` / conversionFactor |

---

## Diagram Alur Konversi

```
lastPurchasePrice: 22000
unit: "galon"
unitConversions: [{unit: "ml", factor: 3785}]
                                        
  ├→ UNIT_GROUP: "volume" (liter/ml/galon)
  │   └→ Cari conversion ke ml: 1 galon = 3785 ml
  │       └→ price/ml = 22000 / 3785 = 5.81
  │           └→ Tampilkan: "Rp 6 / ml"
  │
  Kolom Harga Terakhir           Kolom Harga/Unit Kecil
  [ 22000 ]                      Rp 6 / ml
  Rp 22.000 / galon
```

```
lastPurchasePrice: 50000
unit: "kg"
unitConversions: [{unit: "gram", factor: 1000}]

  ├→ UNIT_GROUP: "mass" (kg/gram)
  │   └→ Faktor default: 1000
  │       └→ price/gram = 50000 / 1000 = 50
  │           └→ Tampilkan: "Rp 50 / gram"
  │
  Kolom Harga Terakhir           Kolom Harga/Unit Kecil
  [ 50000 ]                      Rp 50 / gram
  Rp 50.000 / kg
```

---

## Open Questions

1. Apakah user ingin harga per-gram atau per-ml ditampilkan dengan desimal (Rp 5,81) atau dibulatkan ke integer (Rp 6)?
2. Untuk unit non-standar (botol, sachet, pack) — bagaimana menentukan konversi minimal jika tidak ada `unitConversions`?
3. Apakah perlu tooltip/hover untuk menunjukkan detail perhitungan (e.g., "22.000 ÷ 3785 = 5,81/ml")?
