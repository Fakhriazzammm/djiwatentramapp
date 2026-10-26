# Plan: Booking System End-to-End Overhaul

## Goal

Merombak sistem booking Djiwa Tentram secara end-to-end agar menjadi workspace operasional yang cepat dipindai, aman untuk kapasitas dan pembayaran, mudah dirawat, serta terintegrasi penuh dengan public booking app di `https://booking.djiwatentram.web.id`.

Scope mencakup:

- fitur dan alur bisnis;
- seluruh tab Admin Booking;
- UI/UX desktop dan mobile;
- pemecahan komponen;
- shared data contract antara `apps/admin`, `apps/pos`, dan `apps/booking`;
- capacity locking;
- payment/finance integrity;
- status lifecycle;
- notification dan auditability;
- deployment serta production verification.

> Ini adalah plan implementasi. Tidak ada perubahan kode, schema, deployment, atau data production yang dilakukan saat membuat plan ini.

---

## Current Baseline

### Domain dan app

- Admin canonical: `https://admindjiwatentram.web.id/admin/booking`
- Public booking canonical: `https://booking.djiwatentram.web.id`
- Admin implementation:
  - `apps/admin/src/routes/admin/booking.lazy.tsx`
  - `apps/pos/src/routes/admin/booking.lazy.tsx`
- Public implementation:
  - `apps/booking/src/main.tsx`
  - `apps/booking/src/lib/client.ts`
  - `apps/booking/src/lib/booking-validation.ts`
- Admin booking backend:
  - `supabase/functions/booking-admin/index.ts`
  - `pos.admin_*` RPCs
- Public booking backend:
  - `supabase/functions/public-booking/index.ts`
  - public booking RPCs
- Payment:
  - `supabase/functions/mayar-proxy`
  - `supabase/functions/mayar-webhook/index.ts`
  - `pos.booking_orders.payment_gateway`
- Finance:
  - `pos.financial_transactions.booking_order_source_id`

### Existing Admin tabs

Operational:

1. Kalender
2. Booking
3. Kapasitas

Configuration:

4. Halaman Publik
5. Menu Booking
6. Formulir

### Existing public flow

```text
Landing
→ pilih tipe booking
→ event type jika diperlukan
→ tanggal + tamu + jam kedatangan
→ menu pre-order
→ review
→ data customer
→ create pending booking
→ create Mayar invoice
→ attach payment reference
→ redirect provider
→ verified webhook/status
```

### Existing state model

Booking status:

```text
pending → confirmed → arrived → seated → completed
exception: cancelled, no_show, expired
```

Payment status:

```text
pending → paid/verified → refunded
exception: failed
```

### Confirmed visual findings from screenshot

- Header dan page title jelas.
- Dua baris tab cukup mudah dipahami, tetapi memakan ruang vertikal.
- Kalender terlalu banyak whitespace.
- Panel kanan kosong ketika tanggal belum dipilih dan terasa seperti area yang belum selesai.
- Tidak ada CTA `Tambah Booking` yang terlihat pada calendar surface.
- `10/100p` dan `3/25m` tidak cukup eksplisit bagi pengguna baru.
- Grid kalender dan footer memiliki kontras rendah.
- Tidak ada legend occupancy/status yang memadai.

### Structural findings

- `apps/admin` dan `apps/pos` memiliki implementasi booking yang berbeda; harus disamakan kontraknya dan kemudian diarahkan ke shared component.
- `apps/booking/src/main.tsx` masih memuat seluruh public flow dalam satu file besar.
- Admin mutation sudah melalui `booking-admin` dan RPC, tetapi contract status/payment perlu diketatkan.
- Public payment sudah payment-first: booking pending dibuat sebelum invoice dan settlement menunggu webhook.
- Capacity create RPC sudah memakai advisory lock; availability public dan edit/admin paths tetap perlu audit konsistensi.
- Paid booking yang terhubung finance tidak boleh hard-delete.

---

## Architecture Decision

### Chosen approach: incremental safety-first, lalu shared extraction

Gunakan dua tahap:

1. **Wave 1–2:** perbaiki integrity dan UX di route yang kompatibel; jangan langsung split route besar.
2. **Wave 3–5:** ekstrak shared booking contract/components setelah behavior stabil.

