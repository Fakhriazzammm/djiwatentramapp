// Runs against a real Postgres (DATABASE_URL) in an isolated user id. Skipped without a database.
// One payment can arrive twice: the bank's notice and the shop's own receipt. Whichever comes first, it is one record.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { poolTx } from "../index";
import { ensureSource, processForUser, processMail, reviewCount, type RawMail } from "./pipeline";
import { isDayOnly } from "./pipeline";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-rt-${crypto.randomUUID().slice(0, 8)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
const NOW = new Date("2026-11-21T12:18:00Z");
const deps = () => ({ db, domain: "catat.djiwapay.web.id", now: () => NOW });
let n = 0, token = "";
const bank = (amount: string, time: string): RawMail => ({
  messageId: `<b${++n}-${user}@x>`, from: "noreply@gopay.co.id", to: [`${token}@catat.djiwapay.web.id`], subject: "Pembayaran berhasil",
  text: `Pembayaran ke Pertamina sebesar Rp ${amount} berhasil pada 21/11/2026 ${time}. No. Referensi: GP${n}X${user.slice(-4)}`, date: NOW,
  auth: { dmarcPass: true, dkimDomains: ["gopay.co.id"] },
});
const shop = (amount: string): RawMail => ({
  messageId: `<s${++n}-${user}@x>`, from: "no-reply@mypertamina.id", to: [], subject: "Transaksi MyPertamina Berhasil",
  text: `Transaksi MyPertamina berhasil. Pembayaran sebesar Rp ${amount} pada 21 November 2026. Terima kasih.`, date: NOW,
  auth: { dmarcPass: true, dkimDomains: ["mypertamina.id"] },
});
const count = async (status: string) => Number((await pool.query("select count(*)::int n from finance.inbound_messages where user_id=$1 and status=$2", [user, status])).rows[0].n);
const entries = async () => (await pool.query("select id,amount from finance.entries where user_id=$1", [user])).rows;

afterAll(async () => {
  if (!pool) return;
  for (const t of ["inbound_messages", "inbound_skips", "inbound_sources", "sender_hints", "entries", "accounts", "profiles"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
  await pool.end();
});

test("a time that is exactly midnight in Jakarta is a day without an hour", () => {
  expect(isDayOnly("2026-11-20T17:00:00.000Z")).toBe(true);
  expect(isDayOnly("2026-11-21T12:14:00.000Z")).toBe(false);
  expect(isDayOnly(null)).toBe(false);
});

run("one payment, two e-mails (real database)", () => {
  test("the shop's receipt first, then the bank: only the bank's record remains", async () => {
    token = (await ensureSource(db, user)).token;
    await pool.query("update finance.inbound_sources set broad=true where user_id=$1", [user]);
    const s = await processForUser(deps(), user, 0, shop("200.000"));
    expect(s).toMatchObject({ status: "review", reason: "new-sender" });
    expect(await reviewCount(db, user)).toBe(1);
    expect((await processMail(deps(), bank("200.000", "19:14"))).status).toBe("auto");
    expect(await reviewCount(db, user)).toBe(0);          // nothing left to review
    expect(await count("duplicate")).toBe(1);
    expect(await entries()).toHaveLength(1);
  });

  test("the bank first, then the shop's receipt: the receipt is a duplicate, not a question", async () => {
    expect((await processMail(deps(), bank("350.000", "20:05"))).status).toBe("auto");
    const s = await processForUser(deps(), user, 0, shop("350.000"));
    expect(s).toMatchObject({ status: "duplicate", reason: "already-recorded" });
    expect(await reviewCount(db, user)).toBe(0);
    expect(await entries()).toHaveLength(2);
  });

  test("a different amount on the same day is still its own payment", async () => {
    const s = await processForUser(deps(), user, 0, shop("48.000"));
    expect(s.status).toBe("review");
    expect(await entries()).toHaveLength(2);
  });
});
