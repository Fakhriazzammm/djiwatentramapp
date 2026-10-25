# Booking Auth and Mayar Domain Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make booking authentication and Mayar payment use the new `*.djiwatentram.web.id` domain family with one server-authoritative, idempotent payment contract.

**Architecture:** The booking frontend uses `https://djiwatentram.web.id/masuk` and calls the central auth API with credentials. Better Auth keeps both new and legacy origins trusted but uses a host-only API cookie by default. Booking calls `public-booking` with `create-payment`; the Edge Function claims the pending booking, reads persisted customer/item data, creates the Mayar invoice server-to-server, and persists/reuses the invoice through a database RPC.

**Tech Stack:** React/Vite/Bun, Better Auth/Hono, Supabase self-hosted Edge Functions, PostgreSQL/PLpgSQL, Mayar V2.

**Spec:** `docs/superpowers/specs/2026-10-25-booking-auth-payment-domain-design.md`

## Global Constraints

- Canonical customer login origin is `https://djiwatentram.web.id`.
- Canonical booking origin is `https://booking.djiwatentram.web.id`.
- Legacy `.yumme.id` origins remain in trusted-origin/CORS lists during migration.
- Browser code must not send authoritative Mayar item prices; the booking Edge Function reads persisted booking items.
- A browser redirect or provider link is not payment settlement proof; Mayar webhook/processor remains authoritative.
- Automated verification must not create a valid Mayar invoice or payment transaction.
- Existing unrelated dirty files must not be committed: `apps/customer/public/version.json`, `apps/customer/src/lib/version.ts`, `scripts/BUILD_NUMBER`, `apps/customer/node_modules`, `node_modules`.

## Review Focus

- A booking retry with an existing invoice must reuse/attach it without creating a duplicate — covered by payment contract tests and the claim RPC.
- A browser-supplied item price/name must not reach Mayar as authoritative data — covered by the Edge Function invoice payload test.
- A malformed/non-Mayar invoice URL must be rejected — covered by payment URL tests.
- A new-domain login origin must get CORS and a usable host-only session boundary — covered by auth config tests and live CORS smoke tests.
- A failed Mayar call must leave the booking pending and return a controlled error — covered by Edge Function error-path tests and live validation smoke tests.

---

### Task 1: Canonicalize customer auth for the new domain family

**Files:**
- Create: `apps/auth-server/src/customer-auth-config.ts`
- Create: `apps/auth-server/src/customer-auth-config.test.ts`
- Modify: `apps/auth-server/src/auth.ts`
- Modify: `apps/auth-server/src/index.ts`
- Modify: `apps/booking/src/lib/customer-auth.ts`
- Modify: `apps/booking/test/customer-auth.test.ts`
- Modify: `scripts/deploy-vps.sh`

**Interfaces:**
- Produces `customerTrustedOrigins`, `customerAuthBaseUrl`, and `customerAuthAdvancedConfig()` for both Better Auth and Hono CORS.
- `buildBookingLoginUrl()` defaults to `https://djiwatentram.web.id/masuk`.

- [ ] **Step 1: Write failing tests** for the new login origin, new booking/customer origins in the shared auth list, API base URL, and host-only cookie default.
- [ ] **Step 2: Run `bun test apps/auth-server/src/customer-auth-config.test.ts apps/booking/test/customer-auth.test.ts` and verify the new-origin assertions fail.
- [ ] **Step 3: Implement the shared auth config.** Include new `djiwatentram.web.id` origins and legacy `.yumme.id` origins; make `BETTER_AUTH_COOKIE_DOMAIN` optional, defaulting to no cross-subdomain cookie domain; set Better Auth base URL from `BETTER_AUTH_URL` with the API host default; update booking’s login fallback and customer deployment target.
- [ ] **Step 4: Run the focused auth tests plus the existing auth-server contract tests (`bun test apps/auth-server/src/*.test.ts`) and verify pass.
- [ ] **Step 5: Commit** with `fix(auth): align customer session with web domains`.

### Task 2: Add an idempotent server-side booking payment contract

**Files:**
- Create: `supabase/functions/public-booking/payment-url.ts`
- Create: `supabase/functions/public-booking/payment-contract.ts`
- Create: `supabase/functions/public-booking/payment-contract.test.ts`
- Create: `supabase/migrations/20261025000001_booking_server_payment_contract.sql`
- Modify: `supabase/functions/public-booking/index.ts`

