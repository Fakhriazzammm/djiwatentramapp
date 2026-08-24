import { BadgePercent, ChevronRight, Loader2, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import type { CustomerUser } from "@/hooks/use-customer-auth";
import { currency } from "@/components/customer/types";

export function CustomerHomeHeader({
  logoUrl,
  storeName,
  eyebrow,
  title,
  action,
}: {
  logoUrl: string;
  storeName: string;
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-4 py-2.5 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {logoUrl ? <img alt={storeName} className="h-8 w-8 rounded-xl object-contain" src={logoUrl} /> : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Wallet className="h-4 w-4" /></div>}
          <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p><p className="truncate text-xs font-black tracking-tight">{title}</p></div>
        </div>
        {action}
      </div>
    </header>
  );
}

export function CustomerGreeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
  return <section className="px-0.5 pt-1" aria-labelledby="customer-greeting-title"><p className="text-[11px] font-semibold text-muted-foreground">{greeting}</p><h1 id="customer-greeting-title" className="mt-0.5 font-display text-[27px] font-black leading-tight tracking-tight">{name}</h1></section>;
}

export function CustomerWalletSummary({ customer, onTopup }: { customer: CustomerUser; onTopup: () => void }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-3.5 shadow-sm" aria-labelledby="djiwa-pay-summary-title">
      <h2 id="djiwa-pay-summary-title" className="sr-only">Ringkasan Djiwa Pay</h2>
      <div className="grid grid-cols-[1.25fr_1fr_1fr] divide-x divide-border/70">
        <div className="pr-2.5"><div className="flex items-center gap-1.5 text-muted-foreground"><Wallet className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /><p className="text-[10px] font-bold">Saldo</p></div><p className="mt-1 text-base font-black tracking-tight">{currency(Number(customer.walletBalance ?? 0))}</p><button type="button" onClick={onTopup} className="mt-1 min-h-8 text-[10px] font-black text-emerald-700">Top up saldo</button></div>
        <div className="px-2.5"><p className="text-[10px] font-bold text-muted-foreground">Benefit</p><p className="mt-1 text-base font-black tracking-tight text-emerald-700">20%</p><p className="mt-1 text-[10px] leading-tight text-muted-foreground">hemat Djiwa Pay</p></div>
        <div className="pl-2.5"><p className="text-[10px] font-bold text-muted-foreground">Reward</p><p className="mt-1 text-base font-black tracking-tight text-emerald-700">+Rp1.000</p><p className="mt-1 text-[10px] leading-tight text-muted-foreground">tiap transaksi berhasil</p></div>
      </div>
    </section>
  );
}

export function DjiwaPayOfferCard({ isMember, onAction }: { isMember: boolean; onAction: () => void }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-200/80 bg-emerald-950 shadow-sm" aria-labelledby="djiwa-pay-offer-title">
      <div className="relative h-[158px] overflow-hidden">
        <img src="/djiwa-pay-20-banner.png" alt="Promo Djiwa Pay hemat 20 persen" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/95 via-emerald-950/65 to-emerald-950/5" />
        <div className="relative flex h-full max-w-[72%] flex-col justify-center px-4 text-white">
          <div className="flex items-center gap-1.5 text-emerald-200"><BadgePercent className="h-3.5 w-3.5" aria-hidden="true" /><p className="text-[9px] font-black uppercase tracking-[0.16em]">Special offer</p></div>
          <h2 id="djiwa-pay-offer-title" className="mt-1 text-xl font-black leading-[1.05] tracking-tight">Hemat 20% dengan Djiwa Pay</h2>
          <p className="mt-1.5 text-[10px] leading-relaxed text-emerald-50/90">Bayar langsung dari saldo aplikasi dan dapatkan reward +Rp1.000.</p>
          <button type="button" onClick={onAction} className="mt-2.5 inline-flex min-h-9 w-fit items-center gap-1 rounded-xl bg-white px-3 py-2 text-[10px] font-black text-emerald-950 transition-transform duration-[180ms] active:scale-[.97]">{isMember ? "Lihat Djiwa Pay" : "Masuk / Daftar"}<ChevronRight className="h-3 w-3" aria-hidden="true" /></button>
        </div>
      </div>
    </section>
  );
}

export function CustomerHomeActions({ onHistory, onOrder }: { onHistory: () => void; onOrder: () => void }) {
  return <div className="grid grid-cols-2 gap-2.5" aria-label="Aksi utama"><button type="button" onClick={onHistory} className="flex min-h-12 items-center justify-center rounded-[16px] border border-border bg-card px-3 py-3 text-xs font-black text-foreground shadow-sm transition-transform duration-[180ms] active:scale-[.97]">Pesanan Saya</button><button type="button" onClick={onOrder} className="flex min-h-12 items-center justify-center rounded-[16px] bg-primary px-3 py-3 text-xs font-black text-primary-foreground shadow-sm transition-transform duration-[180ms] active:scale-[.97]">Mulai Pesan</button></div>;
}

export function CustomerHomePrimaryAction({ onClick, loading = false }: { onClick: () => void; loading?: boolean }) {
  return <button type="button" onClick={onClick} disabled={loading} className="flex min-h-12 w-full items-center justify-between rounded-[16px] bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-sm transition-transform duration-[180ms] active:scale-[.97] disabled:opacity-60"><span>{loading ? "Menyiapkan menu..." : "Mulai Pesan"}</span>{loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}</button>;
}
