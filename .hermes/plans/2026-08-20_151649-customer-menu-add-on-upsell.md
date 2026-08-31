# Plan: Customer Menu List + Add-on Upselling

## Status

Plan only. No implementation in this plan phase.

## Goal

Mendekatkan pengalaman pemesanan `apps/customer` ke referensi Mori Eatery tanpa menghilangkan kemampuan POS yang sudah ada, khususnya:

1. Menampilkan katalog menu dengan struktur yang lebih cepat dipindai.
2. Menampilkan deskripsi produk secara lebih terlihat.
3. Mempertahankan pilihan variasi dan quantity.
4. Setelah pelanggan menekan **Tambah Pesanan**, menampilkan rekomendasi add-on/upselling yang relevan.
5. Menyediakan pilihan **Tambah** atau **Lewati** tanpa memaksa pelanggan membeli add-on.

## Current Context

### Yang sudah ada

- `apps/customer/src/components/customer/menu-section.tsx`
  - Mode `Kode menu` dan `Katalog`.
  - Katalog grid dua kolom.
  - Category chips dan subcategory chips.
  - Product card dengan gambar, nama, harga, promo, jumlah di cart, dan tombol `+`.
- `apps/customer/src/components/customer/product-sheet.tsx`
  - Detail produk.
  - Deskripsi produk.
  - Harga promo.
  - Variasi produk.
  - Quantity.
  - Tombol `Tambah ke keranjang`.
- `apps/customer/src/hooks/use-order-context.tsx`
  - Cart global.
  - Add, increment, decrement, remove, dan persist cart.
- Pricing engine existing:
  - `apps/customer/src/lib/utils/pricing.ts`
  - Harga promo/Happy Hour tetap harus digunakan untuk harga add-on.
- Data produk sudah memiliki kategori, gambar, harga, deskripsi, dan variasi.

### Perbedaan dengan referensi

- Referensi menggunakan daftar satu kolom dengan quantity inline.
- `apps/customer` menggunakan grid dua kolom dan ProductSheet.
- Referensi menampilkan produk terkait/add-on secara horizontal setelah item utama ditambahkan.
- `apps/customer` belum memiliki mekanisme rekomendasi produk setelah add-to-cart.

## Recommended Approach

Gunakan **post-add upsell sheet** yang muncul setelah produk utama berhasil masuk cart.

```text
Product Card
  ↓ klik
Product Sheet
  ↓ pilih variasi + quantity
Tambah Pesanan
  ↓ item utama masuk cart
Upsell Sheet / Recommendation Sheet
  ├── Tambah add-on
  ├── Tambah add-on lain
  └── Lewati
  ↓
Kembali ke katalog
```

### Kenapa bukan memaksa add-on di ProductSheet?

- Produk utama tetap bisa ditambahkan tanpa add-on.
- Tidak mengganggu produk yang tidak membutuhkan pelengkap.
- Quantity/variasi produk utama tetap terpisah dari add-on.
- Lebih dekat dengan pola referensi: add-on muncul setelah aksi utama.
- Lebih aman untuk operasional karena tidak mengubah total sebelum pelanggan memilih.

## Detailed UX Flow

### 1. Produk utama

ProductSheet tetap memiliki:

```text
Nama produk
Deskripsi
Harga dasar/promo
Variasi wajib/opsional
Quantity
Tambah Pesanan — Rp...
```

Klik tombol menjalankan urutan:

```text
1. Validasi variasi wajib.
2. Tambahkan item utama ke cart.
3. Cari rekomendasi add-on.
4. Jika ada rekomendasi, buka UpsellSheet.
5. Jika tidak ada rekomendasi, kembali ke katalog seperti sekarang.
```

### 2. Upsell Sheet

Mobile-first layout:

```text
┌──────────────────────────────┐
│ Ditambahkan ke keranjang ✓   │
│ Latte                         │
│ Rp25.000                     │
├──────────────────────────────┤
│ Lengkapi pesananmu juga      │
│                              │
│ [foto] Lemon Tea              │
│        Rp12.000    [Tambah]  │
│                              │
│ [foto] Croissant              │
│        Rp18.000    [Tambah]  │
│                              │
│ [Lanjut ke menu]             │
└──────────────────────────────┘
```

