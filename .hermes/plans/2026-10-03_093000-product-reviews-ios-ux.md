# Plan: Review Produk/Menu — Simple, Cepat, Apple iOS Style

**Status:** Draft untuk approval user  
**Scope:** Customer product review + Admin moderation  
**Target app:** `apps/customer` (customer review UI), `apps/admin` (admin moderation UI), Supabase `pos` schema  
**Admin scope:** seluruh moderation review berada di aplikasi Admin pada repo `apps/admin`; tidak dibuat di POS, Customer, atau app lain. Route/component final harus mengikuti struktur Admin existing setelah audit route products.
**Design references:** root `DESIGN.md`, AI Product Design DNA v2.0, Apple HIG, existing Customer product sheet

## 1. Goal

Menambahkan sistem review per produk/menu yang ringan dan terpercaya tanpa membuat katalog atau checkout terasa lambat.

Customer dapat:

- melihat rating rata-rata dan jumlah review pada detail produk;
- memberi rating 1–5 bintang dan komentar opsional setelah order selesai/lunas;
- melihat review terbaru yang sudah dipublikasikan;
- melaporkan review yang tidak pantas.

Admin dapat:

- melihat review masuk;
- memfilter `pending`, `published`, `hidden`, dan `reported`;
- mempublikasikan/menyembunyikan review;
- melihat bukti order terverifikasi tanpa mengekspos data sensitif.

Non-goals v1:

- foto/video review;
- reply merchant;
- voting helpful;
- review anonim tanpa verifikasi order;
- rating per variasi/ingredient;
- AI-generated review atau auto-publish.

## 2. Current Context

Yang sudah ada:

- Customer product catalog: `apps/customer/src/components/customer/menu-section.tsx`.
- Detail produk/variasi: `apps/customer/src/components/customer/product-sheet.tsx`.
- Order lifecycle dan status checkout: `apps/customer/src/routes/$username/order.lazy.tsx`.
- Admin product management dan shared Supabase hooks sudah tersedia.
- Root `DESIGN.md` menetapkan light theme, Azure `#1a5dc6`, Plus Jakarta Sans untuk display, Geist/Inter untuk body, radius 24px untuk major card, radius 14px untuk controls, touch target minimum 44px.

Yang belum ada setelah audit:

- tabel/API/UI rating produk;
- verified-purchase review flow;
- moderation queue;
- aggregate rating pada product response.

Istilah `review` yang sudah ada adalah review checkout/status internal, bukan review produk. Fitur baru harus hidup berdampingan dan tidak mengubah state checkout.

## 3. UX Decision

### Model yang dipilih: verified-purchase, lightweight review

- Review hanya dapat dibuat untuk produk yang pernah masuk order user dan order sudah `selesai`/`lunas`.
- Customer boleh memberi rating tanpa komentar.
- Komentar dibatasi 500 karakter untuk menjaga moderation dan rendering cepat.
- Review baru berstatus `pending`, tidak langsung tampil publik.
- Setelah admin publish, rating agregat ikut diperbarui.
- Satu produk dalam satu order hanya dapat direview satu kali oleh customer/order identity.

### Alternatives Analysis

#### Option A — Review langsung publish

| Kelebihan | Kekurangan |
|---|---|
| UX paling cepat | Spam, review palsu, konten kasar |
| Backend lebih sedikit | Rating dapat berubah tanpa kontrol |

#### Option B — Semua review harus dimoderasi manual

| Kelebihan | Kekurangan |
|---|---|
| Trust dan keamanan tinggi | Review lambat tampil, beban admin tinggi |
| Konten lebih terkontrol | Queue dapat menumpuk |

#### ⭐ Recommendation — Hybrid moderation

- Rating tanpa komentar dari verified purchase dapat masuk `published` otomatis jika aturan dasar lolos.
- Review dengan komentar masuk `pending` untuk v1, atau semua review `pending` bila user ingin kontrol penuh.
- Admin dapat hide/report kapan saja.
- Rekomendasi awal: **semua review pending** sampai volume dan pola abuse terukur; UX tetap cepat karena form hanya satu sheet dan submit async.

## 4. Database Schema

### 4.1 Base table: `pos.product_reviews`

