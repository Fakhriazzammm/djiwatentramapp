import { describe, expect, test } from "bun:test";
import { annuity, biScenario, dsr, prepaymentGain, rateAt, schedule, summarize, upfront, yearly, type Terms } from "./math";

const T = (over: Partial<Terms> = {}): Terms => ({ principal: 500_000_000, months: 180, model: "anuitas", fixedRate: 7, fixedMonths: 60, floatRate: 11, ...over });

describe("annuity", () => {
  test("a textbook figure: 100 juta at 12% for 12 months is Rp8.884.879", () => { expect(Math.round(annuity(100_000_000, 12, 12))).toBe(8_884_879); });
  test("zero rate is plain division", () => { expect(annuity(120, 0, 12)).toBe(10); });
});

describe("conventional KPR with a fixed period then floating", () => {
  const t = T(), rows = schedule(t);
  test("runs the full tenor and clears the balance", () => { expect(rows).toHaveLength(180); expect(rows[179].balance).toBe(0); });
  test("principal paid adds up to the plafon", () => { expect(Math.round(rows.reduce((s, r) => s + r.principal, 0))).toBe(500_000_000); });
  test("the instalment is flat in the fixed years, then re-set on what is left", () => {
    expect(Math.round(rows[0].payment)).toBe(Math.round(annuity(500_000_000, 7, 180)));
    expect(Math.round(rows[59].payment)).toBe(Math.round(rows[0].payment));
    const reset = Math.round(annuity(rows[59].balance, 11, 120));
    expect(Math.round(rows[60].payment)).toBe(reset);
    expect(rows[60].rate).toBe(11); expect(rows[59].rate).toBe(7);
  });
  test("interest of month 1 is balance × monthly rate", () => { expect(Math.round(rows[0].interest)).toBe(Math.round(500_000_000 * 0.07 / 12)); });
  test("rateAt: a tenor inside the fixed period never floats", () => { expect(rateAt(T({ months: 48 }), 40)).toBe(7); expect(rateAt(t, 61)).toBe(11); });
  test("summary", () => {
    const s = summarize(rows, t);
    expect(s.months).toBe(180); expect(s.paymentAfterFixed).toBe(Math.round(rows[60].payment)); expect(s.totalPaid - s.totalInterest).toBe(500_000_000);
  });
  test("yearly view has 15 years and ends at zero", () => { const y = yearly(rows); expect(y).toHaveLength(15); expect(y[14].balance).toBe(0); expect(y[0].payment).toBeGreaterThan(0); });
});

describe("flat and syariah", () => {
  test("syariah: fixed margin on the price gives equal instalments", () => {
    const t = T({ principal: 300_000_000, months: 120, model: "syariah", fixedRate: 8, fixedMonths: 120, floatRate: 8 }), rows = schedule(t), s = summarize(rows, t);
    expect(Math.round(rows[0].payment)).toBe(4_500_000); expect(Math.round(rows[119].payment)).toBe(4_500_000);
    expect(s.totalInterest).toBe(240_000_000); expect(rows).toHaveLength(120);
  });
  test("flat: same shape", () => {
    const rows = schedule(T({ principal: 12_000_000, months: 12, model: "flat", fixedRate: 12, fixedMonths: 12 }));
    expect(Math.round(rows[0].payment)).toBe(1_120_000);
  });
});

describe("prepayment", () => {
  test("an extra payment every month shortens the tenor and saves interest", () => {
    const g = prepaymentGain(T(), { monthly: 1_000_000 });
    expect(g.monthsSaved).toBeGreaterThan(20); expect(g.interestSaved).toBeGreaterThan(100_000_000);
  });
  test("a lump sum in month 12 saves interest too, and the schedule still clears", () => {
    const rows = schedule(T(), { lumps: [{ at: 12, amount: 50_000_000 }] });
    expect(rows[rows.length - 1].balance).toBe(0); expect(rows.length).toBeLessThan(180);
    expect(Math.round(rows[11].principal)).toBeGreaterThan(50_000_000);
  });
  test("'lower' keeps the tenor and pays less each month", () => {
    const a = schedule(T({ fixedMonths: 180 }), { lumps: [{ at: 12, amount: 100_000_000 }], mode: "lower" }), b = schedule(T({ fixedMonths: 180 }));
    expect(a).toHaveLength(180); expect(a[20].payment).toBeLessThan(b[20].payment);
  });
});

describe("continuing a loan that is already running", () => {
  test("from the bank's balance after 60 instalments it follows the original tail", () => {
    const full = schedule(T()), tail = schedule(T(), {}, { paid: 60, balance: full[59].balance });
    expect(tail).toHaveLength(120); expect(Math.round(tail[0].payment)).toBe(Math.round(full[60].payment)); expect(tail[0].n).toBe(61);
  });
  test("an instalment the bank charges is respected", () => {
    const rows = schedule(T({ fixedMonths: 180 }), {}, { paid: 12, balance: 480_000_000 }, 5_000_000);
    expect(Math.round(rows[0].payment)).toBe(5_000_000);
  });
});

describe("buying costs and affordability", () => {
  test("upfront costs from price and DP, each an estimate", () => {
    const u = upfront(1_000_000_000, 200_000_000);
    expect(u.plafon).toBe(800_000_000); expect(u.provisi).toBe(8_000_000); expect(u.asuransi).toBe(4_000_000); expect(u.notaris).toBe(10_000_000); expect(u.bphtb).toBe(46_000_000);
    expect(u.total).toBe(200_000_000 + 8_000_000 + 4_000_000 + 10_000_000 + 46_000_000 + 1_000_000);
  });
  test("BPHTB is zero below the threshold, and rates can be overridden", () => {
    expect(upfront(70_000_000, 0).bphtb).toBe(0); expect(upfront(1_000_000_000, 0, { provisiPct: 0 }).provisi).toBe(0);
  });
  test("instalment against income", () => {
    expect(dsr(3_000_000, 10_000_000).level).toBe("ok"); expect(dsr(3_400_000, 10_000_000).level).toBe("warn"); expect(dsr(5_000_000, 10_000_000).level).toBe("bad"); expect(dsr(1, 0).level).toBe("unknown");
  });
});

describe("BI-Rate scenarios", () => {
  test("a BI rise passed on at 50% raises the floating instalment; a cut lowers it", () => {
    const up = biScenario(T(), 25, 0.5), down = biScenario(T(), -25, 0.5);
    expect(up.shift).toBeCloseTo(0.125, 5); expect(up.floatRate).toBeCloseTo(11.125, 5);
    expect(up.deltaPayment).toBeGreaterThan(0); expect(down.deltaPayment).toBeLessThan(0); expect(up.deltaInterest).toBeGreaterThan(0);
  });
  test("no pass-through changes nothing", () => { const s = biScenario(T(), 50, 0); expect(s.deltaPayment).toBe(0); expect(s.deltaInterest).toBe(0); });
  test("during the fixed period the effect shows only after it ends", () => {
    const s = biScenario(T(), 50, 1);
    expect(s.paymentNow).toBe(s.paymentNowAfter); expect(s.floatPaymentAfter!).toBeGreaterThan(s.floatPayment!);
  });
  test("for a loan already floating, the change applies to the next instalment", () => {
    const full = schedule(T()), progress = { paid: 72, balance: full[71].balance };
    const s = biScenario(T(), 25, 1, progress);
    expect(s.deltaPayment).toBeGreaterThan(0); expect(s.paymentNowAfter).toBeGreaterThan(s.paymentNow);
  });
});
