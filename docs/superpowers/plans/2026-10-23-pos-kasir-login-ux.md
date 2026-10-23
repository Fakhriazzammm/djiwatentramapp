# POS Kasir Login UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the POS cashier login clearer, more resilient, and safer to recover from without changing the existing auth contract.

**Architecture:** Keep the existing public cashier roster and server-side PIN verification. Add small pure helpers for login error classification, then improve the login shell, identity picker, and PIN screen with connection state, retry/refresh affordances, explicit submit fallback, and actionable error copy.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, Bun tests.

**Spec:** Existing POS login UX audit and user approval to fix it.

## Global Constraints

- Do not change Supabase tables, Edge Function request payloads, or PIN verification behavior.
- Preserve the existing `/kasir/login` route and successful navigation to `/menu`.
- Do not expose PIN values in logs or user-facing error details.
- Keep touch targets at least 44px high for primary controls.

## Review Focus

- Offline/online transitions: login should explain connectivity and provide retry.
- Six-digit PIN entry: auto-submit remains available but a visible fallback must exist.
- Failed or rate-limited login: the message must be actionable and the form must not double-submit.
- Search state: a cashier must be able to clear the query without deleting characters manually.
- Responsive layout: controls must remain usable on narrow terminals.

### Task 1: Login utility behavior

**Files:**
- Create: `apps/pos/src/lib/kasir-login-utils.ts`
- Test: `apps/pos/src/lib/kasir-login-utils.test.ts`

- [ ] Write failing tests for identifier normalization, retryable errors, and friendly rate-limit/error copy.
- [ ] Run the focused Bun test and verify it fails before implementation.
- [ ] Implement typed pure helpers.
- [ ] Run the focused test and verify it passes.

### Task 2: Kasir login UI

**Files:**
- Modify: `apps/pos/src/routes/kasir/login.lazy.tsx`
- Modify: `apps/pos/src/components/auth/identity-picker.tsx`
- Modify: `apps/pos/src/components/auth/login-shell.tsx`
- Modify: `apps/pos/src/components/ui/OneTimeCode.tsx`

- [ ] Add browser connection status and refresh timestamp to the login shell.
- [ ] Add clear-search affordance and clearer search copy to the roster.
- [ ] Add explicit PIN submit fallback and safe error classification/copy.
- [ ] Add keyboard semantics for the PIN field and preserve auto-submit.
- [ ] Run type checks and the POS production build.

### Task 3: Final verification

- [ ] Review the diff for auth-contract or secret-leak regressions.
- [ ] Run focused tests, POS type check, and POS build from a clean diff.

