export type WalletTransferDraft = {
  recipient: string;
  amount: number;
  note: string;
};

export function normalizeWalletPhone(value: string) {
  const digits = value.trim().replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  return "";
}

export function validateWalletTransfer(draft: WalletTransferDraft) {
  const phone = normalizeWalletPhone(draft.recipient);
  if (!phone) return { valid: false as const, message: "Masukkan nomor HP penerima." };
  if (!/^628\d{8,11}$/.test(phone)) return { valid: false as const, message: "Nomor HP harus berupa nomor Indonesia yang valid." };
  if (!Number.isSafeInteger(draft.amount) || draft.amount < 1000) return { valid: false as const, message: "Nominal minimal transfer Rp1.000." };
  if (draft.amount > 10_000_000) return { valid: false as const, message: "Nominal maksimal transfer Rp10.000.000." };
  if (draft.note.trim().length > 120) return { valid: false as const, message: "Catatan maksimal 120 karakter." };
  return { valid: true as const, message: null };
}

export function buildWalletReceivePayload(phone: string) {
  return `djiwapay://transfer?phone=${encodeURIComponent(normalizeWalletPhone(phone))}`;
}

