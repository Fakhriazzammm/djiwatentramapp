import { describe, expect, test } from "bun:test";
import { payoffPlan, weeklyReview, afford, allocate, billsFor, DEFAULT_POCKETS, emergencyFund, forecast, healthScore, loan, monthKey, netWorth, zakatMaal } from "../src/lib/finance/kelola";
import { emptyState, normalize, reduce } from "../src/lib/finance/store";
import type { Bill, Entry } from "../src/lib/finance/types";

const now = new Date(2026, 10, 15, 10); // 15 Nov 2026
const bill = (o: Partial<Bill> = {}): Bill => ({ id: "b1", name: "Listrik PLN", amount: 250_000, day: 20, icon: "flash", tone: "amber", paid: [], ...o });
const entry = (o: Partial<Entry>): Entry => ({ id: Math.random().toString(36), kind: "out", amount: 30_000, categoryId: "makan", accountId: "tunai", at: new Date(2026, 10, 10).toISOString(), note: "", tags: [], source: "manual", createdAt: "", ...o });

describe("bills", () => {
  test("status follows the due date and paid months", () => {
    const v = billsFor([bill({ id: "a", day: 10 }), bill({ id: "b", day: 15 }), bill({ id: "c", day: 18 }), bill({ id: "d", day: 28 }), bill({ id: "e", day: 5, paid: [monthKey(now)] })], now);
    const by = Object.fromEntries(v.map((x) => [x.bill.id, x.status]));
    expect(by).toEqual({ a: "late", b: "today", c: "soon", d: "later", e: "paid" });
    expect(v[v.length - 1].bill.id).toBe("e"); // paid last
  });
  test("day 31 clamps to the month's last day", () => { expect(billsFor([bill({ day: 31 })], new Date(2026, 10, 1))[0].due.getDate()).toBe(30); });
});

describe("forecast", () => {
  test("subtracts daily burn and bills, adds payday", () => {
    const entries = [entry({ amount: 300_000 }), entry({ kind: "in", categoryId: "gaji", amount: 6_000_000, at: new Date(2026, 9, 25).toISOString() })];
    const f = forecast(2_000_000, entries, [bill()], now);
    expect(f.pts[0]).toBe(2_000_000);
    expect(f.events.some((e) => e.label === "Listrik PLN" && e.amount === -250_000)).toBe(true);
    expect(f.events.some((e) => e.label === "Gajian" && e.day === 25)).toBe(true);
    expect(f.pts.length).toBe(16); // 15..30
  });
  test("flags the day cash runs out and a 10% cut helps", () => {
    const entries = [entry({ amount: 3_000_000 })];
    const base = forecast(500_000, entries, [bill()], now), cut = forecast(500_000, entries, [bill()], now, 0.1);
    expect(base.runsOutDay).not.toBeNull();
    expect(cut.end).toBeGreaterThan(base.end);
  });
});

describe("health", () => {
  test("empty data still yields a bounded score with five pillars", () => {
    const h = healthScore({ entries: [], state: emptyState(), cash: 0, now });
    expect(h.pillars).toHaveLength(5);
    expect(h.score).toBeGreaterThanOrEqual(0); expect(h.score).toBeLessThanOrEqual(100);
  });
  test("saving 20% of income maxes the savings pillar", () => {
    const entries = [entry({ kind: "in", categoryId: "gaji", amount: 5_000_000 }), entry({ amount: 4_000_000 })];
    expect(healthScore({ entries, state: emptyState(), cash: 1_000_000, now }).pillars[0].score).toBe(100);
  });
});

describe("tools", () => {
  test("afford: cash vs instalments", () => {
    const base = { cash: 3_000_000, unpaidBills: 500_000, perDay: 50_000, daysLeft: 15 };
    expect(afford({ ...base, price: 1_000_000, mode: "tunai" }).level).toBe("ok");
    expect(afford({ ...base, price: 2_400_000, mode: "tunai" }).level).toBe("bad");
    expect(afford({ ...base, price: 2_400_000, mode: "12" }).payNow).toBe(200_000);
  });
  test("emergency fund", () => { expect(emergencyFund(3_000_000, 6, 6_000_000)).toMatchObject({ target: 18_000_000, gap: 12_000_000 }); });
  test("zakat maal needs nisab", () => {
    expect(zakatMaal(100_000_000, 1_200_000).due).toBe(false);
    expect(zakatMaal(150_000_000, 1_200_000)).toMatchObject({ due: true, amount: 3_750_000 });
  });
  test("loan: annuity beats flat total interest only at 0%, flat costs more otherwise", () => {
    const l = loan(12_000_000, 12, 12);
    expect(l.annuity).toBe(1_066_185);
    expect(l.flat).toBe(1_120_000);
    expect(l.interestFlat).toBeGreaterThan(l.interestAnnuity);
    expect(loan(1_200_000, 0, 12).annuity).toBe(100_000);
  });
});

describe("pockets, wealth and store", () => {
  test("allocate 50/30/20", () => { expect(allocate(6_500_000, DEFAULT_POCKETS).map((x) => x.amount)).toEqual([3_250_000, 1_950_000, 1_300_000]); });
  test("net worth = cash + assets + receivables - liabilities", () => {
    let s = emptyState();
    s = reduce(s, { type: "asset/upsert", asset: { id: "a", name: "Emas", kind: "gold", value: 10_000_000 } });
    s = reduce(s, { type: "debt/upsert", debt: { id: "d", person: "Bank", direction: "i_owe", amount: 2_000_000, note: "", settled: false, createdAt: "" } });
    expect(netWorth(s, 5_000_000).total).toBe(13_000_000);
  });
  test("bill actions and normalize keep management data", () => {
    let s = reduce(emptyState(), { type: "bill/upsert", bill: bill() });
    s = reduce(s, { type: "bill/pay", id: "b1", month: "2026-11", paid: true });
    expect(s.bills[0].paid).toEqual(["2026-11"]);
    expect(normalize(JSON.parse(JSON.stringify(s))).bills).toHaveLength(1);
    expect(normalize({ v: 1 }).bills).toEqual([]);
  });
});

describe("payoff and weekly review", () => {
  test("snowball clears the smallest first and rolls over", () => {
    const p = payoffPlan([{ person: "B", amount: 900_000 }, { person: "A", amount: 300_000 }], 400_000);
    expect(p.order.map((d) => d.person)).toEqual(["A", "B"]);
    expect(p.order[0].doneMonth).toBe(1); expect(p.months).toBe(3); expect(p.feasible).toBe(true);
    expect(payoffPlan([{ person: "A", amount: 1 }], 0).feasible).toBe(false);
  });
  test("compares 7 days with the 7 before", () => {
    const d = (n: number) => new Date(2026, 10, 15 - n, 9).toISOString();
    const w = weeklyReview([entry({ amount: 100_000, at: d(1) }), entry({ amount: 50_000, at: d(2), categoryId: "transport" }), entry({ amount: 100_000, at: d(9) })], now);
    expect(w).toMatchObject({ spent: 150_000, previous: 100_000, delta: 50, count: 2 });
    expect(w.topCategory?.id).toBe("makan");
  });
});
