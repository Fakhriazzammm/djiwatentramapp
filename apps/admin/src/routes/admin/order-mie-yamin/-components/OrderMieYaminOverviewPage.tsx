import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Clock3, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { useMemo } from "react";
import { useHybridOrders } from "@/hooks/use-hybrid-pos-data";

function isMieYaminOrder(order: any) {
  return String(order?.businessUnit ?? order?.business_unit ?? "").toLowerCase() === "ordermieyamin";
}

function rupiah(value: number) {
  return `Rp${Number(value || 0).toLocaleString("id-ID")}`;
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof ShoppingBag; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></div>
      <p className="mt-4 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}

export function OrderMieYaminOverviewPage() {
  const allOrders = useHybridOrders() as any[] | undefined;
  const orders = useMemo(() => (allOrders ?? []).filter(isMieYaminOrder), [allOrders]);
  const stats = useMemo(() => {
    const active = orders.filter((order) => !["delivered", "cancelled"].includes(String(order.deliveryStatus ?? order.delivery_status)));
    const pendingPayment = orders.filter((order) => !["paid", "completed"].includes(String(order.status)));
    const ready = orders.filter((order) => String(order.deliveryStatus ?? order.delivery_status) === "ready_to_ship");
    const completedToday = orders.filter((order) => {
      const created = new Date(Number(order.createdAt) || String(order.createdAt || ""));
      const now = new Date();
      return created.toDateString() === now.toDateString() && String(order.deliveryStatus ?? order.delivery_status) === "delivered";
    });
    const revenue = orders.filter((order) => ["paid", "completed"].includes(String(order.status))).reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    return { active, pendingPayment, ready, completedToday, revenue };
  }, [orders]);

  if (allOrders === undefined) {
    return <div className="grid gap-3 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-muted" />)}</div>;
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Order Mie Yamin App</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight md:text-3xl">Dashboard operasional</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pantau pembayaran, proses pesanan, dan pengiriman dari satu workspace.</p>
        </div>
        <Link to="/admin/order-mie-yamin/orders" className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition active:scale-[.97]">
          Buka pesanan <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={ShoppingBag} label="Total order" value={orders.length} tone="bg-primary/10 text-primary" />
        <StatCard icon={Clock3} label="Menunggu pembayaran" value={stats.pendingPayment.length} tone="bg-amber-100 text-amber-700" />
        <StatCard icon={PackageCheck} label="Order aktif" value={stats.active.length} tone="bg-blue-100 text-blue-700" />
        <StatCard icon={Truck} label="Siap dikirim" value={stats.ready.length} tone="bg-emerald-100 text-emerald-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-bold">Prioritas hari ini</h2><p className="mt-1 text-xs text-muted-foreground">Action yang paling perlu ditindaklanjuti operator.</p></div>
            <Link to="/admin/order-mie-yamin/delivery" className="text-xs font-bold text-primary">Lihat pengiriman</Link>
          </div>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm"><span className="flex items-center gap-2 font-medium text-amber-900"><Clock3 className="h-4 w-4" /> Pembayaran perlu dicek</span><strong className="text-amber-900">{stats.pendingPayment.length}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3 text-sm"><span className="flex items-center gap-2 font-medium text-blue-900"><PackageCheck className="h-4 w-4" /> Order sedang diproses</span><strong className="text-blue-900">{stats.active.length}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm"><span className="flex items-center gap-2 font-medium text-emerald-900"><CheckCircle2 className="h-4 w-4" /> Selesai hari ini</span><strong className="text-emerald-900">{stats.completedToday.length}</strong></div>
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">Nilai order terbayar</p>
          <p className="mt-2 text-2xl font-black tracking-tight">{rupiah(stats.revenue)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Akumulasi dari order Mie Yamin yang berstatus paid/completed.</p>
          <div className="mt-5 border-t border-border pt-4"><p className="text-xs font-medium text-muted-foreground">Langkah berikutnya</p><div className="mt-3 space-y-2"><Link to="/admin/order-mie-yamin/settings" className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm font-bold hover:bg-muted">Cek konfigurasi <ArrowRight className="h-4 w-4" /></Link><Link to="/admin/order-mie-yamin/orders" className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm font-bold hover:bg-muted">Kelola order <ArrowRight className="h-4 w-4" /></Link></div></div>
        </section>
      </div>
    </div>
  );
}
