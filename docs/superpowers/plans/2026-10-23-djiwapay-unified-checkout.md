# Djiwa Pay Unified Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every active Djiwa Pay checkout flow use the Customer checkout visual contract while preserving Djiwa Pay-specific top-up and PPOB business logic.

**Architecture:** Keep service-specific business operations in `apps/djiwapay/src/lib/wallet-adapter.ts`. Introduce a small checkout presentation model and shared Djiwa Pay checkout surface that renders the same step/header/payment/summary/action patterns as Customer, with service adapters supplying fields and submit behavior. Reuse existing shared checkout primitives and CSS rather than copying restaurant fields or payment rules.

**Tech Stack:** React 19, TypeScript, Vite, shared `@yumipos/djiwa-checkout-ui`, Bun tests, existing Pay Bridge and Mayar APIs.

**Spec:** `docs/superpowers/specs/2026-10-23-djiwapay-release-hardening-design.md`

## Global Constraints

- Djiwa Pay remains the canonical wallet/PPOB owner; Customer remains a launcher.
- Browser query parameters are navigation context only and never authority.
- Authenticated profile and wallet identity come from the server-backed session.
- Do not add restaurant-only fields such as table number, delivery, dessert, service charge, or PBJT to Djiwa Pay checkout.
- Do not implement placeholder actions without backend support.
- Do not change Supabase schema unless a verified data-contract mismatch requires it.

## Review Focus

- A back-navigation or refresh during a top-up/PPOB flow must preserve or safely reset the selected service without double charging.
- Insufficient wallet balance must block wallet payment while offering a clear top-up path.
- Provider pending, success, and failure must render distinct user-visible states and allow safe retry.
- Unauthenticated or mismatched wallet access must fail closed.
- The same visual surface must remain usable at narrow mobile widths and with reduced motion.

---

## Task 1: Establish Djiwa Pay checkout contract and failing tests

- [ ] Map current Djiwa Pay routes, adapter operations, and shared checkout exports.
- [ ] Add focused tests for a generic Djiwa Pay checkout model covering top-up and PPOB steps, payment options, and status mapping.
- [ ] Run the focused tests and confirm they fail for the missing contract behavior.
- [ ] Commit the tests and contract scaffolding.

## Task 2: Implement the shared visual checkout surface

- [ ] Implement the minimal presentation model and renderer for service detail, payment selection, summary, and action bar.
- [ ] Reuse `CheckoutHeader`, `PaymentMethodCard`, `OrderSummary`, `CheckoutActionBar`, and shared styles.
- [ ] Keep service-specific fields injected as slots so top-up and PPOB can differ without restaurant semantics.
- [ ] Add loading, error, disabled, insufficient-balance, pending, success, and failed states.
- [ ] Run the focused tests and Djiwa Pay/core/UI typechecks.
- [ ] Commit the implementation.

## Task 3: Wire top-up and PPOB business adapters

- [ ] Map top-up to Mayar invoice creation and persisted pending state.
- [ ] Map PPOB catalog selection, customer number validation, wallet purchase, and QRIS invoice creation to the shared checkout surface.
- [ ] Preserve idempotency and distinguish provider success/pending/failure.
- [ ] Add regression tests for validation, insufficient balance, and safe retry.
- [ ] Run focused tests and the Djiwa Pay production build.
- [ ] Commit the integration.

## Task 4: Validate the workspace release path

- [ ] Run checkout-standard verification.
- [ ] Run Customer, Merchandise, and B2B typechecks.
- [ ] Run the Djiwa Pay build and inspect generated asset output.
- [ ] Record pre-existing failures separately from regressions.
- [ ] Perform a final diff review against the spec and commit range.

---

