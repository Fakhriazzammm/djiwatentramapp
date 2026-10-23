# Djiwa Pay Wallet Transactions and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver durable wallet transactions, transaction details, in-app notifications, and best-effort Web Push for send/receive balance flows in `apps/customer` and `apps/djiwapay`.

**Architecture:** Keep `pos.customer_wallet_ledger` and `pos.wallet_transfer` authoritative. Add server-side normalization/view logic for transaction responses and durable wallet notification records targeted by customer `source_id`; expose the same normalized contract through authenticated customer and Djiwa Pay boundaries. Both apps render the contract with shared interaction rules but retain their existing visual shells.

**Tech Stack:** Supabase/Postgres migrations and Edge Functions, Bun/Hono auth server, React/TypeScript, TanStack Router, existing Web Push registry, Bun tests.

**Spec:** `docs/superpowers/specs/2026-10-23-djiwa-pay-wallet-transactions-design.md`

## Global Constraints

- Ledger and wallet RPC remain the source of truth; no second balance model.
- Browser clients never submit an arbitrary customer ID for wallet reads or writes.
- Phone numbers are lookup-only and masked in transaction details/notifications.
- Transfer idempotency must prevent duplicate ledger rows and duplicate notifications.
- Notification and push failure must not roll back a completed transfer.
- Existing order, top-up, PPOB, hold, release, and admin wallet flows must remain compatible.
- Supabase schema changes use migration files under `supabase/migrations` and are verified before deployment.

## Review Focus

- Duplicate transfer retries: same idempotency key must return the existing transfer without duplicate ledger or notification rows; test in Task 1.
- Cross-user access: customer A cannot read customer B transactions or mark B notifications read; test in Task 2.
- Legacy ledger rows: top-up/order/hold/release rows remain visible and categorized; test in Task 2 and Task 4.
- Notification delivery failure: transfer remains completed when push dispatch fails; test in Task 3.
- Empty, filtered, and paginated history: UI must show an intentional state and never lose the current balance; test in Task 4.

---

### Task 1: Database transaction projection and wallet notification records

**Files:**
- Create: `supabase/migrations/20261023120000_djiwa_pay_wallet_transactions_notifications.sql`
- Test: `supabase/functions/customer-wallet/wallet-transactions.test.ts`

**Interfaces:**
- Consumes: existing `pos.customer_wallet_ledger`, `pos.customer_wallets`, and `pos.wallet_transfer`.
- Produces: normalized wallet transaction query/RPC and wallet notification types/dedupe rules consumed by Tasks 2–4.

- [ ] **Step 1: Write failing SQL contract tests** for transfer grouping, counterparty resolution, and notification type acceptance.
- [ ] **Step 2: Run the focused test and confirm it fails** because the projection and notification types do not exist.
- [ ] **Step 3: Add an additive migration** that extends notification type constraints, adds wallet notification metadata/indexes, and creates a secure server-only transaction projection/RPC. The projection must map legacy ledger transaction types and join the opposite transfer ledger row to `pos.customers` for name and masked phone.
- [ ] **Step 4: Add idempotent wallet notification creation** to the transfer path using sent/received dedupe keys and target customer IDs. Notification creation must be inside the transfer transaction or safely deduplicated after it.
- [ ] **Step 5: Run the focused SQL/Edge contract tests** and verify transfer rows, notification rows, dedupe, and legacy mappings.
- [ ] **Step 6: Commit** `feat: add wallet transaction and notification persistence`.

### Task 2: Shared backend wallet contract

**Files:**
- Modify: `supabase/functions/customer-wallet/index.ts`
- Modify: `apps/auth-server/src/index.ts`
- Modify: `apps/djiwapay/src/lib/wallet-adapter.ts`
- Create/Modify: `apps/customer/src/lib/customer-wallet-adapter.ts`
- Test: `apps/djiwapay/test/djiwa-pay-wallet-transactions.test.ts`
- Test: `apps/customer/src/lib/customer-wallet-adapter.test.ts`

**Interfaces:**
- Consumes: Task 1 transaction projection and notification records.
- Produces: `WalletTransaction`, `WalletNotification`, and actions for list/detail/read used by both UIs.

