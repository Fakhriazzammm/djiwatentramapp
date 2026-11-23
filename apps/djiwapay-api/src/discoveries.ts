import type { Hono } from "hono";

/** "Temuan": suggestions found in the person's records (new wallet from e-mail, recurring bill, price change...).
 *  They are computed in the app from the records; the server keeps only the answer so a suggestion is never asked twice, on any device. */
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const STATUS = new Set(["saved", "dismissed", "snoozed"]);
const KEY = /^[A-Za-z0-9:_.\-|]{3,120}$/;

export async function listDecisions(db: Db, userId: string) {
  const rows = (await db.query("select key,status,until from finance.discovery_decisions where user_id=$1 and (status<>'snoozed' or until > now())", [userId])).rows;
  return rows.map((r) => ({ key: String(r.key), status: String(r.status), until: r.until ? new Date(r.until).toISOString() : null }));
}

export function registerDiscoveryRoutes(app: Hono, d: { db: Db }, uid: (c: any) => string, json: (c: any, body: unknown, status?: number) => Response) {
  app.get("/api/finance/discoveries", async (c) => json(c, { success: true, decisions: await listDecisions(d.db, uid(c)) }));
  app.post("/api/finance/discoveries/decide", async (c) => {
    const b = await c.req.json().catch(() => null) as { keys?: unknown; status?: unknown; days?: unknown } | null;
    const keys = (Array.isArray(b?.keys) ? b!.keys : []).filter((k): k is string => typeof k === "string" && KEY.test(k)).slice(0, 40);
    const status = String(b?.status ?? "");
    if (!keys.length || !STATUS.has(status)) return json(c, { success: false, error: "BAD_REQUEST" }, 400);
    const days = status === "snoozed" ? Math.max(1, Math.min(90, Math.round(Number(b?.days) || 7))) : 0;
    await d.db.query(`insert into finance.discovery_decisions(user_id,key,status,until,decided_at) select $1, k, $3, case when $3='snoozed' then now() + ($4 || ' days')::interval end, now() from unnest($2::text[]) k
      on conflict(user_id,key) do update set status=excluded.status, until=excluded.until, decided_at=now()`, [uid(c), keys, status, String(days)]);
    return json(c, { success: true });
  });
  app.post("/api/finance/discoveries/undo", async (c) => {
    const b = await c.req.json().catch(() => null) as { keys?: unknown } | null;
    const keys = (Array.isArray(b?.keys) ? b!.keys : []).filter((k): k is string => typeof k === "string" && KEY.test(k)).slice(0, 40);
    if (keys.length) await d.db.query("delete from finance.discovery_decisions where user_id=$1 and key = any($2::text[])", [uid(c), keys]);
    return json(c, { success: true });
  });
  /** Merging a mail-made wallet into another: from now on mail for the old one is recorded in the chosen wallet. The app moves the records itself. */
  app.post("/api/finance/discoveries/merge", async (c) => {
    const b = await c.req.json().catch(() => null) as { from?: unknown; to?: unknown } | null;
    const from = typeof b?.from === "string" ? b.from.slice(0, 80) : "", to = typeof b?.to === "string" ? b.to.slice(0, 80) : "";
    if (!from || !to || from === to) return json(c, { success: false, error: "BAD_REQUEST" }, 400);
    const known = (await d.db.query("select id from finance.accounts where user_id=$1 and id = any($2::text[])", [uid(c), [from, to]])).rows.length;
    if (known < 2) return json(c, { success: false, error: "UNKNOWN_ACCOUNT" }, 404);
    // Follow a chain (A -> B, then B -> C) so nothing points at a wallet that is itself merged away.
    await d.db.query("update finance.account_alias set to_id=$3 where user_id=$1 and to_id=$2", [uid(c), from, to]);
    await d.db.query("insert into finance.account_alias(user_id,from_id,to_id) values($1,$2,$3) on conflict(user_id,from_id) do update set to_id=excluded.to_id", [uid(c), from, to]);
    return json(c, { success: true });
  });
  app.post("/api/finance/discoveries/unmerge", async (c) => {
    const b = await c.req.json().catch(() => null) as { from?: unknown } | null;
    if (typeof b?.from === "string") await d.db.query("delete from finance.account_alias where user_id=$1 and from_id=$2", [uid(c), b.from.slice(0, 80)]);
    return json(c, { success: true });
  });
}
