import { describe, expect, test } from "bun:test";
import { fxRate, isCurrency, toRupiah } from "./fx.js";

const memory = () => { const rows: Record<string, any>[] = []; return { rows, query: async (sql: string, p: any[] = []) => {
  if (sql.startsWith("select rate, source")) return { rows: rows.filter((r) => r.currency === p[0] && r.day === p[1]) };
  if (sql.startsWith("insert into finance.fx_rates")) { rows.push({ day: p[0], currency: p[1], rate: p[2], source: "frankfurter" }); return { rows: [] }; }
  if (sql.includes("order by abs")) return { rows: rows.filter((r) => r.currency === p[0]).slice(0, 1) };
  return { rows: [] };
} }; };
describe("fx", () => {
  test("currency codes", () => { expect(isCurrency("JPY")).toBe(true); expect(isCurrency("jpy")).toBe(false); expect(isCurrency("YEN")).toBe(true); expect(isCurrency("")).toBe(false); });
  test("IDR is 1 and never fetched", async () => { const r = await fxRate(memory() as any, "IDR", "2025-11-25", (() => { throw new Error("no fetch"); }) as any); expect(r?.rate).toBe(1); });
  test("fetches once, then reads the stored day", async () => {
    const db = memory(); let calls = 0;
    const f = (async () => { calls++; return new Response(JSON.stringify({ rates: { IDR: 106.34 } })); }) as any;
    expect((await fxRate(db as any, "JPY", "2025-11-25", f))?.rate).toBe(106.34);
    expect((await fxRate(db as any, "JPY", "2025-11-25", f))?.rate).toBe(106.34);
    expect(calls).toBe(1);
  });
  test("falls back to the nearest stored rate, or null", async () => {
    const down = (async () => { throw new Error("offline"); }) as any, db = memory();
    expect(await fxRate(db as any, "JPY", "2025-11-26", down)).toBeNull();
    db.rows.push({ day: "2025-11-25", currency: "JPY", rate: 106, source: "frankfurter" });
    expect((await fxRate(db as any, "JPY", "2025-11-26", down))?.source).toBe("terdekat");
  });
  test("rounds to whole rupiah", () => { expect(toRupiah(1200, 106.34)).toBe(127608); });
});