```text
id                    uuid primary key default gen_random_uuid()
source_id             text unique not null
product_source_id     text not null        -- logical reference ke pos.products.source_id
order_source_id       text not null        -- canonical/raw order source identifier
customer_user_id      uuid null            -- auth user bila member
customer_display_name text null            -- snapshot aman, bukan PII penuh
rating                smallint not null    -- CHECK 1..5
comment               text null            -- max 500 chars via API + CHECK
status                text not null        -- pending|published|hidden|reported
verified_purchase     boolean not null default true
moderation_note       text null
moderated_by          text null
moderated_at          timestamptz null
created_at            timestamptz not null default now()
updated_at            timestamptz not null default now()

CHECK (rating between 1 and 5)
CHECK (comment is null or char_length(comment) <= 500)
UNIQUE (order_source_id, product_source_id, customer_user_id)
```

Catatan:

- `source_id` mengikuti pola mirror/reference data yang sudah dipakai POS.
- Jangan membuat FK ke `pos.products` sebelum tipe dan lifecycle `source_id` diverifikasi; gunakan logical reference + server-side existence check untuk kompatibilitas mirror.
- Bila guest review diperlukan, tambahkan `review_token_hash` dan `reviewer_key_hash`, bukan email/phone mentah.
- Jangan menyimpan nomor telepon, email, alamat, atau payment data di review.

### 4.2 Aggregate view: `public.pos_product_review_summary`

```text
product_source_id     text
published_count       bigint
rating_average        numeric(3,2)
rating_1_count        bigint
rating_2_count        bigint
rating_3_count        bigint
rating_4_count        bigint
rating_5_count        bigint
last_reviewed_at      timestamptz
```

Sumber hanya `status = 'published'` dan `verified_purchase = true`.

### 4.3 Public read view: `public.pos_product_reviews`

```text
id                    uuid
product_source_id     text
rating                smallint
comment               text
customer_display_name text
created_at            timestamptz
```

View hanya mengekspos review published. Tidak mengekspos `customer_user_id`, `order_source_id`, moderation note, atau token.

### 4.4 REST mapping

```text
GET  /rest/v1/pos_product_review_summary?product_source_id=eq.<id>
GET  /rest/v1/pos_product_reviews?product_source_id=eq.<id>&order=created_at.desc
```

Write tidak dilakukan langsung dari anon client ke base table. Gunakan Edge Function agar verified purchase, rate limit, ownership, dan duplicate prevention atomic.

## 5. Backend/API Plan

### Edge Function: `supabase/functions/product-reviews/index.ts`

Actions:

```text
summary       -> rating average/count untuk product
list          -> published review paginated
create        -> validate order ownership + completed status + duplicate
report        -> authenticated user reports review
moderate      -> admin-only publish/hide/report resolution
```

Create validation:

1. auth/session valid atau review token valid;
2. product exists and is available in order item;
3. order belongs to user/token;
4. order status is settled/completed;
5. rating integer 1–5;
6. comment trimmed and <=500 chars;
7. duplicate constraint checked atomically;
8. insert `pending` and return safe public payload.

Performance:

- `summary` satu query aggregate/view.
- `list` page size 10 dengan `limit`/cursor.
- Jangan fetch review list pada product grid; fetch hanya product sheet saat dibuka.
- Cache summary per product selama session/revalidate setelah publish.

Security:

- RLS deny direct anonymous insert/update/delete ke base table.
- Admin moderation authorization server-side.
- Rate limit create/report per user/token/IP fingerprint yang tidak disimpan sebagai PII.
- Sanitize comment output; React escaping tetap wajib.
- Jangan log comment lengkap atau token.

## 6. Customer UI/UX Specification

### Product card — compact signal

Pada `menu-section.tsx`, setelah nama/harga:

```text
★ 4,8  ·  24 ulasan
```

Aturan:

- hanya tampil jika `published_count > 0`;
- jangan menampilkan rating kosong sebagai `0,0`;
- gunakan star icon Lucide/semantik, bukan emoji;
- ukuran caption 11–12px, tidak mengalahkan nama dan harga;
- tetap 1 baris pada mobile, boleh scroll/truncate hanya pada metadata non-esensial.

### Product sheet — review section

Di `product-sheet.tsx`:

```text
Rating menu
4,8  ★★★★★  ·  24 ulasan

[ Lihat semua ulasan ]

Review terbaru
“...”
— Nama customer · Pembelian terverifikasi

[ Beri rating ]
```

- Bottom sheet tetap ringan dan cepat.
- Review list lazy-loaded setelah user menekan `Lihat semua ulasan`.
- CTA `Beri rating` hanya tampil bila ada eligible completed order.
- Untuk user belum eligible, tampilkan copy netral: `Pesan menu ini untuk memberi ulasan setelah pesanan selesai.`
- Rating input menggunakan 5 tombol 44px, keyboard accessible, `aria-label` jelas.
- Komentar memakai textarea 3 baris dengan counter `0/500`.
- Submit disabled saat saving; cegah double tap.
- Success: toast `Ulasan dikirim untuk ditinjau.`
- Error: inline message + retry, data form tidak hilang.

