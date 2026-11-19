/** Loan maths for KPR and other instalment loans. Pure (no network, no database); the server and the app import this same file.
 *  Rates are annual percentages. Rows are monthly. The schedule is an estimate: banks round and count days slightly differently. */
export type LoanModel = "anuitas" | "flat" | "syariah";
/** anuitas = declining balance (conventional KPR). flat = interest on the original principal. syariah = fixed margin on the original price. flat and syariah give equal instalments. */
export type Terms = { principal: number; months: number; model: LoanModel; fixedRate: number; fixedMonths: number; floatRate: number };
export type Row = { n: number; rate: number; payment: number; interest: number; principal: number; balance: number };
export type Extra = { monthly?: number; lumps?: { at: number; amount: number }[]; /** After a prepayment: keep the instalment and finish sooner (usual), or keep the tenor and pay less. */ mode?: "shorter" | "lower" };
export type Progress = { paid: number; balance: number };

const EPS = 0.5;
export const monthly = (annualPct: number) => annualPct / 100 / 12;

/** Equal instalment that clears `balance` in `months` at `annualPct`. */
export function annuity(balance: number, annualPct: number, months: number): number {
  if (months <= 0) return balance;
  const r = monthly(annualPct);
  return r === 0 ? balance / months : (balance * r) / (1 - (1 + r) ** -months);
}

/** How many instalments of `pay` it takes to clear `balance` (the loan-term inverse of annuity). */
export function periods(balance: number, annualPct: number, pay: number): number {
  const r = monthly(annualPct);
  if (r === 0) return balance / pay;
  const x = 1 - (balance * r) / pay;
  return x <= 0 ? 1200 : -Math.log(x) / Math.log(1 + r);
}

/** The rate that applies to instalment number n (1-based). A tenor that fits inside the fixed period never floats. */
export const rateAt = (t: Terms, n: number) => (n <= t.fixedMonths || t.fixedMonths >= t.months ? t.fixedRate : t.floatRate);

/** Remaining schedule. `progress` continues a loan that already has `paid` instalments and a known `balance` (what the bank says is left). */
export function schedule(t: Terms, extra: Extra = {}, progress?: Progress, override?: number): Row[] {
  const rows: Row[] = [];
  let balance = progress ? progress.balance : t.principal;
  const start = progress ? progress.paid : 0, lumps = new Map<number, number>();
  for (const l of extra.lumps ?? []) lumps.set(l.at, (lumps.get(l.at) ?? 0) + l.amount);
  const flatLike = t.model !== "anuitas";
  const flatPayment = flatLike ? (t.principal + t.principal * (t.fixedRate / 100) * (t.months / 12)) / t.months : 0;
  const flatInterest = flatLike ? (t.principal * (t.fixedRate / 100)) / 12 : 0, flatPrincipal = flatLike ? t.principal / t.months : 0;
  let pay = 0, lastRate = NaN, first = true, endN = t.months;   // endN: the month the loan is meant to end; a prepayment that keeps the instalment pulls it forward
  for (let n = start + 1; n <= t.months + 600 && balance > EPS; n++) {
    const rate = flatLike ? t.fixedRate : rateAt(t, n), left = endN - n + 1;
    let interest: number, principalPart: number, payment: number;
    if (flatLike) {
      interest = Math.min(flatInterest, Math.max(0, balance)); principalPart = Math.min(flatPrincipal, balance); payment = principalPart + interest;
      if (override && override > 0) { payment = override; principalPart = Math.min(balance, Math.max(0, override - interest)); }
    } else {
      if (rate !== lastRate || (extra.mode === "lower" && (extra.monthly || lumps.has(n - 1)))) { pay = first && override && override > 0 ? override : annuity(balance, rate, Math.max(1, left)); lastRate = rate; first = false; }
      interest = balance * monthly(rate);
      payment = Math.min(pay, balance + interest);
      principalPart = Math.max(0, payment - interest);
    }
    const bonus = Math.min(balance - principalPart, (extra.monthly ?? 0) + (lumps.get(n) ?? 0));
    principalPart += Math.max(0, bonus); payment += Math.max(0, bonus);
    balance = Math.max(0, balance - principalPart);
    if (balance <= EPS) { principalPart += balance; payment += balance; balance = 0; }
    else if (!flatLike && bonus > 0 && extra.mode !== "lower") endN = n + Math.ceil(periods(balance, rateAt(t, n + 1), pay));   // keep paying the same amount: the end comes sooner, and stays sooner after a rate reset
    rows.push({ n, rate, payment, interest, principal: principalPart, balance });
    if (rows.length > 1200) break;
  }
  return rows;
}

