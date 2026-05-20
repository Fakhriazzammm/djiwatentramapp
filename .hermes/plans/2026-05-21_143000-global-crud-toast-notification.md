# Plan: Global CRUD Toast Notification System

## Goal

Buat **satu utility global** untuk notifikasi toast CRUD (simpan/update/hapus) yang konsisten di seluruh halaman admin, dengan:
- ✅ **Loading state** — toast "Menyimpan..." selama proses
- ✅ **Success toast** — "Data tersimpan" hanya setelah **benar-benar selesai** (await selesai)
- ✅ **Error toast** — "Gagal: [pesan error]" jika gagal
- ✅ **Duration 2 detik** untuk success, 5 detik untuk error
- ✅ Migrasi halaman-halaman yang ada ke pattern baru secara bertahap

---

## Current Context

### Toast Library
- **sonner** sudah terinstall (`^2.0.5`) dan sudah global via `<Toaster richColors />` di `main.tsx`
- Semua halaman import `import { toast } from "sonner"` langsung — **tidak ada layer abstraksi**

### Current Mutation Pattern
- `use-hybrid-write-actions.ts` menyediakan hooks seperti `useHybridUpdateInventoryItem()`, `useHybridApplyInventoryStockAction()`, dll.
- Semua hooks return **async `useCallback`** — pemanggil `await` langsung
- Bukan TanStack Query — jadi **tidak ada `onSuccess` lifecycle bawaan**

### Current Notification Coverage (Inkonsisten)

| Halaman | Simpan | Hapus | Keterangan |
|---------|--------|-------|------------|
| `/admin/inventory` | ✅ Partial | ❌ | Ada toast success, loading spinner per-row, tapi tidak konsisten |
| `/admin/products` | ❌ | ✅ | Toast sukses hapus (inline), simpan produk tidak ada notifikasi |
| `/admin/jadwal` | ✅ | ❌ | Ada toast sukses update |
| `/admin/pengaturan` | ✅ | ❌ | Ada toast sukses simpan |
| `/admin/payroll/slip` | ❌ | ❌ | Tidak ada notifikasi |
| `/admin/karyawan` | ❌ | ❌ | Tidak ada notifikasi |
| `/admin/discounts` | ❌ | ❌ | Tidak ada notifikasi |

### Existing Pattern di Inventory (yang sudah dibuat)
```tsx
// saveMeta()
const saveMeta = async (row) => {
  setSaveStateByRow(prev => ({ ...prev, [row.inventoryId]: "saving" }));
  try {
    await updateItemMutation({ id, ...updates });
    setSaveStateByRow(prev => ({ ...prev, [row.inventoryId]: "saved" }));
    toast.success("Tersimpan", { duration: 2000 });
  } catch (error) {
    toast.error(message);
    setSaveStateByRow(prev => ({ ...prev, [row.inventoryId]: "error" }));
  }
};
```

---

## Proposed Approach

### Strategy: `withSaveToast()` Utility Function

Bukan Context/Provider (terlalu berat untuk kebutuhan ini), bukan wrapper mutation (terlalu invasif).

**Pattern: Fungsi utilitas yang bisa dipanggil kapan saja:**

```tsx
// apps/web/src/lib/with-save-toast.ts
import { toast } from "sonner";

type SaveToastOptions = {
  loading?: string;
  success?: string;
  error?: string;
};

export async function withSaveToast<T>(
  action: () => Promise<T>,
  options: SaveToastOptions = {}
): Promise<T | null> {
  const {
    loading = "Menyimpan...",
    success = "Tersimpan",
    error: errorMsg = "Gagal menyimpan",
  } = options;

  const id = toast.loading(loading, { duration: Infinity });

  try {
    const result = await action();
    toast.success(success, { id, duration: 2000 });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : errorMsg;
    toast.error(`Gagal: ${message}`, { id, duration: 5000 });
    return null;
  }
}
```

**Cara pakai di komponen:**
```tsx
// Sebelum:
await updateItemMutation({ id, name: "Gula" });
toast.success("Tersimpan");

// Sesudah:
await withSaveToast(
  () => updateItemMutation({ id, name: "Gula" }),
  { success: "Data tersimpan" }
);
```

