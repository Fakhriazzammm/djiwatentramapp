import type { Hono } from "hono";
import type { Tx } from "./sync.js";
import { userDeep, usersCsv, usersGrowth, usersList } from "./admin-users.js";

/** Read-only access to the shared customer/wallet database (the auth server's). */
export type AuthDb = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };
export type AdminDeps = { db: Tx; authDb: AuthDb | null; emailOf: (cookie: string) => Promise<string | null> };

const TZ = "Asia/Jakarta";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown) => Number(v ?? 0);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const mapNum = (rows: any[], keys: string[]) => rows.map((x) => { const o = { ...x }; for (const k of keys) o[k] = num(o[k]); return o; });

/** Two valid dates, ordered, at most ~5 years apart; falls back to the last 7 days. */
export function parseRange(from?: string, to?: string, now = new Date()): { from: string; to: string; days: number } {
  const wib = new Date(now.getTime() + 7 * 3600_000);
  let b = from && DAY.test(from) ? from : dayOf(new Date(wib.getTime() - 6 * 864e5)), e = to && DAY.test(to) ? to : dayOf(wib);
  if (b > e) [b, e] = [e, b];
  let days = Math.round((Date.parse(e) - Date.parse(b)) / 864e5) + 1;
  if (days > 1830) { b = dayOf(new Date(Date.parse(e) - 1829 * 864e5)); days = 1830; }
  return { from: b, to: e, days };
}
const prevRange = (r: { from: string; to: string; days: number }) => ({ from: dayOf(new Date(Date.parse(r.from) - r.days * 864e5)), to: dayOf(new Date(Date.parse(r.from) - 864e5)) });

export function deviceOf(ua: string): { device: string; browser: string } {
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|android|iphone/i.test(ua) ? "mobile" : "desktop";
  const browser = /edg\//i.test(ua) ? "Edge" : /opr\/|opera/i.test(ua) ? "Opera" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Lainnya";
  return { device, browser };
}

const inDay = (col: string, a = "$1", b = "$2") => `(${col} at time zone '${TZ}')::date between ${a}::date and ${b}::date`;
const series = (from: string, to: string) => `(select generate_series('${from}'::date, '${to}'::date, interval '1 day')::date as day)`;

async function financeKpis(db: Tx, r: { from: string; to: string }) {
  const p = [r.from, r.to];
  const [pv, en, rc, sc, inb] = await Promise.all([
    db.query(`select count(*)::int views, count(distinct visitor)::int visitors, count(distinct user_id)::int users, count(*) filter (where standalone)::int pwa from finance.page_views where ${inDay('"at"')}`, p),
    db.query(`select count(*)::int n, coalesce(sum(amount) filter (where kind='out'),0) out, coalesce(sum(amount) filter (where kind='in'),0) inc, coalesce(sum(amount) filter (where kind='tf'),0) tf, count(distinct user_id)::int users from finance.entries where ${inDay("created_at")}`, p),
    db.query(`select count(*)::int n from finance.receipts where ${inDay("created_at")}`, p),
    db.query(`select coalesce(sum(scans),0)::int n from finance.scan_usage where day between $1::date and $2::date`, p),
    db.query(`select count(*) filter (where status in ('auto','approved'))::int ok, count(*) filter (where status='review')::int review, count(*)::int n from finance.inbound_messages where ${inDay("created_at")}`, p),
  ]);
  return { views: num(pv.rows[0].views), visitors: num(pv.rows[0].visitors), activeUsers: num(pv.rows[0].users), pwaViews: num(pv.rows[0].pwa),
    entries: num(en.rows[0].n), spent: num(en.rows[0].out), income: num(en.rows[0].inc), transfers: num(en.rows[0].tf), entryUsers: num(en.rows[0].users),
    receipts: num(rc.rows[0].n), scans: num(sc.rows[0].n), mails: num(inb.rows[0].n), mailsOk: num(inb.rows[0].ok), mailsReview: num(inb.rows[0].review) };
}
async function authKpis(a: AuthDb | null, r: { from: string; to: string }) {
  if (!a) return { newUsers: 0, topups: 0, topupCount: 0, spend: 0, txCount: 0, rewards: 0 };
  const p = [r.from, r.to];
  const [u, t, l] = await Promise.all([
    a.query(`select count(*)::int n from pos.customers where ${inDay("created_at")}`, p),
    a.query(`select coalesce(sum(amount),0) s, count(*)::int n from pos.customer_wallet_topups where status='paid' and ${inDay("coalesce(paid_at, created_at)")}`, p),
    a.query(`select coalesce(sum(amount) filter (where direction='debit' and transaction_type='order_debit'),0) spend, count(*) filter (where status='completed')::int n, coalesce(sum(amount) filter (where transaction_type='transaction_reward'),0) rewards from pos.customer_wallet_ledger where ${inDay("created_at")}`, p),
  ]);
  return { newUsers: num(u.rows[0].n), topups: num(t.rows[0].s), topupCount: num(t.rows[0].n), spend: num(l.rows[0].spend), txCount: num(l.rows[0].n), rewards: num(l.rows[0].rewards) };
}

