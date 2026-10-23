import { createLazyFileRoute } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, Circle, CreditCard, Package, RefreshCw, Search, Settings2, Truck, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestAdminConfirm } from "@/lib/admin-dialogs";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { deliveryApi } from "@yumipos/web-shared/lib/customer-delivery";
import { DeliverySettingsPanel } from "./-components/delivery-settings-panel";
export const Route = createLazyFileRoute("/admin/delivery")({ component: AdminCustomerDelivery });
const DELIVERY_STATUSES = [
  { value: "pending_payment", label: "Menunggu pembayaran" },
  { value: "paid", label: "Sudah dibayar" },
  { value: "preparing", label: "Disiapkan" },
  { value: "packing", label: "Dikemas" },
  { value: "ready_to_ship", label: "Siap dikirim" },
  { value: "out_for_delivery", label: "Dalam pengiriman" },
  { value: "delivered", label: "Terkirim" },
  { value: "failed", label: "Pengiriman bermasalah" },
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
  shippingRateSnapshot?: { feeSource?: string | null } | null;
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
  if (!Number.isFinite(timestamp) || !timestamp) return "-";
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
  if (status === "delivered" || status === "paid" || status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-600/15";
  if (status === "cancelled" || status === "failed") return "bg-rose-50 text-rose-700 ring-rose-600/15";
  if (status === "out_for_delivery" || status === "ready_to_ship") return "bg-blue-50 text-blue-700 ring-blue-600/15";
  return "bg-amber-50 text-amber-800 ring-amber-600/15";
}

function paymentStatusLabel(value: unknown) {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "paid" || status === "completed" || status === "settled") return "Lunas";
  if (status === "pending" || status === "open" || status === "open_bill") return "Belum dibayar";
  if (status === "failed" || status === "cancelled") return "Gagal";
  return status ? status.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Belum diketahui";
}

