# Plan: 500 Kopi Tasik — Google Login, Sticker Reward, dan Djiwa Pay

## Status

**Plan only.** Dokumen ini belum mengubah source code, database, auth server, storage, deployment, atau aplikasi existing.

## Goal

Membuat aplikasi baru:

```txt
apps/500kopitasik
```

sebagai single-page mobile-first coffee passport untuk mengoleksi hingga 500 coffee shop di Tasikmalaya.

Tambahan requirement bisnis:

1. User boleh menjelajah aplikasi tanpa login.
2. Ketika akan memakai fitur Collect Stamp / membuat sticker, user wajib login atau daftar melalui **Google OAuth dengan Better Auth**.
3. Login tetap membuka pengalaman di halaman yang sama melalui modal/sheet; tidak membuat halaman login terpisah untuk alur utama.
4. Setiap kunjungan valid yang menghasilkan sticker memberi reward **Rp500 saldo reward Djiwa Pay**.
5. Reward hanya diberikan satu kali untuk setiap coffee shop unik per user.
6. Maksimal 500 coffee shop unik per user.
7. Potensi maksimum reward per user:

```txt
500 coffee shop × Rp500 = Rp250.000
```

8. Reward hanya dapat digunakan untuk transaksi produk/menu Djiwa Tentram di:

```txt
https://djiwatentram.web.id
```

9. Reward tidak dapat dicairkan, ditransfer, diuangkan, atau digunakan di storefront merchandise/B2B/brand lain.
10. Repeat visit tetap membuat gallery memory baru, tetapi tidak menambah progress unik atau reward kedua untuk coffee shop yang sama.

---

## Current Context dari Audit Read-only

### Monorepo

```txt
Frontend       React 19 + Vite + TypeScript
Package        Bun 1.3.4
Workspace      apps/* dan packages/*
Styling        Tailwind CSS v4
Shared UI      packages/yumipos-web-shared
Animation      framer-motion
Icons          lucide-react
Database       Supabase PostgreSQL
PWA            vite-plugin-pwa
```

File yang sudah diperiksa:

```txt
/opt/djiwatentramapp/package.json
/opt/djiwatentramapp/turbo.json
/opt/djiwatentramapp/PROJECT.md
/apps/customer/package.json
/apps/linkbio/package.json
/packages/yumipos-web-shared/package.json
```

### Better Auth

Better Auth customer server sudah tersedia di:

```txt
apps/auth-server/src/auth.ts
apps/auth-server/src/index.ts
apps/customer/src/lib/auth-client.ts
```

Temuan:

- Google social provider sudah dikonfigurasi melalui `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET`.
- Customer session menggunakan httpOnly cookie.
- Cookie cross-subdomain sudah memakai domain `.djiwatentram.web.id`.
- `accountLinking` sudah aktif dengan `allowDifferentEmails: false`.
- `trustedOrigins` dan CORS masih perlu ditambah untuk domain baru 500 Kopi Tasik.
- Callback Google menggunakan Better Auth, bukan Supabase GoTrue.

### Customer identity

Better Auth `public.user.id` menjadi identity customer dan disinkronkan ke `pos.customers` melalui pola existing. App baru harus memakai identity session dari server, bukan menerima `userId` bebas dari browser.

### Djiwa Pay

Fondasi wallet existing ditemukan pada:

```txt
supabase/migrations/20260822000001_customer_wallet_foundation.sql
supabase/functions/customer-wallet/index.ts
supabase/functions/mayar-webhook/index.ts
```

Sudah tersedia:

- `pos.customer_wallets`;
- `pos.customer_wallet_ledger`;
- `pos.customer_wallet_holds`;
- `pos.customer_wallet_topups`;
- top-up melalui Mayar;
- settlement webhook server-side;
- hold/capture/release untuk pembayaran wallet;
- idempotency dan row locking pada beberapa operasi.

Namun saldo wallet existing adalah saldo umum. Karena reward baru harus dibatasi hanya untuk menu Djiwa Tentram, reward **tidak boleh langsung dicampur secara tidak terlacak ke `available_balance`**.

### Existing storage/media

- `app-assets` adalah bucket public yang dipakai untuk asset umum; tidak cocok langsung untuk foto pribadi user.
- Customer community sudah memakai Cloudflare R2 + Worker untuk media dan metadata.
- Foto original dan sticker harus disimpan sebagai object terpisah.

---

## Architecture Decision

### Rekomendasi

Buat app frontend baru yang berdiri sendiri di `apps/500kopitasik`, tetapi reuse:

- React/Vite/TypeScript;
- `@yumipos/web-shared`;
- Better Auth customer session pusat;
- PostgreSQL/Supabase;
- R2/Worker pattern untuk media;
- Djiwa Pay server-side wallet primitives;
- existing Mayar/top-up lifecycle;
- existing Djiwa Tentram order/payment contract bila kompatibel.

Jangan:

- membuat repository baru;
- membuat auth server baru;
- membuat database baru;
- menaruh API key AI di browser;
- memakai `app-assets` public policy untuk foto pribadi tanpa boundary baru;
- memasukkan reward langsung ke saldo umum tanpa scope enforcement.

### Reward wallet model

Gunakan model saldo reward terpisah atau wallet bucket terpisah:

```txt
Saldo Djiwa Pay umum
└── top-up customer, dapat mengikuti kebijakan wallet umum

Saldo Reward Djiwa Pay 500 Kopi Tasik
└── hanya untuk order Djiwa Tentram
└── tidak dapat withdraw/transfer
└── tidak dapat digunakan di merchandise/B2B
```

Untuk menghindari perubahan berisiko pada saldo umum, tahap pertama direkomendasikan memakai tabel reward terpisah yang dapat dikonsumsi oleh RPC checkout Djiwa Tentram secara atomic.

---

## Alternatives Analysis

### Option A — Masukkan reward ke `pos.customer_wallets.available_balance`

| Pros | Cons |
|---|---|
| UI saldo terlihat sederhana | Tidak dapat membedakan top-up biasa vs reward terbatas |
| Reuse RPC wallet langsung | Berisiko reward dipakai di merchandise/B2B |
| Sedikit schema baru | Sulit audit, refund, expiry, dan enforcement per storefront |

**Risiko:** tinggi. Tidak direkomendasikan.

### Option B — Wallet reward terpisah dengan ledger dan RPC khusus

| Pros | Cons |
|---|---|
| Scope penggunaan jelas | Membutuhkan tabel dan RPC tambahan |
| Audit reward per visit mudah | Checkout Djiwa Tentram perlu integrasi khusus |
| Tidak mengubah saldo top-up umum | UI perlu menampilkan dua sumber saldo |
| Mudah mencegah duplicate reward | Perlu aturan refund/cancel yang eksplisit |

**Risiko:** rendah-menengah. **Direkomendasikan.**

### Option C — Satu wallet dengan bucket/scope di ledger

| Pros | Cons |
|---|---|
| Model jangka panjang lebih unified | Perlu refactor seluruh hold/capture dan settlement |
| Bisa mendukung banyak promo scope | Risiko regression ke checkout existing lebih tinggi |
| Satu saldo aggregate | Lebih sulit diluncurkan bertahap |

**Risiko:** menengah-tinggi. Cocok sebagai fase lanjutan, bukan MVP awal.

---

## Product Rules yang Harus Dikunci

### Reward eligibility

Reward Rp500 diberikan hanya jika semua kondisi terpenuhi:

```txt
user authenticated via Better Auth
+ coffee shop aktif
+ visit dimiliki user tersebut
+ original photo berhasil disimpan
+ location verification berhasil sesuai policy MVP
+ sticker generation selesai/completed
+ coffee shop belum pernah diberi reward ke user tersebut
+ jumlah coffee shop rewarded < 500
= credit reward Rp500 satu kali
```

### Repeat visit

```txt
Visit 1 ke Kopi A → gallery memory + collection 1 + reward Rp500
Visit 2 ke Kopi A → gallery memory baru, collection tetap 1, reward Rp0
```

### AI failure

Jika AI gagal:

```txt
visit tetap disimpan
original photo tetap disimpan
status = failed
reward belum diberikan
user dapat Try Again
```

Reward diberikan setelah sticker benar-benar completed, dengan idempotency key unik.

### Cap

Cap harus enforced oleh database/RPC, bukan hanya UI:

```txt
MAX_REWARDED_SHOPS_PER_USER = 500
REWARD_PER_SHOP_IDR = 500
MAX_REWARD_PER_USER_IDR = 250000
```

Nilai tersebut harus berada pada konfigurasi DB/admin yang dapat diaudit, bukan tersebar sebagai magic number di banyak file.

### Validity dan expiry

