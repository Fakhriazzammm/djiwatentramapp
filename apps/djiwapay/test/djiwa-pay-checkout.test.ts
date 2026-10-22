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
import { canPollTransaction, normalizePayTransactionStatus, shouldClearTransactionDraft, transactionStatusLabel } from "../src/lib/djiwa-pay-transaction";
import { buildWalletReceivePayload, validateWalletTransfer } from "../src/lib/djiwa-pay-transfer";
import { parseWalletRecipient } from "../src/features/wallet/djiwa-pay-wallet-scanner";
import { validateWalletWithdrawal } from "../src/lib/djiwa-pay-withdrawal";
import { walletQuickActionState } from "../src/lib/djiwa-pay-availability";

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
      invoiceUrl: "https://pay.example/inv_123",
      pending: true,
      status: "pending" as const,
      createdAt: 1_700_000_000_000,
      receipt: { serialNumber: "SN123", reference: "REF123" },
      paymentMethod: "mayar" as const,
      returnTo: "/ppob/pulsa/produk/TSEL5/konfirmasi",
    };
    expect(parseCheckoutDraft(serializeCheckoutDraft(draft))).toEqual(draft);
    expect(parseCheckoutDraft("not-json")).toBeNull();
  });

  test("normalizes provider states into the customer transaction state machine", () => {
    expect(normalizePayTransactionStatus("paid")).toBe("success");
    expect(normalizePayTransactionStatus("processing")).toBe("pending");
    expect(normalizePayTransactionStatus("cancelled")).toBe("failed");
    expect(transactionStatusLabel("pending")).toBe("Sedang diproses");
    expect(canPollTransaction("pending", "inv_123")).toBe(true);
    expect(canPollTransaction("pending", null)).toBe(false);
    expect(shouldClearTransactionDraft("success")).toBe(true);
    expect(shouldClearTransactionDraft("pending")).toBe(false);
  });

  test("validates internal wallet transfer drafts", () => {
    expect(validateWalletTransfer({ recipient: "", amount: 1000, note: "" }).valid).toBe(false);
    expect(validateWalletTransfer({ recipient: "user@example.com", amount: 999, note: "" }).valid).toBe(false);
    expect(validateWalletTransfer({ recipient: "user@example.com", amount: 1000, note: "Bantuan makan" })).toEqual({ valid: true, message: null });
    expect(validateWalletTransfer({ recipient: "user@example.com", amount: 10_000_001, note: "" }).valid).toBe(false);
  });

  test("creates a non-sensitive receive payload", () => {
    expect(buildWalletReceivePayload("cust_123")).toBe("djiwapay://transfer?recipient=cust_123");
    expect(parseWalletRecipient("djiwapay://transfer?recipient=cust_123")).toBe("cust_123");
    expect(parseWalletRecipient("https://example.com/qr?recipient=cust_123")).toBeNull();
  });

  test("validates withdrawal requests without allowing unsafe account data", () => {
    expect(validateWalletWithdrawal({ amount: 9999, bankName: "BCA", accountNumber: "123456", accountName: "A", note: "" }).valid).toBe(false);
    expect(validateWalletWithdrawal({ amount: 10000, bankName: "BCA", accountNumber: "123456", accountName: "Djiwa Tentram", note: "" })).toEqual({ valid: true, message: null });
    expect(validateWalletWithdrawal({ amount: 10000, bankName: "BCA", accountNumber: "abc123", accountName: "Djiwa Tentram", note: "" }).valid).toBe(false);
  });

  test("marks scanner and withdrawal actions as coming soon", () => {
    expect(walletQuickActionState("scan")).toEqual({ supported: false, badge: "Soon" });
    expect(walletQuickActionState("withdraw")).toEqual({ supported: false, badge: "Soon" });
    expect(walletQuickActionState("send")).toEqual({ supported: true, badge: "" });
  });
});
