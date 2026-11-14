import { describe, expect, test } from "bun:test";
import { accountBalance, allEntries, budgetStatuses, buildInsights, dailySpend, debtTotals, detectSubscriptions, goalProjection, monthlySeries, payEntries, safeToSpend, spendByCategory, streak, toCsv, totals } from "../src/lib/finance/calc";
import { DEFAULT_CATEGORIES } from "../src/lib/finance/categories";
import { emptyState, load, normalize, reduce, save, storageKey } from "../src/lib/finance/store";
import type { Entry } from "../src/lib/finance/types";
import type { WalletTransaction } from "../src/lib/wallet-adapter";

const e = (over: Partial<Entry>): Entry => ({ id: String(Math.random()), kind: "out", amount: 1000, categoryId: "makan", accountId: "tunai", at: "2026-11-05T10:00:00+07:00", note: "", tags: [], source: "manual", createdAt: "2026-11-05T10:00:00+07:00", ...over });
const wt = (over: Partial<WalletTransaction>): WalletTransaction => ({ id: 1, transfer_id: null, direction: "debit", category: "payment", type: "order_debit", amount: 48500, balance_after: 0, status: "success", counterparty_name: null, counterparty_phone: null, reference_type: null, reference_id: null, note: "Djiwa Tentram Coffee", created_at: "2026-11-14T09:21:00+07:00", ...over } as WalletTransaction);
const NOW = new Date(2026, 10, 15, 12);

describe("totals and categories", () => {
  test("transfers and top-ups never count as spending or income", () => {
    const list = [e({ amount: 100 }), e({ kind: "in", amount: 500 }), e({ kind: "tf", amount: 999 })];
    expect(totals(list)).toEqual({ out: 100, in: 500, net: 400 });
  });
  test("spend by category", () => expect([...spendByCategory([e({ amount: 100 }), e({ amount: 50 }), e({ categoryId: "belanja", amount: 10 })])]).toEqual([["makan", 150], ["belanja", 10]]));
  test("daily spend", () => { const d = dailySpend([e({ amount: 100 }), e({ amount: 20, at: "2026-11-05T20:00:00+07:00" })], 2026, 10); expect(d).toHaveLength(30); expect(d[4]).toBe(120); });
  test("monthly series", () => { const s = monthlySeries([e({ amount: 100 }), e({ amount: 40, at: "2026-10-03T10:00:00+07:00" })], 3, NOW); expect(s.map((x) => x.out)).toEqual([0, 40, 100]); });
});

describe("budgets", () => {
  const budgets = [{ categoryId: "makan", limit: 1000, rollover: false }, { categoryId: "belanja", limit: 500, rollover: false }];
  test("statuses are sorted by usage with levels", () => {
    const s = budgetStatuses(budgets, [e({ amount: 900 }), e({ categoryId: "belanja", amount: 600 })]);
    expect(s.map((x) => [x.budget.categoryId, x.level])).toEqual([["belanja", "over"], ["makan", "warn"]]);
    expect(s[0].remaining).toBe(-100);
  });
  test("safe to spend divides what is left by remaining days", () => {
    const r = safeToSpend(budgets, [e({ amount: 300 })], NOW)!;
    expect(r.daysLeft).toBe(16);
    expect(r.left).toBe(1200);
    expect(r.perDay).toBe(75);
  });
  test("no budgets means no daily figure", () => expect(safeToSpend([], [], NOW)).toBeNull());
});

describe("Djiwa Pay entries", () => {
  test("derive kind and category from wallet transactions", () => {
    const list = payEntries([wt({}), wt({ id: 2, direction: "credit", category: "topup", type: "topup_completed", amount: 200000 }), wt({ id: 3, type: "wallet_transfer_sent", category: "transfer", amount: 150000 }), wt({ id: 4, status: "failed" })]);
    expect(list.map((x) => [x.id, x.kind, x.categoryId])).toEqual([["pay:1", "out", "makan"], ["pay:2", "tf", "transfer"], ["pay:3", "out", "transfer"]]);
    expect(list.every((x) => x.source === "pay" && x.accountId === "pay")).toBe(true);
  });
  test("overrides change category without touching the amount", () => {
    const [x] = payEntries([wt({})], { "pay:1": { categoryId: "hiburan", note: "Nonton" } });
    expect(x).toMatchObject({ categoryId: "hiburan", note: "Nonton", amount: 48500 });
  });
  test("merged and sorted newest first", () => {
    const state = reduce(emptyState(), { type: "entry/add", entry: e({ id: "m", at: "2026-11-15T08:00:00+07:00" }) });
    expect(allEntries(state, [wt({})]).map((x) => x.id)).toEqual(["m", "pay:1"]);
  });
});

describe("accounts, goals, debts", () => {
  test("balance = opening + income − spending ± transfers; pay uses the wallet balance", () => {
    const acc = { id: "tunai", name: "Tunai", type: "cash" as const, opening: 1000 };
    expect(accountBalance(acc, [e({ amount: 300 }), e({ kind: "in", amount: 50 }), e({ kind: "tf", amount: 200, toAccountId: "bca" })])).toBe(1000 - 300 + 50 - 200);
    expect(accountBalance({ id: "bca", name: "BCA", type: "bank", opening: 0 }, [e({ kind: "tf", amount: 200, accountId: "tunai", toAccountId: "bca" })])).toBe(200);
    expect(accountBalance({ id: "pay", name: "Djiwa Pay", type: "ewallet", opening: 0 }, [], 1250000)).toBe(1250000);
  });
  test("goal projection", () => {
    const g = { id: "g", name: "Dana darurat", target: 1200, createdAt: "2026-08-01T00:00:00Z", deposits: [{ at: "2026-08-02T00:00:00Z", amount: 100 }, { at: "2026-10-02T00:00:00Z", amount: 200 }] };
    const p = goalProjection(g, NOW);
    expect(p.done).toBe(false);
    expect(p.perMonth).toBeCloseTo(75, 0);
    expect(p.eta).not.toBeNull();
    expect(goalProjection({ ...g, target: 100 }, NOW).done).toBe(true);
  });
  test("debt totals ignore settled", () => expect(debtTotals([{ id: "1", person: "a", direction: "owed_to_me", amount: 100, note: "", settled: false, createdAt: "" }, { id: "2", person: "b", direction: "i_owe", amount: 40, note: "", settled: false, createdAt: "" }, { id: "3", person: "c", direction: "owed_to_me", amount: 999, note: "", settled: true, createdAt: "" }])).toEqual({ owedToMe: 100, iOwe: 40 }));
});