async function allTotals(d: AdminDeps) {
  const f = await Promise.all([
    d.db.query("select count(*)::int n from finance.profiles"), d.db.query("select count(*)::int n from finance.entries"), d.db.query("select count(*)::int n from finance.google_connections where refresh_enc is not null"),
    d.db.query("select count(*)::int n, count(distinct user_id)::int u from finance.push_subscriptions"), d.db.query("select count(*)::int n from finance.assets"), d.db.query("select count(*)::int n from finance.receipts"),
    d.db.query("select count(*)::int n from finance.inbound_sources"), d.db.query("select count(distinct visitor)::int n from finance.page_views"),
  ]);
  let users = 0, active = 0, balance = 0, held = 0, credited = 0, wallets = 0, pins = 0;
  if (d.authDb) {
    const [u, w, p] = await Promise.all([
      d.authDb.query("select count(*)::int n, count(*) filter (where is_active)::int a from pos.customers"),
      d.authDb.query("select count(*)::int n, coalesce(sum(available_balance),0) b, coalesce(sum(held_balance),0) h, coalesce(sum(total_credited),0) c from pos.customer_wallets"),
      d.authDb.query("select count(*)::int n from pos.customer_pins"),
    ]);
    users = num(u.rows[0].n); active = num(u.rows[0].a); wallets = num(w.rows[0].n); balance = num(w.rows[0].b); held = num(w.rows[0].h); credited = num(w.rows[0].c); pins = num(p.rows[0].n);
  }
  return { users, activeCustomers: active, financeUsers: f[0].rows[0].n, entries: f[1].rows[0].n, google: f[2].rows[0].n, pushSubs: f[3].rows[0].n, pushUsers: f[3].rows[0].u, assets: f[4].rows[0].n, receipts: f[5].rows[0].n, mailSources: f[6].rows[0].n, allVisitors: f[7].rows[0].n, wallets, balance, held, credited, pins };
}

