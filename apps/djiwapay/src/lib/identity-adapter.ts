import { createAuthClient } from "better-auth/react";
import { isNativeApp, nativeGoogleIdToken } from "./native";

// Auth goes through this app's own origin (Nginx proxies /api/auth and
// /api/customer/pay-bridge to the central auth server), so the browser never sees
// another host and the session cookie stays first-party.
const PAY_ORIGIN = typeof window !== "undefined" && /^https?:/.test(window.location.origin) ? window.location.origin : "https://djiwapay.web.id";
export const CUSTOMER_AUTH_BASE = `${PAY_ORIGIN}/api/auth`;
export const BRIDGE_START = `${PAY_ORIGIN}/api/customer/pay-bridge/start`;
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
// Starts Google sign-in without leaving Djiwa Pay's own domain; the callback
// returns here with ?sso=1 so resolveIdentity trades the session for a Pay cookie.
export async function signInWithGoogle(currentUrl = window.location.href) {
  const returnTo = new URL(currentUrl);
  returnTo.search = "";
  returnTo.hash = "";
  returnTo.searchParams.set("sso", "1");
  if (isNativeApp()) {
    // Google refuses its sign-in page inside an embedded WebView, so the app picks the account natively and hands Better Auth the ID token.
    const limit = <T,>(p: Promise<T>, ms: number, msg: string) => new Promise<T>((ok, no) => { const t = setTimeout(() => no(new Error(msg)), ms); p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); no(e); }); });
    const idToken = await limit(nativeGoogleIdToken(), 40_000, "Pemilih akun Google tidak merespons. Tutup aplikasi lalu coba lagi, atau masuk dengan email dan kata sandi.");
    if (!idToken) return;
    const done = await limit(authClient.signIn.social({ provider: "google", idToken: { token: idToken }, disableRedirect: true }), 25_000, "Server masuk lambat merespons. Periksa sinyal lalu coba lagi.");
    if (done.error) throw new Error(done.error.message || "Gagal masuk dengan Google");
    window.location.assign(returnTo.toString());
    return;
  }
  const result = await authClient.signIn.social(buildGoogleSignInOptions(returnTo.toString()));
  const url = result.data?.url;
  if (!url) throw new Error(result.error?.message || "Gagal memulai masuk dengan Google");
  window.location.assign(url);
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
export type CustomerProfile = { source_id: string; name: string | null; email: string | null; phone?: string | null; photo_url?: string | null; wallet_status?: "active" | "blocked" };
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

/**
 * The Pay session lives 15 minutes on the server. When an API call comes back 401 while the person is still signed in,
 * go through the bridge once to get a fresh session instead of leaving the page on an error. Returns true when the page is navigating away.
 */
export async function recoverPaySession(): Promise<boolean> {
  try {
    const last = Number(window.sessionStorage.getItem("djiwa-pay-recover") || 0);
    if (Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem("djiwa-pay-recover", String(Date.now()));
  } catch { /* storage blocked: still try once */ }
  try {
    const session = await authClient.getSession();
    if (!session.data?.user) return false;
    window.location.assign(buildPayBridgeStartUrl());
    return true;
  } catch { return false; }
}

/** Sign out of Djiwa Pay: end the Pay session on the server, then the shared Better Auth session, then start over at "/". */
export async function logout(): Promise<void> {
  await fetch("/api/pay-bridge/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
  await authClient.signOut().catch(() => undefined);
  try { window.sessionStorage.clear(); } catch { /* storage blocked */ }
  window.location.replace("/");
}
