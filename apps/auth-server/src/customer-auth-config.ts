export const customerAuthBaseUrl = process.env.BETTER_AUTH_URL?.trim() || "https://api.djiwatentram.web.id";

export const customerTrustedOrigins = [
  // Canonical web.id customer apps.
  "https://djiwatentram.web.id",
  "https://booking.djiwatentram.web.id",
  "https://pay.djiwatentram.web.id",
  "https://admin.djiwatentram.web.id",
  "https://pos.djiwatentram.web.id",
  "https://b2b.djiwatentram.web.id",
  "https://merchandise.djiwatentram.web.id",
  "https://ordermieyamin.djiwatentram.web.id",
  // Legacy customer apps remain trusted during the domain migration.
  "https://djiwatentram.yumme.id",
  "https://pay.yumme.id",
  "https://investor.yumme.id",
  "https://merchandise.yumme.id",
  "https://booking.yumme.id",
  "https://b2b.yumme.id",
  "https://ordermieyamin.yumme.id",
  "https://500kopitasik.yumme.id",
  "https://djiwatravel.com",
  "https://www.djiwatravel.com",
  "https://kolmarketing.yumme.id",
  "https://rekrutmen.yumme.id",
  "http://localhost:5173",
  "http://localhost:3010",
] as const;

export function customerAuthAdvancedConfig() {
  const configuredCookieDomain = process.env.BETTER_AUTH_COOKIE_DOMAIN?.trim();
  return {
    cookies: {
      state: { attributes: { maxAge: 600 } },
    },
    ...(configuredCookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: configuredCookieDomain } }
      : {}),
    defaultCookieAttributes: {
      secure: true,
      httpOnly: true,
      sameSite: "lax" as const,
    },
  };
}
