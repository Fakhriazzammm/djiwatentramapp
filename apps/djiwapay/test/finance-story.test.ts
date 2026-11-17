import { describe, expect, test } from "bun:test";
import { cashflowGraph, categoryShares, pace, spendCalendar, spendStats, wealthHistory } from "../src/lib/finance/story";
import { emptyState } from "../src/lib/finance/store";
import type { Entry } from "../src/lib/finance/types";

const e = (over: Partial<Entry>): Entry => ({ id: String(Math.random()), kind: "out", amount: 1000, categoryId: "makan", accountId: "tunai", at: "2026-11-05T10:00:00+07:00", note: "", tags: [], source: "manual", createdAt: "2026-11-05T10:00:00+07:00", ...over });
const NOW = new Date(2026, 10, 17, 12);

describe("wealthHistory", () => {
  test("rebuilds month-end cash from today's cash and later movements", () => {
    const entries = [e({ kind: "in", amount: 5000, at: "2026-10-10T10:00:00+07:00" }), e({ amount: 1000, at: "2026-11-05T10:00:00+07:00" })];
    const h = wealthHistory(emptyState(), entries, 10_000, null, 3, NOW);
    expect(h.map((p) => p.label)).toEqual(["Okt", "Nov"]);
    expect(h[1].value).toBe(10_000);
    expect(h[0].value).toBe(11_000);   // before the 1.000 spent on 5 Nov
  });
  test("is empty without entries", () => { expect(wealthHistory(emptyState(), [], 5, null, 6, NOW)).toEqual([]); });
});

describe("spendCalendar", () => {
  test("counts calm days only from the first entry", () => {
    const c = spendCalendar([e({ at: "2026-11-05T10:00:00+07:00" }), e({ amount: 9000, at: "2026-11-07T10:00:00+07:00" })], NOW);
    expect(c.cells[3].state).toBe("before");
    expect(c.cells[5].state).toBe("calm");
    expect(c.cells[20].state).toBe("future");
    expect(c.calm).toBe(c.cells.filter((x) => x.state === "calm").length);
    expect(c.offset).toBe(6);          // 1 Nov 2026 is a Sunday
  });
});

describe("pace and stats", () => {
  const list = [e({ amount: 100_000, at: "2026-10-03T10:00:00+07:00" }), e({ amount: 200_000, at: "2026-11-03T10:00:00+07:00", note: "Kopi" }), e({ amount: 50_000, at: "2026-11-09T10:00:00+07:00", note: "Kopi" })];
  test("projects the month from the daily average", () => {
    const p = pace(list, NOW);
    expect(p.spent).toBe(250_000);
    expect(p.projected).toBe(Math.round((250_000 / 17) * 30));
    expect(p.lastTotal).toBe(100_000);
  });
  test("finds the costliest day and favourite place", () => {
    const s = spendStats(list, NOW);
    expect(s.costly?.amount).toBe(200_000);
    expect(s.fav?.name).toBe("Kopi");
    expect(s.count).toBe(2);
  });
  test("folds the tail of categories into one row", () => {
    const rows = categoryShares([e({ categoryId: "a", amount: 5 }), e({ categoryId: "b", amount: 4 }), e({ categoryId: "c", amount: 3 }), e({ categoryId: "d", amount: 2 }), e({ categoryId: "f", amount: 1 })], NOW, 4);
    expect(rows.rows.map((r) => r.id)).toEqual(["a", "b", "c", "_rest"]);
    expect(rows.rows[3].amount).toBe(3);
  });
});

describe("cashflowGraph", () => {
  const m = [e({ kind: "in", categoryId: "gaji", amount: 10_000 }), e({ categoryId: "makan", amount: 4_000 }), e({ categoryId: "belanja", amount: 1_000 })];
  test("balances income against spending plus what is left", () => {
    const g = cashflowGraph(m, []);
    expect(g.income).toBe(10_000); expect(g.spent).toBe(5_000); expect(g.net).toBe(5_000);
    expect(g.right.map((n) => n.id)).toEqual(["_net", "makan", "belanja"]);
    expect(g.right.reduce((s, n) => s + n.amount, 0)).toBe(g.total);
  });
  test("adds a gap source when spending exceeds income", () => {
    const g = cashflowGraph([e({ kind: "in", categoryId: "gaji", amount: 1_000 }), e({ categoryId: "makan", amount: 3_000 })], []);
    expect(g.left.map((n) => n.id)).toEqual(["gaji", "_gap"]);
    expect(g.left.reduce((s, n) => s + n.amount, 0)).toBe(g.total);
  });
  test("reports change against the comparison period", () => {
    const g = cashflowGraph(m, [e({ categoryId: "makan", amount: 2_000 })]);
    expect(g.right.find((n) => n.id === "makan")?.change).toBe(100);
  });
});