Rekomendasi ditampilkan maksimal 3 item agar tidak terasa memaksa.

Setiap rekomendasi memiliki:

- gambar fallback;
- nama produk;
- deskripsi singkat opsional;
- harga final setelah promo;
- tombol `Tambah`;
- state `Ditambahkan` setelah berhasil masuk cart.

### 3. Tombol actions

Primary:

```text
Tambah
```

Secondary:

```text
Lanjut ke menu
```

Jika pelanggan menekan `Tambah`, item langsung masuk cart dan tombol berubah:

```text
✓ Ditambahkan
```

Tidak membuka ProductSheet kedua secara otomatis. Jika produk rekomendasi memiliki variasi wajib, tombol berubah menjadi:

```text
Pilih opsi
```

dan membuka ProductSheet untuk produk tersebut.

### 4. Tidak ada rekomendasi

Jika tidak ada produk relevan:

```text
ProductSheet ditutup
Pelanggan kembali ke katalog
Cart badge bertambah
```

Tidak menampilkan sheet kosong.

### 5. Cart behavior

- Item add-on memakai cart context existing.
- Produk yang sama dengan item sebelumnya mengikuti aturan merge existing.
- Variasi berbeda tetap menjadi line item terpisah.
- Harga memakai `calculateEffectivePrice()`.
- Tidak ada perubahan pada payload checkout/order.

## Recommendation Strategy

### Database-driven recommendation policy — mandatory

Tidak boleh ada hardcode bisnis di frontend. Semua konfigurasi upselling wajib dibaca dari database melalui public read model yang aman:

```text
Produk utama
  → produk rekomendasi
  → urutan
  → label
  → copy CTA
  → jumlah maksimal
  → status aktif
  → aturan variasi
```

Frontend hanya bertugas merender data dan menjalankan cart action. Frontend tidak boleh memiliki:

- product ID hardcoded;
- nama produk hardcoded;
- harga hardcoded;
- mapping `Coffee → Pastry` hardcoded;
- daftar kategori pairing hardcoded;
- jumlah rekomendasi hardcoded;
- label produk/CTA bisnis hardcoded;
- fallback rekomendasi buatan client.

### Recommended Phase 1 schema

Gunakan tabel relational admin-managed sejak awal agar tidak menyembunyikan konfigurasi bisnis di `raw` frontend:

```sql
pos.product_upsell_recommendations
├── id bigint / uuid primary key
├── product_source_id text not null
├── recommended_product_source_id text not null
├── sort_order int not null default 0
├── title_override text null
├── description_override text null
├── cta_label text null
├── max_quantity int null
├── requires_options boolean null
├── is_active boolean not null default true
├── starts_at timestamptz null
├── ends_at timestamptz null
├── created_at timestamptz not null default now()
└── updated_at timestamptz not null default now()
```

Constraints:

```text
UNIQUE(product_source_id, recommended_product_source_id)
CHECK(product_source_id <> recommended_product_source_id)
CHECK(sort_order >= 0)
CHECK(max_quantity IS NULL OR max_quantity > 0)
```

`product_source_id` dan `recommended_product_source_id` harus diverifikasi terhadap produk aktif saat query/view.

### Database-driven global settings

Nilai global juga wajib berasal dari database, misalnya `pos.site_settings.raw` atau tabel settings khusus:

```json
{
  "upsellEnabled": true,
  "upsellMaxRecommendations": 3,
  "upsellTitle": "Lengkapi pesananmu juga",
  "upsellSkipLabel": "Lanjut ke menu",
  "upsellAddedLabel": "Ditambahkan"
}
```

Angka `3` di atas hanya contoh nilai database/seeding, bukan konstanta frontend. Jika setting tidak tersedia, sistem harus menampilkan error/configuration state yang jelas atau menonaktifkan upsell—bukan menggunakan default hardcoded diam-diam.

### Public read model

Buat view/API read-only yang hanya mengembalikan relasi aktif dan field produk yang diperlukan:

```text
public.pos_product_upsell_recommendations
├── product_source_id
├── recommended_product_source_id
├── recommended_name
├── recommended_description
├── recommended_image
├── recommended_price
├── recommended_variations
├── sort_order
├── title_override
├── description_override
├── cta_label
├── max_quantity
└── requires_options
```

