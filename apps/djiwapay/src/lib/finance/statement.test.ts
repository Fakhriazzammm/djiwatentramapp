import { describe, expect, test } from "bun:test";
import { entryFor, reconcile, type StatementRow } from "./statement";
import type { Entry } from "./types";

const ent = (id: string, amount: number, kind: Entry["kind"], at: string, accountId = "bca", extra: Partial<Entry> = {}): Entry => ({ id, kind, amount, categoryId: "lainnya", accountId, at, note: id, tags: [], source: "email", createdAt: at, ...extra });
const row = (date: string, amount: number, direction: "in" | "out", description = "x"): StatementRow => ({ date, amount, direction, description, balance: null });
const A = new Set(["bca"]);

describe("statement reconciliation", () => {
  test("same amount and direction within two days match, once each", () => {
    const entries = [ent("a", 17000, "out", "2026-11-03T05:00:00Z"), ent("b", 17000, "out", "2026-11-04T05:00:00Z")];
    const r = reconcile([row("2026-11-03", 17000, "out"), row("2026-11-04", 17000, "out"), row("2026-11-04", 17000, "out")], entries, A);
    expect(r.matched.map((m) => m.entry.id).sort()).toEqual(["a", "b"]); expect(r.missing).toHaveLength(1);   // two records, three rows: one is genuinely missing
  });
  test("too far apart, wrong amount or wrong direction do not match", () => {
    const entries = [ent("far", 50000, "out", "2026-11-20T05:00:00Z"), ent("dir", 9000, "in", "2026-11-03T05:00:00Z")];
    const r = reconcile([row("2026-11-03", 50000, "out"), row("2026-11-03", 9000, "out"), row("2026-11-03", 9001, "in")], entries, A);
    expect(r.matched).toHaveLength(0); expect(r.missing).toHaveLength(3);
  });
  test("records in the period that the statement does not show are reported, other wallets are never touched", () => {
    const entries = [ent("only", 12345, "out", "2026-11-10T05:00:00Z"), ent("other", 12345, "out", "2026-11-10T05:00:00Z", "ovo"), ent("outside", 1, "out", "2026-12-20T05:00:00Z")];
    const r = reconcile([row("2026-11-03", 5000, "out"), row("2026-11-28", 5000, "out")], entries, A);
    expect(r.extra.map((e) => e.id)).toEqual(["only"]);
  });
  test("a transfer between own wallets matches the statement of either side", () => {
    const tf = ent("t", 100000, "tf", "2026-11-05T05:00:00Z", "bca", { toAccountId: "gopay" });
    expect(reconcile([row("2026-11-05", 100000, "out")], [tf], A).matched).toHaveLength(1);
    expect(reconcile([row("2026-11-05", 100000, "in")], [tf], A).matched).toHaveLength(0);
    expect(reconcile([row("2026-11-05", 100000, "in")], [tf], new Set(["gopay"])).matched).toHaveLength(1);
  });
  test("a missing row becomes a record on that wallet, dated that day", () => {
    const e = entryFor(row("2026-11-03", 25000, "out", "KOPI KENANGAN"), "bca");
    expect(e).toMatchObject({ kind: "out", amount: 25000, accountId: "bca", source: "statement", tags: ["e-statement"] });
    expect(e.at).toBe("2026-11-03T05:00:00.000Z");
  });
});
