import { describe, expect, test } from "bun:test";
import { formatPaymentLabel } from "@yumipos/web-shared/lib/payment-label";

describe("payment provenance labels", () => {
  test.each([
    [{ source: "customer_self_service", paymentMethod: "cash" }, "Djiwa App - Bayar Tunai di Kasir"],
    [{ source: "customer_self_service", paymentMethod: "wallet" }, "Djiwa App - Djiwa Pay"],
    [{ source: "customer_self_service", paymentMethod: "qris" }, "Djiwa App - QRIS"],
    [{ source: "pos", paymentMethod: "cash" }, "Bayar Tunai di Kasir"],
    [{ source: "pos", paymentMethod: "qris" }, "QRIS"],
    [{ source: "pos", paymentMethod: "wallet" }, "Djiwa Pay"],
  ])("maps %j", (input, expected) => {
    expect(formatPaymentLabel(input)).toBe(expected);
  });

  test("does not guess ambiguous legacy djiwaapp without gateway evidence", () => {
    expect(formatPaymentLabel({ source: "customer_self_service", paymentMethod: "djiwaapp" })).toBe("Djiwa App - Metode pembayaran lama");
  });
});