export async function overview(d: AdminDeps, from?: string, to?: string) {
  const r = parseRange(from, to), p = prevRange(r), params = [r.from, r.to];
  const [cur, prev, curA, prevA, totals, fdaily, adaily] = await Promise.all([
    financeKpis(d.db, r), financeKpis(d.db, p), authKpis(d.authDb, r), authKpis(d.authDb, p), allTotals(d),
    d.db.query(`select s.day::text as day, coalesce(v.views,0)::int views, coalesce(v.visitors,0)::int visitors, coalesce(e.n,0)::int entries, coalesce(e.out,0) spent, coalesce(e.inc,0) income, coalesce(sc.n,0)::int scans
      from ${series(r.from, r.to)} s
      left join (select ("at" at time zone '${TZ}')::date as day, count(*) views, count(distinct visitor) visitors from finance.page_views where ${inDay('"at"')} group by 1) v on v.day = s.day
      left join (select (created_at at time zone '${TZ}')::date as day, count(*) n, sum(amount) filter (where kind='out') out, sum(amount) filter (where kind='in') inc from finance.entries where ${inDay("created_at")} group by 1) e on e.day = s.day
      left join (select day, sum(scans) n from finance.scan_usage where day between $1::date and $2::date group by 1) sc on sc.day = s.day order by 1`, params),
    d.authDb ? d.authDb.query(`select s.day::text as day, coalesce(u.n,0)::int users, coalesce(t.s,0) topup, coalesce(g.spend,0) spend
      from ${series(r.from, r.to)} s
      left join (select (created_at at time zone '${TZ}')::date as day, count(*) n from pos.customers where ${inDay("created_at")} group by 1) u on u.day = s.day
      left join (select (coalesce(paid_at,created_at) at time zone '${TZ}')::date as day, sum(amount) s from pos.customer_wallet_topups where status='paid' and ${inDay("coalesce(paid_at,created_at)")} group by 1) t on t.day = s.day
      left join (select (created_at at time zone '${TZ}')::date as day, sum(amount) spend from pos.customer_wallet_ledger where transaction_type='order_debit' and ${inDay("created_at")} group by 1) g on g.day = s.day order by 1`, params) : Promise.resolve({ rows: [] as any[] }),
  ]);
  const amap = new Map<string, any>(adaily.rows.map((x: any) => [iso(x.day), x]));
  const daily = fdaily.rows.map((x: any) => { const a = amap.get(iso(x.day)) ?? {}; return { day: iso(x.day), views: x.views, visitors: x.visitors, entries: x.entries, spent: num(x.spent), income: num(x.income), scans: x.scans, newUsers: num(a.users), topup: num(a.topup), spend: num(a.spend) }; });
  return { range: r, previous: p, current: { ...cur, ...curA }, before: { ...prev, ...prevA }, totals, daily };
}

export async function traffic(d: AdminDeps, from?: string, to?: string) {
  const r = parseRange(from, to), q = (sql: string) => d.db.query(sql, [r.from, r.to]).then((x) => x.rows);
  const [pages, refs, devices, browsers, hours, dows, daily, recent, live, fresh] = await Promise.all([
    q(`select path, count(*)::int views, count(distinct visitor)::int visitors from finance.page_views where ${inDay('"at"')} group by 1 order by 2 desc limit 20`),
    q(`select coalesce(nullif(referrer,''),'Langsung') ref, count(*)::int n from finance.page_views where ${inDay('"at"')} group by 1 order by 2 desc limit 12`),
    q(`select device, count(*)::int n, count(distinct visitor)::int visitors from finance.page_views where ${inDay('"at"')} group by 1 order by 2 desc`),
    q(`select browser, count(*)::int n from finance.page_views where ${inDay('"at"')} group by 1 order by 2 desc`),
    q(`select extract(hour from "at" at time zone '${TZ}')::int h, count(*)::int n from finance.page_views where ${inDay('"at"')} group by 1 order by 1`),
    q(`select extract(isodow from "at" at time zone '${TZ}')::int d, count(*)::int n from finance.page_views where ${inDay('"at"')} group by 1 order by 1`),
    q(`select s.day::text as day, coalesce(v.views,0)::int views, coalesce(v.visitors,0)::int visitors, coalesce(v.pwa,0)::int pwa from ${series(r.from, r.to)} s left join (select ("at" at time zone '${TZ}')::date as day, count(*) views, count(distinct visitor) visitors, count(*) filter (where standalone) pwa from finance.page_views where ${inDay('"at"')} group by 1) v on v.day = s.day order by 1`),
    d.db.query(`select at, path, device, browser, standalone, user_id, left(visitor,6) v from finance.page_views order by at desc limit 30`).then((x) => x.rows),
    d.db.query(`select count(distinct visitor)::int n from finance.page_views where at > now() - interval '5 minutes'`).then((x) => x.rows[0].n),
    q(`select count(*) filter (where first_seen >= $1::date)::int fresh, count(*) filter (where first_seen < $1::date)::int back from (select v.visitor, (select min((z."at" at time zone '${TZ}')::date) from finance.page_views z where z.visitor = v.visitor) first_seen from finance.page_views v where ${inDay("v.at")} group by v.visitor) t`),
  ]);
  return { range: r, pages, referrers: refs, devices, browsers, hours, weekdays: dows, daily: daily.map((x: any) => ({ ...x, day: iso(x.day) })), recent, live: num(live), visitors: { fresh: num(fresh[0]?.fresh), returning: num(fresh[0]?.back) } };
}

