import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Clock3, MapPin, Package, Truck } from "lucide-react";
import { useHybridCreateOrder, useHybridMayarCreateInvoice } from "@/hooks/use-hybrid-write-actions";
import { useHybridOrderById } from "@/hooks/use-hybrid-ops-data";

export const Route = createLazyFileRoute("/")({ component: OrderMieYaminPage });

const NOODLE_PRICE = 10_000;
const READY_PACK_PRICE = 5_000;
const REPACK_FEE_PER_100G = 2_000;
const BUSINESS_UNIT = "ordermieyamin";
const BRAND_SLUG = "mie-yamin";

const STATUS_STEPS = [
  ["pending_payment", "Menunggu pembayaran", "Order menunggu pembayaran."],
  ["paid", "Pembayaran diterima", "Pembayaran sudah terverifikasi."],
  ["preparing", "Sedang dibuat", "Mie yamin sedang diproduksi."],
  ["packing", "Sedang dipacking", "Pesanan sedang dikemas."],
  ["ready_to_ship", "Siap dikirim", "Pesanan siap diserahkan ke pengiriman."],
  ["out_for_delivery", "Sedang dikirim", "Pesanan sedang menuju alamat tujuan."],
  ["delivered", "Selesai", "Pesanan sudah diterima."],
] as const;

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function Tracking({ orderId }: { orderId: string }) {
  const order = useHybridOrderById(orderId) as any;
  const status = String(order?.deliveryStatus || (order?.status === "pending" ? "pending_payment" : "paid"));
  const activeIndex = Math.max(0, STATUS_STEPS.findIndex(([key]) => key === status));
  const current = STATUS_STEPS[activeIndex] || STATUS_STEPS[0];

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Live order tracking</p>
        <h1 className="mt-2 text-2xl font-black">Order Mie Yamin</h1>
        <p className="mt-1 text-xs text-muted-foreground">#{order?.orderNumber || orderId.slice(-8)}</p>
        <div className="mt-5 rounded-2xl bg-primary/10 p-4">
          <p className="text-sm font-black text-primary">{current[1]}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{current[2]}</p>
        </div>
        <div className="mt-6 space-y-4">
          {STATUS_STEPS.map(([key, label]) => {
            const index = STATUS_STEPS.findIndex(([step]) => step === key);
            const done = index <= activeIndex;
            return (
              <div className="flex items-center gap-3" key={key}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                  {done ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                </div>
                <p className={`text-sm font-bold ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</p>
              </div>
            );
          })}
        </div>
        {order?.deliveryDate ? <p className="mt-6 text-xs text-muted-foreground">Tanggal pengiriman: <b>{new Date(order.deliveryDate).toLocaleDateString("id-ID")}</b></p> : null}
      </div>
    </main>
  );
}

function OrderForm() {
  const navigate = useNavigate();
  const createOrder = useHybridCreateOrder();
  const createInvoice = useHybridMayarCreateInvoice();
  const [kg, setKg] = useState(1);
  const [readyPackCount, setReadyPackCount] = useState(0);
  const [repack, setRepack] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const repackCount = repack ? kg * 10 : 0;
  const noodleTotal = kg * NOODLE_PRICE;
  const readyPackTotal = readyPackCount * READY_PACK_PRICE;
  const repackTotal = repackCount * REPACK_FEE_PER_100G;
  const total = noodleTotal + readyPackTotal + repackTotal;
  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function submit() {
    if (!deliveryDate || !name.trim() || !phone.trim() || !address.trim()) {
      setError("Lengkapi tanggal pengiriman, nama, WhatsApp, dan alamat.");
      return;
    }
    setSubmitting(true); setError("");
    try {
      const orderId = await createOrder({
        items: [
          { productName: "Mie Yamin Mentah", variant: `${kg} kg`, quantity: kg, price: NOODLE_PRICE, originalPrice: NOODLE_PRICE },
          ...(readyPackCount > 0 ? [{ productName: "Kemasan siap masak", variant: `${readyPackCount} pcs`, quantity: readyPackCount, price: READY_PACK_PRICE, originalPrice: READY_PACK_PRICE }] : []),
          ...(repack ? [{ productName: "Jasa repack 100 gram", variant: `${repackCount} pcs`, quantity: repackCount, price: REPACK_FEE_PER_100G, originalPrice: REPACK_FEE_PER_100G }] : []),
        ],
        totalAmount: total,
        paymentMethod: "djiwaapp",
        customerName: name.trim(),
        source: "ordermieyamin_b2b",
        sourceApp: BUSINESS_UNIT,
        businessUnit: BUSINESS_UNIT,
        brandSlug: BRAND_SLUG,
        orderType: "delivery",
        deliveryDate: new Date(`${deliveryDate}T12:00:00+07:00`).toISOString(),
        deliveryStatus: "pending_payment",
        deliveryContactName: name.trim(),
        deliveryContactPhone: phone.trim(),
        deliveryAddress: address.trim(),
        deliveryNotes: notes.trim() || null,
        notes: notes.trim() || null,
        paymentReceiptKind: "gateway_pending",
        isOpenBill: true,
      });
      const redirectUrl = `${window.location.origin}/?stage=tracking&orderId=${encodeURIComponent(String(orderId))}`;
      const invoice = await createInvoice({
        name: name.trim(), mobile: phone.trim(), redirectUrl,
        description: `Order Mie Yamin B2B ${kg} kg${repack ? " + repack 100 gram" : ""}`,
        expiredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        extraData: { orderId: String(orderId), brandSlug: BRAND_SLUG, businessUnit: BUSINESS_UNIT },
        items: [
          { quantity: kg, rate: NOODLE_PRICE, description: `Mie Yamin Mentah ${kg} kg` },
          ...(readyPackCount > 0 ? [{ quantity: readyPackCount, rate: READY_PACK_PRICE, description: `Kemasan siap masak ${readyPackCount} pcs` }] : []),
          ...(repack ? [{ quantity: repackCount, rate: REPACK_FEE_PER_100G, description: `Jasa repack 100 gram ${repackCount} pcs` }] : []),
        ],
      });
      if (!invoice?.data?.link) throw new Error("Invoice pembayaran belum tersedia.");
      window.location.assign(invoice.data.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout gagal. Coba lagi.");
    } finally { setSubmitting(false); }
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-5">
      <div className="mb-5"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Djiwa Tentram B2B</p><h1 className="mt-1 text-3xl font-black">Mie Yamin Mentah</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Produksi sendiri tanpa bahan pengawet. Tahan 1–3 hari di suhu ruang, atau 3–7 hari di dalam pendingin/kulkas.</p></div>
      <div className="space-y-4 rounded-[28px] border border-border bg-card p-5 shadow-sm">
        <label className="block text-sm font-bold">Jumlah mie (kg)<input min={1} type="number" value={kg} onChange={(e) => setKg(Math.max(1, Number(e.target.value) || 1))} className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-4 text-base" /></label>
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-2xl border border-border p-4"><span className="pt-1 text-primary">＋</span><span className="flex-1"><b className="block text-sm">Kemasan siap masak</b><span className="text-xs text-muted-foreground">Rp5.000 per pcs</span><input min={0} type="number" value={readyPackCount} onChange={(e) => setReadyPackCount(Math.max(0, Number(e.target.value) || 0))} className="mt-3 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" placeholder="Jumlah pcs" /></span></label>
          <label className="flex items-start gap-3 rounded-2xl border border-border p-4"><input checked={repack} onChange={(e) => setRepack(e.target.checked)} type="checkbox" className="mt-1 h-4 w-4 accent-primary" /><span><b className="block text-sm">Repack dari mie kiloan</b><span className="text-xs leading-relaxed text-muted-foreground">Tambahan Rp2.000 per 100 gram. {kg} kg = {kg * 10} pcs, biaya repack {formatRupiah(kg * 10 * REPACK_FEE_PER_100G)}.</span></span></label>
        </div>
        <label className="block text-sm font-bold">Tanggal pengiriman<input min={minDate} type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-4 text-base" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Nama penerima<input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-3 text-sm" /></label><label className="text-sm font-bold">WhatsApp<input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-3 text-sm" /></label></div>
        <label className="block text-sm font-bold">Alamat lengkap<textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-border bg-background p-3 text-sm" /></label>
        <label className="block text-sm font-bold">Catatan pengiriman <span className="font-normal text-muted-foreground">(opsional)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-2 w-full rounded-2xl border border-border bg-background p-3 text-sm" /></label>
        <div className="rounded-2xl bg-muted/50 p-4 text-sm"><div className="flex justify-between"><span>Mie yamin ({kg} kg)</span><b>{formatRupiah(noodleTotal)}</b></div>{readyPackCount > 0 ? <div className="mt-2 flex justify-between"><span>Kemasan siap masak ({readyPackCount} pcs)</span><b>{formatRupiah(readyPackTotal)}</b></div> : null}{repack ? <div className="mt-2 flex justify-between"><span>Jasa repack ({repackCount} pcs)</span><b>{formatRupiah(repackTotal)}</b></div> : null}<div className="mt-3 flex justify-between border-t border-border pt-3 text-base"><b>Total</b><b className="text-primary">{formatRupiah(total)}</b></div></div>
        {error ? <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p> : null}
        <button disabled={submitting} onClick={submit} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-white disabled:opacity-50">{submitting ? "Menyiapkan pembayaran..." : <>Lanjut ke pembayaran <ChevronRight className="h-4 w-4" /></>}</button>
      </div>
      <p className="mt-5 text-center text-xs text-muted-foreground">Pembayaran aman via Mayar. Setelah pembayaran, status order akan diperbarui secara live.</p>
    </main>
  );
}

function OrderMieYaminPage() {
  const search = Route.useSearch();
  const orderId = search.orderId;
  return <div className="min-h-app bg-background font-sans text-foreground"><header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl"><div className="mx-auto flex max-w-md items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white"><Package className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Djiwa Tentram</p><p className="text-sm font-black">Order Mie Yamin B2B</p></div><Truck className="ml-auto h-5 w-5 text-primary" /></div></header>{search.stage === "tracking" && orderId ? <Tracking orderId={orderId} /> : <OrderForm />}</div>;
}
