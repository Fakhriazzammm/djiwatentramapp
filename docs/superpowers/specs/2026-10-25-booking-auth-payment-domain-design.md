# Booking Auth and Mayar Domain Alignment Design

## Intent

Make `apps/booking` production-ready on the new `*.djiwatentram.web.id` domain family. The login redirect, Better Auth cookies/CORS, booking Edge Function contract, and Mayar payment flow must use one coherent runtime contract.

## Current root causes

- Booking defaults its login redirect to the retired/unreachable `https://djiwatentram.yumme.id` host.
- The auth server allows legacy `.yumme.id` origins and sets a `.yumme.id` cross-subdomain cookie, which cannot authenticate the new `*.djiwatentram.web.id` frontends.
- The checked-out `public-booking` source attaches browser-created Mayar invoices, while the live Edge Function has a newer `create-payment` contract. This makes source, bundle, and runtime behavior drift.
- Booking should use authoritative booking item data from the database when creating a Mayar invoice, as the customer checkout does for `create-invoice-from-order`.

## Goals

- Use `https://djiwatentram.web.id` as the canonical customer login origin and `https://booking.djiwatentram.web.id` as the canonical booking origin.
- Keep legacy `.yumme.id` origins in the auth allowlist during migration, while using a host-only auth cookie on the central API so both domain families can request the shared session endpoint.
- Add explicit new-domain trusted origins and CORS coverage to customer auth/profile APIs.
- Make `public-booking` accept one canonical `create-payment` action, keep `attach-payment` as a safe retry/compatibility alias, and create invoices from server-validated booking status/items.
- Preserve idempotent invoice recovery and Mayar webhook settlement; never treat a browser redirect as payment proof.
- Deploy the auth server, booking Edge Function, database contract, and booking frontend consistently to the VPS.

## Non-goals

- Do not change the Mayar merchant account, credentials, webhook registration, or payment channel configuration.
- Do not perform a real invoice creation or payment during automated verification.
- Do not remove legacy `.yumme.id` support in this change.
- Do not rewrite unrelated customer, POS, or admin business logic.

## Approaches considered

1. Restore the old `.yumme.id` hosts and keep the current auth model. This minimizes code changes but depends on DNS/hosting that is currently unavailable and leaves the new domain migration incomplete.
2. Switch booking only to a new login URL while leaving Better Auth cookies and server origins unchanged. This fixes the visible redirect but cannot reliably share the session across the new API/frontend domains.
3. Migrate the canonical auth/payment contract to the new domain family while retaining legacy origins and compatibility actions. This is the selected approach because it fixes the deployed runtime boundary and preserves existing clients during transition.

## Selected architecture

- Customer login URL: `https://djiwatentram.web.id/masuk`.
- Booking URL: `https://booking.djiwatentram.web.id`.
- Auth API: `https://api.djiwatentram.web.id`.
- Supabase/Edge Functions: `https://supabase.djiwatentram.web.id`.
- Better Auth customer cookie: host-only on the central auth API; `credentials: include` remains required. Trusted origins include both new and legacy customer app origins.
- Booking payment: browser calls `public-booking` `create-payment`; the Edge Function loads the booking using the guest token, uses authoritative persisted item/price/customer data, calls `mayar-proxy` server-to-server, persists the invoice through the booking payment RPC, and returns only the validated Mayar link. A supplied stored invoice is handled through the attach/recovery path.

## Verification contract

- Unit tests cover new-domain login URL, auth origin/cookie configuration, payment action compatibility, Mayar URL validation, and server-side item sourcing.
- Production smoke tests cover booking HTML/version, auth CORS/session behavior, booking negative validation/status, Mayar payment channels, webhook/processor health, and all catalog image URLs.
- No test creates a valid Mayar invoice or mutates a booking; real payment settlement requires a controlled manual test transaction.
