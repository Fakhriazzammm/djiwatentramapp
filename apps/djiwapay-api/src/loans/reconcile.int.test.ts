import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { poolTx } from "../db";
import { processForUser, reject, reviewList, type RawMail } from "../mail/pipeline";
import { applySync, loadState } from "../sync";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const pool = url ? new Pool({ connectionString: url, max: 3, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : null;
const user = `itest-kpr-${crypto.randomUUID()}`;
const now = new Date("2026-11-21T08:00:00Z");
const loan = {
  id: "kpr", name: "KPR BTN", lender: "Bank BTN", kind: "kpr", model: "anuitas",
  principal: 12_000_000, balance: 12_000_000, paid: 0, months: 12, dueDay: 25,
  fixedRate: 12, fixedMonths: 1, floatRate: 24, installment: null, payments: [], assetId: "rumah",
};
const bill = { id: "ln-kpr", name: "KPR BTN", amount: 1066185, day: 25, icon: "home", tone: "cyan", paid: [] };
const mail = (subject: string, text: string): RawMail => ({
  messageId: crypto.randomUUID(), from: "no-reply@btn.co.id", to: [], subject, text,
  date: now, auth: { dmarcPass: true, dkimDomains: ["btn.co.id"] },
});
afterAll(async () => {
  if (!pool) return;
  for (const table of ["inbound_messages", "inbound_skips", "entries", "accounts", "bills", "loans", "profiles"]) {
    await pool.query(`delete from finance.${table} where user_id=$1`, [user]);
  }
  await pool.end();
});

run("KPR email reconciliation on Postgres", () => {
  test("atomically posts once, protects stale clients, and reverses loan, bill and expense together", async () => {
    const db = poolTx(pool!);
    const send = (message: RawMail) => processForUser({ db, now: () => now, domain: "catat.djiwapay.web.id" }, user, 0, message);
    await applySync(db, user, { upserts: { loans: [loan], bills: [bill] } });
    expect(await send(mail("Tagihan angsuran KPR BTN", "Tagihan angsuran KPR Rp 1.066.185. Jatuh tempo 25-NOV-26.")))
      .toMatchObject({ status: "ignored", reason: "loan-reminder-linked" });
    const receipt = (amount: string) => mail("Pembayaran angsuran KPR berhasil", `Pembayaran angsuran KPR sebesar Rp ${amount} berhasil pada 21/11/2026 15:00`);
    expect(await send(receipt("1.100.000"))).toMatchObject({ status: "review" });
    expect((await reviewList(db, user)).some((item) => item.parsed.loanMail === "receipt")).toBe(true);
    const outcomes = await Promise.all([send(receipt("1.066.185")), send(receipt("1.066.185"))]);
    expect(outcomes.map((out) => out.reason).sort()).toEqual(["loan-month-already-paid", "loan-payment"]);
    const posted = (await loadState(db, user)).state;
    expect(posted.loans[0]).toMatchObject({ balance: 11053815, paid: 1, mailRevision: 1, assetId: "rumah" });
    expect(posted.bills[0]).toMatchObject({ paid: ["2026-11"] });
    expect(posted.entries).toHaveLength(1);
    const entry = posted.entries[0];
    expect(entry).toMatchObject({ kind: "out", amount: 1066185, tags: ["loan-receipt"] });
    await expect(applySync(db, user, { upserts: { loans: [loan], bills: [bill] } })).rejects.toThrow("LOAN_CHANGED_BY_EMAIL");
    await applySync(db, user, { deletes: { entries: [entry.id] } });
    expect((await loadState(db, user)).state.entries).toHaveLength(1);
    expect(await reject(db, user, entry.inboundId!)).toBe(true);
    const undone = (await loadState(db, user)).state;
    expect(undone.loans[0]).toMatchObject({ balance: 12000000, paid: 0, payments: [], mailRevision: 2 });
    expect(undone.bills[0]).toMatchObject({ paid: [] });
    expect(undone.entries).toHaveLength(0);
  });
});
