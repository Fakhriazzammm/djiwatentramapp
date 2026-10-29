import { CUSTOMER_API_BASE } from "./customer-auth-config";
import { loadCustomerOrders } from "./customer-order-loader";

declare const afterEach: (fn: () => void) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => any;

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("loadCustomerOrders", () => {
  it("loads and maps all member orders from the authenticated endpoint", async () => {
    let requestedUrl = "";
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input);
      return jsonResponse({ success: true, orders: [{ _id: "order_member", total_amount: 90000, status: "paid", items: [] }] });
    }) as typeof fetch;

    const orders = await loadCustomerOrders("customer_1", []);

    expect(requestedUrl).toBe(`${CUSTOMER_API_BASE}/orders`);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ id: "order_member", totalAmount: 90000, status: "paid" });
  });

  it("loads guest orders with their stored access tokens", async () => {
    let requestBody = "";
    globalThis.fetch = (async (_input, init) => {
      requestBody = String(init?.body);
      return jsonResponse({ success: true, orders: [{ _id: "order_guest", totalAmount: 70000, items: [] }] });
    }) as typeof fetch;

    const references = [{ orderId: "order_guest", accessToken: "guest-token-123" }];
    const orders = await loadCustomerOrders(null, references);

    expect(JSON.parse(requestBody)).toEqual({ orders: references });
    expect(orders[0]).toMatchObject({ id: "order_guest", totalAmount: 70000 });
  });

  it("keeps API failures observable to the caller", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401 })) as typeof fetch;

    await expect(loadCustomerOrders("customer_1", [])).rejects.toThrow("Customer API HTTP 401");
  });
});
