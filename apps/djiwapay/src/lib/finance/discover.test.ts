import { describe, expect, test } from "bun:test";
import { findDiscoveries, mergeTargets, movedEntries, payeeKey, type Decision } from "./discover";
import type { Entry, FinanceState } from "./types";

const NOW = new Date("2026-11-20T03:00:00Z");
const ent = (id: string, note: string, amount: number, iso: string, extra: Partial<Entry> = {}): Entry => ({ id, kind: "out", amount, categoryId: "tagihan", accountId: "tunai", at: iso, note, tags: [], source: "email", createdAt: iso, ...extra });
const state = (over: Partial<FinanceState> = {}): FinanceState => ({ v: 1, onboarded: true, accounts: [{ id: "tunai", name: "Tunai", type: "cash", opening: 0 }], categories: [], entries: [], budgets: [], goals: [], debts: [], loans: [], overrides: {}, bills: [], pockets: [], assets: [], ...over } as FinanceState);
const monthly = (note: string, amount: number, days: number[]) => days.map((d, i) => ent(`n${i}`, note, amount, new Date(NOW.getTime() - d * 86_400_000).toISOString()));

describe("discoveries", () => {
  test("payee names that differ only by noise read as one", () => {
    expect(payeeKey("Netflix.com 88213")).toBe(payeeKey("NETFLIX COM"));
    expect(payeeKey("Pembayaran Indihome 1234567")).toBe("indihome");
  });

  test("a wallet made from e-mail is found once, with what proves it, and never twice", () => {
    const s = state({ accounts: [{ id: "tunai", name: "Tunai", type: "cash", opening: 0 }, { id: "email-bca-4821", name: "BCA ••4821", type: "bank", opening: 0 }] });
    const e = [ent("a", "Kopi", 25000, "2026-11-18T05:00:00Z", { accountId: "email-bca-4821" })];
    const found = findDiscoveries(s, e, [], NOW);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "account", key: "acct:email-bca-4821", lead: "Bank baru: BCA" });
    expect(findDiscoveries(s, e, [{ key: "acct:email-bca-4821", status: "saved", until: null }], NOW)).toHaveLength(0);
  });

  test("a second account number of a known bank is called a new account, not a new bank", () => {
    const s = state({ accounts: [{ id: "email-bca-4821", name: "BCA ••4821", type: "bank", opening: 0 }, { id: "email-bca-9902", name: "BCA ••9902", type: "bank", opening: 0 }] });
    expect(findDiscoveries(s, [], [], NOW).map((d) => d.lead)).toEqual(["Rekening baru di BCA", "Rekening baru di BCA"]);
  });

  test("a wallet that has been in use for days, or that the person touched, is not new", () => {
    const s = state({ accounts: [{ id: "email-mandiri-4399", name: "Mandiri ••4399", type: "bank", opening: 0 }, { id: "email-gopay", name: "GoPay", type: "ewallet", opening: 50000 }, { id: "email-ovo", name: "OVO", type: "ewallet", opening: 0 }] });
    const e = [ent("a", "Kopi", 25000, "2026-11-10T05:00:00Z", { accountId: "email-mandiri-4399" }), ent("b", "Bakso", 20000, "2026-11-19T05:00:00Z", { accountId: "email-gopay" }), ent("c", "Makan", 20000, "2026-11-19T05:00:00Z", { accountId: "email-ovo", source: "manual" })];
    expect(findDiscoveries(s, e, [], NOW)).toHaveLength(0);
  });

  test("a bank that e-mail shows but nothing tracks is found, and is gone once its wallet exists", () => {
    const u = { key: "new:bni-7710", issuerId: "bni", name: "BNI", kind: "bank", hint: "7710", count: 3, firstAt: "2026-11-18T00:00:00Z", lastAt: "2026-11-19T00:00:00Z", sameIssuer: [] };
    const found = findDiscoveries(state(), [], [], NOW, [u]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ lead: "Bank baru: BNI", draft: { id: "email-bni-7710", name: "BNI ••7710", type: "bank" } });
    expect(findDiscoveries(state({ accounts: [{ id: "email-bni-7710", name: "BNI ••7710", type: "bank", opening: 0 }] }), [ent("a", "x", 1, "2026-11-01T00:00:00Z", { accountId: "email-bni-7710" })], [], NOW, [u])).toHaveLength(0);
  });

  test("a wallet that keeps receiving merchant settlements is offered as a business wallet, once it is one it is not", () => {
    const s = state({ accounts: [{ id: "email-bca", name: "BCA", type: "bank", opening: 0 }] });
    const e = [ent("a", "DJIWA TENTRAM", 2333550, "2026-11-18T05:00:00Z", { kind: "in", accountId: "email-bca", tags: ["settlement"] }), ent("b", "DJIWA TENTRAM", 1500000, "2026-11-19T05:00:00Z", { kind: "in", accountId: "email-bca", tags: ["settlement"] })];
    const f = findDiscoveries(s, e, [], NOW).filter((d) => d.kind === "business");
    expect(f).toHaveLength(1); expect(f[0]).toMatchObject({ key: "biz:email-bca", amount: 3833550 });
    expect(findDiscoveries(state({ accounts: [{ id: "email-bca", name: "BCA", type: "bank", opening: 0, scope: "business" }] }), e, [], NOW).filter((d) => d.kind === "business")).toHaveLength(0);
    expect(findDiscoveries(s, [e[0]], [], NOW).filter((d) => d.kind === "business")).toHaveLength(0);
  });

  test("a new person with several big transfers is offered a label, and a monthly transfer to a person reads as a transfer", () => {
    const big = [ent("p1", "Bayu P", 1_500_000, "2026-11-18T05:00:00Z", { categoryId: "transfer" }), ent("p2", "Bayu P", 1_500_000, "2026-11-19T05:00:00Z", { categoryId: "transfer" }), ent("p3", "Bayu P", 1_200_000, "2026-11-19T09:00:00Z", { categoryId: "transfer" })];
    const f = findDiscoveries(state(), big, [], NOW).filter((d) => d.kind === "newpayee");
    expect(f).toHaveLength(1); expect(f[0]).toMatchObject({ lead: "Penerima baru, nominal besar", amount: 4_200_000, payeeKey: "bayu p" });
    expect(findDiscoveries(state(), big, [], NOW, [], { kinds: {}, labels: { "bayu p": "Teman" } }).filter((d) => d.kind === "newpayee")).toHaveLength(0);
    const monthlyPerson = monthly("Rani Amalia", 1_500_000, [4, 34, 64, 95]).map((e) => ({ ...e, categoryId: "transfer" }));
    expect(findDiscoveries(state(), monthlyPerson, [], NOW).find((d) => d.kind === "recurring")?.lead).toBe("Transfer rutin terdeteksi");
  });

  test("three monthly payments of about the same amount suggest one bill", () => {
    const found = findDiscoveries(state(), monthly("Netflix", 54990, [4, 34, 64, 95]), [], NOW);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "recurring", group: "langganan", amount: 54990 });
    expect(found[0].bill?.id).toBe("disc-netflix");   // fixed id: saving it twice replaces, never duplicates
  });

  test("not a bill: only two payments, random gaps, or amounts that jump around", () => {
    expect(findDiscoveries(state(), monthly("Netflix", 54990, [4, 34]), [], NOW)).toHaveLength(0);
    expect(findDiscoveries(state(), monthly("Kopi Kenangan", 30000, [2, 9, 20, 41]), [], NOW)).toHaveLength(0);
    const jumpy = monthly("Toko X", 10000, [4, 34, 64]).map((e, i) => ({ ...e, amount: [10000, 90000, 40000][i] }));
    expect(findDiscoveries(state(), jumpy, [], NOW)).toHaveLength(0);
  });

  test("no duplicate: an existing bill with the same name, or the same amount and day, hides the suggestion", () => {
    const e = monthly("Indihome", 350000, [3, 33, 63]);
    const day = Number(new Date(new Date(e[0].at).getTime() + 7 * 3_600_000).toISOString().slice(8, 10));
    expect(findDiscoveries(state({ bills: [{ id: "b1", name: "Indihome", amount: 340000, day: 9, icon: "tv", tone: "blue", paid: [] }] }), e, [], NOW).filter((d) => d.kind === "recurring")).toHaveLength(0);
    expect(findDiscoveries(state({ bills: [{ id: "b2", name: "Internet rumah", amount: 350000, day, icon: "wifi", tone: "blue", paid: [] }] }), e, [], NOW).filter((d) => d.kind === "recurring")).toHaveLength(0);
  });

  test("a loan instalment is never offered as a bill", () => {
    const e = monthly("Bank Mandiri KPR", 3200000, [3, 33, 63]).map((x) => ({ ...x, tags: ["loan-receipt"] }));
    expect(findDiscoveries(state(), e, [], NOW)).toHaveLength(0);
  });

  test("a saved bill whose payment moved is flagged once per new amount", () => {
    const s = state({ bills: [{ id: "b1", name: "Spotify", amount: 54990, day: 5, icon: "repeat", tone: "violet", paid: [] }] });
    const e = [ent("p1", "Spotify", 65990, "2026-11-05T02:00:00Z")];
    const found = findDiscoveries(s, e, [], NOW).filter((d) => d.kind === "price");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ newAmount: 65990, oldAmount: 54990, billId: "b1" });
    expect(findDiscoveries(s, e, [{ key: found[0].key, status: "dismissed", until: null }], NOW)).toHaveLength(0);
  });

  test("a monthly payment that stopped is reported, an answered snooze comes back after its date", () => {
    const e = monthly("Vidio", 39000, [120, 150, 181, 212]);
    const stopped = findDiscoveries(state(), e, [], NOW);
    expect(stopped.map((d) => d.kind)).toEqual(["stopped"]);
    const snooze: Decision = { key: stopped[0].key, status: "snoozed", until: "2026-11-25T00:00:00Z" };
    expect(findDiscoveries(state(), e, [snooze], NOW)).toHaveLength(0);
    expect(findDiscoveries(state(), e, [snooze], new Date("2026-11-26T00:00:00Z"))).toHaveLength(1);
  });

  test("merging moves every record to the other wallet and keeps nonsense transfers out", () => {
    const e = [ent("a", "x", 1000, "2026-11-01T00:00:00Z", { accountId: "email-bca-1" }), ent("b", "y", 2000, "2026-11-02T00:00:00Z", { kind: "tf", accountId: "bca", toAccountId: "email-bca-1" }), ent("c", "z", 3000, "2026-11-03T00:00:00Z", { kind: "tf", accountId: "email-bca-1", toAccountId: "dana" }), ent("d", "w", 4000, "2026-11-04T00:00:00Z", { accountId: "other" })];
    const moved = movedEntries(e, "email-bca-1", "bca");
    expect(moved.map((m) => m.id)).toEqual(["a", "c"]);   // "b" would become bca -> bca, so it stays as it was
    expect(moved[0].accountId).toBe("bca");
  });

  test("merge targets exclude the wallet itself and hide other banks' mail wallets", () => {
    const s = state({ accounts: [{ id: "tunai", name: "Tunai", type: "cash", opening: 0 }, { id: "bca", name: "BCA", type: "bank", opening: 0 }, { id: "email-bca-1", name: "BCA ••1", type: "bank", opening: 0 }, { id: "email-bni-2", name: "BNI ••2", type: "bank", opening: 0 }] });
    expect(mergeTargets(s, "email-bca-1").map((a) => a.id)).toEqual(["bca"]);
  });
});
