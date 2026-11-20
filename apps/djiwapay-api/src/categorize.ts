/** Automatic categories. Order of trust: what the person taught us (merchant rules), then the model. Cheap by design: short codes, no thinking, one call for a batch. */
import type { Hono } from "hono";
import { extractJson } from "./receipt.js";
import { groupKey, merchantKey, redact } from "./mail/extract.js";
import type { Q, Tx } from "./sync.js";

/** Measured on 12 real transactions: 1.8 s and about Rp 0.1 per transaction with thinking off (20 s with it on). */
export const CATEGORIZE_MODEL = "qwen3.7-flash";
export const CATEGORIZE_FALLBACK = "gemini-3-1-flash-lite";
export const MIN_CONFIDENCE = 0.8;
export const MAX_ITEMS = 20;
export const DEFAULT_DAILY_CALLS = 30;
/** A confident answer is reused for a long time; an unsure one only briefly, so a shop is not asked about again and again but can be retried later. */
export const CACHE_SURE_DAYS = 90;
export const CACHE_UNSURE_DAYS = 7;

export type CatDef = { id: string; name: string; income: boolean; parentId?: string | null };
export type Item = { key: string; text: string; amount?: number; kind: "in" | "out" };
export type Example = { text: string; categoryId: string };
export type Pick = { key: string; categoryId: string | null; confidence: number; source: "rule" | "ai" | "none"; cached?: boolean };

const FALLBACK_CATS: CatDef[] = [["makan", "Makan & minum"], ["transport", "Transportasi"], ["belanja", "Belanja"], ["tagihan", "Tagihan & utilitas"], ["hiburan", "Hiburan"], ["kesehatan", "Kesehatan"], ["pendidikan", "Pendidikan"], ["rumah", "Rumah"], ["lainnya", "Lainnya"]].map(([id, name]) => ({ id, name, income: false })).concat([{ id: "gaji", name: "Gaji", income: true }, { id: "bonus", name: "Bonus & lainnya", income: true }]);

const clean = (t: string) => redact(String(t ?? "")).replace(/\s+/g, " ").trim().slice(0, 120);

/** The category list the model sees, with short codes (c1, c2...) so the prompt stays small. */
export function buildPrompt(cats: CatDef[], examples: Example[]) {
  const usable = cats.filter((c) => c.id !== "transfer");
  const code = new Map<string, string>(), byCode = new Map<string, CatDef>();
  const lines: string[] = [];
  let n = 0;
  for (const income of [false, true]) {
    lines.push(income ? "PEMASUKAN:" : "PENGELUARAN:");
    for (const p of usable.filter((c) => c.income === income && !c.parentId)) {
      const subs = usable.filter((c) => c.parentId === p.id);
      const add = (c: CatDef) => { const k = `c${++n}`; code.set(c.id, k); byCode.set(k, c); return k; };
      lines.push(`${add(p)} = ${p.name}${subs.length ? ": " + subs.map((s) => `${add(s)} = ${s.name}`).join("; ") : ""}`);
    }
  }
  const shots = examples.filter((e) => code.has(e.categoryId)).slice(0, 15).map((e) => `"${clean(e.text).slice(0, 50)}" -> ${code.get(e.categoryId)}`);
  const system = `Kamu mengategorikan transaksi keuangan pribadi di Indonesia. Pilih SATU kategori paling spesifik (sub kategori bila ada) dari daftar. Balas HANYA JSON tanpa teks lain, tanpa markdown: {"results":[{"key":string,"categoryId":kode seperti "c12","confidence":angka 0 sampai 1}]}. Pengeluaran hanya boleh memakai kategori PENGELUARAN dan pemasukan hanya PEMASUKAN. Bila ada contoh_pilihan_pengguna, ikuti kebiasaan itu. Beri confidence paling tinggi 0.5 bila teks hanya berisi nama orang, kata "transfer", atau terlalu umum untuk ditebak; jangan menebak.\n\n${lines.join("\n")}`;
  // The category list is the long, stable part, so it leads and is identical from call to call (the gateway can reuse it from its cache). The person's own examples change, so they ride with the items.
  return { system, byCode, code, shots };
}

