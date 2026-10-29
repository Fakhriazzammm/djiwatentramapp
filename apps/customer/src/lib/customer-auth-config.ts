export const CUSTOMER_API_ORIGIN = "https://api.djiwatentram.web.id";
// Keep browser auth first-party so OAuth cookies are set and read on the customer origin.
// Nginx proxies this path to the central Better Auth server.
//
// better-auth rejects relative base URLs ("Invalid base URL: /api/auth"), and the
// throw happens while the auth client module is evaluated — before React mounts,
// which blanks the whole app. Keep the path same-origin but always hand better-auth
// an absolute URL. In the browser we anchor it to window.location.origin; during
// SSR/prerender (no window) we fall back to the canonical customer origin.
const CUSTOMER_AUTH_PATH = "/api/auth";

// Customer data follows the same rule as auth: the browser talks to the origin it
// was served from and nginx proxies the path to the central Better Auth server.
// Calling api.djiwatentram.web.id directly made every /v1/customer/* request depend
// on a cross-subdomain session cookie; whenever that cookie stayed host-only the
// user appeared logged in but got 401 and an empty order history.
const CUSTOMER_API_PATH = "/api/customer";

const CUSTOMER_FALLBACK_ORIGIN = "https://djiwatentram.web.id";

function resolveSameOriginBase(path: string) {
	if (typeof window !== "undefined" && window.location?.origin) {
		return `${window.location.origin}${path}`;
	}
	return `${CUSTOMER_FALLBACK_ORIGIN}${path}`;
}

export const CUSTOMER_AUTH_PATHNAME = CUSTOMER_AUTH_PATH;
export const CUSTOMER_API_PATHNAME = CUSTOMER_API_PATH;
export const CUSTOMER_AUTH_BASE = resolveSameOriginBase(CUSTOMER_AUTH_PATH);
export const CUSTOMER_API_BASE = resolveSameOriginBase(CUSTOMER_API_PATH);
