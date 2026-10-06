import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { Check, Circle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { deliveryApi } from "@yumipos/web-shared/lib/customer-delivery";
export const Route = createLazyFileRoute("/admin/delivery")({ component: AdminCustomerDelivery });
const DELIVERY_STATUSES = [
  { value: "confirmed", label: "Dikonfirmasi" },
  { value: "allocated", label: "Kurir ditugaskan" },
  { value: "picking_up", label: "Menjemput" },
  { value: "picked", label: "Sudah diambil" },
  { value: "dropping_off", label: "Mengantar" },
  { value: "delivered", label: "Terkirim" },
  { value: "cancelled", label: "Dibatalkan" },
] as const;



type CustomerDeliveryOrder = Record<string, any> & {
  _id: string;
  orderNumber?: string;
  status?: string | null;
  deliveryStatus?: string | null;
  deliveryProvider?: string | null;
  deliveryAddress?: string | null;
  deliveryContactName?: string | null;
  deliveryContactPhone?: string | null;
  deliveryProviderOrderId?: string | null;
  deliveryTrackingId?: string | null;
  deliveryWaybillId?: string | null;
  shippingFeeAmount?: number | null;
  totalAmount?: number | null;
  paymentMethod?: string | null;
  createdAt?: number | null;
};

const TERMINAL_STATUSES = new Set(["delivered", "cancelled"]);

function normalizeStatus(order: CustomerDeliveryOrder): string {
  return String(order.deliveryStatus ?? order.delivery_status ?? "").trim().toLowerCase();
}

function labelForStatus(status: string) {
  return DELIVERY_STATUSES.find((item) => item.value === status)?.label ?? (status || "Belum ada status");
}

function formatRupiah(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount)
    : "-";
}

