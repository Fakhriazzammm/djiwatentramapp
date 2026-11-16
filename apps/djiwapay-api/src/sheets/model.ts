/** Two-way sync between finance.entries and the user's "Catatan" sheet. Pure (no network, no DB): the whole decision
 *  of who wins, what is created and what is deleted lives here so it can be tested exhaustively. */
import { createHash } from "node:crypto";
import { parseRupiah, parseWhen } from "../mail/extract.js";

export const COL = { id: 0, at: 1, kind: 2, category: 3, account: 4, toAccount: 5, amount: 6, note: 7, source: 8, status: 9 } as const;
export const CATATAN_HEADERS = ["ID", "Waktu", "Jenis", "Kategori", "Dompet", "Ke dompet", "Jumlah", "Catatan", "Sumber", "Status"] as const;
export const OK = "✓ Tersinkron";
const WIB_MS = 7 * 3600_000, DAY = 86400_000, EPOCH = 25569;   // Sheets serial 25569 = 1970-01-01

export type EntryRow = { id: string; kind: "out" | "in" | "tf"; amount: number; categoryId: string; accountId: string; toAccountId?: string | null; at: string; note: string; source: string; receiptLocked?: boolean };
export type Names = { catName: Record<string, string>; accName: Record<string, string> };
export type SheetRow = { row: number; cells: unknown[] };          // row = 1-based sheet row number
export type Cell = string | number;

export const KIND_LABEL = { out: "Pengeluaran", in: "Pemasukan", tf: "Transfer" } as const;
const SOURCE_LABEL: Record<string, string> = { manual: "Manual", voice: "Suara", pay: "Djiwa Pay", receipt: "Scan struk", email: "Email", sheet: "Spreadsheet" };

/** WIB wall-clock time as a Sheets serial number. */
export const toSerial = (iso: string) => (Math.floor((Date.parse(iso) + WIB_MS) / 60_000) * 60_000) / DAY + EPOCH;
export const fromSerial = (serial: number) => new Date(Math.round(((serial - EPOCH) * DAY - WIB_MS) / 60_000) * 60_000).toISOString();
const minute = (iso: string) => new Date(Math.floor(Date.parse(iso) / 60_000) * 60_000).toISOString();

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const invert = (m: Record<string, string>) => { const o: Record<string, string> = {}; for (const [id, name] of Object.entries(m)) { o[norm(name)] = id; o[norm(id)] ??= id; } return o; };

export type Parsed = { ok: true; id: string; entry: Omit<EntryRow, "id" | "source"> } | { ok: false; error: string; blank: boolean };

/** One sheet row → an entry, or the reason it cannot be read. Names are matched case-insensitively. */
export function parseRow(cells: unknown[], names: Names): Parsed {
  const c = (i: number) => cells[i];
  const meaningful = [COL.at, COL.kind, COL.category, COL.account, COL.amount, COL.note].some((i) => String(c(i) ?? "").trim() !== "");
  if (!meaningful) return { ok: false, error: "", blank: true };
  const atRaw = c(COL.at);
  const atMs = typeof atRaw === "number" ? Date.parse(fromSerial(atRaw)) : typeof atRaw === "string" && atRaw.trim() ? (parseWhen(atRaw) ?? NaN) : NaN;
  if (!Number.isFinite(atMs)) return { ok: false, error: "⚠ Waktu tidak terbaca", blank: false };
  const kindKey = norm(c(COL.kind));
  const kind = kindKey === "pengeluaran" || kindKey === "out" ? "out" : kindKey === "pemasukan" || kindKey === "in" ? "in" : kindKey === "transfer" || kindKey === "tf" ? "tf" : null;
  if (!kind) return { ok: false, error: "⚠ Jenis harus Pengeluaran, Pemasukan, atau Transfer", blank: false };
  const amountRaw = c(COL.amount);
  const amount = typeof amountRaw === "number" ? amountRaw : parseRupiah(String(amountRaw ?? ""));
  if (!(amount > 0) || !Number.isFinite(amount)) return { ok: false, error: "⚠ Jumlah harus lebih dari 0", blank: false };
  const cat = invert(names.catName), acc = invert(names.accName);
  const accountId = acc[norm(c(COL.account))];
  if (!accountId) return { ok: false, error: "⚠ Dompet tidak dikenal. Pilih dari daftar", blank: false };
  let toAccountId: string | null = null;
  if (kind === "tf") {
    toAccountId = acc[norm(c(COL.toAccount))] ?? null;
    if (!toAccountId) return { ok: false, error: "⚠ Transfer butuh kolom “Ke dompet”", blank: false };
    if (toAccountId === accountId) return { ok: false, error: "⚠ Dompet asal dan tujuan sama", blank: false };
  }
  const categoryId = kind === "tf" ? "transfer" : cat[norm(c(COL.category))];
  if (!categoryId) return { ok: false, error: "⚠ Kategori tidak dikenal. Pilih dari daftar", blank: false };
  return { ok: true, id: String(c(COL.id) ?? "").trim(), entry: { kind, amount: Math.round(amount * 100) / 100, categoryId, accountId, toAccountId, at: new Date(Math.floor(atMs / 60_000) * 60_000).toISOString(), note: String(c(COL.note) ?? "").trim().slice(0, 200) } };
}

/** What counts as "the same record" on both sides. */
export const hashOf = (e: Pick<EntryRow, "kind" | "amount" | "categoryId" | "accountId" | "toAccountId" | "at" | "note">) =>
  createHash("sha1").update(JSON.stringify([minute(e.at), e.kind, e.categoryId, e.accountId, e.toAccountId || "", Math.round(e.amount * 100), e.note.trim()])).digest("hex").slice(0, 16);

