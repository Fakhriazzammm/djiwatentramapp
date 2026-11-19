import { describe, expect, test } from "bun:test";
import { DEFAULT_FEES, feeOf, heldLots, parseFees, parseTrade, replay, type Trade } from "./model";

const T = (id: string, side: "buy" | "sell", lots: number, price: number, at: string, ticker = "BBCA"): Trade => ({ id, ticker, side, lots, price, fee: 0, at, note: "" });
const NOW = new Date("2026-11-19T02:00:00Z");

describe("parseTrade", () => {
  test("accepts a clean buy and normalises the ticker", () => {
    const r = parseTrade({ ticker: " bbca ", side: "buy", lots: 5, price: 9725, note: " patungan " }, NOW);
    expect(r).toMatchObject({ ok: true, trade: { ticker: "BBCA", side: "buy", lots: 5, price: 9725, note: "patungan", at: NOW.toISOString() } });
  });
  test.each([
    [{ ticker: "BB", side: "buy", lots: 1, price: 1 }, "INVALID_TICKER"], [{ ticker: "BBCA1", side: "buy", lots: 1, price: 1 }, "INVALID_TICKER"],
    [{ ticker: "BBCA", side: "x", lots: 1, price: 1 }, "INVALID_SIDE"], [{ ticker: "BBCA", side: "buy", lots: 0, price: 1 }, "INVALID_LOTS"],
    [{ ticker: "BBCA", side: "buy", lots: 1.5, price: 1 }, "INVALID_LOTS"], [{ ticker: "BBCA", side: "buy", lots: 1, price: 0 }, "INVALID_PRICE"],
    [{ ticker: "BBCA", side: "buy", lots: 1, price: 99_999_999 }, "INVALID_PRICE"], [{ ticker: "BBCA", side: "buy", lots: 1, price: 5, at: "2030-01-01" }, "INVALID_DATE"],
    [{ ticker: "BBCA", side: "buy", lots: 1, price: 5, at: "nope" }, "INVALID_DATE"],
  ])("rejects %j", (body, error) => { expect(parseTrade(body, NOW)).toEqual({ ok: false, error }); });
});

describe("fees", () => {
  test("buy 0.15% and sell 0.35% of the value, rounded to the rupiah", () => {
    expect(feeOf("buy", 4_862_500, DEFAULT_FEES)).toBe(7294);
    expect(feeOf("sell", 4_862_500, DEFAULT_FEES)).toBe(17019);
  });
  test("settings must be 0 to 5 percent", () => {
    expect(parseFees({ buy: "0,15".replace(",", "."), sell: 0.25 })).toEqual({ buy: 0.15, sell: 0.25 });
    expect(parseFees({ buy: -1, sell: 0.25 })).toBeNull(); expect(parseFees({ buy: 0.1, sell: 9 })).toBeNull(); expect(parseFees({})).toBeNull();
  });
});

describe("replay (average cost)", () => {
  test("two buys give the weighted average, as in the prototype", () => {
    const { holdings } = replay([T("a", "buy", 10, 9200, "2026-08-04T03:00:00Z"), T("b", "buy", 10, 9700, "2026-10-02T03:00:00Z")]);
    expect(holdings).toEqual([{ ticker: "BBCA", shares: 2000, lots: 20, cost: 18_900_000, avg: 9450, realized: 0 }]);
  });
  test("a sale realises against the average and keeps the average", () => {
    const { holdings } = replay([T("a", "buy", 10, 9000, "2026-01-01T00:00:00Z"), T("b", "buy", 10, 10000, "2026-02-01T00:00:00Z"), T("c", "sell", 5, 11000, "2026-03-01T00:00:00Z")]);
    expect(holdings[0]).toMatchObject({ lots: 15, avg: 9500, cost: 14_250_000, realized: 750_000 });
  });
  test("selling more than held is an error that names the trade", () => {
    expect(replay([T("a", "buy", 2, 100, "2026-01-01T00:00:00Z"), T("b", "sell", 3, 100, "2026-02-01T00:00:00Z")]).error).toEqual({ id: "b", ticker: "BBCA" });
  });
  test("order follows the trade date, not insertion order", () => {
    expect(replay([T("sell", "sell", 1, 120, "2026-02-01T00:00:00Z"), T("buy", "buy", 1, 100, "2026-01-01T00:00:00Z")]).error).toBeUndefined();
    expect(replay([T("buy", "buy", 1, 100, "2026-03-01T00:00:00Z"), T("sell", "sell", 1, 120, "2026-02-01T00:00:00Z")]).error).toBeDefined();
  });
  test("a fully sold stock leaves only its realised result, and re-buying starts the average fresh", () => {
    const sold = replay([T("a", "buy", 1, 100, "2026-01-01T00:00:00Z"), T("b", "sell", 1, 150, "2026-02-01T00:00:00Z")]).holdings;
    expect(sold).toEqual([{ ticker: "BBCA", shares: 0, lots: 0, cost: 0, avg: 0, realized: 5000 }]);
    const again = replay([T("a", "buy", 1, 100, "2026-01-01T00:00:00Z"), T("b", "sell", 1, 150, "2026-02-01T00:00:00Z"), T("c", "buy", 1, 200, "2026-03-01T00:00:00Z")]).holdings[0];
    expect(again).toMatchObject({ avg: 200, lots: 1, realized: 5000 });
  });
  test("heldLots", () => { expect(heldLots([T("a", "buy", 4, 100, "2026-01-01T00:00:00Z")], "BBCA")).toBe(4); expect(heldLots([], "BBCA")).toBe(0); });
});
