import { describe, expect, test } from "bun:test";
import { COL, OK, fromSerial, hashOf, parseRow, planSync, rowOf, toSerial, type EntryRow, type Names, type SheetRow } from "./model";

const names: Names = { catName: { makan: "Makan & minum", belanja: "Belanja", gaji: "Gaji", transfer: "Transfer", lainnya: "Lainnya" }, accName: { tunai: "Tunai", bca: "BCA ••1234", gopay: "GoPay" } };
const e = (over: Partial<EntryRow> = {}): EntryRow => ({ id: "e1", kind: "out", amount: 25000, categoryId: "makan", accountId: "gopay", at: "2026-11-15T06:45:00.000Z", note: "Kopi Kenangan", source: "email", ...over });
const sheetRow = (row: number, entry: EntryRow, over: unknown[] = []): SheetRow => { const cells = rowOf(entry, names); over.forEach((v, i) => { if (v !== undefined) cells[i] = v as never; }); return { row, cells }; };
let n = 0; const newId = () => `sh-${++n}`;
const plan = (entries: EntryRow[], mapping: Record<string, string>, rows: SheetRow[]) => planSync({ entries, mapping: new Map(Object.entries(mapping)), rows, names, newId });

describe("serial dates", () => {
  test("round-trips WIB wall-clock time", () => {
    const iso = "2026-11-15T06:45:00.000Z";                       // 13:45 WIB
    expect(toSerial(iso)).toBeCloseTo(46341 + (13 * 60 + 45) / 1440, 6);
    expect(fromSerial(toSerial(iso))).toBe(iso);
  });
});

describe("reading a sheet row", () => {
  test("understands names in any case and a numeric date", () => {
    const p = parseRow(["", toSerial("2026-11-15T06:45:00Z"), "pengeluaran", "makan & MINUM", "gopay", "", "25000", " Kopi ", "", ""], names);
    expect(p).toMatchObject({ ok: true, entry: { kind: "out", amount: 25000, categoryId: "makan", accountId: "gopay", note: "Kopi" } });
  });
  test("explains what is wrong, in the sheet's own words", () => {
    const base = ["", toSerial("2026-11-15T06:45:00Z"), "Pengeluaran", "Makan & minum", "GoPay", "", 1000, "x"];
    expect((parseRow([...base.slice(0, 1), "bukan tanggal", ...base.slice(2)], names) as any).error).toContain("Waktu");
    expect((parseRow([...base.slice(0, 2), "Hadiah", ...base.slice(3)], names) as any).error).toContain("Jenis");
    expect((parseRow([...base.slice(0, 6), 0, "x"], names) as any).error).toContain("Jumlah");
    expect((parseRow([...base.slice(0, 4), "Dompet lain", "", 1000], names) as any).error).toContain("Dompet");
    expect((parseRow([...base.slice(0, 3), "Kategori baru", ...base.slice(4)], names) as any).error).toContain("Kategori");
    expect((parseRow([...base.slice(0, 2), "Transfer", "", "GoPay", "", 1000], names) as any).error).toContain("Ke dompet");
    expect(parseRow(["", "", "", "", "", "", "", ""], names)).toMatchObject({ ok: false, blank: true });
  });
  test("a note that looks like a formula stays literal", () => {
    expect(rowOf(e({ note: "=SUM(A1)" }), names)[COL.note]).toBe("'=SUM(A1)");
  });
});

