import * as webpush from "web-push";
import type { Hono } from "hono";

/** Web Push for the installed app. The payload has the same shape the in-app island banner shows. */
export type PushPayload = { id: string; tone: "in" | "out" | "move" | "mail" | "warn" | "info"; label: string; title: string; message: string; amount?: number; sign?: "+" | "−" | "⇄"; route?: string; at: string };
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, body: string, opts: Record<string, unknown>) => Promise<unknown>;

export const vapid = () => { const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY; return pub && priv ? { pub, priv, subject: process.env.VAPID_SUBJECT || "https://djiwapay.web.id" } : null; };

/** Sends to every device of one person; dead subscriptions (404/410) are removed. Never throws: a failed push must not break recording a payment. */
export async function notifyUser(db: Db, userId: string, payload: PushPayload, send?: Sender): Promise<number> {
  try {
    const keys = vapid(); if (!keys && !send) return 0;
    const subs = (await db.query("select endpoint, p256dh, auth from finance.push_subscriptions where user_id = $1", [userId])).rows;
    if (!subs.length) return 0;
    const body = JSON.stringify(payload).slice(0, 3500);
    const go: Sender = send ?? ((sub, text, opts) => webpush.sendNotification(sub as never, text, { vapidDetails: { subject: keys!.subject, publicKey: keys!.pub, privateKey: keys!.priv }, ...opts } as never));
    let sent = 0;
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
  app.get("/api/finance/push/status", async (c) => json(c, { success: true, devices: Number((await d.db.query("select count(*)::int n from finance.push_subscriptions where user_id = $1", [uid(c)])).rows[0]?.n ?? 0), configured: Boolean(vapid()) }));
  app.post("/api/finance/push/test", async (c) => {
    const id = uid(c), now = Date.now();
    if (now - (last.get(id) ?? 0) < 8000) return json(c, { success: false, error: "TOO_FAST" }, 429);
    last.set(id, now);
    const n = await notifyUser(d.db, id, { id: `test-${now}`, tone: "in", label: "Djiwa Pay", title: "Notifikasi aktif", message: "Seperti ini pemasukan, pengeluaran, dan email baru akan muncul.", route: "/", at: new Date().toISOString() }, send);
    return json(c, { success: n > 0, sent: n, ...(n ? {} : { error: "NO_DEVICE" }) }, n ? 200 : 404);
  });
}
