# Plan Implementasi — Komunitas Djiwa

**Tanggal:** 29 September 2026 WIB  
**Scope:** `apps/customer` + Customer Community Worker + Supabase schema + `apps/admin` moderation  
**Status:** Plan only — belum ada implementasi kode  
**Referensi visual:** screenshot layar Komunitas yang dikirim user

---

## 1. Tujuan

Membuat halaman Komunitas menjadi tempat utama untuk:

1. Menemukan cerita dan rekomendasi menu dari Teman Djiwa.
2. Berinteraksi melalui like, komentar, simpan, follow, dan share.
3. Mengubah rekomendasi komunitas menjadi discovery menu yang dapat langsung dipesan.
4. Menampilkan aktivitas pembelian sebagai social proof yang ringkas, jelas, dan privacy-safe — bukan sebagai log transaksi yang mendominasi feed.
5. Menyediakan kontrol moderasi, report, privacy, loading, empty, error, dan recovery state yang siap produksi.

### Prinsip produk

- **Community first:** posting dan cerita customer menjadi konten utama.
- **Commerce-assisted, bukan commerce-dominated:** aktivitas pembelian mengarahkan discovery tanpa membanjiri feed.
- **Privacy by design:** aktivitas pembelian hanya muncul sesuai consent customer.
- **Mobile-first:** CTA utama dan interaksi penting berada di thumb zone.
- **One action per card:** setiap card memiliki tujuan yang jelas.
- **Brand:** Customer UI memakai azure/violet/cyan; tidak menambahkan gold/amber/yellow/orange pada UI komunitas.
- **Data nyata:** nama menu, harga, gambar, dan status ketersediaan berasal dari DB/catalog; tidak hardcode di frontend.

---

## 2. Hasil audit codebase saat ini

Sudah ada implementasi dasar, sehingga pekerjaan ini adalah **evolusi additive**, bukan membuat fitur dari nol.

### Frontend customer yang sudah ada

- Route feed: `apps/customer/src/routes/$username/komunitas.tsx`
- Implementasi route: `apps/customer/src/routes/$username/komunitas.lazy.tsx`
- Detail post: `apps/customer/src/routes/$username/komunitas/$postId.tsx` dan `.lazy.tsx`
- API client: `apps/customer/src/features/community/community-client.ts`
- Types: `apps/customer/src/features/community/community-types.ts`
- Bottom navigation sudah memiliki item Home, Pesan, Komunitas, Saldo, Profil.
- Feed sudah memiliki filter `Untuk Kamu`, `Postingan`, `Teman Djiwa`.
- Feed sudah memiliki refresh manual, pagination cursor, composer post, upload image/video, like, comment navigation, delete, report, dan empty/error/loading state.
- Media saat ini dibatasi image/video, video maksimal 60 detik, image maksimal 5 MB, video maksimal 50 MB.

### Backend/Worker yang sudah ada

- Worker: `workers/customer-community/src/index.ts`
- Auth melalui Better Auth cookie atau bearer session.
- Media disimpan di Cloudflare R2.
- Endpoint post, upload URL, media serving, like, comment, report, privacy, dan moderation sudah ada.
- Endpoint purchase activity sudah ada dengan expiry, cursor pagination, verifikasi settlement, dan visibility filtering.

### Database yang sudah ada

- `public.customer_community_posts`
- `public.customer_community_reports`
- `public.customer_community_post_likes`
- `public.customer_community_comments`
- `public.customer_community_activity_events`
- `pos.customers.share_purchase_activity`
- `pos.customers.purchase_activity_name_mode`
- View `public.pos_customers_view` sudah expose field privacy purchase activity.

### Admin yang sudah ada

- Route: `apps/admin/src/routes/admin/community.tsx`
- Implementasi: `apps/admin/src/routes/admin/community.lazy.tsx`
- Moderation queue sudah dapat memuat report dan menjalankan action publish/hide/remove.

### Gap yang akan ditangani

