# Plan: Admin UI/UX Phase 2 — Shell, Tabel, Filter, dan Responsive Experience

## Status

Draft plan — belum ada implementasi kode.

## Goal

Melanjutkan modernisasi visual `apps/admin` agar lebih terasa seperti operational app bergaya Apple/iOS: tenang, compact, cepat dipindai, dan konsisten di desktop maupun mobile.

Plan ini fokus pada area yang paling sering dipakai Admin:

```text
Admin shell
Sidebar/header
Page hierarchy
Table
Filter/search toolbar
Action toolbar
Drawer/bottom sheet
Loading/empty/error states
Responsive behavior
```

Tidak ada perubahan business logic.

## Scope Boundary

### In scope

- visual shell Admin;
- sidebar dan active navigation;
- header halaman;
- page title hierarchy;
- table visual dan density;
- filter/search/action toolbar;
- detail drawer/bottom sheet presentation;
- loading, empty, error, saving state presentation;
- responsive layout desktop/tablet/mobile;
- accessibility visual/interaction details;
- shared Admin visual primitives.

### Out of scope

- database/schema/migration;
- API atau Edge Function;
- Supabase query/hook;
- auth/authorization/permission;
- payment, finance calculation, inventory calculation;
- booking/order status lifecycle;
- route rename/delete;
- perubahan data atau payload;
- perubahan customer-facing app.

## Master Phase Roadmap

Plan ini mencakup seluruh tahapan modernisasi visual Admin dari foundation sampai production verification.

```text
PHASE 0 — Baseline dan audit
    ↓
PHASE 1 — Design foundation dan visual tokens
    ↓
PHASE 2 — Admin shell, sidebar, header, responsive navigation
    ↓
PHASE 3 — Dashboard /admin hierarchy dan quick actions
    ↓
PHASE 4 — Shared table, filter, button, form, badge, modal primitives
    ↓
PHASE 5 — Operational pages: booking, orders, inventory, customers
    ↓
PHASE 6 — Finance dan workforce: finance, expenses, reports, attendance, payroll
    ↓
PHASE 7 — Supporting pages: products, discounts, notifications, settings, onboarding
    ↓
PHASE 8 — Detail interaction: drawer, bottom sheet, confirmation, state UX
    ↓
PHASE 9 — Responsive dan accessibility audit
    ↓
PHASE 10 — Visual regression, build, typecheck, production deploy
```

### Phase 0 — Baseline dan audit

```text
- Inventaris seluruh route Admin.
- Identifikasi route yang memakai AdminLayout.
- Catat shared component dan route-local component.
- Audit variasi radius, padding, shadow, typography, button, table, modal.
- Ambil screenshot baseline pada /admin dan route prioritas.
- Catat baseline typecheck/build error sebelum perubahan.
- Pastikan working tree dirty changes dipisahkan dari scope sesi.
```

Output:

```text
- route inventory;
- component inventory;
- visual token comparison;
- baseline screenshot;
- baseline build/typecheck report.
```

### Phase 1 — Design foundation dan visual tokens

Lokasi kandidat:

```text
packages/yumipos-web-shared/src/theme.css
packages/yumipos-web-shared/src/components/admin/
apps/admin/src/index.css
```

Implementasi:

```text
- background dan surface token;
- text primary/muted;
- primary accent;
- card/control/pill radius;
- soft shadow;
- iOS easing dan duration;
- spacing rhythm;
- control height;
- typography display/body.
```

Safety:

```text
- token baru harus scoped atau opt-in;
- jangan mengubah Customer/Booking tanpa persetujuan;
- jangan memakai global tag selector yang merusak komponen lain.
```

### Phase 2 — Admin shell, sidebar, header, responsive navigation

Files:

```text
apps/admin/src/routes/admin/route.tsx
apps/admin/src/routes/__root.tsx
apps/admin/src/index.css
apps/admin/src/components/layout/Footer.tsx
```

