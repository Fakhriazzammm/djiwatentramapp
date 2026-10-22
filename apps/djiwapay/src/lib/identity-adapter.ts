import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ baseURL: "https://api.djiwatentram.web.id/api/auth", fetchOptions: { credentials: "include" } });
export type CustomerProfile = { source_id: string; name: string | null; email: string | null; wallet_status?: "active" | "blocked" };
const BRIDGE_START = "https://api.djiwatentram.web.id/api/customer/pay-bridge/start";
const CUSTOMER_AUTH_ORIGIN = "https://djiwatentram.web.id/masuk";
export type PayNavigationContext = { source: "customer"; username: string } | null;
export function getPayNavigationContext(): PayNavigationContext {
  const params = new URLSearchParams(window.location.search);
  const username = params.get("username");
  return params.get("source") === "customer" && username ? { source: "customer", username } : null;
}

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
  return `${BRIDGE_START}?returnTo=${encodeURIComponent(window.location.href.split("?")[0])}`;
}

export function buildCustomerAuthUrl() {
  const returnTo = `${window.location.origin}`;
  return `${CUSTOMER_AUTH_ORIGIN}?sso=1&returnTo=${encodeURIComponent(returnTo)}`;
}

export async function resolveIdentity(): Promise<CustomerProfile | null> {
  const bridged = await exchangeBridgeToken();
  if (bridged) return bridged;
  const response = await fetch("/api/pay-bridge/profile", { credentials: "include", headers: { Accept: "application/json" } });
  if (response.ok) {
    const payload = await response.json() as { success?: boolean; customer?: CustomerProfile | null };
    return payload.success ? payload.customer ?? null : null;
  }
  if (response.status !== 401) throw new Error(`Sesi Djiwa Pay HTTP ${response.status}`);
  const session = await authClient.getSession();
  if (session.data?.user) {
    window.location.assign(buildPayBridgeStartUrl());
  }
  return null;
}
