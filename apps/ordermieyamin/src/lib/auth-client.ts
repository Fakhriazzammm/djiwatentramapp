import { createAuthClient } from "better-auth/react";
import { sentinelClient } from "@better-auth/infra/client";

const AUTH_SERVER_URL = "https://api.djiwatentram.web.id/v1/auth";
const DJIWA_APP_LOGIN_URL = "https://djiwatentram.web.id/masuk";
const ORDERMIEYAMIN_ORIGIN = "https://ordermieyamin.djiwatentram.web.id";

function isSafeOrderMieYaminReturnUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== ORDERMIEYAMIN_ORIGIN && url.origin !== "http://localhost:3010") return false;
    return url.pathname === "/" && url.searchParams.get("stage") === "order" && [...url.searchParams.keys()].every((key) => key === "stage") && !url.hash;
  } catch {
    return false;
  }
}

export function redirectToCustomerLogin(returnTo?: string) {
  const safeReturnTo = returnTo && isSafeOrderMieYaminReturnUrl(returnTo) ? returnTo : `${window.location.origin}/?stage=order`;
  const url = new URL(DJIWA_APP_LOGIN_URL);
  url.searchParams.set("sso", "1");
  url.searchParams.set("returnTo", safeReturnTo);
  window.location.assign(url.toString());
}

export const authClient = createAuthClient({
  baseURL: AUTH_SERVER_URL,
  plugins: [
    sentinelClient(),
  ],
});
