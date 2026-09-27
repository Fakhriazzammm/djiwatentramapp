import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ClipboardList, CreditCard, Flame, MapPin, Package, PackageCheck, Plus, RefreshCw, ShieldCheck, Store, Truck } from "lucide-react";
import { toast } from "sonner";
import { useHybridCreateOrder, useHybridMayarCreateInvoice, useHybridMayarGetInvoiceDetail, useHybridUpdateOrderPaymentGateway } from "@/hooks/use-hybrid-write-actions";
import { useHybridDeliveryOrderCounts, useHybridOrderById } from "@/hooks/use-hybrid-ops-data";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { redirectToCustomerLogin } from "@/lib/auth-client";

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

type PendingPaymentReference = { orderId: string; invoiceId: string; link: string; expiresAt: number; idempotencyKey?: string };
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

function normalizeMobile(value: unknown) {
  return typeof value === "string" ? value.replace(/[^\d]/g, "") : "";
}

function getCheckoutErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const nested = value.error && typeof value.error === "object" ? value.error as Record<string, unknown> : null;
    const message = value.message ?? nested?.message ?? value.details ?? nested?.details;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
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
        <div className="flex gap-1"><button type="button" aria-label="Bulan sebelumnya" disabled={monthKey <= currentMonthKey} onClick={() => goMonth(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border transition active:scale-[.97] disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><button type="button" aria-label="Bulan berikutnya" onClick={() => goMonth(1)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border transition active:scale-[.97]"><ChevronRight className="h-4 w-4" /></button></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[1, 2].map((offset) => {
          const presetKey = getWibDateKey(new Date(Date.now() + offset * 24 * 60 * 60 * 1000));
          const presetCount = presetKey ? counts?.[presetKey] ?? 0 : 0;
          const presetDisabled = presetKey < minDate || presetCount >= maxOrdersPerDate;
          const presetSelected = presetKey === value;
          return (
            <button key={offset} type="button" disabled={presetDisabled} onClick={() => onChange(presetKey)} className={`h-12 rounded-xl border text-left px-3 transition ${presetSelected ? "border-primary bg-primary/10" : presetDisabled ? "border-border/60 text-muted-foreground/40" : "border-border hover:border-primary/40 hover:bg-primary/5"}`}>
              <span className={`block text-xs font-black ${presetSelected ? "text-primary" : "text-foreground"}`}>{offset === 1 ? "Besok" : "Lusa"}</span>
              <span className={`mt-0.5 block text-[11px] font-medium capitalize ${presetSelected ? "text-primary/80" : "text-muted-foreground"}`}>{presetKey ? new Date(`${presetKey}T00:00:00+07:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" }) : ""}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => { document.getElementById(`order-calendar-${String(value || "open")}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-xs font-black text-primary">
          <CalendarDays className="h-4 w-4" /> Pilih tanggal lain
        </button>
      </div>
      <div id={`order-calendar-${String(value || "open")}`} className="mt-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground"><span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span></div>
      <div className="mt-2 grid grid-cols-7 gap-1">{cells.map((day, index) => { const dateKey = day ? `${monthKey}-${String(day).padStart(2, "0")}` : ""; const count = dateKey ? counts?.[dateKey] ?? 0 : 0; const disabled = !day || dateKey < minDate || count >= maxOrdersPerDate; const selected = dateKey === value; return <button key={`${monthKey}-${index}`} type="button" disabled={disabled} onClick={() => onChange(dateKey)} className={`min-h-[52px] rounded-xl border p-1 text-center transition ${selected ? "border-primary bg-primary text-white" : disabled ? "border-transparent text-muted-foreground/30" : "border-transparent hover:border-primary/40 hover:bg-primary/5"}`}><span className="block text-sm font-black">{day || ""}</span>{day && counts === undefined ? <span className="mx-auto mt-1 block h-1 w-1 animate-pulse rounded-full bg-muted-foreground/40" /> : null}{count > 0 ? <span className={`mt-1 flex items-center justify-center gap-0.5 text-[11px] font-black ${selected ? "text-white/90" : count >= 8 ? "text-orange-600" : "text-primary"}`}>{count >= 8 ? <Flame className="h-3 w-3" /> : null}{count}</span> : null}</button>; })}</div>
      <div className="mt-4 rounded-xl bg-primary/5 p-3 text-xs">{value ? <><p className="font-black text-primary">{selectedCount > 0 ? "Banyak pembeli memilih tanggal ini" : "Tanggal ini tersedia"}</p><p className="mt-1 text-muted-foreground">{counts === undefined ? "Memuat jumlah pesanan..." : selectedCount > 0 ? `${selectedCount} pesanan terjadwal yang sudah dibayar.` : "Belum ada pesanan terjadwal di tanggal ini."}</p></> : <p className="font-medium text-muted-foreground">Tanggal bertanda angka menunjukkan jumlah pesanan yang sudah dibayar.</p>}</div>
      {counts === null ? <p className="mt-2 text-[11px] text-red-600">Jumlah pesanan belum dapat dimuat. Tanggal tetap bisa dipilih.</p> : null}
      </div>
    </div>
  );
}

function buildReorderDraft(order: any) {
  const items = Array.isArray(order?.items) ? order.items : Array.isArray(order?.orderItems) ? order.orderItems : [];
  const mie = items.find((item: any) => String(item?.productName ?? item?.product_name ?? "").toLowerCase().includes("mie yamin"));
  const pack = items.find((item: any) => String(item?.productName ?? item?.product_name ?? "").toLowerCase().includes("kemasan"));
  const repack = items.some((item: any) => String(item?.productName ?? item?.product_name ?? "").toLowerCase().includes("repack"));
  return { savedAt: Date.now(), productType: pack ? "ready_pack" : "noodle", kg: Number(mie?.quantity || 1), readyPackCount: Number(pack?.quantity || 1), repack };
}

// Origin verified from the existing attendance/admin geofence settings.
const DELIVERY_ORIGIN = { lat: -7.316143, lng: 108.212601, label: "Djiwa Tentram Koffie" };

function getDeliveryRoutePoint(progress: number) {
  const points = [
    { x: 186, y: 99 },
    { x: 225, y: 99 },
    { x: 225, y: 135 },
    { x: 280, y: 135 },
    { x: 280, y: 76 },
    { x: 306, y: 76 },
  ];
  const scaled = Math.min(0.999, Math.max(0, progress)) * (points.length - 1);
  const index = Math.floor(scaled);
  const fraction = scaled - index;
  const from = points[index] || points[0];
  const to = points[index + 1] || points[points.length - 1];
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

const RESTAURANT_TRACKING_MESSAGES: Record<string, string[]> = {
  pending_payment: ["📍 Pesananmu menunggu pembayaran — produksi belum kami mulai."] ,
  paid: ["📍 Pesanan sudah masuk — tim produksi sedang menyiapkan bahan. 🥬", "🔥 Order sudah dikonfirmasi — tim Mie Yamin mulai bekerja."] ,
  preparing: ["📍 Mie Yamin mentah sedang disiapkan — kami cek takaran dan kualitasnya. 🍜", "🔥 Pesanan sedang diproses — mie mentah siap dikemas dengan rapi. 📦"] ,
  packing: ["📍 Mie Yamin sedang dikemas — kami cek lagi sebelum berangkat. 📦", "✨ Hampir siap dikirim — pesanan sedang dirapikan."] ,
  ready_to_ship: ["📍 Pesanan sudah siap — tinggal menunggu kurir berangkat. 🛵", "🏁 Mie Yamin sudah di garis start pengiriman."] ,
  out_for_delivery: ["📍 Pesanan sudah berangkat — jangan lupa cek pagar rumah. 🏠", "🛵 Kurir sedang melaju — Mie Yamin segera sampai.", "🏁 Tinggal sedikit lagi — siap menerima pesananmu? 📦"] ,
  delivered: ["📍 Pesanan sudah diterima — semoga mie mentahnya sampai dengan baik! 🍜", "✅ Misi selesai — selamat mengolah Mie Yamin di rumah."] ,
};

function getTrackingEmoji(status: string, index: number) {
  if (index === 0) return "✅";
  if (status === "preparing" && index === 2) return "🍜";
  if (status === "packing" && index === 3) return "📦";
  if (index === 5) return "🛵";
  if (index === 6) return "🏠";
  if (index === 4) return "🏁";
  return "🍜";
}

function Tracking({ orderId }: { orderId: string }) {
  const [refreshTick, setRefreshTick] = useState(0);
  const order = useHybridOrderById(orderId, refreshTick) as any;
  const reduceMotion = useReducedMotion();
  const status = getTrackingStatus(order);
  const activeIndex = Math.max(0, STATUS_STEPS.findIndex(([key]) => key === status));
  const current = STATUS_STEPS[activeIndex] || STATUS_STEPS[0];
  const provider = String(order?.deliveryProvider || "");
  const providerLabel = provider === "gojek" ? "Gojek" : provider === "maxim" ? "Maxim" : provider || "Belum dipilih";
  const deliveryDate = order?.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("id-ID", { dateStyle: "long" }) : "Tanggal belum tersedia";
  const invoiceUrl = order?.paymentGateway?.invoiceUrl || order?.payment_gateway?.invoiceUrl;
  const [animationProgress, setAnimationProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const isDeliveryActive = status === "out_for_delivery";
  const isCompleted = status === "delivered";
  const isMapActive = isDeliveryActive || isCompleted;
  const routeProgress = isCompleted ? 1 : isDeliveryActive ? animationProgress : activeIndex >= 4 ? 0.72 : 0;
  const routePoint = getDeliveryRoutePoint(routeProgress);
  const etaMinutes = isDeliveryActive ? Math.max(1, 4 - Math.floor(animationProgress * 3)) : activeIndex >= 4 && !isCompleted ? 8 : null;
  const trackingMessages = RESTAURANT_TRACKING_MESSAGES[status] || RESTAURANT_TRACKING_MESSAGES.paid;
  const trackingMessage = trackingMessages[messageIndex % trackingMessages.length];

  useEffect(() => {
    let timer: number | null = null;
    const startPolling = () => { if (timer == null) timer = window.setInterval(() => setRefreshTick((value) => value + 1), 4000); };
    const stopPolling = () => { if (timer != null) { window.clearInterval(timer); timer = null; } };
    const handleVisibility = () => { if (document.hidden) stopPolling(); else { setRefreshTick((value) => value + 1); startPolling(); } };
    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { stopPolling(); document.removeEventListener("visibilitychange", handleVisibility); };
  }, []);

  useEffect(() => {
    if (reduceMotion || !isDeliveryActive) {
      setAnimationProgress(isDeliveryActive || status === "delivered" ? 1 : 0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setAnimationProgress(((Date.now() - startedAt) / 18000) % 1);
    }, 80);
    return () => window.clearInterval(timer);
  }, [isDeliveryActive, reduceMotion, status]);

  useEffect(() => {
    setMessageIndex(0);
    const timer = window.setInterval(() => setMessageIndex((value) => value + 1), 6000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (order?.orderNumber || order?.status) rememberOrder(orderId);
  }, [orderId, order?.orderNumber, order?.status]);

  return (
    <main className="mx-auto w-full max-w-md pb-10">
      <section className={`relative overflow-hidden bg-[#eaf3ff] ${isMapActive ? "h-[330px]" : "h-[220px]"}`}>
        <iframe
          title="Peta area pengiriman Mie Yamin"
          src="https://www.openstreetmap.org/export/embed.html?bbox=108.18%2C-7.36%2C108.25%2C-7.28&layer=mapnik"
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/20" />
        <svg viewBox="0 0 400 220" preserveAspectRatio="none" className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity ${isMapActive ? "opacity-100" : "opacity-0"}`}>
          <path d="M186 99 H225 V135 H280 V76 H306" fill="none" stroke="white" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.72" />
          <motion.path d="M186 99 H225 V135 H280 V76 H306" fill="none" stroke="#1a5dc6" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" pathLength={1} initial={{ pathLength: 0 }} animate={{ pathLength: routeProgress }} transition={{ duration: 0.45, ease: "easeOut" }} />
          <circle cx="186" cy="99" r="15" fill="#0f9f88" stroke="white" strokeWidth="4" />
          <foreignObject x="176" y="89" width="20" height="20"><div className="flex h-5 w-5 items-center justify-center text-white"><Store className="h-3.5 w-3.5" /></div></foreignObject>
          <circle cx="306" cy="76" r="15" fill="#49344f" stroke="white" strokeWidth="4" />
          <foreignObject x="296" y="66" width="20" height="20"><div className="flex h-5 w-5 items-center justify-center text-white"><MapPin className="h-3.5 w-3.5" /></div></foreignObject>
          <motion.g animate={{ x: routePoint.x - 236, y: routePoint.y - 132 }} transition={{ duration: 0.35, ease: "easeOut" }}>
            <circle cx="236" cy="132" r="16" fill="#1a5dc6" stroke="white" strokeWidth="4" />
            <foreignObject x="225" y="121" width="22" height="22"><div className="flex h-[22px] w-[22px] items-center justify-center text-white"><Truck className="h-4 w-4" /></div></foreignObject>
            <circle cx="236" cy="132" r="22" fill="none" stroke="#1a5dc6" strokeWidth="2" opacity="0.45"><animate attributeName="r" values="16;27;16" dur="1.8s" repeatCount="indefinite" /></circle>
          </motion.g>
        </svg>
        <div className="absolute left-4 right-4 top-4 flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-primary shadow-sm"><ChevronLeft className="h-5 w-5" /></span><span className="rounded-full bg-white/95 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary shadow-sm">{isDeliveryActive ? "Live delivery" : "Perjalanan pesanan"}</span></div>
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3"><span className="rounded-full bg-white/95 px-3 py-2 text-[10px] font-black text-primary shadow-sm">🏪 {DELIVERY_ORIGIN.label}</span><span className="rounded-full bg-white/95 px-3 py-2 text-[10px] font-black text-primary shadow-sm">{isDeliveryActive ? providerLabel : "Tujuan pengiriman"}</span></div>
      </section>

      <section className="mx-4 mt-4 rounded-[24px] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xl font-black text-foreground">{isDeliveryActive ? `Tiba dalam ~${etaMinutes} menit` : isCompleted ? "Pesanan selesai" : current[1]}</p><p className="mt-1 text-xs font-bold text-muted-foreground">Order #{order?.orderNumber || orderId.slice(-8)} · {order?.status === "paid" || order?.status === "completed" ? "Paid" : "Menunggu pembayaran"}</p></div><span className={`rounded-2xl px-3 py-3 text-center text-[10px] font-black text-white ${isCompleted ? "bg-emerald-500" : "bg-primary"}`}><b className="block text-2xl leading-none">{isCompleted ? "✓" : etaMinutes ?? "—"}</b>{isCompleted ? "DONE" : "MIN"}</span></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-primary" animate={{ width: `${Math.max(8, routeProgress * 100)}%` }} transition={{ duration: 0.45 }} /></div>
        <p className="mt-2 text-[10px] font-medium text-muted-foreground">{isCompleted ? "Pesananmu sudah selesai dan siap kamu olah di rumah." : "Pesananmu sedang diproses. Kami akan memberi tahu setiap perkembangannya."}</p>
      </section>

      {isDeliveryActive ? <section className="mx-4 mt-3 flex items-center gap-3 rounded-[20px] border border-border bg-card p-4 shadow-sm"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Truck className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-black text-foreground">{providerLabel} sedang mengantar pesanan</p><p className="mt-1 text-[11px] font-bold text-muted-foreground">Status pengiriman diperbarui otomatis</p></div><Truck className="h-5 w-5 text-primary" /></section> : null}

      <section className="mx-4 mt-4 rounded-[24px] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Order details</p><h1 className="mt-1 font-display text-2xl font-black tracking-tight">Detail pesanan</h1><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Informasi pembayaran dan pengiriman.</p></div><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><PackageCheck className="h-5 w-5" /></span></div>
        <div className="mt-5 space-y-2"><div className="flex items-center justify-between rounded-2xl bg-muted/45 px-4 py-3 text-xs"><span className="font-bold text-muted-foreground">Order ID</span><b>#{order?.orderNumber || orderId.slice(-8)}</b></div><div className="flex items-center justify-between rounded-2xl bg-muted/45 px-4 py-3 text-xs"><span className="font-bold text-muted-foreground">Payment method</span><b>Mayar</b></div><div className="flex items-center justify-between rounded-2xl bg-muted/45 px-4 py-3 text-xs"><span className="font-bold text-muted-foreground">Estimated delivery</span><b className="max-w-[58%] text-right">{deliveryDate}</b></div><div className="flex items-center justify-between rounded-2xl bg-muted/45 px-4 py-3 text-xs"><span className="font-bold text-muted-foreground">Total amount</span><b className="text-primary">{order?.totalAmount != null ? formatRupiah(Number(order.totalAmount)) : "Memuat..."}</b></div></div><p className="mt-4 flex items-center gap-2 text-[11px] font-bold text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-500" />Status diperbarui otomatis</p>
      </section>

      <section className="mx-4 mt-4 rounded-[20px] border border-primary/15 bg-primary/5 px-4 py-3 text-center"><p className="text-xs font-bold leading-relaxed text-primary">{trackingMessage}</p></section>

      <section className="mx-4 mt-4 rounded-[26px] border border-border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Progress</p><h2 className="mt-1 text-lg font-black">Tahapan pesanan</h2></div><span className="text-xs font-black text-primary">{Math.min(activeIndex + 1, STATUS_STEPS.length)}/{STATUS_STEPS.length}</span></div><div className="mt-4 space-y-3">{STATUS_STEPS.map(([key, label], index) => { const done = index < activeIndex; const active = index === activeIndex; return <div key={key} className="flex items-center gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${active ? "bg-primary text-white shadow-sm" : done ? "bg-primary/10" : "bg-muted text-muted-foreground/70"}`}>{getTrackingEmoji(status, index)}</span><span className={`text-sm font-black ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>{label}</span></div>; })}</div></section>

      {invoiceUrl ? <section className="mx-4 mt-4 rounded-[24px] border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="text-sm font-black text-amber-900">Pembayaran belum selesai?</p><p className="mt-1 text-[11px] leading-relaxed text-amber-800">Gunakan invoice yang sama. Jangan membuat order baru.</p></div></div><div className="mt-3 grid grid-cols-2 gap-2"><a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-xl bg-amber-600 text-xs font-black text-white">Bayar sekarang</a><button type="button" onClick={() => navigator.clipboard?.writeText(invoiceUrl)} className="h-11 rounded-xl border border-amber-300 text-xs font-black text-amber-900">Salin link</button></div></section> : null}
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
      <div className="mt-3 flex gap-2 border-t border-border/70 pt-3"><button type="button" disabled={!order} onClick={() => onReorder(order)} className="h-11 flex-1 rounded-xl border border-primary/30 text-xs font-black text-primary transition active:scale-[.97] disabled:opacity-40">Pesan lagi</button><button type="button" onClick={() => onOpen(reference.orderId)} className="h-11 rounded-xl border border-border px-3 text-xs font-black transition active:scale-[.97]">Tracking</button></div>
    </div>
  );
}

function MyOrders({ onOpen, onNewOrder, onReorder }: { onOpen: (orderId: string) => void; onNewOrder: () => void; onReorder: (order: any) => void }) {
  const [orders, setOrders] = useState<SavedOrderReference[]>(() => readSavedOrders());
  useEffect(() => setOrders(readSavedOrders()), []);
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <div className="mb-5 flex items-end justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Riwayat di perangkat ini</p><h1 className="mt-1 font-display text-2xl font-black">Pesanan Saya</h1><p className="mt-1 text-xs text-muted-foreground">Pilih order untuk melihat status live.</p></div><ClipboardList className="h-7 w-7 text-primary" /></div>
      {orders.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-6 text-center"><p className="text-sm font-black">Belum ada pesanan tersimpan</p><p className="mt-1 text-xs text-muted-foreground">Order baru dari perangkat ini akan muncul di sini.</p><button type="button" onClick={onNewOrder} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-white transition active:scale-[.97]"><Plus className="h-4 w-4" /> Pesan sekarang</button></div> : <div className="space-y-3">{orders.map((reference) => <SavedOrderCard key={reference.orderId} reference={reference} onOpen={onOpen} onReorder={onReorder} />)}</div>}
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
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth();
  const mieYaminSettings = { ...DEFAULT_MIE_YAMIN_SETTINGS, ...(siteSettings?.mieYaminSettings ?? {}) };
  const settingsLoaded = siteSettings != null;
  const [productType, setProductType] = useState<"noodle" | "ready_pack">("noodle");
  const [kg, setKg] = useState(1);
  const [readyPackCount, setReadyPackCount] = useState(1);
  const [repack, setRepack] = useState(false);
  const [deliveryProvider, setDeliveryProvider] = useState<"gojek" | "maxim" | "">("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const checkoutLockRef = useRef(false);
  const checkoutIdempotencyKeyRef = useRef<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const checkoutTopRef = useRef<HTMLElement | null>(null);
  const [pendingPaymentOrderId, setPendingPaymentOrderId] = useState<string | null>(() => readPendingPayment()?.orderId ?? null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [promoRemainingMs, setPromoRemainingMs] = useState(() => Math.max(0, PROMO_END_AT - Date.now()));
  const repackCount = productType === "noodle" && repack ? kg * 10 : 0;
  const noodleTotal = productType === "noodle" ? kg * Number(mieYaminSettings.noodlePricePerKg) : 0;
  const readyPackTotal = productType === "ready_pack" ? readyPackCount * Number(mieYaminSettings.readyPackPrice) : 0;
  const repackTotal = productType === "noodle" && repack ? repackCount * Number(mieYaminSettings.repackFeePer100g) : 0;
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
        if (saved.productType === "noodle" || saved.productType === "ready_pack") setProductType(saved.productType);
        if (Number.isFinite(Number(saved.kg))) setKg(Math.max(minOrderKg, Number(saved.kg)));
        if (Number.isFinite(Number(saved.readyPackCount))) setReadyPackCount(Math.max(1, Number(saved.readyPackCount)));
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
    if (!isAuthenticated || !customer) return;
    setName((value) => value || customer.name || "");
    setEmail((value) => value || customer.email || "");
    setPhone((value) => value || customer.phone || "");
  }, [customer, isAuthenticated]);

  useEffect(() => {
    if (!draftHydrated || pendingPaymentOrderId) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify({
        savedAt: Date.now(), productType, kg, readyPackCount, repack: productType === "noodle" && repack, deliveryProvider, deliveryDate, name, email, phone, address, notes,
      }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftHydrated, pendingPaymentOrderId, productType, kg, readyPackCount, repack, deliveryProvider, deliveryDate, name, email, phone, address, notes]);

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

  async function createPaymentInvoice(orderId: string, idempotencyKey: string) {
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
		orderId: String(orderId),
      idempotencyKey,
      paymentMethod: "qris",
      name: name.trim(), mobile: normalizeMobile(phone), redirectUrl,
      email: email.trim() || undefined,
      description: productType === "noodle" ? `Order Mie Yamin Mentah ${kg} kg${repack ? " + repack 100 gram" : ""}` : `Order Mie Yamin Kemasan Siap Masak ${readyPackCount} pcs`,
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      extraData: { orderId: String(orderId), brandSlug: BRAND_SLUG, businessUnit: BUSINESS_UNIT, deliveryProvider, shippingFee: String(shippingFee), deliveryArea: String(mieYaminSettings.deliveryArea) },
      items: [
        ...(productType === "noodle" ? [{ quantity: kg, rate: Number(mieYaminSettings.noodlePricePerKg), description: `Mie Yamin Mentah ${kg} kg` }] : [{ quantity: readyPackCount, rate: Number(mieYaminSettings.readyPackPrice), description: `Mie Yamin Kemasan Siap Masak ${readyPackCount} pcs` }]),
        ...(productType === "noodle" && repack ? [{ quantity: repackCount, rate: Number(mieYaminSettings.repackFeePer100g), description: `Jasa repack 100 gram ${repackCount} pcs` }] : []),
        ...(shippingFee > 0 ? [{ quantity: 1, rate: shippingFee, description: "Biaya pengiriman" }] : []),
      ],
    });
    if (!invoice?.data?.link || !invoice?.data?.id) throw new Error("Invoice pembayaran belum tersedia.");
    savePendingPayment({ orderId: String(orderId), invoiceId: String(invoice.data.id), link: invoice.data.link, expiresAt: Date.now() + 24 * 60 * 60 * 1000, idempotencyKey });
    await attachInvoiceAndRedirect(String(orderId), invoice.data);
  }

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [checkoutStep]);

  function validateCheckoutStep(step: 1 | 2 | 3) {
    if (!settingsLoaded) {
      toast.error("Harga dan ketersediaan sedang dimuat. Tunggu sebentar lalu coba lagi.");
      return false;
    }
    if (step === 1) {
      if (productType === "noodle" && kg < minOrderKg) {
        toast.error(`Minimum order adalah ${minOrderKg} kg.`);
        return false;
      }
      if (productType === "ready_pack" && readyPackCount < 1) {
        toast.error("Pilih minimal 1 kemasan siap masak.");
        return false;
      }
      return true;
    }
    if (step === 2) {
      if (!mieYaminSettings.enabledProviders.length) {
        toast.error("Provider pengiriman sedang tidak tersedia. Hubungi admin untuk bantuan.");
        return false;
      }
      if (!deliveryProvider || !deliveryDate) {
        toast.error("Pilih kurir dan tanggal pengiriman terlebih dahulu.");
        return false;
      }
      return true;
    }
    const mobile = normalizeMobile(phone);
    if (!name.trim() || !phone.trim() || !address.trim()) {
      toast.error("Lengkapi nama, WhatsApp, dan alamat penerima terlebih dahulu.");
      return false;
    }
    if (mobile.length < 10) {
      toast.error("Nomor WhatsApp harus minimal 10 digit, contoh: 081234567890.");
      return false;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Format email belum benar.");
      return false;
    }
    return true;
  }

  function continueCheckout() {
    if (!validateCheckoutStep(checkoutStep)) return;
    if (checkoutStep < 3) {
      setCheckoutStep((value) => (value + 1) as 1 | 2 | 3);
      return;
    }
    setReviewOpen(true);
  }

  async function confirmSubmit() {
    if (authLoading || !isAuthenticated || !customer) {
      redirectToCustomerLogin(`${window.location.origin}/?stage=order`);
      return;
    }
    if (checkoutLockRef.current) return;
    checkoutLockRef.current = true;
    checkoutIdempotencyKeyRef.current = checkoutIdempotencyKeyRef.current ?? (globalThis.crypto?.randomUUID?.() || `ordermieyamin-b2b-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setCheckoutError(null);
    setSubmitting(true);
    try {
      const checkoutKey = checkoutIdempotencyKeyRef.current;
      const orderId = await createOrder({
        items: [
          ...(productType === "noodle" ? [{ productName: "Mie Yamin Mentah", variant: `${kg} kg`, quantity: kg, price: Number(mieYaminSettings.noodlePricePerKg), originalPrice: NORMAL_NOODLE_PRICE_PER_KG }] : [{ productName: "Mie Yamin Kemasan Siap Masak", variant: `${readyPackCount} pcs`, quantity: readyPackCount, price: Number(mieYaminSettings.readyPackPrice), originalPrice: Number(mieYaminSettings.readyPackPrice) }]),
          ...(productType === "noodle" && repack ? [{ productName: "Jasa repack 100 gram", variant: `${repackCount} pcs`, quantity: repackCount, price: Number(mieYaminSettings.repackFeePer100g), originalPrice: Number(mieYaminSettings.repackFeePer100g) }] : []),
          ...(shippingFee > 0 ? [{ productName: "Biaya pengiriman", variant: deliveryProvider, quantity: 1, price: shippingFee, originalPrice: shippingFee }] : []),
        ],
        totalAmount: total,
        // Keep the persisted method aligned with the customer QRIS checkout.
        paymentMethod: "qris",
        idempotencyKey: checkoutIdempotencyKeyRef.current,
        customerName: name.trim(),
        customerEmail: email.trim() || null,
        customerSourceId: customer.sourceId,
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
      checkoutIdempotencyKeyRef.current = null;
      await createPaymentInvoice(String(orderId), checkoutKey);
    } catch (e) {
      const message = getCheckoutErrorMessage(e, "Checkout gagal. Coba lagi.");
      setCheckoutError(message);
      toast.error(message);
    } finally {
      checkoutLockRef.current = false;
      setSubmitting(false);
    }
  }

  async function retryPayment() {
    if (!pendingPaymentOrderId) return;
    if (checkoutLockRef.current) return;
    checkoutLockRef.current = true;
    setCheckoutError(null);
    setSubmitting(true);
    try {
      const saved = readPendingPayment();
      const idempotencyKey = String(saved?.idempotencyKey || "");
      if (!idempotencyKey) throw new Error("Checkout authorization tidak ditemukan. Buat order baru.");
      await createPaymentInvoice(pendingPaymentOrderId, idempotencyKey);
    } catch (e) {
      const message = getCheckoutErrorMessage(e, "Invoice belum berhasil dibuat. Coba lagi.");
      setCheckoutError(message);
      toast.error(message);
    } finally {
      checkoutLockRef.current = false;
      setSubmitting(false);
    }
  }

  if (siteSettings === null) {
    return <main className="mx-auto w-full max-w-md px-4 py-8"><div className="rounded-[28px] border border-red-200 bg-card p-5 text-center"><p className="text-sm font-black text-red-700">Harga belum dapat dimuat</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Kami tidak akan melanjutkan checkout dengan harga yang belum terverifikasi.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 h-11 rounded-xl bg-primary px-5 text-xs font-black text-white">Coba muat ulang</button></div></main>;
  }
  if (!settingsLoaded) {
    return <main className="mx-auto w-full max-w-md px-4 py-8"><div className="animate-pulse rounded-[28px] border border-border bg-card p-5"><div className="h-5 w-2/3 rounded bg-muted" /><div className="mt-3 h-3 w-full rounded bg-muted" /><div className="mt-2 h-3 w-5/6 rounded bg-muted" /><div className="mt-8 h-28 rounded-2xl bg-muted" /><div className="mt-4 h-12 rounded-2xl bg-muted" /></div><p className="mt-4 text-center text-xs text-muted-foreground">Memuat harga dan ketersediaan terbaru...</p></main>;
  }

  const stepLabels = ["Produk", "Pengiriman", "Penerima"] as const;
  const selectedDateLabel = deliveryDate
    ? new Date(`${deliveryDate}T12:00:00+07:00`).toLocaleDateString("id-ID", { dateStyle: "long" })
    : "Belum dipilih";

  return (
    <main ref={checkoutTopRef} className="mx-auto w-full max-w-md scroll-mt-20 px-4 py-5 pb-32 md:pb-6">
      {checkoutStep === 1 ? null : <section className="mb-4 flex items-center justify-between rounded-[24px] border border-border bg-card p-4 shadow-sm"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Djiwa Tentram B2B</p><p className="mt-1 text-base font-black">Order Mie Yamin</p></div><Package className="h-5 w-5 text-primary" /></section>}
      {checkoutStep === 1 ? <section className="mie-yamin-hero mb-3 overflow-hidden rounded-[20px] border border-border bg-card shadow-sm"><img src="/mie-yamin-product.png" alt="Mie Yamin mentah" className="mie-yamin-hero-image h-36 w-full object-cover" /><div className="flex items-center justify-between gap-3 px-3.5 py-2.5"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">Produk unggulan</p><p className="mt-0.5 text-sm font-black">Mie Yamin Mentah</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">Fresh dibuat</span></div></section> : null}

      <section className="checkout-stepper mb-3"><div className="flex items-center justify-between text-[10px] font-black text-muted-foreground">{stepLabels.map((label, index) => { const step = (index + 1) as 1 | 2 | 3; const active = checkoutStep === step; const complete = checkoutStep > step; return <button key={label} type="button" onClick={() => complete && setCheckoutStep(step)} disabled={!complete && !active} className={`flex items-center gap-1.5 transition active:scale-[.97] ${active ? "text-primary" : complete ? "text-foreground" : "text-muted-foreground/50"}`}><span className={`flex h-8 w-8 items-center justify-center rounded-full border text-[11px] ${active ? "border-primary bg-primary text-white" : complete ? "border-primary/30 bg-primary/10 text-primary" : "border-border"}`}>{complete ? <Check className="h-3.5 w-3.5" /> : step}</span><span className="hidden xs:inline">{label}</span></button>; })}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(checkoutStep / 3) * 100}%` }} /></div></section>

      <div className={`space-y-4 ${checkoutStep === 1 ? "rounded-[30px] border-0 bg-transparent p-0 shadow-none" : "rounded-[28px] border border-border bg-card p-5 shadow-sm"}`}>
        {checkoutStep === 1 ? <section aria-labelledby="product-step-title" className="product-step space-y-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Langkah 1 dari 3</p></div>
          <div><div className="mb-2.5"><p className="text-[13px] font-black">Pilih satu produk</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">Pilih mie mentah kiloan atau kemasan siap masak. Keduanya tidak digabung dalam satu order.</p></div><div className="mie-yamin-product-list space-y-3"><button type="button" onClick={() => { setProductType("noodle"); setReadyPackCount(0); }} className={`mie-yamin-product-card grid w-full grid-cols-[6rem_minmax(0,1fr)_2rem] items-start gap-3 rounded-[20px] border p-3.5 text-left transition ${productType === "noodle" ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background"}`}><img src="/mie-yamin-product.png" alt="Mie Yamin Mentah Kiloan" className="mie-yamin-product-image h-24 w-24 shrink-0 rounded-[18px] object-cover" style={{ width: "6rem", height: "6rem", maxWidth: "6rem", objectFit: "cover" }} /><div className="min-w-0 flex-1"><div><p className="text-[13px] font-black">Mie Yamin Mentah Kiloan</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Minimum {minOrderKg} kg · {formatRupiah(Number(mieYaminSettings.noodlePricePerKg))} / kg</p></div></div><span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${productType === "noodle" ? "border-primary" : "border-border"}`}>{productType === "noodle" ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}</span>{productType === "noodle" ? <div className="mt-4 flex items-center justify-between rounded-2xl bg-muted/50 p-3"><span className="text-xs font-bold">Jumlah mie</span><div className="flex items-center gap-2"><button type="button" aria-label="Kurangi jumlah mie" onClick={(event) => { event.stopPropagation(); setKg(Math.max(minOrderKg, kg - 1)); }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-lg font-black transition active:scale-[.97]">−</button><output className="min-w-16 text-center text-base font-black" aria-live="polite">{kg} kg</output><button type="button" aria-label="Tambah jumlah mie" onClick={(event) => { event.stopPropagation(); setKg(kg + 1); }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-lg font-black transition active:scale-[.97]">+</button></div></div> : null}</button><button type="button" onClick={() => { setProductType("ready_pack"); setReadyPackCount((value) => Math.max(1, value)); setRepack(false); }} className={`mie-yamin-product-card grid w-full grid-cols-[6rem_minmax(0,1fr)_2rem] items-start gap-3 rounded-[20px] border p-3.5 text-left transition ${productType === "ready_pack" ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background"}`}><img src="/mie-yamin-product.png" alt="Mie Yamin Kemasan Siap Masak" className="mie-yamin-product-image h-24 w-24 shrink-0 rounded-[18px] object-cover" style={{ width: "6rem", height: "6rem", maxWidth: "6rem", objectFit: "cover" }} /><div className="min-w-0 flex-1"><div><p className="text-[13px] font-black">Mie Yamin Kemasan Siap Masak</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Praktis untuk langsung dimasak · {formatRupiah(Number(mieYaminSettings.readyPackPrice))} / pcs</p></div></div><span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${productType === "ready_pack" ? "border-primary" : "border-border"}`}>{productType === "ready_pack" ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}</span>{productType === "ready_pack" ? <div className="mt-4 flex items-center justify-between rounded-2xl bg-muted/50 p-3"><span className="text-xs font-bold">Jumlah kemasan</span><div className="flex items-center gap-2"><button type="button" aria-label="Kurangi kemasan" onClick={(event) => { event.stopPropagation(); setReadyPackCount(Math.max(1, readyPackCount - 1)); }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-lg font-black transition active:scale-[.97]">−</button><output className="min-w-16 text-center text-base font-black" aria-live="polite">{readyPackCount} pcs</output><button type="button" aria-label="Tambah kemasan" onClick={(event) => { event.stopPropagation(); setReadyPackCount(readyPackCount + 1); }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-lg font-black transition active:scale-[.97]">+</button></div></div> : null}</button></div></div>{productType === "noodle" ? <label className={`flex cursor-pointer items-start gap-3 rounded-[22px] border p-4 transition ${repack ? "border-primary bg-primary/5" : "border-border bg-background"}`}><input checked={repack} onChange={(e) => setRepack(e.target.checked)} type="checkbox" className="mt-1 h-4 w-4 accent-primary" /><span className="flex-1"><b className="block text-[13px]">Repack dari mie kiloan</b><span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{formatRupiah(Number(mieYaminSettings.repackFeePer100g))} / 100 gram · {kg} kg menjadi {repackCount} pcs</span>{repack ? <span className="mt-2 block text-xs font-black text-primary">Biaya layanan: {formatRupiah(repackTotal)}</span> : null}</span><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /></label> : null}
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-primary/5 p-3 text-[10px] font-semibold text-muted-foreground"><span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Produksi sendiri</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Status live</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Minimum {minOrderKg} kg</span><span className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />Ongkir promo</span></div>
          <div className="hidden rounded-2xl bg-muted/50 p-3.5 md:flex md:items-center md:justify-between"><span className="text-xs font-bold">Total sementara</span><b className="text-lg text-primary">{formatRupiah(total)}</b></div>
          <button type="button" onClick={continueCheckout} className="hidden h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-xs font-black text-white transition active:scale-[.97] md:flex">Lanjutkan ke pengiriman <ChevronRight className="h-4 w-4" /></button>
        </section> : null}

        {checkoutStep === 2 ? <section aria-labelledby="delivery-step-title" className="space-y-5"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Langkah 2 dari 3</p><h2 id="delivery-step-title" className="mt-1 font-display text-2xl font-black">Pilih pengiriman</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Atur kurir dan jadwal pengiriman ke area {String(mieYaminSettings.deliveryArea)}.</p></div><div><p className="mb-3 text-sm font-black">Pilih kurir</p><div className="grid grid-cols-2 gap-3">{(["gojek", "maxim"] as const).filter((provider) => mieYaminSettings.enabledProviders.includes(provider)).map((provider) => <button key={provider} type="button" onClick={() => setDeliveryProvider(provider)} className={`min-h-[92px] rounded-[22px] border p-4 text-left transition active:scale-[.97] ${deliveryProvider === provider ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background"}`}><div className="flex items-center justify-between"><span className="text-sm font-black">{provider === "gojek" ? "Gojek" : "Maxim"}</span><Truck className={`h-5 w-5 ${deliveryProvider === provider ? "text-primary" : "text-muted-foreground"}`} /></div><span className="mt-2 block text-[11px] leading-relaxed text-muted-foreground">{mieYaminSettings.freeShippingPromo ? "Ongkir gratis selama promo" : shippingFee > 0 ? formatRupiah(shippingFee) : "Dikonfirmasi admin"}</span></button>)}</div></div><div><p className="mb-3 flex items-center gap-2 text-sm font-black"><CalendarDays className="h-4 w-4 text-primary" />Tanggal pengiriman</p><button type="button" onClick={() => setCalendarOpen(true)} className="flex min-h-[76px] w-full items-center justify-between rounded-[22px] border border-border bg-background px-4 text-left transition active:scale-[.99]"><span><span className="block text-sm font-black">{deliveryDate ? selectedDateLabel : "Pilih tanggal pengiriman"}</span><span className="mt-1 block text-[11px] text-muted-foreground">Besok, lusa, atau tanggal lain</span></span><CalendarDays className="h-5 w-5 text-primary" /></button></div><div className="rounded-[22px] bg-muted/50 p-4 text-xs"><div className="flex justify-between"><span>Isi pesanan</span><b>{productType === "noodle" ? `${kg} kg mie mentah` : `${readyPackCount} pcs kemasan siap masak`}</b></div><div className="mt-2 flex justify-between"><span>Kurir</span><b>{deliveryProvider ? (deliveryProvider === "gojek" ? "Gojek" : "Maxim") : "Belum dipilih"}</b></div><div className="mt-2 flex justify-between"><span>Tanggal</span><b className="max-w-[55%] text-right">{deliveryDate ? selectedDateLabel : "Belum dipilih"}</b></div></div><div className="hidden grid-cols-2 gap-3 md:grid"><button type="button" onClick={() => setCheckoutStep(1)} className="h-12 rounded-2xl border border-border text-sm font-black transition active:scale-[.97]">Kembali</button><button type="button" onClick={continueCheckout} className="h-12 rounded-2xl bg-primary text-sm font-black transition active:scale-[.97] text-white">Lanjutkan <ChevronRight className="ml-1 inline h-4 w-4" /></button></div></section> : null}

        {checkoutStep === 3 ? <section aria-labelledby="recipient-step-title" className="space-y-5"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Langkah 3 dari 3</p><h2 id="recipient-step-title" className="mt-1 font-display text-2xl font-black">Data penerima</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Data ini digunakan kurir untuk mengantar pesanan.</p></div><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Nama penerima<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap penerima" className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" /></label><label className="text-sm font-bold">WhatsApp<input autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Contoh: 082112345678" className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" /></label></div><label className="block text-sm font-bold">Alamat lengkap<textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={4} placeholder="Nama jalan, nomor rumah, patokan terdekat, kecamatan" className="mt-2 w-full rounded-2xl border border-border bg-background p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" /></label><label className="block text-sm font-bold">Catatan pengiriman <span className="font-normal text-muted-foreground">(opsional)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Contoh: titip di satpam" className="mt-2 w-full rounded-2xl border border-border bg-background p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" /></label><label className="block text-sm font-bold">Email <span className="font-normal text-muted-foreground">(opsional, untuk bukti pembayaran)</span><input autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" className="mt-2 h-12 w-full rounded-2xl border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" /></label></div>
          {checkoutError ? <div role="alert" className="space-y-3 rounded-[22px] border border-red-200 bg-red-50 p-4"><div><p className="text-sm font-black text-red-800">Checkout belum berhasil</p><p className="mt-1 text-xs leading-relaxed text-red-700">{checkoutError}</p></div>{supportHref ? <a href={supportHref} target="_blank" rel="noopener noreferrer" className="flex h-11 w-full items-center justify-center rounded-xl bg-emerald-600 text-xs font-black text-white transition active:scale-[.97]">Chat WhatsApp admin</a> : null}</div> : null}
          {reviewOpen ? <div className="space-y-4 rounded-[24px] border border-primary/20 bg-primary/5 p-4"><div><p className="text-base font-black text-primary">Review pesanan</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Pastikan seluruh data sudah benar sebelum lanjut ke pembayaran.</p></div><div className="space-y-2 text-xs">{productType === "noodle" ? <div className="flex justify-between"><span>Mie Yamin Mentah Kiloan</span><b>{kg} kg · {formatRupiah(noodleTotal)}</b></div> : <div className="flex justify-between"><span>Mie Yamin Kemasan Siap Masak</span><b>{readyPackCount} pcs · {formatRupiah(readyPackTotal)}</b></div>}{productType === "noodle" && repack ? <div className="flex justify-between"><span>Jasa repack</span><b>{repackCount} pcs · {formatRupiah(repackTotal)}</b></div> : null}<div className="flex justify-between"><span>Pengiriman</span><b>{deliveryProvider === "gojek" ? "Gojek" : "Maxim"} · {selectedDateLabel}</b></div><div className="border-t border-primary/15 pt-2"><p className="font-bold">{name} · {phone}</p><p className="mt-1 break-words text-muted-foreground">{address}</p>{notes.trim() ? <p className="mt-1 text-muted-foreground">Catatan: {notes}</p> : null}{email.trim() ? <p className="mt-1 text-muted-foreground">Bukti pembayaran: {email}</p> : null}</div></div><div className="flex items-center justify-between border-t border-primary/15 pt-3"><span className="font-black">Total</span><b className="text-lg text-primary">{formatRupiah(total)}</b></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setReviewOpen(false)} className="h-11 rounded-xl border border-border bg-background text-xs font-black transition active:scale-[.97]">Kembali edit</button><button type="button" disabled={submitting} onClick={confirmSubmit} className="h-11 rounded-xl bg-primary text-xs font-black text-white transition active:scale-[.97] disabled:opacity-50">{submitting ? "Menyiapkan..." : "Konfirmasi & bayar"}</button></div></div> : null}
          {pendingPaymentOrderId ? <div className="space-y-3 rounded-[22px] border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="text-sm font-black text-amber-900">Order sudah tersimpan</p><p className="mt-1 text-[11px] leading-relaxed text-amber-800">Invoice pembayaran belum berhasil dibuat. Gunakan order yang sama agar tidak membuat pesanan ganda.</p></div></div><button type="button" disabled={submitting} onClick={retryPayment} className="h-11 w-full rounded-xl bg-amber-600 text-xs font-black text-white transition active:scale-[.97] disabled:opacity-50">{submitting ? "Mencoba lagi..." : "Coba buat pembayaran lagi"}</button>{supportHref ? <a href={supportHref} target="_blank" rel="noopener noreferrer" className="flex h-11 w-full items-center justify-center rounded-xl border border-amber-300 text-xs font-black text-amber-900">Chat WhatsApp admin</a> : null}</div> : null}
          {!reviewOpen && !pendingPaymentOrderId ? <div className="hidden grid-cols-2 gap-3 md:grid"><button type="button" onClick={() => setCheckoutStep(2)} className="h-12 rounded-2xl border border-border text-sm font-black transition active:scale-[.97]">Kembali</button><button type="button" disabled={submitting} onClick={continueCheckout} className="h-12 rounded-2xl bg-primary text-sm font-black text-white transition active:scale-[.97] disabled:opacity-50">Review pesanan <ChevronRight className="ml-1 inline h-4 w-4" /></button></div> : null}
        </section> : null}
      </div>

      {!reviewOpen && !pendingPaymentOrderId ? <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background/95 px-4 py-3 shadow-[0_-8px_24px_rgba(9,9,11,0.08)] backdrop-blur-xl md:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}><div className="mx-auto flex max-w-md items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Total pesanan</p><p className="truncate text-lg font-black text-primary">{formatRupiah(total)}</p></div><button type="button" disabled={submitting} onClick={continueCheckout} className="h-12 shrink-0 rounded-2xl bg-primary px-5 text-xs font-black text-white transition active:scale-[.97] disabled:opacity-50">{checkoutStep === 1 ? "Lanjutkan" : checkoutStep === 2 ? "Lanjutkan" : "Review pesanan"}</button></div></div> : null}
      {calendarOpen ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCalendarOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="calendar-sheet-title" className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"><div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" /><div className="flex items-center justify-between"><div><p id="calendar-sheet-title" className="font-display text-lg font-black">Pilih tanggal pengiriman</p><p className="mt-1 text-xs text-muted-foreground">Pesanan dikirim ke area {String(mieYaminSettings.deliveryArea)}</p></div><button type="button" aria-label="Tutup kalender" onClick={() => setCalendarOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-xl transition active:scale-[.97]">×</button></div><div className="mt-3"><CalendarDatePicker value={deliveryDate} onChange={(date) => { setDeliveryDate(date); setCalendarOpen(false); }} minDate={minDate} maxOrdersPerDate={maxOrdersPerDate} /></div></div></div> : null}
    </main>
  );
}

function OrderMieYaminPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const orderId = search.orderId;
  const isTracking = search.stage === "tracking" && Boolean(orderId);
  const isOrders = search.stage === "orders";
  return <div className="ordermieyamin-app min-h-app bg-background font-sans text-foreground"><header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl"><div className="mx-auto flex max-w-md items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white"><Package className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Djiwa Tentram</p><p className="truncate text-sm font-black">Order Mie Yamin B2B</p></div><button type="button" onClick={() => navigate({ to: "/", search: { stage: isOrders ? "order" : "orders" } })} className="ml-auto flex h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-[11px] font-black text-primary transition active:scale-[.97]">{isOrders ? <><Plus className="h-3.5 w-3.5" /> Pesan baru</> : <><ClipboardList className="h-3.5 w-3.5" /> Pesanan saya</>}</button></div></header>{isTracking && orderId ? <><Tracking orderId={orderId} /><div className="mx-auto flex max-w-md gap-2 px-4 pb-8"><button type="button" onClick={() => navigate({ to: "/", search: { stage: "order" } })} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-white transition active:scale-[.97]"><Plus className="h-4 w-4" /> Pesan lagi</button><button type="button" onClick={() => navigate({ to: "/", search: { stage: "orders" } })} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-border px-4 text-sm font-black transition active:scale-[.97]"><ClipboardList className="h-4 w-4" /> Semua</button></div></> : isOrders ? <MyOrders onOpen={(id) => navigate({ to: "/", search: { stage: "tracking", orderId: id } })} onNewOrder={() => navigate({ to: "/", search: { stage: "order" } })} onReorder={(order) => { window.localStorage.setItem(DRAFT_ORDER_KEY, JSON.stringify(buildReorderDraft(order))); navigate({ to: "/", search: { stage: "order" } }); }} /> : <OrderForm />}</div>;
}
