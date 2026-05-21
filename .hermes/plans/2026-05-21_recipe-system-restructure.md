# Plan: Restruktur Sistem Produk → Recipe → HPP

## 1. Latar Belakang

### Masalah Saat Ini
- **Produk & Recipe independen**: Produk bisa dibuat tanpa recipe di `/admin/products`. Recipe bisa dibuat tanpa terhubung ke produk di `/admin/recipe`. Tidak ada relasi wajib.
- **Ala Carte keyword matching**: Tidak ada relasi eksplisit — hanya deteksi via `name.includes("ayam mentega")`. Rapuh.
- **Matrix view overload**: `recipe-matrix.tsx` (1520 baris) mencampur view produk, edit ingredient, base recipe, ala carte sync, delete — terlalu banyak tanggung jawab.
- **HPP terpisah**: Di halaman sendiri (`/admin/recipe/hpp`), padahal HPP adalah turunan langsung recipe.

### Prinsip Baru
1. **Produk adalah pusat** — setiap operasi recipe/HPP berawal dari pemilihan produk
2. **Produk → Recipe → HPP** — alur satu arah, tapi bisa dimulai dari halaman mana pun
3. **Produk tanpa recipe harus kelihatan** — ada notifikasi + mekanisme link di recipe & HPP

---

## 2. Arsitektur Alur Baru

```
                           ┌─────────────────────┐
                    ┌────> │  /admin/products     │ ────┐
                    │      │  Buat/Edit Produk    │     │
                    │      └─────────────────────┘     │
                    │                                   ▼
                    │      ┌─────────────────────────────────────┐
                    │      │        /admin/recipe                 │
                    ├──────│  ○ Pilih produk existing             │
                    │      │  ○ ➕ "Buat Produk Baru" (inline)    │
                    │      │  ○ Tab [⚠️ Perlu Resep]             │
                    │      │  ○ Atur bahan baku + steps           │
                    │      └─────────────────────────────────────┘
                    │                                   │
                    │                                   ▼
                    └──────┐ ┌──────────────────────────────────┐
                           │ │     /admin/recipe/hpp             │
                           │ │  ○ Pilih produk existing          │
                           │ │  ○ ➕ "Buat Produk Baru"          │
                           │ │  ○ List produk ⚠️ & ✅ terpisah   │
                           │ │  ○ Lihat HPP + overhead           │
                           └─└──────────────────────────────────┘
```

---

## 3. Perubahan per Halaman

### 3.1 `/admin/recipe` — Recipe Management

**Kondisi sekarang:**
- Matrix view (semua produk × semua inventory)
- Base recipe management di tab terpisah
- Ala carte sync button
- Filter by type (semua/ala-carte/base/produk)

**Perubahan:**
1. **Product Selector** di bagian atas — dropdown pilih produk + tombol "➕ Buat Baru"
2. **Tab [⚠️ Perlu Resep]** — daftar produk tanpa recipe, dengan tombol "Atur Resep" → langsung mode per-produk
3. **Mode per-produk** — saat pilih satu produk, tampilkan hanya ingredient untuk produk itu (bukan matrix seluruhnya)
4. **Matrix view tetap ada** sebagai opsi "Bulk Edit" / "Semua Produk"
5. **Navigasi** — dari recipe ke HPP: `→ /admin/recipe/hpp?productId=xxx`

**Fitur "Buat Produk Baru" (inline):**
- Modal minimal: Nama (wajib), Harga Jual (wajib), Kategori (dropdown)
- Field lain (gambar, deskripsi, variasi, promo) bisa diedit nanti di `/admin/products`
- Submit → panggil `useHybridAddProduct()` → ID produk terpilih otomatis

### 3.2 `/admin/recipe/hpp` — HPP Calculator

**Kondisi sekarang:**
- Halaman terpisah, independent
- Menampilkan HPP per produk

**Perubahan:**
1. **Product Selector** + "➕ Buat Baru" (sama seperti recipe)
2. **Produk terbagi dua section:**
   - ⚠️ **Butuh Resep** — produk tanpa recipe, tombol "Atur Resep" → `/admin/recipe?productId=xxx`
   - ✅ **Punya Resep** — produk siap lihat HPP