### Two-Phase Rollout (Aman & Iteratif)

**Phase 1 — Buat utility + migrasi single page (inventory)**
- Buat `lib/with-save-toast.ts`
- Migrasi inventory page — ganti semua `toast.success("Tersimpan")` + `setSaveStateByRow` manual → panggil `withSaveToast()`
- Test & verify

**Phase 2 — Migrasi halaman lain (batch)**
- Products page (simpan kategori, produk)
- Jadwal page
- Pengaturan page
- Penggajian / slip page
- Karyawan page

---

## Detailed Steps

### Step 1: Buat `src/lib/with-save-toast.ts`

**File baru** — utility function `withSaveToast`:

```ts
import { toast } from "sonner";

type SaveToastStatus = "idle" | "saving" | "saved" | "error";

type SaveToastOptions = {
  loading?: string;
  success?: string;
  error?: string;
  // Untuk per-row state (seperti inventory)
  onStatusChange?: (status: SaveToastStatus) => void;
};

export async function withSaveToast<T>(
  action: () => Promise<T>,
  options: SaveToastOptions = {}
): Promise<{ success: boolean; data: T | null; error: string | null }> {
  const {
    loading = "Menyimpan...",
    success = "Tersimpan",
    error: errorPrefix = "Gagal",
  } = options;

  options.onStatusChange?.("saving");
  const id = toast.loading(loading, { duration: Infinity });

  try {
    const result = await action();
    toast.success(success, { id, duration: 2000 });
    options.onStatusChange?.("saved");
    return { success: true, data: result, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan";
    toast.error(`${errorPrefix}: ${message}`, { id, duration: 5000 });
    options.onStatusChange?.("error");
    return { success: false, data: null, error: message };
  }
}
```

### Step 2: Migrasi Inventory Page

**File:** `src/routes/admin/inventory.lazy.tsx`

**Perubahan:**

1. **Import:** Tambah `import { withSaveToast } from "@/lib/with-save-toast";`
2. **saveMeta()** — ganti pattern:
   ```tsx
   // OLD:
   setSaveStateByRow(prev => ({...prev, [row.inventoryId]: "saving"}));
   try {
     await updateItemMutation({...});
     setSaveStateByRow(prev => ({...prev, [row.inventoryId]: "saved"}));
     toast.success("Tersimpan");
     debouncedRefresh();
   } catch (error) {
     toast.error(message);
     setSaveStateByRow(prev => ({...prev, [row.inventoryId]: "error"}));
   }
   
   // NEW:
   const result = await withSaveToast(
     () => updateItemMutation({...}),
     {
       loading: "Menyimpan perubahan...",
       success: "Tersimpan",
       onStatusChange: (status) => {
         setSaveStateByRow(prev => ({...prev, [row.inventoryId]: status}));
       }
     }
   );
   if (result.success) {
     debouncedRefresh();
   }
   ```

3. **saveQuantity()** — apply pattern yang sama
4. **saveReferencePrice()** — sudah ada toast "Harga terakhir diperbarui", tetap pakai `withSaveToast` untuk loading state

**⚠️ Hati-hati:** Inventory page 6597 baris, tab-indented. Gunakan `execute_code` dengan `open()` Python, bukan `patch`.

### Step 3: Migrasi Products Page

**File:** `src/routes/admin/products.lazy.tsx`

**Perubahan:**
- `handleDeleteProduct()` — ganti `toast.success("Produk dihapus")` → `withSaveToast`
- `handleBulkDelete()` — ganti `toast.success("Produk terpilih berhasil dihapus")` → `withSaveToast`
- `handleSaveProduct()` — tambah `withSaveToast` untuk loading + success
- Semua operasi kategori (create, update, delete category)

### Step 4: Migrasi Jadwal Page

**File:** `src/routes/admin/operational-team/attendance/jadwal.lazy.tsx`

**Perubahan:**
- Ganti `toast.success("Jadwal diupdate")` → `withSaveToast`
- Ganti `toast.success("Jadwal ditambahkan")` → `withSaveToast`

### Step 5: Migrasi Pengaturan Page

**File:** `src/routes/admin/operational-team/attendance/pengaturan.lazy.tsx`

