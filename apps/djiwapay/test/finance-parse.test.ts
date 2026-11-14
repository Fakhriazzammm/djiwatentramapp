import { describe, expect, test } from "bun:test";
import { parseAmount, parseEntries } from "../src/lib/finance/parse";
import { guessCategory } from "../src/lib/finance/categories";

const accounts = [{ id: "tunai", name: "Tunai" }, { id: "bca", name: "BCA •••• 4821" }, { id: "ovo", name: "OVO" }];

describe("amount parsing", () => {
  test.each([["25rb", 25000], ["25 ribu", 25000], ["25k", 25000], ["2jt", 2_000_000], ["2,5jt", 2_500_000], ["25.000", 25000], ["1.250.000", 1_250_000], ["50000", 50000]])("%s", (input, expected) => expect(parseAmount(input)?.amount).toBe(expected));
  test("rejects text without numbers", () => expect(parseAmount("kopi saja")).toBeNull());
});

describe("sentence parsing", () => {
  test("splits several entries and guesses categories", () => {
    const items = parseEntries("kopi 25rb dan parkir 5rb", accounts);
    expect(items.map((i) => [i.title, i.amount, i.categoryId, i.kind])).toEqual([["Kopi", 25000, "makan", "out"], ["Parkir", 5000, "transport", "out"]]);
  });
  test("detects income", () => {
    const [item] = parseEntries("gaji 6jt", accounts);
    expect(item).toMatchObject({ kind: "in", amount: 6_000_000, categoryId: "gaji" });
  });
  test("reads account and relative day", () => {
    const [item] = parseEntries("bensin 50rb pakai bca kemarin", accounts);
    expect(item).toMatchObject({ amount: 50000, categoryId: "transport", accountId: "bca", daysAgo: 1 });
  });
  test("handles commas, ampersands and unknown words", () => {
    const items = parseEntries("makan siang 35rb, token listrik 100rb & hadiah teman 50rb", accounts);
    expect(items.map((i) => i.categoryId)).toEqual(["makan", "tagihan", "bonus"]);
    expect(items[2].kind).toBe("in");
  });
  test("ignores segments without an amount", () => {
    expect(parseEntries("halo apa kabar", accounts)).toEqual([]);
    expect(parseEntries("", accounts)).toEqual([]);
  });
  test("falls back to Lainnya", () => expect(parseEntries("sesuatu 10rb", accounts)[0].categoryId).toBe("lainnya"));
});

describe("category guess", () => {
  test("word boundaries", () => { expect(guessCategory("kopi susu")).toBe("makan"); expect(guessCategory("mobil")).toBeNull(); });
});