function formatDate(value: unknown) {
  const timestamp = Number(value ?? 0);
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

function courierLabel(order: CustomerDeliveryOrder) {
  const provider = String(order.deliveryProvider ?? order.delivery_provider ?? "").trim();
  return provider ? provider.toUpperCase() : "Belum dipilih";
}

function paymentLabel(value: unknown) {
  const payment = String(value ?? "").trim().toLowerCase();
  if (!payment) return "-";
  if (payment.includes("wallet") || payment.includes("djiwa")) return "Djiwa Pay";
  if (payment.includes("qris") || payment.includes("mayar")) return "QRIS";
  if (payment === "cash") return "Tunai";
  return payment.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClass(status: string) {
  if (status === "delivered") return "bg-emerald-100 text-emerald-700";
  if (status === "cancelled") return "bg-red-100 text-red-700";
  if (status === "dropping_off" || status === "picked") return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-800";
}

function DeliveryTimeline({ status }: { status: string }) {
  const currentIndex = DELIVERY_STATUSES.findIndex((item) => item.value === status);
  const cancelled = status === "cancelled";
  return (
    <div className="flex w-full min-w-0 items-start gap-0">
      {DELIVERY_STATUSES.filter((item) => item.value !== "cancelled").map((item, index, steps) => {
        const reached = !cancelled && currentIndex >= 0 && index <= currentIndex;
        const active = !cancelled && item.value === status;
        return (
          <div className="flex min-w-0 flex-1 flex-col items-center" key={item.value}>
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${index === 0 ? "bg-transparent" : reached ? "bg-primary" : "bg-muted"}`} />
              <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] ${active ? "ring-4 ring-primary/15" : ""} ${reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {reached ? <Check className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5" />}
              </div>
              <div className={`h-0.5 flex-1 ${index === steps.length - 1 ? "bg-transparent" : reached && index < currentIndex ? "bg-primary" : "bg-muted"}`} />
            </div>
            <span className={`mt-1 min-h-[2rem] max-w-[3.5rem] whitespace-normal break-words px-0.5 text-center text-[8px] leading-[1.1] ${active ? "font-bold text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function AdminCustomerDelivery() {
  const { token } = useYumiAuth();
  const requestVersion = useRef(0);
  const [orders, setOrders] = useState<CustomerDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selected, setSelected] = useState<CustomerDeliveryOrder | null>(null);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError(null); setSelected(null); setOrders([]);
    try {
      const data = await deliveryApi<{ orders: Record<string, any>[] }>("delivery-admin", { action: "list_orders", staffToken: token });
      if (version !== requestVersion.current) return;
      setOrders(data.orders.map((o) => ({ _id: o.source_id, orderNumber: o.order_number, customerName: o.customer_name, status: o.status, paymentMethod: o.payment_method, deliveryStatus: o.delivery_status, deliveryProvider: o.delivery_provider, deliveryContactName: o.delivery_contact_name, deliveryContactPhone: o.delivery_contact_phone, deliveryAddress: o.delivery_address, deliveryProviderOrderId: o.delivery_provider_order_id, deliveryTrackingId: o.delivery_tracking_id, deliveryWaybillId: o.delivery_waybill_id, shippingFeeAmount: o.shipping_fee_amount, totalAmount: o.total_amount, createdAt: o.created_at })));
    } catch { if (version !== requestVersion.current) return; setOrders([]); setError("Daftar delivery tidak dapat dimuat. Periksa sesi dan akses Anda."); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [token]);
  useEffect(() => { void refresh(); return () => { requestVersion.current++; }; }, [refresh]);
  const filtered = useMemo(() => orders.filter((o) => (statusFilter === "all" || (statusFilter === "active" ? !TERMINAL_STATUSES.has(normalizeStatus(o)) : normalizeStatus(o) === statusFilter)) && [o.orderNumber, o.customerName, o.deliveryContactName, o.deliveryTrackingId, o.deliveryWaybillId].join(" ").toLowerCase().includes(query.trim().toLowerCase())), [orders, query, statusFilter]);
  return <main className="space-y-3 p-3 pb-20 md:p-4">
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-black">Delivery Customer</h1><p className="text-xs text-muted-foreground">100 order terbaru · status diperbarui oleh webhook.</p></div><div className="flex gap-2"><Link to="/admin/delivery/settings" className="text-sm underline">Pengaturan</Link><Button variant="outline" disabled={loading} onClick={() => void refresh()}>{loading ? "Memuat…" : "Segarkan"}</Button></div></header>
    <section className="grid grid-cols-3 gap-2" aria-label="Ringkasan 100 order terbaru">{[["Aktif", orders.filter((o) => !TERMINAL_STATUSES.has(normalizeStatus(o))).length], ["Terkirim", orders.filter((o) => normalizeStatus(o) === "delivered").length], ["Dibatalkan", orders.filter((o) => normalizeStatus(o) === "cancelled").length]].map(([label, count]) => <div key={label} className="rounded-lg border p-2 text-xs">{label}<strong className="block text-xl">{count}</strong></div>)}</section>
    <div className="flex gap-2"><Input aria-label="Cari order" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari order, customer, tracking…"/><select aria-label="Status pengiriman" className="rounded border bg-background px-2 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="active">Aktif</option><option value="all">Semua</option>{DELIVERY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="hidden overflow-auto rounded-lg border md:block"><table className="w-full text-left text-xs"><thead className="bg-muted"><tr>{["Order / customer", "Status", "Kurir", "Tracking", "Ongkir / total", "Pembayaran", ""].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}</tr></thead><tbody>{filtered.map((o) => <tr key={o._id} className="border-t"><td className="p-2 font-semibold">#{o.orderNumber}<p className="font-normal">{o.deliveryContactName || o.customerName}</p><p className="text-muted-foreground">{formatDate(o.createdAt)}</p></td><td className="p-2"><span className={`rounded px-2 py-1 ${statusClass(normalizeStatus(o))}`}>{labelForStatus(normalizeStatus(o))}</span></td><td className="p-2">{courierLabel(o)}</td><td className="p-2">{o.deliveryWaybillId || o.deliveryTrackingId || "-"}</td><td className="p-2">{formatRupiah(o.shippingFeeAmount)}<p className="font-bold">{formatRupiah(o.totalAmount)}</p></td><td className="p-2">{paymentLabel(o.paymentMethod)}<p>{o.status}</p></td><td className="p-2"><Button variant="ghost" size="sm" onClick={() => setSelected(o)}>Detail</Button></td></tr>)}</tbody></table></div>
    <div className="space-y-2 md:hidden">{filtered.map((o) => <article key={o._id} className="rounded-lg border p-3 text-xs"><strong>#{o.orderNumber} · {o.deliveryContactName || o.customerName}</strong><p>{labelForStatus(normalizeStatus(o))} · {courierLabel(o)}</p><p>{formatRupiah(o.totalAmount)} · {paymentLabel(o.paymentMethod)}</p><Button variant="ghost" onClick={() => setSelected(o)}>Detail</Button></article>)}</div>
    {!loading && !error && filtered.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada order sesuai filter.</p> : null}
    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><SheetContent className="overflow-y-auto"><SheetHeader><SheetTitle>Detail delivery #{selected?.orderNumber}</SheetTitle><SheetDescription>Status pengiriman dari webhook</SheetDescription></SheetHeader>{selected ? <div className="space-y-3 p-4 text-sm"><p>{selected.deliveryContactName || selected.customerName}</p><p>{selected.deliveryContactPhone || "-"}</p><p className="whitespace-pre-wrap">{selected.deliveryAddress || "-"}</p><p>{labelForStatus(normalizeStatus(selected))} · {courierLabel(selected)}</p><DeliveryTimeline status={normalizeStatus(selected)}/><p>Waybill: {selected.deliveryWaybillId || "-"}</p><p>Tracking: {selected.deliveryTrackingId || "-"}</p><p>Provider order: {selected.deliveryProviderOrderId || "-"}</p><p>Ongkir {formatRupiah(selected.shippingFeeAmount)} · Total {formatRupiah(selected.totalAmount)}</p><p>{paymentLabel(selected.paymentMethod)} · {selected.status}</p></div> : null}</SheetContent></Sheet>
  </main>;
}
