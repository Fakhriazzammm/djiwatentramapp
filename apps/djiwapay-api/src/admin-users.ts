import type { AdminDeps } from "./admin.js";

/**
 * Who is new to Djiwa Pay and who came from the older Djiwa Tentram customer base.
 * The customer table is shared, so "new" cannot come from the signup date alone: Pay's launch is the earliest Pay signal
 * (a finance profile, a tracked page view, an entry, or a wallet ledger row written by the Pay app) and
 *   baru        = account created on or after that moment
 *   lama_pay    = older account that has shown up in Pay
 *   lama_belum  = older account with no sign of Pay yet
 */
export type Cohort = "baru" | "lama_pay" | "lama_belum";
const TZ = "Asia/Jakarta";
const num = (v: unknown) => Number(v ?? 0);
const mapNum = (rows: any[], keys: string[]) => rows.map((x) => { const o = { ...x }; for (const k of keys) o[k] = num(o[k]); return o; });
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
const earliest = (a: string | null | undefined, b: string | null | undefined) => (a && b ? (a < b ? a : b) : a || b || null);
const FAR = "9999-01-01T00:00:00Z";

export type Signals = { launch: string | null; first: Map<string, string>; entries: Map<string, number>; onboarded: Set<string>; google: Set<string>; push: Set<string>; pwa: Set<string>; lastSeen: Map<string, string>; views: Map<string, number> };
let cache: { at: number; value: Signals } | null = null;

/** Everything that says "this person has used Pay", gathered from both databases. Cached for a short while. */
export async function paySignals(d: AdminDeps, fresh = false): Promise<Signals> {
  if (!fresh && cache && Date.now() - cache.at < 45_000) return cache.value;
  const [prof, views, ent, gg, pu, pwa] = await Promise.all([
    d.db.query("select user_id, created_at, onboarded from finance.profiles"),
    d.db.query("select user_id, min(at) f, max(at) l, count(*)::int n from finance.page_views where user_id is not null group by 1"),
    d.db.query("select user_id, min(created_at) f, count(*)::int n from finance.entries group by 1"),
    d.db.query("select user_id from finance.google_connections where refresh_enc is not null"),
    d.db.query("select distinct user_id from finance.push_subscriptions"),
    d.db.query("select distinct user_id from finance.page_views where user_id is not null and standalone"),
  ]);
  const ledger = d.authDb ? await d.authDb.query("select customer_id, min(created_at) f from pos.customer_wallet_ledger where source_app = 'djiwapay' group by 1").catch(() => ({ rows: [] as any[] })) : { rows: [] as any[] };
  const first = new Map<string, string>(), add = (id: string, at: unknown) => { const t = iso(at); if (id && t) first.set(id, earliest(first.get(id), t)!); };
  for (const r of prof.rows) add(r.user_id, r.created_at);
  for (const r of views.rows) add(r.user_id, r.f);
  for (const r of ent.rows) add(r.user_id, r.f);
  for (const r of ledger.rows) add(r.customer_id, r.f);
  let launch: string | null = null; for (const t of first.values()) launch = earliest(launch, t);
  const value: Signals = {
    launch, first, entries: new Map(ent.rows.map((r: any) => [r.user_id, num(r.n)])), onboarded: new Set(prof.rows.filter((r: any) => r.onboarded).map((r: any) => r.user_id)),
    google: new Set(gg.rows.map((r: any) => r.user_id)), push: new Set(pu.rows.map((r: any) => r.user_id)), pwa: new Set(pwa.rows.map((r: any) => r.user_id)),
    lastSeen: new Map(views.rows.map((r: any) => [r.user_id, iso(r.l)!])), views: new Map(views.rows.map((r: any) => [r.user_id, num(r.n)])),
  };
  cache = { at: Date.now(), value };
  return value;
}

const cohortSql = (idsP: string, launchP: string) => `(case when c.created_at >= ${launchP}::timestamptz then 'baru' when c.source_id = any(${idsP}::text[]) then 'lama_pay' else 'lama_belum' end)`;

type ListOpts = { q?: string; page?: number; sort?: string; filter?: string; cohort?: string; all?: boolean };
const SORTS: Record<string, string> = { new: "c.created_at desc", old: "c.created_at asc", active: "c.last_active_at desc nulls last", spent: "c.total_spent desc nulls last", balance: "w.available_balance desc nulls last", name: "lower(c.name) asc" };

