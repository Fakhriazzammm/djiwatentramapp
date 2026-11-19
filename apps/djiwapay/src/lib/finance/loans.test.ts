import { describe, expect, test } from "bun:test";
import { annuity, billOf, currentRate, fixedLeft, inFixedPeriod, isDone, newLoan, nextInstallment, payExtra, payRegular, remainingRows } from "./loans";
import { emptyState, normalize, reduce } from "./store";
import { diffState, snapshotOf } from "./sync";

const kpr = () => newLoan("l1", { name: "KPR BTN", kind: "kpr", lender: "BTN", model: "anuitas", principal: 500_000_000, months: 180, dueDay: 20, fixedRate: 7, fixedMonths: 60, floatRate: 11 }, "2026-11-01T00:00:00Z");

describe("a running loan", () => {
  test("starts owing the principal, with the computed instalment and the fixed rate", () => {
    const l = kpr();
    expect(l.balance).toBe(500_000_000); expect(l.paid).toBe(0); expect(currentRate(l)).toBe(7); expect(inFixedPeriod(l)).toBe(true); expect(fixedLeft(l)).toBe(60);
    expect(nextInstallment(l)).toBe(Math.round(annuity(500_000_000, 7, 180))); expect(nextInstallment(l)).toBeGreaterThan(4_000_000);
  });
  test("a regular payment splits into interest and principal and moves the loan on", () => {
    const l = payRegular(kpr(), nextInstallment(kpr()), "2026-12-20T03:00:00Z");
    expect(l.paid).toBe(1); expect(l.payments[0].interest).toBe(Math.round(500_000_000 * 0.07 / 12));
    expect(Math.abs(l.balance + l.payments[0].principal - 500_000_000)).toBeLessThan(1); expect(Math.abs(l.payments[0].principal + l.payments[0].interest - l.payments[0].amount)).toBeLessThanOrEqual(1);
  });
  test("paying exactly what the schedule says keeps the schedule on track", () => {
    let l = kpr();
    const rows = remainingRows(l);
    for (let i = 0; i < 12; i++) l = payRegular(l, nextInstallment(l), `2026-${String((i % 12) + 1).padStart(2, "0")}-20T03:00:00Z`);
    expect(Math.abs(l.balance - rows[11].balance)).toBeLessThan(15);
  });
  test("the rate flips to the floating one after the fixed instalments", () => {
    const l = { ...kpr(), paid: 60, balance: 400_000_000 };
    expect(currentRate(l)).toBe(11); expect(inFixedPeriod(l)).toBe(false); expect(fixedLeft(l)).toBe(0);
  });
  test("an extra payment that keeps the instalment ends the loan sooner", () => {
    const l = kpr(), before = remainingRows(l).length, after = payExtra({ ...l, paid: 12, balance: 470_000_000 }, 50_000_000, "2027-01-05T00:00:00Z", "shorter");
    expect(after.balance).toBe(420_000_000); expect(after.payments.at(-1)).toMatchObject({ extra: true, principal: 50_000_000, interest: 0 }); expect(after.paid).toBe(12);
    expect(remainingRows(after).length + after.paid).toBeLessThan(before); expect(after.months).toBeLessThan(180);
  });
  test("'lower' keeps the tenor and the instalment falls", () => {
    const l = { ...kpr(), paid: 12, balance: 470_000_000 }, lowered = payExtra(l, 50_000_000, "2027-01-05T00:00:00Z", "lower");
    expect(lowered.months).toBe(180); expect(nextInstallment(lowered)).toBeLessThan(nextInstallment(l));
  });
  test("the last payment finishes the loan", () => {
    const l = payRegular({ ...kpr(), balance: 3_000_000, paid: 179 }, 3_050_000, "2041-10-20T00:00:00Z");
    expect(isDone(l)).toBe(true); expect(l.balance).toBe(0); expect(remainingRows(l)).toHaveLength(0);
  });
  test("the instalment the bank charges overrides the computed one", () => {
    expect(nextInstallment({ ...kpr(), installment: 5_100_000 })).toBe(5_100_000);
  });
});

