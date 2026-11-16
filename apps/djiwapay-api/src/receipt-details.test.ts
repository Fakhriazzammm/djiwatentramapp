import { describe, expect, test } from "bun:test";
import { parseReceipt } from "./receipt";
import { reconcileReceipt } from "./receipt-document";

export const printed = {
  merchant: "Kedai Uji", purchasedAt: "2026-11-15T18:30", currency: "IDR", subtotal: 45000, discount: 5000, total: 44500,
  items: [{ name: "Kopi", qty: 2, unit: "cup", unitPrice: 15000, discount: 0, price: 30000 }, { name: "Roti", qty: 1.5, unit: "kg", unitPrice: 10000, discount: 0, price: 15000 }],
  charges: [{ label: "PB1 10%", kind: "tax", amount: 4000, included: false }, { label: "Layanan", kind: "service", amount: 500, included: false }],
  tendered: 50000, change: 5500, confidence: .98, warnings: [],
};

describe("complete receipt document", () => {
  test("a combo keeps its contents without charging them a second time", () => {
    const r = parseReceipt(JSON.stringify({ merchant: "Burger Bangor", reference: "TEST-RECEIPT-001", paymentMethod: "Shopeepay", total: 50001, subtotal: 45455, items: [{ name: "Hemat Duo (C)", qty: 1, unitPrice: 45455, price: 45455, components: [{ name: "BBQ Smoked Beef Cheese", qty: 2 }] }], charges: [{ label: "Pajak", kind: "tax", amount: 4546, included: false }] }), "test");
    expect(r.items[0].components).toEqual([{ name: "BBQ Smoked Beef Cheese", qty: 2, unit: "" }]);
    expect(r.reference).toBe("TEST-RECEIPT-001");
    expect(r.paymentMethod).toBe("Shopeepay");
    expect(reconcileReceipt(r)).toMatchObject({ computed: 50001, valid: true });
  });
  test("preserves fractional quantities, unit prices, line totals and every adjustment", () => {
    const r = parseReceipt(JSON.stringify(printed), "test");
    expect(r.items[1].qty).toBe(1.5);
    expect(r.items[0].unitPrice).toBe(15000);
    expect(r.subtotal).toBe(45000);
    expect(r.discount).toBe(5000);
    expect(r.charges).toHaveLength(2);
    expect(r.tendered).toBe(50000);
    expect(reconcileReceipt(r)).toMatchObject({ computed: 44500, difference: 0, valid: true });
  });
  test("included tax is disclosed without being added a second time", () => {
    const r = parseReceipt(JSON.stringify({ ...printed, subtotal: 45000, discount: 0, total: 45000, tendered: null, change: null, charges: [{ label: "Termasuk PPN", amount: 4500, kind: "tax", included: true }] }), "test");
    expect(reconcileReceipt(r)).toMatchObject({ computed: 45000, valid: true });
  });
  test("does not invent a fee to hide a mismatch", () => {
    const r = parseReceipt(JSON.stringify({ ...printed, total: 47000 }), "test");
    expect(r.charges).toHaveLength(2);
    expect(reconcileReceipt(r)).toMatchObject({ difference: 2500, valid: false });
  });
  test("unknown line amount is retained for review, not silently discarded", () => {
    const r = parseReceipt(JSON.stringify({ ...printed, items: [{ name: "Tidak terbaca", qty: null, unitPrice: null, price: null }] }), "test");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].price).toBeNull();
    expect(reconcileReceipt(r).valid).toBe(false);
  });
  test("catches item multiplication errors even when the grand total balances", () => {
    const r = parseReceipt(JSON.stringify({ ...printed, items: [{ name: "Kopi", qty: 3, unitPrice: 15000, price: 30000 }, printed.items[1]] }), "test");
    expect(reconcileReceipt(r).valid).toBe(false);
  });
  test("item discount, receipt discount and signed rounding each count once", () => {
    const r = parseReceipt(JSON.stringify({ ...printed, items: [{ name: "Kopi", qty: 2, unitPrice: 15000, discount: 1000, price: 29000 }], subtotal: 29000, discount: 2000, total: 26999, tendered: null, change: null, charges: [{ label: "Pembulatan", kind: "rounding", amount: -1, included: false }] }), "test");
    expect(reconcileReceipt(r)).toMatchObject({ computed: 26999, valid: true });
    expect(reconcileReceipt({ ...r, subtotal: 30000, subtotalBeforeItemDiscounts: true })).toMatchObject({ computed: 26999, valid: true });
  });
  test("legacy rows keep their actual recorded tax and do not invent unit prices", () => {
    const r = parseReceipt(JSON.stringify({ merchant: "Lama", total: 11000, tax: 1000, items: [{ name: "Kopi", qty: 2, price: 10000 }] }), "legacy");
    expect(r.items[0].unitPrice).toBeNull();
    expect(reconcileReceipt(r)).toMatchObject({ computed: 11000, valid: true });
  });
});
