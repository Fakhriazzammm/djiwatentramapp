import type { DjiwaPayContext, ReturnTarget } from "./types";

export const PAY_ORIGIN = "https://pay.djiwatentram.web.id";
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
