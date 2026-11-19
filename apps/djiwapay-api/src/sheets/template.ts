/** The professional workbook Djiwa Pay builds in the user's Google Drive. Pure: returns Google Sheets API request bodies.
 *  Locale is en_US on purpose: formulas sent through the API are then parsed unambiguously (comma separators, English names). */
import { CATATAN_HEADERS } from "./model.js";

export const TEMPLATE_VERSION = 2;
export const SHEET = { ringkasan: 1001, catatan: 1002, anggaran: 1003, tagihan: 1004, tujuan: 1005, hutang: 1006, aset: 1007, referensi: 1008, panduan: 1009 } as const;
export const TITLES = { ringkasan: "Ringkasan", catatan: "Catatan", anggaran: "Anggaran", tagihan: "Tagihan", tujuan: "Tujuan", hutang: "Hutang", aset: "Aset", referensi: "Referensi", panduan: "Panduan" } as const;
export const CATATAN_ROWS = 3000;            // grid rows reserved at creation; grown on demand
export const GROW_BY = 2000;

export const hex = (h: string) => ({ red: parseInt(h.slice(1, 3), 16) / 255, green: parseInt(h.slice(3, 5), 16) / 255, blue: parseInt(h.slice(5, 7), 16) / 255 });
export const C = { ink: "#2b2620", mute: "#74695a", faint: "#a89c88", line: "#e3d8c3", cream: "#f8f3e9", band: "#faf5ea", white: "#ffffff", accent: "#c9461b", accentSoft: "#fbe9dc", ok: "#4f7a2b", okSoft: "#eaf1d9", warn: "#a05d00", warnSoft: "#fff0c9", bad: "#b3261e", badSoft: "#fdeae4", slate: "#5b6b7f" };
const FONT = "Inter";

export type Range = { sheetId: number; startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number };
export const R = (sheetId: number, r0: number, r1: number, c0: number, c1: number): Range => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });

type Fmt = { bg?: string; color?: string; bold?: boolean; italic?: boolean; size?: number; mono?: boolean; align?: "LEFT" | "CENTER" | "RIGHT"; valign?: "TOP" | "MIDDLE" | "BOTTOM"; num?: { type: string; pattern: string }; wrap?: "WRAP" | "CLIP" | "OVERFLOW_CELL"; pad?: number };
export function fmt(range: Range, f: Fmt) {
  const cell: Record<string, unknown> = {}; const fields: string[] = [];
  if (f.bg) { cell.backgroundColor = hex(f.bg); fields.push("backgroundColor"); }
  const tf: Record<string, unknown> = {};
  if (f.color) tf.foregroundColor = hex(f.color);
  if (f.bold !== undefined) tf.bold = f.bold;
  if (f.italic !== undefined) tf.italic = f.italic;
  if (f.size) tf.fontSize = f.size;
  tf.fontFamily = f.mono ? "Roboto Mono" : FONT;
  cell.textFormat = tf; fields.push("textFormat");
  if (f.align) { cell.horizontalAlignment = f.align; fields.push("horizontalAlignment"); }
  cell.verticalAlignment = f.valign ?? "MIDDLE"; fields.push("verticalAlignment");
  if (f.num) { cell.numberFormat = f.num; fields.push("numberFormat"); }
  if (f.wrap) { cell.wrapStrategy = f.wrap; fields.push("wrapStrategy"); }
  if (f.pad !== undefined) { cell.padding = { top: 2, bottom: 2, left: f.pad, right: f.pad }; fields.push("padding"); }
  return { repeatCell: { range, cell: { userEnteredFormat: cell }, fields: `userEnteredFormat(${fields.join(",")})` } };
}
export const width = (sheetId: number, c0: number, c1: number, px: number) => ({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: c0, endIndex: c1 }, properties: { pixelSize: px }, fields: "pixelSize" } });
export const height = (sheetId: number, r0: number, r1: number, px: number) => ({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: r0, endIndex: r1 }, properties: { pixelSize: px }, fields: "pixelSize" } });
export const merge = (range: Range) => ({ mergeCells: { range, mergeType: "MERGE_ALL" } });
export const bottomLine = (range: Range, color = C.line) => ({ updateBorders: { range, bottom: { style: "SOLID", width: 1, color: hex(color) } } });
export const cond = (range: Range, condition: { type: string; values?: string[] }, format: Record<string, unknown>) => ({ addConditionalFormatRule: { index: 0, rule: { ranges: [range], booleanRule: { condition: { type: condition.type, values: (condition.values ?? []).map((v) => ({ userEnteredValue: v })) }, format } } } });
export const list = (range: Range, source: string, message: string) => ({ setDataValidation: { range, rule: { condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: source }] }, inputMessage: message, strict: true, showCustomUi: true } } });
export const IDR = { type: "NUMBER", pattern: '"Rp"#,##0' };
export const PCT = { type: "PERCENT", pattern: "0%" };
const MONTH = { type: "DATE", pattern: "mmmm yyyy" };
const MON = { type: "DATE", pattern: "mmm yy" };
const DATE = { type: "DATE", pattern: "dd mmm yyyy" };
export const WHEN = { type: "DATE_TIME", pattern: "dd mmm yyyy, hh:mm" };

