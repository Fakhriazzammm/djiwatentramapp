# Plan: Community Feed — Aktivitas Pembelian Customer Real

## Goal

Meningkatkan timeline `/komunitas` dengan feed aktivitas pembelian yang benar-benar berasal dari customer dan transaksi nyata, misalnya:

> **Aldi baru saja menikmati Nasi Hamburg Jepang** · 5 menit lalu

Aktivitas tidak boleh dibuat dari dummy/random data. Nama customer harus berasal dari profil customer asli dan hanya ditampilkan setelah customer memberi izin berbagi aktivitas pembelian.

## Current Context

Yang sudah ada di codebase:

- Customer Community berjalan di `apps/customer` melalui route:
  - `apps/customer/src/routes/$username/komunitas.tsx`
  - `apps/customer/src/routes/$username/komunitas.lazy.tsx`
  - `apps/customer/src/routes/$username/komunitas/$postId.lazy.tsx`
- Feed saat ini mendukung posting text/media, like, komentar, report, pagination cursor, dan autentikasi customer.
- Client frontend menggunakan `/api/customer-community` melalui:
  - `apps/customer/src/features/community/community-client.ts`
  - `apps/customer/src/features/community/community-types.ts`
- Backend Community dipisahkan di `workers/customer-community/src/index.ts`.
- Data posting/like/comment sudah disimpan di tabel `public.customer_community_*` melalui migration:
  - `supabase/migrations/20260906000000_customer_community.sql`
  - `supabase/migrations/20260906000001_customer_community_engagement.sql`
- Order customer sudah menyimpan identitas customer, produk, status pembayaran, dan payment gateway di `pos.orders` serta `pos.order_items`.

Fitur aktivitas pembelian adalah fitur baru yang hidup berdampingan dengan posting Komunitas. Fitur ini bukan pengganti posting manual.

## Prinsip Kebenaran Data

Activity event hanya boleh dibuat jika semua kondisi berikut benar:

1. Customer benar-benar ada di data customer.
2. Order benar-benar ada di `pos.orders`.
3. Produk benar-benar ada di `pos.products`/catalog dan terkait dengan `pos.order_items`.
4. Order sudah settled:
   - Mayar/QRIS: status transaksi provider sudah diverifikasi `paid`.
   - Djiwa Pay: debit wallet sudah `completed`.
   - Cash: sudah dikonfirmasi kasir.
5. Order bukan `pending`, `created`, `cancelled`, `expired`, refunded, atau failed.
6. Customer mengaktifkan izin berbagi aktivitas pembelian.
7. Event belum pernah dibuat untuk pasangan order + produk yang sama.

Tidak boleh membuat event hanya karena:

- customer membuka menu;
- produk masuk cart;
- invoice QRIS dibuat;
- redirect kembali dari Mayar;
- order masih menunggu pembayaran;
- data seed/demo/random.

## Nama Asli Customer

Kontrak identity untuk MVP:

- Sumber nama: profile/customer record real yang terhubung ke `customer_source_id` order.
- Nama tidak boleh di-hardcode, diacak, atau dibuat oleh AI.
- UI menampilkan **nama asli customer yang sudah memberikan izin**.
- Default privacy: aktivitas tidak tampil atas nama sebelum customer opt-in.
- Customer dapat memilih apakah yang ditampilkan adalah nama lengkap atau nama depan. Jika user memilih nama depan, nilainya tetap berasal dari nama asli profile, bukan alias buatan sistem.
- Jika izin dicabut, event aktif customer tersebut tidak lagi ditampilkan secara publik.
- Untuk customer yang tidak opt-in, sistem hanya boleh menampilkan agregat real, misalnya `5 Teman Djiwa baru saja menikmati menu ini`, tanpa nama.

## Proposed Architecture

```text
pos.orders + pos.order_items
          │
          ├── payment settlement authority
          │     ├── verified Mayar webhook
          │     ├── completed Djiwa Pay debit
          │     └── cashier confirmation
          │
          ▼
create verified activity event (idempotent)
          │
          ▼
public.customer_community_activity_events
          │
          ▼
customer-community Worker
          │
          ▼
GET /api/customer-community/activity
          │
          ▼
Community feed: aktivitas + postingan + menu discovery
```

