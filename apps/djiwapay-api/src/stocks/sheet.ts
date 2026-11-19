/** The two stock tabs inside the user's Djiwa Pay workbook, and the Sheets API calls around them.
 *  `Saham` is the trade log (written by the app). `Portofolio Saham` holds the per-ticker formulas, including GOOGLEFINANCE:
 *  Google computes the price, the app reads it back. The workbook's locale is en_US, so formulas use commas. */
import type { Fetch } from "../google.js";
import { GoogleError, must, sheets, writeValues } from "../google-sync.js";
import { fromSerial, toSerial, type Cell } from "../sheets/model.js";
import { C, IDR, R, WHEN, bottomLine, cond, fmt, hex, width, height } from "../sheets/template.js";
import type { Holding, Trade } from "./model.js";

export const SAHAM = "Saham", PORTO = "Portofolio Saham";
export const SAHAM_HEADERS = ["ID", "Waktu", "Ticker", "Jenis", "Lot", "Harga", "Fee", "Catatan"] as const;
export const PORTO_HEADERS = ["Ticker", "Lot", "Rata-rata", "Harga", "Nilai", "Untung/rugi", "Waktu harga"] as const;
export const GRID_ROWS = 1000;

const safe = (s: string) => (/^[=+\-@]/.test(s) ? "'" + s : s);
export const tradeRow = (t: Trade): Cell[] => [t.id, toSerial(t.at), t.ticker, t.side === "buy" ? "Beli" : "Jual", t.lots, t.price, t.fee, safe(t.note)];

export const lotsFormula = (r: number) => `=SUMIFS(Saham!$E:$E,Saham!$C:$C,A${r},Saham!$D:$D,"Beli")-SUMIFS(Saham!$E:$E,Saham!$C:$C,A${r},Saham!$D:$D,"Jual")`;
export const priceFormula = (r: number) => `=GOOGLEFINANCE("IDX:"&A${r},"price")`;
export const timeFormula = (r: number) => `=IFERROR(GOOGLEFINANCE("IDX:"&A${r},"tradetime"),"")`;

/** Rows of Portofolio Saham (from row 2) for the holdings still open. The average is the app's figure: it stays right after a full exit and re-entry. */
export function portoRows(held: Holding[]): Cell[][] {
  const n = held.length, rows = held.map((h, i): Cell[] => { const r = i + 2; return [h.ticker, lotsFormula(r), h.avg, priceFormula(r), `=IF(ISNUMBER(D${r}),B${r}*100*D${r},"")`, `=IF(ISNUMBER(E${r}),E${r}-B${r}*100*C${r},"")`, timeFormula(r)]; });
  if (n) rows.push(["", "", "", "", "", "", ""], ["Total", "", "", "", `=SUM(E2:E${n + 1})`, `=SUM(F2:F${n + 1})`, ""]);
  return rows;
}

export type ParsedPrice = { ticker: string; price: number | null; asOf: string | null };
/** Reads Portofolio Saham!A2:G back. #N/A, "Loading…" and blanks are "no price yet", never zero. */
export function parsePrices(values: unknown[][], tickers: string[]): ParsedPrice[] {
  const want = new Set(tickers);
  return values.filter((r) => want.has(String(r?.[0] ?? ""))).map((r) => {
    const price = typeof r[3] === "number" && r[3] > 0 ? r[3] : null;
    const asOf = typeof r[6] === "number" && r[6] > 40000 ? fromSerial(r[6]) : null;
    return { ticker: String(r[0]), price, asOf };
  });
}

/** Formatting for a tab we have just created. Never re-applied later, so the user's own touches survive. */
export function formatRequests(saham: number, porto: number) {
  const head = (s: number, cols: number) => [fmt(R(s, 0, 1, 0, cols), { bg: C.ink, color: C.white, bold: true, size: 10, align: "LEFT", pad: 8 }), height(s, 0, 1, 34)];
  return [
    ...head(saham, 8), width(saham, 0, 1, 96), width(saham, 1, 2, 160), width(saham, 2, 3, 80), width(saham, 3, 4, 80), width(saham, 4, 5, 70), width(saham, 5, 6, 120), width(saham, 6, 7, 110), width(saham, 7, 8, 300),
    fmt(R(saham, 1, GRID_ROWS, 0, 8), { color: C.ink, size: 10, pad: 8 }),
    fmt(R(saham, 1, GRID_ROWS, 0, 1), { color: C.faint, size: 8, mono: true, pad: 8 }),
    fmt(R(saham, 1, GRID_ROWS, 1, 2), { num: WHEN, align: "LEFT", pad: 8 }),
    fmt(R(saham, 1, GRID_ROWS, 5, 7), { num: IDR, align: "RIGHT", pad: 8 }),
    cond(R(saham, 1, GRID_ROWS, 3, 4), { type: "TEXT_EQ", values: ["Beli"] }, { textFormat: { foregroundColor: hex(C.ok), bold: true } }),
    cond(R(saham, 1, GRID_ROWS, 3, 4), { type: "TEXT_EQ", values: ["Jual"] }, { textFormat: { foregroundColor: hex(C.bad), bold: true } }),
    ...head(porto, 7), width(porto, 0, 1, 90), width(porto, 1, 2, 70), width(porto, 2, 5, 130), width(porto, 5, 6, 140), width(porto, 6, 7, 170),
    fmt(R(porto, 1, 200, 0, 7), { color: C.ink, size: 10, pad: 8 }),
    fmt(R(porto, 1, 200, 0, 1), { bold: true, pad: 8 }),
    fmt(R(porto, 1, 200, 2, 6), { num: IDR, align: "RIGHT", pad: 8 }),
    fmt(R(porto, 1, 200, 6, 7), { num: WHEN, align: "LEFT", pad: 8, color: C.mute }),
    cond(R(porto, 1, 200, 5, 6), { type: "NUMBER_GREATER", values: ["0"] }, { textFormat: { foregroundColor: hex(C.ok), bold: true } }),
    cond(R(porto, 1, 200, 5, 6), { type: "NUMBER_LESS", values: ["0"] }, { textFormat: { foregroundColor: hex(C.bad), bold: true } }),
    bottomLine(R(porto, 1, 200, 0, 7)),
  ];
}

