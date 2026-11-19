import { monthly, rateAt, schedule, type Terms } from "./math.js";

const kpr = /\b(?:KPR|KPA|kredit pemilikan rumah)\b/i;
const payment = /\b(?:pembayaran|pendebetan|debit|pelunasan)\b/i;
const success = /\b(?:berhasil|sukses|telah diterima|telah dibayar|terdebet|terdebit)\b/i;

export function classifyLoanMail(subject: string, text: string, reminder: boolean) {
  if (reminder && kpr.test(subject + " " + text)) return "reminder";
  const lines = [subject, ...text.split(/[\n.!?]+(?=\s|$)/)];
  return lines.some((line) => kpr.test(line) && payment.test(line) && success.test(line)
    && !/\b(?:tidak|belum|gagal|batal|akan|jika|apabila|setelah|pelunasan)\b/i.test(line)) ? "receipt" : null;
}

type LedgerLoan = {
  principal: string; months: number; model: Terms["model"]; fixed_rate: string; fixed_months: number;
  float_rate: string; balance: string; paid: number; installment: string | null;
  payments: { at: string; extra?: boolean }[];
};

export const jakartaMonth = (at: string) => new Date(Date.parse(at) + 7 * 3600_000).toISOString().slice(0, 7);

export function reconcileInstallment(loan: LedgerLoan, amount: number, at: string, confirmed: boolean) {
  const terms: Terms = {
    principal: Number(loan.principal), months: loan.months, model: loan.model,
    fixedRate: Number(loan.fixed_rate), fixedMonths: loan.fixed_months, floatRate: Number(loan.float_rate),
  };
  const month = jakartaMonth(at);
  const balance = Number(loan.balance);
  const progress = { balance, paid: loan.paid };
  const override = loan.installment === null ? undefined : Number(loan.installment);
  const next = schedule(terms, {}, progress, override)[0];
  if (!next || !Number.isFinite(amount) || amount <= 0 ||
    (!confirmed && amount !== Math.round(next.payment)) ||
    loan.payments.some((p) => (p.extra ? p.at >= at : jakartaMonth(p.at) >= month))) return null;
  const interest = (loan.model === "anuitas" ? balance * monthly(rateAt(terms, loan.paid + 1)) : terms.principal * monthly(terms.fixedRate));
  const principal = Math.min(balance, amount - interest);
  if (principal <= 0 || amount > balance + interest + 1) return null;
  const remaining = Math.round((balance - principal) * 100) / 100;
  const paid = loan.paid + 1;
  const following = remaining <= 0.5 ? 0 : Math.round(schedule(terms, {}, { balance: remaining, paid }, override)[0]?.payment ?? 0);
  return {
    balance: remaining <= 0.5 ? 0 : remaining, paid, month, following,
    payment: { at, amount, interest: Math.round(interest), principal: Math.round(principal) },
  };
}
