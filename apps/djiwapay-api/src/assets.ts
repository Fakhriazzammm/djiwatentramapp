import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import type { Tx } from "./sync.js";

const OZ_GRAMS = 31.1035;
const DAILY_STICKER_LIMIT = Number(process.env.STICKER_DAILY_LIMIT || 20);
const MAX_IMAGE_BYTES = 6_000_000;
const IMAGE_MODEL = process.env.STICKER_MODEL || "seedream-image-v5.0-flash";
const KEY_PROMPT = "Keep the exact same object from the reference photo, unchanged in shape, color, engraving and texture. Remove everything else. Place the object centered on a perfectly flat solid pure magenta background (#FF00FF), filling about 70% of the frame, soft even lighting, no shadow, no reflection, no text, no props, no hands.";

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- gold reference price (IDR per gram, 24K) ---------------- */
export type GoldPoint = [string, number];
const yahoo = async (f: Fetch, symbol: string, range: string): Promise<Map<string, number>> => {
  const res = await f(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`PRICE_${res.status}`);
  const r = ((await res.json()) as any)?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [], close: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const out = new Map<string, number>();
  ts.forEach((t, i) => { const v = close[i]; if (typeof v === "number" && v > 0) out.set(new Date(t * 1000).toISOString().slice(0, 10), v); });
  return out;
};
/** Combine world gold (USD/oz) and USD/IDR into IDR per gram. Days without a rate reuse the last known one. */
export function goldPerGram(gold: Map<string, number>, idr: Map<string, number>): GoldPoint[] {
  const days = [...gold.keys()].sort(); const out: GoldPoint[] = []; let rate = 0;
  const rateDays = [...idr.keys()].sort(); let ri = 0;
  for (const day of days) {
    while (ri < rateDays.length && rateDays[ri] <= day) rate = idr.get(rateDays[ri++])!;
    if (!rate && rateDays.length) rate = idr.get(rateDays[0])!;
    if (rate) out.push([day, Math.round((gold.get(day)! * rate) / OZ_GRAMS)]);
  }
  return out;
}
let lastAttempt = 0;
export async function goldHistory(db: Tx, f: Fetch = fetch, now = Date.now()): Promise<GoldPoint[]> {
  const stored = async () => (await db.query("select to_char(day,'YYYY-MM-DD') as day, price from finance.market_prices where code='gold' order by day", [])).rows.map((r) => [r.day as string, Number(r.price)] as GoldPoint);
  let rows = await stored();
  const today = new Date(now).toISOString().slice(0, 10);
  if ((rows.length === 0 || rows[rows.length - 1][0] < today) && now - lastAttempt > 30 * 60_000) {
    lastAttempt = now;
    try {
      const range = rows.length < 30 ? "5y" : "1mo";
      const [g, i] = await Promise.all([yahoo(f, "GC=F", range), yahoo(f, "IDR=X", range)]);
      const pts = goldPerGram(g, i);
      if (pts.length) {
        await db.query("insert into finance.market_prices(code,day,price) select 'gold',x.day::date,x.price from jsonb_to_recordset($1::jsonb) as x(day text,price numeric) on conflict(code,day) do update set price=excluded.price", [JSON.stringify(pts.map(([day, price]) => ({ day, price })))]);
        rows = await stored();
      }
    } catch (e) { console.error("gold price refresh failed", e instanceof Error ? e.message : e); }
  }
  return rows;
}