1. Activity purchase masih bercampur dengan timeline post dan mengambil ruang terlalu besar.
2. Feed default belum cukup kuat membedakan community content, activity, menu discovery, dan promo.
3. Tombol `Lihat` pada activity belum cukup spesifik.
4. Activity masih dikirim dengan identitas display snapshot yang sama-sama terlihat sebagai `Teman Djiwa`; perlu definisi UI privacy/identity yang lebih jelas.
5. Belum ada save/bookmark.
6. Belum ada follow/following.
7. Belum ada product context/tag pada post.
8. Belum ada struktur reason-based recommendation, polling, quick reaction, atau community prompt.
9. Moderation queue belum menampilkan preview konten secara memadai dan belum ada taxonomy report yang terstruktur.
10. Belum ada automated test coverage yang terlihat untuk flow Komunitas end-to-end.
11. Detail implementasi dari `komunitas.lazy.tsx` harus dibaca penuh sebelum patch agar tidak menghapus logic existing yang sudah berjalan.

---

## 3. Keputusan scope

### Dipertahankan

- Post text/image/video.
- Like durable satu kali per customer.
- Comment dan comment edit/delete milik sendiri.
- Report post.
- Delete post milik sendiri.
- Purchase activity terverifikasi dan memiliki expiry.
- Privacy setting purchase activity.
- R2 untuk media.
- Worker sebagai API boundary.
- Admin moderation queue.
- Bottom navigation lima item.

### Dikurangi atau diubah

- Purchase activity tidak lagi menjadi item timeline utama pada tab `Untuk Kamu`.
- Activity ditampilkan sebagai compact social-proof module; tab `Teman Djiwa` tetap menjadi tempat melihat activity detail.
- Tombol `Lihat` diganti sesuai aksi nyata: `Lihat menu`, `Pesan lagi`, `Lihat aktivitas`, atau card tap dengan chevron.
- Refresh icon tidak menjadi satu-satunya cara refresh; tambahkan pull-to-refresh atau `Ada postingan baru` banner jika feasible.
- Jangan menampilkan seluruh activity sekaligus pada initial viewport.
- Jangan mengubah data historical order atau financial transaction.

### Tidak masuk MVP awal

- Direct messaging baru di dalam Komunitas; gunakan route Pesan yang sudah ada.
- Full creator marketplace.
- Public anonymous feed tanpa auth.
- Real-time location sharing.
- Video editing kompleks.
- Reward/affiliate sebelum attribution dan fraud control siap.

---

## 4. Information architecture baru

```text
Komunitas
├── Header + subtitle yang menjelaskan manfaat
├── Composer compact: Bagikan pengalaman
├── Stories rail (fase berikutnya, bukan blocker MVP)
├── Feed filters
│   ├── Untuk Kamu
│   ├── Mengikuti
│   ├── Postingan
│   └── Aktivitas
├── Compact social proof: Yang sedang dicoba Teman Djiwa
├── Community posts
│   ├── Post text/media
│   ├── Tagged menu bila tersedia
│   ├── Like
│   ├── Comment
│   ├── Save
│   └── Share
├── Poll/question/prompt (fase engagement)
└── Bottom navigation
```

### Kontrak tab

- `Untuk Kamu`: post yang relevan + compact activity module; bukan seluruh activity sebagai timeline.
- `Mengikuti`: post dari customer yang diikuti.
- `Postingan`: post community tanpa purchase activity.
- `Aktivitas`: purchase activity yang sudah privacy-filtered dan expired-filtered.

Jika backend personalization belum siap, `Untuk Kamu` memakai chronological post + compact activity module terlebih dahulu dan diberi label sebagai baseline, bukan mengklaim sebagai AI personalization.

---

## 5. Roadmap implementasi bertahap

## Wave 0 — Baseline, contract, dan safety audit

### Tujuan

Mengunci kontrak data dan memisahkan perubahan UI dari perubahan schema/Worker.

### Langkah

1. Baseline git working tree dan daftar file yang sudah berubah sebelum patch.
2. Baca penuh file route, detail route, client, types, Worker, migration, dan admin route.
3. Catat endpoint existing dan response shape.
4. Tambahkan contract tests untuk response existing sebelum memperluas payload.
5. Verifikasi purchase activity hanya dibuat untuk order yang benar-benar settled.
6. Verifikasi opt-out privacy mencegah event baru tampil.
7. Review RLS/service-role boundary dan jangan expose service-role key.
8. Tentukan apakah identitas activity akan:
   - anonymous aggregate,
   - first name berdasarkan consent,
   - full name berdasarkan consent.

### Output

- Baseline file list.
- API contract map.
- Privacy decision yang disetujui.
- Test fixture untuk post/activity/comment.

---

## Wave 1 — Perbaikan UX fitur lama dan pengurangan clutter

