# B2B Production-Focused Landing & UX Plan

> **For Hermes:** Use the `subagent-driven-development` skill to implement this plan task-by-task.

**Goal:** Mengubah landing `b2b.yumme.id` menjadi storefront B2B yang langsung menjual produk produksi Djiwa Tentram—Mie Mentah Kiloan menu 3013—dengan copy, layout, dan CTA yang tertarget ke pemilik usaha/kitchen/purchasing, sambil mempertahankan alur katalog, checkout, Mayar, dan SSO yang sudah mengikuti `apps/merchandise`.

**Architecture:** Pertahankan `apps/b2b` sebagai standalone clone storefront dengan shared Supabase, Better Auth, cart, order, Mayar, receipt, dan SSO contract. Jadikan route `/` sebagai satu-satunya landing marketing utama. Pertahankan `/daftar` sebagai route teknis onboarding guest yang tidak perlu dipromosikan sebagai halaman terpisah. Ubah `/produksi` menjadi redirect/alias kompatibilitas ke `/` agar URL lama tidak rusak.

**Tech Stack:** React 19, Vite, TanStack Router, Tailwind CSS, Supabase hybrid hooks, Better Auth SSO, Mayar Edge Function proxy, PWA.

---

## Status dan Konteks Saat Ini

- Repository: `/opt/djiwatentramapp`.
- Target app: `apps/b2b`, domain `https://b2b.yumme.id`.
- App referensi UX: `apps/merchandise`.
- Produk target: `Mie Mentah Kiloan Djiwa Tentram`, menu number `3013`, harga database target `Rp30.000`, kategori `B2B` → `Produksi`.
- `/produksi` saat ini adalah landing terpisah dengan hero produk dan CTA.
- `/daftar` saat ini adalah form guest data diri tanpa field meja.
- `apps/b2b` sudah memiliki order flow Merchandise-style: menu → checkout → Mayar/cashier/wallet → receipt.
- Order B2B sudah diarahkan sebagai `orderType: "takeaway"` dan tidak menyimpan nomor meja.
- Guest intent saat ini memakai marker lokal non-PII `b2b-checkout-intent=produksi` untuk melewati home setelah submit `/daftar`.
- `apps/merchandise` memakai `/` sebagai entry/onboarding dan `/daftar` sebagai guest form; tidak memiliki route marketing `/produksi`.
- Working tree memiliki perubahan dari sesi lain. Implementasi hanya boleh stage file B2B/plan yang benar-benar authored pada task ini.

## Acceptance Criteria

1. `https://b2b.yumme.id/` langsung menjelaskan produk produksi mie, target buyer, manfaat, harga/unit, status, dan CTA.
2. Tidak ada copy generik seperti "Pesan favoritmu", "tanpa antre", "Menu Best Seller", atau copy restoran dine-in pada landing B2B.
3. Produk utama yang ditampilkan berasal dari data katalog B2B/menu `3013`; fallback hanya digunakan untuk loading/error dan diberi perlakuan yang jelas.
4. `/produksi` tidak menjadi flow kedua; route tersebut redirect ke `/` atau menjadi alias yang tidak membuat UI duplikat.
5. `/daftar` tetap tersedia untuk guest onboarding, tetapi user flow tidak memaksa user memahami route tersebut.
6. Guest: landing → CTA → data diri → langsung `/<username>/order?step=menu`.
7. Member: landing → SSO/session → langsung `/<username>/order?step=menu`.
8. Checkout tetap menyimpan order B2B dengan provenance `brandSlug: "b2b"`, `source: "customer_self_service"`, `orderType: "takeaway"`, dan idempotency key.
9. Mayar tetap membuat invoice lewat `mayar-proxy`, menyimpan gateway metadata, redirect ke provider, dan kembali ke origin B2B dengan `orderId`.
10. Tidak ada perubahan schema, settlement, webhook, finance, atau shared Customer behavior.
11. Mobile width 375px tidak mengalami horizontal overflow, CTA utama berada di thumb zone, dan bottom navigation tidak menutupi konten.
12. Loading, unavailable/SOLD, error, empty, submitting, pending payment, success, dan retry state tetap terlihat jelas.

---

## Alternatives Analysis

### Opsi A — Pertahankan `/produksi` sebagai landing utama

| Pros | Cons |
|---|---|
| URL sudah tersedia | Ada dua entry point (`/` dan `/produksi`) yang copy/layout-nya dapat drift |
| Mudah dibagikan sebagai link produk | User harus memahami perbedaan landing root dan landing produksi |
| Perubahan awal lebih kecil | Tidak mengikuti struktur `apps/merchandise` |

