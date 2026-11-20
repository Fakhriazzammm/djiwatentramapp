import { describe, expect, test } from "bun:test";
import { accountBalance, totals } from "./calc";
import { effectiveScope, entriesInScope, hasBusiness, isCrossScope, scopedState, scopeOfId } from "./scope";
import { emptyState } from "./store";
import type { Account, Entry } from "./types";

const A: Account[] = [{ id: "tunai", name: "Tunai", type: "cash", opening: 0 }, { id: "bca", name: "BCA", type: "bank", opening: 1000 }, { id: "kas", name: "Kas toko", type: "cash", opening: 500, scope: "business" }, { id: "bni", name: "BNI Bisnis", type: "bank", opening: 0, scope: "business", archived: true }];
const E = (id: string, kind: Entry["kind"], amount: number, accountId: string, toAccountId?: string): Entry => ({ id, kind, amount, categoryId: "lain", accountId, ...(toAccountId ? { toAccountId } : {}), at: "2026-11-10T00:00:00Z", note: "", tags: [], source: "manual", createdAt: "2026-11-10T00:00:00Z" } as Entry);
const ES = [E("1", "out", 100, "tunai"), E("2", "in", 300, "kas"), E("3", "out", 50, "kas"), E("4", "tf", 200, "bca", "kas"), E("5", "tf", 10, "tunai", "bca"), E("6", "out", 5, "djiwa-pay")];

describe("personal and business scope", () => {
  test("a wallet without scope is personal; Djiwa Pay and unknown wallets too", () => {
    expect(scopeOfId("tunai", A)).toBe("personal"); expect(scopeOfId("kas", A)).toBe("business"); expect(scopeOfId("nope", A)).toBe("personal"); expect(scopeOfId(undefined, A)).toBe("personal");
  });
  test("records follow their wallet, and a crossing transfer shows in both pools", () => {
    expect(entriesInScope(ES, A, "business").map((e) => e.id)).toEqual(["2", "3", "4"]);
    expect(entriesInScope(ES, A, "personal").map((e) => e.id)).toEqual(["1", "4", "5", "6"]);
    expect(entriesInScope(ES, A, "all")).toHaveLength(6);
  });
  test("a crossing transfer is not income or spending in either pool", () => {
    expect(isCrossScope(ES[3], A)).toBe(true); expect(isCrossScope(ES[4], A)).toBe(false);
    expect(totals(entriesInScope(ES, A, "business"))).toEqual({ out: 50, in: 300, net: 250 });
    expect(totals(entriesInScope(ES, A, "personal"))).toEqual({ out: 105, in: 0, net: -105 });
  });
  test("balances stay right inside a scope (money that arrives by transfer counts)", () => {
    const biz = entriesInScope(ES, A, "business"), kas = A[2];
    expect(accountBalance(kas, biz)).toBe(500 + 300 - 50 + 200);
    expect(accountBalance(A[1], entriesInScope(ES, A, "personal"))).toBe(1000 - 200 + 10);
  });
  test("scopedState filters wallets and records and leaves the rest alone", () => {
    const st = { ...emptyState(), accounts: A, entries: ES }; const b = scopedState(st, "business");
    expect(b.accounts.map((a) => a.id)).toEqual(["kas", "bni"]); expect(b.allAccounts).toHaveLength(4); expect(b.entries).toHaveLength(3); expect(b.budgets).toBe(st.budgets); expect(scopedState(st, "all")).toBe(st);
  });
  test("business choice falls back to all when no business wallet remains", () => {
    expect(hasBusiness(A)).toBe(true); expect(hasBusiness([A[0], A[3]])).toBe(false);
    expect(effectiveScope("business", [A[0]])).toBe("all"); expect(effectiveScope("business", A)).toBe("business"); expect(effectiveScope("personal", [A[0]])).toBe("personal");
  });
});
