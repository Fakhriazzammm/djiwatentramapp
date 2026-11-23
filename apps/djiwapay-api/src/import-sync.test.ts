import { describe, expect, test } from "bun:test";
import { fillCategories } from "./gmail-import.js";

type Call = { text: string; params: unknown[] };
const fake = (rows: unknown[]) => { const calls: Call[] = []; const db = { query: async (text: string, params: unknown[] = []) => { calls.push({ text, params }); return { rows: /select id, note, amount, kind/.test(text) ? rows : [] }; }, tx: async (fn: (q: unknown) => unknown) => fn(db) }; return { db: db as never, calls }; };

describe("old-mail import fills categories afterwards", () => {
  test("unknown ones get the category the rules or model give, unsure ones stay as they are", async () => {
    const { db, calls } = fake([{ id: "em-1", note: "KOPI ARA", amount: "17000", kind: "out" }, { id: "em-2", note: "???", amount: "5000", kind: "out" }, { id: "em-3", note: "GAJI", amount: "9000000", kind: "in" }]);
    const picks = new Map([["em-1", { categoryId: "makan", confidence: 0.9, source: "ai" as const }], ["em-2", { categoryId: null, confidence: 0.2, source: "none" as const }], ["em-3", { categoryId: "gaji", confidence: 1, source: "rule" as const }]]);
    const changed = await fillCategories(db, "u1", "imp1", (async () => picks) as never);
    expect(changed).toBe(2);
    const updates = calls.filter((c) => /update finance.entries set category_id/.test(c.text));
    expect(updates.map((u) => [u.params[1], u.params[2], u.params[3]])).toEqual([["em-1", "makan", true], ["em-3", "gaji", false]]);   // the AI one is tagged, the rule one is not
  });
  test("nothing to fill means nothing is written", async () => {
    const { db, calls } = fake([]);
    expect(await fillCategories(db, "u1", "imp1", (async () => new Map()) as never)).toBe(0);
    expect(calls.some((c) => /update finance.entries/.test(c.text))).toBe(false);
  });
});
