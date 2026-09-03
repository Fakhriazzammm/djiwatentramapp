import { createLazyFileRoute } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, CheckCircle2, CircleAlert, Clock3, CreditCard, Eye, EyeOff, HelpCircle, LogIn, RefreshCw, Wallet } from "lucide-react";
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
const TOPUP_VERIFY_WINDOW_MS = 90_000;

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
  const [topupAmount, setTopupAmount] = useState("50000");
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupPending, setTopupPending] = useState<{ amount: number; startedAt: number; creditedBefore: number } | null>(null);
  const [topupVerified, setTopupVerified] = useState(false);
  const [topupVerifiedAmount, setTopupVerifiedAmount] = useState(0);
  const [topupTimedOut, setTopupTimedOut] = useState(false);

  const missingContactFields = getMissingCustomerFields(customer);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(TOPUP_PENDING_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { amount?: number; startedAt?: number; creditedBefore?: number };
      if (Number.isFinite(parsed.amount) && Number.isFinite(parsed.startedAt) && Date.now() - Number(parsed.startedAt) < TOPUP_VERIFY_WINDOW_MS) {
        setTopupPending({ amount: Number(parsed.amount), startedAt: Number(parsed.startedAt), creditedBefore: Number(parsed.creditedBefore ?? 0) });
      } else {
        window.sessionStorage.removeItem(TOPUP_PENDING_KEY);
      }
    } catch { /* Abaikan storage yang tidak tersedia/rusak. */ }
  }, []);

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
        window.sessionStorage.removeItem(TOPUP_PENDING_KEY);
      } else if (elapsed >= TOPUP_VERIFY_WINDOW_MS) {
        setTopupTimedOut(true);
        setTopupPending(null);
        window.sessionStorage.removeItem(TOPUP_PENDING_KEY);
      }
    };
    void verify();
    const timer = window.setInterval(() => void verify(), 7000);
    return () => { active = false; window.clearInterval(timer); };
  }, [topupPending, refetch, walletData]);
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
      const result = await invokeEdgeFunction<{ result?: { invoice_url?: string } }>("customer-wallet", { action: "topup", sourceId: customer.sourceId, email: customer.email, amount, origin: `${window.location.origin}/${encodeURIComponent(username)}`, idempotencyKey: `topup-${customer.sourceId}-${Date.now()}` });
      if (!result.result?.invoice_url) throw new Error("Invoice top up tidak tersedia");
      const startedAt = Date.now();
      window.sessionStorage.setItem(TOPUP_PENDING_KEY, JSON.stringify({ amount, startedAt, creditedBefore: Number(walletData?.total_credited ?? 0) }));
      window.location.assign(result.result.invoice_url);
    } catch (err) { window.alert(err instanceof Error ? err.message : "Gagal membuat invoice top up"); setTopupBusy(false); }
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

  return <div className="app-page b2b-app min-h-app bg-[#f7f8fa]"><div className="app-shell mx-auto min-h-app max-w-md bg-[#f7f8fa]">
    <CustomerHeader title="Saldo Djiwa Pay" subtitle="Digital wallet" onBack={goHome} leading={<ArrowLeft className="h-4 w-4" />} right={<button type="button" onClick={() => void handleRefreshWallet()} disabled={refreshing || authLoading || isLoading} aria-label={refreshing ? "Memuat ulang saldo" : "Muat ulang saldo"} aria-busy={refreshing} className="flex h-11 w-11 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm transition-all duration-200 hover:bg-muted hover:text-foreground active:scale-[.97] disabled:pointer-events-none disabled:opacity-60"><RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></button>} />
    <main className="space-y-4 px-3 pb-8 pt-4">
      {showTopupWaiting ? <section className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 shadow-sm" role="status" aria-live="polite"><div className="flex items-start gap-3"><div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm"><Clock3 className="h-5 w-5" /><span className="absolute inset-0 animate-ping rounded-2xl border border-emerald-400/50 motion-reduce:animate-none" /></div><div><p className="text-sm font-black">Menunggu konfirmasi pembayaran</p><p className="mt-1 text-xs leading-relaxed text-emerald-800">QRIS sedang memverifikasi pembayaran. Saldo akan diperbarui otomatis setelah konfirmasi diterima.</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-100"><div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-emerald-500 motion-reduce:animate-none" /></div></div></div></section> : null}
      {showTopupSuccess ? <section className="flex items-start gap-3 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 shadow-sm" role="status"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="text-sm font-black">Top up berhasil</p><p className="mt-1 text-xs leading-relaxed">Saldo bertambah {currency(topupVerifiedAmount)} dan sudah tercatat di Djiwa Pay.</p></div></section> : null}
      {showTopupDelayed ? <section className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm" role="status"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><p className="text-sm font-black">Pembayaran sedang diverifikasi</p><p className="mt-1 text-xs leading-relaxed">Saldo belum berubah. Jangan membuat top up baru; cek kembali setelah beberapa saat.</p><button type="button" onClick={() => void handleCheckBalance()} disabled={refreshing} aria-busy={refreshing} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white transition-transform duration-200 active:scale-[.97] disabled:pointer-events-none disabled:opacity-60"><RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> {refreshing ? "Memuat saldo..." : "Cek saldo lagi"}</button></div></div></section> : null}
      {authLoading || isLoading ? <CustomerSectionSkeleton label="Memuat Djiwa Pay" /> : !isAuthenticated || !customer ? <section className="rounded-[24px] border border-border bg-white px-4 py-10 text-center shadow-[0_8px_28px_rgba(15,23,42,0.05)]"><Wallet className="mx-auto h-9 w-9 text-primary" /><h2 className="mt-3 font-display text-lg font-black">Djiwa Pay</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Masuk untuk melihat saldo dan riwayat Djiwa Pay.</p><button type="button" onClick={goHome} className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-white transition-transform duration-200 active:scale-[.97]"><LogIn className="h-3.5 w-3.5" /> Kembali untuk masuk</button></section> : error ? <CustomerErrorState message={error} onRetry={() => void refetch()} /> : <>
        <motion.section
          className="group relative aspect-[1.586/1] overflow-hidden rounded-[24px] bg-[#10245a] text-white shadow-[0_16px_42px_rgba(26,93,198,0.24)] sm:aspect-auto sm:min-h-[270px] sm:rounded-[26px] sm:shadow-[0_20px_55px_rgba(26,93,198,0.28)]"
          style={{ perspective: 1200 }}
          initial={reduceMotion ? false : { opacity: 0, y: 14, rotateX: 2 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0, rotateX: 0 }}
          whileHover={reduceMotion ? undefined : { y: -3, rotateX: 1, rotateY: -1 }}
          transition={{ duration: 0.42, ease: [0.32, 0.72, 0, 1] }}
        >
          <img src="/assets/djiwa-pay-abstract-3d.png" alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.42] mix-blend-screen" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(7,20,61,0.42),rgba(16,61,166,0.12)_58%,rgba(91,141,239,0.08))]" />
          {!reduceMotion ? <motion.div aria-hidden="true" className="pointer-events-none absolute -inset-y-12 left-[-35%] w-1/3 rotate-[20deg] bg-gradient-to-r from-transparent via-white/35 to-transparent blur-md" animate={{ x: [0, 430, 860] }} transition={{ duration: 4.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }} /> : null}
          <div className="relative flex h-full min-h-0 flex-col p-4 sm:min-h-[270px] sm:p-5">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm sm:h-9 sm:w-9"><Wallet className="h-4 w-4" /></div><div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-100 sm:text-[10px]">Djiwa Pay</p><p className="text-[11px] font-semibold text-white/75 sm:text-xs">Digital wallet</p></div></div><span className="rounded-full border border-white/25 bg-white/12 px-2.5 py-1 text-[9px] font-bold text-blue-50 backdrop-blur-sm sm:text-[10px]">AKTIF</span></div>
            <div className="mt-auto flex items-end justify-between gap-2 pt-4"><div className="min-w-0"><p className="text-[10px] font-semibold text-blue-100 sm:text-[11px]">Saldo tersedia</p><motion.p className="mt-0.5 truncate font-display text-[26px] font-black tracking-[-0.04em] sm:text-[32px]" initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }} transition={{ delay: 0.12, duration: 0.32, ease: [0.32, 0.72, 0, 1] }}>{showSensitiveData ? currency(walletData?.available_balance ?? customer.walletBalance ?? 0) : "••••••"}</motion.p></div><button type="button" onClick={() => setShowSensitiveData((visible) => !visible)} aria-label={showSensitiveData ? "Sembunyikan saldo dan User ID" : "Tampilkan saldo dan User ID"} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-blue-50 backdrop-blur-sm transition-all duration-200 hover:bg-white/20 active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:h-11 sm:w-11">{showSensitiveData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            {(walletData?.held_balance ?? customer.walletHeldBalance ?? 0) > 0 ? <p className="mt-1 text-xs font-semibold text-blue-100">{showSensitiveData ? `Saldo ditahan ${currency(walletData?.held_balance ?? customer.walletHeldBalance ?? 0)}` : "Saldo ditahan ••••••"}</p> : null}
            <div className="mt-3 flex items-end justify-between gap-3 sm:mt-8"><div className="min-w-0"><p className="mb-1 truncate text-sm font-black text-white sm:mb-2 sm:text-base">{customer.name || customer.username || "Member"}</p><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-100/90 sm:text-[10px]">User ID</p><p className="mt-0.5 max-w-[calc(100vw-9rem)] truncate font-mono text-[11px] tracking-[0.12em] text-white/90 sm:mt-1 sm:text-sm sm:tracking-[0.18em]">{showSensitiveData ? String(customer.sourceId || "NPEF").toUpperCase() : `••••••••${String(customer.sourceId || "NPEF").slice(-4).toUpperCase()}`}</p></div><CreditCard className="h-6 w-6 shrink-0 text-white/75 sm:h-7 sm:w-7" /></div>
          </div>
        </motion.section>
        <div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => document.getElementById("djiwa-topup-card")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-[20px] border border-border bg-white text-xs font-black text-foreground shadow-[0_6px_22px_rgba(15,23,42,0.05)] transition-transform duration-200 active:scale-[.97]"><img src="/assets/djiwa-3d-topup.png" alt="" aria-hidden="true" className="h-9 w-9 object-contain" />Top Up</button><button type="button" onClick={() => document.getElementById("djiwa-history")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-[20px] border border-border bg-white text-xs font-black text-foreground shadow-[0_6px_22px_rgba(15,23,42,0.05)] transition-transform duration-200 active:scale-[.97]"><img src="/assets/djiwa-3d-history.png" alt="" aria-hidden="true" className="h-9 w-9 object-contain" />Riwayat</button><button type="button" onClick={() => window.alert("Bantuan Djiwa Pay tersedia melalui customer service.")} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-[20px] border border-border bg-white text-xs font-black text-foreground shadow-[0_6px_22px_rgba(15,23,42,0.05)] transition-transform duration-200 active:scale-[.97]"><img src="/assets/djiwa-3d-help.png" alt="" aria-hidden="true" className="h-9 w-9 object-contain" />Bantuan</button></div>
        <motion.section id="djiwa-topup-card" className="rounded-[28px] bg-white p-5 shadow-[0_10px_34px_rgba(15,23,42,0.06)]" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.4, ease: [0.32, 0.72, 0, 1] }}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Isi saldo</p><h2 className="mt-1 font-display text-[21px] font-black tracking-[-0.03em]">Top up Djiwa Pay</h2></div><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ArrowUpRight className="h-5 w-5" /></div></div><p className="mt-2 max-w-[300px] text-xs leading-relaxed text-muted-foreground">Bayar melalui QRIS. Saldo bertambah setelah pembayaran dikonfirmasi server.</p>{missingContactFields.length > 0 ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-950"><p className="font-black">Lengkapi data pembayaran</p><p className="mt-1">{getCustomerContactMessage(missingContactFields)}</p><button className="mt-3 min-h-11 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white transition-transform duration-200 active:scale-[.97]" onClick={() => navigate({ to: "/$username/profile", params: { username } })} type="button">Lengkapi profil</button></div> : <div className="mt-5 space-y-4"><div><p className="mb-2 text-xs font-bold text-foreground">Pilih nominal</p><div className="grid grid-cols-4 gap-2">{[25000, 50000, 100000, 250000].map((amount) => <button key={amount} type="button" onClick={() => setTopupAmount(String(amount))} className={`min-h-11 rounded-[14px] border px-2 text-[11px] font-black transition-all duration-200 active:scale-[.97] ${Number(topupAmount) === amount ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/10" : "border-border bg-[#fbfcfe] text-muted-foreground hover:border-primary/40"}`}>{currency(amount)}</button>)}</div></div><div><label className="mb-2 block text-xs font-bold text-foreground" htmlFor="djiwa-topup-amount">Nominal lainnya</label><div className="flex gap-2"><div className="relative min-w-0 flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">Rp</span><input id="djiwa-topup-amount" aria-describedby="djiwa-topup-helper" type="number" min="1000" step="1000" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)} className="h-12 w-full rounded-[14px] border border-border bg-[#fbfcfe] pl-10 pr-3 text-sm font-bold outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" /></div><button type="button" disabled={topupBusy} onClick={() => void topup()} className="min-h-12 rounded-[14px] bg-primary px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(26,93,198,0.18)] transition-transform duration-200 active:scale-[.97] disabled:opacity-50">{topupBusy ? "Menyiapkan..." : "Top up"}</button></div><p id="djiwa-topup-helper" className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><CircleAlert className="h-3.5 w-3.5 shrink-0" />Minimum Rp1.000 · diverifikasi otomatis</p></div></div>}</motion.section>
        <div className="grid grid-cols-2 gap-3"><section className="rounded-[22px] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)]"><p className="text-[11px] font-semibold text-muted-foreground">Total masuk</p><p className="mt-2 font-display text-lg font-black text-emerald-600">{currency(walletData?.total_credited ?? customer.walletTotalCredited ?? 0)}</p></section><section className="rounded-[22px] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)]"><p className="text-[11px] font-semibold text-muted-foreground">Total digunakan</p><p className="mt-2 font-display text-lg font-black text-rose-600">{currency(walletData?.total_debited ?? customer.walletTotalDebited ?? 0)}</p></section></div>
        <section id="djiwa-history" className="rounded-[28px] bg-white p-5 shadow-[0_10px_34px_rgba(15,23,42,0.06)]"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Aktivitas</p><h2 className="mt-1 font-display text-lg font-black">Riwayat Djiwa Pay</h2></div><CreditCard className="h-5 w-5 text-primary" /></div>{ledger.length === 0 ? <div className="mt-5 rounded-2xl bg-[#f7f8fa] px-4 py-6 text-center"><p className="text-sm font-black">Belum ada transaksi</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Top up atau gunakan Djiwa Pay untuk melihat aktivitas di sini.</p></div> : <div className="mt-4 divide-y divide-border/70">{ledger.map((entry) => <div key={entry.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${entry.direction === "credit" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>{entry.direction === "credit" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="break-words text-xs font-black">{label(entry)}</p><p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">{date(entry.created_at)}{note(entry) ? ` · ${note(entry)}` : ""}</p></div><p className={`shrink-0 text-xs font-black ${entry.direction === "credit" ? "text-emerald-600" : "text-rose-600"}`}>{entry.direction === "credit" ? "+" : "-"}{currency(entry.amount)}</p></div>)}</div>}</section>
      </>}
    </main>
  </div></div>;
}