### Opsi B — Jadikan `/` landing produksi dan `/produksi` redirect alias — **Rekomendasi**

| Pros | Cons |
|---|---|
| Satu landing utama yang sederhana | URL `/produksi` tidak lagi menampilkan halaman sendiri |
| Sama dengan struktur Merchandise | Perlu memindahkan JSX landing dan memperbarui route tree |
| Link lama tetap aman melalui redirect | Root onboarding/landing perlu dirapikan agar tidak ada copy generik |
| SEO/share URL canonical lebih jelas | CTA produk harus tetap diuji pada guest/member |

### Opsi C — Hapus `/produksi` total dan biarkan 404

| Pros | Cons |
|---|---|
| Route paling sederhana | Memutus link lama dan bookmark |
| Tidak ada alias yang perlu dirawat | Risiko user melihat 404 dari kampanye/link terdahulu |

### Keputusan

Pilih **Opsi B**. B2B hanya memiliki satu landing marketing, tetapi route lama tetap aman. `/daftar` tetap dipertahankan sebagai route teknis karena pola ini sama dengan Merchandise dan menghindari duplikasi form/modal auth yang lebih sulit dipelihara.

---

## Target User dan Copywriting Direction

### Target utama

- Pemilik warung mie, restoran, cafe, dan dapur produksi.
- Kitchen manager dan purchasing.
- Reseller/mitra usaha yang membutuhkan pasokan mie mentah kiloan.

### Tone

- B2B, langsung, terpercaya, operasional.
- Hindari copy consumer seperti "favoritmu", "tanpa antre", "kuliner", dan "meja".
- Gunakan Bahasa Indonesia yang singkat; istilah unit harus konsisten: `kilo`/`kg` diputuskan setelah verifikasi copy produk canonical.

### Copy landing yang diusulkan

**Eyebrow:**

```text
SUPLAI MIE B2B DJIWA TENTRAM
```

**Headline:**

```text
Mie mentah kiloan untuk operasional usaha.
```

**Supporting copy:**

```text
Pesan langsung dari Djiwa Tentram. Cocok untuk warung mie, restoran, cafe, dan kebutuhan dapur produksi.
```

**Primary CTA:**

```text
Pesan mie sekarang
```

**Secondary reassurance:**

```text
Satu akun Djiwa Tentram untuk order dan pantau status pesanan.
```

**Product label:**

```text
Produksi · Menu 3013
```

**Product description fallback:**

```text
Mie mentah kiloan Djiwa Tentram untuk kebutuhan produksi B2B.
```

**Benefits:**

```text
Harga jelas per kilo
Pesan sesuai kebutuhan produksi
Pantau status pesanan dari satu akun
```

Copy final harus mengambil `name`, `description`, `price`, dan `availability` dari katalog/DB bila tersedia. Hardcoded fallback hanya dipakai ketika record masih loading atau tidak tersedia, bukan untuk menggantikan data live.

---

## UI/UX Specification

### Design principles

1. **Product-first:** produk mie, harga, unit, status, dan CTA terlihat dalam viewport pertama.
2. **B2B clarity:** buyer langsung tahu barang apa, untuk kebutuhan apa, berapa harganya, dan apa langkah berikutnya.
3. **Merchandise parity:** gunakan shell, radius, spacing rhythm, button height, cart, checkout, receipt, dan state pattern dari `apps/merchandise`.
4. **Mobile-first:** max-width existing `max-w-md`, padding konsisten, CTA minimal `min-h-11`/`min-h-12`, safe-area bottom.
5. **No restaurant noise:** jangan tampilkan meja, jumlah orang, dine-in, panggil staff ke meja, free refill, dessert, atau best-seller restaurant copy pada landing B2B.

### Target layout root `/`

```text
┌──────────────────────────────┐
│ Compact brand header         │
│ Djiwa Tentram B2B            │
├──────────────────────────────┤
│ Eyebrow                      │
│ Mie untuk operasional usaha  │
│ Short supporting copy        │
│ [Pesan mie sekarang]         │
├──────────────────────────────┤
│ Product hero image           │
│ #3013 · Produksi             │
│ Mie Mentah Kiloan            │
│ Rp30.000 / kilo              │
│ Aktif / SOLD                 │
├──────────────────────────────┤
│ Untuk kebutuhan:             │
│ warung · restoran · cafe     │
├──────────────────────────────┤
│ 3 operational benefits       │
├──────────────────────────────┤
│ Cara pesan: 1-2-3            │
├──────────────────────────────┤
│ [Pesan mie sekarang]         │
│ SSO reassurance              │
└──────────────────────────────┘
```

