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
