import { createLazyFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CreditCard, LogIn, Wallet } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerWallet, type CustomerWalletLedgerEntry } from "@/hooks/use-customer-data";
import { currency } from "@/components/customer/types";
import { CustomerErrorState, CustomerSectionSkeleton } from "@/components/customer/customer-states";

export const Route = createLazyFileRoute("/$username/saldo")({ component: SaldoPage });

const LABELS: Record<string, string> = {
  wallet_hold: "Saldo ditahan",
  order_debit: "Pembayaran pesanan",
  wallet_release: "Saldo dikembalikan",
  refund: "Refund pesanan",
  topup_completed: "Top up",
  manual_credit: "Credit saldo",
  adjustment: "Penyesuaian saldo",
};

function label(entry: CustomerWalletLedgerEntry) { return LABELS[entry.transaction_type] ?? "Transaksi saldo"; }
function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

function SaldoPage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const { isAuthenticated, customer, isLoading: authLoading } = useCustomerAuth();
  const { wallet, ledger, isLoading, error, refetch } = useCustomerWallet();
  const [topupAmount, setTopupAmount] = useState("50000");
  const [topupBusy, setTopupBusy] = useState(false);
  const topup = async () => {
    if (!customer?.sourceId || !customer.email) return;
    const amount = Number(topupAmount);
    if (!Number.isSafeInteger(amount) || amount < 1000) { window.alert("Nominal top up minimal Rp1.000"); return; }
    setTopupBusy(true);
    try {
      const result = await invokeEdgeFunction<{ result?: { invoice_url?: string } }>("customer-wallet", { action: "topup", sourceId: customer.sourceId, email: customer.email, amount, origin: window.location.origin, idempotencyKey: `topup-${customer.sourceId}-${Date.now()}` });
      if (!result.result?.invoice_url) throw new Error("Invoice top up tidak tersedia");
      window.location.assign(result.result.invoice_url);
    } catch (err) { window.alert(err instanceof Error ? err.message : "Gagal membuat invoice top up"); setTopupBusy(false); }
  };
  const goHome = () => navigate({ to: "/$username", params: { username } });

  return <div className="app-page min-h-app"><div className="app-shell mx-auto min-h-app max-w-md bg-background">
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl"><div className="flex items-center gap-2"><button type="button" onClick={goHome} className="flex min-h-11 items-center gap-1 text-xs font-medium text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali</button><h1 className="ml-1 text-sm font-black tracking-tight">Djiwa Pay</h1></div></header>
    <main className="px-3 py-4">
      {authLoading || isLoading ? <CustomerSectionSkeleton label="Memuat Djiwa Pay" /> : !isAuthenticated || !customer ? <div className="flex flex-col items-center rounded-3xl border border-border bg-card px-4 py-10 text-center shadow-sm"><Wallet className="h-8 w-8 text-primary" /><h2 className="mt-3 font-display text-base font-black">Djiwa Pay</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Masuk untuk melihat saldo dan riwayat Djiwa Pay.</p><button type="button" onClick={goHome} className="mt-4 flex min-h-11 items-center gap-1.5 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-white"><LogIn className="h-3.5 w-3.5" /> Kembali untuk masuk</button></div> : error ? <CustomerErrorState message={error} onRetry={() => void refetch()} /> : <>
        <section className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-sm"><div className="flex items-center gap-2"><Wallet className="h-5 w-5" /><p className="text-xs font-bold uppercase tracking-[0.16em]">Saldo tersedia</p></div><p className="mt-2 text-3xl font-black">{currency(wallet?.available_balance ?? customer.walletBalance ?? 0)}</p>{(wallet?.held_balance ?? customer.walletHeldBalance ?? 0) > 0 && <p className="mt-1 text-xs font-semibold text-white/80">Saldo tertahan: {currency(wallet?.held_balance ?? customer.walletHeldBalance ?? 0)}</p>}<p className="mt-3 text-[11px] font-medium text-white/80">Saldo hanya dapat digunakan untuk transaksi di aplikasi dan tidak dapat ditarik menjadi uang tunai.</p></section>
        <section className="mt-3 rounded-2xl border border-border bg-card p-4"><p className="text-sm font-black">Top up Djiwa Pay</p><p className="mt-1 text-[11px] text-muted-foreground">Pembayaran diverifikasi melalui webhook Mayar sebelum saldo bertambah.</p><div className="mt-3 flex gap-2"><input type="number" min="1000" step="1000" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm" /><button type="button" disabled={topupBusy} onClick={() => void topup()} className="h-11 rounded-xl bg-primary px-4 text-xs font-black text-white disabled:opacity-50">{topupBusy ? "Menyiapkan..." : "Top up"}</button></div></section>
        <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-2xl border border-border bg-card p-3"><p className="text-[10px] text-muted-foreground">Total masuk Djiwa Pay</p><p className="mt-1 text-sm font-black">{currency(wallet?.total_credited ?? customer.walletTotalCredited ?? 0)}</p></div><div className="rounded-2xl border border-border bg-card p-3"><p className="text-[10px] text-muted-foreground">Total digunakan</p><p className="mt-1 text-sm font-black">{currency(wallet?.total_debited ?? customer.walletTotalDebited ?? 0)}</p></div></div>
        <section className="mt-4 rounded-3xl border border-border bg-card p-4"><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /><h2 className="text-sm font-black">Riwayat Djiwa Pay</h2></div>{ledger.length === 0 ? <p className="mt-4 text-xs text-muted-foreground">Belum ada transaksi Djiwa Pay.</p> : <div className="mt-3 space-y-2">{ledger.map((entry) => <div key={entry.id} className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0"><div className="min-w-0"><p className="text-xs font-bold">{label(entry)}</p><p className="text-[10px] text-muted-foreground">{date(entry.created_at)}{entry.note ? ` · ${entry.note}` : ""}</p></div><p className={`shrink-0 text-xs font-black ${entry.direction === "credit" ? "text-emerald-600" : "text-rose-600"}`}>{entry.direction === "credit" ? "+" : "-"}{currency(entry.amount)}</p></div>)}</div>}</section>
      </>}
    </main>
  </div></div>;
}