### Section rules

- Header: gunakan `CustomerHomeHeader`/shell style yang sama dengan Merchandise, tetapi copy `Djiwa Tentram B2B`.
- Hero: tidak memakai carousel best seller; satu produk utama lebih fokus dan tidak mengalihkan perhatian.
- Product card: gambar dari DB jika valid, fallback `/mie-yamin-product.png`; pertahankan area gambar agar layout tidak meloncat.
- Price: tampilkan currency dari helper `currency()`, bukan format manual. Unit harus konsisten.
- Availability: `Aktif` jika product available dan quantity > 0; `SOLD` jika unavailable/quantity habis; loading tidak boleh salah ditampilkan sebagai Aktif.
- CTA: satu CTA primer di hero dan satu CTA ulang setelah benefits; keduanya menjalankan handler yang sama.
- Benefits: ikon 3D/shared icon atau Lucide existing; tidak membuat asset/dependency baru tanpa kebutuhan.
- Footer/reassurance: jelaskan SSO dan status order, bukan promo generik.
- `/daftar`: visual form tetap sama dengan Merchandise, tetapi title/subtitle B2B dan tanpa meja.
- `/username/order`: gunakan menu/checkout/receipt components yang sudah parity dengan Merchandise; jangan redesign ulang order route sebagai bagian landing kecuali audit menemukan drift visual.

### State matrix

| Surface | Loading | Empty/error | Success/active | Saving/in-flight |
|---|---|---|---|---|
| Product hero | Skeleton image/text | Fallback product copy + neutral notice | Live name/price/status | CTA disabled only when auth bootstrap is loading |
| Guest CTA | Normal | Auth/session error with retry | Navigate to `/daftar` | Prevent double click |
| Guest form | Existing field validation | Inline field error | Navigate direct to order menu | Button `Memproses...` if needed |
| Catalog | Existing Merchandise skeleton | Empty B2B catalog + retry | Only B2B/Produksi products | Add-to-cart feedback |
| Checkout | Existing checkout state | Error box + preserve fields/cart | Mayar/cashier/wallet options | Disable submit and preserve idempotency key |
| Mayar | Pending copy | Retry/new link path | Receipt only after server status/read-back | Never claim paid from browser redirect |
| Product availability | Loading/unknown | Neutral unavailable | `Aktif` | `SOLD` prevents add-to-cart |

### Accessibility/mobile checks

- CTA has accessible label and `aria-busy`/disabled state where applicable.
- Image alt identifies product, not decorative generic text.
- Contrast remains compliant for primary button and hero text.
- 375px viewport has no horizontal overflow.
- CTA remains visible before large content and after benefits.
- Motion honors `prefers-reduced-motion`.

---

## Route and Navigation Plan

### Root landing

Modify `apps/b2b/src/routes/index.lazy.tsx`:

- Replace generic consumer copy with production-focused B2B copy.
- Replace best-seller carousel with single product-focused section, or retain only a compact single product preview if existing shared component contract requires it.
- Use product `3013` from the B2B-scoped catalog.
- Both primary CTAs call the same guest/member handler.
- Guest handler sets `b2b-checkout-intent=produksi` and navigates `/daftar`.
- Authenticated handler navigates `/<username>/order?step=menu`.
- Keep onboarding/auth behavior from Merchandise where applicable; do not create a second auth implementation.

### `/daftar`

Modify `apps/b2b/src/routes/daftar.lazy.tsx` only as needed:

- Keep form fields: name, email, WhatsApp, optional customer description, marketing consent.
- Keep no-table behavior.
- Consume `b2b-checkout-intent` once after successful validation.
- Navigate directly to `/<username>/order?step=menu` when the marker is `produksi`.
- Default non-intent registration may go to `/<username>` following Merchandise behavior.
- Do not pass PII in query parameters.

### `/produksi`

Modify `apps/b2b/src/routes/produksi.tsx`/`produksi.lazy.tsx`:

- Preferred implementation: make `/produksi` redirect to `/` with canonical navigation.
- If TanStack Router redirect handling requires a lazy component, render a minimal redirect/loading state and avoid duplicate product markup.
- Preserve `/produksi` as a compatibility entry point for old links.
- Update route tree through the normal generator; do not manually edit generated route output.

