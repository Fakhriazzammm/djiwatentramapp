# Plan: Sistem Linking Produk ↔ Resep + Full Inline Edit

## Visi

Tiga halaman terhubung secara **eksplisit dan sistematis**:

```
┌──────────────────────────────────────────────────────────┐
│                      /admin/products                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │ FULL INLINE EDIT — semua kolom bisa diedit langsung │  │
│  │ di baris tabel (klik → edit → enter save)          │  │
│  │                                                     │  │
│  │ Kolom linking:                                      │  │
│  │ "Resep"   → link ke /admin/recipe?productId=X      │  │
│  │ "HPP"     → link ke /admin/recipe/hpp?productId=X  │  │
│  └────────────────────────────────────────────────────┘  │
│                    ↕ link 2 arah                          │
├──────────────────────────────────────────────────────────┤
│                    /admin/recipe                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔗 Produk Terkait: Ayam Mentega                    │  │
│  │    [Lihat Produk] [Hitung HPP]                     │  │
│  │ ──────────────────────────────────────────────     │  │
│  │ ➕ Link ke Produk Lain (pilih dari daftar produk)  │  │
│  │                                                    │  │
│  │ Daftar Produk Terlink:                             │  │
│  │ ✅ Ayam Mentega (Rp25.000)  [Unlink]              │  │
│  │ ✅ Ayam Kremes (Rp27.000)   [Unlink]              │  │
│  └────────────────────────────────────────────────────┘  │
│                    ↕ link 2 arah                          │
├──────────────────────────────────────────────────────────┤
│                   /admin/recipe/hpp                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔗 Produk Terkait: Ayam Mentega                    │  │
│  │    [Lihat Produk] [Atur Resep]                     │  │
│  │ ──────────────────────────────────────────────     │  │
│  │ ➕ Link ke Produk Lain (pilih dari daftar produk)  │  │
│  │                                                    │  │
│  │ Daftar Produk Terlink:                             │  │
│  │ ✅ Ayam Mentega (Rp25.000)  [Unlink]              │  │
│  │ ✅ Ayam Kremes (Rp27.000)   [Unlink]              │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## A. `/admin/products` — Full Inline Edit + Link Columns

### A.1 Konsep

Semua kolom di tabel produk bisa diedit **inline langsung di baris** — klik cell → jadi input → Enter/blur → save otomatis. Tidak perlu modal edit terpisah.

### A.2 Semua Kolom & Mode Edit

| Kolom | Tipe Edit | Detail Implementasi |
|-------|-----------|-------------------|
| **No. Menu** | `input type="number"` | `onBlur` → `handleInlineTextUpdate("menuNumber", val)` |
| **Nama** | `input type="text"` | `onBlur` → update nama; thumbnail tetap tampil |
| **Deskripsi** | `input type="text"` + AI button | `onBlur` → update; Sparkles button untuk AI generate |
| **Kategori** | `<select>` dropdown | `onChange` → langsung save |
| **Sub Kategori** | `<select>` dropdown | `onChange` → langsung save |
| **Variasi** | Badge count → klik modal | Tampilkan jumlah variasi, klik buka modal daftar variasi (inline popover) |
| **Ala Carte** | Toggle badge | Klik toggle → langsung update DB |
| **Harga** | `input type="number"` | `onBlur` → format rupiah otomatis |
| **Promo** | `input type="number"` | `onBlur` → format rupiah |
| **Stok** | `input type="number"` | `onBlur` → langsung save |
| **Status** | Toggle badge | Klik → toggle active/inactive |
| **Resep** | Link badge (read-only) | ✅ Ada Resep → link ke `/admin/recipe?productId=X` |
| **HPP** | Link badge (read-only) | 📊 HPP → link ke `/admin/recipe/hpp?productId=X` |
| **Aksi** | Tombol delete | Hapus produk |

### A.3 Konsep Linking "Resep" & "HPP"

Produk bisa di-linked ke resep yang ada di `/admin/recipe` dan `/admin/recipe/hpp`.

**Bagaimana cara link-nya?**

Di halaman `/admin/recipe` dan `/admin/recipe/hpp`, admin membuat resep untuk suatu produk. Begitu resep dibuat + disimpan, maka otomatis:

1. **Kolom "Resep"** di `/admin/products` → berubah jadi ✅ Ada Resep (link ke recipe page)
2. **Kolom "HPP"** di `/admin/products` → berubah jadi 📊 HPP (link ke HPP page)

**Logic deteksi:**
```tsx
const hasRecipe = recipeData?.some(r => r.productId === product._id);
const hasHpp = hppData?.some(h => h.productId === product._id);
```

Jika `hasRecipe = true` → ✅ Ada Resep
Jika `hasHpp = true` → 📊 HPP
Jika tidak → ⚠️ Atur (link ke `/admin/recipe?productId=X` untuk membuat baru)

### A.4 Detail Kolom Link

#### Kolom Resep
```tsx
{hasRecipe ? (
  <Link to="/admin/recipe" search={{ productId: String(product._id) }}
    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
  >
    ✅ Resep
  </Link>
) : (
  <Link to="/admin/recipe" search={{ productId: String(product._id) }}
    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
  >
    ⚠️ Atur
  </Link>
)}
```

#### Kolom HPP
```tsx
{hasHpp ? (
  <Link to="/admin/recipe/hpp" search={{ productId: String(product._id) }}
    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
  >
    📊 HPP
  </Link>
) : (
  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
    —
  </span>
)}
```

### A.5 Struktur Tabel

**HEADER (14 kolom):**
```
☐ | No | Nama | Deskripsi | Kategori | Sub | Var | ALC | Harga | Promo | Stok | Status | Resep | HPP | Aksi
```

**ROW DATA:**
```
<td>menuNumber (input number)</td>
<td>nama + thumbnail (input text)</td>
<td>deskripsi + AI button (input text)</td>
<td>kategori (select)</td>
<td>sub kategori (select)</td>
<td>variasi badge (button→popover)</td>
<td>ala carte toggle (button)</td>
<td>harga (input number)</td>
<td>promo (input number)</td>
<td>stok (input number)</td>
<td>status toggle (button)</td>
<td>resep link badge</td>
<td>hpp link badge</td>
<td>delete button</td>
```

### A.6 Data Source untuk Deteksi Link

**Yang perlu disiapkan:**
- Data resep dari `pos.recipe` → mapping `productId → recipe exists`
- Data HPP dari `pos.recipe` → mapping `productId → hpp exists`
- Atau cukup 1 data source: `pos.recipe` berisi productId + ingredients + cost

**Hook yang dibutuhkan:**
```tsx
// Ambil semua recipe untuk deteksi link
const allRecipes = useHybridRecipes({}) as any[] | null;

