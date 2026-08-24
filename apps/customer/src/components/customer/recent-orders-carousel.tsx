import { ArrowRight, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCustomerOrders, type CustomerOrder } from "@/hooks/use-customer-data";
import { useHybridProducts } from "@/hooks/use-hybrid-pos-data";
import { useOrderContext } from "@/hooks/use-order-context";
import type { CartItem } from "@/components/customer/types";
import { currency } from "@/components/customer/types";
import { CustomerSectionSkeleton } from "@/components/customer/customer-states";

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

  const recentOrders = useMemo(
    () => orders.filter((order) => ["paid", "completed"].includes(order.status.toLowerCase())).slice(0, 5),
    [orders],
  );

  const repeatOrder = (order: CustomerOrder) => {
    const items: CartItem[] = [];
    let skipped = 0;
    for (const item of order.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        skipped += 1;
        continue;
      }
      items.push({
        productId: item.productId,
        name: String(product.name ?? item.productName),
        price: Number(product.price ?? item.price ?? 0),
        quantity: item.quantity,
        variant: item.variant ?? undefined,
        image: typeof product.image === "string" ? product.image : undefined,
        categoryId: String(product.categoryId ?? ""),
        menuNumber: product.menuNumber == null ? undefined : Number(product.menuNumber),
      });
    }
    if (!items.length) {
      toast.error("Menu dari pesanan ini sudah tidak tersedia");
      return;
    }
    setCart(items);
    if (skipped) toast.info(`${skipped} menu sudah tidak tersedia dan dilewati`);
    else toast.success("Keranjang diisi dari pesanan terakhir");
    navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } });
  };

  if (isLoading) return <CustomerSectionSkeleton label="Memuat pesanan terakhir" />;
  if (!recentOrders.length) {
    return (
      <section className="rounded-3xl border border-dashed border-border bg-card px-4 py-5" aria-labelledby="recent-orders-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="recent-orders-title" className="text-sm font-black">Pesanan terakhir</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Pesan menu favoritmu dan akses lagi dari sini.</p>
          </div>
          <button type="button" onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } })} className="min-h-11 shrink-0 rounded-[14px] border border-border bg-background px-3 py-2 text-[11px] font-black text-primary">Mulai pesan</button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="recent-orders-title">
      <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
        <div>
          <h2 id="recent-orders-title" className="text-sm font-black">Pesanan terakhir</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Pesan lagi tanpa mengulang dari awal.</p>
        </div>
        <button type="button" onClick={() => navigate({ to: "/$username/riwayat", params: { username } })} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[11px] font-black text-primary">Lihat semua <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
      </div>
      <div className="-mx-3 flex snap-x gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Pesanan terakhir">
        {recentOrders.map((order) => (
          <article key={order.id} className="w-[226px] shrink-0 snap-start rounded-3xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-black">#{order.orderNumber || order.id.slice(0, 8)}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{order.items.length} item · {currency(order.totalAmount)}</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700">Selesai</span>
            </div>
            <p className="mt-3 min-h-8 text-[11px] leading-relaxed text-muted-foreground">{order.items.slice(0, 2).map((item) => `${item.quantity}× ${item.productName}`).join(", ")}{order.items.length > 2 ? ` +${order.items.length - 2} lainnya` : ""}</p>
            <button type="button" onClick={() => repeatOrder(order)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[14px] bg-primary px-3 py-2.5 text-[11px] font-black text-primary-foreground transition-transform duration-[180ms] active:scale-[.97]"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Pesan lagi</button>
          </article>
        ))}
      </div>
    </section>
  );
}
