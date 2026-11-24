import * as webpush from "web-push";
import type { Hono } from "hono";
import type { AdminDeps } from "./admin.js";
import { fcmAccount, sendFcm } from "./fcm.js";
import { vapid } from "./push.js";
import { SEGMENTS, firstName, type SegmentKey } from "./email-marketing.js";

/**
 * Marketing push for Djiwa Pay, to the installed web app (Web Push) and the Android app (FCM).
 * Rules every send follows: only people who kept marketing on and chose the topic; never more than 1 per day and 3 per week
 * per person; none between 21:00 and 07:00 WIB; unreachable devices are dropped.
 */
export const TOPICS = { fitur: "Kabar fitur baru", promo: "Promo dan tawaran", tips: "Tips mengatur uang" } as const;
export type Topic = keyof typeof TOPICS;
export const isTopic = (v: unknown): v is Topic => typeof v === "string" && v in TOPICS;
export const DEFAULT_TOPICS: Topic[] = ["fitur", "promo", "tips"];
export const PLATFORMS = ["all", "android", "web"] as const;
export type PlatformFilter = (typeof PLATFORMS)[number];
export const CAP_PER_DAY = 1, CAP_PER_WEEK = 3, QUIET_FROM = 21, QUIET_TO = 7;
const TIME_BUDGET_MS = 50_000, CHUNK = 40, WIB = 7 * 3600_000;

export type Device = { userId: string; endpoint: string; platform: "web" | "android" };
export type Pref = { marketing: boolean; topics: string[] };
export type Sent = { day: number; week: number };

export const inQuietHours = (now = Date.now()) => { const h = new Date(now + WIB).getUTCHours(); return h >= QUIET_FROM || h < QUIET_TO; };

/** Who gets this campaign: pure, so the rules are testable. `members` null means "everyone with a device". */
export function pickDevices(devices: Device[], o: { prefs: Map<string, Pref>; topic: Topic; platform: PlatformFilter; members: Set<string> | null; sent: Map<string, Sent>; channels: { web: boolean; android: boolean } }) {
  const skipped = { noChannel: 0, optedOut: 0, notInSegment: 0, capped: 0 }, out: Device[] = [], counted = new Set<string>();
  for (const dv of devices) {
    if (!o.channels[dv.platform]) { skipped.noChannel++; continue; }
    if (o.platform !== "all" && dv.platform !== o.platform) continue;
    const p = o.prefs.get(dv.userId) ?? { marketing: true, topics: DEFAULT_TOPICS as string[] };
    if (!p.marketing || !p.topics.includes(o.topic)) { skipped.optedOut++; continue; }
    if (o.members && !o.members.has(dv.userId)) { skipped.notInSegment++; continue; }
    const s = o.sent.get(dv.userId);
    if (s && (s.day >= CAP_PER_DAY || s.week >= CAP_PER_WEEK)) { if (!counted.has(dv.userId)) { skipped.capped++; counted.add(dv.userId); } continue; }
    out.push(dv);
  }
  return { devices: out, users: new Set(out.map((x) => x.userId)).size, skipped };
}

export const renderPush = (t: string, vars: Record<string, string>) => t.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => vars[k] ?? "");

type Json = Record<string, any>;
class UserError extends Error { constructor(m: string, public code = "BAD_REQUEST") { super(m); } }
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const safeRoute = (v: unknown) => { const r = text(v) || "/"; return /^\/[A-Za-z0-9/_\-?=&%.#]{0,200}$/.test(r) ? r : "/"; };
const safeImage = (v: unknown) => { const r = text(v); if (!r) return null; if (!/^https:\/\/[^\s]{6,490}$/.test(r)) throw new UserError("Alamat gambar harus berupa https"); return r; };

export type PushEngineDeps = { admin: AdminDeps; members: (segment: SegmentKey) => Promise<Set<string>>; now?: () => number; sendWeb?: (sub: { endpoint: string; p256dh: string; auth: string }, payload: object) => Promise<unknown> };

export function sendWebPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: object) {
  const k = vapid(); if (!k) return Promise.reject(Object.assign(new Error("PUSH_NOT_CONFIGURED"), { statusCode: 0 }));
  return webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as never, JSON.stringify(payload).slice(0, 3500), { vapidDetails: { subject: k.subject, publicKey: k.pub, privateKey: k.priv }, TTL: 6 * 3600, urgency: "normal" } as never);
}

