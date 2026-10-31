import { createHmac } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { createTravelWalletPaymentEndpoint } from "./travel-wallet-payment.js";

const SECRET = "test-only-travel-wallet-secret-long-enough";
const NOW = 1_798_761_600_000;

function signedRequest(body: string, timestamp = String(NOW), cookie = "djiwa_session=test-session") {
  const signature = createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
  return new Request("https://api.djiwatentram.web.id/api/customer/travel-wallet-payment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      "x-travel-timestamp": timestamp,
      "x-travel-signature": signature,
    },
    body,
  });
}

describe("Djiwa Travel wallet payment endpoint", () => {
  it("charges only the customer resolved from the verified session", async () => {
    let chargedInput: unknown;
    const endpoint = createTravelWalletPaymentEndpoint({
      secret: () => SECRET,
      now: () => NOW,
      resolveCustomerId: async (headers) => headers.get("cookie") === "djiwa_session=test-session" ? "auth-user-42" : null,
      isActiveCustomer: async (customerId) => customerId === "auth-user-42",
      charge: async (input) => {
        chargedInput = input;
        return { ok: true, result: "charged", ledgerId: "81", balance: 125_000 };
      },
    });

    const response = await endpoint(signedRequest(JSON.stringify({ orderId: "travel-order-1", amount: 25_000 })));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, status: "charged", transactionId: "81" });
    expect(chargedInput).toEqual({ customerId: "auth-user-42", orderId: "travel-order-1", amount: 25_000 });
  });

  it("rejects browser-supplied customer identity fields", async () => {
    let chargeCalled = false;
    const endpoint = createTravelWalletPaymentEndpoint({
      secret: () => SECRET,
      now: () => NOW,
      resolveCustomerId: async () => "auth-user-42",
      isActiveCustomer: async () => true,
      charge: async () => {
        chargeCalled = true;
        return { ok: true, result: "charged", ledgerId: "81", balance: 125_000 };
      },
    });

    const body = JSON.stringify({ orderId: "travel-order-1", amount: 25_000, customerId: "attacker" });
    const response = await endpoint(signedRequest(body));

    expect(response.status).toBe(400);
    expect(chargeCalled).toBe(false);
  });

  it("rejects stale signed requests before resolving a customer", async () => {
    let sessionResolved = false;
    const endpoint = createTravelWalletPaymentEndpoint({
      secret: () => SECRET,
      now: () => NOW,
      resolveCustomerId: async () => {
        sessionResolved = true;
        return "auth-user-42";
      },
      isActiveCustomer: async () => true,
      charge: async () => ({ ok: true, result: "charged", ledgerId: "81", balance: 125_000 }),
    });

    const staleTimestamp = String(NOW - 6 * 60 * 1000);
    const response = await endpoint(signedRequest(JSON.stringify({ orderId: "travel-order-1", amount: 25_000 }), staleTimestamp));

    expect(response.status).toBe(401);
    expect(sessionResolved).toBe(false);
  });

  it("keeps wallet charge failures safe to retry without exposing provider details", async () => {
    const endpoint = createTravelWalletPaymentEndpoint({
      secret: () => SECRET,
      now: () => NOW,
      resolveCustomerId: async () => "auth-user-42",
      isActiveCustomer: async () => true,
      charge: async () => {
        throw new Error("database connection detail");
      },
    });

    const response = await endpoint(signedRequest(JSON.stringify({ orderId: "travel-order-1", amount: 25_000 })));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ success: false, error: "PAYMENT_RESULT_UNKNOWN" });
  });

  it("returns insufficient balance without charging and keeps the order retryable", async () => {
    const endpoint = createTravelWalletPaymentEndpoint({
      secret: () => SECRET,
      now: () => NOW,
      resolveCustomerId: async () => "auth-user-42",
      isActiveCustomer: async () => true,
      charge: async () => ({ ok: false, result: "insufficient_balance", balance: 2_000 }),
    });

    const response = await endpoint(signedRequest(JSON.stringify({ orderId: "travel-order-1", amount: 25_000 })));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, error: "INSUFFICIENT_BALANCE", balance: 2_000 });
  });

  it("rejects invalid signatures before resolving a customer", async () => {
    let sessionResolved = false;
    const endpoint = createTravelWalletPaymentEndpoint({
      secret: () => SECRET,
      now: () => NOW,
      resolveCustomerId: async () => {
        sessionResolved = true;
        return "auth-user-42";
      },
      isActiveCustomer: async () => true,
      charge: async () => ({ ok: true, result: "charged", ledgerId: "81", balance: 125_000 }),
    });
    const valid = signedRequest(JSON.stringify({ orderId: "travel-order-1", amount: 25_000 }));
    const headers = new Headers(valid.headers);
    headers.set("x-travel-signature", "0".repeat(64));

    const response = await endpoint(new Request(valid, { headers }));

    expect(response.status).toBe(401);
    expect(sessionResolved).toBe(false);
  });

  it("rejects oversized bodies before resolving a customer", async () => {
    let sessionResolved = false;
    const endpoint = createTravelWalletPaymentEndpoint({
      secret: () => SECRET,
      now: () => NOW,
      resolveCustomerId: async () => {
        sessionResolved = true;
        return "auth-user-42";
      },
      isActiveCustomer: async () => true,
      charge: async () => ({ ok: true, result: "charged", ledgerId: "81", balance: 125_000 }),
    });
    const request = new Request("https://api.djiwatentram.web.id/api/customer/travel-wallet-payment", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(4097) },
      body: "{}",
    });

    const response = await endpoint(request);

    expect(response.status).toBe(413);
    expect(sessionResolved).toBe(false);
  });
});
