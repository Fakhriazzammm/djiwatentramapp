export type BookingPaymentItem = {
  name: string;
  price: number;
  quantity: number;
};

export type BookingPaymentContext = {
  bookingId: string;
  bookingCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  bookingDate: string;
  guestExpiresAt: string | number;
  items: BookingPaymentItem[];
};

const BOOKING_ORIGINS = new Set([
  "https://booking.djiwatentram.web.id",
  "https://booking.yumme.id",
]);

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
    if (url.protocol !== "https:" || url.username || url.password || !BOOKING_ORIGINS.has(url.origin)) return null;
    if (url.pathname !== "/status" && url.pathname !== "/booking/status") return null;
    url.search = "";
    url.searchParams.set("code", bookingCode.trim());
    return url.href;
  } catch {
    return null;
  }
}

export function buildBookingInvoicePayload(context: BookingPaymentContext, redirectUrl: unknown) {
  const items = context.items
    .filter((item) => Number.isFinite(item.price) && Number.isFinite(item.quantity) && item.quantity > 0)
    .map((item) => ({
      description: item.name,
      quantity: item.quantity,
      rate: item.price,
    }));
  if (!items.length) throw new Error("Booking tidak memiliki item pembayaran");
  const canonicalRedirectUrl = canonicalBookingReturnUrl(redirectUrl, context.bookingCode);
  return {
    action: "create-invoice",
    paymentMethod: "qris",
    name: context.customerName,
    email: context.customerEmail,
    mobile: context.customerPhone,
    redirectUrl: canonicalRedirectUrl || undefined,
    description: `Booking ${context.bookingCode} · ${context.bookingDate}`,
    expiredAt: guestExpiryIso(context.guestExpiresAt),
    extraData: { bookingId: context.bookingId, bookingCode: context.bookingCode },
    items,
  };
}