export async function financeStats(d: AdminDeps, from?: string, to?: string) {
  const r = parseRange(from, to), q = (sql: string) => d.db.query(sql, [r.from, r.to]).then((x) => x.rows);
  const [byCat, bySource, kinds, topUsers, receipts, mail, mailChannels, assets, goals, sizes] = await Promise.all([
    q(`select category_id id, count(*)::int n, sum(amount) s from finance.entries where kind='out' and ${inDay("created_at")} group by 1 order by 3 desc limit 12`),
    q(`select source, count(*)::int n, sum(amount) s from finance.entries where ${inDay("created_at")} group by 1 order by 2 desc`),
    q(`select kind, count(*)::int n, sum(amount) s from finance.entries where ${inDay("created_at")} group by 1`),
    q(`select user_id, count(*)::int n, sum(amount) filter (where kind='out') spent, sum(amount) filter (where kind='in') income from finance.entries where ${inDay("created_at")} group by 1 order by 2 desc limit 10`),
    q(`select status, count(*)::int n, coalesce(round(avg(confidence)::numeric,2),0) conf from finance.receipts where ${inDay("created_at")} group by 1`),
    q(`select status, count(*)::int n from finance.inbound_messages where ${inDay("created_at")} group by 1 order by 2 desc`),
    q(`select channel, count(*)::int n, count(*) filter (where status in ('auto','approved'))::int ok from finance.inbound_messages where ${inDay("created_at")} group by 1 order by 2 desc limit 12`),
    d.db.query("select kind, count(*)::int n, coalesce(sum(value),0) v from finance.assets group by 1 order by 2 desc").then((x) => x.rows),
    d.db.query("select count(*)::int n, count(distinct user_id)::int u from finance.goals").then((x) => x.rows[0]),
    d.db.query("select (select count(*)::int from finance.budgets) budgets, (select count(*)::int from finance.bills) bills, (select count(*)::int from finance.debts) debts, (select count(*)::int from finance.accounts) accounts").then((x) => x.rows[0]),
  ]);
  const names = d.authDb && topUsers.length ? new Map<string, any>((await d.authDb.query("select source_id, name, email from pos.customers where source_id = any($1)", [topUsers.map((x: any) => x.user_id)])).rows.map((x: any) => [x.source_id, x])) : new Map<string, any>();
  return { range: r, byCategory: mapNum(byCat, ["s"]), bySource: mapNum(bySource, ["s"]), kinds: mapNum(kinds, ["s"]), topUsers: topUsers.map((x: any) => ({ id: x.user_id, name: names.get(x.user_id)?.name ?? "—", email: names.get(x.user_id)?.email ?? "", n: x.n, spent: num(x.spent), income: num(x.income) })), receipts, mail, mailChannels, assets: mapNum(assets, ["v"]), goals, sizes };
}

