import {
  CUSTOMER_API_BASE,
  fetchCustomerOrderById,
  fetchGuestOrders,
  fetchMemberOrders,
  subscribeCustomerPush,
  unsubscribeCustomerPush,
  type CustomerOrderReference,
} from "./customer-api";

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

describe("customer API boundary", () => {
  it("builds an authenticated member orders request", async () => {
    let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    globalThis.fetch = (async (input, init) => {
      request = { input, init };
      return jsonResponse({ success: true, orders: [{ _id: "order_1" }] });
    }) as typeof fetch;

    await expect(fetchMemberOrders()).resolves.toEqual([{ _id: "order_1" }]);
    expect(String(request?.input)).toBe(`${CUSTOMER_API_BASE}/orders`);
    expect(request?.init?.credentials).toBe("include");
    expect(request?.init?.headers).toEqual({ Accept: "application/json" });
  });

  it("builds a token-bound guest orders request", async () => {
    let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    globalThis.fetch = (async (input, init) => {
      request = { input, init };
      return jsonResponse({ success: true, orders: [{ _id: "order_guest" }] });
    }) as typeof fetch;
    const references: CustomerOrderReference[] = [{ orderId: "order_guest", accessToken: "guest-token-123" }];

    await expect(fetchGuestOrders(references)).resolves.toEqual([{ _id: "order_guest" }]);
    expect(String(request?.input)).toBe(`${CUSTOMER_API_BASE}/guest-orders`);
    expect(request?.init?.method).toBe("POST");
    expect(request?.init?.credentials).toBe("include");
    expect(request?.init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(request?.init?.body))).toEqual({ orders: references });
  });

  it("selects the authorized order detail from member results", async () => {
    globalThis.fetch = (async () => jsonResponse({
      success: true,
      orders: [{ source_id: "order_other" }, { source_id: "order_target", status: "paid" }],
    })) as typeof fetch;

    await expect(fetchCustomerOrderById("order_target", [])).resolves.toEqual({ source_id: "order_target", status: "paid" });
  });

  it("uses the guest token when selecting a guest order detail", async () => {
    let requestBody = "";
    globalThis.fetch = (async (_input, init) => {
      requestBody = String(init?.body);
      return jsonResponse({ success: true, orders: [{ _id: "order_guest", status: "paid" }] });
    }) as typeof fetch;
    const references: CustomerOrderReference[] = [{ orderId: "order_guest", accessToken: "guest-token-123" }];

    await expect(fetchCustomerOrderById("order_guest", references)).resolves.toEqual({ _id: "order_guest", status: "paid" });
    expect(JSON.parse(requestBody)).toEqual({ orders: references });
  });

  it("uses the Djiwa origin for push requests", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    await subscribeCustomerPush({ endpoint: "https://push.example/sub", keys: { p256dh: "p", auth: "a" } });
    await unsubscribeCustomerPush("https://push.example/sub");

    expect(String(calls[0].input)).toBe(`${CUSTOMER_API_BASE}/push/subscribe`);
    expect(calls[0].init?.credentials).toBe("include");
    expect(String(calls[1].input)).toBe(`${CUSTOMER_API_BASE}/push/unsubscribe`);
    expect(calls[1].init?.credentials).toBe("include");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ endpoint: "https://push.example/sub" });
  });

  it("throws when the customer API rejects a response", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401 })) as typeof fetch;

    await expect(fetchMemberOrders()).rejects.toThrow("Customer API HTTP 401");
  });
});
