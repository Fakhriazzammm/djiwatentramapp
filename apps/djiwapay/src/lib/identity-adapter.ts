import { createAuthClient } from "better-auth/react";

export const CUSTOMER_AUTH_BASE = "https://api.djiwatentram.web.id/v1/auth";
// The customer session cookie is host-only on djiwatentram.web.id. Keep the
// bridge request first-party so the browser sends that cookie after SSO.
export const BRIDGE_START = "https://djiwatentram.web.id/api/customer/pay-bridge/start";
export const authClient = createAuthClient({ baseURL: CUSTOMER_AUTH_BASE, fetchOptions: { credentials: "include" } });
export function buildGoogleSignInOptions(callbackURL: string) {
  return {
    provider: "google" as const,
    callbackURL,
    errorCallbackURL: callbackURL,
    disableRedirect: true as const,
  };
}
export function cleanAuthCallbackURL(value: string) {
  const url = new URL(value);
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  url.searchParams.delete("error_uri");
  return url.toString();
}
export function buildCustomerAuthUrl(currentUrl = window.location.href) {
  const returnTo = new URL(currentUrl);
  returnTo.search = "";
  returnTo.searchParams.set("sso", "1");
  return `${CUSTOMER_AUTH_ORIGIN}?sso=1&returnTo=${encodeURIComponent(returnTo.toString())}`;
}
export function shouldResumePayBridge(currentUrl = window.location.href) {
  return new URL(currentUrl).searchParams.get("sso") === "1";
}
export type CustomerProfile = { source_id: string; name: string | null; email: string | null; phone?: string | null; wallet_status?: "active" | "blocked" };
const CUSTOMER_AUTH_ORIGIN = "https://djiwatentram.web.id/masuk";
export type PayNavigationContext = { source: "customer"; username: string } | null;
export function getPayNavigationContext(): PayNavigationContext {
  const pathMatch = /^\/([^/]+)\/wallet\/?$/.exec(window.location.pathname);
  if (pathMatch) return { source: "customer", username: decodeURIComponent(pathMatch[1]) };
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

export async function resolveIdentity(): Promise<CustomerProfile | null> {
  const bridged = await exchangeBridgeToken();
  if (bridged) return bridged;
  const response = await fetch("/api/pay-bridge/profile", { credentials: "include", headers: { Accept: "application/json" } });
  if (response.ok) {
    const payload = await response.json() as { success?: boolean; customer?: CustomerProfile | null };
    return payload.success ? payload.customer ?? null : null;
  }
  if (response.status !== 401) throw new Error(`Sesi Djiwa Pay HTTP ${response.status}`);
  if (shouldResumePayBridge()) {
    window.location.assign(buildPayBridgeStartUrl());
    return null;
  }
  const session = await authClient.getSession();
  if (session.data?.user) {
    window.location.assign(buildPayBridgeStartUrl());
  }
  return null;
}
