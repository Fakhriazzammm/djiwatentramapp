import { describe, expect, test } from "bun:test";
import { checkoutStep, isSettledPpob, paymentLabel, walletPaymentState } from "../src/lib/djiwa-pay-checkout";

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
});
