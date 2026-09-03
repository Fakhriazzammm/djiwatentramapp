import { useMemo } from "react";
import { Check, Clock3, MapPin, PackageCheck, RefreshCw, Truck } from "lucide-react";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import { useHybridOrderById } from "@/hooks/use-hybrid-ops-data";
import { currency } from "./types";

const STATUS_STEPS = [
  { key: "pending_payment", label: "Menunggu pembayaran", description: "Pesanan menunggu pembayaran." },
  { key: "paid", label: "Diterima", description: "Pembayaran diterima dan order masuk ke tim operasional." },
  { key: "preparing", label: "Sedang dibuat", description: "Pesanan sedang disiapkan oleh tim produksi." },
  { key: "packing", label: "Dikemas", description: "Pesanan sedang dicek dan dikemas." },
  { key: "ready_to_ship", label: "Siap dikirim", description: "Pesanan siap diserahkan kepada kurir." },
  { key: "out_for_delivery", label: "Sedang dikirim", description: "Kurir sedang mengantar pesanan ke alamat tujuan." },
  { key: "delivered", label: "Selesai", description: "Pesanan sudah diterima." },
] as const;

function getTrackingStatus(order: any) {
  const paid = ["paid", "completed", "settled"].includes(String(order?.status ?? "").toLowerCase());
  const delivery = String(order?.deliveryStatus ?? order?.delivery_status ?? "").toLowerCase();
  return paid && (!delivery || delivery === "pending_payment") ? "paid" : delivery || (paid ? "paid" : "pending_payment");
}

function dateLabel(value: unknown) {
  if (!value) return "Belum ditentukan";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("id-ID", { dateStyle: "long" });
}

export function OrderTrackingView({ orderId }: { orderId: string }) {
  const order = useHybridOrderById(orderId) as any;
  const status = getTrackingStatus(order);
  const activeIndex = Math.max(0, STATUS_STEPS.findIndex((step) => step.key === status));
  const current = STATUS_STEPS[activeIndex] ?? STATUS_STEPS[0];
  const provider = String(order?.deliveryProvider ?? order?.delivery_provider ?? "");
  const providerLabel = provider === "gojek" ? "Gojek" : provider === "maxim" ? "Maxim" : provider || "Belum dipilih";
  const items = useMemo(() => Array.isArray(order?.items) ? order.items : [], [order?.items]);

  if (order === undefined) {
    return <main className="mx-auto max-w-md px-4 py-10 text-center"><RefreshCw className="mx-auto h-7 w-7 animate-spin text-primary" /><p className="mt-3 text-sm font-black">Memuat status pesanan…</p><p className="mt-1 text-xs text-muted-foreground">Menghubungkan ke sistem pesanan.</p></main>;
  }
  if (order === null) {
    return <main className="mx-auto max-w-md px-4 py-10 text-center"><PackageCheck className="mx-auto h-9 w-9 text-muted-foreground" /><h1 className="mt-3 text-lg font-black">Pesanan tidak ditemukan</h1><p className="mt-1 text-xs text-muted-foreground">Pastikan link tracking menggunakan ID order yang benar.</p></main>;
  }

  return (
    <main className="mx-auto max-w-md space-y-3 px-3 py-4 pb-28">
      <section className="overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#0b1740,#1a5dc6)] p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-100">Live tracking B2B</p><h1 className="mt-1 font-display text-2xl font-black">{current.label}</h1><p className="mt-1 text-xs leading-relaxed text-blue-100">{current.description}</p></div><Djiwa3DIcon name="navigation-tracking" size="sm" alt="" className="h-14 w-14 object-contain" /></div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#f4d27a] transition-all duration-500" style={{ width: `${Math.max(8, ((activeIndex + 1) / STATUS_STEPS.length) * 100)}%` }} /></div>
        <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-blue-100"><span>Status diperbarui otomatis</span><span>{activeIndex + 1}/{STATUS_STEPS.length}</span></div>
      </section>

      <section className="rounded-[24px] border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Tahapan pesanan</p><p className="mt-1 text-sm font-black">Order #{order.orderNumber ?? orderId.slice(-8)}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700">{String(order.status ?? "pending").toUpperCase()}</span></div><div className="mt-4 space-y-3">{STATUS_STEPS.map((step, index) => { const reached = index <= activeIndex; const active = index === activeIndex; return <div key={step.key} className="flex items-center gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${reached ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>{reached ? <Check className="h-4 w-4" /> : index === 0 ? <Clock3 className="h-4 w-4" /> : <span className="text-xs font-black">{index + 1}</span>}</span><div><p className={`text-sm font-black ${active ? "text-primary" : reached ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</p>{active ? <p className="text-[11px] text-muted-foreground">{step.description}</p> : null}</div></div>; })}</div></section>

      <section className="rounded-[24px] border border-border bg-card p-4 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Detail pengiriman</p><div className="mt-3 space-y-2 text-xs"><div className="flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="font-black">Kurir</p><p className="text-muted-foreground">{providerLabel}</p></div></div><div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="font-black">Jadwal dikirim</p><p className="text-muted-foreground">{dateLabel(order.deliveryDate ?? order.delivery_date)}</p></div></div><div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="font-black">Alamat</p><p className="text-muted-foreground">{order.deliveryAddress ?? order.delivery_address ?? "Belum tersedia"}</p></div></div></div></section>

      <section className="rounded-[24px] border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Ringkasan order</p><p className="text-sm font-black text-primary">{currency(Number(order.totalAmount ?? order.total_amount ?? 0))}</p></div><p className="mt-2 text-xs font-bold">{order.customerName ?? order.customer_name ?? "Customer"}</p><div className="mt-2 space-y-1">{items.map((item: any, index: number) => <div key={`${item.productId ?? item.productName}-${index}`} className="flex justify-between gap-3 text-[11px]"><span>{item.quantity}× {item.productName ?? item.name}</span><span className="font-bold">{currency(Number(item.price ?? 0) * Number(item.quantity ?? 0))}</span></div>)}</div></section>
    </main>
  );
}
