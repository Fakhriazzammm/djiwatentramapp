import { CUSTOMER_AUTH_BASE_URL, customerAuthCallback, getSafeCustomerReturnUrl, validateCredentials } from "./customer-auth-flow";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void };

describe("customer authentication", () => {
  it("validates registration before creating an account while allowing legacy login passwords", () => {
    expect(validateCredentials("bad", "password", "Name", true)).toBe("Masukkan email yang valid.");
    expect(validateCredentials("a@example.com", "short", "Name", true)).toBe("Password minimal 8 karakter.");
    expect(validateCredentials("a@example.com", "password", " ", true)).toBe("Nama lengkap wajib diisi.");
    expect(validateCredentials("a@example.com", "password", "Name", false)).toBe("Persetujuan wajib dipilih saat membuat akun.");
    expect(validateCredentials("a@example.com", "x".repeat(129), "Name", true)).toBe("Password maksimal 128 karakter.");
    expect(validateCredentials(" a@example.com ", "password", "Name", true)).toBe(null);
    expect(validateCredentials("a@example.com", "short")).toBe(null);
  });
  it("preserves permitted SSO handoffs and rejects unsafe destinations", () => {
    const search = (url: string) => `?sso=1&returnTo=${encodeURIComponent(url)}`;
    expect(getSafeCustomerReturnUrl(search("https://booking.yumme.id/?stage=order"))).toBe("https://booking.yumme.id/?stage=order");
    expect(getSafeCustomerReturnUrl(search("https://booking.djiwatentram.web.id/?step=checkout"))).toBe("https://booking.djiwatentram.web.id/?step=checkout");
    for (const url of ["https://evil.example/", "//booking.yumme.id/", "https://user:pass@booking.yumme.id/", "https://booking.yumme.id/admin", "https://booking.yumme.id/?next=https://evil.example", "https://booking.yumme.id/#evil"]) {
      expect(getSafeCustomerReturnUrl(search(url))).toBe(null);
    }
    expect(customerAuthCallback("https://djiwatentram.yumme.id", "?error=google&returnTo=https://evil.example")).toBe("https://djiwatentram.yumme.id/masuk");
    expect(new URL(customerAuthCallback("https://djiwatentram.yumme.id", search("https://booking.yumme.id/"))).searchParams.get("returnTo")).toBe("https://booking.yumme.id/");
  });
  it("sends auth requests to the canonical host without appending another auth prefix", async () => {
    const { createAuthClient } = await import("better-auth/client");
    let requested = "";
    let credentials: unknown;
    const client = createAuthClient({
      baseURL: CUSTOMER_AUTH_BASE_URL,
      fetchOptions: {
        credentials: "include",
        customFetchImpl: async (url, options) => {
          requested = String(url);
          credentials = options?.credentials;
          return new Response(JSON.stringify({ message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" }), { status: 401, headers: { "Content-Type": "application/json" } });
        },
      },
    });
    const result = await client.signIn.email({ email: "a@example.invalid", password: "invalid" });
    expect(requested).toBe("https://auth.zantara.id/api/auth/sign-in/email");
    expect(credentials).toBe("include");
    expect(result.error?.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    await client.signUp.email({ email: "a@example.invalid", password: "x", name: "Smoke" });
    expect(requested).toBe("https://auth.zantara.id/api/auth/sign-up/email");
    await client.getSession({ query: { disableCookieCache: true } });
    expect(requested).toBe("https://auth.zantara.id/api/auth/get-session?disableCookieCache=true");
    await client.signIn.social({ provider: "google", callbackURL: "https://djiwatentram.yumme.id/masuk" });
    expect(requested).toBe("https://auth.zantara.id/api/auth/sign-in/social");
    await client.requestPasswordReset({ email: "a@example.invalid" });
    expect(requested).toBe("https://auth.zantara.id/api/auth/request-password-reset");
    await client.signOut();
    expect(requested).toBe("https://auth.zantara.id/api/auth/sign-out");
  });
});
