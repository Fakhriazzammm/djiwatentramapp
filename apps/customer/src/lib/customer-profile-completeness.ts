export type CustomerContactFields = {
  email?: string | null;
  phone?: string | null;
};

export function hasValidCustomerPhone(value: string | null | undefined) {
  return String(value ?? "").replace(/[^\d]/g, "").length >= 10;
}

export function getMissingCustomerFields(customer: CustomerContactFields | null | undefined) {
  if (!customer) return ["email", "phone"] as const;
  const missing: Array<"email" | "phone"> = [];
  if (!String(customer.email ?? "").trim()) missing.push("email");
  if (!hasValidCustomerPhone(customer.phone)) missing.push("phone");
  return missing;
}

export function getCustomerContactMessage(missing: readonly string[]) {
  if (missing.includes("email") && missing.includes("phone")) return "Lengkapi email dan nomor WhatsApp untuk top up dan pembayaran online.";
  if (missing.includes("email")) return "Lengkapi email untuk menerima invoice dan status pembayaran.";
  return "Lengkapi nomor WhatsApp untuk verifikasi pembayaran.";
}