**Interfaces:**
- `normalizeMayarPaymentUrl(value: unknown): string | null` accepts only HTTPS Mayar hosts.
- `canonicalBookingReturnUrl(value: unknown, bookingCode: unknown): string | null` accepts only booking status URLs on the new or legacy booking origins.
- `buildBookingInvoicePayload(context, redirectUrl)` returns Mayar payload using persisted context items/customer fields.
- Database RPC `public.prepare_public_booking_payment(text,text,text,text,jsonb)` returns booking payment context, `claimed`, and persisted `paymentGateway`.

- [ ] **Step 1: Write failing pure contract tests** for Mayar URL validation, allowed return URL normalization, authoritative item mapping, and ignoring browser-only item fields.
- [ ] **Step 2: Run `bun test supabase/functions/public-booking/payment-contract.test.ts` and verify it fails because the helpers do not exist.
- [ ] **Step 3: Implement the pure helpers and the migration.** Add payment claim columns, lock the booking row, reuse an existing invoice, reject expired/cancelled bookings, reserve a short claim window, and persist only validated Mayar gateway metadata.
- [ ] **Step 4: Implement `create-payment` in `public-booking`.** Load the booking context via the RPC, reuse a stored gateway, call `mayar-proxy` server-to-server with database-owned items/customer data, then persist the returned invoice using the same RPC. Keep `attach-payment` as a compatibility alias that requires a validated stored gateway; return controlled `PAYMENT_IN_PROGRESS`, `PAYMENT_CREATE_FAILED`, and `PAYMENT_ATTACH_FAILED` errors.
- [ ] **Step 5: Run the payment contract tests and static Deno/source checks; verify pass.**
- [ ] **Step 6: Commit** with `fix(booking): make Mayar payment server authoritative`.

### Task 3: Switch the booking frontend to the canonical payment action

**Files:**
- Create: `apps/booking/test/booking-payment-contract.test.ts`
- Modify: `apps/booking/src/lib/client.ts`
- Modify: `apps/booking/src/main.tsx`
- Modify: `apps/booking/test/checkout-standard.test.ts`

**Interfaces:**
- `callBookingApi` supports `create-payment` and `attach-payment`.
- `createBookingPayment(booking, draft)` calls `create-payment` with booking code, guest access token, and canonical status redirect; it does not call Mayar directly from browser code.

- [ ] **Step 1: Write failing source-contract tests** asserting browser code has no direct `create-invoice` call, uses `create-payment`, preserves pending invoice recovery, and prevents duplicate submit clicks.
- [ ] **Step 2: Run the focused booking tests and verify the new assertions fail.**
- [ ] **Step 3: Replace browser-side Mayar invoice creation with `public-booking create-payment`; retain sessionStorage recovery by passing stored invoice metadata through the compatibility path; add a submit lock and auth-loading/error guard in checkout submission.
- [ ] **Step 4: Run all booking tests and booking typecheck; verify pass.
- [ ] **Step 5: Commit** with `fix(booking): use canonical server payment flow`.

### Task 4: Deploy database/function/auth/frontend changes safely

**Files:**
- Modify: `scripts/deploy-functions-selfhost.sh` only if required to sync nested payment helper files.
- Modify: `scripts/deploy-vps.sh` only if required by Task 1’s domain target.

- [ ] **Step 1: Apply the new migration to the self-hosted PostgreSQL database using the existing migration/deploy mechanism; verify the RPC exists and no existing booking rows are changed.
- [ ] **Step 2: Sync `public-booking` and its helper files to `/opt/supabase-selfhost/volumes/functions/public-booking`, restart only the Edge Function runtime, and verify function health/negative validation.
- [ ] **Step 3: Build and deploy auth-server with the new origin/cookie configuration, restart the service, and verify auth CORS/session responses from `booking.djiwatentram.web.id`.
- [ ] **Step 4: Build and deploy `apps/booking` with production public variables, reload Nginx, and verify the live version, service worker, manifest, and image asset.
- [ ] **Step 5: Commit** deployment-script/config changes with `chore(deploy): align booking web domain runtime`.

### Task 5: Full verification and handoff

**Files:**
- No production code changes expected.

- [ ] **Step 1: Run booking tests, auth tests, payment contract tests, checkout-standard verification, booking typecheck, and production build.
- [ ] **Step 2: Run live smoke checks for booking HTML/version, new-domain auth CORS/session/profile, booking create/status negative paths, Mayar channels, webhook/processor health, catalog counts, and every product image.
- [ ] **Step 3: Confirm `git diff --check`, inspect the final diff, and confirm unrelated dirty files remain untouched.
- [ ] **Step 4: Push the branch and deploy the verified commit to the VPS; record the live commit/version and any remaining limitation that real Mayar settlement requires a manual transaction.