describe("two-way plan", () => {
  const A = e();
  const H = hashOf(A);

  test("nothing changed: nothing to do", () => {
    const p = plan([A], { e1: H }, [sheetRow(2, A)]);
    expect(p.toApp.upserts).toEqual([]); expect(p.toApp.deletes).toEqual([]);
    expect(p.toSheet).toEqual({ rewrites: [], statuses: [], appends: [], deletes: [] });
    expect(p.mapping.get("e1")).toBe(H);
  });

  test("a new entry in the app is appended to the sheet", () => {
    const p = plan([A], {}, []);
    expect(p.toSheet.appends).toHaveLength(1);
    expect(p.toSheet.appends[0][COL.id]).toBe("e1");
    expect(p.mapping.get("e1")).toBe(H);
  });

  test("an edit in the sheet reaches the app, keeping the fields the sheet does not show", () => {
    const p = plan([A], { e1: H }, [sheetRow(2, A, [undefined, undefined, undefined, "Belanja", undefined, undefined, 30000])]);
    expect(p.toApp.upserts).toHaveLength(1);
    expect(p.toApp.upserts[0]).toMatchObject({ id: "e1", amount: 30000, categoryId: "belanja", source: "email", fromSheet: true });
    expect(p.mapping.get("e1")).toBe(hashOf(p.toApp.upserts[0]));
    expect(p.toSheet.rewrites[0].row).toBe(2);
  });

  test("an edit in the app reaches the sheet", () => {
    const B = e({ amount: 40000 });
    const p = plan([B], { e1: H }, [sheetRow(2, A)]);
    expect(p.toApp.upserts).toEqual([]);
    expect(p.toSheet.rewrites).toEqual([{ row: 2, values: rowOf(B, names) }]);
    expect(p.mapping.get("e1")).toBe(hashOf(B));
  });

  test("when both sides changed, the app wins and the sheet row is rewritten", () => {
    const B = e({ amount: 40000 });
    const p = plan([B], { e1: H }, [sheetRow(2, A, [undefined, undefined, undefined, undefined, undefined, undefined, 99999])]);
    expect(p.toApp.upserts).toEqual([]);
    expect(p.toSheet.rewrites[0].values[COL.amount]).toBe(40000);
  });

  test("a row deleted in the sheet deletes the entry; one deleted in the app deletes the row", () => {
    expect(plan([A], { e1: H }, []).toApp.deletes).toEqual(["e1"]);
    const p = plan([], { e1: H }, [sheetRow(5, A)]);
    expect(p.toSheet.deletes).toEqual([5]);
    expect(p.mapping.has("e1")).toBe(false);
  });

  test("an app edit beats a sheet deletion: the row comes back", () => {
    const B = e({ amount: 40000 });
    const p = plan([B], { e1: H }, []);
    expect(p.toApp.deletes).toEqual([]);
    expect(p.toSheet.appends[0][COL.amount]).toBe(40000);
  });

  test("a new row typed in the sheet becomes an entry and gets its ID written back", () => {
    const typed: SheetRow = { row: 7, cells: ["", toSerial("2026-11-16T03:00:00Z"), "Pemasukan", "Gaji", "BCA ••1234", "", 5000000, "Gaji November"] };
    const p = plan([], {}, [typed]);
    expect(p.toApp.upserts[0]).toMatchObject({ kind: "in", amount: 5000000, categoryId: "gaji", accountId: "bca", source: "sheet" });
    expect(p.toSheet.rewrites[0].row).toBe(7);
    expect(String(p.toSheet.rewrites[0].values[COL.id])).toMatch(/^sh-/);
  });

  test("a copied row (same ID twice) makes a new entry; the first keeps the ID", () => {
    const p = plan([A], { e1: H }, [sheetRow(2, A), sheetRow(3, A)]);
    expect(p.toApp.upserts).toHaveLength(1);
    expect(p.toApp.upserts[0].id).not.toBe("e1");
    expect(p.toSheet.rewrites.map((r) => r.row)).toEqual([3]);
  });

  test("a bad edit is explained in the Status column and the entry is left alone", () => {
    const p = plan([A], { e1: H }, [sheetRow(2, A, [undefined, undefined, undefined, undefined, undefined, undefined, "banyak"])]);
    expect(p.toApp.upserts).toEqual([]);
    expect(p.toSheet.statuses).toEqual([{ row: 2, value: "⚠ Jumlah harus lebih dari 0" }]);
    expect(p.mapping.get("e1")).toBe(H);
  });

  test("an unknown ID is never adopted silently", () => {
    const p = plan([], {}, [sheetRow(2, A)]);
    expect(p.toApp.upserts).toEqual([]);
    expect(p.toSheet.statuses[0].value).toContain("ID tidak dikenal");
  });

  test("after a rebuilt sheet (no mapping) matching rows are adopted, differing rows take the app's values", () => {
    const B = e({ amount: 40000 });
    expect(plan([A], {}, [sheetRow(2, A)]).toSheet.rewrites).toEqual([]);
    expect(plan([B], {}, [sheetRow(2, A)]).toSheet.rewrites).toHaveLength(1);
  });

  test("blank rows and a stale status text are handled", () => {
    const stale = sheetRow(2, A); stale.cells[COL.status] = "⚠ lama";
    const p = plan([A], { e1: H }, [{ row: 1, cells: [] }, stale]);
    expect(p.toSheet.statuses).toEqual([{ row: 2, value: OK }]);
  });
});

test('confirmed itemized receipt edits must go through its receipt editor',()=>{
  const entry=e({source:'receipt',receiptLocked:true});
  const cells=rowOf(entry,names);cells[COL.amount]=99000;
  const result=plan([entry],{[entry.id]:hashOf(entry)},[{row:2,cells}]);
  expect(result.toApp.upserts).toHaveLength(0);
  expect(result.toSheet.rewrites[0].values[COL.amount]).toBe(25000);
  expect(result.toSheet.statuses.some(s=>s.value.includes('rincian struk'))).toBe(true);
});