Alasan:

- payment dan capacity lebih berisiko daripada visual refactor;
- route split langsung dapat memutus deep-link dan sidebar;
- `apps/admin` dan `apps/pos` harus tetap dapat dirilis secara terkontrol;
- shared component lebih aman setelah data contract dan state machine sudah jelas.

### Product design direction — simple, functional, fast

User requirement: UI/UX harus sederhana, mengutamakan fungsi dan kecepatan kerja, serta mengacu pada product design skill dan prinsip aplikasi iOS/Apple.

Ini berarti sistem tidak mengejar banyak dekorasi atau dashboard yang ramai. Setiap layar harus membantu operator mengambil keputusan atau menyelesaikan aksi dengan langkah sesedikit mungkin.

#### Design principles

1. **Function before decoration** — setiap card, warna, ikon, dan animasi harus membantu scan, status, atau action. Elemen dekoratif yang tidak membantu dihilangkan.
2. **One primary action** — setiap surface memiliki satu CTA utama yang jelas; action sekunder masuk menu kontekstual.
3. **Progressive disclosure** — tampilkan informasi penting terlebih dahulu; detail panjang dibuka melalui drawer/sheet, bukan memenuhi layar utama.
4. **Fast scanning** — gunakan hierarchy, whitespace terukur, typography, dan semantic status agar staff memahami kondisi dalam 2–3 detik.
5. **Native-feeling interaction** — gunakan pola iOS seperti grouped sections, segmented controls, sheets/drawers, confirmation yang kontekstual, touch target minimal 44px, dan feedback haptic-like melalui visual state/animation ringan.
6. **Direct manipulation** — klik tanggal, row, segmented filter, stepper, dan toggle harus memberi feedback segera tanpa navigasi yang tidak perlu.
7. **Calm interface** — light surfaces, satu accent utama, border/shadow tipis, radius konsisten 12–16px, dan warna status yang semantik.
8. **Content over chrome** — kurangi header/tab/panel yang menghabiskan ruang; prioritaskan booking, tamu, kapasitas, waktu, pembayaran, dan action.
9. **No hidden business meaning** — jangan memakai singkatan seperti `p`/`m` tanpa label; status dan kapasitas harus dapat dipahami tanpa tebakan.
10. **Performance is a UX feature** — lazy-load tab berat, pertahankan stale data saat refresh, tampilkan progress/saving state, dan hindari request berulang yang tidak diperlukan.

#### Apple/iOS-inspired visual specification

Gunakan prinsip dari `ai-product-design-dna`, `react-design-system-styling`, dan `screenshot-grounded-ui-refinement` sebagai quality bar, bukan menyalin UI Apple secara literal.

```text
Typography : Plus Jakarta Sans; hierarchy jelas; body minimal 14px bila memungkinkan
Surface    : putih/light neutral; grouped sections; satu accent brand dari settings
Spacing    : rhythm 4/8px; whitespace cukup tetapi tidak menghasilkan dead space
Radius     : 12–16px untuk cards/sheets; controls konsisten
Shadow     : sangat ringan; gunakan border untuk grouping utama
Control    : min-height 44px; keyboard/focus state; disabled state jelas
Motion     : subtle 150–220ms; tidak menghambat action; respect reduced motion
Color      : semantic green/amber/red/blue; selalu disertai label/icon
Navigation : segmented tabs untuk context kecil; sheet/drawer untuk detail
```

#### Speed budget UX

- Operator dapat menemukan booking hari ini tanpa membuka banyak menu.
- CTA `Tambah Booking` selalu terlihat pada operational surface.
- Klik tanggal menampilkan detail tanpa full-page navigation.
- Filter umum dapat dipakai dengan satu tap.
- Status action berada di detail drawer dan tidak tersembunyi di halaman lain.
- Loading menggunakan skeleton lokal; data lama tidak dibuat blank saat refresh.
- Save/error feedback muncul dekat dengan context action.
- Form tidak meminta data yang tidak dibutuhkan pada tahap tersebut.
- Mobile flow dapat diselesaikan dengan satu tangan dan tanpa horizontal scrolling.

#### Anti-pattern yang harus dihindari

