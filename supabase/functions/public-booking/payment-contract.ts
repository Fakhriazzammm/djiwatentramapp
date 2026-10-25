export function guestExpiryIso(value: unknown): string {
  const date = typeof value === "number"
    ? new Date(value < 100_000_000_000 ? value * 1000 : value)
    : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())
      ? new Date(Number(value) < 100_000_000_000 ? Number(value) * 1000 : Number(value))
      : new Date(typeof value === "string" ? value : NaN);
  if (!Number.isFinite(date.getTime())) throw new Error("Booking expiry is invalid");
  return date.toISOString();
}

export function canonicalBookingReturnUrl(value: unknown, bookingCode: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || typeof bookingCode !== "string" || !bookingCode.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!["https://booking.yumme.id", "https://booking.djiwatentram.web.id"].includes(url.origin)) return null;
    if (url.pathname !== "/status" && url.pathname !== "/booking/status") return null;
    url.search = "";
    url.searchParams.set("code", bookingCode.trim());
    return url.href;
  } catch { return null; }
}
