import { describe, expect, it } from "bun:test";
import { normalizeNumberInputValue } from "./number-input";

describe("normalizeNumberInputValue", () => {
  it("keeps empty values empty while editing", () => {
    expect(normalizeNumberInputValue("")).toBe("");
  });

  it("removes leading zeros from numeric values", () => {
    expect(normalizeNumberInputValue("01")).toBe("1");
    expect(normalizeNumberInputValue("00020")).toBe("20");
  });

  it("keeps a single zero as zero", () => {
    expect(normalizeNumberInputValue("0")).toBe("0");
  });
});
