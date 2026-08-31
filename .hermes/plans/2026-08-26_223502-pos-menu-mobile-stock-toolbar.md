# Plan: POS `/menu` Mobile Stock Toolbar

## Status

Planning only. Belum ada implementasi kode, migration, deployment, commit, atau perubahan production.

## Goal

Membangun fitur **Pengaturan Stok Menu** dari toolbar atas `apps/pos` `/menu` dengan UI mobile-first yang sederhana, cepat, dan bergaya Apple/iOS:

```text
Toolbar `/menu`
  → tombol Stok
  → panel stok
  → search produk
  → kategori
  → subkategori
  → filter status
  → list produk
  → checkbox | nama | jumlah | toggle availability
```

Fitur harus tersinkron dengan POS, Admin, Customer App, Inventory/Recipe, dan Stock Opname tanpa mencampur stok menu dengan stok bahan baku.

## Current Context

Audit read-only menemukan:

- `apps/pos/src/routes/menu.lazy.tsx` sudah merender stok dari `product.quantity` dan availability card.
- Toolbar/menu sudah memiliki area sticky untuk search, kategori, dan subkategori.
- `useHybridProducts()` membaca view `public.pos_products` melalui shared hook.
- Shared mapper mengambil `quantity`, `isAvailable`, `categoryId`, `menuNumber`, dan metadata produk.
- Kategori memiliki relasi parent/subcategory melalui `parentId`.
- `apps/pos/src/components/inventory/fast-stock-table.tsx` sudah memiliki alur perubahan stok menu dengan recipe/bahan baku dan validasi recipe.
- Admin memiliki surface produk, inventory, stock overview, recipe, dan HPP yang bersinggungan.
- Customer App memakai shared product hook untuk katalog dan availability.
- Stock opname Bar/Kitchen merupakan alur audit terpisah saat checkout shift.
- Ada perubahan aktif/pre-existing di repository. Implementasi wajib staging selektif hanya pada file task ini; jangan memakai `git add -A`.

## Product Decision

Toolbar atas `/menu` dipilih sebagai entry point. Panel stok tidak menjadi halaman inventory penuh dan tidak memindahkan fungsi Admin Inventory.

```text
POS `/menu`:
  kontrol operasional cepat untuk stok menu dan availability

Admin Inventory/Recipe:
  stok bahan baku, recipe, unit, HPP, adjustment, konfigurasi

Customer App:
  hanya menerima availability terbaru, bukan angka stok internal
```

## Alternatives Analysis

### Option A: Toolbar + bottom sheet/side sheet — rekomendasi

| Pros | Cons |
|---|---|
| Cepat diakses tanpa meninggalkan `/menu` | Panel perlu menjaga scroll dan safe-area |
| Konteks kasir tetap terjaga | Perlu desain list mobile yang padat tetapi terbaca |
| Cocok untuk aksi cepat dan bulk selection | Tidak cocok untuk konfigurasi recipe mendalam |

### Option B: Halaman `/stock` terpisah

| Pros | Cons |
|---|---|
| Ruang lebih luas untuk inventory | Kasir keluar dari konteks penjualan |
| Cocok untuk admin dan audit | Lebih lambat untuk koreksi operasional |
| Mudah menampung filter kompleks | Menambah route/navigation/deployment surface |

### Recommendation

Pilih **Option A** untuk POS. Admin tetap memakai halaman inventory/recipe yang sudah ada. Jika nanti dibutuhkan audit mendalam, panel hanya menyediakan link/CTA ke Admin Inventory untuk role berwenang, bukan menyalin semua fungsi admin ke `/menu`.

## UI/UX Specification

### Design principles

| Prinsip | Penerapan |
|---|---|
| Function first | Satu panel, satu tujuan: menemukan dan mengubah status/stok menu |
| iOS/mobile-first | Bottom sheet rounded 24px, safe-area, minimum touch target 44px |
| Scan cepat | Search paling atas, chips horizontal, list sederhana |
| Hierarchy jelas | Nama produk primary; kategori/status secondary; angka/toggle sebagai control |
| Feedback cepat | Optimistic visual terbatas dengan rollback/error; toast sukses singkat |
| No over-design | Tidak ada grafik, blur berat, tabel teknis, atau animasi dekoratif |

