# Booking Customer Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align booking's customer authentication handoff and session/profile lookup with `apps/customer` end to end.

**Architecture:** Keep a small booking auth adapter, but use the customer app's canonical login origin and Better Auth/customer API paths. Preserve cookie credentials and the existing booking draft/checkout return flow.

**Tech Stack:** React, TypeScript, Vite, Vitest-compatible test runner via Bun, Better Auth HTTP contract.

**Spec:** `docs/superpowers/specs/2026-10-25-booking-customer-auth-design.md`

## Global Constraints

- Use the central customer auth flow; do not add a second OAuth implementation.
- Auth requests include credentials.
- Return to booking checkout after login.
- Preserve unrelated user changes.

## Review Focus

- Login URL points to the customer app, not the API host.
- Session lookup uses `/api/auth/get-session` and treats an empty session as anonymous.
- Profile lookup uses `/api/customer/profile` and falls back to Better Auth identity fields.
- `returnTo` remains accepted by the customer app allowlist for production and local booking origins.
- Network failures do not leave booking stuck in loading state.

### Task 1: Add auth contract regression tests

**Files:**
- Create: `apps/booking/test/customer-auth.test.ts`

**Interfaces:**
- Tests the exported login URL builder and the mocked fetch contract used by the booking auth adapter.

- [ ] Write tests that assert the customer login origin, `sso=1`, encoded checkout return URL, canonical session path, canonical profile path, credentials, and identity fallback.
- [ ] Run the focused test and verify it fails because the current adapter still uses the API host and `/v1` paths.

### Task 2: Align booking adapter with apps/customer

**Files:**
- Modify: `apps/booking/src/lib/customer-auth.ts`

**Interfaces:**
- Produce `buildBookingLoginUrl(origin?: string): string` for the existing redirect function.
- Keep `useBookingCustomerAuth()` returning `{ isLoading, isAuthenticated, customer }`.

- [ ] Use `https://djiwatentram.yumme.id` as the login origin and `https://api.djiwatentram.web.id` as the API origin, with `VITE_AUTH_URL` as the API override only.
- [ ] Change session/profile paths to `/api/auth/get-session` and `/v1/customer/profile`, matching `apps/customer`.
- [ ] Preserve `credentials: "include"`, profile mapping, and anonymous/error handling.
- [ ] Run the focused test and verify it passes.

### Task 3: Verify the booking app and auth contract

**Files:**
- No additional source files.

- [ ] Run `bun run --filter @yumipos/booking check-types` or the repository-equivalent booking type check.
- [ ] Run the booking build if the environment has the required Supabase variables.
- [ ] Run the focused auth test and the repository test suite available for this workspace.
- [ ] Inspect the final diff and report any pre-existing dirty files separately.