export async function usersList(d: AdminDeps, o: ListOpts) {
  if (!d.authDb) return { total: 0, page: 1, size: 25, rows: [], cohorts: { baru: 0, lama_pay: 0, lama_belum: 0, total: 0 }, launch: null };
  const sig = await paySignals(d), ids = [...sig.first.keys()], launch = sig.launch ?? FAR;
  const page = Math.max(1, Math.floor(o.page || 1)), size = o.all ? 5000 : 25, q = (o.q || "").trim().toLowerCase().slice(0, 80);
  const where: string[] = ["$1::text[] is not null", "$2::timestamptz is not null"], params: unknown[] = [ids, launch];
  if (q) { params.push(`%${q}%`); where.push(`(lower(c.name) like $${params.length} or lower(c.email) like $${params.length} or c.phone like $${params.length} or c.source_id like $${params.length})`); }
  const cohort = cohortSql("$1", "$2");
  if (o.cohort && ["baru", "lama_pay", "lama_belum"].includes(o.cohort)) { params.push(o.cohort); where.push(`${cohort} = $${params.length}`); }
  const byIds = (set: Iterable<string>) => { params.push([...set]); where.push(`c.source_id = any($${params.length}::text[])`); };
  switch (o.filter) {
    case "wallet": where.push("coalesce(w.available_balance,0) > 0"); break;
    case "pin": where.push("p.customer_id is not null"); break;
    case "inactive": where.push("c.is_active = false"); break;
    case "entries": byIds([...sig.entries.keys()]); break;
    case "onboarded": byIds(sig.onboarded); break;
    case "google": byIds(sig.google); break;
    case "push": byIds(sig.push); break;
    case "pwa": byIds(sig.pwa); break;
  }
  const bySig = o.sort === "entries" || o.sort === "seen" || o.sort === "payfirst";
  if (bySig) where.push("c.source_id = any($1::text[])");
  const from = "from pos.customers c left join pos.customer_wallets w on w.customer_id = c.source_id left join pos.customer_pins p on p.customer_id = c.source_id", cond = where.length ? ` where ${where.join(" and ")}` : "";
  const order = SORTS[o.sort || "new"] ?? "c.created_at desc", cols = `c.source_id id, c.name, c.email, c.phone, c.photo_url, c.is_active, c.created_at, c.last_active_at, c.total_orders, c.total_spent, w.available_balance balance, w.held_balance held, (p.customer_id is not null) has_pin, ${cohort} cohort`;
  const base = params.slice(0, 2);
  const [t, rows, counts] = await Promise.all([
    d.authDb.query(`select count(*)::int n ${from}${cond}`, params),
    d.authDb.query(`select ${cols} ${from}${cond} order by ${order}${bySig ? "" : ` limit ${size} offset ${(page - 1) * size}`}`, params),
    d.authDb.query(`select ${cohort} cohort, count(*)::int n from pos.customers c group by 1`, base),
  ]);
  let list = rows.rows.map((r: any) => ({ ...r, balance: num(r.balance), held: num(r.held), total_spent: num(r.total_spent), pay: { first: sig.first.get(r.id) ?? null, entries: sig.entries.get(r.id) ?? 0, views: sig.views.get(r.id) ?? 0, seen: sig.lastSeen.get(r.id) ?? null, google: sig.google.has(r.id), push: sig.push.has(r.id), pwa: sig.pwa.has(r.id), onboarded: sig.onboarded.has(r.id) } }));
  if (bySig) {
    const key = (r: any) => (o.sort === "entries" ? r.pay.entries : o.sort === "seen" ? +new Date(r.pay.seen ?? r.pay.first ?? 0) : +new Date(r.pay.first ?? 0));
    list = list.sort((a: any, b: any) => key(b) - key(a)).slice((page - 1) * size, page * size);
  }
  const c = Object.fromEntries(counts.rows.map((r: any) => [r.cohort, num(r.n)])) as Record<string, number>;
  return { total: num(t.rows[0].n), page, size, rows: list, launch: sig.launch, cohorts: { baru: c.baru ?? 0, lama_pay: c.lama_pay ?? 0, lama_belum: c.lama_belum ?? 0, total: (c.baru ?? 0) + (c.lama_pay ?? 0) + (c.lama_belum ?? 0) } };
}

