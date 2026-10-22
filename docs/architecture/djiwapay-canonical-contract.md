# Djiwa Pay canonical contract

## Ownership

- Canonical full Djiwa Pay runtime: `apps/djiwapay`.
- Canonical public URL: `https://pay.djiwatentram.web.id`.
- Wallet reads and payment settlement continue to use the existing customer-wallet and Mayar contracts.
- Existing app origins and navigation remain active; their Djiwa Pay action is a launcher only.
- `packages/djiwapay-core` owns types, safe route construction, and payment vocabulary.
- `packages/djiwapay-ui` owns only reusable launch/balance presentation primitives.

## Security invariants

- Identity is resolved from the authenticated Better Auth session and server-backed customer profile.
- Query parameters are navigation context only; they are never an authority source. The canonical host stays under `.yumme.id` so the existing cross-subdomain session cookie remains compatible.
- `returnTo` accepts only allowlisted HTTPS origins and is normalized to an encoded path.
- Wallet ownership is checked by the existing server contract; a mismatched customer/wallet is rejected.
- The canonical app does not create a payment invoice until an authenticated profile is resolved.

## Forbidden

- Copying the full wallet page into consumer apps.
- Duplicating top-up handlers, ledger mapping, or settlement logic.
- Accepting arbitrary external redirects, wildcard credentialed CORS, or browser-supplied authority.
