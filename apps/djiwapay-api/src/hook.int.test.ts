// Real Postgres, real DKIM verification, through the real HTTP routes. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { createApp, poolTx } from "./index";
import { toRawMail } from "./mail/smtp";
import { signed } from "./mail/testing";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-hk-${crypto.randomUUID().slice(0, 8)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
let resolver: any = async () => { throw new Error("no dns"); };
const app = () => createApp({ db, resolve: async (cookie: string) => (cookie.includes("me") ? user : null), dir: "/tmp", mailDomain: "catat.djiwapay.web.id", publicUrl: "https://djiwapay.web.id",
  hook: { db, pipeline: { db, domain: "catat.djiwapay.web.id" }, toMail: (raw: Buffer, ctx: any) => toRawMail(raw, { ...ctx, resolver }) } });
const mine = { headers: { cookie: "me" } };

afterAll(async () => {
  if (!pool) return;
  for (const t of ["inbound_hooks", "inbound_messages", "inbound_sources", "merchant_rules", "entries", "accounts", "profiles"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
  await pool.end();
});

run("apps script hook (real database, real DKIM)", () => {
  let token = "";
  test("needs a login to create, and the response carries a ready-to-paste script", async () => {
    const a = app();
    expect((await a.request("/api/finance/inbound/hook", { method: "POST" })).status).toBe(401);
    const r = await (await a.request("/api/finance/inbound/hook", { method: "POST", body: "{}", ...mine })).json() as any;
    expect(r).toMatchObject({ success: true, enabled: true });
    token = r.url.split("/").pop();
    expect(r.url).toStartWith("https://djiwapay.web.id/api/finance/hook/");
    expect(r.script).toContain(r.url);
    expect(token).toMatch(/^[A-Za-z0-9]{40}$/);
    expect((await (await a.request("/api/finance/inbound/hook", { method: "POST", body: "{}", ...mine })).json() as any).url).toBe(r.url);   // idempotent
  });

  test("the script's config call is public but only for a real token", async () => {
    const a = app();
    const ok = await a.request(`/api/finance/hook/${token}`); expect(ok.status).toBe(200);
    expect((await ok.json() as any).domains).toContain("gopay.co.id");
    expect((await a.request(`/api/finance/hook/${"x".repeat(40)}`)).status).toBe(404);
    expect((await a.request("/api/finance/hook/short")).status).toBe(404);
  });

  test("genuine bank mail is recorded; forged, tampered and unlisted mail leave nothing; a repeat is a duplicate", async () => {
    const a = app();
    const good = await signed("gopay.co.id", "GoPay <no-reply@gopay.co.id>", "Pembayaran berhasil", "Pembayaran ke Kopi Kenangan sebesar Rp 25.000 berhasil pada 15/11/2026 13:45. No. Referensi: GP2611151345H1");
    const forged = await signed("evil.example", "BCA <info@bca.co.id>", "Dana masuk", "Rekening ****1234 menerima transfer dari Budi sebesar Rp 9.999.000. No. Referensi: FAKE2611150002");
    const tampered = await signed("gopay.co.id", "GoPay <no-reply@gopay.co.id>", "Pembayaran berhasil", "Pembayaran ke Warung Budi sebesar Rp 25.000 berhasil pada 15/11/2026 13:50. No. Referensi: GP2611151350H2", { tamper: true });
    const stranger = await signed("random.example", "Promo <p@random.example>", "Diskon", "Belanja Rp 1.000.000");
    resolver = async (name: string, rr: string) => { for (const s of [good, forged, tampered, stranger]) { try { return await s.resolver(name, rr); } catch { /* next */ } } throw new Error("ENOTFOUND"); };
    const post = async (raw: Buffer) => { const r = await a.request(`/api/finance/hook/${token}`, { method: "POST", body: raw, headers: { "content-type": "text/plain" } }); return { code: r.status, ...(await r.json() as any) }; };
    expect(await post(good.raw)).toMatchObject({ code: 200, status: "auto" });
    expect((await post(forged.raw)).status).toBe("ignored");
    expect((await post(tampered.raw)).status).toBe("ignored");
    expect((await post(stranger.raw)).status).toBe("ignored");
    expect((await post(good.raw)).status).toBe("duplicate");
    const rec = (await pool.query("select amount,note,source from finance.entries where user_id=$1", [user])).rows;
    expect(rec).toEqual([{ amount: "25000.00", note: "Kopi Kenangan", source: "email" }]);
    expect(JSON.stringify(rec)).not.toContain("9999000");
    const st = await (await a.request("/api/finance/inbound/hook", mine)).json() as any;
    expect(st.received).toBe(5); expect(st.lastAt).toBeTruthy();
  });

  test("garbage, oversize and unknown tokens are refused without touching data", async () => {
    const a = app();
    expect((await a.request(`/api/finance/hook/${token}`, { method: "POST", body: "hi" })).status).toBe(422);
    expect((await a.request(`/api/finance/hook/${token}`, { method: "POST", body: Buffer.alloc(1_100_000, 97) })).status).toBe(413);
    expect((await a.request(`/api/finance/hook/${"y".repeat(40)}`, { method: "POST", body: Buffer.alloc(200, 97) })).status).toBe(404);
  });

  test("rotating cuts the old URL off at once; revoking removes it", async () => {
    const a = app();
    const r = await (await a.request("/api/finance/inbound/hook", { method: "POST", body: JSON.stringify({ rotate: true }), ...mine })).json() as any;
    expect(r.url).not.toContain(token);
    expect((await a.request(`/api/finance/hook/${token}`)).status).toBe(404);
    expect((await a.request(r.url.replace("https://djiwapay.web.id", ""))).status).toBe(200);
    await a.request("/api/finance/inbound/hook", { method: "DELETE", ...mine });
    expect((await (await a.request("/api/finance/inbound/hook", mine)).json() as any).enabled).toBe(false);
    expect((await a.request(r.url.replace("https://djiwapay.web.id", ""))).status).toBe(404);
  });
});
