import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, MapPin, Phone, UtensilsCrossed } from "lucide-react";
import { useHybridBestSellers, useHybridAllProducts, useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { currency } from "@/components/customer/types";
import { CustomerDiscoverySkeleton } from "@/components/customer/customer-states";
import { B2BPromoBanner } from "@/components/customer/b2b-promo-banner";

type CustomerHomeDiscoveryProps = {
  onMenu: () => void;
  b2bHref?: string;
};

export function CustomerHomeDiscovery({ onMenu, b2bHref }: CustomerHomeDiscoveryProps) {
  const reduceMotion = useReducedMotion();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const products = useHybridAllProducts();
  const bestSellers = useHybridBestSellers();
  const siteSettings = useHybridSiteSettings();

  const productMap = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    for (const product of products ?? []) map.set(String((product as Record<string, any>)._id), product as Record<string, any>);
    return map;
  }, [products]);

  const featuredProducts = useMemo(() => (bestSellers ?? []).slice(0, 4).map((bestSeller) => {
    const product = productMap.get(bestSeller.productId);
    return {
      productId: bestSeller.productId,
      name: product?.name || bestSeller.productName,
      image: typeof product?.image === "string" && /^https?:\/\//.test(product.image) ? product.image : null,
      price: product?.price != null && Number.isFinite(Number(product.price)) ? Number(product.price) : null,
      isAvailable: product?.isAvailable !== false,
      menuNumber: product?.menuNumber != null ? Number(product.menuNumber) : null,
      totalSold: bestSeller.totalSold,
    };
  }), [bestSellers, productMap]);

  const openingTime = typeof siteSettings?.openingTime === "string" ? siteSettings.openingTime.trim() : "";
  const closingTime = typeof siteSettings?.closingTime === "string" ? siteSettings.closingTime.trim() : "";
  const openingHours = typeof siteSettings?.openingHours === "string" ? siteSettings.openingHours.trim() : "";
  const storePhone = typeof siteSettings?.storePhone === "string" ? siteSettings.storePhone.trim() : "";
  const storeAddress = typeof siteSettings?.storeAddress === "string" ? siteSettings.storeAddress.trim() : "";
  const hasRestaurantInfo = Boolean(openingTime || closingTime || openingHours || storePhone || storeAddress);
  const spring = { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.8 };

  useEffect(() => {
    if (featuredProducts.length < 2 || carouselPaused || reduceMotion) return;
    const intervalId = window.setInterval(() => {
      if (document.hidden || !carouselRef.current) return;
      const carousel = carouselRef.current;
      const firstCard = carousel.querySelector<HTMLElement>("[data-carousel-card]");
      const step = (firstCard?.offsetWidth ?? 176) + 12;
      const reachedEnd = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - step;
      carousel.scrollTo({ left: reachedEnd ? 0 : carousel.scrollLeft + step, behavior: "smooth" });
    }, 4500);
    return () => window.clearInterval(intervalId);
  }, [carouselPaused, featuredProducts.length, reduceMotion]);

  if (products === undefined || bestSellers === undefined || siteSettings === undefined) {
    return <CustomerDiscoverySkeleton />;
  }

  return (
    <div className="space-y-4">
      <motion.a
        href="https://booking.djiwatentram.web.id/"
        target="_blank"
        rel="noreferrer"
        aria-label="Booking acara dan kolaborasi bersama Djiwa Tentram"
        className="relative block overflow-hidden rounded-3xl border border-primary/15 bg-primary/[0.04] shadow-sm transition-shadow hover:shadow-md"
        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
        transition={{ ...spring, duration: 0.35 }}
      >
        <img src="/booking-promo-banner-v2.png" alt="Booking acara dan kolaborasi — Rencanakan acara bersama Djiwa Tentram" className="block h-auto w-full"
        loading="eager"
        fetchPriority="high" />
      </motion.a>

      {featuredProducts.length > 0 ? (
        <motion.section className="app-card-strong px-4 py-4" initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ ...spring, duration: 0.35 }} aria-labelledby="member-home-best-seller">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">Product discovery</p>
              <h2 id="member-home-best-seller" className="mt-1 text-base font-black tracking-tight">Menu Best Seller</h2>
            </div>
            <button type="button" onClick={onMenu} className="min-h-11 shrink-0 rounded-[14px] px-2 text-[11px] font-black text-primary transition-colors hover:bg-primary/10">Lihat semua →</button>
          </div>
          <div ref={carouselRef} aria-label="Menu best seller" className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onPointerEnter={() => setCarouselPaused(true)} onPointerLeave={() => setCarouselPaused(false)} onPointerDown={() => setCarouselPaused(true)} onPointerUp={() => setCarouselPaused(false)}>
            {featuredProducts.map((product) => (
              <motion.button key={product.productId} type="button" data-carousel-card onClick={onMenu} className="min-w-[176px] snap-start overflow-hidden rounded-[20px] border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-md" whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={spring}>
                <div className="relative h-24 w-full bg-muted animate-pulse">
                  {product.image ? <><img src={product.image} alt={product.name} className="h-full w-full object-cover" onLoad={(event) => event.currentTarget.parentElement?.classList.remove("animate-pulse")} onError={(event) => { event.currentTarget.parentElement?.classList.remove("animate-pulse"); event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling?.removeAttribute("hidden"); }} /><div hidden data-image-fallback className="flex h-full items-center justify-center text-muted-foreground"><UtensilsCrossed className="h-5 w-5" aria-hidden="true" /></div></> : <div className="flex h-full items-center justify-center text-muted-foreground"><UtensilsCrossed className="h-5 w-5" aria-hidden="true" /></div>}
                  {!product.isAvailable ? <span className="absolute inset-x-2 bottom-2 rounded-full bg-slate-950/75 px-2 py-1 text-center text-[10px] font-black text-white">Tidak tersedia</span> : null}
                  {product.menuNumber != null ? <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white">#{product.menuNumber}</span> : null}
                </div>
                <div className="space-y-1 p-2.5"><p className="break-words text-xs font-black leading-snug">{product.name}</p><p className="text-sm font-black text-primary">{product.price != null ? currency(product.price) : "Harga belum tersedia"}</p><p className="text-[10px] font-semibold text-muted-foreground">Terjual {product.totalSold.toLocaleString("id-ID")}x</p></div>
              </motion.button>
            ))}
          </div>
        </motion.section>
      ) : null}

      {b2bHref ? (
        <B2BPromoBanner href={b2bHref} />
      ) : null}

      {hasRestaurantInfo ? (
        <motion.section className="app-card-strong px-4 py-4" initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ ...spring, duration: 0.35 }} aria-labelledby="member-home-restaurant-info">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">Restaurant information</p>
          <h2 id="member-home-restaurant-info" className="mt-1 text-base font-black tracking-tight">Info Restoran</h2>
          <div className="mt-3 space-y-3">
            {openingTime || closingTime || openingHours ? <div className="flex items-start gap-2.5"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Jam operasional</p><p className="text-sm font-bold">{openingTime && closingTime ? `Buka ${openingTime} – Tutup ${closingTime}` : openingHours || [openingTime, closingTime].filter(Boolean).join(" – ")}</p></div></div> : null}
            {storePhone ? <div className="flex items-start gap-2.5"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Telepon</p><a href={`tel:${storePhone.replace(/[^+\d]/g, "")}`} className="text-sm font-bold text-primary">{storePhone}</a></div></div> : null}
            {storeAddress ? <div className="flex items-start gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Alamat</p><p className="text-sm font-bold leading-relaxed">{storeAddress}</p></div></div> : null}
          </div>
        </motion.section>
      ) : null}
    </div>
  );
}
