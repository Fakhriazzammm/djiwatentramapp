import { useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Clock, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { CustomerSectionSkeleton } from "@/components/customer/customer-states";
import { currency, type CartItem } from "@/components/customer/types";
import type { CustomerUser } from "@/hooks/use-customer-auth";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { useHybridAllProducts, useHybridBestSellers, useHybridShiftStatus, useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { useOrderContext } from "@/hooks/use-order-context";
import { useDayPeriod, type DayPeriod } from "@/lib/day-period";
import {
  buildReorderCart,
  FEATURED_KICKER,
  formatOrderDate,
  pickFeaturedProduct,
  pickLastCompletedOrder,
  pickTopSellers,
  summarizeOrderItems,
  type FeaturedProduct,
} from "@/lib/home-feed";
import { CustomerStoryRail } from "@/features/stories/customer-story-rail";
import { cn } from "@/lib/utils";

const CARD = "rounded-[26px] bg-card shadow-[0_1px_2px_rgba(20,32,63,0.06),0_8px_24px_rgba(20,32,63,0.06)]";
const SECTION_TITLE = "font-display text-[19px] font-black leading-tight tracking-tight text-foreground";

/** Warna dasar kartu editorial saat menu belum punya foto. */
const FEATURED_FALLBACK: Record<DayPeriod, string> = {
  pagi: "linear-gradient(160deg,#B8957A,#7E5E48)",
  siang: "linear-gradient(160deg,#C9A27A,#8A6A4C)",
  sore: "linear-gradient(160deg,#B38A6C,#74503A)",
  malam: "linear-gradient(160deg,#8F6E52,#4A3526)",
};

function useHomeCatalog() {
  const products = useHybridAllProducts();
  const bestSellers = useHybridBestSellers();
  const productMap = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    for (const product of products ?? []) map.set(String((product as Record<string, any>)._id), product as Record<string, any>);
    return map;
  }, [products]);
  return { products, bestSellers, productMap, ready: products !== undefined && bestSellers !== undefined };
}

function useLiveShift() {
  const shiftStatus = useHybridShiftStatus();
  return Boolean(shiftStatus?.isOpen && shiftStatus?.ongoingShift);
}

/** Tambah satu menu ke keranjang lalu buka halaman pesan (pola sama dengan "Pesanan terakhir"). */
function useQuickAdd(username: string) {
  const navigate = useNavigate();
  const { setCart } = useOrderContext();
  const openMenu = useCallback(() => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } }), [navigate, username]);
  const addProduct = useCallback((item: FeaturedProduct) => {
    if (!item.isAvailable || item.price == null) {
      toast.error(`${item.name} sedang tidak tersedia`);
      return;
    }
    const cartItem: CartItem = {
      productId: item.productId as CartItem["productId"],
      name: item.name,
      price: item.price,
      quantity: 1,
      image: item.image ?? undefined,
      categoryId: item.categoryId as CartItem["categoryId"],
      menuNumber: item.menuNumber ?? undefined,
    };
    setCart((current) => {
      const existing = current.find((entry) => entry.productId === cartItem.productId && entry.variant === cartItem.variant);
      return existing ? current.map((entry) => (entry === existing ? { ...entry, quantity: entry.quantity + 1 } : entry)) : [...current, cartItem];
    });
    toast.success(`${item.name} ditambahkan ke keranjang`);
    openMenu();
  }, [openMenu, setCart]);
  return { addProduct, openMenu, setCart };
}

// ── 1. Kartu editorial ─────────────────────────────────────────

