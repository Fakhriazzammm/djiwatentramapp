# Djiwa Pay Release Hardening Design

## Goal

Make the canonical Djiwa Pay application reproducible from Git and safe to
release by validating its cross-app handoff, authenticated wallet access, and
PPOB payment state transitions.

## Scope

- Keep the canonical frontend in `apps/djiwapay` and shared contracts in the
  existing `packages/djiwapay-*` packages.
- Add focused automated coverage for redirect/session boundaries and payment
  outcomes where the current code has no tests.
- Validate Djiwa Pay, its shared packages, and the consumer app typechecks and
  build commands.
- Inspect Supabase migrations/functions only when the validation exposes a
  data-contract mismatch; do not introduce schema changes without evidence.
- Preserve unrelated working-tree changes and deployment backups outside this
  isolated worktree.

## Non-goals

- Implementing currently labelled future actions such as send, receive, scan,
  cards, or withdrawals.
- Replacing the existing customer-wallet or Mayar settlement contracts.
- Cleaning or deleting files from the original dirty workspace.
- Publishing, merging, or changing production DNS without explicit approval.

## Design

The release branch contains the canonical Djiwa Pay source and builds it as a
normal workspace package. Consumer applications remain launchers and pass only
allowlisted navigation context. The auth server resolves the authenticated
identity and wallet server-side; browser query parameters are never treated as
authority.

PPOB purchase handling must preserve the existing atomic wallet purchase and
persisted transaction-state behavior. Tests will pin the externally visible
outcomes for success, pending, failure, duplicate/idempotent requests, and
unauthenticated or mismatched-wallet access.

## Error handling and security invariants

- `returnTo` accepts only configured HTTPS origins and is normalized before
  redirecting.
- Pay Bridge endpoints require the authenticated Better Auth session.
- Wallet identity comes from the resolved server-side profile, not request
  body authority fields.
- A PPOB retry must not create a second wallet debit for the same idempotency
  key.
- Pending and failed provider responses must remain distinguishable from a
  successful settlement.

## Verification

- Run the focused contract and backend tests first and observe them fail before
  implementation changes when a missing behavior is covered.
- Run Djiwa Pay/core/UI typechecks and Djiwa Pay production build.
- Run Customer, Merchandise, and B2B typechecks plus the checkout-standard
  verifier.
- Record any pre-existing workspace failures separately from failures caused by
  this change.