### Cross-channel navigation

- B2B → Customer Cafe keeps `https://djiwatentram.yumme.id/<username>/order?step=table` for cafe context.
- B2B → Merchandise keeps the existing member/guest handoff if present, with guest going to `/daftar` on the target origin.
- B2B channel remains active in `CustomerChannelSwitcher`.
- Landing copy must not imply that the B2B route is a cafe ordering flow.

---

## Multi-Source Data Flow

```text
Supabase pos.categories
  └── B2B root category
        └── Produksi subcategory
              └── Supabase pos.products / product read model
                    └── menuNumber 3013
                          ├── name
                          ├── description
                          ├── price
                          ├── image
                          ├── availability
                          └── quantity
                                │
                                ├── B2B landing `/`
                                ├── B2B catalog `/username/order?step=menu`
                                └── cart item snapshot
                                      │
                                      └── createOrder()
                                            ├── brandSlug=b2b
                                            ├── source=customer_self_service
                                            ├── orderType=takeaway
                                            ├── order_items
                                            └── idempotencyKey
                                                  │
                                                  ├── Mayar proxy invoice
                                                  │     └── redirect URL back to B2B
                                                  ├── cashier pending flow
                                                  └── wallet flow if enabled
                                                        │
                                                        └── receipt/history/POS/Admin
```

### Data source rules

- Landing and menu must use the same B2B-scoped product boundary; do not show an unfiltered all-brand best seller list.
- Product lookup by menu number must reject duplicates rather than silently changing identifiers.
- Price/description/image are read from the product record when present.
- Cart/order stores a snapshot for historical consistency; later catalog edits must not rewrite old receipts.
- Payment settlement remains server/webhook authoritative.

---

## Database Schema Contract

No migration is planned. Verify existing columns/read models before implementation:

```text
pos.categories
  ├── source_id / category identity
  ├── name
  ├── parent_id
  └── track/visibility fields
        │
        └── pos.products or public product read model
              ├── source_id
              ├── category_source_id / categoryId
              ├── menu_number
              ├── name
              ├── description
              ├── price
              ├── image
              ├── is_available / active
              └── quantity

pos.orders
  ├── source_id
  ├── order_number
  ├── brand_slug
  ├── source
  ├── order_type
  ├── status
  ├── total_amount
  ├── payment_method
  ├── payment_receipt_kind
  ├── payment_gateway / gateway_invoice_id
  ├── idempotency_key
  ├── customer_source_id
  └── creation_time / created_at
        │
        └── pos.order_items
              ├── order_source_id
              ├── product_source_id
              ├── product_name
              ├── quantity
              ├── price
              └── raw/item snapshot
```

### REST/view mapping to verify

- Product/category reads: existing `fetchProducts`, `fetchCategories`, `fetchAllProducts` read model in `apps/b2b/src/hooks/use-hybrid-pos-data.ts`.
- Order read-back: existing order hook/read model used by `useHybridOrderById`.
- Mayar create: `POST /functions/v1/mayar-proxy` action `create-invoice-from-order`.
- Mayar status: same function action `get-invoice-detail`.
- Auth: Better Auth central endpoint `https://djiwatentram.yumme.id/api/auth` with credentials included.

---

## Integration Points

### Better Auth / SSO

- Reuse `apps/b2b/src/lib/auth-client.ts` and `useCustomerAuth`.
- Do not add a second login form or separate session store.
- Ensure member CTA uses current username and does not redirect through `/daftar`.
- Preserve trusted-origin and cookie behavior already configured on auth server.

### Mayar

- No new invoice endpoint.
- Preserve `create-invoice-from-order` and `get-invoice-detail` actions.
- Return URL must be built from `window.location.origin` and B2B username/order route.
- Do not mark order paid from redirect alone.
- Validate pending/success/retry copy against payment UX state matrix.

### POS/Admin

- No schema or backend changes.
- Verify B2B order appears with `brand_slug=b2b`, `order_type=takeaway`, and item snapshot menu 3013.
- Verify no table/dine-in assumptions are introduced into operational display.

### Telegram / purchasing / AI agents

- No new Telegram or AI integration is required for this landing rewrite.
- Existing order provenance must remain compatible with downstream POS/Supervisor/finance flows.
- Purchasing/production agents should continue consuming canonical order/product records, not landing copy.
- If a production notification is added later, it must be a separate approved scope and use canonical order/event dedupe.

