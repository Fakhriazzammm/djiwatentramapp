import { parseRange, type AdminDeps } from "./admin.js";
import { DEFAULT_DAILY_CALLS } from "./categorize.js";

/**
 * Health of the data pipeline, across everyone: how much of the mail and the notifications turns into records, which banks and senders fail,
 * how the daily AI allowance is used, and which background jobs (Gmail, imports, spreadsheets, scans) are in trouble. Aggregates only: no names, no amounts, no mail.
 */
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export async function dataHealth(d: AdminDeps, from?: string, to?: string, now = new Date()) {
  const r = parseRange(from, to, now);
  const lo = `${r.from}T00:00:00+07:00`, hi = `(${"$2"}::date + 1)::timestamp at time zone 'Asia/Jakarta'`;
  const win = `created_at >= $1::timestamptz and created_at < ${hi}`;
  const [byStatus, byBank, skipReasons, senders, aiToday, aiDays, aiCache, imports, importErrs, gmail, hooks, notif, scans, sheets, sheetErr] = await Promise.all([
    d.db.query(`select status, count(*)::int n from finance.inbound_messages where ${win} group by 1`, [lo, r.to]),
    d.db.query(`select channel, count(*) filter (where status in ('auto','approved','review','duplicate'))::int ok,
        count(*) filter (where status='failed' or (status='ignored' and reason='unreadable'))::int bad, count(*) filter (where status='rejected')::int rejected,
        count(*) filter (where status='review')::int waiting, count(*)::int total
      from finance.inbound_messages where ${win} and channel <> '' group by 1 order by 6 desc limit 40`, [lo, r.to]),
    d.db.query(`select reason, count(*)::int n from finance.inbound_skips where ${win} group by 1 order by 2 desc`, [lo, r.to]),
    d.db.query(`select sender_domain domain, reason, count(*)::int n from finance.inbound_skips where ${win} and reason in ('auth-failed','sender-not-allowed','secret') group by 1,2 order by 3 desc limit 15`, [lo, r.to]),
    d.db.query(`select count(*)::int users, coalesce(sum(calls),0)::int calls, count(*) filter (where calls >= $1)::int atlimit from finance.ai_usage where day = (now() at time zone 'Asia/Jakarta')::date`, [DEFAULT_DAILY_CALLS]),
    d.db.query(`select to_char(day, 'YYYY-MM-DD') as "day", sum(calls)::int as calls, count(*)::int as users from finance.ai_usage where day >= (now() at time zone 'Asia/Jakarta')::date - 13 group by day order by day`),
    d.db.query(`select count(*)::int rows, coalesce(sum(hits),0)::int hits from finance.ai_category_cache`),
    d.db.query(`select status, count(*)::int n from finance.gmail_import where created_at >= $1::timestamptz group by 1`, [lo]),
    d.db.query(`select error, count(*)::int n from finance.gmail_import where created_at >= $1::timestamptz and error is not null group by 1 order by 2 desc limit 6`, [lo]),
    d.db.query(`select count(*)::int total, count(*) filter (where enabled)::int on_, count(*) filter (where enabled and last_error is not null)::int bad from finance.gmail_sync`),
    d.db.query(`select count(*)::int total, count(*) filter (where last_at > now() - interval '3 days')::int active, count(*) filter (where last_status in ('ignored','failed'))::int weak from finance.inbound_hooks`),
    d.db.query(`select count(*)::int users, coalesce(sum(received),0)::bigint received, count(*) filter (where last_at > now() - interval '3 days')::int active from finance.notif_state`).catch(() => ({ rows: [{ users: 0, received: 0, active: 0 }] })),
    d.db.query(`select status, count(*)::int n from finance.receipts where ${win} group by 1`, [lo, r.to]),
    d.db.query(`select status, count(*)::int n from finance.google_sheet_exports group by 1`),
    d.db.query(`select last_error, count(*)::int n from finance.google_sheet_exports where last_error is not null group by 1 order by 2 desc limit 5`),
  ]);
  const s = Object.fromEntries(byStatus.rows.map((x) => [x.status as string, Number(x.n)])) as Record<string, number>;
  const read = (s.auto ?? 0) + (s.approved ?? 0) + (s.review ?? 0) + (s.duplicate ?? 0), unread = (s.failed ?? 0);
  const unreadable = byBank.rows.reduce((t, b) => t + Number(b.bad), 0) - unread;   // read but not understood: ignored as unreadable
  const readable = pct(read, read + unread + Math.max(0, unreadable));
  const banks = byBank.rows.map((b) => { const ok = Number(b.ok), bad = Number(b.bad); return { channel: String(b.channel), total: Number(b.total), ok, bad, rejected: Number(b.rejected), waiting: Number(b.waiting), readRate: pct(ok, ok + bad) }; });
  const ai = aiToday.rows[0];
  return {
    range: r,
    mail: { total: Object.values(s).reduce((a, b) => a + b, 0), recorded: (s.auto ?? 0) + (s.approved ?? 0), waiting: s.review ?? 0, failed: unread, duplicate: s.duplicate ?? 0, rejected: s.rejected ?? 0, ignored: s.ignored ?? 0, readRate: readable, unreadable },
    banks, worstBanks: banks.filter((b) => b.ok + b.bad >= 5 && b.readRate !== null).sort((a, b) => (a.readRate ?? 100) - (b.readRate ?? 100)).slice(0, 8),
    skips: skipReasons.rows.map((x) => ({ reason: String(x.reason), n: Number(x.n) })),
    senders: senders.rows.map((x) => ({ domain: String(x.domain), reason: String(x.reason), n: Number(x.n) })),
    ai: { calls: Number(ai?.calls ?? 0), users: Number(ai?.users ?? 0), atLimit: Number(ai?.atlimit ?? 0), dailyLimit: DEFAULT_DAILY_CALLS, days: aiDays.rows.map((x) => ({ day: String(x.day), calls: Number(x.calls), users: Number(x.users) })), cacheRows: Number(aiCache.rows[0]?.rows ?? 0), cacheHits: Number(aiCache.rows[0]?.hits ?? 0) },
    jobs: {
      gmail: { total: Number(gmail.rows[0].total), enabled: Number(gmail.rows[0].on_), failing: Number(gmail.rows[0].bad) },
      hooks: { total: Number(hooks.rows[0].total), active: Number(hooks.rows[0].active), weak: Number(hooks.rows[0].weak) },
      notif: { users: Number(notif.rows[0].users), received: Number(notif.rows[0].received), active: Number(notif.rows[0].active) },
      imports: Object.fromEntries(imports.rows.map((x) => [x.status as string, Number(x.n)])), importErrors: importErrs.rows.map((x) => ({ error: String(x.error).slice(0, 80), n: Number(x.n) })),
      scans: Object.fromEntries(scans.rows.map((x) => [x.status as string, Number(x.n)])),
      sheets: Object.fromEntries(sheets.rows.map((x) => [x.status as string, Number(x.n)])), sheetErrors: sheetErr.rows.map((x) => ({ error: String(x.last_error).slice(0, 80), n: Number(x.n) })),
    },
  };
}
