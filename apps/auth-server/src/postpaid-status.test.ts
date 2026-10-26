import { describe, expect, test } from "bun:test";
import { postpaidPaymentStatus } from "./postpaid-status";

describe("postpaid payment status", () => {
  test("does not treat a successful inquiry as payment success", () => {
    expect(postpaidPaymentStatus({ payment_status: "pending", provider_status: "success", status: "1" })).toBe("pending");
  });
  test("reports the actual finalized payment status", () => {
    expect(postpaidPaymentStatus({ payment_status: "paid", provider_status: "success", status: "0" })).toBe("success");
    expect(postpaidPaymentStatus({ payment_status: "failed", provider_status: "failed", status: "2" })).toBe("failed");
  });
});