const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export async function usersCsv(d: AdminDeps, o: ListOpts): Promise<string> {
  const r = await usersList(d, { ...o, all: true });
  const head = ["id", "nama", "email", "hp", "kelompok", "terdaftar", "pertama_di_pay", "catatan", "tampilan", "terakhir_dilihat", "google", "notifikasi", "pwa", "saldo", "belanja", "aktif"];
  const label: Record<string, string> = { baru: "Baru di Pay", lama_pay: "Existing → Pay", lama_belum: "Existing, belum buka Pay" };
  return [head.join(","), ...r.rows.map((x: any) => [x.id, x.name, x.email, x.phone, label[x.cohort], iso(x.created_at), x.pay.first, x.pay.entries, x.pay.views, x.pay.seen, x.pay.google ? "ya" : "", x.pay.push ? "ya" : "", x.pay.pwa ? "ya" : "", x.balance, x.total_spent, x.is_active ? "ya" : "tidak"].map(csvCell).join(","))].join("\n");
}

const series = (from: string, to: string) => `(select generate_series('${from}'::date, '${to}'::date, interval '1 day')::date as day)`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const FEATURES: [string, string, string][] = [["Catatan keuangan", "entries", "user_id"], ["Dompet pribadi", "accounts", "user_id"], ["Anggaran", "budgets", "user_id"], ["Target", "goals", "user_id"], ["Tagihan rutin", "bills", "user_id"], ["Utang piutang", "debts", "user_id"], ["Aset", "assets", "user_id"], ["Scan struk", "receipts", "user_id"], ["Catatan dari email", "inbound_sources", "user_id"], ["Google terhubung", "google_connections", "user_id"], ["Notifikasi aktif", "push_subscriptions", "user_id"]];

