const MAYAR_HOST_SUFFIX = ".mayar.id";

export function normalizeMayarPaymentUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (hostname !== "mayar.id" && !hostname.endsWith(MAYAR_HOST_SUFFIX)) return null;
    return url.href;
  } catch {
    return null;
  }
}
