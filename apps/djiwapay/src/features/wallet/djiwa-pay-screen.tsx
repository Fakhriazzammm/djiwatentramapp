import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Bell, Car, CreditCard, Droplets, Eye, EyeOff, Gamepad2, HeartPulse, HelpCircle, House, ReceiptText, RefreshCw, ScanLine, Smartphone, Tv, UserRound, Wallet, Wifi, X, Zap } from "lucide-react";
import type { WalletResponse } from "../../lib/wallet-adapter";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import type { CustomerProfile, PayNavigationContext } from "../../lib/identity-adapter";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const date = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const labels: Record<string, string> = { topup_completed: "Top up", manual_credit: "Credit saldo", order_debit: "Pembayaran pesanan", wallet_hold: "Saldo ditahan", wallet_release: "Saldo dikembalikan", refund: "Refund pesanan", adjustment: "Penyesuaian saldo" };
const actions = [
  ["topup", "Isi Saldo", "topup.webp", true, "", ""], ["send", "Kirim", "send.webp", false, "Soon", "violet"], ["receive", "Terima", "receive.webp", false, "Soon", "emerald"], ["scan", "Scan QR", "scan-qr.webp", false, "Soon", "cyan"],
  ["history", "Riwayat", "history.webp", true, "", ""], ["card", "Kartu", "card.webp", false, "Soon", "indigo"], ["withdraw", "Tarik Dana", "withdraw.webp", false, "Soon", "orange"], ["help", "Bantuan", "help.webp", true, "", ""],
] as const;

const ppobServices = [
  ["pulsa", "Pulsa", "Isi pulsa semua operator", Smartphone, "blue"],
  ["data", "Paket Data", "Internet dan kuota", Wifi, "violet"],
  ["pln-token", "Token PLN", "Beli token listrik", Zap, "amber"],
  ["pln-bill", "Tagihan PLN", "Bayar listrik bulanan", ReceiptText, "orange"],
  ["pdam", "PDAM", "Tagihan air", Droplets, "cyan"],
  ["bpjs", "BPJS", "Kesehatan dan ketenagakerjaan", HeartPulse, "rose"],
  ["tv", "TV & Streaming", "Bayar langganan", Tv, "indigo"],
  ["game", "Voucher Game", "Top up game favorit", Gamepad2, "emerald"],
  ["multifinance", "Cicilan", "Bayar pembiayaan", Car, "slate"],
] as const;

type Props = { profile: CustomerProfile; wallet: WalletResponse | null; loading: boolean; error: string | null; busy: boolean; onRefresh: () => void; onTopup: (amount: number) => void; navigationContext: PayNavigationContext };

