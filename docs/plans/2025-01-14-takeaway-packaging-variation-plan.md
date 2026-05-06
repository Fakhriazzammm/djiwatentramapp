# Variasi Takeaway HPP-Only Implementation Plan

**Goal:** Tambah variasi "Takeaway" (Plastic Cup, Paper Cup, Plastic Bag, Sedotan) yang **tidak menambah harga ke konsumen** (Rp 0) tapi **tercatat di HPP** sebagai biaya tambahan per order item.

**Constraint:** POS frontend (`product-modal.tsx`) saat ini hardcode variasi (Regular/Large, Hot/Iced) dan **tidak membaca field `variations` dari database**. Variasi di admin products page (`products.lazy.tsx`) tersimpan tapi tidak terhubung ke POS kasir.

**Architecture Decision:** Lewati perbaikan sistem variasi end-to-end yang besar. Tambahkan tracking packaging cost langsung di order item dengan field baru `packagingItems`, dan sediakan UI takeaway di POS yang terpisah dari sistem variasi.

---

## Task 1: Extend Schema — Order Item Packaging Cost

**Objective:** Tambah field untuk menyimpan pilihan takeaway packaging beserta cost-nya di level order item.

**Files:**
- Modify: `supabase/migrations/XXXX_add_packaging_to_order_items.sql`

**Step 1: SQL Migration**

```sql
-- Tambah kolom packaging_items ke pos.orders items (JSONB)
-- pos.orders.itemsWithMetadata sudah berupa JSONB array
-- Kita akan extend struktur item di frontend/backend, tidak perlu ALTER TABLE
-- karena itemsWithMetadata adalah JSONB schemaless.

-- Tapi untuk query/reporting, buat view terpisah:
create or replace view public.pos_order_packaging as
select
  _id as order_id,
  jsonb_array_elements(items_with_metadata) as item,
  (jsonb_array_elements(items_with_metadata)->>'packagingItems')::jsonb as packaging_items
from pos.orders
where items_with_metadata is not null;

-- Tabel lookup packaging master (opsional, untuk autocomplete di POS)
create table if not exists pos.packaging_items (
  id bigserial primary key,
  name text not null unique,
  cost integer not null default 0, -- cost dalam rupiah
  category text check (category in ('minuman', 'makanan', 'universal')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Seed data
insert into pos.packaging_items (name, cost, category)
values
  ('Plastic Cup', 1500, 'minuman'),
  ('Paper Cup', 1500, 'minuman'),
  ('Plastic Bag', 500, 'makanan'),
  ('Sedotan', 200, 'universal')
on conflict (name) do update set cost = excluded.cost, category = excluded.category;

grant all on pos.packaging_items to anon, authenticated;
grant usage on sequence pos.packaging_items_id_seq to anon, authenticated;
```

**Step 2: Verifikasi**

```bash
supabase db push
# Pastikan tidak ada error
```

---

## Task 2: Frontend Types — Extend Order Item Interface

**Objective:** Tambah tipe `packagingItems` di order item supaya TypeScript mengenali field baru.

**Files:**
- Modify: `apps/web/src/types/backend-compat.ts` atau cari interface order item

**Step 1: Cari definisi order item**

```bash
grep -r "interface.*OrderItem\|itemsWithMetadata\|variant.*string" apps/web/src/types/
```

**Step 2: Extend tipe**

```typescript
interface PackagingItem {
  name: string;
  cost: number;      // biaya HPP
  qty: number;       // biasanya 1
}

// Jika order item didefinisikan inline di cart-context.tsx, extend di sana:
interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  variant?: string;
  packagingItems?: PackagingItem[];  // ← NEW
}
```

---

## Task 3: POS UI — Tambah Takeaway Selector di Product Modal

**Objective:** Tambah section "Pilihan Takeaway" di `product-modal.tsx` dengan opsi packaging yang bisa dipilih kasir.

**Files:**
- Modify: `apps/web/src/components/pos/product-modal.tsx`
- Modify: `apps/web/src/context/cart-context.tsx`

**Step 1: Fetch packaging items di product modal**

```tsx
// Di ProductModal, tambah:
const [selectedPackaging, setSelectedPackaging] = useState<PackagingItem[]>([]);

// Fetch dari Supabase
const { data: packagingOptions } = useSupabaseValue(
  'packaging-items',
  async () => {
    const supabase = createClient();
    const { data } = await supabase.from('pos_packaging_items')
      .select('*').eq('is_active', true);
    return data ?? [];
  },
  []
);

// Filter berdasarkan kategori produk (minuman/makanan)
// Asumsi: product punya categoryId, kita lookup category track
```

**Step 2: Render takeaway selector**

```tsx
<fieldset className="space-y-3">
  <legend className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
    Pilihan Takeaway (tidak menambah harga)
  </legend>
  <div className="flex flex-wrap gap-2">
    {packagingOptions?.map((opt) => (
      <button
        key={opt.name}
        type="button"
        onClick={() => togglePackaging(opt)}
        className={`rounded-lg border-2 px-4 py-2 text-sm transition-all ${
          isSelected(opt)
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background text-muted-foreground hover:border-primary/50"
        }`}
      >
        {opt.name}
        <span className="ml-1 text-[10px] opacity-70">
          (HPP Rp {opt.cost.toLocaleString()})
        </span>
      </button>
    ))}
  </div>
</fieldset>
```

**Step 3: Update handleAddToCart**

```tsx
const handleAddToCart = () => {
  addToCart({
    productId: product._id,
    name: product.name,
    price: product.price, // ← harga produk saja, tidak ditambah packaging
    quantity,
    image: product.image,
    variant: `${variant.size}, ${variant.temp}`,
    packagingItems: selectedPackaging,  // ← NEW
  });
  // ...
};
```

