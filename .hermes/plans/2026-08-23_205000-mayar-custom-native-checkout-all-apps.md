# Plan: Custom Native Checkout Mayar V2 Lintas Apps

**Tanggal:** 2026-08-23 20:50 WIB  
**Status:** Draft untuk persetujuan — belum diimplementasikan  
**Scope:** `apps/customer`, `apps/booking`, `apps/ordermieyamin`, `apps/admin`, `apps/pos`, Supabase Edge Functions, migration/RPC terkait payment.

## 1. Goal

Membangun custom native checkout dengan UI milik project sendiri dan Mayar V2 sebagai payment provider, tanpa menaruh API key di browser.

Target utama:

- Semua request Mayar berjalan melalui server-side `mayar-proxy`.
- Harga dan total final dibaca serta diverifikasi dari database, bukan dipercaya dari body browser.
- Order/booking dibuat sebagai `pending` sebelum redirect.
- Invoice Mayar dikorelasikan dengan `extraData.orderId`, `extraData.bookingId`, atau reference domain yang stabil.
- Redirect ke Mayar hanya berfungsi sebagai UX; webhook terverifikasi menjadi authority settlement.
- `payment.received` diverifikasi ulang melalui `GET /transactions/{transactionId}` dan hanya status `paid` yang boleh settle.
- Settlement idempoten dan atomic untuk order, booking, wallet top-up, finance, inventory, dan notification.
- Implementasi diuji di sandbox terlebih dahulu.
- Admin/POS menjadi monitor/operator, bukan pemegang API key atau caller API provider langsung.

### Explicit project-wide requirement

Solusi ini wajib dapat diterapkan secara konsisten ke seluruh aplikasi dalam project
`djiwatentramapp`, bukan hanya ke Customer app. Penerapan dilakukan berdasarkan peran
masing-masing app: app yang memiliki checkout menjadi checkout consumer, sedangkan app
operasional/internal menjadi status, reconciliation, reporting, atau fulfillment consumer.

| App | Boundary yang wajib didukung |
|---|---|
| `apps/customer` | Custom native checkout customer order dan status pembayaran |
| `apps/booking` | Custom native checkout booking, capacity hold, dan payment return |
| `apps/ordermieyamin` | Custom native checkout order B2B/marketplace dan status invoice |
| `apps/admin` | Monitoring payment, reconciliation, finance/order visibility; tidak memegang API key |
| `apps/pos` | Monitoring order/payment, operational confirmation, receipt/status; tidak memegang API key |
| `apps/karyawan` | Tidak membuat invoice; hanya menerima data order/payment yang sudah verified bila diperlukan untuk operasional |
| `apps/linkbio` | Jika menjadi entry point katalog/CTA, meneruskan ke checkout canonical tanpa membuat payment langsung |
| `apps/rekrutmen` | Tidak ikut payment checkout; harus tetap terisolasi dan tidak terkena perubahan payment |
| `apps/web` | Diaudit sebagai legacy/compatibility app; bila memiliki payment caller, dimigrasikan ke contract server-side yang sama |
| `apps/auth-server` | Menyediakan auth/session boundary bila dibutuhkan; tidak memanggil Mayar langsung dari client |

Tidak semua app harus memiliki UI checkout. Namun seluruh app harus memiliki boundary
yang jelas, tidak boleh membuat implementasi Mayar paralel, dan tidak boleh memasukkan
API key provider ke frontend bundle.

### User-provided acceptance rules

Implementasi wajib mengikuti aturan berikut tanpa pengecualian:

1. Baca machine-readable documentation index `https://docs.mayar.id/llms.txt` sebelum implementasi; halaman terkait dibaca dari URL `.md` yang sama.
2. Pasang skill resmi melalui `npx skills add mayarid/skills --skill mayar-v2 --global --yes` sebelum pekerjaan implementasi dimulai, setelah keluar dari plan-only mode.
3. Semua panggilan API Mayar berjalan di server-side; browser hanya memanggil contract internal project.
4. Sandbox memakai base `https://api.mayar.io/hl/v2` terlebih dahulu.
5. Harga, item, diskon, pajak, service charge, dan total final dibaca/divalidasi dari database; body browser tidak menjadi sumber kebenaran nominal.
6. Invoice dibuat melalui `POST /hl/v2/invoices/create` pada base environment yang sesuai.
7. Reference aplikasi seperti `orderId` disimpan pada `extraData` dan dipersistenkan di record lokal.
8. Order/booking/top-up ditulis sebagai `pending` sebelum redirect.
9. Browser diarahkan ke `data.link` setelah invoice berhasil dibuat dan tersimpan lokal.
10. Fulfillment/produk/inventory hanya boleh diproses dari event `payment.received` yang sudah dikonfirmasi melalui API transaction detail.
11. Handler webhook wajib idempoten untuk duplicate delivery, retry, browser timeout, dan reconciliation.
12. API key, webhook token, credential, dan raw secret tidak boleh dicetak, ditulis ke log, dimasukkan ke bundle, atau di-commit.
13. Production secret, webhook registration, invoice production, dan deployment memerlukan approval eksplisit terpisah.

