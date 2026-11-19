/** Stock tracker service: HTTP routes, and the background pass that keeps the user's Google Sheet in step. */
import { randomBytes } from "node:crypto";
import type { Hono } from "hono";
import { accessToken } from "../google.js";
import { GoogleError, requestSheet, type SyncDeps } from "../google-sync.js";
import type { Q, Tx } from "../sync.js";
import { DEFAULT_FEES, MAX_PRICE, TICKER_RE, feeOf, grossOf, parseFees, parseTrade, replay, type Fees, type Trade } from "./model.js";
import { ensureTabs, readPrices, reenterPrices, writeTabs } from "./sheet.js";

const IDLE_MS = 60 * 60_000, ACTIVE_MS = 90_000, SETTLE_MS = 12_000, RETRY_MS = 5 * 60_000, ACTIVE_WINDOW_MS = 15 * 60_000;

class Problem extends Error { constructor(public status: number, public code: string) { super(code); } }

const loadTrades = async (q: Q, userId: string): Promise<Trade[]> =>
  (await q.query("select id,ticker,side,lots,price,fee,at,note from finance.stock_trades where user_id=$1 order by at, created_at, id", [userId])).rows
    .map((r) => ({ id: r.id, ticker: r.ticker, side: r.side, lots: Number(r.lots), price: Number(r.price), fee: Number(r.fee), at: new Date(r.at).toISOString(), note: r.note ?? "" }));

const feesOf = (row: { fee_buy: unknown; fee_sell: unknown }): Fees => ({ buy: Number(row.fee_buy), sell: Number(row.fee_sell) });

/** Everything the screen needs, in one read. */
export async function stockState(db: Q, userId: string) {
  const s = (await db.query("select * from finance.stock_settings where user_id=$1", [userId])).rows[0];
  if (!s) return { activated: false, fees: DEFAULT_FEES, trades: [] as Trade[], holdings: [], prices: {}, sheet: { ready: false, url: null, error: null, lastSyncedAt: null, pending: false } };
  const trades = await loadTrades(db, userId), { holdings } = replay(trades);
  const prices: Record<string, { price: number | null; asOf: string | null; checkedAt: string | null; manual: number | null }> = {};
  for (const r of (await db.query("select ticker,price,as_of,checked_at,manual_price from finance.stock_prices where user_id=$1", [userId])).rows)
    prices[r.ticker] = { price: r.price === null ? null : Number(r.price), asOf: r.as_of ? new Date(r.as_of).toISOString() : null, checkedAt: r.checked_at ? new Date(r.checked_at).toISOString() : null, manual: r.manual_price === null ? null : Number(r.manual_price) };
  const ex = (await db.query("select spreadsheet_url from finance.google_sheet_exports where user_id=$1", [userId])).rows[0];
  return {
    activated: true, fees: feesOf(s), trades, holdings, prices,
    sheet: { ready: Boolean(s.sheet_ready), url: (ex?.spreadsheet_url as string | undefined) ?? null, error: (s.last_error as string | null) ?? null, lastSyncedAt: s.last_synced_at ? new Date(s.last_synced_at).toISOString() : null, pending: Boolean(s.dirty) || !s.sheet_ready },
  };
}

const poke = (q: Q, userId: string) => q.query("update finance.stock_settings set dirty=true, next_sync_at=least(next_sync_at, now()+interval '8 seconds') where user_id=$1", [userId]);

