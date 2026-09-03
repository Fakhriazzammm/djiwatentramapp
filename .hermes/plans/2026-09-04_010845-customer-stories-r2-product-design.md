# Customer Stories — Product Design & Implementation Plan

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task.

**Goal:** Menambahkan fitur Story 24 jam di Home Customer Djiwa Tentram, dengan pengalaman ala Instagram Story untuk seluruh customer login, tanpa menyimpan media di PostgreSQL utama atau filesystem VPS.

**Architecture:** Frontend Customer App mengunggah media langsung ke Cloudflare R2 melalui signed upload URL dari Cloudflare Worker. Worker menyaring Story berdasarkan `expiresAt`, sehingga Story tidak lagi terlihat setelah 24 jam. PostgreSQL utama tidak mendapat tabel atau kolom Story; bila index/report/block diperlukan, gunakan metadata R2 dan Cloudflare KV secara minimal.

**Tech Stack:** React 19, Vite 6, TanStack Router, Tailwind CSS 4, shared UI components, Lucide, Framer Motion, Cloudflare Worker, Cloudflare R2, optional Cloudflare KV.

**Design contract:** `/opt/djiwatentramapp/DESIGN.md` adalah source of truth token project. Semua keputusan UI wajib mengikuti `frontend-design/ai-product-design-dna` dan `creative/design-md`.

---

## 1. Product Scope

### Keputusan yang sudah disetujui

- Audience: seluruh customer yang login.
- Story sendiri selalu berada paling kiri.
- Customer dapat publish langsung tanpa approval admin.
- Media: foto dan video maksimal 15 detik.
- Visibility: 24 jam sejak upload.
- Storage: Cloudflare R2 + Cloudflare Worker.
- PostgreSQL utama: tidak ada migration Story.
- VPS: tidak menyimpan file Story.
- MVP tidak mencakup likes, komentar, reply, live streaming, atau follower graph.

### User flow

```text
Home Customer
  → tekan “+” pada Story Anda
  → pilih Foto / Video
  → preview + validasi
  → upload progress
  → publish success
  → Story muncul paling kiri

Home Customer
  → tekan Story customer lain
  → viewer full-screen
  → tap kanan/kiri atau swipe
  → close / kembali ke Home
```

### Non-goals

- Tidak membuat social network penuh.
- Tidak membuat tabel `stories` di Supabase.
- Tidak upload binary melalui VPS.
- Tidak mengubah flow order, saldo, benefit, promo, riwayat, atau bottom navigation.

---

## 2. Current Context Verified

Target Home Customer yang sudah ditemukan:

- `apps/customer/src/components/customer/customer-home-sections.tsx`
  - greeting `Selamat pagi/siang/sore/malam` dan nama customer berada di section teratas.
- `apps/customer/src/components/customer/customer-shell.tsx`
  - shell Customer dan tab `Menu Cafe` / `Merchandise`.
- `apps/customer/src/components/customer/recent-orders-carousel.tsx`
  - section `Pesanan terakhir`.

Salinan serupa juga ada di:

- `apps/merchandise/src/components/customer/customer-home-sections.tsx`
- `apps/b2b/src/components/customer/customer-home-sections.tsx`

**Scope rollout saat ini:** implementasi dan verifikasi dilakukan pada `apps/customer` dan `apps/merchandise`, karena keduanya menggunakan route customer `/$username` dengan layout/catalog berbeda. `apps/b2b` tetap tidak diubah.

Existing design source of truth:

- `/opt/djiwatentramapp/DESIGN.md`
- `packages/yumipos-web-shared/src/theme.css`
- `packages/yumipos-web-shared/src/components/ui/`
- `apps/customer/src/index.css`

Existing deployment context:

- Customer App berada di Cloudflare Pages.
- Repository memiliki `wrangler.toml`; binding R2/KV dan konfigurasi Worker wajib diaudit sebelum membuat file baru.