3. **Auto-hitung HPP** dari recipe ingredients × latest cost
4. **Tambah overhead costs** (opsional)
5. **Navigasi** — dari HPP ke recipe: `→ /admin/recipe?productId=xxx`

### 3.3 `/admin/products` — Product Management

**Perubahan minimal:**
1. Status badge "⚠️ Belum Resep" atau "✅ Ada Resep" di card/list produk
2. Tombol "Atur Resep" → `/admin/recipe?productId=xxx`
3. Tombol "Lihat HPP" → `/admin/recipe/hpp?productId=xxx`

---

## 4. Komponen Baru / Refactor

### 4.1 Komponen Shared

| Komponen | Lokasi | Fungsi |
|----------|--------|--------|
| `ProductSelector` | `components/admin/product-selector.tsx` | Dropdown pilih produk + tombol "Buat Baru" + status badge |
| `QuickProductModal` | `components/admin/quick-product-modal.tsx` | Modal minimal buat produk baru |
| `MissingRecipeBanner` | `components/admin/missing-recipe-banner.tsx` | Banner/tab daftar produk tanpa recipe |
| `PerProductRecipeEditor` | `components/admin/per-product-recipe-editor.tsx` | Editor recipe untuk satu produk (bukan matrix) |

### 4.2 Data Layer (Hooks)

**Query baru:** Hook `useHybridProductsWithoutRecipes()` — return daftar produk yang belum punya recipe

```
SELECT p.source_id, p.name, p.price, p.is_available
FROM pos.products p
LEFT JOIN pos.recipes r ON r.product_source_id = p.source_id AND r.variant_name IS NULL
WHERE r.source_id IS NULL
```

**Atau pendekatan frontend:**
Dari `products` + `recipes` yang sudah ada → filter produk yang `!recipeByProduct.has(productId)`.

---

## 5. UI/UX Flow Detail

### Flow A: User masuk /admin/recipe dan ada produk tanpa recipe

```
1. Cek: ada produk tanpa recipe?
   ├── Ya → tab [⚠️ Perlu Resep (3)] auto-terpilih + highlight
   │         User lihat daftar → klik salah satu → mode per-produk
   └── Tidak → tab [📋 Semua Resep] default
```

### Flow B: User di /admin/recipe klik "Buat Baru"

```
1. Modal "Produk Baru" muncul
2. Isi: Nama, Harga, Kategori
3. Submit → produk tersimpan
4. Produk otomatis terpilih di ProductSelector
5. User langsung atur bahan & steps
```

### Flow C: User di /admin/recipe/hpp pilih produk tanpa recipe

```
1. ProductSelector pilih produk yang ⚠️
2. Muncul prompt: "Resep belum ada. [Atur Resek Sekarang ➔]"
3. Klik → navigate ke /admin/recipe?productId=xxx
4. Setelah resep tersimpan → back ke HPP → HPP terhitung
```

---

## 6. File yang Terpengaruh

| File | Tipe Perubahan |
|------|---------------|
| `apps/web/src/components/admin/recipe-matrix.tsx` | **Refactor besar** — tambah ProductSelector, tab Perlu Resep, mode per-produk |
| `apps/web/src/components/admin/recipe-book.tsx` | **Minor** — mungkin perlu prop baru untuk mode per-produk |
| `apps/web/src/components/admin/recipe-hpp.tsx` | **Refactor** — tambah ProductSelector, section ⚠️/✅ |
| `apps/web/src/components/admin/recipe-view.tsx` | **Minor** — tambah navigasi ke HPP |
| `apps/web/src/routes/admin/products.lazy.tsx` | **Minor** — status badge + tombol Atur Resep/Lihat HPP |
| `apps/web/src/hooks/use-hybrid-inventory-admin-data.ts` | **Minor** — mungkin tambah hook baru `useHybridProductsWithoutRecipes()` |
| `apps/web/src/components/admin/product-selector.tsx` | **NEW** — komponen shared |
| `apps/web/src/components/admin/quick-product-modal.tsx` | **NEW** — modal buat produk baru |

---

## 7. Keputusan Final ✅

