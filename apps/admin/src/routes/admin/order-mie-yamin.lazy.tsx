import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bike, Bell, Check, ChevronDown, Copy, ExternalLink, FileDown, Mail, PackageCheck, RefreshCw, Save, Search, Settings2, ShoppingBag, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHybridOrders, triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { useHybridUpdateMieYaminDeliveryStatus, useHybridUpdateSiteSettings } from "@/hooks/use-hybrid-write-actions";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createLazyFileRoute("/admin/order-mie-yamin")({
  component: AdminMieYamin,
});

type MieYaminSettings = {
  noodlePricePerKg: number;
  readyPackPrice: number;
  repackFeePer100g: number;
  deliveryArea: string;
  freeShippingPromo: boolean;
  enabledProviders: string[];
  paymentReceiptEmailEnabled: boolean;
  adminNotificationEnabled: boolean;
  adminNotificationNote: string;
  minimumOrderKg: number;
  orderCutoffHour: number;
  maxOrdersPerDate: number;
  shippingFee: number;
  supportWhatsapp: string;
  productImageUrl: string;
  storageInstructions: string;
};

const DEFAULTS: MieYaminSettings = {
  noodlePricePerKg: 10_000,
  readyPackPrice: 5_000,
  repackFeePer100g: 2_000,
  deliveryArea: "Tasikmalaya",
  freeShippingPromo: true,
  enabledProviders: ["gojek", "maxim"],
  paymentReceiptEmailEnabled: true,
  adminNotificationEnabled: true,
  adminNotificationNote: "Order Mie Yamin baru perlu diproses setelah pembayaran terverifikasi.",
  minimumOrderKg: 1,
  orderCutoffHour: 15,
  maxOrdersPerDate: 20,
  shippingFee: 0,
  supportWhatsapp: "",
  productImageUrl: "/logo-djiwa.png",
  storageInstructions: "",
};

function money(value: number) {
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}

const MIE_YAMIN_DELIVERY_STATUSES = [
  ["pending_payment", "Menunggu pembayaran"], ["paid", "Pembayaran diterima"], ["preparing", "Sedang dibuat"],
  ["packing", "Sedang dipacking"], ["ready_to_ship", "Siap dikirim"], ["out_for_delivery", "Sedang dikirim"],
  ["delivered", "Selesai"], ["failed", "Gagal"], ["cancelled", "Dibatalkan"],
] as const;
type MieYaminDeliveryStatus = typeof MIE_YAMIN_DELIVERY_STATUSES[number][0];

function deliveryLabel(value: string | null | undefined) {
  return MIE_YAMIN_DELIVERY_STATUSES.find(([status]) => status === value)?.[1] ?? "Belum diatur";
}

function statusClass(value: string | null | undefined) {
  if (["delivered", "paid"].includes(String(value))) return "bg-emerald-100 text-emerald-700";
  if (["pending_payment", "ready_to_ship"].includes(String(value))) return "bg-amber-100 text-amber-800";
  if (["failed", "cancelled"].includes(String(value))) return "bg-red-100 text-red-700";
  return "bg-blue-100 text-blue-700";
}