---

## 3. Alternatives Analysis

### Option A — R2 + Worker, tanpa tabel PostgreSQL (dipilih)

| Pros | Cons |
|---|---|
| Tidak membebani VPS atau DB utama | Worker perlu menangani auth, listing, expiry, dan rate limit |
| Media cocok untuk object storage | R2 listing perlu dioptimalkan jika volume sangat besar |
| Biaya dan operational overhead relatif rendah | Report/block memerlukan KV atau layanan eksternal |
| Expiry dapat ditegakkan sebelum URL media diberikan | Physical deletion lifecycle bersifat asynchronous |

### Option B — Supabase Storage + metadata PostgreSQL

| Pros | Cons |
|---|---|
| Integrasi auth dan client SDK lebih sederhana | Menambah object dan metadata ke infrastruktur utama |
| RLS dan query familiar | Tidak sesuai kekhawatiran user tentang DB/VPS |
| Lebih cepat untuk prototype | Cleanup, index, dan video bandwidth tetap perlu dikelola |

### Option C — Managed media platform seperti Cloudinary/Mux

| Pros | Cons |
|---|---|
| Transformasi image/video dan delivery lebih matang | Biaya dan ketergantungan provider lebih tinggi |
| Video processing lebih stabil | Tetap membutuhkan metadata/index untuk feed |
| Signed delivery tersedia | Lebih kompleks dari kebutuhan MVP foto + video 15 detik |

### Rekomendasi

Gunakan **Option A**. R2 menyimpan binary, Worker menjadi boundary security/API, dan KV hanya ditambahkan bila listing/report/block tidak aman atau tidak efisien tanpa index. Ini paling sesuai dengan constraint “tidak di database kita dan tidak di VPS”.

---

## 4. UI/UX Product Design Specification

### 4.1 Placement dan hierarchy

Posisi Story row:

```text
Customer shell/header
  └── Greeting + nama customer
      └── Story rail                 ← fitur baru
          └── tab Menu Cafe/Merchandise
              └── promo/banner existing
                  └── saldo/benefit/reward existing
                      └── Pesanan terakhir existing
                          └── bottom navigation existing
```

Story rail adalah satu section ringkas, bukan hero besar. Tujuannya memberi discovery ringan tanpa menggeser primary actions Home.

### 4.2 Visual language

Mengikuti `DESIGN.md` dan AI Product Design DNA:

- Light surface, background putih/near-white.
- Deep Azure `#1a5dc6` sebagai accent utama.
- Navy/gold hanya bila berasal dari asset/brand contract yang sudah ada; jangan menambah accent baru.
- Story card/avatar berbentuk lingkaran; ring aktif memakai accent brand.
- Control dan action minimal 44×44px.
- Major card tidak diperlukan; rail menggunakan spacing ringan agar Home tidak penuh card.
- Display font tetap `Plus Jakarta Sans`; body tetap `Geist/Inter fallback`.
- Ikon UI memakai Lucide line icon 2px; tidak memakai emoji sebagai icon.
- Tidak menaruh text penting di dalam generated image.

### 4.3 Story rail

- Root semantic: `<section aria-labelledby="customer-stories-title">`.
- Heading visual dapat ringkas: `Story hari ini` atau `Cerita terbaru`.
- Story sendiri:
  - belum ada: avatar placeholder + tombol `+` yang jelas;
  - sudah ada: thumbnail terbaru + ring accent + label `Story Anda`;
  - upload in-flight: progress ring dan disabled state.
- Story customer lain:
  - thumbnail circular dengan `object-cover`;
  - nama satu baris dengan truncation hanya pada label non-kritis, bukan pada action/error;
  - status viewed/unviewed tidak hanya dibedakan warna; gunakan ring/aria-label.