Open decision sebelum implementasi:

- apakah reward tidak pernah expired;
- atau reward memiliki masa berlaku, misalnya 12 bulan;
- apakah bisnis dapat membatalkan reward fraudulently claimed;
- apakah refund order mengembalikan reward atau tidak.

Rekomendasi awal: **tidak expired pada MVP**, tetapi semua credit memiliki source visit dan audit reference sehingga dapat direversal oleh operator melalui RPC khusus jika fraud terbukti.

---

## Google Login Flow — Tetap Single Page

### Guest browsing

User dapat melihat:

- Gallery empty state;
- Explore coffee shops;
- Collection progress;
- coffee shop detail;
- profile preview bila ada.

### Login gate

Saat user menekan salah satu CTA:

```txt
Collect Stamp
Visit Again
Create My Stamp
Generate Sticker
```

dan belum authenticated:

```txt
Main page tetap terbuka
→ AuthSheet muncul
→ tombol utama “Lanjut dengan Google”
→ Better Auth OAuth
→ kembali ke URL halaman aplikasi yang sama
→ state flow visit dipulihkan
→ user lanjut ke langkah berikutnya
```

### Google account behavior

Gunakan:

```ts
authClient.signIn.social({
  provider: "google",
  callbackURL: window.location.origin + window.location.pathname,
});
```

Callback harus absolute dan tidak boleh selalu memaksa user kembali ke halaman customer ordering.

Auth server perlu ditambah:

```txt
https://<domain-500kopitasik>
```

ke:

- `trustedOrigins` Better Auth;
- CORS `customerOrigins`;
- daftar OAuth redirect URI Google Cloud:

```txt
https://<domain-500kopitasik>/api/auth/callback/google
```

Karena cookie pusat menggunakan `.djiwatentram.web.id`, domain app baru harus tetap berada di domain yang kompatibel dengan kebijakan cookie tersebut.

### Existing Djiwa customer auth boundary

Karyawan tetap memakai sistem auth karyawan/Yumi dan tidak boleh otomatis memperoleh reward customer hanya karena memiliki email yang sama. Backend reward harus memastikan session berasal dari Better Auth customer dan memeriksa `public.user.user_type = 'customer'` sesuai guard existing.

---

## Single-page UI/UX Specification

### Main shell

```txt
Sticky header
├── 500 Kopi Tasik
├── progress 0 / 500
├── reward balance / saldo reward
└── avatar → ProfileSheet

Segmented navigation
├── Gallery [default]
├── Explore
└── Collection

Main content

Floating CTA
└── + Collect Stamp
```

Tidak membuat route user-facing terpisah untuk Gallery, Explore, Collection, Profile, atau detail coffee shop.

### Gallery

- Default tab.
- Visual diary masonry/grid.
- Menampilkan original photo sebagai asset utama.
- Sticker ditempel sebagai transparent PNG overlay.
- Metadata: shop, title, category, description, date, stamp state, reward state.
- Loading: skeleton grid.
- Empty: onboarding visual dengan CTA Collect Stamp.
- Error: inline retry tanpa menghilangkan data lokal yang sudah tersimpan.
- Detail: full-screen modal/sheet.

### Explore

- Search coffee shop name dan area.
- Filter minimal: All, Unvisited, Visited, Nearby.
- `Nearby` hanya aktif jika location data tersedia; jangan menampilkan data jarak palsu.
- Card menampilkan status collected dan visit count.
- Klik card membuka `CoffeeShopSheet`, bukan route baru.

### Collection

- Unique coffee shop stamps, bukan semua visit.
- Grid lazy/pagination; jangan render 500 placeholder sekaligus.
- Progress jelas `N / 500`.
- Milestone badges.
- Repeat visit tidak menggandakan stamp.

### Visit Composer Sheet

State machine:

```txt
select-shop
→ auth-required jika guest
→ location-check
→ photo
→ category
→ title-description
→ confirmation
→ upload
→ generating
→ completed / failed
```

Semua state tetap berada di halaman utama melalui bottom sheet/modal.

### Login/AuthSheet

Isi minimal:

```txt
Kumpulkan momenmu di 500 Kopi Tasik
Login diperlukan untuk membuat sticker dan menerima saldo reward.
[Lanjut dengan Google]
```

Tidak menampilkan password form pada MVP jika requirement hanya Google. Jika email/password tetap dipertahankan karena auth pusat sudah mendukungnya, posisikan sebagai secondary option setelah Google, bukan jalur utama.

### Reward UI

Tampilkan secara eksplisit:

```txt
Saldo Reward Djiwa Pay
Rp500

Dapat digunakan untuk menu Djiwa Tentram
```

Jangan menyebutnya saldo tunai bebas.

Riwayat reward:

```txt
+ Rp500 — Sticker Kopi ABC
Status: tersedia
```

Jika reward belum eligible:

```txt
Sticker belum selesai dibuat
Reward akan masuk setelah sticker berhasil.
```

### Top-up Djiwa Pay

Top-up dibuka melalui sheet pada halaman yang sama:

```txt
Profile/avatar → Djiwa Pay → Top up
→ nominal
→ create pending top-up
→ Mayar invoice
→ webhook settlement
→ kembali ke app
→ read-back saldo
```

Browser redirect tidak boleh dianggap sebagai bukti pembayaran. Saldo hanya bertambah setelah webhook/settlement server-side terverifikasi.

Untuk menghindari kebingungan, tampilkan dua bagian:

```txt
Saldo Djiwa Pay umum
Saldo Reward 500 Kopi Tasik
```

Jika keduanya dapat digunakan bersama pada order Djiwa Tentram, backend harus menentukan urutan debit dan membuat ledger terpisah.

---

## Database Schema Plan

### Existing tables yang digunakan

```txt
public.user
public.session
public.account
pos.customers
pos.customer_wallets
pos.customer_wallet_ledger
pos.customer_wallet_holds
pos.customer_wallet_topups
pos.orders
pos.order_items
```

### New table: `public.coffee_shops`

```sql
id uuid primary key
name text not null
slug text not null unique
description text
address text
area text
city text not null default 'Tasikmalaya'
latitude numeric(9,6)
longitude numeric(9,6)
verification_radius_meters integer not null default 200
hero_image_object_key text
logo_object_key text
instagram_url text
google_maps_url text
active boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Constraints:

```txt
latitude/longitude harus berpasangan jika location verification aktif
verification_radius_meters dibatasi reasonable range, misalnya 50–5000
slug unique
active untuk soft disable tanpa menghapus historical visit
```

### New table: `public.coffee_visits`

```sql
id uuid primary key default gen_random_uuid()
user_id text not null references public.user(id)
coffee_shop_id uuid not null references public.coffee_shops(id)
title text not null
description text
category text not null
original_object_key text not null
original_content_type text not null
original_size_bytes bigint not null
sticker_object_key text
sticker_content_type text
sticker_size_bytes bigint
latitude numeric(9,6)
longitude numeric(9,6)
distance_meters numeric(10,2)
location_verification_method text not null default 'gps'
location_verified boolean not null default false
generation_status text not null default 'pending'
  check (generation_status in ('pending','uploading','generating','completed','failed'))
generation_error_code text
visited_at timestamptz not null default now()
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Indexes:

```txt
(user_id, created_at desc)
(user_id, coffee_shop_id, created_at desc)
(coffee_shop_id, created_at desc)
```

### New table: `public.coffee_collections`

```sql
id uuid primary key default gen_random_uuid()
user_id text not null references public.user(id)
coffee_shop_id uuid not null references public.coffee_shops(id)
first_visit_id uuid not null references public.coffee_visits(id)
first_visited_at timestamptz not null
last_visited_at timestamptz not null
visit_count integer not null default 1
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique (user_id, coffee_shop_id)
```

### New table: `public.coffee_reward_accounts`

Dedicated reward balance, separate from general Djiwa Pay balance:

```sql
user_id text primary key references public.user(id)
currency text not null default 'IDR' check (currency = 'IDR')
available_balance bigint not null default 0 check (available_balance >= 0)
held_balance bigint not null default 0 check (held_balance >= 0)
total_credited bigint not null default 0 check (total_credited >= 0)
total_debited bigint not null default 0 check (total_debited >= 0)
rewarded_shop_count integer not null default 0 check (rewarded_shop_count between 0 and 500)
status text not null default 'active' check (status in ('active','blocked'))
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

### New table: `public.coffee_reward_ledger`

```sql
id bigserial primary key
user_id text not null references public.user(id)
amount bigint not null check (amount > 0)
direction text not null check (direction in ('credit','debit'))
balance_after bigint not null check (balance_after >= 0)
status text not null check (status in ('pending','completed','reversed','cancelled'))
transaction_type text not null check (transaction_type in (
  'sticker_reward',
  'djiwatentram_order_debit',
  'refund',
  'fraud_reversal',
  'manual_adjustment'
))
reference_type text not null
reference_id text not null
coffee_shop_id uuid references public.coffee_shops(id)
visit_id uuid references public.coffee_visits(id)
idempotency_key text not null unique
note text
created_by text
created_at timestamptz not null default now()
```

Recommended unique business guard:

```txt
unique(user_id, coffee_shop_id, transaction_type)
where transaction_type = 'sticker_reward'
```

Jika partial unique constraint tidak cocok dengan migration convention, enforce melalui a dedicated reward-claim table or RPC lock.

### New table: `public.coffee_reward_holds`

Needed if reward balance can be combined with Djiwa Pay order checkout:

```sql
hold_id text primary key
user_id text not null references public.user(id)
order_id text not null
amount bigint not null check (amount > 0)
status text not null default 'held'
  check (status in ('held','captured','released','expired'))
idempotency_key text not null unique
created_at timestamptz not null default now()
captured_at timestamptz
released_at timestamptz
expires_at timestamptz not null default (now() + interval '30 minutes')
```

### Views

#### `public.coffee_shop_collection_view`

Read model for app:

```txt
coffee shop fields
+ current user collection status
+ visit_count
+ last_visited_at
```

#### `public.coffee_gallery_view`

Read model for authenticated user:

```txt
visit fields
+ coffee shop name/area
+ sticker URL or signed media URL
+ reward status
```

#### `public.coffee_reward_summary_view`

```txt
user_id
available_reward_balance
held_reward_balance
rewarded_shop_count
max_rewarded_shop_count
max_reward_amount
```

Jangan expose other users' visits, reward balances, or private object keys.

### RPCs / server endpoints

Prefer server-side Edge Function or Better Auth-backed Hono endpoint for writes.

Required operations:

```txt
GET  /api/500kopitasik/coffee-shops
GET  /api/500kopitasik/gallery
GET  /api/500kopitasik/collection
GET  /api/500kopitasik/rewards
POST /api/500kopitasik/visits/create
POST /api/500kopitasik/visits/{id}/generate-sticker
POST /api/500kopitasik/visits/{id}/retry-sticker
POST /api/500kopitasik/rewards/claim
POST /api/500kopitasik/rewards/hold
POST /api/500kopitasik/rewards/capture
POST /api/500kopitasik/rewards/release
```

The `claim` operation must be atomic:

```txt
lock user reward account
lock/check unique user + coffee shop reward claim
check visit ownership/status/location
check sticker completed
check count < 500
insert ledger credit Rp500
increment account balance and rewarded_shop_count
commit
```

The browser must never directly update `available_balance` or `rewarded_shop_count`.

---

## Djiwa Tentram Order Restriction

Requirement:

```txt
Reward hanya digunakan untuk produk/menu Djiwa Tentram di djiwatentram.web.id
```

Enforcement must happen server-side at checkout, not only by hiding a button.

### Order eligibility

Reward hold/capture is allowed only if:

```txt
order customer belongs to Better Auth customer session
order storefront/brand = djiwatentram
order source/domain = djiwatentram.web.id
order contains valid Djiwa Tentram menu/product scope
order total is positive
```

Reject reward use for:

```txt
merchandise.djiwatentram.web.id
b2b.djiwatentram.web.id
ordermieyamin.djiwatentram.web.id
admin/POS manual orders
cash withdrawal
customer-to-customer transfer
```

### Combined payment

If reward and general Djiwa Pay can combine:

```txt
validate Djiwa Tentram order
→ hold reward portion
→ hold general wallet portion
→ settle order atomically
→ capture both holds after authoritative order settlement
→ release both on cancellation/failure
```

The hold idempotency key must include:

```txt
user + order + payment source + request id
```

### Product scope

Do not infer Djiwa Tentram products from names. Use the canonical existing brand/business-unit/category scope and verify the order writer and POS/Admin read paths preserve it.

---

## AI Sticker Architecture

### Separation

React component must not call provider API directly.

```txt
Browser
→ authenticated visit endpoint
→ upload original to scoped R2 object path
→ save visit generation_status=pending/uploading
→ server triggers sticker generation
→ AI provider
→ validate output PNG + alpha channel
→ save sticker to separate R2 path
→ update visit completed
→ claim reward atomically
```

### Provider abstraction

Conceptual interface:

```ts
type GenerateVisitStickerInput = {
  visitId: string;
  originalObjectKey: string;
  category: PhotoCategory;
  subjectContext: string;
};

