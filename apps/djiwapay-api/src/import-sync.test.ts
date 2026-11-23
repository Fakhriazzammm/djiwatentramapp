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

import { categorizeStaged } from "./gmail-import.js";
describe("staged items are categorized while scanning", () => {
  test("a known pick is written into the staged read, an unsure one is only marked tried", async () => {
    const calls: { text: string; params: unknown[] }[] = [];
    const rows = [{ id: "a", parsed: { merchant: "KOPI ARA", subject: "Pembayaran", amount: 17000, kind: "out" } }, { id: "b", parsed: { merchant: "???", subject: "x", amount: 5000, kind: "out" } }];
    const db = { query: async (text: string, params: unknown[] = []) => { calls.push({ text, params }); return { rows: /select id, parsed/.test(text) ? rows : [] }; } } as never;
    const picks = new Map([["a", { categoryId: "makan-kopi", confidence: 0.9, source: "ai" as const }], ["b", { categoryId: null, confidence: 0.1, source: "none" as const }]]);
    expect(await categorizeStaged(db, "u1", "imp", (async () => picks) as never)).toBe(2);
    const w = calls.filter((c) => /update finance.inbound_messages set parsed = parsed/.test(c.text)).map((c) => JSON.parse(String(c.params[2])));
    expect(w[0]).toMatchObject({ aiTried: true, categoryId: "makan-kopi", catKnown: true, catAi: true });
    expect(w[1]).toEqual({ aiTried: true });
  });
});

import { retryAfterMs, GoogleError } from "./google-sync.js";
describe("a failing spreadsheet is left alone as long as it should be", () => {
  test("a switched-off API or a missing permission waits hours, a rate limit minutes, anything else the usual five", () => {
    expect(retryAfterMs("SHEETS_CREATE_403:accessNotConfigured")).toBe(6 * 3_600_000);
    expect(retryAfterMs("SHEETS_CREATE_403")).toBe(6 * 3_600_000);
    expect(retryAfterMs("SHEETS_READ_403:rateLimitExceeded")).toBe(10 * 60_000);
    expect(retryAfterMs("SHEETS_READ_500")).toBe(5 * 60_000);
  });
  test("Google's reason rides along in the error", () => { expect(new GoogleError(403, "SHEETS_CREATE", "accessNotConfigured").message).toBe("SHEETS_CREATE_403:accessNotConfigured"); expect(new GoogleError(500, "X").message).toBe("X_500"); });
});
