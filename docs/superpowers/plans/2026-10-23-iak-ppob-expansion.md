# IAK PPOB Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-owned IAK v2 adapter and inquiry-first postpaid PPOB flow for PLN and PDAM, with a reusable service contract for the remaining IAK categories and wallet settlement that never charges on a provider process response.

**Architecture:** Keep the browser behind the existing auth-server pay bridge. The bridge owns customer/session checks and wallet holds; the Supabase `iak-ppob` Edge Function owns IAK credentials, signing, provider calls, callback verification, and normalized responses. A migration extends `pos.ppob_transactions` with postpaid/inquiry/hold metadata while retaining the legacy prepaid columns and callback compatibility.

**Tech Stack:** TypeScript, Bun tests, Hono auth-server, Supabase Edge Functions/Deno, PostgreSQL migrations/RPC, React/Vite Djiwa Pay, existing wallet hold functions.

**Spec:** `docs/superpowers/specs/2026-10-23-iak-ppob-expansion-design.md`

## Global Constraints

- No direct IAK calls from the browser.
- Provider credentials remain in Supabase Edge Function secrets only.
- `PROCESS`/pending is never treated as settled success.
- Wallet holds are captured only after provider success and released only on definitive failure/expiry.
- Existing prepaid tests, routes, Mayar top-up behavior, and legacy callback columns must remain compatible.
- Production activation requires IAK production credentials, callback configuration, and IP allowlisting; code deployment alone must not enable real transactions.

## Review Focus

- Repeated payment/callback with the same `ref_id` must not double-charge or double-release; covered in Tasks 2–4 idempotency tests.
- Provider timeout after a wallet hold must remain pending with the hold intact; covered in Tasks 3–4 timeout tests.
- A forged callback signature must not mutate a transaction; covered in Task 3 callback tests.
- A changed postpaid amount between inquiry and payment must be rejected before creating a hold; covered in Task 4 payment tests.
- Missing IAK secrets or unknown service types must return a safe unavailable/validation response without a provider call; covered in Tasks 1 and 3.

### Task 1: Define and test the IAK v2 normalization boundary

**Files:**
- Create: `supabase/functions/iak-ppob/adapter.ts`
- Test: `supabase/functions/iak-ppob/adapter.test.ts`
- Modify: `supabase/functions/iak-ppob/index.ts`

**Interfaces:**
- Produces `IakServiceKind`, `IakServiceType`, `IakNormalizedProduct`, `IakInquiry`, `IakTransactionResult`, `buildSignature(username, apiKey, refId)`, `normalizePrepaidProduct(payload)`, `normalizePostpaidProduct(payload)`, `normalizeProviderStatus(value)`, `buildPrepaidRequest(operation, input)`, `buildPostpaidInquiryRequest(input)`, `buildPostpaidPaymentRequest(input)`, and `buildCheckStatusRequest(input)`.
- Consumes no database or browser code; keep the adapter pure except for the injected HTTP request function.

- [ ] **Step 1: Write the failing adapter tests.** Add tests for MD5 signatures, prepaid v2 field mapping, postpaid product mapping, `00`/`0`/`1`/`2` status normalization, unknown service rejection, and redaction helpers.
- [ ] **Step 2: Run the adapter tests and verify they fail for missing exports or incorrect mappings.** Run `bun test supabase/functions/iak-ppob/adapter.test.ts`; expected: FAIL because the adapter module does not yet exist.
- [ ] **Step 3: Implement the pure adapter.** Keep IAK v2 request paths and body construction in this module; do not put service-specific request branching in React or auth-server.
- [ ] **Step 4: Run the adapter tests and verify they pass.** Run the same command; expected: all adapter tests pass with no network calls.
- [ ] **Step 5: Wire the Edge Function to use the adapter without changing its public response envelope.** Preserve the existing `callback` route and legacy `price-list`/`top-up` action compatibility while routing new `kind` actions through the adapter.
- [ ] **Step 6: Commit the isolated adapter change.**

### Task 2: Extend PPOB transaction persistence and wallet settlement metadata

**Files:**
- Create: `supabase/migrations/20261023000001_iak_ppob_postpaid_foundation.sql`
- Test: `supabase/migrations/20261023000001_iak_ppob_postpaid_foundation.test.sql`
- Reference: `supabase/migrations/20261022000001_ppob_transactions.sql`, `supabase/migrations/20260822000001_customer_wallet_foundation.sql`

**Interfaces:**
- Produces additive columns/indexes on `pos.ppob_transactions` and a stable transaction update/settlement contract used by the Edge Function.
- Consumes existing `pos.wallet_create_hold(text,text,bigint,text)`, `pos.wallet_capture_hold(text,text)`, and `pos.wallet_release_hold(text,text,text)` without changing their signatures.

