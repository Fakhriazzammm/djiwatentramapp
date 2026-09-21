# Plan: Full Overhaul Admin Booking — Apple/iOS Operational Workspace

**Status:** Draft — menunggu persetujuan implementasi
**Tanggal:** 2026-09-21 WIB
**Scope:** `apps/admin` — seluruh workspace Admin Booking
**Entry domain:** Admin `admindjiwatentram.yumme.id`
**Design source of truth:** `/opt/djiwatentramapp/DESIGN.md` + `frontend-design/ai-product-design-dna/SKILL.md` + Apple HIG
**Domain skill:** `software-development/admin-booking-ux-overhaul`

> Plan ini hanya untuk Admin Booking. Public `apps/booking` tetap menjadi sumber input customer dan tidak dirombak dalam wave pertama.

---

## 1. Tujuan

Mengubah Admin Booking dari satu halaman besar yang mencampur kalender, daftar booking, kapasitas, konfigurasi, menu, dan form menjadi workspace operasional yang matang:

- cepat dipahami dalam 3 detik;
- setiap submenu membuka halaman/route yang benar-benar berbeda;
- dashboard memprioritaskan keputusan operasional, bukan kumpulan angka kosong;
- kalender menjadi alat monitoring kapasitas dan kedatangan;
- data booking menjadi tabel operasional dengan detail drawer;
- kapasitas memiliki conflict warning;
- konfigurasi public booking dipisahkan dari pekerjaan harian;
- seluruh UI mengikuti Apple/iOS interaction language: grouped surfaces, clear hierarchy, soft depth, touch-safe controls, purposeful motion, dan responsive mobile fallback.

Tidak boleh ada hardcode untuk jumlah booking, kapasitas, harga, status, atau data customer.

---

## 2. Masalah Existing yang Sudah Diverifikasi

### Source utama

```text
apps/admin/src/routes/admin/booking.tsx
apps/admin/src/routes/admin/booking.lazy.tsx        # ±1.800 baris; state + data + UI bercampur
apps/admin/src/hooks/use-hybrid-booking-data.ts
apps/admin/src/hooks/use-hybrid-write-actions.ts    # shared hook besar; booking action sekitar area 3.100+
apps/admin/src/routes/admin/route.tsx                # sidebar dan Admin shell
DESIGN.md
```

### Masalah UX dari screenshot

- Delapan KPI tampil setara walaupun scope periodenya tidak terlihat.
- Semua angka `0` sulit dibedakan dari loading/empty/error.
- Kalender dan panel kanan tidak seimbang saat tanggal kosong.
- Empty state hanya memberi informasi, tidak memberi langkah berikutnya.
- Perbedaan `Kalender`, `Booking`, dan `Kapasitas` belum cukup tegas.
- Panel detail belum terasa jelas sebagai detail panel/drawer.
- Kapasitas `2/100 tamu` dan `1/15 meja` belum memiliki legenda/konteks yang cukup.
- Konfigurasi public booking berada dalam workspace yang sama dengan monitoring harian.
- Route/query tab sebelumnya berisiko membuat klik sidebar terlihat seperti tetap di halaman yang sama.

### State/data existing yang wajib dipertahankan

```text
calendar | orders | capacity | general | products | form
```

Hook yang harus diaudit sebelum extraction:

```text
useHybridBookingDateCapacities
useHybridBookingMonthSummary
useHybridBookingOrdersState
useHybridBookingSettings
useHybridCreateBookingOrder
useHybridDeleteBookingDateCapacity
useHybridDeleteBookingOrder
useHybridPatchBookingOrder
useHybridSetBookingBulkDateCapacity
useHybridSetBookingDateCapacity
useHybridUpdateBookingSettings
useHybridUpdateBookingStatus
useHybridAllProducts
```

---

## 3. Keputusan Arsitektur: Route Berbeda, Bukan Hanya Tab Query

### Opsi A — Satu route dengan query `?tab=`