- Rail memakai `flex`, `overflow-x-auto`, `snap-x`, dan stable minimum item width.
- Page tidak boleh memperoleh horizontal overflow; hanya rail yang scroll horizontal.
- Scrollbar boleh disembunyikan, tetapi keyboard focus tetap terlihat.

### 4.4 Upload sheet

Gunakan bottom sheet iOS-style pada mobile dan centered dialog/sheet pada desktop:

- Title: `Tambah Story`.
- Pilihan utama: `Foto` dan `Video`.
- File picker menerima `image/*` atau `video/*` sesuai pilihan.
- Preview wajib sebelum publish.
- Foto: kompres client-side tanpa menurunkan kualitas secara destruktif.
- Video: validasi durasi maksimal 15 detik, MIME, dan ukuran.
- CTA primary: `Bagikan Story`.
- Secondary: `Batal`.
- Saat upload: CTA disabled, progress jelas, tidak boleh double-submit.
- Gagal: pesan inline aman + `Coba lagi`; file preview tidak hilang secara tidak perlu.
- Berhasil: toast/state success, sheet ditutup, rail direfresh.

### 4.5 Viewer

- Full-screen mobile surface dengan media sebagai fokus utama.
- Progress segments di area atas dengan safe-area inset.
- Tap area kiri/kanan untuk previous/next.
- Tombol close minimal 44×44px dan memiliki label programatik.
- Foto auto-advance sekitar 5 detik.
- Video berjalan maksimal durasi file dan tidak melampaui expiry.
- Pause saat tab hidden; resume/refetch saat tab kembali terlihat.
- Swipe down untuk close jika gesture tidak mengganggu tap navigation.
- Loading media memakai skeleton/placeholder; error memakai retry/close.
- Story expired tidak dibuka meskipun URL lama masih berada di browser cache.
- `prefers-reduced-motion` menonaktifkan transform dekoratif, bukan menghilangkan state change penting.

### 4.6 Required UX states

| State | UI behavior |
|---|---|
| Loading | Skeleton avatar rail, bukan spinner text sebagai satu-satunya feedback |
| Empty | Story sendiri tetap menampilkan CTA `+`; feed kosong tidak membuat layout collapse tanpa penjelasan |
| Error feed | Inline message singkat + `Coba lagi`; Home existing tetap usable |
| Upload preview | Preview media + metadata validasi |
| Upload saving | Progress, disabled CTA, double-submit lock |
| Upload success | Toast/state success + Story baru muncul |
| Upload error | Pesan aman, retry, file preview dipertahankan |
| Expired | Story disaring dari feed; viewer menutup/skip dengan aman |
| Confirmation | Konfirmasi sebelum delete Story atau block/report destructive action |
| Offline/stale | Tampilkan status bahwa Story mungkin belum terbaru; jangan mengarang data |

### 4.7 Accessibility and responsive acceptance

- Keyboard: rail item, plus button, close, previous, next, report, block dapat difokuskan dan dioperasikan Enter/Space.
- `aria-label` menjelaskan owner dan status Story.
- WCAG AA contrast.
- Touch target minimum 44×44px.
- Viewport QA: 375px, 390px, 430px, 768px, 1024px, 1440px.
- Tidak ada story rail yang menutupi bottom nav.
- Safe-area top/bottom dihormati.
- Tidak memakai `truncate` pada pesan penting atau error.

---

## 5. Data and Storage Contract

### 5.1 PostgreSQL schema

**Tidak ada perubahan schema PostgreSQL.** Tidak membuat tabel, view, kolom, index, atau migration Story.

Existing customer identity tetap menjadi sumber authorization, tetapi Worker tidak boleh menyalin profil lengkap customer ke R2 metadata. Simpan hanya identifier minimal yang dibutuhkan untuk owner/display policy.

### 5.2 R2 object contract

Object key candidate:

```text
stories/{customerSourceId}/{storyId}/{createdAt}-{expiresAt}.{extension}
```

Metadata minimal:

