# Plan: Modernisasi UI/UX Apple/iOS untuk Seluruh `apps/admin`

## Status

Draft plan — belum ada implementasi kode.

## Goal

Memodernisasi visual seluruh aplikasi `apps/admin` agar terasa seperti aplikasi Apple/iOS yang bersih, tenang, konsisten, dan mudah dipindai, tanpa mengubah:

- business logic;
- schema/database;
- API contract;
- authentication dan authorization;
- permission;
- status lifecycle;
- filter, export, inline edit, bulk action;
- route dan URL existing.

Targetnya bukan mengubah Admin menjadi Customer App, melainkan membuat **operational dashboard dengan Apple-style visual language**.

## Current Context

`apps/admin` dan `apps/customer` sama-sama memakai React 19, TypeScript, Vite, TanStack Router, Tailwind CSS v4, Framer Motion, Supabase, dan PWA. Namun visualnya berbeda karena:

1. `apps/customer` memakai `CustomerHeader`, `CustomerBottomNav`, dan `menu-section.tsx` dengan mobile-first design.
2. `apps/admin` memakai `AdminLayout` di `apps/admin/src/routes/admin/route.tsx` serta banyak JSX styling lokal di tiap route.
3. Admin memiliki halaman yang dikembangkan lintas generasi sehingga spacing, radius, typography, shadow, dan density belum seragam.
4. Shared package saat ini belum menjadi design system lengkap; perubahan di `packages/yumipos-web-shared` tidak otomatis mengubah semua JSX lokal di Admin.
5. `apps/admin` memiliki kebutuhan desktop/data-dense yang tetap harus dipertahankan.

## Scope Boundary

### In scope

- visual design;
- layout dan spacing;
- typography;
- color, border, radius, shadow;
- header/sidebar/mobile navigation;
- card, stat, table, filter, form, modal, empty/error/loading state;
- responsive behavior;
- shared UI primitives dan design tokens;
- visual consistency across Admin subpages.

### Out of scope

- database migration;
- API/Edge Function changes;
- auth atau permission changes;
- business calculation;
- data model;
- route deletion/rename;
- changing operational status behavior;
- changing payment/finance logic.

## Design Philosophy

| Prinsip | Implementasi |
|---|---|
| Calm hierarchy | Satu fokus utama per halaman; data sekunder diringkas |
| Apple-style surface | Background `#f7f9fc`, surface putih, border tipis, shadow lembut |
| Consistent rhythm | Spacing, radius, control height, dan heading mengikuti token yang sama |
| Operational clarity | Status, action, filter, dan data kritis tetap mudah dipindai |
| Responsive by design | Desktop memakai sidebar/table; mobile memakai header/tab/card list |
| Minimal decoration | Kurangi gradient, glow, shadow berat, dan ornamen yang tidak membantu |
| Preserve density | Modern bukan berarti menghilangkan data operasional penting |

## Recommended Architecture

### Recommendation: shared foundation + Admin migration

Gunakan kombinasi berikut:

```text
packages/yumipos-web-shared
├── design-tokens
└── components/admin

apps/admin
├── AdminLayout memakai shared shell/token
├── route pages memakai shared primitives
└── domain-specific data/action tetap lokal
```

Shared package menjadi **fondasi visual**, sedangkan setiap subpage Admin dimigrasikan secara bertahap untuk menggunakannya.

### Mengapa bukan shared package saja?

Shared component hanya memengaruhi halaman yang menggunakannya. Banyak halaman Admin saat ini memiliki className lokal, sehingga seluruh subpage tetap perlu disentuh secara visual. Namun migrasi akan lebih cepat dan konsisten jika semua halaman diarahkan ke primitives yang sama.

### Mengapa tidak import langsung dari `apps/customer`?

Hindari:

```tsx
import { renderMenuSection } from "../../../customer/src/components/...";
```

Komponen Customer bergantung pada auth, context, cart type, dan hook Customer. Visual yang netral sebaiknya diekstrak menjadi shared component baru, bukan membuat Admin bergantung pada source Customer.

## Visual Token Specification

Lokasi kandidat:

```text
packages/yumipos-web-shared/src/styles/
packages/yumipos-web-shared/src/components/admin/
apps/admin/src/index.css
```

Token awal yang disarankan:

