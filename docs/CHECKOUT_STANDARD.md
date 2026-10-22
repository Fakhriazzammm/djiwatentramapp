# Djiwa Checkout Standard v2 — Canonical Customer Checkout

**Status:** canonical · **Owner:** `packages/djiwa-checkout-ui` · **Scope:** every customer-facing commerce app in this monorepo.

One flow, one markup, one label set. Apps supply **data and app-specific field slots only** — they never re-implement layout, fee lines, or copy.

```
packages/djiwa-checkout-ui/src
├── components.tsx           primitives: CheckoutPage / CheckoutSection / CheckoutHeader /
│                            PaymentMethodCard / OrderSummary / CheckoutActionBar / PaymentNotice
├── customer-checkout.tsx    canonical flow: CustomerCheckout + field/summary primitives
├── customer-flow.css        classes used by the canonical flow (plain CSS, no Tailwind)
├── styles.css               single entry stylesheet (@imports the flow css)
└── index.ts                 the only public surface apps may import
```

Every consuming app must import the stylesheet once:

```ts
import "@yumipos/djiwa-checkout-ui/styles.css";
```

## 1. Golden rule

`apps/customer` is the reference storefront. When in doubt, the rendered output of `apps/customer`
wins. Never fork copy, labels, or fee ordering "because this app is different" — if the business
rule really differs, it becomes a documented prop, not a copy-paste.

## 2. Canonical summary lines (order + exact labels)

Rendered by `CheckoutSummaryLines`. Conditional rows disappear when their value is `0`.

| # | Condition | Label | Value |
|---|-----------|-------|-------|
| 1 | always | `Subtotal produk` | gross product subtotal |
| 2 | `freeRefillCharge > 0` | `Free refill minuman` | charge |
| 3 | `promoDiscount > 0` | `Promo / diskon` | `-Rp…` (orange) |
| 4 | `djiwaPayDiscount > 0` | `Djiwa Pay {rate}%` | `-Rp…` (green) |
| 5 | `shippingFee > 0` | `Biaya pengantaran` | fee |
| 6 | always | `Service Charge ({rate}%)` | amount, or `Gratis / Rp0` when cashier |
| 7 | `taxEnabled` | `PBJT/Pajak Restoran ({rate}%)` | amount, or `Gratis / Rp0` when cashier |
| 8 | `taxEnabled` | `Dasar pajak` | tax base |
| — | always | tax note paragraph | see §3 |
| 9 | `roundingAdjustment !== 0` | `Pembulatan` | signed adjustment (amber up / green down) |
| 10 | always | `Total` | total |

Formula (must stay identical everywhere):

```
taxBase            = max(0, productGrossSubtotal + freeRefillCharge - promoDiscount - djiwaPayDiscount)
rawTotal           = taxBase + shippingFee + serviceChargeAmount + taxAmount
roundingAdjustment = total - rawTotal
```

## 3. Tax note rules

- `taxEnabled === false` → “Harga menu sudah termasuk Pajak Barang dan Jasa Tertentu (PBJT) atas makanan dan/atau minuman sesuai ketentuan yang berlaku di Kota Tasikmalaya.”
- `taxEnabled` and cashier → “Pembayaran tunai di kasir: PBJT dan service charge Rp0 sesuai kebijakan operasional.”
- `taxEnabled` otherwise → “PBJT makanan dan minuman Kota Tasikmalaya {rate}%. Service charge ditampilkan terpisah dan bukan pajak daerah.”

## 4. Non-negotiable rules

1. **Never hardcode the Djiwa Pay rate.** Pass `djiwaPayDiscountRate` (campaign 50 / site setting 20).
   `Voucher Djiwa Pay (20%)` and `Djiwa Pay 50%` hardcodes are banned.
2. **Plain CSS only** inside this package. No Tailwind classes — `apps/djiwapay` ships no Tailwind.
3. **No parallel markup.** If an app needs a variant, add a prop/to slot; do not copy the block.
4. **Header format is fixed:** `Langkah {step} dari {totalSteps}` with an optional `· {eyebrow}`.
5. **Action row splits 50/50** between back and primary button; the primary button never shrinks.

## 5. Step header / eyebrow

```tsx
<CheckoutHeader step={5} totalSteps={5} eyebrow="Pembayaran" title="Pilih metode pembayaran" />
// renders: Langkah 5 dari 5 · Pembayaran
```

`CustomerCheckout` takes `step`, `totalSteps`, `eyebrow`, `title`, `description`.