### Entry toolbar

```text
[ Search produk... ]                         [ 📦 Stok ]
```

- Tombol `Stok` minimum 44px.
- Badge opsional: `Stok · 3` jika ada produk menipis/habis.
- Tidak mengubah fungsi search existing.

### Mobile panel

Bottom sheet hampir full-screen:

```text
Pengaturan Stok                         [×]
Atur menu yang siap dijual

[ 🔍 Cari produk... ]

Kategori
[Semua] [Makanan] [Minuman] ...

Subkategori
[Semua] [Bubur] [Nasi] [Koffie] ...

Status
[Semua] [Menipis] [Habis]

MAKANAN / BUBUR
☐ Bubur Ayam Polos       21 porsi [ON]
  #1013 · Aman
```

- Kategori dan subkategori memakai horizontal chips; tidak memakai dropdown jika jumlahnya masih dapat discan.
- Subkategori hanya muncul ketika kategori memiliki children.
- Mengganti kategori me-reset subkategori yang tidak kompatibel.
- Search dapat mencocokkan nama, menu number, kategori, dan subkategori.
- Filter kombinasi harus terlihat, dapat di-reset, dan tidak membuat hasil membingungkan.

### Mobile list row

```text
[checkbox]  Nama Produk        Jumlah  [toggle]
            #menu · Status
```

- Checkbox hanya untuk bulk selection.
- Toggle hanya untuk `isAvailable`.
- Quantity hanya stok menu, bukan jumlah terjual.
- Status ditampilkan sebagai teks sekaligus warna: `Aman`, `Menipis`, `Habis`, `Tidak tersedia`.
- Gunakan `min-w-0`, truncation nama, `shrink-0` pada jumlah/toggle, dan hindari horizontal overflow.
- Group header `Kategori / Subkategori` dapat sticky secara ringan ketika list panjang.

### Status rules

```text
quantity <= 0                         → Habis
quantity > 0 && quantity <= threshold → Menipis
quantity > threshold                  → Aman
isAvailable = false                   → Tidak tersedia
```

`threshold` harus berasal dari konfigurasi produk/settings; jangan hardcode angka `30` sebagai business rule. Angka `30` yang sekarang dipakai untuk visual indicator perlu diaudit sebelum dipertahankan atau dipindah menjadi default display-only.

### Single actions

- Toggle availability: aksi cepat dengan feedback; confirmation hanya untuk perubahan berisiko bila diperlukan.
- Tap quantity/row: buka action sheet kecil:

```text
[−1]       21       [+1]
[Atur jumlah]
```

- `Atur jumlah` membutuhkan nilai non-negatif dan alasan:
  - Produksi batch baru
  - Produk rusak
  - Stock opname
  - Koreksi input
  - Transfer area
  - Lainnya
- `Tandai habis` menjadikan `quantity = 0` hanya bila memang operasi stok; toggle OFF sementara tidak boleh merusak quantity.

### Bulk actions

Saat checkbox terpilih:

```text
3 produk dipilih
[Habis] [Tersedia] [Atur]
```

- `Pilih semua` hanya mencakup hasil filter/kategori/subkategori yang sedang terlihat.
- Bulk availability membutuhkan konfirmasi yang menyebut jumlah produk.
- Bulk quantity adjustment tidak memakai satu angka diam-diam untuk semua produk; gunakan mode eksplisit dan audit per produk.
- Action bar sticky di dalam panel dan tidak menutupi safe-area/list.

### UI states

- Loading: skeleton rows, bukan spinner full-screen.
- Empty: `Tidak ada produk yang cocok` + reset filter.
- Unconfigured: `Stok belum dikonfigurasi` + CTA role-appropriate.
- Saving: disable control yang sedang disimpan, jangan disable seluruh panel.
- Error: pesan spesifik + `Coba lagi`; rollback optimistic state.
- Success: toast `Stok diperbarui · 21 → 20` atau `Produk sekarang tidak tersedia`.
- Reduced motion: hormati `prefers-reduced-motion`; gunakan transition opacity/position singkat saja.