const addTab = (title: string, color: string, cols: number) => ({ addSheet: { properties: { title, tabColorStyle: { rgbColor: hex(color) }, gridProperties: { rowCount: title === SAHAM ? GRID_ROWS : 200, columnCount: cols, frozenRowCount: 1 } } } });

/** Makes sure both tabs exist. Adds only what is missing; formats only what it adds. */
export async function ensureTabs(f: Fetch, token: string, id: string): Promise<{ saham: number; porto: number; created: boolean }> {
  const meta = (await must(await sheets(f, token, `/${id}?fields=sheets.properties(sheetId,title)`), "SHEETS_META").then((r) => r.json())) as { sheets?: { properties: { sheetId: number; title: string } }[] };
  const find = (title: string) => meta.sheets?.find((s) => s.properties.title === title)?.properties.sheetId;
  let saham = find(SAHAM), porto = find(PORTO);
  if (saham !== undefined && porto !== undefined) return { saham, porto, created: false };
  const adds: Record<string, unknown>[] = [], order: string[] = [];
  if (saham === undefined) { adds.push(addTab(SAHAM, C.accent, 8)); order.push(SAHAM); }
  if (porto === undefined) { adds.push(addTab(PORTO, C.ok, 7)); order.push(PORTO); }
  const res = (await must(await sheets(f, token, `/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: adds }) }), "SHEETS_ADD_TAB").then((r) => r.json())) as { replies?: { addSheet?: { properties: { sheetId: number } } }[] };
  order.forEach((title, i) => { const sid = res.replies?.[i]?.addSheet?.properties.sheetId; if (sid === undefined) throw new GoogleError(500, "SHEETS_ADD_TAB"); if (title === SAHAM) saham = sid; else porto = sid; });
  await must(await sheets(f, token, `/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: formatRequests(saham!, porto!) }) }), "SHEETS_FORMAT_TAB");
  return { saham: saham!, porto: porto!, created: true };
}

const clearRanges = async (f: Fetch, token: string, id: string, ranges: string[]) => { await must(await sheets(f, token, `/${id}/values:batchClear`, { method: "POST", body: JSON.stringify({ ranges }) }), "SHEETS_CLEAR"); };

/** Rewrites both tabs from the app's trades. The tabs are app-managed in this release: edits there are replaced. */
export async function writeTabs(f: Fetch, token: string, id: string, trades: Trade[], held: Holding[]) {
  await clearRanges(f, token, id, [`${SAHAM}!A2:H${GRID_ROWS}`, `'${PORTO}'!A2:G200`]);
  const data: { range: string; values: Cell[][] }[] = [
    { range: `${SAHAM}!A1:H1`, values: [[...SAHAM_HEADERS]] }, { range: `'${PORTO}'!A1:G1`, values: [[...PORTO_HEADERS]] },
  ];
  if (trades.length) data.push({ range: `${SAHAM}!A2:H${1 + trades.length}`, values: trades.map(tradeRow) });
  const rows = portoRows(held);
  if (rows.length) data.push({ range: `'${PORTO}'!A2:G${1 + rows.length}`, values: rows });
  await writeValues(f, token, id, data.filter((d) => d.values.length), "USER_ENTERED");
}

/** "Segarkan": enter the price formulas again so Google recalculates them. */
export async function reenterPrices(f: Fetch, token: string, id: string, held: Holding[]) {
  if (!held.length) return;
  const n = held.length;
  await clearRanges(f, token, id, [`'${PORTO}'!D2:D${n + 1}`, `'${PORTO}'!G2:G${n + 1}`]);
  await writeValues(f, token, id, [
    { range: `'${PORTO}'!D2:D${n + 1}`, values: held.map((_, i) => [priceFormula(i + 2)]) },
    { range: `'${PORTO}'!G2:G${n + 1}`, values: held.map((_, i) => [timeFormula(i + 2)]) },
  ], "USER_ENTERED");
}

export async function readPrices(f: Fetch, token: string, id: string, tickers: string[]): Promise<ParsedPrice[]> {
  if (!tickers.length) return [];
  const range = encodeURIComponent(`'${PORTO}'!A2:G${tickers.length + 1}`);
  const res = await must(await sheets(f, token, `/${id}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`), "SHEETS_READ");
  return parsePrices(((await res.json()) as { values?: unknown[][] }).values ?? [], tickers);
}
