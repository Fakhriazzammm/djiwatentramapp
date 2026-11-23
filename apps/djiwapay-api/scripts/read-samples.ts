// Reads every .jpg in a folder with the live reader and prints kind, language, currency, merchant, date, total, lines and whether the totals reconcile.
// Usage: HELIPOD_AI_KEY=... bun apps/djiwapay-api/scripts/read-samples.ts <folder>   (photos stay out of the repo: they hold card numbers and addresses)
import { readReceipt } from "../src/receipt.ts";
import { reconcileReceipt } from "../src/receipt-document.ts";
import { readdirSync, readFileSync } from "node:fs";
const key = process.env.HELIPOD_AI_KEY!;
const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
const seen = new Set<string>();
for (const f of files) {
  const buf = readFileSync(`${dir}/${f}`); const h = buf.length + ":" + buf.subarray(0, 64).toString("hex"); if (seen.has(h)) { console.log(f.slice(-12), "DUPLIKAT FILE"); continue; } seen.add(h);
  const t = Date.now();
  try {
    const r = await readReceipt(`data:image/jpeg;base64,${buf.toString("base64")}`, { key, maxTokens: Number(process.env.MAXTOK || 12000) });
    const rc = reconcileReceipt(r);
    console.log(JSON.stringify({ f: f.slice(-12), ms: Date.now() - t, kind: r.kind, lang: r.language, cur: r.currency, merchant: r.merchant, orig: r.merchantOriginal, at: r.purchasedAt, total: r.total, n: r.items.length, items: r.items.map((i) => `${i.nameOriginal ?? ""}|${i.name}|${i.qty}|${i.discount}|${i.price}`), charges: r.charges.map((c) => `${c.label}:${c.kind}:${c.amount}:${c.included}`), valid: rc.valid, problems: rc.problems, warn: r.warnings, conf: r.confidence, model: r.model }));
  } catch (e) { console.log(f.slice(-12), "ERR", String(e)); }
}
