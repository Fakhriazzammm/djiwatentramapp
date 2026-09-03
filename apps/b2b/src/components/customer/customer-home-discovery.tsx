import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, MapPin, Package, Phone } from "lucide-react";
import { useHybridBestSellers, useHybridProducts, useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { currency } from "@/components/customer/types";

type CustomerHomeDiscoveryProps = {
  onMenu: () => void;
};

export function CustomerHomeDiscovery({ onMenu }: CustomerHomeDiscoveryProps) {
  const reduceMotion = useReducedMotion();
  const products = useHybridProducts();
  const bestSellers = useHybridBestSellers();
  const siteSettings = useHybridSiteSettings();

  const featuredProducts = useMemo(() => {
    const productMap = new Map(products?.map((product) => [String(product._id), product]) ?? []);
    const bestSellerIds = (bestSellers ?? []).map((item) => item.productId);
    const ordered = [
      ...bestSellerIds.map((id) => productMap.get(id)).filter(Boolean),
      ...(products ?? []).filter((product) => !bestSellerIds.includes(String(product._id))),
    ];
    return ordered.slice(0, 6).map((product) => ({
      productId: String(product!._id),
      name: String(product!.name),
      image: typeof product!.image === "string" && /^https?:\/\//.test(product!.image) ? product!.image : null,
      price: Number(product!.promoPrice ?? product!.price ?? 0),
      originalPrice: product!.promoPrice != null ? Number(product!.price ?? 0) : null,
      menuNumber: product!.menuNumber != null ? Number(product!.menuNumber) : null,
      totalSold: bestSellers?.find((item) => item.productId === String(product!._id))?.totalSold ?? 0,
    }));
  }, [bestSellers, products]);

  const openingTime = typeof siteSettings?.openingTime === "string" ? siteSettings.openingTime.trim() : "";
  const closingTime = typeof siteSettings?.closingTime === "string" ? siteSettings.closingTime.trim() : "";
  const openingHours = typeof siteSettings?.openingHours === "string" ? siteSettings.openingHours.trim() : "";
  const storePhone = typeof siteSettings?.storePhone === "string" ? siteSettings.storePhone.trim() : "";
  const storeAddress = typeof siteSettings?.storeAddress === "string" ? siteSettings.storeAddress.trim() : "";
  const hasRestaurantInfo = Boolean(openingTime || closingTime || openingHours || storePhone || storeAddress);
  const spring = { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.8 };

  return (
    <div className="space-y-4">
      <motion.a
        href="https://booking.yumme.id/"
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
        <img src="/booking-promo-banner-v2.png" alt="Booking acara dan kolaborasi — Rencanakan acara bersama Djiwa Tentram" className="block h-auto w-full" loading="lazy" />
      </motion.a>

      {featuredProducts.length > 0 ? (
        <motion.section className="app-card-strong px-4 py-4" initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ ...spring, duration: 0.35 }} aria-labelledby="member-home-b2b-collection">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">B2B store</p>
              <h2 id="member-home-b2b-collection" className="mt-1 text-base font-black tracking-tight">Koleksi B2B</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Pilihan b2b untuk dibawa pulang.</p>
            </div>
            <button type="button" onClick={onMenu} className="min-h-11 shrink-0 rounded-[14px] px-2 text-[11px] font-black text-primary transition-colors hover:bg-primary/10">Lihat katalog →</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5" aria-label="Koleksi b2b">
            {featuredProducts.map((product) => (
              <motion.button key={product.productId} type="button" onClick={onMenu} className="overflow-hidden rounded-[20px] border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-md" whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={spring}>
                <div className="relative h-28 w-full bg-primary/[0.06]">
                  {product.image ? <><img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling?.removeAttribute("hidden"); }} /><div hidden data-image-fallback className="flex h-full items-center justify-center text-primary"><Package className="h-8 w-8" aria-hidden="true" /></div></> : <div className="flex h-full items-center justify-center text-primary"><Package className="h-8 w-8" aria-hidden="true" /></div>}
                  {product.menuNumber != null ? <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white">#{product.menuNumber}</span> : null}
                </div>
                <div className="space-y-1 p-2.5"><p className="break-words text-xs font-black leading-snug">{product.name}</p><div><p className="text-sm font-black text-primary">{currency(product.price)}</p>{product.originalPrice && product.originalPrice > product.price ? <p className="text-[10px] text-muted-foreground line-through">{currency(product.originalPrice)}</p> : null}</div></div>
              </motion.button>
            ))}
          </div>
        </motion.section>
      ) : null}

      {hasRestaurantInfo ? (
        <motion.section className="app-card-strong px-4 py-4" initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ ...spring, duration: 0.35 }} aria-labelledby="member-home-restaurant-info">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary">Store information</p>
          <h2 id="member-home-restaurant-info" className="mt-1 text-base font-black tracking-tight">Info Toko</h2>
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