export function pushEngine(deps: PushEngineDeps) {
  const db = deps.admin.db, now = deps.now ?? Date.now, web = deps.sendWeb ?? sendWebPush;
  const channels = () => ({ web: Boolean(vapid()), android: Boolean(fcmAccount()) });
  const running = new Set<string>();

  async function loadAudience(c: { id?: string; topic: string; segment: string; platform: string }) {
    const [dev, pr, sent] = await Promise.all([
      db.query("select user_id, endpoint, platform from finance.push_subscriptions"),
      db.query("select user_id, marketing, topics from finance.push_prefs"),
      db.query(`select d.user_id, count(*) filter (where d.sent_at > now() - interval '24 hours')::int as n_day, count(*)::int as n_week from finance.push_deliveries d where d.status = 'sent' and d.sent_at > now() - interval '7 days' and ($1::uuid is null or d.campaign_id <> $1::uuid) group by 1`, [c.id ?? null]),
    ]);
    const members = c.segment === "devices" ? null : await deps.members(c.segment as SegmentKey);
    const picked = pickDevices(dev.rows.map((r: any) => ({ userId: r.user_id, endpoint: r.endpoint, platform: r.platform === "android" ? "android" : "web" })), {
      prefs: new Map(pr.rows.map((r: any) => [r.user_id, { marketing: r.marketing, topics: r.topics }])), topic: (isTopic(c.topic) ? c.topic : "fitur") as Topic,
      platform: (PLATFORMS as readonly string[]).includes(c.platform) ? (c.platform as PlatformFilter) : "all", members, sent: new Map(sent.rows.map((r: any) => [r.user_id, { day: r.n_day, week: r.n_week }])), channels: channels(),
    });
    return picked;
  }

  async function overview() {
    const [dev, users, prefs, c] = await Promise.all([
      db.query("select platform, count(*)::int n from finance.push_subscriptions group by 1"),
      db.query("select count(distinct user_id)::int n from finance.push_subscriptions"),
      db.query("select count(*) filter (where not marketing)::int off, count(*) filter (where marketing)::int on_, coalesce(sum(case when 'fitur' = any(topics) and marketing then 1 else 0 end),0)::int fitur, coalesce(sum(case when 'promo' = any(topics) and marketing then 1 else 0 end),0)::int promo, coalesce(sum(case when 'tips' = any(topics) and marketing then 1 else 0 end),0)::int tips from finance.push_prefs"),
      db.query("select count(*)::int n from finance.push_campaigns"),
    ]);
    const by: Record<string, number> = {}; for (const r of dev.rows) by[r.platform] = r.n;
    return { channels: channels(), devices: { web: by.web ?? 0, android: by.android ?? 0, total: (by.web ?? 0) + (by.android ?? 0), users: users.rows[0].n }, prefs: prefs.rows[0], campaigns: c.rows[0].n, topics: TOPICS, segments: Object.entries(SEGMENTS).map(([key, label]) => ({ key, label })), caps: { perDay: CAP_PER_DAY, perWeek: CAP_PER_WEEK, quiet: `${String(QUIET_FROM).padStart(2, "0")}.00–${String(QUIET_TO).padStart(2, "0")}.00 WIB` } };
  }

  function content(b: Json) {
    const name = text(b.name).slice(0, 120), title = text(b.title).slice(0, 65), body = text(b.body).slice(0, 178);
    if (!name) throw new UserError("Nama kampanye wajib diisi");
    if (!title) throw new UserError("Judul wajib diisi");
    if (!body) throw new UserError("Isi pesan wajib diisi");
    const topic = isTopic(b.topic) ? b.topic : "fitur", segment = b.segment === "devices" || (typeof b.segment === "string" && b.segment in SEGMENTS) ? String(b.segment) : null;
    if (!segment) throw new UserError("Audiens tidak dikenal");
    const platform = (PLATFORMS as readonly string[]).includes(b.platform) ? b.platform : "all";
    return { name, title, body, topic, segment, platform, route: safeRoute(b.route), image: safeImage(b.imageUrl), quiet: b.respectQuiet !== false };
  }

  async function preview(b: Json) {
    const c = content({ name: "x", title: "x", body: "x", ...b }), a = await loadAudience({ id: text(b.campaignId) || undefined, topic: c.topic, segment: c.segment, platform: c.platform });
    return { devices: a.devices.length, users: a.users, byPlatform: { web: a.devices.filter((x) => x.platform === "web").length, android: a.devices.filter((x) => x.platform === "android").length }, skipped: a.skipped, channels: channels() };
  }

  async function create(b: Json, by: string) {
    const c = content(b); let at: string | null = null;
    if (b.scheduledAt) { const dt = new Date(String(b.scheduledAt)); if (Number.isNaN(dt.getTime()) || dt.getTime() < now() + 60_000) throw new UserError("Jadwal harus minimal 1 menit dari sekarang"); at = dt.toISOString(); }
    const r = await db.query("insert into finance.push_campaigns (name, title, body, route, image_url, topic, segment, platform, respect_quiet, status, scheduled_at, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *", [c.name, c.title, c.body, c.route, c.image, c.topic, c.segment, c.platform, c.quiet, at ? "scheduled" : "draft", at, by]);
    return { campaign: r.rows[0] };
  }

  async function list() {
    const rows = (await db.query("select * from finance.push_campaigns order by created_at desc limit 100")).rows;
    const st = await db.query("select campaign_id, status, count(*)::int n, count(opened_at)::int o from finance.push_deliveries where campaign_id = any($1::uuid[]) group by 1,2", [rows.map((x: any) => x.id)]);
    const m = new Map<string, { stats: Record<string, number>; opened: number }>();
    for (const x of st.rows) { const e = m.get(x.campaign_id) ?? { stats: {}, opened: 0 }; e.stats[x.status] = x.n; e.opened += x.o; m.set(x.campaign_id, e); }
    return { campaigns: rows.map((x: any) => ({ ...x, stats: m.get(x.id)?.stats ?? {}, opened: m.get(x.id)?.opened ?? 0 })) };
  }

  async function get(id: string) {
    const c = (await db.query("select * from finance.push_campaigns where id = $1::uuid", [id])).rows[0];
    if (!c) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND");
    const [st, pl, recent] = await Promise.all([
      db.query("select status, count(*)::int n, count(opened_at)::int o from finance.push_deliveries where campaign_id = $1::uuid group by 1", [id]),
      db.query("select platform, count(*) filter (where status='sent')::int sent, count(opened_at)::int opened from finance.push_deliveries where campaign_id = $1::uuid group by 1", [id]),
      db.query("select status, error, count(*)::int n from finance.push_deliveries where campaign_id = $1::uuid and error is not null group by 1,2 order by 3 desc limit 8", [id]),
    ]);
    const stats: Record<string, number> = {}; let opened = 0; for (const r of st.rows) { stats[r.status] = r.n; opened += r.o; }
    return { campaign: c, stats, opened, platforms: pl.rows, errors: recent.rows, running: running.has(id), quietNow: inQuietHours(now()) };
  }

  async function remove(id: string) {
    const r = (await db.query("select status from finance.push_campaigns where id = $1::uuid", [id])).rows[0];
    if (!r) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND");
    if (!["draft", "scheduled", "canceled"].includes(r.status)) throw new UserError("Hanya draf, terjadwal, atau dibatalkan yang bisa dihapus");
    await db.query("delete from finance.push_campaigns where id = $1::uuid", [id]); return { deleted: true };
  }

  async function materialize(c: any) {
    const a = await loadAudience(c);
    if (!a.devices.length) throw new UserError("Tidak ada perangkat yang memenuhi syarat. Periksa audiens, platform, dan topik.");
    const names = new Map<string, string>();
    if (deps.admin.authDb) for (const r of (await deps.admin.authDb.query("select source_id id, name, nickname from pos.customers where source_id = any($1::text[])", [[...new Set(a.devices.map((x) => x.userId))]]).catch(() => ({ rows: [] as any[] }))).rows) names.set(String(r.id), firstName(r));
    for (let i = 0; i < a.devices.length; i += 500) {
      const part = a.devices.slice(i, i + 500);
      await db.query("insert into finance.push_deliveries (campaign_id, user_id, endpoint, platform, vars) select $1::uuid, x.user_id, x.endpoint, x.platform, x.vars from jsonb_to_recordset($2::jsonb) as x(user_id text, endpoint text, platform text, vars jsonb) on conflict do nothing", [c.id, JSON.stringify(part.map((d) => ({ user_id: d.userId, endpoint: d.endpoint, platform: d.platform, vars: { nama: names.get(d.userId) ?? "Sahabat Djiwa" } })))]);
    }
    return a.devices.length;
  }

  async function start(id: string) {
    const c = (await db.query("select * from finance.push_campaigns where id = $1::uuid", [id])).rows[0];
    if (!c) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND");
    if (!["draft", "scheduled", "paused"].includes(c.status)) throw new UserError(`Kampanye berstatus ${c.status} dan tidak bisa dimulai`);
    const total = c.status === "paused" ? c.total : await materialize(c);
    await db.query("update finance.push_campaigns set status='sending', total=$2, started_at=coalesce(started_at, now()), scheduled_at=null, last_error=null where id=$1::uuid", [id, total]);
    void drive(id);
    return get(id);
  }

  const payload = (c: any, did: string, vars: Record<string, string>) => ({ id: `pm-${c.id}`.slice(0, 32), kind: "marketing", tone: "info", label: "Djiwa Pay", title: renderPush(c.title, vars), message: renderPush(c.body, vars), route: c.route, image: c.image_url ?? undefined, did, at: new Date(now()).toISOString() });

  /** One device. Returns the delivery outcome; dead subscriptions are removed. */
  async function deliver(c: any, row: { id: string; user_id: string; endpoint: string; platform: string; vars: Record<string, string> }): Promise<{ ok: true } | { ok: false; error: string; retry: boolean }> {
    const sub = (await db.query("select endpoint, p256dh, auth from finance.push_subscriptions where user_id = $1 and endpoint = $2", [row.user_id, row.endpoint])).rows[0];
    if (!sub) return { ok: false, error: "perangkat sudah tidak terdaftar", retry: false };
    const p = payload(c, row.id, row.vars);
    if (row.platform === "android") {
      const r = await sendFcm(row.endpoint.replace(/^fcm:/, ""), { title: p.title, body: p.message, image: p.image, channel: "promo", data: { did: row.id, route: p.route, kind: "marketing", campaign: c.id } });
      if (r.ok) return r;
      if (r.dead) await db.query("delete from finance.push_subscriptions where user_id = $1 and endpoint = $2", [row.user_id, row.endpoint]);
      return { ok: false, error: r.error, retry: !r.dead && r.error !== "FCM_NOT_CONFIGURED" };
    }
    try { await web({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, p); return { ok: true }; }
    catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) { await db.query("delete from finance.push_subscriptions where user_id = $1 and endpoint = $2", [row.user_id, row.endpoint]); return { ok: false, error: "perangkat tidak aktif lagi", retry: false }; }
      return { ok: false, error: String(e?.statusCode ? `HTTP_${e.statusCode}` : e?.message ?? "NETWORK").slice(0, 80), retry: true };
    }
  }

  async function drive(id: string) {
    if (running.has(id)) return; running.add(id);
    try { await process_(id); } catch (e) { console.error("push campaign failed", id, e instanceof Error ? e.message : e); await db.query("update finance.push_campaigns set status='paused', last_error=$2 where id=$1::uuid and status='sending'", [id, (e instanceof Error ? e.message : String(e)).slice(0, 300)]).catch(() => {}); }
    finally { running.delete(id); }
  }

  async function process_(id: string) {
    const deadline = Date.now() + TIME_BUDGET_MS;
    for (;;) {
      const c = (await db.query("select * from finance.push_campaigns where id = $1::uuid", [id])).rows[0]; if (!c || c.status !== "sending") return;
      if (c.respect_quiet && inQuietHours(now())) return;   // wait for morning; the worker picks it up again
      const batch = (await db.query("select id, user_id, endpoint, platform, vars, attempts from finance.push_deliveries where campaign_id = $1::uuid and status = 'queued' order by created_at, id limit $2", [id, CHUNK])).rows;
      if (!batch.length) { await db.query("update finance.push_campaigns set status='done', finished_at=now() where id=$1::uuid and status='sending'", [id]); return; }
      await Promise.all(batch.map(async (row: any) => {
        const r = await deliver(c, row);
        if (r.ok) await db.query("update finance.push_deliveries set status='sent', sent_at=now(), attempts=attempts+1, error=null where id=$1::uuid", [row.id]);
        else { const n = row.attempts + 1; await db.query("update finance.push_deliveries set attempts=$2, error=$3, status=$4 where id=$1::uuid", [row.id, n, r.error, r.retry && n < 3 ? "queued" : r.error === "FCM_NOT_CONFIGURED" ? "skipped" : "failed"]); }
      }));
      if (Date.now() > deadline) return;
    }
  }

  async function setStatus(id: string, to: "paused" | "canceled") {
    const allowed = to === "paused" ? ["sending"] : ["draft", "scheduled", "sending", "paused"];
    const r = await db.query(`update finance.push_campaigns set status=$2 ${to === "canceled" ? ", finished_at=now()" : ""} where id=$1::uuid and status = any($3::text[]) returning id`, [id, to, allowed]);
    if (!r.rows.length) throw new UserError("Status kampanye tidak bisa diubah");
    if (to === "canceled") await db.query("update finance.push_deliveries set status='skipped', error='kampanye dibatalkan' where campaign_id=$1::uuid and status='queued'", [id]);
    return get(id);
  }

  /** A test goes to the admin's own devices only, ignoring topics and caps. */
  async function test(b: Json, adminEmail: string) {
    const c = content({ name: "uji", ...b });
    const ids = deps.admin.authDb ? (await deps.admin.authDb.query("select source_id id from pos.customers where lower(email) = $1", [adminEmail.toLowerCase()])).rows.map((r: any) => String(r.id)) : [];
    if (!ids.length) throw new UserError("Akun Djiwa Pay untuk email admin ini tidak ditemukan");
    const subs = (await db.query("select user_id, endpoint, platform, p256dh, auth from finance.push_subscriptions where user_id = any($1::text[])", [ids])).rows;
    if (!subs.length) throw new UserError("Belum ada perangkatmu yang mengizinkan notifikasi. Buka Djiwa Pay di ponselmu dan aktifkan notifikasi dulu.", "NO_DEVICE");
    const fake = { id: "test", title: `[UJI] ${c.title}`, body: c.body, route: c.route, image_url: c.image };
    let sent = 0; const errors: string[] = [];
    for (const s of subs) {
      const row = { id: "00000000-0000-0000-0000-000000000000", user_id: s.user_id, endpoint: s.endpoint, platform: s.platform, vars: { nama: "Tes" } };
      const r = s.platform === "android" ? await sendFcm(s.endpoint.replace(/^fcm:/, ""), { title: fake.title, body: renderPush(fake.body, row.vars), image: fake.image_url, channel: "promo", data: { route: fake.route, kind: "marketing", did: "" } }).then((x) => (x.ok ? { ok: true as const } : { ok: false as const, error: x.error })) : await web({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload(fake, "", row.vars)).then(() => ({ ok: true as const })).catch((e: any) => ({ ok: false as const, error: e?.message ?? "NETWORK" }));
      if (r.ok) sent++; else errors.push(`${s.platform}: ${r.error}`);
    }
    if (!sent) throw new UserError(`Notifikasi uji tidak terkirim (${errors.join(", ")})`, "SEND_FAILED");
    return { sent, devices: subs.length, errors };
  }

  /** Called every minute: start what is due, keep sending what is mid-way. */
  async function tick() {
    for (const c of (await db.query("select id, respect_quiet from finance.push_campaigns where status = 'scheduled' and scheduled_at <= now() limit 3")).rows) {
      if (c.respect_quiet && inQuietHours(now())) continue;
      await start(c.id).catch((e) => db.query("update finance.push_campaigns set status='paused', last_error=$2 where id=$1::uuid", [c.id, (e instanceof Error ? e.message : String(e)).slice(0, 300)]));
    }
    for (const c of (await db.query("select id from finance.push_campaigns where status = 'sending' limit 3")).rows) void drive(c.id);
  }

  return { overview, preview, create, list, get, remove, start, pause: (id: string) => setStatus(id, "paused"), cancel: (id: string) => setStatus(id, "canceled"), test, tick, drive };
}

