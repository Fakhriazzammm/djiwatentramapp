# Mayar V2 proxy contract

## Actions

- `get-payment-channels`: reads the merchant's enabled V2 channels server-side.
- `create-invoice-from-order`: accepts only `orderId`, `idempotencyKey`, `paymentMethod`, and `redirectUrl`; loads the order and line items from the `pos` schema and never trusts browser prices.
- `get-invoice-detail`: server-side invoice status lookup.

## Safety invariants

- `MAYAR_API_KEY` exists only in the Edge Function runtime.
- The order must be `pending` or `created`, be sourced from `customer_self_service` or `ordermieyamin_b2b`, and match its persisted `idempotency_key`.
- Invoice items and amount are derived from `pos.order_items` and `pos.orders.total_amount`.
- Existing invoice metadata is reused instead of creating a duplicate invoice.
- Mayar payment channels are checked against the enabled account configuration and normalized to documented V2 `paymentMethod` codes.
- The client receives the provider link as a fallback; the link/instrument is never treated as settlement proof.
- Settlement remains the responsibility of `mayar-webhook` after authoritative transaction verification.

No API key, webhook token, or provider payload is stored in this file.

## Sandbox

Set the server-only `MAYAR_API_BASE` to `https://api.mayar.io/hl/v2` and configure `MAYAR_API_KEY` in the Edge Function secret store. Never use a `VITE_` variable for the key.

## Test fixture expectations

A safe fixture should cover:

1. Valid pending order with a database-owned total.
2. Browser-supplied price differing from `order_items.price` — server ignores the browser value.
3. Missing/wrong idempotency key — rejected.
4. Existing invoice metadata — reused.
5. Unpaid/expired order — rejected.
6. Disabled or unknown payment channel — rejected.
7. Duplicate webhook — settlement no-op.
8. Provider amount mismatch — settlement rejected.

Real sandbox payment completion requires an approved sandbox credential and a manual payment action; source tests must not create a real invoice or print credentials.

## Project-wide boundary

Customer and OrderMieYamin are checkout consumers. Admin and POS are monitoring/reconciliation consumers. Booking and Djiwa Pay retain their dedicated flows in this rollout. Karyawan, Linkbio, Rekrutmen, Web, and Auth Server do not call Mayar directly from browser code.

Use the official V2 docs as schema source:

- https://docs.mayar.id/llms.txt
- https://docs.mayar.id/api-reference-v2/invoice/create.md
- https://docs.mayar.id/api-reference-v2/invoice/detail.md
- https://docs.mayar.id/api-reference-v2/transaction/detail.md
- https://docs.mayar.id/api-reference-v2/qrcode/paymentchannels.md
- https://docs.mayar.id/api-reference-v2/webhook/registerurlhook.md
- https://docs.mayar.id/integration/webhook.md

Updated: 2026-08-23
