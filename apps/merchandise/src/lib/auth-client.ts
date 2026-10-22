import { createAuthClient } from "better-auth/react";
import { sentinelClient } from "@better-auth/infra/client";

const AUTH_SERVER_URL = "https://api.yumme.id/v1/auth";
const DJIWA_APP_LOGIN_URL = "https://djiwatentram.yumme.id/masuk";
const MERCHANDISE_ORIGIN = "https://merchandise.yumme.id";
const ALLOWED_ORDER_STEPS = new Set(["checkout", "shipping", "payment"]);

function isSafeMerchandiseReturnUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== MERCHANDISE_ORIGIN && url.origin !== "http://localhost:5174") return false;
    if (!/^\/[^/]+\/order$/.test(url.pathname)) return false;
    const step = url.searchParams.get("step");
    return [...url.searchParams.keys()].every((key) => key === "step") && !url.hash && (step == null || ALLOWED_ORDER_STEPS.has(step));
  } catch {
    return false;
  }
}

export function getMerchandiseAuthReturnUrl(fallbackUsername?: string) {
  if (typeof window === "undefined") return undefined;
  const current = new URL(window.location.href);
  const requested = current.searchParams.get("returnTo");
  if (requested && isSafeMerchandiseReturnUrl(requested)) return requested;

  if (isSafeMerchandiseReturnUrl(current.toString())) return current.toString();
  if (fallbackUsername) return `${window.location.origin}/${encodeURIComponent(fallbackUsername)}/order?step=checkout`;
  return `${window.location.origin}/`;
}

export function redirectToDjiwaAppLogin(returnTo?: string) {
  const safeReturnTo = returnTo && isSafeMerchandiseReturnUrl(returnTo)
    ? returnTo
    : getMerchandiseAuthReturnUrl();
  const url = new URL(DJIWA_APP_LOGIN_URL);
  url.searchParams.set("sso", "1");
  if (safeReturnTo) url.searchParams.set("returnTo", safeReturnTo);
  window.location.assign(url.toString());
}

export const authClient = createAuthClient({
  // Semua customer app memakai auth server pusat Djiwa App.
  baseURL: AUTH_SERVER_URL,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [
    sentinelClient(),
  ],
});
