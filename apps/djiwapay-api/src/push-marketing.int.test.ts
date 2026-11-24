// Real database: a marketing push campaign end to end (audience rules, send, caps, opened, cancel). Isolated users.
import { afterAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { poolTx } from "./db";
import { Hono } from "hono";
import { pushEngine } from "./push-marketing";
import { registerPushRoutes } from "./push";
const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const p = url ? new Pool({ connectionString: url, max: 4, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : null;
const tag = `itest-pm-${crypto.randomUUID().slice(0, 8)}`, A = `${tag}-a`, B = `${tag}-b`, C = `${tag}-c`;
const sentTo: string[] = [];
const eng = () => pushEngine({ admin: { db: poolTx(p!), authDb: null, emailOf: async () => null }, members: async () => new Set<string>(), now: () => Date.UTC(2026, 10, 25, 5, 0, 0), sendWeb: async (sub, payload: any) => { if (sub.endpoint.includes("dead")) throw Object.assign(new Error("gone"), { statusCode: 410 }); sentTo.push(sub.endpoint + "|" + payload.title); } });
const sub = (u: string, ep: string) => p!.query("insert into finance.push_subscriptions(user_id, endpoint, p256dh, auth) values($1,$2,'p','a')", [u, `https://push.test/${tag}/${ep}`]);
afterAll(async () => { if (!p) return; await p.query("delete from finance.push_campaigns where name like $1", [`${tag}%`]); await p.query("delete from finance.push_subscriptions where user_id like $1", [`${tag}%`]); await p.query("delete from finance.push_prefs where user_id like $1", [`${tag}%`]); await p.end(); });
run("push marketing in Postgres", () => {
  process.env.VAPID_PUBLIC_KEY ||= "x"; process.env.VAPID_PRIVATE_KEY ||= "y";
  test("setup devices and choices", async () => {
    await sub(A, "a1"); await sub(B, "b1"); await sub(C, "dead-c1");
    await p!.query("insert into finance.push_prefs(user_id, marketing, topics) values($1,false,'{promo}')", [B]);
  });
  test("a campaign reaches only people who opted in, drops dead devices, and finishes", async () => {
    const e = eng(), made = await e.create({ name: `${tag} satu`, title: "Hai {{nama}}", body: "Coba fitur baru", topic: "promo", segment: "devices", platform: "web" }, "t");
    const before = await e.preview({ title: "x", topic: "promo", segment: "devices", platform: "web" });
    expect(before.devices).toBeGreaterThanOrEqual(2);
    const row = (await p!.query("select * from finance.push_campaigns where id=$1", [made.campaign.id])).rows[0]; expect(row.status).toBe("draft");
    await e.start(made.campaign.id);
    for (let i = 0; i < 30; i++) { const s = (await p!.query("select status from finance.push_campaigns where id=$1", [made.campaign.id])).rows[0].status; if (s === "done") break; await Bun.sleep(100); }
    const rows = (await p!.query("select user_id, status from finance.push_deliveries where campaign_id=$1 and user_id like $2", [made.campaign.id, `${tag}%`])).rows;
    const by = Object.fromEntries(rows.map((r: any) => [r.user_id, r.status]));
    expect(by[A]).toBe("sent"); expect(B in by).toBe(false); expect(by[C]).toBe("failed");
    expect(sentTo.some((x) => x.includes(`${tag}/a1`) && x.endsWith("Hai Sahabat Djiwa"))).toBe(true);
    expect((await p!.query("select count(*)::int n from finance.push_subscriptions where user_id=$1", [C])).rows[0].n).toBe(0);
    const did = (await p!.query("select id from finance.push_deliveries where campaign_id=$1 and user_id=$2", [made.campaign.id, A])).rows[0].id;
    await p!.query("update finance.push_deliveries set opened_at = now() where id=$1", [did]);
    const g = await e.get(made.campaign.id); expect(g.opened).toBe(1); expect(g.stats.sent).toBeGreaterThanOrEqual(1);
  });
  test("the person sees the push on the notifications page, and opening it marks it read", async () => {
    const app = new Hono(), json = (c: any, b: unknown, st = 200) => c.body(JSON.stringify(b), st, { "Content-Type": "application/json" });
    registerPushRoutes(app, { db: poolTx(p!) }, () => A, json);
    const get = async () => (await (await app.request("/api/finance/push/inbox")).json()) as { items: { id: string; title: string; opened: boolean; route: string }[] };
    const first = (await get()).items.find((x) => x.title === "Hai Sahabat Djiwa");
    expect(first).toBeTruthy(); expect(first!.id.startsWith("pm-")).toBe(true); expect(first!.route).toBe("/");
    await app.request("/api/finance/push/opened", { method: "POST", body: JSON.stringify({ did: first!.id.slice(3) }), headers: { "Content-Type": "application/json" } });
    expect((await get()).items.find((x) => x.id === first!.id)!.opened).toBe(true);
    registerPushRoutes(app, { db: poolTx(p!) }, () => B, json);   // another person has none of it
  });
  test("the second campaign the same day skips the person who just got one", async () => {
    const e = eng(), made = await e.create({ name: `${tag} dua`, title: "Lagi", body: "Pesan kedua", topic: "promo", segment: "devices", platform: "web" }, "t");
    const pv = await e.preview({ title: "x", topic: "promo", segment: "devices", platform: "web", campaignId: made.campaign.id });
    expect(pv.skipped.capped).toBeGreaterThanOrEqual(1);
  });
  test("cancel stops a draft and delete removes it", async () => {
    const e = eng(), made = await e.create({ name: `${tag} tiga`, title: "x", body: "y", topic: "fitur", segment: "devices" }, "t");
    const c = await e.cancel(made.campaign.id); expect(c.campaign.status).toBe("canceled");
    expect((await e.remove(made.campaign.id)).deleted).toBe(true);
  });
  test("rejects bad input", async () => {
    const e = eng();
    await expect(e.create({ name: "n", title: "", body: "b", segment: "devices" }, "t")).rejects.toThrow("Judul wajib");
    await expect(e.create({ name: "n", title: "t", body: "b", segment: "xx" }, "t")).rejects.toThrow("Audiens");
    await expect(e.create({ name: "n", title: "t", body: "b", segment: "devices", imageUrl: "http://x" }, "t")).rejects.toThrow("https");
  });
});
