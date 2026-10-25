# Booking customer existing-flow DoD

## Diagnosis
- Customer entry: `apps/booking/src/main.tsx` → `useBookingCustomerAuth()` → auth session + customer profile → checkout submit.
- Existing customer session source is the canonical Better Auth API host used by `apps/customer` (`https://auth.zantara.id/api/auth`).
- Existing customer profile source is `https://djiwatentram.yumme.id/api/customer/profile`.
- Booking currently requests profile from `https://api.yumme.id/v1/customer/profile`, which is not the current customer app contract; the hook catches the failure and marks an already-authenticated customer as unauthenticated, forcing a login redirect at checkout.

## Role matrix
| Role | See | May do | Must not access | Source of truth |
|---|---|---|---|---|
| Customer | Public booking settings/options, availability, own draft/status | Select date/menu, submit own booking, view own status with guest credentials | Other customers' PII/bookings, admin settings/secrets | Public booking settings/capacity/products + public-booking function |
| Admin/operator | Booking entities, operational status/capacity, public booking configuration | Manage booking/capacity/settings per existing admin authorization | Customer auth secrets and unrelated private data | Same booking tables/views/functions |

Status/payment boundary: create remains pending until provider settlement; this task does not create production orders, invoices, notifications, migrations, or deployment.

## Minimal repair scope
1. Align booking's customer profile endpoint with the existing customer app contract.
2. Add a focused regression test only if the existing test harness supports it without new dependencies.

## Acceptance
- Existing authenticated customer is recognized by booking and can reach submit path without an immediate login redirect.
- Public settings/options/capacity/products path remains DB-driven and unchanged.
- No payment/production mutation is exercised in QA.
- Booking app typecheck/build pass; `git diff --check` pass; preview evidence includes built artifact and local customer-flow runtime evidence where possible.
- No production deploy before Zantara release gate.
