# Plan: Perbaikan Integrasi Kolom HPP ↔ Inventory

## Goal
Perbaiki integrasi data antara halaman `/admin/recipe/hpp` dan `/admin/inventory` agar konversi satuan, quantity pembelian, dan harga terhubung secara akurat.

---

## Current Context

### Gap Analysis dari Sesi Sebelumnya

| # | Gap | Lokasi di Kode | Dampak |
|---|---|---|---|
| 1 | **`findUnitPair()` hardcoded** — HPP pakai pasangan unit hardcoded (liter→ml×1000, kg→gram×1000), bukan `contentToBaseFactor` dari DB | `recipe-hpp.tsx:1729,1481,1428,1900` | Konversi bisa beda dengan inventory → harga HPP tidak akurat |
| 2 | **`purchaseQuantity` hardcoded 1** — HPP selalu asumsi `purchaseQuantity: 1`, padahal inventory punya `preferredPurchaseQuantity` | `recipe-hpp.tsx:1740,1491,1909` | Cost-per-unit bisa over/under estimate |
| 3 | **`purchaseUnit` dari `item.unit`** — HPP pakai `unit` (Unit Dasar), bukan `preferredPurchaseUnit` | `recipe-hpp.tsx:1741,1492,1910` | Unit pembelian di HPP bisa tidak sinkron dengan yang tercatat di inventory |
| 4 | **`InventoryItem` interface tidak lengkap** — Fields `preferredPurchaseQuantity`, `preferredPurchaseUnit`, `contentToBaseFactor`, `packNetQuantity`, `packNetUnit` tidak ada di interface | `recipe-hpp.tsx:101-109` | TypeScript tidak bisa validasi, perlu `as any` |

### Data Flow Saat Ini

```
User pilih produk → useEffect populasi dari recipe:
  findUnitPair(invItem.unit, invItem.displayUnit) → factor
  purchasePrice = latestCostPerUnit × factor
  purchaseQuantity = 1 (hardcoded!)
  purchaseUnit = invItem.unit
  conversionFactor = factor (dari hardcoded pairs, bukan DB)

User pilih bahan dari combobox → handleSelectInventoryItem:
  findUnitPair(item.unit, item.displayUnit ?? item.unit) → factor
  purchasePrice = latestCostPerUnit × factor
  purchaseQuantity = 1 (hardcoded!)
  purchaseUnit = item.unit
  conversionFactor = factor (dari hardcoded pairs, bukan DB)
```

### Data Yang Tersedia di Runtime

`fetchInventory()` (lines 829-882) sudah memetakan:
- `preferredPurchaseQuantity` ✅ — ini yang harus dipakai untuk `purchaseQuantity`
- `preferredPurchaseUnit` ✅ — ini yang harus dipakai untuk `purchaseUnit`
- `contentToBaseFactor` ✅ — ini yang harus dipakai untuk `conversionFactor`
- `packNetQuantity` ✅
- `packNetUnit` ✅

Tapi `InventoryItem` interface (lines 101-109) TIDAK mencantumkan fields ini, jadi TypeScript tidak tahu keberadaannya.

---

## Proposed Approach

**Strategy: Prefer DB values, fallback to hardcoded pairs.**

1. Extend `InventoryItem` interface dengan missing fields
2. Di semua 4 lokasi `findUnitPair()`:
   - `conversionFactor` → `item.contentToBaseFactor ?? findUnitPair().factor`
   - `purchaseQuantity` → `item.preferredPurchaseQuantity ?? 1`
   - `purchaseUnit` → `item.preferredPurchaseUnit ?? item.unit`
3. Untuk `handleSyncFromInventory` yang sudah pakai `costInfo.conversionFactor` — tambah fallback ke `contentToBaseFactor` bila ada inventory item yang match

---

## Step-by-Step Plan

### Step 1: Extend `InventoryItem` Interface

**File:** `apps/web/src/components/admin/recipe-hpp.tsx`

Tambahkan fields:
```typescript
interface InventoryItem {
  _id: string;
  ingredientName: string;
  unit: string;
  displayUnit?: string;
  conversionFactor?: number;
  quantity: number;
  latestReferencePrice?: number;
  // NEW:
  preferredPurchaseQuantity?: number;
  preferredPurchaseUnit?: string;
  contentToBaseFactor?: number;
  packNetQuantity?: number;
  packNetUnit?: string;
}
```

