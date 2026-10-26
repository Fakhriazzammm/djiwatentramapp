# Djiwa Tentram — UI/UX Audit + Zero-shadcn Rewrite Roadmap

> Generated: 2026-07-30 20:22 WIB
> Domain mapping: admin → admindjiwatentram.web.id, pos → pos.djiwatentram.web.id, karyawan → karyawan.djiwatentram.web.id, customer → djiwatentram.web.id

## 🔍 Ringkasan Temuan Audit

### A. Arsitektur Monorepo

| Temuan | Detail |
|--------|--------|
| **Duplikasi apps/admin & apps/pos** | 308 dari 309 path source identik byte-for-byte. Hanya 5 file berbeda: `route.tsx`, `__root.tsx`, `index.tsx`, `index.lazy.tsx`, `version.ts`. Perbedaan minor (landing page, root redirect). |
| **Rute identik** | 54 lazy routes admin = 54 lazy routes pos. Komponen yang sama, hook yang sama, isu yang sama. |
| **Keduanya aktif** | admin → admindjiwatentram.web.id (nginx root `/var/www/admindjiwatentram.web.id`), pos → pos.djiwatentram.web.id (nginx root `/var/www/pos.djiwatentram.web.id`). |
| **Implikasi** | Setiap UI fix perlu diterapkan di **dua tempat** selama duplikasi ini ada. Ini sumber utama inefisiensi. |

### B. Shared Design System — Status

| Komponen | Lokasi | Status vs DNA v2.0 | vs Plastix |
|----------|--------|-------------------|------------|
| **theme.css** | `packages/yumipos-web-shared/src/theme.css` | ✅ DNA v2.0 compliant (dual font, 24px panel, 14px ctl, iOS curve, soft shadow, blue accent) | ✅ Sudah punya `--font-body` (Geist) + `--font-display` (PJS) |
| **mobile-shell** | Di theme.css | ✅ Ada class `.mobile-shell` (max-width 430px, centered) | ✅ Sama dengan Plastix |
| **Button (shared)** | `packages/.../ui/button.tsx` | ✅ `rounded-xl`, `active:scale-[.97]`, iOS curve, CSS spinner | ✅ Sudah bagus — `font-bold`, loading spinner, banyak variant |
| **ButtonV2** | `packages/.../ui/button-v2.tsx` | ✅ Simplified: 3 variant × 3 size | ✅ Mirip Plastix |
| **CardV2** | `packages/.../ui/card-v2.tsx` | ✅ `app-card` / `card-elevated`, 24px radius | ✅ Sama dengan Plastix |
| **States** | `packages/.../ui/states.tsx` | ✅ EmptyState, ErrorState, CardSkeleton, **AsyncBoundary** | ✅ Sama dengan Plastix |
| **Skeleton** | `packages/.../ui/skeleton.tsx` | ✅ `animate-pulse`, `rounded-2xl` | ✅ |
| **Sonner** | `packages/.../ui/sonner.tsx` | ✅ bottom-center | ✅ |
| **Sheet** | `packages/.../ui/sheet.tsx` | ✅ iOS curve, duration 320ms | ✅ |
| **Input** | `packages/.../ui/input.tsx` | ✅ `rounded-xl`, fokus states | ✅ |

**Kesimpulan Design System:** Shared theme sudah DNA v2.0 + Plastix compliant. Semua komponen utama sudah ada dan sudah benar.

### C. Masih Pakai shadcn/ui

| App | shadcn imports | files pakai shadcn | Komponen shadcn dipakai |
|-----|---------------|-------------------|------------------------|
| **apps/admin** | 258 | 87 | Select, Dialog, Sheet, Tabs, DropdownMenu, Button, Badge, Card, Input, Skeleton, dll |
| **apps/pos** | 259 | 88 | Sama (duplikat) |
| **apps/karyawan** | 3 | 2 | Button, Dialog (base-ui) |
| **apps/customer** | 13 | 10 | Button, Dialog, Sheet, Input, Skeleton, Sonner |

**Yang sebenarnya:** `shadcn/tailwind.css` masih di-import di `index.css` semua app. Tapi komponen shadcn sudah banyak ditimpa dengan versi custom yang menggunakan **@base-ui/react** (bukan Radix asli shadcn). Hanya `collapsible.tsx` yang masih @radix-ui.

Jadi **shadcn hanya sebagai styling base**, bukan sebagai komponen. Real dependencies: @base-ui/react (20+ komponen), @radix-ui (hanya 1 komponen collapsible).

### D. File-size & Code Quality Issues