### States wajib

- Loading: skeleton rating row dan review rows.
- Empty: `Belum ada ulasan` + `Jadilah yang pertama setelah mencoba menu ini.`
- Error: `Ulasan belum dapat dimuat` + `Coba lagi`.
- Saving: tombol `Kirim ulasan` disabled + progress state.
- Pending: `Ulasan menunggu moderasi` hanya terlihat oleh pengirim.
- Hidden/reported: tidak tampil publik.
- Offline/stale: jangan mengarang rating; tampilkan data terakhir hanya jika ada timestamp/cache yang valid.

### Apple/iOS style contract

- Mobile shell 390–430px; respect safe-area.
- Background putih/near-white, satu accent Azure `#1a5dc6`.
- Card radius 24px; controls 14px; soft shadow.
- Touch target minimum 44×44px.
- Motion 180ms micro / 320ms sheet dengan iOS easing.
- No decorative gradient, emoji icon, or oversized review module.
- One primary action per surface: `Beri rating` or `Kirim ulasan`.
- Product review must not cover cart/checkout CTA or alter order flow.

## 7. Admin UI/UX Specification — `apps/admin`

Target integration: existing Admin Products page plus optional moderation tab, not a new dashboard with duplicate stats. **Admin moderation is implemented and deployed only through `apps/admin`; Customer only consumes the public published result.**

Proposed compact table:

```text
Menu | Rating | Ulasan | Pending | Terakhir | Aksi
```

Interactions:

- filter status: Semua/Pending/Published/Reported/Hidden;
- search product/customer display name/order reference safely;
- row click opens iOS-style detail sheet on mobile, side panel/modal on desktop;
- actions: Publish, Hide, Mark reported/resolved;
- moderation note internal only;
- bulk action is out of v1 scope.

Admin states:

- loading skeleton rows;
- empty queue with clear explanation;
- error + retry;
- confirmation before hide/delete-like action;
- success toast after moderation;
- audit fields visible to admin only.

## 8. Multi-source Data Flow

```text
Customer completed order
        |
        v
Eligibility query / review token
        |
        v
product-reviews Edge Function
        |
        v
pos.product_reviews (pending)
        |
        v
Admin moderation
        |
        v
status=published
        |
        +--> pos_product_review_summary
        |
        +--> Customer product card/product sheet
```

Product source of truth:

```text
pos.products.source_id
    -> order items product/source id
    -> product_reviews.product_source_id
    -> public summary/review views
```

Do not use product name or menu number as the relational identity; both can change.

## 9. Integration Points

### AI/LLM

- No AI generation or sentiment auto-moderation in v1.
- Future AI may classify abuse/sentiment only as a moderation suggestion, never auto-publish/reject without policy approval.

### Telegram bot

- No review content sent to Telegram in v1.
- Optional future alert only for moderation queue count, deduped per review/event.
- Never send customer comment, phone, email, or token to Telegram by default.

### Purchasing agent / inventory

- No direct integration. Review does not change purchasing, inventory, HPP, price, or availability.

### Existing order/payment systems

- Read-only eligibility check against settled/completed order.
- No change to Mayar, QRIS, wallet, receipt, POS closing, or order status lifecycle.

## 10. No-hardcode Audit

Must come from database/config:

- product identity and name;
- rating aggregate/count;
- review status;
- eligibility/order relation;
- category/menu data;
- moderation permissions.

Allowed constants in code:

- rating range 1–5;
- max comment 500 characters;
- page size 10;
- animation/touch tokens from design system;
- status enum values validated by backend.

Never hardcode:

- rating average;
- review count;
- customer names;
- eligibility result;
- product IDs;
- moderation role names without existing auth-role resolver.

## 11. Implementation Order

### Wave 1 — Discovery and schema

1. Confirm exact `pos.products`, order item, auth identity, and admin-role columns.
2. Verify completed/settled status values across Customer and POS.
3. Add idempotent migration for base table, indexes, RLS, public views.
4. Add seed-free empty-state verification; do not fabricate reviews.

### Wave 2 — Backend

5. Implement `product-reviews` Edge Function.
6. Add summary/list/create/report/moderate actions.
7. Add server-side duplicate and verified-purchase checks.
8. Add safe response DTOs and rate limits.

