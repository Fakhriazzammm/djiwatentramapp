# POS Product Variation Sheet Design

## Intent

Make the POS product sheet show each variation as an independent, single-choice group. A drink can have one temperature choice (Panas or Dingin) and one recipe choice (Regular or Seasonal); a Seasonal surcharge is added once to the item price. The sheet should feel compact and native on a phone.

## Current issue

Products store variation group labels as `name`, while the POS sheet reads `type`. Groups can therefore share an undefined selection key, causing selection state, labels, and price calculation to conflict.

## Approach

Use the existing POS product sheet and stored product shape. Resolve each group label from `name`, with `type` as a legacy fallback, and use a stable per-group key so separate groups cannot overwrite one another. Keep the first option selected by default for fast cashier entry, but make its selected state explicit and accessible. Restyle the sheet as a compact mobile bottom sheet with clear group titles, large single-choice controls, concise price summary, quantity stepper, and a sticky safe-area-aware add button.

The alternatives were changing the persisted variation schema or creating a shared cross-app picker. Neither is needed for this POS-specific issue: a read-only compatibility resolver fixes existing data without a migration or broader UI change.

## Boundaries

- No backend or product schema changes.
- Preserve effective pricing, discounts, quantity, cart callbacks, and the existing first-option default.
- Keep every variation group independent and allow only one selected option within each group.
- Keep the modal usable on narrow mobile screens and respect the device safe area.

## Verification

Build the POS app and inspect the diff. Automated tests are not added or run for this change.
