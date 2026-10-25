# Booking Customer Auth Design

## Intent

Make `apps/booking` use the same customer authentication system and journey as `apps/customer`: the central Better Auth session, the central customer profile endpoint, the customer app's Google login page, and a safe return to booking checkout.

## Goals

- Detect the shared Better Auth session from booking through the canonical `/api/auth/get-session` endpoint.
- Load the identity-bound customer profile through the same `/v1/customer/profile` endpoint used by `apps/customer`.
- Redirect unauthenticated users to `https://djiwatentram.yumme.id/masuk` with the existing `sso=1` and `returnTo` contract.
- Preserve the booking draft while the user completes Google login and returns to `/?step=checkout`.
- Add regression tests for URL construction and the session/profile contract.

## Non-goals

- Do not create a second Google OAuth implementation in booking.
- Do not change Better Auth server configuration or the customer app's login UI.
- Do not change booking creation or payment authorization beyond ensuring the authenticated customer source ID is used.

## Approach

The selected approach is a minimal booking-side adapter aligned to the existing `apps/customer` contract. A new shared package is not introduced because the customer app already owns the login UI and the server contract is stable; duplicating only the small read/redirect adapter keeps this fix scoped while tests pin the shared values.

## Constraints

- Auth requests must include credentials so the `.yumme.id` session cookie is sent.
- The return URL must be the current booking origin with `?step=checkout` and must be accepted by the customer app's existing return URL allowlist.
- Existing user changes in the worktree must be preserved.