### Step 2: Fix `handleSelectInventoryItem` (line 1724)

```typescript
// SEBELUM:
purchasePrice: price * unitPair.factor,
purchaseQuantity: 1,
purchaseUnit: item.unit ?? unitPair.purchase,
usageUnit: item.displayUnit ?? unitPair.usage,
conversionFactor: unitPair.factor,

// SESUDAH:
const actualFactor = item.contentToBaseFactor ?? unitPair.factor;
purchasePrice: price * actualFactor,
purchaseQuantity: item.preferredPurchaseQuantity ?? 1,
purchaseUnit: item.preferredPurchaseUnit ?? item.unit ?? unitPair.purchase,
usageUnit: item.displayUnit ?? unitPair.usage,
conversionFactor: actualFactor,
```

### Step 3: Fix useEffect (product recipe) — line 1471

```typescript
// SEBELUM:
const unitPair = findUnitPair(invItem?.unit ?? "liter", invItem?.displayUnit ?? "ml");
...
purchasePrice: price * (unitPair.factor),
purchaseQuantity: 1,
purchaseUnit: invItem?.unit ?? unitPair.purchase,
conversionFactor: unitPair.factor,

// SESUDAH:
const unitPair = findUnitPair(invItem?.unit ?? "liter", invItem?.displayUnit ?? "ml");
const actualFactor = invItem?.contentToBaseFactor ?? unitPair.factor;
...
purchasePrice: price * actualFactor,
purchaseQuantity: invItem?.preferredPurchaseQuantity ?? 1,
purchaseUnit: invItem?.preferredPurchaseUnit ?? invItem?.unit ?? unitPair.purchase,
conversionFactor: actualFactor,
```

### Step 4: Fix useEffect (base recipe) — line 1418

Terapkan perubahan yang sama seperti Step 3 pada blok base recipe population (~line 1422-1456).

### Step 5: Fix `handleSyncFromInventory` (line 1900)

Sudah ada `costInfo.conversionFactor ?? findUnitPair(...)`. Tambah fallback ke `contentToBaseFactor` bila ada inventory item:

```typescript
// Coba cari inventory item untuk contentToBaseFactor
const invItem = (inventory as InventoryItem[]).find((i) => i._id === matchedInvId);
const baseFactor = invItem?.contentToBaseFactor ?? costInfo?.conversionFactor;
const factor = baseFactor ?? findUnitPair(
  costInfo.unit ?? ing.purchaseUnit,
  costInfo.displayUnit ?? ing.usageUnit
).factor;
```

### Step 6: Build & Typecheck

- Jalankan `npx tsc --noEmit` di `apps/web`
- Pastikan tidak ada error baru dari perubahan interface dan implementasi
- Error pre-existing (vitest, leaderboard-panel) diabaikan

---

## Files Likely to Change

| File | Perubahan |
|---|---|
| `apps/web/src/components/admin/recipe-hpp.tsx` | Interface + 4 lokasi `findUnitPair` + `handleSyncFromInventory` |

**Tidak ada perubahan:**
- Database schema — semua field sudah ada di `pos_inventory`
- Hooks — data sudah difetch, hanya perlu dipakai
- Route files — tidak ada navigasi diubah
- Inventory page — hanya HPP yang consume data inventory

---

## Database Schema

Tabel `pos_inventory` — field yang relevan:

| Field | Tipe | Dipakai HPP? | Dipakai Inventory? | Status |
|---|---|---|---|---|
| `_id` | text | ✅ (foreign key) | ✅ | ✅ |
| `ingredientName` | text | ✅ | ✅ | ✅ |
| `unit` | text | ✅ (fallback purchaseUnit) | ✅ (Unit Dasar) | ✅ |
| `displayUnit` | text | ✅ (usageUnit) | ✅ (Satuan Isi) | ✅ |
| `conversionFactor` | numeric | ❌ (tidak dipakai) | ✅ (fallback Konversi) | ❌ Bisa dipakai |
| `contentToBaseFactor` | numeric | ❌ **HARUS DIPAKAI** | ✅ (Konversi) | ❌ Gap |
| `preferredPurchaseQuantity` | numeric | ❌ **HARUS DIPAKAI** | ✅ (Beli) | ❌ Gap |
| `preferredPurchaseUnit` | text | ❌ **HARUS DIPAKAI** | ✅ (Satuan Beli) | ❌ Gap |
| `lastPurchasePrice` | numeric | ❌ (via view) | ✅ (Harga Terakhir) | ⚠️ via view |
| `packNetQuantity` | numeric | ❌ | ✅ (Isi Bersih) | ✅ OK |
| `packNetUnit` | text | ❌ | ✅ (Satuan Isi) | ✅ OK |

