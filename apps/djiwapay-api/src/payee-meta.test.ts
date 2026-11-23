import { describe, expect, test } from "bun:test";
import { cleanMeta, mergeMeta } from "./payee-meta.js";

describe("payee meta", () => {
  test("input is cleaned: bad keys dropped, label trimmed and cut, unknown kind becomes none, a wrong clock is replaced", () => {
    const now = Date.now(), r = cleanMeta([{ key: "Rani Amalia", kind: "orang", label: "  Keluarga ", at: now - 5 }, { key: "bad/key", kind: "toko" }, { key: "x", kind: "robot", label: "y".repeat(50), at: 3 }, { key: "far", at: now + 10 * 86_400_000 }], now);
    expect(r.map((x) => x.key)).toEqual(["rani amalia", "x", "far"]);
    expect(r[0]).toMatchObject({ kind: "orang", label: "Keluarga" });
    expect(r[1]).toMatchObject({ kind: null, label: "y".repeat(20), at: now });
    expect(r[2].at).toBeLessThanOrEqual(now + 60_000);
  });
  test("only a newer answer replaces the stored one (the write is conditional in SQL)", async () => {
    const calls: { text: string; params: unknown[] }[] = [];
    const db = { query: async (text: string, params: unknown[] = []) => { calls.push({ text, params }); return { rows: [] }; } };
    await mergeMeta(db, "u1", [{ key: "rani", kind: "orang", label: "Teman", at: 1_800_000_000_000 }]);
    expect(calls[0].text).toContain("where finance.payee_meta.at < excluded.at");
    expect(calls.some((c) => /google_sheet_exports set dirty=true/.test(c.text))).toBe(true);
  });
});
