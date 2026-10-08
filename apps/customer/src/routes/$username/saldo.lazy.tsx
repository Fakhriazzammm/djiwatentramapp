import { createLazyFileRoute } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, CheckCircle2, CircleAlert, Clock3, CreditCard, Delete, Eye, EyeOff, HelpCircle, LogIn, RefreshCw, Wallet } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerWallet, type CustomerWalletLedgerEntry } from "@/hooks/use-customer-data";
import { currency } from "@/components/customer/types";
import { getCustomerContactMessage, getMissingCustomerFields } from "@/lib/customer-profile-completeness";
import { CustomerErrorState, CustomerSectionSkeleton } from "@/components/customer/customer-states";
import { CustomerHeader } from "@/components/customer/customer-shell";

export const Route = createLazyFileRoute("/$username/saldo")({ component: SaldoPage });

const TOPUP_PENDING_KEY = "djiwa-topup-pending";
const TOPUP_VERIFY_WINDOW_MS = 10 * 60_000;

const WALLET_ACTIONS = [
  { key: "topup", label: "Isi Saldo", asset: "/assets/djiwa-pay-actions/topup.webp", supported: true },
  { key: "send", label: "Kirim", badge: "Soon", badgeClass: "bg-violet-500", asset: "/assets/djiwa-pay-actions/send.webp", supported: false },
  { key: "receive", label: "Terima", badge: "Soon", badgeClass: "bg-emerald-500", asset: "/assets/djiwa-pay-actions/receive.webp", supported: false },
  { key: "scan", label: "Scan QR", badge: "Soon", badgeClass: "bg-cyan-600", asset: "/assets/djiwa-pay-actions/scan-qr.webp", supported: false },
  { key: "history", label: "Riwayat", asset: "/assets/djiwa-pay-actions/history.webp", supported: true },
  { key: "card", label: "Kartu", badge: "Soon", badgeClass: "bg-indigo-500", asset: "/assets/djiwa-pay-actions/card.webp", supported: false },
  { key: "withdraw", label: "Tarik Dana", badge: "Soon", badgeClass: "bg-orange-500", asset: "/assets/djiwa-pay-actions/withdraw.webp", supported: false },
  { key: "help", label: "Bantuan", asset: "/assets/djiwa-pay-actions/help.webp", supported: true }
] as const;

const LABELS: Record<string, string> = {
  wallet_hold: "Saldo ditahan",
  order_debit: "Pembayaran pesanan",
  wallet_release: "Saldo dikembalikan",
  refund: "Refund pesanan",
  topup_completed: "Top up",
  manual_credit: "Credit saldo",
  adjustment: "Penyesuaian saldo",
};

function label(entry: CustomerWalletLedgerEntry) {
  if (entry.transaction_type === "wallet_hold") {
    return entry.status === "cancelled" ? "Penahanan saldo dibatalkan" : "Saldo ditahan";
  }
  return LABELS[entry.transaction_type] ?? "Transaksi saldo";
}
function note(entry: CustomerWalletLedgerEntry) {
  if (entry.transaction_type === "order_debit" && entry.status === "completed") return "Pembayaran berhasil";
  if (entry.transaction_type === "wallet_hold" && entry.status === "cancelled") return "Penahanan checkout dibatalkan";
  return entry.note;
}
function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