### Frontend

Target utama: `apps/customer/src/routes/$username/komunitas.lazy.tsx`

1. Pisahkan rendering activity dari `timelineItems`.
2. Tab `Untuk Kamu` menampilkan compact activity module maksimal 2–3 item atau grouped summary.
3. Tab `Aktivitas` menampilkan activity paginated secara khusus.
4. Tab `Postingan` hanya menampilkan post.
5. Ubah `PurchaseActivityCard` menjadi compact social-proof card.
6. Ganti `Lihat` menjadi aksi spesifik dari product context.
7. Jadikan card area clickable dengan accessible keyboard behavior.
8. Pertahankan product availability guard: `isAvailable=true` + `quantity=NULL` adalah active/unlimited; hanya numeric quantity `<= 0` yang sold.
9. Tambahkan section header `Yang sedang dicoba Teman Djiwa` dan `Cerita dari komunitas`.
10. Kurangi divider, padding berulang, dan visual noise tanpa mengorbankan touch target.
11. Pertahankan mobile shell, safe-area, bottom padding, dan bottom navigation.
12. Ganti refresh-only interaction dengan pull-to-refresh atau top banner `Ada aktivitas baru` setelah verifikasi kemampuan shell.
13. Tambahkan Save button hanya setelah endpoint/schema Wave 2 siap; jangan menampilkan tombol dummy.
14. Composer compact tetap di first viewport, full form tetap bottom sheet/expanded composer.

### Backend/Worker

Target: `workers/customer-community/src/index.ts`

1. Tambahkan mode query activity bila dibutuhkan: `summary` vs `detail`.
2. Pastikan `limit` dan cursor tetap bounded.
3. Pastikan `visibility`, `status`, `visible_at`, `expires_at` selalu enforced server-side.
4. Jangan expose `price_snapshot` atau `nutrition_snapshot` jika tidak digunakan oleh UI dan berpotensi membocorkan data yang tidak diperlukan.
5. Kembalikan `activityGroupKey` dan optional aggregate count jika grouping server-side digunakan.
6. Jangan mengubah settlement eligibility.

### Acceptance criteria

- Initial viewport tidak dipenuhi daftar activity.
- Tab `Postingan` tidak memuat purchase activity.
- Tab `Aktivitas` tetap dapat pagination.
- Tombol activity menjelaskan tujuan.
- Tidak ada broken route saat membuka product.
- Existing create/like/comment/report/delete tetap berjalan.

---

## Wave 2 — Data model untuk discovery dan engagement dasar

### Schema migration additive

Buat migration baru, misalnya:

`supabase/migrations/YYYYMMDDHHMMSS_customer_community_discovery_engagement.sql`

Jangan alter historical order/finance. Migration harus additive dan idempotent.

#### A. Post menu context

Pilihan yang direkomendasikan: tabel relasi, bukan kolom tunggal pada post, supaya satu post dapat menandai beberapa menu dan menjaga referential clarity.

```text
customer_community_post_products
- post_id uuid FK → customer_community_posts.id
- product_source_id text NOT NULL
- created_at timestamptz NOT NULL DEFAULT now()
- primary key (post_id, product_source_id)
```

Validasi product dilakukan Worker terhadap product catalog aktif sebelum insert.

#### B. Saved posts

```text
customer_community_post_saves
- post_id uuid FK → customer_community_posts.id ON DELETE CASCADE
- customer_source_id text NOT NULL
- created_at timestamptz NOT NULL DEFAULT now()
- primary key (post_id, customer_source_id)
```

#### C. Follow

```text
customer_community_follows
- follower_source_id text NOT NULL
- followed_source_id text NOT NULL
- created_at timestamptz NOT NULL DEFAULT now()
- deleted_at timestamptz NULL
- primary key (follower_source_id, followed_source_id)
- check follower_source_id <> followed_source_id
```

#### D. Structured report taxonomy

Pertahankan `reason text` untuk compatibility, lalu tambah:

```text
customer_community_reports
- reason_code text NULL
- reporter_note text NULL
```

`reason_code` yang direkomendasikan:

- `spam`
- `harassment`
- `sexual_content`
- `privacy`
- `misinformation`
- `commercial_abuse`
- `copyright`
- `other`

#### E. Optional post content type

Jika polling/question akan masuk Wave 4, jangan menambah kolom sekarang kecuali kontrak final sudah disetujui. Lebih aman membuat tabel terpisah saat benar-benar diimplementasikan.