```json
{
  "storyId": "opaque-id",
  "ownerSourceId": "customer-source-id",
  "createdAt": "ISO-8601",
  "expiresAt": "ISO-8601",
  "mediaType": "image|video",
  "contentType": "image/webp|video/mp4"
}
```

Jangan menyimpan nama lengkap, email, nomor WhatsApp, saldo, order, atau PII lain sebagai object metadata.

### 5.3 Worker API contract

Route final mengikuti prefix existing setelah audit `wrangler.toml` dan deployment conventions.

Candidate endpoints:

- `POST /stories/upload-url`
  - auth: customer session/token;
  - input: media type, extension, size, optional duration;
  - output: signed upload URL + opaque `storyId` + `expiresAt`.
- `GET /stories`
  - auth: logged-in customer;
  - output: active Story summaries grouped/orderable for rail;
  - never return expired objects.
- `GET /stories/{storyId}/media`
  - auth: logged-in customer;
  - returns media only through the authenticated Worker response after expiry check.
- `DELETE /stories/{storyId}`
  - auth + owner check;
  - delete only owner object.
- `POST /stories/{storyId}/report`
  - auth; store minimal report in KV or approved moderation service.
- `POST /stories/{storyId}/block`
  - auth; store block state in KV if block is included in MVP.

Response shape mengikuti convention API project: `{ data?, error?, details? }`. Internal storage errors tidak dikirim ke client.

### 5.4 Expiry and cleanup

- Worker menghitung `expiresAt = createdAt + 24h` berdasarkan server time, bukan client time.
- `GET /stories` filter expired sebelum response.
- Media delivery selalu mengulang expiry check.
- R2 lifecycle rule menjadi physical cleanup safety net.
- Cleanup asynchronous tidak boleh dijadikan satu-satunya expiry enforcement.
- Cache-Control media harus cukup pendek agar expired Story tidak tampil dari CDN cache.

---

## 6. Integration Points

### Customer App

| Area | Integration |
|---|---|
| Home greeting | Insert Story rail setelah greeting/name di `apps/customer/src/components/customer/customer-home-sections.tsx` |
| Auth | Reuse existing customer auth/session hook; jangan membuat auth kedua |
| Shared UI | Reuse shared Sheet/Dialog/Button/Skeleton/Toast primitives |
| Theme | Gunakan `packages/yumipos-web-shared/src/theme.css` dan `apps/customer/src/index.css` |
| Routing | Viewer/upload cukup modal state untuk MVP; route baru hanya jika deep-link/share benar-benar dibutuhkan |
| PWA | Audit service worker agar tidak cache signed media secara permanen |

### apps/merchandise dan apps/b2b

- `apps/merchandise` ikut rollout dengan `CustomerStoryRail` dan modul Story yang sama, tetapi tetap mempertahankan hierarchy/catalog Merchandise.
- `apps/b2b` tidak ikut rollout dan tidak diubah.
- Kedua storefront Customer dan Merchandise memakai Worker/R2 contract yang sama serta origin CORS masing-masing.

### Admin

- Tidak ada admin approval pada MVP.
- Jika report/block aktif, tahap berikutnya dapat menambahkan read-only moderation queue di Admin memakai Cloudflare Worker/KV, bukan membaca tabel POS.
- Jangan menambah menu Admin sebelum moderation workflow disetujui.

### AI/LLM

- Tidak ada integrasi AI pada MVP.
- AI moderation tidak boleh ditambahkan diam-diam karena berdampak pada biaya, false positive, privacy, dan policy.
- Jika diperlukan, buat proposal terpisah dengan human review/fallback.

### Telegram / purchasing / finance agents

- Tidak ada integrasi.
- Story bukan transaksi, inventory, finance, attendance, atau notification operasional.
- Jangan mengirim Story event ke Telegram pada MVP untuk mencegah noise dan notification loop.

---

## 7. No-Hardcode Audit

