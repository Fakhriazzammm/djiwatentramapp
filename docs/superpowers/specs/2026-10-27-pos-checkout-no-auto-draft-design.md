# POS Checkout Without Automatic Drafts

## Intent

Make cashier checkout predictable and mobile-first. A new checkout starts empty, and an unsubmitted cart is kept only in the current app session. This avoids reopening an unexpected old order on a shared terminal.

## Goals

- Stop persisting unsubmitted cart items, voucher selection, customer fields, and checkout progress in local storage.
- Remove old POS-specific cart and checkout data when the new behavior starts so legacy data cannot reappear.
- Keep recovery for a payment request that was already submitted and is still unresolved.
- Make checkout labels and touch targets clearer on mobile.
- Explain and clear an unsubmitted cart when the cashier confirms logout.

## Non-goals

- Change payment provider behavior, validation rules, tax calculation, order submission, or offline queue persistence.
- Add a save/hold-order workflow.
- Clear server-created orders or pending-payment recovery data when clearing a cart or logging out.

## Approaches

- Persist all checkout state automatically: rejected because it causes unexpected old carts on shared terminals.
- Remove all recovery, including submitted payment recovery: rejected because it can cause duplicate orders or lose the path to resolve an existing payment request.
- Keep unsent cart state in memory only, while retaining recovery for submitted unresolved payment requests: selected for predictable fresh checkouts without changing payment safety behavior.

## UX and behavior

The POS remains a two-step flow: order, then payment, followed by a result screen. Unsubmitted cart state stays available while navigating within the open app session, but reload or a fresh login starts empty. The mobile drawer uses an iOS-inspired bottom sheet, grouped cards on a soft gray background, comfortable touch targets, a sticky action, and expandable cost/advanced details. Surfaces adapt for light and dark appearance. Logout confirms that the unsent cart will be discarded; queued offline orders and submitted payment recovery remain intact.

The legacy `pos_voucher` key is shared with other apps on the same origin. POS no longer reads or writes it, but leaves it untouched to avoid deleting another app's state.

## Constraints

- Preserve current payment, tax, shift, and order validation semantics.
- Preserve offline queue and submitted payment recovery storage.
- No database or Supabase schema changes.
