import { describe, expect, test } from "bun:test";
import { heatLevel, summarizeMonth, summaryCategory } from "../src/lib/djiwa-pay-summary";
import type { WalletTransaction } from "../src/lib/wallet-adapter";

const tx = (over: Partial<WalletTransaction>): WalletTransaction => ({ id: 1, transfer_id: null, direction: "debit", category: "payment", type: "order_debit", amount: 1000, balance_after: 0, status: "success", counterparty_name: null, counterparty_phone: null, reference_type: null, reference_id: null, note: null, created_at: "2026-11-05T10:00:00+07:00", ...over } as WalletTransaction);

describe("monthly summary", () => {
  test("sums only successful debits of the requested month", () => {
    const list = [tx({ amount: 5000 }), tx({ id: 2, amount: 2500, created_at: "2026-11-05T12:00:00+07:00" }), tx({ id: 3, amount: 9999, created_at: "2026-10-30T12:00:00+07:00" }), tx({ id: 4, amount: 700, status: "failed" }), tx({ id: 5, direction: "credit", category: "topup", type: "topup_completed", amount: 50000 })];
    const s = summarizeMonth(list, 2026, 10);
    expect(s.out).toBe(7500);
    expect(s.in).toBe(50000);
    expect(s.perDay[4]).toBe(7500);
    expect(s.perDay).toHaveLength(30);
  });
  test("groups spending into categories with percentages", () => {
    const s = summarizeMonth([tx({ amount: 3000 }), tx({ id: 2, type: "wallet_transfer_sent", category: "transfer", amount: 1000 })], 2026, 10);
    expect(s.categories.map((c) => [c.key, c.percent])).toEqual([["order", 75], ["transfer", 25]]);
  });
  test("handles an empty month", () => {
    const s = summarizeMonth([], 2026, 10);
    expect(s.out).toBe(0);
    expect(s.categories).toEqual([]);
  });
  test("heat levels scale against the busiest day", () => {
    expect([0, 10, 30, 60, 100].map((v) => heatLevel(v, 100))).toEqual([0, 1, 2, 3, 4]);
    expect(heatLevel(5, 0)).toBe(0);
  });
  test("classifies spending", () => {
    expect(summaryCategory({ type: "wallet_transfer_sent", category: "transfer" }).key).toBe("transfer");
    expect(summaryCategory({ type: "x", category: "direct", direct: true }).key).toBe("payment");
  });
});
