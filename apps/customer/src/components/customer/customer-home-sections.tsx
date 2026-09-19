import { BadgePercent, ChevronRight, Loader2, Wallet } from "lucide-react";
import { Djiwa3DIcon, type Djiwa3DIconName } from "@yumipos/web-shared";
import type { ReactNode } from "react";
import type { CustomerUser } from "@/hooks/use-customer-auth";
import { currency } from "@/components/customer/types";
import { CUSTOMER_LOGO_FALLBACK } from "@/lib/asset-url";

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
    <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-background/90 px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 p-1.5 shadow-[0_4px_16px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.04]">
            <img alt={storeName} className="h-full w-full rounded-full object-contain" src={logoUrl || CUSTOMER_LOGO_FALLBACK} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = CUSTOMER_LOGO_FALLBACK; }} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
            <p className="truncate font-display text-[17px] font-black leading-tight tracking-[-0.02em] text-foreground">{title}</p>
          </div>
        </div>
        {action ? <div className="flex min-h-11 shrink-0 items-center">{action}</div> : <span className="h-11 w-11" aria-hidden="true" />}
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
        <div className="pr-2.5"><div className="flex items-center gap-1.5 text-muted-foreground"><Wallet className="h-3.5 w-3.5 text-primary" aria-hidden="true" /><p className="text-[10px] font-bold">Saldo</p></div><p className="mt-1 text-base font-black tracking-tight">{currency(Number(customer.walletBalance ?? 0))}</p><button type="button" onClick={onTopup} className="mt-1 min-h-8 text-[10px] font-black text-primary">Top up saldo</button></div>
        <div className="px-2.5"><p className="text-[10px] font-bold text-muted-foreground">Benefit</p><p className="mt-1 text-base font-black tracking-tight text-primary">50%</p><p className="mt-1 text-[10px] leading-tight text-muted-foreground">hemat menu Rp30.000</p></div>
        <div className="pl-2.5"><p className="text-[10px] font-bold text-muted-foreground">Reward</p><p className="mt-1 text-base font-black tracking-tight text-primary">+Rp1.000</p><p className="mt-1 text-[10px] leading-tight text-muted-foreground">tiap transaksi berhasil</p></div>
      </div>
    </section>
  );
}

export function CustomerHomeServiceGrid({
  onOrder,
  onPromo,
  onWallet,
  onHistory,
  onCommunity,
  onNotifications,
  onBooking,
  onProfile,
}: {
  onOrder: () => void;
  onPromo: () => void;
  onWallet: () => void;
  onHistory: () => void;
  onCommunity: () => void;
  onNotifications: () => void;
  onBooking: () => void;
  onProfile: () => void;
}) {
  const items: Array<{ label: string; badge?: string; icon: Djiwa3DIconName; onClick: () => void }> = [
    { label: "Pesan Menu", badge: "Favorit", icon: "customer-food-ordering", onClick: onOrder },
    { label: "Promo", badge: "50%", icon: "promo-voucher", onClick: onPromo },
    { label: "Djiwa Pay", badge: "+Rp1.000", icon: "payment-wallet", onClick: onWallet },
    { label: "Riwayat", icon: "navigation-history", onClick: onHistory },
    { label: "Komunitas", icon: "navigation-community", onClick: onCommunity },
    { label: "Notifikasi", icon: "notifications-alerts", onClick: onNotifications },
    { label: "Booking", badge: "Acara", icon: "restaurant-cafe", onClick: onBooking },
    { label: "Profil", icon: "navigation-profile", onClick: onProfile },
  ];

  return (
    <section aria-labelledby="customer-services-title">
      <div className="mb-2 flex items-end justify-between gap-3 px-0.5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Layanan Djiwa</p>
          <h2 id="customer-services-title" className="mt-0.5 text-sm font-black text-foreground">Mau melakukan apa?</h2>
        </div>
        <span className="text-[10px] font-semibold text-muted-foreground">Pilih layanan</span>
      </div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3 rounded-[24px] border border-border/70 bg-card/70 px-2.5 py-3 shadow-sm">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            className="group relative flex min-h-[88px] min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] px-1 py-2 transition-transform duration-[180ms] active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={item.label}
          >
            {item.badge ? <span className="absolute left-0.5 top-0.5 z-10 max-w-[calc(100%-4px)] truncate rounded-full bg-[#0d2d54] px-1.5 py-0.5 text-[8px] font-black leading-tight text-white shadow-sm">{item.badge}</span> : null}
            <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-primary/5 transition-transform duration-[180ms] group-active:scale-95">
              <Djiwa3DIcon name={item.icon} size="sm" alt="" className="h-12 w-12 object-contain" />
            </span>
            <span className="max-w-full truncate text-center text-[10px] font-bold leading-tight text-foreground">{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function DjiwaPayOfferCard({ isMember, onAction }: { isMember: boolean; onAction: () => void }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-primary/30 bg-[#0d2d54] shadow-sm" aria-labelledby="djiwa-pay-offer-title">
      <div className="relative h-[158px] overflow-hidden">
        <img src="/djiwa-pay-20-banner.png" alt="Promo Djiwa Pay hemat 50 persen" className="absolute inset-0 h-full w-full object-cover object-center brightness-[0.78] saturate-[0.72] hue-rotate-[52deg]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0d2d54]/95 via-[#0d2d54]/65 to-[#0d2d54]/10" />
        <div className="relative flex h-full max-w-[72%] flex-col justify-center px-4 text-white">
          <div className="flex items-center gap-1.5 text-blue-100"><BadgePercent className="h-3.5 w-3.5" aria-hidden="true" /><p className="text-[9px] font-black uppercase tracking-[0.16em]">Special offer</p></div>
          <h2 id="djiwa-pay-offer-title" className="mt-1 text-xl font-black leading-[1.05] tracking-tight">Djiwa Pay 50%</h2>
          <p className="mt-1.5 text-[10px] leading-relaxed text-blue-50/90">Menu Rp30.000 jadi Rp15.000 dengan pembayaran Djiwa Pay. Saldo wajib cukup.</p>
          <button type="button" onClick={onAction} className="mt-2.5 inline-flex min-h-9 w-fit items-center gap-1 rounded-xl bg-white px-3 py-2 text-[10px] font-black text-[#0d2d54] transition-transform duration-[180ms] active:scale-[.97]">{isMember ? "Top up / gunakan Djiwa Pay" : "Masuk / Daftar"}<ChevronRight className="h-3 w-3" aria-hidden="true" /></button>
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
