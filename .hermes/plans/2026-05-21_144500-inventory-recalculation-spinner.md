# Plan: Spinner & Recalculation Function Halaman Inventory

## Goal
Tambahkan spinner loading indicator di atas kolom tabel inventory dan fungsi penghitungan ulang terpusat yang menggantikan tombol RotateCw tersebar di masing-masing kolom header.

## Current State Analysis

### Existing Refresh Mechanism
- Ada 4 tombol `RotateCw` tersebar di header kolom: **Harga Terakhir**, **Harga/Unit**, **Nilai Stok**, **Aksi**
- Masing-masing memanggil `triggerHybridRefresh()` + `setLastRefreshedAt(new Date())`
- `triggerHybridRefresh()` (di `use-hybrid-pos-data.ts` line 10-13): global refresh counter yang memicu semua hybrid hooks untuk re-fetch
- `lastRefreshedAt` hanya ditampilkan di kolom **Aksi** (line 5436)

### Computed Fields (yang di-recalculate)
- `lastPurchasePrice` — dari DB
- `hargaPerUnit` — `lastPurchasePrice / conversionFactor` (ditampilkan di kolom Harga/Unit)
- `nilaiStok` — `currentStock * hargaPerUnit`
- `status` — critical/warning/healthy
- `avgDailyUsage`, `daysUntilStockout`, `reorderPoint`, `suggestedOrderQty`, `riskLevel` — dari workspace data

### Loading State
- `Loader2` sudah di-import (line 42) tapi hanya dipakai di modal/drawer, bukan di toolbar
- Tidak ada spinner/loading indicator di atas tabel
- Tidak ada state `isRecalculating` di InventoryPage

## Proposed Changes

### 1. State Management — Tambah `isRecalculating`
**File:** `inventory.lazy.tsx`
```tsx
const [isRecalculating, setIsRecalculating] = useState(false);
```

### 2. Unified Recalculation Function
**File:** `inventory.lazy.tsx`
Buat fungsi `handleRecalculateAll` yang:
1. Set `setIsRecalculating(true)`
2. Panggil `triggerHybridRefresh()`
3. Update `setLastRefreshedAt(new Date())`
4. Set `setIsRecalculating(false)` setelah data selesai loaded

```tsx
const handleRecalculateAll = () => {
  setIsRecalculating(true);
  triggerHybridRefresh();
  setLastRefreshedAt(new Date());
  // Auto-clear spinner when data refreshes
};
```

### 3. Spinner di Toolbar — Above Columns
**File:** `inventory.lazy.tsx`
Di **InventoryHeader** component (line 6388-6489), tambahkan di bawah search bar atau di atas tabel:
- Saat `isRecalculating=true`: tampilkan `Loader2` dengan animasi spin + teks "Menghitung ulang..."
- Indicator di sebelah `lastRefreshedAt`

### 4. Ganti Tombol Tersebar → Satu Tombol
- Pindahkan/Rapikan RotateCw dari masing-masing kolom header ke satu tombol terpusat di toolbar
- Atau pertahankan tombol di header kolom tapi semua panggil fungsi yang sama dengan spinner indicator

### 5. Trigger Auto-Detection via Hook
**File:** `inventory.lazy.tsx` atau hook terpisah
Buat `useEffect` yang mendeteksi kapan data selesai di-refresh (gunakan `useGlobalRefreshTrigger` atau pantau perubahan data) untuk otomatis mematikan `isRecalculating`.

## Files Affected

| File | Changes |
|------|---------|
| `apps/web/src/routes/admin/inventory.lazy.tsx` | Tambah state `isRecalculating`, fungsi `handleRecalculateAll`, spinner UI di toolbar/above-table |

## Implementation Steps

1. Tambah state `const [isRecalculating, setIsRecalculating] = useState(false);` di `InventoryPage`
2. Buat `handleRecalculateAll` function
3. Buat `useEffect` untuk auto-set `isRecalculating=false` saat data refresh selesai
4. Tambah spinner UI di **InventoryHeader** atau langsung di atas `<InventoryTable>`
5. Ganti/rapikan RotateCw di kolom header jadi panggil fungsi terpusat
6. Verifikasi build & test

## Verification
- Build: `npx tsc --noEmit`
- Manual: buka halaman inventory, klik tombol recalculate → spinner muncul → hilang setelah data refresh
- Pastikan tidak ada error TypeScript
- Pastikann tidak ada `RotateCw` duplikasi panggilan

## Risks
- Tidak ada risiko data karena hanya UI loading state
- `triggerHybridRefresh()` sudah terbukti aman dipakai di 4 tempat existing