- [ ] **Step 1: Write failing adapter tests** for category mapping, counterparty masking, notification payloads, and read actions.
- [ ] **Step 2: Run focused tests and confirm expected failures.**
- [ ] **Step 3: Implement normalized response mapping** in the Edge Function and auth server; keep pay-session and Better Auth ownership checks server-side.
- [ ] **Step 4: Add wallet notification list/read/mark-all actions** to the authenticated boundaries.
- [ ] **Step 5: Implement both frontend adapters** against the same response contract with safe error mapping.
- [ ] **Step 6: Run adapter/type tests and existing wallet tests.**
- [ ] **Step 7: Commit** `feat: expose shared wallet transaction and notification APIs`.

### Task 3: Durable in-app notification and Web Push integration

**Files:**
- Modify: `supabase/functions/pos-notifications/index.ts`
- Modify: `supabase/migrations/20260925210000_customer_web_push.sql` only if the deployed schema requires an additive correction
- Test: `supabase/functions/pos-notifications/customer-wallet-notifications.test.ts`

**Interfaces:**
- Consumes: Task 1 notification records and Task 2 notification contract.
- Produces: customer-scoped notification listing, read state, and target-specific push delivery.

- [ ] **Step 1: Write failing tests** for customer target filtering, sender/recipient push targeting, and invalid subscription deactivation.
- [ ] **Step 2: Run tests and confirm failures.**
- [ ] **Step 3: Extend notification function behavior** without weakening existing staff/order authorization; customer requests must use the approved customer identity boundary.
- [ ] **Step 4: Ensure push payloads contain only title, safe message, notification ID, and wallet detail route.**
- [ ] **Step 5: Run notification tests and existing notification tests.**
- [ ] **Step 6: Commit** `feat: deliver wallet notifications to customer devices`.

### Task 4: Djiwa Pay and Customer UI

**Files:**
- Modify: `apps/djiwapay/src/features/wallet/djiwa-pay-screen.tsx`
- Modify: `apps/djiwapay/src/features/wallet/djiwa-pay-wallet-actions.tsx`
- Modify: `apps/djiwapay/src/index.css`
- Modify: `apps/customer/src/routes/$username/saldo.lazy.tsx`
- Modify: `apps/customer/src/routes/$username/notifikasi.lazy.tsx`
- Create: `apps/customer/src/components/customer/customer-wallet-notification.tsx`
- Test: `apps/djiwapay/test/djiwa-pay-wallet-transactions.test.ts`
- Test: `apps/customer/src/routes/$username/customer-wallet-ui.test.tsx`

**Interfaces:**
- Consumes: Task 2 transaction/notification adapters and Task 3 push state.
- Produces: filterable history, detail sheet, notification cards, unread badges, and refresh behavior after transfer.

- [ ] **Step 1: Write failing UI/contract tests** for direction labels, filters, detail data, empty state, unread state, and refresh after transfer.
- [ ] **Step 2: Run focused tests and confirm failures.**
- [ ] **Step 3: Upgrade Djiwa Pay activity** with filters, counterparty context, detail sheet, copy transaction ID, and notification badge.
- [ ] **Step 4: Upgrade customer saldo and notification routes** to include wallet events while preserving order events and existing navigation.
- [ ] **Step 5: Add explicit loading, empty, error, and session-expired states.**
- [ ] **Step 6: Run focused UI tests, typecheck, and builds for both apps.**
- [ ] **Step 7: Commit** `feat: add wallet transaction history and notifications UI`.

### Task 5: Integration verification and release preparation

**Files:**
- Modify: `docs/DEPLOYMENT_VPS_WORKFLOW.md` if the wallet notification rollout adds required deployment steps
- Test: existing Djiwa Pay, customer, wallet, and notification suites

- [ ] **Step 1: Run full focused verification** for migrations, Edge Functions, auth server TypeScript, both app typechecks, and both builds.
- [ ] **Step 2: Run `git diff --check` and inspect migration/security changes.**
- [ ] **Step 3: Verify production-safe behavior** with an authenticated test transfer: sender ledger, recipient ledger, two notifications, read state, and push delivery records.
- [ ] **Step 4: Record known baseline failures separately from new failures.**
- [ ] **Step 5: Commit release documentation if needed.**

