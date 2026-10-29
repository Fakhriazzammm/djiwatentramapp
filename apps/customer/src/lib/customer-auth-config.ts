export const CUSTOMER_API_ORIGIN = "https://api.djiwatentram.web.id";
// Keep browser auth first-party so OAuth cookies are set and read on the customer origin.
// Nginx proxies this path to the central Better Auth server.
export const CUSTOMER_AUTH_BASE = "/api/auth";
export const CUSTOMER_API_BASE = `${CUSTOMER_API_ORIGIN}/v1/customer`;
