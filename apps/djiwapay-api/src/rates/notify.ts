/** Tells the people with a floating-rate loan when Bank Indonesia moves its policy rate, and roughly what it could mean for them. */
import { notifyUser, type PushPayload } from "../push.js";
import { biScenario, DEFAULT_PASS_THROUGH, type Terms } from "../loans/math.js";
import type { Q } from "../sync.js";
import type { RatePoint } from "./bi.js";

export type LoanRow = { id: string; name: string; principal: number; months: number; fixedRate: number; fixedMonths: number; floatRate: number; balance: number; paid: number };
const termsOf = (l: LoanRow): Terms => ({ principal: l.principal, months: l.months, model: "anuitas", fixedRate: l.fixedRate, fixedMonths: l.fixedMonths, floatRate: l.floatRate });
const rp = (n: number) => `Rp${Math.round(Math.abs(n)).toLocaleString("id-ID")}`;
const pct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`;

/** Monthly change in the instalment (the first one that floats) if the bank passes on `pass` of the BI move. Positive = pay more. */
export function biImpact(loans: LoanRow[], deltaBps: number, pass = DEFAULT_PASS_THROUGH) {
  let perMonth = 0, floating = 0, upcoming = 0;
  for (const l of loans) {
    const s = biScenario(termsOf(l), deltaBps, pass, { paid: l.paid, balance: l.balance });
    if (l.paid < l.fixedMonths) { upcoming++; perMonth += (s.floatPaymentAfter ?? 0) - (s.floatPayment ?? 0); } else { floating++; perMonth += s.deltaPayment; }
  }
  return { perMonth: Math.round(perMonth), floating, upcoming };
}

export function biMessage(latest: RatePoint, previous: RatePoint, loans: LoanRow[]): PushPayload | null {
  const bps = Math.round((latest.rate - previous.rate) * 100);
  if (bps === 0 || !loans.length) return null;
  const up = bps > 0, imp = biImpact(loans, bps), word = up ? "naik" : "turun";
  const who = imp.floating && imp.upcoming ? "KPR dan cicilan mengambangmu" : imp.floating ? "KPR mengambangmu" : "angsuran setelah masa bunga tetapmu";
  return {
    id: `bi:${latest.day}`, tone: "warn", label: "BI-Rate", title: `BI-Rate ${word} ${Math.abs(bps)} bps ke ${pct(latest.rate)}`,
    message: `${who[0].toUpperCase()}${who.slice(1)} berpotensi ${up ? "naik" : "turun"} sekitar ${rp(imp.perMonth)} per bulan bila bank meneruskan setengahnya. Bunga sebenarnya mengikuti keputusan bank.`,
    route: "/kekayaan?bagian=kewajiban", at: new Date().toISOString(),
  };
}

export async function notifyBiChange(db: Q, latest: RatePoint, previous: RatePoint | undefined, send?: Parameters<typeof notifyUser>[3], test = false): Promise<number> {
  if (!previous || previous.rate === latest.rate) return 0;
  const rows = (await db.query("select user_id,id,name,principal,months,fixed_rate,fixed_months,float_rate,balance,paid from finance.loans where model='anuitas' and balance > 0.5 and fixed_months < months and ($1::boolean or user_id not like 'itest-%')", [test])).rows;
  const by = new Map<string, LoanRow[]>();
  for (const r of rows) by.set(r.user_id, [...(by.get(r.user_id) ?? []), { id: r.id, name: r.name, principal: Number(r.principal), months: Number(r.months), fixedRate: Number(r.fixed_rate), fixedMonths: Number(r.fixed_months), floatRate: Number(r.float_rate), balance: Number(r.balance), paid: Number(r.paid) }]);
  let sent = 0;
  for (const [userId, loans] of by) { const p = biMessage(latest, previous, loans); if (p) sent += await notifyUser(db, userId, p, send); }
  return sent;
}