- dashboard penuh card yang hanya mengulang angka;
- gradient/dekorasi tanpa fungsi;
- dua atau lebih CTA utama yang bersaing;
- tab terlalu banyak tanpa grouping;
- teks kecil untuk menghemat ruang;
- singkatan kapasitas yang tidak dijelaskan;
- modal besar untuk detail yang lebih cocok menjadi sheet;
- full reload setelah setiap perubahan kecil;
- spinner global yang menghilangkan seluruh data lama;
- action penting hanya tersedia melalui icon tanpa label/tooltip.

#### Design review gate

Sebelum implementasi UI dianggap selesai, review wajib menjawab:

```text
Apakah operator tahu harus melakukan apa dalam 3 detik?
Apakah CTA utama terlihat tanpa mencari?
Apakah informasi penting terbaca di mobile?
Apakah state loading/empty/error/saving jelas?
Apakah setiap elemen memiliki fungsi nyata?
Apakah flow lebih cepat dari UI sebelumnya?
Apakah status dapat dipahami tanpa hanya mengandalkan warna?
```

### Target architecture

```text
Booking Operations Workspace
├── Today / Summary
├── Calendar
├── Booking list
├── Capacity
└── Booking detail drawer

Booking Configuration
├── Public page
├── Menu booking
└── Form builder

Shared booking package
├── types
├── status machine
├── validation
├── date/WIB helpers
├── capacity display
├── status badges
└── data mappers

Canonical backend boundaries
├── booking-admin
├── public-booking
├── Mayar webhook/reconcile
└── protected RPCs
```

---

# Phase 0 — Contract and Safety Audit

## Objective

Tetapkan kontrak data dan state sebelum perubahan UI.

## Tasks

### 0.1 Booking/payment state matrix

Definisikan transition matrix untuk:

- booking status;
- payment status;
- siapa yang boleh menjalankan transition;
- apakah transition membuat finance transaction;
- apakah transition memengaruhi occupancy;
- apakah transition memicu notification.

Required rules:

- confirmed bukan bukti paid;
- redirect bukan bukti paid;
- payment `paid` wajib mempunyai provider proof atau verified manual policy;
- paid/finance-linked tidak dapat dihapus;
- refund tidak menghapus historical finance row;
- cancelled/expired/no_show tidak dihitung sebagai active occupancy.

### 0.2 Data contract inventory

Samakan mapping field:

```text
source_id ↔ _id
booking_code ↔ bookingCode
booking_date ↔ bookingDate
arrival_time ↔ arrivalTime
guest_count ↔ guestCount
table_count ↔ tableCount
booking_status ↔ bookingStatus
payment_status ↔ paymentStatus
```

Item harus dinormalisasi di boundary:

```text
productName = item.productName ?? item.name
```

### 0.3 WIB/date contract

Semua app menggunakan helper yang sama untuk:

- today;
- date range;
- month boundaries;
- arrival time `HH:mm`;
- availability.

Jangan mengubah local booking date menjadi UTC date secara tidak sengaja.

### 0.4 Live schema/RPC/grant audit

Read-only audit untuk:

- `pos.booking_orders`;
- `pos.booking_order_items`;
- `pos.booking_settings`;
- `pos.booking_date_capacity`;
- `pos.financial_transactions`;
- public views;
- `admin_*` RPC;
- public booking RPC;
- payment settlement RPC;
- RLS/grants;
- unique/idempotency indexes.

## Acceptance criteria

- Matrix transition terdokumentasi.
- Tidak ada status ambigu yang dipakai sebagai payment proof.
- Field mapping sama di ketiga app.
- Date tests konsisten WIB.
- Semua write boundary teridentifikasi.

---

# Phase 1 — Backend Integrity and Business Safety

## Objective

Pastikan kapasitas, payment, finance, deletion, dan status aman sebelum UI dirombak.

## Tasks

### 1.1 Atomic public booking create

Pastikan RPC:

- lock `slug + booking_date`;
- membaca kapasitas terbaru;
- menghitung table count server-side;
- menghitung occupancy active booking;
- membaca ulang product identity/availability/price;
- menyimpan custom answer snapshot;
- memakai idempotency key;
- menyimpan item secara atomic.

### 1.2 Capacity safety

Tambahkan/kuatkan:

- server-side capacity response dengan `bookedPeople`, `bookedTables`, `remainingPeople`, `remainingTables`;
- closed-date guard;
- conflict response `409`;
- validasi edit booking jika tanggal/tamu berubah;
- bulk capacity dry-run/preview sebelum commit;
- warning jika kapasitas baru lebih rendah dari active booking.

### 1.3 Payment contract

Pastikan:

```text
create pending booking
→ create invoice
→ attach invoice reference
→ provider webhook/verification
→ settle payment
→ create finance income exactly once
```

Tambahkan guard:

- amount provider harus sama dengan amount booking;
- invoice ID/transaction ID harus cocok;
- webhook retry idempotent;
- failed payment tidak menjadi paid;
- attach retry memakai booking yang sama;
- payment provider fields tidak dapat diubah sembarang dari client.

### 1.4 Admin manual payment

`Tandai Lunas` harus:

- memakai protected RPC/Edge Function;
- membuat finance transaction idempotent;
- menyimpan actor dan timestamp;
- mengubah payment status secara atomic;
- tidak hanya mengubah state frontend.

### 1.5 Cancellation/delete policy

- unpaid tanpa finance linkage: delete sesuai policy.
- finance-linked/paid: hanya `cancelled`.
- wajib cancellation reason.
- simpan actor dan timestamp.
- refund terpisah dari cancellation.
- jangan hard-delete booking paid.

### 1.6 Audit event

Jika belum tersedia, tambahkan secara additive:

```text
pos.booking_order_events
- source_id
- booking_order_source_id
- event_type
- actor_user_id
- actor_name
- payload jsonb
- created_at
```

Unique idempotency:

```text
booking_order_source_id + event_type + source_reference
```

## Acceptance criteria

- Concurrent booking tidak melewati kapasitas.
- Double submit hanya menghasilkan satu booking.
- Double webhook hanya menghasilkan satu finance transaction.
- Nominal mismatch ditolak.
- Paid booking tidak dapat dihapus.
- Semua perubahan status dapat ditelusuri.

---

# Phase 2 — Shared Booking Data Layer

## Objective

Hentikan divergence antara `apps/admin`, `apps/pos`, dan `apps/booking`.

## Proposed package

```text
packages/booking-shared/
├── types.ts
├── status.ts
├── validation.ts
├── date-wib.ts
├── capacity.ts
├── mappers.ts
├── formatters.ts
└── constants.ts
```

Jika package baru terlalu besar untuk wave awal, mulai dari shared files di `packages/yumipos-web-shared`.

## Shared responsibilities

- BookingOrder type.
- BookingDraft type.
- BookingPayment type.
- CapacityAvailability type.
- status transition helpers.
- payment badge helpers.
- item normalization.
- custom answer filtering.
- WIB date formatting.
- capacity display labels.
- source labels.
- error code mapping.

## Rules

- business options tetap dari DB;
- tidak hardcode booking type/event/product/price/capacity;
- icon dari whitelist;
- unknown raw settings key tidak boleh hilang saat save;
- fallback hanya untuk technical display, bukan business authority.

## Acceptance criteria

- Admin dan POS menampilkan status/field yang sama.
- Public dan Admin menampilkan tanggal/jam yang sama.
- Product item contract tidak lagi bergantung pada field alias yang berbeda.
- Shared unit tests lulus.

---

# Phase 3 — Admin Operational Workspace

## Objective

Ubah `/admin/booking` dari halaman konfigurasi campuran menjadi workspace operasional utama.

## Layout target

```text
┌─────────────────────────────────────────────────────────────┐
│ Booking                         Hari ini   + Tambah Booking │
│ 12 booking · 48 tamu · 15 meja · 2 belum lunas              │
├─────────────────────────────────────────────────────────────┤
│ Operasional: Kalender | Booking | Kapasitas                 │
│ Pengaturan: Tampilan | Menu | Formulir                      │
├─────────────────────────────────────────────────────────────┤
│ Content workspace                                            │
└─────────────────────────────────────────────────────────────┘
```

## 3.1 Summary section

Metrics:

- booking hari ini;
- total tamu;
- total meja;
- perlu konfirmasi;
- belum lunas;
- akan datang dalam 3 jam;
- kapasitas hari ini.

States:

- skeleton;
- stale data + refresh indicator;
- error retry;
- empty with CTA.

## 3.2 Calendar tab

### Desktop

- calendar kiri;
- selected date/detail kanan;
- sticky detail context;
- CTA tambah booking;
- today shortcut;
- occupancy labels lengkap.

### Cell format

```text
23
3 booking
10 / 100 tamu
3 / 25 meja
90 tamu tersisa
```

### Semantic colors

- green: aman;
- amber: mendekati penuh;
- red: penuh;
- gray: ditutup;
- blue: selected/today.

### Empty selected-date panel

Ganti pesan pasif menjadi:

```text
Ringkasan hari ini
- 0 booking
- 0 tamu
- kapasitas tersedia

[Tambah Booking]
```

### Mobile

- calendar full width;
- selected day summary di bawah;
- detail sebagai drawer;
- sticky CTA tidak menutup content.

## 3.3 Booking list tab

### Table/card fields

```text
Kode
Customer
WhatsApp
Tanggal & jam WIB
Tamu / meja
Booking status
Payment status
Total
Source
Aksi
```

### Filters

Pisahkan secara visual:

```text
Booking status: Semua, Menunggu, Dikonfirmasi, Tiba, Duduk, Selesai, Batal
Payment status: Semua, Belum bayar, Lunas, Refund
Source: Semua, Public, Manual, POS
Periode: Hari ini, Besok, Minggu ini, Custom
```

### Detail drawer

Urutan:

1. booking code + badges;
2. tanggal, jam WIB, tamu, meja;
3. customer + quick WhatsApp;
4. menu items;
5. custom answers non-empty;
6. notes;
7. payment proof/provider reference;
8. finance linkage;
9. timeline;
10. state-aware actions.

## 3.4 Capacity tab

Sections:

1. Default capacity.
2. Date override.
3. Range/bulk schedule.
4. Occupancy preview.
5. Conflict warnings.
6. Closed date list.

Show:

```text
Terpakai / kapasitas / tersisa
```

Do not allow save if active booking becomes invalid without explicit resolution.

## Acceptance criteria

- User dapat menemukan `Tambah Booking` tanpa belajar dari screenshot.
- Calendar/detail panel selalu actionable.
- Status booking dan payment terpisah.
- Mobile tidak horizontal overflow.
- List bisa dipindai cepat.
- Detail action mengikuti state.

---

# Phase 4 — Admin Configuration Workspace

## Objective

Menyederhanakan pengaturan tanpa mengganggu operasi harian.

## 4.1 Public page

Sections:

- identity;
- description;
- logo/banner;
- theme;
- active state;
- booking window;
- canonical public URL;
- copy/open URL;
- mobile/desktop preview;
- save state/last saved.

Preview harus menggunakan shared renderer atau fixture yang sama dengan public app, bukan mock yang terlalu berbeda.

## 4.2 Menu booking

Fitur:

- all active products vs selected products;
- category/subcategory filter;
- product quality warnings;
- product status;
- price visibility;
- missing image warning;
- drag reorder selected items;
- public menu preview;
- empty selection explanation.

## 4.3 Form builder

Fitur:

- standard fields read-only/identified;
- custom field stable ID;
- add/edit/reorder/duplicate/delete;
- text/number/dropdown/checkbox/textarea;
- required toggle;
- label/option validation;
- public preview;
- mobile preview;
- preserve historical answers.

Validation:

- label tidak kosong;
- label duplicate warning;
- dropdown minimal dua option;
- option kosong dihapus/ditolak;
- max lengths;
- field deletion tidak menghapus historical data.

## Acceptance criteria

- Settings save mempertahankan unknown raw config keys.
- Public preview searah dengan `booking.djiwatentram.web.id`.
- Menu inactive/zero-price tidak lolos tanpa warning.
- Custom form menghasilkan stable payload dan stable historical snapshot.

---

# Phase 5 — Public `booking.djiwatentram.web.id` Refactor

## Objective

Memisahkan screen/state/service agar flow lebih mudah diuji dan recovery lebih kuat.

## Proposed structure

