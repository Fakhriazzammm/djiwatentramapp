/** Receipt reading: prompt, tolerant JSON extraction, validation. Pure so it can be tested without the network. */
export const CATEGORY_IDS = ["makan", "transport", "belanja", "tagihan", "hiburan", "kesehatan", "pendidikan", "rumah", "lainnya"] as const;
export type ReceiptItem = { name: string; qty: number; price: number; categoryId: string; confidence: number };
export type ReceiptRead = { merchant: string; purchasedAt: string | null; total: number; tax: number; items: ReceiptItem[]; confidence: number; mismatch: number; model: string };

export const PRIMARY_MODEL = "qwen-vl-ocr";
export const FALLBACK_MODEL = "qwen3-vl-plus";

export const PROMPT = `Kamu membaca foto struk belanja Indonesia. Balas HANYA satu objek JSON, tanpa teks lain, dengan bentuk:
{"merchant":string,"purchasedAt":"YYYY-MM-DDTHH:mm" atau null,"total":angka rupiah,"tax":angka rupiah (0 jika tidak ada),"items":[{"name":string,"qty":angka,"price":total harga baris itu dalam rupiah,"categoryId":salah satu dari ${CATEGORY_IDS.join("|")},"confidence":0..1}],"confidence":0..1}
Aturan: angka tanpa titik/koma ribuan; "price" adalah harga total baris (qty x harga satuan); jangan masukkan baris TUNAI/KEMBALI/DISKON TOTAL sebagai item; jika bukan struk, balas {"merchant":"","total":0,"tax":0,"items":[],"confidence":0}.`;

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const cleaned = v.replace(/[^\d,.-]/g, "");
  const normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/[.,](?=\d{3}\b)/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};
const clamp01 = (v: unknown, fallback = 0.5) => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback; };

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf("{"), end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("NO_JSON");
  return JSON.parse(fenced.slice(start, end + 1));
}

export function parseReceipt(text: string, model: string, now = new Date()): ReceiptRead {
  const raw = extractJson(text) as Record<string, unknown>;
  const items: ReceiptItem[] = (Array.isArray(raw.items) ? raw.items : []).slice(0, 80).map((it) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const id = typeof o.categoryId === "string" && (CATEGORY_IDS as readonly string[]).includes(o.categoryId) ? o.categoryId : "belanja";
    return { name: String(o.name ?? "").trim().slice(0, 80), qty: Math.max(1, Math.round(num(o.qty)) || 1), price: Math.round(num(o.price)), categoryId: id, confidence: clamp01(o.confidence, 0.8) };
  }).filter((i) => i.name && i.price > 0);
  const sum = items.reduce((s, i) => s + i.price, 0);
  const tax = Math.max(0, Math.round(num(raw.tax)));
  let total = Math.round(num(raw.total));
  if (total <= 0) total = sum + tax;
  let purchasedAt: string | null = null;
  if (typeof raw.purchasedAt === "string") { const t = Date.parse(raw.purchasedAt); if (!Number.isNaN(t) && t <= now.getTime() + 864e5 && t > now.getTime() - 3 * 365 * 864e5) purchasedAt = new Date(t).toISOString(); }
  return { merchant: String(raw.merchant ?? "").trim().slice(0, 80), purchasedAt, total, tax, items, confidence: clamp01(raw.confidence), mismatch: items.length ? total - sum - tax : 0, model };
}

/** Escalate to the stronger model when the first read looks unreliable. */
export const needsSecondOpinion = (r: ReceiptRead) => r.items.length === 0 || r.confidence < 0.85 || Math.abs(r.mismatch) > Math.max(500, r.total * 0.02);
export const isEmptyRead = (r: ReceiptRead) => r.items.length === 0 && r.total <= 0;

export async function readReceipt(dataUrl: string, opts: { key: string; base?: string; fetchImpl?: typeof fetch; onModel?: (m: string) => void }): Promise<ReceiptRead> {
  const f = opts.fetchImpl ?? fetch, base = opts.base ?? "https://ai.helipod.io/v1";
  const call = async (model: string) => {
    const res = await f(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.key}` }, body: JSON.stringify({ model, temperature: 0, max_tokens: 1500, messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: dataUrl } }, { type: "text", text: PROMPT }] }] }) });
    if (!res.ok) throw new Error(`AI_${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseReceipt(body.choices?.[0]?.message?.content ?? "", model);
  };
  let first: ReceiptRead | null = null;
  try { first = await call(PRIMARY_MODEL); } catch (e) { if (!(e instanceof Error) || e.message === "AI_401" || e.message === "AI_402") throw e; }
  if (first && !needsSecondOpinion(first)) return first;
  try { const second = await call(FALLBACK_MODEL); return first && first.items.length && !second.items.length ? first : second; } catch (e) { if (first) return first; throw e; }
}
