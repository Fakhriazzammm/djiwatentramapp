export const INQUIRY_STATUSES = ["new", "reviewing", "contacted", "declined", "closed"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export type PublicInquiryInput = {
  businessName: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  brief: string;
  preferredContact: "email" | "phone" | "either";
};

export function validatePublicInquiry(input: unknown): { ok: true; value: PublicInquiryInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "INVALID_INQUIRY" };
  const body = input as Record<string, unknown>;
  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
  const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
  const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim().toLowerCase() || null : null;
  const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone.trim() || null : null;
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  const preferredContact = body.preferredContact === "email" || body.preferredContact === "phone" || body.preferredContact === "either" ? body.preferredContact : "either";

  if (businessName.length < 2 || businessName.length > 160) return { ok: false, error: "INVALID_BUSINESS_NAME" };
  if (contactName.length < 2 || contactName.length > 120) return { ok: false, error: "INVALID_CONTACT_NAME" };
  if (contactEmail && (contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) return { ok: false, error: "INVALID_CONTACT_EMAIL" };
  if (contactPhone && (contactPhone.length > 40 || !/^\+?[0-9 ()-]{7,40}$/.test(contactPhone))) return { ok: false, error: "INVALID_CONTACT_PHONE" };
  if (!contactEmail && !contactPhone) return { ok: false, error: "CONTACT_REQUIRED" };
  if (preferredContact === "email" && !contactEmail) return { ok: false, error: "PREFERRED_CONTACT_UNAVAILABLE" };
  if (preferredContact === "phone" && !contactPhone) return { ok: false, error: "PREFERRED_CONTACT_UNAVAILABLE" };
  if (brief.length < 20 || brief.length > 3000) return { ok: false, error: "INVALID_BRIEF" };

  return { ok: true, value: { businessName, contactName, contactEmail, contactPhone, brief, preferredContact } };
}

export function isInquiryHoneypotFilled(input: unknown) {
  return Boolean(input && typeof input === "object" && !Array.isArray(input) && typeof (input as Record<string, unknown>).website === "string" && (input as Record<string, unknown>).website!.toString().trim());
}