/** Accepts {"results":[...]} or a bare array; keeps only known keys, codes of the right kind, and clamps confidence. */
export function parseCategorization(text: string, items: Item[], byCode: Map<string, CatDef>): Map<string, { categoryId: string; confidence: number }> {
  const out = new Map<string, { categoryId: string; confidence: number }>();
  let raw: unknown = null;
  try { raw = extractJson(text); } catch { /* maybe a bare array */ }
  let rows: unknown[] = Array.isArray((raw as { results?: unknown })?.results) ? (raw as { results: unknown[] }).results : [];
  if (!rows.length) { const a = text.indexOf("["), b = text.lastIndexOf("]"); if (a >= 0 && b > a) { try { const arr = JSON.parse(text.slice(a, b + 1)); if (Array.isArray(arr)) rows = arr; } catch { /* nothing usable */ } } }
  const kinds = new Map(items.map((i) => [i.key, i.kind]));
  for (const r of rows as Record<string, unknown>[]) {
    const key = String(r?.key ?? ""), cat = byCode.get(String(r?.categoryId ?? ""));
    if (!kinds.has(key) || !cat || cat.income !== (kinds.get(key) === "in")) continue;
    const c = Number(r.confidence);
    out.set(key, { categoryId: cat.id, confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.5 });
  }
  return out;
}