### Worker endpoint baru

Target: `workers/customer-community/src/index.ts`

Tambahkan secara additive:

```text
GET    /posts/:id/saved
POST   /posts/:id/save
DELETE /posts/:id/save
GET    /following
POST   /profile/:sourceId/follow
DELETE /profile/:sourceId/follow
GET    /profile/:sourceId
POST   /posts/:id/share-event       (hanya bila analytics event diperlukan)
```

Untuk endpoint save, response harus selalu mengembalikan state aktual:

```json
{ "data": { "saved": true } }
```

Untuk follow:

```json
{ "data": { "following": true } }
```

### Frontend files

Kemungkinan file berubah:

- `apps/customer/src/features/community/community-types.ts`
- `apps/customer/src/features/community/community-client.ts`
- `apps/customer/src/routes/$username/komunitas.lazy.tsx`
- `apps/customer/src/routes/$username/komunitas/$postId.lazy.tsx`
- shared profile/customer components hanya jika pattern existing mendukung.

### Acceptance criteria

- Save bersifat idempotent.
- Unsave mengembalikan state `saved=false`.
- Follow tidak dapat self-follow.
- Post dapat menampilkan tagged menu yang aktif.
- Menu unavailable menampilkan state yang benar, bukan tombol beli yang rusak.
- Semua endpoint memerlukan auth customer dan hanya mengembalikan data yang diizinkan.

---

## Wave 3 — Product discovery dan social commerce

### UX

Pada post yang memiliki menu terkait:

```text
Azzam · 3 jam lalu
Mencoba menu ini untuk makan siang.

[Foto]

Yamin Pangsit Goreng
Rp [harga dari catalog]
[Pesan menu] [Simpan]
```

Fitur:

1. Tag menu resmi dari catalog.
2. Product card kecil di bawah media/caption.
3. `Pesan menu` menuju existing customer order route dengan product source id.
4. `Pesan lagi` hanya muncul bila user memiliki riwayat pembelian dan produk aktif.
5. Harga selalu diambil dari active catalog saat render/order; snapshot hanya untuk histori display bila diperlukan.
6. Jika produk sold out, tampilkan `Menu sedang tidak tersedia` + `Lihat menu serupa`.
7. Jangan hardcode nama menu, harga, gambar, tax, stock, atau availability.

### Data flow

```text
Customer post
  → optional product tag
  → Worker validates product_source_id
  → pos.products / active catalog
  → UI product context
  → existing customer order route
  → existing order/payment flow
  → no direct mutation to finance/inventory from Community
```

Komunitas tidak boleh membuat jalur order baru yang melewati flow POS/payment canonical.

### Integration points

- Customer ordering route: gunakan route/pattern yang sudah ada; jangan invent endpoint order baru.
- Product availability: gunakan query/hook catalog existing.
- Payment: tetap mengikuti canonical customer checkout/payment flow.
- Inventory: tidak ada deduction dari view; deduction hanya terjadi pada lifecycle order yang canonical.
- Finance: tidak ada transaction baru akibat view/click/tag.

---

## Wave 4 — Engagement features

Implementasikan setelah post/save/follow/product context stabil.

### A. Quick reaction

Tambahkan reaction sederhana hanya jika ada kebutuhan produk yang jelas:

```text
Suka | Recommended | Pesan lagi
```

Jangan menambahkan banyak emoji/reaction sebelum ada analytics yang membuktikan kebutuhan.

### B. Polling

Schema additive terpisah:

```text
customer_community_polls
- post_id uuid PK/FK
- question text
- closes_at timestamptz NULL

customer_community_poll_options
- id uuid PK
- poll_id uuid FK
- label text
- sort_order integer

customer_community_poll_votes
- poll_id uuid FK
- option_id uuid FK
- customer_source_id text
- created_at timestamptz
- primary key (poll_id, customer_source_id)
```

Server harus mencegah vote ganda dan option yang tidak sesuai poll.

### C. Daily prompt

Prompt harus berasal dari DB/admin settings, bukan array hardcode di komponen.

### D. Stories

Stories adalah feature terpisah dengan R2/Worker story existing. Jangan menduplikasi storage atau viewer logic. Gunakan skill/story architecture yang sudah ada dan pastikan mount di `apps/customer` diverifikasi.

### E. Event komunitas