---

## No-Hardcode Audit

| Value | Source of truth | Allowed fallback |
|---|---|---|
| Product name | B2B product record menu 3013 | Requested fallback copy during loading/error |
| Description | Product record | Requested B2B fallback description |
| Price | Product record | `Rp30.000` only while record is unavailable and explicitly marked fallback/loading |
| Product image | Product image field | `/mie-yamin-product.png` |
| Availability | Product active/is_available + quantity | Neutral loading state; never assume paid/active from unknown |
| Category label | Category records B2B → Produksi | `Produksi` only as display fallback |
| Brand name/domain | `marketplace-config.ts` and env | `Djiwa B2B`, `b2b.yumme.id` |
| CTA copy | UI copy reviewed in this plan | None in data layer |
| Payment status | order/provider/webhook read-back | Pending/unknown copy, never paid |
| Tax/service charge | Admin/site settings and existing pricing hook | Existing safe defaults only |

Before release, search for and remove generic hardcoded consumer copy in B2B landing. Do not alter database values merely to make copy look correct.

---

## Implementation Tasks

### Task 1: Define B2B landing content contract

**Profile:** `subagent-frontend`  
**Files:** `apps/b2b/src/routes/index.lazy.tsx`, optional new `apps/b2b/src/components/b2b/b2b-production-landing.tsx` if extraction reduces route complexity.

- Read the full current root route and Merchandise equivalent.
- Implement a single-product B2B landing surface using existing shell/card/button primitives.
- Use live product data for menu 3013 and explicit loading/SOLD/error states.
- Replace consumer copy with the approved targeted copy direction.
- Keep CTA handler contract for guest/member routing.
- Do not add a new dependency or modify shared Customer app.

### Task 2: Consolidate `/produksi` into root canonical landing

**Profile:** `subagent-frontend`  
**Files:** `apps/b2b/src/routes/produksi.tsx`, `apps/b2b/src/routes/produksi.lazy.tsx`, `apps/b2b/src/routeTree.gen.ts` (generated only through router build).

- Replace duplicate production JSX with a safe redirect/compatibility alias to `/`.
- Confirm direct `/produksi` links remain valid.
- Ensure root CTA and alias do not create redirect loops.
- Regenerate route tree normally if required.

### Task 3: Preserve guest intent and direct-to-menu flow

**Profile:** `subagent-frontend`  
**Files:** `apps/b2b/src/routes/daftar.lazy.tsx`, `apps/b2b/src/routes/index.lazy.tsx`.

- Keep the existing non-PII intent marker pattern.
- Consume marker once only after form validation succeeds.
- Route guest directly to `/<username>/order?step=menu`.
- Ensure failed validation preserves the marker and entered fields.
- Ensure normal `/daftar` usage still follows the intended Merchandise-style guest home behavior.

### Task 4: Audit order/menu copy and B2B-specific noise

**Profile:** `subagent-frontend`  
**Files:** `apps/b2b/src/components/customer/menu-section.tsx`, `checkout-section.tsx`, `receipt-section.tsx`, `apps/b2b/src/routes/$username/order.lazy.tsx`.

- Compare each file with `apps/merchandise` byte/semantic differences.
- Preserve Merchandise UX structure and payment behavior.
- Remove only B2B-inappropriate landing/order copy: table, dine-in, free refill, dessert, restaurant-service assumptions where they are exposed.
- Keep required checkout identity, contact, notes, payment, receipt, retry, and loading/error states.
- Keep `orderType: "takeaway"` and no table metadata.

### Task 5: Verification and production rollout

**Profile:** `subagent-qa-tester` then `subagent-deployment`  
**Files:** no authored production code unless fixes are found.

- Run B2B typecheck and production build.
- Smoke-test `/`, `/produksi`, `/daftar`, and a guest route using browser if CDP is available.
- If browser unavailable, report HTTP and hashed bundle evidence explicitly.
- Verify no root bundle/landing lazy chunk contains removed generic copy.
- Verify no production chunk contains `No. Meja`/`Nomor meja`.
- Verify Mayar channels/status endpoint health without creating a real invoice/order.
- Deploy only B2B dist artifact to `/var/www/b2b.yumme.id`.
- Verify Nginx, canonical HTTPS routes, index, service worker, and hashed lazy chunks.
- Verify `apps/merchandise` and `djiwatentram.yumme.id` remain reachable.

