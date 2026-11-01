# Plan: `apps/booking` — Customer Booking App di `booking.yumme.id`

## Status

- Mode: **Plan only**
- Implementasi kode: belum dilakukan
- Provision DNS/subdomain: belum dilakukan
- Migration/database write: belum dilakukan
- Deployment: belum dilakukan

## Goal

Membuat aplikasi customer-facing baru di `apps/booking` untuk booking tanggal kunjungan, jumlah tamu, meja, dan optional pre-order menu dari database existing. Aplikasi harus terintegrasi dengan seluruh ekosistem Djiwa Tentram, bukan menjadi backend atau database terpisah.

Target domain resmi:

```text
https://booking.yumme.id
```

Target DNS/VPS saat ini perlu diverifikasi sebelum perubahan. Jangan mengasumsikan record existing.

---

## Architecture Decision

### Pilihan yang direkomendasikan

```text
Standalone frontend: apps/booking
Shared backend: Supabase project/database existing
Shared catalog: public.pos_products_all
Shared booking tables: pos.booking_*
Existing internal management: apps/pos /admin/booking
New public domain: booking.yumme.id
```

### Alasan

1. Booking memiliki flow berbeda dari customer dine-in ordering.
2. `apps/customer` sudah memiliki routing/guest/order state yang kompleks; booking standalone mengurangi risiko regresi order existing.
3. Database booking, hooks, dan admin booking sudah tersedia sehingga tidak perlu membuat sistem booking kedua.
4. Domain berbeda memberi PWA scope, service worker cache, deployment, dan rollback yang lebih aman.
5. Shared package dan shared Supabase contract menjaga konsistensi antar-app.

### Yang tidak dilakukan

- Tidak membuat Supabase project baru.
- Tidak menggandakan tabel menu.
- Tidak mengubah booking menjadi `pos.orders` secara otomatis.
- Tidak membuat financial transaction saat booking dibuat atau invoice baru dibuat.
- Tidak mengganti `/booking` internal yang sudah ada sebelum parity dan migrasi selesai.

---

# Phase 0 — Provision `booking.yumme.id` terlebih dahulu

Ini wajib menjadi langkah pertama sebelum frontend booking dideploy.

## 0.1 Audit Hostinger DNS read-only

Jalankan dari environment profile yang memiliki Hostinger API token:

```bash
hostinger dns records list yumme.id --format json
```

Verifikasi:

- apakah `booking` sudah memiliki A/CNAME record;
- apakah ada record konflik;
- apakah target record menunjuk ke VPS `43.129.54.5` atau target lain;
- apakah ada CNAME lama yang harus dihapus sebelum A record;
- TTL existing.

Jangan menulis token ke repository atau plan.

## 0.2 Validate record baru

Jika tidak ada konflik, gunakan A record additive:

```bash
hostinger dns records validate yumme.id \
  --zone '[{"name":"booking","type":"A","records":[{"content":"43.129.54.5"}],"ttl":300}]'
```

## 0.3 Apply dengan safety flag

```bash
hostinger dns records update yumme.id \
  --zone '[{"name":"booking","type":"A","records":[{"content":"43.129.54.5"}],"ttl":300}]' \
  --overwrite=false
```

Jika record CNAME `booking` sudah ada, jangan menambahkan A record bersamaan. Audit target dan lakukan migration CNAME → A secara eksplisit setelah konfirmasi.

## 0.4 Verify DNS berlapis

```bash
dig @ns1.dns-parking.com booking.yumme.id A +short
dig booking.yumme.id A +short
dig @8.8.8.8 booking.yumme.id A +short
dig @1.1.1.1 booking.yumme.id A +short
```

Expected:

```text
43.129.54.5
```

Public resolver propagation harus dibedakan dari authoritative DNS.

## 0.5 Nginx HTTP vhost

Buat web root dedicated, misalnya:

```text
/var/www/booking.yumme.id
```

