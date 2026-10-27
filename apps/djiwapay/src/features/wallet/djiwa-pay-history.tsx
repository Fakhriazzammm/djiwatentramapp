import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, Copy, ReceiptText } from "lucide-react";
import type { WalletTransaction } from "../../lib/wallet-adapter";
import { DjiwaPayPageHeader } from "./djiwa-pay-page-header";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const date = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Waktu belum tersedia" : parsed.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const labels: Record<string, string> = { topup_completed: "Top up", manual_credit: "Credit saldo", order_debit: "Pembayaran pesanan", wallet_hold: "Saldo ditahan", wallet_release: "Saldo dikembalikan", wallet_transfer_sent: "Transfer terkirim", wallet_transfer_received: "Transfer diterima", refund: "Refund pesanan", adjustment: "Penyesuaian saldo" };
const titleFor = (entry: WalletTransaction) => labels[entry.type] ?? (entry.counterparty_name ? `${entry.direction === "credit" ? "Saldo diterima dari" : "Saldo dikirim ke"} ${entry.counterparty_name}` : "Transaksi saldo");

type Filter = "all" | "credit" | "debit" | "transfer";

export function DjiwaPayHistory({ transactions, selectedTransaction, loading, onBack, onOpen }: { transactions: WalletTransaction[]; selectedTransaction: WalletTransaction | null; loading: boolean; onBack: () => void; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);
  const visible = useMemo(() => filter === "all" ? transactions : filter === "transfer" ? transactions.filter((entry) => entry.category === "transfer") : transactions.filter((entry) => entry.direction === filter), [filter, transactions]);

  if (selectedTransaction) {
    const entry = selectedTransaction;
    const transactionId = String(entry.transfer_id ?? entry.id);
    return <main className="pay-page wallet-history-page">
      <DjiwaPayPageHeader title="Detail Transaksi" subtitle="Informasi lengkap aktivitas saldo Anda." onBack={onBack} />
      <section className={`ios-transaction-hero ${entry.direction}`}><span className="ios-transaction-hero-icon">{entry.direction === "credit" ? <ArrowDownLeft size={25} /> : <ArrowUpRight size={25} />}</span><small>{titleFor(entry)}</small><strong>{entry.direction === "credit" ? "+" : "−"}{money(entry.amount)}</strong><span className="ios-status-pill">{entry.status === "completed" || entry.status === "success" ? "Selesai" : entry.status}</span></section>
      <section className="ios-detail-group" aria-label="Rincian transaksi"><div><span>Waktu</span><strong>{date(entry.created_at)}</strong></div>{entry.counterparty_name ? <div><span>{entry.direction === "credit" ? "Dari" : "Kepada"}</span><strong>{entry.counterparty_name}</strong></div> : null}{entry.counterparty_phone ? <div><span>Nomor HP</span><strong>{entry.counterparty_phone}</strong></div> : null}{entry.note ? <div><span>Catatan</span><strong>{entry.note}</strong></div> : null}<div><span>ID transaksi</span><strong className="ios-mono">{transactionId}</strong></div></section>
      <button type="button" className="ios-copy-button" onClick={() => { void navigator.clipboard?.writeText(transactionId).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }); }}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? "ID transaksi tersalin" : "Salin ID transaksi"}</button>
    </main>;
  }

  return <main className="pay-page wallet-history-page">
    <DjiwaPayPageHeader title="Riwayat" subtitle="Pantau semua saldo masuk dan keluar." onBack={onBack} trailing={<span className="ios-history-count">{transactions.length}</span>} />
    <div className="ios-segmented-control" aria-label="Filter riwayat transaksi">{([["all", "Semua"], ["credit", "Masuk"], ["debit", "Keluar"], ["transfer", "Transfer"]] as const).map(([value, label]) => <button type="button" key={value} className={filter === value ? "is-active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <section className="ios-history-group" aria-live="polite">{loading ? <div className="ios-history-empty"><span className="ios-loader" /><p>Memuat transaksi…</p></div> : visible.length === 0 ? <div className="ios-history-empty"><ReceiptText size={30} /><strong>{transactions.length ? "Tidak ada hasil" : "Belum ada transaksi"}</strong><p>{transactions.length ? "Coba pilih filter transaksi lainnya." : "Aktivitas saldo Anda akan muncul di sini."}</p></div> : <div className="ios-history-list">{visible.map((entry) => <button type="button" key={entry.id} onClick={() => onOpen(String(entry.id))}><span className={`ios-history-icon ${entry.direction}`}>{entry.direction === "credit" ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}</span><span className="ios-history-copy"><strong>{titleFor(entry)}</strong><small>{date(entry.created_at)}</small></span><span className="ios-history-value"><strong className={entry.direction === "credit" ? "credit-text" : "debit-text"}>{entry.direction === "credit" ? "+" : "−"}{money(entry.amount)}</strong><ChevronRight size={16} /></span></button>)}</div>}</section>
  </main>;
}
