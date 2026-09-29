import { useMemo, useState } from "react";
import { Minus, PackageSearch, Plus, Search } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import type { MerchandiseCampaignRecord } from "@/hooks/use-hybrid-pos-data";
import type { Doc, Id } from "@/types/backend-compat";
import type { CartItem } from "./types";
import type { MenuSectionProps } from "./menu-section";
import { currency } from "./types";

function ProductImage({ src, alt }: { src?: string | null; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div aria-hidden="true" className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400"><PackageSearch className="h-8 w-8" strokeWidth={1.5} /></div>;
  }
  return <>
    {!loaded ? <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-slate-100" /> : null}
    <img src={src} alt={alt} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className={cn("h-full w-full object-cover transition duration-500", loaded ? "opacity-100" : "opacity-0")} />
  </>;
}

function dispatchLabel(campaign: MerchandiseCampaignRecord) {
  const formatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
  const start = formatter.format(new Date(`${campaign.expectedDispatchStart}T00:00:00+07:00`));
  const end = formatter.format(new Date(`${campaign.expectedDispatchEnd}T00:00:00+07:00`));
  return start === end ? start : `${start} – ${end}`;
}

export function MerchandiseCatalog(props: MenuSectionProps) {
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const openCampaigns = useMemo(() => props.filteredProducts.filter((product) => {
    const campaign = props.campaignByProductId.get(String(product._id));
    const now = Date.now();
    return campaign?.lifecycle === "open" && now >= Date.parse(campaign.saleWindowStart) && now < Date.parse(campaign.saleWindowEnd);
  }), [props.campaignByProductId, props.filteredProducts]);
  const visibleProducts = featuredOnly ? openCampaigns : props.filteredProducts;

  return (
    <div className="space-y-4 px-4 pb-5 pt-2">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input aria-label="Cari merchandise" value={props.catalogQuery} onChange={(event) => props.setCatalogQuery(event.target.value)} placeholder="Cari koleksi merchandise" className="h-11 w-full rounded-2xl border border-border/70 bg-card pl-10 pr-3 text-xs font-semibold outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10" />
          </div>
          <button type="button" onClick={() => setFeaturedOnly((value) => !value)} className={cn("inline-flex h-11 shrink-0 items-center rounded-2xl border px-3 text-[11px] font-black transition active:scale-[.97]", featuredOnly ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-card text-foreground")}>{featuredOnly ? "Aktif" : "Pre-order"}</button>
        </div>
        <div aria-label="Kategori merchandise" className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => props.setActiveCategoryId(null)} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-black transition", props.activeCategoryId === null ? "bg-primary text-primary-foreground shadow-sm" : "border border-border/70 bg-card text-muted-foreground")}>Semua koleksi</button>
          {props.orderedCategories.filter((category) => !category.parentId && category.track !== "hidden").map((category) => <button type="button" key={category._id} onClick={() => props.setActiveCategoryId(category._id)} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-black transition", props.activeCategoryId === category._id ? "bg-primary text-primary-foreground shadow-sm" : "border border-border/70 bg-card text-muted-foreground")}>{category.name}</button>)}
        </div>
      </section>

      {props.isMenuError ? <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 px-4 py-10 text-center text-red-800"><PackageSearch className="mx-auto h-8 w-8" /><p className="mt-3 text-sm font-black">Koleksi belum dapat dimuat</p><button type="button" onClick={props.onRetryMenu} className="mt-4 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-black text-white">Coba lagi</button></div> : props.isMenuLoading ? <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4].map((item) => <div key={item} className="overflow-hidden rounded-[16px] bg-transparent"><div className="aspect-square animate-pulse rounded-[16px] bg-muted" /><div className="space-y-2 px-1.5 pt-2"><div className="h-3 w-4/5 animate-pulse rounded bg-muted" /><div className="h-4 w-1/2 animate-pulse rounded bg-muted" /></div></div>)}</div> : (
        <section aria-label="Daftar merchandise">
          <div className="mb-2 flex items-end justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Merchandise</p><h3 className="mt-0.5 text-base font-black tracking-tight">Koleksi terbaru</h3></div><span className="text-[11px] font-semibold text-muted-foreground">{visibleProducts.length} produk</span></div>
          {visibleProducts.length === 0 ? <div className="rounded-3xl border border-dashed border-border px-4 py-12 text-center"><PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-black">Belum ada produk di koleksi ini</p><p className="mt-1 text-xs text-muted-foreground">Coba kata kunci atau kategori lain.</p></div> : <div className="grid grid-cols-2 gap-x-3 gap-y-7">
            {visibleProducts.map((product) => {
              const pricing = calculateEffectivePrice({ _id: product._id, price: product.price, categoryId: product.categoryId }, props.discounts);
              const quantity = props.cart.filter((item) => item.productId === product._id).reduce((sum, item) => sum + item.quantity, 0);
              const campaign = props.campaignByProductId.get(String(product._id));
              const now = Date.now();
              const open = campaign?.lifecycle === "open" && now >= Date.parse(campaign.saleWindowStart) && now < Date.parse(campaign.saleWindowEnd);
              const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;
              return <motion.article key={product._id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22 }} className="group min-w-0 overflow-hidden bg-transparent">
                <button type="button" aria-label={`Lihat ${product.name}`} onClick={() => props.handleProductSelect(product)} className="relative block aspect-square w-full overflow-hidden rounded-[16px] bg-[#f2f0ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"><ProductImage src={product.image} alt={product.name} /><span className={cn("absolute left-2 top-2 rounded-full px-2 py-1 text-[9px] font-black tracking-[0.08em] shadow-sm", open ? "bg-primary text-primary-foreground" : "bg-slate-950/75 text-white")}>{open ? "PRE-ORDER" : "DITUTUP"}</span>{pricing.isPromo ? <span className="absolute bottom-2 left-2 rounded-full bg-[#d7b56d] px-2 py-1 text-[9px] font-black text-[#12233f]">PROMO</span> : null}</button>
                <div className="space-y-2 p-2.5"><div className="min-h-[2.6rem]"><h4 className="line-clamp-2 text-[13px] font-black leading-tight">{product.name}</h4><p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">{campaign ? `Kirim ${dispatchLabel(campaign)}` : "Edisi merchandise Djiwa"}</p></div><div className="flex items-end justify-between gap-2"><div><p className="text-sm font-black text-primary">{currency(pricing.finalPrice)}</p>{pricing.isPromo ? <p className="text-[10px] font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice)}</p> : null}</div>{hasVariations ? <button type="button" disabled={!open} onClick={() => props.handleProductSelect(product)} className="rounded-xl border border-primary/20 px-2.5 py-2 text-[10px] font-black text-primary disabled:cursor-not-allowed disabled:opacity-40">Pilih</button> : <div className="flex items-center rounded-xl border border-border bg-background p-1">{quantity > 0 ? <button type="button" aria-label={`Kurangi ${product.name}`} onClick={() => props.updateCartQuantity(product._id, undefined, -1)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><Minus className="h-3 w-3" /></button> : null}{quantity > 0 ? <span className="min-w-5 text-center text-[11px] font-black">{quantity}</span> : null}<button type="button" disabled={!open} aria-label={`Tambah ${product.name}`} onClick={() => quantity > 0 ? props.updateCartQuantity(product._id, undefined, 1) : props.handleProductSelect(product)} className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-35"><Plus className="h-3 w-3" /></button></div>}</div></div>
              </motion.article>;
            })}
          </div>}
        </section>
      )}
    </div>
  );
}
