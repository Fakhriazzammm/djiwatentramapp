/** The app's view of a loan: what is left, what comes next, and how a payment changes it. Maths lives in the shared loans/math (also used by the server). */
import { monthly, periods, rateAt, schedule, type Progress, type Row, type Terms } from "../../../../djiwapay-api/src/loans/math";
import type { Bill, Loan, LoanKind } from "./types";

export { annuity, biScenario, dsr, prepaymentGain, schedule, summarize, upfront, yearly, DEFAULT_PASS_THROUGH } from "../../../../djiwapay-api/src/loans/math";
export type { Row, Terms } from "../../../../djiwapay-api/src/loans/math";

export const KIND_META: Record<LoanKind, { label: string; icon: string; tone: string }> = {
  kpr: { label: "KPR", icon: "home", tone: "cyan" }, kendaraan: { label: "Kendaraan", icon: "car", tone: "slate" },
  multiguna: { label: "Multiguna", icon: "bank", tone: "amber" }, lainnya: { label: "Cicilan lain", icon: "card", tone: "violet" },
};
export const MODEL_LABEL = { anuitas: "Anuitas", flat: "Flat", syariah: "Syariah (margin tetap)" } as const;

export const termsOf = (l: Loan): Terms => ({ principal: l.principal, months: l.months, model: l.model, fixedRate: l.fixedRate, fixedMonths: l.fixedMonths, floatRate: l.floatRate });
export const progressOf = (l: Loan): Progress => ({ paid: l.paid, balance: l.balance });
export const isDone = (l: Loan) => l.balance <= 0.5;
export const remainingRows = (l: Loan): Row[] => (isDone(l) ? [] : schedule(termsOf(l), {}, progressOf(l), l.installment ?? undefined));
export const nextInstallment = (l: Loan) => Math.round(remainingRows(l)[0]?.payment ?? 0);
/** The annual rate that applies to the next instalment. */
export const currentRate = (l: Loan) => (l.model === "anuitas" ? rateAt(termsOf(l), l.paid + 1) : l.fixedRate);
export const monthsLeft = (l: Loan) => remainingRows(l).length;
/** Anuitas only: true while the fixed-rate years still run and a floating period follows. */
export const inFixedPeriod = (l: Loan) => l.model === "anuitas" && l.paid < l.fixedMonths && l.fixedMonths < l.months;
export const floatsAfter = (l: Loan) => l.model === "anuitas" && l.fixedMonths < l.months;
/** How far the fixed period still has to run, in months (0 once floating). */
export const fixedLeft = (l: Loan) => Math.max(0, l.fixedMonths - l.paid);
export const paidShare = (l: Loan) => (l.principal > 0 ? Math.max(0, Math.min(1, 1 - l.balance / l.principal)) : 0);
export const totalInterestLeft = (l: Loan) => Math.round(remainingRows(l).reduce((s, r) => s + r.interest, 0));
export const lastPayment = (l: Loan) => l.payments.filter((p) => !p.extra).slice(-1)[0] ?? null;

export { jakartaMonth as monthKeyOf } from "../../../../djiwapay-api/src/loans/mail-rules";

/** A regular instalment: the interest part comes from the balance and the rate, the rest reduces what is owed. */
export function payRegular(l: Loan, amount: number, at: string): Loan {
  const interest = l.model === "anuitas" ? l.balance * monthly(currentRate(l)) : (l.principal * (l.fixedRate / 100)) / 12;
  const cut = Math.min(Math.max(0, amount), Math.max(0, interest)), principal = Math.min(l.balance, Math.max(0, amount - interest));
  const balance = Math.max(0, l.balance - principal);
  return { ...l, balance: balance <= 0.5 ? 0 : Math.round(balance * 100) / 100, paid: l.paid + 1, payments: [...l.payments, { at, amount, interest: Math.round(cut), principal: Math.round(principal) }] };
}

/** Extra money against the principal. `shorter` keeps the instalment and ends sooner; `lower` keeps the end date and pays less each month. */
export function payExtra(l: Loan, amount: number, at: string, mode: "shorter" | "lower" = "shorter"): Loan {
  const pay = nextInstallment(l), principal = Math.min(l.balance, Math.max(0, amount)), balance = Math.max(0, l.balance - principal);
  const next: Loan = { ...l, balance: balance <= 0.5 ? 0 : Math.round(balance * 100) / 100, payments: [...l.payments, { at, amount, interest: 0, principal: Math.round(principal), extra: true }] };
  if (next.balance > 0 && mode === "shorter") {
    if (l.model === "anuitas" && pay > 0) next.months = Math.max(l.paid + 1, l.paid + Math.ceil(periods(next.balance, rateAt(termsOf(l), l.paid + 1), pay)));
    else if (l.model !== "anuitas") next.months = l.paid + Math.max(1, Math.ceil(next.balance / (l.principal / l.months)));
  }
  return next;
}

/** The monthly bill that mirrors a loan, so the calendar, reminders and cash forecast see the instalment. */
export function billOf(l: Loan, paid: string[] = []): Bill {
  const m = KIND_META[l.kind], amount = nextInstallment(l) || lastPayment(l)?.amount || Math.round(l.principal / l.months);
  return { id: l.billId ?? `ln-${l.id}`, name: l.name, amount: Math.max(1, Math.round(amount)), day: Math.max(1, Math.min(31, l.dueDay)), icon: m.icon, tone: m.tone, paid };
}

export type LoanInput = { name: string; kind: LoanKind; lender: string; model: Loan["model"]; principal: number; months: number; startDate?: string; dueDay: number; fixedRate: number; fixedMonths: number; floatRate: number; balance?: number; paid?: number; installment?: number | null; assetId?: string; note?: string };
export const newLoan = (id: string, i: LoanInput, now = new Date().toISOString()): Loan => ({
  id, name: i.name, kind: i.kind, lender: i.lender, model: i.model, principal: i.principal, months: i.months, ...(i.startDate ? { startDate: i.startDate } : {}), dueDay: i.dueDay,
  fixedRate: i.fixedRate, fixedMonths: i.model === "anuitas" ? i.fixedMonths : i.months, floatRate: i.model === "anuitas" ? i.floatRate : i.fixedRate,
  balance: i.balance ?? i.principal, paid: i.paid ?? 0, installment: i.installment ?? null, payments: [], ...(i.assetId ? { assetId: i.assetId } : {}), note: i.note ?? "", createdAt: now,
});

/** A property can secure more than one loan. Its full value still counts as an asset. */
export function homeEquity(assetId: string, value: number, loans: Loan[]) {
  const linked = loans.filter((loan) => loan.kind === "kpr" && loan.assetId === assetId);
  if (!linked.length) return null;
  const balance = linked.reduce((total, loan) => total + loan.balance, 0);
  return { balance, value: value - balance };
}
