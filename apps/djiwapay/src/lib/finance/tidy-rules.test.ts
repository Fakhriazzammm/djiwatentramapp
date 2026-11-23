import { describe, expect, test } from "bun:test";
import { ruleSuggestion, unnamed } from "./tidy-rules";

const has = (id: string, income: boolean) => (income ? ["bonus", "gaji"] : ["transfer", "tagihan", "makan", "belanja"]).includes(id);

describe("sorting without a model", () => {
  test("money to a person is a Transfer, from a person a softer suggestion", () => {
    expect(ruleSuggestion("Dian Siti Fatimah", "out", "orang", has)).toMatchObject({ categoryId: "transfer", confidence: 0.9 });
    expect(ruleSuggestion("Dian Siti Fatimah", "in", "orang", has)).toMatchObject({ categoryId: "bonus", confidence: 0.7 });
  });
  test("a money app is a Transfer, not a bill", () => {
    expect(ruleSuggestion("Flip", "out", "layanan", has)?.categoryId).toBe("transfer");
    expect(ruleSuggestion("Gopay Mochammad Fakhri", "out", "layanan", has)?.categoryId).toBe("transfer");
  });
  test("a service is a bill, a word in the name picks the category", () => {
    expect(ruleSuggestion("PLN Prabayar", "out", "layanan", has)?.categoryId).toBe("tagihan");
    expect(ruleSuggestion("Kopi Ara", "out", "toko", has)).toMatchObject({ categoryId: "makan", why: "kata" });
  });
  test("a name that says nothing gets no rule", () => {
    expect(unnamed("QRIS tanpa nama toko")).toBe(true);
    expect(ruleSuggestion("Tanpa nama", "out", "orang", has)).toBeNull();
    expect(ruleSuggestion("QRIS tanpa nama toko", "out", "toko", has)).toBeNull();
  });
  test("a category the person does not have is never suggested", () => { expect(ruleSuggestion("Dian Siti", "out", "orang", () => false)).toBeNull(); });
});
