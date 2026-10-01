import { createLazyFileRoute } from "@tanstack/react-router";
import { Check, Circle, MapPin, RefreshCw, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { useHybridDeleteOrder } from "@/hooks/use-hybrid-write-actions";
import { useHybridOrders, useGlobalRefreshTrigger, triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createLazyFileRoute("/admin/delivery")({
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
  const orders = useHybridOrders() as CustomerDeliveryOrder[] | undefined;
  const refreshTrigger = useGlobalRefreshTrigger();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteOrder = useHybridDeleteOrder();

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

  const allVisibleSelected = deliveryOrders.length > 0 && deliveryOrders.every((order) => selectedIds.includes(String(order._id)));

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAllVisible = () => {
    const visibleIds = deliveryOrders.map((order) => String(order._id));
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])));
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation?.length || isDeleting) return;
    setIsDeleting(true);
    try {
      for (const id of deleteConfirmation) await deleteOrder({ id });
      setSelectedIds((current) => current.filter((id) => !deleteConfirmation.includes(id)));
      setDeleteConfirmation(null);
      triggerHybridRefresh();
      toast.success(`${deleteConfirmation.length} order delivery berhasil dihapus.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sebagian order gagal dihapus.");
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedCount = selectedIds.length;

  if (!orders) {
    return (
      <div className="space-y-3 p-3 md:p-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <main className="flex min-h-full flex-col gap-2 p-3 pb-20 md:h-full md:min-h-0 md:gap-2 md:p-3 md:pb-3">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 shrink-0 text-primary" />
            <h1 className="truncate text-lg font-black tracking-tight md:text-xl">Delivery Customer</h1>
            <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary sm:inline-flex">Biteship</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">Pantau pengiriman order delivery customer.</p>
        </div>
        <Button className="h-8 shrink-0 px-2.5 text-xs" onClick={() => triggerHybridRefresh()} size="sm" variant="outline">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Segarkan
        </Button>
      </header>

      <section className="grid shrink-0 grid-cols-3 gap-1.5 sm:max-w-md" aria-label="Ringkasan delivery">
        <div className="rounded-lg border border-border bg-card px-2.5 py-1.5"><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Aktif</p><p className="text-lg font-black leading-tight tabular-nums">{counts.active}</p></div>
        <div className="rounded-lg border border-border bg-card px-2.5 py-1.5"><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Terkirim</p><p className="text-lg font-black leading-tight text-emerald-600 tabular-nums">{counts.delivered}</p></div>
        <div className="rounded-lg border border-border bg-card px-2.5 py-1.5"><p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Dibatalkan</p><p className="text-lg font-black leading-tight text-red-600 tabular-nums">{counts.cancelled}</p></div>
      </section>

      <section className="sticky top-0 z-10 grid shrink-0 gap-1.5 rounded-lg border border-border bg-card/95 p-1.5 backdrop-blur md:grid-cols-[minmax(0,1fr)_170px]" aria-label="Filter delivery">
        <div className="relative min-w-0"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="h-8 min-w-0 pl-8 text-xs" onChange={(event) => setQuery(event.target.value)} placeholder="Cari order, customer, alamat, resi..." value={query} /></div>
        <select className="h-8 min-w-0 rounded-md border border-input bg-background px-2.5 text-xs" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="active">Aktif</option><option value="all">Semua status</option>{DELIVERY_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
      </section>

      <div className="flex shrink-0 items-center justify-between gap-2 text-[10px] text-muted-foreground"><span>{deliveryOrders.length} order ditampilkan</span><div className="flex items-center gap-2"><span>Pembaruan #{refreshTrigger}</span>{selectedCount > 0 ? <Button className="h-7 px-2 text-[10px]" disabled={isDeleting} onClick={() => setDeleteConfirmation([...selectedIds])} size="sm" variant="destructive"><Trash2 className="mr-1 h-3 w-3" />Hapus {selectedCount}</Button> : null}</div></div>

      <div className="hidden min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card md:block">
        <table className="w-full min-w-[1120px] table-fixed text-left text-[11px]">
          <thead className="sticky top-0 z-[1] bg-muted/95 text-[9px] uppercase tracking-wider text-muted-foreground backdrop-blur"><tr><th className="w-10 px-2 py-1.5 text-center"><input aria-label="Pilih semua order yang terlihat" checked={allVisibleSelected} onChange={toggleAllVisible} type="checkbox" className="h-3.5 w-3.5 accent-primary" /></th><th className="w-[14%] px-2 py-1.5">Order / customer</th><th className="w-[27%] px-2 py-1.5">Timeline Biteship</th><th className="w-[18%] px-2 py-1.5">Kurir & tujuan</th><th className="w-[16%] px-2 py-1.5">Tracking</th><th className="w-[10%] px-2 py-1.5 text-right">Biaya / total</th><th className="w-[11%] px-2 py-1.5">Payment / order</th></tr></thead>
          <tbody className="divide-y divide-border">
            {deliveryOrders.map((order) => { const status = normalizeStatus(order); return (
              <tr className="align-middle transition-colors hover:bg-muted/30" key={order._id}>
                <td className="px-2 py-1.5 text-center align-top"><input aria-label={`Pilih order ${order.orderNumber || order._id}`} checked={selectedIds.includes(String(order._id))} onChange={() => toggleSelected(String(order._id))} type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-primary" /></td>
                <td className="px-2 py-1.5 align-top"><p className="truncate font-bold" title={order.orderNumber || order._id}>#{order.orderNumber || order._id}</p><p className="truncate text-[10px]">{order.deliveryContactName || order.customerName || "Customer"}</p><p className="text-[9px] text-muted-foreground">{formatDate(order.createdAt)}</p></td>
                <td className="px-2 py-1.5"><span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold ${statusClass(status)}`}>{labelForStatus(status)}</span><div className="mt-1.5 overflow-x-auto"><DeliveryTimeline status={status} /></div></td>
                <td className="max-w-0 px-2 py-1.5 align-top"><p className="flex items-center gap-1 truncate font-bold"><Truck className="h-3 w-3 shrink-0" />{courierLabel(order)}</p><p className="mt-0.5 flex max-w-full gap-1 truncate text-[10px] text-muted-foreground" title={order.deliveryAddress || "Alamat belum tersedia"}><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{order.deliveryAddress || "Alamat belum tersedia"}</p></td>
                <td className="px-2 py-1.5 align-top text-[10px]"><p className="truncate" title={order.deliveryWaybillId || "-"}>Waybill: <span className="font-semibold">{order.deliveryWaybillId || "-"}</span></p><p className="truncate" title={order.deliveryTrackingId || "-"}>Tracking: <span className="font-semibold">{order.deliveryTrackingId || "-"}</span></p><p className="truncate text-[9px] text-muted-foreground" title={order.deliveryProviderOrderId || "-"}>Provider: {order.deliveryProviderOrderId || "-"}</p></td>
                <td className="px-2 py-1.5 text-right align-top text-[10px]"><p>Ongkir <span className="font-semibold">{formatRupiah(order.shippingFeeAmount)}</span></p><p className="mt-0.5 font-bold">{formatRupiah(order.totalAmount)}</p></td>
                <td className="px-2 py-1.5 align-top text-[10px]"><p>{paymentLabel(order.paymentMethod)}</p><p className="mt-0.5 truncate text-muted-foreground">{order.status || "-"}</p></td>
              </tr>
            ); })}
          </tbody>
        </table>
        {deliveryOrders.length === 0 ? <div className="p-8 text-center text-xs text-muted-foreground">Belum ada order delivery customer sesuai filter.</div> : null}
      </div>

      <div className="space-y-2 md:hidden">
        {deliveryOrders.map((order) => { const status = normalizeStatus(order); return (
          <article className={`rounded-xl border bg-card p-3 ${selectedIds.includes(String(order._id)) ? "border-primary ring-1 ring-primary/20" : "border-border"}`} key={order._id}>
            <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2"><input aria-label={`Pilih order ${order.orderNumber || order._id}`} checked={selectedIds.includes(String(order._id))} onChange={() => toggleSelected(String(order._id))} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" /><div className="min-w-0"><p className="truncate font-black">#{order.orderNumber || order._id}</p><p className="truncate text-xs">{order.deliveryContactName || order.customerName || "Customer"}</p><p className="text-[10px] text-muted-foreground">{formatDate(order.createdAt)}</p></div><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${statusClass(status)}`}>{labelForStatus(status)}</span></div></div>
            <div className="mt-2 overflow-x-auto"><DeliveryTimeline status={status} /></div>
            <div className="mt-2 space-y-1.5 border-t border-border pt-2 text-[11px]"><p className="flex gap-1.5"><Truck className="h-3.5 w-3.5 shrink-0" />{courierLabel(order)}</p><p className="flex gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" />{order.deliveryAddress || "Alamat belum tersedia"}</p><p className="truncate">Waybill: <strong>{order.deliveryWaybillId || "-"}</strong> · Tracking: <strong>{order.deliveryTrackingId || "-"}</strong></p><div className="flex justify-between gap-2"><span>{paymentLabel(order.paymentMethod)} · {order.status || "-"}</span><strong>{formatRupiah(order.totalAmount)}</strong></div><p className="text-muted-foreground">Ongkir {formatRupiah(order.shippingFeeAmount)}</p></div>
          </article>
        ); })}
        {deliveryOrders.length === 0 ? <div className="rounded-xl border border-dashed border-border py-10 text-center text-xs text-muted-foreground">Belum ada order delivery customer sesuai filter.</div> : null}
      </div>
      <ConfirmationModal
        confirmText={isDeleting ? "Menghapus..." : "Hapus"}
        isOpen={Boolean(deleteConfirmation?.length)}
        loading={isDeleting}
        message={`Hapus ${deleteConfirmation?.length ?? 0} order delivery terpilih? Data order, item, transaksi, dan status terkait akan dihapus.`}
        onClose={() => { if (!isDeleting) setDeleteConfirmation(null); }}
        onConfirm={confirmDelete}
        title="Konfirmasi Hapus Order"
      />
    </main>
  );
}
