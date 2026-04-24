import { describe, expect, it } from "bun:test";
import {
  buildPublicOrderRow,
  buildPublicOrderSettlementTransaction,
  buildPublicShiftRow,
  buildPublicShiftStartTransaction,
  extractPublicHomePin,
} from "../public-pos-write-helpers";

describe("public POS write helpers", () => {
  it("maps cashier order writes to public pos_orders columns", () => {
    const row = buildPublicOrderRow({
      args: {
        totalAmount: 42000,
        paymentMethod: "tunai",
        customerName: "Faz",
        orderType: "dine_in",
        source: "pos",
        items: [
          {
            productId: "prod_1",
            productName: "Kopi Susu",
            quantity: 2,
            price: 21000,
          },
        ],
      },
      orderId: "order_123",
      orderNumber: "ORD-D-ABC123",
      orderCreatedAt: 1712345678901,
      status: "paid",
    });

    expect(row).toEqual({
      _id: "order_123",
      _creationTime: 1712345678901,
      orderNumber: "ORD-D-ABC123",
      totalAmount: 42000,
      status: "paid",
      paymentMethod: "tunai",
      customerName: "Faz",
      tableNumber: null,
      orderType: "dine_in",
      source: "pos",
      brandSlug: null,
      guestCount: null,
      freeRefillSelected: null,
      dessertLater: null,
      notes: null,
      createdAt: 1712345678901,
      voucherId: null,
      discountAmount: null,
      taxAmount: null,
      serviceChargeAmount: null,
      receiptMeta: null,
      paymentReceiptKind: null,
      paymentGateway: null,
      gatewayInvoiceId: null,
      items: [
        {
          productId: "prod_1",
          productName: "Kopi Susu",
          quantity: 2,
          price: 21000,
          variant: null,
          originalPrice: null,
          status: null,
          hppSnapshot: null,
        },
      ],
    });
  });

  it("maps settlement transaction to public pos_financial_transactions columns", () => {
    const tx = buildPublicOrderSettlementTransaction({
      args: { totalAmount: 42000, paymentMethod: "tunai" },
      orderId: "order_123",
      orderNumber: "ORD-D-ABC123",
      transactionId: "fin_123",
      transactionDate: 1712345678901,
    });

    expect(tx).toEqual({
      _id: "fin_123",
      type: "income",
      amount: 42000,
      category: "Penjualan",
      merchant: null,
      description: "Penjualan Pesanan #ORD-D-ABC123",
      date: 1712345678901,
      paymentMethod: "tunai",
      status: "completed",
      orderId: "order_123",
      bookingOrderId: null,
      attachmentUrl: null,
      sourceFingerprint: null,
      isRecurring: false,
      recurringInterval: null,
      tags: [],
      metadata: { kind: "order_settlement", orderId: "order_123" },
    });
  });

  it("maps shift writes to public pos_shifts columns", () => {
    const row = buildPublicShiftRow({
      args: {
        shiftName: "Shift Pagi",
        cashierName: "Ayunda",
        teamMembers: "Isan",
        startingCash: 50000,
        notes: "Mulai operasional",
      },
      shiftId: "shift_123",
      startTime: 1712345678901,
    });

    expect(row).toEqual({
      _id: "shift_123",
      shiftName: "Shift Pagi",
      cashierName: "Ayunda",
      teamMembers: "Isan",
      startTime: 1712345678901,
      endTime: null,
      startingCash: 50000,
      notes: "Mulai operasional",
      summary: null,
      cashBreakdown: null,
      nonCashExpected: null,
      nonCashConfirmed: null,
      endingCashExpected: null,
      endingCashPhysical: null,
      raw: {
        shiftName: "Shift Pagi",
        cashierName: "Ayunda",
        teamMembers: "Isan",
        startingCash: 50000,
        notes: "Mulai operasional",
      },
    });
  });

  it("maps opening cash transaction to public columns", () => {
    const tx = buildPublicShiftStartTransaction({
      args: {
        shiftName: "Shift Pagi",
        cashierName: "Ayunda",
        teamMembers: "Isan",
        startingCash: 50000,
        notes: "Mulai operasional",
      },
      shiftId: "shift_123",
      transactionId: "fin_456",
      startTime: 1712345678901,
      metadata: { source: "shift_open" },
    });

    expect(tx.type).toBe("income");
    expect(tx.amount).toBe(50000);
    expect(tx.paymentMethod).toBe("tunai");
    expect(tx.metadata).toEqual({ source: "shift_open" });
    expect(tx.description).toContain("Kasir: Ayunda");
    expect(tx.description).toContain("Shift: Shift Pagi");
  });

  it("extracts home pin from public raw payload", () => {
    expect(extractPublicHomePin({ homePin: " 123456 " })).toBe("123456");
    expect(extractPublicHomePin({ nope: true })).toBe("");
    expect(extractPublicHomePin(null)).toBe("");
  });
});
