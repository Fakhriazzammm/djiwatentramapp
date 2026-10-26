# Payment System Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make customer, POS, admin, Supabase settlement, notifications, and financial reporting use one compatible payment contract and idempotent settlement path.

**Architecture:** A shared payment normalizer maps legacy persisted values to canonical payment methods and labels. Supabase RPCs remain the only boundary that changes a pending order into a financially settled order; POS and admin call those RPCs, while customer starts provider flows and observes the resulting order state.

**Tech Stack:** TypeScript, React, Supabase PostgreSQL migrations/RPCs, Deno Edge Functions, Node test runner, Bun/Vite/Turbo builds.

**Spec:** `docs/superpowers/specs/2026-10-26-payment-system-sync-design.md`

## Global Constraints

- Deployment target remains `djiwa-vps`; do not use Dalang/Zantara for this repository.
- Canonical methods are `cashier_cash`, `qris_mayar`, and `djiwa_pay`.
- Canonical lifecycle is `pending`, `paid`, `completed`, `cancelled`.
- Legacy persisted values remain readable; no mass historical rewrite in phase one.
- Client code must not create duplicate financial transactions during settlement.
- Supabase migrations and SQL remain the source of truth for backend data/auth/payment changes.

## Review Focus

- QRIS values `qris`, `qris_mayar`, and `mayar` must never be classified as cashier cash; test in POS/admin order creation and notification mapping.
- Cash values `cash`, `tunai`, and `cashier` must converge to cashier settlement; test retry/idempotency and financial transaction uniqueness.
- Wallet values `wallet` and `djiwa_pay` must preserve hold/capture/release semantics; test failed capture does not leave a paid order.
- Admin status controls must not bypass payment settlement; test a pending cashier order cannot be marked paid through generic status mutation.
- A settled order must expose the same method/status/receipt to customer, POS, admin, notification, and finance views; test the shared projection fields.

### Task 1: Shared payment contract

**Files:**
- Create: `packages/yumipos-web-shared/src/lib/payment-contract.ts`
- Create: `packages/yumipos-web-shared/src/lib/payment-contract.test.ts`
- Modify: `packages/yumipos-web-shared/src/lib/payment-label.ts`
- Modify: `packages/yumipos-web-shared/src/lib/tax-calculator.ts`

**Interfaces:**
- Produces `CanonicalPaymentMethod = "cashier_cash" | "qris_mayar" | "djiwa_pay"`.
- Produces `normalizePaymentMethod(input: { paymentMethod?: unknown; paymentReceiptKind?: unknown; paymentGateway?: unknown }): CanonicalPaymentMethod | "unknown"`.
- Produces `paymentReceiptKindFor(method, state): string` and shared display labels.

- [ ] Write failing tests for every legacy alias, especially that Mayar/QRIS never resolves to cashier.
- [ ] Run the focused shared tests and verify the new tests fail for the current inconsistent mapping.
- [ ] Implement the normalizer and receipt-kind policy without changing persisted legacy values.
- [ ] Update payment labels and tax-channel resolution to consume the normalizer.
- [ ] Run focused tests and the shared package typecheck.
- [ ] Commit `feat(shared): add canonical payment contract`.

### Task 2: Supabase settlement boundary

**Files:**
- Create: `supabase/migrations/20261026180000_payment_settlement_contract.sql`
- Modify: `supabase/migrations/20260827000000_cashier_order_settlement_rpc.sql`
- Modify: `supabase/migrations/20260823000003_wallet_order_settlement.sql`
- Modify: Mayar settlement migration/RPC identified during implementation.
- Create: `supabase/scripts/verify-payment-settlement-contract.sql`

**Interfaces:**
- Cash settlement remains `pos.settle_cashier_order(text,text)`.
- Mayar settlement returns an idempotent settlement result keyed by order/invoice/transaction.
- Wallet settlement preserves `pos.wallet_settle_order(...)` and returns the final order state.