function orderDate(value: unknown) {
  const raw = String(value ?? "");
  const date = typeof value === "number" || /^\d+$/.test(raw) ? new Date(Number(value)) : new Date(raw);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function orderTime(value: unknown) {
  const raw = String(value ?? "");
  const date = typeof value === "number" || /^\d+$/.test(raw) ? new Date(Number(value)) : new Date(raw);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function orderTotal(value: unknown) {
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}

function AdminMieYaminOrders() {
  const allOrders = useHybridOrders() as any[] | undefined;
  const updateDeliveryStatus = useHybridUpdateMieYaminDeliveryStatus();
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const orders = useMemo(() => (allOrders ?? []).filter((order) => String(order.businessUnit ?? order.business_unit ?? "").toLowerCase() === "ordermieyamin"), [allOrders]);
  const filteredOrders = useMemo(() => {
    const now = Date.now();
    const start = dateFilter === "today" ? new Date().setHours(0, 0, 0, 0) : dateFilter === "7days" ? now - 7 * 86_400_000 : 0;
    return [...orders].filter((order) => {
      const payment = String(order.status ?? "pending");
      const delivery = String(order.deliveryStatus ?? order.delivery_status ?? "");
      const text = [order.orderNumber, order.customerName, order.customerPhone, order.deliveryContactPhone, order.deliveryAddress].join(" ").toLowerCase();
      return (!query || text.includes(query.toLowerCase())) && (paymentFilter === "all" || payment === paymentFilter) && (deliveryFilter === "all" || delivery === deliveryFilter) && (!start || Number(order.createdAt) >= start);
    }).sort((a, b) => sort === "total" ? Number(b.totalAmount || 0) - Number(a.totalAmount || 0) : Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }, [dateFilter, deliveryFilter, orders, paymentFilter, query, sort]);
  const counts = useMemo(() => ({ total: orders.length, pending: orders.filter((o) => String(o.status) === "pending").length, processing: orders.filter((o) => ["paid", "preparing", "packing"].includes(String(o.deliveryStatus ?? o.delivery_status))).length, ready: orders.filter((o) => String(o.deliveryStatus ?? o.delivery_status) === "ready_to_ship").length, delivered: orders.filter((o) => String(o.deliveryStatus ?? o.delivery_status) === "delivered").length }), [orders]);

  const refresh = () => { triggerHybridRefresh(); toast.success("Data order Mie Yamin diperbarui."); };
  const exportCsv = () => {
    const rows = [["Order", "Pelanggan", "Total", "Pembayaran", "Pengiriman", "Tanggal"], ...filteredOrders.map((o) => [o.orderNumber ?? o.displayId ?? "-", o.customerName ?? "-", orderTotal(o.totalAmount), o.status ?? "-", deliveryLabel(o.deliveryStatus ?? o.delivery_status), orderDate(o.createdAt)])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `order-mie-yamin-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const updateStatus = async (order: any, status: MieYaminDeliveryStatus) => {
    setUpdatingId(String(order._id));
    try { await updateDeliveryStatus({ id: String(order._id), deliveryStatus: status }); triggerHybridRefresh(); toast.success("Status pengiriman diperbarui."); setSelectedOrder((current: any) => current ? { ...current, deliveryStatus: status } : current); } catch (error) { console.error(error); toast.error("Status pengiriman gagal diperbarui."); } finally { setUpdatingId(null); }
  };
  const copy = async (value: string, label: string) => { await navigator.clipboard?.writeText(value); toast.success(`${label} disalin.`); };

  if (allOrders === undefined) return <div className="grid gap-3 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>;
  return <section className="space-y-3">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5"><button onClick={() => { setDeliveryFilter("all"); setPaymentFilter("all"); }} className="rounded-2xl border border-border bg-card p-3 text-left shadow-sm"><p className="text-[11px] text-muted-foreground">Total order</p><p className="mt-1 text-xl font-black">{counts.total}</p></button><button onClick={() => setPaymentFilter("pending")} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left"><p className="text-[11px] text-amber-700">Menunggu bayar</p><p className="mt-1 text-xl font-black text-amber-800">{counts.pending}</p></button><button onClick={() => setDeliveryFilter("preparing")} className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-left"><p className="text-[11px] text-blue-700">Perlu diproses</p><p className="mt-1 text-xl font-black text-blue-800">{counts.processing}</p></button><button onClick={() => setDeliveryFilter("ready_to_ship")} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left"><p className="text-[11px] text-amber-700">Siap dikirim</p><p className="mt-1 text-xl font-black text-amber-800">{counts.ready}</p></button><button onClick={() => setDeliveryFilter("delivered")} className="col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-left md:col-span-1"><p className="text-[11px] text-emerald-700">Selesai</p><p className="mt-1 text-xl font-black text-emerald-800">{counts.delivered}</p></button></div>
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm"><div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_180px_140px_auto_auto]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari order, nama, WhatsApp..." className="h-11 pl-9" /></div><select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="all">Pembayaran: Semua</option><option value="pending">Menunggu bayar</option><option value="paid">Dibayar</option><option value="completed">Selesai</option><option value="cancelled">Dibatalkan</option></select><select value={deliveryFilter} onChange={(e) => setDeliveryFilter(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="all">Pengiriman: Semua</option>{MIE_YAMIN_DELIVERY_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="all">Semua tanggal</option><option value="today">Hari ini</option><option value="7days">7 hari</option></select><select value={sort} onChange={(e) => setSort(e.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="newest">Terbaru</option><option value="total">Total terbesar</option></select><Button variant="outline" onClick={refresh} className="h-11 gap-2"><RefreshCw className="h-4 w-4" />Refresh</Button><Button variant="outline" onClick={exportCsv} className="h-11 gap-2"><FileDown className="h-4 w-4" />Export</Button></div><p className="mt-2 text-xs text-muted-foreground">Menampilkan {filteredOrders.length} dari {orders.length} order</p></div>
    <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-sm md:block"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-muted/70 text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Order</th><th className="px-3 py-3">Pelanggan</th><th className="px-3 py-3">Item</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Pembayaran</th><th className="px-3 py-3">Pengiriman</th><th className="px-3 py-3">Jadwal/order</th><th className="px-3 py-3 text-right">Aksi</th></tr></thead><tbody className="divide-y divide-border">{filteredOrders.map((order) => { const delivery = String(order.deliveryStatus ?? order.delivery_status ?? ""); return <tr key={order._id} className="group hover:bg-muted/30"><td className="px-3 py-3 align-top"><button onClick={() => setSelectedOrder(order)} className="text-left font-black text-primary hover:underline">#{order.orderNumber ?? order.displayId ?? "-"}</button><p className="mt-1 text-[11px] text-muted-foreground">{orderDate(order.createdAt)} {orderTime(order.createdAt)}</p></td><td className="px-3 py-3 align-top"><p className="font-bold">{order.customerName ?? "-"}</p><p className="mt-1 text-[11px] text-muted-foreground">{order.deliveryContactPhone ?? order.customerPhone ?? "-"}</p></td><td className="px-3 py-3 align-top">{(order.items ?? []).map((item: any) => <p key={`${item.productName}-${item.variant}`} className="font-medium">{item.quantity}× {item.productName}</p>)}</td><td className="px-3 py-3 align-top font-black">{orderTotal(order.totalAmount)}</td><td className="px-3 py-3 align-top"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusClass(order.status)}`}>{order.status === "pending" ? "Menunggu bayar" : order.status === "paid" ? "Dibayar" : order.status === "completed" ? "Selesai" : "Dibatalkan"}</span></td><td className="px-3 py-3 align-top"><select disabled={updatingId === String(order._id)} value={delivery} onChange={(e) => updateStatus(order, e.target.value as MieYaminDeliveryStatus)} className={`h-9 rounded-xl border-0 px-2 text-[11px] font-bold ${statusClass(delivery)}`}><option value="">Belum diatur</option>{MIE_YAMIN_DELIVERY_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td className="px-3 py-3 align-top"><p className="font-medium">{order.deliveryDate ? orderDate(order.deliveryDate) : "-"}</p><p className="mt-1 text-[11px] text-muted-foreground">Order {orderDate(order.createdAt)}</p></td><td className="px-3 py-3 text-right align-top"><Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}>Detail</Button></td></tr>; })}</tbody></table>{filteredOrders.length === 0 ? <div className="p-12 text-center"><PackageCheck className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-bold">Belum ada order yang cocok</p><p className="mt-1 text-xs text-muted-foreground">Coba ubah filter atau kata pencarian.</p></div> : null}</div>
    <div className="space-y-2 md:hidden">{filteredOrders.map((order) => { const delivery = String(order.deliveryStatus ?? order.delivery_status ?? ""); return <article key={order._id} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><button onClick={() => setSelectedOrder(order)} className="font-black text-primary">#{order.orderNumber ?? order.displayId ?? "-"}</button><p className="mt-1 text-sm font-bold">{order.customerName ?? "-"}</p><p className="text-xs text-muted-foreground">{order.deliveryContactPhone ?? order.customerPhone ?? "-"}</p></div><p className="font-black">{orderTotal(order.totalAmount)}</p></div><div className="mt-3 flex flex-wrap gap-1.5"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusClass(order.status)}`}>{order.status === "paid" || order.status === "completed" ? "Dibayar" : "Menunggu bayar"}</span><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusClass(delivery)}`}>{deliveryLabel(delivery)}</span></div><div className="mt-3 flex items-center justify-between gap-2"><select disabled={updatingId === String(order._id)} value={delivery} onChange={(e) => updateStatus(order, e.target.value as MieYaminDeliveryStatus)} className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-xs font-bold"><option value="">Update pengiriman</option>{MIE_YAMIN_DELIVERY_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button variant="outline" onClick={() => setSelectedOrder(order)} className="h-11">Detail</Button></div></article>; })}</div>
    <Sheet open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedOrder(null)}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Detail Order Mie Yamin</SheetTitle><SheetDescription>{selectedOrder ? `#${selectedOrder.orderNumber ?? selectedOrder.displayId ?? "-"}` : ""}</SheetDescription></SheetHeader>{selectedOrder ? <div className="space-y-4 p-4"><div className="rounded-2xl bg-muted/50 p-4"><p className="text-lg font-black">{selectedOrder.customerName ?? "-"}</p><p className="mt-1 text-sm text-muted-foreground">{selectedOrder.deliveryContactPhone ?? selectedOrder.customerPhone ?? "-"}</p><p className="mt-3 text-xl font-black text-primary">{orderTotal(selectedOrder.totalAmount)}</p></div><div className="grid gap-3 sm:grid-cols-2"><div><p className="text-[11px] font-bold uppercase text-muted-foreground">Pembayaran</p><p className="mt-1 font-bold">{selectedOrder.status === "paid" || selectedOrder.status === "completed" ? "Pembayaran diterima" : "Menunggu pembayaran"}</p></div><div><p className="text-[11px] font-bold uppercase text-muted-foreground">Pengiriman</p><select disabled={updatingId === String(selectedOrder._id)} value={String(selectedOrder.deliveryStatus ?? selectedOrder.delivery_status ?? "")} onChange={(e) => updateStatus(selectedOrder, e.target.value as MieYaminDeliveryStatus)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-bold">{MIE_YAMIN_DELIVERY_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div><div><p className="text-[11px] font-bold uppercase text-muted-foreground">Produk</p><div className="mt-2 space-y-2">{(selectedOrder.items ?? []).map((item: any) => <div key={`${item.productName}-${item.variant}`} className="flex justify-between gap-3 rounded-xl border border-border p-3 text-sm"><span>{item.quantity}× {item.productName}<span className="block text-xs text-muted-foreground">{item.variant ?? ""}</span></span><b>{orderTotal(Number(item.price || 0) * Number(item.quantity || 0))}</b></div>)}</div></div><div className="space-y-3 rounded-2xl border border-border p-4 text-sm"><div><p className="text-[11px] font-bold uppercase text-muted-foreground">Jadwal kirim</p><p className="mt-1">{selectedOrder.deliveryDate ? orderDate(selectedOrder.deliveryDate) : "Belum dipilih"} · {selectedOrder.deliveryProvider ?? "Kurir belum dipilih"}</p></div><div><p className="text-[11px] font-bold uppercase text-muted-foreground">Alamat</p><p className="mt-1 whitespace-pre-wrap">{selectedOrder.deliveryAddress ?? "-"}</p></div>{selectedOrder.deliveryNotes ? <div><p className="text-[11px] font-bold uppercase text-muted-foreground">Catatan</p><p className="mt-1 whitespace-pre-wrap">{selectedOrder.deliveryNotes}</p></div> : null}</div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => copy(String(selectedOrder.orderNumber ?? selectedOrder.displayId ?? ""), "Nomor order")} className="h-11 gap-2"><Copy className="h-4 w-4" />Copy order</Button><Button variant="outline" onClick={() => copy(String(selectedOrder.deliveryContactPhone ?? selectedOrder.customerPhone ?? ""), "Nomor WhatsApp")} className="h-11 gap-2"><Copy className="h-4 w-4" />Copy WhatsApp</Button>{selectedOrder.paymentGateway?.invoiceUrl || selectedOrder.payment_gateway?.invoice_url ? <a href={selectedOrder.paymentGateway?.invoiceUrl || selectedOrder.payment_gateway?.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold transition hover:bg-muted"><ExternalLink className="h-4 w-4" />Buka invoice</a> : null}{(selectedOrder.deliveryContactPhone || selectedOrder.customerPhone) ? <a href={`https://wa.me/${String(selectedOrder.deliveryContactPhone ?? selectedOrder.customerPhone).replace(/\D/g, "").replace(/^0/, "62")}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50"><ExternalLink className="h-4 w-4" />Chat WhatsApp</a> : null}</div></div> : null}</SheetContent></Sheet>
  </section>;
}

function AdminMieYamin() {
  const siteSettings = useHybridSiteSettings() as any;
  const updateSiteSettings = useHybridUpdateSiteSettings();
  const [activeTab, setActiveTab] = useState<"orders" | "pricing" | "delivery" | "notifications">("orders");
  const [form, setForm] = useState<MieYaminSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (siteSettings?.mieYaminSettings) {
      setForm({ ...DEFAULTS, ...siteSettings.mieYaminSettings });
    }
  }, [siteSettings?.mieYaminSettings]);

  const update = <K extends keyof MieYaminSettings>(key: K, value: MieYaminSettings[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleProvider = (provider: string) => {
    const providers = form.enabledProviders.includes(provider)
      ? form.enabledProviders.filter((item) => item !== provider)
      : [...form.enabledProviders, provider];
    update("enabledProviders", providers);
  };

  const save = async () => {
    if (!form.deliveryArea.trim()) {
      toast.error("Area pengiriman wajib diisi.");
      return;
    }
    if (form.enabledProviders.length === 0) {
      toast.error("Pilih minimal satu provider pengiriman.");
      return;
    }
    setSaving(true);
    try {
      await updateSiteSettings({ mieYaminSettings: { ...form, deliveryArea: form.deliveryArea.trim() } });
      toast.success("Pengaturan Order Mie Yamin tersimpan.");
    } catch (error) {
      console.error(error);
      toast.error("Pengaturan gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const tabs = useMemo(() => [
    { id: "orders" as const, label: "Pesanan", icon: ShoppingBag },
    { id: "pricing" as const, label: "Pengaturan Harga", icon: Settings2 },
    { id: "delivery" as const, label: "Pengiriman", icon: Truck },
    { id: "notifications" as const, label: "Notifikasi", icon: Bell },
  ], []);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border transition hover:bg-muted" aria-label="Kembali ke dashboard admin">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Business control</p>
            <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">Order Mie Yamin</h1>
            <p className="text-xs text-muted-foreground">Kontrol order, harga, pengiriman, dan notifikasi dari satu tempat.</p>
          </div>
        </div>
        {activeTab !== "orders" ? <Button disabled={saving} onClick={save} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "Menyimpan..." : "Simpan pengaturan"}
        </Button> : <div className="flex items-center gap-2 text-xs text-muted-foreground"><PackageCheck className="h-4 w-4 text-emerald-600" /> Workspace operasional</div>}
      </div>

      <div className="grid gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm md:grid-cols-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${activeTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {activeTab === "orders" ? <AdminMieYaminOrders /> : null}

      {activeTab === "pricing" ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-bold">Pengaturan Harga</h2>
          <p className="mt-1 text-xs text-muted-foreground">Nilai ini digunakan Order Mie Yamin dan invoice Mayar berikutnya.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="text-sm font-bold">Mie yamin per kg<Input className="mt-2" type="number" min={0} value={form.noodlePricePerKg} onChange={(e) => update("noodlePricePerKg", Number(e.target.value) || 0)} /></label>
            <label className="text-sm font-bold">Kemasan per pcs<Input className="mt-2" type="number" min={0} value={form.readyPackPrice} onChange={(e) => update("readyPackPrice", Number(e.target.value) || 0)} /></label>
            <label className="text-sm font-bold">Repack per 100 gram<Input className="mt-2" type="number" min={0} value={form.repackFeePer100g} onChange={(e) => update("repackFeePer100g", Number(e.target.value) || 0)} /></label>
            <label className="text-sm font-bold">Minimum order (kg)<Input className="mt-2" type="number" min={0.1} step={0.1} value={form.minimumOrderKg} onChange={(e) => update("minimumOrderKg", Math.max(0.1, Number(e.target.value) || 0.1))} /></label>
            <label className="text-sm font-bold">Maksimal order per tanggal<Input className="mt-2" type="number" min={1} value={form.maxOrdersPerDate} onChange={(e) => update("maxOrdersPerDate", Math.max(1, Number(e.target.value) || 1))} /></label>
          </div>
        </section>
      ) : null}

      {activeTab === "delivery" ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-bold">Pengaturan Pengiriman</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">Area layanan<Input className="mt-2" value={form.deliveryArea} onChange={(e) => update("deliveryArea", e.target.value)} /></label>
            <label className="text-sm font-bold">Batas pemesanan hari ini (jam 0–23)<Input className="mt-2" type="number" min={0} max={23} value={form.orderCutoffHour} onChange={(e) => update("orderCutoffHour", Math.min(23, Math.max(0, Number(e.target.value) || 0)))} /></label>
            <label className="text-sm font-bold">Biaya ongkir default<Input className="mt-2" type="number" min={0} value={form.shippingFee} onChange={(e) => update("shippingFee", Math.max(0, Number(e.target.value) || 0))} /></label>
            <div><p className="text-sm font-bold">Provider aktif</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => toggleProvider("gojek")} className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${form.enabledProviders.includes("gojek") ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}><Bike className="h-4 w-4" /> Gojek {form.enabledProviders.includes("gojek") ? <Check className="h-4 w-4" /> : null}</button><button type="button" onClick={() => toggleProvider("maxim")} className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${form.enabledProviders.includes("maxim") ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}><Truck className="h-4 w-4" /> Maxim {form.enabledProviders.includes("maxim") ? <Check className="h-4 w-4" /> : null}</button></div></div>
          </div>
          <button type="button" onClick={() => update("freeShippingPromo", !form.freeShippingPromo)} className={`mt-5 flex w-full items-center justify-between rounded-xl border p-3 text-left ${form.freeShippingPromo ? "border-emerald-300 bg-emerald-50" : "border-border"}`}><span><b className="block text-sm">Promo ongkir gratis</b><span className="text-xs text-muted-foreground">Tampilkan promo ongkir gratis di checkout.</span></span><span className={`h-5 w-9 rounded-full p-0.5 ${form.freeShippingPromo ? "bg-emerald-500" : "bg-muted"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${form.freeShippingPromo ? "translate-x-4" : ""}`} /></span></button>
        </section>
      ) : null}

      {activeTab === "notifications" ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-bold">Pengaturan Notifikasi</h2>
          <div className="mt-5 space-y-3">
            <button type="button" onClick={() => update("paymentReceiptEmailEnabled", !form.paymentReceiptEmailEnabled)} className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left"><span className="flex items-center gap-3"><Mail className="h-4 w-4 text-primary" /><span><b className="block text-sm">Email bukti pembayaran</b><span className="text-xs text-muted-foreground">Kirim email pelanggan jika alamat email diisi.</span></span></span><span className={`h-5 w-9 rounded-full p-0.5 ${form.paymentReceiptEmailEnabled ? "bg-primary" : "bg-muted"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${form.paymentReceiptEmailEnabled ? "translate-x-4" : ""}`} /></span></button>
            <button type="button" onClick={() => update("adminNotificationEnabled", !form.adminNotificationEnabled)} className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left"><span className="flex items-center gap-3"><Bell className="h-4 w-4 text-primary" /><span><b className="block text-sm">Notifikasi admin</b><span className="text-xs text-muted-foreground">Aktifkan penanda order Mie Yamin baru untuk operasional.</span></span></span><span className={`h-5 w-9 rounded-full p-0.5 ${form.adminNotificationEnabled ? "bg-primary" : "bg-muted"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${form.adminNotificationEnabled ? "translate-x-4" : ""}`} /></span></button>
            <label className="block text-sm font-bold">Catatan operasional<textarea value={form.adminNotificationNote} onChange={(e) => update("adminNotificationNote", e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
            <label className="block text-sm font-bold">Nomor WhatsApp support<Input value={form.supportWhatsapp} onChange={(e) => update("supportWhatsapp", e.target.value)} placeholder="628123456789" className="mt-2" /></label>
            <label className="block text-sm font-bold">URL foto produk<Input value={form.productImageUrl} onChange={(e) => update("productImageUrl", e.target.value)} placeholder="/logo-djiwa.png atau URL gambar" className="mt-2" /></label>
            <label className="block text-sm font-bold">Petunjuk penyimpanan<textarea value={form.storageInstructions} onChange={(e) => update("storageInstructions", e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" /></label>
          </div>
        </section>
      ) : null}
    </div>
  );
}
