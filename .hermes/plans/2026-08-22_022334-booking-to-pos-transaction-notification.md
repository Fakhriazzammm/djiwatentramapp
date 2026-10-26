# Plan: Booking → POS → Notifikasi Transaksi Bar/Kitchen

## Goal

Memastikan seluruh data dari `booking.djiwatentram.web.id` tersimpan lengkap, membentuk transaksi operasional yang dapat dibaca `apps/pos`, dan mengirim notifikasi yang benar ke:

- grup transaksi
- grup Bar
- grup Kitchen

Implementasi harus mempertahankan informasi reservasi, event, makan, payment, provenance, dan idempotency tanpa membuat transaksi ganda.

## Scope

Termasuk:

1. Audit payload Booking publik dan storage `booking_orders`/`booking_order_items`.
2. Menentukan data canonical antara domain reservasi dan domain transaksi POS.
3. Membuat transaksi POS dari booking yang sudah valid.
4. Membuat routing item ke Bar/Kitchen berdasarkan kategori/track produk.
5. Membuat notifikasi Telegram yang deduplicated dan memiliki sumber `Booking`.
6. Membuat Booking terlihat di `apps/pos`.
7. Verifikasi end-to-end dengan order test yang sah.

Tidak termasuk:

- mengubah aturan harga tanpa keputusan bisnis
- mengirim pesanan pending ke dapur
- menghapus atau mengubah historical transaction
- membuat data customer fiktif
- memindahkan seluruh data reservasi keluar dari tabel booking

## Current Context

Flow Booking saat ini sudah mengumpulkan dan mengirim:

- `bookingType` dan label jenis booking
- `eventType`, label event, dan `eventTypeOther`
- tanggal booking
- jumlah tamu
- jumlah meja
- item menu dengan product ID, nama, harga, quantity
- nama customer
- nomor telepon/WhatsApp
- email
- notes
- custom answers
- payment metadata Mayar
- guest session/access token
- idempotency key

Entry point publik yang telah diverifikasi dari source:

- `apps/booking/src/lib/client.ts` — `BookingDraft`, `BookingResult`, `createBooking`, `createBookingPayment`
- `apps/booking/src/main.tsx` — pengumpulan tipe booking, tipe event, tanggal, tamu, menu, customer, notes, custom answers
- `apps/customer/src/hooks/use-hybrid-booking-data.ts` — pembacaan data booking pada sisi customer/operasional
- `apps/customer/src/hooks/use-hybrid-write-actions.ts` — jalur booking order dan item yang sudah ada
- `apps/customer/src/hooks/use-hybrid-ops-data.ts` — pembacaan order production Bar/Kitchen
- `apps/customer/src/hooks/use-hybrid-pos-data.ts` — pembacaan `pos_orders` dan `pos_booking_orders`
- `apps/customer/src/hooks/use-hybrid-write-actions.ts` — fallback `api.booking.createBookingOrder` dan operasi booking

Rencana ini harus membedakan dua domain:

```text
booking_orders / booking_order_items
= sumber kebenaran reservasi

pos.orders / pos.order_items
= sumber kebenaran transaksi operasional POS
```

Keduanya dihubungkan melalui provenance, bukan dengan menyalin data secara bebas.

## Data Completeness Audit

### A. Data booking inti yang wajib dipertahankan

