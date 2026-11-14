import { describe, expect, test } from "bun:test";
import { detectOperator, normalizeMsisdn } from "../src/lib/djiwa-pay-operator";

describe("operator detection", () => {
  test.each([["0812 3456 7890", "Telkomsel"], ["+62 857 1122", "Indosat"], ["0878123", "XL"], ["083112", "AXIS"], ["089512", "Tri"], ["0881234", "Smartfren"]])("%s → %s", (input, expected) => expect(detectOperator(input)).toBe(expected));
  test("returns null for short or unknown numbers", () => { expect(detectOperator("08")).toBeNull(); expect(detectOperator("0899")).toBe("Tri"); expect(detectOperator("0700123")).toBeNull(); });
  test("normalizes country code", () => expect(normalizeMsisdn("+62 812-3456")).toBe("08123456"));
});
