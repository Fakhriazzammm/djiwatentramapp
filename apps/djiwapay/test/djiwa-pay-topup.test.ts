import { describe, expect, test } from "bun:test";
import { applyTopupKey, normalizeTopupAmount, normalizeTopupDigits, shouldShowTopupPayment } from "../src/lib/djiwa-pay-topup";

describe("Djiwa Pay top-up input", () => {
  test("keeps keypad input numeric and capped", () => {
    expect(applyTopupKey("0", "5")).toBe("5");
    expect(applyTopupKey("5000", "delete")).toBe("500");
    expect(applyTopupKey("99999999", "9")).toBe("99999999");
  });

  test("accepts only a safe minimum top-up amount", () => {
    expect(normalizeTopupAmount("1000")).toEqual({ value: 1000, valid: true });
    expect(normalizeTopupAmount("999")).toEqual({ value: 999, valid: false });
    expect(normalizeTopupAmount("abc")).toEqual({ value: 0, valid: false });
  });

  test("normalizes formatted input back to capped digits", () => {
    expect(normalizeTopupDigits("Rp 50.000")).toBe("50000");
    expect(normalizeTopupDigits("001000")).toBe("1000");
    expect(normalizeTopupDigits("12a34b")).toBe("1234");
    expect(normalizeTopupDigits("123456789")).toBe("12345678");
    expect(normalizeTopupDigits("")).toBe("");
  });

  test("renders the legacy payment checkout only after the sheet continues", () => {
    expect(shouldShowTopupPayment(true, "detail")).toBe(false);
    expect(shouldShowTopupPayment(true, "payment")).toBe(true);
    expect(shouldShowTopupPayment(false, "payment")).toBe(false);
  });
});
