# Plan: Konsolidasi Halaman Recipe — Hapus `/admin/recipe/view`, Integrasi Base Recipe CRUD ke Matrix

## Goal
Hanya memiliki 2 halaman recipe:
- `/admin/recipe` — Matrix view + Base Recipe CRUD
- `/admin/recipe/hpp` — Kalkulator HPP

Hapus `/admin/recipe/view` (read-only recipe book) dan pindahkan fungsionalitas Base Recipe CRUD ke halaman matrix.

---

## Current Context

### Route Structure (Sekarang)
| Route | Component | Fungsi |
|---|---|---|
| `/admin/recipe` (parent) | `<Outlet />` | Layout parent |
| `/admin/recipe/` (index) | `RecipeMatrixPage` | Matrix produk×bahan + inline edit product recipe |
| `/admin/recipe/view` | `RecipeBookViewPage` | **Read-only** view untuk barista/kitchen — step-by-step |
| `/admin/recipe/hpp` | `RecipeHppPage` | Kalkulator HPP |

### Dead Code
- `RecipeStudioPage` (line 605 di `recipe-book.tsx`) — **tidak dipakai** oleh route manapun
- `RecipeStudioPage` adalah CRUD Base Recipe + Product Recipe lama (digantikan matrix view)

### Base Recipe CRUD — Kondisi Saat Ini
- **Tidak ada** cara untuk membuat/edit Base Recipe dari halaman aktif
- Matrix view hanya menampilkan Base Recipe sebagai **info card** + link ke `/admin/recipe/view`
- Semua CRUD logic ada di `RecipeStudioPage` (dead code) dan `RecipeBookViewPage` (read-only, tidak punya CRUD)

---

## Reference Detection — Semua Link ke `/admin/recipe/view`

### 1. Route files (akan dihapus)
- `routes/admin/recipe.view.tsx` — definisi route
- `routes/admin/recipe.view.lazy.tsx` — lazy route → import `RecipeBookViewPage`

### 2. Auto-generated route tree (akan regenerate saat build)
- `routeTree.gen.ts` — 7+ references ke `AdminRecipeViewRoute` dan `'/admin/recipe/view'`

### 3. Sidebar & navigasi (perlu update)
- `routes/admin/route.tsx` line 69: `"/admin/recipe/view": "Buku Resep"` di `PAGE_TITLES`
- `routes/admin/route.tsx` line 118: `"/admin/recipe/view"` di `MORE_MENU_PATHS`

### 4. Navigation links dari surviving pages 🔴
- **`home.lazy.tsx` line 857**: Card "Buku Resep" → `to="/admin/recipe/view"` — perlu diubah atau dihapus
  - Deskripsi: "Baca resep barista & kitchen"
  - Alternatif: arahkan ke `/admin/recipe` (matrix) atau `/admin/recipe/hpp` (HPP)
- **`recipe-matrix.tsx` line 613**: `<Link to="/admin/recipe/view">Recipe Studio</Link>` — link di footer base recipe section
  - Setelah Base Recipe CRUD ada di matrix, link ini bisa dihapus/diganti tombol modal
- **`recipe-book.tsx` line 133**: `<Link to="/admin/recipe/view">Mode Baca</Link>` — di dalam `HeaderCard` component
  - `HeaderCard` hanya dipakai oleh `RecipeStudioPage` dan `RecipeBookViewPage` → keduanya akan dihapus → otomatis terhapus

### 5. Import references
- Hanya `recipe.view.lazy.tsx` yang import `RecipeBookViewPage`
- Tidak ada page lain yang import dari `recipe-book.tsx` selain route view

---

## Proposed Approach

### Strategy: Migrasi Base Recipe CRUD ke Matrix Page

**Kenapa matrix view?**
- Matrix view sudah menampilkan Base Recipe sebagai info card
- Matrix view sudah punya `useHybridBaseRecipes` hook
- Matrix view adalah halaman "kelola resep" utama
- HPP page hanya untuk kalkulasi biaya, tidak cocok untuk CRUD formula

### Step-by-Step

#### Step 1: Export `IngredientEditor` dari recipe-book.tsx
- Export komponen `IngredientEditor` agar bisa dipakai dari matrix page
- Export tipe `BaseRecipeForm` (atau buat ulang di matrix page)

#### Step 2: Tambah Base Recipe CRUD Modal ke recipe-matrix.tsx
- Import hooks:
  - `useHybridCreateBaseRecipe`
  - `useHybridUpdateBaseRecipe`
  - `useHybridDeleteBaseRecipe`
  - `useHybridEnsureInventoryItemForBaseRecipe`
- Tambah state:
  - `baseModalOpen: boolean`
  - `editingBaseId: Id<"baseRecipes"> | null`
  - `baseForm: BaseRecipeForm`
  - `deletingBaseId: Id<"baseRecipes"> | null`
- Tambah tombol "Tambah Base Recipe" di footer sidebar/area Base Recipe
- Ganti link `/admin/recipe/view` dengan tombol yang buka modal
- Modal berisi form: Nama, Kategori, Target Unit, Target Quantity, Deskripsi, + IngredientEditor
- Tombol edit (pencil icon) di setiap card Base Recipe → buka modal edit
- Tombol hapus (trash icon) di setiap card Base Recipe → konfirmasi modal
- Validasi sama seperti `RecipeStudioPage`:
  - Nama wajib
  - Minimal 1 ingredient dengan amount > 0
  - targetQuantity > 0

#### Step 3: Hapus route `/admin/recipe/view`
- Hapus file:
  - `routes/admin/recipe.view.tsx`
  - `routes/admin/recipe.view.lazy.tsx`
- Regenerate `routeTree.gen.ts` dengan `npx vite build` (TanStack Router auto-generate)

