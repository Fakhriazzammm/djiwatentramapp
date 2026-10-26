import { describe, expect, test } from "bun:test";
import { createIakActionHandler } from "./handler";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const config = { username: "user", apiKey: "secret", baseUrl: "https://iak.test/api" };

describe("IAK action handler", () => {
  test("returns safe unavailable response when secrets are missing", async () => {
    const handler = createIakActionHandler({ ...config, username: "", apiKey: "" });
    expect(await handler({ action: "price-list" })).toEqual({ body: { success: false, error: { code: "IAK_NOT_CONFIGURED", message: "IAK username/API key belum dikonfigurasi sebagai secret server" } }, status: 503 });
  });

  test("builds prepaid price list and top-up requests", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const handler = createIakActionHandler({ ...config, fetcher: async (url, init) => { const body = JSON.parse(String(init?.body)); calls.push({ url, body }); return response({ products: [{ product_code: "xld25", product_description: "XL", product_price: 26000, status: "active" }] }); } });
    const list = await handler({ action: "price-list", kind: "prepaid" });
    await handler({ action: "top-up", kind: "prepaid", ref_id: "r1", customer_id: "0812", product_code: "xld25" });
    expect(list.body.success).toBe(true); expect((list.body.data as Record<string, unknown>).products).toMatchObject([{ code: "xld25", price: 26000 }]);
    expect(calls[1].url).toBe("https://iak.test/api/top-up"); expect(calls[1].body).toMatchObject({ ref_id: "r1", customer_id: "0812", product_code: "xld25" });
  });

  test("uses the documented postpaid price-list endpoint and response shape", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const handler = createIakActionHandler({ ...config, fetcher: async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return response({ data: { pasca: [{ code: "AETRA", name: "AETRA", type: "pdam", status: 1, fee: 2500 }] } });
    } });
    const result = await handler({ action: "price-list", kind: "postpaid", service_type: "pdam" });
    expect(calls[0].url).toBe("https://iak.test/api/v1/bill/check/pdam");
    expect(calls[0].body).toMatchObject({ commands: "pricelist-pasca", username: "user", status: "active" });
    expect(result.body.data).toMatchObject({ products: [{ code: "AETRA", name: "AETRA", status: "active", type: "pdam" }] });
  });

  test("supports PLN and PDAM inquiry/payment with normalized status", async () => {
    const calls: Record<string, unknown>[] = [];
    const handler = createIakActionHandler({ ...config, fetcher: async (_url, init) => { const body = JSON.parse(String(init?.body)); calls.push(body); return response({ data: { tr_name: "Siti", period: "202610", nominal: "50000", admin: "2500", price: "52500", tr_id: 9732791, response_code: "00", message: "OK" } }); } });
    const inquiry = await handler({ action: "inquiry", kind: "postpaid", service_type: "pdam", product_code: "PDAM.SBY", customer_number: "1020", ref_id: "r2" });
    const payment = await handler({ action: "payment", kind: "postpaid", service_type: "pln", product_code: "PLNPOST", customer_number: "1234", ref_id: "r3", provider_transaction_id: "9732791" });
    expect(inquiry.body.data).toMatchObject({ customerName: "Siti", billAmount: 50000, totalAmount: 52500, status: "success", providerTransactionId: "9732791" });
    expect(payment.body.data).toMatchObject({ status: "success" }); expect(calls[0]).toMatchObject({ commands: "inq-pasca", code: "PDAM.SBY", hp: "1020" }); expect(calls[1]).toMatchObject({ commands: "pay-pasca", tr_id: "9732791", sign: "8f879fbd54dd742c667eb21c1a09da1f" });
  });

  test("keeps provider process pending and maps check status", async () => {
    const handler = createIakActionHandler({ ...config, fetcher: async () => response({ data: { status: "0", message: "PROCESS" } }) });
    const result = await handler({ action: "check-status", kind: "prepaid", ref_id: "r4" });
    expect(result.body.data).toMatchObject({ status: "pending", message: "PROCESS" });
  });

  test("checks postpaid status using the IAK checkstatus contract", async () => {
    let requestBody: Record<string, unknown> = {};
    const handler = createIakActionHandler({ ...config, fetcher: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return response({ data: { response_code: "00", message: "OK" } });
    } });
    const result = await handler({ action: "check-status", kind: "postpaid", service_type: "pdam", ref_id: "r5" });
    expect(requestBody).toMatchObject({ commands: "checkstatus", ref_id: "r5", sign: "14da706eafa768dca4f0a7598d45391c" });
    expect(result.body.data).toMatchObject({ status: "success" });
  });

  test("does not call provider for unknown service or invalid request", async () => {
    let calls = 0; const handler = createIakActionHandler({ ...config, fetcher: async () => { calls += 1; return response({}); } });
    expect((await handler({ action: "inquiry", kind: "postpaid", service_type: "unknown", product_code: "x", customer_number: "1", ref_id: "r" })).body).toMatchObject({ success: false, error: { code: "UNKNOWN_SERVICE_TYPE" } });
    expect((await handler({ action: "payment", kind: "postpaid", service_type: "pln", product_code: "x", customer_number: "", ref_id: "r" })).body).toMatchObject({ success: false, error: { code: "INVALID_POSTPAID_REQUEST" } });
    expect(calls).toBe(0);
  });
});
