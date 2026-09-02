import { createAuthClient } from "better-auth/react";
import { sentinelClient } from "@better-auth/infra/client";

const AUTH_SERVER_URL = "https://djiwatentram.yumme.id/api/auth";
const DJIWA_APP_LOGIN_URL = "https://djiwatentram.yumme.id/masuk";

export function redirectToDjiwaAppLogin(returnTo = `${window.location.origin}/masuk?sso=1`) {
  const url = new URL(DJIWA_APP_LOGIN_URL);
  url.searchParams.set("returnTo", returnTo);
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