interface StickerGenerationProvider {
  generate(input: GenerateVisitStickerInput): Promise<{
    objectBytes: Uint8Array;
    contentType: 'image/png';
  }>;
}
```

Provider key remains server-side in Edge Function/worker environment.

### Prompt

Use the supplied BASE STICKER PROMPT as a versioned server-side template, with category/subject context appended safely. Never send unnecessary user PII or raw location metadata to AI provider.

### Output validation

Before marking completed:

```txt
MIME = image/png
square 1:1
valid PNG signature
alpha channel present
no oversized output
object stored under sticker prefix
```

If alpha validation cannot be guaranteed by the provider, preserve the result as failed/needs review rather than falsely presenting a transparent sticker.

---

## Storage Plan

Recommended scoped object keys:

```txt
500kopitasik/originals/{userId}/{visitId}/original.{ext}
500kopitasik/stickers/{userId}/{visitId}/sticker.png
500kopitasik/thumbs/{userId}/{visitId}/thumb.webp
```

Requirements:

- original and sticker are separate objects;
- object key is not accepted blindly from client;
- backend derives userId and visitId;
- enforce MIME, size, and image dimensions;
- strip EXIF/location metadata from public derivatives;
- use signed URLs or authenticated proxy for private original photos;
- generated sticker may be public/shareable only after explicit product decision;
- deleting a visit must not leave uncontrolled orphan objects.

Do not use the existing public `app-assets` bucket for private visit originals without a new scoped policy.

---

## File Scope Likely to Change During Implementation

### New app

```txt
apps/500kopitasik/package.json
apps/500kopitasik/vite.config.ts
apps/500kopitasik/tsconfig.json
apps/500kopitasik/index.html
apps/500kopitasik/src/main.tsx
apps/500kopitasik/src/App.tsx
apps/500kopitasik/src/index.css
apps/500kopitasik/src/components/*
apps/500kopitasik/src/features/coffee-shops/*
apps/500kopitasik/src/features/visits/*
apps/500kopitasik/src/features/collection/*
apps/500kopitasik/src/features/rewards/*
apps/500kopitasik/src/features/auth/*
apps/500kopitasik/src/features/sticker-generation/*
apps/500kopitasik/src/lib/*
apps/500kopitasik/README.md
apps/500kopitasik/.env.example
```

### Shared/auth integration, only if required

```txt
apps/auth-server/src/auth.ts
apps/auth-server/src/index.ts
apps/auth-server/better-auth.service
apps/auth-server/nginx-customer.conf
apps/customer/src/lib/auth-client.ts  # only if shared auth helper is extracted safely
```

The domain entry must be additive and backward-compatible.

### Backend/database

```txt
supabase/migrations/<timestamp>_500kopitasik_foundation.sql
supabase/migrations/<timestamp>_500kopitasik_rewards.sql
supabase/functions/500kopitasik-visits/index.ts
supabase/functions/500kopitasik-sticker/index.ts
supabase/functions/500kopitasik-rewards/index.ts
supabase/functions/customer-wallet/index.ts  # only narrowly scoped extension
```

If existing Hono customer API is the safer boundary, use:

```txt
apps/auth-server/src/index.ts
apps/auth-server/src/500kopitasik-api.ts
```

Do not duplicate wallet settlement logic across Edge Function and Hono.

### Worker/media

```txt
workers/500kopitasik-media/wrangler.toml
workers/500kopitasik-media/src/index.ts
```

Only create a separate Worker if the existing community Worker cannot safely support a distinct bucket/prefix and auth boundary.

### Build/deploy registry

```txt
root package.json
scripts/update-version.mjs
scripts/write-version-manifest.mjs
scripts/deploy-vps.sh
PROJECT.md
```

Changes must add the new app only. Do not alter existing app deployment mappings.

---

## Implementation Waves

### Wave 0 — Discovery and contract lock

- verify current Better Auth live config and Google callback behavior;
- verify final domain/subdomain choice;
- inspect existing brand/store order scope;
- inspect current wallet checkout RPC and Djiwa Tentram order payload;
- decide reward expiry, combined payment, and refund policy;
- decide R2 Worker boundary;
- record dirty git status and preserve unrelated changes.

### Wave 1 — Database foundation

- additive coffee shop/visit/collection tables;
- reward account/ledger/hold tables;
- indexes, constraints, RLS/service-role boundary;
- idempotent reward claim RPC;
- small development seed only;
- no production 500 fake records.

### Wave 2 — Auth and app shell

- new app package/build/PWA identity;
- Better Auth client with central base URL;
- Google login sheet;
- callback return-to-current-page behavior;
- login gate before sticker flow;
- protected API ownership checks.

### Wave 3 — Read experience

- Gallery default;
- Explore/search/filter;
- Collection/progress;
- coffee shop detail sheet;
- Profile/Djiwa Pay sheet;
- loading/empty/error states.

### Wave 4 — Visit flow

- photo capture/upload;
- compression/orientation handling;
- category/title/description;
- location verification;
- confirmation screen;
- durable visit state.

### Wave 5 — Sticker and reward

- server-side AI provider abstraction;
- generation state and retry;
- PNG/alpha validation;
- separate sticker storage;
- atomic reward claim;
- reward ledger/history;
- max 500 cap.

### Wave 6 — Djiwa Pay restriction

- reward balance read;
- Djiwa Tentram-only order eligibility;
- reward hold/capture/release;
- combine with general wallet only if approved;
- block other storefronts at backend;
- read-back settlement/reversal evidence.

### Wave 7 — Release verification

- typecheck/lint/build new app;
- database/RPC tests;
- auth Google smoke test;
- mobile browser smoke test;
- reward duplicate/cap tests;
- payment restriction tests;
- deploy only after separate approval;
- verify domain, bundle, auth callback, storage, API, and existing domains.

---

## Test and Verification Plan

### Frontend

```txt
bun run --filter @yumipos/500kopitasik check-types
bun run --filter @yumipos/500kopitasik build
git diff --check -- apps/500kopitasik
```

If lint exists for the app, run it. Existing customer/POS/admin builds must be run if shared package/auth files change.

### Auth

Verify:

- guest can browse;
- sticker CTA opens AuthSheet;
- Google OAuth callback returns to the same main page;
- session cookie is present and recognized;
- existing email account links safely to Google only for the same email;
- cross-domain cookie does not leak to unrelated domains;
- employee/Yumi account cannot claim customer reward without valid customer session.

### Reward invariants

Test transactionally:

```txt
first verified completed sticker → exactly +Rp500
same visit retry → no duplicate
same coffee shop second visit → gallery row yes, reward no
501st unique shop attempt → no credit
AI failure → visit remains, reward absent
fraud reversal → ledger reversal, no direct balance overwrite
concurrent claim requests → one credit only
```

### Wallet restriction

Test:

```txt
Djiwa Tentram order → reward hold allowed
Merchandise order → reward rejected
B2B order → reward rejected
OrderMieYamin order → reward rejected
wrong brand field with Djiwa domain → rejected
wrong domain with Djiwa brand field → rejected
cancelled order → hold released
settled order → hold captured once
retry same request → idempotent
```

### Top-up

Verify existing lifecycle remains:

```txt
pending top-up → no balance credit
verified Mayar webhook → one credit
duplicate webhook → no second credit
browser return without webhook → still pending
```

### Storage

Verify:

- original and sticker object keys differ;
- original is not publicly enumerable;
- user cannot read another user's private original;
- failed generation does not delete original;
- retry does not create uncontrolled duplicate reward;
- object deletion/reversal behavior is auditable.

### Production acceptance

After explicit deployment approval:

```txt
index.html → hashed JS/CSS → domain
Google callback URL
Better Auth session
coffee shop read API
visit create API
sticker generation status
reward balance
Djiwa Tentram reward checkout
existing customer/POS/admin domains
```

Use actual browser/API/database response evidence. Do not claim production success from local build alone.

---

## Security and Financial Risks

### Critical

- Reward duplication from concurrent requests.
- Reward balance exposed to or debited by another storefront.
- Browser-controlled `user_id`, amount, or order scope.
- AI provider key exposed in Vite bundle.
- Public access to original photos containing faces/location.
- Reward issued before visit/sticker validity is authoritative.

### High

- Google OAuth trusted origin misconfiguration.
- Cookie scope causing login loop or session leakage.
- Reward account and general wallet balance mixed without auditability.
- Refund/cancel path failing to release holds.
- Fake location data accepted as verified proof.
- 500 sample seed accidentally reaching production.

### Mitigations

- server session identity only;
- database locks and unique idempotency;
- dedicated reward ledger/account;
- server-side Djiwa Tentram order boundary;
- private media by default;
- original visit retained on AI failure;
- additive migrations and rollback/reversal RPCs;
- explicit domain and callback verification;
- deterministic business rules in DB/RPC;
- no direct client balance mutation.

---

## No-hardcode Audit

### Must come from DB/config

```txt
coffee shop catalog
coordinates
verification radius
active status
reward amount
reward cap
reward expiry
Djiwa Tentram brand/store identifier
allowed product/menu scope
wallet payment policy
AI provider/model/prompt version
storage bucket/prefix
final app domain
```

### Allowed static UI constants

```txt
labels
empty-state copy
category labels
achievement display names
layout breakpoints
```

### Temporary development-only data

Only explicit development seed records are allowed:

```txt
Kopi Sample 01...
```

They must be marked development-only and excluded from production seed/deploy path.

---

## Open Questions Before Implementation

1. Apa domain final aplikasi: `500kopitasik.djiwatentram.web.id`, domain lain, atau hanya path sementara?
2. Apakah reward Rp500 langsung diberikan setelah AI sticker `completed`, atau setelah moderator/visit validation tambahan?
3. Apakah reward memiliki expiry?
4. Apakah reward dapat digabung dengan saldo Djiwa Pay umum dalam satu transaksi Djiwa Tentram?
5. Jika order dibatalkan/refund, apakah reward dikembalikan ke saldo reward?
6. Apakah user wajib location verified untuk menerima reward, atau foto + sticker cukup untuk MVP?
7. Apakah foto/story dapat dilihat publik oleh user lain, atau private sampai user memilih share?
8. Provider AI image mana yang akan dipakai untuk menghasilkan PNG transparency—9Router/SumoPod, provider lain, atau endpoint baru?
9. Apakah user harus login Google saja, atau email/password existing Better Auth tetap ditampilkan sebagai opsi sekunder?
10. Apakah reward dibatasi satu kali seumur hidup per coffee shop, termasuk jika coffee shop dinonaktifkan lalu dibuat ulang?

---

## UI/UX Design Contract — iOS / Mobile App / Apple Style

### Design authority

Saat implementasi, UI wajib mengikuti dua sumber berikut:

```txt
Apple Human Interface Guidelines
https://developer.apple.com/design/human-interface-guidelines/

AI Product Design DNA v2.0
frontend-design/ai-product-design-dna/SKILL.md
frontend-design/ui-ux-design-standard/SKILL.md
```

Buat design contract formal sebelum komponen utama dikembangkan:

```txt
apps/500kopitasik/DESIGN.md
```

`DESIGN.md` harus mengikuti format Google DESIGN.md: YAML front matter untuk token normatif dan Markdown untuk rationale/pedoman penggunaan. File ini menjadi sumber visual app, bukan sekadar dokumentasi.

### Product feel

500 Kopi Tasik harus terasa seperti:

```txt
native iOS app
coffee passport modern
Apple Wallet + photo journal
calm, premium, personal, collectible
```

Bukan seperti:

```txt
admin dashboard
corporate SaaS
generic Bootstrap
AI control panel
grid kartu yang seragam dan kaku
```

Nuansa playful/scrapbook tetap boleh karena merupakan inti produk, tetapi harus dikendalikan oleh hierarchy dan usability Apple-style. Ornamen tidak boleh mengalahkan foto, cerita, CTA, atau progress.

### App shell

Mobile-first contract:

```txt
mobile shell : 390–430px centered pada desktop
narrow phone : full-width dengan gutter 16–20px
page         : overflow-x-hidden
card         : 24px radius
control      : 14px radius
button       : minimum 44px tinggi
section gap  : 24–32px
```

Gunakan safe area:

```css
padding-top: env(safe-area-inset-top)
padding-bottom: env(safe-area-inset-bottom)
```

Fixed bottom navigation dan floating CTA tidak boleh menutupi gallery atau sheet. Konten harus diberi bottom padding berdasarkan tinggi nav + safe area.

Pada desktop:

- jangan melebar menjadi dashboard 1200px penuh;
- gunakan centered app window/workspace;
- pertahankan hierarchy mobile;
- pada breakpoint sekitar 900px boleh memakai layout dua kolom atau sidebar ringan;
- jangan mengubahnya menjadi enterprise dashboard.

### Color and visual tokens

Default light theme:

```yaml
colors:
  primary: "#17181A"       # ink/text utama
  secondary: "#6B7280"     # supporting text
  accent: "#2563EB"        # satu brand/action accent
  surface: "#FFFFFF"
  surfaceMuted: "#F4F4F5"
  canvas: "#FAFAFA"
  border: "#E5E7EB"
  success: "#16803C"
  warning: "#B45309"
  destructive: "#C2413A"
```

Nilai warna final harus divalidasi WCAG AA pada `DESIGN.md`. Jangan menggunakan banyak warna accent, gradient besar, atau background penuh warna. Foto dan sticker menjadi sumber visual utama; UI memakai warna tenang dan satu accent untuk action/selection.

### Typography

Gunakan dua peran font agar terasa seperti shipped app, bukan template:

```txt
Display/heading : Plus Jakarta Sans, 30–48px, weight 700/800
Section         : Plus Jakarta Sans, 17–22px, weight 700/800
Body            : Inter/Geist, 14–15px, weight 400/500
Caption         : Inter/Geist, 11–12px, weight 500/600
```

Jangan memakai font baru/dependency baru bila font existing sudah mencukupi. Jangan memakai caption di bawah 11px. User-facing label harus tetap terbaca di layar 390px.

### Navigation and hierarchy

Main page hierarchy:

```txt
App header
├── progress + reward summary
├── primary Collect Stamp CTA
├── segmented tabs: Gallery / Explore / Collection
├── active content
└── safe-area-aware bottom navigation or floating action
```

- Gallery tetap default/main experience.
- Tab aktif memakai pill/accent yang jelas, bukan underline kecil yang sulit disentuh.
- Setiap area hanya memiliki satu primary action.
- Semua navigation item minimal 44px touch target.
- Jangan membuat route baru untuk profile, detail shop, gallery, collection, atau visit composer.

### iOS sheet and modal contract

Entity detail dan flow step menggunakan iOS-style sheet:

```txt
tap coffee shop card
→ sheet slides up on mobile
→ centered modal on desktop bila sesuai
```

Rules:

- spring/easing: `cubic-bezier(.32,.72,0,1)`;
- transition normal sekitar 320ms;
- micro interaction sekitar 180ms;
- sheet maksimal sekitar 90dvh;
- surface opaque/readable;
- drag handle dan close action yang jelas;
- focus management dan Escape/keyboard support;
- `z-[2000]` untuk sheet/fullscreen overlay agar berada di atas fixed nav;
- bottom padding menghormati safe area;
- respect `prefers-reduced-motion` dan `prefers-reduced-transparency`.

Jangan memakai sheet yang menutupi CTA tanpa menyediakan action yang sama di dalam sheet.

### Gallery and sticker presentation

Gallery harus terasa seperti visual diary:

- masonry/varied grid boleh digunakan jika tidak mengorbankan scanning;
- original photo adalah aset primer;
- sticker PNG transparan ditempel dengan overlap halus;
- gunakan rotation kecil dan white die-cut border, bukan shadow berat;
- metadata ditata singkat di bawah foto;
- hindari card dashboard seragam dengan terlalu banyak badge.

Sticker detail membuka fullscreen/sheet dengan satu CTA utama: `Lihat di Gallery` atau `Download Sticker`, bukan banyak tombol yang bersaing.

### Visit composer and progress

Gunakan compact progress indicator, bukan slider panjang:

```txt
Langkah 1 dari 5
●────○────○────○────○
Coffee Shop
```

- completed stage memakai checkmark;
- active stage memakai ring/accent;
- future stage muted;
- full label hanya untuk active step bila ruang sempit;
- seluruh marker dan label berada pada kolom yang sama;
- tidak ada horizontal overflow pada 320–390px.

Flow tetap:

```txt
Coffee Shop → Photo → Story → Location → Confirm → Generate → Success
```

Saat AI berjalan, gunakan skeleton/progress narrative yang jujur—jangan fake percentage jika provider tidak memberikan progress.

### Reward and Djiwa Pay presentation

Saldo reward ditampilkan sebagai Apple Wallet-style card tetapi tetap menjelaskan batasnya:

```txt
Saldo Reward Djiwa Pay
Rp500
Khusus menu Djiwa Tentram
```

Gunakan satu dominant number, supporting label, dan satu action `Gunakan di Djiwa Tentram`. Jangan membuat reward terlihat seperti uang tunai yang dapat dicairkan.

Top-up umum dan reward harus dibedakan secara visual:

```txt
Saldo Djiwa Pay umum
Saldo Reward 500 Kopi Tasik
```

### Required UX states

Setiap feature wajib memiliki tujuh state AI Product Design DNA:

```txt
Loading      : skeleton shimmer
Skeleton     : shape sesuai konten, bukan blank spinner
Empty        : illustration + headline + explanation + CTA
Success      : overlay/modal celebration yang singkat
Error        : inline message + retry
Toast        : bottom-center, 3–4 detik, tidak untuk semua aksi
Confirmation : modal untuk delete, reversal, atau action berisiko
```

Semua state harus punya accessible text dan tidak bergantung pada warna saja.

### Icons, assets, and motion

- Gunakan satu keluarga icon line 2px yang konsisten, seperti Lucide.
- Emoji bukan icon final UI.
- Asset custom dibuat sebagai asset terpisah, tidak ditempel sebagai screenshot/background UI.
- Jika membutuhkan illustration/icon custom, gunakan image generation workflow sesuai AI Product Design DNA, review dengan vision, optimalkan ukuran, lalu beri alt/`aria-hidden` yang benar.
- Motion hanya boleh menjelaskan navigation, focus, progress, sticker appearance, atau success.
- Gunakan `active:scale-[.97]` pada tombol touch dengan durasi 180ms.
- Tidak ada confetti/loop animation berlebihan.

### Accessibility and responsive QA

Wajib diverifikasi pada:

```txt
320px, 375px, 390px, 430px, tablet, desktop 1024px+
```

Checklist:

- no horizontal overflow;
- no clipped title/label;
- all controls >=44px;
- visible focus ring;
- keyboard sheet close/navigation;
- screen reader labels;
- image alt text;
- contrast WCAG AA;
- reduced motion;
- safe area iOS Safari;
- fixed nav tidak menutup konten;
- sheet berada di atas nav;
- loading/error/empty/success dapat dipahami tanpa visual saja.

### DESIGN.md validation gate

Sebelum implementation dianggap siap:

```bash
npx -y @google/design.md lint apps/500kopitasik/DESIGN.md
```

Jika DESIGN.md dibuat saat implementation, validasi harus melewati:

- token references tidak broken;
- primary color tersedia;
- typography tersedia;
- section order sesuai spec;
- contrast warning ditinjau;
- component variants tidak nested;
- token export tidak mengubah shared theme app lain.

## Existing 3D Asset Reuse Contract

### Audit hasil discovery

Monorepo sudah memiliki asset visual 3D/3D-style yang dapat dipertimbangkan untuk reuse:

```txt
packages/yumipos-web-shared/src/components/ui/djiwa-3d-icon.tsx
packages/yumipos-web-shared/src/assets/djiwa-icons-v2/

apps/customer/public/assets/djiwa-pay-abstract-3d.png
apps/customer/public/assets/djiwa-3d-topup.png
apps/customer/public/assets/djiwa-3d-history.png
apps/customer/public/assets/djiwa-3d-help.png
apps/customer/public/receipt-actions/payment-proof-3d.png
apps/customer/public/receipt-actions/split-bill-3d.png
```

Asset serupa juga tersedia di `apps/merchandise` dan `apps/b2b`, tetapi jangan menganggap semua asset sibling otomatis cocok untuk 500 Kopi Tasik. Setiap asset harus dicek visual role, ukuran, crop, background, dan brand context sebelum dipakai.

### Reuse priority

Gunakan asset existing terlebih dahulu jika memenuhi semua syarat:

1. visualnya relevan dengan fungsi yang ditampilkan;
2. tidak membawa teks/logo yang salah atau stale;
3. tidak mengubah 500 Kopi Tasik menjadi aplikasi finance;
4. resolusi, transparency, dan crop sesuai viewport mobile;
5. lisensi/ownership internal project jelas;
6. asset tidak membutuhkan dependency baru;
7. asset tidak menambah bundle secara berlebihan.

Prioritas reuse:

```txt
Djiwa Pay reward/top-up card
→ djiwa-pay-abstract-3d.png atau asset wallet 3D yang lolos review

Top-up sheet
→ djiwa-3d-topup.png

Reward history sheet
→ djiwa-3d-history.png

Help/location permission state
→ djiwa-3d-help.png bila konteksnya sesuai

General navigation/service icon
→ djiwa-3d-icon.tsx atau djiwa-icons-v2 setelah audit

Coffee passport, coffee shop, sticker, achievement
→ gunakan asset/illustration khusus coffee passport; jangan memaksakan asset Djiwa Pay
```

### Visual boundary

Asset 3D dipakai sebagai **supporting visual layer**, bukan sebagai sumber data atau pengganti HTML:

- saldo, nama user, reward amount, status, dan batas penggunaan selalu dirender sebagai HTML live;
- jangan menyimpan nominal/status di dalam image;
- jangan menggunakan asset 3D sebagai background penuh pada setiap section;
- maksimal satu dominant visual per card/sheet;
- jangan menumpuk 3D image, glass effect, gradient, shadow, dan confetti sekaligus;
- tetap gunakan light Apple-style surface, whitespace, dan satu accent;
- decorative 3D asset diberi `aria-hidden="true"`, asset informatif memiliki alt text.

Asset 3D tidak boleh mengganggu core coffee identity:

```txt
Coffee passport/photo diary = visual identity utama
Djiwa Pay 3D asset           = supporting visual untuk saldo/top-up/reward
```

### Technical reuse rules

- Prefer import dari shared package atau referensi asset existing melalui app asset pipeline.
- Jika Vite/PWA membutuhkan asset lokal app, lakukan copy asset secara eksplisit hanya setelah audit ukuran/hash dan catat source path-nya di `DESIGN.md`/README.
- Jangan membuat duplicate asset dengan nama generik seperti `icon.png`.
- Jangan memindahkan atau menghapus asset existing.
- Jangan mengubah shared `djiwa-3d-icon.tsx` hanya untuk kebutuhan app baru kecuali perubahan backward-compatible dan seluruh consumer dibuild.
- Jangan memperkenalkan Three.js, model `.glb`, atau renderer 3D baru hanya karena istilah “3D”; existing PNG/WebP 3D-style sudah menjadi pilihan pertama.
- Jika asset existing tidak cocok, gunakan Lucide line icon atau temporary neutral CSS placeholder sampai asset khusus disetujui; jangan mengklaim asset final tanpa visual review.

### Design.md asset registry

`apps/500kopitasik/DESIGN.md` harus memiliki registry asset:

```txt
asset source
visual role
light/dark/background assumptions
aspect ratio
max rendered size
alt/aria behavior
fallback
```

Contoh entry:

```yaml
assets:
  djiwaPayReward:
    source: shared-or-existing-app-asset
    role: supporting-wallet-visual
    decorative: true
    fallback: html-only-wallet-card
```

`DESIGN.md` harus menyatakan bahwa asset 3D boleh direuse **jika memungkinkan**, tetapi coffee passport visual hierarchy tetap lebih tinggi daripada branding finance.

### Visual verification gate

Setiap asset 3D yang dipakai harus diverifikasi:

```txt
render pada 320px, 390px, 430px, desktop
cek tidak blur/cropped
cek tidak menutupi live text
cek transparency/background
cek alt/aria
cek bundle size
cek fallback jika asset gagal load
```

Gunakan vision/screenshot review saat implementation. Jika asset berisi typography, logo, atau nominal yang tidak dapat diperbarui, jangan gunakan untuk live data card—pakai HTML/CSS card dengan asset hanya sebagai dekorasi.

## Hosting, Subdomain, SEO, Favicon, dan Logo

### Target deployment

Aplikasi akan memakai subdomain resmi:

```txt
https://500kopitasik.djiwatentram.web.id
```

Target hosting:

```txt
DNS        Hostinger DNS via Hostinger CLI
Web server VPS ini
Frontend   static Vite SPA melalui Nginx
Webroot    /var/www/500kopitasik.djiwatentram.web.id/
SSL        Let's Encrypt / Certbot
```

Tidak memakai Vercel atau Cloudflare Pages untuk frontend ini.

### Hostinger CLI provisioning sequence

Provisioning hanya dilakukan setelah app berhasil build dan ada approval deployment terpisah. Urutan wajib:

```txt
1. hostinger version
2. cek autentikasi CLI tanpa menampilkan token
3. list DNS djiwatentram.web.id
4. cek apakah 500kopitasik sudah punya A/CNAME record
5. validate A record ke IP VPS
6. apply dengan overwrite=false
7. read-back record Hostinger
8. cek authoritative DNS
9. cek public resolver 1.1.1.1 dan 8.8.8.8
```

Command pattern yang direncanakan:

```bash
hostinger dns records list djiwatentram.web.id --format json
hostinger dns records validate djiwatentram.web.id \\
  --zone '[{"name":"500kopitasik","type":"A","records":[{"content":"<VPS_IP>"}],"ttl":300}]'
hostinger dns records update djiwatentram.web.id \\
  --zone '[{"name":"500kopitasik","type":"A","records":[{"content":"<VPS_IP>"}],"ttl":300}]' \\
  --overwrite=false
hostinger dns records list djiwatentram.web.id --format json
```

Rules:

- jangan menampilkan API token Hostinger di output/plan/log;
- jangan menulis token ke repository;
- jangan memakai `overwrite=true` karena dapat mengganti seluruh zone;
- jika sudah ada CNAME, jangan menambahkan A sebelum record lama dianalisis dan dihapus melalui approval terpisah;
- jangan mengubah record domain lain;
- gunakan `$HOME` profile yang benar untuk config Hostinger CLI;
- simpan credential di environment/runtime secret store, bukan source.

### VPS static SPA deployment

Aplikasi ini direncanakan sebagai pure static SPA, bukan Node/PM2 backend:

```txt
bun install/build target app saja
→ apps/500kopitasik/dist
→ staging artifact
→ /var/www/500kopitasik.djiwatentram.web.id/
→ Nginx SPA fallback
→ HTTPS
```

Nginx block harus additive:

```nginx
server {
    server_name 500kopitasik.djiwatentram.web.id;
    root /var/www/500kopitasik.djiwatentram.web.id;
    index index.html;

    client_max_body_size 15m;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location = /version.json {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

Provisioning sequence:

```txt
1. build/typecheck app baru saja
2. verifikasi dist/index.html, assets, manifest, favicon, logo
3. buat webroot baru, tidak mengganti webroot existing
4. copy artifact dengan mapping source/target yang eksplisit
5. set permission readable oleh nginx
6. tulis HTTP-only Nginx block
7. nginx -t
8. reload Nginx
9. certbot untuk 500kopitasik.djiwatentram.web.id
10. nginx -t + reload bila diperlukan
11. verifikasi HTTPS dengan --resolve dan public DNS
```

Karena VPS memiliki auto-sync/deploy periodik, perubahan permanen harus melalui:

```txt
source di repo
→ selective git add hanya file terkait
→ commit
→ push main
→ auto-deploy atau trigger terkontrol
→ read-back webroot/domain
```

Jangan mengandalkan copy manual yang akan hilang setelah cron sync. Jangan menjalankan `deploy-vps.sh all`; deploy hanya target `500kopitasik` setelah selector baru direncanakan dan diverifikasi.

### Rollback

Rollback harus berupa artifact sebelumnya atau disable vhost baru:

```txt
simpan manifest/hash artifact
→ restore webroot 500kopitasik sebelumnya
→ nginx -t
→ reload
```

Jangan menghapus atau mengubah webroot domain existing. DNS rollback hanya dilakukan bila record baru salah dan setelah read-back.

### SEO title dan description

Default metadata yang direncanakan:

```html
<title>500 Kopi Tasik — Coffee Passport Tasikmalaya</title>
<meta name="description" content="Jelajahi dan kumpulkan 500 coffee shop di Tasikmalaya. Foto kunjunganmu, buat sticker, simpan cerita, dan raih reward Djiwa Pay untuk menu Djiwa Tentram." />
<meta name="application-name" content="500 Kopi Tasik" />
<meta name="theme-color" content="#FAFAFA" />
<link rel="canonical" href="https://500kopitasik.djiwatentram.web.id/" />
```

Open Graph/Twitter metadata:

```html
<meta property="og:type" content="website" />
<meta property="og:site_name" content="500 Kopi Tasik" />
<meta property="og:title" content="500 Kopi Tasik — Coffee Passport Tasikmalaya" />
<meta property="og:description" content="Datang, foto, ceritakan, jadikan sticker, dan kumpulkan 500 coffee shop Tasikmalaya." />
<meta property="og:url" content="https://500kopitasik.djiwatentram.web.id/" />
<meta property="og:image" content="https://500kopitasik.djiwatentram.web.id/og-cover.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="500 Kopi Tasik — Coffee Passport Tasikmalaya" />
<meta name="twitter:description" content="Visual coffee diary untuk menjelajahi 500 coffee shop di Tasikmalaya." />
<meta name="twitter:image" content="https://500kopitasik.djiwatentram.web.id/og-cover.png" />
```

SEO copy harus tetap jujur:

- jangan mengklaim sudah memiliki 500 coffee shop jika production catalog belum berisi 500;
- jangan mengklaim reward otomatis sebelum eligibility/settlement selesai;
- jangan memasukkan API key atau private endpoint ke metadata;
- gunakan Bahasa Indonesia yang ringkas dan local-friendly.

### OpenAI image generation — favicon dan logo

Favicon dan logo akan dibuat sebagai asset terpisah menggunakan tool OpenAI image generation/Codex saat implementation, bukan dibuat dari screenshot atau emoji.

Asset target:

```txt
apps/500kopitasik/public/favicon-32.png
apps/500kopitasik/public/favicon-192.png
apps/500kopitasik/public/apple-touch-icon.png
apps/500kopitasik/public/logo-500kopitasik.png
apps/500kopitasik/public/og-cover.png
```

Creative brief:

```txt
brand: 500 Kopi Tasik
subject: coffee passport + collectible stamp + Tasik coffee culture
style: premium minimal iOS app, clean 3D/illustrated mark, friendly local coffee identity
palette: restrained ink + warm coffee accent + light neutral background
composition: recognizable at 32px favicon and 192px app icon
background: transparent for favicon/logo; no unnecessary background scene
text: no small baked-in text, no malformed typography, no watermark
```

Aturan asset:

- favicon harus terbaca pada 16–32px;
- logo utama boleh memiliki mark tanpa teks agar tidak rusak saat diperkecil;
- nama `500 Kopi Tasik` dirender sebagai HTML text/wordmark untuk accessibility dan SEO;
- jangan menaruh nominal reward, URL, atau status live di dalam image;
- gunakan existing 3D asset hanya untuk supporting Djiwa Pay surfaces, bukan menggantikan logo 500 Kopi Tasik;
- generate icon family secara konsisten jika membutuhkan favicon, app icon, dan social cover;
- review output dengan vision sebelum diterima;
- regenerate bila crop, transparency, logo shape, atau detail kecil tidak sesuai;
- optimize PNG/WebP setelah review tanpa menghilangkan alpha channel;
- record prompt, output dimensions, asset role, and final hash in implementation notes.

### Image generation verification

Sebelum asset dipasang:

```txt
1. inspect generated image visually
2. cek alpha/transparency dengan image tooling
3. cek favicon pada 16px, 32px, 180px, 192px
4. cek logo pada light surface dan muted surface
5. cek OG cover crop pada social preview ratio
6. cek tidak ada text/logo hallucination
7. cek file size dan bundle impact
8. cek alt/aria semantics
```

Jika OpenAI image tool/provider tidak tersedia saat implementation, jangan mengklaim favicon/logo final. Gunakan temporary neutral placeholder hanya setelah approval, lalu tandai sebagai blocker sebelum release.

## Bid Rank Kedai — Paid Leaderboard Tanpa Periode Campaign

### Product understanding dari referensi outbid.lol

Bid Rank bukan campaign dengan `start_at`/`end_at` dan bukan pembelian slot tetap. Modelnya adalah **self-service paid leaderboard**:

- kedai memasukkan URL/profil kedai dan memilih kategori/area yang relevan;
- kedai membayar nominal untuk masuk atau naik di leaderboard;
- ranking aktif diurutkan dari nominal bid efektif tertinggi ke terendah;
- untuk mengambil posisi #1, sistem menampilkan harga dinamis: `bid tertinggi saat ini + minimum increment`;
- bid kecil tetap dapat masuk ranking bawah;
- setelah pembayaran terverifikasi, kedai langsung memperoleh posisi berdasarkan bid;
- kedai dapat melakukan outbid lagi kapan pun tanpa batas periode campaign;
- **All-time** dan **Today** adalah filter ranking/activity, bukan masa aktif campaign;
- ranking dan nominal bid bersifat transparan untuk publik;
- `clicks`, `see details`, `Today's top ranking`, dan `Latest activity` adalah bagian dari discovery/social proof;
- activity menyimpan perpindahan posisi, nominal pembayaran, dan waktu relatif.

### Temuan TinyFish yang terverifikasi dari halaman publik

Run read-only TinyFish: `72a2898b-4af5-472c-8dcb-79f1aa830113`.

- Header menampilkan `53 online` dan `1,519,804 visitors since launch`.
- Navigasi publik: `Daily`, `Categories`, `About`, `Rules`.
- CTA utama: `Claim #1 for $[Amount]`.
- Board memiliki `All-time` dan `Today`.
- All-time melacak total lifetime spend listing dan tidak pernah expire.
- Today memakai rolling 24-hour window.
- Daily memakai UTC calendar day, midnight-to-midnight.
- Listing baru minimum `$10`, maksimum `$999,999`.
- Merebut #1 membutuhkan minimal `$5` di atas #1 saat ini.
- Existing listing dapat dinaikkan dengan membayar selisih, dengan minimum kenaikan `$1`.
- Jika nominal sama, listing yang lebih lama mendapat ranking lebih tinggi (seniority tie-breaker).
- Ranking ditetapkan saat payment confirmation berdasarkan keadaan board terkini; bukan saat form dibuat.
- Claim membutuhkan product URL/@handle, category, dan amount; amount dapat diubah melalui numeric input atau tombol `+/-`.
- Click count ditampilkan publik per listing.
- Latest Activity menampilkan perpindahan ranking, listing, dan nominal pembayaran.
- Referensi memakai Dodo Payments; detail kartu tidak disimpan oleh platform.
- Semua pembayaran bersifat final dan non-refundable.
- Halaman About yang terbaca melaporkan `$257,805 revenue` dan `2,832 listed products` pada saat observasi; angka ini bukan data yang boleh di-hardcode ke 500 Kopi.

### Audit gap terhadap implementasi 500 Kopi saat ini

Temuan run TinyFish kedua: `bf7607ae-cf13-4e2e-b5bc-a82baa279f7b`.

Fitur referensi yang **belum lengkap di 500 Kopi saat ini** dan wajib masuk queue:

- board `Daily` terpisah dari `Today` dan `All-time`;
- category directory/filter yang bersumber dari konfigurasi/data official;
- search listing;
- detail page kedai dengan overall rank, category rank, rank Today, bid hari ini, deskripsi, CTA visit, dan copy link;
- pagination 50 listing per halaman/read model scalable;
- `Latest Activity` dengan old rank → new rank, nominal, dan relative time;
- `Today's top ranking` sebagai read model khusus aktivitas 24 jam;
- click count + dedupe/anti-bot server-side;
- public live stats yang tidak boleh mengambil seluruh private table;
- Rules/FAQ/Terms/Privacy dan disclosure `Dipromosikan`/final payment;
- validasi Google Maps URL dan ownership/moderation pada admin side;
- amount input dengan increment rupiah serta validasi minimum/max dari DB;
- update bid existing dengan hanya menagih selisih, bukan selalu nominal penuh;
- tie-breaker berdasarkan payment sequence immutable;
- race-safe settlement saat dua invoice outbid berjalan bersamaan;
- Mayar flow melalui Edge Function `mayar-proxy` yang sama dengan `apps/customer` (bukan direct auth-server call);
- Mayar refund/chargeback state dan policy bisnis yang eksplisit.

Fitur yang sudah ada secara source/database:

- official shop onboarding dengan Google Maps URL;
- approval gate `pending_review` → `approved`;
- passport collect memakai `shop_id` official;
- unique stamp per customer dan kedai;
- bid ledger, payment mapping, activity table, click table;
- server-side next bid calculation;
- webhook RPC settlement source;
- basic Mayar V2 `extraData` correlation.

### Aturan referensi yang tidak boleh terlewat saat implementasi lanjutan

- satu pembayaran dapat memengaruhi board applicable secara bersamaan;
- All-time tidak expire;
- Today rolling 24 jam;
- Daily archive berdasarkan UTC;
- listing baru minimum dan maximum harus configurable server-side dalam rupiah;
- existing listing membayar difference dengan minimum increment;
- equal bid ditentukan oleh siapa yang verified lebih dahulu;
- ranking baru sah setelah payment confirmation;
- URL query parameter dibersihkan/ditolak dan link shortener, affiliate/tracking URL, chat/invite link, serta konten NSFW harus ditolak atau dimoderasi;
- pembayaran final/non-refundable pada model referensi harus ditampilkan jelas sebelum checkout, lalu kebijakan chargeback Mayar ditetapkan terpisah.

### Implikasi untuk 500 Kopi Tasik

`All-time` berarti bid efektif kedai tidak kadaluarsa. `Today` dan `Daily` hanya read-model agregasi untuk discovery/activity; keduanya bukan masa aktif bid. Karena nominal lokal memakai rupiah, implementasi harus menetapkan padanan server-side untuk minimum bid, kenaikan minimum #1, dan kenaikan existing listing. Jangan menyalin angka dolar ke frontend.

Tie-breaker wajib menggunakan `paid_at`/sequence pembayaran yang immutable: bid paid lebih awal menang jika nominal efektif sama. Settlement harus mengunci board state dan menghitung ranking pada saat transaksi Mayar benar-benar verified `paid`, bukan mempercayai nominal/posisi dari halaman checkout. Kebijakan refund perlu dikunci secara eksplisit sebelum production karena referensi bersifat non-refundable, sedangkan Mayar dapat memiliki status refund/chargeback yang harus tetap ditangani di ledger.


Leaderboard utama dapat memakai kategori coffee shop atau area Tasikmalaya, misalnya `Semua`, `Cihideung`, `Tawang`, `Kawalu`, dan kategori lain yang benar-benar berasal dari data kedai. Jangan membuat kategori atau kedai fixture di runtime.

Kartu publik menampilkan:

```txt
#1  Nama Kedai
    Deskripsi singkat resmi
    Bid efektif: Rp...
    Dilihat: ... kali
    Lihat detail
```

CTA dinamis:

```txt
Rebut #1 dengan Rp{top_bid + increment}
```

Jika leaderboard masih kosong, CTA harus memakai nominal minimum yang dikonfigurasi server, bukan nilai hardcode frontend.

Bagian publik:

```txt
Top ranking
Today's top ranking
Latest activity
All-time | Today
Kategori / area
```

### Model bid dan ledger pembayaran

Tidak ada `campaign_period`, `start_at`, atau `end_at` untuk menentukan eligibility ranking. Setiap pembayaran yang verified menambah atau menetapkan **effective bid** kedai sesuai kebijakan server. Bid lama tidak ditimpa: seluruh bid dan perubahan posisi disimpan sebagai ledger/audit.

Entitas minimal yang perlu dirancang additive:

```txt
pos.coffee_passport_bid_entries
pos.coffee_passport_bid_payments
pos.coffee_passport_bid_activity
pos.coffee_passport_bid_clicks
```

Aturan wajib:

- hanya kedai yang terverifikasi/approved yang boleh tampil sebagai listing resmi;
- nominal bid dihitung dan divalidasi server-side dalam integer rupiah;
- minimum increment berasal dari konfigurasi server/database;
- satu Mayar invoice hanya boleh settle satu kali;
- webhook Mayar idempotent berdasarkan event/payment identifier;
- pembayaran `pending`, `failed`, `expired`, atau `refunded` tidak boleh menaikkan ranking;
- refund/chargeback harus menurunkan atau menonaktifkan bid secara atomik dan tercatat;
- bid yang sukses harus menghasilkan satu activity event dan snapshot posisi;
- ranking memakai deterministic tie-breaker (timestamp verified lalu id), tidak boleh bergantung pada urutan query;
- klik dihitung server-side dan tidak dipercaya dari client; dedupe bot/refresh wajib dipertimbangkan;
- tidak ada auto-debit atau auto-charge tanpa persetujuan eksplisit kedai;
- label promosi publik harus jelas, misalnya `Dipromosikan`.

### Integrasi Mayar

Flow yang direncanakan:

```txt
Kedai login / verifikasi ownership
        ↓
Masukkan URL/profil dan kategori
        ↓
Server membaca top bid + minimum increment
        ↓
Kedai konfirmasi nominal outbid
        ↓
Server membuat invoice Mayar dengan reference/idempotency key
        ↓
Redirect ke halaman pembayaran Mayar
        ↓
Mayar webhook diterima dan diverifikasi
        ↓
Server read-back status transaksi ke Mayar
        ↓
Jika paid: settle ledger → hitung ranking → tulis activity
        ↓
Public leaderboard membaca hasil dari DB
```

API key/secret Mayar hanya berada di auth server/Edge Function secret. Frontend hanya menerima invoice URL dan status yang sudah disanitasi. Return URL dari Mayar bukan bukti pembayaran.

### Tahapan implementation

1. Kunci kebijakan: apakah bid adalah **total effective bid** yang naik setiap outbid, atau pembayaran per kenaikan; untuk MVP rekomendasi: pembayaran penuh setiap kenaikan dan ledger immutable.
2. Audit schema/kepemilikan kedai existing, auth merchant, serta pola Mayar/webhook yang sudah ada.
3. Buat migration additive untuk bid ledger, payment mapping, activity, click event, konfigurasi increment, dan unique/idempotency constraints.
4. Implement server endpoint: leaderboard, top bid/next price, create Mayar invoice, webhook, payment read-back, settle bid, refund handling.
5. Implement UI mobile-first: CTA `Rebut #1`, form URL/profil, nominal next bid, kategori/area, status pembayaran, ranking publik, filter Today/All-time, activity feed, dan click count.
6. Tambahkan ownership verification dan moderation agar kedai tidak dapat mengklaim profil milik pihak lain.
7. Uji race condition dua kedai outbid bersamaan; hanya bid yang memenuhi harga server saat settlement yang boleh menang.
8. Uji webhook duplicate/out-of-order, invoice expired, failed payment, refund, refresh, bot click, dan tie-breaker.
9. Deploy hanya perubahan sesi ini; verifikasi invoice sandbox/production sesuai environment, webhook read-back, DB ledger, ranking, activity, dan click count.

### Preview Efek Bid Rank

```txt
Publik melihat:
#1 Kedai A — Rp170.000 — 1.250 klik
#2 Kedai B — Rp160.000 — 980 klik
#3 Kedai C — Rp140.000 — 760 klik

Kedai D melihat:
Rebut #1 dengan Rp170.005

Kedai D bayar via Mayar
        ↓
Webhook paid + read-back verified
        ↓
Kedai D menjadi #1
        ↓
Kedai A turun ke #2
        ↓
Latest activity:
“Kedai D naik dari #8 ke #1 — Rp170.005”
```

## No-Hardcode Enforcement (Implementation)

Runtime tidak boleh memakai fixture atau fallback bisnis untuk data berikut:

```txt
coffee shops        → pos.coffee_passport_shops
visits              → pos.coffee_passport_visits
stickers            → pos.coffee_passport_stickers
collection          → public.pos_coffee_passport_collection_view
reward balance      → pos.coffee_passport_rewards
customer identity   → Better Auth session + pos_customers_view
media               → private Supabase Storage / signed delivery
```

Jika query gagal atau tabel belum memiliki data:

- tampilkan error/empty state;
- jangan memasukkan sample shop, counter, nama customer, saldo, atau status buatan;
- jangan menghitung reward dari collection lokal;
- jangan menganggap upload berhasil sebelum Storage/API read-back;
- release catalog hanya setelah data shop resmi di-seed melalui migration/import yang memiliki sumber dan audit.

Copy UI seperti label, CTA, dan empty-state message boleh statis; seluruh business data harus server-authoritative.



Implementasi nantinya dianggap selesai jika:

- `apps/500kopitasik` build/typecheck/lint berhasil;
- single-page flow bekerja tanpa route feature terpisah;
- Google login Better Auth bekerja dari CTA sticker dan kembali ke flow;
- visit original tersimpan terpisah dari sticker;
- AI failure tidak menghapus visit;
- unique collection benar-benar 0–500;
- repeat visit tidak memberi reward kedua;
- reward maksimum terverifikasi Rp250.000 per user;
- reward balance terpisah dan hanya bisa dipakai pada Djiwa Tentram;
- top-up existing tidak rusak;
- duplicate reward/payment requests idempotent;
- RLS/ownership/media privacy diverifikasi;
- existing apps/domains tetap sehat;
- semua perubahan di-stage selective, tanpa `git add -A`.

## Preview Efek Plan

```txt
Guest membuka 500 Kopi Tasik
        ↓
Tekan “Collect Stamp”
        ↓
AuthSheet → “Lanjut dengan Google”
        ↓
Kembali ke halaman yang sama
        ↓
Foto + cerita + kategori + lokasi
        ↓
Sticker selesai dibuat
        ↓
Collection +1
Reward Djiwa Pay +Rp500
        ↓
Saldo reward hanya dapat dipakai
untuk menu Djiwa Tentram di djiwatentram.web.id
```