Filter server-side:

```text
is_active = true
starts_at IS NULL OR starts_at <= now()
ends_at IS NULL OR ends_at >= now()
recommended product masih aktif
recommended product tersedia/stock-valid
```

Frontend boleh melakukan filter presentasional ringan seperti menghapus produk yang sama dengan item utama atau sudah ada di cart, tetapi tidak boleh membuat relasi baru.

### Recommendation resolution

Satu-satunya sumber rekomendasi:

```text
GET public.pos_product_upsell_recommendations
WHERE product_source_id = produk utama
ORDER BY sort_order ASC
LIMIT nilai dari database upsellMaxRecommendations
```

Jika query mengembalikan nol baris:

```text
Jangan menebak berdasarkan kategori.
Jangan memakai daftar default.
Jangan menampilkan add-on hardcoded.
Tutup ProductSheet dan lanjutkan ke katalog normal.
```

### Admin-managed configuration

Editor admin harus dapat mengatur:

```text
Produk utama
Produk rekomendasi
Urutan tampil
Judul/deskripsi override
Label tombol
Batas quantity
Apakah perlu memilih variasi
Status aktif
Periode berlaku
```

Tidak boleh ada release yang membutuhkan edit source code untuk mengganti pasangan produk, harga, label, atau urutan rekomendasi.

## Data Flow

```text
pos.products / public.pos_products
  ↓
useHybridProducts / existing product hook
  ↓
MenuSection.filteredProducts
  ↓
ProductSheet
  ↓
addToCart(item utama)
  ↓
recommendation resolver
  ↓
UpsellSheet
  ↓
addToCart(item add-on)
  ↓
OrderContext.cart
  ↓
checkout payload items[]
  ↓
pos.orders / pos.order_items
```

Harga selalu dihitung melalui pricing engine yang sama:

```text
calculateEffectivePrice(product, discounts)
```

Tidak boleh membuat perhitungan promo kedua khusus untuk upsell.

## Database Schema / REST Mapping

### Existing read model

```text
pos.products
├── source_id
├── name
├── description
├── price
├── image
├── category_id
├── menu_number
├── variations
├── is_active / stock fields
└── raw JSONB
```

Public read path yang harus dipastikan sebelum implementasi:

```text
GET /rest/v1/pos_products
```

atau hook existing yang sudah digunakan oleh customer catalog.

### Phase 1 schema decision

Tidak menambah tabel baru. Jika `raw` sudah tersedia dan terekspos pada read model, metadata rekomendasi disimpan di sana secara additive:

```json
{
  "upsellProductIds": ["..."],
  "upsellGroup": "coffee-pairing"
}
```

Jika `raw` tidak tersedia pada public view, opsi aman:

```text
Tambah field read-only di public.pos_products view
```

Bukan membuka seluruh data internal produk ke anon.

### Phase 2 optional schema

Jika diperlukan kontrol admin penuh:

```sql
pos.product_upsell_recommendations
├── id bigint / uuid primary key
├── product_source_id text not null
├── recommended_product_source_id text not null
├── sort_order int default 0
├── is_active boolean default true
├── created_at timestamptz default now()
└── updated_at timestamptz default now()
```

Constraints yang direncanakan:

```text
UNIQUE(product_source_id, recommended_product_source_id)
CHECK(product_source_id <> recommended_product_source_id)
```

View public hanya mengembalikan relasi yang aktif dan produk aktif. Migration harus additive dan tidak menghapus data.

## UI/UX Specification

### Design tokens

Ikuti design system customer existing:

```text
Font: Plus Jakarta Sans / shared theme
Card radius: rounded-[20px] sampai rounded-3xl
Control radius: sekitar 14px
Touch target: minimal 44px
Accent: token primary existing
Animation: restrained, active:scale-[.97]
```

Jangan menyalin CSS mentah dari screenshot. Adaptasi visual dengan Tailwind dan komponen existing.

### States

