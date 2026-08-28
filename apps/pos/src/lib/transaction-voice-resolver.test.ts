import { describe, expect, it } from "bun:test";
import { resolveTransactionVoice } from "./transaction-voice-resolver";

describe("transaction voice resolver", () => {
  it("uses one short voice for POS cashier orders", () => {
    expect(resolveTransactionVoice({
      eventKey: "pos-order:1:created",
      source: "pos",
      eventType: "pos_created",
      orderId: "1",
    })).toEqual({
      eventKey: "pos-order:1:created",
      text: "Pesanan baru diterima.",
    });
  });

  const cases: Array<["wallet" | "qris" | "cashier", string]> = [
    ["wallet", "Pesanan DjiwaApp atas nama Fakhri sudah dibayar melalui Djiwa Pay."],
    ["qris", "Pesanan DjiwaApp atas nama Fakhri sudah dibayar melalui QRIS."],
    ["cashier", "Pesanan baru DjiwaApp atas nama Fakhri, menunggu pembayaran di kasir."],
  ];

  for (const [paymentMethod, text] of cases) {
    it(`maps DjiwaApp ${paymentMethod} voice`, () => {
      const eventType = paymentMethod === "cashier" ? "order_cashier_pending" : "order_paid";
      expect(resolveTransactionVoice({
        eventKey: `order:1:${eventType}`,
        source: "customer_self_service",
        eventType,
        paymentMethod,
        orderId: "1",
        customerName: "Fakhri",
      })).toEqual({
        eventKey: `order:1:${eventType}`,
        text,
      });
    });
  }

  it("falls back to a generic voice when customer name is missing", () => {
    expect(resolveTransactionVoice({
      eventKey: "order:1:order_paid",
      source: "customer_self_service",
      eventType: "order_paid",
      paymentMethod: "qris",
      orderId: "1",
    }).text).toBe("Pesanan DjiwaApp sudah dibayar melalui QRIS.");
  });
});
