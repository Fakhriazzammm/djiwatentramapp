import { ArrowRight, Coffee, Plus } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { useHybridProducts } from "@/hooks/use-hybrid-pos-data";
import { useOrderContext } from "@/hooks/use-order-context";
import type { CartItem } from "@/components/customer/types";
import { currency } from "@/components/customer/types";
import { CustomerSectionSkeleton } from "@/components/customer/customer-states";

type RecentProduct = { productId: string; name: string; quantity: number; variant?: string; price: number; originalPrice?: number; image?: string; category?: string; categoryId: string; menuNumber?: number };

export function RecentOrdersCarousel({ username }: { username: string }) {
  const navigate = useNavigate();
  const { orders, isLoading } = useCustomerOrders();
  const products = useHybridProducts();
  const { setCart } = useOrderContext();
  const productMap = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    for (const product of products ?? []) map.set(String((product as Record<string, any>)._id), product as Record<string, any>);
    return map;
  }, [products]);

  const recentProducts = useMemo<RecentProduct[]>(() => {
    const seen = new Set<string>();
    const result: RecentProduct[] = [];
    for (const order of orders) {
      if (!["paid", "completed"].includes(order.status.toLowerCase())) continue;
      for (const item of order.items) {
        const key = `${item.productId}:${item.variant ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const product = productMap.get(item.productId);
        result.push({
          productId: item.productId,
          name: String(product?.name ?? item.productName),
          quantity: item.quantity,
          variant: item.variant ?? undefined,
          price: Number(product?.price ?? item.price ?? 0),
          originalPrice: Number(product?.originalPrice ?? product?.compareAtPrice ?? 0) || undefined,
          image: typeof product?.image === "string" ? product.image : undefined,
          category: String(product?.categoryName ?? product?.category ?? "Menu pilihan"),
          categoryId: String(product?.categoryId ?? ""),
          menuNumber: product?.menuNumber == null ? undefined : Number(product.menuNumber),
        });
        if (result.length >= 8) return result;
      }
    }
    return result;
  }, [orders, productMap]);

  const addProduct = (item: RecentProduct) => {
    const cartItem: CartItem = { productId: item.productId, name: item.name, price: item.price, quantity: 1, variant: item.variant, image: item.image, categoryId: item.categoryId, menuNumber: item.menuNumber };
    setCart((current) => {
      const existing = current.find((entry) => entry.productId === cartItem.productId && entry.variant === cartItem.variant);
      return existing ? current.map((entry) => entry === existing ? { ...entry, quantity: entry.quantity + 1 } : entry) : [...current, cartItem];
    });
    toast.success(`${item.name} ditambahkan ke keranjang`);
    navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } });
  };

  if (isLoading) return <CustomerSectionSkeleton label="Memuat pesanan terakhir" />;
  return (
    <section aria-labelledby="recent-orders-title">
      <div className="mb-2 flex items-end justify-between gap-3 px-0.5"><div><h2 id="recent-orders-title" className="text-sm font-black">Pesanan terakhir</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Menu favoritmu, siap dipesan lagi.</p></div><button type="button" onClick={() => navigate({ to: "/$username/riwayat", params: { username } })} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[11px] font-black text-primary">Lihat semua <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button></div>
      {recentProducts.length === 0 ? <div className="rounded-3xl border border-dashed border-border bg-card px-4 py-6 text-center"><p className="text-xs font-bold text-muted-foreground">Belum ada menu favorit.</p><button type="button" onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } })} className="mt-3 min-h-11 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-white">Mulai pesan</button></div> : <div className="-mx-3 flex snap-x gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Menu pesanan terakhir">{recentProducts.map((item) => <article key={`${item.productId}:${item.variant ?? ""}`} className="w-[154px] shrink-0 snap-start overflow-hidden rounded-3xl border border-border bg-card shadow-sm"><div className="relative h-[132px] bg-emerald-50">{item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-emerald-700"><Coffee className="h-9 w-9" aria-hidden="true" /></div>}<span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[9px] font-black text-emerald-800">Favorit</span></div><div className="p-3"><h3 className="truncate text-xs font-black">{item.name}</h3><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{item.category}</p><div className="mt-2 flex items-end justify-between gap-1"><div><p className="text-xs font-black text-emerald-700">{currency(item.price)}</p>{item.originalPrice && item.originalPrice > item.price ? <p className="text-[9px] text-muted-foreground line-through">{currency(item.originalPrice)}</p> : null}</div><button type="button" aria-label={`Tambah ${item.name}`} onClick={() => addProduct(item)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform duration-[180ms] active:scale-[.97]"><Plus className="h-4 w-4" aria-hidden="true" /></button></div></div></article>)}</div>}
    </section>
  );
}
