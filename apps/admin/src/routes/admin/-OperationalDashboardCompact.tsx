import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Package,
  RefreshCw,
  ShoppingBag,
  WalletCards,
} from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { formatTimeWIB } from "@/lib/wib-utils";
import { triggerHybridRefresh, useHybridDashboardStats, useHybridShiftStatus } from "@/hooks/use-hybrid-pos-data";

const periodItems = [
  ["today", "Hari ini"],
  ["yesterday", "Kemarin"],
  ["thisWeek", "Minggu ini"],
  ["lastWeek", "Minggu lalu"],
  ["thisMonth", "Bulan ini"],
  ["lastMonth", "Bulan lalu"],
] as const;

type PeriodKey = (typeof periodItems)[number][0];

type DashboardStats = NonNullable<ReturnType<typeof useHybridDashboardStats>>;

function CompactSkeleton() {
  return <div className="space-y-3"><Skeleton className="h-14 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><div className="grid grid-cols-2 gap-2"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div></div>;
}

function MetricTile({ label, value, hint, icon: Icon, tone = "blue" }: { label: string; value: string; hint?: string; icon: typeof ShoppingBag; tone?: "blue" | "green" | "orange" | "violet" }) {
  const toneClass = { blue: "bg-[#eaf3ff] text-[#007aff]", green: "bg-[#eaf8ef] text-[#248a3d]", orange: "bg-[#fff4e5] text-[#b45f06]", violet: "bg-[#f1ecff] text-[#6e44c5]" }[tone];
  return <div className="rounded-[18px] border border-black/[0.04] bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.035)]"><div className="flex items-center justify-between gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-[10px] ${toneClass}`}><Icon className="h-3.5 w-3.5" /></span>{hint && <span className="text-[10px] font-medium text-[#8e8e93]">{hint}</span>}</div><p className="mt-2 text-[11px] font-medium text-[#6e6e73]">{label}</p><p className="mt-0.5 truncate text-[20px] font-bold tracking-[-0.04em] text-[#1d1d1f] tabular-nums">{value}</p></div>;
}

function PeriodTile({ label, data, emphasis }: { label: string; data: { orders: number; revenue: number }; emphasis?: boolean }) {
  return <div className={`rounded-[16px] border p-3 ${emphasis ? "border-[#007aff]/20 bg-[#f0f6ff]" : "border-black/[0.05] bg-white"}`}><div className="flex items-center justify-between gap-2"><p className="truncate text-[11px] font-semibold text-[#6e6e73]">{label}</p><span className="text-[10px] text-[#8e8e93]">{data.orders} order</span></div><p className="mt-1 truncate text-[15px] font-bold tracking-[-0.02em] text-[#1d1d1f] tabular-nums">{formatCurrencyIDR(data.revenue)}</p></div>;
}

function StatusRow({ label, count, total, tone }: { label: string; count: number; total: number; tone: string }) {
  const ratio = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
  return <div className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} /><span className="min-w-0 flex-1 truncate text-[11px] text-[#6e6e73]">{label}</span><span className="text-xs font-semibold tabular-nums text-[#1d1d1f]">{count}</span><div className="hidden w-16 overflow-hidden rounded-full bg-[#f0f0f2] sm:block"><div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${ratio}%` }} /></div></div>;
}

function ShiftRow({ shift }: { shift: any }) {
  const active = !shift.endTime;
  return <Link className="flex min-h-10 items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-[#f5f5f7]" to="/admin/shift-closing"><span className={`h-2 w-2 rounded-full ${active ? "bg-[#34c759]" : "bg-[#8e8e93]"}`} /><span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#1d1d1f]">{shift.shiftName || "Shift kasir"}</span><span className="truncate text-[10px] text-[#6e6e73]">{shift.cashierName || "Kasir"}</span><ChevronRight className="h-3.5 w-3.5 text-[#aeaeb2]" /></Link>;
}

function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-xs shadow-lg"><p className="text-[#6e6e73]">{label}</p><p className="mt-0.5 font-bold text-[#007aff]">{formatCurrencyIDR(payload[0].value)}</p></div>;
}

export default function OperationalDashboardCompact() {
  const stats = useHybridDashboardStats();
  const shiftStatus = useHybridShiftStatus();
  const shifts = useMemo(() => shiftStatus?.allShifts?.filter(Boolean) ?? [], [shiftStatus?.allShifts]);

  if (!stats || !shiftStatus) return <CompactSkeleton />;
  const periodStats = stats.periodComparisons;
  const totalOrders = stats.orderStatusBreakdown.pending + stats.orderStatusBreakdown.paid + stats.orderStatusBreakdown.completed + stats.orderStatusBreakdown.cancelled;
  const openShifts = shifts.filter((shift: any) => !shift.endTime).length;
  const chartData = stats.revenueLast7Days.map((day) => ({ ...day, label: day.date.split(",")[0] }));
  const alertCount = stats.anomalies.length + stats.paymentReconciliation.pendingNonCashCount;

  return <main className="min-h-full bg-[#f5f5f7] px-3 py-3 text-[#1d1d1f] sm:px-5 sm:py-4"><div className="mx-auto max-w-[1440px] space-y-3">
    <header className="flex min-h-11 items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#0b2342] text-white"><BarChart3 className="h-4 w-4" /></span><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-bold tracking-[-0.025em] sm:text-lg">Pusat Pantau Operasional</h1><Badge className="hidden rounded-full bg-[#eaf8ef] px-2 py-0.5 text-[10px] font-semibold text-[#248a3d] sm:inline-flex">LIVE</Badge></div><p className="truncate text-[11px] text-[#6e6e73]">Djiwa Tentram Cafe &amp; Resto · data Supabase self-host</p></div></div><Button className="h-9 shrink-0 rounded-xl bg-white px-3 text-xs text-[#1d1d1f] shadow-sm hover:bg-white/80" onClick={() => triggerHybridRefresh()} type="button" variant="outline"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button></header>

    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Perbandingan periode"><PeriodTile data={periodStats.today} emphasis label="Hari ini" />{periodItems.slice(1).map(([key, label]) => <PeriodTile data={periodStats[key as PeriodKey]} key={key} label={label} />)}</section>

    <section className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.8fr)]"><div className="rounded-[20px] border border-black/[0.04] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.035)]"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-sm font-bold">Pendapatan 7 hari</h2><span className="rounded-full bg-[#eaf3ff] px-2 py-0.5 text-[10px] font-semibold text-[#007aff]">{formatCurrencyIDR(stats.revenueLast7Days.reduce((sum, day) => sum + day.revenue, 0))}</span></div><p className="mt-0.5 text-[11px] text-[#8e8e93]">Hanya order settled: paid/completed</p></div><Link className="text-[11px] font-semibold text-[#007aff]" to="/admin/finance/reports">Detail</Link></div><div className="mt-2 h-[154px] w-full"><ResponsiveContainer height="100%" width="100%"><AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}><defs><linearGradient id="opsRevenueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#007aff" stopOpacity={0.24} /><stop offset="100%" stopColor="#007aff" stopOpacity={0.02} /></linearGradient></defs><XAxis axisLine={false} dataKey="label" tick={{ fill: "#8e8e93", fontSize: 10 }} tickLine={false} /><YAxis axisLine={false} hide tickLine={false} /><Tooltip content={<RevenueTooltip />} cursor={{ stroke: "#d1d1d6", strokeDasharray: "3 3" }} /><Area dataKey="revenue" fill="url(#opsRevenueFill)" stroke="#007aff" strokeWidth={2.5} type="monotone" /></AreaChart></ResponsiveContainer></div></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2"><MetricTile hint="settled + pending" icon={ShoppingBag} label="Order hari ini" tone="blue" value={String(stats.todayOrders)} /><MetricTile hint={`${stats.totalProducts} total`} icon={Package} label="Produk aktif" tone="green" value={String(stats.activeProducts)} /><MetricTile hint={`${openShifts} terbuka`} icon={WalletCards} label="Kas bersih" tone={stats.netBalance >= 0 ? "green" : "orange"} value={formatCurrencyIDR(stats.netBalance)} /><MetricTile hint="perlu review" icon={AlertTriangle} label="Perhatian" tone={alertCount ? "orange" : "violet"} value={String(alertCount)} /></div></section>

    <section className="grid gap-3 lg:grid-cols-[1fr_1fr_0.9fr]"><div className="rounded-[20px] border border-black/[0.04] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.035)]"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">Status order hari ini</h2><span className="text-[10px] text-[#8e8e93]">{totalOrders} total</span></div><div className="space-y-3"><StatusRow count={stats.orderStatusBreakdown.pending} label="Open bill / pending" tone="bg-[#ff9500]" total={totalOrders} /><StatusRow count={stats.orderStatusBreakdown.paid} label="Lunas" tone="bg-[#007aff]" total={totalOrders} /><StatusRow count={stats.orderStatusBreakdown.completed} label="Selesai" tone="bg-[#34c759]" total={totalOrders} /><StatusRow count={stats.orderStatusBreakdown.cancelled} label="Dibatalkan" tone="bg-[#ff3b30]" total={totalOrders} /></div></div><div className="rounded-[20px] border border-black/[0.04] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.035)]"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">Sesi kasir</h2><span className="text-[10px] text-[#8e8e93]">{shifts.length} sesi · {openShifts} aktif</span></div>{shifts.length ? <div className="divide-y divide-[#f0f0f2]">{shifts.slice(0, 5).map((shift: any) => <ShiftRow key={shift._id} shift={shift} />)}</div> : <div className="flex min-h-24 items-center justify-center rounded-xl bg-[#f5f5f7] text-center text-[11px] text-[#6e6e73]">Belum ada sesi kasir hari ini.</div>}</div><div className="rounded-[20px] border border-black/[0.04] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.035)]"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">Kontrol operasional</h2><span className={`h-2 w-2 rounded-full ${alertCount ? "bg-[#ff9500]" : "bg-[#34c759]"}`} /></div><div className="space-y-2.5 text-[11px]"><Link className="flex items-center gap-2 rounded-xl bg-[#f5f5f7] p-2.5 hover:bg-[#eef5ff]" to="/admin/finance/reports"><CircleDollarSign className="h-4 w-4 text-[#007aff]" /><span className="flex-1">Rekonsiliasi non-tunai</span><b>{stats.paymentReconciliation.pendingNonCashCount}</b><ChevronRight className="h-3.5 w-3.5 text-[#aeaeb2]" /></Link><Link className="flex items-center gap-2 rounded-xl bg-[#f5f5f7] p-2.5 hover:bg-[#fff8ed]" to="/admin/shift-closing"><Clock3 className="h-4 w-4 text-[#b45f06]" /><span className="flex-1">Gap kas fisik</span><b className={stats.cashDiscrepancySummary.totalPhysicalGap ? "text-[#ff3b30]" : "text-[#248a3d]"}>{formatCurrencyIDR(stats.cashDiscrepancySummary.totalPhysicalGap)}</b></Link><div className="flex items-center gap-2 rounded-xl bg-[#f5f5f7] p-2.5"><CheckCircle2 className={`h-4 w-4 ${stats.anomalies.length ? "text-[#ff9500]" : "text-[#34c759]"}`} /><span className="flex-1">Anomali terdeteksi</span><b>{stats.anomalies.length}</b></div></div></div></section>

    <footer className="flex items-center justify-between px-1 text-[10px] text-[#8e8e93]"><span>Angka revenue hanya menghitung transaksi settled.</span><span className="hidden sm:inline">Waktu operasional: WIB · <Link className="font-semibold text-[#007aff]" to="/admin/finance">Buka laporan lengkap <ArrowUpRight className="inline h-3 w-3" /></Link></span></footer>
  </div></main>;
}
