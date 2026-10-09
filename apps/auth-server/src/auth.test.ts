import { describe, expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { auth } from "./auth.js";

function testAuth() {
  return betterAuth({
    ...auth.options,
    database: memoryAdapter({}),
    plugins: [],
    secret: "customer-oauth-regression-test-secret-only",
    socialProviders: {
      google: { clientId: "test-google-client", clientSecret: "test-google-secret" },
    },
  });
}

async function startGoogle(instance: ReturnType<typeof testAuth>, host: string, forwardedHost?: string) {
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: "https://djiwatentram.yumme.id",
    Host: host,
    "X-Forwarded-Proto": "http", // Production config must still force HTTPS.
  });
  if (forwardedHost) headers.set("X-Forwarded-Host", forwardedHost);
  const response = await instance.handler(new Request("http://localhost:3001/api/auth/sign-in/social", {
    method: "POST",
    headers,
    body: JSON.stringify({ provider: "google", callbackURL: "https://djiwatentram.yumme.id" }),
  }));
  expect(response.status).toBe(200);
  const body = await response.json() as { url: string };
  const redirectURI = new URL(body.url).searchParams.get("redirect_uri");
  return { response, redirectURI };
}

describe("customer Google OAuth public origin", () => {
  test("proxy host takes precedence and state cookies remain shared across Yumme subdomains", async () => {
    const { response, redirectURI } = await startGoogle(testAuth(), "auth.zantara.id", "api.yumme.id");
    expect(redirectURI).toBe("https://api.yumme.id/api/auth/callback/google");
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("__Secure-better-auth.state=");
    expect(cookie).toContain("Domain=.yumme.id");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  test("successive requests resolve independently for API, storefront and central auth", async () => {
    const instance = testAuth();
    for (const host of ["api.yumme.id", "djiwatentram.yumme.id", "auth.zantara.id"]) {
      const { redirectURI } = await startGoogle(instance, host);
      expect(redirectURI).toBe(`https://${host}/api/auth/callback/google`);
    }
  });

  test("unlisted and lookalike Host or forwarded hosts use only the configured fallback", async () => {
    const instance = testAuth();
    const fallback = process.env.BETTER_AUTH_URL || "https://auth.zantara.id";
    for (const host of ["attacker.example", "api.yumme.id.attacker.example", "unlisted.yumme.id"]) {
      for (const forwarded of [false, true]) {
        const { redirectURI } = await startGoogle(instance, forwarded ? "auth.zantara.id" : host, forwarded ? host : undefined);
        expect(redirectURI).toBe(`${fallback}/api/auth/callback/google`);
      }
    }
  });
});