Nilai berikut tidak boleh hardcode di React:

- customer identity/owner;
- Story timestamps;
- `expiresAt`;
- media URL;
- active Story list;
- report/block state;
- upload authorization.

Nilai konfigurasi yang boleh berasal dari environment/Worker binding:

- R2 bucket binding;
- KV namespace binding bila dipakai;
- allowed MIME types;
- max photo bytes;
- max video bytes;
- max duration 15 detik;
- rate limit;
- lifecycle policy.

Business/admin-controlled limits harus bisa diubah melalui Worker config atau approved settings, bukan tersebar sebagai magic number di beberapa komponen. Bila belum ada settings source, satu constant module di Worker menjadi temporary source of truth dan dicatat sebagai follow-up.

---

## 8. Implementation Tasks

### Task 1: Audit Customer route, shared components, and Cloudflare bindings

**Profile:** `subagent-frontend` + read-only Worker/config audit.

**Files to inspect:**

- `apps/customer/src/components/customer/customer-home-sections.tsx`
- `apps/customer/src/components/customer/customer-shell.tsx`
- `apps/customer/src/index.css`
- `packages/yumipos-web-shared/src/theme.css`
- `packages/yumipos-web-shared/src/components/ui/`
- `wrangler.toml`
- `package.json` / workspace configuration

**Output:** exact insertion point, existing auth hook, existing Sheet/Dialog/Toast/Skeleton components, Worker location/bindings, and no unrelated file edits.

### Task 2: Define shared Story domain types and pure expiry/validation helpers

**Likely files:**

- Create: `apps/customer/src/features/stories/story-types.ts`
- Create: `apps/customer/src/features/stories/story-validation.ts`
- Test: `apps/customer/src/features/stories/story-validation.test.ts` if Vitest setup exists

**Requirements:**

- opaque `storyId`;
- `createdAt`/`expiresAt` parsing;
- server timestamp treated as authoritative;
- MIME/size/duration validation;
- expired Story predicate;
- deterministic tests for just-before, at, and after expiry;
- no PII in client Story type.

### Task 3: Implement R2/Worker upload and feed contract

**Likely files after Task 1 confirms Worker workspace:**

- Create/modify: exact Worker entrypoint from `wrangler.toml` audit
- Create/modify: Worker validation and R2 object-key helper
- Test: Worker request tests or pure helper tests

**Requirements:**

- signed upload URL;
- session/auth validation;
- server-generated `createdAt` and `expiresAt`;
- max duration 15 seconds;
- MIME allowlist and byte limits;
- `{ data?, error?, details? }` responses;
- feed filters expired objects;
- owner-only delete;
- no secret in frontend bundle or logs;
- R2 lifecycle configuration documented.

### Task 4: Build Customer Story data hook/client

**Likely files:**

- Create: `apps/customer/src/features/stories/use-customer-stories.ts`
- Create: `apps/customer/src/features/stories/stories-client.ts`

**Requirements:**

- reuse existing auth/session client;
- loading/error/empty states exposed explicitly;
- abort stale requests;
- no polling loop by default;
- refetch after upload/delete;
- pause viewer/fetch activity when tab hidden;
- normalize Worker response defensively.

### Task 5: Build Story rail UI

**Likely files:**

- Create: `apps/customer/src/features/stories/customer-story-rail.tsx`
- Create: `apps/customer/src/features/stories/story-avatar.tsx`
- Modify: `apps/customer/src/components/customer/customer-home-sections.tsx`

**Requirements:**

- insert after greeting/name;
- own Story first;
- horizontal rail only inside component;
- 44px+ controls;
- semantic labels and visible focus;
- use existing tokens/components;
- no changes to menu, wallet, promo, recent orders, or bottom nav behavior.

### Task 6: Build upload sheet and client-side media validation

**Likely files:**