Activity event harus dibuat dari jalur settlement/backend yang authoritative, bukan dari browser. Jika belum tersedia satu settlement hook untuk semua payment channel, implementasikan adapter per channel tetapi gunakan satu writer idempotent yang sama.

## Database Schema

### Table: `public.customer_community_activity_events`

Additive migration; tidak mengubah atau menghapus historical order/finance records.

```sql
id                         uuid primary key default gen_random_uuid()
customer_source_id         text not null
order_source_id            text not null
product_source_id          text not null
activity_type              text not null default 'order_completed'
display_name_snapshot      text not null
display_mode               text not null default 'first_name'
product_name_snapshot      text not null
product_image_snapshot     text null
price_snapshot             numeric(18,2) null
nutrition_snapshot         jsonb null
order_settled_at           timestamptz not null
visible_at                 timestamptz not null
expires_at                 timestamptz not null
visibility                 text not null default 'public'
status                     text not null default 'active'
source_payment_method      text null
created_at                 timestamptz not null default now()
revoked_at                 timestamptz null
```

Constraints/indexes:

- Unique `(order_source_id, product_source_id, activity_type)` untuk idempotency.
- Check `activity_type = 'order_completed'` pada MVP.
- Check `visibility` in `('public', 'aggregate_only', 'private')`.
- Check `status` in `('active', 'hidden', 'revoked', 'expired')`.
- Index `(visible_at desc, id desc)` untuk cursor feed.
- Index `(product_source_id, visible_at desc)` untuk agregasi popularitas.
- Index `(customer_source_id, created_at desc)` untuk revoke/privacy management.
- Tidak ada foreign key cascade yang dapat menghapus historical order/finance; event boleh expired/hidden secara additive.

### Privacy settings

Tambahkan field pada sumber customer yang sudah menjadi canonical profile, atau tabel setting terpisah bila struktur customer tidak aman untuk diperluas langsung:

```text
customer_source_id
share_purchase_activity       boolean not null default false
purchase_activity_name_mode   text not null default 'first_name'
updated_at                    timestamptz not null default now()
```

Nilai `share_purchase_activity` harus dibaca dari profile/settings customer, bukan dari localStorage sebagai sumber kebenaran.

### View/read model

Buat read model aman, misalnya `public.customer_community_activity_feed`, atau response projection langsung dari Worker. Projection hanya boleh mengeluarkan:

- activity id;
- nama publik yang diizinkan;
- nama/foto/product ID produk;
- nutrition snapshot yang memang tersedia;
- harga produk yang memang boleh dipublikasikan;
- waktu relatif/settled time yang sudah diberi delay;
- verified marker;
- CTA product ID.

Jangan mengeluarkan email, nomor WhatsApp, nomor meja, payment gateway detail, order ID internal, atau identitas internal staff.

## Settlement Integration

### QRIS / Mayar

- Buat event hanya setelah `mayar-webhook` memverifikasi transaction detail provider sebagai `paid`.
- Redirect dari Mayar tidak boleh membuat event.
- Invoice `unpaid` hanya tetap menjadi `gateway_pending`.
- Webhook duplicate harus menjadi no-op.

### Djiwa Pay

- Buat event setelah wallet debit final berstatus `completed`.
- Wallet hold/authorization belum boleh menjadi activity event.
- Jika hold dibatalkan, tidak ada event publik.

### Cashier

- Buat event setelah kasir mengonfirmasi pembayaran.
- `cashier_pending` tidak boleh muncul di Community.

### Idempotent writer

Gunakan satu fungsi, misalnya:

```text
createCustomerCommunityPurchaseActivity(orderSourceId)
```

Fungsi harus:

1. membaca order dan item dari database;
2. memastikan status settlement valid;
3. membaca privacy setting customer;
4. membaca product snapshot dari catalog;
5. melakukan insert dengan unique conflict no-op;
6. menetapkan `visible_at` dengan delay privacy server-side;
7. menetapkan `expires_at` berdasarkan retention policy;
8. tidak mengubah status order atau financial transaction.

## API / Worker Changes

### New endpoint

```text
GET /api/customer-community/activity?limit=20&cursor=...
```

Behavior:

- wajib authenticated customer;
- hanya membaca event yang `status=active`, `visibility=public`, `visible_at <= now()`, `expires_at > now()`;
- cursor pagination, bukan offset;
- agregasi anonymous events dilakukan server-side;
- response tidak mengandung PII selain nama yang telah diizinkan.

### Response contract

```ts
export type CommunityActivity = {
  id: string;
  type: "purchase_completed";
  displayName: string;
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
    price: number | null;
    nutrition: {
      calories: number | null;
      proteinGrams: number | null;
      carbohydratesGrams: number | null;
      fatGrams: number | null;
      sugarGrams: number | null;
    } | null;
  };
  relativeTime: string;
  verified: true;
  cta: {
    type: "order_product";
    productId: string;
  };
};
```

Anonymous aggregate response perlu contract terpisah:

```ts
export type CommunityActivityAggregate = {
  id: string;
  type: "purchase_aggregate";
  count: number;
  product: CommunityActivity["product"];
  windowLabel: string;
};
```

## UI/UX Specification

### Feed composition

Urutan awal yang direkomendasikan:

1. Activity rail/card terverifikasi.
2. Postingan Komunitas terbaru.
3. Menu discovery/nutrisi.
4. Postingan berikutnya.

Jangan membuat feed penuh notifikasi pembelian. Batasi activity card berdasarkan frequency cap dan sisipkan di antara posting.

### Activity card

Copy utama:

> `Aldi baru saja menikmati Nasi Hamburg Jepang`

Metadata:

> `5 menit lalu · ✓ Pesanan terverifikasi`

Informasi opsional:

> `620 kcal · 25 g protein · Rp30.000`

CTA:

- `Lihat menu`
- `Pesan menu ini`
- `Lihat nutrisi`

### States

- Loading: skeleton card, bukan angka/nama palsu.
- Empty: jangan tampilkan empty error jika memang belum ada aktivitas; lanjutkan menampilkan postingan Komunitas.
- Error: activity section boleh disembunyikan dengan retry inline; postingan existing tetap tampil.
- Privacy off: tampilkan agregat real jika count memenuhi threshold; tidak menampilkan nama.
- Product unavailable: tampilkan nama historis dengan label `Menu sudah tidak tersedia`, CTA pesan dinonaktifkan.
- Saving privacy setting: disable tombol dan tampilkan state saving; refresh read-back setelah server berhasil.
- Revoked consent: event bernama dihapus dari projection publik atau berubah menjadi aggregate sesuai policy; tidak cukup hanya mengubah UI lokal.

### Visual guardrails

- Gunakan Customer azure/violet/cyan palette.
- Hindari gold/amber/yellow/orange pada customer/community UI.
- Card compact, mobile-first, tidak mengalahkan postingan utama.
- Nama asli harus terbaca jelas tetapi tidak dibuat terlalu besar seperti leaderboard.
- Ikon verified harus subtle dan accessible dengan label teks, bukan ikon saja.

## Files Likely to Change

### Frontend

- `apps/customer/src/features/community/community-types.ts`
  - tambah activity response types.
- `apps/customer/src/features/community/community-client.ts`
  - tambah `listActivity()` dengan cursor dan abort signal.
- `apps/customer/src/routes/$username/komunitas.lazy.tsx`
  - render activity section/card, loading/error/empty states, CTA product.
- Customer profile/settings route/component yang canonical setelah audit:
  - tambah opt-in `share_purchase_activity` dan pilihan `first_name`/`full_name`.
- `apps/customer/src/routes/$username/komunitas/$postId.lazy.tsx`
  - hanya bila activity detail/deep-link ikut didukung.

### Backend / Worker

- `workers/customer-community/src/index.ts`
  - endpoint `/activity`, safe projection, cursor, aggregation, authorization.
- Settlement writer yang sudah menjadi authority untuk payment/order completion:
  - panggil idempotent activity writer setelah settlement verified.
- Jangan membuat event dari browser community API.

### Database

- Migration baru `supabase/migrations/<timestamp>_customer_community_purchase_activity.sql`.
- Jika privacy setting memakai tabel baru, sertakan policy/service-role grants sesuai pola Community yang sudah ada.

### Admin / moderation

- `apps/admin/src/routes/admin/community.lazy.tsx`
  - fase lanjutan: moderation activity, revoke/hidden, audit count.
