# POS Checkout Without Automatic Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make POS checkout start empty after reload or a fresh login while keeping unresolved submitted-payment recovery intact and improving mobile checkout clarity.

**Architecture:** Keep cart, voucher, customer, and step state in the existing CartProvider but initialize them fresh and remove legacy unsent-cart keys. Leave the route-level pending-payment recovery store untouched. Update checkout copy, touch targets, and logout handling in the existing POS UI.

**Tech Stack:** React, TypeScript, Tailwind CSS, TanStack Router.

**Spec:** `docs/superpowers/specs/2026-10-27-pos-checkout-no-auto-draft-design.md`

## Global Constraints

- Do not persist an unsubmitted cart or checkout state across reloads.
- Preserve submitted payment recovery and offline queue storage.
- Keep payment validation and transaction semantics unchanged.
- Keep mobile layout one-column with reachable, adequately sized primary controls.

## Review Focus

- Legacy local-storage values must be removed so an old cart does not return.
- Navigation within the mounted POS session must continue to retain the active cart.
- A submitted unresolved payment must still block a duplicate checkout and offer recovery.
- Logout must clearly discard an unsubmitted cart without clearing offline queued orders.
- Button sizing and footer placement must remain usable in the mobile cart drawer.
- Ruling: Leave legacy `pos_voucher` untouched — shared/admin cart providers also use this origin-wide key, while POS no longer reads it — cost if wrong: stale voucher data remains stored but cannot restore in POS.

---

### Task 1: Remove automatic persistence for unsent cart state

**Files:**
- Modify: `apps/pos/src/context/cart-context.tsx`
- Modify: `apps/pos/src/lib/pos-checkout.ts`

**Interfaces:** Keep the existing CartContext API. Preserve `parseCheckoutStorage` only if other existing tests or callers depend on it; the provider must no longer read or write checkout storage.

- [x] Initialize cart, voucher, customer, and checkout state to fresh defaults.
- [x] Remove cart, voucher, and checkout autosave effects; clear POS-specific legacy cart and checkout keys once on provider mount. Do not clear the cross-app `pos_voucher` key.
- [x] Keep route-level submitted-payment recovery untouched.

### Task 2: Clarify mobile checkout and logout behavior

**Files:**
- Modify: `apps/pos/src/components/pos/checkout-sidebar.tsx`
- Modify: `apps/pos/src/routes/menu.lazy.tsx`

**Interfaces:** Keep current checkout callbacks and server submission contract.

- [x] Replace draft-oriented copy with unsent/current-session wording.
- [x] Restyle the mobile cart drawer as an iOS-inspired bottom sheet with grouped cards, collapsed cost/advanced details, larger touch targets, and a sticky action.
- [x] Update logout confirmation and clear unsent cart only after logout confirmation.

### Task 3: Review and verify implementation

**Files:** All files above.

- [x] Review the diff against the design, including pending payment recovery and offline queue paths.
- [ ] Run the POS TypeScript check and production build; type-check reports unrelated existing errors, and the production build guard blocks without public Supabase configuration in `apps/pos/.env*`.