export function HomeEditorialCard({ username }: { username: string }) {
  const period = useDayPeriod();
  const isLive = useLiveShift();
  const { bestSellers, productMap, ready } = useHomeCatalog();
  const { addProduct, openMenu } = useQuickAdd(username);
  const featured = useMemo(() => pickFeaturedProduct(bestSellers, productMap, period), [bestSellers, productMap, period]);

  if (!ready) return <div className="h-[330px] animate-pulse rounded-[30px] bg-muted" role="status" aria-label="Memuat menu pilihan" />;

  const ctaLabel = isLive ? "Pesan" : "Lihat menu";
  const onCta = () => (isLive && featured ? addProduct(featured) : openMenu());
  const priceLine = featured?.price != null
    ? `${currency(featured.price)}${featured.totalSold ? ` · Terjual ${featured.totalSold}x` : ""}`
    : "";

  return (
    <section
      className="relative h-[330px] overflow-hidden rounded-[30px] text-white shadow-[0_14px_32px_rgba(20,32,63,0.2)]"
      style={{ background: FEATURED_FALLBACK[period] }}
      aria-labelledby="home-editorial-title"
    >
      {featured?.image ? <img src={featured.image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" decoding="async" /> : null}
      <div className="absolute inset-x-0 bottom-0 h-[190px] bg-gradient-to-b from-transparent to-[#14203F]/85" aria-hidden="true" />
      <p className="absolute left-4 top-4 rounded-full border border-white/50 bg-white/30 px-3 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-[#14203F] backdrop-blur-xl">
        Menu {period} ini
      </p>
      <div className="absolute inset-x-[18px] bottom-[18px] flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold opacity-90">{featured ? FEATURED_KICKER[period] : "Selamat datang di"}</p>
          <h2 id="home-editorial-title" className="mt-0.5 line-clamp-2 font-display text-[25px] font-black leading-[1.12] tracking-tight">{featured?.name ?? "Menu Djiwa Tentram"}</h2>
          {priceLine ? <p className="mt-1 text-[13px] font-bold">{priceLine}</p> : null}
        </div>
        <button
          type="button"
          onClick={onCta}
          className="min-h-11 shrink-0 rounded-full border border-white/55 bg-white/30 px-5 text-sm font-extrabold text-white backdrop-blur-xl transition-transform duration-[180ms] active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {ctaLabel}
        </button>
      </div>
    </section>
  );
}

// ── 2. Djiwa Pay + Komunitas ───────────────────────────────────

export function HomePayAndCommunity({
  customer,
  onWallet,
  onLogin,
  onCommunity,
}: {
  customer: CustomerUser | null;
  onWallet: () => void;
  onLogin: () => void;
  onCommunity: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={customer ? onWallet : onLogin}
        className="flex h-[196px] flex-col justify-between rounded-[26px] bg-gradient-to-br from-[#14203F] to-[#2C2468] p-3.5 text-left text-white shadow-[0_10px_26px_rgba(20,32,63,0.22)] transition-transform duration-[180ms] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={customer ? "Buka Djiwa Pay" : "Masuk atau daftar untuk memakai Djiwa Pay"}
      >
        <span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#9CC4FF]">Special offer</span>
          <span className="mt-1 block font-display text-[22px] font-black leading-[1.1]">Djiwa Pay 50%</span>
          <span className="mt-1.5 block text-[11px] leading-[1.4] text-[#D5DDF5]">Menu Rp30.000 jadi Rp15.000. Saldo wajib cukup.</span>
        </span>
        <span className="flex items-center justify-between gap-2">
          {customer ? (
            <>
              <span className="text-xs text-[#C9D3F0]">Saldo</span>
              <span className="text-sm font-extrabold">{currency(Number(customer.walletBalance ?? 0))}</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-extrabold">Masuk / Daftar<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
          )}
        </span>
      </button>

      {customer ? (
        <CustomerStoryRail variant="tile" onOpenCommunity={onCommunity} />
      ) : (
        <button
          type="button"
          onClick={onLogin}
          className="flex h-[196px] flex-col justify-between rounded-[26px] bg-[#FCE9F2] p-3.5 text-left transition-transform duration-[180ms] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span>
            <span className="block text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#9A3F6F]">Komunitas</span>
            <span className="mt-1 block font-display text-[19px] font-black leading-[1.15] text-[#5A2A44]">Cerita hari ini</span>
            <span className="mt-1.5 block text-[11px] leading-[1.4] text-[#7A3A5C]">Masuk untuk membagikan cerita ke komunitas Djiwa.</span>
          </span>
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-[#C9769F] text-2xl text-[#C9769F]" aria-hidden="true">+</span>
        </button>
      )}
    </div>
  );
}

// ── 3. Rak layanan ─────────────────────────────────────────────

export type HomeServiceHandlers = {
  onOrder: () => void;
  onPromo: () => void;
  onWallet: () => void;
  onHistory: () => void;
  onCommunity: () => void;
  onMerchandise: () => void;
  onBooking: () => void;
  onDjiwaRun: () => void;
};

export function HomeServiceShelf(handlers: HomeServiceHandlers) {
  const items: Array<{ label: string; badge?: string; badgeClass: string; tint: string; assetSrc: string; onClick: () => void }> = [
    { label: "Pesan Menu", badge: "Favorit", badgeClass: "bg-emerald-500", tint: "bg-[#DDF1E6]", assetSrc: "/assets/djiwa-services/menu.webp", onClick: handlers.onOrder },
    { label: "Promo", badge: "50%", badgeClass: "bg-rose-500", tint: "bg-[#FBDDE3]", assetSrc: "/assets/djiwa-services/promo.webp", onClick: handlers.onPromo },
    { label: "Djiwa Pay", badge: "+Rp1.000", badgeClass: "bg-violet-500", tint: "bg-[#E3DEFA]", assetSrc: "/assets/djiwa-services/pay.webp", onClick: handlers.onWallet },
    { label: "Riwayat", badgeClass: "bg-slate-500", tint: "bg-[#DCE8F9]", assetSrc: "/assets/djiwa-services/history.webp", onClick: handlers.onHistory },
    { label: "Komunitas", badgeClass: "bg-pink-500", tint: "bg-[#FBE3F1]", assetSrc: "/assets/djiwa-services/community.webp", onClick: handlers.onCommunity },
    { label: "Merchandise", badge: "Baru", badgeClass: "bg-indigo-500", tint: "bg-[#E3E6FB]", assetSrc: "/assets/djiwa-services/merchandise.webp", onClick: handlers.onMerchandise },
    { label: "Booking", badge: "Acara", badgeClass: "bg-orange-500", tint: "bg-[#FDEBD5]", assetSrc: "/assets/djiwa-services/booking.webp", onClick: handlers.onBooking },
    { label: "Djiwa Run", badge: "Baru", badgeClass: "bg-lime-600", tint: "bg-[#E0F4D8]", assetSrc: "/assets/djiwa-services/run.webp", onClick: handlers.onDjiwaRun },
  ];

  return (
    <section aria-labelledby="home-services-title">
      <h2 id="home-services-title" className={cn(SECTION_TITLE, "px-1")}>Layanan</h2>
      <div className="no-scrollbar -mx-3 mt-3 flex snap-x gap-3.5 overflow-x-auto overscroll-x-contain px-3 pb-1 pt-2">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            aria-label={item.label}
            className="group relative flex w-16 shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {item.badge ? <span className={cn("absolute left-1/2 top-[-7px] z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-px text-[8.5px] font-black leading-tight text-white shadow-sm", item.badgeClass)}>{item.badge}</span> : null}
            <span className={cn("flex h-[58px] w-[58px] items-center justify-center rounded-[19px] transition-transform duration-[180ms] group-active:scale-95", item.tint)}>
              <img src={item.assetSrc} alt="" className="h-11 w-11 object-contain" loading="lazy" />
            </span>
            <span className="max-w-full truncate text-center text-[11px] font-medium leading-tight text-foreground">{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── 4. Menu terlaris ───────────────────────────────────────────

const RANK_TINT = ["bg-[#EAD8C0]", "bg-[#E8D9C8]", "bg-[#DCE9D8]"];

export function HomeTopSellers({ username }: { username: string }) {
  const { bestSellers, productMap, ready } = useHomeCatalog();
  const { addProduct, openMenu } = useQuickAdd(username);
  const top = useMemo(() => pickTopSellers(bestSellers, productMap, 3), [bestSellers, productMap]);

  if (!ready) return <CustomerSectionSkeleton label="Memuat menu terlaris" />;
  if (top.length === 0) return null;

  return (
    <section aria-labelledby="home-top-sellers-title">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="home-top-sellers-title" className={SECTION_TITLE}>Menu terlaris</h2>
        <button type="button" onClick={openMenu} className="min-h-11 px-1 text-xs font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">Lihat semua</button>
      </div>
      <ol className={cn(CARD, "mt-1 divide-y divide-border/60 px-3.5 py-1")}>
        {top.map((item, index) => (
          <li key={item.productId} className="flex items-center gap-3 py-3">
            <span className="w-5 text-center font-display text-lg font-black text-muted-foreground" aria-hidden="true">{index + 1}</span>
            <span className={cn("h-14 w-14 shrink-0 overflow-hidden rounded-2xl", RANK_TINT[index] ?? "bg-muted")}>
              {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold leading-snug text-foreground">{item.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {item.price != null ? currency(item.price) : "Harga belum tersedia"}{item.totalSold ? ` · Terjual ${item.totalSold}x` : ""}
              </span>
            </span>
            <button
              type="button"
              disabled={!item.isAvailable}
              onClick={() => addProduct(item)}
              aria-label={item.isAvailable ? `Pesan ${item.name}` : `${item.name} tidak tersedia`}
              className="min-h-11 shrink-0 rounded-full bg-primary/10 px-4 text-[12.5px] font-extrabold text-primary transition-transform duration-[180ms] active:scale-[.96] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {item.isAvailable ? "Pesan" : "Habis"}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── 5. Pesan lagi ──────────────────────────────────────────────

export function HomeReorderCard({ username }: { username: string }) {
  const { orders, isLoading } = useCustomerOrders();
  const { productMap } = useHomeCatalog();
  const { openMenu, setCart } = useQuickAdd(username);
  const order = useMemo(() => pickLastCompletedOrder(orders), [orders]);

  if (isLoading || !order) return null;

  const thumbs = order.items.slice(0, 2).map((item) => {
    const image = productMap.get(item.productId)?.image;
    return typeof image === "string" && /^https?:\/\//.test(image) ? image : null;
  });

  const reorder = () => {
    const { items, missing } = buildReorderCart(order, productMap);
    if (items.length === 0) {
      toast.error("Menu pada pesanan ini sudah tidak tersedia");
      return;
    }
    setCart((current) => {
      const next = [...current];
      for (const item of items) {
        const index = next.findIndex((entry) => entry.productId === item.productId && entry.variant === item.variant);
        if (index >= 0) next[index] = { ...next[index], quantity: next[index].quantity + item.quantity };
        else next.push(item);
      }
      return next;
    });
    toast.success(`${items.length} menu ditambahkan ke keranjang`);
    if (missing > 0) toast.warning(`${missing} menu tidak tersedia lagi dan dilewati`);
    openMenu();
  };

  return (
    <section className={cn(CARD, "flex items-center gap-3 p-3.5")} aria-labelledby="home-reorder-title">
      <span className="relative h-12 w-14 shrink-0" aria-hidden="true">
        {[0, 1].map((slot) => (
          <span
            key={slot}
            className={cn("absolute top-1 h-10 w-10 overflow-hidden rounded-[13px] border-2 border-card", slot === 0 ? "left-0 bg-[#E8D9C8]" : "left-4 bg-[#DCE9D8]")}
          >
            {thumbs[slot] ? <img src={thumbs[slot] ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span id="home-reorder-title" className="block text-[11px] font-bold uppercase tracking-[0.1em] text-primary">Pesan lagi</span>
        <span className="mt-0.5 block text-[13px] font-bold leading-snug text-foreground">{summarizeOrderItems(order)}</span>
        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{currency(order.totalAmount)} · {formatOrderDate(order.createdAt)}</span>
      </span>
      <button
        type="button"
        onClick={reorder}
        className="min-h-11 shrink-0 rounded-full px-3 text-xs font-extrabold text-primary transition-transform duration-[180ms] active:scale-[.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={`Pesan ulang ${summarizeOrderItems(order)}`}
      >
        Ulang
      </button>
    </section>
  );
}

// ── 6. Grosir + Info restoran ──────────────────────────────────

export function HomeWholesaleRow({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(CARD, "flex items-center gap-3 p-3.5 transition-transform duration-[180ms] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40")}
      aria-label="Layanan pesanan grosir: cek paket kiloan"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[9.5px] font-bold uppercase tracking-[0.16em] text-primary">Layanan pesanan grosir</span>
        <span className="mt-0.5 block font-display text-[15px] font-black leading-snug text-foreground">Hadirkan Rasa Tentram dalam Skala Besar</span>
      </span>
      <span className="shrink-0 rounded-full bg-primary/10 px-3.5 py-2 text-xs font-extrabold text-primary">Cek Paket Kiloan</span>
    </a>
  );
}

export function HomeRestaurantInfo() {
  const siteSettings = useHybridSiteSettings();
  const isLive = useLiveShift();
  if (siteSettings === undefined) return <CustomerSectionSkeleton label="Memuat info restoran" />;

  const openingTime = typeof siteSettings?.openingTime === "string" ? siteSettings.openingTime.trim() : "";
  const closingTime = typeof siteSettings?.closingTime === "string" ? siteSettings.closingTime.trim() : "";
  const openingHours = typeof siteSettings?.openingHours === "string" ? siteSettings.openingHours.trim() : "";
  const storePhone = typeof siteSettings?.storePhone === "string" ? siteSettings.storePhone.trim() : "";
  const storeAddress = typeof siteSettings?.storeAddress === "string" ? siteSettings.storeAddress.trim() : "";
  const hoursText = openingHours || [openingTime && `Buka ${openingTime}`, closingTime && `Tutup ${closingTime}`].filter(Boolean).join(" – ");
  if (!hoursText && !storePhone && !storeAddress) return null;

  const mapsHref = storeAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeAddress)}` : null;
  const Row = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <div className="flex items-start gap-2.5 text-[13px] text-foreground"><span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span><span className="min-w-0">{children}</span></div>
  );

  return (
    <section className={cn(CARD, "p-4")} aria-labelledby="home-restaurant-info-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-restaurant-info-title" className="font-display text-base font-black tracking-tight">Info Restoran</h2>
        <span className={cn("rounded-full px-3 py-1 text-[11.5px] font-bold", isLive ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>{isLive ? "Buka sekarang" : "Sedang tutup"}</span>
      </div>
      <div className="mt-3 space-y-2.5">
        {hoursText ? <Row icon={<Clock className="h-4 w-4" aria-hidden="true" />}>{hoursText}</Row> : null}
        {storePhone ? <Row icon={<Phone className="h-4 w-4" aria-hidden="true" />}><a href={`tel:${storePhone.replace(/\s+/g, "")}`} className="font-bold text-primary">{storePhone}</a></Row> : null}
        {storeAddress ? (
          <Row icon={<MapPin className="h-4 w-4" aria-hidden="true" />}>
            {mapsHref ? <a href={mapsHref} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">{storeAddress}</a> : storeAddress}
          </Row>
        ) : null}
      </div>
    </section>
  );
}
