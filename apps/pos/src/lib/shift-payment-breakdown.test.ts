import { describe, expect, it } from "vitest";
import {
  calculateBreakdownTotal,
  calculateShiftPaymentBreakdown,
  classifyShiftPaymentChannel,
} from "./shift-payment-breakdown";

describe("shift payment breakdown", () => {
  it("classifies direct and online channels from source metadata", () => {
    expect(classifyShiftPaymentChannel({ source: "pos", paymentMethod: "tunai", totalAmount: 100 })).toBe("tunai_kasir");
    expect(classifyShiftPaymentChannel({ source: "pos", paymentMethod: "qris", orderType: "online", platform: "grab", totalAmount: 100 })).toBe("grabfood");
    expect(classifyShiftPaymentChannel({ source: "pos", paymentMethod: "qris", orderType: "online", totalAmount: 100 })).toBe("online_unmapped");
    expect(classifyShiftPaymentChannel({ source: "customer_self_service", paymentMethod: "cash", paymentReceiptKind: "cashier", totalAmount: 100 })).toBe("djiwaapp_bayar_kasir");
    expect(classifyShiftPaymentChannel({ source: "customer_self_service", paymentMethod: "djiwaapp", paymentReceiptKind: "gateway_paid", totalAmount: 100 })).toBe("djiwaapp_qris");
  });

  it("only counts settled orders and ignores unknown channels", () => {
    const result = calculateShiftPaymentBreakdown([
      { status: "paid", source: "pos", paymentMethod: "tunai", totalAmount: 100 },
      { status: "pending", source: "pos", paymentMethod: "tunai", totalAmount: 999 },
      { status: "completed", source: "pos", paymentMethod: "qris", orderType: "online", platform: "gofood", totalAmount: 200 },
    ]);
    expect(result.tunai_kasir).toBe(100);
    expect(result.gofood).toBe(200);
  });

  it("computes cash denominations including zero", () => {
    expect(calculateBreakdownTotal({ bill100000: 1, bill5000: 1, bill100: 2 })).toBe(105200);
  });
});