export type AiOpts = { key: string; base?: string; fetchImpl?: typeof fetch };
async function ask(o: AiOpts, model: string, system: string, items: Item[], shots: string[]): Promise<string> {
  const f = o.fetchImpl ?? fetch, base = o.base ?? "https://ai.helipod.io/v1";
  const user = JSON.stringify({ ...(shots.length ? { contoh_pilihan_pengguna: shots } : {}), items: items.map((i) => ({ key: i.key, text: clean(i.text), ...(i.amount ? { amount: Math.round(i.amount) } : {}), kind: i.kind })) });
  const res = await f(`${base}/chat/completions`, { method: "POST", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.key}` }, body: JSON.stringify({ model, temperature: 0, max_tokens: 1500, ...(model === CATEGORIZE_MODEL ? { enable_thinking: false } : {}), messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
  if (!res.ok) throw new Error(`AI_${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const c = body.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join("") : "";
}
/** One batch to the model; if it fails or answers nothing usable, once more with the fallback model. */
export async function aiCategorize(o: AiOpts, items: Item[], cats: CatDef[], examples: Example[]) {
  const { system, byCode, shots } = buildPrompt(cats, examples);
  for (const model of [CATEGORIZE_MODEL, CATEGORIZE_FALLBACK]) {
    try {
      const got = parseCategorization(await ask(o, model, system, items, shots), items, byCode);
      if (got.size) return got;
    } catch (e) { if (e instanceof Error && (e.message === "AI_401" || e.message === "AI_402")) throw e; }
  }
  return new Map<string, { categoryId: string; confidence: number }>();
}

/* ---------------- per person: categories, examples, rules, quota ---------------- */

export async function loadCats(db: Q, userId: string): Promise<CatDef[]> {
  const rows = (await db.query("select id,name,income,parent_id from finance.categories where user_id=$1 order by id", [userId])).rows;
  return rows.length ? rows.map((r) => ({ id: r.id, name: r.name, income: Boolean(r.income), parentId: r.parent_id })) : FALLBACK_CATS;
}
async function loadExamples(db: Q, userId: string): Promise<Example[]> {
  const rows = (await db.query("select distinct on (lower(note)) note, category_id from (select note, category_id, at from finance.entries where user_id=$1 and kind in ('in','out') and source in ('manual','voice','receipt','sheet') and category_id not in ('lainnya','transfer') and length(note) between 3 and 60 order by at desc limit 120) t order by lower(note), at desc limit 15", [userId])).rows;
  return rows.map((r) => ({ text: r.note, categoryId: r.category_id }));
}
const wibDay = (now: Date) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
/** Takes one call from today's allowance. False once it is used up. */
export async function reserveCall(db: Q, userId: string, limit: number, now = new Date()): Promise<boolean> {
  const r = await db.query("insert into finance.ai_usage(user_id,day,calls) values($1,$2,1) on conflict (user_id,day) do update set calls = finance.ai_usage.calls + 1 where finance.ai_usage.calls < $3 returning calls", [userId, wibDay(now), limit]);
  return r.rows.length > 0;
}
export async function callsToday(db: Q, userId: string, now = new Date()): Promise<number> {
  return Number((await db.query("select calls from finance.ai_usage where user_id=$1 and day=$2", [userId, wibDay(now)])).rows[0]?.calls ?? 0);
}

const cacheKey = (text: string) => merchantKey(clean(text)) || groupKey(clean(text));
const fresh = (confidence: number, ageDays: number) => ageDays <= (confidence >= MIN_CONFIDENCE ? CACHE_SURE_DAYS : CACHE_UNSURE_DAYS);
async function readCache(db: Q, userId: string, items: Item[]) {
  const keys = [...new Set(items.map((i) => cacheKey(i.text)).filter(Boolean))];
  if (!keys.length) return new Map<string, { category_id: string; confidence: number; age: number }>();
  const rows = (await db.query("select key, kind, category_id, confidence, extract(epoch from (now() - updated_at)) / 86400 as age from finance.ai_category_cache where user_id=$1 and key = any($2::text[])", [userId, keys])).rows;
  return new Map(rows.map((r) => [`${r.kind}:${r.key}`, { category_id: r.category_id as string, confidence: Number(r.confidence), age: Number(r.age) }]));
}
async function writeCache(db: Q, userId: string, rows: { text: string; kind: "in" | "out"; categoryId: string; confidence: number }[]) {
  for (const r of rows) { const k = cacheKey(r.text); if (k.length < 3) continue;
    await db.query("insert into finance.ai_category_cache(user_id,key,kind,category_id,confidence) values($1,$2,$3,$4,$5) on conflict (user_id,key,kind) do update set category_id=excluded.category_id, confidence=excluded.confidence, updated_at=now()", [userId, k, r.kind, r.categoryId, r.confidence]); }
  await db.query("delete from finance.ai_category_cache where user_id=$1 and updated_at < now() - interval '120 days'", [userId]);
}

export type CategorizeDeps = { db: Tx; key?: string; fetchImpl?: typeof fetch; limit?: number; now?: Date };
export async function categorizeItems(d: CategorizeDeps, userId: string, input: Item[]): Promise<{ results: Pick[]; ai: boolean; limited: boolean; remaining: number; cached: number }> {
  const limit = d.limit ?? DEFAULT_DAILY_CALLS;
  const items = input.filter((i) => i && String(i.key) && clean(i.text).length >= 2).slice(0, MAX_ITEMS).map((i) => ({ ...i, kind: i.kind === "in" ? "in" as const : "out" as const }));
  const cats = await loadCats(d.db, userId), byId = new Map(cats.map((c) => [c.id, c]));
  const results = new Map<string, Pick>(items.map((i) => [i.key, { key: i.key, categoryId: null, confidence: 0, source: "none" }]));
  // 1. what the person taught us
  for (const i of items) {
    const keys = [...new Set([merchantKey(i.text), groupKey(i.text)].filter(Boolean))];
    if (!keys.length) continue;
    const r = (await d.db.query("select category_id from finance.merchant_rules where user_id=$1 and pattern = any($2::text[]) order by (pattern = $3) desc limit 1", [userId, keys, keys[0]])).rows[0];
    const cat = r ? byId.get(r.category_id) : undefined;
    if (cat && cat.income === (i.kind === "in")) results.set(i.key, { key: i.key, categoryId: cat.id, confidence: 1, source: "rule" });
  }
  // 2. what the model already said about this shop (no call, no allowance)
  const cache = await readCache(d.db, userId, items.filter((i) => results.get(i.key)!.source === "none"));
  let cached = 0;
  for (const i of items) {
    if (results.get(i.key)!.source !== "none") continue;
    const hit = cache.get(`${i.kind}:${cacheKey(i.text)}`), cat = hit ? byId.get(hit.category_id) : undefined;
    if (hit && cat && cat.income === (i.kind === "in") && fresh(hit.confidence, hit.age)) { results.set(i.key, { key: i.key, categoryId: cat.id, confidence: hit.confidence, source: "ai", cached: true }); cached++; }
  }
  if (cached) await d.db.query("update finance.ai_category_cache set hits = hits + 1 where user_id=$1 and key = any($2::text[])", [userId, items.map((i) => cacheKey(i.text)).filter(Boolean)]);
  // 3. the model, only for shops never seen
  const rest = items.filter((i) => results.get(i.key)!.source === "none");
  let ai = false, limited = false;
  if (rest.length && d.key) {
    if (!(await reserveCall(d.db, userId, limit, d.now))) limited = true;
    else {
      ai = true;
      try {
        const got = await aiCategorize({ key: d.key, fetchImpl: d.fetchImpl }, rest, cats, await loadExamples(d.db, userId));
        for (const [k, v] of got) results.set(k, { key: k, categoryId: v.categoryId, confidence: v.confidence, source: "ai" });
        await writeCache(d.db, userId, rest.filter((i) => got.has(i.key)).map((i) => ({ text: i.text, kind: i.kind, categoryId: got.get(i.key)!.categoryId, confidence: got.get(i.key)!.confidence })));
      } catch (e) { console.error("categorize", e instanceof Error ? e.message : e); }
    }
  }
  return { results: items.map((i) => results.get(i.key)!), ai, limited, cached, remaining: Math.max(0, limit - (await callsToday(d.db, userId, d.now))) };
}

/** The person fixed a category: remember it for that shop so the next one needs no model. */
export async function learnRule(db: Q, userId: string, text: string, categoryId: string): Promise<boolean> {
  const cats = await loadCats(db, userId);
  if (!cats.some((c) => c.id === categoryId) || categoryId === "transfer") return false;
  const k = groupKey(clean(text)) || merchantKey(clean(text));
  if (!k || k.length < 3) return false;
  await db.query("insert into finance.merchant_rules(user_id,pattern,category_id,uses) values($1,$2,$3,1) on conflict (user_id,pattern) do update set category_id=excluded.category_id, uses=finance.merchant_rules.uses+1, updated_at=now()", [userId, k, categoryId]);
  return true;
}

/** For the e-mail pipeline: confident picks only, nothing thrown. */
export function makeCategorizer(d: CategorizeDeps) {
  return async (userId: string, items: Item[]): Promise<Map<string, { categoryId: string; confidence: number; source: "rule" | "ai" }>> => {
    const out = new Map<string, { categoryId: string; confidence: number; source: "rule" | "ai" }>();
    try { for (const r of (await categorizeItems(d, userId, items)).results) if (r.categoryId && r.confidence >= MIN_CONFIDENCE && r.source !== "none") out.set(r.key, { categoryId: r.categoryId, confidence: r.confidence, source: r.source }); } catch (e) { console.error("categorize", e instanceof Error ? e.message : e); }
    return out;
  };
}

export function registerCategorizeRoutes(app: Hono, d: CategorizeDeps, uid: (c: any) => string, json: (c: any, body: unknown, status?: number) => Response) {
  app.post("/api/finance/categorize", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { items?: unknown };
    if (!Array.isArray(b.items) || !b.items.length) return json(c, { success: false, error: "INVALID_INPUT" }, 400);
    const items = (b.items as Record<string, unknown>[]).slice(0, MAX_ITEMS).map((i) => ({ key: String(i?.key ?? "").slice(0, 80), text: String(i?.text ?? "").slice(0, 200), amount: Number(i?.amount) || undefined, kind: (i?.kind === "in" ? "in" : "out") as "in" | "out" }));
    try {
      const r = await categorizeItems(d, uid(c), items);
      return json(c, { success: true, minConfidence: MIN_CONFIDENCE, ...r });
    } catch (e) { console.error("categorize route", e instanceof Error ? e.message : e); return json(c, { success: false, error: "CATEGORIZE_FAILED" }, 502); }
  });
  app.post("/api/finance/categorize/learn", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { text?: unknown; categoryId?: unknown };
    const ok = await learnRule(d.db, uid(c), String(b.text ?? ""), String(b.categoryId ?? ""));
    return json(c, { success: true, learned: ok });
  });
}