/** An entry as one sheet row. A leading = + - @ would be read as a formula, so notes are kept literal. */
export function rowOf(e: EntryRow, names: Names, status = OK): Cell[] {
  const safe = (s: string) => (/^[=+\-@]/.test(s) ? "'" + s : s);
  return [e.id, toSerial(e.at), KIND_LABEL[e.kind], e.kind === "tf" ? "Transfer" : names.catName[e.categoryId] ?? e.categoryId, names.accName[e.accountId] ?? e.accountId, e.toAccountId ? names.accName[e.toAccountId] ?? e.toAccountId : "", e.amount, safe(e.note), SOURCE_LABEL[e.source] ?? e.source, status];
}

export type Plan = {
  toApp: { upserts: (EntryRow & { fromSheet: boolean })[]; deletes: string[] };
  toSheet: { rewrites: { row: number; values: Cell[] }[]; statuses: { row: number; value: string }[]; appends: Cell[][]; deletes: number[] };
  mapping: Map<string, string>;                                  // entry id → hash agreed by both sides after this plan
  stats: { fromSheet: number; toSheet: number; deletedInApp: number; deletedInSheet: number; rejected: number };
};

export function planSync(input: { entries: EntryRow[]; mapping: Map<string, string>; rows: SheetRow[]; names: Names; newId: () => string }): Plan {
  const { entries, mapping, rows, names } = input;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const plan: Plan = { toApp: { upserts: [], deletes: [] }, toSheet: { rewrites: [], statuses: [], appends: [], deletes: [] }, mapping: new Map(), stats: { fromSheet: 0, toSheet: 0, deletedInApp: 0, deletedInSheet: 0, rejected: 0 } };
  const seen = new Set<string>();
  const status = (row: number, current: unknown, want: string) => { if (String(current ?? "") !== want) plan.toSheet.statuses.push({ row, value: want }); };
  const writeApp = (e: EntryRow, row: number) => { plan.toSheet.rewrites.push({ row, values: rowOf(e, names) }); plan.mapping.set(e.id, hashOf(e)); plan.stats.toSheet++; };

  for (const { row, cells } of rows) {
    const parsed = parseRow(cells, names);
    if (!parsed.ok && parsed.blank) continue;
    let id = String(cells[COL.id] ?? "").trim();
    const duplicate = id && seen.has(id);            // a copied row becomes a new entry instead of fighting over one id
    if (duplicate) id = "";
    if (id) seen.add(id);
    const current = cells[COL.status];

    if (!id) {                                        // a new row typed into the sheet
      if (!parsed.ok) { plan.stats.rejected++; status(row, current, parsed.error); continue; }
      const entry: EntryRow = { ...parsed.entry, id: input.newId(), source: "sheet" };
      plan.toApp.upserts.push({ ...entry, fromSheet: true });
      plan.mapping.set(entry.id, hashOf(entry)); plan.stats.fromSheet++;
      plan.toSheet.rewrites.push({ row, values: rowOf(entry, names) });
      continue;
    }

    const entry = byId.get(id), known = mapping.get(id);
    if (!entry) {
      if (known !== undefined) { plan.toSheet.deletes.push(row); plan.stats.deletedInSheet++; }       // deleted in the app → remove the row
      else { plan.stats.rejected++; status(row, current, "⚠ ID tidak dikenal. Kosongkan kolom ID agar jadi catatan baru"); }
      continue;
    }
    const dbHash = hashOf(entry), sheetHash = parsed.ok ? hashOf(parsed.entry) : null;
    if (entry.receiptLocked) {
      if (sheetHash !== dbHash) { writeApp(entry, row); status(row, current, "Ubah melalui rincian struk di Djiwa Pay"); }
      else { plan.mapping.set(id, dbHash); status(row, current, OK); }
      continue;
    }
    if (known === undefined) {                        // first meeting (e.g. a rebuilt sheet): the app is the source of truth
      if (sheetHash === dbHash) { plan.mapping.set(id, dbHash); status(row, current, OK); } else writeApp(entry, row);
      continue;
    }
    const appChanged = dbHash !== known, sheetChanged = sheetHash !== known;
    if (appChanged) { writeApp(entry, row); continue; }                // the app wins a real conflict too
    if (sheetChanged) {
      if (!parsed.ok) { plan.stats.rejected++; plan.mapping.set(id, dbHash); status(row, current, parsed.error); continue; }
      const next: EntryRow = { ...entry, ...parsed.entry };
      plan.toApp.upserts.push({ ...next, fromSheet: true });
      plan.mapping.set(id, hashOf(next)); plan.stats.fromSheet++;
      plan.toSheet.rewrites.push({ row, values: rowOf(next, names) });
      continue;
    }
    plan.mapping.set(id, dbHash); status(row, current, OK);
  }

  const onSheet = new Set(seen);
  for (const e of entries) {
    if (onSheet.has(e.id)) continue;
    const known = mapping.get(e.id);
    if (known !== undefined && hashOf(e) === known) { plan.toApp.deletes.push(e.id); plan.stats.deletedInApp++; continue; }   // row removed in the sheet
    plan.toSheet.appends.push(rowOf(e, names)); plan.mapping.set(e.id, hashOf(e)); plan.stats.toSheet++;                        // new in the app, or edited after its row was removed
  }
  return plan;
}

export const SHEET_DELETE_GUARD = 25;   // a plan that would delete more than this from the app is held back for a human
