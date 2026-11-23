import { describe, expect, test } from "bun:test";
import { analyze, classify, newBigPayees, payeeKeyOf, payeeName, periodRange } from "./payees";
import type { Entry } from "./types";

const NOW = new Date("2026-11-24T03:00:00Z");
const ent = (id: string, note: string, amount: number, iso: string, extra: Partial<Entry> = {}): Entry => ({ id, kind: "out", amount, categoryId: "lainnya", accountId: "bca", at: iso, note, tags: [], source: "email", createdAt: iso, ...extra });
const nov = periodRange("bulan", NOW);
const run = (entries: Entry[], mode: "out" | "in" = "out") => analyze(entries, { mode, ...nov, now: NOW });

test("a sub category of food makes a name-like payee a shop, through its root", () => {
  const e = [ent("1", "ICHIBAN SUSHI", 163_900, "2026-11-21T09:00:00Z", { categoryId: "makan-restoran" })];
  const a = analyze(e, { mode: "out", ...nov, now: NOW, rootOf: (id) => (id.startsWith("makan") ? "makan" : id) });
  expect(a.list[0].kind).toBe("toko");
});

describe("payees", () => {
  test("a name is cleaned and merged across spellings", () => {
    expect(payeeName("Transfer ke RANI AMALIA")).toBe("Rani Amalia");
    expect(payeeName("KOPI ARA TASIKMALAYA · PAN 936000140012")).toBe("Kopi Ara Tasikmalaya");
    expect(payeeName("PAN 9360 0014 0012 3456")).toBe("QRIS tanpa nama toko");
    expect(payeeKeyOf("rani amalia")).toBe(payeeKeyOf("Transfer ke RANI AMALIA"));
  });
  test("people, shops and services are told apart, and categories help", () => {
    expect(classify("Rani Amalia")).toBe("orang");
    expect(classify("Toko Sumber Rejeki")).toBe("toko");
    expect(classify("PLN Prabayar")).toBe("layanan");
    expect(classify("Bu Siti", ["makan", "makan", "makan"])).toBe("toko");
    // shops written like names: a QRIS terminal, a place, a food word or a restaurant category make them shops
    expect(classify("Garland Barnville Garut", [], { qris: true })).toBe("toko");
    expect(classify("Idm Qris Livin Jakarta Utara", [])).toBe("toko");
    expect(classify("Ichiban Sushi", ["makan"])).toBe("toko");
    expect(classify("Haidir Ali Abidin", ["lainnya"])).toBe("orang");
    expect(classify("Dian Siti Fatimah", ["transfer", "lainnya"])).toBe("orang");
    expect(classify("Warung Bu Tini 2", [])).toBe("toko");
  });
  test("totals, counts, averages and shares add up, and the biggest comes first", () => {
    const a = run([ent("1", "Transfer ke Rani", 1_000_000, "2026-11-05T05:00:00Z"), ent("2", "RANI", 500_000, "2026-11-12T05:00:00Z"), ent("3", "Kopi Ara", 20_000, "2026-11-10T05:00:00Z"), ent("4", "Kopi Ara", 20_000, "2026-11-11T05:00:00Z")]);
    expect(a.list.map((p) => p.name)).toEqual(["Rani", "Kopi Ara"]);
    expect(a.list[0]).toMatchObject({ total: 1_500_000, count: 2, avg: 750_000 });
    expect(Math.round(a.list[0].share + a.list[1].share)).toBe(100);
    expect(a.insights.often?.count).toBe(2);
  });
  test("the change is measured against the month before, and a payee with nothing before has no change", () => {
    const a = run([ent("1", "Rani", 1_500_000, "2026-11-05T05:00:00Z"), ent("2", "Rani", 1_000_000, "2026-10-05T05:00:00Z"), ent("3", "Baru", 100_000, "2026-11-06T05:00:00Z")]);
    expect(a.list.find((p) => p.name === "Rani")?.trend).toBe(50);
    expect(a.list.find((p) => p.name === "Baru")?.trend).toBeNull();
    expect(a.insights.rise?.name).toBe("Rani");
  });
  test("transfers between own wallets and loan instalments are not payees; income is read the other way", () => {
    const a = run([ent("1", "Top-up GoPay", 500_000, "2026-11-05T05:00:00Z", { kind: "tf" }), ent("2", "KPR", 2_000_000, "2026-11-05T05:00:00Z", { tags: ["loan-receipt"] }), ent("3", "Gaji", 9_000_000, "2026-11-01T05:00:00Z", { kind: "in" })]);
    expect(a.list).toHaveLength(0);
    expect(run([ent("3", "Gaji", 9_000_000, "2026-11-01T05:00:00Z", { kind: "in" })], "in").list[0]).toMatchObject({ name: "Gaji", total: 9_000_000 });
  });
  test("a monthly pattern is recognised with its usual day and amount", () => {
    const e = ["2026-06-05", "2026-07-05", "2026-08-06", "2026-09-05", "2026-10-05", "2026-11-05"].map((d, i) => ent(`m${i}`, "Rani", 1_500_000, `${d}T02:00:00Z`));
    const p = analyze(e, { mode: "out", ...periodRange("12", NOW), now: NOW }).list[0];
    expect(p).toMatchObject({ monthly: true, typicalDay: 5, typicalAmount: 1_500_000 });
    expect(p.months).toHaveLength(6);
  });
  test("a first-time person with several transfers adding up is worth a label, a labelled one is not", () => {
    const e = [ent("1", "Bayu P", 1_500_000, "2026-11-20T05:00:00Z"), ent("2", "Bayu P", 1_500_000, "2026-11-21T05:00:00Z"), ent("3", "Bayu P", 1_200_000, "2026-11-23T05:00:00Z")];
    expect(newBigPayees(e, { kinds: {}, labels: {} }, NOW).map((p) => p.name)).toEqual(["Bayu P"]);
    expect(newBigPayees(e, { kinds: {}, labels: { [payeeKeyOf("Bayu P")]: "Teman" } }, NOW)).toHaveLength(0);
  });
});