| State | Behavior |
|---|---|
| Product loading | Skeleton existing tetap digunakan |
| Product error | Retry existing tetap tersedia |
| Add main product saving | Tombol disabled + loading singkat |
| Recommendation loading | Upsell sheet boleh menampilkan skeleton maksimal singkat |
| No recommendation | Sheet tidak dibuka |
| Recommendation populated | Maksimal 3 card horizontal/list |
| Add-on added | Tombol berubah `✓ Ditambahkan` |
| Add-on with required variation | Tombol `Pilih opsi`, buka ProductSheet |
| Empty catalog | Existing empty state tetap dipakai |
| Cart failure | Toast/error state, item tidak dianggap berhasil ditambahkan |
| User skips | Cart tetap menyimpan item utama, sheet ditutup |

### Mobile interaction rules

- Upsell sheet tidak menutupi tombol utama secara tidak sengaja.
- Semua button minimal 44px.
- `Tambah` dapat ditekan dengan ibu jari.
- Tidak ada auto-scroll yang mengejutkan.
- Back gesture/close sheet tidak menghapus item utama.
- Cart badge diperbarui segera setelah item utama masuk cart.
- Jika sheet tertutup, pelanggan tetap berada pada kategori/menu sebelumnya.

## Likely Files to Change

### Phase 1

```text
apps/customer/src/components/customer/product-sheet.tsx
  - expose successful add event
  - preserve variation/quantity behavior

apps/customer/src/components/customer/menu-section.tsx
  - pass recommendation context/resolver if needed
  - preserve catalog and number-entry mode

apps/customer/src/components/customer/shared-components.tsx
  - optionally reuse/add compact recommendation card

apps/customer/src/components/customer/types.ts
  - add typed recommendation metadata if needed

apps/customer/src/hooks/use-order-context.tsx
  - likely no business logic change; verify merge semantics

apps/customer/src/routes/$username/order.lazy.tsx
  - own selected upsell state and mount UpsellSheet
  - connect ProductSheet success → recommendation flow

apps/customer/src/components/customer/upsell-sheet.tsx
  - new presentational component for recommendation UI
```

### Optional configuration/admin phase

```text
apps/pos/src/routes/admin/...  # only if admin-managed relationships are requested
supabase/migrations/YYYYMMDD_product_upsell_recommendations.sql
public.pos_products view       # only if required by data exposure design
```

No new dependency should be needed.

## Integration Points

### Pricing

- Reuse `calculateEffectivePrice()`.
- Respect member-only Happy Hour behavior.
- Guest pricing must not accidentally receive member-only discount.
- Display original and final price consistently.

### Inventory

- Upsell is only a recommendation.
- Stock validation remains at existing cart/order submission boundary.
- Do not deduct inventory merely by showing a recommendation.

### Loyalty / points

- No direct points mutation.
- Points are still awarded by existing order completion trigger.
- Add-on purchases naturally contribute through the existing order total/points business logic.

### Telegram / agents

- No new Telegram notification for simply viewing or adding a recommendation.
- Existing order notification receives the final cart/order payload unchanged.

## No-hardcode Audit — mandatory gate

Semua nilai bisnis dan konten upselling wajib berasal dari database/admin settings. Frontend hanya memiliki struktur UI dan validasi teknis.

Wajib berasal dari database:

- product IDs;
- nama produk;
- harga;
- gambar;
- deskripsi;
- promo values;
- stock/availability;
- relasi produk utama → rekomendasi;
- urutan rekomendasi;
- jumlah maksimal rekomendasi;
- judul upsell;
- label `Tambah`, `Pilih opsi`, `Ditambahkan`, dan `Lewati`;
- aturan apakah variasi wajib;
- batas quantity;
- periode aktif/nonaktif;
- mapping kategori atau pairing.

Yang boleh tetap berada di source code hanya:

- struktur layout dan komponen;
- nama field API/type;
- validasi tipe dan keamanan;
- behavior teknis ketika API gagal;
- state machine UI.

Jika konfigurasi database tidak tersedia atau query gagal:

```text
Jangan memakai default bisnis hardcoded.
Tampilkan error/configuration state yang aman,
atau nonaktifkan upsell dan lanjutkan flow order normal.
```

Verification wajib mencari literal bisnis di source:

