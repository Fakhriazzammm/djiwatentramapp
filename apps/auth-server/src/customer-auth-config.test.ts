import { describe, expect, test } from "bun:test";
import {
  customerAuthAdvancedConfig,
  customerAuthBaseUrl,
  customerTrustedOrigins,
} from "./customer-auth-config";

describe("customer auth domain contract", () => {
  test("trusts the new web.id customer and booking origins", () => {
    expect(customerTrustedOrigins).toContain("https://djiwatentram.web.id");
    expect(customerTrustedOrigins).toContain("https://booking.djiwatentram.web.id");
    expect(customerTrustedOrigins).toContain("https://djiwatentram.yumme.id");
  });

  test("uses the central API as the Better Auth base URL", () => {
    expect(customerAuthBaseUrl).toBe("https://api.djiwatentram.web.id");
  });

  test("uses a host-only cookie unless an explicit cookie domain is configured", () => {
    const config = customerAuthAdvancedConfig();
    expect(config.crossSubDomainCookies).toBeUndefined();
    expect(config.defaultCookieAttributes).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
  });
});
