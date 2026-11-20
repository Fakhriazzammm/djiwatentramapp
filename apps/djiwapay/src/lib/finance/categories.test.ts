import { describe, expect, test } from "bun:test";
import { DEFAULT_CATEGORIES, parentMap, rootId, subsOf } from "./categories";

describe("default categories", () => {
  test("ids and names are unique, so a pick or a Sheet cell is never ambiguous", () => {
    const ids = DEFAULT_CATEGORIES.map((c) => c.id), names = DEFAULT_CATEGORIES.map((c) => c.name.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length); expect(new Set(names).size).toBe(names.length);
  });
  test("the original ids survive with the same meaning", () => {
    for (const id of ["makan", "transport", "belanja", "tagihan", "hiburan", "kesehatan", "pendidikan", "rumah", "transfer", "lainnya", "gaji", "bonus"]) expect(DEFAULT_CATEGORIES.find((c) => c.id === id && !c.parentId)).toBeDefined();
    expect(DEFAULT_CATEGORIES.find((c) => c.id === "gaji")!.income).toBe(true); expect(DEFAULT_CATEGORIES.find((c) => c.id === "makan")!.income).toBe(false);
  });
  test("every sub points at an existing parent of the same kind, one level deep", () => {
    const by = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
    for (const c of DEFAULT_CATEGORIES.filter((x) => x.parentId)) { const p = by.get(c.parentId!); expect(p).toBeDefined(); expect(p!.parentId).toBeUndefined(); expect(p!.income).toBe(c.income); }
    expect(DEFAULT_CATEGORIES.filter((c) => !c.parentId && !c.income).length).toBeGreaterThanOrEqual(16);
    expect(DEFAULT_CATEGORIES.filter((c) => c.parentId).length).toBeGreaterThan(60);
  });
  test("roll-up helpers", () => {
    const sub = DEFAULT_CATEGORIES.find((c) => c.name === "Kopi & minuman")!;
    expect(sub.parentId).toBe("makan"); expect(rootId(DEFAULT_CATEGORIES, sub.id)).toBe("makan"); expect(rootId(DEFAULT_CATEGORIES, "makan")).toBe("makan"); expect(rootId(DEFAULT_CATEGORIES, "tak-dikenal")).toBe("tak-dikenal");
    expect(parentMap(DEFAULT_CATEGORIES)[sub.id]).toBe("makan"); expect(subsOf(DEFAULT_CATEGORIES, "makan").map((c) => c.name)).toContain("Kopi & minuman");
  });
});