| Kelebihan | Risiko |
|---|---|
| Perubahan route lebih kecil | Semua halaman tetap terasa satu halaman |
| Reuse component mudah | Active state dan browser history mudah ambigu |
| Tidak banyak file route | Deep-link dan refresh tab lebih rentan regresi |

### Opsi B — Route terpisah untuk setiap workspace **(rekomendasi)**

```text
/admin/booking
/admin/booking/calendar
/admin/booking/orders
/admin/booking/capacity
/admin/booking/settings
/admin/booking/settings/menu
/admin/booking/settings/form
```

| Kelebihan | Risiko |
|---|---|
| Setiap klik membuka halaman yang benar-benar berbeda | Perlu menambah route file dan route tree generation |
| Active state sidebar akurat | Perlu memindahkan state dari komponen monolitik |
| Deep-link, refresh, back/forward lebih dapat diprediksi | Extraction harus bertahap agar tidak kehilangan action |
| Mudah diverifikasi dan dikembangkan | Sedikit lebih banyak file |

### Keputusan

Gunakan **Opsi B**. Route lama `/admin/booking` tetap dipertahankan sebagai Overview agar bookmark dan link existing tidak rusak. Redirect internal tidak boleh menghapus query legacy sebelum parity diverifikasi.

---

## 4. Information Architecture Baru

```text
BOOKING
├── Dashboard
│   ├── Booking hari ini
│   ├── Booking berikutnya
│   ├── Occupancy
│   └── Attention queue
├── Kalender
│   ├── Bulan / minggu / hari
│   ├── Kapasitas tamu dan meja
│   └── Detail tanggal terpilih
├── Data Booking
│   ├── Search dan filter
│   ├── Detail booking
│   ├── Status booking
│   ├── Status pembayaran
│   └── Export
├── Kapasitas
│   ├── Default capacity
│   ├── Override tanggal/range
│   ├── Closed date
│   └── Conflict warning
└── Konfigurasi
    ├── Halaman Publik
    ├── Menu Booking
    └── Form Booking
```

### Route map

| Route | Fungsi | Primary action |
|---|---|---|
| `/admin/booking` | Overview operasional | Tambah booking / buka attention item |
| `/admin/booking/calendar` | Monitoring tanggal dan occupancy | Pilih tanggal / tambah booking |
| `/admin/booking/orders` | Daftar dan pengelolaan booking | Search/filter/detail/status |
| `/admin/booking/capacity` | Pengaturan kapasitas | Simpan override/closed date |
| `/admin/booking/settings` | Konfigurasi halaman publik | Preview/simpan settings |
| `/admin/booking/settings/menu` | Produk/menu booking | Atur featured/availability |
| `/admin/booking/settings/form` | Form custom booking | Tambah/edit/reorder field |

---

## 5. Design Contract Apple/iOS

### Visual

- Light-first: white / near-white surface.
- Accent utama: azure/deep blue existing, bukan menambah banyak warna brand.
- Card utama: radius sekitar 20–24px, soft shadow, satu pesan utama.
- Controls: minimum 44px touch target, radius 12–14px.
- Typography: heading memakai display font existing, body tetap readable; hindari semua teks kecil.
- Icon: Lucide line icon konsisten; tidak memakai emoji sebagai icon UI.
- Separator: gunakan grouped sections dan quiet border, kurangi card bertumpuk.
- Status: booking dan payment memiliki warna/icon/label berbeda; warna bukan satu-satunya signal.

### Motion

- Micro interaction ±180ms.
- Drawer/navigation ±320ms dengan easing iOS.
- `AnimatePresence` hanya untuk hierarchy/navigation/detail, bukan dekorasi.
- Hormati `prefers-reduced-motion`.

### Responsive

- Desktop: sidebar + workspace-first layout, calendar/table + detail panel.
- Tablet: toolbar dapat wrap terkontrol tanpa horizontal overflow.
- Mobile: filter sheet, booking cards, detail bottom sheet/full-screen, CTA touch-safe.
- Tidak boleh ada action yang hanya muncul lewat hover.
- Tidak boleh ada scroll horizontal global.