export function createBody(title: string, rows = CATATAN_ROWS + 1, debtRows = 60) {
  const tab = (id: number, name: string, color: string, rows = 200, cols = 12, extra: Record<string, unknown> = {}) => ({ properties: { sheetId: id, title: name, tabColorStyle: { rgbColor: hex(color) }, gridProperties: { rowCount: rows, columnCount: cols, ...extra } } });
  return {
    properties: { title, locale: "en_US", timeZone: "Asia/Jakarta", defaultFormat: { textFormat: { fontFamily: FONT, fontSize: 10 }, verticalAlignment: "MIDDLE" } },
    sheets: [
      tab(SHEET.ringkasan, TITLES.ringkasan, C.accent, 60, 12, { hideGridlines: true }),
      tab(SHEET.catatan, TITLES.catatan, C.ink, rows, 10, { frozenRowCount: 1 }),
      tab(SHEET.anggaran, TITLES.anggaran, C.warn, 60, 8, { hideGridlines: true }),
      tab(SHEET.tagihan, TITLES.tagihan, C.slate, 60, 8, { hideGridlines: true }),
      tab(SHEET.tujuan, TITLES.tujuan, C.ok, 60, 8, { hideGridlines: true }),
      tab(SHEET.hutang, TITLES.hutang, C.bad, debtRows, 8, { hideGridlines: true }),
      tab(SHEET.aset, TITLES.aset, C.slate, 60, 8, { hideGridlines: true }),
      tab(SHEET.referensi, TITLES.referensi, C.faint, 80, 10, { frozenRowCount: 1 }),
      tab(SHEET.panduan, TITLES.panduan, C.faint, 60, 4, { hideGridlines: true }),
    ],
  };
}

/** Formatting for rows [from, to) of the Catatan table (0-based). Reused when the table grows. */
export function catatanRows(from: number, to: number) {
  const s = SHEET.catatan, last = to;
  return [
    fmt(R(s, from, last, 0, 10), { color: C.ink, size: 10, pad: 8 }),
    fmt(R(s, from, last, 0, 1), { color: C.faint, size: 8, mono: true, pad: 8 }),
    fmt(R(s, from, last, 1, 2), { num: WHEN, align: "LEFT", pad: 8 }),
    fmt(R(s, from, last, 6, 7), { num: IDR, align: "RIGHT", bold: true, pad: 8 }),
    fmt(R(s, from, last, 8, 9), { color: C.mute, size: 9, pad: 8 }),
    fmt(R(s, from, last, 9, 10), { color: C.mute, size: 9, pad: 8 }),
    list(R(s, from, last, 2, 3), "=Referensi!$A$2:$A$4", "Pilih jenis catatan"),
    list(R(s, from, last, 3, 4), "=Referensi!$E$2:$E$80", "Pilih kategori. Untuk Transfer diabaikan"),
    list(R(s, from, last, 4, 5), "=Referensi!$F$2:$F$60", "Pilih dompet"),
    list(R(s, from, last, 5, 6), "=Referensi!$F$2:$F$60", "Hanya untuk Transfer: dompet tujuan"),
  ];
}