export type Summary = { months: number; firstPayment: number; lastPayment: number; paymentAfterFixed: number | null; totalInterest: number; totalPaid: number };
export function summarize(rows: Row[], t: Terms, from = 0): Summary {
  const first = rows[0], last = rows[rows.length - 1];
  const after = t.fixedMonths < t.months && t.model === "anuitas" ? rows.find((r) => r.n === t.fixedMonths + 1) ?? null : null;
  return {
    months: rows.length, firstPayment: Math.round(first?.payment ?? 0), lastPayment: Math.round(last?.payment ?? 0), paymentAfterFixed: after && after.n > from ? Math.round(after.payment) : null,
    totalInterest: Math.round(rows.reduce((s, r) => s + r.interest, 0)), totalPaid: Math.round(rows.reduce((s, r) => s + r.payment, 0)),
  };
}

/** Year-by-year view for the chart and the table. */
export function yearly(rows: Row[]) {
  const out: { year: number; payment: number; interest: number; principal: number; balance: number }[] = [];
  for (const r of rows) {
    const y = Math.ceil(r.n / 12), cur = out[y - 1] ?? (out[y - 1] = { year: y, payment: 0, interest: 0, principal: 0, balance: 0 });
    cur.payment += r.payment; cur.interest += r.interest; cur.principal += r.principal; cur.balance = r.balance;
  }
  return out.map((y) => ({ ...y, payment: Math.round(y.payment), interest: Math.round(y.interest), principal: Math.round(y.principal), balance: Math.round(y.balance) }));
}

/** What an extra payment saves, against the same loan without it. */
export function prepaymentGain(t: Terms, extra: Extra, progress?: Progress) {
  const base = schedule(t, {}, progress), fast = schedule(t, extra, progress);
  const b = summarize(base, t, progress?.paid ?? 0), f = summarize(fast, t, progress?.paid ?? 0);
  return { monthsSaved: b.months - f.months, interestSaved: b.totalInterest - f.totalInterest, newMonths: f.months, newFirstPayment: f.firstPayment };
}

/* ---------- buying a house ---------- */
export type Upfront = { plafon: number; dp: number; provisi: number; asuransi: number; notaris: number; bphtb: number; appraisal: number; total: number };
export type UpfrontRates = { provisiPct?: number; asuransiPct?: number; notarisPct?: number; bphtbPct?: number; npoptkp?: number; appraisal?: number };
/** One-off costs when taking a KPR. Every figure is an editable estimate: BPHTB's tax-free threshold differs by region, and banks set their own fees. */
export function upfront(price: number, dp: number, r: UpfrontRates = {}): Upfront {
  const plafon = Math.max(0, price - dp), pct = (v: number | undefined, d: number) => (v === undefined ? d : v) / 100;
  const provisi = Math.round(plafon * pct(r.provisiPct, 1)), asuransi = Math.round(plafon * pct(r.asuransiPct, 0.5)), notaris = Math.round(price * pct(r.notarisPct, 1));
  const bphtb = Math.round(Math.max(0, price - (r.npoptkp ?? 80_000_000)) * pct(r.bphtbPct, 5)), appraisal = Math.round(r.appraisal ?? 1_000_000);
  return { plafon, dp, provisi, asuransi, notaris, bphtb, appraisal, total: dp + provisi + asuransi + notaris + bphtb + appraisal };
}

/** Instalment as a share of monthly income. Banks usually want it at or under about 30–35%. */
export function dsr(installment: number, income: number) {
  const ratio = income > 0 ? installment / income : null;
  return { ratio, level: ratio === null ? "unknown" as const : ratio <= 0.3 ? "ok" as const : ratio <= 0.35 ? "warn" as const : "bad" as const };
}

/* ---------- BI-Rate scenarios ---------- */
export const DEFAULT_PASS_THROUGH = 0.5;
/** The bank decides its own floating rate; BI-Rate is only a signal. This asks: if the bank passes on `passThrough` of a BI move of `deltaBps`, what happens to the instalment? */
export function biScenario(t: Terms, deltaBps: number, passThrough = DEFAULT_PASS_THROUGH, progress?: Progress) {
  const shift = (deltaBps / 100) * passThrough;
  const moved: Terms = { ...t, floatRate: Math.max(0, t.floatRate + shift) };
  const a = schedule(t, {}, progress), b = schedule(moved, {}, progress);
  const from = progress?.paid ?? 0, sa = summarize(a, t, from), sb = summarize(b, moved, from);
  const startA = a.find((r) => r.n > t.fixedMonths) ?? null, startB = b.find((r) => r.n > t.fixedMonths) ?? null;
  return {
    floatRate: moved.floatRate, shift,
    paymentNow: Math.round(a[0]?.payment ?? 0), paymentNowAfter: Math.round(b[0]?.payment ?? 0),
    floatPayment: startA ? Math.round(startA.payment) : null, floatPaymentAfter: startB ? Math.round(startB.payment) : null,
    deltaPayment: startA && startB ? Math.round(startB.payment - startA.payment) : Math.round((b[0]?.payment ?? 0) - (a[0]?.payment ?? 0)),
    deltaInterest: sb.totalInterest - sa.totalInterest,
  };
}
