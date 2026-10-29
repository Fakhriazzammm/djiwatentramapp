import type { DjiwaPayContext, ReturnTarget } from "./types";

export const PAY_ORIGIN = "https://djiwapay.web.id";
// Djiwa Pay lives outside .djiwatentram.web.id, so the shared customer session
// cookie is not sent on a direct top-level visit. Host apps must enter Pay
// through the auth server bridge, which trades that cookie for a Pay ticket.
export const PAY_BRIDGE_START_URL = "https://api.djiwatentram.web.id/v1/customer/pay-bridge/start";
export const ALLOWED_RETURN_ORIGINS = new Set([
  "https://djiwatentram.web.id",
  "https://djiwatentram.web.id",
  "https://b2b.djiwatentram.web.id",
  "https://merchandise.djiwatentram.web.id",
  "https://pos.djiwatentram.web.id",
  "https://admin.djiwatentram.web.id",
]);

export function normalizeReturnTarget(value: string | undefined): ReturnTarget | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !ALLOWED_RETURN_ORIGINS.has(url.origin)) return null;
    return { origin: url.origin, path: `${url.pathname || "/"}${url.search}${url.hash}` };
  } catch { return null; }
}

export function buildDjiwaPayUrl(input: { context: DjiwaPayContext; route?: "wallet" | "topup"; returnTo?: string; username?: string }): string {
  const route = input.route ?? "wallet";
  const path = input.context === "customer" && input.username
    ? `/${encodeURIComponent(input.username)}/${route}`
    : `/${input.context}/${route}`;
  const url = new URL(path, PAY_ORIGIN);
  const target = normalizeReturnTarget(input.returnTo);
  if (target) url.searchParams.set("returnTo", `${target.origin}${target.path}`);
  return url.toString();
}

export function buildDjiwaPayBridgeUrl(input: { context: DjiwaPayContext; route?: "wallet" | "topup"; returnTo?: string; username?: string }): string {
  const url = new URL(PAY_BRIDGE_START_URL);
  url.searchParams.set("returnTo", buildDjiwaPayUrl(input));
  return url.toString();
}
