import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildBookingLoginUrl, parseCustomerProfile } from "../src/lib/customer-auth";
import { validateCustomer } from "../src/lib/booking-validation";
import { parseStoredInvoice } from "../src/lib/payment-recovery";
import { normalizeMayarPaymentUrl } from "../../../supabase/functions/public-booking/payment-url";
import { canonicalBookingReturnUrl, guestExpiryIso } from "../../../supabase/functions/public-booking/payment-contract";

const bookingClientSource = readFileSync(new URL("../src/lib/client.ts", import.meta.url), "utf8");
const bookingPageSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const publicBookingSource = readFileSync(new URL("../../../supabase/functions/public-booking/index.ts", import.meta.url), "utf8");

describe("booking customer checkout regressions", () => {
  test("accepts a complete customer profile and rejects malformed success payloads", () => {
    expect(parseCustomerProfile({ success: true, customer: { source_id: "cust-1", name: "Ada", email: "ada@example.com", phone: "081234567890" } }, { id: "session-1" })).toEqual({ sourceId: "cust-1", name: "Ada", email: "ada@example.com", phone: "081234567890" });
    expect(parseCustomerProfile({ success: true, customer: { name: "Ada" } }, { id: "session-1", email: "ada@example.com" })).toBeNull();
    expect(parseCustomerProfile({ success: false, customer: { source_id: "cust-1", name: "Ada", email: "ada@example.com", phone: "081234567890" } }, { id: "session-1" })).toBeNull();
  });

  test("builds checkout login navigation on the customer page, never the API host", () => {
    const login = new URL(buildBookingLoginUrl("https://booking.djiwatentram.web.id"));
    expect(login.origin).toBe("https://djiwatentram.web.id");
    expect(login.pathname).toBe("/masuk");
    expect(login.searchParams.get("sso")).toBe("1");
    expect(login.searchParams.get("returnTo")).toBe("https://booking.djiwatentram.web.id/?step=checkout");
    expect(login.origin).not.toBe("https://api.djiwatentram.web.id");
  });

  test("validates customer input without accepting malformed phone or email", () => {
    expect(validateCustomer({ name: " Ada ", phone: "+62 812-3456-7890", email: "ada@example.com", notes: "" })).toEqual({});
    expect(validateCustomer({ name: "", phone: "0812", email: "not-an-email", notes: "" })).toEqual({ name: "Nama lengkap wajib diisi.", phone: "Nomor WhatsApp harus 10–15 digit.", email: "Format email belum valid." });
  });

  test("keeps a valid invoice for attach retry and drops only malformed storage", () => {
    expect(parseStoredInvoice(JSON.stringify({ invoiceId: "inv-1", invoiceUrl: "https://pay.example/inv-1" }))).toEqual({ invoiceId: "inv-1", invoiceUrl: "https://pay.example/inv-1" });
    expect(parseStoredInvoice("not-json")).toBeNull();
    expect(parseStoredInvoice(JSON.stringify({ invoiceId: "inv-1" }))).toBeNull();
  });

  test("prepares payment through the booking claim boundary, not a browser Mayar create", () => {
    expect(bookingClientSource).toContain('callBookingApi("create-payment"');
    expect(bookingClientSource).not.toContain('callMayar({ action: "create-invoice"');
    expect(publicBookingSource).toContain('prepare_public_booking_payment');
    expect(publicBookingSource).toContain('PAYMENT_CREATE_FAILED');
    expect(publicBookingSource).toContain('reconciliation required before retry');
  });

  test("keeps retries fail-closed and idempotent", () => {
    expect(publicBookingSource).toContain('const savedInvoiceId = text(gateway?.invoiceId, 160);');
    expect(publicBookingSource).toContain('if (contract.claimed !== true)');
    expect(publicBookingSource).toContain('p_payment_gateway: { provider: "mayar"');
    expect(publicBookingSource).toContain('crypto.randomUUID()');
  });

  test("persists only a server-returned Mayar URL before browser navigation", () => {
    expect(normalizeMayarPaymentUrl("https://mayar.id/inv-123")).toBe("https://mayar.id/inv-123");
    expect(normalizeMayarPaymentUrl("https://checkout.mayar.id/inv-123")).toBe("https://checkout.mayar.id/inv-123");
    expect(normalizeMayarPaymentUrl("https://example.com/inv-123")).toBeNull();
    expect(normalizeMayarPaymentUrl("http://mayar.id/inv-123")).toBeNull();
    expect(publicBookingSource).toContain("p_payment_gateway: {");
    expect(publicBookingSource).toContain("PAYMENT_ATTACH_FAILED");
    expect(publicBookingSource).toContain("normalizeMayarPaymentUrl(providerData.link)");
    expect(bookingPageSource).toContain("window.location.assign(payment.invoiceUrl);");
  });

  test("normalizes numeric and ISO guest expiry values and builds the booking return URL", () => {
    expect(guestExpiryIso("2030-01-02T03:04:05.000Z")).toBe("2030-01-02T03:04:05.000Z");
    expect(() => guestExpiryIso("not-a-date")).toThrow();
    expect(guestExpiryIso(1893553445000)).toBe("2030-01-02T03:04:05.000Z");
    expect(canonicalBookingReturnUrl("https://booking.djiwatentram.web.id/status", "BK-1")).toBe("https://booking.djiwatentram.web.id/status?code=BK-1");
        expect(canonicalBookingReturnUrl("http://booking.djiwatentram.web.id/status", "BK-1")).toBeNull();
    expect(canonicalBookingReturnUrl("https://booking.djiwatentram.web.id/", "BK-1")).toBeNull();
  });
});
