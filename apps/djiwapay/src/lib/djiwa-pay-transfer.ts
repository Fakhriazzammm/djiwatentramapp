export type WalletTransferDraft = {
  recipient: string;
  amount: number;
  note: string;
};

export function validateWalletTransfer(draft: WalletTransferDraft) {
  const recipient = draft.recipient.trim();
  if (!recipient) return { valid: false as const, message: "Masukkan email, nomor HP, atau ID penerima." };
  if (recipient.length > 160) return { valid: false as const, message: "Identitas penerima terlalu panjang." };
  if (!Number.isSafeInteger(draft.amount) || draft.amount < 1000) return { valid: false as const, message: "Nominal minimal transfer Rp1.000." };
  if (draft.amount > 10_000_000) return { valid: false as const, message: "Nominal maksimal transfer Rp10.000.000." };
  if (draft.note.trim().length > 120) return { valid: false as const, message: "Catatan maksimal 120 karakter." };
  return { valid: true as const, message: null };
}

export function buildWalletReceivePayload(sourceId: string) {
  return `djiwapay://transfer?recipient=${encodeURIComponent(sourceId)}`;
}

