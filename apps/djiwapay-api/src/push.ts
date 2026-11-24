import * as webpush from "web-push";
import type { Hono } from "hono";
import { fcmAccount, sendFcm } from "./fcm.js";
import { DEFAULT_TOPICS, TOPICS, isTopic, renderPush } from "./push-marketing.js";

/** Web Push for the installed app. The payload has the same shape the in-app island banner shows. */
export type PushPayload = { id: string; tone: "in" | "out" | "move" | "mail" | "warn" | "info"; label: string; title: string; message: string; amount?: number; sign?: "+" | "−" | "⇄"; route?: string; at: string };
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string, opts: Record<string, unknown>) => Promise<unknown>;

export const vapid = () => { const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY; return pub && priv ? { pub, priv, subject: process.env.VAPID_SUBJECT || "https://djiwapay.web.id" } : null; };

/** Sends to every device of one person; dead subscriptions (404/410) are removed. Never throws: a failed push must not break recording a payment. */
export async function notifyUser(db: Db, userId: string, payload: PushPayload, send?: Sender): Promise<number> {
  try {
    const keys = vapid(), fcm = fcmAccount(); if (!keys && !fcm && !send) return 0;
    const all = (await db.query("select endpoint, p256dh, auth, platform from finance.push_subscriptions where user_id = $1", [userId])).rows;
    const subs = all.filter((s) => s.platform !== "android"), droid = fcm ? all.filter((s) => s.platform === "android") : [];
    if (!subs.length && !droid.length) return 0;
    const body = JSON.stringify(payload).slice(0, 3500);
    const go: Sender = send ?? ((sub, text, opts) => webpush.sendNotification(sub as never, text, { vapidDetails: { subject: keys!.subject, publicKey: keys!.pub, privateKey: keys!.priv }, ...opts } as never));
    let sent = 0;
    await Promise.all(droid.map(async (s) => {
      const r = await sendFcm(String(s.endpoint).replace(/^fcm:/, ""), { title: payload.title, body: payload.message, channel: "transaksi", data: { route: payload.route ?? "/", kind: "tx", id: payload.id } });
      if (r.ok) sent += 1; else if (r.dead) await db.query("delete from finance.push_subscriptions where user_id = $1 and endpoint = $2", [userId, s.endpoint]);
    }));
    await Promise.all(subs.map(async (s) => {
      try { await go({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: "high", topic: payload.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined }); sent += 1; await db.query("update finance.push_subscriptions set last_ok_at = now() where user_id = $1 and endpoint = $2", [userId, s.endpoint]); }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await db.query("delete from finance.push_subscriptions where user_id = $1 and endpoint = $2", [userId, s.endpoint]); }
    }));
    return sent;
  } catch { return 0; }
}