- [ ] **Step 1: Write SQL assertions for the additive schema and invariants.** Assert columns for `service_kind`, `service_type`, `customer_source_id`, `customer_number`, `inquiry_payload`, `bill_amount`, `admin_fee`, `total_amount`, `wallet_hold_id`, `payment_status`, `provider_status`, `provider_updated_at`, and `last_error_code`; assert indexes and allowed payment statuses.
- [ ] **Step 2: Run the SQL test against an isolated database or transaction and verify it fails because the columns do not exist.** Use the repository Supabase/Postgres test workflow; expected: missing-column failures.
- [ ] **Step 3: Implement the additive migration.** Preserve existing status values and rows, add nullable columns/defaults where needed, add indexes for customer/ref/pending status, and grant only service-role access.
- [ ] **Step 4: Add idempotent update helpers only if the existing schema requires them.** Any helper must reject conflicting `ref_id` payloads and never capture/release a hold based only on `PROCESS`.
- [ ] **Step 5: Re-run the SQL assertions and verify they pass.** Include a rollback-safe check that duplicate settlement calls leave one final wallet state.
- [ ] **Step 6: Commit the migration and SQL tests.**

### Task 3: Implement IAK Edge Function actions, callback validation, and reconciliation state

**Files:**
- Modify: `supabase/functions/iak-ppob/index.ts`
- Modify: `supabase/functions/iak-ppob/adapter.ts`
- Test: `supabase/functions/iak-ppob/index.test.ts`
- Test fixtures: `supabase/functions/iak-ppob/fixtures/*.json`

**Interfaces:**
- Consumes Task 1 adapter and Task 2 schema.
- Produces POST actions `price-list`, `inquiry`, `top-up`, `payment`, and `check-status` with `{ success, data, error }` responses; callback remains POST `/callback` and accepts both wrapped `{data}` and direct payloads.

- [ ] **Step 1: Write failing handler tests using injected fetch/provider fixtures.** Cover missing secrets, prepaid v2 price list/top-up/status, PLN/PDAM inquiry, postpaid payment, pending/failed/success mapping, callback signature rejection, duplicate callback, and provider timeout.
- [ ] **Step 2: Run the handler tests and verify expected failures.** Run `bun test supabase/functions/iak-ppob/index.test.ts`; expected: missing action handlers and state transitions fail.
- [ ] **Step 3: Implement action validation and provider calls.** Validate `kind`, service type, product code, customer number, ref id, and stored inquiry total; use the adapter to sign requests and normalize payloads.
- [ ] **Step 4: Implement callback upsert and safe reconciliation.** Verify `md5(username + apiKey + refId)` before mutation, upsert by `ref_id`, preserve serial/PIN/activation fields in server-side payload, and settle/release an existing hold only for definitive success/failure.
- [ ] **Step 5: Implement check-status recovery.** A timeout or `PROCESS` updates provider state and leaves the hold pending; a later success/failure performs the idempotent capture/release path.
- [ ] **Step 6: Re-run handler tests and verify all pass.**
- [ ] **Step 7: Commit the Edge Function implementation.**

### Task 4: Add authenticated postpaid pay-bridge routes

**Files:**
- Modify: `apps/auth-server/src/index.ts`
- Test: `apps/auth-server/src/ppob-bridge.test.ts`
- Reference: existing `/api/pay-bridge/ppob/invoice`, `/api/pay-bridge/ppob/status`, and `/api/pay-bridge/ppob/purchase` handlers

**Interfaces:**
- Produces `POST /api/pay-bridge/ppob/postpaid/inquiry`, `POST /api/pay-bridge/ppob/postpaid/payment`, and `POST /api/pay-bridge/ppob/postpaid/status`.
- Inquiry input: `{ serviceType, productCode, customerNumber }`; response: safe `refId`, customer display name, billing period, bill amount, admin fee, total, and provider status.
- Payment input: `{ refId, paymentMethod: "wallet" }`; server reloads the stored inquiry and never trusts a browser-supplied amount.
- Status input: `{ refId }`; response includes only safe transaction state and receipt fields.

- [ ] **Step 1: Write failing bridge tests.** Cover unauthenticated `401`, malformed number `400`, unknown product, inquiry success, amount mismatch rejection, insufficient balance without provider call, provider pending, provider success capture, provider failure release, and duplicate payment idempotency.
- [ ] **Step 2: Run the bridge tests and verify failures.** Run `bun test apps/auth-server/src/ppob-bridge.test.ts`; expected: routes are not defined.
- [ ] **Step 3: Implement inquiry route.** Require pay session, create deterministic ref id, call Edge Function inquiry, persist normalized inquiry, and return redacted display data without creating a wallet hold.
- [ ] **Step 4: Implement wallet payment route.** Load the stored inquiry by ref id/customer, create the wallet hold with a deterministic key, call Edge Function payment, then capture/release/leave pending according to normalized provider state.
- [ ] **Step 5: Implement status route and safe response mapping.** Never return raw payloads or full sensitive customer data.
- [ ] **Step 6: Re-run bridge tests and verify they pass.**
- [ ] **Step 7: Compile the auth server and commit the bridge change.** Run `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck apps/auth-server/src/index.ts`.

