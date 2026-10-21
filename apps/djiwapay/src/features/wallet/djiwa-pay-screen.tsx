import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Bell, CreditCard, Eye, EyeOff, HelpCircle, House, RefreshCw, ScanLine, UserRound, Wallet, X } from "lucide-react";
import type { WalletResponse } from "../../lib/wallet-adapter";
import type { CustomerProfile } from "../../lib/identity-adapter";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const date = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const labels: Record<string, string> = { topup_completed: "Top up", manual_credit: "Credit saldo", order_debit: "Pembayaran pesanan", wallet_hold: "Saldo ditahan", wallet_release: "Saldo dikembalikan", refund: "Refund pesanan", adjustment: "Penyesuaian saldo" };
const actions = [
  ["topup", "Isi Saldo", "topup.webp", true], ["send", "Kirim", "send.webp", false], ["receive", "Terima", "receive.webp", false], ["scan", "Scan QR", "scan-qr.webp", false],
  ["history", "Riwayat", "history.webp", true], ["card", "Kartu", "card.webp", false], ["withdraw", "Tarik Dana", "withdraw.webp", false], ["help", "Bantuan", "help.webp", true],
] as const;

type Props = { profile: CustomerProfile; wallet: WalletResponse | null; loading: boolean; error: string | null; busy: boolean; onRefresh: () => void; onTopup: (amount: number) => void };

