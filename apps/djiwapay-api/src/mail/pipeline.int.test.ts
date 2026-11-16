// Runs against a real Postgres (DATABASE_URL) in an isolated user id, and cleans up after itself. Skipped when no database is configured.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { poolTx } from "../index";
import { approve, ensureSource, processMail, reject, reviewCount, reviewList, type RawMail } from "./pipeline";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-${crypto.randomUUID().slice(0, 8)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
const domain = "catat.djiwapay.web.id";
let token = "";
const NOW = new Date("2026-11-15T07:00:00Z");
const deps = () => ({ db, domain, now: () => NOW });
let n = 0;
const mail = (over: Partial<RawMail> & { body?: string }): RawMail => ({
  messageId: `<t${++n}-${user}@x>`, from: "no-reply@gopay.co.id", to: [`${token}@${domain}`], subject: "Pembayaran berhasil",
  text: over.body ?? "Pembayaran ke Kopi Kenangan sebesar Rp 25.000 berhasil pada 15/11/2026 13:45. No. Referensi: GP2611151345A1", date: NOW,
  auth: { dmarcPass: true, dkimDomains: ["gopay.co.id"] }, ...over,
});
const entries = async () => (await pool.query("select id,kind,amount,account_id,to_account_id,category_id,source,inbound_id from finance.entries where user_id=$1 order by at", [user])).rows;

afterAll(async () => {
  if (!pool) return;
  for (const t of ["inbound_messages", "inbound_sources", "merchant_rules", "entries", "accounts", "profiles"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
  await pool.end();
});

run("mail pipeline (real database)", () => {
  test("gates", async () => {
    token = (await ensureSource(db, user)).token;
    expect((await processMail(deps(), mail({ to: [`nobody123@${domain}`] }))).reason).toBe("unknown-address");
    expect((await processMail(deps(), mail({ from: "promo@random.com" }))).reason).toBe("sender-not-allowed");
    expect((await processMail(deps(), mail({ auth: { dmarcPass: false, dkimDomains: ["evil.com"] } }))).reason).toBe("auth-failed");
    expect((await processMail(deps(), mail({ subject: "Kode OTP", body: "Kode verifikasi 123456 jangan berikan" }))).reason).toBe("secret");
    expect(await reviewCount(db, user)).toBe(0);
  });

  test("forwarding code from Google is kept for the setup screen", async () => {
    const out = await processMail(deps(), mail({ from: "forwarding-noreply@google.com", subject: "Gmail Forwarding Confirmation", body: "Confirmation code: 123456789", auth: { dmarcPass: true, dkimDomains: ["google.com"] } }));
    expect(out.status).toBe("forwarding-code");
    expect((await pool.query("select forward_code from finance.inbound_sources where user_id=$1", [user])).rows[0].forward_code).toBe("123456789");
  });

  test("a new payment mail is recorded straight away, never twice, and can be undone", async () => {
    const first = mail({});
    expect((await processMail(deps(), first)).status).toBe("auto");
    expect((await processMail(deps(), first)).status).toBe("duplicate");
    expect((await processMail(deps(), mail({}))).reason).toBe("same-reference");   // same bank reference, different Message-ID
    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "out", amount: "25000.00", category_id: "makan", source: "email" });
    expect(rows[0].inbound_id).toBeTruthy();
    expect((await pool.query("select id from finance.accounts where user_id=$1", [user])).rows.map((r) => r.id)).toContain("email-gopay");
    expect(await reviewCount(db, user)).toBe(0);                                      // nothing for a person to do
    expect((await pool.query("select trusted_count from finance.inbound_sources where user_id=$1", [user])).rows[0].trusted_count).toBe(0);   // recording does not wait for "trust"
    expect(Number((await pool.query("select version from finance.profiles where user_id=$1", [user])).rows[0].version)).toBeGreaterThan(0);
    const msg = (await pool.query("select id from finance.inbound_messages where user_id=$1 and status='auto'", [user])).rows[0];
    expect(await reject(db, user, msg.id)).toBe(true);                                // "Urungkan"
    expect(await entries()).toHaveLength(0);
    await processMail(deps(), mail({ body: "Pembayaran ke Kopi Kenangan sebesar Rp 25.000 berhasil pada 15/11/2026 13:45. No. Referensi: GP2611151345Z1" }));   // and the same payment can come back as a new one
    expect(await entries()).toHaveLength(1);
  });

  test("a mail the parser cannot tell is money in or out waits for a person, and approving teaches the category", async () => {
    const out = await processMail(deps(), mail({ subject: "Notifikasi", body: "Transaksi Rp 10.000 tercatat pada 15/11/2026 14:00. No. Referensi: GPUNK2611151400" }));
    expect(out).toMatchObject({ status: "review", reason: "needs-check" });
    const q = await reviewList(db, user);
    expect(q).toHaveLength(1);
    expect(q[0].parsed).toMatchObject({ amount: 10000 });
    const done = await approve(db, user, q[0].id, { kind: "out", categoryId: "belanja" });
    expect(done?.entryId).toBeTruthy();
    expect(await approve(db, user, q[0].id, {})).toBeNull();                          // cannot approve twice
    expect((await entries()).some((r) => r.category_id === "belanja" && r.inbound_id === q[0].id)).toBe(true);
    expect((await pool.query("select trusted_count from finance.inbound_sources where user_id=$1", [user])).rows[0].trusted_count).toBe(1);
  });

  test("an unreadable mail is queued as failed, without its body", async () => {
    const out = await processMail(deps(), mail({ subject: "Notifikasi", body: "Halo, ini pemberitahuan umum tanpa nominal." }));
    expect(out.status).toBe("failed");
    const row = (await reviewList(db, user)).find((r) => r.status === "failed");
    expect(row?.parsed.subject).toBe("Notifikasi");
    expect(JSON.stringify(row)).not.toContain("pemberitahuan umum");
  });

  test("the same money already recorded is not recorded again", async () => {
    const out = await processMail(deps(), mail({ body: "Pembayaran ke Kopi Kenangan sebesar Rp 25.000 berhasil pada 15/11/2026 13:47. No. Referensi: GP2611151347C9" }));
    expect(out).toMatchObject({ status: "duplicate", reason: "already-recorded" });
  });

  test("money moving between the user's own accounts becomes one transfer", async () => {
    const out1 = await processMail(deps(), { ...mail({ body: "Transfer ke DANA sebesar Rp 200.000 berhasil pada 15/11/2026 15:00. Rekening ****1234. No. Referensi: BC2611151500D1" }), from: "info@bca.co.id", auth: { dmarcPass: true, dkimDomains: ["bca.co.id"] } });
    expect(out1.status).toBe("auto");
    const out2 = await processMail(deps(), { ...mail({ body: "Top up berhasil. Dana diterima sebesar Rp 200.000 pada 15/11/2026 15:02. No. Referensi: DN2611151502E1" }), from: "no-reply@dana.id", auth: { dmarcPass: true, dkimDomains: ["dana.id"] } });
    expect(out2).toMatchObject({ status: "auto", reason: "transfer" });
    const tf = (await entries()).filter((r) => r.kind === "tf");
    expect(tf).toHaveLength(1);
    expect(tf[0]).toMatchObject({ account_id: "email-bca-1234", to_account_id: "email-dana", category_id: "transfer" });
  });

  test("an amount too large to trust waits for a person", async () => {
    const out = await processMail(deps(), mail({ body: "Pembayaran ke Toko Emas sebesar Rp 60.000.000 berhasil pada 15/11/2026 16:00. No. Referensi: GP2611151600F3" }));
    expect(out.status).toBe("review");
  });
});
