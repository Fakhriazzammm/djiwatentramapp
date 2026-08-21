export type CustomerForm = { name: string; phone: string; email: string; notes: string };

export function validateCustomer(form: CustomerForm) {
  const errors: Partial<Record<keyof CustomerForm, string>> = {};
  if (!form.name.trim()) errors.name = "Nama lengkap wajib diisi.";
  if (!/^[+\d][\d\s-]{8,}$/.test(form.phone.trim())) errors.phone = "Masukkan nomor WhatsApp yang valid.";
  if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errors.email = "Format email belum valid.";
  return errors;
}
