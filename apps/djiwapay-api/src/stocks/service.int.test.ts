// Real Postgres + an in-memory Sheets. Isolated user id, cleaned up. Skipped without DATABASE_URL.
import { afterAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";
import { poolTx } from "../db";
import { finishConnect, googleConfig, startConnect } from "../google";
import { fakeSheets } from "./fake-sheets";
import { PORTO, SAHAM } from "./sheet";
import { registerStockRoutes, runStocksDue, stockState, syncStocks } from "./service";
import { toSerial } from "../sheets/model";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const user = `itest-st-${crypto.randomUUID().slice(0, 8)}`;
const pool = url ? new Pool({ connectionString: url, max: 2, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } }) : (null as unknown as Pool);
const db = pool ? poolTx(pool) : (null as never);
const cfg = googleConfig({ GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", GOOGLE_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64") })!;
const sheetsFake = fakeSheets({ BBCA: [9725, toSerial("2026-11-19T02:41:00Z")] });
const f = ((u: string, i: RequestInit) => (String(u).includes("/token") ? Promise.resolve(new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }))) : sheetsFake.f(u, i))) as unknown as typeof fetch;
const json = (c: any, body: unknown, status = 200) => c.body(JSON.stringify(body), status, { "Content-Type": "application/json" });
let connected = true;
const app = new Hono();
registerStockRoutes(app, { db }, () => user, json, { driveConnected: async () => connected });
const call = async (method: string, path: string, body?: unknown) => { const r = await app.request(`/api/finance/stocks${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: (await r.json()) as any }; };
const deps = () => ({ test: true, db, cfg, f, dir: "/tmp" });
const due = () => pool.query("update finance.stock_settings set next_sync_at=now() where user_id=$1", [user]);
const buy = (ticker: string, lots: number, price: number, extra: Record<string, unknown> = {}) => call("POST", "/trades", { ticker, side: "buy", lots, price, ...extra });

afterAll(async () => {
  if (!pool) return;
  for (const t of ["stock_trades", "stock_prices", "stock_settings", "google_connections", "google_sheet_exports"]) await pool.query(`delete from finance.${t} where user_id=$1`, [user]);
  await pool.end();
});

run("stock tracker (real database, in-memory Sheets)", () => {
  test("nothing works before activation, and a user with no activation has an empty state", async () => {
    expect((await buy("BBCA", 1, 100)).body).toMatchObject({ success: false, error: "NOT_ACTIVATED" });
    expect((await call("GET", "")).body).toMatchObject({ success: true, activated: false, trades: [], holdings: [] });
    expect((await stockState(db, user)).activated).toBe(false);
  });

  test("activation queues the workbook; the pass waits for it, then adds the tabs", async () => {
    const state = new URL(await startConnect(db, cfg, user, ["drive"])).searchParams.get("state")!;
    await finishConnect(db, cfg, "code", state, ((u: string) => String(u).includes("/token") ? Promise.resolve(new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "https://www.googleapis.com/auth/drive.file" }))) : Promise.resolve(new Response(JSON.stringify({ email: "x@y.z" })))) as unknown as typeof fetch);
    const a = await call("POST", "/activate");
    expect(a.body).toMatchObject({ success: true, activated: true, drive: true, fees: { buy: 0.15, sell: 0.35 } });
    expect(a.body.sheet).toMatchObject({ ready: false, pending: true });
    expect((await pool.query("select status from finance.google_sheet_exports where user_id=$1", [user])).rows[0].status).toBe("pending");
    expect(await syncStocks(deps(), user)).toMatchObject({ action: "waiting" });                      // workbook not built yet
    await pool.query("update finance.google_sheet_exports set spreadsheet_id='S1', spreadsheet_url='https://docs.google.com/spreadsheets/d/S1', status='synced' where user_id=$1", [user]);
    await due();
    expect(await syncStocks(deps(), user)).toMatchObject({ ok: true, action: "synced" });
    expect([...sheetsFake.tabs.keys()].sort()).toEqual([PORTO, SAHAM].sort());
    expect((await call("GET", "")).body.sheet).toMatchObject({ ready: true, url: "https://docs.google.com/spreadsheets/d/S1", error: null });
  });

  test("trades: fee from the user's settings, ledger rules, and the sheet follows", async () => {
    const r = await buy("bbca", 10, 9200, { at: "2026-08-04T03:00:00Z" });
    expect(r.status).toBe(201);
    expect(r.body.trades[0]).toMatchObject({ ticker: "BBCA", lots: 10, price: 9200, fee: 13800 });   // 0.15% of Rp9.200.000
    await buy("BBCA", 10, 9700, { at: "2026-10-02T03:00:00Z" });
    const oversell = await call("POST", "/trades", { ticker: "BBCA", side: "sell", lots: 21, price: 9900 });
    expect(oversell).toMatchObject({ status: 422, body: { error: "OVERSELL" } });
    expect((await call("POST", "/trades", { ticker: "BB", side: "buy", lots: 1, price: 1 })).status).toBe(400);
    const sell = await call("POST", "/trades", { ticker: "BBCA", side: "sell", lots: 5, price: 10000, at: "2026-11-01T03:00:00Z" });
    expect(sell.body.holdings[0]).toMatchObject({ ticker: "BBCA", lots: 15, avg: 9450, realized: 275000 });
    expect(sell.body.sheet.pending).toBe(true);
    // A buy that a later sale depends on cannot be deleted; an independent one can.
    await call("POST", "/trades", { ticker: "TLKM", side: "buy", lots: 5, price: 3400, at: "2026-09-01T03:00:00Z" });
    const tl = await call("POST", "/trades", { ticker: "TLKM", side: "sell", lots: 5, price: 3500, at: "2026-09-02T03:00:00Z" });
    const tlBuy = tl.body.trades.find((t: any) => t.ticker === "TLKM" && t.side === "buy").id;
    expect((await call("DELETE", `/trades/${tlBuy}`)).body).toMatchObject({ success: false, error: "WOULD_OVERSELL" });
    expect((await call("DELETE", "/trades/st-nope")).status).toBe(404);
    const first = sell.body.trades.find((t: any) => t.price === 9200).id;
    const del = await call("DELETE", `/trades/${first}`);
    expect(del.body.holdings.find((h: any) => h.ticker === "BBCA")).toMatchObject({ lots: 5, avg: 9700, realized: 150000 });
  });

  test("the pass writes trades and formulas, reads prices back, and keeps the last price when Google says #N/A", async () => {
    await buy("GOTO", 200, 64);
    await due();
    expect(await syncStocks(deps(), user)).toMatchObject({ ok: true });
    const tickers = [2, 3, 4, 5, 6].map((r) => sheetsFake.cells.get(`${SAHAM}!C${r}`));
    expect(tickers).toEqual(expect.arrayContaining(["BBCA", "GOTO", "TLKM"])); expect(sheetsFake.cells.has(`${SAHAM}!C7`)).toBe(false);
    expect(String(sheetsFake.cells.get(`${PORTO}!D2`))).toStartWith("=GOOGLEFINANCE");
    let s = (await call("GET", "")).body;
    expect(s.prices.BBCA).toMatchObject({ price: 9725, asOf: "2026-11-19T02:41:00.000Z" });
    expect(s.prices.GOTO).toMatchObject({ price: null });
    expect(s.sheet.pending).toBe(false);
    // Google later has no data for BBCA: the cached price stays.
    sheetsFake.prices.BBCA = ["#N/A", ""];
    await due(); await syncStocks(deps(), user);
    s = (await call("GET", "")).body;
    expect(s.prices.BBCA.price).toBe(9725);
  });

  test("manual price, fees and refresh", async () => {
    expect((await call("PUT", "/prices/manual", { ticker: "GOTO", price: 58 })).body.prices.GOTO.manual).toBe(58);
    expect((await call("PUT", "/prices/manual", { ticker: "GOTO", price: null })).body.prices.GOTO.manual).toBeNull();
    expect((await call("PUT", "/prices/manual", { ticker: "go", price: 5 })).status).toBe(400);
    expect((await call("PUT", "/settings", { buy: 0.15, sell: 0.25 })).body.fees).toEqual({ buy: 0.15, sell: 0.25 });
    expect((await call("PUT", "/settings", { buy: 0.15, sell: 12 })).status).toBe(400);
    const r1 = await call("POST", "/refresh");                                   // the last pass was seconds ago: throttled
    expect(r1.body).toMatchObject({ success: true, queued: false });
    await pool.query("update finance.stock_settings set last_synced_at=now() - interval '2 minutes' where user_id=$1", [user]);
    expect((await call("POST", "/refresh")).body.queued).toBe(true);
    expect(await runStocksDue(deps())).toHaveProperty(user);                      // the worker picks it up
  });

  test("a deleted spreadsheet is reported, not retried every tick", async () => {
    sheetsFake.failNext(1);
    await buy("ASII", 1, 5100);
    await due();
    expect(await syncStocks(deps(), user)).toMatchObject({ ok: false, error: "SHEET_MISSING" });
    const s = (await call("GET", "")).body;
    expect(s.sheet).toMatchObject({ ready: false, error: "SHEET_MISSING" });
    const next = (await pool.query("select next_sync_at > now() + interval '30 minutes' as later from finance.stock_settings where user_id=$1", [user])).rows[0].later;
    expect(next).toBe(true);
  });

  test("without a Google connection the trades still save, and the state says so", async () => {
    connected = false;
    const s = (await call("GET", "")).body;
    expect(s).toMatchObject({ drive: false, activated: true });
    expect(s.trades.length).toBeGreaterThan(0);
  });
});
