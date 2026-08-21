export type CustomerForm = { name: string; phone: string; email: string; notes: string };

export function normalizePhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function validateCustomer(form: CustomerForm) {
  const errors: Partial<Record<keyof CustomerForm, string>> = {};
  if (!form.name.trim()) errors.name = "Nama lengkap wajib diisi.";
  if (normalizePhone(form.phone).length < 10) errors.phone = "Nomor WhatsApp harus minimal 10 digit.";
  if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = "Format email belum valid.";
  return errors;
}
