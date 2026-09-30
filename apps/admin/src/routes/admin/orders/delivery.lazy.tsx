import { createLazyFileRoute } from "@tanstack/react-router";
import { Check, Circle, MapPin, RefreshCw, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { useHybridOrders, useGlobalRefreshTrigger, triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createLazyFileRoute("/admin/orders/delivery")({
  component: AdminCustomerDelivery,
});

const DELIVERY_STATUSES = [
  { value: "confirmed", label: "Dikonfirmasi" },
  { value: "allocated", label: "Kurir ditugaskan" },
  { value: "picking_up", label: "Menjemput" },
  { value: "picked", label: "Sudah diambil" },
  { value: "dropping_off", label: "Mengantar" },
  { value: "delivered", label: "Terkirim" },
  { value: "cancelled", label: "Dibatalkan" },
] as const;

type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]["value"];

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
    <div className="flex min-w-[420px] items-start gap-0">
      {DELIVERY_STATUSES.filter((item) => item.value !== "cancelled").map((item, index, steps) => {
        const reached = !cancelled && currentIndex >= 0 && index <= currentIndex;
        const active = !cancelled && item.value === status;
        return (
          <div className="flex flex-1 flex-col items-center" key={item.value}>
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${index === 0 ? "bg-transparent" : reached ? "bg-primary" : "bg-muted"}`} />
              <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] ${active ? "ring-4 ring-primary/15" : ""} ${reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {reached ? <Check className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5" />}
              </div>
              <div className={`h-0.5 flex-1 ${index === steps.length - 1 ? "bg-transparent" : reached && index < currentIndex ? "bg-primary" : "bg-muted"}`} />
            </div>
            <span className={`mt-1 text-center text-[9px] leading-tight ${active ? "font-bold text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function AdminCustomerDelivery() {
  const orders = useHybridOrders() as CustomerDeliveryOrder[] | undefined;
  const refreshTrigger = useGlobalRefreshTrigger();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const deliveryOrders = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (orders ?? [])
      .filter((order) => {
        const source = String(order.source ?? order.sourceApp ?? order.source_app ?? "").toLowerCase();
        const orderType = String(order.orderType ?? order.order_type ?? "").toLowerCase();
        return source === "customer_self_service" && orderType === "delivery";
      })
      .filter((order) => {
        const status = normalizeStatus(order);
        const statusMatches = statusFilter === "all" || (statusFilter === "active" ? !TERMINAL_STATUSES.has(status) : status === statusFilter);
        const haystack = [order.orderNumber, order.customerName, order.deliveryContactName, order.deliveryContactPhone, order.deliveryAddress, order.deliveryTrackingId, order.deliveryWaybillId].join(" ").toLowerCase();
        return statusMatches && (!search || haystack.includes(search));
      })
      .sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0));
  }, [orders, query, statusFilter]);

  const counts = useMemo(() => {
    const all = (orders ?? []).filter((order) => String(order.source ?? order.sourceApp ?? order.source_app ?? "").toLowerCase() === "customer_self_service" && String(order.orderType ?? order.order_type ?? "").toLowerCase() === "delivery");
    return { active: all.filter((order) => !TERMINAL_STATUSES.has(normalizeStatus(order))).length, delivered: all.filter((order) => normalizeStatus(order) === "delivered").length, cancelled: all.filter((order) => normalizeStatus(order) === "cancelled").length };
  }, [orders]);

  if (!orders) {
    return <div className="space-y-4 p-4 md:p-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <main className="space-y-4 p-4 pb-24 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Operasional · DjiwaApp</p><h1 className="mt-1 text-2xl font-black tracking-tight">Delivery Customer</h1><p className="mt-1 text-sm text-muted-foreground">Pantau pengiriman Biteship dari order delivery customer app.</p></div>
        <Button onClick={() => triggerHybridRefresh()} size="sm" variant="outline"><RefreshCw className="mr-2 h-4 w-4" />Segarkan</Button>
      </div>
      <div className="grid grid-cols-3 gap-2 md:max-w-xl"><div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Aktif</p><p className="mt-1 text-xl font-black">{counts.active}</p></div><div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Terkirim</p><p className="mt-1 text-xl font-black text-emerald-600">{counts.delivered}</p></div><div className="rounded-xl border border-border bg-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Dibatalkan</p><p className="mt-1 text-xl font-black text-red-600">{counts.cancelled}</p></div></div>
      <div className="grid gap-2 rounded-2xl border border-border bg-card p-3 md:grid-cols-[minmax(240px,1fr)_190px]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Cari order, customer, alamat, resi..." value={query} /></div><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="active">Aktif</option><option value="all">Semua status</option>{DELIVERY_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
      <p className="text-xs text-muted-foreground">{deliveryOrders.length} order ditampilkan · pembaruan data #{refreshTrigger}</p>
      <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-sm md:block"><table className="w-full min-w-[1280px] text-left text-xs"><thead className="bg-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-3">Order / customer</th><th className="px-3 py-3">Timeline Biteship</th><th className="px-3 py-3">Kurir & tujuan</th><th className="px-3 py-3">Tracking</th><th className="px-3 py-3 text-right">Biaya / total</th><th className="px-3 py-3">Payment / order</th></tr></thead><tbody className="divide-y divide-border">{deliveryOrders.map((order) => { const status = normalizeStatus(order); return <tr className="align-top transition-colors hover:bg-muted/30" key={order._id}><td className="px-3 py-3"><p className="font-bold">#{order.orderNumber || order._id}</p><p className="mt-1">{order.deliveryContactName || order.customerName || "Customer"}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDate(order.createdAt)}</p></td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(status)}`}>{labelForStatus(status)}</span><div className="mt-3 overflow-x-auto"><DeliveryTimeline status={status} /></div></td><td className="max-w-[220px] px-3 py-3"><p className="flex items-center gap-1 font-bold"><Truck className="h-3.5 w-3.5" />{courierLabel(order)}</p><p className="mt-1 flex gap-1 leading-relaxed text-muted-foreground"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{order.deliveryAddress || "Alamat belum tersedia"}</p></td><td className="px-3 py-3"><p>Waybill: <span className="font-semibold">{order.deliveryWaybillId || "-"}</span></p><p className="mt-1">Tracking: <span className="font-semibold">{order.deliveryTrackingId || "-"}</span></p><p className="mt-1 text-[10px] text-muted-foreground">Provider ID: {order.deliveryProviderOrderId || "-"}</p></td><td className="px-3 py-3 text-right"><p>Ongkir <span className="font-semibold">{formatRupiah(order.shippingFeeAmount)}</span></p><p className="mt-1 font-black">Total {formatRupiah(order.totalAmount)}</p></td><td className="px-3 py-3"><p>{paymentLabel(order.paymentMethod)}</p><p className="mt-1 font-semibold capitalize">{order.status || "-"}</p></td></tr>; })}</tbody></table>{deliveryOrders.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">Belum ada order delivery customer sesuai filter.</div> : null}</div>
      <div className="space-y-3 md:hidden">{deliveryOrders.map((order) => { const status = normalizeStatus(order); return <article className="rounded-2xl border border-border bg-card p-4 shadow-sm" key={order._id}><div className="flex items-start justify-between gap-2"><div><p className="font-black">#{order.orderNumber || order._id}</p><p className="text-sm">{order.deliveryContactName || order.customerName || "Customer"}</p><p className="text-[10px] text-muted-foreground">{formatDate(order.createdAt)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(status)}`}>{labelForStatus(status)}</span></div><div className="mt-4 overflow-x-auto"><DeliveryTimeline status={status} /></div><div className="mt-4 space-y-2 border-t border-border pt-3 text-xs"><p className="flex gap-2"><Truck className="h-4 w-4 shrink-0" />{courierLabel(order)}</p><p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0" />{order.deliveryAddress || "Alamat belum tersedia"}</p><p>Waybill: <strong>{order.deliveryWaybillId || "-"}</strong> · Tracking: <strong>{order.deliveryTrackingId || "-"}</strong></p><div className="flex justify-between"><span>{paymentLabel(order.paymentMethod)} · {order.status || "-"}</span><strong>{formatRupiah(order.totalAmount)}</strong></div><p className="text-muted-foreground">Ongkir {formatRupiah(order.shippingFeeAmount)}</p></div></article>; })}{deliveryOrders.length === 0 ? <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">Belum ada order delivery customer sesuai filter.</div> : null}</div>
    </main>
  );
}