| Token | Nilai target | Catatan |
|---|---:|---|
| App background | `#f7f9fc` | Background utama |
| Surface | `#ffffff` | Card/panel |
| Text primary | `#172033` | Judul dan data utama |
| Text muted | `#667085` | Helper/meta |
| Border | `#e6eaf0` | Border tipis |
| Primary | Existing Admin primary | Pertahankan brand color |
| Card radius | `20px–24px` | Konsisten |
| Control radius | `12px–14px` | Input/button |
| Pill radius | `999px` | Status/filter |
| Control height | `40px–44px` | Touch-friendly |
| Page spacing | `16px–24px` | Mobile/desktop responsive |
| Section gap | `16px–24px` | Hindari gap besar tidak perlu |
| Card shadow | `0 8px 28px rgba(15,23,42,.06)` | Shadow ringan |
| Header height | `48px–56px` | Tergantung viewport |

### Typography

- Heading halaman: `text-xl` sampai `text-2xl`, bukan default `text-3xl` di semua konteks.
- Subtitle: `text-xs` atau `text-sm` dengan line-height nyaman.
- Table header: `text-[10px] uppercase tracking-wider`.
- Table body: `text-xs` atau `text-sm` berdasarkan density.
- Status/badge: `text-[10px]` atau `text-[11px]`.
- Hindari semua teks dibuat bold; gunakan bold hanya untuk hierarchy.

## Target Shell `/admin`

### Desktop

```text
┌──────────────┬─────────────────────────────────────┐
│ Sidebar      │ Header halaman                      │
│ compact      ├─────────────────────────────────────┤
│              │ Page title + primary action          │
│ Dasbor       ├─────────────────────────────────────┤
│ Booking      │ KPI penting                         │
│ Orders       ├─────────────────────────────────────┤
│ Inventory    │ Main operational table/card         │
│ Keuangan     │                                     │
│              │ Secondary information                │
└──────────────┴─────────────────────────────────────┘
```

### Mobile

```text
┌──────────────────────────┐
│ ←  Judul halaman     ⋯   │
├──────────────────────────┤
│ Tab horizontal           │
├──────────────────────────┤
│ Ringkasan utama          │
├──────────────────────────┤
│ Aksi utama               │
├──────────────────────────┤
│ Card/list data           │
└──────────────────────────┘
```

### Shell files

```text
apps/admin/src/routes/admin/route.tsx
apps/admin/src/routes/__root.tsx
apps/admin/src/index.css
apps/admin/src/components/layout/Footer.tsx
```

Perubahan shell harus memengaruhi seluruh subroute yang menggunakan `AdminLayout`, tanpa mengubah route guard atau permission.

## Shared Admin Components

Kandidat komponen:

```text
packages/yumipos-web-shared/src/components/admin/
├── AdminPageShell.tsx
├── AdminHeader.tsx
├── AdminMobileTabs.tsx
├── AdminSectionHeading.tsx
├── AdminStatCard.tsx
├── AdminCard.tsx
├── AdminStatusBadge.tsx
├── AdminFilterBar.tsx
├── AdminDataTable.tsx
├── AdminMobileCardList.tsx
├── AdminEmptyState.tsx
├── AdminErrorState.tsx
├── AdminLoadingState.tsx
├── AdminActionButton.tsx
└── AdminModalShell.tsx
```

### Component rules

- Props data-driven dan tidak mengandung business logic.
- Action callback tetap diberikan oleh route.
- Tidak memanggil hook domain langsung jika tidak diperlukan.
- Tidak hardcode data booking, inventory, finance, atau status bisnis.
- Semua interactive control minimal `min-height: 40px`, touch-critical control `44px`.
- Support `className` extension tanpa merusak default visual.
- Support reduced motion.

## Per-Section Space Budget

Angka berikut adalah target visual awal yang harus divalidasi melalui screenshot/browser saat implementasi.

| Section | Kondisi saat ini | Target |
|---|---|---|
| Admin shell/header | Header/sidebar terasa berat | Header 48–56px, sidebar compact |
| Page title/action | Banyak padding dan heading besar | 56–76px total |
| KPI/stat cards | Card besar dan banyak ornamen | 96–132px per card |
| Section gap | Sering `gap-5/gap-6` | `gap-3/gap-4` |
| Form controls | Campuran height 40–56px | 40–44px standar |
| Table rows | Spacing terlalu longgar | `py-2` desktop, card compact mobile |
| Empty states | Padding sangat besar | `p-6` dengan copy ringkas |
| Modal content | Padding besar | `p-4`, section gap `gap-3` |
| Mobile page | Desktop layout dipaksa mengecil | Header + tab + card list |

## Subpage Migration Matrix

### Wave 1 — Foundation and high-impact pages

```text
1. Admin shell / sidebar / header
2. /admin dashboard
3. Shared card/stat/table/filter primitives
```

Files likely to change:

```text
apps/admin/src/routes/admin/route.tsx
apps/admin/src/routes/admin/index.lazy.tsx
apps/admin/src/index.css
packages/yumipos-web-shared/src/components/admin/*
```