describe("habits and insights", () => {
  test("streak counts consecutive days and stays alive before today is logged", () => {
    const list = [e({ at: "2026-11-14T10:00:00+07:00" }), e({ at: "2026-11-13T10:00:00+07:00" }), e({ at: "2026-11-11T10:00:00+07:00" })];
    const s = streak(list, NOW);
    expect(s.count).toBe(2);
    expect(s.loggedToday).toBe(false);
    expect(streak([e({ at: "2026-11-15T09:00:00+07:00" })], NOW).loggedToday).toBe(true);
  });
  test("subscription detection needs 2 months with a similar amount", () => {
    const list = [e({ note: "Netflix", amount: 54000, at: "2026-10-03T10:00:00+07:00" }), e({ note: "netflix", amount: 54000, at: "2026-11-03T10:00:00+07:00" }), e({ note: "Kopi", amount: 25000 }), e({ note: "Kopi", amount: 90000, at: "2026-10-05T10:00:00+07:00" })];
    expect(detectSubscriptions(list).map((s) => [s.name.toLowerCase(), s.amount])).toEqual([["netflix", 54000]]);
  });
  test("insights flag over-budget and rising categories", () => {
    const cur = [e({ categoryId: "belanja", amount: 600000 })], prev = [e({ categoryId: "belanja", amount: 300000 })];
    const status = budgetStatuses([{ categoryId: "belanja", limit: 500000, rollover: false }], cur);
    const list = buildInsights(DEFAULT_CATEGORIES, cur, prev, status);
    expect(list.map((i) => i.id)).toEqual(["over-belanja", "rise-belanja"]);
  });
  test("csv export escapes quotes", () => expect(toCsv([e({ note: 'kopi "enak"' })], DEFAULT_CATEGORIES, []).split("\n")[1]).toContain('"kopi ""enak"""'));
});

describe("store", () => {
  test("add, update, delete and restore entries", () => {
    const entry = e({ id: "a" });
    let s = reduce(emptyState(), { type: "entry/add", entry });
    s = reduce(s, { type: "entry/update", entry: { ...entry, amount: 7 } });
    expect(s.entries[0].amount).toBe(7);
    s = reduce(s, { type: "entry/delete", id: "a" });
    expect(s.entries).toHaveLength(0);
    expect(reduce(s, { type: "entry/restore", entry }).entries).toHaveLength(1);
  });
  test("deleting a custom category moves its entries to Lainnya and drops its budget", () => {
    let s = reduce(emptyState(), { type: "category/upsert", category: { id: "x", name: "Hobi", icon: "tag", tone: "blue", income: false, custom: true } });
    s = reduce(s, { type: "entry/add", entry: e({ id: "a", categoryId: "x" }) });
    s = reduce(s, { type: "budget/set", budget: { categoryId: "x", limit: 10, rollover: false } });
    s = reduce(s, { type: "category/delete", id: "x" });
    expect(s.categories.some((c) => c.id === "x")).toBe(false);
    expect(s.entries[0].categoryId).toBe("lainnya");
    expect(s.budgets).toHaveLength(0);
  });
  test("built-in categories cannot be deleted", () => expect(reduce(emptyState(), { type: "category/delete", id: "makan" }).categories.some((c) => c.id === "makan")).toBe(true));
  test("goal deposits and debt settling", () => {
    let s = reduce(emptyState(), { type: "goal/upsert", goal: { id: "g", name: "X", target: 100, deposits: [], createdAt: "2026-01-01" } });
    s = reduce(s, { type: "goal/deposit", id: "g", at: "2026-02-01", amount: 30 });
    expect(s.goals[0].deposits).toHaveLength(1);
    s = reduce(s, { type: "debt/upsert", debt: { id: "d", person: "Budi", direction: "owed_to_me", amount: 5, note: "", settled: false, createdAt: "" } });
    expect(reduce(s, { type: "debt/settle", id: "d" }).debts[0].settled).toBe(true);
  });
  test("normalize repairs bad data and keeps defaults", () => {
    const s = normalize({ entries: [{ id: "1", amount: -5, at: "x" }, { id: "2", amount: 10, at: "2026-11-01T00:00:00Z", kind: "out" }], categories: [] });
    expect(s.entries).toHaveLength(1);
    expect(s.categories.length).toBeGreaterThanOrEqual(12);
    expect(normalize(null).accounts[0].id).toBe("tunai");
  });
  test("persistence is namespaced per profile and survives broken storage", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const s = reduce(emptyState(), { type: "entry/add", entry: e({ id: "a" }) });
    expect(save("u1", s, storage)).toBe(true);
    expect(load("u1", storage).entries).toHaveLength(1);
    expect(load("u2", storage).entries).toHaveLength(0);
    mem.set(storageKey("u3"), "{not json");
    expect(load("u3", storage).entries).toHaveLength(0);
    expect(save("u1", s, { setItem: () => { throw new Error("quota"); } })).toBe(false);
  });
});