import { debtRemaining, debtTotals, goalPlan } from "../src/lib/finance/calc";
import { reduce } from "../src/lib/finance/store";
import type { Debt, Goal } from "../src/lib/finance/types";
describe("rencana", () => {
  const debt: Debt = { id: "d1", person: "Budi", direction: "owed_to_me", amount: 100_000, note: "", settled: false, createdAt: "2026-11-01T00:00:00Z" };
  test("repayments reduce what is owed and settle the debt at zero", () => {
    let s = reduce({ ...emptyState(), debts: [debt] }, { type: "debt/pay", id: "d1", at: "2026-11-05T00:00:00Z", amount: 40_000 });
    expect(debtRemaining(s.debts[0])).toBe(60_000); expect(debtTotals(s.debts).owedToMe).toBe(60_000); expect(s.debts[0].settled).toBe(false);
    s = reduce(s, { type: "debt/pay", id: "d1", at: "2026-11-06T00:00:00Z", amount: 60_000 });
    expect(s.debts[0].settled).toBe(true);
    s = reduce(s, { type: "debt/payDelete", id: "d1", index: 1 });
    expect(s.debts[0].settled).toBe(false); expect(debtRemaining(s.debts[0])).toBe(60_000);
    expect(reduce(s, { type: "debt/settle", id: "d1" }).debts[0].settled).toBe(true);
    expect(reduce(reduce(s, { type: "debt/settle", id: "d1" }), { type: "debt/unsettle", id: "d1" }).debts[0].settled).toBe(false);
  });
  test("a goal with a date says what to set aside each month", () => {
    const g: Goal = { id: "g1", name: "Liburan", target: 12_000_000, deposits: [{ at: "2026-10-01T00:00:00Z", amount: 3_000_000 }], due: "2027-03-17", createdAt: "2026-10-01T00:00:00Z" };
    const p = goalPlan(g, new Date(2026, 10, 17));
    expect(p.left).toBe(9_000_000); expect(p.perMonthNeeded).toBe(2_250_000); expect(p.done).toBe(false);
    expect(goalPlan({ ...g, due: undefined }, new Date(2026, 10, 17)).perMonthNeeded).toBeNull();
  });
  test("deposits can be edited and deleted; budgets set in bulk", () => {
    const g: Goal = { id: "g1", name: "A", target: 1000, deposits: [{ at: "x", amount: 10 }, { at: "y", amount: 20 }], createdAt: "z" };
    let s = reduce({ ...emptyState(), goals: [g] }, { type: "goal/depositEdit", id: "g1", index: 0, amount: 15 });
    expect(s.goals[0].deposits[0].amount).toBe(15);
    s = reduce(s, { type: "goal/depositDelete", id: "g1", index: 1 });
    expect(s.goals[0].deposits).toHaveLength(1);
    const b = reduce(s, { type: "budget/setMany", budgets: [{ categoryId: "makan", limit: 5000, rollover: false }, { categoryId: "belanja", limit: 3000, rollover: false }] });
    expect(b.budgets).toHaveLength(2);
    expect(reduce(b, { type: "budget/setMany", budgets: [{ categoryId: "makan", limit: 9000, rollover: false }] }).budgets.find((x) => x.categoryId === "makan")?.limit).toBe(9000);
  });
});

import { financeNotes } from "../src/lib/finance/notify";
describe("financeNotes", () => {
  const now = new Date(2026, 10, 17, 12);
  test("tells about e-mail activity, bills and a top-up transfer", () => {
    const st = { ...emptyState(), bills: [{ id: "b1", name: "Listrik", amount: 400_000, day: 20, icon: "flash", tone: "amber", paid: [] }] };
    const entries = [e({ id: "t1", kind: "tf", source: "email", amount: 50_000, note: "Top-up ShopeePay", at: "2026-11-17T09:00:00+07:00" })];
    const notes = financeNotes(st, entries, { review: 2, autoRecent: 3 }, now);
    expect(notes.map((n) => n.id)).toEqual(expect.arrayContaining(["fin-review:2", "fin-auto:3", "fin-em:t1", `fin-bill:b1:2026-11:soon`]));
    expect(notes.find((n) => n.id === "fin-em:t1")?.message).toContain("Pindah dana");
    expect(notes.find((n) => n.id === "fin-review:2")?.route).toBe("/tinjau");
  });
  test("is quiet when nothing needs attention", () => { expect(financeNotes(emptyState(), [], { review: 0, autoRecent: 0 }, now)).toEqual([]); });
});

