export type WalletWithdrawalDraft = {
  amount: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  note: string;
};

export function validateWalletWithdrawal(draft: WalletWithdrawalDraft) {
  if (!Number.isSafeInteger(draft.amount) || draft.amount < 10_000) return { valid: false as const, message: "Minimal penarikan Rp10.000." };
  if (draft.amount > 10_000_000) return { valid: false as const, message: "Maksimal penarikan Rp10.000.000." };
  if (draft.bankName.trim().length < 2 || draft.bankName.trim().length > 80) return { valid: false as const, message: "Masukkan nama bank yang valid." };
  if (!/^\d{6,30}$/.test(draft.accountNumber.trim())) return { valid: false as const, message: "Nomor rekening harus 6–30 digit." };
  if (draft.accountName.trim().length < 2 || draft.accountName.trim().length > 120) return { valid: false as const, message: "Masukkan nama pemilik rekening." };
  if (draft.note.trim().length > 120) return { valid: false as const, message: "Catatan maksimal 120 karakter." };
  return { valid: true as const, message: null };
}