## 2.1 Approved Discovery Decisions

Decision record dari implementasi ini:

| Decision | Approved value |
|---|---|
| Sales model | One-time order payment |
| Checkout type | Native — application owns the payment presentation |
| Customer CTA | Existing cart/order page |
| OrderMieYamin CTA | Existing review-order page before submit |
| Pricing page | No new pricing page; use cart/review order and server-side price validation |
| Post-payment UI | Native status screen with polling/realtime, pending verification, success, failure/expired, and retry/check status action |
| Customer fulfillment | Verified paid → order `completed` → production/inventory flow |
| OrderMieYamin fulfillment | Verified paid → order `paid`/`confirmed` → fulfillment flow |
| Booking scope | Keep existing Booking payment-first flow; do not migrate in Phase 1 |
| Djiwa Pay scope | Keep existing wallet-specific flow; do not migrate in Phase 1 |
| Webhook fixture | Create internal fixture from official Mayar V2 schema; no real payload/secret available yet |
| Project scope | Audit and enforce boundary across all apps; checkout consumers are Customer and OrderMieYamin |
| Mayar payment channels | QRIS plus all channels active on the Mayar account; server validates the channel list and never assumes unsupported channels |

## 2. Current Context / Discovery

### Sudah tersedia

- `supabase/functions/mayar-proxy/index.ts`
  - Server-side Mayar V2 base default.
  - `POST /invoices/create`.
  - `GET /invoices/{id}`.
  - Timeout dan normalisasi response/error.
  - `extraData` sudah diteruskan.
- `supabase/functions/mayar-webhook/index.ts`
  - Verifikasi token webhook.
  - Verifikasi transaksi melalui Mayar.
  - Jalur wallet top-up, booking, customer order, dan reconciliation.
  - Dukungan `payment.received`.
- Customer checkout sudah membuat order pending lebih dahulu dan mengirim `extraData.orderId`.
- Booking sudah memiliki payment-first flow dan RPC settlement.
- Wallet Djiwa Pay sudah memiliki hold/capture/release dan idempotency pattern.
- Supervisor memiliki reconciliation Mayar berkala.
- `apps/customer` memiliki hook Mayar yang memanggil Edge Function.

### Temuan yang harus ditangani

- `apps/admin/src/lib/mayarGateway.ts` dan `apps/pos/src/lib/mayarGateway.ts` masih memakai pola frontend legacy:
  - default base V1 lama;
  - `VITE_MAYAR_API_KEY`;
  - API key berpotensi masuk bundle browser;
  - request langsung dari browser ke provider.
- `.env.example` Admin masih mendokumentasikan `VITE_MAYAR_API_KEY` dan endpoint legacy.
- `mayar-proxy` masih menerima `items` dan `rate` dari caller; harga belum sepenuhnya authoritative dari database.
- Booking client masih memiliki caller payment yang perlu disamakan dengan contract shared.
- OrderMieYamin sudah memiliki payment metadata, tetapi harus diaudit penuh terhadap server-side create, `extraData`, dan webhook correlation.
- Status payment di beberapa consumer masih bisa diperbarui dari browser setelah invoice dibuat; status final harus berasal dari webhook/RPC.
- Working tree sedang memiliki perubahan unrelated dari sesi lain. Implementasi wajib memakai allowlist file, bukan `git add -A`.

### Mayar V2 documentation basis

Sumber resmi yang sudah dibaca:

- `https://docs.mayar.id/llms.txt`
- `https://docs.mayar.id/api-reference-v2/invoice/create.md`
- `https://docs.mayar.id/api-reference-v2/invoice/detail.md`
- `https://docs.mayar.id/api-reference-v2/transaction/detail.md`
- `https://docs.mayar.id/api-reference-v2/webhook/registerurlhook.md`
- `https://docs.mayar.id/integration/webhook.md`