### Wave 2 — Operational pages

```text
1. /admin/booking
2. /admin/orders
3. /admin/inventory
4. /admin/customers
```

Likely files:

```text
apps/admin/src/routes/admin/booking.lazy.tsx
apps/admin/src/routes/admin/orders.lazy.tsx
apps/admin/src/routes/admin/inventory.lazy.tsx
apps/admin/src/routes/admin/customers.lazy.tsx
```

Rules:

- Desktop table tetap ada.
- Mobile dense table berubah menjadi card list atau local horizontal scroll.
- Status tetap eksplisit.
- Inline action, edit, delete, dan filter tidak boleh hilang.

### Wave 3 — Finance and workforce

```text
1. /admin/finance
2. /admin/finance/expenses
3. /admin/finance/reports
4. /admin/attendance
5. /admin/operational-team
6. /admin/payroll
```

Likely files:

```text
apps/admin/src/routes/admin/finance/index.tsx
apps/admin/src/routes/admin/finance/-components/finance-dashboard.tsx
apps/admin/src/routes/admin/finance/expenses/-components/expenses-table.tsx
apps/admin/src/routes/admin/finance/reports/-components/*
apps/admin/src/routes/attendance.index.lazy.tsx
apps/admin/src/routes/admin/operational-team/-components/*
apps/admin/src/routes/admin/operational-team/payroll/*
```

Finance/payment data harus diperlakukan sebagai visual-only migration; jangan mengubah formula, status, settlement, atau query.

### Wave 4 — Supporting pages

```text
1. /admin/settings
2. /admin/products
3. /admin/discounts
4. /admin/minigames
5. /admin/notifications
6. onboarding/rekrutmen/supporting pages
```

## UI/UX Rules by Component

### Header

- Satu judul utama.
- Subtitle maksimal satu baris.
- Primary action terlihat tanpa hover.
- Mobile memakai back/title/action grid.
- Hindari header dengan banyak badge yang bersaing.

### KPI cards

- Maksimal 3–4 KPI utama di atas.
- Value besar tetapi tidak oversized.
- Label singkat.
- Trend/status menjadi metadata kecil.
- Nilai kosong memakai empty/loading state yang jelas.

### Table

- Desktop tetap table-first.
- Header ringan, tidak menggunakan background terlalu gelap.
- Row hover subtle.
- Semua action tetap accessible.
- Kolom panjang memakai `truncate` + `title` bila diperlukan.
- Mobile memakai card list untuk tabel dengan banyak kolom.

### Filter bar

- Search dan filter utama tetap terlihat.
- Filter sekunder dapat masuk popover/sheet.
- Hindari filter panel tinggi yang mengambil seluruh viewport.
- Tombol reset hanya muncul ketika filter aktif.

### Forms

- Label ringkas.
- Input 40–44px.
- Error diletakkan dekat field.
- Primary CTA tunggal.
- Jangan reset form saat error.

### States

Setiap halaman data-driven wajib memiliki:

```text
loading
empty
error
saving/submitting
success feedback
```

Copy harus langsung dan natural dalam Bahasa Indonesia.

## CSS Migration Rules

### Before → After

```text
rounded-3xl / rounded-2xl campuran → rounded-[22px] untuk card
p-6 / p-5 berulang → p-3 atau p-4
text-3xl default → text-xl/text-2xl sesuai hierarchy
shadow-lg di semua card → shadow ringan, hover-only bila cukup
gap-6/gap-8 → gap-3/gap-4
h-12/h-14 semua control → min-h-10/min-h-11 sesuai kebutuhan
```

Jangan melakukan global regex replacement pada seluruh TSX. Setiap route perlu dipetakan karena class yang sama dapat memiliki fungsi berbeda.

## Data, Database, dan Integration Impact

### Database schema

Tidak ada perubahan schema yang direncanakan.

```text
Database impact: none
Migration: none
RLS: unchanged
RPC: unchanged
REST/API path: unchanged
```

### Backend integration

Tidak ada perubahan pada:

```text
- Supabase Edge Functions;
- API helper;
- hybrid hooks;
- payment provider;
- finance calculation;
- attendance logic;
- booking capacity logic.
```

### AI/LLM and Telegram

Tidak ada perubahan integration AI/LLM atau Telegram. Komponen visual hanya menerima data dan callback existing.

### Multi-source data flow

Tidak berubah:

```text
Supabase/shared hooks
        ↓
Admin route state
        ↓
shared visual component
        ↓
user interaction callback
        ↓
existing write action
```

## No-Hardcode Audit

Nilai berikut tidak boleh di-hardcode saat migrasi visual:

