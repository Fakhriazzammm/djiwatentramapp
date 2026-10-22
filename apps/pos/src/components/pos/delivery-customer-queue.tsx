import { ChevronRight, MapPin, Truck } from "lucide-react";
import { isDeliveryNotification, type PosNotification } from "@/hooks/use-pos-notifications";

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

type DeliveryCustomerQueueProps = {
  notifications: PosNotification[];
  onOpenOrder: (notification: PosNotification) => void;
};

export function DeliveryCustomerQueue({ notifications, onOpenOrder }: DeliveryCustomerQueueProps) {
  const deliveries = new Map<string, PosNotification>();
  for (const item of notifications) {
    if (!isDeliveryNotification(item) || item.isRead) continue;
    const orderId = String(item.action_payload?.orderId ?? item.order_source_id ?? item.id);
    const previous = deliveries.get(orderId);
    if (!previous || new Date(item.created_at).getTime() > new Date(previous.created_at).getTime()) deliveries.set(orderId, item);
  }
  const items = Array.from(deliveries.values()).slice(0, 4);
  if (items.length === 0) return null;

  return <section aria-label="Antrian Delivery Customer" className="mx-3 mb-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-2.5 shadow-sm sm:mx-4">
    <div className="mb-2 flex items-center justify-between gap-2 px-1">
      <div className="flex min-w-0 items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white"><Truck className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-xs font-black text-sky-950">Delivery Customer</p><p className="text-[10px] font-semibold text-sky-800/80">{items.length} pesanan perlu diperhatikan</p></div></div>
      <span className="rounded-full bg-sky-600 px-2 py-1 text-[10px] font-black text-white">{items.length}</span>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const payload = item.action_payload ?? {};
        const orderId = String(payload.orderId ?? item.order_source_id ?? item.id);
        const customer = String(payload.deliveryContactName ?? payload.customerName ?? "Customer Delivery");
        const address = String(payload.deliveryAddress ?? payload.delivery_address ?? "Alamat belum tersedia");
        const courier = String(payload.deliveryProvider ?? payload.shippingProvider ?? "Kurir belum dipilih");
        const total = Number(payload.totalAmount ?? 0);
        return <button key={orderId} type="button" onClick={() => onOpenOrder(item)} className="min-w-0 rounded-xl border border-sky-200 bg-white/80 p-2.5 text-left transition-colors hover:border-sky-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40">
          <div className="flex items-start justify-between gap-2"><span className="truncate text-xs font-black text-sky-950">{customer}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-sky-700" /></div>
          <p className="mt-1 flex items-start gap-1 text-[10px] font-semibold text-slate-600"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-sky-600" /><span className="line-clamp-2">{address}</span></p>
          <p className="mt-1 truncate text-[10px] font-bold text-slate-600">{courier} · {total > 0 ? formatCurrency(total) : "Total belum tersedia"}</p>
        </button>;
      })}
    </div>
  </section>;
}
