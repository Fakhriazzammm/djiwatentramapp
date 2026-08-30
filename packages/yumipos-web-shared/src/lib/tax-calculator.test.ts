import { describe, expect, it } from "bun:test";
import {
  calculateOrderTax,
  resolvePaymentChannel,
  roundRupiah,
  roundToThousandHalfDown,
  validateTaxRate,
} from "./tax-calculator";

describe("rounding helpers", () => {
  it("rounds tax and service components to whole rupiah", () => {
    expect(roundRupiah(1234.4)).toBe(1234);
    expect(roundRupiah(1234.5)).toBe(1235);
  });

  it("always rounds down to the previous Rp1,000", () => {
    expect(roundToThousandHalfDown(20120)).toBe(20000);
    expect(roundToThousandHalfDown(20500)).toBe(20000);
    expect(roundToThousandHalfDown(20600)).toBe(20000);
    expect(roundToThousandHalfDown(20999)).toBe(20000);
  });
});

describe("validateTaxRate", () => {
  it("accepts zero and ordinary percentage rates", () => {
    expect(validateTaxRate(0)).toEqual({ valid: true });
    expect(validateTaxRate(11)).toEqual({ valid: true });
    expect(validateTaxRate(100)).toEqual({ valid: true });
  });

  it("rejects negative, non-finite, and excessive rates", () => {
    expect(validateTaxRate(-1).valid).toBe(false);
    expect(validateTaxRate(Number.NaN).valid).toBe(false);
    expect(validateTaxRate(Number.POSITIVE_INFINITY).valid).toBe(false);
    expect(validateTaxRate(100.01).valid).toBe(false);
  });
});

describe("calculateOrderTax", () => {
  it("uses subtotal after discount as tax base and excludes service charge", () => {
    const result = calculateOrderTax({
      items: [
        { price: 60_000, quantity: 1 },
        { price: 50_000, quantity: 1 },
      ],
      discountAmount: 10_000,
      taxRate: 11,
      serviceChargeRate: 5,
      source: "pos",
      paymentMethod: "qris",
    });

    expect(result.productSubtotal).toBe(110_000);
    expect(result.subtotalAfterDiscount).toBe(100_000);
    expect(result.taxBase).toBe(100_000);
    expect(result.serviceChargeBase).toBe(100_000);
    expect(result.serviceChargeAmount).toBe(5_000);
    expect(result.taxAmount).toBe(11_000);
    expect(result.rawTotal).toBe(116_000);
    expect(result.finalTotal).toBe(116_000);
    expect(result.roundingAdjustment).toBe(0);
  });

  it("does not subtract an item promotion twice", () => {
    const result = calculateOrderTax({
      // 90,000 is already the discounted item price; only the voucher is extra.
      items: [{ price: 90_000, quantity: 1 }],
      voucherDiscountAmount: 10_000,
      taxRate: 10,
      serviceChargeRate: 0,
    });

    expect(result.productSubtotal).toBe(90_000);
    expect(result.voucherDiscount).toBe(10_000);
    expect(result.subtotalAfterDiscount).toBe(80_000);
    expect(result.taxAmount).toBe(8_000);
  });

  it("exempts POS cash and customer cashier payment channels", () => {
    const posCash = calculateOrderTax({
      items: [{ price: 100_000, quantity: 1 }],
      taxRate: 11,
      serviceChargeRate: 5,
      source: "pos",
      paymentMethod: "tunai",
    });
    const customerCash = calculateOrderTax({
      items: [{ price: 100_000, quantity: 1 }],
      taxRate: 11,
      serviceChargeRate: 5,
      source: "customer_self_service",
      paymentChoice: "cashier",
      paymentReceiptKind: "cashier_pending",
    });

    for (const result of [posCash, customerCash]) {
      expect(result.isTaxExempt).toBe(true);
      expect(result.taxAmount).toBe(0);
      expect(result.serviceChargeAmount).toBe(0);
      expect(result.taxExemptionReason).toBe("cashier_payment_channel");
    }
  });

  it("applies policy rates to POS QRIS, customer Mayar QRIS, and wallet", () => {
    const inputs = [
      { source: "pos" as const, paymentMethod: "qris" },
      { source: "customer" as const, paymentChoice: "mayar" },
      { source: "customer_self_service" as const, paymentMethod: "wallet" },
    ];

    for (const input of inputs) {
      const result = calculateOrderTax({
        ...input,
        items: [{ price: 100_000, quantity: 1 }],
        taxRate: 11,
        serviceChargeRate: 5,
      });
      expect(result.isTaxExempt).toBe(false);
      expect(result.taxAmount).toBe(11_000);
      expect(result.serviceChargeAmount).toBe(5_000);
    }
  });

  it("clamps discounts at zero and supports a zero-rate policy", () => {
    const result = calculateOrderTax({
      items: [{ price: 10_000, quantity: 1 }],
      discountAmount: 20_000,
      taxRate: 0,
      serviceChargeRate: 0,
    });

    expect(result.subtotalAfterDiscount).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.serviceChargeAmount).toBe(0);
    expect(result.finalTotal).toBe(0);
  });

  it("exposes canonical payment-channel names", () => {
    expect(resolvePaymentChannel({ source: "pos", paymentMethod: "cash" })).toBe("pos_cashier_cash");
    expect(resolvePaymentChannel({ source: "pos", paymentMethod: "qris_mayar" })).toBe("pos_cashier_qris");
    expect(resolvePaymentChannel({ source: "customer", paymentMethod: "qris" })).toBe("customer_qris");
    expect(resolvePaymentChannel({ source: "customer", paymentMethod: "wallet" })).toBe("customer_wallet");
    expect(resolvePaymentChannel({ source: "customer", paymentReceiptKind: "cashier_pending" })).toBe("customer_cashier");
  });
});
