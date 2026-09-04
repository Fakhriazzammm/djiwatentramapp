import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, PackageSearch, ChevronRight, Truck } from "lucide-react";
import { useMemo } from "react";
import { CustomerHeader } from "@/components/customer/customer-shell";
import { CustomerSectionSkeleton } from "@/components/customer/customer-states";
import { OrderTrackingView } from "@/components/customer/order-tracking-view";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { currency } from "@/components/customer/types";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";

export const Route = createLazyFileRoute("/$username/tracking")({ component: TrackingPage });

const DELIVERY_LABEL: Record<string, string> = {
  pending_payment: "Menunggu pembayaran",
  paid: "Diterima",
  preparing: "Sedang dibuat",
  packing: "Dikemas",
  ready_to_ship: "Siap dikirim",
  out_for_delivery: "Sedang dikirim",
  delivered: "Selesai",
  pending: "Menunggu",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

function deliveryLabel(order: any, fallback: string) {
  const status = String(order?.deliveryStatus || order?.status || "").toLowerCase();
  return DELIVERY_LABEL[status] ?? fallback;
}

function TrackingPage() {
  const navigate = useNavigate();
  const { username } = Route.useParams();
  const { orderId } = Route.useSearch();
  const { orders, isLoading } = useCustomerOrders();

  const deliveryOrders = useMemo(
    () => (orders ?? []).filter((order) => String(order.orderType ?? "").toLowerCase() === "delivery"),
    [orders],
  );

  const openTracking = (id: string) => {
    navigate({ to: "/$username/tracking", params: { username }, search: { orderId: id } });
  };

  return (
    <div className="app-page b2b-app min-h-app">
      <div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
        <CustomerHeader eyebrow="TRACKING ORDER" title="Djiwa Tentram B2B" subtitle="Status pesanan real time" onBack={() => navigate({ to: "/$username", params: { username } })} leading={<ArrowLeft className="h-4 w-4" />} />
        {orderId ? (
          <OrderTrackingView orderId={orderId} />
        ) : (
          <main className="px-3 py-4">
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Truck className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-black">Tracking pengiriman</p>
                <p className="text-[11px] text-muted-foreground">Pilih pesanan delivery untuk melihat status live.</p>
              </div>
            </div>

            {isLoading ? (
              <CustomerSectionSkeleton label="Memuat pesanan pengiriman" />
            ) : deliveryOrders.length === 0 ? (
              <div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-4 py-10 text-center">
                <PackageSearch className="h-8 w-8 text-muted-foreground/50" />
                <h2 className="mt-3 font-display text-base font-black">Belum ada pesanan delivery</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Tracking hanya muncul untuk pesanan pengiriman (delivery).</p>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/$username/riwayat", params: { username } })}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-sm"
                >
                  <PackageSearch className="h-4 w-4" /> Lihat riwayat pesanan
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {deliveryOrders.map((order) => {
                  const orderNumber = getDisplayOrderNumber(order.orderNumber, {
                    sequence: order.dailyReceiptNo,
                    createdAt: order.createdAt,
                    source: order.source,
                    sourceApp: order.sourceApp,
                    businessUnit: order.businessUnit,
                    orderType: order.orderType,
                    platform: order.platform,
                    brandSlug: order.brandSlug ?? "b2b",
                  });
                  const label = deliveryLabel(order, String(order.status ?? "Menunggu"));
                  const statusPrimary = ["paid", "preparing", "packing", "ready_to_ship", "out_for_delivery"].includes(label.toLowerCase())
                    ? "bg-sky-100 text-sky-700"
                    : label.toLowerCase() === "selesai" || label.toLowerCase() === "diterima"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700";
                  return (
                    <button
                      type="button"
                      key={order.id}
                      onClick={() => openTracking(order.id)}
                      className="flex w-full items-center gap-3 rounded-[22px] bg-card px-4 py-3 text-left shadow-[0_8px_28px_rgba(15,23,42,0.05)] transition-transform duration-200 active:scale-[.98]"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-amber-300"><Truck className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black">#{orderNumber}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{order.items[0]?.productName ?? "Pesanan"}{order.items.length > 1 ? ` +${order.items.length - 1}` : ""} · {currency(order.totalAmount)}</p>
                        <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusPrimary}`}>{label}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
