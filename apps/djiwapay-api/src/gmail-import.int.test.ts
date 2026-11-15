// Real Postgres + a simulated Gmail that filters by date, pages results and serves raw mail. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { poolTx } from "./db";
import { cancelImport, commitImport, createImport, importCheckItems, importState, runImports, undoImport } from "./gmail-import";
import { SCOPES, finishConnect, googleConfig, startConnect } from "./google";
import { approve, reviewList } from "./mail/pipeline";
import { toRawMail } from "./mail/smtp";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-im-${crypto.randomUUID().slice(0, 8)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
const cfg = googleConfig({ GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", GOOGLE_TOKEN_KEY: Buffer.alloc(32, 6).toString("base64") })!;
const DAY = 86400_000, NOW = Date.now();

type Msg = { id: string; internal: number; raw: string };
const VERDICT = (domain: string) => `Authentication-Results: mx.google.com; dkim=pass header.i=@${domain} header.s=old; spf=pass smtp.mailfrom=x@${domain}; dmarc=pass (p=REJECT) header.from=${domain}\r\n`;
let seq = 0;
const mail = (o: { from: string; subject: string; body: string; ageDays: number; verdict?: string | null; ref?: string }): Msg => {
  const id = `g${++seq}`, internal = NOW - o.ageDays * DAY;
  const verdictHeader = o.verdict === null ? "" : VERDICT(o.verdict ?? o.from.split("@")[1]);
  return { id, internal, raw: `${verdictHeader}From: ${o.from}\r\nTo: tester@example.com\r\nSubject: ${o.subject}\r\nMessage-ID: <${id}-${user}@x>\r\nDate: ${new Date(internal).toUTCString()}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${o.body}${o.ref ? ` No. Referensi: ${o.ref}` : ""}\r\n` };
};
const when = (ageDays: number) => { const d = new Date(NOW - ageDays * DAY + 7 * 3600_000); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };

let mailbox: Msg[] = []; const requests: string[] = []; let rateLimit = false;
const gfetch = (async (u: string) => {
  const url = new URL(String(u)); requests.push(url.pathname + url.search.slice(0, 40));
  const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
  if (url.host === "oauth2.googleapis.com") return ok({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: `${SCOPES.email} ${SCOPES.gmail}` });
  if (url.host === "openidconnect.googleapis.com") return ok({ email: "tester@example.com" });
  if (url.pathname.endsWith("/messages")) {
    if (rateLimit) return new Response("{}", { status: 429 });
    const q = url.searchParams.get("q") ?? "", after = Number(q.match(/after:(\d+)/)?.[1] ?? 0) * 1000, before = Number(q.match(/before:(\d+)/)?.[1] ?? Infinity) * 1000;
    const hits = mailbox.filter((m) => m.internal > after && m.internal < before);
    const from = Number(url.searchParams.get("pageToken") ?? 0), size = Number(url.searchParams.get("maxResults") ?? 50);
    const slice = hits.slice(from, from + size);
    return ok({ messages: slice.map((m) => ({ id: m.id })), ...(from + size < hits.length ? { nextPageToken: String(from + size) } : {}) });
  }
  const m = url.pathname.match(/messages\/([^/]+)$/);
  if (m) { const msg = mailbox.find((x) => x.id === m[1]); return msg ? ok({ raw: Buffer.from(msg.raw).toString("base64url") }) : new Response("{}", { status: 404 }); }
  return new Response("{}", { status: 200 });
}) as unknown as typeof fetch;
const deps = (budgetMs?: number) => ({ db, cfg, f: gfetch, pipeline: { db, domain: "catat.djiwapay.web.id" }, toMail: (raw: Buffer, ctx: any) => toRawMail(raw, { ...ctx, resolver: async () => { throw new Error("no dns: old keys are gone"); } }), budgetMs });
const scanAll = async (budgetMs?: number) => { let n = 0; for (; n < 400; n++) { await runImports(deps(budgetMs)); const s = (await importState(db, user)) as any; if (s.status !== "scanning") return { n, s }; } throw new Error("scan did not finish"); };
const entryCount = async () => Number((await pool.query("select count(*)::int n from finance.entries where user_id=$1", [user])).rows[0].n);

afterAll(async () => {
  if (!pool) return;
  for (const t of ["gmail_import", "inbound_messages", "inbound_sources", "merchant_rules", "entries", "accounts", "google_connections", "gmail_sync", "profiles"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
  await pool.query("delete from finance.gmail_import_seen where import_id not in (select id from finance.gmail_import)");
  await pool.end();
});

run("gmail import (real database, simulated Gmail)", () => {
  test("setup: connected Gmail, a mailbox spread over 80 days, and two learned rules", async () => {
    const state = new URL(await startConnect(db, cfg, user, ["gmail"])).searchParams.get("state")!;
    await finishConnect(db, cfg, "code", state, gfetch);
    await pool.query("insert into finance.inbound_sources(user_id,token) values($1,$2)", [user, `im${user.slice(-8)}`.replace(/[^a-z0-9]/g, "x").padEnd(10, "x")]);
    await pool.query("insert into finance.merchant_rules(user_id,pattern,category_id) values($1,'dana','transfer'),($1,'bca','transfer')", [user]);
    const pays = Array.from({ length: 70 }, (_, i) => mail({ from: "no-reply@gopay.co.id", subject: "Pembayaran berhasil", ageDays: 3 + i, body: `Pembayaran ke Kopi Kenangan sebesar Rp ${(20 + i) * 1000} berhasil pada ${when(3 + i)}.`, ref: `GP26${String(i).padStart(4, "0")}AB1` }));
    mailbox = [
      ...pays,
      mail({ from: "info@bca.co.id", subject: "Transfer", ageDays: 20, body: `Transfer ke rekening sendiri berhasil. Penerima: DANA. Jumlah Rp 200.000 pada ${when(20)}. Rekening ****1234.`, ref: "BCX2611200001" }),
      mail({ from: "no-reply@dana.id", subject: "Dana masuk", ageDays: 20, body: `Transfer dari BCA sebesar Rp 200.000 diterima pada ${when(20)}.`, ref: "DNX2611200002" }),
      mail({ from: "no-reply@gopay.co.id", subject: "Notifikasi", ageDays: 30, body: `Transaksi di Toko Antah Berantah sebesar Rp 15.000 berhasil pada ${when(30)}.` }),
      mail({ from: "no-reply@gopay.co.id", subject: "Halo", ageDays: 31, body: "Promo spesial untukmu minggu ini" }),
      mail({ from: "no-reply@gopay.co.id", subject: "Kode OTP", ageDays: 32, body: "Kode verifikasi 123456 jangan berikan ke siapa pun" }),
      mail({ from: "info@bca.co.id", subject: "Pembayaran", ageDays: 33, body: `Pembayaran ke Kopi Palsu sebesar Rp 999.000 berhasil pada ${when(33)}.`, verdict: null }),        // no Google verdict, old key gone: must be refused
      mail({ from: "info@bca.co.id", subject: "Pembayaran", ageDays: 34, body: `Pembayaran ke Kopi Palsu sebesar Rp 888.000 berhasil pada ${when(34)}.`, verdict: "evil.example" }), // Google says the DKIM domain was someone else's
    ];
    expect(mailbox.length).toBe(77);
  });

  test("scanning walks back in windows, pages, survives running out of time, and writes nothing yet", async () => {
    const id = await createImport(db, user, 90);
    const { n, s } = await scanAll(1500);                   // a short budget forces several interrupted steps
    expect(n).toBeGreaterThan(4);                           // it really was resumed
    expect(s.status).toBe("ready");
    expect(s.staged).toBeGreaterThan(70);
    expect(await entryCount()).toBe(0);                     // nothing is an entry before the commit
    expect((await pool.query("select count(*)::int n from finance.accounts where user_id=$1", [user])).rows[0].n).toBe(0);
    const p = s.preview;
    expect(p.sure.count).toBe(72);                          // 70 payments + the BCA/DANA pair
    expect(p.check.count).toBe(1);                          // the unknown merchant
    expect(p.months.length).toBeGreaterThanOrEqual(3);
    expect(p.categories[0].categoryId).toBe("makan");
    const refused = await pool.query("select count(*)::int n from finance.inbound_messages where user_id=$1 and import_id=$2 and parsed->>'merchant'='Kopi Palsu'", [user, id]);
    expect(refused.rows[0].n).toBe(0);                      // both forged ones were refused
    const raw = requests.filter((r) => r.includes("messages/g")).length;
    expect(raw).toBeLessThan(80);                           // each message fetched once, resumed pages did not refetch
  }, 120_000);

  test("the items that need a look come with a redacted sample to share", async () => {
    const s = (await importState(db, user)) as any;
    const items = await importCheckItems(db, user, s.id);
    expect(items).toHaveLength(1);
    expect(items[0].parsed.merchant).toContain("Toko Antah Berantah");
    expect(items[0].parsed.sample).toContain("Rp 15.000");
  });

  test("commit records the sure group, pairs the transfer, and hands the rest to the review queue", async () => {
    const s = (await importState(db, user)) as any;
    const out = await commitImport(db, user, s.id);
    expect(out).toMatchObject({ committed: 71, movedToReview: 1, transfers: 1 });
    expect(await entryCount()).toBe(71);                    // 70 payments + 1 transfer (two mails, one entry)
    const tf = (await pool.query("select account_id,to_account_id,category_id from finance.entries where user_id=$1 and kind='tf'", [user])).rows;
    expect(tf).toEqual([{ account_id: "email-bca-1234", to_account_id: "email-dana", category_id: "transfer" }]);
    expect((await pool.query("select id from finance.accounts where user_id=$1 order by id", [user])).rows.map((r) => r.id)).toEqual(["email-bca-1234", "email-dana", "email-gopay"]);
    expect((await pool.query("select trusted_count from finance.inbound_sources where user_id=$1", [user])).rows[0].trusted_count).toBe(0);   // an import is not the user's approval
    const q = await reviewList(db, user);
    expect(q).toHaveLength(1);
    expect(q[0].parsed.sample).toBeUndefined();             // the shared-sample text is dropped once it leaves the preview
    expect(await commitImport(db, user, s.id)).toBeNull();  // cannot commit twice
    // the queued item can still be approved, and its account then exists
    expect(await approve(db, user, q[0].id, {})).toBeTruthy();
    expect(await entryCount()).toBe(72);
  });

  test("undo removes everything the import created, nothing else", async () => {
    await pool.query("insert into finance.entries(user_id,id,kind,amount,category_id,account_id,at,note,source) values($1,'mine','out',5000,'makan','tunai',now(),'tulisan sendiri','manual')", [user]);
    const s = (await importState(db, user)) as any;
    expect(s.status).toBe("done");
    expect(await undoImport(db, user, s.id)).toMatchObject({ removed: 72 });
    expect(await entryCount()).toBe(1);
    expect(((await importState(db, user)) as any).status).toBe("undone");
  });

  test("a Gmail rate limit pauses the scan instead of failing it; cancelling clears the staging", async () => {
    mailbox = mailbox.slice(0, 5);
    await createImport(db, user, 90);
    rateLimit = true;
    await runImports(deps());
    let s = (await importState(db, user)) as any;
    expect(s.status).toBe("scanning"); expect(s.error).toBe("GMAIL_429");
    rateLimit = false;
    await pool.query("update finance.gmail_import set next_at=now() where user_id=$1 and status='scanning'", [user]);
    const done = await scanAll(); expect(done.s.status).toBe("ready");
    await cancelImport(db, user);
    expect((await pool.query("select count(*)::int n from finance.inbound_messages where user_id=$1 and status='staged'", [user])).rows[0].n).toBe(0);
    await createImport(db, user, 0);                        // "everything" starts fine and walks to its lower bound
    expect(((await importState(db, user)) as any).status).toBe("scanning");
  }, 60_000);
});
