import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Eye, EyeOff, Package, RefreshCw, ShoppingBag, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { formatTimeWIB, getWibDayRange } from "@/lib/wib-utils";
import HourlyTransactionAnalysis from "@/routes/admin/-HourlyTransactionAnalysis";
import { triggerHybridRefresh, useHybridDashboardStats, useHybridOrders, useHybridShiftStatus } from "@/hooks/use-hybrid-pos-data";

const periodItems = [
  ["today", "Hari ini"], ["yesterday", "Kemarin"], ["thisWeek", "Minggu ini"],
  ["lastWeek", "Minggu lalu"], ["thisMonth", "Bulan ini"], ["lastMonth", "Bulan lalu"],
] as const;
type PeriodKey = (typeof periodItems)[number][0];
type Stats = NonNullable<ReturnType<typeof useHybridDashboardStats>>;

const money = (value: number) => formatCurrencyIDR(Number.isFinite(value) ? value : 0);
function delta(current: number, previous: number) { if (!previous) return current ? "baru" : "—"; const value = Math.round(((current - previous) / previous) * 100); return `${value > 0 ? "+" : ""}${value}%`; }
function methodLabel(method: string) { return ({ cash: "Tunai", qris: "QRIS", transfer: "Transfer", djiwa_pay: "Djiwa Pay", ewallet: "E-Wallet", gateway: "Gateway" } as Record<string, string>)[method] ?? method.replaceAll("_", " "); }
function CompactSkeleton() { return <div className="space-y-3"><Skeleton className="h-12 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /><div className="grid grid-cols-2 gap-2"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div></div>; }
function Delta({ value }: { value: string }) { const positive = value.startsWith("+"); const negative = value.startsWith("-"); return <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${positive ? "bg-[#eaf8ef] text-[#248a3d]" : negative ? "bg-[#fff0ef] text-[#d70015]" : "bg-[#f2f2f7] text-[#6e6e73]"}`}>{positive && <ArrowUpRight className="h-3 w-3" />}{negative && <ArrowDownRight className="h-3 w-3" />}{value}</span>; }
function PeriodTile({ label, data, previous, emphasis, hidden }: { label: string; data: { orders: number; revenue: number }; previous?: { orders: number; revenue: number }; emphasis?: boolean; hidden?: boolean }) { return <div className={`rounded-[16px] border p-2.5 ${emphasis ? "border-[#007aff]/20 bg-[#f0f6ff]" : "border-black/[0.08] bg-white"}`}><div className="flex items-center justify-between gap-2"><p className="truncate text-[11px] font-semibold text-[#6e6e73]">{label}</p><span className="text-[10px] text-[#8e8e93]">{hidden ? "***" : `${data.orders} order`}</span></div><p className="mt-1 truncate text-[15px] font-bold tracking-[-0.02em] text-[#1d1d1f] tabular-nums">{hidden ? "***" : money(data.revenue)}</p>{previous && !hidden && <Delta value={delta(data.revenue, previous.revenue)} />}</div>; }
function Stat({ label, value, sub, icon: Icon, tone = "blue", hidden }: { label: string; value: string; sub: string; icon: typeof ShoppingBag; tone?: string; hidden?: boolean }) { return <div className="rounded-[17px] border border-black/[0.08] bg-white p-2.5 shadow-[0_4px_16px_rgba(0,0,0,.045)]"><div className="flex items-center justify-between"><span className={`flex h-7 w-7 items-center justify-center rounded-[10px] ${tone}`}><Icon className="h-3.5 w-3.5" /></span><span className="max-w-[90px] truncate text-[10px] text-[#8e8e93]">{hidden ? "***" : sub}</span></div><p className="mt-2 text-[11px] font-medium text-[#6e6e73]">{label}</p><p className="mt-0.5 truncate text-[19px] font-bold tracking-[-.04em] tabular-nums">{hidden ? "***" : value}</p></div>; }
function Row({ children, href }: { children: React.ReactNode; href?: string }) { const className = "flex min-h-9 items-center gap-2 rounded-xl px-2 py-1.5 text-[11px] hover:bg-[#f5f5f7]"; return href ? <Link className={className} to={href}>{children}</Link> : <div className={className}>{children}</div>; }
function TooltipContent({ active, payload, label }: any) { if (!active || !payload?.length) return null; return <div className="rounded-xl border border-black/[.06] bg-white px-3 py-2 text-xs shadow-lg"><p className="text-[#6e6e73]">{label}</p><p className="mt-0.5 font-bold text-[#007aff]">{money(payload[0].value)}</p></div>; }

export default function OperationalDecisionDashboard() {
  const [isDataHidden, setIsDataHidden] = useState(false);
  const stats = useHybridDashboardStats();
  const orders = useHybridOrders();
  const shiftStatus = useHybridShiftStatus();
  const shifts = useMemo(() => shiftStatus?.allShifts?.filter(Boolean) ?? [], [shiftStatus?.allShifts]);
  const todayRange = getWibDayRange(Date.now());
  const todayOrderStatus = useMemo(() => {
    const result = { pending: 0, paid: 0, completed: 0, cancelled: 0 };
    for (const order of orders ?? []) {
      if (order.createdAt < todayRange.start || order.createdAt > todayRange.end) continue;
      const status = String(order.status ?? "").toLowerCase();
      if (status in result) result[status as keyof typeof result] += 1;
    }
    return result;
  }, [orders, todayRange.end, todayRange.start]);
  const topPayments = useMemo(() => {
    const totals = new Map<string, { method: string; amount: number; orders: number }>();
    for (const order of orders ?? []) {
      if (!(order.status === "paid" || order.status === "completed")) continue;
      if (order.createdAt < todayRange.start || order.createdAt > todayRange.end) continue;
      const method = String(order.paymentMethod ?? "lainnya").toLowerCase();
      const current = totals.get(method) ?? { method, amount: 0, orders: 0 };
      current.amount += Number(order.totalAmount ?? 0);
      current.orders += 1;
      totals.set(method, current);
    }
    return [...totals.values()].sort((left, right) => right.amount - left.amount).slice(0, 4);
  }, [orders, todayRange.end, todayRange.start]);
  if (!stats || !orders || !shiftStatus) return <CompactSkeleton />;
  const p = stats.periodComparisons;
  const totalOrders = Object.values(todayOrderStatus).reduce((sum, value) => sum + value, 0);
  const openShifts = shifts.filter((shift: any) => !shift.endTime).length;
  const alertCount = stats.anomalies.length + stats.paymentReconciliation.pendingNonCashCount + stats.lowStockCount;
  const chartData = stats.revenueLast7Days.map((day) => ({ ...day, label: day.date.split(",")[0] }));
  const maxPayment = Math.max(...topPayments.map((item) => item.amount), 1);
  const averageOrder = p.today.orders ? p.today.revenue / p.today.orders : 0;

  return <main className="min-h-full bg-[#f6f7f9] px-2.5 py-2 text-[#1d1d1f] sm:px-3 sm:py-3"><div className="mx-auto max-w-[1440px] space-y-2.5">
    <header className="flex min-h-11 items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#0b2342] text-white"><BarChart3 className="h-4 w-4" /></span><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-bold tracking-[-.025em] sm:text-lg">Pusat Pantau Operasional</h1><Badge className="hidden rounded-full bg-[#eaf8ef] px-2 py-0.5 text-[10px] font-semibold text-[#248a3d] sm:inline-flex">LIVE</Badge></div><p className="truncate text-[11px] text-[#6e6e73]">Djiwa Tentram Cafe &amp; Resto · keputusan berbasis data · WIB</p></div></div><div className="flex items-center gap-1.5"><Button aria-label={isDataHidden ? "Tampilkan seluruh data" : "Sembunyikan seluruh data"} className="h-9 w-9 rounded-xl bg-white p-0 text-[#1d1d1f] shadow-sm hover:bg-[#f5f5f7]" onClick={() => setIsDataHidden((hidden) => !hidden)} title={isDataHidden ? "Tampilkan data" : "Sembunyikan data"} type="button" variant="outline">{isDataHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</Button><Button className="h-9 shrink-0 rounded-xl bg-white px-3 text-xs text-[#1d1d1f] shadow-sm hover:bg-white/80" onClick={() => triggerHybridRefresh()} type="button" variant="outline"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button></div></header>

    <div>
      <div className="space-y-3">

    <section aria-label="Perbandingan periode" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"><PeriodTile data={p.today} emphasis hidden={isDataHidden} label="Hari ini" previous={p.yesterday} />{periodItems.slice(1).map(([key, label]) => <PeriodTile data={p[key as PeriodKey]} hidden={isDataHidden} key={key} label={label} />)}</section>

    <section className="grid gap-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"><div className="rounded-[20px] border border-black/[.08] bg-white p-3 shadow-[0_4px_16px_rgba(0,0,0,.045)]"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-sm font-bold">Pendapatan 7 hari</h2><span className="rounded-full bg-[#eaf3ff] px-2 py-0.5 text-[10px] font-semibold text-[#007aff]">settled</span></div><p className="mt-0.5 text-[11px] text-[#8e8e93]">Order paid/completed · klik titik untuk nilai harian</p></div><Link className="text-[11px] font-semibold text-[#007aff]" to="/admin/finance/reports">Detail</Link></div><div className="mt-2 h-[132px]"><ResponsiveContainer height="100%" width="100%"><AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}><defs><linearGradient id="decisionRevenue" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#007aff" stopOpacity={.24} /><stop offset="100%" stopColor="#007aff" stopOpacity={.02} /></linearGradient></defs><XAxis axisLine={false} dataKey="label" tick={{ fill: "#8e8e93", fontSize: 10 }} tickLine={false} /><YAxis axisLine={false} hide /><Tooltip content={<TooltipContent />} /><Area dataKey="revenue" fill="url(#decisionRevenue)" stroke="#007aff" strokeWidth={2.5} type="monotone" /></AreaChart></ResponsiveContainer></div></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2"><Stat hidden={isDataHidden} icon={ShoppingBag} label="Order hari ini" sub={`${p.today.orders} settled`} tone="bg-[#eaf3ff] text-[#007aff]" value={String(stats.todayOrders)} /><Stat hidden={isDataHidden} icon={CircleDollarSign} label="Rata-rata order" sub="hari ini" tone="bg-[#eaf8ef] text-[#248a3d]" value={money(averageOrder)} /><Stat hidden={isDataHidden} icon={WalletCards} label="Kas bersih" sub={`${money(stats.todayIncome)} masuk`} tone="bg-[#f1ecff] text-[#6e44c5]" value={money(stats.netBalance)} /><Stat hidden={isDataHidden} icon={AlertTriangle} label="Perlu perhatian" sub={`${stats.lowStockCount} stok kritis`} tone={alertCount ? "bg-[#fff4e5] text-[#b45f06]" : "bg-[#eaf8ef] text-[#248a3d]"} value={String(alertCount)} /></div></section>

    <HourlyTransactionAnalysis />

    <section className="grid gap-2 lg:grid-cols-[1.05fr_1fr_1fr]"><div className="rounded-[20px] border border-black/[.08] bg-white p-3 shadow-[0_4px_16px_rgba(0,0,0,.045)]"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">Metode pembayaran</h2><span className="text-[10px] text-[#8e8e93]">hari ini</span></div>{topPayments.length ? <div className="space-y-2.5">{topPayments.map((item) => <div key={item.method}><div className="flex items-center justify-between text-[11px]"><span className="font-medium">{methodLabel(item.method)}</span><span className="text-[#6e6e73]">{money(item.amount)} · {item.orders}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f0f0f2]"><div className="h-full rounded-full bg-[#007aff]" style={{ width: `${Math.round((item.amount / maxPayment) * 100)}%` }} /></div></div>)}</div> : <Empty text="Belum ada pembayaran settled hari ini." />}</div><div className="rounded-[20px] border border-black/[.08] bg-white p-3 shadow-[0_4px_16px_rgba(0,0,0,.045)]"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">Order &amp; sesi kasir</h2><span className="text-[10px] text-[#8e8e93]">{shifts.length} sesi · {openShifts} aktif</span></div><div className="space-y-2.5"><StatusLine hidden={isDataHidden} label="Pending / open bill" value={todayOrderStatus.pending} total={totalOrders} color="bg-[#ff9500]" /><StatusLine hidden={isDataHidden} label="Lunas" value={todayOrderStatus.paid} total={totalOrders} color="bg-[#007aff]" /><StatusLine hidden={isDataHidden} label="Selesai" value={todayOrderStatus.completed} total={totalOrders} color="bg-[#34c759]" />{shifts.slice(0, 2).map((shift: any) => <Row href="/admin/shift-closing" key={shift._id}><span className={`h-2 w-2 rounded-full ${shift.endTime ? "bg-[#8e8e93]" : "bg-[#34c759]"}`} /><span className="flex-1 truncate font-medium">{shift.shiftName || "Shift kasir"}</span><span className="text-[#6e6e73]">{shift.cashierName || "Kasir"}</span><ChevronRight className="h-3.5 w-3.5 text-[#aeaeb2]" /></Row>)}</div></div><div className="rounded-[20px] border border-black/[.08] bg-white p-3 shadow-[0_4px_16px_rgba(0,0,0,.045)]"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">Perlu tindakan</h2><span className={`h-2 w-2 rounded-full ${alertCount ? "bg-[#ff9500]" : "bg-[#34c759]"}`} /></div><div className="space-y-1.5">{stats.paymentReconciliation.pendingNonCashCount > 0 && <ActionRow hidden={isDataHidden} href="/admin/finance/reports" icon={CircleDollarSign} label="Rekonsiliasi non-tunai" value={`${stats.paymentReconciliation.pendingNonCashCount} pending`} tone="text-[#b45f06]" />}{stats.cashDiscrepancySummary.totalPhysicalGap !== 0 && <ActionRow hidden={isDataHidden} href="/admin/shift-closing" icon={WalletCards} label="Gap kas fisik" value={money(stats.cashDiscrepancySummary.totalPhysicalGap)} tone="text-[#d70015]" />}{stats.lowStockItems.slice(0, 2).map((item) => <ActionRow hidden={isDataHidden} href="/admin/inventory" icon={Package} key={item._id} label={item.ingredientName} value={`${item.quantity} ${item.unit} tersisa`} tone="text-[#b45f06]" />)}{!alertCount && <div className="flex items-center gap-2 rounded-xl bg-[#eaf8ef] p-2.5 text-[11px] text-[#248a3d]"><CheckCircle2 className="h-4 w-4" />Tidak ada tindakan kritis.</div>}</div></div></section>

    <section className="grid gap-2 lg:grid-cols-3"><div className="rounded-[20px] border border-black/[.08] bg-white p-3 shadow-[0_4px_16px_rgba(0,0,0,.045)]"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">Produk terlaris</h2><Link className="text-[10px] font-semibold text-[#007aff]" to="/admin/products">Semua produk</Link></div>{stats.topProducts.slice(0, 4).map((item, index) => <Row href="/admin/products" key={item.name}><span className="w-4 text-[10px] font-bold text-[#8e8e93]">{index + 1}</span><span className="flex-1 truncate font-medium">{item.name}</span><span className="text-[#6e6e73]">{item.count} terjual</span></Row>)}</div><div className="rounded-[20px] border border-black/[.08] bg-white p-3 shadow-[0_4px_16px_rgba(0,0,0,.045)]"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">Aktivitas terbaru</h2><Link className="text-[10px] font-semibold text-[#007aff]" to="/admin/orders">Buka order</Link></div>{stats.recentOrders.slice(0, 4).map((order) => <Row href="/admin/orders" key={order._id}><span className="w-12 text-[10px] text-[#8e8e93]">{formatTimeWIB(order.createdAt)}</span><span className="flex-1 truncate font-medium">#{order.orderNumber}</span><span className="text-[#6e6e73]">{money(order.totalAmount)}</span></Row>)}</div><div className="rounded-[20px] border border-black/[.08] bg-white p-3 shadow-[0_4px_16px_rgba(0,0,0,.045)]"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">Keuangan hari ini</h2><Link className="text-[10px] font-semibold text-[#007aff]" to="/admin/finance">Detail</Link></div><Row><span className="flex-1 text-[#6e6e73]">Pemasukan tercatat</span><b className="text-[#248a3d]">{money(stats.todayIncome)}</b></Row><Row><span className="flex-1 text-[#6e6e73]">Pengeluaran tercatat</span><b className="text-[#d70015]">{money(stats.todayExpense)}</b></Row><Row><span className="flex-1 font-semibold">Net cashflow</span><b>{money(stats.todayIncome - stats.todayExpense)}</b></Row></div></section>

    <footer className="flex items-center justify-between px-1 text-[10px] text-[#8e8e93]"><span>Revenue = transaksi settled · data dihitung dalam WIB</span><span className="hidden sm:inline">Refresh untuk membaca perubahan terbaru dari Supabase</span></footer>
      </div>
    </div>
  </div></main>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-xl bg-[#f5f5f7] p-3 text-center text-[11px] text-[#6e6e73]">{text}</div>; }
function StatusLine({ label, value, total, color, hidden }: { label: string; value: number; total: number; color: string; hidden?: boolean }) { return <div className="flex items-center gap-2 text-[11px]"><span className={`h-2 w-2 rounded-full ${color}`} /><span className="flex-1 truncate text-[#6e6e73]">{label}</span><span className="font-semibold tabular-nums">{hidden ? "***" : value}</span><div className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-[#f0f0f2] sm:block"><div className={`h-full ${color}`} style={{ width: `${total ? Math.round((value / total) * 100) : 0}%` }} /></div></div>; }
function ActionRow({ icon: Icon, label, value, tone, href, hidden }: { icon: typeof Package; label: string; value: string; tone: string; href: string; hidden?: boolean }) { return <Link className="flex items-center gap-2 rounded-xl bg-[#f5f5f7] p-2.5 text-[11px] hover:bg-[#fff8ed]" to={href}><Icon className={`h-4 w-4 ${tone}`} /><span className="flex-1 truncate font-medium">{label}</span><span className={`max-w-[110px] truncate ${tone}`}>{hidden ? "***" : value}</span><ChevronRight className="h-3.5 w-3.5 text-[#aeaeb2]" /></Link>; }
