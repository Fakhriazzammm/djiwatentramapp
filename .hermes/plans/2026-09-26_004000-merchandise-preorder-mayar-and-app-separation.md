# Customer Center + Merchandise Pre-order Implementation Plan

> **For Hermes:** Execute only after the user confirms the unresolved preorder/payment and fulfillment decisions below. Use `subagent-driven-development` for implementation/review waves; preserve all unrelated dirty-worktree changes.

**Status:** Approved for implementation — payment, fulfillment, sales scope, dispatch estimate, and case-by-case cancellation/refund decisions are recorded below. Source changes are in progress; database application, Mayar sandbox transactions, and production deployment remain separate release actions.

**Goal:** Keep `apps/customer` as the central Djiwa customer/F&B experience and make `apps/merchandise` a clearly isolated physical-merchandise storefront with a reliable, auditable Mayar-backed preorder lifecycle.

**Architecture:** Reuse the canonical Djiwa customer identity, Supabase database, order/payment records, Mayar V2 invoice proxy, and verified webhook settlement. Keep catalog scope, cart, checkout context, preorder reservation, fulfillment states, and `brand_slug` specific to Merchandise. Mayar supplies payment invoices; Djiwa owns preorder availability, reservations, promised dispatch, cancellation/refund policy, and fulfillment workflow.

**Tech Stack:** React 19 + TanStack Router + Vite, TypeScript/Bun workspace, Supabase Postgres (`pos` schema), Supabase Edge Functions (Deno), Mayar V2.

---

## Findings verified in current code/docs

- `apps/customer/src/hooks/use-hybrid-pos-data.ts`: customer `fetchCategories`, `fetchProducts`, `fetchAllProducts`, and `fetchBestSellers` currently read the shared catalog without excluding the Merchandise category tree. If merchandise rows are present/available, they can enter customer discovery/menu paths.
- `apps/merchandise/src/hooks/use-hybrid-pos-data.ts`: Merchandise already resolves the exact `Merchandise` category root and descendants and applies them to categories, available products, all products, and best sellers. Fail-closed behavior returns an empty catalog when the category tree is missing.
- `apps/customer/src/routes/$username/route.lazy.tsx` and `apps/merchandise/src/routes/$username/route.lazy.tsx`: cross-domain navigation passes a username for both members and guests. Guest identity is held in origin-local `localStorage`, so it does not transfer between the domains. Guest handoff must go through the destination `/daftar`; member handoff may preserve username.
- Merchandise checkout is still cafe-derived: `apps/merchandise/src/components/customer/checkout-section.tsx` asks for “Ciri khusus customer” and “Nomor meja”; `apps/merchandise/src/routes/$username/order.lazy.tsx` writes `orderType: "dine_in"`, table data, and dessert/refill metadata. This is not an appropriate physical-merchandise preorder contract.
- `apps/merchandise/src/routes/$username/order.lazy.tsx` already uses `useHybridMayarCreateInvoice()` and redirects to the Mayar link. `apps/merchandise/src/hooks/use-hybrid-write-actions.ts` calls the `mayar-proxy` Edge Function.
- `supabase/functions/mayar-proxy/README.md` documents server-side invoice creation from persisted order/item data, idempotency checks, and webhook-owned settlement. Its allowed order sources/statuses already include customer self-service pending orders.
- The shared order writer stamps the Merchandise brand and a separate merchandise receipt kind. `apps/admin/src/routes/admin/orders.lazy.tsx` currently has no Merchandise business filter/channel classification.
- Existing `pos.orders` fields include `source_id`, `order_number`, `total_amount`, `status`, `payment_method`, `order_type`, `source`, `brand_slug`, `payment_gateway`, and `gateway_invoice_id`; `pos.order_items` holds `order_source_id`, `line_no`, `product_source_id`, `quantity`, and `price`. `public.pos_orders` exposes brand and delivery fields. Confirm the live schema/migrations before any additive DDL.
- Mayar’s physical-product documentation describes stock, terms, sales start time, and expired date; its order page describes shipping workflow. The reviewed pages do **not** document a native preorder lifecycle or preorder-specific API field. Mayar V2 `POST /invoices/create` accepts invoice items, expiry, payment method, and `extraData`; it is a suitable payment step, not a reservation/fulfillment engine.
- Production roots for both `https://djiwatentram.web.id/` and `https://merchandise.djiwatentram.web.id/` returned HTTP 200 during this read-only review. No live catalog rows/counts were queried.