- MVP tidak perlu menjadikan activity sebagai posting manual yang dapat diedit customer.

## Multi-Source Data Flow

```text
Customer profile
  └── real name + consent setting

Catalog product
  ├── product ID
  ├── name/image/price
  └── nutrition data

Order
  ├── customer_source_id
  ├── status
  ├── payment method/gateway
  └── order_items.product_source_id

Settlement authority
  └── paid/completed confirmation

Activity writer
  └── immutable-ish snapshot + idempotency

Customer Community Worker
  └── privacy-safe feed projection

Customer Community page
  └── activity card + direct ordering CTA
```

Tidak ada AI/LLM dalam jalur kebenaran data. AI boleh dipakai nanti untuk rekomendasi copy atau ranking discovery, tetapi tidak boleh menentukan apakah customer membeli sesuatu, siapa namanya, status paid, atau jumlah transaksi.

## No-Hardcode Audit

Tidak boleh di-hardcode:

- nama customer;
- nama produk;
- harga;
- image URL;
- nutritional values;
- status payment;
- activity count;
- timestamp transaksi;
- verified marker.

Boleh menjadi konfigurasi/admin setting:

- activity expiry window;
- delay range minimum/maksimum;
- frequency cap;
- minimum count untuk anonymous aggregation;
- copy template yang tidak mengubah fakta.

Jika nutrition belum tersedia di database, tampilkan tanpa nutrition; jangan mengarang nilai dari AI atau menyalin dari gambar secara otomatis tanpa verifikasi admin.

## Privacy and Security Rules

- Default consent `false`.
- Consent update harus server-persisted dan diverifikasi dengan read-back.
- Jangan expose raw `customer_source_id` atau `order_source_id` di public response.
- Gunakan service role hanya di Worker/settlement backend; jangan di browser.
- Activity event tidak boleh bypass payment settlement authority.
- Minimum aggregation threshold, misalnya 3 customer berbeda, sebelum menampilkan `N orang`.
- Jangan menampilkan pola pembelian customer tertentu secara beruntun sehingga mudah dilacak.
- Sediakan revoke consent dan soft-hide event.
- Audit log untuk pembuatan, revoke, moderation, dan perubahan consent.

## Implementation Waves

### Wave 1 — Contract and data foundation

1. Audit canonical customer profile, settlement writers, product nutrition fields, dan current Community Worker.
2. Tambahkan migration activity table + privacy setting secara additive.
3. Implementasikan idempotent activity writer.
4. Tambahkan unit tests untuk status settlement, consent, duplicate event, revoked consent, product unavailable.

### Wave 2 — API and frontend MVP

1. Tambah endpoint `/activity` di Worker.
2. Tambah client/types.
3. Render activity card di feed Komunitas.
4. Tambah CTA ke product order.
5. Tambah profile privacy control.
6. Feature flag activity feed agar rollout dapat dihentikan tanpa rollback schema.

### Wave 3 — Verification and rollout

1. Buat QA customer dan QA order yang jelas, bukan data customer real.
2. Simulasikan settlement melalui test/staging fixture tanpa membuat transaksi uang nyata.
3. Verifikasi event hanya muncul setelah status settled.
4. Verifikasi nama yang tampil sama dengan profile customer yang opt-in.
5. Verifikasi revoke consent menghilangkan nama dari response.
6. Build Customer App.
7. Deploy Worker dan Customer App hanya dari artifact yang berubah.
8. Fetch live endpoint dan bundle; pastikan activity UI memakai response real.

### Wave 4 — Discovery enhancements

1. Aggregate menu populer.
2. Nutrition/product card.
3. `Saya juga coba` dan save.
4. Review terverifikasi setelah order completed.
5. Badge/challenge hanya setelah anti-abuse metrics tersedia.

## Test and Verification Plan

### Database tests

- Insert settled QRIS order → tepat satu activity event.
- Duplicate webhook/order settlement → tetap satu event.
- Invoice Mayar `unpaid` → tidak ada event.
- Cash `cashier_pending` → tidak ada event.
- Cash confirmed → event boleh dibuat.
- Wallet hold → tidak ada event.
- Wallet debit completed → event boleh dibuat.
- Cancel/refund → event disembunyikan/revoked sesuai policy.
- Consent false → tidak ada named event.
- Consent true → nama profile asli tampil.
- Product deleted/unavailable → event historis aman, CTA disabled.

