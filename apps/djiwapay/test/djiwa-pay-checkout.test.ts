import { describe, expect, test } from "bun:test";
import {
  checkoutStep,
  isSettledPpob,
  paymentLabel,
  preferredPaymentMethod,
  validateCustomerNumber,
  walletPaymentState,
} from "../src/lib/djiwa-pay-checkout";
import { parseCheckoutDraft, serializeCheckoutDraft } from "../src/lib/djiwa-pay-draft";

describe("Djiwa Pay checkout presentation contract", () => {
  test.each([
    ["topup", "detail", 1],
    ["topup", "payment", 2],
    ["topup", "status", 3],
    ["ppob", "detail", 1],
    ["ppob", "payment", 2],
    ["ppob", "status", 3],
  ] as const)("maps %s %s to step %d", (kind, stage, expected) => {
    expect(checkoutStep(kind, stage)).toEqual({ step: expected, totalSteps: 3 });
  });

  test("uses a business-accurate primary label", () => {
    expect(paymentLabel("topup", "mayar", 50000)).toBe("Lanjutkan ke QRIS");
    expect(paymentLabel("ppob", "wallet", 12500)).toBe("Bayar dengan Djiwa Pay · Rp 12.500");
    expect(paymentLabel("ppob", "mayar", 12500)).toBe("Lanjutkan ke QRIS · Rp 12.500");
  });

  test.each([
    [100000, 50000, { disabled: false, shortage: 0 }],
    [50000, 50000, { disabled: false, shortage: 0 }],
    [49999, 50000, { disabled: true, shortage: 1 }],
  ])("describes wallet balance state", (balance, total, expected) => {
    expect(walletPaymentState(balance, total)).toEqual(expected);
  });

  test("only treats a provider success as settled", () => {
    expect(isSettledPpob({ success: true, status: "success" })).toBe(true);
    expect(isSettledPpob({ success: true, status: "pending" })).toBe(false);
    expect(isSettledPpob({ success: false, status: "failed" })).toBe(false);
  });

  test("validates customer numbers before advancing to payment", () => {
    expect(validateCustomerNumber("")).toEqual({ valid: false, message: "Masukkan nomor tujuan." });
    expect(validateCustomerNumber("08123")).toEqual({ valid: false, message: "Nomor tujuan harus 8–20 digit." });
    expect(validateCustomerNumber("081234567890")).toEqual({ valid: true, message: null });
  });

  test("chooses QRIS when wallet balance cannot cover PPOB", () => {
    expect(preferredPaymentMethod("ppob", "wallet", 10000, 20000)).toBe("mayar");
    expect(preferredPaymentMethod("ppob", "wallet", 25000, 20000)).toBe("wallet");
    expect(preferredPaymentMethod("topup", "wallet", 20000, 25000)).toBe("mayar");
  });

  test("serializes and parses a checkout draft without losing the return flow", () => {
    const draft = {
      kind: "ppob" as const,
      productCode: "TSEL5",
      category: "pulsa",
      customerNumber: "081234567890",
      amount: 20000,
      invoiceId: "inv_123",
      pending: true,
      paymentMethod: "mayar" as const,
      returnTo: "/ppob/pulsa/produk/TSEL5/konfirmasi",
    };
    expect(parseCheckoutDraft(serializeCheckoutDraft(draft))).toEqual(draft);
    expect(parseCheckoutDraft("not-json")).toBeNull();
  });
});