function SaldoPage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const { isAuthenticated, customer, isLoading: authLoading } = useCustomerAuth();
  const reduceMotion = useReducedMotion();
  const [showSensitiveData, setShowSensitiveData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { wallet: walletData, ledger, isLoading, error, refetch } = useCustomerWallet();
  const [topupAmount, setTopupAmount] = useState("0");
  const [topupPopupOpen, setTopupPopupOpen] = useState(false);
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupRedirectProcessing, setTopupRedirectProcessing] = useState(false);
  const [topupPending, setTopupPending] = useState<{ amount: number; startedAt: number; creditedBefore: number } | null>(null);
  const [topupVerified, setTopupVerified] = useState(false);
  const [topupVerifiedAmount, setTopupVerifiedAmount] = useState(0);
  const [topupTimedOut, setTopupTimedOut] = useState(false);
  const [scrambleBalance, setScrambleBalance] = useState<string | null>(null);
  const [comingSoonFeature, setComingSoonFeature] = useState<string | null>(null);

  const topupPendingKey = customer?.sourceId ? `${TOPUP_PENDING_KEY}:${customer.sourceId}` : TOPUP_PENDING_KEY;
  const missingContactFields = getMissingCustomerFields(customer);

  useEffect(() => {
    if (!refreshing) {
      setScrambleBalance(null);
      return;
    }
    const current = Math.max(0, Number(walletData?.available_balance ?? customer?.walletBalance ?? 0));
    const ceiling = Math.max(100_000, Math.round(current * 1.35));
    const scramble = () => setScrambleBalance(currency(Math.floor(Math.random() * ceiling)));
    scramble();
    const timer = window.setInterval(scramble, 90);
    return () => window.clearInterval(timer);
  }, [refreshing, walletData?.available_balance, customer?.walletBalance]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(topupPendingKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { amount?: number; startedAt?: number; creditedBefore?: number };
      if (Number.isFinite(parsed.amount) && Number.isFinite(parsed.startedAt) && Date.now() - Number(parsed.startedAt) < TOPUP_VERIFY_WINDOW_MS) {
        setTopupPending({ amount: Number(parsed.amount), startedAt: Number(parsed.startedAt), creditedBefore: Number(parsed.creditedBefore ?? 0) });
      } else {
        window.sessionStorage.removeItem(topupPendingKey);
      }
    } catch { /* Abaikan storage yang tidak tersedia/rusak. */ }
  }, [topupPendingKey]);

  useEffect(() => {
    if (!topupPending) return;
    const { amount, creditedBefore, startedAt } = topupPending;
    let active = true;
    const verify = async () => {
      const latest = await refetch();
      if (!active) return;
      const elapsed = Date.now() - startedAt;
      if (amount > 0 && Number(latest?.wallet?.total_credited ?? 0) >= creditedBefore + amount) {
        setTopupVerifiedAmount(amount);
        setTopupVerified(true);
        setTopupPending(null);
        window.sessionStorage.removeItem(topupPendingKey);
      } else if (elapsed >= TOPUP_VERIFY_WINDOW_MS) {
        setTopupTimedOut(true);
        setTopupPending(null);
        window.sessionStorage.removeItem(topupPendingKey);
      }
    };
    void verify();
    const timer = window.setInterval(() => void verify(), 7000);
    return () => { active = false; window.clearInterval(timer); };
  }, [topupPending, refetch, topupPendingKey, walletData]);
  const topup = async () => {
    if (missingContactFields.length > 0) {
      window.alert(getCustomerContactMessage(missingContactFields));
      navigate({ to: "/$username/profile", params: { username } });
      return;
    }
    if (!customer?.sourceId || !customer.email) return;
    const amount = Number(topupAmount);
    if (!Number.isSafeInteger(amount) || amount < 1000) { window.alert("Nominal top up minimal Rp1.000"); return; }
    setTopupBusy(true);
    try {
      setTopupRedirectProcessing(true);
      const result = await invokeEdgeFunction<{ result?: { invoice_url?: string } }>("customer-wallet", { action: "topup", sourceId: customer.sourceId, email: customer.email, amount, origin: `${window.location.origin}/${encodeURIComponent(username)}`, idempotencyKey: `topup-${customer.sourceId}-${Date.now()}` });
      if (!result.result?.invoice_url) throw new Error("Invoice top up tidak tersedia");
      const startedAt = Date.now();
      window.sessionStorage.setItem(topupPendingKey, JSON.stringify({ amount, startedAt, creditedBefore: Number(walletData?.total_credited ?? 0) }));
      window.location.assign(result.result.invoice_url);
    } catch (err) { setTopupRedirectProcessing(false); window.alert(err instanceof Error ? err.message : "Gagal membuat invoice top up"); setTopupBusy(false); }
  };
  const goHome = () => navigate({ to: "/$username", params: { username } });

  const handleRefreshWallet = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCheckBalance = async () => {
    if (refreshing) return;
    setTopupTimedOut(false);
    setTopupPending({ amount: 0, startedAt: Date.now(), creditedBefore: Number(walletData?.total_credited ?? 0) });
    await handleRefreshWallet();
  };

  const showTopupWaiting = Boolean(topupPending);
  const showTopupSuccess = topupVerified;
  const showTopupDelayed = topupTimedOut;
  const handleTopupKey = (key: string) => {
    if (key === "delete") {
      setTopupAmount((value) => value.length > 1 ? value.slice(0, -1) : "0");
      return;
    }
    setTopupAmount((value) => {
      const next = value === "0" ? key : `${value}${key}`;
      return next.replace(/^0+(?=\d)/, "").slice(0, 8);
    });
  };
  const handleWalletAction = (action: (typeof WALLET_ACTIONS)[number]) => {
    if (action.key === "topup") {
      setTopupPopupOpen(true);
      return;
    }
    if (action.key === "history") {
      document.getElementById("djiwa-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action.key === "help") {
      setComingSoonFeature("Bantuan Djiwa Pay tersedia melalui customer service.");
      return;
    }
    setComingSoonFeature(`Fitur ${action.label} sedang kami siapkan untuk Djiwa Pay.`);
  };

  return <div className="app-page min-h-app bg-[#f7f8fa]"><div className="app-shell mx-auto min-h-app max-w-md bg-[#f7f8fa]">
    <CustomerHeader title="Saldo Djiwa Pay" subtitle="Digital wallet" onBack={goHome} leading={<ArrowLeft className="h-4 w-4" />} right={<button type="button" onClick={() => void handleRefreshWallet()} disabled={refreshing || authLoading || isLoading} aria-label={refreshing ? "Memuat ulang saldo" : "Muat ulang saldo"} aria-busy={refreshing} className="flex h-11 w-11 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm transition-all duration-200 hover:bg-muted hover:text-foreground active:scale-[.97] disabled:pointer-events-none disabled:opacity-60"><RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></button>} />
    <main className="space-y-2 px-3 pb-5 pt-2">
      {showTopupWaiting ? <section className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 shadow-sm" role="status" aria-live="polite"><div className="flex items-start gap-3"><div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm"><Clock3 className="h-5 w-5" /><span className="absolute inset-0 animate-ping rounded-2xl border border-emerald-400/50 motion-reduce:animate-none" /></div><div><p className="text-sm font-black">Menunggu konfirmasi pembayaran</p><p className="mt-1 text-xs leading-relaxed text-emerald-800">Mayar sedang memverifikasi pembayaran. Saldo akan diperbarui otomatis setelah konfirmasi diterima.</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-100"><div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-emerald-500 motion-reduce:animate-none" /></div></div></div></section> : null}
      {showTopupSuccess ? <section className="flex items-start gap-3 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 shadow-sm" role="status"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="text-sm font-black">Top up berhasil</p><p className="mt-1 text-xs leading-relaxed">Saldo bertambah {currency(topupVerifiedAmount)} dan sudah tercatat di Djiwa Pay.</p></div></section> : null}
      {showTopupDelayed ? <section className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm" role="status"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><p className="text-sm font-black">Pembayaran sedang diverifikasi</p><p className="mt-1 text-xs leading-relaxed">Saldo belum berubah. Jangan membuat top up baru; cek kembali setelah beberapa saat.</p><button type="button" onClick={() => void handleCheckBalance()} disabled={refreshing} aria-busy={refreshing} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white transition-transform duration-200 active:scale-[.97] disabled:pointer-events-none disabled:opacity-60"><RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> {refreshing ? "Memuat saldo..." : "Cek saldo lagi"}</button></div></div></section> : null}
      {authLoading || isLoading ? <CustomerSectionSkeleton label="Memuat Djiwa Pay" /> : !isAuthenticated || !customer ? <section className="rounded-[24px] border border-border bg-white px-4 py-10 text-center shadow-[0_8px_28px_rgba(15,23,42,0.05)]"><Wallet className="mx-auto h-9 w-9 text-primary" /><h2 className="mt-3 font-display text-lg font-black">Djiwa Pay</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Masuk untuk melihat saldo dan riwayat Djiwa Pay.</p><button type="button" onClick={goHome} className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-white transition-transform duration-200 active:scale-[.97]"><LogIn className="h-3.5 w-3.5" /> Kembali untuk masuk</button></section> : error ? <CustomerErrorState message={error} onRetry={() => void refetch()} /> : <>
        <motion.section
          className="group relative aspect-[1.95/1] overflow-hidden rounded-[18px] bg-[radial-gradient(circle_at_78%_18%,rgba(91,141,239,0.22),transparent_34%),linear-gradient(135deg,#10245a_0%,#173b8b_52%,#1a5dc6_100%)] text-white shadow-[0_10px_24px_rgba(26,93,198,0.18)] sm:aspect-auto sm:min-h-[190px] sm:rounded-[20px] sm:shadow-[0_14px_34px_rgba(26,93,198,0.2)]"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        >
          <img src="/assets/djiwa-pay-abstract-3d.png" alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.48] mix-blend-screen" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(7,20,61,0.42),rgba(16,61,166,0.12)_58%,rgba(91,141,239,0.08))]" />
          {!reduceMotion ? <motion.div aria-hidden="true" className="pointer-events-none absolute -inset-y-12 left-[-35%] w-1/3 rotate-[20deg] bg-gradient-to-r from-transparent via-white/35 to-transparent blur-md" animate={{ x: [0, 360, 720] }} transition={{ duration: 4.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }} /> : null}
          <div className="relative flex h-full min-h-0 flex-col p-2.5 sm:min-h-[190px] sm:p-3">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm sm:h-9 sm:w-9"><Wallet className="h-4 w-4" /></div><div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-100 sm:text-[10px]">Djiwa Pay</p><p className="text-[11px] font-semibold text-white/75 sm:text-xs">Digital wallet</p></div></div><span className="rounded-full border border-white/25 bg-white/12 px-2.5 py-1 text-[9px] font-bold text-blue-50 backdrop-blur-sm sm:text-[10px]">AKTIF</span></div>
            <div className="mt-auto flex items-end justify-between gap-1.5 pt-2"><div className="min-w-0"><p className="text-[10px] font-semibold text-blue-100 sm:text-[11px]">Saldo tersedia</p><motion.p className="mt-0.5 truncate font-display text-[23px] font-black tracking-[-0.04em] sm:text-[28px]" initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={reduceMotion ? undefined : refreshing ? { opacity: [1, 0.55, 1], scale: [1, 1.045, 1] } : { opacity: 1, scale: 1 }} transition={refreshing ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { delay: 0.12, duration: 0.32, ease: [0.32, 0.72, 0, 1] }}>{showSensitiveData ? (refreshing ? scrambleBalance ?? currency(0) : currency(walletData?.available_balance ?? customer.walletBalance ?? 0)) : "••••••"}</motion.p></div><div className="flex shrink-0 gap-1.5"><button type="button" onClick={() => void handleRefreshWallet()} disabled={refreshing || authLoading || isLoading} aria-label="Perbarui saldo Djiwa Pay" aria-busy={refreshing} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-blue-50 backdrop-blur-sm transition-all duration-200 hover:bg-white/20 active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-60 sm:h-11 sm:w-11"><RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></button><button type="button" onClick={() => setShowSensitiveData((visible) => !visible)} aria-label={showSensitiveData ? "Sembunyikan saldo dan User ID" : "Tampilkan saldo dan User ID"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-blue-50 backdrop-blur-sm transition-all duration-200 hover:bg-white/20 active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:h-11 sm:w-11">{showSensitiveData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
            {(walletData?.held_balance ?? customer.walletHeldBalance ?? 0) > 0 ? <p className="mt-1 text-xs font-semibold text-blue-100">{showSensitiveData ? `Saldo ditahan ${currency(walletData?.held_balance ?? customer.walletHeldBalance ?? 0)}` : "Saldo ditahan ••••••"}</p> : null}
            <div className="mt-2 flex items-end justify-between gap-2 sm:mt-5"><div className="min-w-0"><p className="mb-0.5 truncate text-xs font-black text-white sm:mb-1 sm:text-sm">{customer.name || customer.username || "Member"}</p><p className="text-[8px] font-bold uppercase tracking-[0.14em] text-blue-100/90 sm:text-[9px]">User ID</p><p className="mt-0.5 max-w-[calc(100vw-9rem)] truncate font-mono text-[10px] tracking-[0.1em] text-white/90 sm:text-xs sm:tracking-[0.14em]">{showSensitiveData ? String(customer.sourceId || "NPEF").toUpperCase() : `••••••••${String(customer.sourceId || "NPEF").slice(-4).toUpperCase()}`}</p></div><CreditCard className="h-6 w-6 shrink-0 text-white/75 sm:h-7 sm:w-7" /></div>
          </div>
        </motion.section>
        <section aria-labelledby="djiwa-quick-actions-title" className="rounded-[18px] bg-white px-2 py-2.5 shadow-[0_5px_18px_rgba(15,23,42,0.045)]"><div className="flex items-center justify-between px-1"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Djiwa Pay</p><h2 id="djiwa-quick-actions-title" className="mt-0.5 font-display text-base font-black">Aksi cepat</h2></div><Wallet className="h-4 w-4 text-primary" /></div><div className="mt-2 grid grid-cols-4 gap-y-1">{WALLET_ACTIONS.map((action) => <button key={action.key} type="button" onClick={() => handleWalletAction(action)} aria-label={action.supported ? action.label : `${action.label}, segera hadir`} className="group relative flex min-h-[76px] min-w-0 flex-col items-center justify-start gap-1 rounded-xl px-1 py-0.5 text-center transition-transform duration-200 hover:bg-[#f5f8ff] active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{action.badge ? <span className={`absolute left-0 top-0 z-10 rounded-full px-1.5 py-0.5 text-[8px] font-black leading-none text-white shadow-sm ${action.badgeClass}`}>{action.badge}</span> : null}<span className="flex h-11 w-11 items-center justify-center"><img src={action.asset} alt="" aria-hidden="true" className="h-10 w-10 object-contain" loading="lazy" decoding="async" /></span><span className="text-[10px] font-bold leading-tight text-foreground">{action.label}</span></button>)}</div></section>
        <motion.section id="djiwa-topup-card" className="hidden" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.4, ease: [0.32, 0.72, 0, 1] }}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Isi saldo</p><h2 className="mt-1 font-display text-[21px] font-black tracking-[-0.03em]">Top up Djiwa Pay</h2></div><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ArrowUpRight className="h-5 w-5" /></div></div><p className="mt-2 max-w-[300px] text-xs leading-relaxed text-muted-foreground">Bayar melalui Mayar. Saldo bertambah setelah pembayaran dikonfirmasi server.</p>{missingContactFields.length > 0 ? <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-950"><p className="font-black">Lengkapi data pembayaran</p><p className="mt-1">{getCustomerContactMessage(missingContactFields)}</p><button className="mt-3 min-h-11 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white transition-transform duration-200 active:scale-[.97]" onClick={() => navigate({ to: "/$username/profile", params: { username } })} type="button">Lengkapi profil</button></div> : <div className="mt-3 space-y-3"><div><p className="mb-2 text-xs font-bold text-foreground">Pilih nominal</p><div className="grid grid-cols-4 gap-2">{[25000, 50000, 100000, 250000].map((amount) => <button key={amount} type="button" onClick={() => setTopupAmount(String(amount))} className={`min-h-11 rounded-[14px] border px-2 text-[11px] font-black transition-all duration-200 active:scale-[.97] ${Number(topupAmount) === amount ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/10" : "border-border bg-[#fbfcfe] text-muted-foreground hover:border-primary/40"}`}>{currency(amount)}</button>)}</div></div><div><label className="mb-2 block text-xs font-bold text-foreground" htmlFor="djiwa-topup-amount">Nominal lainnya</label><div className="flex gap-2"><div className="relative min-w-0 flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">Rp</span><input id="djiwa-topup-amount" aria-describedby="djiwa-topup-helper" type="number" min="1000" step="1000" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)} className="h-12 w-full rounded-[14px] border border-border bg-[#fbfcfe] pl-10 pr-3 text-sm font-bold outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" /></div><button type="button" disabled={topupBusy} onClick={() => void topup()} className="min-h-12 rounded-[14px] bg-primary px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(26,93,198,0.18)] transition-transform duration-200 active:scale-[.97] disabled:opacity-50">{topupBusy ? "Menyiapkan..." : "Top up"}</button></div><p id="djiwa-topup-helper" className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><CircleAlert className="h-3.5 w-3.5 shrink-0" />Minimum Rp1.000 · diverifikasi otomatis</p></div></div>}</motion.section>
        <div className="grid grid-cols-2 gap-2"><section className="rounded-[16px] bg-white p-2.5 shadow-[0_5px_18px_rgba(15,23,42,0.045)]"><p className="text-[10px] font-semibold text-muted-foreground">Total masuk</p><p className="mt-1 font-display text-base font-black text-emerald-600">{currency(walletData?.total_credited ?? customer.walletTotalCredited ?? 0)}</p></section><section className="rounded-[16px] bg-white p-2.5 shadow-[0_5px_18px_rgba(15,23,42,0.045)]"><p className="text-[10px] font-semibold text-muted-foreground">Total digunakan</p><p className="mt-1 font-display text-base font-black text-rose-600">{currency(walletData?.total_debited ?? customer.walletTotalDebited ?? 0)}</p></section></div>
        <section id="djiwa-history" className="rounded-[18px] bg-white p-3 shadow-[0_5px_18px_rgba(15,23,42,0.045)]"><div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Aktivitas</p><h2 className="mt-0.5 font-display text-base font-black">Riwayat Djiwa Pay</h2></div><CreditCard className="h-4 w-4 text-primary" /></div>{ledger.length === 0 ? <div className="mt-3 rounded-2xl bg-[#f7f8fa] px-4 py-6 text-center"><p className="text-sm font-black">Belum ada transaksi</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Top up atau gunakan Djiwa Pay untuk melihat aktivitas di sini.</p></div> : <div className="mt-2 divide-y divide-border/70">{ledger.map((entry) => <div key={entry.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${entry.direction === "credit" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{entry.direction === "credit" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="break-words text-xs font-black">{label(entry)}</p><p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">{date(entry.created_at)}{note(entry) ? ` · ${note(entry)}` : ""}</p></div><p className={`shrink-0 text-xs font-black ${entry.direction === "credit" ? "text-emerald-600" : "text-rose-600"}`}>{entry.direction === "credit" ? "+" : "-"}{currency(entry.amount)}</p></div>)}</div>}</section>
      </>}
    </main>
    {topupPopupOpen ? <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-950/35" role="presentation" onClick={() => !topupBusy && setTopupPopupOpen(false)}><section role="dialog" aria-modal="true" aria-labelledby="topup-popup-title" onClick={(event) => event.stopPropagation()} className="flex max-h-[94dvh] w-full max-w-md flex-col rounded-t-[28px] bg-[#f7f8fa] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_60px_rgba(15,23,42,0.2)]"><div className="mx-auto h-1.5 w-11 rounded-full bg-slate-300" /><div className="mt-3 flex items-center justify-between"><button type="button" onClick={() => setTopupPopupOpen(false)} disabled={topupBusy} aria-label="Tutup isi saldo" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-foreground shadow-sm disabled:opacity-50"><ArrowLeft className="h-4 w-4" /></button><h2 id="topup-popup-title" className="font-display text-base font-black">Isi Saldo</h2><span className="w-11" /></div><div className="mt-3 divide-y divide-border rounded-2xl bg-white px-3"><div className="flex min-h-14 items-center justify-between"><div><p className="text-[10px] font-semibold text-muted-foreground">Dari</p><p className="text-sm font-bold">Customer{customer?.name ? ` · ${customer.name}` : ""}</p></div><Wallet className="h-5 w-5 text-primary" /></div><div className="flex min-h-14 items-center justify-between"><div><p className="text-[10px] font-semibold text-muted-foreground">Ke</p><p className="text-sm font-bold">Saldo Djiwa Pay</p></div><Wallet className="h-5 w-5 text-primary" /></div></div><div className="mt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Nominal cepat</p><div className="grid grid-cols-4 gap-1.5">{[50000, 100000, 500000, 1000000].map((amount) => <button key={amount} type="button" onClick={() => setTopupAmount(String(amount))} className={`min-h-11 rounded-xl border px-1 text-[10px] font-black transition-colors active:scale-[.97] ${Number(topupAmount) === amount ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-foreground hover:border-primary/40"}`}>{currency(amount)}</button>)}</div></div><div className="mt-4 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Nominal isi saldo</p><p className="mt-1 min-h-[48px] font-display text-[34px] font-black tracking-[-0.05em] text-foreground">{currency(Number(topupAmount) || 0)}</p><p className="mt-1 text-[11px] text-muted-foreground">Minimum isi saldo Rp1.000</p></div><div className="mx-auto mt-3 grid w-full max-w-[300px] grid-cols-3 gap-1.5">{["1","2","3","4","5","6","7","8","9","","0","delete"].map((key, index) => key ? <button key={key} type="button" onClick={() => handleTopupKey(key)} aria-label={key === "delete" ? "Hapus satu angka" : `Angka ${key}`} className="flex h-12 items-center justify-center rounded-2xl text-[22px] font-semibold text-foreground transition-colors hover:bg-white active:bg-primary/10">{key === "delete" ? <Delete className="h-5 w-5" /> : key}</button> : <span key={`empty-${index}`} aria-hidden="true" />)}</div><button type="button" disabled={topupBusy || !Number.isSafeInteger(Number(topupAmount)) || Number(topupAmount) < 1000} onClick={() => void topup()} className="mt-3 min-h-12 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white shadow-[0_8px_18px_rgba(26,93,198,0.2)] transition-transform active:scale-[.98] disabled:bg-slate-300 disabled:shadow-none">{topupBusy ? "Menyiapkan pembayaran..." : "Lanjutkan"}</button></section></div> : null}
    {comingSoonFeature ? <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-950/35 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" role="presentation" onClick={() => setComingSoonFeature(null)}><section role="dialog" aria-modal="true" aria-labelledby="wallet-feature-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]"><div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" /><div className="mt-5 flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef4ff] text-primary"><Wallet className="h-5 w-5" /></div><div><h2 id="wallet-feature-title" className="font-display text-lg font-black">Segera Hadir</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{comingSoonFeature}</p></div></div><button type="button" onClick={() => setComingSoonFeature(null)} className="mt-5 min-h-11 w-full rounded-[14px] bg-primary px-4 py-2.5 text-sm font-black text-white transition-transform active:scale-[.98]">Mengerti</button></section></div> : null}
  </div>
    {topupRedirectProcessing ? <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/60 px-5 backdrop-blur-sm">
      <section role="status" aria-live="polite" aria-atomic="true" aria-labelledby="topup-redirect-title" className="w-full max-w-sm rounded-[28px] bg-white p-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.25)]">
        <RefreshCw aria-hidden="true" className="mx-auto h-9 w-9 animate-spin text-primary motion-reduce:animate-none" />
        <h2 id="topup-redirect-title" className="mt-4 font-display text-xl font-black">Tunggu sebentar</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground">Anda akan diarahkan ke pembayaran Djiwa Pay</p>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Menyiapkan halaman pembayaran Mayar...</p>
      </section>
    </div> : null}
  </div>;
}