### API tests

- Anonymous request → 401.
- Authenticated customer → hanya event valid.
- Cursor pagination tidak duplicate.
- Expired event tidak keluar.
- Response tidak mengandung email/phone/table/order internal ID.
- Aggregate count hanya menghitung order settled customer berbeda.

### Frontend tests

- Loading tidak menampilkan fake name/count.
- Error activity tidak mematikan feed postingan.
- CTA product mengarah ke product ID real.
- Nama customer yang tampil cocok dengan profile snapshot.
- Revoke consent tidak meninggalkan card bernama di UI setelah refresh.
- Mobile viewport tidak tertutup bottom navigation.
- Build Customer App dan typecheck lulus.

### Production evidence

Sebelum laporan selesai, wajib ada:

```text
DB settlement → activity writer → Worker response → customer UI
verified         exactly-one       safe projection    real name/product
```

Jangan menyatakan fitur berhasil hanya karena card berhasil dirender dengan mock data.

## Risks and Tradeoffs

| Area | Risiko | Mitigasi |
|---|---|---|
| Privacy | Customer merasa dilacak | Opt-in, delay acak, tanpa lokasi/meja/payment detail |
| Kebenaran | Order pending tampil sebagai pembelian | Event hanya dari settlement authority |
| Duplicate | Webhook retry membuat activity ganda | Unique order+product+type dan upsert/no-op |
| Feed quality | Feed dipenuhi aktivitas | Frequency cap dan interleave dengan posting |
| Identity | Nama profile berubah atau salah mapping | `customer_source_id` + display name snapshot dari customer real |
| Product | Produk sudah tidak tersedia | Snapshot historis + CTA disabled |
| Performance | Join order/product setiap feed request lambat | Activity snapshot + cursor index |
| Abuse | Activity dipakai untuk profiling | Minimum aggregation threshold, expiry, revoke, audit |

## Additional Ideas Beyond Purchase Activity

Semua ide berikut harus memakai data real dan memiliki sumber kebenaran yang jelas. Tidak boleh membuat angka, nama, rating, badge, atau rekomendasi dari dummy/random data.

### 1. Verified customer review

Setelah order settled, customer dapat memberi rating dan feedback singkat untuk item yang benar-benar dibeli:

- rating bintang;
- rasa/porsi/kesesuaian ekspektasi;
- `Akan pesan lagi`;
- komentar singkat dengan batas karakter.

Feed menampilkan:

> **Aldi memberi rating 5⭐ untuk Nasi Hamburg Jepang** · Pesanan terverifikasi

Hanya customer dengan order settled untuk product tersebut yang boleh memberi review. Satu review aktif per customer + order item, dengan edit/moderation dan audit trail.

### 2. Menu yang sedang ramai

Buat social proof anonim berbasis agregasi order settled:

> **Nasi Hamburg Jepang sedang ramai hari ini**
> 12 customer menikmatinya dalam 3 jam terakhir

Aturan:

- minimum jumlah customer berbeda sebelum angka tampil;
- hanya order settled yang dihitung;
- tidak menampilkan identitas customer;
- produk harus masih aktif/tersedia;
- time window, threshold, dan copy berasal dari setting/konfigurasi, bukan hardcode bisnis.

### 3. Rekomendasi customer terverifikasi

Customer yang benar-benar membeli produk dapat menekan `Rekomendasikan menu ini` dan menulis alasan singkat. Feed dapat menampilkan:

> **Aldi merekomendasikan Nasi Hamburg Jepang**
> “Rasanya ringan tapi tetap mengenyangkan.”
> ✓ Dibeli dan diverifikasi

Batasi satu rekomendasi aktif per customer + product dan tetap sediakan report/moderation.

### 4. Polling menu

Admin dapat membuat polling dari product ID aktif, misalnya:

> **Menu mana yang kamu pilih hari ini?**

Vote hanya dari customer login, satu vote per polling, dan hasil dihitung dari data vote tersimpan. Jangan mengarang jumlah peserta. Polling harus memiliki expiry, status moderation, dan audit perubahan opsi.

