import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ baseURL: "https://api.djiwatentram.web.id/api/auth", fetchOptions: { credentials: "include" } });
export type CustomerProfile = { source_id: string; name: string | null; email: string | null; wallet_status?: "active" | "blocked" };
const BRIDGE_START = "https://api.djiwatentram.web.id/v1/customer/pay-bridge/start";

async function exchangeBridgeToken(): Promise<CustomerProfile | null> {
  const token = new URLSearchParams(window.location.search).get("bridgeToken");
  if (!token) return null;
  const response = await fetch("/api/pay-bridge/exchange", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
  window.history.replaceState({}, "", window.location.pathname);
  if (!response.ok) return null;
  const payload = await response.json() as { success?: boolean; customer?: CustomerProfile | null };
  return payload.success ? payload.customer ?? null : null;
}

export function buildPayBridgeStartUrl() {
  return `${BRIDGE_START}?returnTo=${encodeURIComponent(window.location.href)}`;
}

export async function resolveIdentity(): Promise<CustomerProfile | null> {
  const bridged = await exchangeBridgeToken();
  if (bridged) return bridged;
  const response = await fetch("/api/pay-bridge/profile", { credentials: "include", headers: { Accept: "application/json" } });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Sesi Djiwa Pay HTTP ${response.status}`);
  const payload = await response.json() as { success?: boolean; customer?: CustomerProfile | null };
  return payload.success ? payload.customer ?? null : null;
}