export async function walletStats(d: AdminDeps, from?: string, to?: string) {
  const r = parseRange(from, to);
  if (!d.authDb) return { range: r, empty: true };
  const q = (sql: string, p: unknown[] = [r.from, r.to]) => d.authDb!.query(sql, p).then((x) => x.rows);
  const [daily, types, topups, topBalances, recent, pending, sources] = await Promise.all([
    q(`select s.day::text as day, coalesce(c.credit,0) credit, coalesce(c.debit,0) debit, coalesce(c.n,0)::int n from ${series(r.from, r.to)} s left join (select (created_at at time zone '${TZ}')::date as day, sum(amount) filter (where direction='credit' and status='completed') credit, sum(amount) filter (where direction='debit' and status='completed') debit, count(*) n from pos.customer_wallet_ledger where ${inDay("created_at")} group by 1) c on c.day = s.day order by 1`),
    q(`select transaction_type t, direction, count(*)::int n, sum(amount) s from pos.customer_wallet_ledger where status='completed' and ${inDay("created_at")} group by 1,2 order by 4 desc`),
    q(`select status, count(*)::int n, coalesce(sum(amount),0) s from pos.customer_wallet_topups where ${inDay("created_at")} group by 1`),
    q(`select c.source_id id, c.name, c.email, w.available_balance b from pos.customer_wallets w join pos.customers c on c.source_id = w.customer_id order by w.available_balance desc limit 10`, []),
    q(`select g.id, g.amount, g.direction, g.transaction_type t, g.status, g.created_at, g.note, c.name, c.email from pos.customer_wallet_ledger g left join pos.customers c on c.source_id = g.customer_id order by g.created_at desc limit 25`, []),
    q(`select count(*)::int n, coalesce(sum(amount),0) s from pos.customer_wallet_topups where status='pending'`, []),
    q(`select coalesce(source_app,'djiwatentram') app, count(*)::int n, coalesce(sum(amount),0) s from pos.customer_wallet_ledger where status='completed' and ${inDay("created_at")} group by 1 order by 3 desc`),
  ]);
  return { range: r, daily: mapNum(daily, ["credit", "debit"]).map((x) => ({ ...x, day: iso(x.day) })), types: mapNum(types, ["s"]), topups: mapNum(topups, ["s"]), topBalances: mapNum(topBalances, ["b"]), recent: mapNum(recent, ["amount"]), pending: mapNum(pending, ["s"])[0], sources: mapNum(sources, ["s"]) };
}

export async function system(d: AdminDeps) {
  const [tables, hook, views, oldest] = await Promise.all([
    d.db.query("select relname t, n_live_tup::int n from pg_stat_user_tables where schemaname='finance' order by 2 desc limit 20"),
    d.db.query("select count(*)::int n from finance.inbound_hooks"), d.db.query("select count(*)::int n from finance.page_views"), d.db.query("select min(at) at from finance.page_views"),
  ]);
  return { tables: tables.rows, hooks: hook.rows[0].n, pageViews: views.rows[0].n, trackingSince: oldest.rows[0].at, authDb: Boolean(d.authDb), node: process.version, uptime: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576), time: new Date().toISOString() };
}

