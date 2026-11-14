import { Hono } from "hono";
import { Pool } from "pg";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { authServerResolver, type Resolver } from "./auth.js";
import { applySync, loadState, type Tx } from "./sync.js";
import { isEmptyRead, readReceipt, type ReceiptRead } from "./receipt.js";

const DAILY_SCAN_LIMIT = Number(process.env.SCAN_DAILY_LIMIT || 30);
const MAX_IMAGE_BYTES = 3_500_000;

export type Deps = { db: Tx; resolve: Resolver; dir: string; aiKey?: string; read?: (dataUrl: string) => Promise<ReceiptRead> };

export function createApp(d: Deps) {
  const app = new Hono();
  const json = (c: any, body: unknown, status = 200) => c.body(JSON.stringify(body), status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  app.get("/api/finance/health", (c) => json(c, { ok: true }));
  app.use("/api/finance/*", async (c, next) => {
    if (c.req.path === "/api/finance/health") return next();
    const userId = await d.resolve(c.req.header("cookie") || "");
    if (!userId) return json(c, { success: false, error: "UNAUTHORIZED" }, 401);
    c.set("userId" as never, userId as never);
    return next();
  });
  const uid = (c: any) => c.get("userId") as string;

  app.get("/api/finance/state", async (c) => json(c, { success: true, ...(await loadState(d.db, uid(c))) }));

  app.post("/api/finance/sync", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return json(c, { success: false, error: "BAD_REQUEST" }, 400);
    try { return json(c, { success: true, ...(await applySync(d.db, uid(c), body)) }); }
    catch (e) { console.error("sync failed", e instanceof Error ? e.message : e); return json(c, { success: false, error: "SYNC_FAILED" }, 500); }
  });

  app.post("/api/finance/receipts/scan", async (c) => {
    const body = await c.req.json().catch(() => null) as { image?: unknown; id?: unknown } | null;
    const image = typeof body?.image === "string" ? body.image : "";
    const m = image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return json(c, { success: false, error: "BAD_IMAGE" }, 400);
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > MAX_IMAGE_BYTES) return json(c, { success: false, error: "IMAGE_TOO_LARGE" }, 413);
    const reader = d.read ?? (d.aiKey ? (u: string) => readReceipt(u, { key: d.aiKey! }) : null);
    if (!reader) return json(c, { success: false, error: "SCAN_UNAVAILABLE" }, 503);
    const userId = uid(c);
    const used = await d.db.query("insert into finance.scan_usage(user_id,scans) values($1,1) on conflict(user_id,day) do update set scans=finance.scan_usage.scans+1 returning scans", [userId]);
    if (Number(used.rows[0].scans) > DAILY_SCAN_LIMIT) return json(c, { success: false, error: "DAILY_LIMIT", limit: DAILY_SCAN_LIMIT }, 429);
    let read: ReceiptRead;
    try { read = await reader(image); } catch (e) {
      await d.db.query("update finance.scan_usage set scans=greatest(scans-1,0) where user_id=$1 and day=current_date", [userId]);
      console.error("scan failed", e instanceof Error ? e.message : e);
      return json(c, { success: false, error: "SCAN_FAILED" }, 502);
    }
    if (isEmptyRead(read)) {
      await d.db.query("update finance.scan_usage set scans=greatest(scans-1,0) where user_id=$1 and day=current_date", [userId]);
      return json(c, { success: false, error: "NOT_A_RECEIPT" }, 422);
    }
    const id = typeof body?.id === "string" && /^[\w-]{8,64}$/.test(body.id) ? body.id : crypto.randomUUID();
    const rel = join(userId.replace(/[^\w-]/g, "_"), `${id}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
    await mkdir(join(d.dir, rel, ".."), { recursive: true });
    await writeFile(join(d.dir, rel), bytes);
    await d.db.query(`insert into finance.receipts(user_id,id,merchant,purchased_at,total,tax,confidence,items,model,image_path,image_bytes) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
      on conflict(user_id,id) do update set merchant=excluded.merchant,purchased_at=excluded.purchased_at,total=excluded.total,tax=excluded.tax,confidence=excluded.confidence,items=excluded.items,model=excluded.model,image_path=excluded.image_path,image_bytes=excluded.image_bytes`,
      [userId, id, read.merchant, read.purchasedAt, read.total, read.tax, read.confidence, JSON.stringify(read.items), read.model, rel, bytes.length]);
    return json(c, { success: true, receipt: { id, ...read } });
  });

  app.get("/api/finance/receipts/:id/image", async (c) => {
    const r = await d.db.query("select image_path from finance.receipts where user_id=$1 and id=$2", [uid(c), c.req.param("id")]);
    const rel = r.rows[0]?.image_path as string | undefined;
    if (!rel) return json(c, { success: false, error: "NOT_FOUND" }, 404);
    const file = await readFile(join(d.dir, rel)).catch(() => null);
    if (!file) return json(c, { success: false, error: "NOT_FOUND" }, 404);
    return new Response(file, { headers: { "Content-Type": rel.endsWith(".png") ? "image/png" : rel.endsWith(".webp") ? "image/webp" : "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  });

  app.delete("/api/finance/receipts/:id", async (c) => {
    const r = await d.db.query("delete from finance.receipts where user_id=$1 and id=$2 returning image_path", [uid(c), c.req.param("id")]);
    const rel = r.rows[0]?.image_path as string | undefined;
    if (rel) await unlink(join(d.dir, rel)).catch(() => {});
    return json(c, { success: true });
  });
  return app;
}

export function poolTx(pool: Pool): Tx {
  return {
    query: (t, p) => pool.query(t, p as any[]),
    tx: async (fn) => {
      const client = await pool.connect();
      try { await client.query("begin"); const out = await fn({ query: (t, p) => client.query(t, p as any[]) }); await client.query("commit"); return out; }
      catch (e) { await client.query("rollback").catch(() => {}); throw e; } finally { client.release(); }
    },
  };
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, max: 5, ssl: process.env.PGSSL === "off" ? undefined : { rejectUnauthorized: false } });
  const app = createApp({ db: poolTx(pool), resolve: authServerResolver(), dir: process.env.RECEIPTS_DIR || "/var/lib/djiwapay-api/receipts", aiKey: process.env.HELIPOD_AI_KEY });
  const port = Number(process.env.PORT || 3011);
  Bun.serve({ port, hostname: "127.0.0.1", fetch: app.fetch, maxRequestBodySize: 8 * 1024 * 1024 });
  console.log(`djiwapay-api listening on 127.0.0.1:${port}`);
}