Desktop:

```text
- sidebar compact sekitar 240px;
- active state blue-soft;
- section label muted;
- brand area lebih ringan;
- content max-width konsisten;
- sidebar scroll internal.
```

Mobile:

```text
- header back/title/action;
- horizontal tab navigation;
- sidebar tidak memaksa desktop layout;
- touch target minimal 44px;
- no global horizontal overflow.
```

Pertahankan:

```text
route guard
hasPermission
role/isAdmin
logout
Outlet
submenu state
localStorage preferences
```

### Phase 3 — Dashboard `/admin`

File utama:

```text
apps/admin/src/routes/admin/index.lazy.tsx
```

Hierarchy target:

```text
1. Page context/greeting
2. 3–4 KPI utama
3. Quick actions
4. Pending operational actions
5. Alert/anomaly
6. Trend/report sekunder
```

Implementasi visual:

```text
- hero tidak terlalu besar;
- KPI equal-height dan compact;
- primary CTA jelas;
- insight sekunder tidak mengalahkan data operasional;
- skeleton mengikuti bentuk final;
- angka/empty state tidak terlihat seperti dummy system.
```

### Phase 4 — Shared UI primitives

Lokasi:

```text
packages/yumipos-web-shared/src/components/admin/
```

Komponen:

```text
AdminPageShell
AdminHeader
AdminSectionHeading
AdminStatCard
AdminFilterBar
AdminSearchField
AdminStatusBadge
AdminActionMenu
AdminDataTableShell
AdminMobileDataCard
AdminDetailDrawer
AdminBottomSheet
AdminEmptyState
AdminErrorState
AdminLoadingSkeleton
AdminConfirmDialog
```

Rules:

```text
- data-driven;
- tanpa hook domain;
- callback diberikan oleh route;
- className extension aman;
- reduced motion;
- keyboard/focus support;
- tidak hardcode business data.
```

Komponen dasar yang perlu distandarkan:

```text
- Button;
- Input;
- Textarea;
- Select;
- Card;
- Badge;
- Dialog/Sheet;
- Skeleton;
- Toast.
```

### Phase 5 — Operational pages

Route prioritas:

```text
/admin/booking
/admin/orders
/admin/inventory
/admin/customers
```

Visual target:

```text
- page header compact;
- filter toolbar satu baris di desktop;
- status semantic pill;
- table header ringan;
- row height konsisten;
- action menu tidak mendominasi;
- mobile data-heavy table menjadi card list atau local horizontal scroll;
- detail dapat dibuka tanpa kehilangan context.
```

Tidak boleh berubah:

```text
- status lifecycle;
- order/booking action;
- inventory movement;
- query/hook;
- column meaning;
- permission;
- bulk action.
```

### Phase 6 — Finance dan workforce

Route/component:

```text
/admin/finance
/admin/finance/expenses
/admin/finance/reports
/admin/attendance
/admin/operational-team
/admin/operational-team/payroll
```

Visual target:

```text
- currency alignment;
- period selector compact;
- finance summary card jelas;
- chart tidak terlalu dekoratif;
- expense table compact;
- payroll detail tetap terbaca;
- attendance status menggunakan semantic badge;
- mobile period/filter tetap mudah digunakan.
```

Safety ekstra:

```text
- jangan ubah formula;
- jangan ubah settlement/reconciliation;
- jangan ubah payroll calculation;
- jangan ubah attendance status;
- jangan ubah export payload atau report query.
```

### Phase 7 — Supporting pages

Route/page target:

```text
/admin/products
/admin/discounts
/admin/pos-notifications
/admin/settings
/admin/onboarding
/admin/operational-team/rekrutmen
/admin/kol
/admin/minigames
/admin/ai-chat
```

Implementasi:

