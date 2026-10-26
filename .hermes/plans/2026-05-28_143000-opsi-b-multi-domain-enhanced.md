# Plan: Split Monorepo — Opsi B (Multi-Domain + Enhanced)

**Date:** 2026-05-28
**Author:** Hermes Agent (updated from 2026-05-15 plan)
**Status:** Draft — with enhancements
**Previous plan:** `.hermes/plans/2026-05-15_203000-opsi-b-split-internal-customer.md`

---

## 1. Goal

Pisahkan satu Vite PWA (`apps/web`) menjadi **dua app terpisah** dengan **dua domain berbeda**, sharing backend Supabase yang sama.

| App | Domain | Audience | PWA Name | Auth (Phase 1) | Auth (Phase 2) |
|---|---|---|---|---|
| **POS** (internal) | `pos.djiwatentram.web.id` | Kasir, Admin, Owner | "Djiwa Tentram POS" | YumiAuth (PIN/email) | — |
| **Customer** | `djiwatentram.web.id` | Customer | "Djiwa Tentram App" | None (public) | Email + password (simple) |

Backend & database tetap **satu Supabase yang sama**. Shared code di `packages/yumipos-web-shared`.

### Key Differences from Previous Plan

| Aspect | Old Plan (May 15) | New Plan (May 28) |
|---|---|---|
| Internal domain | `app.djiwatentram.web.id` | `pos.djiwatentram.web.id` |
| Customer domain | `order.djiwatentram.web.id` | `djiwatentram.web.id` (root domain) |
| Deploy | Caddy/Nginx VPS | **Cloudflare Pages** (existing setup) |
| Bundle optimization | Not addressed | ✅ Per-app bundle analysis & tree-shaking |
| Cache strategy | Basic | ✅ Differentiated: POS network-first, Customer cache-first images |
| PWA icons | Same | ✅ Distinct icons per app |
| Monitoring | Not addressed | ✅ Separate analytics strategy |
| Multi-domain CORS | Not specified | ✅ Supabase allow-list both domains |

---

## 2. Current Context

### 2.1 Monorepo Structure (saat ini)

```
djiwatentramapp/
├── apps/
│   └── web/                  ← SATU APP (akan dihapus setelah migrasi)
│       ├── src/
│       │   ├── routes/       ← ~130 file route (POS + Admin + Customer + Public)
│       │   ├── components/
│       │   │   ├── admin/    ← admin-specific
│       │   │   ├── customer/ ← CustomerOrderingPage (1082 line)
│       │   │   ├── pos/      ← POS-specific
│       │   │   └── ui/       ← shared UI (23 files)
│       │   ├── hooks/        ← 30+ hooks
│       │   ├── context/      ← cart-context, app-data-context
│       │   ├── lib/          ← utils, client, bluetooth, offline, pricing
│       │   ├── types/
│       │   └── main.tsx
│       └── vite.config.ts    ← PWA "Djiwa Tentram POS"
├── packages/
│   ├── backend/              ← @yumipos/backend
│   ├── config/               ← @yumipos/config
│   └── env/                  ← @yumipos/env
└── turbo.json
```

### 2.2 Deploy Saat Ini

- **Cloudflare Pages**: auto-deploy dari GitHub push
- **Domain**: `app.djiwatentram.web.id` (current, single)
- **Build**: `turbo build` → serve `apps/web/dist`
- **Supabase Edge Functions**: auto-deploy via GitHub Actions

### 2.3 Route Mapping

**→ POS App** ("Djiwa Tentram POS" — internal, auth-required)
Semua route kecuali `/$brandSlug*` — ~126 file:
- `/`, `/login`, `/register`, `/register/selesai/*`
- `/home`, `/home/$section`, `/dashboard`
- `/menu` — POS Kasir (2343 line)
- `/attendance`, `/attendance/stock-opname`
- `/booking`
- `/karyawan/login`, `/karyawan/$username`
- `/admin/*` — 29+ route files

