import { describe, expect, test } from "bun:test";
import { biImpact, biMessage, type LoanRow } from "./notify";

const L = (over: Partial<LoanRow> = {}): LoanRow => ({ id: "l", name: "KPR", principal: 500_000_000, months: 180, fixedRate: 7, fixedMonths: 60, floatRate: 11, balance: 500_000_000, paid: 0, ...over });
const D = (rate: number, day: string) => ({ day, rate });

describe("BI-Rate impact on floating loans", () => {
  test("a rise raises the instalment that floats, a cut lowers it", () => {
    expect(biImpact([L()], 25).perMonth).toBeGreaterThan(0); expect(biImpact([L()], -25).perMonth).toBeLessThan(0);
    expect(biImpact([L()], 25).upcoming).toBe(1);
  });
  test("a loan already floating counts as floating", () => {
    const i = biImpact([L({ paid: 72, balance: 380_000_000 })], 25); expect(i.floating).toBe(1); expect(i.perMonth).toBeGreaterThan(0);
  });
  test("two loans add up", () => {
    const one = biImpact([L()], 25).perMonth; expect(biImpact([L(), L({ id: "m" })], 25).perMonth).toBe(one * 2);
  });
  test("the message says what happened and what it could mean, honestly", () => {
    const m = biMessage(D(6, "2026-11-18"), D(5.75, "2026-10-21"), [L({ paid: 72, balance: 380_000_000 })])!;
    expect(m.title).toBe("BI-Rate naik 25 bps ke 6,00%"); expect(m.message).toContain("KPR mengambangmu berpotensi naik"); expect(m.message).toContain("Bunga sebenarnya mengikuti keputusan bank"); expect(m.route).toBe("/kekayaan?bagian=kewajiban"); expect(m.id).toBe("bi:2026-11-18");
    expect(biMessage(D(5.75, "2026-12-16"), D(6, "2026-11-18"), [L()])!.title).toBe("BI-Rate turun 25 bps ke 5,75%");
  });
  test("a hold, or nobody with a floating loan, sends nothing", () => {
    expect(biMessage(D(6, "2026-12-16"), D(6, "2026-11-18"), [L()])).toBeNull(); expect(biMessage(D(6, "2026-11-18"), D(5.75, "2026-10-21"), [])).toBeNull();
  });
});