function StatusBadge({ status, payment = false }: { status: string; payment?: boolean }) {
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusClass(status)}`}>
    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
    {payment ? paymentStatusLabel(status) : labelForStatus(status)}
  </span>;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="space-y-1"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="break-words text-sm font-medium text-slate-900">{value}</dd></div>;
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
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] ${active ? "ring-4 ring-primary/15" : ""} ${reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {reached ? <Check className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5" />}
              </div>
              <div className={`h-0.5 flex-1 ${index === steps.length - 1 ? "bg-transparent" : reached && index < currentIndex ? "bg-primary" : "bg-muted"}`} />
            </div>
            <span className={`mt-1 min-h-[2rem] max-w-[4.5rem] whitespace-normal break-words px-0.5 text-center text-[10px] leading-tight ${active ? "font-bold text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function AdminCustomerDelivery() {
  const { token } = useYumiAuth();
  const requestVersion = useRef(0);
  const settingsSection = useRef<HTMLElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [orders, setOrders] = useState<CustomerDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selected, setSelected] = useState<CustomerDeliveryOrder | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError(null); setSelected(null); setOrders([]);
    try {
      const data = await deliveryApi<{ orders: Record<string, any>[] }>("delivery-admin", { action: "list_orders", staffToken: token });
      if (version !== requestVersion.current) return;
      setOrders(data.orders.map((o) => ({ _id: o.source_id, orderNumber: o.order_number, customerName: o.customer_name, status: o.status, paymentMethod: o.payment_method, deliveryStatus: o.delivery_status, deliveryProvider: o.delivery_provider, deliveryContactName: o.delivery_contact_name, deliveryContactPhone: o.delivery_contact_phone, deliveryAddress: o.delivery_address, deliveryProviderOrderId: o.delivery_provider_order_id, deliveryTrackingId: o.delivery_tracking_id, deliveryWaybillId: o.delivery_waybill_id, shippingFeeAmount: o.shipping_fee_amount, totalAmount: o.total_amount, createdAt: o.created_at, shippingRateSnapshot: o.shipping_rate_snapshot })));
    } catch { if (version !== requestVersion.current) return; setOrders([]); setError("Daftar delivery tidak dapat dimuat. Periksa sesi dan akses Anda."); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [token]);
  useEffect(() => { void refresh(); return () => { requestVersion.current++; }; }, [refresh]);
  const bookShipment = async (order: CustomerDeliveryOrder) => {
    if (bookingId) return;
    const accepted = await requestAdminConfirm({
      title: "Buat pesanan kurir?",
      message: `Buat pesanan kurir Biteship untuk order #${order.orderNumber}? Tindakan ini dapat menggunakan saldo akun Biteship.`,
      confirmText: "Buat pesanan",
      variant: "warning",
    });
    if (!accepted) return;
    setBookingId(order._id); setActionError(null);
    try {
      await deliveryApi("delivery-admin", { action: "create_shipment", staffToken: token, sourceId: order._id });
      await refresh();
    } catch (cause) {
      const code = String((cause as { code?: unknown })?.code ?? (cause as Error)?.message ?? "");
      setActionError(code.includes("SHIPMENT_NOT_CONFIGURED") ? "Konfigurasi alamat pengirim Biteship belum lengkap." : code.includes("SHIPMENT_DATA_INCOMPLETE") || code.includes("DESTINATION_COORDINATES_REQUIRED") ? "Data tarif/lokasi order belum cukup untuk dibuatkan shipment." : "Shipment belum berhasil dibuat. Periksa konfigurasi dan status order, lalu coba lagi.");
    } finally { setBookingId(null); }
  };
  const filtered = useMemo(() => orders.filter((o) => (statusFilter === "all" || (statusFilter === "active" ? !TERMINAL_STATUSES.has(normalizeStatus(o)) : normalizeStatus(o) === statusFilter)) && [o.orderNumber, o.customerName, o.deliveryContactName, o.deliveryContactPhone, o.deliveryAddress, o.deliveryProviderOrderId, o.deliveryTrackingId, o.deliveryWaybillId].join(" ").toLowerCase().includes(query.trim().toLowerCase())), [orders, query, statusFilter]);
  const summary = [
    { label: "Order aktif", count: orders.filter((o) => !TERMINAL_STATUSES.has(normalizeStatus(o))).length, context: "Dalam proses", icon: Package, accent: "bg-blue-50 text-blue-600" },
    { label: "Terkirim", count: orders.filter((o) => normalizeStatus(o) === "delivered").length, context: "Pengiriman selesai", icon: CheckCircle2, accent: "bg-emerald-50 text-emerald-600" },
    { label: "Dibatalkan", count: orders.filter((o) => normalizeStatus(o) === "cancelled").length, context: "Order dibatalkan", icon: XCircle, accent: "bg-rose-50 text-rose-600" },
  ];
  return <main className="min-h-full space-y-5 bg-slate-50/80 p-4 pb-20 text-slate-900 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500"><Truck className="h-4 w-4" aria-hidden="true" /> Operasional · Delivery</div>
        <h1 className="text-2xl font-semibold tracking-tight">Delivery Customer</h1>
        <p className="mt-1 text-sm text-slate-500">100 order terbaru · status diperbarui oleh webhook.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="min-h-11 gap-2 rounded-lg text-slate-600" aria-expanded={settingsOpen} aria-controls="delivery-settings-content" onClick={() => { setSettingsOpen(true); settingsSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><Settings2 className="h-4 w-4" aria-hidden="true" /> Pengaturan</Button>
        <Button variant="outline" className="min-h-11 gap-2 rounded-lg bg-white shadow-sm" disabled={loading} onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />{loading ? "Memuat…" : "Segarkan"}</Button>
      </div>
    </header>

    <section ref={settingsSection} className="scroll-mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Pengaturan delivery">
      <button type="button" className="flex min-h-14 w-full items-center justify-between gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500" aria-expanded={settingsOpen} aria-controls="delivery-settings-content" onClick={() => setSettingsOpen((open) => !open)}>
        <span className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="h-4 w-4 text-slate-500" aria-hidden="true" />Pengaturan Delivery Customer</span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${settingsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id="delivery-settings-content" hidden={!settingsOpen} className="border-t border-slate-200">
        <DeliverySettingsPanel />
      </div>
    </section>

    <section className="grid grid-cols-3 gap-2 sm:gap-4" aria-label="Ringkasan 100 order terbaru">
      {summary.map(({ label, count, context, icon: Icon, accent }) => <div key={label} className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex items-center justify-between gap-1"><span className="text-xs font-medium text-slate-600 sm:text-sm">{label}</span><span className={`hidden rounded-lg p-2 sm:inline-flex ${accent}`}><Icon className="h-4 w-4" aria-hidden="true" /></span></div>
        <strong className="mt-2 block text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{loading || error ? "—" : count}</strong>
        <p className="mt-1 hidden text-xs text-slate-500 sm:block">{context}</p>
      </div>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Daftar order delivery">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3 sm:p-4">
        <div className="relative min-w-0 flex-1 basis-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><Input aria-label="Cari order" className="h-11 rounded-lg border-slate-200 bg-slate-50/70 pl-9 text-sm shadow-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari order, customer, tracking…" /></div>
        <div className="flex items-center gap-2"><label htmlFor="delivery-status" className="text-xs font-medium text-slate-500">Status</label><select id="delivery-status" aria-label="Status pengiriman" className="h-11 max-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="active">Aktif</option><option value="all">Semua</option>{DELIVERY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
        <span role="status" className="whitespace-nowrap text-xs tabular-nums text-slate-500">{loading ? "Memuat order…" : error ? "Data tidak tersedia" : <><strong className="font-semibold text-slate-900">{filtered.length}</strong> dari {orders.length} order</>}</span>
      </div>

      {error ? <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center"><span className="rounded-full bg-rose-50 p-3 text-rose-600"><AlertCircle className="h-6 w-6" aria-hidden="true" /></span><h2 className="font-semibold">Order tidak dapat dimuat</h2><p className="max-w-md text-sm text-slate-500">{error}</p><Button variant="outline" onClick={() => void refresh()} className="min-h-11 gap-2"><RefreshCw className="h-4 w-4" aria-hidden="true" />Coba lagi</Button></div>
        : loading ? <div role="status" aria-label="Memuat order delivery" className="space-y-4 p-5"><span className="sr-only">Memuat order delivery…</span>{Array.from({ length: 5 }, (_, index) => <div key={index} aria-hidden="true" className="flex animate-pulse items-center gap-5 border-b border-slate-100 pb-4 motion-reduce:animate-none"><div className="h-10 w-10 rounded-lg bg-slate-100" /><div className="flex-1 space-y-2"><div className="h-3 w-32 rounded bg-slate-100" /><div className="h-3 w-48 max-w-full rounded bg-slate-100" /></div><div className="hidden h-6 w-28 rounded bg-slate-100 sm:block" /></div>)}</div>
        : filtered.length === 0 ? <div className="flex flex-col items-center gap-2 px-6 py-14 text-center"><span className="mb-2 rounded-full bg-slate-100 p-3 text-slate-400"><Package className="h-6 w-6" aria-hidden="true" /></span><h2 className="font-semibold">Belum ada order sesuai filter</h2><p className="max-w-sm text-sm text-slate-500">Coba kata pencarian atau status lain. Segarkan untuk memuat order terbaru.</p></div>
        : <>
          <div className="hidden max-h-[65vh] overflow-auto md:block"><table className="w-full min-w-[1000px] text-left text-sm"><caption className="sr-only">Order delivery customer, pembayaran, dan status pengiriman</caption><thead className="sticky top-0 z-10 bg-slate-100 text-xs font-semibold text-slate-600"><tr>{["Order / customer", "Delivery", "Kurir / tracking", "Total / ongkir", "Payment", "Detail"].map((h) => <th key={h} scope="col" className="border-b border-slate-200 px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{filtered.map((o) => <tr key={o._id} className="transition-colors hover:bg-slate-50/80">
              <td className="px-4 py-3"><div className="font-semibold tracking-tight text-slate-900">#{o.orderNumber}</div><p className="mt-0.5 font-medium text-slate-700">{o.deliveryContactName || o.customerName || "-"}</p><p className="mt-1 text-xs text-slate-500">{formatDate(o.createdAt)}</p></td>
              <td className="px-4 py-3"><StatusBadge status={normalizeStatus(o)} /></td>
              <td className="px-4 py-3"><p className="text-xs font-semibold text-slate-700">{courierLabel(o)}</p><p className="mt-1 max-w-[200px] break-all font-mono text-xs text-slate-500">{o.deliveryWaybillId || o.deliveryTrackingId || "-"}</p></td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums"><p className="font-semibold">{formatRupiah(o.totalAmount)}</p><p className="mt-1 text-xs text-slate-500">Ongkir {formatRupiah(o.shippingFeeAmount)}</p></td>
              <td className="px-4 py-3"><StatusBadge payment status={String(o.status ?? "")} /><p className="mt-1.5 text-xs text-slate-500">{paymentLabel(o.paymentMethod)}</p></td>
              <td className="px-4 py-3"><Button variant="ghost" size="sm" className="min-h-11 gap-1 rounded-lg text-slate-600" aria-label={`Detail order #${o.orderNumber}`} onClick={() => setSelected(o)}>Detail<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Button></td>
            </tr>)}</tbody></table></div>
          <div className="divide-y divide-slate-100 md:hidden">{filtered.map((o) => <article key={o._id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-semibold tracking-tight">#{o.orderNumber}</h2><p className="mt-0.5 break-words text-sm font-medium text-slate-700">{o.deliveryContactName || o.customerName || "-"}</p><p className="mt-1 text-xs text-slate-500">{formatDate(o.createdAt)}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{formatRupiah(o.totalAmount)}</p></div>
            <div className="grid grid-cols-2 gap-3"><div><p className="mb-1.5 text-xs text-slate-500">Delivery</p><StatusBadge status={normalizeStatus(o)} /></div><div><p className="mb-1.5 text-xs text-slate-500">Payment · {paymentLabel(o.paymentMethod)}</p><StatusBadge payment status={String(o.status ?? "")} /></div></div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2"><div className="min-w-0"><p className="text-xs font-medium text-slate-600">{courierLabel(o)}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{o.deliveryWaybillId || o.deliveryTrackingId || "-"}</p></div><Button variant="outline" className="min-h-11 shrink-0 gap-2 rounded-lg" aria-label={`Detail order #${o.orderNumber}`} onClick={() => setSelected(o)}>Detail<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button></div>
          </article>)}</div>
        </>}
    </section>

    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><SheetContent className="overflow-y-auto bg-white text-slate-900 sm:max-w-lg"><SheetHeader className="border-b border-slate-200 pb-4"><SheetTitle className="text-xl font-semibold tracking-tight">Detail delivery #{selected?.orderNumber}</SheetTitle><SheetDescription>Status pengiriman dari webhook</SheetDescription></SheetHeader>{selected ? <div className="space-y-5 p-4 text-sm">
      <section className="rounded-xl border border-slate-200 p-4"><h3 className="mb-3 flex items-center gap-2 font-semibold"><Package className="h-4 w-4 text-slate-400" aria-hidden="true" />Penerima</h3><dl className="space-y-3"><DetailField label="Customer" value={selected.deliveryContactName || selected.customerName || "-"} /><DetailField label="Telepon" value={selected.deliveryContactPhone || "-"} /><div className="whitespace-pre-wrap"><DetailField label="Alamat pengiriman" value={selected.deliveryAddress || "-"} /></div></dl></section>
      <section className="space-y-4 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4 text-slate-400" aria-hidden="true" />Pengiriman</h3><StatusBadge status={normalizeStatus(selected)} /></div><div className="overflow-x-auto pb-1"><div className="min-w-[420px]"><DeliveryTimeline status={normalizeStatus(selected)} /></div></div>
        {selected.shippingRateSnapshot?.feeSource === "fallback" && normalizeStatus(selected) === "ready_to_ship" ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Tarif ongkir menggunakan fallback. Atur kurir secara manual; pemesanan otomatis Biteship tidak tersedia untuk tarif ini.</p> : null}
        {actionError ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">{actionError}</p> : null}
        {normalizeStatus(selected) === "ready_to_ship" && ["paid", "completed"].includes(String(selected.status ?? "").toLowerCase()) && !selected.deliveryProviderOrderId && selected.shippingRateSnapshot?.feeSource === "biteship" ? <Button className="min-h-11 w-full gap-2 rounded-lg" disabled={Boolean(bookingId)} onClick={() => void bookShipment(selected)}><Truck className="h-4 w-4" aria-hidden="true" />{bookingId === selected._id ? "Membuat shipment…" : "Pesan kurir Biteship"}</Button> : null}
        <dl className="grid grid-cols-2 gap-4"><DetailField label="Kurir" value={courierLabel(selected)} /><DetailField label="Waybill" value={selected.deliveryWaybillId || "-"} /><DetailField label="Tracking" value={selected.deliveryTrackingId || "-"} /><DetailField label="Provider order" value={selected.deliveryProviderOrderId || "-"} /></dl>
      </section>
      <section className="rounded-xl border border-slate-200 p-4"><div className="mb-4 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4 text-slate-400" aria-hidden="true" />Pembayaran</h3><StatusBadge payment status={String(selected.status ?? "")} /></div><dl className="space-y-3"><DetailField label="Metode pembayaran" value={paymentLabel(selected.paymentMethod)} /><div className="flex justify-between gap-3 text-slate-500"><dt>Ongkir</dt><dd className="tabular-nums">{formatRupiah(selected.shippingFeeAmount)}</dd></div><div className="flex justify-between gap-3 border-t border-slate-100 pt-3 font-semibold"><dt>Total order</dt><dd className="tabular-nums">{formatRupiah(selected.totalAmount)}</dd></div></dl></section>
    </div> : null}</SheetContent></Sheet>
  </main>;
}