Endpoint V2:

```text
Sandbox:    https://api.mayar.io/hl/v2
Production: https://api.mayar.id/hl/v2

POST /invoices/create
GET  /invoices/{id}
GET  /transactions/{transactionId}
POST /webhooks/update
```

Invoice item resmi:

```json
{
  "quantity": 1,
  "rate": 25000,
  "description": "Produk"
}
```

Reference aplikasi:

```json
{
  "extraData": {
    "orderId": "order_xxx"
  }
}
```

## 3. Alternatives Analysis

### Option A — Satu `mayar-proxy` dan webhook authority terpusat

| Pros | Cons |
|---|---|
| API key hanya di server | Proxy menjadi komponen kritis lintas domain |
| Contract payment konsisten | Perlu routing domain order/booking/wallet |
| Audit, timeout, retry, dan logging terpusat | Perlu regression test lebih luas |
| Mudah dipakai Customer, Booking, OrderMieYamin | Perlu migrasi caller legacy |
| Cocok dengan Edge Function existing | Harus menjaga compatibility response lama |

### Option B — Satu integrasi Mayar terpisah per app

| Pros | Cons |
|---|---|
| Perubahan lokal per app | Duplikasi API key handling dan webhook |
| Deployment tiap app terlihat sederhana | Risiko kontrak dan status settlement berbeda |
| Isolasi awal lebih mudah | Lebih sulit audit idempotency dan finance |
| | API key mudah bocor ke frontend |
| | Retry dan duplicate webhook dapat berperilaku berbeda |

### Option C — Backend provider abstraction penuh untuk banyak payment gateway

| Pros | Cons |
|---|---|
| Fleksibel untuk gateway masa depan | Over-engineering untuk scope saat ini |
| Bisa menyatukan Mayar, wallet, manual payment | Migration dan testing jauh lebih besar |
| | Risiko mengaburkan business rule domain |

### Recommendation

Pilih **Option A** dengan boundary domain yang eksplisit.

Alasannya:

1. Project sudah memiliki `mayar-proxy`, `mayar-webhook`, RPC settlement, dan reconciliation.
2. Meminimalkan perubahan arsitektur sambil menghapus API key dari browser.
3. Menjaga Customer, Booking, dan OrderMieYamin memakai payment authority yang sama.
4. Admin/POS dapat tetap fokus pada monitoring dan operasional.
5. Provider abstraction penuh baru dipertimbangkan setelah contract Mayar V2 stabil dan kebutuhan gateway kedua benar-benar ada.

## 4. Proposed Architecture

```text
Customer UI ───────────────┐
Booking UI ────────────────┤
OrderMieYamin UI ──────────┤
Admin/POS operator UI ─────┘
             │
             ▼
  Shared checkout contract
  createInvoiceFromOrder(orderId, redirectUrl)
             │
             ▼
  Supabase Edge Function: mayar-proxy
  - auth/ownership check
  - load order from DB
  - calculate authoritative amount
  - create/reuse Mayar invoice
  - persist invoice metadata
             │
             ▼
  Mayar V2 Sandbox / Production
             │
             ▼
  mayar-webhook
  - authenticate webhook
  - extract transactionId
  - GET Mayar transaction detail
  - require data.status = paid
  - resolve domain reference
             │
             ▼
  Domain settlement RPC
  - lock target row
  - amount/invoice/reference validation
  - update order/booking/topup
  - insert finance exactly once
  - inventory only after valid settlement
  - notification with dedupe key
```

## 5. Database Schema and Data Contract

### Existing entities to preserve

```text
pos.orders
  source_id
  order_number
  source
  status
  total_amount
  payment_method
  payment_receipt_kind
  payment_gateway
  gateway_invoice_id
  customer_source_id
  created_at
  idempotency_key
  raw

pos.booking_orders
  source_id
  booking_code
  booking_status
  payment_status
  total_amount
  payment_method
  payment_receipt_kind
  payment_gateway
  payment_paid_at
  confirmed_at
  access_token_hash
  raw

pos.financial_transactions
  source_id
  tx_type
  amount
  category
  tx_date
  payment_method
  status
  order_source_id
  booking_order_source_id
  metadata
  raw

pos.customer_wallet_topups
  topup_id
  invoice_id
  transaction_id
  status
  amount
  customer_source_id

public.pos_notifications
  notification_type
  order_source_id
  dedupe_key
  is_active
```