```text
- gunakan AdminHeader dan AdminSectionHeading;
- gunakan standard card/form/button;
- rapikan tab dan filter;
- standarkan loading/empty/error state;
- kurangi dekorasi yang tidak mendukung keputusan;
- pertahankan tool-specific interaction seperti drag/drop, editor, export, dan AI chat.
```

### Phase 8 — Detail interaction dan state UX

Implementasi lintas route:

```text
- detail drawer desktop;
- bottom sheet mobile;
- modal confirmation untuk destructive action;
- saving state pada button;
- inline error dekat field;
- toast setelah visual state berubah;
- Escape dan backdrop close;
- focus restoration.
```

Pattern:

```text
list/card
  ↓ tap/click
DetailDrawer desktop / BottomSheet mobile
  ↓ action existing
Existing handler/API flow
```

Tidak membuat business action baru dalam phase ini.

### Phase 9 — Responsive dan accessibility audit

Viewport wajib:

```text
320px
375px
390px
430px
768px
1024px
1440px
```

Audit:

```text
- no global horizontal overflow;
- table/card readable;
- sidebar/content tidak overlap;
- header tidak hilang saat scroll;
- primary action mudah ditemukan;
- dropdown/modal tidak terpotong;
- keyboard navigation;
- visible focus;
- aria-label icon button;
- semantic status selain warna;
- reduced motion;
- WCAG AA contrast.
```

### Phase 10 — Visual regression, build, typecheck, production deploy

Source gate:

```bash
git diff --check
git diff --name-only HEAD
git diff --stat HEAD
```

Build:

```bash
cd /opt/djiwatentramapp/apps/admin
TMPDIR=/opt/djiwatentramapp/.tmp node ../../node_modules/vite/bin/vite.js build
```

Typecheck:

```bash
../../node_modules/.bin/tsc --noEmit --pretty false
```

Browser/screenshot:

```text
/admin
/admin/booking
/admin/orders
/admin/inventory
/admin/finance
/admin/attendance
```

Production:

```text
Deploy hanya apps/admin/dist
Target admindjiwatentram.web.id
Verifikasi HTTP, index hash, lazy bundle, dan Service Worker
```

Acceptance:

```text
- screenshot before/after route prioritas;
- build berhasil;
- baseline typecheck dibandingkan;
- tidak ada business logic diff;
- production HTTP berhasil;
- tidak ada app lain ikut ter-deploy.
```

## Phase Completion Gates

Setiap phase harus memenuhi gate sebelum lanjut:

```text
[ ] Scope file jelas
[ ] Visual diff sesuai tujuan
[ ] Logic/hooks/query tidak berubah
[ ] git diff --check berhasil
[ ] Route tetap dapat dibangun
[ ] Loading/empty/error tetap ada
[ ] Screenshot atau evidence keterbatasan tersedia
[ ] Tidak ada dirty file lain ikut di-commit
```


Foundation visual Admin Phase 1 sudah diterapkan pada beberapa route dan `apps/admin/src/index.css`. Namun masih ada area yang perlu dirapikan agar hasilnya benar-benar konsisten:

1. Banyak route masih memiliki layout lokal dan variasi class.
2. Sidebar masih memiliki banyak item/submenu sehingga hierarchy perlu diperjelas.
3. Tabel data-dense membutuhkan standar row height, header, status, dan action.
4. Filter bar perlu dibedakan antara desktop dan mobile.
5. Detail data sering lebih efisien ditampilkan melalui drawer/bottom sheet daripada selalu berpindah halaman.
6. Tidak semua empty/loading/error state memiliki komposisi visual yang seragam.
7. Visual harus diverifikasi dengan screenshot pada viewport 320px, 390px, 768px, 1024px, dan 1440px.

## Reference → Existing Feature Mapping

