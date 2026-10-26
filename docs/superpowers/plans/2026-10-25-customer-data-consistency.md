# Customer Data Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/customer` load every customer-owned profile, order, transaction, receipt, payment/wallet, and push-notification record through the correct Djiwa customer API without losing existing fields.

**Architecture:** Add a small customer API boundary for member and guest order reads and push writes. Keep response normalization in a pure order mapper, reuse the boundary from the customer data hooks and receipt polling, and leave wallet mutations/reads on the existing ownership-checked `customer-wallet` edge function.

**Tech Stack:** React 19, TypeScript, Vite, TanStack Router, Supabase client for realtime/public data, Better Auth cookies, Bun tests.

**Spec:** `docs/superpowers/specs/2026-10-25-customer-data-consistency-design.md`

## Global Constraints

- Customer API origin is `https://api.djiwatentram.web.id/v1/customer`.
- Member requests use `credentials: "include"` and `/orders`.
- Guest requests use `/guest-orders` with `{ orderId, accessToken }` references.
- Direct Supabase reads are not the source of truth for customer-owned order or payment detail.
- Existing response field shapes (camelCase and snake_case) remain supported.
- No customer, order, wallet, ledger, or payment data is deleted or mutated by this change.

## Review Focus

- A member with an existing order must receive all authorized orders from `/orders`, including payment and tracking metadata — test in Task 2.
- A guest receipt must include its access token and must not fall back to an unauthenticated order lookup — test in Task 3.
- Legacy snake_case and current camelCase order payloads must map to the same customer-visible fields — test in Task 1.
- A failed API response must remain an error instead of silently becoming an empty customer history — test in Task 2.
- Push subscribe/unsubscribe must use the same Djiwa customer origin and credentials — test in Task 3.

---

### Task 1: Add the customer API boundary and compatible order mapper

**Files:**
- Create: `apps/customer/src/lib/customer-api.ts`
- Create: `apps/customer/src/lib/customer-order.ts`
- Test: `apps/customer/src/lib/customer-order.test.ts`
- Test: `apps/customer/src/lib/customer-api.test.ts`

**Interfaces:**
- `customer-api.ts` produces `CUSTOMER_API_BASE`, `CustomerOrderReference`, `fetchMemberOrders(signal?)`, `fetchGuestOrders(references, signal?)`, `fetchCustomerOrderById(id, references, signal?)`, `subscribeCustomerPush(payload, signal?)`, and `unsubscribeCustomerPush(endpoint, signal?)`.
- `customer-order.ts` produces `CustomerOrder`, `CustomerOrderItem`, and `mapCustomerOrder(row)` for downstream hooks and receipt rendering.

- [ ] **Step 1: Write the failing mapper tests**

  Add tests named `maps camelCase and snake_case order fields without dropping payment metadata` and `maps tracking, delivery, and item fields from an API row`. Assert order id, number, totals, payment method/receipt, delivery fields, tracking fields, and item values.

- [ ] **Step 2: Run the mapper tests to verify they fail**

  Run: `bun test apps/customer/src/lib/customer-order.test.ts`

  Expected: FAIL because the new mapper module is not defined.

- [ ] **Step 3: Implement `mapCustomerOrder(row)` and the shared order types**

  Normalize both camelCase and snake_case names, preserve the existing tracking fields, and add source/sourceApp/businessUnit/brandSlug/platform/dailyReceiptNo plus delivery metadata needed by history and receipts.

- [ ] **Step 4: Run the mapper tests to verify they pass**

  Run: `bun test apps/customer/src/lib/customer-order.test.ts`

  Expected: PASS.

- [ ] **Step 5: Write the failing API request tests**

  Add tests named `builds an authenticated member orders request`, `builds a token-bound guest orders request`, `selects the authorized order detail from member results`, and `uses the Djiwa origin for push requests`. Mock `fetch` only at the network boundary and assert URL, method, credentials, headers, and guest request body.

- [ ] **Step 6: Run the API tests to verify they fail**

  Run: `bun test apps/customer/src/lib/customer-api.test.ts`

  Expected: FAIL because the API boundary is not defined.

- [ ] **Step 7: Implement the API boundary**

  Use one base URL, parse `{ success, orders }`, throw on non-OK responses, send member requests to `/orders`, send token-bound guest requests to `/guest-orders`, select member detail by `_id`/`source_id`/`id`, and route push subscribe/unsubscribe to the same origin.

- [ ] **Step 8: Run both new test files**

  Run: `bun test apps/customer/src/lib/customer-order.test.ts apps/customer/src/lib/customer-api.test.ts`

  Expected: PASS.

- [ ] **Step 9: Commit the task**

  ```bash
  git add apps/customer/src/lib/customer-api.ts apps/customer/src/lib/customer-api.test.ts apps/customer/src/lib/customer-order.ts apps/customer/src/lib/customer-order.test.ts
  git commit -m "feat(customer): add authorized customer data boundary"
  ```

### Task 2: Make history, home, notifications, and live order data use the boundary

**Files:**
- Modify: `apps/customer/src/hooks/use-customer-data.ts`
- Modify: `apps/customer/src/hooks/use-hybrid-ops-data.ts`
- Modify: `apps/customer/src/hooks/use-supabase-live-value.ts`
- Create: `apps/customer/src/lib/customer-order-loader.ts`
- Test: extend `apps/customer/src/lib/customer-api.test.ts` with member/guest response and error cases if needed.
- Test: `apps/customer/src/lib/customer-order-loader.test.ts`