| Issue | Data |
|-------|------|
| **File >500 baris** | admin: 53 file, pos: 54 file, karyawan: 5 file, customer: 2 file |
| **Terbesar** | `inventory.lazy.tsx` 6.755 baris, `settings.lazy.tsx` 5.408 baris, `use-hybrid-write-actions.ts` 6.480 baris |
| **Penggunaan text-[8px]** | admin: 119, pos: 122, karyawan: 18 — melanggar DNA §10 readability |
| **Penggunaan text-[9px]** | admin: 421, pos: 427, karyawan: 64 — terlalu kecil untuk body text |
| **Penggunaan text-[10px]** | admin: 935, pos: 938, karyawan: 89 — acceptable untuk caption tapi bukan body |
| **TypeScript errors (pos)** | ~50 errors — mayoritas `never` type + missing module declarations |
| **TypeScript errors (karyawan)** | ~60 errors — mayoritas modul `@yumipos/web-shared` tidak terdeklarasi + route params |
| **TypeScript errors (customer)** | ~200 errors — mayoritas `never` type, missing `env` declarations, hook issues |
| **Gradient usage** | admin: 80, karyawan: 30, customer: 14 — DNA v2.0 merekomendasikan minimalis |

### E. Aksesibilitas

| Metrik | admin | karyawan | customer |
|--------|-------|----------|----------|
| `aria-*` / `role=` / `tabIndex` | 24 file | 5 file | 4 file |
| `prefers-reduced-motion` | **0** | 0 | 0 |
| Focus-visible rings | Ada di base theme | Ada | Ada |

### F. Route Inventory per App

#### apps/admin (deployed to admindjiwatentram.web.id)
- 53 lazy routes + ~40 non-lazy (route definitions)
- Full POS admin: menu, inventory, products, orders, finance, operational team, settings
- Admin panel: dashboard, ai-chat, customers, discounts, forecasting, booking
- Auth: login (admin, kasir, karyawan), register
- Landing: `/` redirect ke `/admin/login`

#### apps/pos (deployed to pos.djiwatentram.web.id)
- 54 lazy routes (identik dengan admin)
- Sama persis: menu, inventory, products, orders, finance, operational team, settings
- Bedanya landing: `/` adalah landing page (hero + features) bukan login redirect

#### apps/karyawan (deployed to karyawan.djiwatentram.web.id)
- 17 route files
- Fitur: beranda, absensi (masuk/keluar), jadwal, profil, izin, notifikasi, leaderboard, slip gaji, rekap absensi, kontrak
- Layout: BottomNavbar + mobile shell

#### apps/customer (deployed to djiwatentram.web.id)
- 12 route files
- Fitur: home (guest/member), order, riwayat, promo, poin, profile, notifikasi, favorit, minigames
- Layout: app-shell + max-w-md + bottom nav (guest/member shared)

---

## 📊 Gap Analysis: DNA v2.0 + Plastix vs Current State

### Yang SUDAH ada (jangan diubah):

| DNA/Plastix Feature | Status | Lokasi |
|---------------------|--------|--------|
| Dual font (Geist body + PJS display) | ✅ | theme.css, semua index.css |
| Card radius 24px | ✅ | theme.css `--radius-panel: 1.5rem` |
| Control radius 14px | ✅ | `rounded-xl` (14px) |
| iOS easing curve | ✅ | `cubic-bezier(.32,.72,0,1)` |
| Soft shadows | ✅ | `--shadow-soft`, `--shadow-raised` |
| Mobile shell | ✅ | `.mobile-shell` class |
| Brand selection color | ✅ | `::selection` in theme.css |
| Empty/Error states | ✅ | `packages/.../ui/states.tsx` |
| Skeleton loading | ✅ | `packages/.../ui/skeleton.tsx` |
| Bottom toast | ✅ | Sonner |
| Sheet with iOS motion | ✅ | Sheet component |
| Button with iOS press | ✅ | `active:scale-[.97]` |
| Lucide icons | ✅ | Semua app |

### Yang PERLU diperbaiki:

