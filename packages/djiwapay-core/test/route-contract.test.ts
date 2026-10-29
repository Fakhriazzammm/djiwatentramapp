import { describe, expect, test } from "bun:test";
import { buildDjiwaPayBridgeUrl, buildDjiwaPayUrl, normalizeReturnTarget, PAY_ORIGIN } from "../src";
describe("Djiwa Pay route contract", () => {
  test("builds an allowlisted return target on the custom domain", () => expect(buildDjiwaPayUrl({ context: "customer", returnTo: "https://djiwatentram.web.id/alice/saldo?tab=history" })).toBe("https://djiwapay.web.id/customer/wallet?returnTo=https%3A%2F%2Fdjiwatentram.web.id%2Falice%2Fsaldo%3Ftab%3Dhistory"));
  test("rejects an external return target", () => expect(normalizeReturnTarget("https://evil.example/steal")).toBeNull());
  test("rejects non-HTTPS targets", () => expect(normalizeReturnTarget("javascript:alert(1)")).toBeNull());
  test("uses the custom domain for the default route", () => expect(buildDjiwaPayUrl({ context: "customer" })).toBe("https://djiwapay.web.id/customer/wallet"));
  test("accepts the customer consumer origin", () => expect(buildDjiwaPayUrl({ context: "customer", returnTo: "https://djiwatentram.web.id/azzam/saldo" })).toBe("https://djiwapay.web.id/customer/wallet?returnTo=https%3A%2F%2Fdjiwatentram.web.id%2Fazzam%2Fsaldo"));
  test("builds the customer wallet route with the username in the custom domain path", () => expect(buildDjiwaPayUrl({ context: "customer", username: "azzam putra" })).toBe("https://djiwapay.web.id/azzam%20putra/wallet"));
  test("routes host apps through the customer session bridge", () => expect(buildDjiwaPayBridgeUrl({ context: "customer", username: "azzam" })).toBe("https://api.djiwatentram.web.id/v1/customer/pay-bridge/start?returnTo=https%3A%2F%2Fdjiwapay.web.id%2Fazzam%2Fwallet"));
  test("keeps the host return target inside the bridged pay URL", () => expect(buildDjiwaPayBridgeUrl({ context: "b2b", returnTo: "https://b2b.djiwatentram.web.id/alice/saldo" })).toBe("https://api.djiwatentram.web.id/v1/customer/pay-bridge/start?returnTo=https%3A%2F%2Fdjiwapay.web.id%2Fb2b%2Fwallet%3FreturnTo%3Dhttps%253A%252F%252Fb2b.djiwatentram.web.id%252Falice%252Fsaldo"));
  test("never bridges to a foreign pay origin", () => {
    const bridged = new URL(buildDjiwaPayBridgeUrl({ context: "customer", username: "azzam" }));
    expect(new URL(bridged.searchParams.get("returnTo")!).origin).toBe(PAY_ORIGIN);
  });
});
