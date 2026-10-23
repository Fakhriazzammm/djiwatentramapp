# POS Mobile-first Implementation Plan

**Goal:** Make every relevant POS workflow reachable on mobile, retain checkout work, and recover transactions safely.

**Architecture:** Keep existing React/TanStack routes and payment services. Share route metadata for navigation/access, persist one checkout draft, retain failed offline actions, and integrate mobile operational sheets into the menu page.

**Scope:** User-approved recommendations from the code audit; source changes and verification. Do not use a browser or open a cashier shift. Preserve existing work and production data.

## Work packages

- [x] Offline: retain failed actions, persist retries/errors, explicit manual retry, durable enqueue, synchronization center and regression tests. Interface: `OfflineSyncCenter({ open, onOpenChange })`; manager exposes state/subscription and retry methods.
- [x] Navigation: shared permission-aware admin destinations, complete mobile HR entries, parent Outlet, invalid links, report gate, consistent return paths, footer props and focused navigation tests.
- [x] Checkout: persist customer/payment/production/step state, shared accessible mobile sheet, 3-step purchase flow with optional production assignment, required cash validation, separate transaction result and fresh-order printing, useful recovery messages.
- [x] Main POS integration: reachable mobile More menu, URL-backed panel state and Back, safe-area spacing, readiness and close-shift checklist, offline request-key rotation and pending QRIS behavior, success result contract.
- [x] Polish: meaningful error/recovery states, proper touch targets and readable primary text; reuse current design tokens.
- [x] Verify targeted transaction/navigation/draft tests, static route reachability checks, changed-file diagnostics and production build. Inspect final diff and document remaining limitations.

## Integration contracts

Checkout onConfirmPayment resolves `{ orderId: string | null, status: 'paid' | 'pending' | 'queued', paymentMethod: string, total: number, invoiceUrl?: string, customerName?: string, cashReceived?: number, changeAmount?: number }`; failures reject. Queueing must rotate request key only after durable storage. Dynamic QRIS requires online invoice creation. Existing open bills remain available.

## Review focus

Offline retry exhaustion retains data; two distinct offline drafts have distinct request keys; rejected submissions preserve draft; mobile drawer dismissal preserves state; disabled cash buttons explain what is missing; direct routes and menu permissions agree; no premature paid receipt; failed shift close does not repeat saved expenses.

## Review corrections

- Match both `shiftSourceId` from the public view and `shift_source_id` from the stored row; do not mix explicitly linked shifts using time fallback.
- Do not auto-open an empty checkout on mobile. A restored URL panel must stay selected.
- Both desktop and mobile checkout print using the persisted result's order ID, not an in-memory last order.
- Lock acknowledged closing expenses and skip them on retries. Corrections use the existing expense management flow.
- Verify items and settlement before acknowledging an existing idempotency key. An incomplete server record must retain its queued payload for recovery, not be reported as success.
- Keep the unresolved request identity in `localStorage`, matching the lifetime of the POS cart draft, so closing and reopening a tab cannot rotate the idempotency key.
- Do not expose dynamic Mayar QRIS in POS while the Edge Function authorizes only customer/B2B order sources; this prevents a cashier from entering a recovery state that the server cannot complete.
- Disable global POS keyboard shortcuts while URL-backed panels and modal sheets are open so Tab/Enter remain owned by the active surface.

## Verification boundaries

No browser, cashier login, live payment, printer action, database write, migration, production deployment, or GitHub mutation is part of this implementation pass. Automated tests cover helper behavior, query composition, rendered result markup and source wiring; they are not visual/device E2E tests.

The project-wide type check still reports existing errors in inventory, queue, finance/HR/leaderboard pages, Vite config and test typings. Two unchanged employee-onboarding tests also fail. Keep these visible rather than calling the entire suite green.

Finance transaction cards currently reflow non-virtualized rows. Virtualized transaction lists and accounting mode retain their existing scrollable table presentation to preserve their fixed-height layout assumptions.

Verification evidence from the implementation pass:

- Focused recovery/navigation tests: 50 passed.
- Full POS suite: 133 passed, 2 unchanged employee-onboarding failures.
- Production POS build: passed; Supabase public configuration and 129 PWA precache entries verified.
- `git diff --check`: passed.
- POS typecheck: existing diagnostics remain outside the changed checkout/recovery/navigation paths.
