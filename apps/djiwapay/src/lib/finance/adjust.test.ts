import { describe, expect, test } from "bun:test";
import { planAdjustment } from "./adjust";
import { accountBalance, totals } from "./calc";
import type { Account } from "./types";

const A: Account = { id: "bca", name: "BCA", type: "bank", opening: 1000 };
const NOW = new Date("2026-11-20T03:00:00Z");

describe("balance adjustment", () => {
  test("nothing to do when the balance already matches", () => { expect(planAdjustment(A, 1500, 1500, "opening")).toEqual({ diff: 0 }); });
  test("opening mode shifts the starting balance and invents no records", () => {
    const p = planAdjustment(A, 1500, 1200, "opening", NOW);
    expect(p).toMatchObject({ diff: -300, account: { opening: 700 } }); expect(p.entry).toBeUndefined();
    expect(accountBalance(p.account!, [])).toBe(700);
  });
  test("entry mode records the gap: more money is income, less is spending", () => {
    const up = planAdjustment(A, 1000, 1250.5, "entry", NOW, "x1"), down = planAdjustment(A, 1000, 400, "entry", NOW, "x2");
    expect(up.entry).toMatchObject({ id: "x1", kind: "in", amount: 250.5, accountId: "bca", categoryId: "bonus", tags: ["penyesuaian"] });
    expect(down.entry).toMatchObject({ kind: "out", amount: 600, categoryId: "lainnya" }); expect(down.account).toBeUndefined();
    expect(accountBalance(A, [up.entry!])).toBe(1250.5); expect(totals([down.entry!]).out).toBe(600);
  });
  test("works for a negative target (a card with a bill)", () => {
    const p = planAdjustment({ ...A, type: "card", opening: -200 }, -200, -950, "opening");
    expect(p.account!.opening).toBe(-950);
  });
});