## System and Data Flow

### Canonical product/catalog flow

```text
pos.categories
      ↓ parentId tree
pos.products
      ↓ public view
public.pos_products
      ↓ shared mapper/useHybridProducts
POS `/menu`      Admin Products      Customer Menu/Checkout
```

### Stock menu vs inventory technical flow

```text
POS menu adjustment
  → product/menu stock movement + audit

Admin Fast Stock / approved recipe flow
  → product quantity
  → recipe ingredients
  → technical inventory quantity/base unit
  → HPP/COGS boundaries

Customer order paid/completed
  → idempotent sale usage
  → menu stock deduction
  → recipe/inventory deduction only through canonical backend path
```

Tidak boleh ada frontend direct write yang mengurangi bahan baku tanpa recipe/RPC/domain validation.

### Availability flow

```text
POS toggle
  → server validates role/product
  → products.isAvailable update
  → public.pos_products refresh/realtime
  → Customer hides/disables unavailable product
  → POS/Admin list refresh
```

Jika `quantity = 0`, sistem harus mencegah state `isAvailable = true` yang menyesatkan.

## Database Schema and REST Mapping

### Existing canonical entities

```text
pos.categories
├── source_id / _id
├── name
├── parent_id / parentId
├── display_order / displayOrder
└── is_active / isActive

pos.products
├── source_id / _id
├── name
├── category_source_id / categoryId
├── menu_number / menuNumber
├── quantity
├── is_available / isAvailable
├── price
├── promo_price / promoPrice
└── variations / image / description

pos.recipes
├── product_source_id / productId
└── ingredients JSONB

pos.inventory
├── source_id / _id
├── quantity (technical/base quantity)
├── unit
└── recipe/HPP/purchase fields

pos.stock_opname_logs
├── product/inventory reference
├── shift_source_id / shiftId
├── actor
├── before/after or snapshot
└── created_at
```

### Public views and REST paths

```text
GET /rest/v1/pos_products
  → product catalog, quantity, isAvailable, categoryId, menuNumber

GET /rest/v1/pos_products_all
  → all product catalog rows where the shared hook requires inactive rows

GET /rest/v1/pos_categories
  → category tree and parentId relationships

GET /rest/v1/pos_inventory / public inventory view
  → technical inventory; not the primary mobile POS list

GET /rest/v1/pos_stock_opname_logs
  → audit/history read for authorized surfaces
```

Exact existing column/view names must be re-verified before implementation. Any new write should prefer existing server/RPC/hook patterns. If a movement/audit table or RPC is missing for POS adjustment, add it additively and expose it through the public view plus mapper; do not silently update only the product row.

### Proposed additive audit contract if existing movement path is insufficient

```text
pos.product_stock_movements
├── id
├── product_source_id
├── before_quantity
├── after_quantity
├── delta
├── reason_code
├── note
├── availability_before
├── availability_after
├── source_app
├── shift_source_id
├── actor_source_id
├── idempotency_key UNIQUE
└── created_at
```

This is a proposal only. Implementation must first verify whether an existing canonical stock movement/audit table already covers this requirement.

## Integration Points

### POS

Files likely involved:

- `apps/pos/src/routes/menu.lazy.tsx`
- existing POS inventory/stock hooks and shared product/category hooks
- existing write hook/RPC used by `fast-stock-table.tsx`
- shared UI components for sheet, checkbox, switch, input, toast

Responsibilities:

- toolbar trigger;
- mobile sheet/desktop side sheet;
- category/subcategory filtering;
- list and bulk selection;
- availability/quantity actions;
- loading/error/saving states.

### Admin

Audit and integrate without duplicating business logic:

- `apps/admin/src/routes/admin/products.lazy.tsx`
- `apps/admin/src/routes/admin/inventory.lazy.tsx`
- `apps/admin/src/routes/admin/stock-overview.lazy.tsx`
- recipe/HPP surfaces and shared inventory hooks