export type StockHooks = { driveConnected: (userId: string) => Promise<boolean> };
export function registerStockRoutes(app: Hono, d: { db: Tx }, uid: (c: any) => string, json: (c: any, body: unknown, status?: number) => Response, hooks: StockHooks) {
  const guard = (fn: (c: any) => Promise<Response>) => async (c: any) => {
    try { return await fn(c); } catch (e) { if (e instanceof Problem) return json(c, { success: false, error: e.code }, e.status); console.error("stocks", e instanceof Error ? e.message : e); return json(c, { success: false, error: "SERVER_ERROR" }, 500); }
  };
  const body = (c: any) => c.req.json().catch(() => ({}));
  const state = async (c: any, status = 200) => json(c, { success: true, drive: await hooks.driveConnected(uid(c)), ...(await stockState(d.db, uid(c))) }, status);

  app.get("/api/finance/stocks", guard((c) => state(c)));

  app.post("/api/finance/stocks/activate", guard(async (c) => {
    const u = uid(c);
    await d.db.query("insert into finance.stock_settings(user_id) values($1) on conflict(user_id) do update set dirty=true, next_sync_at=now()", [u]);
    if (await hooks.driveConnected(u)) await requestSheet(d.db, u);
    return state(c);
  }));

  app.post("/api/finance/stocks/trades", guard(async (c) => {
    const u = uid(c), parsed = parseTrade(await body(c));
    if (!parsed.ok) throw new Problem(400, parsed.error);
    await d.db.tx(async (q) => {
      const s = (await q.query("select fee_buy,fee_sell from finance.stock_settings where user_id=$1 for update", [u])).rows[0];
      if (!s) throw new Problem(409, "NOT_ACTIVATED");
      const t = parsed.trade, fee = feeOf(t.side, grossOf(t.lots, t.price), feesOf(s)), id = `st-${randomBytes(8).toString("hex")}`;
      const next = [...(await loadTrades(q, u)), { id, ...t, fee }];
      if (replay(next).error) throw new Problem(422, "OVERSELL");
      await q.query("insert into finance.stock_trades(user_id,id,ticker,side,lots,price,fee,at,note) values($1,$2,$3,$4,$5,$6,$7,$8,$9)", [u, id, t.ticker, t.side, t.lots, t.price, fee, t.at, t.note]);
      await poke(q, u);
    });
    return state(c, 201);
  }));

  app.delete("/api/finance/stocks/trades/:id", guard(async (c) => {
    const u = uid(c), id = c.req.param("id");
    await d.db.tx(async (q) => {
      await q.query("select 1 from finance.stock_settings where user_id=$1 for update", [u]);
      const all = await loadTrades(q, u);
      if (!all.some((t) => t.id === id)) throw new Problem(404, "NOT_FOUND");
      if (replay(all.filter((t) => t.id !== id)).error) throw new Problem(422, "WOULD_OVERSELL");   // removing a buy that a later sale depends on
      await q.query("delete from finance.stock_trades where user_id=$1 and id=$2", [u, id]);
      await poke(q, u);
    });
    return state(c);
  }));

  app.put("/api/finance/stocks/settings", guard(async (c) => {
    const fees = parseFees(await body(c));
    if (!fees) throw new Problem(400, "INVALID_FEES");
    const r = await d.db.query("update finance.stock_settings set fee_buy=$2, fee_sell=$3 where user_id=$1 returning user_id", [uid(c), fees.buy, fees.sell]);
    if (!r.rows.length) throw new Problem(409, "NOT_ACTIVATED");
    return state(c);
  }));

  app.put("/api/finance/stocks/prices/manual", guard(async (c) => {
    const b = await body(c) as { ticker?: unknown; price?: unknown }, ticker = String(b.ticker ?? "").toUpperCase();
    if (!TICKER_RE.test(ticker)) throw new Problem(400, "INVALID_TICKER");
    const price = b.price === null || b.price === undefined || b.price === "" ? null : Number(b.price);
    if (price !== null && !(Number.isFinite(price) && price > 0 && price <= MAX_PRICE)) throw new Problem(400, "INVALID_PRICE");
    await d.db.query("insert into finance.stock_prices(user_id,ticker,manual_price) values($1,$2,$3) on conflict(user_id,ticker) do update set manual_price=excluded.manual_price", [uid(c), ticker, price === null ? null : Math.round(price * 100) / 100]);
    return state(c);
  }));

  // "Segarkan": ask the worker to make Sheets recalculate and read the prices again. Cheap to call; throttled.
  app.post("/api/finance/stocks/refresh", guard(async (c) => {
    const r = await d.db.query("update finance.stock_settings set refresh_requested_at=now(), recalc=true, settle=2, next_sync_at=now() where user_id=$1 and (last_synced_at is null or last_synced_at < now() - interval '45 seconds') returning user_id", [uid(c)]);
    return json(c, { success: true, queued: r.rows.length > 0 });
  }));
}

/* ---------------- background pass ---------------- */

export type StockOutcome = { ok: boolean; action: "synced" | "waiting" | "idle" | "failed"; error?: string };

