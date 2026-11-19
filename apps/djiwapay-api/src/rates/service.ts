/** Keeps BI-Rate current: a worker checks Bank Indonesia's page (hourly, every 10 minutes around the monthly Board meeting), the API serves it,
 *  and an admin can enter a decision by hand when the page cannot be read. */
import type { Hono } from "hono";
import type { Q, Tx } from "../sync.js";
import { fetchBiRate, summarizeRates, type RatePoint } from "./bi.js";

const CODE = "bi_rate", HOUR = 3600_000, WINDOW = 10 * 60_000, RETRY = 15 * 60_000, STALE_DAYS = 60;

/** The Board of Governors meets about once a month in the second half of the month, and announces around 14:00 WIB. */
export function nextDelay(now: Date, ok = true): number {
  if (!ok) return RETRY;
  const w = new Date(now.getTime() + 7 * 3600_000), dow = w.getUTCDay(), day = w.getUTCDate(), hour = w.getUTCHours();
  return dow >= 1 && dow <= 5 && day >= 14 && day <= 25 && hour >= 12 && hour < 20 ? WINDOW : HOUR;
}

export async function storedRates(db: Q, limit = 60, code = CODE): Promise<RatePoint[]> {
  return (await db.query("select to_char(day,'YYYY-MM-DD') as day, price from finance.market_prices where code=$1 order by day desc limit $2", [code, limit])).rows.map((r) => ({ day: r.day as string, rate: Number(r.price) }));
}
const save = (db: Q, pts: RatePoint[], code = CODE) => db.query("insert into finance.market_prices(code,day,price) select $1,x.day::date,x.rate from jsonb_to_recordset($2::jsonb) as x(day text,rate numeric) on conflict(code,day) do update set price=excluded.price", [code, JSON.stringify(pts)]);

export type SyncOutcome = { ok: boolean; changed: boolean; latest?: RatePoint; previous?: RatePoint; error?: string };
export async function syncBiRate(d: { db: Tx; f?: typeof fetch; now?: () => Date; code?: string }): Promise<SyncOutcome> {
  const now = (d.now ?? (() => new Date()))(), code = d.code ?? CODE;
  const before = (await storedRates(d.db, 1, code))[0]?.day ?? null;
  try {
    const pts = await fetchBiRate(d.f);
    await save(d.db, pts.slice(0, 80), code);
    await d.db.query("insert into finance.rate_state(code,checked_at,last_ok_at,next_check_at,last_error) values($1,now(),now(),now()+($2 * interval '1 millisecond'),null) on conflict(code) do update set checked_at=now(), last_ok_at=now(), last_error=null, next_check_at=excluded.next_check_at", [code, nextDelay(now)]);
    return { ok: true, changed: before !== null && pts[0].day > before, latest: pts[0], previous: pts[1] };
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 120) : "BI_RATE_FAILED";
    await d.db.query("insert into finance.rate_state(code,checked_at,next_check_at,last_error) values($1,now(),now()+($2 * interval '1 millisecond'),$3) on conflict(code) do update set checked_at=now(), last_error=excluded.last_error, next_check_at=excluded.next_check_at", [code, nextDelay(now, false), error]);
    return { ok: false, changed: false, error };
  }
}

/** One worker tick. `onChange` runs once per new decision (to tell the people it affects). */
export async function runRatesDue(d: { db: Tx; f?: typeof fetch; now?: () => Date; code?: string; onChange?: (latest: RatePoint, previous: RatePoint | undefined) => Promise<void> }) {
  const code = d.code ?? CODE;
  const due = (await d.db.query("select 1 from finance.rate_state where code=$1 and next_check_at <= now()", [code])).rows.length || !(await d.db.query("select 1 from finance.rate_state where code=$1", [code])).rows.length;
  if (!due) return null;
  const out = await syncBiRate(d);
  if (out.ok && out.changed && out.latest && d.onChange) {
    const marked = await d.db.query("update finance.rate_state set notified_day=$2::date where code=$1 and (notified_day is null or notified_day < $2::date) returning 1", [code, out.latest.day]);
    if (marked.rows.length) await d.onChange(out.latest, out.previous).catch((e) => console.error("bi-rate notify", e instanceof Error ? e.message : e));
  }
  return out;
}

export async function biRateView(db: Q, now = new Date(), code = CODE) {
  const pts = await storedRates(db, 60, code), s = summarizeRates(pts);
  const st = (await db.query("select checked_at,last_ok_at,last_error from finance.rate_state where code=$1", [code])).rows[0];
  const ageDays = s ? (now.getTime() - Date.parse(`${s.day}T00:00:00Z`)) / 86_400_000 : null;
  return {
    current: s, history: pts.slice(0, 24), source: "Bank Indonesia", sourceUrl: "https://www.bi.go.id/id/statistik/indikator/bi-rate.aspx",
    checkedAt: st?.checked_at ? new Date(st.checked_at).toISOString() : null, lastOkAt: st?.last_ok_at ? new Date(st.last_ok_at).toISOString() : null, error: (st?.last_error as string | null) ?? null,
    stale: ageDays === null || ageDays > STALE_DAYS,
  };
}

export function registerRateRoutes(app: Hono, d: { db: Tx }, json: (c: any, body: unknown, status?: number) => Response) {
  app.get("/api/finance/rates/bi", async (c) => json(c, { success: true, ...(await biRateView(d.db)) }));
  // Admin only (the /api/finance/admin/* guard is registered before this route): enter a decision by hand if Bank Indonesia's page cannot be read.
  app.post("/api/finance/admin/rates/bi", async (c) => {
    const b = await c.req.json().catch(() => ({})) as { day?: unknown; rate?: unknown };
    const day = String(b.day ?? ""), rate = Number(b.rate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)) || !(rate > 0 && rate <= 25)) return json(c, { success: false, error: "INVALID_INPUT" }, 400);
    await save(d.db, [{ day, rate: Math.round(rate * 100) / 100 }]);
    return json(c, { success: true, ...(await biRateView(d.db)) });
  });
}
