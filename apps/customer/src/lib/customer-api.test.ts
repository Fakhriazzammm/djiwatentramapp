import { describe, expect, it } from "vitest";
import { buildCustomerOrdersRequest, customerApiUrl } from "./customer-api";

describe("customer order request scoping", () => {
  it("uses the canonical authenticated orders route for a resolved customer identity", () => {
    const request = buildCustomerOrdersRequest("customer-source-1", []);
    expect(request?.url).toBe("https://api.djiwatentram.web.id/api/customer/orders");
    expect(request?.init.credentials).toBe("include");
    expect(request?.init.method).toBeUndefined();
  });

  it("does not query authenticated history when the user is logged out", () => {
    expect(buildCustomerOrdersRequest(null, [])).toBeNull();
    expect(customerApiUrl("orders")).toContain("/api/customer/orders");
  });

  it("keeps guest receipts on the token-scoped guest route", () => {
    const references = [{ orderId: "order_123", accessToken: "token-123" }];
    const request = buildCustomerOrdersRequest(null, references);
    expect(request?.url).toBe("https://api.djiwatentram.web.id/api/customer/guest-orders");
    expect(request?.init.body).toBe(JSON.stringify({ orders: references }));
  });
});
