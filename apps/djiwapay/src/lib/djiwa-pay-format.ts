import type { WalletTransaction } from "./wallet-adapter";

export const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value).replace(/\s/g, " ");
export const rupiah = (value: number) => "Rp " + Math.abs(Math.round(value)).toLocaleString("id-ID");
export const signedRupiah = (value: number, direction: "credit" | "debit") => `${direction === "credit" ? "+" : "−"}${rupiah(value)}`;
export const formatDateTime = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Waktu belum tersedia" : parsed.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
export const formatTime = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(":", "."); };

const labels: Record<string, string> = { topup_completed: "Top up", manual_credit: "Credit saldo", order_debit: "Pembayaran pesanan", wallet_hold: "Saldo ditahan", wallet_release: "Saldo dikembalikan", wallet_transfer_sent: "Transfer terkirim", wallet_transfer_received: "Transfer diterima", refund: "Refund pesanan", adjustment: "Penyesuaian saldo" };
export function transactionTitle(entry: WalletTransaction) {
  if (entry.direct && entry.title) return entry.title;
  return labels[entry.type] ?? (entry.counterparty_name ? `${entry.direction === "credit" ? "Saldo diterima dari" : "Saldo dikirim ke"} ${entry.counterparty_name}` : "Transaksi saldo");
}

export type TxVisual = { icon: "down" | "up" | "send" | "receipt" | "bag" | "swap"; tone: "emerald" | "blue" | "violet" | "orange" | "slate" };
export function transactionVisual(entry: WalletTransaction): TxVisual {
  if (entry.category === "transfer") return { icon: "send", tone: "violet" };
  if (entry.type === "order_debit") return { icon: "bag", tone: "orange" };
  if (entry.category === "topup") return { icon: "down", tone: "emerald" };
  if (entry.direction === "credit") return { icon: "down", tone: "emerald" };
  return { icon: "receipt", tone: "blue" };
}

export type DayKey = "today" | "yesterday" | string;
export function dayLabel(value: string, now = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Tanggal tidak diketahui";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}
export const firstName = (name: string | null | undefined, email?: string | null) => (name || email || "Teman").trim().split(/[\s@]/)[0] || "Teman";