/** Growth page: signups, activation funnel, activity, weekly retention, feature usage and people worth a look. */
export async function usersGrowth(d: AdminDeps) {
  const sig = await paySignals(d, true), ids = [...sig.first.keys()], launch = sig.launch ?? FAR;
  const wib = new Date(Date.now() + 7 * 3600_000), today = ymd(wib), from = ymd(new Date(wib.getTime() - 59 * 864e5));
  const ev = "select user_id, at from finance.page_views where user_id is not null union all select user_id, created_at from finance.entries";
  const [act, ret, feat, signups, months, newIds, totals] = await Promise.all([
    d.db.query(`with ev as (${ev}) select count(distinct user_id) filter (where at > now() - interval '1 day')::int dau, count(distinct user_id) filter (where at > now() - interval '7 days')::int wau, count(distinct user_id) filter (where at > now() - interval '30 days')::int mau from ev`),
    d.db.query(`with ev as (${ev}), f as (select user_id, min(at) f from ev group by 1), x as (select f.user_id, date_trunc('week', f.f at time zone '${TZ}')::date cw, ((date_trunc('week', ev.at at time zone '${TZ}')::date - date_trunc('week', f.f at time zone '${TZ}')::date) / 7)::int off from f join ev on ev.user_id = f.user_id) select cw::text cw, off, count(distinct user_id)::int n from x group by 1, 2 order by 1, 2`),
    Promise.all(FEATURES.map(([label, t, col]) => d.db.query(`select count(distinct ${col})::int u, count(*)::int n from finance.${t}${t === "google_connections" ? " where refresh_enc is not null" : ""}`).then((r) => ({ label, users: num(r.rows[0].u), total: num(r.rows[0].n) })))),
    d.authDb ? d.authDb.query(`select s.day::text as day, coalesce(c.n,0)::int n, coalesce(c.pay,0)::int pay from ${series(from, today)} s left join (select (created_at at time zone '${TZ}')::date as day, count(*) n, count(*) filter (where source_id = any($1::text[])) pay from pos.customers group by 1) c on c.day = s.day order by 1`, [ids]) : Promise.resolve({ rows: [] as any[] }),
    d.authDb ? d.authDb.query(`select to_char(date_trunc('month', created_at at time zone '${TZ}'), 'YYYY-MM') m, count(*)::int n, count(*) filter (where source_id = any($1::text[]))::int pay from pos.customers group by 1 order by 1 desc limit 8`, [ids]) : Promise.resolve({ rows: [] as any[] }),
    d.authDb ? d.authDb.query("select source_id id, name, email, created_at from pos.customers where created_at >= $1::timestamptz", [launch]) : Promise.resolve({ rows: [] as any[] }),
    d.authDb ? d.authDb.query("select count(*)::int n, count(*) filter (where created_at >= $1::timestamptz)::int baru, count(*) filter (where is_active)::int active, (select count(*)::int from pos.customer_wallets) wallets from pos.customers", [launch]) : Promise.resolve({ rows: [{ n: 0, baru: 0, active: 0, wallets: 0 }] }),
  ]);
  const newSet = new Set<string>(newIds.rows.map((r: any) => r.id)), idsNew = ids.filter((i) => newSet.has(i));
  const have = (set: (id: string) => boolean) => ({ all: ids.filter(set).length, baru: idsNew.filter(set).length });
  const now = Date.now(), dayMs = 864e5;
  const recent = (id: string, days: number) => { const t = sig.lastSeen.get(id); return Boolean(t && now - +new Date(t) < days * dayMs); };
  const funnel = [
    { label: "Akun terdaftar", all: num(totals.rows[0].n), baru: num(totals.rows[0].baru) },
    { label: "Pernah buka Pay", ...have(() => true) },
    { label: "Selesai onboarding", ...have((i) => sig.onboarded.has(i)) },
    { label: "Punya catatan pertama", ...have((i) => (sig.entries.get(i) ?? 0) >= 1) },
    { label: "Aktif mencatat (≥ 5 catatan)", ...have((i) => (sig.entries.get(i) ?? 0) >= 5) },
    { label: "Aktif dalam 7 hari terakhir", ...have((i) => recent(i, 7)) },
  ];
  const wk = new Map<string, number[]>();
  for (const r of ret.rows) { const a = wk.get(r.cw) ?? []; a[r.off] = r.n; wk.set(r.cw, a); }
  const retention = [...wk.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 8).map(([week, a]) => ({ week, size: a[0] ?? 0, weeks: Array.from({ length: a.length }, (_, i) => a[i] ?? 0) }));
  // people worth a look
  const mapped = (list: string[]) => list.slice(0, 8);
  const nameOf = new Map<string, any>();
  const segIds = { aktif: [...ids].sort((a, b) => (sig.entries.get(b) ?? 0) - (sig.entries.get(a) ?? 0)).filter((i) => (sig.entries.get(i) ?? 0) > 0), tanpa: ids.filter((i) => (sig.entries.get(i) ?? 0) === 0 && now - +new Date(sig.first.get(i)!) > 2 * dayMs), pergi: ids.filter((i) => (sig.entries.get(i) ?? 0) > 0 && !recent(i, 14) && now - +new Date(sig.first.get(i)!) > 14 * dayMs), pwa: ids.filter((i) => sig.pwa.has(i) && (sig.entries.get(i) ?? 0) <= 1) };
  const want = [...new Set(Object.values(segIds).flatMap(mapped))];
  if (d.authDb && want.length) for (const r of (await d.authDb.query("select source_id id, name, email, photo_url from pos.customers where source_id = any($1::text[])", [want])).rows) nameOf.set(r.id, r);
  const seg = (title: string, hint: string, list: string[]) => ({ title, hint, count: list.length, people: mapped(list).map((i) => ({ id: i, name: nameOf.get(i)?.name ?? "—", email: nameOf.get(i)?.email ?? "", photo_url: nameOf.get(i)?.photo_url ?? null, entries: sig.entries.get(i) ?? 0, seen: sig.lastSeen.get(i) ?? null })) });
  return {
    launch: sig.launch, activeUsers: { dau: num(act.rows[0].dau), wau: num(act.rows[0].wau), mau: num(act.rows[0].mau) }, payUsers: ids.length, totalAccounts: num(totals.rows[0].n), newAccounts: num(totals.rows[0].baru), wallets: num(totals.rows[0].wallets),
    signups: mapNum(signups.rows, ["n", "pay"]), months: mapNum(months.rows, ["n", "pay"]).reverse(), funnel, retention, features: feat.map((f) => ({ ...f, pct: ids.length ? Math.round((f.users / ids.length) * 100) : 0 })),
    segments: [seg("Paling aktif mencatat", "Pengguna dengan catatan terbanyak", segIds.aktif), seg("Belum mencatat", "Sudah buka Pay lebih dari 2 hari lalu tapi belum punya catatan", segIds.tanpa), seg("Hampir pergi", "Pernah mencatat, tidak terlihat 14 hari", segIds.pergi), seg("Pasang PWA tapi belum aktif", "Memakai aplikasi terpasang, catatan 1 atau kurang", segIds.pwa)],
  };
}