### Recommended additive fields

Before adding fields, inspect current schema and migrations. Prefer existing columns where sufficient.

Potential fields only if a verified gap exists:

```text
pos.orders.payment_reference text
pos.orders.payment_created_at double precision
pos.orders.payment_verified_at double precision
pos.orders.payment_last_error_code text
pos.orders.payment_last_error_message text
pos.booking_orders.payment_reference text
pos.booking_orders.payment_verified_at double precision
```

Do not drop, rename, or overwrite historical payment fields.

### Recommended RPC boundaries

```text
public.create_mayar_invoice_from_order(p_order_id, p_redirect_url)
public.create_mayar_invoice_from_booking(p_booking_id, p_redirect_url)
public.settle_customer_order_mayar(...)
public.settle_booking_mayar(...)
public.wallet_settle_topup(... existing if sufficient ...)
public.record_mayar_financial_transaction(... existing if sufficient ...)
```

RPC requirements:

- `SECURITY DEFINER` with fixed `search_path`.
- Row lock with `FOR UPDATE`.
- Verify current status is payable/pending.
- Verify provider amount equals local total.
- Return idempotent success if already settled with the same verified transaction.
- Reject transaction/reference mismatch.
- Insert finance with deterministic source ID or unique idempotency key.
- Never create a second finance row on webhook retry.

### REST/view mapping

```text
Browser → supabase.functions.invoke("mayar-proxy")
Edge Function → Mayar API
Edge Function → PostgREST with:
  Content-Profile: pos
  Prefer: return=representation/minimal as appropriate

Public read views:
  public.pos_orders
  public.pos_booking_orders
  public.pos_financial_transactions
```

Direct browser writes to `pos.financial_transactions` must not be used for Mayar settlement.

## 6. Checkout Contract

### Browser request

Minimal request:

```json
{
  "action": "create-invoice-from-order",
  "orderId": "order_xxx",
  "redirectUrl": "https://canonical-domain/.../payment-return"
}
```

Booking variant:

```json
{
  "action": "create-invoice-from-booking",
  "bookingId": "booking_xxx",
  "redirectUrl": "https://booking-domain/.../payment-return"
}
```

### Server responsibilities

1. Validate caller and domain ownership where applicable.
2. Load order/booking from the correct schema.
3. Read line items and authoritative product prices.
4. Recalculate subtotal, discount, tax, service charge, shipping, and total.
5. Compare calculated total with persisted order total.
6. Reject invalid, zero, expired, cancelled, or already settled records.
7. Reuse an existing valid invoice for the same order/reference.
8. Build Mayar V2 `items[]` from database values.
9. Add `extraData` reference.
10. Call sandbox/production Mayar API according to server configuration.
11. Persist invoice ID, transaction ID, link, and status as pending/created.
12. Return only safe payment data to the browser.

### Response contract

```json
{
  "success": true,
  "data": {
    "orderId": "order_xxx",
    "invoiceId": "invoice_xxx",
    "transactionId": "transaction_xxx",
    "link": "https://...",
    "status": "pending",
    "expiresAt": "..."
  }
}
```

Safe error codes:

```text
ORDER_NOT_FOUND
ORDER_NOT_PAYABLE
ORDER_TOTAL_MISMATCH
INVOICE_ALREADY_EXISTS
INVOICE_CREATE_FAILED
PAYMENT_SETTLEMENT_PENDING
PAYMENT_ALREADY_SETTLED
```

## 7. Webhook and Settlement Flow

```text
Mayar payment.received
  → authenticate webhook token
  → extract data.transactionId
  → GET /transactions/{transactionId}
  → require verified data.status = paid
  → resolve extraData orderId/bookingId/walletTopupId
  → load local record
  → verify amount and invoice/reference
  → settle domain transaction atomically
  → finance insert idempotently
  → inventory/production side effect once
  → notification insert with dedupe_key
  → return HTTP 200
```

Rules:

- `data.id` is not assumed to be the authoritative transaction ID.
- Browser redirect never settles an order.
- Duplicate webhook must return success/no-op after the first settlement.
- Provider timeout after invoice creation must leave local order pending.
- Provider paid but local pending must be recoverable by reconciliation.
- Payment amount mismatch must fail closed and alert for review.
- Booking payment must remain linked through `booking_order_source_id`, not silently become a normal POS order.

## 8. Per-App UI/UX Specification

### Customer

Routes/components likely involved:

- `apps/customer/src/routes/$username/order.lazy.tsx`
- Customer payment/receipt components.
- `apps/customer/src/hooks/use-hybrid-write-actions.ts`

Flow:

```text
Cart review
→ customer/contact validation
→ create pending order
→ create/reuse invoice
→ native payment pending screen
→ redirect to Mayar
→ return to receipt/status page
→ realtime/polling status display
→ paid receipt after server settlement
```

States:

- Loading: disable submit, show “Menyiapkan pembayaran”.
- Empty: cart must contain at least one item.
- Validation error: field-level customer/contact error.
- Invoice pending: show order number, amount, expiry, “Lanjutkan pembayaran”.
- Settlement pending: “Pembayaran sedang diverifikasi”.
- Paid: receipt and order processing status.
- Expired: allow safe reissue/reuse flow, not duplicate order.
- Error: show stage-specific safe message and retry action.

### Booking

Likely files:

- `apps/booking/src/lib/client.ts`
- booking payment/confirmation components.
- Existing booking payment-first RPC/migration.

UI requirements:

- Capacity hold status visible.
- Summary amount locked to server total.
- Payment state separate from booking operational state.
- Do not show “confirmed” before verified settlement.
- Expired hold must explain that availability may need recalculation.

### OrderMieYamin

Likely files:

- `apps/ordermieyamin/src/routes/index.lazy.tsx`
- corresponding write hook/client.

UI requirements:

- Order reference and invoice state visible.
- Redirect return must restore the exact order, not create a new one.
- Provider state and local fulfillment state shown separately.
- Reconciliation pending must not appear as payment failure.

### Admin and POS

Admin/POS should provide:

- payment status read-only view;
- invoice ID, transaction ID masked/partial where appropriate;
- order/booking reference;
- amount comparison local vs provider;
- settlement timestamp;
- safe retry reconciliation action;
- visible error stage;
- no API key fields in frontend runtime.

Table-first columns:

```text
Reference | Customer | Amount | Payment | Provider Status | Local Status | Created | Verified | Action
```

Mobile behavior:

- table converts to cards/sheet;
- primary action remains at least 44px;
- details progressive disclosure;
- no raw provider payload rendered.

## 9. Multi-Source Data Flow

### Customer order

```text
Customer products/menu
  → pending pos.orders
  → pos.order_items
  → server-side Mayar invoice
  → verified webhook
  → pos.orders completed
  → pos.financial_transactions income
  → pos.order_status production queue
  → inventory deduction after valid completion
  → pos_notifications order_paid
  → Customer receipt + Admin/POS visibility
```

### Booking

```text
Booking form
  → pos.booking_orders pending
  → capacity hold
  → server-side Mayar invoice
  → verified webhook
  → booking payment settlement RPC
  → booking confirmed/paid
  → booking finance record
  → booking notification worker
  → Admin booking operational flow
```

### Wallet top-up

```text
Customer wallet top-up request
  → pending customer_wallet_topups
  → Mayar invoice
  → verified webhook/reconciliation
  → wallet_settle_topup RPC
  → wallet ledger credit
  → top-up completed
  → customer balance refresh
```

### Admin/POS

```text
Orders/booking/finance views
  → read settled state
  → no independent payment authority
  → reconciliation action invokes server-side path
```

## 10. Integration Points

### AI/LLM

No AI should decide payment settlement.

Allowed integrations:

- AI can explain payment state using already verified fields.
- AI can surface `INVOICE_CREATE_FAILED`, `PAYMENT_SETTLEMENT_PENDING`, or `PAYMENT_ALREADY_SETTLED`.
- AI may suggest reconciliation action, but execution requires explicit operator action and server-side authorization.
- AI must not receive API keys, webhook tokens, full provider payloads, or sensitive payment credentials.
- AI-created order/payment actions must use the same idempotency and server-side order contract as the UI.

Relevant existing surface:

- Admin AI chat order/transaction actions.
- `yumi-ai` Edge Function and finance agent.

### Telegram bot / Supervisor

- Continue notifying only after verified settlement.
- Use existing source/payment labels:
  - DjiwaApp/customer self-service;
  - QRIS/Mayar;
  - Djiwa Pay;
  - booking.
- Deduplicate by stable order/booking + event type.
- Reconciliation worker may alert unresolved verified-paid local pending records.
- Never send pending invoice as paid notification.
- Never include API key, webhook token, or raw provider response.

Relevant existing services:

- `yumi-supervisor-agent/app.py`.
- `yumi-ai-bot/app.py`.
- `supabase/functions/pos-notifications/index.ts`.

### Purchasing agent

Payment checkout should not directly mutate purchasing data.

Allowed downstream behavior:

- settled customer order updates sales/inventory flow;
- inventory deduction follows existing recipe/stock safeguards;
- purchasing agent reads verified inventory movement and may generate restock recommendations;
- no Mayar provider data should be used as stock truth without local order settlement.

## 11. No-Hardcode Audit

Values that must come from server/config/database:

- Mayar API base URL: server environment (`MAYAR_API_BASE`).
- Mayar API key: server secret (`MAYAR_API_KEY`).
- Webhook token: server secret (`MAYAR_WEBHOOK_TOKEN`).
- Product price, quantity, discount, tax, service charge: database/order calculation.
- Customer identity: authenticated customer/order record.
- Redirect URL: canonical app configuration, validated allowlist.
- Invoice expiry policy: server setting/config.
- Payment channel availability: Mayar/account configuration or admin setting.
- Brand/store name: site settings/database.
- Order/booking reference: generated and persisted application ID.
- Retry/idempotency key: persisted application field.

Allowed constants:

- Safe error codes.
- Mayar V2 endpoint path names.
- Payment state enums.
- Maximum timeout/retry bounds, configurable where needed.
- Temporary placeholder only when the database record is genuinely missing; it must not be used for financial amount or identity.

Explicitly prohibited:

- `VITE_MAYAR_API_KEY` in frontend production.
- Hardcoded customer phone/email as payment authority.
- Client-provided rate/total as trusted amount.
- Hardcoded `api.mayar.club/hl/v1` legacy endpoint in new flow.
- Hardcoded booking/customer total in UI.

## 12. Implementation Waves

### Wave 0 — Preparation and official skill

1. Obtain explicit approval to leave plan mode.
2. Install official skill only if approved:
   `npx skills add mayarid/skills --skill mayar-v2 --global --yes`
3. Inspect installed skill and compare with official docs.
4. Freeze current legacy behavior and create a compatibility matrix.
5. Record exact environment names without printing values.

### Wave 1 — Server contract and database

1. Add/extend RPCs for create-from-order and create-from-booking if required.
2. Ensure authoritative server-side amount calculation.
3. Add only additive columns/indexes after schema verification.
4. Make invoice correlation and idempotency persistent.
5. Add contract tests for duplicate create, amount mismatch, already paid, and expired order.

### Wave 2 — Mayar proxy and webhook

1. Add `create-invoice-from-order` action.
2. Add `create-invoice-from-booking` action.
3. Keep legacy action temporarily for compatibility, but stop new callers from using browser prices.
4. Normalize V2 response.
5. Harden webhook transaction ID extraction and provider status verification.
6. Ensure settlement routes use domain-specific RPCs.
7. Add safe reconciliation result contract.

### Wave 3 — Consumer migration

1. Migrate Customer checkout.
2. Migrate Booking checkout.
3. Migrate OrderMieYamin checkout.
4. Replace/remove Admin direct gateway caller.
5. Replace/remove POS direct gateway caller.
6. Remove `VITE_MAYAR_API_KEY` from app env documentation and frontend types.
7. Preserve read-only monitoring in Admin/POS.

### Wave 4 — Sandbox verification

1. Configure sandbox secret only in server runtime.
2. Create controlled sandbox order/booking fixtures.
3. Test invoice creation and redirect.
4. Test payment received webhook with verified transaction.
5. Test duplicate webhook.
6. Test webhook missing token.
7. Test transaction status unpaid/expired.
8. Test amount mismatch.
9. Test browser timeout after provider invoice creation.
10. Test retry/reconciliation.
11. Verify exactly one finance row, one settlement, one notification, and correct inventory side effect.

### Wave 5 — Production gate and rollout

Only after explicit production approval:

1. Review migration status on the actual self-hosted runtime.
2. Apply additive migration.
3. Set server secrets without printing values.
4. Register production webhook via documented `POST /webhooks/update`.
5. Deploy only changed Edge Functions.
6. Build only changed apps.
7. Deploy canonical domains.
8. Run controlled smoke test.
9. Verify order/booking/finance/notification read-back.
10. Monitor reconciliation and error logs.
11. Remove legacy browser gateway after a defined compatibility window.

## 13. Files Likely to Change

### Backend/database