export async function syncStocks(d: SyncDeps, userId: string): Promise<StockOutcome> {
  const f = d.f ?? fetch;
  const s = (await d.db.query("select * from finance.stock_settings where user_id=$1", [userId])).rows[0];
  if (!s) return { ok: false, action: "idle" };
  const next = (ms: number, set = "") => d.db.query(`update finance.stock_settings set next_sync_at=now()+($2 * interval '1 millisecond')${set} where user_id=$1`, [userId, ms]);
  const ex = (await d.db.query("select spreadsheet_id,status from finance.google_sheet_exports where user_id=$1", [userId])).rows[0];
  if (!ex?.spreadsheet_id) { await next(20_000); return { ok: false, action: "waiting" }; }       // the workbook is still being built
  if (ex.status === "missing") { await next(IDLE_MS, ", sheet_ready=false, last_error='SHEET_MISSING'"); return { ok: false, action: "failed", error: "SHEET_MISSING" }; }
  const token = await accessToken(d.db, d.cfg, userId, f);
  if (!token) { await next(30 * 60_000, ", sheet_ready=false, last_error='NOT_CONNECTED'"); return { ok: false, action: "failed", error: "NOT_CONNECTED" }; }

  // Take the flags first: a trade added while this pass runs sets them again and is picked up next time.
  const was = (await d.db.query("with old as (select dirty,recalc,settle,refresh_requested_at from finance.stock_settings where user_id=$1 for update) update finance.stock_settings s set dirty=false, recalc=false from old where s.user_id=$1 returning old.dirty as was_dirty, old.recalc as was_recalc, old.settle as settle, old.refresh_requested_at as asked", [userId])).rows[0];
  const id = ex.spreadsheet_id as string;
  try {
    const tabs = await ensureTabs(f, token, id);
    const trades = await loadTrades(d.db, userId), held = replay(trades).holdings.filter((h) => h.shares > 0);
    const write = Boolean(was.was_dirty) || s.sheet_id !== id || !s.sheet_ready || tabs.created;
    if (write) await writeTabs(f, token, id, trades, held);
    else if (was.was_recalc) await reenterPrices(f, token, id, held);

    const got = await readPrices(f, token, id, held.map((h) => h.ticker));
    if (got.length) await d.db.query(`insert into finance.stock_prices(user_id,ticker,price,as_of,checked_at)
      select $1,x.ticker,x.price,x.as_of,now() from jsonb_to_recordset($2::jsonb) as x(ticker text,price numeric,as_of timestamptz)
      on conflict(user_id,ticker) do update set price=coalesce(excluded.price,finance.stock_prices.price), as_of=coalesce(excluded.as_of,finance.stock_prices.as_of), checked_at=now()`, [userId, JSON.stringify(got.map((g) => ({ ticker: g.ticker, price: g.price, as_of: g.asOf })))]);

    // Formulas need a moment after a write: look again shortly while any price is still missing.
    const settle = write || was.was_recalc ? 2 : Number(was.settle ?? 0), missing = held.length > 0 && got.length < held.length || got.some((g) => g.price === null);
    const again = settle > 0 && missing;
    const active = was.asked && Date.now() - new Date(was.asked).getTime() < ACTIVE_WINDOW_MS;
    await d.db.query("update finance.stock_settings set sheet_id=$2, sheet_ready=true, last_error=null, last_synced_at=now(), settle=$3, next_sync_at=now()+($4 * interval '1 millisecond') where user_id=$1", [userId, id, again ? settle - 1 : 0, again ? SETTLE_MS : active ? ACTIVE_MS : IDLE_MS]);
    return { ok: true, action: "synced" };
  } catch (e) {
    const gone = e instanceof GoogleError && e.status === 404, denied = e instanceof GoogleError && (e.status === 401 || e.status === 403);
    const code = gone ? "SHEET_MISSING" : denied ? "NOT_CONNECTED" : e instanceof Error ? e.message.slice(0, 120) : "SYNC_FAILED";
    await d.db.query("update finance.stock_settings set dirty=true, sheet_ready=false, last_error=$2, next_sync_at=now()+($3 * interval '1 millisecond') where user_id=$1", [userId, code, gone ? IDLE_MS : RETRY_MS]);
    return { ok: false, action: "failed", error: code };
  }
}

export async function runStocksDue(d: SyncDeps, limit = 4) {
  const out: Record<string, StockOutcome> = {};
  const users = (await d.db.query(`select s.user_id from finance.stock_settings s join finance.google_connections c on c.user_id=s.user_id
    where c.refresh_enc is not null and s.next_sync_at<=now() ${d.test ? "" : "and s.user_id not like 'itest-%'"} order by s.next_sync_at limit $1`, [limit])).rows.map((r) => r.user_id as string);
  for (const u of users) { try { out[u] = await syncStocks(d, u); } catch (e) { console.error("stocks sync", e instanceof Error ? e.message : e); } }
  return out;
}
