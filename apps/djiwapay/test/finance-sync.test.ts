import { describe, expect, test as it } from "bun:test";
import { diffState, mergeStates, snapshotOf } from "../src/lib/finance/sync";
import { emptyState, reduce } from "../src/lib/finance/store";
import type { Entry } from "../src/lib/finance/types";

const e = (id: string, amount = 1000): Entry => ({ id, kind: "out", amount, categoryId: "makan", accountId: "tunai", at: "2026-11-14T10:00:00.000Z", note: "", tags: [], source: "manual", createdAt: "2026-11-14T10:00:00.000Z" });

describe("finance sync diff", () => {
  it("is empty when nothing changed", () => { const s = emptyState(); expect(diffState(snapshotOf(s), s)).toBeNull(); });
  it("sends only new, changed and deleted rows", () => {
    let s = reduce(emptyState(), { type: "entry/addMany", entries: [e("a"), e("b")] });
    const snap = snapshotOf(s);
    s = reduce(s, { type: "entry/update", entry: { ...e("a"), amount: 2000 } });
    s = reduce(s, { type: "entry/delete", id: "b" });
    s = reduce(s, { type: "entry/add", entry: e("c") });
    const d = diffState(snap, s)!;
    expect((d.upserts.entries as Entry[]).map((x) => x.id).sort()).toEqual(["a", "c"]);
    expect(d.deletes.entries).toEqual(["b"]);
    expect(d.profile).toBeUndefined();
  });
  it("carries profile changes (onboarded, overrides)", () => {
    const s = emptyState(); const next = reduce(s, { type: "override/set", id: "pay:1", override: { categoryId: "makan" } });
    expect(diffState(snapshotOf(s), next)!.profile!.overrides["pay:1"]).toEqual({ categoryId: "makan" });
  });
  it("a first-time merge keeps both sides; the server wins on the same id", () => {
    const local = reduce(emptyState(), { type: "entry/addMany", entries: [e("a", 1), e("l")] });
    const server = reduce(emptyState(), { type: "entry/addMany", entries: [e("a", 9), e("s")] });
    const m = mergeStates(local, server);
    expect(m.entries.map((x) => x.id).sort()).toEqual(["a", "l", "s"]);
    expect(m.entries.find((x) => x.id === "a")!.amount).toBe(9);
  });
});

import { receiptToEntries } from "../src/lib/finance/receipt";
import { DEFAULT_CATEGORIES } from "../src/lib/finance/categories";
describe("receiptToEntries", () => {
  const items = [{ price: 68000, categoryId: "belanja" }, { price: 38000, categoryId: "belanja" }, { price: 54000, categoryId: "makan" }, { price: 22000, categoryId: "rumah" }];
  const base = { receiptId: "r1", merchant: "Alfamart", items, accountId: "bca", at: "2026-11-14T09:10:00.000Z", categories: DEFAULT_CATEGORIES };
  it("one mode: a single entry for the total, tagged with the receipt", () => {
    const [x, ...rest] = receiptToEntries({ ...base, mode: "one" });
    expect(rest).toHaveLength(0); expect(x.amount).toBe(182000); expect(x.categoryId).toBe("belanja"); expect(x.receiptId).toBe("r1"); expect(x.source).toBe("receipt");
  });
  it("split mode: one entry per category, same total", () => {
    const out = receiptToEntries({ ...base, mode: "split" });
    expect(out).toHaveLength(3); expect(out.reduce((s, x) => s + x.amount, 0)).toBe(182000);
    expect(out.find((x) => x.categoryId === "belanja")!.amount).toBe(106000); expect(out[0].note).toContain("Alfamart");
  });
  it("ignores empty receipts", () => { expect(receiptToEntries({ ...base, items: [], mode: "one" })).toEqual([]); });
});
