import { afterEach, describe, expect, test } from "bun:test";
import { buildBookingLoginUrl, fetchBookingCustomer } from "../src/lib/customer-auth";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("booking customer auth contract", () => {
  test("builds a customer-app login URL that returns to booking checkout", () => {
    const loginUrl = new URL(buildBookingLoginUrl("https://booking.yumme.id"));

    expect(loginUrl.origin).toBe("https://djiwatentram.yumme.id");
    expect(loginUrl.pathname).toBe("/masuk");
    expect(loginUrl.searchParams.get("sso")).toBe("1");
    expect(loginUrl.searchParams.get("returnTo")).toBe("https://booking.yumme.id/?step=checkout");
  });

  test("reads the shared session and customer profile endpoints with cookies", async () => {
    const requests: Array<{ url: string; credentials?: RequestCredentials }> = [];
    globalThis.fetch = (async (input, init) => {
      requests.push({ url: String(input), credentials: init?.credentials });
      if (String(input).endsWith("/api/auth/get-session")) {
        return Response.json({ user: { id: "user-123", name: "Djiwa Member", email: "member@example.com" } });
      }
      return Response.json({ success: true, customer: { source_id: "customer-123", phone: "08123456789" } });
    }) as typeof fetch;

    await expect(fetchBookingCustomer()).resolves.toEqual({
      sourceId: "customer-123",
      name: "Djiwa Member",
      email: "member@example.com",
      phone: "08123456789",
    });
    expect(requests).toEqual([
      { url: "https://api.djiwatentram.web.id/api/auth/get-session", credentials: "include" },
      { url: "https://api.djiwatentram.web.id/v1/customer/profile", credentials: "include" },
    ]);
  });

  test("treats an empty shared session as anonymous without loading a profile", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      requests.push(String(input));
      return Response.json(null);
    }) as typeof fetch;

    await expect(fetchBookingCustomer()).resolves.toBeNull();
    expect(requests).toEqual(["https://api.djiwatentram.web.id/api/auth/get-session"]);
  });
});