| Kelompok | Field | Sumber | Tujuan |
|---|---|---|---|
| Identitas | `bookingCode` | generated backend | `booking_orders.booking_code`, POS display |
| Identitas | `bookingId`/`source_id` | backend | relasi booking ↔ POS, idempotency |
| Provenance | `source = booking` | backend | POS dan bot source label |
| Customer | `customer.name` | form | booking dan POS |
| Customer | `customer.phone` | form | booking, POS, contact/support |
| Customer | `customer.email` | form | booking/payment gateway |
| Customer | guest/session identity | browser/backend | lookup dan authorization, bukan display utama |
| Reservasi | `date` | date step | booking date dan operational scheduling |
| Reservasi | `guests` | date step | kapasitas, POS context |
| Reservasi | `tableCount` | derived capacity | booking dan POS context |
| Reservasi | booking type key/label | type step | laporan dan notifikasi |
| Event | event type key/label | event step | laporan, notifikasi, kitchen context |
| Event | `eventTypeOther` | custom event input | detail event jika tipe Other |
| Menu | product ID | menu/cart | `booking_order_items.product_id`, `pos.order_items.product_id` |
| Menu | product name snapshot | menu/cart | historical display walau nama produk berubah |
| Menu | unit price snapshot | menu/cart | historical financial integrity |
| Menu | quantity | menu/cart | production dan total |
| Menu | item subtotal | backend derived | reconciliation |
| Finance | total amount | backend calculated | booking/POS/finance |
| Finance | payment status | gateway/webhook | eligibility notification |
| Finance | payment method/provider | Mayar/other | payment audit |
| Finance | invoice ID/URL | Mayar | payment reconciliation |
| Finance | gateway transaction ID | Mayar webhook | settlement correlation |
| Finance | gateway status/timestamps | Mayar | payment audit |
| Finance | payment raw metadata | server-side JSONB | forensic audit, secret-safe |
| User input | notes | form | kitchen/booking context |
| User input | custom answers | configurable settings | event-specific requirements |
| Reliability | idempotency key | guest credentials/backend | one booking per submit/retry |
| Reliability | created/updated timestamps | backend | reconciliation and bot polling |
| Status | booking status | backend | reservation lifecycle |
| Status | payment status | backend | settlement lifecycle |
| Status | cancellation/refund reason | backend/admin | prevent production after cancellation |

### B. Data event dan makan yang harus diperluas

Jenis booking tidak boleh diperlakukan sebagai satu string saja. Payload canonical harus menyimpan key dan label agar perubahan label admin tidak mengubah historical record.

Contoh:

```json
{
  "booking_type": {
    "key": "event",
    "label": "Event"
  },
  "event_type": {
    "key": "birthday",
    "label": "Ulang Tahun"
  },
  "event_type_other": null
}
```

Untuk booking makan biasa:

```json
{
  "booking_type": {
    "key": "dining",
    "label": "Makan"
  },
  "event_type": null,
  "event_type_other": null
}
```

Jenis yang harus didukung secara data-driven dari Admin, tanpa hardcode:

- makan/dining
- event
- meeting atau gathering jika tersedia di settings
- birthday/ulang tahun jika tersedia sebagai event option
- anniversary jika tersedia
- corporate/business jika tersedia
- custom/other dengan detail tambahan

Implementasi tidak boleh mengasumsikan hanya `event` dan `makan`. Semua opsi aktif dari `BookingSettings.bookingTypes` dan `eventTypes` harus disimpan sebagai key + label + custom text jika ada.

### C. Data operational yang perlu ditambahkan/diturunkan

Data berikut bukan hanya data formulir, tetapi diperlukan agar POS dan bot dapat beroperasi:

- order number canonical POS
- `source = booking`
- `source_id = booking_orders.source_id`
- booking code
- booking date/time context
- order creation time
- order status operational
- payment receipt kind
- category/track item snapshot
- production group (`barista`/`kitchen`)
- notification eligibility
- notification delivery state/dedupe key
- linked financial transaction ID
- cancellation/refund propagation state

## Recommended Architecture

```text
Booking public UI
  → booking-admin/public booking gateway
  → booking_orders + booking_order_items
  → payment provider
  → verified payment webhook/reconciliation
  → atomic booking-to-pos settlement RPC/function
  → pos.orders + pos.order_items + order_status/finance as applicable
  → Apps POS query/realtime
  → Supervisor bot polling/notification
```

### Canonical ownership

| Data | Canonical owner |
|---|---|
| reservation date, guest count, table count | `booking_orders` |
| booking type/event/custom answers | `booking_orders` |
| menu snapshot used at booking | `booking_order_items` |
| operational transaction | `pos.orders` |
| operational line items | `pos.order_items` |
| production progress | `pos.order_status`/existing queue structure |
| payment settlement | existing payment/financial flow, linked to booking and POS |
| Telegram delivery dedupe | existing Supervisor cursor/state plus deterministic order key |

## Payment and Eligibility Rule

Default recommendation:

```text
booking created + payment pending
→ booking record only; no Bar/Kitchen notification

payment verified paid
→ atomically create/activate POS transaction
→ notify transaction/Bar/Kitchen

payment failed/expired/cancelled/refunded
→ do not create new production notification
→ propagate cancellation/refund according to existing business rule
```