Buat server block baru hanya untuk `booking.yumme.id`, dengan SPA fallback ke `index.html`. Jangan mengubah server block:

- `djiwatentram.yumme.id` → apps/customer
- `pos.yumme.id` → apps/pos
- `admindjiwatentram.yumme.id` → apps/admin
- `karyawan.yumme.id` → apps/karyawan

Verifikasi:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I --resolve booking.yumme.id:80:43.129.54.5 http://booking.yumme.id/
```

## 0.6 TLS

Setelah HTTP vhost lulus:

```bash
sudo certbot --nginx -d booking.yumme.id \
  --non-interactive --agree-tos --email <production-contact-email>
```

Verifikasi:

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://booking.yumme.id/
openssl s_client -connect booking.yumme.id:443 -servername booking.yumme.id </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -dates
```

Rollback DNS/vhost harus hanya menghapus `booking.yumme.id`, tanpa menyentuh domain existing.

---

# Phase 1 — Monorepo app foundation

## Files likely to add

```text
apps/booking/package.json
apps/booking/index.html
apps/booking/vite.config.ts
apps/booking/tsconfig.json
apps/booking/src/main.tsx
apps/booking/src/routes/__root.tsx
apps/booking/src/routes/index.tsx
apps/booking/src/routes/index.lazy.tsx
apps/booking/src/index.css
apps/booking/src/lib/client.ts
apps/booking/src/lib/booking-constants.ts
apps/booking/src/lib/booking-formatters.ts
apps/booking/src/lib/booking-validation.ts
```

## Foundation requirements

- Package name unik, misalnya `@yumipos/booking`.
- Reuse dependency versions existing, jangan menambah dependency baru tanpa kebutuhan.
- Reuse `@yumipos/web-shared` dan theme existing.
- Dedicated PWA name, scope, manifest, cache name, and start URL.
- Dedicated environment variables/config:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_BOOKING_SLUG=booking
VITE_PUBLIC_APP_URL=https://booking.yumme.id
```

- Tidak menaruh token service role di frontend.
- Tidak meng-copy seluruh `apps/customer` tanpa menghapus route/order dependency yang tidak diperlukan.

---

# Phase 2 — Backend/data contract

## Existing tables to reuse

### `pos.booking_settings`

```text
source_id
slug
title
description
logo_url
banner_url
theme_color
social_links
featured_product_ids
payment_methods
bank_details
qris_image
is_active
custom_fields
creation_time
raw
```

### `pos.booking_date_capacity`

```text
source_id
slug
booking_date
max_people
max_tables
people_per_table
notes
creation_time
raw
```

### `pos.booking_orders`

```text
source_id
slug
booking_code
customer_name
customer_phone
customer_email
notes
booking_date
total_amount
payment_method
payment_status
booking_status
guest_count
table_count
payment_proof_image
transferred_amount
custom_answers
created_at
creation_time
raw
```

### `pos.booking_order_items`

```text
id
booking_order_source_id
line_no
product_source_id
product_name
price
quantity
raw
```

## Existing views

```text
public.pos_booking_settings
public.pos_booking_date_capacity
public.pos_booking_orders
public.pos_products_all
```

## Proposed additive schema

Before production public access, add only what is required after a migration audit:

```text
pos.booking_orders
├── source text NOT NULL DEFAULT 'customer_booking'
├── guest_session_id text NULL
├── guest_expires_at double precision NULL
├── access_token_hash text NULL
├── confirmed_at double precision NULL
├── cancelled_at double precision NULL
├── cancellation_reason text NULL
└── metadata jsonb NOT NULL DEFAULT '{}'::jsonb
```

Rules:

- migration idempotent;
- additive only;
- update public view and grants/RLS together;
- preserve existing admin booking records;
- do not put sensitive data into `notes` or unstructured `raw` only;
- do not expose all booking rows to anonymous customers.

## Secure write/read boundary

Current client-side capacity flow must be replaced or wrapped by an atomic RPC/Edge Function before public launch:

```text
Customer app
  → create-public-booking Edge Function/RPC
      → validate date and guest count
      → lock/check capacity transactionally
      → snapshot menu prices
      → insert booking + items atomically
      → return booking id/code/access token
