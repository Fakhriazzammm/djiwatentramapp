import type { WalletTransaction } from "./wallet-adapter";

export type SummaryCategory = { key: string; label: string; total: number; percent: number };
export type MonthlySummary = {
  year: number;
  month: number; // 0-11
  out: number;
  in: number;
  perDay: number[]; // spending per day, index 0 = day 1
  averagePerDay: number;
  categories: SummaryCategory[];
};

/** Spending bucket for a debit entry. Credits never count as spending. */
export function summaryCategory(entry: Pick<WalletTransaction, "type" | "category" | "direct" | "title">): { key: string; label: string } {
  if (entry.type === "wallet_transfer_sent" || entry.category === "transfer") return { key: "transfer", label: "Transfer" };
  if (entry.type === "order_debit") return { key: "order", label: "Belanja Djiwa Tentram" };
  if (entry.category === "payment" || entry.category === "direct" || entry.direct) return { key: "payment", label: "Pembayaran & PPOB" };
  if (entry.type === "wallet_hold") return { key: "hold", label: "Saldo ditahan" };
  return { key: "other", label: "Lainnya" };
}

export function summarizeMonth(transactions: WalletTransaction[], year: number, month: number): MonthlySummary {
  const days = new Date(year, month + 1, 0).getDate();
  const perDay = Array.from({ length: days }, () => 0);
  const buckets = new Map<string, SummaryCategory>();
  let out = 0;
  let incoming = 0;
  for (const entry of transactions) {
    const when = new Date(entry.created_at);
    if (Number.isNaN(when.getTime()) || when.getFullYear() !== year || when.getMonth() !== month) continue;
    if (entry.status !== "success" && entry.status !== "completed") continue;
    if (entry.direction === "credit") { if (entry.category !== "refund" && entry.category !== "release") incoming += entry.amount; continue; }
    out += entry.amount;
    perDay[when.getDate() - 1] += entry.amount;
    const bucket = summaryCategory(entry);
    const current = buckets.get(bucket.key) ?? { ...bucket, total: 0, percent: 0 };
    current.total += entry.amount;
    buckets.set(bucket.key, current);
  }
  const categories = [...buckets.values()].sort((a, b) => b.total - a.total).map((item) => ({ ...item, percent: out > 0 ? Math.round((item.total / out) * 100) : 0 }));
  const now = new Date();
  const elapsed = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : days;
  return { year, month, out, in: incoming, perDay, averagePerDay: elapsed > 0 ? Math.round(out / elapsed) : 0, categories };
}

/** 0-4 heat level for a day relative to the busiest day of the month. */
export function heatLevel(amount: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (amount <= 0 || max <= 0) return 0;
  const ratio = amount / max;
  return ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
}

export function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
