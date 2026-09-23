import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays, ExternalLink, ShoppingBag, Sparkles, Users } from "lucide-react";
import { useMemo } from "react";
import { useHybridOrders } from "@/hooks/use-hybrid-pos-data";
import { useHybridBookingOrders } from "@/hooks/use-hybrid-booking-data";
import { useCustomerAppAnalytics } from "@/hooks/use-customer-app-analytics";

type AnyRecord = Record<string, any>;

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
}

function dateValue(value: unknown) {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0 ? new Date(numeric) : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isToday(value: unknown) {
  const time = dateValue(value);
  if (!time) return false;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(time)) === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function isMieYamin(order: AnyRecord) {
  return String(order.businessUnit ?? order.business_unit ?? "").toLowerCase() === "ordermieyamin";
}

function SourceCard({ label, value, detail, icon: Icon, tone, to }: { label: string; value: string | number; detail: string; icon: typeof Users; tone: string; to: string }) {
  return (
    <Link to={to as any} className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span></div>
      <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-black text-primary">Buka data <ArrowUpRight className="h-3 w-3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
    </Link>
  );
}

export function KolMarketingOverview() {
  const allOrders = useHybridOrders() as AnyRecord[] | undefined;
  const bookingOrders = useHybridBookingOrders({ slug: "booking" }) as AnyRecord[] | undefined;
  const customer = useCustomerAppAnalytics("this_week");
  const mieOrders = useMemo(() => (allOrders ?? []).filter(isMieYamin), [allOrders]);
  const bookingToday = useMemo(() => (bookingOrders ?? []).filter((row) => isToday(row.createdAt ?? row._creationTime ?? row.bookingDate)).length, [bookingOrders]);
  const paidMie = useMemo(() => mieOrders.filter((row) => ["paid", "completed"].includes(String(row.status).toLowerCase())).reduce((sum, row) => sum + Number(row.totalAmount || 0), 0), [mieOrders]);
  const customerData = customer.data;

  return (
    <section className="mb-5 space-y-4 rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-sky-700"><Sparkles className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-[0.18em]">Marketing Intelligence</span></div><h1 className="mt-1 text-xl font-black tracking-tight md:text-2xl">KOL Marketing lintas aplikasi</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Satu workspace untuk melihat data creator sekaligus dampaknya di Booking App, Order Mie Yamin App, dan Djiwa App.</p></div><a href="https://kolmarketing.yumme.id/dashboard" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-xs font-black text-sky-700 shadow-sm">Workspace khusus <ExternalLink className="h-3.5 w-3.5" /></a></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SourceCard label="Booking App" value={bookingToday} detail="booking masuk hari ini" icon={CalendarDays} tone="bg-sky-100 text-sky-700" to="/admin/booking" />
        <SourceCard label="Order Mie Yamin" value={mieOrders.length} detail={`${rupiah(paidMie)} order terbayar`} icon={ShoppingBag} tone="bg-violet-100 text-violet-700" to="/admin/order-mie-yamin" />
        <SourceCard label="Djiwa App" value={customerData?.activeCustomers ?? "—"} detail={customerData ? `${customerData.appOrders} order Customer App minggu ini` : "Memuat analytics Customer App"} icon={Users} tone="bg-cyan-100 text-cyan-700" to="/admin/djiwa-app" />
        <SourceCard label="Aktivitas App" value={customerData?.activeInPeriod ?? "—"} detail={customerData ? `${rupiah(customerData.appSpending)} spending minggu ini` : "Data akan tampil setelah tersambung"} icon={Sparkles} tone="bg-indigo-100 text-indigo-700" to="/admin/djiwa-app" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sky-100 pt-3 text-[11px] font-semibold text-muted-foreground"><span>Data live dari modul Admin yang sudah ada</span><span className="inline-flex items-center gap-1 text-emerald-700">● Tidak membuat tabel duplikat</span><Link to="/admin/kol" className="inline-flex items-center gap-1 font-black text-primary">Kelola data KOL <ArrowUpRight className="h-3 w-3" /></Link></div>
    </section>
  );
}