```text
- product IDs dalam array
- nama menu dalam array
- angka harga
- mapping kategori pairing
- judul/CTA upsell
- limit jumlah rekomendasi
```

Semua hasil scan tersebut harus kosong, kecuali fixture/test yang secara eksplisit diberi label test.

## Implementation Waves

### Wave 1 — Read-only discovery

1. Confirm public product fields and `raw` exposure.
2. Confirm product variation required/optional semantics.
3. Confirm cart merge behavior for same product/variant.
4. Confirm active/stock filtering.
5. Create recommendation data contract.

### Wave 2 — Core upsell flow

1. Add `UpsellSheet` presentational component.
2. Connect ProductSheet successful add event.
3. Resolve recommendations without changing checkout payload.
4. Add `Tambah`, `Ditambahkan`, `Pilih opsi`, and `Lewati` states.

### Wave 3 — Visual alignment

1. Improve catalog density/list presentation only if approved.
2. Add visible product description where appropriate.
3. Add optional inline quantity behavior.
4. Add horizontal recommendation carousel.
5. Preserve mode Kode Menu separately.

### Wave 4 — Optional configuration

1. Seed recommendation relationships from admin-controlled data.
2. Add admin editor only if needed.
3. Add validation for duplicate/self recommendations.
4. Add public read model if required.

## Verification Plan

### Unit / component

- Product without recommendations closes normally.
- Product with recommendations opens UpsellSheet.
- Main product is present in cart before upsell appears.
- Skip preserves main product.
- Add recommendation adds exactly one intended item.
- Same product with same variant merges according to existing behavior.
- Same product with different variant remains separate.
- Required variation opens ProductSheet instead of silently adding.
- Promo price is used for recommendation display and cart.

### Manual browser QA

At mobile viewport:

1. Open catalog.
2. Select a product with variations.
3. Select variation and quantity.
4. Click `Tambah Pesanan`.
5. Confirm item appears in cart.
6. Confirm upsell sheet appears below/after add.
7. Add one recommendation.
8. Confirm button changes to `Ditambahkan`.
9. Skip/close sheet.
10. Open cart and verify main + add-on items.
11. Continue to checkout but stop before payment submission.
12. Verify no duplicate item or incorrect total.

### Production safety

- Do not create a real order during QA.
- Use existing catalog data only.
- Verify no inventory mutation occurs on recommendation display.
- Build only `apps/customer` for customer-only changes.
- Check `git diff --check`.
- Verify `index.html → hashed route chunk` asset parity.
- Capture browser screenshot when browser runtime is available.

## Risks and Trade-offs

| Risk | Mitigation |
|---|---|
| Upsell feels intrusive | Show max 3, clear `Lewati`, never block checkout |
| Wrong pairing | Start with explicit metadata, avoid aggressive category guessing |
| Variation confusion | Open ProductSheet for required options |
| Duplicate cart items | Reuse existing cart merge key including variant |
| Incorrect promo total | Reuse pricing engine, no second pricing logic |
| Stale recommendation metadata | Filter inactive/missing products and fall back gracefully |
| Page becomes too dense | Implement upsell first; list redesign remains optional second phase |
| Guest/member pricing leak | Pass the same member discount context as main catalog |

## Open Decisions Before Implementation

1. Apakah rekomendasi dikelola dari `product.raw` dulu, atau langsung dibuatkan admin editor?
2. Apakah target utama tetap grid sekarang, atau katalog akan memiliki mode list seperti referensi?
3. Apakah add-on harus selalu masuk sebagai item terpisah, atau beberapa add-on harus menjadi bagian dari line item utama?
4. Produk mana yang menjadi pairing awal untuk Latte, Coffee, Rice Bowl, dan Snack?
5. Apakah tombol setelah add harus bertuliskan `Lanjut ke menu` atau `Lanjut belanja`?

## Recommendation

Mulai dari **Phase 1 core upsell tanpa schema baru**:

```text
ProductSheet → add main item → UpsellSheet maksimal 3 rekomendasi → kembali ke katalog
```

Pertahankan grid, mode nomor, variasi, pricing, member, dan checkout existing pada release pertama. Setelah flow upsell terbukti nyaman, baru lakukan perubahan visual katalog ke list view seperti referensi.