View `pos_inventory_latest_costs` — field yang relevan:

| Field | Dipakai HPP? | Dipakai Inventory? |
|---|---|---|
| `latestCostPerUnit` | ✅ (Harga) | ✅ (Harga/Unit) |
| `conversionFactor` | ⚠️ (handleSyncFromInventory) | ❌ |
| `unit` | ⚠️ (fallback) | ❌ |
| `displayUnit` | ⚠️ (fallback usageUnit) | ❌ |

---

## UI/UX Specification

**Tidak ada perubahan UI.** Yang berubah hanya nilai kalkulasi di belakang layar:
- `purchaseQuantity` akan menampilkan nilai dari `preferredPurchaseQuantity` (bukan 1)
- `purchaseUnit` akan menampilkan nilai dari `preferredPurchaseUnit` (bukan `unit`)
- `conversionFactor` akan menampilkan dari `contentToBaseFactor` (bukan hasil `findUnitPair`)
- `Harga` akan lebih akurat karena menggunakan quantity & factor yang benar

**Yang tidak berubah:**
- Layout tabel ingredients
- Kolom-kolom yang ditampilkan
- Tombol aksi
- Summary bar metrics

---

## Validation / Testing

1. **Buka `/admin/inventory`** — catat untuk suatu inventory item:
   - `preferredPurchaseQuantity`, `preferredPurchaseUnit`
   - `contentToBaseFactor`
   - `latestCostPerUnit` (di kolom Harga/Unit)

2. **Buka `/admin/recipe/hpp?productId=...`** untuk produk yang pakai item tsb
   - Verifikasi: `Jumlah` = sama dengan recipe
   - Verifikasi: `Satuan` = `displayUnit` dari inventory
   - Verifikasi: `Harga` = `contentToBaseFactor × latestCostPerUnit × preferredPurchaseQuantity` (jika preferredPurchaseQty > 1, harga akan lebih besar → lebih akurat)
   - Verifikasi: `Src` = 💾 Inventory

3. **Select inventory item dari combobox** — pilih bahan yang sama
   - Verifikasi: `purchaseQuantity` = `preferredPurchaseQuantity` dari inventory
   - Verifikasi: `purchaseUnit` = `preferredPurchaseUnit` dari inventory
   - Verifikasi: `conversionFactor` = `contentToBaseFactor` dari inventory

4. **Klik tombol "Sinkron Bahan Baku"** — harus tetap bekerja dengan data baru

5. **Klik tombol "Sinkron Resep"** — harus tetap bekerja dengan data baru

6. **Typecheck** — `npx tsc --noEmit` (ignore pre-existing errors)

---

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| `contentToBaseFactor` belum di-set untuk beberapa item → factor jadi null | Fallback ke `findUnitPair()` — tetap jalan seperti sekarang |
| `preferredPurchaseQuantity` belum di-set → quantity jadi 0 | Fallback ke `1` |
| `preferredPurchaseUnit` belum di-set → purchaseUnit jadi kosong | Fallback ke `unit` (Unit Dasar) |
| Perubahan harga drastis karena qty × factor sekarang berbeda | Ini justru yang diinginkan — harga jadi akurat sesuai data inventory |

---

## Open Questions

1. **Untuk `handleSyncFromInventory`** — view `pos_inventory_latest_costs` sudah punya `conversionFactor` sendiri. Apakah `contentToBaseFactor` dari inventory harus diprioritaskan di atas `costInfo.conversionFactor`? Atau sebaliknya?
   - **Rekomendasi:** Prioritaskan `contentToBaseFactor` (dari tabel `pos_inventory` — data master) di atas `costInfo.conversionFactor` (dari view — mungkin stale).

2. **Apakah `packNetQuantity` dan `packNetUnit` perlu dipakai di HPP?** Saat ini tidak digunakan. Bisa jadi relevan untuk future enhancement jika HPP perlu menampilkan isi bersih per kemasan.