- `supabase/functions/mayar-proxy/index.ts`
- `supabase/functions/mayar-webhook/index.ts`
- `supabase/functions/pos-notifications/index.ts` if payment event mapping needs adjustment
- New additive migration under `supabase/migrations/`
- Existing payment RPC migration only if a verified gap exists
- `supabase/config.toml` only if function routing/verify settings require it

### Customer

- `apps/customer/src/routes/$username/order.lazy.tsx`
- `apps/customer/src/hooks/use-hybrid-write-actions.ts`
- Customer receipt/payment status component(s)
- Customer env example/type files, removing frontend API-key contract

### Booking

- `apps/booking/src/lib/client.ts`
- Booking payment/receipt components
- Booking hook/types if contract needs normalization

### OrderMieYamin

- `apps/ordermieyamin/src/routes/index.lazy.tsx`
- OrderMieYamin write hook/client
- Payment status/receipt component if separate

### Admin/POS

- `apps/admin/src/lib/mayarGateway.ts` — replace legacy caller or retire it
- `apps/pos/src/lib/mayarGateway.ts` — replace legacy caller or retire it
- Admin/POS payment monitoring components
- `.env.example` and Vite env declarations, with no secret values

### Tests

- Mayar proxy unit/contract tests
- Webhook verification/idempotency tests
- RPC settlement tests
- Customer/Booking/OrderMieYamin checkout integration tests
- Negative sandbox smoke scripts

Do not stage unrelated current working tree changes:

```text
apps/admin/src/components/layout/Footer.tsx
apps/admin/src/pwa-settings.ts
apps/admin/src/routes/admin/booking.lazy.tsx
apps/admin/vite.config.ts
apps/booking/src/main.tsx
apps/customer/src/routes/__root.tsx
apps/karyawan/src/routes/__root.tsx
apps/linkbio/src/App.tsx
apps/ordermieyamin/src/routes/__root.tsx
apps/pos/* unrelated files
packages/yumipos-web-shared/* unrelated files
scripts/generate-pwa-manifest.mjs
```

## 14. Testing and Validation

### Static checks

- Search for `VITE_MAYAR_API_KEY` in production app source and generated bundles.
- Search for legacy `api.mayar.club/hl/v1` in active checkout callers.
- Confirm no API key/token appears in logs or committed files.
- Run TypeScript checks for changed apps.
- Run Edge Function type/lint checks.
- Run SQL parse/transaction rollback checks.

### Unit/contract tests

- Server ignores browser-provided price/rate.
- Server calculates total from DB.
- Same order retry reuses invoice or returns existing invoice.
- Duplicate webhook is no-op.
- Missing transaction ID is rejected/ignored safely.
- Verified status other than `paid` does not settle.
- Amount mismatch does not settle.
- Invoice/reference mismatch does not settle.
- Finance row is exactly one.
- Notification dedupe row is exactly one.
- Wallet hold/capture/release invariants remain intact.

### Sandbox E2E matrix

| Scenario | Expected result |
|---|---|
| Valid Customer order | Pending order → invoice link → verified paid → completed |
| Valid Booking | Pending booking/hold → invoice → paid/confirmed |
| Valid OrderMieYamin | Pending order → invoice → verified settlement |
| Browser timeout after invoice create | Local order remains pending; retry reuses correlation |
| Duplicate submit | No duplicate order/invoice |
| Duplicate webhook | HTTP success/no duplicate side effects |
| Unpaid transaction webhook | No settlement |
| Amount mismatch | Fail closed, alert/log safe code |
| Missing webhook token | HTTP 401/no mutation |
| Provider API timeout | Safe pending state and reconciliation path |
| Wallet top-up | Exactly one wallet credit and finance record |

### Production verification after approval

- Verify actual self-hosted Edge Function runtime, not only repository source.
- Check `OPTIONS` and safe invalid-action response.
- Check live canonical app bundle does not contain API key.
- Check `version.json`, `index.html`, hashed bundle, and service worker parity.
- Read back exact order/booking/payment/finance/notification rows.
- Confirm webhook/reconciliation logs contain no secret or PII.

