const MAYAR_HOST_SUFFIX = ".mayar.id";
const PAYMENT_HOST_SUFFIX = ".myr.id";

export function normalizeMayarPaymentUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const isMayarHost = hostname === "mayar.id" || hostname.endsWith(MAYAR_HOST_SUFFIX);
    const isHostedPaymentHost = hostname === "myr.id" || hostname.endsWith(PAYMENT_HOST_SUFFIX);
    if (!isMayarHost && !isHostedPaymentHost) return null;
    return url.href;
  } catch {
    return null;
  }
}
