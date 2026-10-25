import { describe, expect, test } from "bun:test";
import { parseCustomerProfile } from "../src/lib/customer-auth";
import { validateCustomer } from "../src/lib/booking-validation";
import { parseStoredInvoice } from "../src/lib/payment-recovery";

describe("booking customer checkout regressions", () => {
  test("accepts a complete customer profile and rejects malformed success payloads", () => {
    expect(parseCustomerProfile({ success: true, customer: { source_id: "cust-1", name: "Ada", email: "ada@example.com", phone: "081234567890" } }, { id: "session-1" })).toEqual({ sourceId: "cust-1", name: "Ada", email: "ada@example.com", phone: "081234567890" });
    expect(parseCustomerProfile({ success: true, customer: { name: "Ada" } }, { id: "session-1", email: "ada@example.com" })).toBeNull();
    expect(parseCustomerProfile({ success: false, customer: { source_id: "cust-1", name: "Ada", email: "ada@example.com", phone: "081234567890" } }, { id: "session-1" })).toBeNull();
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
});
