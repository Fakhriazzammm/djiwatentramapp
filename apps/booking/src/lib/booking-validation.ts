export function isValidArrivalTime(value: string) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }

export type CustomerForm = { name: string; phone: string; email: string; notes: string };

export function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function validateCustomer(form: CustomerForm) {
  const errors: Partial<Record<keyof CustomerForm, string>> = {};
  const name = form.name.trim();
  const phone = normalizePhone(form.phone);
  const email = form.email.trim();
  if (!name) errors.name = "Nama lengkap wajib diisi.";
  if (phone.length < 10 || phone.length > 15) errors.phone = "Nomor WhatsApp harus 10–15 digit.";
  if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.email = "Format email belum valid.";
  return errors;
}