```text
apps/booking/src/
├── app/
│   ├── booking-router.ts
│   ├── booking-state.ts
│   └── booking-actions.ts
├── components/
│   ├── BookingShell.tsx
│   ├── BookingProgress.tsx
│   ├── BookingTypeStep.tsx
│   ├── EventTypeStep.tsx
│   ├── DateCapacityStep.tsx
│   ├── MenuStep.tsx
│   ├── ReviewStep.tsx
│   ├── CustomerCheckoutStep.tsx
│   ├── BookingStatus.tsx
│   └── shared/
├── lib/
│   ├── client.ts
│   ├── booking-validation.ts
│   ├── payment-flow.ts
│   └── booking-constants.ts
└── main.tsx
```

## Flow states

```text
idle
loading_config
selecting_type
selecting_event
selecting_date
selecting_menu
reviewing
collecting_customer
creating_booking
creating_invoice
attaching_payment
redirecting
waiting_settlement
settled
failed_recoverable
```

## UX changes

- progress count mengikuti branch event/non-event;
- public success copy harus menyatakan apakah payment sudah verified atau masih pending;
- status page menampilkan dua badge: booking dan payment;
- capacity menampilkan remaining people/tables;
- retry invoice menggunakan booking yang sama;
- refresh/reopen dapat recover draft dan pending booking;
- error stage-specific;
- all fields preserved after validation/payment error;
- mobile sticky CTA tidak menutup content.

## Acceptance criteria

- Event flow tidak menampilkan step yang tidak relevan.
- Customer tidak dapat lanjut tanpa valid date/capacity/customer data.
- Booking retry tidak duplicate.
- Payment retry tidak membuat booking kedua.
- Status page membaca settlement terbaru.
- Semua labels/options/products berasal dari database.

---

# Phase 6 — Operational Automation

Dikerjakan setelah integrity dan UI core stabil.

## Features

- arrival/check-in timeline;
- mark arriving/arrived/seated/no-show;
- WhatsApp confirmation;
- H-1 reminder;
- reminder beberapa jam sebelum arrival;
- pending payment reminder;
- late arrival flag;
- notification delivery log;
- retry dengan dedupe;
- booking timeline.

## Notification contract

```text
queued → sent → failed → retrying
```

Dedupe key wajib berbasis:

```text
booking ID + event type + schedule/reference
```

Jangan kirim notification hanya karena row terbaca ulang oleh worker.

---

# Phase 7 — Optional Extensions

Bukan bagian MVP overhaul:

- waitlist;
- customer reschedule;
- customer cancellation policy;
- occupancy forecasting;
- staffing recommendation;
- menu demand aggregation ke purchasing;
- booking conversion analytics;
- deposit/refund workflow.

AI tidak boleh menentukan:

- payment paid;
- capacity availability;
- status settlement;
- finance amount.

---

# Dependency Graph

```text
Wave 1 — discovery/contract
├── A state machine
├── B field/data mapper
├── C WIB/date contract
├── D schema/RPC/grant audit
└── E admin/admin-pos/public divergence audit

Wave 2 — safety backend
├── F capacity lock/availability ← A,C,D
├── G payment verification       ← A,D
├── H finance idempotency         ← G,D
├── I delete/cancel policy        ← H
└── J audit events                ← A,H

Wave 3 — shared layer
├── K types/mappers              ← A,B,C
├── L status/payment components   ← A,K
├── M capacity helpers            ← C,F,K
└── N shared validation           ← B,K

Wave 4 — admin operational UI
├── O summary                     ← K,L,M
├── P calendar workspace           ← K,L,M
├── Q booking list/detail         ← K,L
└── R capacity manager             ← K,M,F

Wave 5 — admin configuration UI
├── S public page                  ← K
├── T menu manager                 ← K,N
└── U form builder                 ← K,N

Wave 6 — public app
├── V public state machine         ← K,N,G
├── W public capacity display     ← M,F
├── X public payment recovery     ← G,H
└── Y status/confirmation         ← G,J

Wave 7 — automation
└── Z reminders/timeline/WhatsApp  ← H,J,Q,Y

Wave 8 — release
└── AA test/build/deploy/verify    ← all required preceding waves
```

---

# File/Module Plan

## Backend

- `supabase/functions/booking-admin/index.ts`
- `supabase/functions/public-booking/index.ts`
- `supabase/functions/mayar-webhook/index.ts`
- existing `mayar-proxy`
- additive migrations under `supabase/migrations/`
- relevant RPCs in booking migrations

