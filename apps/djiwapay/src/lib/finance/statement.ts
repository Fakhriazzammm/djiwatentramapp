import { guessCategory } from "./categories";
import { uid } from "./calc";
import { call } from "./integrations";
import type { Entry } from "./types";

/** A bank statement (PDF) read into rows, then set against what is already recorded: matched, missing from the records, or only in the records. */
export type StatementRow = { date: string; description: string; amount: number; direction: "in" | "out"; balance: number | null };
export type ParsedStatement = { bank: string; accountHint: string; periodFrom: string; periodTo: string; opening: number | null; closing: number | null; rows: StatementRow[]; balanced: boolean | null; chunks: number };

export const parseOnServer = (text: string) => call<{ statement: ParsedStatement }>("/statements/parse", { method: "POST", body: JSON.stringify({ text }) }).then((r) => r.statement);

/** Reads every page of a PDF into lines of text (by position, so table columns stay on one line). Throws "PASSWORD" when the file needs one. */
export async function pdfText(file: File, password?: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password }).promise; }
  catch (e) { if ((e as { name?: string }).name === "PasswordException") throw new Error("PASSWORD"); throw e; }
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3);   // items within a few points of height share a line
      rows.set(y, [...(rows.get(y) ?? []), { x: it.transform[4], s: it.str.trim() }]);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) out.push(rows.get(y)!.sort((a, b) => a.x - b.x).map((c) => c.s).join("  "));
    out.push("");
  }
  return out.join("\n");
}

const DAY = 86_400_000, WIB = 7 * 3_600_000;
const dayMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const entryDayMs = (at: string) => { const t = new Date(new Date(at).getTime() + WIB); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };

export type Match = { row: StatementRow; entry: Entry };
export type Reconciled = { matched: Match[]; missing: StatementRow[]; extra: Entry[] };

/** One statement row pairs with one record of the same amount and direction within two days (a statement posts the day after the shop sent its mail). Nothing pairs twice. */
export function reconcile(rows: StatementRow[], entries: Entry[], accountIds: ReadonlySet<string>, period?: { from: string; to: string }): Reconciled {
  const pool = entries.filter((e) => (accountIds.has(e.accountId) || (e.toAccountId !== undefined && accountIds.has(e.toAccountId))));
  const used = new Set<string>(), matched: Match[] = [], missing: StatementRow[] = [];
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const want = dayMs(row.date);
    const fits = pool.filter((e) => !used.has(e.id) && Math.abs(e.amount - row.amount) < 1 && Math.abs(entryDayMs(e.at) - want) <= 2 * DAY && sameWay(e, row, accountIds))
      .sort((a, b) => Math.abs(entryDayMs(a.at) - want) - Math.abs(entryDayMs(b.at) - want));
    if (fits[0]) { used.add(fits[0].id); matched.push({ row, entry: fits[0] }); } else missing.push(row);
  }
  const from = period?.from ? dayMs(period.from) : rows.length ? Math.min(...rows.map((r) => dayMs(r.date))) : 0, to = period?.to ? dayMs(period.to) : rows.length ? Math.max(...rows.map((r) => dayMs(r.date))) : 0;
  const extra = pool.filter((e) => !used.has(e.id) && entryDayMs(e.at) >= from && entryDayMs(e.at) <= to + DAY);
  return { matched, missing, extra };
}

function sameWay(e: Entry, row: StatementRow, accountIds: ReadonlySet<string>) {
  if (e.kind === "tf") return row.direction === "out" ? accountIds.has(e.accountId) : accountIds.has(e.toAccountId ?? "");
  return e.kind === row.direction;
}

/** A row nothing matches, as a record to add. The category comes from the same word rules as everything else; the person can change it afterwards. */
export function entryFor(row: StatementRow, accountId: string, now = new Date()): Entry {
  const note = row.description.replace(/\s+/g, " ").trim() || (row.direction === "in" ? "Uang masuk" : "Pengeluaran");
  const guess = guessCategory(note), at = new Date(`${row.date}T12:00:00+07:00`).toISOString();
  return { id: `st-${uid()}`, kind: row.direction, amount: row.amount, categoryId: row.direction === "in" ? (guess && ["gaji", "bonus", "bunga"].includes(guess) ? guess : "bonus") : guess ?? "lainnya", accountId, at, note: note.slice(0, 80), tags: ["e-statement"], source: "statement", createdAt: now.toISOString() };
}
