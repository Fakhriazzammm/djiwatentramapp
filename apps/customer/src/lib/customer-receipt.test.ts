import { CUSTOMER_API_BASE } from "./customer-auth-config";
import { loadCustomerReceiptOrder } from "./customer-receipt";
import type { CustomerOrderReference } from "./customer-api";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => any;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("customer receipt loader", () => {
  it("loads a member receipt through the authenticated customer endpoint", async () => {
    let requestedUrl = "";
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input);
      return jsonResponse({ success: true, orders: [{ _id: "order_member", status: "paid" }] });
    }) as typeof fetch;

    await expect(loadCustomerReceiptOrder("order_member", [])).resolves.toEqual({ _id: "order_member", status: "paid" });
    expect(requestedUrl).toBe(`${CUSTOMER_API_BASE}/orders`);
  });

  it("loads a guest receipt with its access token", async () => {
    let requestBody = "";
    globalThis.fetch = (async (_input, init) => {
      requestBody = String(init?.body);
      return jsonResponse({ success: true, orders: [{ _id: "order_guest", status: "paid" }] });
    }) as typeof fetch;
    const references: CustomerOrderReference[] = [{ orderId: "order_guest", accessToken: "guest-token-123" }];

    await expect(loadCustomerReceiptOrder("order_guest", references)).resolves.toEqual({ _id: "order_guest", status: "paid" });
    expect(JSON.parse(requestBody)).toEqual({ orders: references });
  });
});
