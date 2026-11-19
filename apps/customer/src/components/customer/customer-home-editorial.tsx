import { useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Clock, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { CustomerSectionSkeleton } from "@/components/customer/customer-states";
import type { CartItem } from "@/components/customer/types";
import { useHybridAllProducts, useHybridBestSellers, useHybridShiftStatus, useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { useOrderContext } from "@/hooks/use-order-context";
import type { FeaturedProduct } from "@/lib/home-feed";
import { cn } from "@/lib/utils";

export function isFridayInJakarta(now: Date = new Date()): boolean {
  try { return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Jakarta" }).format(now) === "Fri"; } catch { return false; }
}

const CARD = "rounded-[26px] bg-card shadow-[0_1px_2px_rgba(20,32,63,0.06),0_8px_24px_rgba(20,32,63,0.06)]";

export function useHomeCatalog() {
  const products = useHybridAllProducts();
  const bestSellers = useHybridBestSellers();
  const productMap = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    for (const product of products ?? []) map.set(String((product as Record<string, any>)._id), product as Record<string, any>);
    return map;
  }, [products]);
  return { products, bestSellers, productMap, ready: products !== undefined && bestSellers !== undefined };
}

export function useLiveShift() {
  const shiftStatus = useHybridShiftStatus();
  return Boolean(shiftStatus?.isOpen && shiftStatus?.ongoingShift);
}

/** Tambah satu menu ke keranjang lalu buka halaman pesan (pola sama dengan "Pesanan terakhir"). */
export function useQuickAdd(username: string) {
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