export function DjiwaPayScreen({ profile, wallet, loading, error, busy, onRefresh, onTopup, navigationContext }: Props) {
  const [visible, setVisible] = useState(false);
  const [amount, setAmount] = useState("50000");
  const [soon, setSoon] = useState<string | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [ppobOpen, setPpobOpen] = useState(false);
  const [reduceMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const entries = wallet?.ledger ?? [];
  const incoming = wallet?.wallet.total_credited ?? entries.filter((entry) => entry.direction === "credit").reduce((total, entry) => total + entry.amount, 0);
  const outgoing = wallet?.wallet.total_debited ?? entries.filter((entry) => entry.direction === "debit").reduce((total, entry) => total + entry.amount, 0);
  const userId = visible ? profile.source_id : `••••••••${profile.source_id.slice(-4)}`;
  const status = wallet?.wallet.status === "blocked" ? "DIBLOKIR" : "AKTIF";
  const customerHome = navigationContext?.source === "customer" ? `https://djiwatentram.web.id/${encodeURIComponent(navigationContext.username)}` : "https://djiwatentram.web.id/";
  const customerOrder = navigationContext?.source === "customer" ? `${customerHome}/order?step=table` : customerHome;
  const customerCommunity = navigationContext?.source === "customer" ? `${customerHome}/komunitas` : customerHome;
  const customerProfile = navigationContext?.source === "customer" ? `${customerHome}/profile` : customerHome;
  const actionClick = (key: string, label: string) => {
    if (key === "topup") setTopupOpen(true);
    else if (key === "history") document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" });
    else if (key === "help") setSoon("Bantuan Djiwa Pay tersedia melalui customer service.");
    else setSoon(`Fitur ${label} sedang kami siapkan untuk Djiwa Pay.`);
  };
  const presetAmounts = useMemo(() => [50000, 100000, 500000, 1000000], []);
  return <main className="pay-page">
    <header className="pay-header"><button className="round-control" onClick={() => window.location.assign(customerHome)} aria-label="Kembali ke Djiwa Tentram">‹</button><div><h1>Saldo Djiwa Pay</h1><small>Digital wallet</small></div><button className="round-control" onClick={onRefresh} disabled={loading} aria-label="Segarkan saldo"><RefreshCw size={16} className={loading ? "spin" : ""} /></button></header>
    <motion.section className="wallet-card" aria-label="Ringkasan saldo Djiwa Pay" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}><img src="/assets/djiwa-pay-abstract-3d.png" alt="" aria-hidden="true" className="wallet-art" /><div className="wallet-overlay" />{!reduceMotion ? <motion.div className="wallet-shine" aria-hidden="true" animate={{ x: [0, 360, 720] }} transition={{ duration: 4.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }} /> : null}<div className="wallet-content"><div className="wallet-card-top"><div className="wallet-brand"><span className="wallet-brand-mark"><Wallet size={15} /></span><span>DJIWA PAY<small>Digital wallet</small></span></div><span className="wallet-status">{status}</span></div><div className="wallet-balance-label">Saldo tersedia</div><motion.strong className="wallet-balance" initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }} transition={{ delay: 0.12, duration: 0.32, ease: [0.32, 0.72, 0, 1] }}>{loading ? "••••••" : visible ? money(wallet?.wallet.available_balance ?? 0) : "••••••"}</motion.strong><div className="wallet-card-bottom"><div className="wallet-identity"><b>{profile.name ?? profile.email ?? "Customer"}</b><small title={userId}><span>USER ID</span><strong>{userId}</strong></small></div><div className="wallet-controls"><button className="wallet-card-icon" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Sembunyikan saldo" : "Tampilkan saldo"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button><button className="wallet-card-icon" onClick={onRefresh} aria-label="Segarkan saldo"><RefreshCw size={16} /></button></div></div></div></motion.section>
    <section className="surface ppob-section" aria-labelledby="ppob-title">
      <div className="section-heading ppob-heading"><div><span className="eyebrow">LAYANAN DIGITAL</span><h2 id="ppob-title">Pembayaran PPOB</h2><p>Bayar kebutuhan harian dari satu saldo.</p></div><button className="ppob-more" onClick={() => setPpobOpen(true)}>Lihat semua</button></div>
      <div className="ppob-grid">{ppobServices.slice(0, 8).map(([key, label, description, Icon, color]) => <button key={key} className="ppob-tile" onClick={() => setSoon(`${label} akan tersedia setelah katalog produk diaktifkan.`)} aria-label={`${label}, ${description}`}><span className={`ppob-tile-icon ${color}`}><Icon size={19} strokeWidth={2.2} /></span><strong>{label}</strong><small>{description}</small></button>)}</div>
    </section>
    {error ? <section className="inline-error" role="alert">{error}</section> : null}
    <section className="surface quick-actions" aria-labelledby="quick-actions-title"><div className="section-heading"><div><span className="eyebrow">DJIWA PAY</span><h2 id="quick-actions-title">Aksi cepat</h2></div><Wallet size={17} /></div><div className="action-grid">{actions.map(([key, label, asset, supported, badge, color]) => <button key={key} className="action-item" onClick={() => actionClick(key, label)} aria-label={supported ? label : `${label}, segera hadir`}><span className={`action-badge ${color}`}>{badge}</span><span className="action-icon"><img src={`/assets/djiwa-pay-actions/${asset}`} alt="" aria-hidden="true" loading="lazy" decoding="async" /></span><span>{label}</span></button>)}</div></section>
    <div className="summary-grid"><section className="summary-card"><span>Total masuk</span><strong className="credit-text">{money(incoming)}</strong></section><section className="summary-card"><span>Total digunakan</span><strong className="debit-text">{money(outgoing)}</strong></section></div>
    <section id="activity" className="surface activity-card"><div className="section-heading"><div><span className="eyebrow">AKTIVITAS</span><h2>Riwayat Djiwa Pay</h2></div><span className="month-control">Semua transaksi</span></div>{loading ? <div className="activity-empty">Memuat transaksi...</div> : entries.length === 0 ? <div className="activity-empty">Belum ada transaksi.</div> : <div className="activity-list">{entries.map((entry) => <article className="activity-row" key={entry.id}><span className={`activity-icon ${entry.direction}`} >{entry.direction === "credit" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div className="activity-copy"><b>{labels[entry.transaction_type] ?? "Transaksi saldo"}</b><small>{date(entry.created_at)}{entry.note ? ` · ${entry.note}` : ""}</small></div><strong className={entry.direction === "credit" ? "credit-text" : "debit-text"}>{entry.direction === "credit" ? "+" : "-"}{money(entry.amount)}</strong></article>)}</div>}</section>
    <section id="topup" className="topup-panel" aria-hidden="true" />
    {topupOpen ? <div className="sheet-backdrop" role="presentation" onClick={() => !busy && setTopupOpen(false)}><section className="topup-sheet" role="dialog" aria-modal="true" aria-labelledby="topup-title" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><button className="sheet-close" onClick={() => setTopupOpen(false)} disabled={busy} aria-label="Tutup isi saldo">‹</button><h2 id="topup-title">Isi Saldo</h2><span className="sheet-spacer" /></div><div className="sheet-transfer"><div><small>Dari</small><b>Customer{profile.name ? ` · ${profile.name}` : ""}</b></div><Wallet size={18} /><div><small>Ke</small><b>Saldo Djiwa Pay</b></div></div><span className="sheet-eyebrow">NOMINAL CEPAT</span><div className="amount-options">{presetAmounts.map((value) => <button key={value} className={Number(amount) === value ? "selected" : ""} onClick={() => setAmount(String(value))}>{money(value)}</button>)}</div><div className="sheet-amount"><span>NOMINAL ISI SALDO</span><strong>{money(Number(amount) || 0)}</strong><small>Minimum isi saldo Rp1.000</small></div><div className="keypad">{["1","2","3","4","5","6","7","8","9","","0","delete"].map((key,index) => key ? <button key={key} onClick={() => setAmount((value) => key === "delete" ? (value.length > 1 ? value.slice(0,-1) : "0") : (value === "0" ? key : `${value}${key}`).replace(/^0+(?=\d)/, "").slice(0,8))} aria-label={key === "delete" ? "Hapus satu angka" : `Angka ${key}`}>{key === "delete" ? "⌫" : key}</button> : <span key={`empty-${index}`} />)}</div><button className="primary-action sheet-submit" onClick={() => onTopup(Number(amount))} disabled={busy || !Number.isSafeInteger(Number(amount)) || Number(amount) < 1000}>{busy ? "Menyiapkan pembayaran..." : "Lanjutkan"}</button></section></div> : null}
    {ppobOpen ? <div className="ppob-backdrop" role="presentation" onClick={() => setPpobOpen(false)}><section className="ppob-sheet" role="dialog" aria-modal="true" aria-labelledby="ppob-sheet-title" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-header"><button className="sheet-close" onClick={() => setPpobOpen(false)} aria-label="Tutup daftar PPOB"><X size={18} /></button><h2 id="ppob-sheet-title">Semua layanan PPOB</h2><span className="sheet-spacer" /></div><p className="ppob-sheet-copy">Pilih layanan yang ingin dibayar dengan saldo Djiwa Pay.</p><div className="ppob-grid ppob-grid-sheet">{ppobServices.map(([key, label, description, Icon, color]) => <button key={key} className="ppob-tile" onClick={() => { setPpobOpen(false); setSoon(`${label} akan tersedia setelah katalog produk diaktifkan.`); }}><span className={`ppob-tile-icon ${color}`}><Icon size={19} strokeWidth={2.2} /></span><strong>{label}</strong><small>{description}</small></button>)}</div></section></div> : null}
    {soon ? <div className="soon-backdrop" role="presentation" onClick={() => setSoon(null)}><section className="soon-dialog" role="dialog" aria-modal="true" aria-labelledby="soon-title" onClick={(event) => event.stopPropagation()}><button className="soon-close" onClick={() => setSoon(null)} aria-label="Tutup"><X size={16} /></button><HelpCircle size={28} /><h2 id="soon-title">Segera hadir</h2><p>{soon}</p></section></div> : null}
    <footer className="pay-footer">Djiwa Pay · Wallet digital Djiwa Tentram</footer><nav className="bottom-nav" aria-label="Navigasi utama"><a href={customerHome}><Djiwa3DIcon name="navigation-home" size="micro" alt="" /><span>Home</span></a><a href={customerOrder}><Djiwa3DIcon name="navigation-order" size="micro" alt="" /><span>Pesan</span></a><a href={customerCommunity}><Djiwa3DIcon name="navigation-community" size="micro" alt="" /><span>Komunitas</span></a><button className="active"><Djiwa3DIcon name="navigation-wallet" size="micro" alt="" /><span>Saldo</span></button><a href={customerProfile}><Djiwa3DIcon name="navigation-profile" size="micro" alt="" /><span>Profil</span></a></nav>
  </main>;
}