## Admin

- `apps/admin/src/routes/admin/booking.lazy.tsx`
- `apps/pos/src/routes/admin/booking.lazy.tsx`
- new components under:
  - `apps/admin/src/components/booking/`
  - `apps/pos/src/components/booking/`
  - eventually shared package
- admin route/sidebar files only if route split is approved later

## Public

- `apps/booking/src/main.tsx`
- `apps/booking/src/lib/client.ts`
- `apps/booking/src/lib/booking-validation.ts`
- `apps/booking/src/lib/booking-formatters.ts`
- extracted public components/services

## Shared

- preferred: `packages/booking-shared/`
- fallback: `packages/yumipos-web-shared/`

---

# Testing Plan

## Unit

- status transition matrix;
- payment transition matrix;
- item normalization;
- custom answer filtering;
- stable field ID;
- capacity remaining calculation;
- table count calculation;
- WIB date boundaries;
- provider response normalization;
- cancellation policy.

## Integration

- public create booking → order + items;
- concurrent capacity booking;
- admin create booking;
- admin update booking;
- admin status update;
- payment attach;
- webhook settlement;
- webhook retry;
- finance dedupe;
- paid booking cancel/delete;
- settings raw key preservation;
- custom answer historical preservation.

## E2E/manual

1. Open `booking.djiwatentram.web.id`.
2. Complete non-event flow.
3. Complete event flow.
4. Select date near capacity.
5. Submit invalid customer data.
6. Reload during draft.
7. Create pending booking.
8. Verify invoice reference.
9. Use controlled/test payment fixture only.
10. Verify webhook status.
11. Open Admin booking list.
12. Verify date, time, guest, tables, items, statuses.
13. Verify finance linkage.
14. Verify calendar occupancy.
15. Verify capacity remaining.
16. Retry webhook and assert no duplicate finance/notification.
17. Test admin manual booking.
18. Test capacity override conflict.
19. Test paid cancellation policy.
20. Test desktop and mobile layouts.

No real payment charge during UI QA.

---

# Release Gates

## Source

- `git diff --check`.
- No unrelated dirty file staged.
- No secrets in source/bundle/log.
- Migration additive and reviewed.
- Cloud vs self-host target explicitly verified.

## Build

```bash
TMPDIR=/opt/djiwatentramapp/.tmp bun run --cwd apps/admin check-types
TMPDIR=/opt/djiwatentramapp/.tmp bun run --cwd apps/admin build
TMPDIR=/opt/djiwatentramapp/.tmp bun run --cwd apps/pos check-types
TMPDIR=/opt/djiwatentramapp/.tmp bun run --cwd apps/pos build
TMPDIR=/opt/djiwatentramapp/.tmp bun run --cwd apps/booking check-types
TMPDIR=/opt/djiwatentramapp/.tmp bun run --cwd apps/booking build
```

## Domain

```text
https://admindjiwatentram.web.id/admin/booking → 200/auth redirect as expected
https://booking.djiwatentram.web.id/                  → 200
https://booking.djiwatentram.web.id/booking           → 200
```

Verify:

- index HTML;
- hashed booking/admin chunks;
- service worker;
- version asset;
- no stale artifact;
- correct domain boundary.

## API/DB

- live settings read;
- live capacity read;
- live booking read;
- invalid payload safe 4xx;
- capacity conflict 409;
- payment settlement exact-one transaction;
- cancellation preserves historical finance;
- no notification duplicate.

## Browser

Capture:

- Admin calendar desktop;
- Admin booking list desktop;
- Admin capacity desktop;
- Admin settings desktop;
- Admin mobile/drawer;
- Public landing;
- public date/capacity;
- public menu/review;
- public checkout/status.

---

# Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Admin/POS implementations diverge | Shared types first, parity tests, build both apps |
| Payment marked paid incorrectly | Provider verification + protected settlement RPC |
| Duplicate finance transaction | Stable booking/transaction reference + unique constraint |
| Capacity oversold | Advisory lock + server-side occupancy re-read |
| Paid booking deleted | Cancel-only policy + finance linkage check |
| Public retry creates duplicate | Stable guest idempotency key + recover same booking |
| Timezone date shift | Single WIB helper and boundary tests |
| Settings erase new config keys | Merge raw JSONB, preserve unknown keys |
| UI becomes too dense | Summary + table-first desktop + drawer mobile |
| Route split breaks callers | Keep legacy route and audit redirects before split |
| Stale PWA asset | Verify HTML/hash/sw/version on canonical domain |
| Notification spam | Server-side dedupe and delivery log |
| Manual booking inaccurate | Required customer/phone/date/time/guest fields and server validation |

---

# Recommended Implementation Order

1. Approve state/payment/capacity matrix.
2. Run read-only schema/RPC/grant audit.
3. Add or harden backend safety and idempotency.
4. Add regression tests for capacity/payment/cancellation.
5. Create shared booking types/mappers/WIB helpers.
6. Rebuild Admin summary and booking list.
7. Rebuild calendar/detail two-panel workspace.
8. Rebuild capacity manager.
9. Rebuild public settings/menu/form configuration surfaces.
10. Extract public booking state machine and components.
11. Add timeline/reminder/WhatsApp only after core state is stable.
12. Build all three apps.
13. Deploy to the correct domains.
14. Run browser, API, DB, and artifact verification.
15. Commit/push only session files.

---

# Open Decisions Before Implementation

These should be confirmed before risky implementation starts:

1. Apakah booking paid boleh dibatalkan langsung atau wajib approval supervisor?
2. Apakah booking manual tetap dipertahankan sebagai first-class flow?
3. Apakah booking menu pre-order wajib memiliki minimal satu item?
4. Apakah reminder dikirim melalui WhatsApp, Telegram internal, atau keduanya?
5. Apakah `arrived`, `seated`, dan `no_show` wajib dipakai setiap hari oleh staff?
6. Apakah booking paid perlu dikonversi menjadi POS order atau cukup sebagai booking/finance record?
7. Apakah route settings nantinya dipisah menjadi `/admin/booking/settings`, atau tetap satu route dengan workspace tabs?
8. Apakah kapasitas dihitung per tamu, per meja, atau keduanya sebagai hard limit?

---

# Current Plan Status

- Audit repository: completed.
- Audit visual screenshot: completed.
- Audit domain boundary: completed.
- Audit public flow: completed.
- Audit tab inventory: completed.
- Implementation: Wave 2 backend safety, shared booking contract, and P0 Admin/POS/Public UI slice implemented and deployed. Booking hook nullability/type guards are aligned across shared and app-local copies.
- Release note: verified P0 UI/public slice plus additive backend integrity migration, payment recovery/amount guards, shared booking contract, type-safe booking hook patch, Phase 6 durable timeline/notification queue, atomic claim/retry RPCs, reminder enqueue RPC, read RPC, and Admin/POS timeline delivery summary are implemented and deployed. External WhatsApp provider delivery, full Telegram queue ownership, full shared-component extraction, and configuration polish remain pending.
- Completed slice:
  - Admin/POS calendar has a direct `Tambah` CTA.
  - Calendar occupancy labels use explicit `tamu` and `meja` wording.
  - Empty calendar state has an actionable summary and add-booking CTA.
  - Admin/POS category filtering no longer mutates featured product selection.
  - Public calendar availability checks both people and table limits consistently.
  - Public status screen displays booking and payment statuses separately.
  - Additive migration `20260828000000_booking_integrity_hardening.sql` adds booking audit events and guarded admin status/update/delete RPCs.
  - Shared booking helpers added under `packages/yumipos-web-shared/src/booking/`.
  - Public pending booking result survives reload during payment retry.
- Verification completed for this slice:
  - `apps/admin` production build passed.
  - `apps/pos` production build passed.
  - `apps/booking` production build passed.
  - Canonical admin, POS, and public domains returned HTTP 200.
  - `sw.js` returned HTTP 200 on all three domains.
  - Browser automation screenshot was unavailable because Chromium was not running; HTTP, bundle, and syntax evidence were used instead.
- Production/schema changes: none from this plan.

Created: 2026-08-23 WIB
Target project: `/opt/djiwatentramapp`
Canonical public integration: `https://booking.djiwatentram.web.id`
Canonical admin integration: `https://admindjiwatentram.web.id/admin/booking`