| Visual block yang dituju | Feature existing |
|---|---|
| App shell/header | `AdminLayout` di `apps/admin/src/routes/admin/route.tsx` |
| Sidebar navigation | `DesktopNavLink`, `DesktopSubNavLink`, `SidebarSection` |
| Page header | Header/title/action lokal di setiap route |
| KPI cards | `/admin` dashboard dan finance dashboard |
| Filter chips/toolbar | Booking, orders, inventory, finance, attendance |
| Data table | Orders, inventory, customers, expenses, payroll, reports |
| Detail drawer/modal | Booking, orders, expenses, confirmation modal |
| Mobile navigation | Existing responsive Admin layout dan route-specific controls |
| Empty/error/loading | Shared `Skeleton`, state card, route-local states |

## Design Philosophy

| Prinsip | Rule implementation |
|---|---|
| Calm hierarchy | Satu page title, satu primary action, metadata sekunder muted |
| Apple-style surface | Background `#f7f9fc`, surface putih, border tipis, soft shadow |
| Data clarity | Data utama bold; metadata muted; status semantic pill |
| Compact but breathable | Card `20–24px`, controls `40–44px`, section gap `16–24px` |
| Progressive disclosure | Filter sekunder/detail masuk popover atau drawer |
| Responsive by intent | Desktop table/sidebar; mobile card/tab/bottom sheet |
| Motion with purpose | Press 180ms, sheet 320ms, reduced-motion support |

## Alternatives Analysis

### Option A: Hanya memperbaiki shared CSS global

| Pros | Cons |
|---|---|
| ✅ Cepat | ❌ Tidak memperbaiki struktur layout lokal |
| ✅ Risiko logic rendah | ❌ Tabel/filter tiap route tetap berbeda |
| ✅ Dampak luas | ❌ Bisa terkena selector conflict |

### Option B: Redesign setiap route tanpa shared primitives

| Pros | Cons |
|---|---|
| ✅ Kontrol penuh per halaman | ❌ Duplikasi tinggi |
| ✅ Bisa menyesuaikan domain | ❌ Sulit menjaga konsistensi |
|  | ❌ Maintenance mahal |

### Option C: Shared Admin primitives + migrasi route prioritas

| Pros | Cons |
|---|---|
| ✅ Konsistensi lintas subpage | ❌ Membutuhkan migrasi bertahap |
| ✅ Logic tetap berada di route | ❌ Perlu audit props dan state |
| ✅ Mudah dipakai untuk fitur baru | ❌ Tidak semua halaman berubah otomatis |
| ✅ Risiko lebih terkontrol |  |

### Recommendation

Pilih **Option C**:

```text
shared visual primitives
+
Admin shell refinement
+
route migration berdasarkan prioritas penggunaan
```

Shared CSS tetap menjadi safety net, tetapi perubahan utama harus menggunakan komponen/primitives yang eksplisit agar tidak bergantung pada selector global yang terlalu luas.

## Target Information Architecture

### Desktop

```text
┌──────────────┬─────────────────────────────────────┐
│ Brand        │ Page title                 [Action]  │
│              ├─────────────────────────────────────┤
│ UTAMA        │ Context / period / metadata         │
│ Dasbor       ├─────────────────────────────────────┤
│ Booking      │ KPI atau summary utama              │
│ Pesanan      ├─────────────────────────────────────┤
│              │ Filter + search + actions            │
│ OPERASIONAL  ├─────────────────────────────────────┤
│ Inventory    │ Table/card data                      │
│ Produk       │                                     │
│ Tim          │                                     │
└──────────────┴─────────────────────────────────────┘
```

### Mobile

```text
┌──────────────────────────┐
│ ←  Page title        ⋯   │
├──────────────────────────┤
│ Context / period         │
├──────────────────────────┤
│ [Tab] [Tab] [Tab] →      │
├──────────────────────────┤
│ Search / filter          │
├──────────────────────────┤
│ Summary card             │
├──────────────────────────┤
│ Data card list           │
└──────────────────────────┘
```

## Shared Admin Primitives

Kandidat lokasi:

```text
packages/yumipos-web-shared/src/components/admin/
```

Komponen:

```text
AdminPageShell
AdminHeader
AdminSidebarSection
AdminMobileTabs
AdminSectionHeading
AdminStatCard
AdminFilterBar
AdminSearchField
AdminStatusBadge
AdminActionMenu
AdminDataTableShell
AdminMobileDataCard
AdminDetailDrawer
AdminBottomSheet
AdminEmptyState
AdminErrorState
AdminLoadingSkeleton
AdminConfirmDialog
```

### Rules

- Komponen tidak memanggil hook domain.
- Semua data dan callback diberikan melalui props.
- Tidak hardcode status bisnis, harga, produk, user, booking, atau transaksi.
- `className` dapat dioverride secara aman.
- Button/action memiliki keyboard focus dan `aria-label`.
- Drawer/bottom sheet memiliki close button dan Escape behavior.
- Respect `prefers-reduced-motion`.

## Admin Shell Upgrade

### Files likely to change

```text
apps/admin/src/routes/admin/route.tsx
apps/admin/src/routes/__root.tsx
apps/admin/src/index.css
apps/admin/src/components/layout/Footer.tsx
packages/yumipos-web-shared/src/components/admin/*
```

### Visual changes

```text
- sidebar width desktop sekitar 240px;
- active state blue-soft, bukan blok biru berat;
- section label kecil dan muted;
- header 48–56px;
- mobile header dengan back/title/action;
- mobile tabs horizontal dan tidak wrapping;
- content max-width konsisten;
- scroll container memiliki min-height: 0;
- footer/sidebar tidak ikut scroll ketika content scroll.
```

### Safety

Pertahankan tanpa perubahan:

```text
- route guard;
- hasPermission;
- role/isAdmin;
- logout;
- submenu open state;
- localStorage preference;
- `Outlet`.
```

## Table Specification

### Desktop table

```text
Container : rounded-2xl/24px, white surface, thin border
Header    : muted surface, uppercase 10px, nowrap
Body      : compact 12–14px, row hover subtle
Status    : semantic pill, 10–11px
Action     : icon button/menu, 40px target
Overflow  : local horizontal scroll only
```

Rules:

- Jangan menghapus kolom data.
- Kolom tetap `whitespace-nowrap` jika data padat.
- Teks panjang memakai `truncate` + `title` hanya untuk field yang memang aman dipotong.
- Checkbox/bulk selection tetap dipertahankan.
- Inline edit tetap memakai handler existing.
- Export button tetap tersedia.
- Pagination/sort tetap memakai logic existing.

### Mobile data view

Gunakan card list jika table memiliki banyak kolom:

```text
Nama/entity utama
Status
Tanggal/periode
Nilai utama
Metadata sekunder
Action
```

Jangan mengubah menjadi card jika:

```text
- inline edit membutuhkan row table;
- multi-select lebih mudah melalui table;
- hanya ada 2–3 kolom pendek;
- tabel berada di dalam modal sempit.
```

## Filter/Search/Action Toolbar

### Desktop

```text
[Search] [Status] [Tanggal] [Kategori]        [Export] [Tambah]
```

### Mobile

```text
[Search........................]
[Filter] [Sort] [Actions]
```

Rules:

- Search utama tetap terlihat.
- Filter sekunder masuk popover/sheet.
- Active filter menjadi chip yang dapat dihapus.
- Tombol reset hanya muncul ketika filter aktif.
- Primary action tidak disembunyikan di menu jika sangat sering dipakai.
- Jangan mengubah query/state filter existing.

## Drawer/Bottom Sheet Specification

### Desktop

```text
Klik row/card
→ drawer dari kanan, width 360–480px
```

### Mobile

```text
Klik row/card
→ bottom sheet, max-height 90dvh
```

Isi:

```text
Header entity + status
Summary field penting
Timeline/detail
Secondary metadata
Action existing
```

Safety:

```text
- handler action tetap existing;
- tidak membuat operasi baru;
- close tidak menghapus state tanpa alasan;
- loading/saving state terlihat;
- confirmation untuk destructive action tetap ada.
```

## States Specification

### Loading

```text
- skeleton mengikuti bentuk final;
- jangan hanya spinner di tengah halaman;
- table memakai 3–5 skeleton rows;
- card grid memakai skeleton card.
```

### Empty

```text
icon line-only
headline singkat
description 1 kalimat
primary CTA jika relevan
```

### Error

```text
inline error dekat konten
pesan aman untuk user
[Coba lagi]
tidak menampilkan stack trace/secret
```

### Saving/submitting

```text
button disabled
spinner/icon kecil
copy “Menyimpan…”
form tidak di-reset saat gagal
```

## Route Migration Order

### Wave 1 — Shell and highest traffic

```text
1. AdminLayout
2. /admin dashboard
3. /admin/booking
4. /admin/orders
```

### Wave 2 — Data-heavy

```text
1. /admin/inventory
2. /admin/customers
3. /admin/products
4. /admin/discounts
```

### Wave 3 — Finance and workforce

```text
1. /admin/finance
2. /admin/finance/expenses
3. /admin/finance/reports
4. /admin/operational-team
5. /admin/attendance
6. /admin/payroll
```

### Wave 4 — Supporting and specialized

```text
1. notifications
2. settings
3. onboarding
4. recruitment
5. KOL/minigames/AI support screens
```

Files must be discovered and verified before patching; do not assume all routes use the same shell or table.

## Before/After Visual Mapping

| Area | Before | Target |
|---|---|---|
| Page background | Mixed/default background | `#f7f9fc` scoped Admin |
| Card radius | Mixed 12/16/24px | 20–24px cards |
| Control radius | Mixed | 12–14px |
| Button height | 36–56px | 40–44px |
| Section gap | 24–32px often | 16–24px |
| Table header | Heavy/varied | Light muted header |
| Table row | Often tall | Compact but readable |
| Status | Mixed badge style | Semantic pill |
| Filter | Large panels | Compact toolbar/chips |
| Detail | Full-page/modal variations | Drawer/bottom sheet pattern |
| Mobile | Desktop shrink | Intentional card/tab layout |
| Motion | Mixed | 180/320ms iOS curve |

## Accessibility Checklist

```text
[ ] All icon-only buttons have aria-label
[ ] Keyboard focus visible
[ ] Escape closes drawer/modal
[ ] Dialog/sheet has role and accessible title
[ ] Color is not the only status signal
[ ] Contrast meets WCAG AA
[ ] Touch targets at least 44px where critical
[ ] Reduced motion respected
[ ] Table headers remain associated with cells
[ ] Mobile horizontal scroll has accessible context
```

## No-Hardcode Audit

Visual migration tidak boleh menambahkan hardcode untuk:

```text
produk
harga
kategori
status transaksi
status booking
role
permission
kapasitas
finance totals
inventory values
customer/staff data
```

Hardcode yang boleh:

```text
radius
spacing
breakpoint
transition duration
visual label teknis
icon mapping
```

## Risk and Mitigation

| Risiko | Mitigasi |
|---|---|
| CSS global mengubah route tak sengaja | Scope dengan `body.admin-shell` atau primitive class |
| Tabel terlalu compact | Validasi screenshot dan readability pada 320–1440px |
| Action hilang saat table-to-card | Audit setiap handler sebelum mengubah markup |
| Sidebar mengganggu scroll | `min-h-0`, scroll hanya pada content container |
| Mobile filter sulit ditemukan | Search tetap visible; filter sekunder di sheet |
| Shared component terlalu besar | Mulai dari primitive kecil dan data-driven |
| Finance/booking behavior berubah | Hanya ubah class/markup visual, bukan state/query |
| PWA menyajikan CSS lama | Cache version/hash verification setelah deploy |
| Typecheck baseline berisik | Pisahkan pre-existing error dari regression baru |

