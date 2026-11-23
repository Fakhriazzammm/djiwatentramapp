import type { Hono } from "hono";
import { listMeta, mergeMeta, cleanMeta } from "./payee-meta.js";
import { applySync, loadState, type Tx } from "./sync.js";

/**
 * A complete copy of one person's finance data in one file, and the way back in.
 * The file holds everything the app keeps for them (records, wallets, categories, budgets, goals, debts, bills, loans, assets, pockets, edits to Djiwa Pay payments)
 * plus what they taught the app (merchant rules, payee kinds and labels, sorting answers) and their stock trades. It holds no password, token or e-mail address.
 * Restoring ADDS what is missing and never overwrites or deletes what is already there, so it is safe to run on a live account or on a new one.
 */
export const BACKUP_FORMAT = 1;
const TABLES = ["accounts", "categories", "entries", "budgets", "goals", "debts", "loans", "bills", "assets"] as const;
const KEY: Record<(typeof TABLES)[number], string> = { accounts: "id", categories: "id", entries: "id", budgets: "categoryId", goals: "id", debts: "id", loans: "id", bills: "id", assets: "id" };

export async function buildBackup(db: Tx, userId: string, now = new Date()) {
  const st = await loadState(db, userId);
  const [rules, decisions, trades] = await Promise.all([
    db.query("select pattern, category_id, uses from finance.merchant_rules where user_id=$1 order by pattern", [userId]),
    db.query("select key, status, until from finance.discovery_decisions where user_id=$1 and key not like 'seen:%' order by key", [userId]).catch(() => ({ rows: [] })),
    db.query("select id, ticker, side, lots, price, fee, at, note from finance.stock_trades where user_id=$1 order by at", [userId]).catch(() => ({ rows: [] })),
  ]);
  const state = st.state as Record<string, unknown> & { entries: unknown[] };
  const extras = {
    merchantRules: rules.rows.map((r) => ({ pattern: r.pattern, categoryId: r.category_id, uses: Number(r.uses) })),
    payeeMeta: await listMeta(db, userId),
    decisions: decisions.rows.map((r) => ({ key: r.key, status: r.status, until: r.until ? new Date(r.until).toISOString() : null })),
    stockTrades: trades.rows.map((r) => ({ id: r.id, ticker: r.ticker, side: r.side, lots: Number(r.lots), price: Number(r.price), fee: Number(r.fee), at: new Date(r.at).toISOString(), note: r.note })),
  };
  const count = (k: string) => (Array.isArray(state[k]) ? (state[k] as unknown[]).length : 0);
  return {
    app: "djiwa-pay", format: BACKUP_FORMAT, exportedAt: now.toISOString(),
    summary: { ...Object.fromEntries(TABLES.map((t) => [t, count(t)])), merchantRules: extras.merchantRules.length, payeeMeta: extras.payeeMeta.filter((m) => m.kind || m.label).length, stockTrades: extras.stockTrades.length },
    state, extras,
  };
}

export type RestoreResult = { added: Record<string, number>; skipped: Record<string, number> };
export function checkBackup(body: any): string | null {
  if (!body || body.app !== "djiwa-pay") return "NOT_A_BACKUP";
  if (body.format !== BACKUP_FORMAT) return "FORMAT_UNSUPPORTED";
  if (!body.state || typeof body.state !== "object") return "NO_STATE";
  return null;
}

