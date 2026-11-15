// Real Postgres, simulated Gmail, real DKIM verification. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { disableGmail, enableGmail, pollGmail, pollSoon, runDue } from "./gmail";
import { SCOPES, finishConnect, googleConfig, startConnect } from "./google";
import { poolTx } from "./db";
import { reviewList } from "./mail/pipeline";
import { toRawMail } from "./mail/smtp";
import { signed } from "./mail/testing";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-gm-${crypto.randomUUID().slice(0, 8)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
const cfg = googleConfig({ GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", GOOGLE_TOKEN_KEY: Buffer.alloc(32, 5).toString("base64") })!;

const calls: string[] = [];
let mailbox: Record<string, Buffer> = {}; let listStatus = 200; let resolver: any = async () => { throw new Error("no dns"); };
const gfetch = (async (u: string, init: RequestInit = {}) => {
  const url = String(u); calls.push(url);
  const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
  if (url.includes("oauth2.googleapis.com/token")) return ok({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: `${SCOPES.email} ${SCOPES.gmail}` });
  if (url.includes("openidconnect")) return ok({ email: "tester@example.com" });
  if (url.includes("/gmail/v1/users/me/messages?")) return listStatus === 200 ? ok({ messages: Object.keys(mailbox).map((id) => ({ id })) }) : new Response("{}", { status: listStatus });
  const m = url.match(/messages\/([^?]+)\?format=raw/);
  if (m) return mailbox[m[1]] ? ok({ raw: mailbox[m[1]].toString("base64url") }) : new Response("{}", { status: 404 });
  return new Response("{}", { status: 200 });
}) as unknown as typeof fetch;
const deps = () => ({ db, cfg, f: gfetch, pipeline: { db, domain: "catat.djiwapay.web.id" }, toMail: (raw: Buffer, ctx: any) => toRawMail(raw, { ...ctx, resolver }) });

afterAll(async () => {
  if (!pool) return;
  for (const t of ["gmail_sync", "gmail_seen", "google_connections", "inbound_messages", "inbound_sources", "merchant_rules", "entries", "accounts", "profiles"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
  await pool.end();
});

run("gmail direct (real database, simulated Gmail)", () => {
  test("connect with the Gmail scope, then the first poll reads only authentic bank mail", async () => {
    const state = new URL(await startConnect(db, cfg, user, ["gmail"])).searchParams.get("state")!;
    expect((await finishConnect(db, cfg, "code", state, gfetch)).features.gmail).toBe(true);
    await enableGmail(db, user);
    const good = await signed("gopay.co.id", "GoPay <no-reply@gopay.co.id>", "Pembayaran berhasil", "Pembayaran ke Kopi Kenangan sebesar Rp 25.000 berhasil pada 15/11/2026 13:45. No. Referensi: GP2611151345Z9");
    const forged = await signed("evil.example", "BCA <info@bca.co.id>", "Dana masuk", "Rekening ****1234 menerima transfer dari Budi sebesar Rp 9.999.000. No. Referensi: FAKE2611150001");
    resolver = async (name: string, rr: string) => { for (const s of [good, forged]) { try { return await s.resolver(name, rr); } catch { /* next */ } } throw new Error("ENOTFOUND"); };
    mailbox = { g1: good.raw, f1: forged.raw };
    const r = await pollGmail(deps(), user);
    expect(r).toMatchObject({ ok: true, processed: 2, outcomes: { review: 1, ignored: 1 } });
    const q = await reviewList(db, user);
    expect(q).toHaveLength(1);
    expect(q[0].parsed).toMatchObject({ amount: 25000, merchant: "Kopi Kenangan" });
    expect(JSON.stringify(q)).not.toContain("9.999.000");   // the forged one left nothing behind
  });

  test("a second poll skips mail it has already handled", async () => {
    const r = await pollGmail(deps(), user);
    expect(r).toMatchObject({ ok: true, processed: 0 });
    expect(calls.filter((c) => c.includes("format=raw")).length).toBe(2);   // never fetched again
  });

  test("a failing Gmail leaves the clock alone and backs off", async () => {
    const before = (await pool.query("select last_polled_at from finance.gmail_sync where user_id=$1", [user])).rows[0].last_polled_at;
    listStatus = 403;
    const r = await pollGmail(deps(), user);
    expect(r).toMatchObject({ ok: false, error: "GMAIL_FORBIDDEN" });
    const after = (await pool.query("select last_polled_at,last_error,next_poll_at from finance.gmail_sync where user_id=$1", [user])).rows[0];
    expect(new Date(after.last_polled_at).getTime()).toBe(new Date(before).getTime());
    expect(after.last_error).toBe("GMAIL_FORBIDDEN");
    expect(new Date(after.next_poll_at).getTime()).toBeGreaterThan(Date.now() + 5 * 60_000);
    listStatus = 200;
  });

  test("the scheduler only polls users who are due, and 'check now' makes a user due", async () => {
    expect(Object.keys(await runDue(deps()))).not.toContain(user);   // backed off
    await pollSoon(db, user);
    expect(Object.keys(await runDue(deps()))).toContain(user);
  });

  test("without the Gmail scope nothing is fetched", async () => {
    await pool.query("update finance.google_connections set granted_scopes=$2 where user_id=$1", [user, [SCOPES.email]]);
    expect(await pollGmail(deps(), user)).toMatchObject({ ok: false, error: "SCOPE_MISSING" });
  });

  test("turning Gmail off removes its bookkeeping", async () => {
    await disableGmail(db, user);
    expect((await pool.query("select 1 from finance.gmail_sync where user_id=$1", [user])).rows).toHaveLength(0);
    expect((await pool.query("select 1 from finance.gmail_seen where user_id=$1", [user])).rows).toHaveLength(0);
    expect(await pollGmail(deps(), user)).toMatchObject({ ok: false, error: "DISABLED" });
  });
});