- [ ] Add SQL regression queries for cash, QRIS, wallet, invalid method, repeated settlement, and rollback-on-error.
- [ ] Run the queries in a transaction against `djiwa-vps` Supabase and record current failures before modifying production behavior.
- [ ] Implement canonical method validation, order locking, one financial transaction per order, and receipt assignment in the migration.
- [ ] Apply the migration to the self-hosted Supabase database on `djiwa-vps` using the repository SQL file.
- [ ] Run the verification script and inspect function grants, trigger behavior, and transaction uniqueness.
- [ ] Commit `fix(db): unify payment settlement contract`.

### Task 3: Customer, POS, and admin write paths

**Files:**
- Modify: `apps/customer/src/routes/$username/order.lazy.tsx`
- Modify: `apps/customer/src/hooks/use-hybrid-write-actions.ts`
- Modify: `apps/pos/src/hooks/use-hybrid-write-actions.ts`
- Modify: `apps/pos/src/routes/menu.lazy.tsx`
- Modify: `apps/admin/src/hooks/use-hybrid-write-actions.ts`
- Modify: `apps/admin/src/routes/menu.lazy.tsx`
- Modify: `apps/admin/src/routes/admin/orders.$orderNumber.lazy.tsx`
- Create/update focused tests beside the affected payment helpers.

**Interfaces:**
- Customer creates only pending provider/cashier orders and does not write settlement finance rows.
- POS cashier action calls the cashier RPC and never generic status mutation.
- Admin payment action uses the same settlement helper/RPC as POS; generic order lifecycle controls cannot settle payment.

- [ ] Write failing tests for the current POS/admin Mayar `cashier_pending` regression and admin generic paid mutation.
- [ ] Run focused tests to confirm the failures.
- [ ] Change POS/admin Mayar creation to `gateway_pending` and canonical QRIS metadata.
- [ ] Route POS and admin cash confirmation through the shared cashier settlement path.
- [ ] Keep generic status controls limited to non-financial lifecycle transitions and return a clear error for payment settlement attempts.
- [ ] Verify customer retry/status reconciliation for all three methods.
- [ ] Run customer, POS, and admin typechecks/builds.
- [ ] Commit `fix(apps): synchronize payment write paths`.

### Task 4: Notifications, views, reports, and labels

**Files:**
- Modify: `supabase/functions/pos-notifications/index.ts`
- Modify: `apps/pos/src/components/pos/notification-center.tsx`
- Modify: `apps/admin/src/routes/admin/orders.lazy.tsx`
- Modify: `apps/admin/src/routes/admin/orders.$orderNumber.lazy.tsx`
- Modify: `apps/admin/src/routes/laporan.lazy.tsx`
- Modify: relevant shared public order/finance view migrations.

**Interfaces:**
- Notification payment classification calls the shared canonical resolver or an equivalent backend canonical function.
- Display labels show `Bayar Tunai di Kasir`, `QRIS`, or `Djiwa Pay` consistently.
- Finance/report filters treat only completed financial transactions as settled income.

- [ ] Write failing tests for notification classification and admin report grouping across legacy aliases.
- [ ] Implement shared classification and remove ad hoc method comparisons where they affect payment state.
- [ ] Add/adjust view fields so POS/admin/customer receive method, receipt kind, gateway status, and settlement status consistently.
- [ ] Run Edge Function tests and report-focused tests.
- [ ] Commit `fix(ops): align payment notifications and reporting`.

### Task 5: End-to-end verification and deployment

**Files:**
- Modify only if verification exposes a defect.
- Use `docs/superpowers/specs/2026-10-26-payment-system-sync-design.md` as the acceptance checklist.

- [ ] Run all focused payment tests, shared tests, and the repository's available test command.
- [ ] Build `apps/customer`, `apps/pos`, and `apps/admin` with Node 22/Bun on the release worktree.
- [ ] Run Supabase SQL verification and confirm one financial transaction per settled order for each method.
- [ ] Deploy the three app dist directories only to the matching roots on `djiwa-vps` with atomic backups.
- [ ] Smoke-test `djiwatentram.web.id`, `pos.djiwatentram.web.id`, and `admin.djiwatentram.web.id` version manifests and HTTP 200.
- [ ] Verify the live Supabase containers and rollback backup paths.
- [ ] Commit any final verification-only fixes and record exact SHAs/build versions.
