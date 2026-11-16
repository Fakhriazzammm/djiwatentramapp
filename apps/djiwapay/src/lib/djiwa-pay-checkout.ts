export type PayCheckoutKind = "topup" | "ppob";
export type PayCheckoutStage = "detail" | "payment" | "status";
export type PayPaymentMethod = "wallet" | "mayar";

export function checkoutStep(kind: PayCheckoutKind, stage: PayCheckoutStage) {
  void kind;
  return {
    step: stage === "detail" ? 1 : stage === "payment" ? 2 : 3,
    totalSteps: 3,
  } as const;
}

export function paymentLabel(kind: PayCheckoutKind, method: PayPaymentMethod, amount: number) {
  const formattedAmount = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount).replace(/\u00a0/g, " ").replace(/^Rp\s*/, "Rp ");

  if (kind === "topup" || method === "mayar") return `Lanjutkan ke QRIS${kind === "ppob" ? ` · ${formattedAmount}` : ""}`;
  return `Bayar dengan Djiwa Pay · ${formattedAmount}`;
}

export function walletPaymentState(balance: number, total: number) {
  const shortage = Math.max(0, total - balance);
  return { disabled: shortage > 0, shortage } as const;
}

/** What each PPOB service asks for. A token, a phone top-up and a game voucher do not share one number format. */
export type PpobServiceProfile = {
  key: string; title: string; description: string;
  label: string; short: string; placeholder: string; hint: string; tips: string[];
  min: number; max: number; autoComplete: string; group: number[];
};
const DEFAULT_PROFILE: PpobServiceProfile = { key: "default", title: "Detail pembelian", description: "", label: "Nomor tujuan", short: "Nomor tujuan", placeholder: "Masukkan nomor", hint: "Wajib diisi · 8–20 digit.", tips: [], min: 8, max: 20, autoComplete: "off", group: [] };
const PROFILES: Record<string, Partial<PpobServiceProfile>> = {
  pulsa: { title: "Isi pulsa", description: "Pulsa masuk ke nomor prabayar.", label: "Nomor HP tujuan", short: "Nomor HP", placeholder: "0812 3456 7890", hint: "Nomor prabayar, 9–14 digit. Operator terdeteksi dari awalan nomor.", min: 9, max: 14, autoComplete: "tel", group: [4, 4, 4, 2] },
  data: { title: "Beli paket data", description: "Kuota aktif di nomor prabayar.", label: "Nomor HP tujuan", short: "Nomor HP", placeholder: "0812 3456 7890", hint: "Nomor prabayar, 9–14 digit. Pastikan operator sesuai paket.", min: 9, max: 14, autoComplete: "tel", group: [4, 4, 4, 2] },
  pln: {
    title: "Beli token listrik", description: "Token PLN prabayar, masuk ke meteran Anda.", label: "Nomor meter atau ID pelanggan", short: "No. meter / ID pelanggan",
    placeholder: "Contoh: 32123456789", hint: "11 digit nomor meter atau 12 digit ID pelanggan.", min: 11, max: 12, autoComplete: "off", group: [4, 4, 4],
    tips: ["Nomor meter ada di meteran atau struk token terakhir.", "Periksa lagi: token yang sudah terbit tidak bisa dibatalkan.", "Kode token 20 digit tampil di struk dan bisa disalin."],
  },
  etoll: { title: "Isi saldo e-Toll", description: "Saldo kartu tol prabayar.", label: "Nomor kartu e-Toll", short: "Nomor kartu", placeholder: "16 digit nomor kartu", hint: "16 digit di bagian depan kartu.", min: 16, max: 16, autoComplete: "off", group: [4, 4, 4, 4] },
  game: { title: "Beli voucher game", description: "Voucher masuk ke akun game Anda.", label: "ID pemain game", short: "ID pemain", placeholder: "ID pemain (angka saja)", hint: "Isi ID persis seperti di dalam game. Server atau zone ID ikut diminta oleh sebagian game.", tips: ["Salah ID berarti voucher masuk ke akun lain."], min: 8, max: 20, autoComplete: "off", group: [] },
};
export const ppobServiceProfile = (service?: string): PpobServiceProfile => ({ ...DEFAULT_PROFILE, ...(PROFILES[String(service ?? "").toLowerCase()] ?? {}) });
export function groupDigits(value: string, group: number[]) {
  if (!group.length) return value;
  const out: string[] = []; let i = 0;
  for (const g of group) { if (i >= value.length) break; out.push(value.slice(i, i + g)); i += g; }
  if (i < value.length) out.push(value.slice(i));
  return out.join(" ");
}

export function validateCustomerNumber(value: string, service?: string) {
  const profile = ppobServiceProfile(service), digits = value.replace(/\D/g, "");
  if (!digits) return { valid: false, message: `Masukkan ${profile.short.toLowerCase()}.` } as const;
  if (digits.length < profile.min || digits.length > profile.max) return { valid: false, message: profile.min === profile.max ? `${profile.short} harus ${profile.min} digit.` : `${profile.short} harus ${profile.min}–${profile.max} digit.` } as const;
  return { valid: true, message: null } as const;
}

export function preferredPaymentMethod(kind: PayCheckoutKind, current: PayPaymentMethod, balance: number, total: number): PayPaymentMethod {
  if (kind === "topup") return "mayar";
  if (current === "mayar") return "mayar";
  return walletPaymentState(balance, total).disabled ? "mayar" : "wallet";
}

export function isSettledPpob(result: { success: boolean; status?: string }) {
  return result.success && result.status === "success";
}
