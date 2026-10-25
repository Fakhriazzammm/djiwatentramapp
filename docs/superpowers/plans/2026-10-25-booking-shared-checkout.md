# Booking Shared Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adopt the shared customer checkout UI and canonical QRIS/Mayar payment semantics in booking without changing the booking domain backend.

**Architecture:** Register booking in the checkout standard and compose `CustomerCheckout` with booking-specific fields and summary content. Keep `createBooking`/`createBookingPayment` as the domain adapter, but explicitly send `qris` and preserve invoice reuse/attachment/status recovery.

**Tech Stack:** React, TypeScript, Vite, Bun tests, `@yumipos/djiwa-checkout-ui`, Supabase Edge Functions.

**Spec:** `docs/superpowers/specs/2026-10-25-booking-shared-checkout-design.md`

## Global Constraints

- Booking uses `@yumipos/djiwa-checkout-ui` and imports its styles.
- Booking remains a `booking_orders` flow; no duplicate `pos.orders` record is introduced.
- Payment requests use `paymentMethod: "qris"`.
- Existing idempotent invoice reuse and payment attachment remain intact.

## Review Focus

- Registry/package/wiring: booking passes the checkout-standard guard.
- Required customer and custom fields remain validated before submit.
- The shared primary action preserves submitting/error behavior.
- Mayar invoice requests identify QRIS and keep the booking status redirect.
- Existing pending invoices are reused and reattached rather than duplicated.

### Task 1: Pin shared checkout and payment wiring

**Files:**
- Create: `apps/booking/test/checkout-standard.test.ts`

- [ ] Assert booking is registered, depends on the shared checkout package, imports shared styles, and uses `CustomerCheckout` in its checkout surface.
- [ ] Assert booking sends the canonical `qris` payment method to both booking creation and Mayar invoice creation.
- [ ] Run the focused test and verify it fails against the current custom checkout implementation.

### Task 2: Replace booking checkout UI with the shared surface

**Files:**
- Modify: `apps/booking/package.json`
- Modify: `apps/booking/src/index.css`
- Modify: `apps/booking/src/main.tsx`
- Create: `apps/booking/src/components/checkout-section.tsx`
- Modify: `config/djiwa-checkout-apps.json`

**Interfaces:**
- `CheckoutSection` consumes booking draft/customer/custom-field state and `onNext`.
- It renders `CustomerCheckout` with the single `mayar` payment option and booking-specific field slots.

- [ ] Add the workspace dependency and register booking.
- [ ] Import shared styles/Tailwind contract and implement the shared checkout composition.
- [ ] Replace the old custom checkout render with `CheckoutSection` while preserving booking navigation and validation.
- [ ] Run the focused wiring test and checkout-standard guard.

### Task 3: Align payment request semantics

**Files:**
- Modify: `apps/booking/src/lib/client.ts`

- [ ] Include `paymentMethod: "qris"` in the booking create payload.
- [ ] Include `paymentMethod: "qris"` in the shared Mayar proxy invoice request.
- [ ] Preserve idempotency, pending invoice recovery, attach-payment, redirect, and status lookup.
- [ ] Run focused tests, booking typecheck, checkout guard, and production build.
