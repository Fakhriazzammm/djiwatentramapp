import type { Q } from "../sync.js";
import { jakartaMonth, reconcileInstallment } from "./mail-rules.js";

export const lockLoanChanges = (q: Q, userId: string) =>
  q.query("select pg_advisory_xact_lock(hashtextextended($1, 20261120))", [userId]);

export async function loansForIssuer(q: Q, userId: string, issuer: string) {
  const normalized = issuer.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (await q.query(`select * from finance.loans where user_id=$1 and kind='kpr' and balance>0
    and regexp_replace(regexp_replace(lower(trim(lender)), '^bank[[:space:]]+', ''), '[^a-z0-9]', '', 'g')=$2`, [userId, normalized])).rows;
}

export async function recordLoanReceipt(q: Q, userId: string, loan: any, input: {
  inboundId: string; at: string; amount: number; accountId: string; confirmed: boolean;
}) {
  const { inboundId, at, amount, accountId, confirmed } = input;
  const billId = loan.bill_id ?? `ln-${loan.id}`;
  const month = jakartaMonth(at);
  const bill = (await q.query("select paid,amount from finance.bills where user_id=$1 and id=$2", [userId, billId])).rows[0];
  if (bill?.paid?.includes(month) || loan.payments.some((p: any) => !p.extra && jakartaMonth(p.at) === month)) {
    return { status: "duplicate" as const };
  }
  const result = reconcileInstallment(loan, amount, at, confirmed);
  if (!result || !bill) return { status: "review" as const };

  const entryId = `em-${inboundId}`;
  await q.query(`insert into finance.entries(user_id,id,kind,amount,category_id,account_id,at,note,tags,source,inbound_id)
    values($1,$2,'out',$3,'tagihan',$4,$5,$6,'{loan-receipt}','email',$7)`,
    [userId, entryId, amount, accountId, at, `Angsuran ${loan.name}`, inboundId]);
  await q.query(`update finance.loans set balance=$3,paid=$4,payments=payments || $5::jsonb,mail_revision=mail_revision+1
    where user_id=$1 and id=$2`, [userId, loan.id, result.balance, result.paid, JSON.stringify([result.payment])]);
  if (result.balance === 0) await q.query("delete from finance.bills where user_id=$1 and id=$2", [userId, billId]);
  else await q.query("update finance.bills set amount=$3,paid=paid || to_jsonb($4::text) where user_id=$1 and id=$2",
    [userId, billId, result.following || amount, month]);
  return {
    status: "posted" as const, entryId,
    posting: { id: loan.id, balanceBefore: Number(loan.balance), balanceAfter: result.balance, paidBefore: loan.paid, billId, priorBill: bill.paid, priorAmount: Number(bill.amount), at, amount },
  };
}

export async function undoLoanReceipt(q: Q, userId: string, posting: any) {
  const loan = (await q.query("select * from finance.loans where user_id=$1 and id=$2", [userId, posting.id])).rows[0];
  if (!loan) return false;
  const last = loan.payments.at(-1);
  if (loan.paid !== posting.paidBefore + 1 || Number(loan.balance) !== posting.balanceAfter ||
      last?.at !== posting.at || last.amount !== posting.amount || last.extra) return false;
  await q.query(`update finance.loans set balance=$3,paid=$4,payments=payments - (jsonb_array_length(payments)-1),
    mail_revision=mail_revision+1 where user_id=$1 and id=$2`, [userId, posting.id, posting.balanceBefore, posting.paidBefore]);
  await q.query(`insert into finance.bills(user_id,id,name,amount,day,icon,tone,paid)
    values($1,$2,$3,$4,$5,'home','cyan',$6::jsonb) on conflict(user_id,id) do update
    set amount=excluded.amount,paid=finance.bills.paid - $7::text`,
    [userId, posting.billId, loan.name, posting.priorAmount, loan.due_day, JSON.stringify(posting.priorBill), jakartaMonth(posting.at)]);
  return true;
}