```text
- produk;
- kategori;
- harga;
- booking type/event type;
- status bisnis;
- kapasitas;
- role/permission;
- finance totals;
- inventory values;
- user/customer data.
```

Yang boleh menjadi constant visual:

```text
- radius;
- spacing;
- typography token;
- icon map;
- breakpoint;
- label teknis UI yang tidak berasal dari DB.
```

## Risk and Mitigation

| Risiko | Mitigasi |
|---|---|
| UI terlalu compact | Uji 320px, 375px, 768px, 1024px, desktop |
| Action hilang saat redesign | Audit semua handler sebelum patch |
| Permission berubah tanpa sengaja | Tidak menyentuh guard/hook auth |
| Tabel sulit dibaca | Pertahankan prioritas kolom dan local scroll/card mobile |
| Shared component terlalu generic | Mulai dari primitives kecil, bukan satu mega-component |
| Customer ikut berubah | Deploy scope tetap `apps/admin`; shared token baru opt-in dahulu |
| PWA menampilkan bundle lama | Naikkan cache version dan verifikasi index/SW/hash |
| Regression finance/booking | Visual-only diff review dan route smoke test |
| Patch TSX merusak JSX | Patch kecil, build setelah setiap wave, cek `git diff --check` |

## Verification Plan

### Source checks

```bash
git diff --check
bunx turbo check-types --filter=@yumipos/admin
```

Jika typecheck penuh memiliki error pre-existing, pisahkan error baru dari baseline dan laporkan secara eksplisit.

### Build

```bash
cd apps/admin
rm -rf /tmp/esbuild-*
TMPDIR=/opt/djiwatentramapp/.tmp node ../../node_modules/vite/bin/vite.js build
```

Acceptance criteria:

```text
✓ build selesai dengan “built in ...s”
✓ route tree berhasil dibuat
✓ tidak ada syntax/JSX error baru
✓ warning pre-existing dicatat, bukan disembunyikan
```

### Browser/UI verification

Untuk setiap wave:

```text
- desktop 1440px;
- tablet 768px;
- mobile 390px;
- mobile 320px;
```

Capture screenshot untuk:

```text
- /admin;
- /admin/booking;
- /admin/orders;
- /admin/inventory;
- /admin/finance;
- satu route workforce.
```

Cek:

```text
- tidak ada horizontal overflow;
- header tidak overlap;
- sidebar tidak menutupi content;
- table/card dapat dibaca;
- primary action tetap terlihat;
- loading/empty/error state tidak rusak;
- tidak ada console error;
- modal dan dropdown tidak terpotong.
```

### Production verification

Deploy hanya Admin ke:

```text
https://admindjiwatentram.web.id
```

Verifikasi:

```bash
curl -I https://admindjiwatentram.web.id/
curl -I https://admindjiwatentram.web.id/admin
curl -I https://admindjiwatentram.web.id/admin/booking
```

Audit hash chain:

```text
production index.html
→ index hashed JS/CSS
→ lazy route bundle
→ Service Worker cache/version
```

## Implementation Order

1. Baseline screenshot dan source audit seluruh subpage.
2. Buat design token tanpa mengaktifkan perubahan lintas app secara agresif.
3. Buat shared Admin primitives.
4. Modernisasi `AdminLayout` dan responsive navigation.
5. Modernisasi `/admin` dashboard.
6. Migrasikan booking, orders, inventory, customers.
7. Migrasikan finance dan workforce.
8. Migrasikan supporting pages.
9. Jalankan visual regression checklist.
10. Build/typecheck.
11. Deploy hanya `apps/admin`.
12. Verifikasi production hash, route, PWA, dan screenshot.

## Acceptance Criteria

```text
[ ] Semua subpage Admin menggunakan visual tokens yang konsisten.
[ ] /admin terlihat modern Apple/iOS tanpa kehilangan data penting.
[ ] Desktop tetap data-dense dan operasional.
[ ] Mobile tidak menjadi desktop yang dipaksa mengecil.
[ ] Sidebar/header/action konsisten di seluruh route.
[ ] Loading, empty, error, saving state tersedia.
[ ] Business logic dan backend tidak berubah.
[ ] Permission/auth tidak berubah.
[ ] Customer App tidak ikut berubah kecuali komponen shared memang opt-in.
[ ] Build dan typecheck target berhasil.
[ ] Production deploy hanya untuk Admin.
[ ] Screenshot before/after tersedia untuk route prioritas.
```

## Open Decision

Rekomendasi implementasi tetap:

```text
Shared tokens + shared Admin primitives + phased route migration
```

Bukan:

```text
Shared package saja
```

dan bukan:

```text
Rewrite total apps/admin
```
