import { describe, expect, test } from "bun:test";
import { parseReceipt, parseWhen } from "./receipt.js";
import { normalizeReceiptDocument, reconcileReceipt } from "./receipt-document.js";

/** What the reader should return for real Japanese receipts (photos sent for the foreign-receipt work). Totals are what is printed. */
const NOW = new Date("2026-11-24T00:00:00Z");
const read = (j: unknown) => parseReceipt(JSON.stringify(j), "test", NOW);
const item = (name: string, nameOriginal: string, price: number, extra: Record<string, unknown> = {}) => ({ name, nameOriginal, qty: 1, unit: "", unitPrice: price, discount: 0, price, categoryId: "makan", confidence: 0.95, components: [], ...extra });

describe("foreign receipts", () => {
  test("Saizeriya: tax already inside the price, paid cash", () => {
    const r = read({ kind: "itemized", language: "ja", merchant: "Saizeriya", merchantOriginal: "サイゼリヤ", currency: "JPY", purchasedAt: "2025-11-25T13:14", subtotal: 1200, total: 1200,
      items: [item("Arrosticini", "アロスティチーニ", 400), item("Ayam keju panggang", "柔らかチキンのチーズ焼", 500), item("Tiramisu klasik", "ティラミスクラシコ", 300)],
      charges: [{ label: "Pajak 10%", labelOriginal: "内税額", kind: "tax", amount: 109, included: true }], tendered: 5000, change: 3800, warnings: [], confidence: 0.95 });
    expect(r.currency).toBe("JPY"); expect(r.language).toBe("ja"); expect(r.merchantOriginal).toBe("サイゼリヤ"); expect(r.items[0].nameOriginal).toBe("アロスティチーニ");
    expect(reconcileReceipt(r).valid).toBe(true);
    expect(r.purchasedAt).toBe("2025-11-25T04:14:00.000Z");   // 13:14 in Japan
  });
  test("MiniStop: a discount printed under an item belongs to that item; tax outside the price", () => {
    const r = read({ kind: "itemized", language: "ja", merchant: "MINI STOP Matsudo", currency: "JPY", purchasedAt: "2025-11-25T19:36", subtotal: 1328, total: 1434,
      items: [item("Kimbap 5", "キンパ風巻寿司5巻", 214, { unitPrice: 358, discount: 144 }), item("Soba", "海老入り野菜かき揚げソバ", 298, { unitPrice: 498, discount: 200 }), item("Gyudon", "牛丼", 358, { unitPrice: 598, discount: 240 }), item("Bento", "タルタルチキン南蛮弁当", 358, { unitPrice: 598, discount: 240 }), item("Salad", "国産4種野菜ノコールスロー", 100, { unitPrice: 168, discount: 68 })],
      charges: [{ label: "Pajak 8%", labelOriginal: "外税 8%", kind: "tax", amount: 106, included: false }], warnings: [], confidence: 0.9 });
    expect(r.items.reduce((s, i) => s + (i.price ?? 0), 0)).toBe(1328);
    expect(reconcileReceipt(r).valid).toBe(true);
  });
  test("Book Off: tourist tax exemption is a negative charge and a handling fee a positive one", () => {
    const r = read({ kind: "itemized", language: "ja", merchant: "Book Off", currency: "JPY", purchasedAt: "2025-11-25T15:10", subtotal: 25850, total: 24205,
      items: [item("Jam Seiko", "SEIKO", 3300), item("Jam Orient", "ORIENT", 2750), item("Jam Seiko 2", "SEIKO", 5500), item("Jam Citizen", "CITIZEN", 4400), item("Jam Seiko 3", "SEIKO", 5500), item("Jam Citizen 2", "CITIZEN", 4400)],
      charges: [{ label: "Bebas pajak", labelOriginal: "免税額", kind: "taxfree", amount: -2350, included: false }, { label: "Biaya pengurusan", labelOriginal: "免税手数料", kind: "other", amount: 705, included: false }], warnings: [], confidence: 0.9 });
    expect(reconcileReceipt(r).problems).toEqual([]);
  });
  test("card slip: no items on the paper, one line is made so it can be recorded", () => {
    const r = normalizeReceiptDocument({ kind: "card-slip", language: "ja", merchant: "JJT Store Ameyoko", currency: "JPY", total: 989, items: [], cardNote: "537941******9473" });
    expect(r.items).toHaveLength(1); expect(r.items[0].price).toBe(989); expect(r.cardNote).toBe("537941******9473");
    expect(reconcileReceipt(r).valid).toBe(true);
  });
  test("transit top-up: deposit and charge are two lines", () => {
    const r = normalizeReceiptDocument({ kind: "topup", language: "ja", merchant: "JR East", currency: "JPY", total: 1000, items: [item("Setoran jaminan", "デポジット", 500), item("Isi ulang", "チャージ", 500)] });
    expect(r.kind).toBe("topup"); expect(reconcileReceipt(r).valid).toBe(true);
  });
  test("a currency code is required but any ISO code is allowed; garbage is not", () => {
    expect(reconcileReceipt(normalizeReceiptDocument({ merchant: "x", currency: "USD", total: 5, items: [item("a", "", 5)] })).valid).toBe(true);
    expect(reconcileReceipt(normalizeReceiptDocument({ merchant: "x", currency: "yen", total: 5, items: [item("a", "", 5)] })).valid).toBe(false);
  });
  test("fx must carry a rate and a day", () => {
    expect(normalizeReceiptDocument({ fx: { rate: 106.34, date: "2025-11-25", source: "frankfurter" } }).fx?.rate).toBe(106.34);
    expect(normalizeReceiptDocument({ fx: { rate: 0, date: "2025-11-25" } }).fx).toBeUndefined();
    expect(normalizeReceiptDocument({ fx: { rate: 106, date: "bad" } }).fx).toBeUndefined();
  });
  test("times use the receipt's own zone", () => {
    expect(new Date(parseWhen("2025-11-25T13:14", 9)).toISOString()).toBe("2025-11-25T04:14:00.000Z");
    expect(new Date(parseWhen("2025-11-25T13:14")).toISOString()).toBe("2025-11-25T06:14:00.000Z");
  });
});