### Task 5: Add Djiwa Pay postpaid inquiry-first checkout for PLN and PDAM

**Files:**
- Modify: `apps/djiwapay/src/lib/wallet-adapter.ts`
- Create: `apps/djiwapay/src/lib/djiwa-pay-postpaid.ts`
- Modify: `apps/djiwapay/src/features/wallet/djiwa-pay-screen.tsx`
- Modify: `apps/djiwapay/src/lib/djiwa-pay-routes.ts`
- Test: `apps/djiwapay/test/djiwa-pay-postpaid.test.ts`

**Interfaces:**
- Produces `readPostpaidCatalog(serviceType)`, `inquirePostpaid(serviceType, productCode, customerNumber)`, `payPostpaid(refId)`, and `checkPostpaidStatus(refId)` adapters.
- Produces UI states `detail`, `inquiry`, `confirmation`, `pending`, `success`, and `failed`; existing prepaid routes remain unchanged.

- [ ] **Step 1: Write failing pure flow tests.** Assert customer number validation for PLN/PDAM, route parsing/restoration, inquiry response normalization, total display, payment method selection, pending behavior, and success-only receipt rendering.
- [ ] **Step 2: Run the tests and verify they fail because the postpaid flow contract is missing.** Run `bun test apps/djiwapay/test/djiwa-pay-postpaid.test.ts`.
- [ ] **Step 3: Implement the frontend adapter and pure postpaid flow helpers.** Keep all provider calls in `wallet-adapter.ts`; retain drafts in session storage for reload/back navigation.
- [ ] **Step 4: Implement the PLN/PDAM UI using the existing checkout card/spacing system.** Require the customer number before inquiry, show inquiry identity and bill breakdown, disable payment until inquiry is valid, and show a clear pending state without claiming success.
- [ ] **Step 5: Add service definitions for BPJS, TV, multifinance, internet, gas, PBB, tax, insurance, and employment BPJS as catalog-ready mappings.** Do not expose a category as payable until its provider contract/test fixture is enabled.
- [ ] **Step 6: Re-run frontend tests, typecheck, and build.** Run `bun test apps/djiwapay/test/djiwa-pay-postpaid.test.ts apps/djiwapay/test/djiwa-pay-checkout.test.ts apps/djiwapay/test/djiwa-pay-routes.test.ts`, `bun run --cwd apps/djiwapay check-types`, and `bun run --cwd apps/djiwapay build`.
- [ ] **Step 7: Commit the customer flow.**

### Task 6: Sandbox rollout, verification, release, and deployment

**Files:**
- Modify: `docs/DEPLOYMENT_VPS_WORKFLOW.md`
- Modify: `docs/superpowers/specs/2026-10-23-iak-ppob-expansion-design.md` only if implementation decisions materially change
- Reference: `supabase/functions/iak-ppob`, `apps/auth-server`, `apps/djiwapay`

**Interfaces:**
- Consumes all prior tasks and project deployment workflow.
- Produces a verified release on `main` and the VPS, with production transactions disabled unless IAK secrets/allowlist are confirmed.

- [ ] **Step 1: Run the full verification suite.** Run all Djiwa Pay tests, Edge Function adapter/handler tests, auth-server typecheck, frontend typecheck/build, `git diff --check`, and checkout standard verification.
- [ ] **Step 2: Verify the migration in Supabase/Postgres.** Check columns/indexes/functions and run rollback-safe idempotency assertions; do not use real provider money in tests.
- [ ] **Step 3: Verify sandbox configuration.** Confirm secret names and callback/IP allowlist requirements without printing secret values; if production credentials are absent, keep feature flags disabled and record the safe unavailable behavior.
- [ ] **Step 4: Create a clean release worktree from `origin/main`, merge the feature branch with `--no-ff`, rerun release verification, and push `HEAD:main`.** Preserve unrelated dirty changes in the root checkout.
- [ ] **Step 5: Build the release artifact, back up `/opt/djiwatentramapp/apps/djiwapay/dist`, rsync the artifact, validate/reload Nginx, and restart auth only if the backend source changed.**
- [ ] **Step 6: Smoke test frontend `200`, unauthenticated bridge `401`, safe missing-secret/provider responses, live bundle markers, service health, and database migration state.**
- [ ] **Step 7: Commit/release evidence and remove the temporary release worktree.**

## Execution Notes

- Implement tasks in order because Tasks 3–5 depend on the contracts and schema from earlier tasks.
- Keep commits small and task-scoped so a failed provider fixture or migration can be reverted independently.
- Use sandbox fixtures and local database transactions; never spend production balance during verification.
- If IAK production credentials, callback URL, or IP allowlist are unavailable, complete code and sandbox verification but report production activation as blocked rather than simulating success.