## Verification Plan

### Source verification

```bash
git diff --check
git diff --name-only HEAD
```

Review wajib:

```text
- Tidak ada perubahan hooks/query/API.
- Tidak ada perubahan handler business logic.
- Tidak ada perubahan auth/permission.
- Tidak ada secret baru.
- Hanya file Admin/shared visual yang masuk commit.
```

### Build and typecheck

```bash
cd /opt/djiwatentramapp/apps/admin
TMPDIR=/opt/djiwatentramapp/.tmp node ../../node_modules/vite/bin/vite.js build
../../node_modules/.bin/tsc --noEmit --pretty false
```

Jika typecheck terblokir environment atau memiliki baseline error, catat error exact dan pastikan tidak ada error baru dari file yang diubah.

### Browser verification

Wajib screenshot live/local jika browser tersedia:

```text
- /admin
- /admin/booking
- /admin/orders
- /admin/inventory
- /admin/finance
- /admin/attendance
```

Viewport:

```text
320px
390px
768px
1024px
1440px
```

Checklist visual:

```text
[ ] Tidak ada horizontal overflow global
[ ] Sidebar tidak menutup content
[ ] Header tidak ikut hilang saat content scroll
[ ] Table/card mudah dibaca
[ ] Filter tetap discoverable
[ ] Primary action terlihat
[ ] Drawer/sheet tidak terpotong
[ ] Empty/loading/error state proporsional
[ ] Tidak ada console error
```

Jika browser tidak tersedia, jangan klaim visual sudah tervalidasi. Gunakan evidence build/DOM/HTTP dan minta screenshot user untuk visual confirmation.

### Production verification

Deploy hanya Admin:

```text
https://admindjiwatentram.web.id
```

Verifikasi:

```bash
curl -I https://admindjiwatentram.web.id/
curl -I https://admindjiwatentram.web.id/admin
curl -fsS https://admindjiwatentram.web.id/ | grep -E 'index-.*\\.(js|css)'
```

Pastikan:

```text
production index.html
→ hashed Admin CSS/JS
→ route lazy bundles
→ Service Worker cache/version
```

## Commit and Deployment Safety

```text
- Jangan gunakan git add -A.
- Audit git diff --name-only HEAD.
- Commit hanya file visual dari wave aktif.
- Jangan membawa dirty changes apps/customer, apps/booking, apps/pos, agents, migrations, atau LESSONS.md.
- Deploy hanya apps/admin/dist.
```

## Acceptance Criteria

```text
[ ] Admin shell memiliki hierarchy visual yang jelas.
[ ] Sidebar active state konsisten.
[ ] Tabel desktop lebih ringan dan mudah dipindai.
[ ] Tabel data-heavy memiliki mobile card strategy yang tepat.
[ ] Search/filter/action toolbar konsisten.
[ ] Drawer/bottom sheet mengikuti pola iOS.
[ ] Loading/empty/error/saving state konsisten.
[ ] Semua handler, permission, hooks, query, dan API tetap sama.
[ ] Tidak ada schema/API/auth change.
[ ] Tidak ada hardcoded business data.
[ ] Build berhasil.
[ ] Typecheck baseline diverifikasi.
[ ] Screenshot responsive tersedia atau keterbatasan browser dilaporkan.
[ ] Production HTTP/hash verification berhasil.
[ ] Commit dan deploy hanya scope Admin.
```

## Recommended Execution Strategy

```text
Wave 1: shell + dashboard + booking + orders
         ↓ build + screenshot + review
Wave 2: inventory + customers + products + discounts
         ↓ build + screenshot + review
Wave 3: finance + workforce
         ↓ build + screenshot + review
Wave 4: supporting pages
         ↓ final build + visual regression + deploy
```

Jangan menganggap seluruh Admin selesai hanya karena global CSS sudah berubah. Setiap wave perlu review route dan screenshot aktual.
