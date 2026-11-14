import { createAuthClient } from "better-auth/react";

export const API_BASE = import.meta.env.VITE_MANAGER_API_URL?.trim() || "https://api.djiwatentram.web.id";

// Central Djiwa App identity (Google). Same session the investor portal uses.
export const managerAuth = createAuthClient({
  baseURL: API_BASE,
  fetchOptions: { credentials: "include" },
});
