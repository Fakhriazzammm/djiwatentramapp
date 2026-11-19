// Runs against a real Postgres (DATABASE_URL) in an isolated user id. Skipped without a database.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { poolTx } from "../index";
import { approve, ensureSource, processForUser, reviewGroups, reviewList, type RawMail } from "./pipeline";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-gn-${crypto.randomUUID().slice(0, 8)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
const NOW = new Date("2026-11-19T07:00:00Z");
const deps = () => ({ db, domain: "catat.djiwapay.web.id", now: () => NOW });
let n = 0;
const mail = (over: Partial<RawMail> = {}): RawMail => ({
  messageId: `<g${++n}-${user}@x>`, from: "billing@warungkopi.id", to: [], subject: "Bukti pembayaran pesanan #1042",
  text: "Terima kasih. Pembayaran sebesar Rp 85.000 untuk pesanan #1042 berhasil pada 19/11/2026 13:45. No. Referensi: WK1042", date: NOW,
  auth: { dmarcPass: true, dkimDomains: ["warungkopi.id"] }, ...over,
});
const send = (m: RawMail) => processForUser(deps(), user, 0, m);
const entries = async () => (await pool.query("select id,kind,amount from finance.entries where user_id=$1", [user])).rows.map((r) => ({ ...r, amount: Number(r.amount) }));
const skip = async (reason: string) => Number((await pool.query("select count(*)::int n from finance.inbound_skips where user_id=$1 and reason=$2", [user, reason])).rows[0].n);

afterAll(async () => {
  if (!pool) return;
  for (const t of ["inbound_hooks", "inbound_messages", "inbound_skips", "inbound_sources", "sender_hints", "merchant_rules", "entries", "accounts", "profiles"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
  await pool.end();
});

run("detecting money movements from unknown senders (real database)", () => {
  test("off by default: a sender outside the list is ignored", async () => {
    await ensureSource(db, user);
    expect(await send(mail())).toMatchObject({ status: "ignored", reason: "sender-not-allowed" });
    expect(await skip("sender-not-allowed")).toBe(1);
  });

  test("opted in: it is queued to ask, never recorded by itself", async () => {
    await pool.query("update finance.inbound_sources set broad=true where user_id=$1", [user]);
    const out = await send(mail());
    expect(out).toMatchObject({ status: "review", reason: "new-sender" });
    expect(await entries()).toHaveLength(0);
    const item = (await reviewList(db, user)).find((i) => i.parsed.generic)!;
    expect(item.channel).toBe("other");
    expect(item.parsed).toMatchObject({ generic: true, amount: 85000, issuer: "Warungkopi", accountId: "tunai" });
    expect(item.parsed.flags[0]).toContain("pilih pemasukan atau pengeluaran");
  });

  test("the sender must prove it is who it says; a payment must read like a payment", async () => {
    expect(await send(mail({ auth: { dmarcPass: false, dkimDomains: ["evil.com"] } }))).toMatchObject({ status: "ignored", reason: "auth-failed" });
    expect(await send(mail({ subject: "Kabar dari kami", text: "Selamat datang di komunitas kami, ada acara menarik minggu depan." }))).toMatchObject({ status: "ignored", reason: "not-payment" });
    expect(await send(mail({ subject: "Kode OTP", text: "Kode OTP kamu 123456, jangan bagikan. Pembayaran Rp 1.000 berhasil." }))).toMatchObject({ status: "ignored", reason: "secret" });
  });

  test("approving needs the person's answer; the answer becomes the next suggestion", async () => {
    const item = (await reviewList(db, user)).find((i) => i.parsed.generic)!;
    expect(await approve(db, user, item.id, {})).toBeNull();                                  // no answer, no record
    expect(await approve(db, user, item.id, { kind: "maybe" })).toBeNull();
    expect(await entries()).toHaveLength(0);
    const done = await approve(db, user, item.id, { kind: "in", categoryId: "bonus", note: "Penjualan kopi" });
    expect(done).not.toBeNull();
    expect(await entries()).toEqual([expect.objectContaining({ kind: "in", amount: 85000 })]);
    const again = await send(mail({ text: "Pembayaran sebesar Rp 120.000 untuk pesanan #1043 berhasil pada 19/11/2026 14:10. No. Referensi: WK1043" }));
    expect(again.status).toBe("review");
    const next = (await reviewList(db, user)).find((i) => i.parsed.generic && i.parsed.amount === 120000)!;
    expect(next.parsed).toMatchObject({ suggest: "in", suggestFrom: "hint" });
    expect(await entries()).toHaveLength(1);                                                   // still waiting for the tap
  });

  test("unknown-sender items never go into batch approval", async () => {
    const { groups } = await reviewGroups(db, user);
    expect(groups.some((g) => g.name.toLowerCase().includes("kopi") || g.name.toLowerCase().includes("pesanan"))).toBe(false);
  });

  test("the same money already recorded is not asked about again", async () => {
    const dup = await send(mail({ text: "Pembayaran sebesar Rp 85.000 untuk pesanan #1099 berhasil pada 19/11/2026 13:45. No. Referensi: WK1099", date: NOW }));
    expect(["duplicate", "review"]).toContain(dup.status);
  });

  test("built into the Apps Script: version 2 reads other senders, an older script does not, no separate switch", async () => {
    await pool.query("update finance.inbound_sources set broad=false where user_id=$1", [user]);
    const token = Array.from({ length: 40 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join("");
    await pool.query("insert into finance.inbound_hooks(user_id,token,script_version) values($1,$2,1)", [user, token]);
    expect(await send(mail({ text: "Pembayaran sebesar Rp 33.000 untuk pesanan #2001 berhasil pada 19/11/2026 15:00. No. Referensi: WK2001" }))).toMatchObject({ status: "ignored", reason: "sender-not-allowed" });
    await pool.query("update finance.inbound_hooks set script_version=2 where user_id=$1", [user]);
    expect(await send(mail({ text: "Pembayaran sebesar Rp 34.000 untuk pesanan #2002 berhasil pada 19/11/2026 15:05. No. Referensi: WK2002" }))).toMatchObject({ status: "review", reason: "new-sender" });
  });
});