#### Step 4: Update navigasi
- **`home.lazy.tsx`**: Ubah card "Buku Resep" → arahkan ke `/admin/recipe` (bukan `/admin/recipe/view`)
  - Atau: ubah deskripsi jadi "Kelola Resep & Formula" dan arahkan ke `/admin/recipe`
- **`admin/route.tsx`**: Hapus `"/admin/recipe/view"` dari:
  - `PAGE_TITLES` → hapus entry `"/admin/recipe/view": "Buku Resep"`
  - `MORE_MENU_PATHS` → hapus `"/admin/recipe/view"`

#### Step 5: Hapus dead code
- Hapus `RecipeBookViewPage` dari `recipe-book.tsx` (export function)
- Hapus `RecipeStudioPage` dari `recipe-book.tsx` (export function — sudah dead code)
- Jika setelah dihapus `recipe-book.tsx` hanya berisi `IngredientEditor`, pertimbangkan:
  - Pindahkan `IngredientEditor` ke file sendiri `components/admin/ingredient-editor.tsx`
  - Hapus `recipe-book.tsx`
  - Atau biarkan `recipe-book.tsx` hanya berisi `IngredientEditor` (lebih sedikit perubahan)

#### Step 6: Build & Verifikasi
- `cd apps/web && NODE_OPTIONS="--max-old-space-size=2048" npx vite build --mode production`
- Verifikasi:
  - `/admin/recipe` jalan, Base Recipe CRUD berfungsi
  - `/admin/recipe/hpp` jalan
  - `/admin/recipe/view` → 404 (wajar, route sudah dihapus)
  - Tidak ada error TypeScript/import

---

## Files Likely to Change

| File | Action |
|---|---|
| `src/components/admin/recipe-matrix.tsx` | **Tambah** Base Recipe CRUD modal, import hooks, ganti link |
| `src/components/admin/recipe-book.tsx` | Export IngredientEditor, hapus RecipeBookViewPage & RecipeStudioPage |
| `src/routes/admin/recipe.view.tsx` | **Hapus** (route definition) |
| `src/routes/admin/recipe.view.lazy.tsx` | **Hapus** (lazy route) |
| `src/routes/admin/route.tsx` | Hapus `"/admin/recipe/view"` dari PAGE_TITLES & MORE_MENU_PATHS |
| `src/routes/home.lazy.tsx` | Ubah link card "Buku Resep" ke `/admin/recipe` |
| `src/routeTree.gen.ts` | **Auto-regenerate** saat build |

---

## Risks & Tradeoffs

### ⚠️ Pitfall: Tab indentation di TSX files
Semua file TSX menggunakan **tab indentation**. Jangan gunakan `patch` untuk multi-line edits — gunakan Python script workaround.

### ⚠️ Pitfall: routeTree.gen.ts auto-generated
Jangan edit `routeTree.gen.ts` manual. Hapus route files, lalu jalankan `npx vite build` untuk regenerate.

### ⚠️ Home page card removal
Card "Buku Resep" di home dashboard cukup populer — arahkan ke `/admin/recipe` yang tetap relevan.

---

## Step 2b (Revised): Tambah "Mode Baca" Toggle di Matrix View

### Fitur
Toggle "Mode Baca" / "Mode Kelola" di bagian atas halaman `/admin/recipe`:

| Mode | Tampilan |
|---|---|
| **Kelola** (default) | Matrix produk×bahan + Base Recipe cards + tombol aksi (sekarang) |
| **Baca** | Hanya menampilkan daftar Base Recipe + Product Recipe dalam format **step-by-step** (menggantikan RecipeBookViewPage) |

### Detail Mode Baca
- **Base Recipe**: Cards dengan nama, kategori, target, + daftar ingredient per item (icon chevron)
- **Product Recipe**: Per produk, ingredient ditampilkan dengan **nomor langkah** (1, 2, 3...) seperti step-by-step untuk barista/kitchen
- **Semua tombol edit/hapus/tambah disembunyikan**
- Search bar tetap ada
- Tampilkan jumlah Base Recipe dan Product Recipe di header

### Cara kerja
```tsx
const [readMode, setReadMode] = useState(false);

{readMode ? (
  // Render: Base Recipe cards + Product Recipe step-by-step
  <ReadOnlyView
    baseRecipes={baseRecipes}
    productRecipes={productRows}
    inventory={inventory}
    search={searchQuery}
  />
) : (
  // Render: Matrix table + Base Recipe CRUD (tidak berubah)
  <>
    <MatrixTable ... />
    <BaseRecipeSection ... />
  </>
)}
```

Komponen `ReadOnlyView` bisa di-inline di `recipe-matrix.tsx` atau file terpisah. Karena RecipeBookViewPage (~160 baris) relatif kecil, integrasi langsung di matrix page lebih simpel.

---

## Verification Steps

1. Buka `/admin/recipe` → matrix tampil normal, ada **toggle** "Mode Baca" di header
2. Klik toggle → berubah ke mode baca: Base Recipe cards + Product Recipe step-by-step
3. Klik toggle lagi → kembali ke matrix kelola
4. Di mode baca: tidak ada tombol edit/hapus/tambah
5. Klik "Tambah Base Recipe" → modal terbuka, bisa isi form
6. Klik edit di card base recipe → modal edit terbuka dengan data terisi
7. Klik hapus → konfirmasi → base recipe terhapus
8. Buka `/admin/recipe/hpp` → HPP calculator normal
9. Buka `/admin/recipe/view` → 404 (expected)
10. Home dashboard → card "Buku Resep" mengarah ke `/admin/recipe`
11. Sidebar "Lainnya" → tidak ada "Buku Resep"