| Prioritas | Gap | Evidence | Direkomendasikan |
|-----------|-----|----------|-----------------|
| 🔴 P1 | **shadcn/tailwind.css masih sebagai base** | Semua `index.css` masih import `shadcn/tailwind.css` | Hapus shadcn dependency, pindah styling ke Tailwind v4 native + custom primitives |
| 🔴 P1 | **apps/admin & apps/pos duplikasi 98%** | 303/309 file identik | Konsolidasi: admin jadi thin shell yang shared-login-route ke pos; atau satu app untuk kedua subdomain |
| 🟠 P2 | **Tidak ada custom primitives untuk menggantikan shadcn** | Dialog, Select, Tabs, DropdownMenu masih @base-ui | Buat 4-6 primitives custom (Dialog/Sheet/Select/Tabs/DropdownMenu/Skeleton) yang ringan, tanpa @base-ui |
| 🟠 P2 | **Typography terlalu kecil** | 935x `text-[10px]`, 421x `text-[9px]`, 119x `text-[8px]` | Migrasi ke font-size standar: caption 11-12px, body 14-15px, section 17-22px |
| 🟠 P2 | **File >5.000 baris** | inventory, settings, use-hybrid-write-actions perlu di-split | Ekstraksi komponen per-section |
| 🟠 P2 | **prefers-reduced-motion tidak ada** | 0 usage di semua app | Tambah media query global di theme.css |
| 🟡 P3 | **TypeScript errors** | 50-200 errors per app | Typing untuk Supabase responses, environment variables, route params |
| 🟡 P3 | **Gradient berlebihan** | admin: 80 gradient usages | Minimalisir sesuai DNA §15 |
| 🟡 P3 | **Emoji sebagai icon di MenuGrid** | Karyawan: 🧾📋👥💳 dll, Customer: 🛵⭐❤️🛒 dll | Ganti dengan Lucide icons |
| 🟢 P4 | **Entry animations** | Belum konsisten | Tambah `animate-rise` di entry points |
| 🟢 P4 | **Focus ring branded** | Default outline | Tambah branded focus ring di theme.css |

---

## 🎯 Master Implementation Roadmap

### Filosofi: Incremental, 3 waves, zero shadcn by end

1. **Tiap wave selesai** → build all 4 apps → deploy admin
2. **Tidak ada rewrite besar** — setiap perubahan additive atau per-komponen
3. **Pertahankan @base-ui** di wave 1-2, ganti di wave 3

### Wave 1: Fondasi (Estimasi: 2-3 jam)

| # | Task | File | Perubahan | Risiko |
|---|------|------|-----------|--------|
| 1.1 | Hapus `shadcn/tailwind.css` dari semua app | `apps/*/src/index.css` (4 file) | Hapus `@import "shadcn/tailwind.css"` | 🟡 — perlu verify semua style yg hilang |
| 1.2 | Tambah branded focus ring | `theme.css` | `*:focus-visible { outline: 2px solid var(--foreground); box-shadow: 0 0 0 5px color-mix(...); }` | 🟢 — additive |
| 1.3 | Tambah `prefers-reduced-motion` | `theme.css` | Media query global | 🟢 — additive |
| 1.4 | Tambah `animate-rise` entry animation | `theme.css` | `@keyframes rise` + class | 🟢 — additive |
| 1.5 | TypeScript: Vite env types | `apps/*/src/vite-env.d.ts` (4 file) | Tambah `ImportMeta` declaration | 🟢 — fix pre-existing errors |

### Wave 2: Komponen Custom (Estimasi: 4-6 jam)

Mengganti @base-ui wrappers dengan primitives custom tanpa external dependency.

| # | Task | File | Perubahan | Risiko |
|---|------|------|-----------|--------|
| 2.1 | **Dialog** custom — ganti @base-ui | `components/ui/dialog.tsx` (admin + pos) | Rewrite pake HTML `<dialog>` + Tailwind | 🟡 — perlu regression test di modal-heavy pages |
| 2.2 | **Select** custom — ganti @base-ui | `components/ui/select.tsx` (admin + pos) | Rewrite pake native `<select>` + styling | 🟡 — @base-ui Select punya banyak fitur (portal, search, group) |
| 2.3 | **Tabs** custom — ganti @base-ui | `components/ui/tabs.tsx` (admin + pos) | Rewrite pake state + `role="tablist"` | 🟢 — sederhana |
| 2.4 | **DropdownMenu** custom — ganti @base-ui | `components/ui/dropdown-menu.tsx` (admin + pos) | Rewrite pake state + positioning | 🟡 — positioning, scroll, close on click outside |
| 2.5 | **Sheet** custom — ganti @base-ui | `components/ui/sheet.tsx` (admin + pos, shared) | Rewrite pake `<dialog>` + CSS animation | 🟡 — animation + keyboard trap |
| 2.6 | **ScrollArea** custom | `components/ui/scroll-area.tsx` (admin + pos) | Native CSS scroll + styling | 🟢 — sederhana |
| 2.7 | **Checkbox** custom | `components/ui/checkbox.tsx` (admin + pos) | Native `<input type="checkbox">` | 🟢 — sederhana |

### Wave 3: Konsolidasi & Polish (Estimasi: 3-5 jam)