export function registerPushMarketingRoutes(app: Hono, d: PushEngineDeps, json: (c: any, body: unknown, status?: number) => Response) {
  const eng = pushEngine(d), by = (c: any) => String(c.get("adminEmail") ?? "admin");
  const wrap = (fn: (c: any, body: Json) => Promise<unknown>) => async (c: any) => {
    try { const body = c.req.method === "GET" || c.req.method === "DELETE" ? {} : await c.req.json().catch(() => ({})); return json(c, { success: true, ...(await fn(c, body) as object) }); }
    catch (e) { if (e instanceof UserError) return json(c, { success: false, error: e.message, code: e.code }, e.code === "NOT_FOUND" ? 404 : 400); console.error("push admin failed", e instanceof Error ? e.message : e); return json(c, { success: false, error: "QUERY_FAILED" }, 500); }
  };
  const P = "/api/finance/admin/push", UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const idOf = (c: any) => { const id = String(c.req.param("id")); if (!UUID.test(id)) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND"); return id; };
  app.get(`${P}/overview`, wrap(() => eng.overview()));
  app.post(`${P}/preview`, wrap((_, b) => eng.preview(b)));
  app.get(`${P}/campaigns`, wrap(() => eng.list()));
  app.post(`${P}/campaigns`, wrap((c, b) => eng.create(b, by(c))));
  app.get(`${P}/campaigns/:id`, wrap((c) => eng.get(idOf(c))));
  app.delete(`${P}/campaigns/:id`, wrap((c) => eng.remove(idOf(c))));
  app.post(`${P}/campaigns/:id/start`, wrap((c) => eng.start(idOf(c))));
  app.post(`${P}/campaigns/:id/pause`, wrap((c) => eng.pause(idOf(c))));
  app.post(`${P}/campaigns/:id/cancel`, wrap((c) => eng.cancel(idOf(c))));
  app.post(`${P}/test`, wrap((c, b) => eng.test(b, by(c))));
  if (d.admin.authDb && process.env.EMAIL_WORKER !== "off") setInterval(() => { eng.tick().catch((e) => console.error("push worker", e instanceof Error ? e.message : e)); }, 60_000).unref?.();
  return eng;
}