---

## Dependency Graph / Execution Waves

```text
Wave 1 — independent audits
  ├── Task 1: root landing content/UI
  ├── Task 2: /produksi compatibility alias
  ├── Task 3: guest intent/direct-to-menu
  └── Task 4: order/menu copy and noise audit

Wave 2 — integration
  └── Reconcile route tree, CTA navigation, product lookup, and shared component props

Wave 3 — quality gate
  └── Task 5: typecheck → build → browser/HTTP/bundle verification → deploy
```

Tasks 1–4 touch different primary files and may be developed in parallel, but integration review must be sequential before build. Do not let parallel work overwrite unrelated working-tree changes.

---

## Verification Commands

```bash
cd /opt/djiwatentramapp/apps/b2b
bun run check-types
bunx vite build --mode production

cd /opt/djiwatentramapp
git diff --check -- apps/b2b

curl -fsSIL https://b2b.yumme.id/
curl -fsSIL https://b2b.yumme.id/produksi
curl -fsSIL https://b2b.yumme.id/daftar
```

### Bundle checks

- Fetch the exact hashed assets referenced by production `index.html` and lazy route assets.
- Confirm root landing contains targeted marker such as `Mie mentah kiloan untuk operasional usaha` or the approved final equivalent.
- Confirm no user-facing generic markers remain: `Pesan favoritmu`, `tanpa antre`, `Menu Best Seller`.
- Confirm no B2B UI chunk contains `No. Meja` or `Nomor meja`.
- Confirm Mayar redirect template includes `window.location.origin`, `/order`, `step=receipt`, and `orderId`.

### Manual browser flow

1. Open `/` at mobile viewport 375px.
2. Confirm first viewport identifies B2B mie production and price.
3. Tap `Pesan mie sekarang` as guest.
4. Fill valid data in `/daftar`.
5. Submit and confirm direct navigation to `/<username>/order?step=menu`.
6. Confirm catalog shows product 3013.
7. Add product and open checkout.
8. Select Mayar without submitting a real invoice during QA.
9. Confirm payment fields, error/saving state, and no table field.
10. For an authorized sandbox/manual transaction only: verify Mayar link, callback URL, order read-back, and pending/paid semantics independently.

### Production verification

- `index.html` HTTP 200 and references new assets.
- `/produksi` redirects or resolves to canonical root without duplicate landing markup.
- `/daftar` HTTP 200 and no table field.
- Root and production lazy chunks contain targeted B2B copy.
- `sw.js`/manifest updated when required to avoid stale PWA cache.
- Nginx syntax valid and reload successful.
- No secrets printed in logs, bundle, plan, commit, or final report.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Root still shows old PWA cache | Deploy new hashed assets, verify `index.html`/`sw.js`, advise hard refresh only if needed |
| `/produksi` redirect loop | Use one-way redirect to `/` and test direct URL plus browser back |
| Guest form loses intent | Consume marker only after validation; preserve marker on validation error |
| Product 3013 missing from read model | Show explicit unavailable state and retry; do not fabricate live catalog data |
| B2B shows cross-brand products | Apply B2B filtering at hook/data boundary and validate before add-to-cart |
| Landing price drifts from DB | DB product is source of truth; fallback visually marked by loading/unavailable state |
| Payment callback treated as paid | Keep webhook/provider read-back authoritative; redirect only restores receipt context |
| Shared Merchandise behavior changes accidentally | Stage only `apps/b2b` files; compare `git diff --name-only HEAD` before commit |
| Generated route artifacts pollute commit | Regenerate intentionally and stage only B2B generated files required by route changes |
| Large route file patch corruption | Read full file or use safe Python open/edit; run typecheck/build immediately after changes |

---

## Definition of Done

- [ ] Root landing is production-mie focused and targeted to B2B buyers.
- [ ] Copywriting, sections, CTA, and product status are verified against the final spec.
- [ ] `/produksi` is a compatibility alias, not a duplicate marketing flow.
- [ ] `/daftar` remains functional but is not treated as a user-facing navigation choice.
- [ ] Guest/member routes direct users to the B2B Merchandise-style menu.
- [ ] No meja/dine-in copy or metadata appears in B2B ordering flow.
- [ ] Checkout/Mayar callback contract is preserved.
- [ ] Typecheck and production build pass.
- [ ] Live HTTP and hashed lazy assets verify the deployed release.
- [ ] Only scoped files are committed and pushed after explicit implementation approval.
