import { normalizePaymentMethod } from "./payment-contract";

/**
 * Canonical, framework-free order tax calculator shared by POS, Admin, and Customer.
 *
 * Prices on items are assumed to already include any item-level/promotion discount.
 * `discountAmount` is therefore only an additional eligible (for example voucher)
 * discount and is applied once to the product subtotal.
 */

export type TaxSource = "pos" | "customer" | "customer_self_service" | (string & {});

export type PaymentChannelCanonical =
  | "pos_cashier_cash"
  | "pos_cashier_qris"
  | "customer_qris"
  | "customer_wallet"
  | "customer_cashier"
  | "unknown";

export interface TaxCalculationItem {
  price: number;
  quantity: number;
}

export interface TaxCalculationInput {
  /** Canonical source is line items; subtotal is accepted for already-aggregated callers. */
  items?: readonly TaxCalculationItem[];
  subtotal?: number;
  /** Additional eligible discount. Item-level/promo discounts must not be repeated here. */
  discountAmount?: number;
  discount?: number;
  /** Explicit alias for discountAmount, useful when the source is a voucher. */
  voucherDiscountAmount?: number;
  /** Explicit policy switch; false disables tax regardless of configured rate. */
  taxEnabled?: boolean;
  taxRate: number;
  serviceChargeRate: number;
  source?: TaxSource;
  paymentMethod?: string | null;
  paymentChoice?: string | null;
  paymentReceiptKind?: string | null;
}

export interface TaxCalculation {
  productSubtotal: number;
  subtotalAfterDiscount: number;
  promoDiscount: number;
  voucherDiscount: number;
  taxBase: number;
  taxRate: number;
  taxAmount: number;
  serviceChargeRate: number;
  serviceChargeBase: number;
  serviceChargeAmount: number;
  rawTotal: number;
  finalTotal: number;
  roundingAdjustment: number;
  paymentChannelCanonical: PaymentChannelCanonical;
  taxExemptionReason: string | null;
  isTaxExempt: boolean;
}

export interface TaxRateValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_TAX_RATE = 100;
const MAX_ITEM_AMOUNT = Number.MAX_SAFE_INTEGER;

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function finiteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`);
  }
  return value;
}

/** Round a monetary component to the nearest whole rupiah. */
export function roundRupiah(value: number): number {
  finiteNonNegative(value, "amount");
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Validate a percentage rate before it reaches the calculator or a server boundary. */
export function validateTaxRate(rate: number): TaxRateValidationResult {
  if (!Number.isFinite(rate)) {
    return { valid: false, error: "Rate harus berupa angka finite" };
  }
  if (rate < 0) {
    return { valid: false, error: "Rate tidak boleh negatif" };
  }
  if (rate > MAX_TAX_RATE) {
    return { valid: false, error: `Rate tidak boleh lebih dari ${MAX_TAX_RATE}%` };
  }
  return { valid: true };
}

function assertValidRate(rate: number, field: string): void {
  const result = validateTaxRate(rate);
  if (!result.valid) throw new RangeError(`${field}: ${result.error}`);
}

/** Always rounds down to the previous Rp1,000 boundary. */
export function roundToThousandHalfDown(amount: number): number {
  finiteNonNegative(amount, "amount");
  const floor = Math.floor(amount / 1000) * 1000;
  return floor;
}

/** Resolve payment provenance before applying the cashier-cash exemption. */
export function resolvePaymentChannel(input: Pick<TaxCalculationInput, "source" | "paymentMethod" | "paymentChoice" | "paymentReceiptKind">): PaymentChannelCanonical {
  const source = normalized(input.source);
  const choice = normalized(input.paymentChoice);
  const canonical = normalizePaymentMethod({
    paymentMethod: input.paymentMethod,
    paymentReceiptKind: input.paymentReceiptKind,
  });

  if (source === "pos") {
    if (canonical === "cashier_cash") return "pos_cashier_cash";
    if (canonical === "qris_mayar") return "pos_cashier_qris";
  }

  if (source === "customer" || source === "customer_self_service") {
    if (choice === "wallet" || canonical === "djiwa_pay") return "customer_wallet";
    if (choice === "cashier" || canonical === "cashier_cash") return "customer_cashier";
    if (choice === "mayar" || canonical === "qris_mayar") return "customer_qris";
  }

  return "unknown";
}

function isCashierExempt(channel: PaymentChannelCanonical): boolean {
  return channel === "pos_cashier_cash" || channel === "customer_cashier";
}

export function calculateOrderTax(input: TaxCalculationInput): TaxCalculation {
  assertValidRate(input.taxRate, "taxRate");
  assertValidRate(input.serviceChargeRate, "serviceChargeRate");

  const items = input.items ?? [];
  const productSubtotal = (input.subtotal ?? items.reduce((sum, item, index) => {
    const price = finiteNonNegative(item.price, `items[${index}].price`);
    const quantity = finiteNonNegative(item.quantity, `items[${index}].quantity`);
    const line = price * quantity;
    if (!Number.isSafeInteger(line) && line > MAX_ITEM_AMOUNT) {
      throw new RangeError(`items[${index}] amount is too large`);
    }
    return sum + line;
  }, 0));
  finiteNonNegative(productSubtotal, "subtotal");

  const voucherDiscount = finiteNonNegative(
    input.voucherDiscountAmount ?? input.discountAmount ?? input.discount ?? 0,
    "discountAmount",
  );
  const subtotalAfterDiscount = Math.max(0, productSubtotal - voucherDiscount);
  const channel = resolvePaymentChannel(input);
  const isTaxExempt = isCashierExempt(channel);
  const effectiveTaxRate = input.taxEnabled === false || isTaxExempt ? 0 : input.taxRate;
  const effectiveServiceRate = isTaxExempt ? 0 : input.serviceChargeRate;

  // Service charge is deliberately excluded from the tax base by policy.
  const taxBase = subtotalAfterDiscount;
  const serviceChargeBase = subtotalAfterDiscount;
  const serviceChargeAmount = roundRupiah(serviceChargeBase * (effectiveServiceRate / 100));
  const taxAmount = roundRupiah(taxBase * (effectiveTaxRate / 100));
  const rawTotal = subtotalAfterDiscount + serviceChargeAmount + taxAmount;
  const finalTotal = roundToThousandHalfDown(rawTotal);

  return {
    productSubtotal,
    subtotalAfterDiscount,
    promoDiscount: 0,
    voucherDiscount,
    taxBase,
    taxRate: effectiveTaxRate,
    taxAmount,
    serviceChargeRate: effectiveServiceRate,
    serviceChargeBase,
    serviceChargeAmount,
    rawTotal,
    finalTotal,
    roundingAdjustment: finalTotal - rawTotal,
    paymentChannelCanonical: channel,
    taxExemptionReason: isTaxExempt ? "cashier_payment_channel" : null,
    isTaxExempt,
  };
}