Masuk backlog terpisah karena memerlukan schema event, RSVP, reminder, dan privacy lokasi.

---

## Wave 5 — Personalization dan analytics

Tidak menjadi blocker perbaikan UI awal.

### Baseline

- Chronological posts.
- Activity summary.
- Following feed bila follow sudah ada.

### Fase lanjut

1. Relevance score berdasarkan menu yang dilihat/dibeli/disimpan.
2. `reason` pada rekomendasi: `Karena kamu pernah membeli menu ini`.
3. Score kualitas berdasarkan save, comment, product click, dan report rate.
4. Frequency cap untuk promo.
5. Exclude muted/blocked/hidden content.
6. Audit privacy untuk event analytics.

Jangan menyebut feed sebagai AI/personalized sebelum ranking engine benar-benar tersedia dan tervalidasi.

---

## 6. Database schema dan REST mapping

### Existing schema

```text
pos.customers
  ├── share_purchase_activity boolean
  └── purchase_activity_name_mode first_name|full_name

public.customer_community_posts
  ├── id
  ├── author_source_id
  ├── body
  ├── media_type
  ├── media_object_key
  ├── media_content_type
  ├── media_size_bytes
  ├── moderation_status
  ├── report_count
  ├── created_at / updated_at
  └── deleted_at

public.customer_community_post_likes
  └── PK(post_id, customer_source_id)

public.customer_community_comments
  ├── id
  ├── post_id
  ├── author_source_id
  ├── body
  ├── moderation_status
  └── deleted_at

public.customer_community_reports
  ├── id
  ├── post_id
  ├── reporter_source_id
  ├── reason
  ├── status
  ├── moderator_source_id
  └── moderator_note

public.customer_community_activity_events
  ├── id
  ├── customer_source_id
  ├── order_source_id
  ├── product_source_id
  ├── display_name_snapshot
  ├── display_mode
  ├── product_name_snapshot
  ├── product_image_snapshot
  ├── price_snapshot
  ├── nutrition_snapshot
  ├── order_settled_at
  ├── visible_at / expires_at
  ├── visibility
  ├── status
  └── revoked_at

public.pos_customers_view
  └── customer profile + share_purchase_activity + purchase_activity_name_mode
```

### REST mapping existing

```text
GET    /api/customer-community/posts
GET    /api/customer-community/posts/:id
POST   /api/customer-community/posts/upload-url
PUT    /api/customer-community/posts/upload/:postId
POST   /api/customer-community/posts
DELETE /api/customer-community/posts/:id
GET    /api/customer-community/posts/:id/media
POST   /api/customer-community/posts/:id/like
DELETE /api/customer-community/posts/:id/like
GET    /api/customer-community/posts/:id/comments
POST   /api/customer-community/posts/:id/comments
PATCH  /api/customer-community/posts/:id/comments/:commentId
DELETE /api/customer-community/posts/:id/comments/:commentId
POST   /api/customer-community/posts/:id/report
GET    /api/customer-community/activity
PATCH  /api/customer-community/profile/privacy
GET    /api/customer-community/admin/reports
POST   /api/customer-community/admin/posts/:id/moderate
```

### REST mapping planned

```text
POST   /posts/:id/save
DELETE /posts/:id/save
GET    /posts/:id/save
GET    /following
POST   /profile/:sourceId/follow
DELETE /profile/:sourceId/follow
GET    /profile/:sourceId
POST   /posts/:id/products
DELETE /posts/:id/products/:productSourceId
GET    /posts/:id/products
```

Semua route baru memakai Worker proxy/origin pattern existing dan tidak bypass auth.

---

## 7. UI/UX specification

### Header

```text
← Komunitas                              [opsional action]
Temukan cerita dan rekomendasi dari Teman Djiwa
```

- Jika halaman adalah destination bottom nav, evaluasi apakah back button masih dibutuhkan.
- Jika dipertahankan, pastikan kembali ke `/$username` secara konsisten.
- Subtitle harus menyebut manfaat konkret.

### Composer

Collapsed:

```text
[avatar] Apa yang ingin kamu bagikan?                 [+]
```

Expanded bottom sheet/form:

```text
Bagikan pengalaman
[text area]
[Foto/Video] [Tandai menu] [Prompt]
[Batalkan] [Post]
```

States:

- Idle.
- File selected.
- Uploading.
- Saving.
- Success.
- Upload error.
- Validation error.
- Retry.
- Draft recovery jika upload gagal setelah media tersimpan.

### Activity module

- Maksimal 2–3 item pada `Untuk Kamu`.
- Group aktivitas berdasarkan order/customer/product sesuai privacy policy.
- `Lihat menu` membuka order flow dengan product id.
- `Lihat aktivitas` membuka tab Aktivitas.
- Jika tidak ada activity: module tidak mengambil ruang besar.
- Jika activity error: tampilkan inline retry kecil, tidak merusak feed posts.

### Post card

Urutan:

```text
Avatar + name + time + menu
Caption
Media
Tagged product jika ada
Like + comment + save + share
```

Rules:

- Touch target minimum 44px.
- Media image ratio konsisten.
- Video tetap controls dan `playsInline`.
- Caption wrap natural, tidak truncate silent.
- Menu tiga titik memiliki report/save/mute/block sesuai ownership.
- Post detail memakai bottom sheet pada mobile bila cocok dengan existing detail architecture; jangan memecahkan deep link.

### Loading/empty/error/success

Wajib:

- Skeleton activity.
- Skeleton post.
- Empty post.
- Empty following.
- Empty saved.
- Inline activity error.
- Full feed error + retry.
- Upload progress.
- Like optimistic rollback.
- Save optimistic rollback.
- Follow optimistic rollback.
- Toast success 3–4 detik.
- Confirmation sebelum delete.
- Report confirmation.

### Accessibility

- Semantic `main`, `section`, `article`, `nav`.
- `role=tablist`/`role=tab` untuk filter.
- `aria-selected`, `aria-pressed`, `aria-busy`.
- Keyboard Enter/Space untuk card interactive.
- Focus-visible ring.
- Reduced motion.
- Alt text media yang bermakna; decorative thumbnails `alt=""`.
- Jangan gunakan emoji sebagai icon control final; pakai lucide/shared icon pattern.

---

## 8. Data flow lintas fitur

```text
Customer registration/profile
  → pos.customers.share_purchase_activity + name mode
  → settled canonical order
  → create_customer_community_purchase_activity(order_id)
  → activity_events (snapshot + expiry + visibility)
  → Worker filters privacy/status/time
  → customer community feed

Customer creates post
  → Worker auth
  → upload grant
  → R2 media
  → post row
  → optional product tag validation
  → feed response

Customer likes/comments/saves/follows
  → Worker auth + idempotent table write
  → response actual state
  → optimistic UI rollback on failure

Customer clicks product
  → canonical customer order route
  → existing payment/settlement
  → existing finance/inventory lifecycle
  → no direct Community mutation to finance/inventory

Customer reports post
  → reports queue
  → admin moderation route
  → publish/hide/remove
  → media visibility rechecked
```

### AI/LLM integration

Tidak diperlukan untuk MVP UI cleanup, post, save, follow, atau product tag.

Fase opsional:

- Suggest caption.
- Classify report reason.
- Detect spam/abuse.
- Recommend related menu.

Guardrails:

- AI tidak boleh mempublikasikan konten tanpa user confirmation.
- AI tidak boleh menentukan status pembayaran/order.
- AI tidak boleh mengubah price/availability.
- AI output disimpan sebagai suggestion, bukan source of truth.

### Telegram integration

Tidak diperlukan untuk feed MVP.

Jika kelak dipakai:

- Hanya notifikasi moderation/admin atau campaign yang disetujui.
- Anti-duplicate dengan canonical event id.
- Tidak mengirim isi/private purchase activity ke grup tanpa consent.
- Tidak menambahkan bot notification loop dari setiap like/comment.

### Purchasing agent sync

Tidak diperlukan dan tidak boleh membaca Community posts sebagai purchase order. Purchase activity hanya berasal dari settled canonical order. Purchasing agent tetap bekerja pada domain procurement/inventory.

---

## 9. No-hardcode audit

### Harus berasal dari DB/catalog/admin settings

- Nama menu.
- Harga menu.
- Gambar menu.
- Status availability.
- Quantity stock.
- Nutrition.
- Nama customer yang ditampilkan pada activity.
- Privacy mode.
- Activity expiry/visibility.
- Prompt harian.
- Poll question/options.
- Promo title/value/condition.
- Moderation policy text jika admin-controlled.
- Product tag labels.
- Feed ranking/configuration.

### Boleh tetap sebagai constant teknis

