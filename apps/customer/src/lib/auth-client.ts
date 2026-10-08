import { createAuthClient } from "better-auth/react";
import { CUSTOMER_AUTH_BASE_URL } from "./customer-auth-flow";
import { sentinelClient } from "@better-auth/infra/client";

export const authClient = createAuthClient({
  // Semua customer app memakai auth server pusat Djiwa App.
  baseURL: CUSTOMER_AUTH_BASE_URL,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [
    sentinelClient(),
  ],
});