describe("the loan and its monthly bill stay together", () => {
  test("saving a loan creates its bill on the due day with the instalment", () => {
    const s = reduce(emptyState(), { type: "loan/upsert", loan: kpr() });
    expect(s.loans).toHaveLength(1); expect(s.bills).toEqual([expect.objectContaining({ id: "ln-l1", name: "KPR BTN", day: 20, amount: nextInstallment(kpr()), icon: "home", paid: [] })]);
  });
  test("paying an instalment marks that month of the bill paid and updates the amount", () => {
    let s = reduce(emptyState(), { type: "loan/upsert", loan: kpr() });
    s = reduce(s, { type: "loan/pay", id: "l1", at: "2026-12-20T03:00:00", amount: nextInstallment(kpr()) });
    expect(s.loans[0].paid).toBe(1); expect(s.bills[0].paid).toEqual(["2026-12"]);
    s = reduce(s, { type: "loan/pay", id: "l1", at: "2026-12-28T03:00:00", amount: 10_000_000, extra: true });
    expect(s.bills[0].paid).toEqual(["2026-12"]); expect(s.loans[0].payments).toHaveLength(2);
  });
  test("an extra payment never marks a month paid", () => {
    let s = reduce(emptyState(), { type: "loan/upsert", loan: kpr() });
    s = reduce(s, { type: "loan/pay", id: "l1", at: "2026-12-01T03:00:00", amount: 10_000_000, extra: true });
    expect(s.bills[0].paid).toEqual([]);
  });
  test("paying off the loan removes the bill; deleting the loan removes it too", () => {
    let s = reduce(emptyState(), { type: "loan/upsert", loan: { ...kpr(), balance: 3_000_000, paid: 179 } });
    s = reduce(s, { type: "loan/pay", id: "l1", at: "2041-10-20T00:00:00", amount: 3_050_000 });
    expect(s.bills).toHaveLength(0); expect(isDone(s.loans[0])).toBe(true);
    const t = reduce(reduce(emptyState(), { type: "loan/upsert", loan: kpr() }), { type: "loan/delete", id: "l1" });
    expect(t.loans).toHaveLength(0); expect(t.bills).toHaveLength(0);
  });
  test("editing a loan keeps the months already paid on its bill", () => {
    let s = reduce(emptyState(), { type: "loan/upsert", loan: kpr() });
    s = reduce(s, { type: "loan/pay", id: "l1", at: "2026-12-20T03:00:00", amount: nextInstallment(kpr()) });
    s = reduce(s, { type: "loan/upsert", loan: { ...s.loans[0], floatRate: 12 } });
    expect(s.bills[0].paid).toEqual(["2026-12"]);
  });
});

describe("state plumbing", () => {
  test("normalize keeps good loans, drops broken ones, and fills missing fields", () => {
    const n = normalize({ ...emptyState(), loans: [{ ...kpr(), payments: undefined as never }, { id: "x" } as never, { id: "y", name: "z", principal: 0, months: 12 } as never] });
    expect(n.loans).toHaveLength(1); expect(n.loans[0].payments).toEqual([]);
    expect(normalize({ ...emptyState(), loans: undefined as never }).loans).toEqual([]);
  });
  test("a loan travels through the sync diff like any other record", () => {
    const base = emptyState(), snap = snapshotOf(base), next = reduce(base, { type: "loan/upsert", loan: kpr() });
    const body = diffState(snap, next)!;
    expect(body.upserts.loans).toHaveLength(1); expect(body.upserts.bills).toHaveLength(1); expect(diffState(snapshotOf(next), next)).toBeNull();
    const gone = diffState(snapshotOf(next), reduce(next, { type: "loan/delete", id: "l1" }))!;
    expect(gone.deletes.loans).toEqual(["l1"]); expect(gone.deletes.bills).toEqual(["ln-l1"]);
  });
  test("billOf never produces an unusable bill", () => {
    expect(billOf({ ...kpr(), balance: 0 }).amount).toBeGreaterThan(0);
  });
});