```

Status lookup:

```text
booking code + guest access token/session
  → secure read function
  → only that booking returned
```

Do not use unrestricted `.select('*')` over `public.pos_booking_orders` for guest status lookup.

---

# Phase 3 — Booking state machine

## Booking status

```text
pending
confirmed
checked_in
completed
cancelled
no_show
expired
```

## Payment status

```text
pending
awaiting_payment
paid
failed
refunded
not_required
```

Payment and booking status must remain separate.

## Capacity rules

- Past dates disabled.
- Dates without active capacity configuration are unavailable by default.
- `cancelled` and `expired` do not consume capacity.
- `pending` consumes temporary capacity until expiry.
- Pending reservation expiry: configurable, default 15–30 minutes.
- Capacity calculation must be server-side and atomic.
- `people_per_table` determines `table_count` with a server-side ceiling calculation.
- No stock deduction at booking creation.
- Menu price is snapshotted into `booking_order_items.price`.

## Payment rules

```text
Bayar di tempat:
  booking_status = pending/confirmed
  payment_status = pending
  no financial transaction yet

Mayar/QRIS:
  create booking
  create invoice
  payment_status = awaiting_payment
  webhook/reconcile settles to paid
  financial transaction created once
```

Invoice created is not equivalent to paid.

---

# Phase 4 — Public UI/UX specification

## Design direction

- Plus Jakarta Sans.
- Light background, one primary blue accent.
- Card radius approximately 24px.
- Control radius approximately 14px.
- Soft shadows, restrained motion.
- Lucide icons, no emoji as primary UI icons.
- Mobile-first and thumb-zone aware.
- Minimum 44px touch target.
- Dedicated booking shell; do not mount customer order bottom navigation inside booking flow.

## Route map

```text
/                         Landing booking
/booking                  Date + guest count
/booking/menu             Optional menu pre-order
/booking/customer         Customer data
/booking/review           Review
/booking/payment          Payment choice/invoice
/booking/success          Confirmation/code
/booking/status           Secure lookup
/account/bookings         Member history, optional Phase 5
/account/bookings/:id     Member detail, optional Phase 5
```

## Screens

### Landing

- Hero: booking meja dan menu.
- Primary CTA: `Mulai Booking`.
- Secondary CTA: `Cek Booking`.
- Operating hours, location, WhatsApp support, cancellation policy.
- Optional active-service indicator sourced from shifts, not hardcoded.

### Date and capacity

- Month calendar.
- Available/limited/full/closed states.
- Selected date card showing remaining people and tables.
- Loading skeleton, API error with retry, empty configuration state.
- Fixed mobile CTA with safe-area bottom padding.

### Guest count

- Accessible stepper.
- Derived table estimate.
- Inline capacity error.
- Revalidation immediately before submit.

### Menu pre-order

- Reuse `public.pos_products_all`.
- `isAvailable=true` only.
- Category filter, search, menu number, image, description, price, promo price, variations.
- Optional menu selection.
- Cart sheet with quantity controls and price total.
- Empty menu state must still allow booking without menu if configured.

### Customer form

Required:

```text
Nama lengkap
Nomor WhatsApp
```

Optional/configurable:

```text
Email
Catatan
Custom fields from booking_settings.custom_fields
```

Member mode autofills existing profile. Guest mode creates a non-guessable guest session and expiry.

### Review

Show:

- date;
- guest count;
- estimated tables;
- menu items and snapshotted prices;
- customer data;
- payment method;
- cancellation/payment terms;
- edit controls before final submit.

### Success/status

Show:

```text
Booking code
Date
Guests/tables
Menu summary
Booking status
Payment status
Next action
```

Actions:

```text
Bayar sekarang
Salin kode
Cek status
Hubungi support
```

## UI state contract

Every screen must implement:

```text
loading
empty / unavailable
error + retry
editing
submitting
success
expired session
capacity conflict
payment pending
payment failed
```

---

# Phase 5 — Integration with all Djiwa Tentram apps

## `apps/customer`

Required integration:

- Add a prominent `Booking` entry on the customer landing/home after the primary ordering CTA.
- Add booking shortcut in customer navigation only if it does not duplicate/conflict with the primary `Pesan` action.
- Deep link to `https://booking.yumme.id/` or a configured booking URL; do not copy booking flow into customer route tree.
- Member context handoff must be safe: use existing auth/session, never pass raw secret/token in URL.
- Optional Phase 5: customer booking history/deep link from `/riwayat` or profile.
- Existing customer order route, cart, payment, and bottom navigation must remain unchanged.