/** Makes the people named in ADMIN_EMAILS admins. Runs at startup; never removes anyone. */
export async function seedAdmins(db: Tx, list = process.env.ADMIN_EMAILS || "") {
  for (const e of list.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@"))) await db.query("insert into finance.admins (email, added_by) values ($1,'env') on conflict do nothing", [e]);
}

export function registerAdminRoutes(app: Hono, d: AdminDeps, json: (c: any, body: unknown, status?: number) => Response) {
  const isAdmin = async (c: any) => { const email = (await d.emailOf(c.req.header("cookie") || ""))?.trim().toLowerCase(); if (!email) return null; const r = await d.db.query("select 1 from finance.admins where email = $1", [email]); return r.rows.length ? email : null; };
  app.use("/api/finance/admin/*", async (c, next) => { if (c.req.path.endsWith("/admin/me")) return next(); const email = await isAdmin(c); if (!email) return json(c, { success: false, error: "FORBIDDEN" }, 403); c.set("adminEmail" as never, email as never); return next(); });
  const guard = (fn: (c: any) => Promise<unknown>) => async (c: any) => { try { return json(c, { success: true, ...(await fn(c) as object) }); } catch (e) { console.error("admin query failed", e instanceof Error ? e.message : e); return json(c, { success: false, error: "QUERY_FAILED" }, 500); } };
  const range = (c: any) => [c.req.query("from"), c.req.query("to")] as const;
  app.get("/api/finance/admin/me", async (c) => { const email = await isAdmin(c); return json(c, { success: true, admin: Boolean(email), email }); });
  app.get("/api/finance/admin/overview", guard((c) => overview(d, ...range(c))));
  app.get("/api/finance/admin/traffic", guard((c) => traffic(d, ...range(c))));
  app.get("/api/finance/admin/finance", guard((c) => financeStats(d, ...range(c))));
  app.get("/api/finance/admin/wallet", guard((c) => walletStats(d, ...range(c))));
  app.get("/api/finance/admin/system", guard(() => system(d)));
  const listOpts = (c: any) => ({ q: c.req.query("q"), page: Number(c.req.query("page")) || 1, sort: c.req.query("sort"), filter: c.req.query("filter"), cohort: c.req.query("cohort") });
  app.get("/api/finance/admin/users", guard((c) => usersList(d, listOpts(c))));
  app.get("/api/finance/admin/users/growth", guard(() => usersGrowth(d)));
  app.get("/api/finance/admin/users/export", async (c) => { try { const body = await usersCsv(d, listOpts(c)); return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="pengguna-djiwa-pay.csv"', "Cache-Control": "no-store" } }); } catch (e) { console.error("admin export failed", e instanceof Error ? e.message : e); return json(c, { success: false, error: "QUERY_FAILED" }, 500); } });
  app.get("/api/finance/admin/users/:id", async (c) => { try { const u = await userDeep(d, c.req.param("id")); return u ? json(c, { success: true, ...u }) : json(c, { success: false, error: "NOT_FOUND" }, 404); } catch (e) { console.error("admin user failed", e instanceof Error ? e.message : e); return json(c, { success: false, error: "QUERY_FAILED" }, 500); } });
  app.get("/api/finance/admin/admins", guard(async () => ({ admins: (await d.db.query("select email, added_by, created_at from finance.admins order by created_at")).rows })));
  app.post("/api/finance/admin/admins", async (c) => {
    const body = await c.req.json().catch(() => null) as { email?: string } | null, email = String(body?.email || "").trim().toLowerCase();
    if (!/^[^@\s]{1,64}@[^@\s]{1,120}\.[^@\s]{2,}$/.test(email)) return json(c, { success: false, error: "BAD_EMAIL" }, 400);
    await d.db.query("insert into finance.admins (email, added_by) values ($1,$2) on conflict do nothing", [email, (c.get("adminEmail" as never) as string) ?? ""]);
    return json(c, { success: true });
  });
  app.delete("/api/finance/admin/admins", async (c) => {
    const email = String(c.req.query("email") || "").trim().toLowerCase(), me = c.get("adminEmail" as never) as string;
    if (email === me) return json(c, { success: false, error: "CANNOT_REMOVE_SELF" }, 409);
    const row = (await d.db.query("select added_by from finance.admins where email = $1", [email])).rows[0];
    if (row && (row.added_by === "env" || row.added_by === "seed")) return json(c, { success: false, error: "OWNER" }, 409);
    await d.db.query("delete from finance.admins where email = $1", [email]); return json(c, { success: true });
  });
}

/** Public beacon: records one page view. Anonymous visitors only carry a random id kept on their own device. */
export function registerTrackRoute(app: Hono, d: { db: Tx; userOf: (cookie: string) => Promise<string | null> }) {
  const seen = new Map<string, { n: number; until: number }>();
  app.post("/api/finance/track", async (c) => {
    const body = await c.req.json().catch(() => null) as { v?: unknown; p?: unknown; r?: unknown; s?: unknown } | null;
    const v = typeof body?.v === "string" && /^[a-z0-9-]{8,40}$/i.test(body.v) ? body.v : null, p = typeof body?.p === "string" ? body.p.split("?")[0].slice(0, 120) : "";
    if (!v || !p.startsWith("/") || p.startsWith("/admin")) return c.body(null, 204);
    const now = Date.now(), hit = seen.get(v), live = hit && hit.until > now;
    if (live && hit.n >= 60) return c.body(null, 204);
    seen.set(v, { n: (live ? hit.n : 0) + 1, until: live ? hit.until : now + 60_000 }); if (seen.size > 5000) seen.clear();
    const ref = typeof body?.r === "string" ? (() => { try { const h = new URL(body.r as string).hostname.replace(/^www\./, ""); return h === "djiwapay.web.id" ? "" : h.slice(0, 80); } catch { return ""; } })() : "";
    const { device, browser } = deviceOf(c.req.header("user-agent") || "");
    const user = await d.userOf(c.req.header("cookie") || "").catch(() => null);
    await d.db.query("insert into finance.page_views (visitor, user_id, path, referrer, device, browser, standalone) values ($1,$2,$3,$4,$5,$6,$7)", [v, user, p, ref, device, browser, body?.s === true]).catch(() => undefined);
    return c.body(null, 204);
  });
}
