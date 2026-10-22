# Djiwa Checkout Standard

`@yumipos/djiwa-checkout-ui` is the canonical checkout flow and visual contract for all customer-facing commerce apps. The reference experience is `apps/customer`; `apps/djiwapay` is the payment-confirmation reference.

## Required flow

1. **Context** — show the current step as `Langkah X dari N`, title, and short supporting copy.
2. **Order summary** — keep product, recipient/order metadata, fees, and total in one readable summary surface.
3. **Payment** — present payment methods as selectable cards with selected, disabled, and insufficient-balance states.
4. **Feedback** — show validation/provider/payment state inline in the checkout surface; do not hide it behind an overlay.
5. **Action bar** — provide a stable `Kembali` action and one primary payment/continue action. The primary action must reflect loading and disabled states.

Use the exported components and `styles.css` for the shell, sections, payment cards, summary, notices, and action bar. Business rules, provider adapters, totals, and authentication remain app-owned; the flow and visual contract do not.

## Existing apps

The registered customer checkout apps are in `config/djiwa-checkout-apps.json`:

- `customer`
- `b2b`
- `merchandise`
- `ordermieyamin`
- `djiwapay`

Each app must declare the workspace dependency, import `@yumipos/djiwa-checkout-ui/styles.css` from its entrypoint, and use `CheckoutPage` (or the shared checkout components) in its checkout surface.

## New apps

Before adding a checkout route:

1. Add the app name to `customerCheckoutApps` in `config/djiwa-checkout-apps.json`.
2. Add `@yumipos/djiwa-checkout-ui: workspace:*` to the app manifest.
3. Import the shared stylesheet from `src/main.tsx`.
4. Build the flow from the shared components; do not copy checkout CSS or create a parallel payment-card/summary/action-bar system.
5. Run `bun run check:checkout-standard` and the app typecheck before review.

The guard also detects checkout-like surfaces in unregistered apps and fails the check. `admin` and `pos` are explicitly listed as operational payment surfaces; their cashier/operator workflows are not the customer checkout contract.

## Change policy

Changes to spacing, hierarchy, payment states, action labels, or checkout accessibility belong in this package first. App-specific additions should be composed through props/children and must not fork the shared interaction pattern. Any intentional exception requires an update to the registry and an explicit review note.