- Maximum body length 1000, jika server/client contract sama.
- Maximum image/video bytes, jika server/client contract sama.
- Maximum video 60 detik.
- Page size upper bound.
- Cursor encoding format.
- API path.
- Allowed MIME types.
- Animation duration/token design.

### Tidak boleh dilakukan

- Hardcode nama produk di JSX.
- Hardcode harga atau diskon.
- Hardcode status sold out.
- Menggunakan mock post sebagai fallback production.
- Menggunakan user name default `Teman Djiwa` untuk semua user tanpa membedakan privacy mode.
- Menganggap activity event sebagai bukti pembayaran baru; bukti settlement tetap dari canonical order/finance checks.

---

## 10. Testing dan verification plan

### Unit tests

Target baru atau existing test location sesuai konvensi repo:

- `community-client` response mapping.
- Activity grouping.
- Cursor pagination dedupe.
- Visibility/expiry filtering helper.
- Product availability guard.
- Save/follow state transitions.
- Optimistic rollback.
- Report reason mapping.

### Worker/API tests

- Unauthenticated request → 401.
- Disallowed origin → 403.
- Activity hanya menampilkan `visibility=public`, `status=active`, `visible_at <= now`, `expires_at > now`.
- Customer opt-out tidak membuat event baru.
- Purchase activity hanya dari settled eligible order.
- Duplicate save/follow idempotent.
- Self-follow rejected.
- User tidak dapat save/comment/report dengan payload invalid.
- Media ownership dan content type tetap tervalidasi.
- Product tag hanya menerima product id valid.
- Admin moderation hanya moderator.
- Report duplicate tidak menggandakan queue/count.

### Frontend E2E/manual QA

Viewport minimal:

- 390×844.
- 430×932.
- Desktop ≥900px.

Scenario:

1. Buka Komunitas sebagai customer authenticated.
2. Feed initial viewport menampilkan composer + posts; activity tidak mendominasi.
3. Switch `Untuk Kamu`, `Postingan`, `Aktivitas`, `Mengikuti`.
4. Pull refresh / refresh banner.
5. Load more posts/activity.
6. Create text post.
7. Create image post.
8. Reject oversized media.
9. Like/unlike dengan optimistic update dan simulated error.
10. Open comment detail, add/edit/delete comment.
11. Save/unsave post.
12. Follow/unfollow author.
13. Tag menu dan buka order route.
14. Product unavailable state.
15. Delete own post dengan confirmation.
16. Report post dengan reason.
17. Profile privacy toggle purchase activity.
18. Logout/session expiry.
19. Empty state.
20. API error/retry state.
21. Admin open report, publish/hide/remove, read back queue.
22. Verify no horizontal overflow, no clipped labels, no bottom-nav overlap.
23. Verify keyboard/focus/reduced motion.

### Verifiable output wajib

- Frontend build output.
- Worker typecheck/build output.
- API response nyata untuk GET posts/activity dan save/follow.
- Screenshot viewport 390×844 dan 430×932 setelah implementasi.
- Admin moderation response dan read-back queue.
- Query result untuk schema/index/RLS verification.

---

## 11. Deployment dan rollback

### Deployment order

1. Additive DB migration.
2. Verify migration/index/constraint/RLS.
3. Deploy Worker with backward-compatible endpoints.
4. Verify Worker API through same-origin proxy.
5. Deploy customer frontend only after API response shape verified.
6. Deploy admin changes.
7. Run smoke tests and screenshot QA.

### Scope discipline

- Deploy only changed customer app files, Worker, migrations, and admin files from this session.
- Check `git diff --name-only HEAD` before staging.
- Use selective `git add <exact-file>...`; never `git add -A` or `git add .`.
- Do not deploy unrelated Edge Functions.

### Rollback

- Frontend rollback ke bundle sebelumnya tanpa rollback DB additive.
- Worker endpoint baru harus backward-compatible.
- Jangan drop table/column/index pada rollback.
- Jika product-tag feature gagal, hide UI feature flag tanpa menghapus existing post.
- Jika activity rendering gagal, fallback ke activity tab lama yang tetap server-filtered.
- Jika migration gagal, stop sebelum frontend deploy.

---