const b64url = /^[A-Za-z0-9_-]{8,200}={0,2}$/;
export function registerPushRoutes(app: Hono, d: { db: Db }, uid: (c: any) => string, json: (c: any, body: unknown, status?: number) => Response, send?: Sender) {
  const last = new Map<string, number>();
  app.get("/api/finance/push/key", (c) => { const v = vapid(); return v ? json(c, { success: true, key: v.pub }) : json(c, { success: false, error: "PUSH_NOT_CONFIGURED" }, 503); });
  app.post("/api/finance/push/subscribe", async (c) => {
    const b = await c.req.json().catch(() => null) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
    const endpoint = typeof b?.endpoint === "string" ? b.endpoint : "", p256dh = b?.keys?.p256dh, auth = b?.keys?.auth;
    if (!/^https:\/\/[^\s]{8,990}$/.test(endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || !b64url.test(p256dh) || !b64url.test(auth)) return json(c, { success: false, error: "BAD_SUBSCRIPTION" }, 400);
    await d.db.query("insert into finance.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent) values($1,$2,$3,$4,$5) on conflict (user_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent", [uid(c), endpoint, p256dh, auth, (c.req.header("user-agent") || "").slice(0, 200)]);
    return json(c, { success: true });
  });
  app.post("/api/finance/push/unsubscribe", async (c) => {
    const b = await c.req.json().catch(() => null) as { endpoint?: unknown } | null;
    if (typeof b?.endpoint === "string") await d.db.query("delete from finance.push_subscriptions where user_id = $1 and endpoint = $2", [uid(c), b.endpoint]);
    return json(c, { success: true });
  });
  /* ---- Android (FCM) device, topic choices, and the "opened" signal of a marketing push ---- */
  const tokenRe = /^[A-Za-z0-9_:.\-]{20,400}$/;
  app.post("/api/finance/push/fcm", async (c) => {
    const b = await c.req.json().catch(() => null) as { token?: unknown; appVersion?: unknown } | null;
    if (typeof b?.token !== "string" || !tokenRe.test(b.token)) return json(c, { success: false, error: "BAD_TOKEN" }, 400);
    const v = typeof b.appVersion === "string" ? b.appVersion.slice(0, 20) : null;
    await d.db.query("insert into finance.push_subscriptions(user_id, endpoint, platform, app_version, user_agent) values($1,$2,'android',$3,$4) on conflict (user_id, endpoint) do update set app_version = excluded.app_version, updated_at = now()", [uid(c), `fcm:${b.token}`, v, (c.req.header("user-agent") ?? "").slice(0, 200)]);
    await d.db.query("delete from finance.push_subscriptions where endpoint = $1 and user_id <> $2", [`fcm:${b.token}`, uid(c)]);   // a phone that changes account belongs to the new one
    return json(c, { success: true });
  });
  app.post("/api/finance/push/fcm/remove", async (c) => {
    const b = await c.req.json().catch(() => null) as { token?: unknown } | null;
    if (typeof b?.token === "string") await d.db.query("delete from finance.push_subscriptions where user_id = $1 and endpoint = $2", [uid(c), `fcm:${b.token}`]);
    return json(c, { success: true });
  });
  const prefs = async (id: string) => { const r = (await d.db.query("select marketing, topics from finance.push_prefs where user_id = $1", [id])).rows[0]; return { marketing: r?.marketing ?? true, topics: (r?.topics ?? DEFAULT_TOPICS) as string[] }; };
  app.get("/api/finance/push/prefs", async (c) => json(c, { success: true, ...(await prefs(uid(c))), topicList: TOPICS }));
  app.post("/api/finance/push/prefs", async (c) => {
    const b = await c.req.json().catch(() => null) as { marketing?: unknown; topics?: unknown } | null, cur = await prefs(uid(c));
    const marketing = typeof b?.marketing === "boolean" ? b.marketing : cur.marketing;
    const raw = b?.topics, topics = Array.isArray(raw) ? [...new Set(raw.filter(isTopic))] : cur.topics;
    await d.db.query("insert into finance.push_prefs(user_id, marketing, topics) values($1,$2,$3) on conflict (user_id) do update set marketing = excluded.marketing, topics = excluded.topics, updated_at = now()", [uid(c), marketing, topics]);
    return json(c, { success: true, marketing, topics });
  });
  /** Marketing pushes this person was sent in the last 30 days, one per campaign, for the in-app notifications page. */
  app.get("/api/finance/push/inbox", async (c) => {
    const rows = (await d.db.query(`select c.id::text cid, c.title, c.body, c.route, c.image_url, min(d.id::text) did, max(d.sent_at) at, bool_or(d.opened_at is not null) opened, (array_agg(d.vars order by d.id))[1] vars
      from finance.push_deliveries d join finance.push_campaigns c on c.id = d.campaign_id where d.user_id = $1 and d.status = 'sent' and d.sent_at > now() - interval '30 days' group by c.id order by max(d.sent_at) desc limit 20`, [uid(c)])).rows;
    return json(c, { success: true, items: rows.map((r) => ({ id: `pm-${r.did}`, campaign: r.cid, title: renderPush(r.title, r.vars ?? {}), message: renderPush(r.body, r.vars ?? {}), route: r.route, image: r.image_url, at: r.at, opened: r.opened })) });
  });
  app.post("/api/finance/push/opened", async (c) => {   // public: the delivery id is the secret
    const b = await c.req.json().catch(() => null) as { did?: unknown } | null;
    if (typeof b?.did === "string" && /^[0-9a-f-]{36}$/i.test(b.did)) await d.db.query("update finance.push_deliveries set opened_at = now() where id = $1::uuid and opened_at is null", [b.did]).catch(() => undefined);
    return json(c, { success: true });
  });
  app.get("/api/finance/push/status", async (c) => json(c, { success: true, devices: Number((await d.db.query("select count(*)::int n from finance.push_subscriptions where user_id = $1", [uid(c)])).rows[0]?.n ?? 0), configured: Boolean(vapid()) }));
  app.post("/api/finance/push/test", async (c) => {
    const id = uid(c), now = Date.now();
    if (now - (last.get(id) ?? 0) < 8000) return json(c, { success: false, error: "TOO_FAST" }, 429);
    last.set(id, now);
    const n = await notifyUser(d.db, id, { id: `test-${now}`, tone: "in", label: "Djiwa Pay", title: "Notifikasi aktif", message: "Seperti ini pemasukan, pengeluaran, dan email baru akan muncul.", route: "/", at: new Date().toISOString() }, send);
    return json(c, { success: n > 0, sent: n, ...(n ? {} : { error: "NO_DEVICE" }) }, n ? 200 : 404);
  });
}
