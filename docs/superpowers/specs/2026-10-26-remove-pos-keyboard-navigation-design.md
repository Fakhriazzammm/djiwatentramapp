# Remove POS Keyboard Navigation

## Intent

Remove the dedicated keyboard-navigation feature from `apps/pos`, including
its visible shortcut hints and keyboard-only focus styling.

## Scope

- Remove the `useMenuKeyboardNav` wiring from the POS menu screen.
- Remove keyboard focus state and conditional focus-ring classes that exist
  only for that feature.
- Remove the shortcut hint row from the UI.
- Preserve ordinary text entry in the product search field and barcode scanning.

## Non-goals

Do not change product search, cart behavior, payment dialogs, barcode scanning,
or normal browser accessibility behavior of native controls.

## Verification

Type-check the POS app, build it, and search the POS source for remaining
references to the dedicated keyboard-navigation hook or shortcut hint copy.
