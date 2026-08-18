import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ClipboardList, Package, Plus, Truck } from "lucide-react";
import { useHybridCreateOrder, useHybridMayarCreateInvoice, useHybridMayarGetInvoiceDetail, useHybridUpdateOrderPaymentGateway } from "@/hooks/use-hybrid-write-actions";
import { useHybridDeliveryOrderCounts, useHybridOrderById } from "@/hooks/use-hybrid-ops-data";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";

export const Route = createLazyFileRoute("/")({ component: OrderMieYaminPage });

const DEFAULT_MIE_YAMIN_SETTINGS = {
  noodlePricePerKg: 10_000,
  readyPackPrice: 5_000,
  repackFeePer100g: 2_000,
  deliveryArea: "Tasikmalaya",
  freeShippingPromo: true,
  enabledProviders: ["gojek", "maxim"],
  minimumOrderKg: 1,
  orderCutoffHour: 15,
  maxOrdersPerDate: 20,
  shippingFee: 0,
};
const BUSINESS_UNIT = "ordermieyamin";
const BRAND_SLUG = "mie-yamin";
const NORMAL_NOODLE_PRICE_PER_KG = 30_000;
const PROMO_END_AT = new Date("2026-08-20T23:59:59+07:00").getTime();
const SAVED_ORDERS_KEY = "ordermieyamin:saved-orders";
const DRAFT_ORDER_KEY = "ordermieyamin:checkout-draft";
const PENDING_PAYMENT_KEY = "ordermieyamin:pending-payment";

type PendingPaymentReference = { orderId: string; invoiceId: string; link: string; expiresAt: number };
type SavedOrderReference = { orderId: string; createdAt: number };

function readSavedOrders(): SavedOrderReference[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_ORDERS_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SavedOrderReference => Boolean(item?.orderId)).slice(0, 20);
  } catch {
    return [];
  }
}

function rememberOrder(orderId: string) {
  if (typeof window === "undefined" || !orderId) return;
  const next = [{ orderId, createdAt: Date.now() }, ...readSavedOrders().filter((item) => item.orderId !== orderId)].slice(0, 20);
  window.localStorage.setItem(SAVED_ORDERS_KEY, JSON.stringify(next));
}

function readPendingPayment(): PendingPaymentReference | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(PENDING_PAYMENT_KEY) || "null");
    if (!value?.orderId || !value?.invoiceId || !value?.link) return null;
    return value as PendingPaymentReference;
  } catch {
    return null;
  }
}

function savePendingPayment(value: PendingPaymentReference) {
  if (typeof window !== "undefined") window.localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(value));
}

function clearPendingPayment() {
  if (typeof window !== "undefined") window.localStorage.removeItem(PENDING_PAYMENT_KEY);
}

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

function getTrackingStatus(order: any) {
  const paymentSettled = order?.status === "paid" || order?.status === "completed";
  const deliveryStatus = String(order?.deliveryStatus || "");
  return paymentSettled && (!deliveryStatus || deliveryStatus === "pending_payment")
    ? "paid"
    : deliveryStatus || (paymentSettled ? "paid" : "pending_payment");
}

function getWibDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getWibHour(value = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(value));
}