**→ Customer App** ("Djiwa Tentram App" — customer)
- `/$brandSlug` → CustomerOrderingPage (1082 line, 63KB)
- `/$brandSlug/minigames` → Mini games (spin wheel)
- `/profile/$slug` → Customer profile page (Phase 2, lihat order history, loyalty points)

---

## 3. Architecture: Multi-Domain + Cloudflare Pages

```
                    ┌──────────────────────────────┐
                    │        Supabase Backend       │
                    │  DB + RLS + Edge Functions    │
                    │  CORS: pos.djiwatentram.web.id,  │
                    │        djiwatentram.web.id       │
                    └──────┬──────────────┬────────┘
                           │              │
              ┌────────────▼──┐    ┌──────▼────────────┐
              │  POS App                  │    │  Customer App            │
              │  "Djiwa Tentram POS"      │    │  "Djiwa Tentram App"     │
              │                           │    │                          │
              │  pos.djiwa-               │    │  djiwatentram.web.id        │
              │  tentram.com              │    │                          │
              │                           │    │  Build: 1.5MB            │
              │  Build: 4.2MB             │    │  (no admin/pos)          │
              │  (full)                   │    │                          │
              │                           │    │  Cache:                  │
              │  Cache:                   │    │  - Images: 7d            │
              │  - Pages: 5s              │    │  - Pages: 5s             │
              │  - No img cache           │    │                          │
              │                           │    │  Phase 1: No auth        │
              │  Auth: YumiAuth           │    │  Phase 2: Email+Password │
              │  Offline: YES             │    │  Offline: NO             │
              └────────────────┘    └────────────────────┘

              ┌────────────────────────────────────────┐
              │     packages/yumipos-web-shared         │
              │  hooks/use-hybrid-pos-data (2071L)      │
              │  hooks/use-hybrid-write-actions (6084L) │
              │  hooks/use-hybrid-ops-data              │
              │  context/cart-context                   │
              │  lib/client, utils, pricing             │
              │  types/backend-compat                   │
              │  components/ui (button, input, sheet)   │
              └────────────────────────────────────────┘
```

---

## 4. Enhancement: Bundle Size Target

### 4.1 POS App — Yang TETAP

| Module | Size | Alasan |
|---|---|---|
| Semua route admin, POS, auth | ~4MB | Full feature |
| Face recognition | ~500KB | Login face scan |
| Bluetooth printer | ~15KB | Receipt printing |
| Offline manager | ~20KB | Offline queue |
| PWA version check | ~5KB | Force update |
| **Target total** | **~4.2MB** | (gzipped: ~1.2MB) |

### 4.2 Menu App — Yang DI-BUANG

| Module | Savings | Alasan |
|---|---|---|
| Admin route files (29+) | ~1.2MB | Gak perlu |
| POS components (9 files) | ~300KB | Gak perlu |
| Face recognition models | ~500KB | Gak perlu |
| Bluetooth printer | ~15KB | Gak perlu |
| Offline manager | ~20KB | Gak perlu |
| Complex PWA version check | ~3KB | Ganti autoUpdate |
| **Target total** | **~1.5MB** | (gzipped: ~400KB) |

**= 60-65% lebih kecil dari POS app.**

---

## 5. Enhancement: Cache Strategy Per App

### 5.1 POS App — `vite.config.ts` workbox

```ts
// NetworkFirst untuk SEMUA — data harus realtime
workbox: {
  navigateFallback: "/index.html",
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "pos-pages",
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 5, maxAgeSeconds: 60 },
      },
    },
    // JS/CSS assets: StaleWhileRevalidate (load cached dulu, update background)
    {
      urlPattern: /\.(?:js|css)$/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "pos-assets",
        expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
      },
    },
    // NO image caching — POS jarang load gambar
  ],
},
```

### 5.2 Menu App — `vite.config.ts` workbox