- Create: `apps/customer/src/features/stories/story-upload-sheet.tsx`
- Create: `apps/customer/src/features/stories/media-preview.tsx`
- Create: `apps/customer/src/features/stories/media-compression.ts`

**Requirements:**

- photo/video chooser;
- preview before publish;
- video duration check;
- image compression;
- upload progress;
- imperative submit lock;
- retry while retaining preview;
- success toast and rail refresh;
- reduced-motion sheet animation.

### Task 7: Build full-screen Story viewer

**Likely files:**

- Create: `apps/customer/src/features/stories/story-viewer.tsx`
- Create: `apps/customer/src/features/stories/story-progress.tsx`

**Requirements:**

- full-screen mobile viewer;
- progress segments;
- photo timer and video completion;
- tap navigation;
- close and back behavior;
- media loading/error/expired handling;
- safe area;
- keyboard controls;
- pause on hidden tab;
- no stale expired media display.

### Task 8: Add report/block/delete actions safely

**Likely files:**

- Modify: `story-viewer.tsx`
- Modify: `story-upload-sheet.tsx` or Story owner action menu
- Worker moderation handler from Task 3
- Test: report/block/delete authorization tests

**Requirements:**

- confirmation before destructive actions;
- owner can delete own Story only;
- viewer can report/block without exposing internal IDs in UI;
- idempotent action handling;
- safe user-facing errors;
- no Telegram notification integration.

### Task 9: Add design contract notes and operational documentation

**Files:**

- Modify: `/opt/djiwatentramapp/DESIGN.md` only if new Story tokens/variants are needed
- Create/update: Worker README or feature documentation at confirmed Worker path
- Do not create per-page token fork

**Requirements:**

- document Story ring, sheet, viewer, and media states;
- document R2 lifecycle and expiry distinction;
- document size/duration/rate limits;
- document privacy and moderation policy;
- use token references rather than duplicated hex values.

### Task 10: Verify build, runtime, security, and visual output

**Commands:**

```bash
cd /opt/djiwatentramapp
bunx turbo build --filter=@yumipos/customer
cd apps/customer
node ../../node_modules/vite/bin/vite.js build
git diff --check
```

**Browser matrix:**

- 375px and 430px mobile viewport;
- 768px tablet;
- 1440px desktop centered shell;
- logged-out redirect/guard;
- customer with no Story;
- customer with own Story;
- multiple customer Stories;
- expired Story;
- upload photo success/failure;
- video 15 seconds accepted;
- video over 15 seconds rejected;
- viewer navigation and close;
- tab hidden/resume;
- no horizontal page overflow;
- no console errors.

**External verification:**

- upload test object to a non-production/test prefix;
- read feed back through Worker;
- confirm expiry filtering;
- confirm R2 object metadata/key;
- delete test object and verify deletion;
- never create production order/payment during this feature test.

---

## 9. Dependency Graph and Execution Waves

```text
Wave 1 — independent discovery/design
├── Task 1: route/shared/Cloudflare audit
└── Task 2: domain types + pure validation tests

Wave 2 — backend/client foundations
├── Task 3: Worker + R2 contract       ← Task 1
└── Task 4: Customer stories client    ← Task 1 + Task 2

Wave 3 — UI components
├── Task 5: Story rail                  ← Task 2 + Task 4
├── Task 6: Upload sheet                ← Task 2 + Task 4
└── Task 7: Viewer                      ← Task 2 + Task 4

Wave 4 — moderation and docs
├── Task 8: report/block/delete         ← Task 3 + Task 7
└── Task 9: design/operations docs      ← Task 5 + Task 6 + Task 7

Wave 5 — final verification
└── Task 10: build + browser + storage  ← all previous tasks
```

Tasks modifying the same file must be sequential. In particular, modifications to `customer-home-sections.tsx` happen only after the rail component is stable.

---