### Tujuh state wajib

Setiap workspace memiliki:

```text
loading → skeleton → populated
empty → CTA aman
error → pesan inline + retry
saving → disabled/progress
success → toast + read-back
confirmation → modal untuk destructive/high-risk action
```

---

## 6. Spesifikasi Per Workspace

### 6.1 Dashboard `/admin/booking`

Struktur:

```text
Header
├── Manajemen Booking
├── periode aktif + last updated
├── Refresh
└── Tambah booking

Context toolbar
├── Hari ini / Besok / Minggu ini / custom
├── Booking status
└── Payment status

Operational summary
├── Booking aktif
├── Tamu terjadwal
├── Meja terisi / kapasitas
├── Menunggu pembayaran
└── Perlu perhatian

Main workspace
├── Booking berikutnya
├── Ringkasan kalender 7 hari
└── Attention queue
```

KPI harus menyebut scope, misalnya `Booking hari ini`, bukan hanya `Booking`. Saat data belum selesai dimuat gunakan skeleton atau `—`, bukan angka nol yang menyesatkan.

Attention queue menampilkan, jika memang ada data:

- booking hari ini yang belum tiba;
- payment pending mendekati waktu kedatangan;
- paid tetapi belum confirmed;
- kapasitas hampir penuh;
- konflik kapasitas;
- closed date dengan booking aktif.

Jika tidak ada exception, tampilkan empty state positif dan CTA ke kalender.

### 6.2 Kalender `/admin/booking/calendar`

Desktop:

```text
Toolbar tanggal/filter
┌──────────────────────────────┬─────────────────────────────┐
│ Month/week/day calendar      │ Selected date detail         │
│ occupancy indicators         │ summary + booking list       │
│ today/closed/full states     │ quick safe actions           │
└──────────────────────────────┴─────────────────────────────┘
```

Cell menampilkan:

- tanggal;
- booking aktif;
- tamu terjadwal / kapasitas;
- meja terisi / kapasitas;
- today/selected/closed/full state;
- semantic label/icon selain warna.

Panel tanggal kosong tetap informatif:

```text
Belum ada booking
0/100 tamu · 0/15 meja
Tanggal tersedia untuk reservasi
[Tambah booking]
```

Semua perhitungan tanggal operasional memakai WIB/local calendar. Tidak memakai `toISOString().split("T")[0]` secara langsung untuk filter lokal.

### 6.3 Data Booking `/admin/booking/orders`

Toolbar:

```text
Search → Periode → Booking: Semua → Pembayaran: Semua → Refresh → Export
```

Desktop columns:

```text
Booking | Customer | Tanggal/Jam | Tamu/Meja | Pembayaran |
Booking status | Total | Actions
```

Detail drawer:

- booking code;
- nama/WhatsApp/email sesuai permission;
- tanggal dan waktu WIB;
- booking type/event;
- guest/table count;
- item menu dan quantity;
- payment method/status/reference;
- booking status;
- notes/custom answers;
- created/updated timestamp.

Mobile card wajib tetap menyediakan CTA detail/status tanpa hover.

### 6.4 Kapasitas `/admin/booking/capacity`

- Default max people.
- Default max tables.
- People per table.
- Override tanggal/range.
- Closed date.
- Occupancy preview.
- Conflict warning before save.
- Tidak boleh menurunkan kapasitas di bawah booking aktif secara silent.
- Save harus read-back record target.

### 6.5 Konfigurasi

#### Halaman Publik

- title, description, logo/banner, theme color;
- active state dan booking window;
- public preview/open URL;
- explicit inactive state.

#### Menu Booking

- search/category;
- featured products;
- availability/price/image warning;
- tidak mengubah authoritative checkout price.

#### Form Booking

- field type, label, required, placeholder, options;
- stable IDs;
- reorder/duplicate/delete dengan confirmation;
- duplicate/empty label validation;
- historical answers tidak dihapus saat field config dihapus;
- public preview.