export async function restoreBackup(db: Tx, userId: string, body: any): Promise<RestoreResult> {
  const bad = checkBackup(body); if (bad) throw Object.assign(new Error(bad), { code: bad });
  const have = (await loadState(db, userId)), cur = have.state as unknown as Record<string, any[]>;
  const added: Record<string, number> = {}, skipped: Record<string, number> = {}, upserts: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const known = new Set((cur[t] ?? []).map((x: any) => String(x[KEY[t]]))), incoming: any[] = Array.isArray(body.state[t]) ? body.state[t].slice(0, 50_000) : [];
    let fresh = incoming.filter((x) => x && !known.has(String(x[KEY[t]])));
    if (t === "entries") fresh = fresh.map((e) => { const { receiptId, inboundId, ...rest } = e; void receiptId; void inboundId; return rest; });   // the receipt and mail they pointed to belong to the account they came from
    if (t === "loans") fresh = fresh.map((l) => ({ ...l, mailRevision: 0 }));
    upserts[t] = fresh; added[t] = fresh.length; skipped[t] = incoming.length - fresh.length;
  }
  const profile: { onboarded: boolean; overrides?: unknown; pockets?: unknown } = { onboarded: true };
  if (!Object.keys((have.state as any).overrides ?? {}).length && body.state.overrides && typeof body.state.overrides === "object") profile.overrides = body.state.overrides;
  if (!((have.state as any).pockets ?? []).length && Array.isArray(body.state.pockets)) profile.pockets = body.state.pockets;
  if (Object.values(added).some((n) => n > 0) || profile.overrides || profile.pockets) await applySync(db, userId, { upserts, profile });

  const ex = body.extras ?? {};
  const rules = (Array.isArray(ex.merchantRules) ? ex.merchantRules : []).filter((r: any) => typeof r?.pattern === "string" && typeof r?.categoryId === "string").slice(0, 5000);
  for (const r of rules) await db.query("insert into finance.merchant_rules(user_id,pattern,category_id,uses) values($1,$2,$3,$4) on conflict(user_id,pattern) do nothing", [userId, String(r.pattern).slice(0, 120), String(r.categoryId).slice(0, 80), Math.max(1, Number(r.uses) || 1)]);
  added.merchantRules = rules.length;
  added.payeeMeta = (await mergeMeta(db, userId, cleanMeta(ex.payeeMeta))).length;
  const trades = (Array.isArray(ex.stockTrades) ? ex.stockTrades : []).filter((r: any) => /^[A-Z]{4}$/.test(String(r?.ticker)) && (r?.side === "buy" || r?.side === "sell") && Number(r?.lots) > 0 && Number(r?.price) > 0 && Date.parse(r?.at)).slice(0, 20_000);
  for (const r of trades) await db.query("insert into finance.stock_trades(user_id,id,ticker,side,lots,price,fee,at,note) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing", [userId, String(r.id).slice(0, 80), r.ticker, r.side, Math.round(r.lots), r.price, Math.max(0, Number(r.fee) || 0), new Date(r.at).toISOString(), String(r.note ?? "").slice(0, 200)]);
  added.stockTrades = trades.length;
  return { added, skipped };
}

export function registerBackupRoutes(app: Hono, d: { db: Tx }, uid: (c: any) => string, json: (c: any, body: unknown, status?: number) => Response) {
  app.get("/api/finance/backup", async (c) => {
    const b = await buildBackup(d.db, uid(c));
    return new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="djiwa-pay-cadangan-${b.exportedAt.slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
  });
  app.post("/api/finance/restore", async (c) => {
    const body = await c.req.json().catch(() => null);
    const bad = checkBackup(body); if (bad) return json(c, { success: false, error: bad }, 422);
    try { return json(c, { success: true, ...(await restoreBackup(d.db, uid(c), body)) }); }
    catch (e) { console.error("restore", e instanceof Error ? e.message : e); return json(c, { success: false, error: "RESTORE_FAILED" }, 500); }
  });
  /** What a backup file would add, without adding anything. */
  app.post("/api/finance/restore/preview", async (c) => {
    const body = await c.req.json().catch(() => null);
    const bad = checkBackup(body); if (bad) return json(c, { success: false, error: bad }, 422);
    const cur = (await loadState(d.db, uid(c))).state as unknown as Record<string, any[]>, add: Record<string, number> = {}, have: Record<string, number> = {};
    for (const t of TABLES) { const known = new Set((cur[t] ?? []).map((x: any) => String(x[KEY[t]]))), inc: any[] = Array.isArray(body.state[t]) ? body.state[t] : []; add[t] = inc.filter((x) => x && !known.has(String(x[KEY[t]]))).length; have[t] = inc.length; }
    return json(c, { success: true, exportedAt: body.exportedAt ?? null, add, have });
  });
}