Admin owns configuration such as threshold, recipe, unit, and deeper audit. Product/category edits must immediately be reflected in POS filters through the shared view.

### Customer

Audit:

- customer shared product hook;
- customer menu/catalog;
- checkout product availability guard;
- favorite/reorder behavior when product becomes unavailable.

Customer must not expose internal stock numbers. A product disabled or depleted from POS must not remain addable from Customer Checkout.

### Telegram bot

No direct Telegram notification is required for the initial toolbar interaction. If the existing operational stock/shift workflow sends stock-opname or low-stock messages, the new movement/audit source must be compatible with that existing contract. Do not introduce a second Telegram notification pipeline.

### AI/LLM

No AI/LLM is required for the core feature. Yumi AI may later read the canonical stock/movement views for questions such as low stock or adjustment history, but must not become the authority for writes.

### Purchasing agent

No direct purchasing-agent write is required in phase one. If low-stock signals feed purchasing, consume the canonical inventory/stock view and preserve existing purchasing-agent idempotency and approval flow. Do not create purchase orders directly from a cashier toggle.

## Permissions and Business Rules

```text
Kasir:
  read stock
  toggle availability
  small +/- adjustment if existing policy allows

Supervisor:
  all cashier actions
  direct quantity adjustment
  bulk adjustment
  audit/history

Admin:
  category/subcategory
  threshold
  recipe/unit/HPP
  technical inventory
  approval/large adjustment
```

Server-side validation is mandatory:

- authenticated user/session;
- role/permission;
- valid product ID;
- valid category relationship;
- non-negative quantity;
- no invalid `isAvailable=true` with zero stock;
- stable idempotency key;
- shift/branch scope if the system uses it;
- bounded notes/reason code allowlist.

## No-Hardcode Audit

Values that must not be hardcoded in the new UI:

- category names;
- subcategory names;
- product names;
- menu numbers;
- quantity;
- availability;
- low-stock thresholds;
- units;
- brand/theme colors;
- role permissions;
- reason labels if admin-configurable.

Allowed temporary constants:

- UI labels such as `Semua`, `Menipis`, `Habis`;
- animation durations;
- display fallback text for missing configuration;
- safe default filter `Semua`.

The current `30` visual stock threshold must be classified as either a DB/admin setting or a display-only fallback. It must not silently become the operational business threshold.

## Implementation Waves

### Wave 1 — Discovery and contract

1. Re-read current POS menu, category hooks, product hooks, write hooks, fast stock table, admin product/inventory, customer catalog, and stock-opname paths.
2. Verify actual database tables/views/RPCs and existing stock movement/audit contract.
3. Define shared types and status helper with null/zero/negative/malformed handling.
4. Confirm role permission and source-of-truth decision before UI writes.

### Wave 2 — Shared data/write foundation

1. Reuse or extend existing category/product mapper with camelCase/snake_case guards.
2. Reuse canonical write path for quantity/availability.
3. Add additive audit/movement migration only if no existing path covers it.
4. Add server-side validation/idempotency.
5. Add unit/helper tests for status, filters, quantity boundaries, and availability rules.

### Wave 3 — POS mobile UI

1. Add toolbar `Stok` entry point.
2. Build bottom sheet/desktop side sheet using existing UI primitives.
3. Add search, category chips, dependent subcategory chips, status filter.
4. Add grouped list with checkbox, product name, quantity, toggle.
5. Add single and bulk actions with confirmation and feedback states.
6. Verify no mobile overflow, safe-area collision, or accidental card navigation.

### Wave 4 — Cross-app synchronization

1. Update Admin read/configuration surfaces only where needed.
2. Verify Customer availability guard and invalid stale-cache behavior.
3. Verify Stock Opname/audit compatibility.
4. Verify reports/purchasing/AI consumers read the canonical source and are not broken by new fields.

### Wave 5 — Verification and release

