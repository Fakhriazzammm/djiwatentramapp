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
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {logoUrl ? (
            <img alt={storeName} className="h-10 w-10 rounded-xl object-contain" src={logoUrl} />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
              <Wallet className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
            <h1 className="truncate text-sm font-black tracking-tight">{title}</h1>
          </div>
        </div>
        {action}
      </div>
    </header>
  );
}

export function CustomerWalletHero({
  customer,
  onTopup,
}: {
  customer: CustomerUser;
  onTopup: () => void;
}) {
  return (
    <section className="rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm" aria-labelledby="djiwa-pay-balance-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-emerald-700">
            <Wallet className="h-4 w-4" aria-hidden="true" />
            <p id="djiwa-pay-balance-title" className="text-[10px] font-black uppercase tracking-[0.16em]">Saldo Djiwa Pay</p>
          </div>
          <p className="mt-1 text-2xl font-black tracking-tight text-emerald-950">{currency(Number(customer.walletBalance ?? 0))}</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-800">Hemat 20%</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0 text-[11px] leading-relaxed text-emerald-900/70">
          <p>Total saldo masuk {currency(Number(customer.walletTotalCredited ?? 0))}</p>
          <p>+Rp1.000 setelah transaksi berhasil</p>
        </div>
        <button type="button" onClick={onTopup} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[14px] bg-emerald-700 px-3 py-2.5 text-[11px] font-black text-white shadow-sm transition-transform duration-[180ms] active:scale-[.97]">
          Top up saldo
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

export function DjiwaPayOfferCard({ isMember, onAction }: { isMember: boolean; onAction: () => void }) {
  return (
    <section className="rounded-3xl border border-emerald-200/80 bg-emerald-950 p-4 text-white shadow-sm" aria-labelledby="djiwa-pay-offer-title">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-200">
          <BadgePercent className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Benefit Djiwa Pay</p>
          <h2 id="djiwa-pay-offer-title" className="mt-1 text-base font-black leading-tight">Bayar pakai Djiwa Pay, hemat 20%</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-emerald-100/80">Top up saldo terlebih dahulu untuk menikmati harga lebih hemat.</p>
        </div>
      </div>
      <button type="button" onClick={onAction} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-[14px] bg-white px-3.5 py-2.5 text-xs font-black text-emerald-950 transition-transform duration-[180ms] active:scale-[.97]">
        {isMember ? "Kelola saldo" : "Masuk / Daftar"}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </section>
  );
}

export function CustomerHomePrimaryAction({ onClick, loading = false }: { onClick: () => void; loading?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className="flex min-h-12 w-full items-center justify-between rounded-[16px] bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-sm transition-transform duration-[180ms] active:scale-[.97] disabled:opacity-60">
      <span>{loading ? "Menyiapkan menu..." : "Mulai Pesan"}</span>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