/** Everything that styles the workbook, in one batchUpdate. */
export function styleRequests(rows = CATATAN_ROWS + 1) {
  const q: Record<string, unknown>[] = [];
  const title = (s: number, text: string, c1: number) => { q.push(merge(R(s, 1, 2, 1, c1)), fmt(R(s, 1, 2, 1, c1), { size: 20, bold: true, color: C.ink })); void text; };
  const header = (s: number, r: number, c0: number, c1: number) => q.push(fmt(R(s, r, r + 1, c0, c1), { bg: C.ink, color: C.white, bold: true, size: 10, align: "LEFT", pad: 10 }), height(s, r, r + 1, 32));
  const body = (s: number, r0: number, r1: number, c0: number, c1: number) => q.push(fmt(R(s, r0, r1, c0, c1), { color: C.ink, pad: 10 }), bottomLine(R(s, r0, r1, c0, c1)));

  /* --- Catatan --- */
  const s = SHEET.catatan;
  q.push(fmt(R(s, 0, 1, 0, 10), { bg: C.ink, color: C.white, bold: true, size: 10, align: "LEFT", pad: 8 }), height(s, 0, 1, 34), height(s, 1, rows, 26));
  q.push(width(s, 0, 1, 96), width(s, 1, 2, 160), width(s, 2, 3, 110), width(s, 3, 4, 170), width(s, 4, 5, 150), width(s, 5, 6, 150), width(s, 6, 7, 130), width(s, 7, 8, 300), width(s, 8, 9, 100), width(s, 9, 10, 250));
  q.push(...catatanRows(1, rows));
  q.push({ addBanding: { bandedRange: { range: R(s, 0, rows, 0, 10), rowProperties: { headerColor: hex(C.ink), firstBandColor: hex(C.white), secondBandColor: hex(C.band) } } } });
  q.push({ setBasicFilter: { filter: { range: R(s, 0, rows, 0, 10) } } });
  q.push(cond(R(s, 1, rows, 2, 3), { type: "TEXT_EQ", values: ["Pengeluaran"] }, { textFormat: { foregroundColor: hex(C.accent), bold: true } }));
  q.push(cond(R(s, 1, rows, 2, 3), { type: "TEXT_EQ", values: ["Pemasukan"] }, { textFormat: { foregroundColor: hex(C.ok), bold: true } }));
  q.push(cond(R(s, 1, rows, 2, 3), { type: "TEXT_EQ", values: ["Transfer"] }, { textFormat: { foregroundColor: hex(C.slate), bold: true } }));
  q.push(cond(R(s, 1, rows, 9, 10), { type: "TEXT_STARTS_WITH", values: ["⚠"] }, { textFormat: { foregroundColor: hex(C.bad), bold: true }, backgroundColor: hex(C.badSoft) }));
  q.push(cond(R(s, 1, rows, 9, 10), { type: "TEXT_STARTS_WITH", values: ["✓"] }, { textFormat: { foregroundColor: hex(C.ok) } }));
  q.push({ addProtectedRange: { protectedRange: { range: R(s, 0, rows, 0, 1), description: "ID dipakai untuk menyinkronkan baris dengan aplikasi. Jangan diubah.", warningOnly: true } } });
  q.push({ addProtectedRange: { protectedRange: { range: R(s, 0, rows, 8, 10), description: "Diisi otomatis oleh Djiwa Pay.", warningOnly: true } } });

  /* --- Ringkasan --- */
  const r = SHEET.ringkasan;
  q.push(width(r, 0, 1, 24), width(r, 1, 2, 190), width(r, 2, 3, 150), width(r, 3, 4, 150), width(r, 4, 5, 150), width(r, 5, 6, 150), width(r, 6, 7, 150), width(r, 7, 8, 150), width(r, 8, 9, 150), width(r, 9, 10, 24));
  q.push(fmt(R(r, 0, 60, 0, 12), { bg: C.cream, color: C.ink }));
  title(r, "", 9);
  q.push(height(r, 1, 2, 48), fmt(R(r, 2, 3, 1, 9), { color: C.mute, size: 10, italic: true }));
  q.push(fmt(R(r, 4, 5, 1, 2), { color: C.mute, bold: true, size: 10 }), fmt(R(r, 4, 5, 2, 3), { bg: C.white, bold: true, size: 12, num: MONTH, align: "CENTER", color: C.accent }), height(r, 4, 5, 34));
  q.push(list(R(r, 4, 5, 2, 3), "=Referensi!$H$2:$H$25", "Pilih bulan yang ingin dilihat"));
  for (const [i, c0] of [1, 3, 5, 7].entries()) {          // four KPI cards: B:C, D:E, F:G, H:I
    q.push(merge(R(r, 6, 7, c0, c0 + 2)), merge(R(r, 7, 8, c0, c0 + 2)), merge(R(r, 8, 9, c0, c0 + 2)));
    q.push(fmt(R(r, 6, 9, c0, c0 + 2), { bg: C.white, pad: 14, align: "LEFT" }));
    q.push(fmt(R(r, 6, 7, c0, c0 + 2), { color: C.mute, bold: true, size: 9 }));
    q.push(fmt(R(r, 7, 8, c0, c0 + 2), { bold: true, size: 20, color: [C.ok, C.accent, C.ink, C.slate][i], num: i === 3 ? PCT : IDR }));
    q.push(fmt(R(r, 8, 9, c0, c0 + 2), { color: C.faint, size: 9, num: { type: "PERCENT", pattern: '+0%" vs bulan lalu";-0%" vs bulan lalu";"sama dengan bulan lalu"' } }));
  }
  q.push(height(r, 6, 7, 26), height(r, 7, 8, 44), height(r, 8, 9, 24));
  q.push(fmt(R(r, 10, 11, 1, 9), { size: 13, bold: true, color: C.ink }));
  q.push(fmt(R(r, 11, 12, 1, 6), { bg: C.ink, color: C.white, bold: true, pad: 10 }), height(r, 11, 12, 30));
  q.push(fmt(R(r, 12, 32, 1, 6), { bg: C.white, pad: 10 }), bottomLine(R(r, 12, 32, 1, 6)), fmt(R(r, 12, 32, 2, 3), { num: IDR, align: "RIGHT", bg: C.white, pad: 10 }), fmt(R(r, 12, 32, 3, 4), { num: PCT, align: "RIGHT", bg: C.white, pad: 10 }), fmt(R(r, 12, 32, 4, 6), { num: IDR, align: "RIGHT", bg: C.white, pad: 10 }));
  q.push(cond(R(r, 12, 32, 5, 6), { type: "NUMBER_LESS", values: ["0"] }, { textFormat: { foregroundColor: hex(C.bad), bold: true } }));
  q.push(fmt(R(r, 34, 35, 1, 9), { size: 13, bold: true, color: C.ink }));
  q.push(fmt(R(r, 35, 36, 1, 5), { bg: C.ink, color: C.white, bold: true, pad: 10 }), height(r, 35, 36, 30));
  q.push(fmt(R(r, 36, 48, 1, 5), { bg: C.white, pad: 10 }), bottomLine(R(r, 36, 48, 1, 5)), fmt(R(r, 36, 48, 1, 2), { num: MON, bg: C.white, pad: 10 }), fmt(R(r, 36, 48, 2, 5), { num: IDR, align: "RIGHT", bg: C.white, pad: 10 }));
  q.push(cond(R(r, 36, 48, 4, 5), { type: "NUMBER_LESS", values: ["0"] }, { textFormat: { foregroundColor: hex(C.bad), bold: true } }));
  const chartPos = (row: number, col: number, w: number, h: number) => ({ overlayPosition: { anchorCell: { sheetId: r, rowIndex: row, columnIndex: col }, offsetXPixels: 12, offsetYPixels: 0, widthPixels: w, heightPixels: h } });
  const src = (c0: number, c1: number, r0: number, r1: number) => ({ sourceRange: { sources: [R(r, r0, r1, c0, c1)] } });
  q.push({ addChart: { chart: { spec: { title: "Pengeluaran per kategori", pieChart: { legendPosition: "RIGHT_LEGEND", domain: src(1, 2, 12, 32), series: src(2, 3, 12, 32), pieHole: 0.55 }, backgroundColorStyle: { rgbColor: hex(C.white) } }, position: chartPos(10, 6, 420, 360) } } });
  q.push({ addChart: { chart: { spec: { title: "Pemasukan vs pengeluaran, 12 bulan", basicChart: { chartType: "COLUMN", legendPosition: "BOTTOM_LEGEND", axis: [{ position: "BOTTOM_AXIS" }, { position: "LEFT_AXIS", format: { fontFamily: FONT } }], domains: [{ domain: src(1, 2, 35, 48) }], series: [{ series: src(2, 3, 35, 48), targetAxis: "LEFT_AXIS", colorStyle: { rgbColor: hex(C.ok) } }, { series: src(3, 4, 35, 48), targetAxis: "LEFT_AXIS", colorStyle: { rgbColor: hex(C.accent) } }], headerCount: 1 }, backgroundColorStyle: { rgbColor: hex(C.white) } }, position: chartPos(34, 6, 420, 300) } } });

  /* --- the plain tables --- */
  const table = (id: number, widths: number[], headerRow: number, ncols: number, rowsN = 40) => {
    q.push(fmt(R(id, 0, 60, 0, 12), { bg: C.cream, color: C.ink }), width(id, 0, 1, 24));
    widths.forEach((w, i) => q.push(width(id, i + 1, i + 2, w)));
    title(id, "", ncols + 1);
    q.push(height(id, 1, 2, 48), fmt(R(id, 2, 3, 1, ncols + 1), { color: C.mute, italic: true }));
    header(id, headerRow, 1, ncols + 1);
    body(id, headerRow + 1, headerRow + 1 + rowsN, 1, ncols + 1);
  };
  table(SHEET.anggaran, [200, 150, 150, 150, 110, 150], 3, 6);
  q.push(fmt(R(SHEET.anggaran, 4, 44, 2, 5), { num: IDR, align: "RIGHT", bg: C.white, pad: 10 }), fmt(R(SHEET.anggaran, 4, 44, 5, 6), { num: PCT, align: "RIGHT", bg: C.white, pad: 10 }));
  q.push(cond(R(SHEET.anggaran, 4, 44, 5, 6), { type: "NUMBER_GREATER_THAN_EQ", values: ["1"] }, { backgroundColor: hex(C.badSoft), textFormat: { foregroundColor: hex(C.bad), bold: true } }));
  q.push(cond(R(SHEET.anggaran, 4, 44, 5, 6), { type: "NUMBER_BETWEEN", values: ["0.8", "0.9999"] }, { backgroundColor: hex(C.warnSoft), textFormat: { foregroundColor: hex(C.warn), bold: true } }));
  table(SHEET.tagihan, [220, 150, 170, 150, 170], 3, 5);
  q.push(fmt(R(SHEET.tagihan, 4, 44, 2, 3), { num: IDR, align: "RIGHT", bg: C.white, pad: 10 }), fmt(R(SHEET.tagihan, 4, 44, 3, 4), { align: "CENTER", bg: C.white }));
  q.push(cond(R(SHEET.tagihan, 4, 44, 4, 5), { type: "TEXT_EQ", values: ["Lunas"] }, { textFormat: { foregroundColor: hex(C.ok), bold: true } }), cond(R(SHEET.tagihan, 4, 44, 4, 5), { type: "TEXT_EQ", values: ["Belum"] }, { textFormat: { foregroundColor: hex(C.accent), bold: true } }));
  table(SHEET.tujuan, [220, 150, 150, 150, 120, 170], 3, 6);
  q.push(fmt(R(SHEET.tujuan, 4, 44, 2, 5), { num: IDR, align: "RIGHT", bg: C.white, pad: 10 }), fmt(R(SHEET.tujuan, 4, 44, 5, 6), { num: PCT, align: "RIGHT", bg: C.white, pad: 10 }));
  q.push(cond(R(SHEET.tujuan, 4, 44, 5, 6), { type: "NUMBER_GREATER_THAN_EQ", values: ["1"] }, { backgroundColor: hex(C.okSoft), textFormat: { foregroundColor: hex(C.ok), bold: true } }));
  table(SHEET.hutang, [200, 140, 150, 150, 120, 260], 3, 6);
  q.push(fmt(R(SHEET.hutang, 4, 44, 3, 4), { num: IDR, align: "RIGHT", bg: C.white, pad: 10 }), fmt(R(SHEET.hutang, 4, 44, 4, 5), { num: DATE, bg: C.white, pad: 10 }));
  table(SHEET.aset, [240, 160, 170], 3, 3);
  q.push(fmt(R(SHEET.aset, 4, 44, 3, 4), { num: IDR, align: "RIGHT", bg: C.white, pad: 10 }));

  /* --- Referensi and Panduan --- */
  const f = SHEET.referensi;
  q.push(fmt(R(f, 0, 80, 0, 10), { bg: C.white, color: C.mute, size: 10, pad: 8 }), fmt(R(f, 0, 1, 0, 10), { bg: C.ink, color: C.white, bold: true }), fmt(R(f, 1, 26, 7, 8), { num: MONTH }));
  [140, 24, 200, 200, 200, 200, 24, 150].forEach((w, i) => q.push(width(f, i, i + 1, w)));
  const g = SHEET.panduan;
  q.push(fmt(R(g, 0, 60, 0, 4), { bg: C.cream, color: C.ink }), width(g, 0, 1, 24), width(g, 1, 2, 760), fmt(R(g, 1, 2, 1, 2), { size: 20, bold: true }), height(g, 1, 2, 48), fmt(R(g, 3, 40, 1, 2), { wrap: "WRAP", size: 11, valign: "TOP", pad: 6 }));
  return q;
}

