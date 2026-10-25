import { describe, expect, test } from "bun:test";
import { canonicalBookingReturnUrl, buildBookingInvoicePayload, guestExpiryIso } from "./payment-contract";
import { normalizeMayarPaymentUrl } from "./payment-url";

describe("public booking payment contract", () => {
  test("accepts only HTTPS Mayar payment URLs", () => {
    expect(normalizeMayarPaymentUrl("https://mayar.id/invoice/abc")).toBe("https://mayar.id/invoice/abc");
    expect(normalizeMayarPaymentUrl("https://checkout.mayar.id/invoice/abc")).toBe("https://checkout.mayar.id/invoice/abc");
    expect(normalizeMayarPaymentUrl("http://mayar.id/invoice/abc")).toBeNull();
    expect(normalizeMayarPaymentUrl("https://mayar.id.evil.example/invoice/abc")).toBeNull();
  });

  test("normalizes only booking status return URLs on supported domains", () => {
    expect(canonicalBookingReturnUrl("https://booking.djiwatentram.web.id/status?old=1", "BK-123")).toBe("https://booking.djiwatentram.web.id/status?code=BK-123");
    expect(canonicalBookingReturnUrl("https://booking.yumme.id/booking/status", "BK-456")).toBe("https://booking.yumme.id/booking/status?code=BK-456");
    expect(canonicalBookingReturnUrl("https://evil.example/status", "BK-123")).toBeNull();
  });

  test("builds Mayar items from persisted booking context, not browser prices", () => {
    const payload = buildBookingInvoicePayload({
      bookingId: "booking-1",
      bookingCode: "BK-123",
      customerName: "Actual Customer",
      customerEmail: "actual@example.com",
      customerPhone: "081234567890",
      bookingDate: "2026-10-30",
      guestExpiresAt: "2026-10-26T00:00:00.000Z",
      items: [{ name: "Nasi Ayam", price: 30000, quantity: 2, browserPrice: 1, browserName: "Fake" }],
    }, "https://booking.djiwatentram.web.id/status?code=wrong");

    expect(payload.items).toEqual([{ description: "Nasi Ayam", quantity: 2, rate: 30000 }]);
    expect(payload.name).toBe("Actual Customer");
    expect(payload.mobile).toBe("081234567890");
    expect(payload.extraData).toEqual({ bookingId: "booking-1", bookingCode: "BK-123" });
    expect(payload.redirectUrl).toBe("https://booking.djiwatentram.web.id/status?code=BK-123");
    expect(payload.expiredAt).toBe(guestExpiryIso("2026-10-26T00:00:00.000Z"));
  });
});