### Keputusan 1: Tab [⚠️ Perlu Resep]
**Pilihan: Tab** — tab terpisah "[⚠️ Perlu Resep]" di `/admin/recipe` dan `/admin/recipe/hpp`. Bersih dan scalable.

### Keputusan 2: Mode Editor Recipe
**Pilihan: Per-produk (default) + toggle ke matrix** — mode default adalah editor per-produk (pilih produk → edit bahan). Ada toggle ke matrix view untuk bulk edit.

### Keputusan 3: Form "Buat Produk Baru"
**Pilihan: Lengkap** — semua field yang ada di halaman `/admin/products`. Jadi form buat produk baru di recipe/HPP tidak berbeda dengan form di halaman produk.

### Keputusan 4: Base Recipe → Halaman Khusus
**Pilihan: Halaman khusus `/admin/recipe/base`** — Base Recipe dipisah dari `/admin/recipe` ke route sendiri.

### Keputusan 5: Ala Carte Flag Database
**Pilihan: Ya** — tambah kolom `is_ala_carte` atau `ala_carte_group` di `pos.products`. Ganti deteksi keyword matching dengan relasi eksplisit.

### Keputusan 6: Wajib Semua Produk Punya Recipe
**Pilihan: Wajib semua** — konsisten, auto-deduct untuk semua produk. Produk tanpa recipe akan selalu muncul di tab [⚠️ Perlu Resep].

### Keputusan 7: Eksekusi
**Pilihan: Semua sekali jalan** — kerjakan tuntas dalam 1 sesi. Tidak bertahap.

---

## 8. Daftar Lengkap Perubahan

### Migration Database (NEW)
| File | Isi |
|------|-----|
| Migration baru | Tambah kolom `is_ala_carte boolean default false` di `pos.products` + update view `pos_products_all` |

### Route Baru (NEW)
| Route | File | Fungsi |
|-------|------|--------|
| `/admin/recipe/base` | `recipe/base.tsx` + `recipe/base.lazy.tsx` | Base Recipe management (pindahan dari tab di recipe-matrix) |

### Komponen Baru (NEW)
| Komponen | Lokasi | Fungsi |
|----------|--------|--------|
| `ProductSelector` | `components/admin/product-selector.tsx` | Dropdown pilih produk + tombol "Buat Baru" + status badge |
| `QuickProductForm` | `components/admin/quick-product-form.tsx` | Form lengkap buat produk baru (mirip form di products page) |
| `MissingRecipeTab` | `components/admin/missing-recipe-tab.tsx` | Konten tab [⚠️ Perlu Resep] — daftar + tombol Atur Resep |
| `PerProductRecipeEditor` | `components/admin/per-product-recipe-editor.tsx` | Editor recipe untuk satu produk tertentu |
| `RecipeHppMissingRecipe` | `components/admin/recipe-hpp-missing-recipe.tsx` | Section ⚠️ di HPP page |

### Perubahan File Existing
| File | Perubahan |
|------|-----------|
| `apps/web/src/components/admin/recipe-matrix.tsx` | **Refactor besar** — tambah ProductSelector + tab [⚠️ Perlu Resep] + mode per-produk + "Buat Baru". Matrix view jadi mode toggle. |
| `apps/web/src/components/admin/recipe-hpp.tsx` | **Refactor** — tambah ProductSelector + section ⚠️/✅ + "Buat Baru" |
| `apps/web/src/components/admin/recipe-book.tsx` | **Minor** — mungkin perlu prop baru untuk mode per-produk |
| `apps/web/src/components/admin/recipe-view.tsx` | **Minor** — tambah navigasi ke HPP |
| `apps/web/src/routes/admin/products.lazy.tsx` | **Minor** — status badge (⚠️/✅ Resep) + tombol "Atur Resep" & "Lihat HPP" |
| `apps/web/src/hooks/use-hybrid-inventory-admin-data.ts` | **Minor** — tambah hook `useHybridProductsWithoutRecipes()` |
| `supabase/migrations/*.sql` | **NEW** — migration untuk kolom `is_ala_carte` |

### Sidebar Admin (`route.tsx`)
Tambah entry untuk:
- `/admin/recipe/base` — Base Recipe