---

## 7. Component Architecture

### Target structure

```text
apps/admin/src/routes/admin/booking/
├── booking-types.ts
├── booking-constants.ts
├── booking-formatters.ts
├── booking-status.ts
├── components/
│   ├── BookingAdminShell.tsx
│   ├── BookingHeader.tsx
│   ├── BookingToolbar.tsx
│   ├── BookingKpiStrip.tsx
│   ├── BookingAttentionQueue.tsx
│   ├── BookingCalendarWorkspace.tsx
│   ├── BookingCalendarCell.tsx
│   ├── BookingDateDetail.tsx
│   ├── BookingOrdersToolbar.tsx
│   ├── BookingOrderTable.tsx
│   ├── BookingOrderCard.tsx
│   ├── BookingOrderDetail.tsx
│   ├── BookingStatusBadge.tsx
│   ├── BookingPaymentBadge.tsx
│   ├── BookingCapacityWorkspace.tsx
│   ├── BookingSettingsWorkspace.tsx
│   ├── BookingMenuWorkspace.tsx
│   ├── BookingFormWorkspace.tsx
│   └── BookingStateViews.tsx
└── hooks/
    ├── useBookingAdminFilters.ts
    ├── useBookingAdminMetrics.ts
    └── useBookingAdminSelection.ts
```

### Refactor rule

`booking.lazy.tsx` saat ini ±1.800 baris dan tidak boleh di-rewrite buta. Extraction order:

1. lock existing behavior/data contract;
2. extract types, status map, formatter, timezone helper;
3. extract read-only calendar/table/detail;
4. extract write form/action handler;
5. add route files and thin page orchestrators;
6. delete duplicate legacy render only after parity checks.

---

## 8. Database Schema dan Data Contract

### Existing entities yang harus diverifikasi sebelum coding

```text
pos.booking_settings
pos.booking_date_capacity
pos.booking_orders
pos.booking_order_items
pos.products / public.pos_products_all
pos.categories atau public.pos_categories
public.financial_transactions (read-only/payment linkage bila tersedia)
```

### Mapping existing frontend

```text
public.pos_booking_settings       ← useHybridBookingSettings
public.pos_booking_orders         ← useHybridBookingOrdersState
public.pos_booking_date_capacity  ← useHybridBookingDateCapacities
public.pos_products_all           ← useHybridAllProducts
pos.booking_orders                ← manual booking/status write boundary
pos.booking_order_items           ← booking item snapshot/write boundary
```

### Fields yang wajib dipetakan dari migration/view/live read-only result

#### Booking order

```text
source_id
booking_code
slug
customer_name
customer_phone / whatsapp
customer_email
booking_date
arrival_time
booking_type / event_type
guest_count
table_count
booking_status
payment_status
payment_method
payment_reference / proof bila tersedia
total_amount
notes
custom_answers
created_at
updated_at
cancelled_at
```

#### Capacity

```text
booking_date
max_people
max_tables
people_per_table
is_closed
notes
created_at
updated_at
```

#### Settings

```text
slug
title
description
logo_url
banner_url
theme_color
featured_product_ids
custom_fields
booking_window_days
default_max_people
default_max_tables
default_people_per_table
is_active
raw/unknown JSONB keys
```

> Daftar di atas adalah contract checklist, bukan izin untuk mengasumsikan semua kolom tersedia. Wave 0 wajib mencocokkan nama kolom dengan migration, view, hook mapper, dan live read-only response sebelum implementasi.

### State machine invariant

```text
Booking:
pending → confirmed → arrived → seated → completed
exceptions: cancelled, no_show, expired

Payment:
pending → paid/verified → refunded
exception: failed
```

Booking paid tidak otomatis berarti confirmed/arrived. Paid booking tidak boleh hard-delete; gunakan cancellation/audit flow existing.

---

## 9. Multi-Source Data Flow