## Recommended product boundary

```text
Djiwa App (apps/customer) — CENTRAL
  identity/profile · Djiwa Pay · loyalty/community · F&B catalog/order
                 │ member: preserve username; guest: destination registration
                 ▼
Djiwa Merchandise (apps/merchandise) — SPECIALIST STOREFRONT
  Merchandise-only catalog · preorder terms · delivery/pickup · order tracking
                 │
                 └── shared Supabase `pos` orders + Mayar V2 invoice/webhook
                     `brand_slug = merchandise`; separate preorder fulfillment state
```

The merchandise catalog must never leak into the F&B catalog merely because the two apps share `pos.products`. The shared identity and payment infrastructure are an integration boundary, not a reason to share catalog/cart/fulfillment semantics.

## Mayar capability and recommended integration

**Conclusion:** Preorder can be implemented in Merchandise using Mayar for payment, but the documented Mayar feature is not a native Djiwa preorder engine. Implement Djiwa’s preorder/capacity/fulfillment state in our database and reuse the current Mayar V2 invoice proxy and verified webhook. Do not create a second Mayar product catalog as the authority for available quantity.

Relevant official pages:
- [Mayar Physical Product](https://docs.mayar.id/features/productpage/physicalproduct.md) — inventory/stock and sale-window controls.
- [Mayar Order](https://docs.mayar.id/features/order.md) — physical shipment/order workflow.
- [Mayar V2 Create Invoice](https://docs.mayar.id/api-reference-v2/invoice/create.md) — invoice items, `expiredAt`, `paymentMethod`, and `extraData`.
- [Mayar V2 Get Invoice Detail](https://docs.mayar.id/api-reference-v2/invoice/detail.md) — invoice status lookup.

Recommended path: create a Djiwa pending preorder and durable reservation → request Mayar invoice through `mayar-proxy` using persisted amounts and `extraData.orderId` → verify payment server-side through the existing webhook/transaction-detail path → mark preorder confirmed exactly once → later move fulfillment independently through production/dispatch/delivery. Invoice redirects and client polling are display aids, never payment proof.

### Open decisions — must be answered before implementation

1. **Payment schedule — DECIDED:** 100% payment at checkout. Use one invoice for the full amount; the preorder is not confirmed until authoritative Mayar settlement. Keep any short-lived checkout hold bounded by invoice expiry so unpaid invoices cannot reserve capacity forever.
2. **Checkout type — current pattern:** hosted Mayar invoice link is used by Merchandise today (`window.location.assign(invoice.data.link)`); retain this pattern unless the user asks to change it.
3. **Payment methods — DECIDED:** allow full payment by Mayar or Djiwa Pay. Disable cash-at-cashier for preorder. Mayar invoice settlement remains provider-verified; Djiwa Pay must use the existing hold/capture/release flow and only confirm reservation after successful capture.
4. **Fulfillment — DECIDED:** setelah pembayaran penuh terverifikasi, barang diproduksi/dipersiapkan lalu dikirim dengan tracking. Djiwa harus menjadi sumber status produksi dan pengiriman yang terlihat customer/admin; jangan menandai order selesai saat baru dibayar.
5. **Sales scope — DECIDED for v1:** every Merchandise product is preorder; no ready-stock purchase path. Keep campaign/sales-window and capacity settings per product so the admin can control each preorder without mixing in F&B inventory semantics.
6. **Dispatch estimate — DECIDED:** an admin sets an estimated dispatch date range per campaign and the customer sees that range. Store timestamps in the campaign record; render them using the agreed WIB/customer display convention.
7. **Cancellation/refund — DECIDED:** customer cancellation/refund requests are reviewed by an admin case by case. Do not promise automatic cancellation/refund or invent a fixed deadline; record the review outcome and any refund action with an audit trail.

Do not infer additional policy from provider docs. Record any remaining operational decisions before implementation.

## Proposed additive data model (validate against live schema first)

```text
pos.categories(source_id, name, parent_source_id, ...)
  └─ pos.products(source_id, category_source_id, name, price, is_available, quantity, variations, ...)
       └─ pos.merchandise_preorder_campaigns(id, product_source_id, sale_start_at, sale_end_at,
             expected_dispatch_start_at, expected_dispatch_end_at, quantity_limit, status, ...)
             └─ pos.merchandise_preorder_items(id, campaign_id, order_source_id, line_no,
                   quantity, reservation_status, fulfillment_status, reserved_until, tracking_ref, ...)
                    └─ pos.orders(source_id, brand_slug, source, status, total_amount,
                         payment_gateway, gateway_invoice_id, idempotency_key, customer_source_id, ...)
                         └─ pos.order_items(order_source_id, line_no, product_source_id, quantity, price, ...)

Mayar V2 invoice ── invoice/transaction reference in order.payment_gateway
Mayar webhook ── pos.mayar_payment_events (durable/deduped queue)
                 └─ authoritative transaction verification → payment state update
```

Proposed new tables are intentionally separated from the shared cafe `pos.orders` lifecycle details:

- `pos.merchandise_preorder_campaigns`: `id text primary key`; `product_source_id text not null` FK to the verified product key; `status` (`draft|scheduled|open|paused|closed`); sale start/end timestamps; expected dispatch start/end; nullable `quantity_limit` (document whether `NULL` means unlimited); optional `max_per_customer`; creation/update timestamps. Resolve product variants against the existing variation contract rather than inventing an incompatible SKU.
- `pos.merchandise_preorder_items`: `id text primary key`; campaign ID; order ID; order line number; quantity; `reservation_status` (`awaiting_payment|confirmed|released|cancelled`); separate `fulfillment_status` (`queued|in_production|ready_to_ship|shipped|completed|cancelled|refund_pending|refunded`); reservation expiry; tracking reference; audit timestamps. Add a unique key for `(order_source_id, line_no)` and appropriate indexes/check constraints after live schema review.
- Keep payment state in canonical `pos.orders.status`/`payment_gateway`, and preorder reservation/fulfillment states in the new merchandise tables. Do not conflate `paid` with `shipped` or `completed`.
- Implement a narrowly granted transaction/RPC path that re-reads current product/price/category, checks brand scope/sale window/capacity, creates order + line + reservation atomically, and serializes capacity checks (row lock). Do not trust product IDs/prices/capacity supplied by a browser. Release unpaid reservations after cancellation/verified invoice expiry; settle duplicate webhooks as no-ops.
- Prefer additive migration; no destructive edits or rewriting historical F&B orders. If existing delivery columns/views are suitable, reuse them for shipping contact/address; otherwise add fields/views additively after confirming exact schema.

### Data access / route mapping

- Public read: existing `public.pos_products` and `public.pos_categories` filtered to the Merchandise root + descendants; future campaign read should expose only open/scheduled public fields, never internal limits/customer reservations if not intended.
- Customer owner read: existing `public.pos_orders` filtered by authenticated `customer_source_id` and `brandSlug = merchandise`; preorder fulfillment read must be similarly owner-scoped.
- Internal campaign/admin actions: use authenticated, role-checked RPCs or protected backend routes; never expose service-role keys.
- Mayar: `supabase.functions.invoke("mayar-proxy", { action: "create-invoice-from-order", orderId, idempotencyKey, ... })`; Edge Function calls official V2 invoice API server-side. Webhook queue/settlement remains server-owned.

## UI/UX specification

- Merchandise landing/order: only merchandise discovery and preorder CTA; no cafe table, party-size, refill, F&B discounts, or kitchen language.
- Product card/detail: `Pre-order` badge, sale-window state, expected dispatch window, variation, quantity cap/remaining only when intentionally public, and clear “perkiraan dikirim” wording.
- Checkout: selected merchandise and total; shipping address/contact or pickup selection (decision pending); expected dispatch; cancellation/refund terms acknowledgement; payment schedule/amount (decision pending); explicit submit/loading/error/duplicate-order states.
- Receipt: separate states “Menunggu pembayaran”, “Pre-order dikonfirmasi” (only after verified payment/approved deposit), “Diproses”, “Siap dikirim/diambil”, “Dikirim”, “Selesai”; display order reference, expected dispatch, payment and fulfillment state separately.
- Admin product/campaign: draft/open/paused/closed, price from canonical product record, sales window, limit, expected dispatch, reservation/paid counters, and safe pause/close action. Use compact operational table with search/filter and clear empty/loading/error states.
- Admin orders: dedicated Merchandise source filter and fulfillment actions, keeping existing POS/F&B and B2B labels/status transitions intact.
- Cross-app handoff: member → target app’s username route; guest → target app `/daftar`; never pass guest PII/localStorage identity through URL.

## Integration mapping

- `apps/customer`: F&B storefront, central identity/Djiwa Pay, and Merchandise CTA; exclude Merchandise category descendants from customer categories/products/all-products/best-seller/recommendation/favorites/reorder/scanner/order validation paths.
- `apps/merchandise`: category-scoped physical catalog, preorder campaign presentation, shipping/pickup contract, member/guest handoff, and customer-owned preorder tracking.
- `apps/admin`: extend existing product/order workflows for campaign management and merchandise fulfillment; brand filters/classifier must identify `brand_slug = merchandise` before generic `customer_self_service`/DjiwaApp mapping.
- `supabase/functions/mayar-proxy`: reuse V2 invoice creation and server-side amount/source/status/idempotency rules; add narrowly scoped brand/order validation if the current contract does not already enforce Merchandise scope.
- `supabase/functions/mayar-webhook` / `mayar-payment-processor`: reuse authoritative V2 transaction verification, durable event queue, duplicate suppression, and amount/order correlation; confirm existing path handles `brand_slug=merchandise` and the chosen payment schedule before editing.
- POS/production: Merchandise preorders must not enter the cafe kitchen/bar queue or consume F&B recipe inventory; handle merchandise fulfillment in its own order view/status flow.
- AI, Telegram, and purchasing-agent sync: out of scope for the first release unless the user chooses an automated notification/purchasing workflow. If added later, use canonical order/campaign events and dedupe keys; never broadcast from frontend or replay backlog.

## Implementation steps (after decisions are recorded)

### Task 1 — Capture decisions and baseline contracts

**Files:** none initially; record answers in this plan. Inspect actual category tree/data, `pos` schema/views/RLS, shared order readers, `.env.example` filenames only, Mayar Edge Function and worker before edits. No secrets in outputs.

**Gate:** payment schedule, fulfillment owner, preorder scope, cancellation/refund authority, and sample invoice/webhook shape agreed.

### Task 2 — Customer/merchandise catalog + handoff isolation

**Files likely to change:**
- `apps/customer/src/hooks/use-hybrid-pos-data.ts`
- `apps/customer/src/components/customer/customer-home-discovery.tsx`
- customer favorites/reorder and order routes that consume unrestricted catalog reads
- `apps/customer/src/routes/$username/route.lazy.tsx`
- `apps/merchandise/src/routes/$username/route.lazy.tsx`
- relevant customer/merchandise tests

Add one reusable exact category-tree scope per app boundary; apply it at every query and derived surface, not just card rendering. Member and guest cross-domain handoff must branch correctly. Verify cart rehydration removes out-of-scope IDs only after catalog load.

### Task 3 — Additive preorder schema and authoritative capacity RPC

**Files likely to change:**
- `supabase/migrations/<timestamp>_merchandise_preorder.sql`
- `supabase/functions/mayar-proxy/index.ts` or a narrowly scoped order RPC/Edge Function
- generated database types / public safe read view if the repo’s type workflow requires it
- contract and SQL integration tests

Create campaign/reservation storage, RLS/grants, indexes, transaction-safe reserve/release/finalize RPCs, and cancellation/expiry handling. Preserve existing order/payment fields and historic records.

### Task 4 — Merchandise checkout/receipt as physical preorder

**Files likely to change:**
- `apps/merchandise/src/routes/$username/order.lazy.tsx`
- `apps/merchandise/src/components/customer/checkout-section.tsx`
- merchandise order context/types/menu/product-card components
- `apps/merchandise/src/hooks/use-hybrid-write-actions.ts`
- receipt component and tests

Remove cafe-only table/refill/dessert semantics; implement address/pickup + delivery date policy after the user selects them. Create order/reservation atomically through the backend; then reuse existing Mayar V2 invoice flow. Keep guest/member identity and retry idempotency intact.

### Task 5 — Payment webhook, expiry and fulfillment lifecycle

**Files likely to change:**
- `supabase/functions/mayar-proxy/index.ts`
- existing Mayar webhook/processor and tests
- new preorder SQL RPC(s)
- Merchandise order tracking read hook/route

Confirm the provider transaction via Mayar V2 transaction detail before fulfillment. Payment settlement and reservation finalization must be idempotent; expired/closed unpaid invoices release capacity only after authoritative status/reconciliation. Keep payment and dispatch statuses separate.

### Task 6 — Admin campaign/order operations

**Files likely to change:**
- `apps/admin/src/routes/admin/products.lazy.tsx` (campaign controls if this is the established admin product editor)
- `apps/admin/src/routes/admin/orders.lazy.tsx` (Merchandise filter/classification and fulfillment list/actions)
- admin hybrid read/write hooks + tests

Add role-protected campaign create/edit/pause/close, capacity view, preorder fulfillment queue, status transitions, and tracking reference. Preserve POS/B2B/booking behavior and do not expose customer personal details beyond authorized admin roles.

### Task 7 — Verification and staged release

- Contract/unit tests for category scoping, guest/member routes, campaign windows, capacity races, duplicate checkout, payment/fulfillment separation, webhook idempotency, price tampering, invoice expiry, and cancellation.
- Build/typecheck `apps/customer`, `apps/merchandise`, `apps/admin`; run targeted Edge Function and SQL tests; compare pre-existing failures against baseline.
- Sandbox invoice/test webhook only with explicit approved sandbox credential; do not create/settle a production invoice during smoke testing.
- UI smoke: F&B menu contains no Merchandise categories; merchandise app contains only Merchandise products; guest and member cross-domain handoff; preorder menu→checkout→pending receipt; paid sandbox event→confirmed receipt; admin campaign/filter/dispatch; mobile viewport screenshots.
- Deployment: additive migration first, then server functions only if changed, app builds/deployments individually; selective `git add <explicit files>`; verify production hashed bundles/routes and live query/API read-back.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Shared product query leaks merchandise into F&B | Filter category descendants in all customer read/write pathways and validate again server-side. |
| Capacity oversold under concurrent checkouts | Atomic database reserve RPC with campaign row locking and idempotency. |
| Customer pays but invoice response/webhook races | Persist order before invoice; idempotent invoice reuse; authoritative provider verification and durable event queue. |
| Unpaid invoice holds stock forever | Bounded reservation expiry plus verified invoice status/reconciliation before release. |
| Paid order appears completed before shipping | Payment state and preorder fulfillment state are separate. |
| Existing cafe workflows receive merchandise | Keep brand-specific order, admin labels, and kitchen/stock exclusion; verify POS and notification mappers. |
| Mayar UI/API does not actually offer native preorder | Djiwa owns the preorder lifecycle; Mayar only issues invoice and confirms payment. |
| Business terms unclear | Do not implement payment schedule, shipping promise, or cancellation/refund defaults until explicitly approved. |

## Acceptance criteria

- F&B customer catalog never renders or accepts Merchandise products; Merchandise never renders or accepts F&B products.
- Guest/member app switching works without leaking/assuming origin-local guest state.
- Merchandise checkout has no cafe table/refill semantics and records accurate shipping/pickup and preorder promises.
- Capacity is safe under concurrency; each order is idempotent; unpaid expiry releases holds correctly.
- A preorder is considered paid only after server-side Mayar V2 verification; duplicate webhooks do not double-confirm/reward/settle.
- Admin can operate campaigns and fulfillment without changing F&B status/queue logic.
- Both apps use shared identity/payment infrastructure but remain separately deployable, themed, and independently testable.