1. Database migration with `ON_ERROR_STOP=1` and read-back.
2. Unit/integration tests for write/idempotency/audit.
3. POS build and route lazy bundle verification.
4. Admin and Customer build if shared contract changes.
5. Browser QA at 375px and desktop: search, category, subcategory, status, toggle, checkbox, bulk action, loading/error/success.
6. Deploy only affected app(s) to canonical domains.
7. Verify live `index.html`, hashed bundle, service worker/version artifact, and database read-back.
8. Selectively stage only session files; do not commit unrelated active changes.

## Test and Acceptance Plan

### Unit

- `quantity = 0` → Habis.
- `quantity = threshold` → Menipis.
- `quantity = threshold + 1` → Aman.
- Null quantity → unconfigured state, not silently Habis unless business rule explicitly approves.
- Parent category returns all descendant products.
- Subcategory filter narrows correctly.
- Category change resets incompatible subcategory.
- Search combines correctly with category/subcategory filters.
- Toggle OFF preserves quantity.
- Toggle ON with quantity 0 is rejected or warns.

### Integration

- Quantity adjustment writes one movement/audit row.
- Retry with same idempotency key does not duplicate movement.
- Invalid role/product/negative quantity is rejected.
- Order sale deduction is not duplicated on retry.
- Product/category update is visible through `public.pos_products`/category view.
- Customer availability changes after POS toggle.
- Technical inventory/recipe/HPP remain unchanged by a menu-only availability toggle.

### Visual QA

At minimum 375px mobile:

- toolbar remains usable;
- panel opens smoothly;
- search and chips are easy to tap;
- category/subcategory do not create horizontal page overflow;
- list rows have clear hierarchy;
- toggle and checkbox do not collide;
- bulk action bar does not cover rows or safe-area;
- long product names truncate safely;
- loading/empty/error/success states are readable;
- reduced-motion mode works.

Desktop:

- side sheet does not obscure critical POS controls;
- list density remains scannable;
- keyboard focus is visible;
- category/subcategory filter remains usable.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Kasir menganggap toggle OFF berarti quantity 0 | Pisahkan label/status dan simpan quantity tetap |
| Menu stock adjustment ikut mengubah bahan secara salah | Gunakan existing recipe-aware path; menu-only adjustment tidak direct-write bahan |
| Category/subcategory berbeda antar app | Gunakan shared category tree/view dan parentId |
| Stale Customer cache menjual produk habis | Server-side availability guard saat add/checkout + refresh/realtime |
| Bulk action salah scope | Select-all hanya pada filtered dataset dan tampilkan jumlah terpilih |
| Threshold hardcoded | Simpan/configure per product; fallback hanya display-only |
| Duplicate stock deduction | Idempotency key dan unique movement/order source guard |
| Mobile panel terlalu padat | Search-first, chips horizontal, list rows, progressive disclosure |
| Audit hanya tersimpan di frontend | Server-side movement/audit transaction dan read-back |
| Build lulus tetapi production belum berubah | Verify canonical domain index, lazy bundle, SW/version, dan DB read-back |

## Open Decisions Before Implementation

1. Role kasir boleh melakukan `+1/-1` langsung, atau hanya toggle availability?
2. Apakah `quantity` sekarang adalah stok menu siap jual di semua kategori, atau ada produk yang masih mewakili stok bahan/teknis?
3. Apakah sudah ada canonical product stock movement table/RPC yang harus dipakai kembali?
4. Threshold akan disimpan per produk, per subkategori, atau default global dengan override produk?
5. Apakah bulk `Atur Stok` diperlukan pada fase pertama, atau cukup bulk availability?
6. Apakah update stok menu dari POS harus langsung memicu sinkronisasi recipe/bahan, atau hanya melalui Admin/Inventory approval?

## Expected Deliverables After Approval

- Mobile/desktop POS stock toolbar panel.
- Shared category/subcategory filtering behavior.
- Canonical, validated stock/availability write path.
- Audit/movement read-back.
- Cross-app availability synchronization.
- Unit/integration/visual verification evidence.
- Targeted deployment only after approval and test pass.