export type Static = {
  catNames: { expense: string[]; income: string[]; all: string[] }; accountNames: string[]; months: number[]; monthNow: number;
  budgets: [string, number][]; bills: [string, number, number, string, string][]; goals: [string, number, number, string][];
  debts: [string, string, number, number | string, string, string][]; loans?: [string, string, number, number, number | null][]; assets: [string, string, number][]; now: string;
};
type Cell = string | number;

/** Static content and formulas for every sheet except Catatan's data rows. Sent with USER_ENTERED. */
export function contentData(d: Static, initial = true): { range: string; values: Cell[][] }[] {
  const out: { range: string; values: Cell[][] }[] = [];
  const put = (sheet: string, a1: string, values: Cell[][]) => out.push({ range: `${sheet}!${a1}`, values });
  const row = (n: number) => String(n);
  const inM = (kind: string, extra = "") => `SUMIFS(Catatan!$G$2:$G,Catatan!$C$2:$C,"${kind}"${extra},Catatan!$B$2:$B,">="&$C$5,Catatan!$B$2:$B,"<"&EDATE($C$5,1))`;
  const prev = (kind: string) => `SUMIFS(Catatan!$G$2:$G,Catatan!$C$2:$C,"${kind}",Catatan!$B$2:$B,">="&EDATE($C$5,-1),Catatan!$B$2:$B,"<"&$C$5)`;

  put("Catatan", "A1:J1", [[...CATATAN_HEADERS]]);

  put("Ringkasan", "B2", [["Djiwa Pay · Ringkasan keuangan"]]);
  put("Ringkasan", "B3", [["Semua angka dihitung otomatis dari sheet Catatan. Pilih bulan di bawah."]]);
  if (initial) put("Ringkasan", "B5:C5", [["Bulan", d.monthNow]]);   // later syncs never overwrite the month the user picked
  put("Ringkasan", "B7", [["PEMASUKAN"]]); put("Ringkasan", "D7", [["PENGELUARAN"]]); put("Ringkasan", "F7", [["SELISIH BULAN INI"]]); put("Ringkasan", "H7", [["TINGKAT TABUNGAN"]]);
  put("Ringkasan", "B8", [[`=${inM("Pemasukan")}`]]); put("Ringkasan", "D8", [[`=${inM("Pengeluaran")}`]]); put("Ringkasan", "F8", [["=B8-D8"]]); put("Ringkasan", "H8", [["=IFERROR(F8/B8,0)"]]);
  put("Ringkasan", "B9", [[`=IFERROR(B8/${prev("Pemasukan")}-1,0)`]]); put("Ringkasan", "D9", [[`=IFERROR(D8/${prev("Pengeluaran")}-1,0)`]]);
  put("Ringkasan", "F9", [[`=IFERROR((B8-D8)/(${prev("Pemasukan")}-${prev("Pengeluaran")})-1,0)`]]);
  put("Ringkasan", "B11", [["Pengeluaran per kategori"]]);
  put("Ringkasan", "B12:F12", [["Kategori", "Jumlah", "Porsi", "Anggaran", "Sisa"]]);
  const cats: Cell[][] = [];
  for (let i = 0; i < 20; i++) { const n = 13 + i, ref = `Referensi!$C${2 + i}`;
    cats.push([`=IF(${ref}="","",${ref})`, `=IF(B${n}="","",${inM("Pengeluaran", `,Catatan!$D$2:$D,B${n}`)})`, `=IF(B${n}="","",IFERROR(C${n}/$D$8,0))`, `=IF(B${n}="","",IFERROR(VLOOKUP(B${n},Anggaran!$B$5:$C$44,2,FALSE),""))`, `=IF(OR(B${n}="",E${n}=""),"",E${n}-C${n})`]); }
  put("Ringkasan", "B13:F32", cats);
  put("Ringkasan", "B35", [["Tren 12 bulan"]]);
  put("Ringkasan", "B36:E36", [["Bulan", "Pemasukan", "Pengeluaran", "Selisih"]]);
  const trend: Cell[][] = [];
  for (let i = 0; i < 12; i++) { const n = 37 + i, m = `$B${n}`, within = `Catatan!$B$2:$B,">="&${m},Catatan!$B$2:$B,"<"&EDATE(${m},1)`;
    trend.push([`=EDATE($C$5,${i - 11})`, `=SUMIFS(Catatan!$G$2:$G,Catatan!$C$2:$C,"Pemasukan",${within})`, `=SUMIFS(Catatan!$G$2:$G,Catatan!$C$2:$C,"Pengeluaran",${within})`, `=C${n}-D${n}`]); }
  put("Ringkasan", "B37:E48", trend);

  put("Anggaran", "B2", [["Anggaran bulanan"]]); put("Anggaran", "B3", [["Batas diatur di aplikasi. Terpakai dihitung dari Catatan untuk bulan yang dipilih di Ringkasan."]]);
  put("Anggaran", "B4:G4", [["Kategori", "Batas bulanan", "Terpakai", "Sisa", "Pemakaian", "Status"]]);
  const bud: Cell[][] = d.budgets.length ? d.budgets.map(([name, limit], i) => { const n = 5 + i;
    return [name, limit, `=SUMIFS(Catatan!$G$2:$G,Catatan!$D$2:$D,B${n},Catatan!$C$2:$C,"Pengeluaran",Catatan!$B$2:$B,">="&Ringkasan!$C$5,Catatan!$B$2:$B,"<"&EDATE(Ringkasan!$C$5,1))`, `=C${n}-D${n}`, `=IFERROR(D${n}/C${n},0)`, `=IF(F${n}>=1,"Lewat batas",IF(F${n}>=0.8,"Hampir habis","Aman"))`]; })
    : [["Belum ada anggaran. Atur di aplikasi: Rencana → Anggaran", "", "", "", "", ""]];
  put("Anggaran", `B5:G${4 + bud.length}`, bud);

  put("Tagihan", "B2", [["Tagihan rutin"]]); put("Tagihan", "B3", [["Status untuk bulan berjalan. Diperbarui dari aplikasi."]]);
  put("Tagihan", "B4:F4", [["Tagihan", "Nominal", "Jatuh tempo (tgl)", "Bulan ini", "Terakhir dibayar"]]);
  const bills: Cell[][] = d.bills.length ? d.bills.map(([name, amount, day, status, last]) => [name, amount, day, status, last]) : [["Belum ada tagihan. Tambahkan di aplikasi", "", "", "", ""]];
  put("Tagihan", `B5:F${4 + bills.length}`, bills);
  put("Tagihan", `B${6 + bills.length}:C${6 + bills.length}`, [["Total per bulan", `=SUM(C5:C${4 + bills.length})`]]);

  put("Tujuan", "B2", [["Tujuan menabung"]]); put("Tujuan", "B3", [["Terkumpul dihitung dari setoran di aplikasi."]]);
  put("Tujuan", "B4:G4", [["Tujuan", "Target", "Terkumpul", "Sisa", "Progres", "Setoran terakhir"]]);
  const goals: Cell[][] = d.goals.length ? d.goals.map(([name, target, saved, last], i) => { const n = 5 + i; return [name, target, saved, `=MAX(C${n}-D${n},0)`, `=IFERROR(D${n}/C${n},0)`, last]; }) : [["Belum ada tujuan. Buat di aplikasi: Rencana → Tujuan", "", "", "", "", ""]];
  put("Tujuan", `B5:G${4 + goals.length}`, goals);

  put("Hutang", "B2", [["Hutang, piutang, dan pinjaman"]]); put("Hutang", "B3", [["Untuk pinjaman, jumlah menunjukkan sisa pokok dan jatuh tempo menunjukkan tanggal setiap bulan."]]);
  put("Hutang", "B4:G4", [["Nama", "Jenis", "Jumlah", "Jatuh tempo", "Status", "Catatan"]]);
  const displayText = (value: string) => "'" + value; // USER_ENTERED parses formulas unless user text is escaped.
  const debts: Cell[][] = d.debts.map(([person, dir, amount, due, status, note]) => [person, dir, amount, due, status, note]);
  for (const [name, lender, balance, due, installment] of d.loans ?? []) {
    const payment = installment === null ? "" : `Angsuran Rp${installment.toLocaleString("id-ID")}`;
    debts.push([displayText(name), "Pinjaman", balance, `Tanggal ${due}`, balance > 0 ? "Belum lunas" : "Lunas", displayText([lender, payment].filter(Boolean).join(" · "))]);
  }
  if (!debts.length) debts.push(["Belum ada hutang, piutang, atau pinjaman", "", "", "", "", ""]);
  put("Hutang", `B5:G${4 + debts.length}`, debts);
  const dl = 4 + debts.length;
  put("Hutang", `B${dl + 2}:D${dl + 3}`, [["Piutang aktif", "", `=SUMIFS(D5:D${dl},C5:C${dl},"Piutang",F5:F${dl},"Belum lunas")`], ["Hutang aktif", "", `=SUMIFS(D5:D${dl},C5:C${dl},"Hutang",F5:F${dl},"Belum lunas")+SUMIFS(D5:D${dl},C5:C${dl},"Pinjaman",F5:F${dl},"Belum lunas")`]]);

  put("Aset", "B2", [["Aset dan kekayaan bersih"]]); put("Aset", "B3", [["Nilai aset diisi di aplikasi: Kekayaan → Aset."]]);
  put("Aset", "B4:D4", [["Aset", "Jenis", "Nilai"]]);
  const assets: Cell[][] = d.assets.length ? d.assets : [["Belum ada aset", "", ""]];
  put("Aset", `B5:D${4 + assets.length}`, assets);
  const al = 4 + assets.length;
  put("Aset", `B${al + 2}:D${al + 5}`, [["Total aset", "", `=SUM(D5:D${al})`], ["Piutang aktif", "", `=Hutang!D${dl + 2}`], ["Hutang dan pinjaman aktif", "", `=-Hutang!D${dl + 3}`], ["Kekayaan bersih", "", `=SUM(D${al + 2}:D${al + 4})`]]);

  const pad = (a: string[], n: number) => [...a, ...Array(Math.max(0, n - a.length)).fill("")];
  put("Referensi", "A1:H1", [["Jenis", "", "Kategori pengeluaran", "Kategori pemasukan", "Semua kategori", "Dompet", "", "Bulan"]]);
  put("Referensi", "A2:A4", [["Pengeluaran"], ["Pemasukan"], ["Transfer"]]);
  const col = (a: string[], n: number) => pad(a, n).map((v) => [v]);
  put("Referensi", "C2:C41", col(d.catNames.expense, 40)); put("Referensi", "D2:D41", col(d.catNames.income, 40)); put("Referensi", "E2:E41", col(d.catNames.all, 40)); put("Referensi", "F2:F41", col(d.accountNames, 40));
  put("Referensi", "H2:H25", d.months.map((m) => [m]));

  put("Panduan", "B2", [["Cara memakai spreadsheet ini"]]);
  put("Panduan", "B4:B13", [
    ["Spreadsheet ini tersambung dua arah dengan aplikasi Djiwa Pay. Perubahan di aplikasi muncul di sini, dan perubahan di sini muncul di aplikasi, biasanya dalam beberapa menit."],
    ["Catatan: satu baris = satu catatan. Ubah sel mana saja di kolom Waktu sampai Catatan. Jenis, Kategori, dan Dompet punya daftar pilihan."],
    ["Menambah catatan: ketik di baris kosong paling bawah (kolom ID dikosongkan). Setelah tersinkron, ID terisi dan Status berubah menjadi ✓."],
    ["Menghapus catatan: hapus barisnya. Catatan itu juga terhapus di aplikasi. Menyalin satu baris membuat catatan baru."],
    ["Transfer antar dompet: pilih Jenis “Transfer”, isi Dompet (asal) dan Ke dompet (tujuan). Kategori diabaikan."],
    ["Jangan mengubah kolom ID, Sumber, dan Status. Jika sebuah baris salah, kolom Status menjelaskan alasannya dan baris itu tidak mengubah apa pun sampai diperbaiki."],
    ["Bila catatan yang sama berubah di dua sisi sebelum sempat tersinkron, versi di aplikasi yang dipakai."],
    ["Sheet Ringkasan, Anggaran, Tagihan, Tujuan, Hutang, dan Aset dihitung otomatis. Jangan diedit; ubah datanya di aplikasi."],
    ["Daftar kategori dan dompet ada di sheet Referensi. Nama dompet dan kategori baru dari aplikasi masuk ke sana sendiri."],
    [`Terakhir disinkronkan: ${d.now}`],
  ]);
  return out;
}