If business requires kitchen preparation before payment, that must be an explicit separate mode, for example `preparation_policy`, because it changes financial and operational risk.

## Database Schema Plan

### Existing/expected booking domain

```text
booking_orders
├─ source_id / id
├─ booking_code
├─ slug
├─ booking_type_key
├─ booking_type_label
├─ event_type_key
├─ event_type_label
├─ event_type_other
├─ customer_name
├─ customer_phone
├─ customer_email
├─ booking_date
├─ guest_count
├─ table_count
├─ total_amount
├─ payment_status
├─ payment_method
├─ payment_gateway JSONB
├─ notes
├─ custom_answers JSONB
├─ status
├─ idempotency_key
├─ created_at
└─ updated_at

booking_order_items
├─ source_id / id
├─ booking_order_source_id
├─ product_id
├─ product_name
├─ unit_price
├─ quantity
├─ subtotal
├─ category_id/category snapshot if existing
└─ raw JSONB if existing
```

The implementation phase must inspect actual columns before migration. No destructive rename/drop is allowed.

### POS domain

```text
pos.orders
├─ source_id
├─ source = 'booking'
├─ order_number
├─ status
├─ customer_name
├─ total_amount
├─ payment_method
├─ payment_gateway/payment_receipt_kind
├─ raw JSONB
├─ creation_time
└─ linked booking ID/code in provenance

pos.order_items
├─ order_source_id
├─ product_id
├─ product_name
├─ quantity
├─ unit_price
├─ subtotal
├─ category/track snapshot
└─ raw JSONB
```

Existing table/view names and columns must be verified from live schema before implementing any migration.

### Idempotency constraints

Preferred guard:

```text
unique(source, source_id)
```

or an existing equivalent unique key. If a new index/constraint is needed, it must be additive and checked against duplicate historical rows first.

The server-side function must use an atomic insert/upsert or conflict-safe RPC, not a client-side check-then-insert race.

### REST/schema mapping

Implementation must document and test the actual paths:

```text
booking public gateway → Edge Function/API
booking_orders         → existing booking REST/RPC path
booking_order_items    → existing booking REST/RPC path
pos.orders             → /rest/v1/pos_orders or existing view/RPC
pos.order_items        → /rest/v1/pos_order_items or existing view/RPC
production status      → existing pos order status view/table/RPC
```

For custom `pos` schema access, use the existing `Accept-Profile: pos`/`Content-Profile: pos` conventions where required. Do not assume a REST view exposes internal finance tables; use the existing secured RPC when necessary.

## Backend Implementation Steps

### Phase 1 — Read-only audit

1. Inspect live schema for booking, POS, order item, status, finance, and notification-related tables/views.
2. Trace the public booking gateway actions: create, status, attach-payment.
3. Trace payment webhook and reconciliation path.
4. Trace existing Booking-to-POS fallback or conversion logic.
5. Trace Supervisor bot query, settlement filter, classification, and dedupe.
6. Produce a field mapping table with actual column names and nullability.

### Phase 2 — Contract and migration safety

1. Define the canonical booking payload contract.
2. Preserve both keys and labels for booking/event options.
3. Define provenance and idempotency contract.
4. Add only additive columns/indexes if actual schema gaps are found.
5. Backfill is not part of the first implementation unless explicitly approved.

### Phase 3 — Atomic settlement

Create or extend a server-side function/RPC that:

1. receives booking ID/source ID and verified settlement context;
2. locks or safely reads the booking;
3. confirms payment eligibility and non-cancelled state;
4. creates exactly one `pos.orders` row;
5. creates exactly one set of `pos.order_items` snapshots;
6. creates required production status rows if existing flow requires them;
7. links financial record through existing finance mechanism;
8. returns the existing POS order if the request is retried;
9. never exposes gateway secrets to frontend or bot.

### Phase 4 — POS integration

1. Include `source=booking` in the appropriate POS order query.
2. Add Booking label and booking code to history/detail UI.
3. Show booking date, event/makan type, guest count, and customer notes where operationally useful.
4. Preserve existing POS order filters and cashier behavior.
5. Avoid treating a Booking order as a new cashier order.
6. Ensure production queue can distinguish food and beverage lines.

### Phase 5 — Telegram bot integration