| # | Task | File | Perubahan | Risiko |
|---|------|------|-----------|--------|
| 3.1 | **Konsolidasi admin+pos** menjadi satu app | `apps/admin` + `apps/pos` | Pilih satu sebagai source, bedakan landing page via env/render prop | 🔴 — struktur monorepo besar, perlu testing penuh |
| 3.2 | **Split file besar** | `inventory.lazy.tsx`, `settings.lazy.tsx`, `use-hybrid-write-actions.ts` | Ekstraksi komponen per-section | 🟡 — perlu mapping semua import |
| 3.3 | **Typography cleanup** — ganti `text-[8px]` dan `text-[9px]` | Semua file di semua app | `text-[8px]` → `text-[10px]`, `text-[9px]` → `text-[11px]` | 🟢 — search-replace per app |
| 3.4 | **Gradient minimalisir** | admin: 80 gradient usage | Kurangi gradient sesuai DNA §15 | 🟢 — visual only |
| 3.5 | **Emoji → Lucide** di MenuGrid | `MenuGrid.tsx`, `CustomerMenuGrid.tsx` | Ganti emoji icons dengan Lucide | 🟢 — visual only |
| 3.6 | **Entry animation** di halaman utama | Berbagai halaman | Tambah `animate-rise` class | 🟢 — additive |

### Wave 4: Verifikasi Total (Estimasi: 1 jam)

| # | Task | Detail |
|---|------|--------|
| 4.1 | TypeScript `tsc --noEmit` | Semua 4 app — 0 errors target |
| 4.2 | Build `bun run build` | Semua 4 app — 0 errors target |
| 4.3 | Visual verification | Screenshot tiap halaman utama via browser |
| 4.4 | Deploy admin | `admindjiwatentram.web.id` |

---

## 📋 Dependency Graph Eksekusi

```text
Wave 1 (independen — paralel 🔥)
├── 1.1 Hapus shadcn import (4 file, per-app)
├── 1.2 Focus ring (theme.css)
├── 1.3 prefers-reduced-motion (theme.css)
├── 1.4 animate-rise (theme.css)
└── 1.5 TypeScript env (4 file, per-app)

Wave 2 (independen per komponen — paralel 🔥)
├── 2.1 Dialog
├── 2.2 Select
├── 2.3 Tabs
├── 2.4 DropdownMenu
├── 2.5 Sheet
├── 2.6 ScrollArea
├── 2.7 Checkbox

Wave 3 (sequential — tergantung wave 2 selesai)
├── 3.1 Konsolidasi admin+pos 🔴
├── 3.2 Split file besar
├── 3.3 Typography cleanup
├── 3.4 Gradien minimalis
├── 3.5 Emoji ke Lucide
└── 3.6 Entry animations

Wave 4 (sequential — butuh semua selesai)
└── 4.1-4.4 Build, verify, deploy
```

---

## ⚠️ Risiko & Mitigasi

| Risiko | Level | Mitigasi |
|--------|-------|----------|
| Hapus shadcn/tailwind.css → style hilang | 🟡 | Test per-app, bandingkan visual sebelum-sesudah |
| Dialog/Select custom tidak punya semua fitur @base-ui | 🟡 | Prioritaskan fitur yang benar-benar dipakai (audit tiap usage dulu) |
| Konsolidasi admin+pos → breaking change | 🔴 | Tunda ke wave terakhir, lakukan hanya jika urgent |
| Split file besar → broken imports | 🟡 | Mapping export/import graph dulu sebelum split |
| TypeScript errors pre-existing → blocker | 🟡 | Fix hanya yang blocking build, sisanya backlog |

---

## 💡 Rekomendasi Eksekusi

1. **Mulai dari Wave 1** — aman, additive, efek langsung terlihat di production
2. **Wave 2 per komponen** — kerjakan dari yang paling sederhana (Checkbox, Tabs, ScrollArea) dulu, baru yang kompleks (Select, Dialog)
3. **Wave 3.1 (konsolidasi admin+pos)** — **TUNDA** sampai user meminta. Saat ini duplikasi tidak menghentikan development.
4. **Setiap sub-wave selesai** → `bun run build` di setiap app yang diubah → deploy ke `admindjiwatentram.web.id`

---

## Referensi

- `SOUL.md` — Agent operating principles
- `PROJECT.md` — Full project blueprint (tables, edge functions, integrations)
- `frontend-design/ai-product-design-dna/skill.md` — Product Design DNA standard
- `software-development/writing-plans/skill.md` — Plan authoring guidelines
- `/opt/plastix/` — Reference Plastix implementation