```ts
workbox: {
  navigateFallback: "/index.html",
  runtimeCaching: [
    {
      // Pages: NetworkFirst (order status harus realtime)
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "menu-pages",
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 10, maxAgeSeconds: 120 },
      },
    },
    {
      // Product images: CacheFirst, 7 hari — menu jarang berubah
      urlPattern: /\.(?:png|jpg|jpeg|webp|svg|gif)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "menu-images",
        expiration: { maxEntries: 200, maxAgeSeconds: 604800 },
      },
    },
    {
      // JS/CSS: StaleWhileRevalidate
      urlPattern: /\.(?:js|css)$/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "menu-assets",
        expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
      },
    },
  ],
},
```

**Mengapa penting:** Customer scan QR di meja → pertama kali load lambat (cold start). Setelah itu, gambar menu dari cache → instan. POS gak perlu cache gambar karena semua via local network.

---

## 6. Enhancement: Distinct PWA Manifests

### 6.1 POS App Manifest ("Djiwa Tentram POS")

```json
{
  "name": "Djiwa Tentram POS",
  "short_name": "Djiwa POS",
  "description": "Aplikasi kasir Djiwa Tentram",
  "start_url": "/menu",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#0a0a0b",
  "theme_color": "#fefefe",
  "icons": [
    { "src": "/pwa-pos-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/pwa-pos-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 6.2 Customer App Manifest ("Djiwa Tentram App")

```json
{
  "name": "Djiwa Tentram App",
  "short_name": "Djiwa App",
  "description": "Pesan menu favorit dari meja",
  "start_url": "/djiwatentram",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#fefefe",
  "icons": [
    { "src": "/pwa-app-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/pwa-app-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**2 ikon beda di homescreen** → kasir install "Djiwa Tentram POS", customer install "Djiwa Tentram App".

---

## 7. Enhancement: Deploy via Cloudflare Pages (Multi-Project)

### 7.1 Setup

| | POS App | Customer App |
|---|---|---|
| **CF Project** | `yumme-pos` | `yumme-app` |
| **Domain** | `pos.djiwatentram.web.id` | `djiwatentram.web.id` |
| **Branch** | `main` (path: `apps/pos`) | `main` (path: `apps/customer`) |
| **Build command** | `cd ../.. && bun run build:pos` | `cd ../.. && bun run build:customer` |
| **Output dir** | `apps/pos/dist` | `apps/customer/dist` |
| **Root dir** | `apps/pos` | `apps/customer` |

### 7.2 Root `package.json` Scripts

```json
{
  "scripts": {
    "build:pos": "turbo build --filter=@yumipos/pos",
    "build:customer": "turbo build --filter=@yumipos/customer",
    "build:shared": "turbo build --filter=@yumipos/web-shared",
    "dev:pos": "turbo dev --filter=@yumipos/pos",
    "dev:customer": "turbo dev --filter=@yumipos/customer"
  }
}
```

### 7.3 Supabase CORS Update

Tambahkan di Supabase Dashboard → Settings → API:
```
pos.djiwatentram.web.id, djiwatentram.web.id
```
(Sudah ada `app.djiwatentram.web.id` — tambahin dua ini, jangan hapus yang lama dulu sampai transisi selesai)

---

## 8. Enhancement: Deployment Independence

| Skenario | Dampak |
|---|---|
| Update UI Customer App (warna, layout) | Deploy `yumme-app` only — POS gak terganggu |
| Bug fix POS (printer, shift) | Deploy `yumme-pos` only — Customer app gak rebuild |
| Update shared package | Deploy keduanya (tapi jarang) |
| Rollback POS | Revert `yumme-pos` deploy — Menu tetap jalan |

**CF Pages rollback:** instant via dashboard, no DNS propagation needed.

---

## 9. Enhancement: Monitoring & Analytics Strategy

### 9.1 POS App

| Metric | Tool |
|---|---|
| Transaction volume | Supabase query |
| Error rate (crash, gagal print) | CF Pages analytics + Sentry |
| Shift duration | Built-in dashboard |
| Offline sync health | Custom metric + yumi-ai-bot alert |

### 9.2 Customer App ("Djiwa Tentram App")

| Metric | Tool |
|---|---|
| Page load time (QR scan → order) | CF Web Analytics |
| Cart abandonment rate | Custom event → Supabase |
| QR scan → order conversion | Custom event |
| Most ordered items | Supabase query |
| Bounce rate | CF Web Analytics |

**Kenapa penting:** POS adalah *internal tool* (stability > feature velocity), Menu adalah *consumer product* (conversion rate > everything). Metric yang di-track beda.

---

## 10. Enhancement: Future App-Specific Features

### POS-Only (Tidak Boleh Ada di Menu App)

- [ ] Thermal printer pairing guide
- [ ] Barcode scan untuk tambah produk
- [ ] Multi-kasir collision detection
- [ ] Offline mode full (queue → sync)
- [ ] Shift handover workflow
- [ ] Face recognition alternative login

### Customer-Only (Tidak Boleh Ada di POS App)

- [ ] QR code generator per-meja (admin panel bisa, tapi yang generate QR ada di menu)
- [ ] Share menu via WhatsApp
- [ ] **Customer profile page `/profile/$slug`** — order history, saved favorites, loyalty points
- [ ] Loyalty points / stamp card
- [ ] Rating bintang setelah order
- [ ] Pre-order / scheduled order
- [ ] Upsell suggestions (ML-based)
- [ ] Split bill request

**Dengan arsitektur terpisah**, kedua daftar ini bisa berkembang independen tanpa membloat app satunya.

---

## 11. Implementation Steps

### Phase 1: Shared Package (3-4 jam)

```
Step 1.1: Create packages/yumipos-web-shared
  - package.json, tsconfig.json, src/index.ts barrel

Step 1.2: Move types + lib utilities
  - types/backend-compat.ts
  - lib/client.ts, lib/utils.ts, lib/utils/pricing.ts
  - lib/backend-bridge.ts, lib/yumi-auth-client.ts

Step 1.3: Move shared hooks
  - hooks/use-supabase-live-value.ts (85L)
  - hooks/use-hybrid-pos-data.ts (2071L) ← AUDIT: cek fungsi POS-only
  - hooks/use-hybrid-write-actions.ts (6084L) ← AUDIT + SPLIT: shared vs POS-only
  - hooks/use-hybrid-ops-data.ts (202L)
  - hooks/use-hybrid-booking-data.ts (367L)
  - hooks/useYumiAuth.tsx (151L)
  - hooks/use-hybrid-minigames-data.ts

Step 1.4: Move shared context
  - context/cart-context.tsx (375L)
  - context/app-data-context.tsx (32L)

Step 1.5: Move shared UI components
  - components/ui/button.tsx
  - components/ui/input.tsx
  - components/ui/sheet.tsx
  - components/ui/skeleton.tsx
  - components/ui/sonner.tsx

Step 1.6: Rewrite all imports
  - @/ → relative paths inside shared package
  - Fix circular dependencies

Step 1.7: Build test
  - tsc --noEmit + fix errors
```

### Phase 2: POS App (1-1.5 jam)

```
Step 2.1: Copy apps/web → apps/pos
Step 2.2: Remove customer routes
  - Delete routes/$brandSlug.tsx + .lazy.tsx
  - Delete routes/$brandSlug.minigames.tsx + .lazy.tsx
  - Delete components/customer/customer-ordering-page.tsx
Step 2.3: Update package.json
  - name: "@yumipos/pos"
  - Add dep: "@yumipos/web-shared": "workspace:*"
Step 2.4: Update imports
  - @/hooks/use-hybrid-* → @yumipos/web-shared
  - @/lib/client → @yumipos/web-shared
  - @/context/* → @yumipos/web-shared
Step 2.5: Simplify __root.tsx
  - Remove brandSlug heuristic (line 24-28)
  - Public pages = /login, /register, /register/selesai/* only
Step 2.6: Update vite.config.ts
  - PWA name: "Djiwa POS"
  - start_url: "/menu"
  - orientation: "landscape"
  - NetworkFirst strategy
Step 2.7: Build test + fix routeTree.gen.ts
```

### Phase 3: Customer App — "Djiwa Tentram App" (1.5-2 jam)

```
Step 3.1: Create apps/customer from scratch
  - package.json, tsconfig.json, index.html, vite.config.ts
  - Tailwind + index.css
Step 3.2: Minimal src structure
  - main.tsx (lightweight, no version check)
  - __root.tsx (NO auth, NO providers, just <Outlet />)
  - routes/$brandSlug.tsx + .lazy.tsx
  - routes/$brandSlug.minigames.tsx + .lazy.tsx
Step 3.3: Copy customer component
  - components/customer/customer-ordering-page.tsx
Step 3.4: Wire imports
  - All from @yumipos/web-shared
Step 3.5: PWA config
  - name: "Djiwa Tentram App"
  - short_name: "Djiwa App"
  - start_url: "/djiwatentram"
  - orientation: "portrait"
  - CacheFirst images, NetworkFirst pages
  - autoUpdate (no complex version check)
Step 3.6: Phase 1: No auth (__root.tsx simpel: just <Outlet />)
Step 3.7: Build test + fix errors
```

### Phase 4: Root Config + Deploy (1 jam)

```
Step 4.1: Update root package.json scripts
Step 4.2: Update turbo.json pipeline
Step 4.3: Create CF Pages project for yumme-pos
Step 4.4: Create CF Pages project for yumme-app
Step 4.5: Setup DNS
  - pos.djiwatentram.web.id → yumme-pos.pages.dev
  - djiwatentram.web.id → yumme-app.pages.dev
Step 4.6: Update Supabase CORS
Step 4.7: Test both domains
```

### Phase 5: Cleanup (30 menit)

```
Step 5.1: Smoke test all POS routes on pos.djiwatentram.web.id
Step 5.2: Smoke test customer app on djiwatentram.web.id
Step 5.3: Delete apps/web
Step 5.4: Update CI/CD if any
Step 5.5: Remove old app.djiwatentram.web.id DNS after transition
```

---

## 12. ⚠️ Operational Safety — Zero Disruption Guarantee

Sistem sedang dipakai produksi (`app.djiwatentram.web.id` live). **Tidak boleh ada downtime atau gangguan operasional kasir/customer selama proses split.**

### 12.1 Prinsip "No Touch" pada App yang Sedang Jalan

| Aturan | Detail |
|---|---|
| **Jangan sentuh `apps/web/`** | Tidak ada edit, hapus, atau rename. `apps/web` adalah source of truth yang sedang live. |
| **Develop di samping, bukan di tempat** | `apps/pos/` dan `apps/customer/` dibuat sebagai app BARU, bukan hasil modifikasi `apps/web`. |
| **Build terisolasi** | `turbo build --filter=@yumipos/pos` tidak akan menyentuh `apps/web/dist/` yang sedang di-serve. |
| **Deploy ke CF project terpisah** | `yumme-pos` dan `yumme-app` adalah project CF Pages BARU — tidak mengubah project existing yang serve `app.djiwatentram.web.id`. |

### 12.2 Strategi Parallel Run

```
FASE DEVELOPMENT (1-2 hari)
═══════════════════════════════════════════════
  app.djiwatentram.web.id  →  apps/web (PRODUKSI, tidak disentuh)
  
  apps/pos/      ← develop & build lokal (localhost:3002)
  apps/customer/ ← develop & build lokal (localhost:3003)
  
  ✗ Tidak ada yang deploy ke production
  ✗ Tidak ada perubahan di apps/web
  ✗ Kasir & customer tetap pakai app.djiwatentram.web.id

FASE STAGING (1 hari)
═══════════════════════════════════════════════
  app.djiwatentram.web.id  →  apps/web (PRODUKSI, masih live)
  
  pos.djiwatentram.web.id  →  yumme-pos (STAGING, test internal)
  djiwatentram.web.id      →  yumme-app (STAGING, test internal)
  
  ✓ Tim internal tes POS di pos.djiwatentram.web.id
  ✓ Tim internal tes customer di djiwatentram.web.id
  ✗ Customer belum diarahkan ke domain baru

FASE CUTOVER (1 jam, bisa di luar jam operasional)
═══════════════════════════════════════════════
  1. Umumkan maintenance window (misal: jam 10 malam)
  2. DNS: app.djiwatentram.web.id → CNAME ke yumme-pos.pages.dev
  3. DNS: djiwatentram.web.id → CNAME ke yumme-app.pages.dev (jika sebelumnya beda)
  4. Test 15 menit: order kasir + customer order + payment
  5. Jika OK → done. Jika gagal → revert DNS (5 menit)
  6. apps/web/ disimpan 1 minggu sebagai cold backup
```

### 12.3 Jadwal yang Disarankan

| Waktu | Aktivitas | Impact |
|---|---|---|
| **Siang (10:00-16:00)** | Development `apps/pos` + `apps/customer` di lokal | **NOL** — gak menyentuh production |
| **Malam (21:00-22:00)** | Build & deploy ke CF staging | **NOL** — domain staging terpisah |
| **Malam (22:00-23:00)** | Internal testing di domain staging | **NOL** — production tetap jalan |
| **Malam (23:00-23:30)** | DNS cutover (jika diperlukan) | **MINIMAL** — kasir sudah tutup, customer order sudah sepi |
| **Pagi berikutnya** | Pantau error rate + feedback kasir | Siap rollback instant |

### 12.4 Checklist Sebelum Cutover

```
□ apps/pos/ build sukses tanpa error
□ apps/customer/ build sukses tanpa error
□ Semua route POS bisa diakses (login, menu, admin/*)
□ Menu POS bisa: tambah item → checkout → payment → print receipt
□ Customer app bisa: scan QR → browse menu → order → payment
□ Shift management masih berfungsi (buka/tutup shift)
□ Admin pages jalan: inventory, finance, HR, settings
□ Supabase CORS sudah include kedua domain baru
□ CF Pages environment variables sudah di-set
□ yumi-ai-bot tetap menerima webhook dari Supabase
□ DNS TTL sudah di-set rendah (60 detik) untuk rollback cepat
□ Tim kasir sudah tahu域名 baru / shortcut PWA baru
```

### 12.5 Apa yang TIDAK Berubah (No Risk)

| Komponen | Status | Alasan |
|---|---|---|
| **Supabase database** | Tidak berubah | Schema, RLS, data semua tetap |
| **Supabase edge functions** | Tidak berubah | yumi-auth, yumi-ai, auto-close-shifts, dll |
| **yumi-ai-bot (Python)** | Tidak berubah | Jalan sendiri, gak terkait frontend |
| **GitHub repo** | Tidak berubah | Hanya tambah folder `apps/pos`, `apps/customer`, `packages/yumipos-web-shared` |
| **CI/CD existing** | Tambah, bukan ganti | Pipeline `apps/web` tetap jalan sampai dihapus manual |
| **Cloudflare Pages existing** | Tidak berubah | Project existing tetap serve `apps/web` |

### 12.6 Rollback dalam 5 Menit

```
Jika setelah cutover ada masalah:

1. Buka Cloudflare Dashboard → DNS
2. Revert CNAME record:
   app.djiwatentram.web.id → KEMBALI ke yumme.pages.dev (existing)
3. Tunggu propagasi (TTL 60 detik = max 1 menit)
4. Kasir refresh halaman → kembali ke app lama

ATAU lebih cepat:
1. CF Pages project existing → "Deploy" (redeploy apps/web, instant)
2. Tidak perlu sentuh DNS
```

---

## 13. Files Summary

### New Files (~45 files)
- `packages/yumipos-web-shared/` — ~25 files (lib, hooks, context, ui, types)
- `apps/customer/` — ~15 files (config, routes, components, main, css)
- `apps/pos/` — ~5 NEW files (package.json updated, vite.config updated, __root updated)

### Changed Files
- `package.json` — scripts added
- `turbo.json` — pipeline updated
- `apps/pos/src/routes/__root.tsx` — auth logic simplified

### Deleted Files
- `apps/web/` — entire directory (after verification)
- `apps/web/src/routes/$brandSlug*` (4 files)
- `apps/web/src/components/customer/` (1 file)

---

## 14. Risks & Mitigations

| Risk | Level | Mitigation |
|---|---|---|
| `use-hybrid-write-actions.ts` (6084L) massive split | 🔴 HIGH | Audit fungsi per fungsi. Pisah jadi `use-shared-write-actions` + `use-pos-write-actions`. Test tiap split. |
| `use-hybrid-pos-data.ts` (2071L) mixed functions | 🟡 MEDIUM | Audit exports. Sebagian besar fungsi dipakai customer juga. Split minimal. |
| Circular dependencies after move | 🟡 MEDIUM | Build shared package first, test tsc--noEmit before wiring apps |
| Cloudflare Pages root dir limitation | 🟡 MEDIUM | CF Pages expects build from project root. Workaround: `cd ../.. && bun run build:pos` |
| Tailwind config duplication | 🟢 LOW | Copy index.css, works out of box |
| Env variables | 🟢 LOW | Both apps reuse root .env (SUPABASE_URL, SUPABASE_ANON_KEY) |
| Supabase CORS | 🟢 LOW | Just add domains in dashboard |

---

## 15. Future: Phase 2 — Customer Auth (Email + Password)

Setelah Phase 1 berjalan stabil, customer app akan ditambahkan auth sederhana.

### 15.1 Desain Auth

| Aspek | POS App | Customer App (Phase 2) |
|---|---|---|
| **Metode login** | PIN + email/password (YumiAuth) | Email + password (simple) |
| **Provider** | `YumiAuthProvider` (custom) | Bisa pakai Supabase Auth (`@supabase/ssr`) |
| **Session storage** | `localStorage` token | Supabase session cookie |
| **RLS** | Existing (service_role bypass) | Authenticated user-based RLS |
| **Scope** | Full access (kasir/admin) | Self-service: lihat order sendiri, loyalty points |
| **UI** | Login page + face scan | Simple login/signup form di welcome screen |

### 15.2 Skema Database (Supabase Auth)

```sql
-- Supabase Auth built-in tables:
-- auth.users — email, password hash, metadata
-- auth.sessions — session tracking

-- Additional customer profile:
CREATE TABLE public.customer_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 15.3 Flow Login Customer

```
Customer buka djiwatentram.web.id
  ↓
Welcome screen — dua opsi:
  ├── "Pesan tanpa login" → langsung ke menu (seperti sekarang)
  └── "Login / Daftar" → email + password form
        ↓
      Supabase Auth (magic link atau password)
        ↓
      Redirect ke menu dengan session
        ↓
      Benefit: loyalty points, order history, saved favorites,
              akses profile di /profile/$slug
```

### 15.4 Auth Guard di Customer App (Phase 2)

```tsx
// __root.tsx — Phase 2
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { SupabaseAuthProvider } from "@yumipos/web-shared"; // baru

export const Route = createRootRoute({
  component: () => (
    <SupabaseAuthProvider>   {/* NEW: optional auth */}
      <div className="min-h-app ...">
        <Outlet />
      </div>
    </SupabaseAuthProvider>
  ),
});
```

### 15.5 Yang Berubah dari Phase 1 ke Phase 2

| File | Phase 1 | Phase 2 |
|---|---|---|
| `apps/customer/src/main.tsx` | No providers | + `SupabaseAuthProvider` |
| `apps/customer/src/routes/__root.tsx` | `<Outlet />` only | + Auth context wrapper |
| `apps/customer/src/routes/profile.$slug.tsx` | — | **NEW**: Customer profile page |
| `components/customer/customer-ordering-page.tsx` | Welcome → langsung menu | Welcome → pilih login/guest → menu |
| `packages/yumipos-web-shared` | Existing | + `hooks/useCustomerAuth.ts`, `context/auth-context.tsx` |

### 15.6 Customer Profile Page — `/profile/$slug`

```
djiwatentram.web.id/profile/azzam
├── Info akun: nama, email, phone, join date
├── Order history: list order terakhir (status, total, tanggal)
├── Loyalty points: total points, reward yang tersedia
├── Saved favorites: menu favorit untuk quick order
└── Settings: ganti password, notifikasi preference
```

Data dari:
- `auth.users` (email, created_at)
- `public.customer_profiles` (full_name, phone)
- `pos.orders` (filter by customer_id, order history)
- `public.loyalty_points` (future table)

### 15.7 Perbedaan Kunci dengan YumiAuth

| | YumiAuth (POS) | Customer Auth (Phase 2) |
|---|---|---|
| **User type** | Staff, Admin, Owner | Customer (public) |
| **PIN-based** | ✅ Yes | ❌ No (email+password only) |
| **Face recognition** | ✅ Yes | ❌ No |
| **Admin guard** | `isAdmin`, `isStaff` | Tidak ada (semua customer role sama) |
| **Token storage** | `localStorage` + custom session validation | Supabase session cookie (auto-managed) |
| **Registration** | Via onboarding flow (admin approval) | Self-service signup (email verification) |

### 15.8 Estimasi Phase 2

| Task | Effort |
|---|---|
| Setup Supabase Auth di customer app | 30 menit |
| Buat login/signup form | 1 jam |
| Tambah guest mode (skip login) | 30 menit |
| **Customer profile page `/profile/$slug`** | **1.5 jam** |
| Auth guard + RLS integration | 1 jam |
| Test end-to-end | 30 menit |
| **Total** | **~5-6 jam** |

---

## 16. Open Questions

1. **Domain final?** `pos.djiwatentram.web.id` & `djiwatentram.web.id` — confirm?
2. **Progressive migration?** Keep `apps/web` running during transition, or cutover?
3. **PWA icons?** Need 2 sets of icons (pos-192, pos-512, app-192, app-512) — who designs?
4. **Customer SEO?** Customer app still SPA. Need SSR for SEO later?
5. **Current `app.djiwatentram.web.id`?** Redirect ke `pos.djiwatentram.web.id` setelah transition?
6. **yumi-ai-bot?** Tetap di internal (Python app, bukan bagian web frontend) — no change needed.
7. **Split `use-hybrid-write-actions.ts`?** Wajib. File 6084L campur shared + POS. Audit & split before extraction.
8. **Phase 2 timing?** Kapan customer auth diimplementasikan? Setelah Phase 1 stabil 1-2 minggu?
9. **Supabase Auth vs custom?** Untuk customer, pakai Supabase Auth built-in atau bikin custom JWT seperti YumiAuth?
10. **User data sharing?** Apakah customer profiles akan share tabel dengan staff users, atau tabel terpisah?

---

## 17. Total Effort

| Phase | Effort | Performed By |
|---|---|---|
| 1. Shared Package | 3-4 jam | Agent |
| 2. POS App | 1-1.5 jam | Agent |
| 3. Customer App (Phase 1 — no auth) | 1.5-2 jam | Agent |
| 4. Root Config + Deploy | 1 jam | Agent + Manual (DNS) |
| 5. Cleanup | 30 menit | Agent |
| **Phase 1 Total** | **~7-9 jam** | |
| 6. Customer App (Phase 2 — auth + profile) | 5-6 jam | Agent (future) |
| **Phase 1+2 Total** | **~12-15 jam** | |

---

## 18. Rollback Plan

Jika terjadi masalah:
1. `apps/web` tetap ada sampai semua verified
2. DNS bisa langsung di-revert ke `app.djiwatentram.web.id` → `apps/web` (CF Pages)
3. Supabase gak ada perubahan — rollback zero-downtime
4. CF Pages deploy instant rollback via dashboard
