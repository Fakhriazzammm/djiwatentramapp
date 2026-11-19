import { describe, expect, test } from "bun:test";
import { toSerial } from "../sheets/model";
import { fakeSheets } from "./fake-sheets";
import { PORTO, SAHAM, ensureTabs, parsePrices, portoRows, priceFormula, readPrices, reenterPrices, tradeRow, writeTabs } from "./sheet";
import { replay, type Trade } from "./model";

const T = (id: string, side: "buy" | "sell", lots: number, price: number, ticker = "BBCA", note = ""): Trade => ({ id, ticker, side, lots, price, fee: 100, at: "2026-10-02T03:00:00Z", note });

describe("rows", () => {
  test("trade rows are Beli/Jual with a WIB serial, and notes that look like formulas stay literal", () => {
    expect(tradeRow(T("a", "buy", 5, 9725, "BBCA", "=1+1"))).toEqual(["a", toSerial("2026-10-02T03:00:00Z"), "BBCA", "Beli", 5, 9725, 100, "'=1+1"]);
    expect(tradeRow(T("b", "sell", 2, 1))[3]).toBe("Jual");
  });
  test("portfolio rows carry the GOOGLEFINANCE formula, the app's average and a total", () => {
    const held = replay([T("a", "buy", 10, 9200), T("b", "buy", 10, 9700), T("c", "buy", 15, 3420, "TLKM")]).holdings;
    const rows = portoRows(held);
    expect(rows[0][0]).toBe("BBCA"); expect(rows[0][2]).toBe(9450); expect(rows[0][3]).toBe('=GOOGLEFINANCE("IDX:"&A2,"price")');
    expect(String(rows[0][1])).toContain('SUMIFS(Saham!$E:$E,Saham!$C:$C,A2');
    expect(rows[1][0]).toBe("TLKM"); expect(priceFormula(3)).toContain("A3");
    expect(rows[3]).toEqual(["Total", "", "", "", "=SUM(E2:E3)", "=SUM(F2:F3)", ""]);
    expect(portoRows([])).toEqual([]);
  });
});

describe("parsePrices", () => {
  test("numbers become prices; #N/A, loading text and zero are 'no price yet'", () => {
    const serial = toSerial("2026-11-18T08:49:00Z");
    const got = parsePrices([["BBCA", 20, 9450, 9725, 1, 1, serial], ["GOTO", 200, 64, "#N/A", "", "", ""], ["TLKM", 15, 3420, "Loading...", "", "", ""], ["ASII", 1, 1, 0, "", "", ""], ["XXXX", 1, 1, 5, "", "", ""]], ["BBCA", "GOTO", "TLKM", "ASII"]);
    expect(got).toEqual([{ ticker: "BBCA", price: 9725, asOf: "2026-11-18T08:49:00.000Z" }, { ticker: "GOTO", price: null, asOf: null }, { ticker: "TLKM", price: null, asOf: null }, { ticker: "ASII", price: null, asOf: null }]);
  });
});

describe("Sheets calls", () => {
  test("ensureTabs adds the two tabs once, formats only on creation, and leaves existing tabs alone", async () => {
    const g = fakeSheets();
    const a = await ensureTabs(g.f, "t", "S1");
    expect(a.created).toBe(true); expect([...g.tabs.keys()].sort()).toEqual([PORTO, SAHAM].sort());
    const batches = g.calls.filter((c) => c.endsWith(":batchUpdate")).length;
    expect(batches).toBe(2);                                         // add tabs, then format them
    const b = await ensureTabs(g.f, "t", "S1");
    expect(b).toMatchObject({ created: false, saham: a.saham, porto: a.porto });
    expect(g.calls.filter((c) => c.endsWith(":batchUpdate")).length).toBe(2);
  });
  test("only the missing tab is added when the user already has one of them", async () => {
    const g = fakeSheets(); g.tabs.set(SAHAM, 77);
    const r = await ensureTabs(g.f, "t", "S1");
    expect(r.saham).toBe(77); expect(g.tabs.get(PORTO)).toBe(r.porto);
  });
  test("a deleted spreadsheet surfaces as a 404 the worker understands", async () => {
    const g = fakeSheets(); g.failNext();
    await expect(ensureTabs(g.f, "t", "S1")).rejects.toMatchObject({ status: 404 });
  });
  test("writeTabs rewrites headers, trades and formulas; readPrices reads them back", async () => {
    const g = fakeSheets({ BBCA: [9725, toSerial("2026-11-19T02:41:00Z")] });
    const trades = [T("a", "buy", 10, 9200), T("b", "buy", 10, 9700), T("c", "buy", 200, 64, "GOTO")];
    const held = replay(trades).holdings;
    await ensureTabs(g.f, "t", "S1"); await writeTabs(g.f, "t", "S1", trades, held);
    expect(g.cells.get(`${SAHAM}!A1`)).toBe("ID"); expect(g.cells.get(`${SAHAM}!C4`)).toBe("GOTO"); expect(g.cells.get(`${PORTO}!A2`)).toBe("BBCA");
    expect(String(g.cells.get(`${PORTO}!D2`))).toStartWith("=GOOGLEFINANCE");
    const got = await readPrices(g.f, "t", "S1", held.map((h) => h.ticker));
    expect(got.find((p) => p.ticker === "BBCA")).toMatchObject({ price: 9725, asOf: "2026-11-19T02:41:00.000Z" });
    expect(got.find((p) => p.ticker === "GOTO")).toMatchObject({ price: null });
    await reenterPrices(g.f, "t", "S1", held);
    expect(String(g.cells.get(`${PORTO}!D3`))).toStartWith("=GOOGLEFINANCE");
  });
  test("a second write replaces, not duplicates, the trade rows", async () => {
    const g = fakeSheets();
    await ensureTabs(g.f, "t", "S1");
    await writeTabs(g.f, "t", "S1", [T("a", "buy", 1, 100), T("b", "buy", 1, 200)], replay([T("a", "buy", 1, 100), T("b", "buy", 1, 200)]).holdings);
    await writeTabs(g.f, "t", "S1", [T("a", "buy", 1, 100)], replay([T("a", "buy", 1, 100)]).holdings);
    expect(g.cells.get(`${SAHAM}!A2`)).toBe("a"); expect(g.cells.has(`${SAHAM}!A3`)).toBe(false);
  });
});
