import { createAuthClient } from "better-auth/react";

const authOrigin = import.meta.env.VITE_INVESTOR_AUTH_URL?.trim() || "https://auth.zantara.id/api/auth";

export const investorAuth = createAuthClient({
  baseURL: authOrigin,
  fetchOptions: { credentials: "include" },
});
