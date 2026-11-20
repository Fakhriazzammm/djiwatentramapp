import { describe, expect, test } from "bun:test";
import { AI_TAG, isUnsorted, planRefine, toItem } from "./ai-category";
import { DEFAULT_CATEGORIES } from "./categories";
import type { Entry } from "./types";

const E = (id: string, over: Partial<Entry> = {}): Entry => ({ id, kind: "out", amount: 25000, categoryId: "lainnya", accountId: "tunai", at: "2026-11-20T00:00:00Z", note: "Kopi Tuku", tags: [], source: "manual", createdAt: "2026-11-20T00:00:00Z", ...over });
const min = 0.8;

describe("which records need sorting", () => {
  test("only real records with a note and no category yet", () => {
    expect(isUnsorted(E("a"))).toBe(true);
    expect(isUnsorted(E("b", { categoryId: "makan" }))).toBe(false); expect(isUnsorted(E("c", { note: "" }))).toBe(false); expect(isUnsorted(E("d", { kind: "tf" }))).toBe(false); expect(isUnsorted(E("e", { source: "pay" }))).toBe(false);
  });
  test("what the server is asked", () => { expect(toItem(E("a", { kind: "in", amount: 5 }))).toEqual({ key: "a", text: "Kopi Tuku", amount: 5, kind: "in" }); });
});

describe("applying the server's picks", () => {
  const entries = [E("a"), E("b"), E("c", { kind: "in", note: "Gaji" }), E("d")];
  const res = { minConfidence: min, results: [
    { key: "a", categoryId: "makan-kopi-dan-minuman", confidence: 0.93, source: "ai" as const },
    { key: "b", categoryId: "transport-bbm", confidence: 0.5, source: "ai" as const },        // not sure enough
    { key: "c", categoryId: "makan-kopi-dan-minuman", confidence: 0.99, source: "ai" as const },  // expense category for income
    { key: "d", categoryId: "makan", confidence: 1, source: "rule" as const },                 // taught by the person
    { key: "zz", categoryId: "makan", confidence: 1, source: "rule" as const },
  ] };
  const plan = planRefine(entries, res, DEFAULT_CATEGORIES);
  test("confident model picks and taught rules are applied, the rest is left alone", () => {
    expect(plan.map((p) => [p.after.id, p.after.categoryId, p.source])).toEqual([["a", "makan-kopi-dan-minuman", "ai"], ["d", "makan", "rule"]]);
  });
  test("model picks are tagged so the app can say so; rules are not", () => {
    expect(plan[0].after.tags).toContain(AI_TAG); expect(plan[1].after.tags).not.toContain(AI_TAG); expect(plan[0].before.categoryId).toBe("lainnya");
  });
  test("a pick equal to the current category changes nothing", () => { expect(planRefine([E("x", { categoryId: "makan" })], { minConfidence: min, results: [{ key: "x", categoryId: "makan", confidence: 1, source: "rule" }] }, DEFAULT_CATEGORIES)).toEqual([]); });
});