const FEATURE_TABLES: [string, string][] = [["entries", "Catatan"], ["accounts", "Dompet"], ["budgets", "Anggaran"], ["goals", "Target"], ["bills", "Tagihan"], ["debts", "Utang piutang"], ["assets", "Aset"], ["receipts", "Struk"], ["inbound_messages", "Email dibaca"]];

/** One person, in depth: cohort and timeline, feature use, money habits, behaviour, wallet and account health. */
export async function userDeep(d: AdminDeps, id: string) {
  const sig = await paySignals(d), launch = sig.launch;
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const e = { rows: [] as any[] };
  const [cust, ledger, topups, feat, kinds, months, cats, sources, hours, devices, pages, mail, receipts, mailAttached, scans, views, google, pushes, prof, firstOf, recent, lastEntry] = await Promise.all([
    d.authDb ? d.authDb.query("select c.*, w.available_balance, w.held_balance, w.total_credited, w.total_debited, w.status wallet_status, w.created_at wallet_at, (p.customer_id is not null) has_pin, p.failed_attempts, p.locked_until from pos.customers c left join pos.customer_wallets w on w.customer_id = c.source_id left join pos.customer_pins p on p.customer_id = c.source_id where c.source_id = $1", [id]) : Promise.resolve(e),
    d.authDb ? safe(d.authDb.query("select id, amount, direction, status, transaction_type, balance_after, note, created_at, source_app from pos.customer_wallet_ledger where customer_id = $1 order by created_at desc limit 25", [id]), e) : Promise.resolve(e),
    d.authDb ? safe(d.authDb.query("select amount, status, created_at, paid_at from pos.customer_wallet_topups where customer_id = $1 order by created_at desc", [id]), e) : Promise.resolve(e),
    safe(d.db.query(`select ${FEATURE_TABLES.map(([t]) => `(select count(*)::int from finance.${t} where user_id = $1) ${t}`).join(", ")}, (select count(*)::int from finance.google_connections where user_id = $1 and refresh_enc is not null) google, (select count(*)::int from finance.push_subscriptions where user_id = $1) push, (select count(*)::int from finance.inbound_sources where user_id = $1 and enabled) mailsrc`, [id]), e),
    safe(d.db.query("select kind, count(*)::int n, coalesce(sum(amount),0) s from finance.entries where user_id = $1 group by 1", [id]), e),
    safe(d.db.query(`select to_char(date_trunc('month', at at time zone '${TZ}'), 'YYYY-MM') m, coalesce(sum(amount) filter (where kind='out'),0) out, coalesce(sum(amount) filter (where kind='in'),0) inc, count(*)::int n from finance.entries where user_id = $1 group by 1 order by 1 desc limit 12`, [id]), e),
    safe(d.db.query("select category_id, count(*)::int n, coalesce(sum(amount),0) s from finance.entries where user_id = $1 and kind = 'out' group by 1 order by 3 desc limit 8", [id]), e),
    safe(d.db.query("select source, count(*)::int n, coalesce(sum(amount),0) s from finance.entries where user_id = $1 group by 1 order by 2 desc", [id]), e),
    safe(d.db.query(`select extract(hour from t at time zone '${TZ}')::int h, extract(isodow from t at time zone '${TZ}')::int dow, count(*)::int n from (select at t from finance.page_views where user_id = $1 union all select created_at from finance.entries where user_id = $1) x group by 1, 2`, [id]), e),
    safe(d.db.query("select device, browser, standalone, count(*)::int n, max(at) last from finance.page_views where user_id = $1 group by 1, 2, 3 order by 4 desc", [id]), e),
    safe(d.db.query("select path, count(*)::int n from finance.page_views where user_id = $1 group by 1 order by 2 desc limit 10", [id]), e),
    safe(d.db.query("select status, count(*)::int n from finance.inbound_messages where user_id = $1 group by 1 order by 2 desc", [id]), e),
    safe(d.db.query("select count(*)::int n, count(*) filter (where status = 'ready')::int ok, coalesce(round(avg(confidence)::numeric, 2), 0) conf from finance.receipts where user_id = $1", [id]), e),
    safe(d.db.query("select count(*)::int n, count(*) filter (where receipt_id is not null)::int withreceipt from finance.entries where user_id = $1 and source = 'email'", [id]), e),
    safe(d.db.query("select coalesce(sum(scans),0)::int n, count(*)::int days from finance.scan_usage where user_id = $1", [id]), e),
    safe(d.db.query(`select count(*)::int n, min(at) first, max(at) last, count(distinct (at at time zone '${TZ}')::date)::int days, count(distinct visitor)::int visitors from finance.page_views where user_id = $1`, [id]), e),
    safe(d.db.query("select connected_at, email from finance.google_connections where user_id = $1 and refresh_enc is not null", [id]), e),
    safe(d.db.query("select min(created_at) first, max(last_ok_at) ok from finance.push_subscriptions where user_id = $1", [id]), e),
    safe(d.db.query("select created_at, onboarded from finance.profiles where user_id = $1", [id]), e),
    safe(d.db.query("select (select min(created_at) from finance.entries where user_id = $1) entry, (select min(created_at) from finance.receipts where user_id = $1) receipt, (select min(created_at) from finance.inbound_messages where user_id = $1) mail, (select min(created_at) from finance.budgets where user_id = $1) budget", [id]), e),
    safe(d.db.query("select at, path, device, browser, standalone from finance.page_views where user_id = $1 order by at desc limit 20", [id]), e),
    safe(d.db.query("select max(created_at) at from finance.entries where user_id = $1", [id]), e),
  ]);
  const c = cust.rows[0]; if (!c) return null;
  const { raw: _raw, ...profile } = c;
  const created = iso(c.created_at)!, cohort: Cohort = launch && created >= launch ? "baru" : sig.first.has(id) ? "lama_pay" : "lama_belum";
  const f = feat.rows[0] ?? {}, k = (x: string) => kinds.rows.find((r: any) => r.kind === x), v = views.rows[0] ?? {}, fo = firstOf.rows[0] ?? {};
  const paid = topups.rows.filter((r: any) => r.status === "paid");
  const lastAct = [v.last, lastEntry.rows[0]?.at, c.last_active_at].filter(Boolean).map((x: any) => +new Date(x)).sort((a, b) => b - a)[0];
  const idle = lastAct ? Math.floor((Date.now() - lastAct) / 864e5) : null;
  const ev = (at: unknown, label: string, tone = "info", hint = "") => (at ? [{ at: iso(at)!, label, tone, hint }] : []);
  const timeline = [
    ...ev(c.created_at, "Akun dibuat", "info", cohort === "baru" ? "Setelah Pay rilis" : "Pelanggan Djiwa Tentram lama"), ...ev(c.wallet_at, "Dompet Djiwa dibuat"), ...ev(sig.first.get(id), "Pertama terlihat di Pay", "ok"),
    ...ev(prof.rows[0]?.created_at, "Profil keuangan dibuat"), ...(prof.rows[0]?.onboarded ? ev(prof.rows[0].created_at, "Selesai onboarding", "ok") : []), ...ev(v.first, "Tampilan halaman pertama"), ...ev(fo.entry, "Catatan keuangan pertama", "ok"),
    ...ev(fo.budget, "Anggaran pertama dibuat"), ...ev(fo.receipt, "Scan struk pertama", "ok"), ...ev(fo.mail, "Email pembayaran pertama dibaca"), ...ev(google.rows[0]?.connected_at, "Google terhubung", "ok"), ...ev(pushes.rows[0]?.first, "Notifikasi diaktifkan", "ok"),
    ...ev(topups.rows.length ? topups.rows[topups.rows.length - 1].created_at : null, "Isi saldo pertama dicoba"), ...ev(paid.length ? paid[paid.length - 1].paid_at ?? paid[paid.length - 1].created_at : null, "Isi saldo pertama berhasil", "ok"), ...ev(c.last_order_at, "Pesanan terakhir"),
    ...ev(lastAct ? new Date(lastAct) : null, "Aktivitas terakhir"),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  // score out of 100: how far this person got with Pay
  const entries = num(f.entries), score = Math.min(100, (prof.rows[0]?.onboarded ? 15 : 0) + (entries >= 1 ? 20 : 0) + (entries >= 10 ? 15 : 0) + (idle !== null && idle <= 7 ? 20 : 0) + (num(f.google) ? 10 : 0) + (num(f.push) ? 10 : 0) + (num(f.receipts) ? 5 : 0) + (num(f.budgets) || num(f.goals) ? 5 : 0));
  const health: { tone: string; text: string }[] = [];
  if (!c.is_active) health.push({ tone: "bad", text: "Akun nonaktif" });
  if (c.locked_until && new Date(c.locked_until) > new Date()) health.push({ tone: "bad", text: "PIN sedang terkunci" });
  if (num(c.failed_attempts) >= 3) health.push({ tone: "warn", text: `${c.failed_attempts} kali salah PIN` });
  if (topups.rows.length >= 3 && paid.length === 0) health.push({ tone: "warn", text: "Beberapa isi saldo belum pernah berhasil" });
  if (sig.first.has(id) && entries === 0 && Date.now() - +new Date(sig.first.get(id)!) > 2 * 864e5) health.push({ tone: "warn", text: "Sudah membuka Pay tapi belum mencatat" });
  if (idle !== null && idle > 14 && entries > 0) health.push({ tone: "warn", text: `Tidak terlihat ${idle} hari` });
  if (!health.length) health.push({ tone: "ok", text: "Tidak ada masalah terdeteksi" });
  const hour = Array(24).fill(0), dow = Array(7).fill(0); for (const r of hours.rows) { hour[r.h] += r.n; dow[r.dow - 1] += r.n; }
  const em = mailAttached.rows[0] ?? { n: 0, withreceipt: 0 }, tp = topups.rows;
  return {
    profile: { ...profile, available_balance: num(c.available_balance), held_balance: num(c.held_balance), total_credited: num(c.total_credited), total_debited: num(c.total_debited), total_spent: num(c.total_spent) },
    ledger: mapNum(ledger.rows, ["amount", "balance_after"]), topups: mapNum(tp.slice(0, 10), ["amount"]), finance: f, kinds: mapNum(kinds.rows, ["s"]).map((x: any) => ({ kind: x.kind, n: x.n, sum: x.s })),
    traffic: { n: num(v.n), last: v.last ?? null, days: num(v.days), recent: recent.rows }, google: { connected: Boolean(google.rows[0]) }, push: num(f.push),
    cohort, launch, payFirst: sig.first.get(id) ?? null, score, idleDays: idle, health, timeline,
    features: FEATURE_TABLES.map(([t, label]) => ({ label, n: num(f[t]) })).concat([{ label: "Google", n: num(f.google) }, { label: "Notifikasi", n: num(f.push) }, { label: "Sumber email", n: num(f.mailsrc) }]),
    money: { months: mapNum(months.rows, ["out", "inc", "n"]).reverse(), categories: mapNum(cats.rows, ["s"]).map((x: any) => ({ id: x.category_id, n: x.n, sum: x.s })), sources: mapNum(sources.rows, ["s"]).map((x: any) => ({ source: x.source, n: x.n, sum: x.s })), out: num(k("out")?.s), inc: num(k("in")?.s), outN: num(k("out")?.n), avgOut: k("out") && num(k("out").n) ? num(k("out").s) / num(k("out").n) : 0 },
    behaviour: { hour, dow, devices: devices.rows, pages: pages.rows, views: num(v.n), days: num(v.days), visitors: num(v.visitors), perDay: num(v.days) ? Math.round((num(v.n) / num(v.days)) * 10) / 10 : 0, first: v.first ?? null },
    quality: { mail: mail.rows, receipts: { n: num(receipts.rows[0]?.n), ok: num(receipts.rows[0]?.ok), conf: num(receipts.rows[0]?.conf) }, emailEntries: num(em.n), emailWithReceipt: num(em.withreceipt), scans: num(scans.rows[0]?.n), scanDays: num(scans.rows[0]?.days) },
    wallet: { topups: tp.length, paid: paid.length, paidSum: paid.reduce((s: number, r: any) => s + num(r.amount), 0), avg: paid.length ? paid.reduce((s: number, r: any) => s + num(r.amount), 0) / paid.length : 0, first: tp.length ? tp[tp.length - 1].created_at : null, last: tp[0]?.created_at ?? null, pending: tp.filter((r: any) => r.status === "pending").length },
  };
}