Files likely to inspect/change:

```text
apps/customer/src/routes/index.lazy.tsx
apps/customer/src/routes/$username/route.lazy.tsx
apps/customer/src/components/customer/CustomerMenuGrid.tsx
apps/customer/src/hooks/use-customer-auth.ts
apps/customer/src/index.css
```

## `apps/pos`

Required integration:

- Keep existing `/admin/booking` as the operational management surface.
- Verify public booking rows map correctly into admin list/detail.
- Add source badge: `Customer Booking`.
- Ensure menu pre-order items display with price snapshot.
- Ensure capacity edits made by POS are immediately used by booking app.
- Ensure payment confirmation creates one financial transaction only.
- Ensure status transitions are explicit and audited.
- Add safe navigation/deep-link from existing booking admin to customer status URL only if useful.
- Do not alter `/menu` normal POS order behavior.

Files likely to inspect/change:

```text
apps/pos/src/routes/admin/booking.lazy.tsx
apps/pos/src/routes/admin/orders.lazy.tsx
apps/pos/src/hooks/use-hybrid-booking-data.ts
apps/pos/src/hooks/use-hybrid-write-actions.ts
apps/pos/src/routes/admin/route.tsx
apps/pos/src/lib/export-utils.ts
```

## `apps/admin`

Audit whether admin is a deployed mirror or independent operational app. If it consumes booking data, add the same read/status/source contract. Do not silently edit it unless the app is confirmed in scope; deploy only the correct admin domain if changes are needed.

Potential touchpoints:

```text
apps/admin/src/routes/admin/orders.lazy.tsx
apps/admin/src/hooks/*booking*
apps/admin/src/routes/admin/route.tsx
```

## `apps/karyawan`

No customer booking CRUD should be added by default. Integration is operational only if the business requires staff-facing data:

- optional read-only upcoming booking list;
- check-in/no-show action only if explicitly approved;
- no direct guest PII exposure beyond role permission;
- use existing auth/RLS and employee permissions.

If not required for MVP, document `apps/karyawan` as verified unaffected rather than adding duplicate UI.

## Shared packages

Prefer moving reusable booking data contracts and presentational primitives into an existing shared package only after measuring reuse. Likely scope:

```text
packages/yumipos-web-shared/src/hooks/use-hybrid-booking-data.ts
packages/yumipos-web-shared/src/hooks/use-hybrid-write-actions.ts
packages/yumipos-web-shared/src/types/*
packages/yumipos-web-shared/src/theme.css
```

Do not extract the entire customer app shell as part of this feature. Keep booking-specific UI in `apps/booking` and share only stable contracts/primitives.

## Supabase / Edge Functions

Required:

- secure create booking endpoint/RPC;
- secure guest status endpoint/RPC;
- atomic capacity check;
- payment/webhook idempotency;
- RLS/grant review;
- public view exposure review;
- migration and view compatibility.

## Telegram / Supervisor

Required events:

```text
booking.created
booking.confirmed
booking.payment_paid
booking.cancelled
booking.rescheduled
```

Notification source:

```text
📲 SUMBER: Customer Booking
```

Dedupe key:

```text
booking_id + event_type + resulting_status
```

Never use polling without persisted event dedupe. Existing order notification flow must remain unaffected.

## Finance

- Booking pending does not enter revenue.
- Mayar settled booking creates one income transaction.
- Pay-at-venue booking creates financial transaction only when POS/admin confirms payment.
- `booking_order_source_id` remains the canonical relation.
- Reports must distinguish booking revenue from ordinary POS orders.

## AI/purchasing agents

No AI or purchasing write is required for MVP. Future read-only integrations may expose:

- upcoming booking demand;
- menu pre-order quantities;
- procurement forecast.

Do not auto-deduct or auto-purchase from unconfirmed booking data without a separate approved business rule.

---

# Phase 6 — Deployment pipeline

## Build/deploy targets

Add a dedicated build filter/script:

```text
@yumipos/booking
```

Deploy only:

```text
apps/booking/dist → /var/www/booking.yumme.id
```

Do not deploy booking build to any existing domain.

## Version/PWA

- Add app to version/manifest generation only if the scripts are designed to include `apps/booking`.
- Verify generated changes do not accidentally modify unrelated apps.
- Dedicated service worker cache name and scope.
- Verify HTTPS asset chain: `index.html → hashed booking chunks`.

## Production verification

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://booking.yumme.id/
curl -sk https://booking.yumme.id/ | head
curl -sk -o /dev/null -w '%{http_code}\n' https://djiwatentram.yumme.id/
curl -sk -o /dev/null -w '%{http_code}\n' https://pos.yumme.id/
curl -sk -o /dev/null -w '%{http_code}\n' https://karyawan.yumme.id/
curl -sk -o /dev/null -w '%{http_code}\n' https://admindjiwatentram.yumme.id/
```

Existing domains must remain healthy.

---

# Testing and verification plan

## Unit tests

- date cannot be in the past;
- date without capacity is unavailable;
- table count ceiling calculation;
- capacity remaining calculation;
- cancelled/expired bookings excluded;
- pending booking expiry;
- cart subtotal and snapshot price;
- custom field validation;
- booking/payment status transitions;
- idempotency key generation.

## Integration tests

- create booking atomically;
- concurrent capacity requests cannot oversubscribe;
- booking items inserted with same booking id;
- secure guest lookup cannot read another booking;
- member booking is linked to member identity;
- Mayar paid event creates one financial transaction;
- duplicate webhook is ignored;
- admin update appears in customer status;
- POS capacity update appears in public calendar.

## E2E tests

```text
Guest:
landing → date → guests → menu → form → review → pay-later → success → status

Member:
login/session → autofill → booking → history/detail

Conflict:
full date → disabled; concurrent capacity → one success/one rejection

Payment:
invoice created ≠ paid; webhook settled → paid once