**Interfaces:**
- Consumes the API functions and mapped order types from Task 1.
- `customer-order-loader.ts` produces `loadCustomerOrders(sourceId, guestReferences, signal?)` for the hook.
- Produces `useCustomerOrders()` data that contains all mapped customer order metadata and exposes the latest API error rather than converting request failures to an indistinguishable empty history.
- Produces `useHybridOrderById(id, refreshTrigger)` backed by the same authorized member/guest API selection.

- [ ] **Step 1: Add failing integration-level assertions for the hook loaders**

  Cover that member loading calls `/orders`, guest loading sends stored access tokens, and a rejected response remains observable as an error rather than an empty order list.

- [ ] **Step 2: Run the targeted tests to verify the regression**

  Run: `bun test apps/customer/src/lib/customer-api.test.ts`

  Expected: FAIL against the current old URL/loader behavior.

- [ ] **Step 3: Preserve API errors and replace duplicated order types/mapping and old URL calls**

  Add an optional `onError` callback to `useSupabaseLiveValue` and use it from `useCustomerOrders` to populate its existing `error` return value. Import the Task 1 mapper/API helpers in `use-customer-data.ts`; preserve realtime refresh behavior and guest references. Update `use-hybrid-ops-data.ts` so `fetchOrderById` chooses the guest token path when available and the member path otherwise, with abort handling and refresh-trigger support.

- [ ] **Step 4: Run targeted tests and typecheck customer**

  Run: `bun test apps/customer/src/lib/customer-order.test.ts apps/customer/src/lib/customer-api.test.ts && bun run --cwd apps/customer check-types`

  Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the task**

  ```bash
  git add apps/customer/src/hooks/use-customer-data.ts apps/customer/src/hooks/use-hybrid-ops-data.ts apps/customer/src/lib/customer-api.test.ts
  git commit -m "fix(customer): load member and guest orders consistently"
  ```

### Task 3: Fix receipt detail, payment status refresh, and push endpoints

**Files:**
- Modify: `apps/customer/src/routes/$username/order.lazy.tsx`
- Modify: `apps/customer/src/hooks/use-customer-push.ts`
- Create: `apps/customer/src/lib/customer-receipt.ts`
- Test: `apps/customer/src/lib/customer-api.test.ts`
- Test: `apps/customer/src/lib/customer-receipt.test.ts`

**Interfaces:**
- Consumes `fetchCustomerOrderById` and the customer-backed `useHybridOrderById` from Task 2.
- Produces receipt polling that can read the current customer-owned order, payment status, payment receipt kind, and tracking data without direct Supabase order reads.

- [ ] **Step 1: Write the failing receipt/push regression assertions**

  Assert that customer order detail is fetched through the API helper and that push subscribe/unsubscribe request construction uses `api.djiwatentram.web.id` with credentials.

- [ ] **Step 2: Run the assertions to verify they fail**

  Run: `bun test apps/customer/src/lib/customer-api.test.ts`

  Expected: FAIL because the current receipt path still uses the shared direct-Supabase loader and push still targets `api.djiwatentram.web.id`.

- [ ] **Step 3: Route receipt and push reads/writes through the customer boundary**

  Replace the shared `useHybridOrderById` import in the customer order page with the customer hook, use the same authorized selection for the receipt detail loader/polling, remove any now-dead old URL loader, and replace push fetch calls with `subscribeCustomerPush`/`unsubscribeCustomerPush` while preserving UI states and toasts.

- [ ] **Step 4: Run focused tests and typecheck**

  Run: `bun test apps/customer/src/lib/customer-api.test.ts apps/customer/src/lib/customer-order.test.ts && bun run --cwd apps/customer check-types`

  Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the task**

  ```bash
  git add 'apps/customer/src/routes/$username/order.lazy.tsx' apps/customer/src/hooks/use-customer-push.ts apps/customer/src/lib/customer-api.test.ts
  git commit -m "fix(customer): authorize receipt and push data reads"
  ```

### Task 4: Full verification and scope review

**Files:**
- Modify: none unless verification identifies a scoped defect.

- [ ] **Step 1: Run all customer Bun tests**

  Run: `find apps/customer/src -name '*.test.ts' -print0 | xargs -0 bun test`

  Expected: all customer tests PASS.

- [ ] **Step 2: Run the complete customer typecheck**

  Run: `bun run --cwd apps/customer check-types`

  Expected: exit code 0.

- [ ] **Step 3: Build the customer app**

  Run: `bun run --cwd apps/customer build`

  Expected: Vite build exits 0; inspect generated changes and keep only expected build artifacts already tracked by the repository.

- [ ] **Step 4: Review the diff and URL inventory**

  Run: `git diff --check` and `rg -n 'api\\.yumme\\.id/v1/customer|from\("pos_orders"\)|from\("orders"\)' apps/customer/src`

  Expected: no customer-owned API or receipt path remains on the old origin/direct order read; unrelated pre-existing workspace changes remain untouched.

- [ ] **Step 5: Commit verification-only fixes if required**

  ```bash
  git add apps/customer docs/superpowers/specs/2026-10-25-customer-data-consistency-design.md docs/superpowers/plans/2026-10-25-customer-data-consistency.md
  git commit -m "fix(customer): keep customer data sources consistent"
  ```