### 5. Nutrisi dan pilihan berdasarkan kebutuhan

Gunakan nutrition data yang sudah diverifikasi di catalog untuk membuat discovery card:

- tinggi protein;
- pilihan lebih ringan;
- favorit keluarga;
- menu sharing;
- kisaran harga tertentu.

Jika nutrition data kosong atau belum diverifikasi, jangan mengarang nilai melalui AI; sembunyikan atribut tersebut atau tampilkan `Informasi nutrisi belum tersedia`.

### 6. Badge customer berbasis perilaku nyata

Badge yang dapat direncanakan setelah fondasi activity/review stabil:

- `Food Explorer`: mencoba minimal 5 produk berbeda;
- `Menu Loyal`: memesan produk sama minimal 3 kali;
- `Djiwa Reviewer`: memiliki 3 review terverifikasi;
- `Teman Djiwa`: kontribusi Komunitas yang lolos moderation.

Badge harus dihitung dari event/order/review real, idempotent, dapat direkonstruksi, dan tidak boleh diberikan hanya karena data frontend optimistic.

### 7. CTA Pesan Lagi / Pesan Menu Ini

Review, activity, dan discovery card dapat membuka order dengan `productId` database. Sebelum masuk cart, frontend/backend wajib mengecek ulang:

- produk masih aktif;
- harga terbaru;
- quantity/stok sesuai aturan catalog;
- variasi masih tersedia.

Jangan menyalin harga atau status dari activity snapshot sebagai harga checkout.

### 8. Tema Komunitas mingguan

Admin dapat membuat tema seperti `Minggu Menu Pedas`, `Minggu Tinggi Protein`, atau `Minggu Es Favorit`. Feed mengelompokkan posting/review yang terkait dengan product/tag real. Tema memiliki periode aktif, moderation, dan source data yang dapat diaudit.

### 9. Tanya jawab menu

Customer dapat bertanya tentang menu. Jawaban harus berasal dari deskripsi, bahan/alergen, nutrition, atau jawaban admin yang tersimpan. AI boleh membantu merapikan bahasa, tetapi tidak boleh mengarang bahan, alergi, nutrisi, atau klaim kesehatan.

### 10. Produk yang sering dipilih bersama

Tampilkan rekomendasi agregat:

> **Customer yang memilih Nasi Hamburg Jepang juga sering memilih Es Teh Lemon**

Syarat:

- minimum sample size;
- hanya settled order;
- tidak memakai data sensitif;
- produk tujuan masih aktif;
- hindari klaim bahwa kombinasi tersebut pasti cocok.

## Recommended Product Sequence

Prioritas implementasi setelah MVP activity:

1. **Verified customer review** — membangun trust dari pengalaman nyata.
2. **Menu yang sedang ramai** — social proof aman tanpa membuka identitas.
3. **CTA Pesan Menu Ini / Pesan Lagi** — mengubah discovery menjadi order real.
4. **Badge dan rekomendasi customer** — meningkatkan retention setelah review stabil.
5. **Polling, tema mingguan, dan pairing menu** — engagement lanjutan.

## Shared Data Rules for Additional Ideas

```text
real customer/profile
  + real settled order/product
  + explicit customer action or stored vote
  + server-side moderation/idempotency
  → public-safe aggregate or verified community content
```

Tidak ada fitur tambahan yang boleh mengubah status order, payment, inventory, atau financial history hanya untuk menghasilkan konten feed. Semua konten publik harus memiliki sumber data, status moderation, dan mekanisme revoke/hide.

## Acceptance Criteria

- Semua activity card berasal dari customer dan order real.
- Nama asli hanya tampil jika customer tersebut opt-in.
- Tidak ada nama dummy, random, atau fabricated.
- QRIS baru muncul setelah pembayaran Mayar terverifikasi paid.
- Satu settlement menghasilkan maksimal satu activity per product.
- Activity tidak menampilkan order pending/cancelled/refunded.
- Customer dapat mematikan sharing dan perubahan tersimpan di server.
- Feed tetap berfungsi jika activity API gagal.
- Product CTA menggunakan ID product database.
- Build, API response, database query result, dan screenshot/visual QA tersedia sebagai bukti.
