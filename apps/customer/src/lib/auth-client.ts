import { createAuthClient } from "better-auth/react";
import { sentinelClient } from "@better-auth/infra/client";

export const authClient = createAuthClient({
  // Semua customer app memakai auth server pusat Djiwa App.
  baseURL: "https://api.djiwatentram.web.id/v1/auth",
  fetchOptions: {
    credentials: "include",
  },
  plugins: [
    sentinelClient(),
  ],
});
