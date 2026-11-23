import type { Hono } from "hono";
import type { Q } from "./sync.js";

/** Kind and label of each payee, per account. Last writer wins per payee: a change older than what the server holds is ignored. */
export type MetaItem = { key: string; kind: "orang" | "toko" | "layanan" | null; label: string | null; at: number };
const KINDS = new Set(["orang", "toko", "layanan"]);
const KEY = /^[a-z0-9 ]{1,60}$/;

export function cleanMeta(raw: unknown, now = Date.now()): MetaItem[] {
  return (Array.isArray(raw) ? raw.slice(0, 400) : []).flatMap((r: any) => {
    const key = typeof r?.key === "string" ? r.key.toLowerCase().trim() : "";
    if (!KEY.test(key)) return [];
    const at = Number(r?.at);
    return [{ key, kind: KINDS.has(r?.kind) ? r.kind : null, label: typeof r?.label === "string" && r.label.trim() ? r.label.trim().slice(0, 20) : null, at: Number.isFinite(at) && at > 1_500_000_000_000 ? Math.min(at, now + 60_000) : now } as MetaItem];
  });
}

export async function listMeta(db: Q, userId: string): Promise<MetaItem[]> {
  const rows = (await db.query("select key, kind, label, (extract(epoch from at) * 1000)::bigint at from finance.payee_meta where user_id=$1 order by key", [userId])).rows;
  return rows.map((r) => ({ key: String(r.key), kind: r.kind ?? null, label: r.label ?? null, at: Number(r.at) }));
}

/** Merges what a device sends; returns the whole record so the device can take what is newer than its own. */
export async function mergeMeta(db: Q, userId: string, items: MetaItem[]): Promise<MetaItem[]> {
  for (const m of items) {
    await db.query(`insert into finance.payee_meta(user_id,key,kind,label,at) values($1,$2,$3,$4,to_timestamp($5/1000.0))
      on conflict(user_id,key) do update set kind=excluded.kind, label=excluded.label, at=excluded.at where finance.payee_meta.at < excluded.at`, [userId, m.key, m.kind, m.label, m.at]);
  }
  if (items.length) {   // the spreadsheet export lists these, so it needs a new pass
    await db.query("insert into finance.profiles(user_id) values($1) on conflict do nothing", [userId]);
    await db.query("update finance.profiles set version=version+1, updated_at=now() where user_id=$1", [userId]);
    await db.query("update finance.google_sheet_exports set dirty=true, next_sync_at=least(next_sync_at, now()+interval '8 seconds') where user_id=$1", [userId]);
  }
  return listMeta(db, userId);
}

export function registerPayeeMetaRoutes(app: Hono, d: { db: Q }, uid: (c: any) => string, json: (c: any, body: unknown, status?: number) => Response) {
  app.get("/api/finance/payee-meta", async (c) => json(c, { success: true, items: await listMeta(d.db, uid(c)) }));
  app.post("/api/finance/payee-meta", async (c) => {
    const b = await c.req.json().catch(() => null) as { items?: unknown } | null;
    return json(c, { success: true, items: await mergeMeta(d.db, uid(c), cleanMeta(b?.items)) });
  });
}