export function DjiwaPayScreen({ profile, wallet, loading, error, busy, onRefresh, onTopup }: Props) {
  const [visible, setVisible] = useState(false);
  const [amount, setAmount] = useState("50000");
  const [soon, setSoon] = useState<string | null>(null);
  const entries = wallet?.ledger ?? [];
  const incoming = wallet?.wallet.total_credited ?? entries.filter((entry) => entry.direction === "credit").reduce((total, entry) => total + entry.amount, 0);
  const outgoing = wallet?.wallet.total_debited ?? entries.filter((entry) => entry.direction === "debit").reduce((total, entry) => total + entry.amount, 0);
  const userId = visible ? profile.source_id : `••••••••${profile.source_id.slice(-4)}`;
  const status = wallet?.wallet.status === "blocked" ? "DIBLOKIR" : "AKTIF";
  const actionClick = (key: string, label: string) => {
    if (key === "topup") document.getElementById("topup")?.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (key === "history") document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" });
    else if (key === "help") setSoon("Bantuan Djiwa Pay tersedia melalui customer service.");
    else setSoon(`Fitur ${label} sedang kami siapkan untuk Djiwa Pay.`);
  };
  const presetAmounts = useMemo(() => [25000, 50000, 100000, 250000], []);
  return <main className="pay-page">
    <header className="pay-header"><button className="round-control" onClick={() => window.history.back()} aria-label="Kembali">‹</button><div><h1>Saldo Djiwa Pay</h1><small>Digital wallet</small></div><button className="round-control" onClick={onRefresh} disabled={loading} aria-label="Segarkan saldo"><RefreshCw size={16} className={loading ? "spin" : ""} /></button></header>
    <section className="wallet-card" aria-label="Ringkasan saldo Djiwa Pay"><img src="/assets/djiwa-pay-abstract-3d.png" alt="" aria-hidden="true" className="wallet-art" /><div className="wallet-overlay" /><div className="wallet-content"><div className="wallet-card-top"><div className="wallet-brand"><Wallet size={17} /><span>DJIWA PAY<small>Digital wallet</small></span></div><span className="wallet-status">{status}</span></div><div className="wallet-balance-label">Saldo tersedia</div><strong className="wallet-balance">{loading ? "••••••" : visible ? money(wallet?.wallet.available_balance ?? 0) : "••••••"}</strong><div className="wallet-card-bottom"><div><b>{profile.name ?? profile.email ?? "Customer"}</b><small>USER ID · {userId}</small></div><div className="wallet-controls"><button className="wallet-card-icon" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Sembunyikan saldo" : "Tampilkan saldo"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button><button className="wallet-card-icon" onClick={onRefresh} aria-label="Segarkan saldo"><RefreshCw size={16} /></button></div></div></div></section>
    {error ? <section className="inline-error" role="alert">{error}</section> : null}
    <section className="surface quick-actions"><div className="section-heading"><div><span className="eyebrow">DJIWA PAY</span><h2>Aksi cepat</h2></div><Wallet size={17} /></div><div className="action-grid">{actions.map(([key, label, asset, supported]) => <button key={key} className="action-item" onClick={() => actionClick(key, label)} aria-label={supported ? label : `${label}, segera hadir`}><span className="action-icon"><img src={`/assets/djiwa-pay-actions/${asset}`} alt="" aria-hidden="true" /></span><span>{label}</span>{!supported ? <em>Segera hadir</em> : null}</button>)}</div></section>
    <div className="summary-grid"><section className="summary-card"><span>Total masuk</span><strong className="credit-text">{money(incoming)}</strong></section><section className="summary-card"><span>Total digunakan</span><strong className="debit-text">{money(outgoing)}</strong></section></div>
    <section id="activity" className="surface activity-card"><div className="section-heading"><div><span className="eyebrow">AKTIVITAS</span><h2>Riwayat Djiwa Pay</h2></div><span className="month-control">Semua transaksi</span></div>{loading ? <div className="activity-empty">Memuat transaksi...</div> : entries.length === 0 ? <div className="activity-empty">Belum ada transaksi.</div> : <div className="activity-list">{entries.map((entry) => <article className="activity-row" key={entry.id}><span className={`activity-icon ${entry.direction}`} >{entry.direction === "credit" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div className="activity-copy"><b>{labels[entry.transaction_type] ?? "Transaksi saldo"}</b><small>{date(entry.created_at)}{entry.note ? ` · ${entry.note}` : ""}</small></div><strong className={entry.direction === "credit" ? "credit-text" : "debit-text"}>{entry.direction === "credit" ? "+" : "-"}{money(entry.amount)}</strong></article>)}</div>}</section>
    <section id="topup" className="surface topup-panel"><div className="section-heading"><div><span className="eyebrow">ISI SALDO</span><h2>Top up Djiwa Pay</h2></div><Wallet size={17} /></div><div className="amount-options">{presetAmounts.map((value) => <button key={value} className={Number(amount) === value ? "selected" : ""} onClick={() => setAmount(String(value))}>{money(value)}</button>)}</div><label htmlFor="amount">Nominal lainnya</label><div className="topup-form"><input id="amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))} /><button className="primary-action" onClick={() => onTopup(Number(amount))} disabled={busy || Number(amount) < 1000}>{busy ? "Menyiapkan pembayaran..." : "Lanjutkan"}</button></div><p className="helper">Minimum Rp1.000 · saldo bertambah setelah pembayaran dikonfirmasi server.</p></section>
    {soon ? <div className="soon-backdrop" role="presentation" onClick={() => setSoon(null)}><section className="soon-dialog" role="dialog" aria-modal="true" aria-labelledby="soon-title" onClick={(event) => event.stopPropagation()}><button className="soon-close" onClick={() => setSoon(null)} aria-label="Tutup"><X size={16} /></button><HelpCircle size={28} /><h2 id="soon-title">Segera hadir</h2><p>{soon}</p></section></div> : null}
    <footer className="pay-footer">Djiwa Pay · Wallet digital Djiwa Tentram</footer><nav className="bottom-nav" aria-label="Navigasi Djiwa Pay"><a href="https://djiwatentram.web.id/"><House size={17} /><span>Home</span></a><button><Bell size={17} /><span>Aktivitas</span></button><button className="active"><Wallet size={17} /><span>Saldo</span></button><button><UserRound size={17} /><span>Profil</span></button></nav>
  </main>;
}