// Mapping: productId → { hasRecipe: boolean, hasHpp: boolean }
const recipeMap = useMemo(() => {
  const map = new Map();
  allRecipes?.forEach(r => {
    map.set(r.productId, {
      hasRecipe: true,
      hasHpp: !!(r.costPerUnit || r.totalCost)
    });
  });
  return map;
}, [allRecipes]);
```

---

## B. `/admin/recipe` — Linked Product Visibility + Multi-Product Link

### B.1 Konsep

Halaman `/admin/recipe` menampilkan:
1. **Banner Produk Terkait** — jika ada productId yang di-link
2. **Daftar Produk Terlink** — semua produk yang menggunakan resep ini
3. **Tambah Link** — admin bisa link resep ke produk lain

### B.2 Banner Produk Terkait

Muncul saat resep sedang dipilih/diedit:

```tsx
┌──────────────────────────────────────────────────────┐
│ 🔗 Produk Terkait: Ayam Mentega                      │
│    Kategori: Makanan · Harga: Rp25.000               │
│    [🔍 Lihat Produk ↗]  [📊 Hitung HPP]              │
└──────────────────────────────────────────────────────┘
```

**Action buttons:**
| Tombol | Navigasi |
|--------|----------|
| 🔍 Lihat Produk | `/admin/products` (modal/filter) |
| 📊 Hitung HPP | `/admin/recipe/hpp?productId=X` |

### B.3 Daftar Semua Produk Terlink

Menampilkan LIST produk yang ter-link ke resep ini:

```tsx
┌──────────────────────────────────────────────────────┐
│ 📋 Produk Terkait (3)                                │
│                                                      │
│ ✅ Ayam Mentega      (Rp25.000)  [Unlink]           │
│ ✅ Ayam Kremes       (Rp27.000)  [Unlink]           │
│ ✅ Es Teh Manis      (Rp5.000)   [Unlink]           │
│                                                      │
│ ┌──────────────────────────────────────────┐         │
│ │ ➕ Link ke Produk Lain                   │         │
│ │ Select produk dari daftar...             │         │
│ └──────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────┘
```

**Fitur:**
- Tampilkan semua produk yang terlink ke resep ini
- Setiap baris: nama produk, harga, tombol **Unlink**
- Tombol **"Link ke Produk Lain"** → modal/dropdown pilih produk
- Link ini menyimpan mapping di tabel `pos.recipe_links` atau field `linkedProductIds` di `pos.recipe`

### B.4 Implementasi Link

**Database approach:**
Ada 2 opsi:

| Opsi | Cara Kerja | Pro | Kontra |
|------|-----------|-----|--------|
| **A. ProductSelector existing** | Recipe page sudah punya ProductSelector — pilih produk → otomatis terlink | Tidak perlu DB baru | Cuma 1 produk per resep |
| **B. Banyak-to-banyak (N:N)** | Tabel `pos.recipe_products` — 1 resep bisa linked ke banyak produk | Fleksibel | Perlu migration baru |

**Rekomendasi: Opsi B** — karena user minta "linked ke produk mana saja".

```sql
-- Migration: tabel linking resep ↔ produk
CREATE TABLE pos.recipe_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id TEXT NOT NULL REFERENCES pos.recipe(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES pos.products(_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(recipe_id, product_id)
);

-- View untuk query mudah
CREATE VIEW pos.recipe_products_view AS
SELECT 
  rp.recipe_id,
  rp.product_id,
  p.name AS product_name,
  p.price AS product_price,
  p.category_id AS product_category
FROM pos.recipe_products rp
JOIN pos.products p ON rp.product_id = p._id;
```

### B.5 UI Component — Linked Product List

```tsx
// State
const [linkedProducts, setLinkedProducts] = useState<any[]>([]);
const [showLinkModal, setShowLinkModal] = useState(false);

// Render
{linkedProducts.length > 0 && (
  <div className="rounded-lg border p-3 mb-3">
    <h3 className="text-xs font-semibold mb-2">
      📋 Produk Terkait ({linkedProducts.length})
    </h3>
    <div className="space-y-1">
      {linkedProducts.map(lp => (
        <div key={lp.product_id} className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span className="text-[11px] font-medium">{lp.product_name}</span>
            <span className="text-[10px] text-muted-foreground">
              {formatRupiah(lp.product_price ?? 0)}
            </span>
          </div>
          <button
            className="text-[10px] text-red-500 hover:text-red-700"
            onClick={() => unlinkProduct(lp.recipe_id, lp.product_id)}
          >
            [Unlink]
          </button>
        </div>
      ))}
    </div>
  </div>
)}

{/* Tombol link ke produk lain */}
<Button
  size="sm" variant="outline"
  className="h-7 text-[10px] w-full"
  onClick={() => setShowLinkModal(true)}
>
  <Plus className="h-3 w-3 mr-1" />
  Link ke Produk Lain
</Button>

{/* Modal/Dropdown pilih produk */}
{showLinkModal && (
  <ProductLinkModal
    allProducts={allProducts}
    linkedProductIds={linkedProducts.map(lp => lp.product_id)}
    onLink={(productId) => linkProduct(recipeId, productId)}
    onClose={() => setShowLinkModal(false)}
  />
)}
```

---

## C. `/admin/recipe/hpp` — Linked Product Visibility

### C.1 Konsep

Sama dengan `/admin/recipe` — menampilkan:
1. Banner Produk Terkait
2. Daftar produk terlink
3. Tambah/Unlink produk

### C.2 Banner + Product List

```tsx
┌──────────────────────────────────────────────────────┐
│ 🔗 Produk Terkait: Ayam Mentega                      │
│    [🔍 Lihat Produk]  [✏️ Atur Resep]               │
├──────────────────────────────────────────────────────┤
│ 📋 Produk Terkait (2)                                │
│ ✅ Ayam Mentega     (Rp25.000)  [Unlink]            │
│ ✅ Ayam Kremes      (Rp27.000)  [Unlink]            │
│                                                      │
│ ➕ Link ke Produk Lain                               │
└──────────────────────────────────────────────────────┘
```

### C.3 Link ke Resep

Tombol **"Atur Resep"** navigasi ke `/admin/recipe?s=recipeId` untuk edit resep terkait.

---

## D. Arsitektur Data Linking

### D.1 Tabel & Relasi

```
┌─────────────────────┐
│   pos.products      │
│  ─────────────────  │
│  _id (PK)           │
│  name               │
│  price              │
│  category_id        │
│  sub_category       │  ← mungkin belum ada
│  isAlaCarte         │
│  ...                │
└─────────┬───────────┘
          │
          │ 1:N via pos.recipe_products
          │
┌─────────▼───────────┐
│  pos.recipe_products │  ← NEW table
│  ─────────────────  │
│  id (PK)            │
│  recipe_id (FK)     │
│  product_id (FK)    │
│  created_at         │
└─────────┬───────────┘
          │
          │ N:1
          │
┌─────────▼───────────┐
│   pos.recipe        │
│  ─────────────────  │
│  id (PK)            │
│  name               │
│  ingredients        │
│  instructions       │
│  ...                │
└─────────────────────┘
```

### D.2 Database Migration

```sql
-- Migration 1: Tambah kolom sub_category (jika belum ada)
ALTER TABLE pos.products ADD COLUMN IF NOT EXISTS sub_category TEXT;

-- Migration 2: Tabel linking resep ↔ produk
CREATE TABLE IF NOT EXISTS pos.recipe_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id TEXT NOT NULL REFERENCES pos.recipe(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES pos.products(_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(recipe_id, product_id)
);

-- Migration 3: View untuk query mudah
CREATE OR REPLACE VIEW pos.recipe_products_view AS
SELECT 
  rp.recipe_id,
  rp.product_id,
  p.name AS product_name,
  p.price AS product_price,
  p.category_id AS product_category
FROM pos.recipe_products rp
JOIN pos.products p ON rp.product_id = p._id;
```

### D.3 Query Patterns

**Get all linked products for a recipe:**
```sql
SELECT * FROM pos.recipe_products_view
WHERE recipe_id = 'recipe-123';
```

**Get all linked recipes for a product:**
```sql
SELECT r.* FROM pos.recipe r
JOIN pos.recipe_products rp ON r.id = rp.recipe_id
WHERE rp.product_id = 'product-456';
```

**Link a product to recipe:**
```sql
INSERT INTO pos.recipe_products (recipe_id, product_id)
VALUES ('recipe-123', 'product-456')
ON CONFLICT (recipe_id, product_id) DO NOTHING;
```

**Unlink:**
```sql
DELETE FROM pos.recipe_products
WHERE recipe_id = 'recipe-123' AND product_id = 'product-456';
```

---

## E. Hook & Data Flow

### E.1 Hook Baru

**File:** `apps/web/src/hooks/use-hybrid-recipe-data.ts` (atau tambah di hook existing)

```tsx
// Ambil semua recipe_products untuk linking
export function useHybridRecipeProducts() {
  return useSupabaseLiveValue<RecipeProduct[]>({
    key: 'recipe-products',
    table: 'pos.recipe_products_view',
    order: { column: 'product_name' },
  });
}

// Write functions
export async function linkProductToRecipe(recipeId: string, productId: string) {
  const { data, error } = await supabase.schema('pos')
    .from('recipe_products')
    .insert({ recipe_id: recipeId, product_id: productId })
    .select()
    .single();
  return { data, error };
}

export async function unlinkProductFromRecipe(recipeId: string, productId: string) {
  const { error } = await supabase.schema('pos')
    .from('recipe_products')
    .delete()
    .eq('recipe_id', recipeId)
    .eq('product_id', productId);
  return { error };
}
```

### E.2 Data Flow Diagram

```
[pos.products]       [pos.recipe]         [pos.recipe_products]
     │                    │                       │
     │                    │   (link/unlink)        │
     │                    │◄──────────────────────►│
     │                    │                       │
     │  ┌─────────────────┴────────────┐          │
     │  │  useHybridRecipeProducts()   │          │
     │  │  → [recipe_id, product_id]  │          │
     │  └────────────┬────────────────┘          │
     │               │                           │
     ▼               ▼                           ▼
┌─────────┐  ┌──────────────┐           ┌────────────────┐
│Products │  │ Recipe Page  │           │ HPP Page       │
│Table    │  │ Banner +     │           │ Banner +       │
│         │  │ Product List │           │ Product List   │
└─────────┘  └──────────────┘           └────────────────┘
```

---

## F. Prioritas Eksekusi

### Wave 1 🔥 (paralel — independen)

| # | Task | File | Detail |
|---|------|------|--------|
| 1 | **Migration DB** — buat tabel `pos.recipe_products` + view + kolom sub_category | `supabase/migrations/` | SQL migration |
| 2 | **Hook `useHybridRecipeProducts`** — read + write functions | `use-hybrid-recipe-data.ts` | CRUD recipe_products |
| 3 | **Banner "Produk Terkait" di recipe page** | `recipe-matrix.tsx` | +25 baris |

### Wave 2 🔥 (paralel — independen)

| # | Task | File | Detail |
|---|------|------|--------|
| 4 | **Banner "Produk Terkait" di HPP page** | `recipe-hpp.tsx` | +25 baris |
| 5 | **Daftar Produk Terlink + Link/Unlink di recipe page** | `recipe-matrix.tsx` | ~60 baris |
| 6 | **Daftar Produk Terlink + Link/Unlink di HPP page** | `recipe-hpp.tsx` | ~60 baris |

### Wave 3 (dependen — perlu Wave 1 selesai)

| # | Task | File | Detail |
|---|------|------|--------|
| 7 | **Kolom Resep + HPP di products table** | `products.lazy.tsx` | ~40 baris — baca dari recipe_products + recipe |
| 8 | **Full inline edit improvements di products table** | `products.lazy.tsx` | Pastikan semua kolom inline editable |
| 9 | **Build + typecheck + verifikasi** | — | Pastikan tidak ada error |

---

## G. Files Likely to Change

| File | Perubahan |
|------|-----------|
| `supabase/migrations/20260521000001_recipe_products_link.sql` | **NEW** — migration |
| `apps/web/src/hooks/use-hybrid-recipe-data.ts` | **NEW/MOD** — hook recipe_products |
| `apps/web/src/components/admin/recipe-matrix.tsx` | Banner + product list + link/unlink |
| `apps/web/src/components/admin/recipe-hpp.tsx` | Banner + product list + link/unlink |
| `apps/web/src/routes/admin/products.lazy.tsx` | Kolom Resep + HPP + inline edit |

---

## H. Verification Checklist

- [ ] Migration jalan: `pos.recipe_products` terbuat + view
- [ ] Bisa link produk ke resep dari recipe page
- [ ] Bisa unlink produk dari resep
- [ ] Banner "Produk Terkait" muncul di recipe page saat produk dipilih
- [ ] Banner "Produk Terkait" muncul di HPP page saat produk dipilih
- [ ] Kolom "Resep" di products table: ✅/⚠️ sesuai status link
- [ ] Kolom "HPP" di products table: 📊/— sesuai status
- [ ] Klik ✅ Resep → navigasi ke `/admin/recipe?productId=X`
- [ ] Klik 📊 HPP → navigasi ke `/admin/recipe/hpp?productId=X`
- [ ] Build lulus (0 error)
- [ ] Refresh halaman → data persist
