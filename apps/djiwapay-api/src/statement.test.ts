import { describe, expect, test } from "bun:test";
import { chunkText, cleanRows, parseStatement } from "./statement.js";

const reply = (obj: unknown) => (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] }))) as unknown as typeof fetch;

describe("bank statement reading", () => {
  test("rows are cleaned: bad dates, zero amounts and unknown directions are dropped", () => {
    const r = cleanRows([{ date: "2026-11-02", description: "  KOPI   ARA ", amount: 17000.4, direction: "out", balance: 100 }, { date: "02/11", amount: 5, direction: "out" }, { date: "2026-11-03", amount: 0, direction: "in" }, { date: "2026-11-03", amount: 9, direction: "sideways" }]);
    expect(r).toEqual([{ date: "2026-11-02", description: "KOPI ARA", amount: 17000, direction: "out", balance: 100 }]);
  });
  test("long text is cut into pieces on line boundaries", () => {
    const text = Array.from({ length: 900 }, (_, i) => `line ${i} ${"x".repeat(30)}`).join("\n"), parts = chunkText(text);
    expect(parts.length).toBeGreaterThan(2); expect(parts.every((p) => p.length <= 9100)).toBe(true); expect(parts.join("").replace(/\n/g, "").length).toBe(text.replace(/\n/g, "").length);
  });
  test("opening + movements = closing is reported as balanced, and a wrong read is not", async () => {
    const body = { bank: "BCA", accountHint: "4821", periodFrom: "2026-11-01", periodTo: "2026-11-30", opening: 1000000, closing: 1250000, rows: [{ date: "2026-11-02", description: "GAJI", amount: 500000, direction: "in", balance: 1500000 }, { date: "2026-11-05", description: "KOPI", amount: 250000, direction: "out", balance: 1250000 }] };
    const text = "REKENING KORAN BCA periode november 2026\n".repeat(5);
    const ok = await parseStatement(text, { key: "k", fetchImpl: reply(body) });
    expect(ok).toMatchObject({ bank: "BCA", accountHint: "4821", balanced: true, chunks: 1 }); expect(ok.rows).toHaveLength(2);
    const bad = await parseStatement(text, { key: "k", fetchImpl: reply({ ...body, closing: 999 }) });
    expect(bad.balanced).toBe(false);
  });
  test("account numbers are masked before the text is sent", async () => {
    let seen = ""; const f = (async (_u: string, init: RequestInit) => { seen = String(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: "{\"rows\":[]}" } }] })); }) as unknown as typeof fetch;
    await parseStatement("No. Rekening 1234567890 atas nama X ".repeat(8), { key: "k", fetchImpl: f });
    expect(seen).not.toContain("1234567890"); expect(seen).toContain("7890");
  });
});
