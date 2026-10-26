import { describe, expect, test } from "bun:test";
import {
  buildCheckStatusRequest,
  buildPostpaidInquiryRequest,
  buildPostpaidPaymentRequest,
  buildPrepaidRequest,
  buildSignature,
  normalizePostpaidProduct,
  normalizePrepaidProduct,
  normalizeProviderStatus,
  redactProviderPayload,
} from "./adapter";

describe("IAK adapter", () => {
  test("builds the documented MD5 signature", () => {
    expect(buildSignature("user", "secret", "ref-1")).toBe("a72387fde75642249dacb76c82b429ca");
  });

  test("normalizes a prepaid v2 product", () => {
    expect(normalizePrepaidProduct({ product_code: "xld25000", product_description: "XL", product_nominal: "25000", product_price: 26500, product_type: "data", product_category: "internet", active_period: "30", status: "active", icon_url: "https://example.com/xl.png" })).toEqual({
      code: "xld25000", name: "XL", nominal: "25000", price: 26500, type: "data", category: "internet", activePeriod: "30", status: "active", iconUrl: "https://example.com/xl.png",
    });
  });

  test("normalizes a postpaid product and inquiry", () => {
    expect(normalizePostpaidProduct({ code: "PDAMKOTA.SURABAYA", name: "PDAM Surabaya", type: "pdam", status: 1, fee: 2500, komisi: 100 })).toEqual({ code: "PDAMKOTA.SURABAYA", name: "PDAM Surabaya", type: "pdam", status: "active", fee: 2500, commission: 100 });
  });

  test.each([["0", "pending"], [0, "pending"], ["1", "success"], ["00", "success"], [1, "success"], ["2", "failed"], [2, "failed"]] as const)("normalizes provider status %s", (input, expected) => {
    expect(normalizeProviderStatus(input)).toBe(expected);
  });

  test("builds service-specific requests and rejects unknown service types", () => {
    expect(buildPrepaidRequest("top-up", { refId: "r1", customerId: "0812", productCode: "xld25000" })).toMatchObject({ path: "top-up", body: { ref_id: "r1", customer_id: "0812", product_code: "xld25000" } });
    expect(buildPostpaidInquiryRequest({ serviceType: "pdam", productCode: "PDAMKOTA.SURABAYA", customerNumber: "10200000", refId: "r2" })).toMatchObject({ path: "v1/bill/check", body: { commands: "inq-pasca", code: "PDAMKOTA.SURABAYA", hp: "10200000", ref_id: "r2" } });
    expect(buildPostpaidPaymentRequest({ serviceType: "pln", providerTransactionId: "9732791" })).toMatchObject({ path: "v1/bill/check", body: { commands: "pay-pasca", tr_id: "9732791" } });
    expect(buildCheckStatusRequest({ kind: "postpaid", serviceType: "pdam", refId: "r4" })).toEqual({ path: "v1/bill/check", body: { commands: "checkstatus", ref_id: "r4" } });
    expect(buildCheckStatusRequest({ kind: "prepaid", refId: "r4" })).toEqual({ path: "check-status", body: { ref_id: "r4" } });
    expect(() => buildPostpaidInquiryRequest({ serviceType: "unknown", productCode: "x", customerNumber: "1", refId: "r5" })).toThrow("UNKNOWN_SERVICE_TYPE");
  });

  test("redacts sensitive provider payload fields", () => {
    expect(redactProviderPayload({ customer_id: "081234567890", pin: "1234", activation_code: "secret", message: "ok" })).toEqual({ customer_id: "••••••7890", pin: "[REDACTED]", activation_code: "[REDACTED]", message: "ok" });
  });
});