function getNextAvailableDate(cutoffHour: number) {
  const now = new Date();
  if (getWibHour(now) < cutoffHour) return getWibDateKey(now);
  return getWibDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

function formatPhoneForWhatsApp(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

function getMonthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function CalendarDatePicker({ value, onChange, minDate, maxOrdersPerDate }: { value: string; onChange: (date: string) => void; minDate: string; maxOrdersPerDate: number }) {
  const today = new Date(`${minDate}T00:00:00+07:00`);
  const [month, setMonth] = useState(() => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const monthKey = getMonthKey(month);
  const counts = useHybridDeliveryOrderCounts(monthKey);
  const firstWeekday = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const currentMonthKey = getMonthKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(month);
  const selectedCount = value ? counts?.[value] ?? 0 : 0;
  const goMonth = (offset: number) => setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1)));

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <div><p className="text-sm font-black capitalize">{monthLabel}</p><p className="mt-0.5 text-[11px] text-muted-foreground">Pilih tanggal pengiriman</p></div>
        <div className="flex gap-1"><button type="button" aria-label="Bulan sebelumnya" disabled={monthKey <= currentMonthKey} onClick={() => goMonth(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label="Bulan berikutnya" onClick={() => goMonth(1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border"><ChevronRight className="h-4 w-4" /></button></div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground"><span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span></div>
      <div className="mt-2 grid grid-cols-7 gap-1">{cells.map((day, index) => { const dateKey = day ? `${monthKey}-${String(day).padStart(2, "0")}` : ""; const count = dateKey ? counts?.[dateKey] ?? 0 : 0; const disabled = !day || dateKey < minDate || count >= maxOrdersPerDate; const selected = dateKey === value; return <button key={`${monthKey}-${index}`} type="button" disabled={disabled} onClick={() => onChange(dateKey)} className={`min-h-[52px] rounded-xl border p-1 text-center transition ${selected ? "border-primary bg-primary text-white" : disabled ? "border-transparent text-muted-foreground/30" : "border-transparent hover:border-primary/40 hover:bg-primary/5"}`}><span className="block text-sm font-black">{day || ""}</span>{day && counts === undefined ? <span className="mx-auto mt-1 block h-1 w-1 animate-pulse rounded-full bg-muted-foreground/40" /> : null}{count > 0 ? <span className={`mt-1 block text-[9px] font-black ${selected ? "text-white/90" : count >= 8 ? "text-orange-600" : "text-primary"}`}>{count >= 8 ? "🔥" : ""}{count}</span> : null}</button>; })}</div>
      <div className="mt-4 rounded-xl bg-primary/5 p-3 text-xs">{value ? <><p className="font-black text-primary">{selectedCount > 0 ? "Banyak pembeli memilih tanggal ini" : "Tanggal ini tersedia"}</p><p className="mt-1 text-muted-foreground">{counts === undefined ? "Memuat jumlah pesanan..." : selectedCount > 0 ? `${selectedCount} pesanan terjadwal yang sudah dibayar.` : "Belum ada pesanan terjadwal di tanggal ini."}</p></> : <p className="font-medium text-muted-foreground">Tanggal bertanda angka menunjukkan jumlah pesanan yang sudah dibayar.</p>}</div>
      {counts === null ? <p className="mt-2 text-[11px] text-red-600">Jumlah pesanan belum dapat dimuat. Tanggal tetap bisa dipilih.</p> : null}
    </div>
  );
}

function buildReorderDraft(order: any) {
  const items = Array.isArray(order?.items) ? order.items : Array.isArray(order?.orderItems) ? order.orderItems : [];
  const mie = items.find((item: any) => String(item?.productName ?? item?.product_name ?? "").toLowerCase().includes("mie yamin"));
  const pack = items.find((item: any) => String(item?.productName ?? item?.product_name ?? "").toLowerCase().includes("kemasan"));
  const repack = items.some((item: any) => String(item?.productName ?? item?.product_name ?? "").toLowerCase().includes("repack"));
  return { savedAt: Date.now(), kg: Number(mie?.quantity || 1), readyPackCount: Number(pack?.quantity || 0), repack };
}

function Tracking({ orderId }: { orderId: string }) {
  const [refreshTick, setRefreshTick] = useState(0);
  const order = useHybridOrderById(orderId, refreshTick) as any;
  const reduceMotion = useReducedMotion();
  const status = getTrackingStatus(order);
  useEffect(() => {
    // Realtime is not guaranteed for the public order view. Refresh the same
    // order so admin delivery-status changes reach the customer promptly.
    const timer = window.setInterval(() => setRefreshTick((value) => value + 1), 3000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    // Recovery path for orders created by an older bundle or another checkout context.
    if (order?.orderNumber || order?.status) rememberOrder(orderId);
  }, [orderId, order?.orderNumber, order?.status]);
  const activeIndex = Math.max(0, STATUS_STEPS.findIndex(([key]) => key === status));
  const current = STATUS_STEPS[activeIndex] || STATUS_STEPS[0];

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <div className="rounded-[28px] border border-border bg-card p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Live order tracking</p>
        <h1 className="mt-2 text-2xl font-black">Order Mie Yamin</h1>
        <p className="mt-1 text-xs text-muted-foreground">#{order?.orderNumber || orderId.slice(-8)}</p>
        <motion.div
          key={status}
          initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring" as const, stiffness: 300, damping: 25 }}
          className="relative mt-5 overflow-hidden rounded-2xl bg-primary/10 p-4"
        >
          {!reduceMotion ? <motion.span className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-primary/10" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }} /> : null}
          <p className="relative text-sm font-black text-primary">{current[1]}</p>
          <p className="relative mt-1 text-xs leading-relaxed text-muted-foreground">{current[2]}</p>
        </motion.div>
        <div className="mt-6 space-y-4">
          {STATUS_STEPS.map(([key, label]) => {
            const index = STATUS_STEPS.findIndex(([step]) => step === key);
            const done = index <= activeIndex;
            return (
              <motion.div
                className="flex items-center gap-3"
                key={key}
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduceMotion ? 0 : index * 0.035, duration: 0.25 }}
              >
                <motion.div
                  animate={index === activeIndex && !reduceMotion ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 1.8, repeat: index === activeIndex && !reduceMotion ? Infinity : 0, ease: "easeInOut" }}
                  className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${done ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}
                >
                  {index === activeIndex && !reduceMotion ? <span className="absolute inset-0 rounded-full bg-primary/25 animate-ping" /> : null}
                  <span className="relative">{done ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span>
                </motion.div>
                <p className={`text-sm font-bold ${index === activeIndex ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>{label}</p>
              </motion.div>
            );
          })}
        </div>
        {order?.deliveryDate ? <p className="mt-6 text-xs text-muted-foreground">Tanggal pengiriman: <b>{new Date(order.deliveryDate).toLocaleDateString("id-ID")}</b></p> : null}
        {order?.paymentGateway?.invoiceUrl || order?.payment_gateway?.invoiceUrl ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black text-amber-900">Pembayaran belum selesai?</p><p className="mt-1 text-[11px] leading-relaxed text-amber-800">Gunakan invoice yang sama. Jangan membuat order baru.</p><div className="mt-3 grid grid-cols-2 gap-2"><a href={order?.paymentGateway?.invoiceUrl || order?.payment_gateway?.invoiceUrl} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center justify-center rounded-xl bg-amber-600 text-xs font-black text-white">Bayar sekarang</a><button type="button" onClick={() => navigator.clipboard?.writeText(order?.paymentGateway?.invoiceUrl || order?.payment_gateway?.invoiceUrl)} className="h-10 rounded-xl border border-amber-300 text-xs font-black text-amber-900">Salin link</button></div></div> : null}
      </div>
    </main>
  );
}

function SavedOrderCard({ reference, onOpen, onReorder }: { reference: SavedOrderReference; onOpen: (orderId: string) => void; onReorder: (order: any) => void }) {
  const order = useHybridOrderById(reference.orderId) as any;
  const status = getTrackingStatus(order);
  const statusLabel = STATUS_STEPS.find(([key]) => key === status)?.[1] || "Memuat status...";
  return (
    <div className="w-full rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <button type="button" onClick={() => onOpen(reference.orderId)} className="w-full text-left active:scale-[.99]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Package className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">#{order?.orderNumber || reference.orderId.slice(-8)}</p>
            <p className="mt-1 text-xs font-bold text-primary">{statusLabel}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{order?.totalAmount != null ? formatRupiah(Number(order.totalAmount)) : "Memuat total..."} · Ketuk untuk tracking</p>
          </div>
          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
        </div>
      </button>
      <div className="mt-3 flex gap-2 border-t border-border/70 pt-3"><button type="button" disabled={!order} onClick={() => onReorder(order)} className="h-10 flex-1 rounded-xl border border-primary/30 text-xs font-black text-primary disabled:opacity-40">Pesan lagi</button><button type="button" onClick={() => onOpen(reference.orderId)} className="h-10 rounded-xl border border-border px-3 text-xs font-black">Tracking</button></div>
    </div>
  );
}

function MyOrders({ onOpen, onNewOrder, onReorder }: { onOpen: (orderId: string) => void; onNewOrder: () => void; onReorder: (order: any) => void }) {
  const [orders, setOrders] = useState<SavedOrderReference[]>(() => readSavedOrders());
  useEffect(() => setOrders(readSavedOrders()), []);
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <div className="mb-5 flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Riwayat di perangkat ini</p><h1 className="mt-1 text-2xl font-black">Pesanan Saya</h1><p className="mt-1 text-xs text-muted-foreground">Pilih order untuk melihat status live.</p></div><ClipboardList className="h-7 w-7 text-primary" /></div>
      {orders.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-6 text-center"><p className="text-sm font-black">Belum ada pesanan tersimpan</p><p className="mt-1 text-xs text-muted-foreground">Order baru dari perangkat ini akan muncul di sini.</p><button type="button" onClick={onNewOrder} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-white"><Plus className="h-4 w-4" /> Pesan sekarang</button></div> : <div className="space-y-3">{orders.map((reference) => <SavedOrderCard key={reference.orderId} reference={reference} onOpen={onOpen} onReorder={onReorder} />)}</div>}
      <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">Daftar ini tersimpan di browser/perangkat ini. Link tracking tetap bisa dibagikan untuk membuka order tertentu.</p>
    </main>
  );
}

function OrderForm() {
  const navigate = useNavigate();
  const createOrder = useHybridCreateOrder();
  const createInvoice = useHybridMayarCreateInvoice();
  const getInvoiceDetail = useHybridMayarGetInvoiceDetail();
  const updateOrderPaymentGateway = useHybridUpdateOrderPaymentGateway();
  const siteSettings = useHybridSiteSettings() as any;
  const mieYaminSettings = { ...DEFAULT_MIE_YAMIN_SETTINGS, ...(siteSettings?.mieYaminSettings ?? {}) };
  const settingsLoaded = siteSettings != null;
  const [kg, setKg] = useState(1);
  const [readyPackCount, setReadyPackCount] = useState(0);
  const [repack, setRepack] = useState(false);
  const [deliveryProvider, setDeliveryProvider] = useState<"gojek" | "maxim" | "">("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pendingPaymentOrderId, setPendingPaymentOrderId] = useState<string | null>(() => readPendingPayment()?.orderId ?? null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [error, setError] = useState("");
  const [promoRemainingMs, setPromoRemainingMs] = useState(() => Math.max(0, PROMO_END_AT - Date.now()));
  const repackCount = repack ? kg * 10 : 0;
  const noodleTotal = kg * Number(mieYaminSettings.noodlePricePerKg);
  const readyPackTotal = readyPackCount * Number(mieYaminSettings.readyPackPrice);
  const repackTotal = repackCount * Number(mieYaminSettings.repackFeePer100g);
  const shippingFee = mieYaminSettings.freeShippingPromo ? 0 : Number(mieYaminSettings.shippingFee || 0);
  const total = noodleTotal + readyPackTotal + repackTotal + shippingFee;
  const minOrderKg = Math.max(0.1, Number(mieYaminSettings.minimumOrderKg || 1));
  const orderCutoffHour = Math.min(23, Math.max(0, Number(mieYaminSettings.orderCutoffHour ?? 15)));
  const maxOrdersPerDate = Math.max(1, Number(mieYaminSettings.maxOrdersPerDate || 20));
  const supportWhatsapp = formatPhoneForWhatsApp(String(mieYaminSettings.supportWhatsapp || ""));
  const supportHref = supportWhatsapp ? `https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(`Halo, saya perlu bantuan order Mie Yamin${pendingPaymentOrderId ? ` #${pendingPaymentOrderId}` : ""}.`)}` : "";
  const minDate = useMemo(() => getNextAvailableDate(orderCutoffHour), [orderCutoffHour]);
  const promoCountdown = useMemo(() => {
    const totalSeconds = Math.floor(promoRemainingMs / 1000);
    return {
      days: Math.floor(totalSeconds / 86_400),
      hours: Math.floor((totalSeconds % 86_400) / 3_600),
      minutes: Math.floor((totalSeconds % 3_600) / 60),
      seconds: totalSeconds % 60,
    };
  }, [promoRemainingMs]);

  useEffect(() => {
    const updatePromoTimer = () => setPromoRemainingMs(Math.max(0, PROMO_END_AT - Date.now()));
    updatePromoTimer();
    const timer = window.setInterval(updatePromoTimer, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(DRAFT_ORDER_KEY) || "null");
      if (saved && typeof saved === "object" && Date.now() - Number(saved.savedAt || 0) < 24 * 60 * 60 * 1000) {
        if (Number.isFinite(Number(saved.kg))) setKg(Math.max(minOrderKg, Number(saved.kg)));
        if (Number.isFinite(Number(saved.readyPackCount))) setReadyPackCount(Math.max(0, Number(saved.readyPackCount)));
        if (typeof saved.repack === "boolean") setRepack(saved.repack);
        if (["gojek", "maxim"].includes(saved.deliveryProvider)) setDeliveryProvider(saved.deliveryProvider);
        if (typeof saved.deliveryDate === "string") setDeliveryDate(saved.deliveryDate);
        if (typeof saved.name === "string") setName(saved.name);
        if (typeof saved.email === "string") setEmail(saved.email);
        if (typeof saved.phone === "string") setPhone(saved.phone);
        if (typeof saved.address === "string") setAddress(saved.address);
        if (typeof saved.notes === "string") setNotes(saved.notes);
      }
    } catch {
      // Ignore malformed or unavailable local draft.
    } finally {
      setDraftHydrated(true);
    }
  }, [minOrderKg]);

  useEffect(() => {
    if (!draftHydrated || pendingPaymentOrderId) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify({
        savedAt: Date.now(), kg, readyPackCount, repack, deliveryProvider, deliveryDate, name, email, phone, address, notes,
      }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftHydrated, pendingPaymentOrderId, kg, readyPackCount, repack, deliveryProvider, deliveryDate, name, email, phone, address, notes]);

  async function attachInvoiceAndRedirect(orderId: string, payment: { id: string; link: string; transactionId?: string | null }) {
    const paymentGateway = {
      provider: "mayar",
      invoiceId: payment.id,
      invoiceUrl: payment.link,
      transactionId: payment.transactionId ?? null,
      status: "pending",
    };

    // The Mayar invoice already carries extraData.orderId. A transient local
    // metadata write must not prevent the customer from reaching payment.
    try {
      await updateOrderPaymentGateway({
        id: String(orderId),
        paymentGateway,
        paymentReceiptKind: "gateway_pending",
      });
    } catch (error) {
      console.warn("[mayar] Order metadata sync failed; continuing to payment", error);
    }

    setPendingPaymentOrderId(null);
    clearPendingPayment();
    window.localStorage.removeItem(DRAFT_ORDER_KEY);
    rememberOrder(String(orderId));
    window.location.assign(payment.link);
  }

  async function createPaymentInvoice(orderId: string) {
    const redirectUrl = `${window.location.origin}/?stage=tracking&orderId=${encodeURIComponent(String(orderId))}`;
    const existing = readPendingPayment();
    if (existing?.orderId === String(orderId) && existing.expiresAt > Date.now()) {
      try {
        const detail = await getInvoiceDetail({ invoiceId: existing.invoiceId });
        const status = String(detail?.data?.status ?? detail?.data?.paymentStatus ?? "").toLowerCase();
        if (["paid", "completed", "success", "settled"].includes(status)) {
          clearPendingPayment();
          window.localStorage.removeItem(DRAFT_ORDER_KEY);
          rememberOrder(String(orderId));
          window.location.assign(redirectUrl);
          return;
        }
        if (!["expired", "cancelled", "canceled", "failed"].includes(status)) {
          await attachInvoiceAndRedirect(orderId, { id: existing.invoiceId, link: existing.link });
          return;
        }
      } catch {
        // If status lookup is temporarily unavailable, reuse the known invoice link instead of creating a duplicate.
        await attachInvoiceAndRedirect(orderId, { id: existing.invoiceId, link: existing.link });
        return;
      }
      clearPendingPayment();
    }

    const invoice = await createInvoice({
      name: name.trim(), mobile: phone.trim(), redirectUrl,
      email: email.trim() || undefined,
      description: `Order Mie Yamin B2B ${kg} kg${repack ? " + repack 100 gram" : ""}`,
      expiredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      extraData: { orderId: String(orderId), brandSlug: BRAND_SLUG, businessUnit: BUSINESS_UNIT, deliveryProvider, shippingFee: String(shippingFee), deliveryArea: String(mieYaminSettings.deliveryArea) },
      items: [
        { quantity: kg, rate: Number(mieYaminSettings.noodlePricePerKg), description: `Mie Yamin Mentah ${kg} kg` },
        ...(readyPackCount > 0 ? [{ quantity: readyPackCount, rate: Number(mieYaminSettings.readyPackPrice), description: `Kemasan siap masak ${readyPackCount} pcs` }] : []),
        ...(repack ? [{ quantity: repackCount, rate: Number(mieYaminSettings.repackFeePer100g), description: `Jasa repack 100 gram ${repackCount} pcs` }] : []),
        ...(shippingFee > 0 ? [{ quantity: 1, rate: shippingFee, description: "Biaya pengiriman" }] : []),
      ],
    });
    if (!invoice?.data?.link || !invoice?.data?.id) throw new Error("Invoice pembayaran belum tersedia.");
    savePendingPayment({ orderId: String(orderId), invoiceId: String(invoice.data.id), link: invoice.data.link, expiresAt: Date.now() + 60 * 60 * 1000 });
    await attachInvoiceAndRedirect(String(orderId), invoice.data);
  }

  function submit() {
    if (!settingsLoaded) {
      setError("Harga dan ketersediaan sedang dimuat. Tunggu sebentar lalu coba lagi.");
      return;
    }
    if (kg < minOrderKg) {
      setError(`Minimum order adalah ${minOrderKg} kg.`);
      return;
    }
    if (!mieYaminSettings.enabledProviders.length) {
      setError("Provider pengiriman sedang tidak tersedia. Hubungi admin untuk bantuan.");
      return;
    }
    if (!deliveryProvider || !deliveryDate || !name.trim() || !phone.trim() || !address.trim()) {
      setError("Pilih pengiriman, lalu lengkapi tanggal pengiriman, nama, WhatsApp, dan alamat.");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Format email belum benar.");
      return;
    }
    setError("");
    setReviewOpen(true);
  }

  async function confirmSubmit() {
    setSubmitting(true); setError("");
    try {
      const orderId = await createOrder({
        items: [
          { productName: "Mie Yamin Mentah", variant: `${kg} kg`, quantity: kg, price: Number(mieYaminSettings.noodlePricePerKg), originalPrice: NORMAL_NOODLE_PRICE_PER_KG },
          ...(readyPackCount > 0 ? [{ productName: "Kemasan siap masak", variant: `${readyPackCount} pcs`, quantity: readyPackCount, price: Number(mieYaminSettings.readyPackPrice), originalPrice: Number(mieYaminSettings.readyPackPrice) }] : []),
          ...(repack ? [{ productName: "Jasa repack 100 gram", variant: `${repackCount} pcs`, quantity: repackCount, price: Number(mieYaminSettings.repackFeePer100g), originalPrice: Number(mieYaminSettings.repackFeePer100g) }] : []),
          ...(shippingFee > 0 ? [{ productName: "Biaya pengiriman", variant: deliveryProvider, quantity: 1, price: shippingFee, originalPrice: shippingFee }] : []),
        ],
        totalAmount: total,
        paymentMethod: "djiwaapp",
        customerName: name.trim(),
        customerEmail: email.trim() || null,
        source: "ordermieyamin_b2b",
        sourceApp: BUSINESS_UNIT,
        businessUnit: BUSINESS_UNIT,
        brandSlug: BRAND_SLUG,
        orderType: "delivery",
        deliveryDate: new Date(`${deliveryDate}T12:00:00+07:00`).toISOString(),
        deliveryProvider,
        deliveryStatus: "pending_payment",
        deliveryContactName: name.trim(),
        deliveryContactPhone: phone.trim(),
        deliveryAddress: address.trim(),
        deliveryNotes: notes.trim() || null,
        notes: notes.trim() || null,
        paymentReceiptKind: "gateway_pending",
        isOpenBill: true,
      });
      setPendingPaymentOrderId(String(orderId));
      await createPaymentInvoice(String(orderId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout gagal. Coba lagi.");
    } finally { setSubmitting(false); }
  }

  async function retryPayment() {
    if (!pendingPaymentOrderId) return;
    setSubmitting(true); setError("");
    try {
      await createPaymentInvoice(pendingPaymentOrderId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invoice belum berhasil dibuat. Coba lagi.");
    } finally { setSubmitting(false); }
  }

  if (siteSettings === null) {
    return <main className="mx-auto w-full max-w-md px-4 py-8"><div className="rounded-[28px] border border-red-200 bg-card p-5 text-center"><p className="text-sm font-black text-red-700">Harga belum dapat dimuat</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Kami tidak akan melanjutkan checkout dengan harga yang belum terverifikasi.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 h-11 rounded-xl bg-primary px-5 text-xs font-black text-white">Coba muat ulang</button></div></main>;
  }
  if (!settingsLoaded) {
    return <main className="mx-auto w-full max-w-md px-4 py-8"><div className="animate-pulse rounded-[28px] border border-border bg-card p-5"><div className="h-5 w-2/3 rounded bg-muted" /><div className="mt-3 h-3 w-full rounded bg-muted" /><div className="mt-2 h-3 w-5/6 rounded bg-muted" /><div className="mt-8 h-28 rounded-2xl bg-muted" /><div className="mt-4 h-12 rounded-2xl bg-muted" /></div><p className="mt-4 text-center text-xs text-muted-foreground">Memuat harga dan ketersediaan terbaru...</p></main>;
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-5 pb-24 md:pb-5"><div className="mb-4 overflow-hidden rounded-[28px] border border-border bg-card shadow-sm"><div className="grid grid-cols-[88px_1fr] items-center gap-4 p-4"><img src={String(mieYaminSettings.productImageUrl || "/logo-djiwa.png")} alt="Produk Mie Yamin" className="h-20 w-20 rounded-2xl bg-primary/5 object-contain p-2" /><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Djiwa Tentram B2B</p><h1 className="mt-1 text-2xl font-black tracking-tight">Mie Yamin Mentah</h1><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Produksi sendiri tanpa bahan pengawet. Cocok untuk reseller, warung, dan katering.</p></div></div><div className="grid grid-cols-3 border-t border-border/70 text-center text-[10px] font-bold text-muted-foreground"><span className="px-2 py-3">Min. {minOrderKg} kg</span><span className="border-x border-border/70 px-2 py-3">Area {String(mieYaminSettings.deliveryArea)}</span><span className="px-2 py-3">Cutoff {String(orderCutoffHour).padStart(2, "0")}:00</span></div></div>
      <div className="space-y-4 rounded-[28px] border border-border bg-card p-5 shadow-sm">
        <div className="rounded-2xl border border-border bg-background p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black">Jumlah mie</p><p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">Minimum {minOrderKg} kg · <span className="font-medium text-muted-foreground line-through">{formatRupiah(NORMAL_NOODLE_PRICE_PER_KG)}</span> <span className="font-black text-primary">{formatRupiah(Number(mieYaminSettings.noodlePricePerKg))}</span> per kg <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">PROMO</span></p><div className={`mt-2 inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] font-black ${promoRemainingMs > 0 ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}><Clock3 className="h-3.5 w-3.5" />{promoRemainingMs > 0 ? <>Promo berakhir dalam <span className="tabular-nums">{promoCountdown.days}h {String(promoCountdown.hours).padStart(2, "0")}j {String(promoCountdown.minutes).padStart(2, "0")}m {String(promoCountdown.seconds).padStart(2, "0")}d</span></> : "Promo telah berakhir"}</div></div><div className="flex items-center gap-2"><button type="button" aria-label="Kurangi jumlah mie" onClick={() => setKg(Math.max(minOrderKg, kg - 1))} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-lg font-black">−</button><output className="min-w-16 text-center text-lg font-black" aria-live="polite">{kg} kg</output><button type="button" aria-label="Tambah jumlah mie" onClick={() => setKg(kg + 1)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-lg font-black">+</button></div></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{[1, 5, 10, 25].filter((preset) => preset >= minOrderKg).map((preset) => <button key={preset} type="button" onClick={() => setKg(preset)} className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-black ${kg === preset ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{preset} kg</button>)}</div></div>
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-2xl border border-border p-4"><span className="pt-1 text-primary">＋</span><span className="flex-1"><b className="block text-sm">Kemasan siap masak</b><span className="text-xs text-muted-foreground">{formatRupiah(Number(mieYaminSettings.readyPackPrice))} per pcs</span><input min={0} type="number" value={readyPackCount} onChange={(e) => setReadyPackCount(Math.max(0, Number(e.target.value) || 0))} className="mt-3 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" placeholder="Jumlah pcs" /></span></label>
          <label className="flex items-start gap-3 rounded-2xl border border-border p-4"><input checked={repack} onChange={(e) => setRepack(e.target.checked)} type="checkbox" className="mt-1 h-4 w-4 accent-primary" /><span><b className="block text-sm">Repack dari mie kiloan</b><span className="text-xs leading-relaxed text-muted-foreground">Tambahan {formatRupiah(Number(mieYaminSettings.repackFeePer100g))} per 100 gram. {kg} kg = {kg * 10} pcs, biaya repack {formatRupiah(kg * 10 * Number(mieYaminSettings.repackFeePer100g))}.</span></span></label>
        </div>
        <div className="space-y-2"><p className="text-sm font-bold">Pilih pengiriman <span className="font-normal text-muted-foreground">(area {String(mieYaminSettings.deliveryArea)})</span></p><div className="grid grid-cols-2 gap-3">{(["gojek", "maxim"] as const).filter((provider) => mieYaminSettings.enabledProviders.includes(provider)).map((provider) => <button key={provider} type="button" onClick={() => setDeliveryProvider(provider)} className={`h-14 rounded-2xl border text-sm font-black transition ${deliveryProvider === provider ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground"}`}>{provider === "gojek" ? "Gojek" : "Maxim"}<span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">{mieYaminSettings.freeShippingPromo ? "Gratis promo" : shippingFee > 0 ? formatRupiah(shippingFee) : "Dikonfirmasi admin"}</span></button>)}</div></div>
        <div className="space-y-2"><p className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4 text-primary" />Tanggal pengiriman</p><CalendarDatePicker value={deliveryDate} onChange={setDeliveryDate} minDate={minDate} maxOrdersPerDate={maxOrdersPerDate} /></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Nama penerima<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-3 text-sm" /></label><label className="text-sm font-bold">WhatsApp<input autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-3 text-sm" /></label></div>
        <label className="block text-sm font-bold">Email <span className="font-normal text-muted-foreground">(opsional, untuk bukti pembayaran)</span><input autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-3 text-sm" /></label>
        <label className="block text-sm font-bold">Alamat lengkap<textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-border bg-background p-3 text-sm" /></label>
        <label className="block text-sm font-bold">Catatan pengiriman <span className="font-normal text-muted-foreground">(opsional)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-2 w-full rounded-2xl border border-border bg-background p-3 text-sm" /></label>
        <div className="rounded-2xl bg-muted/50 p-4 text-sm"><div className="flex justify-between"><span>Mie yamin ({kg} kg)</span><b>{formatRupiah(noodleTotal)}</b></div>{readyPackCount > 0 ? <div className="mt-2 flex justify-between"><span>Kemasan siap masak ({readyPackCount} pcs)</span><b>{formatRupiah(readyPackTotal)}</b></div> : null}{repack ? <div className="mt-2 flex justify-between"><span>Jasa repack ({repackCount} pcs)</span><b>{formatRupiah(repackTotal)}</b></div> : null}{deliveryProvider ? <div className="mt-2 flex justify-between"><span>Pengiriman {deliveryProvider === "gojek" ? "Gojek" : "Maxim"}</span><b className={shippingFee > 0 ? "text-foreground" : "text-emerald-600"}>{mieYaminSettings.freeShippingPromo ? "Gratis promo" : shippingFee > 0 ? formatRupiah(shippingFee) : "Dikonfirmasi admin"}</b></div> : null}<div className="mt-3 flex justify-between border-t border-border pt-3 text-base"><b>Total</b><b className="text-primary">{formatRupiah(total)}</b></div></div>
        {reviewOpen ? <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4"><div><p className="text-sm font-black text-primary">Review pesanan</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Pastikan jumlah, tanggal, dan alamat sudah benar sebelum lanjut ke pembayaran.</p></div><div className="space-y-1.5 text-xs"><p><b>{kg} kg</b> Mie Yamin Mentah</p>{readyPackCount > 0 ? <p><b>{readyPackCount} pcs</b> kemasan siap masak</p> : null}{repack ? <p>Jasa repack <b>{repackCount} pcs</b></p> : null}<p>Pengiriman <b>{deliveryProvider === "gojek" ? "Gojek" : "Maxim"}</b> pada <b>{new Date(`${deliveryDate}T12:00:00+07:00`).toLocaleDateString("id-ID", { dateStyle: "long" })}</b></p><p>Penerima <b>{name}</b> · {phone}</p><p className="break-words">{address}</p>{email.trim() ? <p>Email bukti pembayaran <b>{email}</b></p> : null}</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setReviewOpen(false)} className="h-11 rounded-xl border border-border bg-background text-xs font-black">Kembali edit</button><button type="button" disabled={submitting} onClick={confirmSubmit} className="h-11 rounded-xl bg-primary text-xs font-black text-white disabled:opacity-50">{submitting ? "Menyiapkan..." : "Konfirmasi & bayar"}</button></div></div> : null}
        {error ? <div className="space-y-2"><p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700" role="alert">{error}</p>{supportHref ? <a href={supportHref} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center justify-center rounded-xl border border-border text-xs font-black text-primary">Butuh bantuan? Chat WhatsApp admin</a> : null}</div> : null}
        {pendingPaymentOrderId ? <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black text-amber-900">Order sudah tersimpan, tetapi invoice pembayaran belum berhasil dibuat.</p><p className="text-[11px] leading-relaxed text-amber-800">Coba lagi dengan order yang sama agar tidak membuat pesanan ganda.</p><button type="button" disabled={submitting} onClick={retryPayment} className="h-11 w-full rounded-xl bg-amber-600 text-xs font-black text-white disabled:opacity-50">{submitting ? "Mencoba lagi..." : "Coba buat pembayaran lagi"}</button></div> : null}
        {!reviewOpen && !pendingPaymentOrderId ? <button disabled={submitting} onClick={submit} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-white disabled:opacity-50">Review pesanan <ChevronRight className="h-4 w-4" /></button> : null}
      </div>
      {!reviewOpen && !pendingPaymentOrderId ? <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background/95 px-4 py-3 shadow-[0_-8px_24px_rgba(9,9,11,0.08)] backdrop-blur-xl md:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}><div className="mx-auto flex max-w-md items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold text-muted-foreground">Total pesanan</p><p className="truncate text-base font-black text-primary">{formatRupiah(total)}</p></div><button disabled={submitting} onClick={submit} className="h-12 shrink-0 rounded-2xl bg-primary px-5 text-xs font-black text-white disabled:opacity-50">Review pesanan</button></div></div> : null}
      <p className="mt-5 text-center text-xs text-muted-foreground">Pembayaran aman via Mayar. Setelah pembayaran, status order akan diperbarui secara live.</p>
    </main>
  );
}

function OrderMieYaminPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const orderId = search.orderId;
  const isTracking = search.stage === "tracking" && Boolean(orderId);
  const isOrders = search.stage === "orders";
  return <div className="min-h-app bg-background font-sans text-foreground"><header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl"><div className="mx-auto flex max-w-md items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white"><Package className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Djiwa Tentram</p><p className="truncate text-sm font-black">Order Mie Yamin B2B</p></div><button type="button" onClick={() => navigate({ to: "/", search: { stage: isOrders ? "order" : "orders" } })} className="ml-auto flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-[11px] font-black text-primary">{isOrders ? <><Plus className="h-3.5 w-3.5" /> Pesan baru</> : <><ClipboardList className="h-3.5 w-3.5" /> Pesanan saya</>}</button></div></header>{isTracking && orderId ? <><Tracking orderId={orderId} /><div className="mx-auto flex max-w-md gap-2 px-4 pb-8"><button type="button" onClick={() => navigate({ to: "/", search: { stage: "order" } })} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-white"><Plus className="h-4 w-4" /> Pesan lagi</button><button type="button" onClick={() => navigate({ to: "/", search: { stage: "orders" } })} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-border px-4 text-sm font-black"><ClipboardList className="h-4 w-4" /> Semua</button></div></> : isOrders ? <MyOrders onOpen={(id) => navigate({ to: "/", search: { stage: "tracking", orderId: id } })} onNewOrder={() => navigate({ to: "/", search: { stage: "order" } })} onReorder={(order) => { window.localStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify(buildReorderDraft(order))); navigate({ to: "/", search: { stage: "order" } }); }} /> : <OrderForm />}</div>;
}
