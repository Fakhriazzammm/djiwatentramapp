import type { Account, Category, Kind } from "./types";
import { INCOME_HINTS, guessCategory } from "./categories";

export type ParsedItem = { title: string; amount: number; kind: Kind; categoryId: string; accountId?: string; daysAgo: number };

const UNIT: Record<string, number> = { rb: 1000, ribu: 1000, k: 1000, rebu: 1000, jt: 1_000_000, juta: 1_000_000, m: 1_000_000 };
const AMOUNT = /(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(rb|ribu|rebu|k|jt|juta|m)?(?![a-z])/i;

export function parseAmount(text: string): { amount: number; match: string } | null {
  const m = AMOUNT.exec(text);
  if (!m) return null;
  const raw = m[1];
  const unit = m[2]?.toLowerCase();
  let value: number;
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) value = Number(raw.replace(/\./g, ""));
  else value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  if (unit) value *= UNIT[unit] ?? 1;
  const amount = Math.round(value);
  return amount > 0 ? { amount, match: m[0] } : null;
}

const SPLIT = /\s*(?:,|;|\n|&|\bdan\b|\blalu\b|\bterus\b|\bplus\b)\s*/i;
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Turns a sentence like “kopi 25rb dan parkir 5rb, gaji 6jt” into editable entries. */
export function parseEntries(input: string, accounts: Pick<Account, "id" | "name">[] = [], categories: Pick<Category, "id" | "name" | "income">[] = []): ParsedItem[] {
  const out: ParsedItem[] = [];
  for (const segment of input.split(SPLIT)) {
    const text = segment.trim();
    if (!text) continue;
    const found = parseAmount(text);
    if (!found) continue;
    let rest = text.replace(found.match, " ");
    let daysAgo = 0;
    if (/\bkemarin lusa\b/i.test(rest)) { daysAgo = 2; rest = rest.replace(/\bkemarin lusa\b/i, " "); }
    else if (/\bkemarin\b/i.test(rest)) { daysAgo = 1; rest = rest.replace(/\bkemarin\b/i, " "); }
    else rest = rest.replace(/\b(hari ini|tadi)\b/i, " ");
    let accountId: string | undefined;
    const lower = rest.toLowerCase();
    for (const account of accounts) {
      const name = account.name.toLowerCase().split(/\s|•/)[0];
      if (name && name.length > 2 && new RegExp(`(^|\\s)(pakai|dari|via|pake)?\\s*${name}(\\s|$)`).test(lower)) { accountId = account.id; rest = rest.replace(new RegExp(`\\b(pakai|pake|dari|via)?\\s*${name}\\b`, "i"), " "); break; }
    }
    if (!accountId && /\b(cash|tunai)\b/i.test(rest)) { accountId = accounts.find((a) => /tunai|cash/i.test(a.name))?.id; rest = rest.replace(/\b(cash|tunai)\b/i, " "); }
    const title = capitalize(rest.replace(/\b(beli|bayar|untuk|buat|di|ke|pakai)\b/gi, (w) => w).replace(/\s+/g, " ").trim()) ;
    const hay = `${title} ${text}`;
    const income = INCOME_HINTS.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(hay)) && !/\b(bayar|beli)\b/i.test(hay);
    const guessed = guessCategory(hay);
    const kind: Kind = income ? "in" : "out";
    const isIncomeCat = (id: string) => categories.find((c) => c.id === id)?.income ?? (id === "gaji" || id === "bonus");
    const categoryId = guessed && isIncomeCat(guessed) === income ? guessed : income ? "bonus" : "lainnya";
    out.push({ title: title || (income ? "Pemasukan" : "Pengeluaran"), amount: found.amount, kind, categoryId, accountId, daysAgo });
  }
  return out;
}
