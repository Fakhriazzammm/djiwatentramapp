# Booking Shared Checkout Design

## Intent

Make `apps/booking` use the same customer-facing checkout surface and payment contract as `apps/customer`, so users see one checkout language and the payment provider receives the same QRIS/Mayar semantics.

## Goals

- Register booking in the Djiwa Checkout Standard.
- Render booking checkout with `@yumipos/djiwa-checkout-ui` instead of booking-specific payment cards, summary, and action bar.
- Keep booking-specific fields and booking RPCs as app-owned adapters.
- Send the canonical `qris` payment method and preserve existing booking idempotency, invoice reuse, payment attachment, redirect, and status lookup.
- Keep the booking domain record in `pos.booking_orders`; do not create a duplicate `pos.orders` record only to reuse customer checkout internals.

## Non-goals

- Do not add wallet/cashier payment choices until the booking backend has an explicit wallet/cashier settlement contract for `booking_orders`.
- Do not move booking creation into the customer order RPC.
- Do not change Mayar provider credentials or webhook reconciliation.

## Approaches

1. Keep the booking checkout UI and only change labels — rejected because it leaves a second checkout system.
2. Convert booking into a customer `pos.orders` record — rejected because it duplicates or risks losing booking capacity/arrival/payment invariants.
3. Use the shared checkout UI with a thin booking payment adapter — selected because it gives one user-facing flow and provider contract while preserving the booking domain boundary.

## Flow

Booking collects the same checkout fields and displays the shared summary/action/payment surface. The single available payment choice is QRIS/Mayar. On submit, booking creates its validated `booking_orders` record, creates/reuses one Mayar invoice through `mayar-proxy`, attaches the gateway metadata through `public-booking`, and redirects to the booking status page. Existing pending invoice recovery remains idempotent.

## Constraints

- Shared checkout styles and components are required; booking-specific CSS must not implement a parallel payment method or action bar.
- Payment requests must use `paymentMethod: "qris"`.
- Existing user changes in the worktree must be preserved.