## 10. Risk, Trade-off, and Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| R2 list becomes slow at high volume | Feed latency/cost | Start with bounded listing; introduce KV index before scale |
| Lifecycle deletion is asynchronous | Old objects remain physically longer | Enforce expiry in Worker before URL/feed response |
| CDN/browser cache shows expired media | Privacy/UX issue | Short cache, signed URL, expiry check on delivery |
| Direct publish abuse | Storage/bandwidth cost | Auth, rate limit, size/duration limits, report/block |
| Unsupported mobile video codec | Viewer failure | MIME/codec validation plus clear retry; document supported formats |
| Worker cannot validate existing customer session | Broken auth boundary | Audit current auth handoff before implementation; do not guess token format |
| Story rail causes page overflow | Mobile UX regression | Constrain overflow to rail and test 375px viewport |
| Image compression increases CPU usage | Upload delay | Bound image dimensions/quality and show progress |
| Block/report data has no persistence | Moderation ineffective | Use Cloudflare KV or explicitly defer those actions from MVP |
| Scope leaks into Merchandise/B2B | Cross-app regression | Customer-only rollout, explicit domain boundary, separate later plan |

---

## 11. Definition of Done

- [ ] Story rail berada tepat setelah greeting/nama pada Customer Home.
- [ ] Story sendiri selalu paling kiri dengan tombol `+` saat kosong.
- [ ] Semua customer login dapat melihat Story aktif.
- [ ] Foto dan video maksimal 15 detik dapat dipublish.
- [ ] Story expired tidak muncul dan tidak dapat dibuka.
- [ ] Media tidak disimpan di PostgreSQL utama atau filesystem VPS.
- [ ] Signed upload dan media delivery terlindungi auth/expiry.
- [ ] Loading, empty, error, success, saving, confirmation, dan stale/offline states tersedia.
- [ ] Viewer mendukung progress, tap navigation, close, keyboard, safe area.
- [ ] Report/block/delete memiliki authorization dan confirmation yang benar.
- [ ] `DESIGN.md`, AI Product Design DNA, dan shared tokens diikuti.
- [ ] Tidak ada emoji sebagai UI icon atau token fork per halaman.
- [ ] Responsive matrix lulus tanpa accidental overflow.
- [ ] Build/typecheck/lint relevan lulus.
- [ ] Browser screenshot final benar-benar diperiksa.
- [ ] Worker/R2 response dan cleanup test diverifikasi.
- [ ] Hanya file Customer/Worker Story yang masuk perubahan; tidak ada deploy silang Admin/POS/B2B.

## 12. Open Questions Before Implementation

1. Apakah report/block wajib masuk MVP, atau cukup upload/delete dulu agar benar-benar tanpa metadata tambahan?
2. Batas ukuran final yang disetujui untuk foto dan video berapa MB?
3. Apakah Story boleh menampilkan nama customer lengkap, atau cukup nama depan/username?
4. Apakah Cloudflare account sudah memiliki R2 dan Workers binding yang bisa dipakai, atau perlu provisioning terpisah?

## Implementation status (verified 2026-09-03)

- [x] `apps/customer` dan `apps/merchandise` memiliki Story rail pada route `/$username` setelah greeting.
- [x] Worker dedicated deployed di `djiwa-customer-stories.zantaratechnology.workers.dev`.
- [x] R2 bucket `djiwa-customer-stories` dan KV moderation namespace terikat.
- [x] Typecheck dan direct Vite build lulus untuk kedua app.
- [x] Route bundles kedua app memuat marker Story dan API Worker.
- [x] Foto/video validation, expiry server 24 jam, owner delete, report, dan block tersedia.
- [x] Artifact kedua app disalin non-destruktif ke webroot canonical VPS.
- [ ] Browser visual/authenticated E2E dan external HTTPS smoke test masih menunggu runtime network/browser approval.

**Plan status:** implemented for Customer + Merchandise; B2B intentionally out of scope. Production HTTP/browser evidence belum diklaim tanpa akses runtime yang valid.
