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

function resolveCustomerAuthBase() {
	if (typeof window !== "undefined" && window.location?.origin) {
		return `${window.location.origin}${CUSTOMER_AUTH_PATH}`;
	}
	return `https://djiwatentram.web.id${CUSTOMER_AUTH_PATH}`;
}

export const CUSTOMER_AUTH_PATHNAME = CUSTOMER_AUTH_PATH;
export const CUSTOMER_AUTH_BASE = resolveCustomerAuthBase();
export const CUSTOMER_API_BASE = `${CUSTOMER_API_ORIGIN}/v1/customer`;
