// Central Better Auth/Customer configuration for the Djiwa App storefronts.
//
// This mirrors what the production host runs: the auth server is reachable from
// several app domains, so the base URL is resolved from the incoming host against
// an explicit allowlist instead of one hardcoded origin.

export const customerAuthBaseUrl = {
	allowedHosts: [
		"djiwatentram.web.id",
		"*.djiwatentram.web.id",
		"*.yumme.id",
		"djiwatravel.com",
		"www.djiwatravel.com",
		"localhost:5173",
		"localhost:3010",
	],
	fallback: "https://api.djiwatentram.web.id",
	protocol: "https",
};

// Used when CUSTOMER_ALLOWED_ORIGINS is not set (local runs, first boot).
export const defaultCustomerTrustedOrigins = [
	"https://djiwatentram.web.id",
	"https://booking.djiwatentram.web.id",
	"https://pay.djiwatentram.web.id",
	"https://djiwapay.web.id",
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
];

export function resolveCustomerTrustedOrigins() {
	const configured = (process.env.CUSTOMER_ALLOWED_ORIGINS ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	return configured.length > 0 ? configured : defaultCustomerTrustedOrigins;
}

// The customer bundle signs in same-origin (djiwatentram.web.id/api/auth) and reads
// its data from the same origin (/api/customer). Other apps still call
// api.djiwatentram.web.id/v1/customer, so the session cookie must span both hosts.
// Without a shared cookie domain the cookie stays host-only, the API host never
// receives it, and every authenticated call answers 401 (empty history).
export function customerCookieDomain() {
	return (process.env.AUTH_COOKIE_DOMAIN ?? process.env.BETTER_AUTH_COOKIE_DOMAIN ?? "").trim();
}

export function customerAuthAdvancedConfig() {
	const domain = customerCookieDomain();
	return {
		cookies: {
			// Match the database OAuth verification entry's ten-minute TTL.
			state: { name: "djiwa-pay-state-v2", attributes: { maxAge: 600 } },
		},
		...(domain ? { crossSubDomainCookies: { enabled: true, domain } } : {}),
		defaultCookieAttributes: {
			secure: true,
			httpOnly: true,
			sameSite: "lax" as const,
		},
	};
}
