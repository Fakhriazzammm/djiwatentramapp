import { describe, expect, test } from "bun:test";
import { BRIDGE_START, CUSTOMER_AUTH_BASE, buildCustomerAuthUrl, buildGoogleSignInOptions, cleanAuthCallbackURL, shouldResumePayBridge } from "../src/lib/identity-adapter";

describe("Djiwa Pay Google auth", () => {
  test("uses one browser redirect and returns OAuth errors to Pay", () => {
    const callbackURL = "https://djiwapay.web.id/";

    expect(buildGoogleSignInOptions(callbackURL)).toEqual({
      provider: "google",
      callbackURL,
      errorCallbackURL: callbackURL,
      disableRedirect: true,
    });
  });

  test("removes stale OAuth error parameters before retrying login", () => {
    expect(cleanAuthCallbackURL("https://djiwapay.web.id/?error=state_mismatch&error=state_mismatch")).toBe("https://djiwapay.web.id/");
  });

  test("starts the central Djiwa Tentram SSO flow for Pay", () => {
    expect(buildCustomerAuthUrl("https://djiwapay.web.id/alice/wallet?error=state_mismatch")).toBe("https://djiwatentram.web.id/masuk?sso=1&returnTo=https%3A%2F%2Fdjiwapay.web.id%2Falice%2Fwallet%3Fsso%3D1");
  });

  test("recognizes the return from central auth before exchanging the Pay bridge", () => {
    expect(shouldResumePayBridge("https://djiwapay.web.id/alice/wallet?sso=1")).toBe(true);
    expect(shouldResumePayBridge("https://djiwapay.web.id/alice/wallet")).toBe(false);
  });

  test("uses the same public v1 auth and customer contracts as Djiwa Tentram", () => {
    expect(CUSTOMER_AUTH_BASE).toBe("https://api.djiwatentram.web.id/v1/auth");
    expect(BRIDGE_START).toBe("https://api.djiwatentram.web.id/v1/customer/pay-bridge/start");
  });
});