## 12. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Activity tetap terasa seperti log transaksi | Compact rail, grouping, cap initial items, dedicated activity tab |
| Privacy leak nama/pembelian | Server-side visibility, consent, snapshot policy, integration tests |
| Order flow rusak dari Community | Reuse canonical order route; no new payment path |
| Save/follow spam | Unique keys, rate limit, auth, idempotency |
| Feed terlalu algoritmik | Start chronological; add personalization only with evidence |
| UI terlalu padat | Space budget, screenshot QA, 44px targets |
| Media R2 orphan object | Cleanup job/metadata validation after failed post creation |
| Moderation queue tidak actionable | Structured reason, content preview, read-back status |
| Schema mismatch Worker/frontend | Contract tests and additive response fields |
| Existing feature regression | Baseline tests before patch; smoke all existing routes |
| Cross-app inconsistency | Scope currently `apps/customer`; do not copy to merchandise unless explicitly requested and mounted/verified |

---

## 13. Urutan file yang kemungkinan berubah

### Wave 0–1

- `apps/customer/src/routes/$username/komunitas.lazy.tsx`
- `apps/customer/src/routes/$username/komunitas/$postId.lazy.tsx`
- `apps/customer/src/features/community/community-types.ts`
- `apps/customer/src/features/community/community-client.ts`
- `workers/customer-community/src/index.ts`

### Wave 2

- `supabase/migrations/<new-community-discovery-engagement>.sql`
- `apps/customer/src/features/community/community-types.ts`
- `apps/customer/src/features/community/community-client.ts`
- `apps/customer/src/routes/$username/komunitas.lazy.tsx`
- `apps/customer/src/routes/$username/komunitas/$postId.lazy.tsx`

### Moderation

- `apps/admin/src/routes/admin/community.lazy.tsx`
- `apps/admin/src/routes/admin/community.tsx` hanya jika route metadata/navigation perlu disesuaikan.

### Tests

- Existing test directories setelah discovery.
- Tambah test file dekat feature, bukan membuat global test framework baru.

### Tidak diubah tanpa kebutuhan

- Historical order/finance migrations.
- Payment gateway logic.
- Inventory deduction.
- Telegram notification lifecycle.
- Merchandise app.
- Shared navigation assets.

---

## 14. Definition of Done

### UX

- [ ] Community posts terlihat sebelum activity list yang repetitif.
- [ ] Activity hanya menjadi compact social proof pada `Untuk Kamu`.
- [ ] Activity memiliki tab/detail sendiri.
- [ ] Semua CTA menjelaskan tujuan.
- [ ] Tidak ada overflow/truncation pada 390px.
- [ ] Bottom nav tidak menutupi konten.
- [ ] Loading/empty/error/success/confirmation tersedia.

### Data/security

- [ ] Privacy purchase activity enforced server-side.
- [ ] No service-role key di client/bundle.
- [ ] No hardcoded product/price/promo.
- [ ] Product availability guard benar.
- [ ] New tables indexed and RLS/revoke policy verified.
- [ ] Historical order/finance tidak berubah.

### Backend

- [ ] Existing endpoints tetap backward-compatible.
- [ ] New save/follow/tag endpoints idempotent dan authenticated.
- [ ] Cursor pagination bounded.
- [ ] Media ownership validation tetap lulus.
- [ ] Moderation read-back verified.

### Release

- [ ] Frontend build lulus.
- [ ] Worker build/typecheck lulus.
- [ ] Migration dry-run/apply + query verification lulus.
- [ ] E2E/manual smoke test lulus.
- [ ] Screenshot evidence 390px/430px tersedia.
- [ ] `git diff --name-only HEAD` diaudit.
- [ ] Selective staging only.

---

## 15. Pertanyaan keputusan sebelum implementasi

1. Untuk activity purchase, apakah produk final yang diinginkan adalah **anonymous aggregate** atau tetap menampilkan first name jika user memberi consent?
2. Apakah `Mengikuti` langsung masuk MVP Wave 2, atau ditunda setelah save/product tagging?
3. Apakah Community post boleh menandai lebih dari satu menu?
4. Apakah post dengan tag menu boleh langsung memiliki CTA `Pesan menu`, atau hanya admin/official account yang boleh menandai produk?
5. Apakah Stories sudah ingin masuk fase implementasi pertama, atau tetap backlog setelah feed cleanup?

Rekomendasi default: mulai dari **Wave 0 → Wave 1 → Wave 2**, lalu lakukan screenshot QA sebelum menyentuh polling, Stories, reward, dan personalization.
