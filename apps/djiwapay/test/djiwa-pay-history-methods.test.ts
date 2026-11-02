import { describe, expect, test } from "bun:test";
import { paymentMethodLabel, transactionMethodLine, type WalletTransaction } from "../src/lib/wallet-adapter";

const base: WalletTransaction = {
  id: 1,
  transfer_id: null,
  direction: "debit",
  category: "payment",
  type: "order_debit",
  amount: 1000,
  balance_after: 0,
  status: "completed",
  counterparty_name: null,
  counterparty_phone: null,
  reference_type: null,
  reference_id: null,
  note: null,
  created_at: "2026-11-02T10:00:00Z",
};

describe("transaction payment method labels", () => {
  test("names the source of balance movements", () => {
    expect(paymentMethodLabel(base)).toBe("Saldo Djiwa Pay");
    expect(paymentMethodLabel({ ...base, type: "topup_completed", direction: "credit" })).toBe("Mayar");
    expect(paymentMethodLabel({ ...base, type: "transaction_reward", direction: "credit" })).toBe("Reward Djiwa Pay");
    expect(paymentMethodLabel({ ...base, type: "manual_credit", direction: "credit" })).toBe("Penyesuaian admin");
  });

  test("labels gateway-paid orders with their app and method", () => {
    const direct: WalletTransaction = { ...base, id: "travel-1", direct: true, app: "Djiwa Travel", payment_method: "qris", title: "eSIM Japan 1GB" };
    expect(paymentMethodLabel(direct)).toBe("QRIS");
    expect(transactionMethodLine(direct)).toBe("Djiwa Travel · Metode: QRIS");
    expect(paymentMethodLabel({ ...direct, payment_method: "va" })).toBe("Virtual account");
    expect(paymentMethodLabel({ ...direct, payment_method: "" })).toBe("Pembayaran langsung");
  });
});