```text
Public apps/booking
    │ create booking / custom answers / item snapshot / payment
    ▼
public booking flow + payment boundary/RPC/Edge Function
    ▼
pos.booking_orders
pos.booking_order_items
pos.booking_date_capacity
pos.booking_settings
    │
    ▼
use-hybrid-booking-data
    │ realtime + refresh trigger
    ▼
Admin Booking routes
    ├── overview metrics
    ├── calendar occupancy
    ├── order table/detail
    ├── capacity editor
    └── configuration
```

### Integration constraints

- Tidak menambah AI/LLM dependency pada wave ini.
- Tidak menambah Telegram notification baru.
- Jika status mutation memicu notifikasi existing, audit canonical event dan dedupe sebelum menyentuh handler.
- Tidak mengubah Mayar/payment webhook contract sebagai bagian visual overhaul.
- Tidak membuat financial transaction baru hanya karena UI berubah.
- Produk/menu tetap membaca sumber katalog authoritative.

---

## 10. Implementation Waves

### Wave 0 — Contract and baseline audit

- Inventaris semua tab, modal, handler, form, field, dan hidden state.
- Trace hook → view/table → write action → payment/finance linkage.
- Cocokkan exact schema/column dan timezone behavior.
- Capture baseline typecheck/build/route behavior.
- Record unrelated dirty files; jangan stage file dari sesi lain.

### Wave 1 — Route and shell foundation

- Tambah route files sesuai route map.
- Regenerate TanStack route tree melalui build.
- Implement sidebar Booking dengan parent collapsible tanpa label ganda.
- Active state harus berbeda untuk setiap route.
- Tambah shared shell/header/toolbar/state views.

### Wave 2 — Overview and calendar

- Build Dashboard operational summary.
- Build KPI contextual strip dan attention queue.
- Extract calendar workspace dan date detail.
- Add occupancy/status legend.
- Preserve existing month summary/date capacity data.

### Wave 3 — Data Booking

- Extract booking table and mobile cards.
- Implement contextual filters/search/sort.
- Extract detail drawer.
- Preserve safe status/payment actions and read-back.
- Verify empty/loading/error/saving/confirmation.

### Wave 4 — Capacity and configuration

- Extract capacity editor with conflict warnings.
- Separate public settings/menu/form workspaces.
- Preserve unknown JSONB keys and historical answers.
- Verify save/read-back and public preview/open link.

### Wave 5 — QA and release

- Build Admin sequentially.
- Typecheck and distinguish baseline errors from new errors.
- Browser QA desktop 1440px/1024px and mobile 768px/430px/375px.
- Click every sidebar route and verify URL + visible unique heading.
- Test back/forward, refresh deep-link, collapsed sidebar, keyboard/focus, reduced motion.
- Verify production `index.html → entry bundle → lazy route chunks → sw.js → version.json`.
- Deploy only after release approval.

---

## 11. Files Likely to Change

### Primary

```text
apps/admin/src/routes/admin/booking.tsx
apps/admin/src/routes/admin/booking.lazy.tsx
apps/admin/src/routes/admin/route.tsx
```

### New route files

```text
apps/admin/src/routes/admin/booking/calendar.tsx
apps/admin/src/routes/admin/booking/calendar.lazy.tsx
apps/admin/src/routes/admin/booking/orders.tsx
apps/admin/src/routes/admin/booking/orders.lazy.tsx
apps/admin/src/routes/admin/booking/capacity.tsx
apps/admin/src/routes/admin/booking/capacity.lazy.tsx
apps/admin/src/routes/admin/booking/settings.tsx
apps/admin/src/routes/admin/booking/settings.lazy.tsx
apps/admin/src/routes/admin/booking/settings/menu.tsx
apps/admin/src/routes/admin/booking/settings/menu.lazy.tsx
apps/admin/src/routes/admin/booking/settings/form.tsx
apps/admin/src/routes/admin/booking/settings/form.lazy.tsx
```

### New component directory