/* ---------------- sticker pipeline ---------------- */
const secretOf = (key?: string) => createHmac("sha256", key || "djiwapay-dev").update("asset-ref").digest();
const b64u = (b: Buffer) => b.toString("base64url");
export function signRef(userId: string, id: string, exp: number, key?: string) {
  const body = b64u(Buffer.from(JSON.stringify({ u: userId, i: id, e: exp })));
  return `${body}.${b64u(createHmac("sha256", secretOf(key)).update(body).digest())}`;
}
export function verifyRef(token: string, now = Date.now(), key?: string): { u: string; i: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secretOf(key)).update(body).digest(), got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.e > now ? { u: String(p.u), i: String(p.i) } : null; } catch { return null; }
}
const parseImage = (image: unknown) => {
  const m = typeof image === "string" ? image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m) return null;
  const bytes = Buffer.from(m[2], "base64");
  return bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES ? { ext: m[1] === "jpeg" ? "jpg" : m[1], bytes } : null;
};
const mimeOf = (path: string) => (path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg");

/** Ask the image model to isolate the object on a flat key colour; the device then removes that colour. */
export async function isolateOnKeyColour(refUrl: string, opts: { key: string; f?: Fetch; base?: string }): Promise<Buffer> {
  const f = opts.f ?? fetch, base = opts.base ?? "https://ai.helipod.io/v1", headers = { "Content-Type": "application/json", Authorization: `Bearer ${opts.key}` };
  let res = await f(`${base}/images/generations`, { method: "POST", headers, signal: AbortSignal.timeout(95_000), body: JSON.stringify({ model: IMAGE_MODEL, prompt: KEY_PROMPT, images: [refUrl], size: "2048x2048", n: 1, response_format: "url" }) });
  let body: any = await res.json().catch(() => null);
  for (let i = 0; i < 30 && res.status === 202 && body?.id; i++) {
    await sleep(2000);
    res = await f(`${base}/images/generations/${encodeURIComponent(body.id)}`, { headers, signal: AbortSignal.timeout(20_000) });
    body = await res.json().catch(() => null);
    if (body?.status === "running" || body?.status === "pending" || body?.status === "queued") res = new Response(null, { status: 202 });
  }
  if (!res.ok && res.status !== 202) throw new Error(`AI_${res.status} ${JSON.stringify(body?.error ?? body).slice(0, 200)}`);
  const url = body?.data?.[0]?.url ?? body?.images?.[0]?.url ?? body?.url;
  if (typeof url !== "string") throw new Error("AI_NO_IMAGE");
  const img = await f(url, { signal: AbortSignal.timeout(30_000) });
  if (!img.ok) throw new Error(`AI_DOWNLOAD_${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

export type AssetDeps = { db: Tx; dir: string; aiKey?: string; publicBase?: string; fetchImpl?: Fetch };
export function registerAssetRoutes(app: Hono, d: AssetDeps, uid: (c: any) => string, json: (c: any, body: unknown, status?: number) => Response) {
  const root = join(d.dir, "assets");
  const publicBase = (d.publicBase || process.env.PUBLIC_BASE_URL || "https://djiwapay.web.id").replace(/\/$/, "");
  const own = async (userId: string, id: string) => (await d.db.query("select raw_path,final_path from finance.asset_stickers where user_id=$1 and id=$2", [userId, id])).rows[0] as { raw_path: string | null; final_path: string | null } | undefined;
  const send = async (path: string | null | undefined) => {
    const bytes = path ? await readFile(join(root, path)).catch(() => null) : null;
    return bytes ? new Response(bytes, { headers: { "Content-Type": mimeOf(path!), "Cache-Control": "private, max-age=86400" } }) : null;
  };

  app.get("/api/finance/prices/gold", async (c) => {
    const points = await goldHistory(d.db, d.fetchImpl);
    return json(c, { success: true, unit: "IDR per gram, emas 24K", source: "Harga emas dunia (COMEX) dikali kurs USD/IDR. Acuan pergerakan, bukan harga toko.", asOf: points.length ? points[points.length - 1][0] : null, points });
  });

  app.post("/api/finance/assets/stickers", async (c) => {
    const userId = uid(c);
    const body = await c.req.json().catch(() => null) as { image?: unknown } | null;
    const img = parseImage(body?.image);
    if (!img) return json(c, { success: false, error: "BAD_IMAGE" }, 400);
    const used = await d.db.query("select count(*)::int as n from finance.asset_stickers where user_id=$1 and created_at > now() - interval '1 day'", [userId]);
    if (Number(used.rows[0].n) >= DAILY_STICKER_LIMIT) return json(c, { success: false, error: "DAILY_LIMIT" }, 429);
    const id = randomUUID(), dir = join(root, userId.replace(/[^A-Za-z0-9_-]/g, "_"));
    await mkdir(dir, { recursive: true });
    const orig = `${userId.replace(/[^A-Za-z0-9_-]/g, "_")}/${id}.orig.${img.ext}`;
    await writeFile(join(root, orig), img.bytes);
    await d.db.query("insert into finance.asset_stickers(user_id,id,raw_path,source) values($1,$2,$3,'local')", [userId, id, orig]);
    let source = "local";
    if (d.aiKey) {
      try {
        const url = `${publicBase}/api/finance/assets/ref/${signRef(userId, id, Date.now() + 10 * 60_000, d.aiKey)}`;
        const out = await isolateOnKeyColour(url, { key: d.aiKey, f: d.fetchImpl });
        const ai = `${userId.replace(/[^A-Za-z0-9_-]/g, "_")}/${id}.ai.png`;
        await writeFile(join(root, ai), out);
        await d.db.query("update finance.asset_stickers set raw_path=$3, source='ai' where user_id=$1 and id=$2", [userId, id, ai]); source = "ai";
      } catch (e) { console.error("sticker AI failed", e instanceof Error ? e.message : e); }
    }
    return json(c, { success: true, id, mode: source });
  });
  // Public, signed, short-lived: lets the image model fetch the photo it is asked to isolate.
  app.get("/api/finance/assets/ref/:token", async (c) => {
    const v = verifyRef(c.req.param("token"), Date.now(), d.aiKey);
    const row = v ? await own(v.u, v.i) : undefined;
    const res = row ? await send(row.raw_path) : null;
    return res ?? c.body("not found", 404);
  });
  app.get("/api/finance/assets/stickers/:id/raw", async (c) => {
    const row = await own(uid(c), c.req.param("id"));
    return (await send(row?.raw_path)) ?? json(c, { success: false, error: "NOT_FOUND" }, 404);
  });
  app.get("/api/finance/assets/stickers/:id", async (c) => {
    const row = await own(uid(c), c.req.param("id"));
    return (await send(row?.final_path)) ?? json(c, { success: false, error: "NOT_FOUND" }, 404);
  });
  app.post("/api/finance/assets/stickers/:id/final", async (c) => {
    const userId = uid(c), id = c.req.param("id");
    if (!(await own(userId, id))) return json(c, { success: false, error: "NOT_FOUND" }, 404);
    const body = await c.req.json().catch(() => null) as { image?: unknown } | null;
    const m = typeof body?.image === "string" ? body.image.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/) : null;
    const bytes = m ? Buffer.from(m[1], "base64") : null;
    if (!bytes || bytes.length === 0 || bytes.length > 3_000_000) return json(c, { success: false, error: "BAD_IMAGE" }, 400);
    const rel = `${userId.replace(/[^A-Za-z0-9_-]/g, "_")}/${id}.sticker.png`;
    await writeFile(join(root, rel), bytes);
    await d.db.query("update finance.asset_stickers set final_path=$3 where user_id=$1 and id=$2", [userId, id, rel]);
    return json(c, { success: true, id });
  });
}