1. Read source from persisted `pos.orders.source`, never infer from name/payment text.
2. Resolve one source label: `Booking`.
3. Use the same source label in transaction, Bar, and Kitchen renderers.
4. Route only matching item lines to Bar/Kitchen.
5. Send only after committed paid/eligible order.
6. Use deterministic dedupe key based on POS order/source ID.
7. Log safe delivery evidence without tokens or personal secrets.

## UI/UX Specification

### Booking confirmation/status

Show the user:

- kode booking
- jenis booking: label
- event: label or custom event text when applicable
- tanggal booking
- jumlah tamu
- jumlah meja
- item menu dan quantity
- subtotal/total
- payment status
- payment method/provider status
- notes summary where appropriate

Do not show internal service keys, access tokens, or raw gateway metadata.

### POS Booking detail

Recommended compact summary:

```text
BKO-XXXX
Booking · Event: Ulang Tahun
Tanggal: 25 Agustus 2026 · 20 tamu · 5 meja
Customer: Nama · WhatsApp
Status: Lunas
```

States:

- loading: skeleton row/detail
- empty: no booking orders
- error: retry with clear message
- pending payment: visible but not production-eligible
- paid/eligible: visible in operational queue
- cancelled/refunded: visibly blocked from new production
- saving/settling: disable duplicate action and show progress

### Bot message rules

- source label directly below title/time
- include booking code and booking date
- include event/makan label
- include guest count when relevant
- include notes only if operationally useful
- never include access token, idempotency key, raw gateway secret, or unnecessary PII

## Multi-source Data Flow

```text
Admin booking settings
  → bookingTypes/eventTypes/customFields
  → Booking public UI
  → booking_orders + booking_order_items

Product/category/track data
  → menu picker
  → item snapshot at booking time
  → POS order items
  → Bar/Kitchen routing

Payment provider
  → verified webhook/reconciliation
  → payment status
  → settlement RPC
  → POS/finance eligibility

POS transaction
  → POS history/detail
  → production queue
  → Supervisor polling
  → Telegram groups
```

### AI/LLM integration

No AI/LLM is required for the core transaction path. Product routing must be deterministic from database category/track data. If Yumi AI later summarizes booking notes, it must be asynchronous and must never decide payment eligibility, create financial records, or select the Bar/Kitchen destination.

### Purchasing agent sync

No direct purchasing-agent write is required for this feature. If a confirmed booking should affect purchasing/restock forecasts, add a separate read-only demand signal from paid `pos.order_items` or booking aggregate data. It must not mutate inventory during the initial transaction implementation.

## Notification Idempotency and Failure Recovery

Expected behavior:

| Boundary | Failure | Recovery |
|---|---|---|
| Booking submit | timeout | same idempotency key returns same booking |
| Payment webhook | duplicate | settlement is no-op/re-read existing POS order |
| Settlement RPC | partial failure | database transaction rollback |
| Bot restart | same order polled | dedupe prevents duplicate message |
| Bar send failure | Kitchen succeeds | delivery state/log allows retry for Bar only |
| Kitchen send failure | Bar succeeds | delivery state/log allows retry for Kitchen only |
| Payment later becomes paid | old creation cursor passed | bounded settlement query/reconciliation catches it |
| Cancellation after notification | already sent | do not erase history; send cancellation/update only if business requires |

## No-hardcode Audit

The following must come from database/admin configuration or persisted transaction data:

- booking types
- event types
- event labels
- custom fields
- capacity rules
- prices
- product names
- product categories
- Bar/Kitchen track assignment
- Telegram group IDs
- payment provider configuration
- notification templates where currently admin-configurable

Allowed constants:

- canonical source value `booking`
- internal status enum values already established by the project
- safe fallback labels such as `Booking`

Do not hardcode product names, event types, category names, Telegram IDs, or prices in frontend, Edge Function, or bot code.

## Testing and Verification

### Unit/integration

- payload preserves booking type/event key and label
- custom event text persists
- all custom answers persist
- item product ID/name/price/quantity persist
- total equals backend calculation
- missing/invalid product is rejected safely
- duplicate idempotency request returns one booking
- duplicate settlement returns one POS order
- payment pending does not create production notification
- payment paid creates exactly one POS order and item set
- cancellation/refund blocks new production
- food routes Kitchen
- beverage routes Bar
- mixed order routes both
- source label is `Booking`