```text
apps/admin/src/routes/admin/booking/
```

### Conditional data/backend files

```text
apps/admin/src/hooks/use-hybrid-booking-data.ts
apps/admin/src/hooks/use-hybrid-write-actions.ts
supabase/functions/*
supabase/migrations/*
```

Only change conditional files if Wave 0 proves a contract/safety gap. Migration must be additive, idempotent, and have rollback/read-back plan.

### Generated files

```text
apps/admin/src/routeTree.gen.ts
apps/admin/public/version.json
apps/admin/src/lib/version.ts
scripts/BUILD_NUMBER
```

Generated files are release artifacts and must not be mixed into feature staging accidentally.

---

## 12. Verification Matrix

### Navigation

- [ ] Booking parent expands/collapses like Djiwa App.
- [ ] No duplicate `BOOKING` + `Booking` label in expanded sidebar.
- [ ] Dashboard, Kalender, Data Booking, Kapasitas, Konfigurasi are distinct routes.
- [ ] Active state matches exact current route.
- [ ] Sidebar state persists and auto-opens on child route.
- [ ] Deep-link and browser refresh work.

### UI/UX

- [ ] Purpose and period visible within 3 seconds.
- [ ] Primary CTA visible and unambiguous.
- [ ] KPI labels include scope.
- [ ] No decorative card wall.
- [ ] Calendar/detail workspace balanced when empty.
- [ ] Empty state includes context + safe next action.
- [ ] Table/detail drawer usable without hover-only action.
- [ ] Mobile has no global horizontal overflow.
- [ ] Touch targets ≥44px.
- [ ] Keyboard/focus/aria labels work.
- [ ] `prefers-reduced-motion` honored.

### Business/data safety

- [ ] Booking/payment state machines remain separate.
- [ ] Paid booking cannot hard-delete.
- [ ] Status transitions are allowlisted.
- [ ] Capacity conflict visible before save.
- [ ] Date filtering uses WIB/local date.
- [ ] PII appears only in authorized detail context.
- [ ] No hardcoded KPI/capacity/price/booking values.
- [ ] Mutation read-back verifies exact target.
- [ ] Existing public booking/payment flow remains unchanged.

### Release

- [ ] `git diff --check` passes.
- [ ] No literal escaped-tab corruption in edited TSX.
- [ ] Target build succeeds.
- [ ] Target typecheck has no new errors.
- [ ] Live route returns HTTP 200.
- [ ] Unique markers found in correct lazy bundles.
- [ ] `version.json` commit hash matches release commit.
- [ ] `sw.js`/cache behavior checked.
- [ ] Desktop and mobile screenshots captured before claiming complete.

---

## 13. Rollback Strategy

- Keep current `/admin/booking` implementation available until route parity is verified.
- Migrate one workspace at a time; do not delete old render path before acceptance checks.
- If a new route fails, keep legacy route accessible and revert only the affected route/component commit.
- Never rollback by deleting database records or rewriting historical booking/payment rows.
- Rollback deployment uses previous Admin `dist` artifact/commit, followed by public bundle and version verification.

---

## 14. Acceptance Criteria

Implementasi dianggap selesai hanya jika:

1. Sidebar Booking dapat expand/collapse dan tidak double.
2. Setiap submenu dapat diklik dan membuka route berbeda dengan heading berbeda.
3. Dashboard, kalender, data booking, kapasitas, dan konfigurasi tidak lagi menjadi satu layar monolitik.
4. Semua existing booking/payment/capacity action tetap berfungsi.
5. UI terlihat sebagai operational workspace Apple/iOS, bukan kumpulan kartu template.
6. Desktop dan mobile telah diverifikasi dengan screenshot nyata.
7. Build, route, bundle, service worker, dan production smoke test lulus.
8. Tidak ada secret, data sintetis, atau file unrelated yang ikut commit.

**Implementasi belum dimulai melalui plan ini. Menunggu approval eksplisit untuk masuk Wave 0.**