**Step 4: Update cart context**

Di `cart-context.tsx`, pastikan `packagingItems` disimpan dan tidak mempengaruhi perhitungan subtotal/total.

```tsx
// Saat menghitung total, packagingItems TIDAK ikut dijumlahkan:
const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
// packaging cost di-exclude dari subtotal
```

---

## Task 4: Checkout & Order Creation — Simpan Packaging ke Database

**Objective:** Saat order dibuat, field `packagingItems` masuk ke `itemsWithMetadata` di Supabase.

**Files:**
- Modify: `apps/web/src/hooks/use-hybrid-write-actions.ts` atau file yang membuat order
- Cari: fungsi `createOrder` atau `insertOrder`

**Step 1: Cari order creation hook**

```bash
grep -r "addOrder\|createOrder\|insertOrder\|pos_orders.*insert" apps/web/src/hooks/
```

**Step 2: Extend payload order item**

```typescript
// Saat mapping cart items ke order items:
const orderItems = cart.map(item => ({
  productId: item.productId,
  name: item.name,
  price: item.price,
  quantity: item.quantity,
  variant: item.variant,
  packagingItems: item.packagingItems ?? [],  // ← NEW
  // ... field lain
}));
```

**Step 3: Verifikasi field tersimpan**

```bash
# Cek di Supabase:
select items_with_metadata from pos.orders order by created_at desc limit 1;
```

---

## Task 5: HPP Calculation — Include Packaging Cost

**Objective:** Update perhitungan HPP/laporan keuangan agar packaging cost masuk ke biaya (expense).

**Files:**
- Modify: `apps/web/src/hooks/use-hybrid-finance-analytics-data.ts`
- Modify: `apps/web/src/components/admin/recipe-book.tsx` (jika ada per-item HPP)

**Step 1: Hitung packaging cost per order**

```typescript
function calculatePackagingCost(order: any): number {
  const items = order.itemsWithMetadata ?? [];
  return items.reduce((total: number, item: any) => {
    const packaging = item.packagingItems ?? [];
    return total + packaging.reduce((sum: number, p: any) => sum + (p.cost * (p.qty ?? 1)), 0);
  }, 0);
}
```

**Step 2: Masukkan ke laporan profit/loss**

Di `useHybridProfitLossReport` atau `useHybridPeriodComparison`, tambah:

```typescript
const packagingCost = orders.reduce((sum, order) => sum + calculatePackagingCost(order), 0);
// packagingCost masuk ke expense atau COGS
```

**Step 3: Update margin analysis (opsional)**

Jika ada per-product margin analysis, tambah packaging cost ke HPP per serving:

```typescript
// Di computeHppMetrics atau fungsi serupa:
const packagingCost = safeNum(orderItem.packagingCost ?? 0);
const totalHpp = hppPerServing + packagingCost;
```

---

## Task 6: Admin Products Page — Tambah Preset Variasi Takeaway

**Objective:** Di admin products page, tambah preset "Takeaway" sebagai variasi template.

**Files:**
- Modify: `apps/web/src/routes/admin/products.lazy.tsx`
- Modify: Database `pos_variation_presets`

**Step 1: Insert preset via SQL**

```sql
insert into pos_variation_presets (name, options)
values (
  'Takeaway',
  '[
    {"name": "Plastic Cup", "price": 0, "cost": 1500},
    {"name": "Paper Cup", "price": 0, "cost": 1500},
    {"name": "Plastic Bag", "price": 0, "cost": 500},
    {"name": "Sedotan", "price": 0, "cost": 200}
  ]'::jsonb
)
on conflict do nothing;
```

**Step 2: Extend VariationOption type**

```typescript
interface VariationOption {
  name: string;
  price: number;   // customer-facing price (0 untuk takeaway)
  cost?: number;   // internal HPP cost ← NEW
}
```

**Note:** Karena POS tidak membaca variasi dari database, preset ini hanya untuk dokumentasi/admin reference. POS akan pakai mekanisme `packagingItems` terpisah (Task 3-4).

---

## Task 7: Build & Test

**Commands:**

```bash
cd apps/web
bun run build
```

**Test scenarios:**
1. Buka POS → pilih produk → muncul opsi takeaway → pilih Plastic Cup + Sedotan
2. Checkout → total harga tidak bertambah (tetap harga produk saja)
3. Cek database → `itemsWithMetadata` berisi `packagingItems: [{name: "Plastic Cup", cost: 1500, qty: 1}, ...]`
4. Buka laporan profit/loss → biaya packaging muncul di COGS/expense

---

## Summary Perubahan File

| File | Change |
|---|---|
| `supabase/migrations/XXXX_add_packaging.sql` | New — tabel `pos.packaging_items` + view |
| `apps/web/src/types/backend-compat.ts` (atau cart-context) | Extend — `PackagingItem` type |
| `apps/web/src/components/pos/product-modal.tsx` | Modify — tambah takeaway selector |
| `apps/web/src/context/cart-context.tsx` | Modify — simpan `packagingItems` |
| `apps/web/src/hooks/use-hybrid-write-actions.ts` | Modify — sertakan packaging di order payload |
| `apps/web/src/hooks/use-hybrid-finance-analytics-data.ts` | Modify — hitung packaging cost |
| `apps/web/src/routes/admin/products.lazy.tsx` | Modify — extend VariationOption type + preset |

**Commit message pattern:** `feat: add takeaway packaging cost tracking (HPP-only)`
