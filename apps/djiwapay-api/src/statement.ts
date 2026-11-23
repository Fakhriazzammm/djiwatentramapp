import type { Hono } from "hono";
import { extractJson } from "./receipt.js";
import { redact } from "./mail/extract.js";
import { MAIL_MODEL } from "./mail/llm.js";

/** Bank statement (rekening koran / e-statement): the app reads the PDF on the phone and sends the text here; a model turns it into rows.
 *  Account numbers are masked to the last four digits before the text leaves this server. Nothing of the statement is stored. */
export const STATEMENT_PROMPT = `Kamu membaca teks rekening koran atau e-statement bank/e-wallet Indonesia (BCA, Mandiri, BRI, BNI, CIMB Niaga, Jago, SeaBank, Jenius, blu, GoPay, OVO, DANA, dan lainnya). Balas HANYA satu objek JSON:
{"bank":string,"accountHint":4 digit terakhir nomor rekening atau "","periodFrom":"YYYY-MM-DD" atau "","periodTo":"YYYY-MM-DD" atau "","opening":saldo awal angka atau null,"closing":saldo akhir angka atau null,"rows":[{"date":"YYYY-MM-DD","description":string maksimal 60 huruf,"amount":angka rupiah positif tanpa titik atau koma ribuan,"direction":"in"|"out","balance":saldo setelah transaksi atau null}]}
Aturan: satu baris untuk satu mutasi uang. "DB", "debit", "keluar", tanda minus = out. "CR", "kredit", "masuk" = in. Baris "saldo awal", "saldo akhir", total, subtotal, dan judul kolom BUKAN transaksi. Biaya admin, pajak bunga = out; bunga = in. Tanggal sering hanya "DD/MM": ambil tahun dari periode di judul statement. Format angka Indonesia memakai titik ribuan dan koma desimal (1.250.000,00); format BCA sering 1,250,000.00. Jangan mengarang baris; lewati yang tidak jelas.`;

export type StatementRow = { date: string; description: string; amount: number; direction: "in" | "out"; balance: number | null };
export type ParsedStatement = { bank: string; accountHint: string; periodFrom: string; periodTo: string; opening: number | null; closing: number | null; rows: StatementRow[]; balanced: boolean | null; chunks: number };
type Opts = { key: string; fetchImpl?: typeof fetch; base?: string; model?: string };

const CHUNK = 9000, HEAD = 1500, MAX_TEXT = 400_000, MAX_ROWS = 1500;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function chunkText(text: string): string[] {
  const lines = text.split(/\n/), out: string[] = []; let cur = "";
  for (const l of lines) { if (cur.length + l.length + 1 > CHUNK && cur) { out.push(cur); cur = ""; } cur += l + "\n"; }
  if (cur.trim()) out.push(cur);
  return out;
}

export function cleanRows(raw: unknown): StatementRow[] {
  return (Array.isArray(raw) ? raw : []).flatMap((r: any) => {
    const amount = num(r?.amount), dir = r?.direction === "in" || r?.direction === "out" ? r.direction : null;
    if (!isDate(r?.date) || !dir || amount === null || amount <= 0) return [];
    return [{ date: r.date, description: String(r.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80), amount: Math.round(amount), direction: dir, balance: num(r?.balance) } as StatementRow];
  });
}

export async function parseStatement(text: string, o: Opts): Promise<ParsedStatement> {
  const f = o.fetchImpl ?? fetch, base = o.base ?? "https://ai.helipod.io/v1", model = o.model ?? MAIL_MODEL;
  const safe = redact(text.slice(0, MAX_TEXT)), head = safe.slice(0, HEAD), chunks = chunkText(safe).slice(0, 40);
  const one = async (part: string, i: number) => {
    const res = await f(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.key}` },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 7000, messages: [{ role: "system", content: STATEMENT_PROMPT }, { role: "user", content: `${i ? `(Bagian ${i + 1}. Judul statement untuk konteks tahun dan bank:\n${head}\n---)\n` : ""}${part}` }] }) });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return extractJson(body.choices?.[0]?.message?.content ?? "") as Record<string, unknown>;
  };
  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < chunks.length; i += 3) results.push(...(await Promise.all(chunks.slice(i, i + 3).map((c, k) => one(c, i + k)))));
  const rows = results.flatMap((r) => cleanRows(r.rows)).slice(0, MAX_ROWS);
  const first = results.find((r) => String(r.bank ?? "").trim()) ?? results[0] ?? {};
  const opening = results.map((r) => num(r.opening)).find((v) => v !== null) ?? null, closing = [...results].reverse().map((r) => num(r.closing)).find((v) => v !== null) ?? null;
  const net = rows.reduce((s, r) => s + (r.direction === "in" ? r.amount : -r.amount), 0);
  const dates = rows.map((r) => r.date).sort();
  return {
    bank: String(first.bank ?? "").slice(0, 40), accountHint: String(first.accountHint ?? "").replace(/\D/g, "").slice(-4),
    periodFrom: isDate(first.periodFrom) ? first.periodFrom : dates[0] ?? "", periodTo: isDate(first.periodTo) ? first.periodTo : dates[dates.length - 1] ?? "",
    opening, closing, rows, chunks: chunks.length,
    balanced: opening !== null && closing !== null && rows.length ? Math.abs(opening + net - closing) < 1 : null,   // opening + movements = closing: the read is complete and right
  };
}

const hits = new Map<string, number[]>();
export function registerStatementRoutes(app: Hono, d: { aiKey?: string; fetchImpl?: typeof fetch }, uid: (c: any) => string, json: (c: any, body: unknown, status?: number) => Response) {
  app.post("/api/finance/statements/parse", async (c) => {
    if (!d.aiKey) return json(c, { success: false, error: "NOT_CONFIGURED" }, 503);
    const id = uid(c), now = Date.now(), recent = (hits.get(id) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= 8) return json(c, { success: false, error: "RATE_LIMITED" }, 429);
    hits.set(id, [...recent, now]);
    const b = await c.req.json().catch(() => null) as { text?: unknown } | null, text = typeof b?.text === "string" ? b.text : "";
    if (text.replace(/\s/g, "").length < 80) return json(c, { success: false, error: "EMPTY" }, 422);
    try { return json(c, { success: true, statement: await parseStatement(text, { key: d.aiKey, fetchImpl: d.fetchImpl }) }); }
    catch (e) { console.error("statement", e instanceof Error ? e.message : e); return json(c, { success: false, error: "TRY_AGAIN" }, 503); }
  });
}