**Perubahan:**
- Ganti `toast.success("Pengaturan berhasil disimpan!")` → `withSaveToast`

### Step 6: Migrasi Halaman Lainnya (Batch)

- `/admin/operational-team/karyawan/data` — tambah notifikasi untuk CRUD karyawan
- `/admin/operational-team/payroll/slip` — tambah notifikasi untuk simpan slip
- `/admin/discounts` — tambah notifikasi untuk CRUD diskon

---

## Files Likely to Change

| File | Action | Complexity |
|------|--------|------------|
| `src/lib/with-save-toast.ts` | **CREATE** — utility function | Rendah |
| `src/routes/admin/inventory.lazy.tsx` | **MODIFY** — 3 save functions | Tinggi (6597 baris, tab-indented) |
| `src/routes/admin/products.lazy.tsx` | **MODIFY** — 4-6 save/delete functions | Sedang |
| `src/routes/admin/operational-team/attendance/jadwal.lazy.tsx` | **MODIFY** — 2 save functions | Rendah |
| `src/routes/admin/operational-team/attendance/pengaturan.lazy.tsx` | **MODIFY** — 1 save function | Rendah |
| `src/routes/admin/operational-team/karyawan/data.lazy.tsx` | **MODIFY** — CRUD notif | Sedang |
| `src/routes/admin/operational-team/payroll/slip.lazy.tsx` | **MODIFY** — save notif | Rendah |
| `src/routes/admin/discounts.lazy.tsx` | **MODIFY** — CRUD notif | Rendah |

---

## Tests / Validation

| Step | Cara Verifikasi |
|------|-----------------|
| TypeScript | `npx tsc --noEmit` — 0 error baru |
| Build | `npm run build` — sukses |
| Inventory save | Edit kolom → blur → lihat toast "Menyimpan..." → "Tersimpan" |
| Inventory error | Matikan koneksi → edit → blur → lihat toast "Gagal: ..." |
| Products save | Buat/edit produk → toast muncul |
| Products delete | Hapus produk → toast loading → sukses muncul |
| Jadwal save | Edit jadwal → toast muncul |
| Pengaturan save | Simpan pengaturan → toast muncul |

---

## Risks & Tradeoffs

| Risk | Mitigation |
|------|------------|
| **Loading toast infinite** (jika `action` tidak pernah resolve) | sonner otomatis dismiss setelah timeout 4 detik untuk loading toast |
| **Multiple toasts menumpuk** (user cepat edit banyak baris) | Setiap save punya toast ID sendiri → aman |
| **Tab corruption saat edit inventory.lazy.tsx** | Gunakan `execute_code` + Python `open()` — jangan `patch` |
| **`onStatusChange` callback lupa dipanggil** | `finally` block di `withSaveToast` handle cleanup: failed/error jadi "error", success jadi "saved" |
| **Perubahan destruktif** (hapus `saveStateByRow` terlalu cepat) | Phase 1 hanya **tambah** `withSaveToast` — pertahankan `saveStateByRow` untuk spinner UI. Nanti bisa di-refactor terpisah |

---

## Implementation Order

```
▸ Phase 1 — Core Utility (1 wave, 1 subagent)
  [1] CREATE: src/lib/with-save-toast.ts

▸ Phase 2 — Inventory Page (1 wave, 1 subagent, high complexity)
  [2] MODIFY: inventory.lazy.tsx — 3 save functions

▸ Phase 3 — Products Page (1 wave, 1 subagent)
  [3] MODIFY: products.lazy.tsx — save/delete functions

▸ Phase 4 — Batch Migrate (1 wave, 1 subagent / or manual)
  [4] MODIFY: jadwal, pengaturan, karyawan/data, payroll/slip, discounts

▸ Verification
  [5] TypeScript check + build
```

---

## Open Questions

- **Apakah perlu `useSaveToast` hook** yang return `{ isSaving, withToast }` untuk component yang butuh disable tombol selama saving? → Bisa ditambahkan nanti jika diperlukan, pattern utility function cukup untuk sekarang.
- **Apakah inventory `saveStateByRow` (spinner per-row) tetap dipertahankan?** → Ya, karena spinner UX berbeda dari toast. Toast kasih feedback global, spinner kasih feedback per-row lokal.