## 6. Payment options

Keys are fixed and ordered: `wallet` (Djiwa Pay) then `mayar` (QRIS). A third `cashier` key is
cashier-settled and renders `Gratis / Rp0` for service charge and PBJT. When the wallet balance is
short, pass `walletShortage` — the option disables and shows `topupLabel` + `onTopup`.
`paymentGate` replaces the whole payment section (e.g. login required).

## 7. Adding a NEW app (checklist)

1. `apps/<new>/package.json` → `"@yumipos/djiwa-checkout-ui": "workspace:*"`.
2. `apps/<new>/src/main.tsx` → `import "@yumipos/djiwa-checkout-ui/styles.css";`
3. Build the screen from the canonical flow — no bespoke markup:

```tsx
import { CustomerCheckout, CheckoutSummaryLines } from "@yumipos/djiwa-checkout-ui";

<CustomerCheckout
  mode={step === "review" ? "review" : "payment"}
  step={5} totalSteps={5} eyebrow="Pembayaran" title="Pilih metode pembayaran"
  cart={cart} currency={currency}
  pointsOnly={false}
  editMenu={{ label: "Ubah menu", onClick: () => setStep("menu") }}
  updateQuantity={updateCartQuantity} removeItem={onRemoveItem}
  notesLabel="Catatan" notesPlaceholder="Contoh: tanpa sambal" notes={notes} setNotes={setNotes}
  paymentHeading="Metode pembayaran" paymentOptions={paymentOptions}
  paymentChoice={paymentChoice} setPaymentChoice={setPaymentChoice}
  walletBalance={walletBalance} walletShortage={walletShortage} onTopup={onTopup}
  summary={
    <CheckoutSummaryLines
      currency={currency}
      productGrossSubtotal={productGrossSubtotal}
      freeRefillCharge={freeRefillCharge}
      promoDiscount={promoDiscount}
      djiwaPayDiscount={djiwaPayDiscount}
      djiwaPayDiscountRate={djiwaPayDiscountPercent}   // ← from live settings, never a constant
      shippingFee={shippingFee}
      serviceChargeAmount={serviceChargeAmount} serviceChargeRate={serviceChargeRate}
      taxEnabled={taxEnabled} taxAmount={taxAmount} taxRate={taxRate}
      total={total} paymentChoice={paymentChoice}
    />
  }
  primaryLabel={`Bayar ${currency(total)}`} onPrimary={checkout} busy={isSubmitting}
  busyLabel="Memproses pembayaran..." error={checkoutError}
  onBack={() => setStep("menu")}
/>
```

4. App-specific inputs go in `fields` / `notesExtra` / `orderDetailExtra` using `CheckoutField`,
   `CheckoutInput`, `CheckoutTextarea`, `CheckoutSwitch` — never raw `<input>` with new classes.
5. Prove it with the render harness (§9) before committing.

## 8. Updating an EXISTING app

- Keep the business logic in the route file; replace only the presentation with the canonical flow.
- If an app shows a different fee set, map it to the props; do not add a local fee table.
- After the change the app's rendered labels must match §2 exactly — diff them (§9).

## 9. Verification recipe (mandatory before commit)

```bash
# 1. shared package must typecheck clean
bun run tsc --noEmit -p packages/djiwa-checkout-ui/tsconfig.json

# 2. render the canonical flow in every state and diff the labels
#    (harness: canonical-v2-harness.tsx, states: payment_wallet, review, wallet_shortage,
#     qris_guest, dessert_switch, error_state, busy, empty_cart, tax_on, cashier, no_reward)
bun run <harness>.tsx > out.json      # must print RENDER_OK

# 3. app must not gain new type errors
bun run tsc --noEmit -p apps/<app>/tsconfig.json
```

A commit is only acceptable when: package typecheck is clean, the harness renders every state, and
the touched app gains **zero** new type errors.

## 10. Known pre-existing issues (do not attribute to checkout work)

- `apps/*/src/components/ui/sonner.tsx` — missing `next-themes`.
- `apps/customer/src/routes/$username/notifikasi.lazy.tsx` — passes unsupported `action` prop.
- `apps/customer/src/routes/$username/order.lazy.tsx:464` — arity mismatch (pre-existing).
- `apps/ordermieyamin` — missing props in `CheckoutSectionProps`, `DAY_MS` undefined,
  `use-hybrid-pos-data` cache options. Treat as a separate backlog item.