import { assetValue, estimateOn, isEstimated } from "../src/lib/finance/assets";
describe("asset estimates", () => {
  test("a car loses value and a house gains it, never below 5% of the price", () => {
    const car = { kind: "vehicle" as const, cost: 200_000_000, boughtOn: "2024-11-17", rate: -12, est: true };
    expect(isEstimated(car)).toBe(true);
    const v = estimateOn(car, "2026-11-17");
    expect(v).toBeGreaterThan(150_000_000); expect(v).toBeLessThan(160_000_000);
    expect(estimateOn({ ...car, rate: -90 }, "2040-11-17")).toBe(10_000_000);
    expect(estimateOn({ cost: 1_000_000_000, boughtOn: "2024-11-17", rate: 6 }, "2026-11-17")).toBeGreaterThan(1_100_000_000);
  });
  test("manual assets keep their entered value", () => {
    const a = { id: "x", name: "Saham", kind: "stock" as const, value: 5_000_000, cost: 4_000_000, boughtOn: "2025-01-01" };
    expect(isEstimated(a)).toBe(false); expect(assetValue(a, null)).toBe(5_000_000);
  });
});

import { quoteDeck } from "../src/lib/quotes";
describe("quoteDeck", () => {
  test("alternates money and slow-living thoughts and rotates with the seed", () => {
    const a = quoteDeck(0), b = quoteDeck(3);
    expect(a.length).toBeGreaterThan(20); expect(new Set(a).size).toBe(a.length);
    expect(b[0]).toBe(a[3]); expect(a[0]).toContain("Buffett"); expect(a[1]).toContain("Lao Tzu");
  });
});

import { buildIsland } from "../src/lib/island";
describe("buildIsland", () => {
  const now = new Date("2026-11-18T10:00:00+07:00");
  const entries = [e({ id: "a", kind: "in", source: "pay", amount: 50_000, note: "Transfer masuk", at: "2026-11-18T09:00:00+07:00" }), e({ id: "b", source: "email", amount: 59_000, note: "Sambal ijo", at: "2026-11-17T19:47:00+07:00" }), e({ id: "c", source: "manual", at: "2026-11-18T09:30:00+07:00" }), e({ id: "d", source: "email", at: "2026-11-10T09:00:00+07:00" })];
  test("shows recent paid, mailed and scanned entries newest first, never manual or old ones", () => {
    const items = buildIsland({ entries, notes: [], wallet: [], seen: new Set(), accountName: () => "Mandiri", now });
    expect(items.map((i) => i.id)).toEqual(["isl-e:a", "isl-e:b"]);
    expect(items[0]).toMatchObject({ tone: "in", sign: "+", label: "Djiwa Pay" }); expect(items[1]).toMatchObject({ tone: "out", sign: "−", label: "Dari email" });
  });
  test("skips what was already shown and mail entries duplicated by notes", () => {
    const notes = [{ id: "fin-em:b", title: "x", message: "y", notification_type: "fin-email" as const, created_at: now.toISOString(), route: "/riwayat" }, { id: "fin-review:2", title: "2 email perlu ditinjau", message: "z", notification_type: "fin-email" as const, created_at: now.toISOString(), route: "/tinjau" }];
    const items = buildIsland({ entries, notes, wallet: [], seen: new Set(["isl-e:a"]), accountName: () => "Mandiri", now });
    expect(items.map((i) => i.id)).toEqual(["fin-review:2", "isl-e:b"]);
  });
});

import { GUIDE, detectPlatform } from "../src/lib/pwa";
import { islandFromPush } from "../src/lib/island";
describe("pwa", () => {
  test("tells iPhone Safari from other iPhone browsers, Android browsers and desktops", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1")).toBe("ios-safari");
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1")).toBe("ios-other");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36")).toBe("android-chrome");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36")).toBe("android-samsung");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")).toBe("desktop-chromium");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15")).toBe("desktop-safari");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", 5)).toBe("ios-safari");   // iPad asking for the desktop site
  });
  test("every platform has a guide with steps", () => { for (const g of Object.values(GUIDE)) { expect(g.title.length).toBeGreaterThan(3); expect(g.steps.length).toBeGreaterThan(0); } });
  test("a push payload becomes a safe island item", () => {
    const i = islandFromPush({ id: "mail-1", tone: "out", label: "Dari email", title: "Pengeluaran", message: "Kopi", amount: 25000, sign: "−", route: "/riwayat?baru=1", at: "2026-11-18T00:00:00Z" })!;
    expect(i).toMatchObject({ tone: "out", icon: "down", amount: 25000, sign: "−", route: "/riwayat?baru=1" });
    expect(islandFromPush({ title: "x", route: "https://evil.example" })!.route).toBeUndefined();
    expect(islandFromPush({} as never)).toBeNull();
  });
});