Operational:
admin confirms → customer status changes; cancelled booking releases capacity
```

## Browser verification

- mobile viewport;
- desktop viewport;
- no fixed CTA overlap;
- no customer app bottom-nav collision;
- loading/empty/error states;
- keyboard/focus accessibility;
- browser console zero new errors;
- real deployed `booking.yumme.id` hashed asset marker.

## Database preview evidence

Before launch, produce a read-only evidence table:

```text
booking_id | booking_code | date | guests | tables | menu_items | booking_status | payment_status | source
```

Verify the same booking is visible in:

```text
apps/booking status
apps/pos admin booking
finance relation when paid
Telegram event log when enabled
```

---

# No-hardcode audit

Values that must come from database/admin settings:

```text
brand title/logo/banner
operating hours
active/inactive booking service
available dates
max people/tables
people per table
payment methods
bank details/QRIS image
cancellation policy
custom form fields
menu names/prices/images/categories
```

Allowed code constants:

```text
status enum values
route names
fallback labels
formatting rules
default safe expiry duration, if overridden by settings later
```

No hardcoded capacity, price, business hours, staff name, payment account, or menu data.

---

# Risks and mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Anonymous access exposes all bookings | High | secure RPC/Edge Function + guest token + RLS audit |
| Two customers oversubscribe date | High | atomic DB transaction/lock |
| Booking creates revenue too early | High | separate booking/payment status; settle-only financial write |
| Menu price changes after booking | Medium | snapshot price in booking items |
| PWA cache collision | Medium | separate domain/scope/cache name |
| Wrong production domain deployed | High | dedicated web root, explicit deploy script, post-deploy domain matrix |
| Customer route regression | Medium | deep-link to standalone app; regression test existing customer flow |
| Existing `/booking` route confusion | Medium | document internal route vs public domain; do not delete until parity confirmed |
| DNS CNAME/A conflict | High | list → validate → delete conflicting CNAME explicitly → additive A record |
| Telegram duplicate notifications | High | event idempotency key persisted before retry/send |
| Unconfirmed booking pollutes procurement | Medium | agents consume confirmed/paid demand only |

---

# Implementation waves after plan approval

## Wave 0 — Infrastructure prerequisite

1. Hostinger DNS audit.
2. Provision `booking.yumme.id`.
3. Nginx HTTP vhost.
4. TLS.
5. Verify domain routing before app deploy.

## Wave 1 — Data/security contract

1. Migration audit.
2. Additive schema if required.
3. Secure RPC/Edge Function.
4. Atomic capacity transaction.
5. Guest/member authorization.
6. Tests for idempotency and capacity.

## Wave 2 — New app foundation and basic booking

1. Create `apps/booking` package.
2. Add shell/router/PWA config.
3. Landing/date/guest count.
4. Customer form.
5. Success/status.
6. Build/typecheck.

## Wave 3 — Menu pre-order and payment

1. Shared catalog read.
2. Menu/cart/price snapshot.
3. Review/payment UI.
4. Mayar integration.
5. Payment settlement.
6. Financial idempotency.

## Wave 4 — Cross-app integrations

1. Customer app booking link.
2. POS/admin booking source/status/menu display.
3. Optional Karyawan read-only operational view.
4. Telegram notifications.
5. Finance/report verification.
6. Shared package reconciliation.

## Wave 5 — Production release

1. Build only changed app/shared packages.
2. Deploy only `/var/www/booking.yumme.id` plus required backend functions.
3. Verify booking domain.
4. Verify all existing domains.
5. Run guest/member/capacity/payment E2E.
6. Capture screenshots and DB/API evidence.
7. Selective git commit/push only session files.

---

# Acceptance criteria

- [ ] `booking.yumme.id` provisioned and verified before app deployment.
- [ ] DNS uses safe additive change; no existing records lost.
- [ ] HTTPS works with valid certificate.
- [ ] `apps/booking` builds and typechecks.
- [ ] Calendar uses database capacity, not hardcoded dates.
- [ ] Menu uses `public.pos_products_all` and snapshots prices.
- [ ] Capacity check is atomic server-side.
- [ ] Guest status access is scoped to guest token/session.
- [ ] Member booking is linked to member identity.
- [ ] Booking and payment status are separate.
- [ ] Pay-at-venue does not create premature financial transaction.
- [ ] Mayar settlement is idempotent.
- [ ] Admin/POS sees source `Customer Booking` and menu items.
- [ ] Customer app links to booking domain.
- [ ] Telegram notifications have source and dedupe.
- [ ] Existing customer, POS, admin, and karyawan domains remain healthy.
- [ ] Browser mobile/desktop QA passes.
- [ ] No secrets, capacity, price, or business settings are hardcoded.

## Preview evidence expected before declaring complete

```text
🖼️ Browser: booking.yumme.id landing/calendar/review/success screenshots
🗃️ Database: booking row + items + capacity query result
🔌 API: secure create/status response
🧾 POS: booking visible in admin booking list
📨 Telegram: one created/settled event with source label
🌐 Deployment: HTTP/HTTPS status for booking + all existing domains
```