### E2E evidence

Use an explicitly authorized test booking and record only safe identifiers:

```text
booking_code
booking_id suffix or redacted ID
payment status
pos order number
pos order status
item count
financial transaction count
transaction notification count
Bar notification count
Kitchen notification count
```

Expected result:

```text
booking_orders             1
booking_order_items        N
pos.orders                 1
pos.order_items            N
financial transaction      1 when applicable
transaction notification   1
Bar notification            0 or 1 based on beverage items
Kitchen notification        0 or 1 based on food items
repeat poll duplicate       0
```

### Production verification

- build affected apps/functions/bot
- run typecheck/lint/tests available
- verify deployed Edge Function artifact, not only repository source
- restart only the affected bot/function service
- verify service is active
- inspect logs with secrets redacted
- query live DB records read-only after test
- verify Apps POS route and order detail
- verify Telegram delivery and dedupe

## Files Likely to Change

Final list depends on Phase 1 audit, but likely areas are:

- `apps/booking/src/lib/client.ts`
- `apps/booking/src/main.tsx`
- `apps/customer/src/hooks/use-hybrid-booking-data.ts`
- `apps/customer/src/hooks/use-hybrid-ops-data.ts`
- `apps/customer/src/hooks/use-hybrid-pos-data.ts`
- `apps/customer/src/hooks/use-hybrid-write-actions.ts`
- `apps/pos/src/hooks/use-hybrid-pos-data.ts`
- `apps/pos/src/components/pos/menu-sidebar.tsx`
- `apps/pos/src/components/pos/antrian-tab.tsx`
- existing booking/payment Edge Function(s)
- existing settlement/reconciliation Edge Function(s)
- existing Supervisor bot module responsible for order polling and Telegram formatting
- additive SQL migration or secured RPC only if schema audit proves necessary

No file should be edited before the read-only audit identifies its role and current contract.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Duplicate POS orders | unique provenance + atomic settlement RPC |
| Pending booking reaches kitchen | notification eligibility only after verified payment/confirmation |
| Event data lost in POS | preserve booking record and copy event key/label into raw/provenance context |
| Product renamed after booking | store item name/price snapshot |
| Wrong Bar/Kitchen routing | resolve category/track from DB, not product name |
| Bot misses delayed payment | webhook plus bounded reconciliation/settlement query |
| Notification duplicated | deterministic dedupe key and existing cursor audit |
| Historical data overwritten | additive migration and no destructive backfill |
| Secrets leak to logs/messages | redact gateway metadata and credentials |
| POS reports double-count booking | define whether POS transaction is included once in report and exclude booking source from duplicate booking report |

## Dependency Graph and Waves

### Wave 1 — independent read-only audits

- booking payload/storage audit
- POS schema/query audit
- payment/webhook/reconciliation audit
- Supervisor bot routing/dedupe audit

### Wave 2 — contract and backend

- canonical field mapping
- additive schema/RPC design
- atomic settlement implementation

### Wave 3 — consumers

- Apps POS display/query
- production queue integration
- bot source label/routing/dedupe

### Wave 4 — verification

- build/typecheck/test
- authorized E2E booking
- live DB evidence
- POS evidence
- Telegram evidence

## Open Business Decision

Recommended default:

> Booking masuk ke POS dan mengirim notifikasi Bar/Kitchen setelah pembayaran berhasil diverifikasi atau admin mengonfirmasi booking sebagai paid/ready.

Need confirmation before implementation if the business instead requires:

> booking pending boleh langsung masuk production untuk persiapan dapur.

Pilihan kedua memiliki risiko pemborosan bahan, spam operasional, dan order batal yang sudah telanjur diproduksi.

## Definition of Done

- Semua field booking inti, event/makan, custom answers, dan metadata payment terpetakan.
- Booking paid menghasilkan tepat satu transaksi POS.
- Apps POS menampilkan booking dengan source dan konteks reservasi.
- Item makanan hanya ke Kitchen.
- Item minuman hanya ke Bar.
- Mixed order terkirim ke kedua grup sesuai item.
- Grup transaksi menerima satu ringkasan.
- Retry/webhook/polling tidak menggandakan record atau notifikasi.
- Pending/failed/cancelled booking tidak mengirim production notification.
- Test dan evidence live tersedia tanpa credential atau PII sensitif.
