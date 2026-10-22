import { describe, expect, test } from "bun:test";
import { postpaidReceiptVisible, postpaidTotal, validatePostpaidCustomerNumber } from "../src/lib/djiwa-pay-postpaid";

describe("Djiwa Pay postpaid flow", () => {
  test("validates PLN and PDAM customer numbers", () => {
    expect(validatePostpaidCustomerNumber("pln", "12345678901").valid).toBe(true);
    expect(validatePostpaidCustomerNumber("pln", "1234").valid).toBe(false);
    expect(validatePostpaidCustomerNumber("pdam", "10200000").valid).toBe(true);
  });
  test("calculates the provider total and only exposes receipts on success", () => {
    expect(postpaidTotal(50000, 2500)).toBe(52500);
    expect(postpaidReceiptVisible("pending")).toBe(false);
    expect(postpaidReceiptVisible("success")).toBe(true);
  });
});