### Wave 3 — Customer

9. Add review summary hook with lazy fetch.
10. Add compact rating signal to menu product cards.
11. Add review section and submit sheet to `product-sheet.tsx`.
12. Add loading/empty/error/saving/pending states.
13. Verify cart, variation, checkout, and product selection regressions.

### Wave 4 — Admin

14. Add moderation tab/panel to existing Products route.
15. Add filters, detail sheet, publish/hide/report actions.
16. Add audit-safe moderation feedback.

### Wave 5 — QA and release

17. Run migration preview and verify row counts before/after.
18. Test anon read, authenticated create, invalid order, duplicate, hidden review, and admin moderation.
19. Run Customer/Admin builds and relevant typecheck.
20. Verify generated bundles contain review labels and no secrets.
21. Render and inspect screenshots at 375px, 390px, 430px, 768px, and desktop.
22. Hard-refresh/PWA cache verification on Customer.
23. Deploy only changed Customer/Admin assets and Edge Function.
24. Read back exact review/summary records after write tests; clean only test records with explicit test marker.

## 12. Files Likely to Change

Backend/database:

- `supabase/migrations/<timestamp>_product_reviews.sql`
- `supabase/functions/product-reviews/index.ts`
- `supabase/functions/_shared/*` only if an existing shared auth/response helper is appropriate

Customer:

- `apps/customer/src/components/customer/menu-section.tsx`
- `apps/customer/src/components/customer/product-sheet.tsx`
- `apps/customer/src/hooks/use-hybrid-pos-data.ts` or a dedicated `use-product-reviews.ts`
- `apps/customer/src/lib/*` for typed Edge Function client if no existing helper fits
- `apps/customer/src/routes/$username/order.lazy.tsx` only for passing verified eligibility/context; preserve checkout behavior

Admin:

- existing product route/component discovered during implementation;
- likely `apps/admin/src/routes/admin/products.lazy.tsx` and/or product management component;
- dedicated review moderation component under `apps/admin/src/components/` if reuse is clean.

Design contract:

- root `DESIGN.md` only if a token is genuinely missing;
- do not create an app-specific token fork.

## 13. Verification Matrix

| Scenario | Expected |
|---|---|
| Product has no review | No fake 0 rating; empty state in sheet |
| Product has published reviews | Average/count visible; list lazy-loaded |
| User has no completed order | Cannot submit; clear eligibility copy |
| User has completed order | Rating form available |
| Duplicate same order/product | Backend rejects atomically; user-safe message |
| Comment 500 chars | Accepted; 501 rejected client + server |
| Rating 0/6/non-integer | Rejected client + server |
| Pending review | Not public; visible to author as pending |
| Hidden review | Removed from public list and aggregate |
| Admin publish | Read-back confirms public visibility and aggregate update |
| Double tap submit | One review only |
| Offline/error | Retry without losing typed comment |
| Mobile 375px | No horizontal overflow; 44px controls |
| Checkout regression | Cart, variation, payment, receipt unchanged |

## 14. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Fake/spam review | Verified purchase + pending moderation + rate limit |
| PII leakage | Public view strips identity/order fields; snapshot display name only |
| Review slows menu | Summary only on grid; full list lazy in product sheet |
| Duplicate review | DB unique constraint + atomic backend validation |
| Auth/guest mismatch | Confirm identity model before schema; use one-time token for guest later |
| Existing `review` naming collision | Use explicit `product_reviews` naming and separate Edge Function |
| PWA stale bundle | hard refresh/SW verification after deploy |
| Design becomes cramped | Keep one compact rating row and one primary CTA; screenshot QA at mobile widths |
| Admin scope creep | No bulk actions, replies, media, or AI moderation in v1 |

## 15. Definition of Done

- [ ] Product review schema and public views exist with RLS.
- [ ] Verified-purchase rule is enforced server-side.
- [ ] Customer can submit one rating per product/order.
- [ ] Published reviews and aggregate appear in product detail.
- [ ] Product grid remains fast and uncluttered.
- [ ] Admin can moderate pending/reported reviews.
- [ ] Loading/empty/error/saving/pending states are implemented.
- [ ] Apple/iOS and root `DESIGN.md` tokens are followed.
- [ ] WCAG labels, keyboard focus, 44px touch targets, and reduced motion are verified.
- [ ] Customer/Admin builds pass.
- [ ] External writes are read back and verified.
- [ ] Live screenshot is inspected before declaring release complete.