## 15. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| API key leaks through Vite bundle | Remove `VITE_MAYAR_API_KEY`; use Edge Function secret only |
| Browser amount manipulation | Server loads products/order and recalculates total |
| Duplicate invoice on retry | Persist invoice correlation and idempotency key |
| Paid provider but local pending | Reconciliation by transaction ID and invoice reference |
| Duplicate finance/notification | Deterministic IDs and unique dedupe keys |
| Booking accidentally becomes POS order | Separate `booking_order_source_id` and booking RPC |
| Legacy caller silently remains active | Search callers, disable/retire after migration verification |
| Sandbox/production mix-up | Explicit server `MAYAR_API_BASE`, environment health check |
| Migration applied to wrong Supabase runtime | Verify self-hosted URL and schema before/after |
| Frontend status trusted as settlement | Webhook + provider transaction detail + RPC authority |
| Sensitive logs | Safe error codes and secret/PII scrubbing |
| Working-tree contamination | Selective file staging and pre/post `git diff --name-only` |
| Legacy response contract breakage | Temporary adapter and consumer-by-consumer migration |
| Provider rate limit/duplicate request | Reuse invoice and bounded retry with user-visible state |

## 16. Open Questions Before Implementation

1. Apakah satu akun Mayar akan dipakai bersama oleh Customer, Booking, dan OrderMieYamin?
2. Apakah semua domain harus memakai invoice Mayar, atau sebagian tetap memakai manual payment/wallet?
3. Untuk per-shift POS reporting, apakah transaksi dicatat berdasarkan waktu order dibuat atau waktu settlement? Ini harus tetap konsisten dengan keputusan business flow yang sudah ditetapkan.
4. Apakah admin membutuhkan tombol “buat ulang invoice”, atau cukup “cek/reconcile invoice existing”?
5. Apakah payment channel harus dipaksa QRIS saja, atau mengikuti konfigurasi channel Mayar merchant?
6. Apakah target rollout mencakup `apps/web`, `apps/rekrutmen`, atau hanya app yang memiliki order/payment flow?
7. Apakah sandbox credential dan webhook URL sandbox sudah tersedia di server runtime?
8. Setelah sandbox lulus, apakah user akan memberikan approval terpisah untuk perubahan secret, registrasi webhook, dan production deployment?

## 17. Approval Gate

Plan ini belum mengubah implementasi apa pun.

Sebelum eksekusi perlu persetujuan eksplisit untuk:

- instalasi skill resmi global;
- perubahan source code;
- migration/RPC database;
- perubahan server secret;
- registrasi webhook Mayar;
- sandbox invoice test yang membuat transaksi provider;
- deployment Edge Function/frontend;
- production smoke test.

## 18. Definition of Done

- Tidak ada API key Mayar di browser source atau bundle.
- Seluruh app yang terdaftar dalam project matrix sudah diaudit dan memiliki boundary yang terdokumentasi: checkout consumer, monitoring/fulfillment consumer, atau explicitly isolated non-payment app.
- Tidak ada app yang memiliki direct Mayar API caller aktif dari browser; caller legacy harus dimigrasikan, dinonaktifkan, atau dibuktikan tidak terpakai.
- `apps/rekrutmen` dan app non-payment lain tidak mengalami perubahan payment atau dependency leakage.
- Entry point seperti `apps/linkbio` hanya meneruskan ke checkout canonical dan tidak menerima nominal/payment authority dari browser.
- Semua invoice baru dibuat melalui server-side Mayar V2.
- Harga final berasal dari database/order server-side.
- Customer, Booking, dan OrderMieYamin memakai correlation dan settlement contract yang konsisten.
- Admin/POS hanya monitoring/operator.
- Webhook memverifikasi transaction detail dan status `paid`.
- Duplicate create/webhook/reconciliation aman dan idempoten.
- Finance, wallet, inventory, dan notification side effects tepat satu kali.
- Sandbox matrix lulus.
- Production deployment hanya dilakukan setelah approval.
- Live runtime, database, webhook, dan bundle diverifikasi read-back.
- Dokumen, lesson, dan migration manifest diperbarui secara selektif.

## 19. Execution Notes

Saat user menyetujui implementasi:

1. Keluar dari plan mode.
2. Buat TODO list dan dependency graph.
3. Baca ulang skill Mayar V2 resmi serta skill internal `mayar-payment-gateway`.
4. Delegasikan audit/implementasi independen secara terbatas bila aman; jangan memberi subagent akses atau tugas untuk mencetak secret.
5. Implementasi backend/database authority lebih dahulu.
6. Migrasikan consumer satu per satu.
7. Jalankan sandbox verification.
8. Baru minta approval production side effects tepat sebelum dilakukan.
9. Stage hanya file yang benar-benar dimiliki sesi ini.
10. Ringkas dengan preview API/DB/runtime evidence.
