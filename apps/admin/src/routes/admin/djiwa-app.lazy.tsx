import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, BarChart3, CreditCard, RefreshCw, ShoppingBag, TrendingUp, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerAppAnalytics, type CustomerAnalyticsPeriod } from "@/hooks/use-customer-app-analytics";

export const Route = createLazyFileRoute("/admin/djiwa-app")({
	component: DjiwaAppDashboard,
});

function formatRupiah(value: number) {
	return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null) {
	if (!value) return "-";
	return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

const periods: Array<{ value: CustomerAnalyticsPeriod; label: string }> = [
	{ value: "today", label: "Hari ini" },
	{ value: "yesterday", label: "Kemarin" },
	{ value: "this_week", label: "Minggu ini" },
	{ value: "last_week", label: "Minggu kemarin" },
	{ value: "this_month", label: "Bulan ini" },
	{ value: "last_month", label: "Bulan kemarin" },
	{ value: "this_3_months", label: "3 bulan ini" },
	{ value: "last_3_months", label: "3 bulan lalu" },
	{ value: "this_6_months", label: "6 bulan ini" },
	{ value: "last_6_months", label: "6 bulan lalu" },
	{ value: "this_year", label: "Tahun ini" },
	{ value: "last_year", label: "Tahun lalu" },
];

function MetricCard({ label, value, hint, icon: Icon, tone = "azure" }: { label: string; value: string | number; hint: string; icon: typeof Users; tone?: "azure" | "violet" | "cyan" }) {
	const tones = {
		azure: "border-sky-200/80 bg-sky-50/60 text-sky-700",
		violet: "border-violet-200/80 bg-violet-50/60 text-violet-700",
		cyan: "border-cyan-200/80 bg-cyan-50/60 text-cyan-700",
	};
	return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide opacity-75">{label}</p><p className="mt-2 text-xl font-black tracking-tight text-foreground">{value}</p><p className="mt-1 text-[11px] font-semibold opacity-75">{hint}</p></div><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80"><Icon className="h-4 w-4" /></span></div></motion.div>;
}

function DashboardSkeleton() {
	return <div className="space-y-4 pb-8" aria-busy="true" aria-live="polite"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs font-bold text-sky-800"><RefreshCw className="h-4 w-4 animate-spin" /> Sedang memuat data Customer App…</motion.div><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><Skeleton className="h-7 w-44" /><Skeleton className="mt-2 h-4 w-72" /></div><Skeleton className="h-10 w-40 rounded-xl" /></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div className="rounded-2xl border border-border bg-card p-4 shadow-sm" key={index}><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-7 w-28" /><Skeleton className="mt-2 h-3 w-20" /></div>)}</div><div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-border bg-card p-4"><Skeleton className="h-5 w-36" /><Skeleton className="mt-4 h-56 w-full rounded-xl" /></div><div className="rounded-2xl border border-border bg-card p-4"><Skeleton className="h-5 w-44" /><Skeleton className="mt-4 h-56 w-full rounded-xl" /></div></div><div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-border bg-card p-4"><Skeleton className="h-5 w-36" /><Skeleton className="mt-4 h-48 w-full rounded-xl" /></div><div className="rounded-2xl border border-border bg-card p-4"><Skeleton className="h-5 w-36" /><Skeleton className="mt-4 h-48 w-full rounded-xl" /></div></div></div>;
}

function DjiwaAppDashboard() {
	const [period, setPeriod] = useState<CustomerAnalyticsPeriod>("this_week");
	const [isRefreshing, setIsRefreshing] = useState(false);
	const { data, isLoading, isError, refresh } = useCustomerAppAnalytics(period);
	const isBusy = isLoading || isRefreshing || data?.period !== period;
	useEffect(() => {
		if (data?.period === period) setIsRefreshing(false);
	}, [data, period]);
	if (isBusy) return <DashboardSkeleton />;
	if (isError || !data) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900"><p className="font-black">Dashboard belum dapat memuat data.</p><p className="mt-1 text-sm">Coba muat ulang untuk mengambil data Customer App terbaru.</p><button type="button" onClick={() => { setIsRefreshing(true); refresh(); }} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-black text-white"><RefreshCw className="h-4 w-4" /> Coba lagi</button></div>;
	const updatedAt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());
	return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4 pb-8">
		<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div><div className="flex items-center gap-2 text-sky-700"><BarChart3 className="h-4 w-4" /><span className="text-[11px] font-black uppercase tracking-[0.16em]">DJIWA APP</span></div><h1 className="mt-1 text-2xl font-black tracking-tight">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Pantau performa DJIWA APP dan aktivitas pelanggan.</p></div>
			<div className="flex items-center gap-2"><select value={period} onChange={(event) => { setIsRefreshing(true); setPeriod(event.target.value as CustomerAnalyticsPeriod); }} className="h-10 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground shadow-sm">{periods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button type="button" onClick={() => { setIsRefreshing(true); refresh(); }} aria-label="Refresh dashboard" className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground"><RefreshCw className="h-4 w-4" /></button></div>
		</header>
		<div className="flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-[11px] font-semibold text-sky-800"><span>Data Customer App · {data.periodLabel}</span><span>Diperbarui {updatedAt}</span></div>
		<section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<MetricCard label="Pelanggan aktif" value={data.activeCustomers.toLocaleString("id-ID")} hint="akun aktif" icon={Users} />
			<MetricCard label="Pelanggan baru" value={data.newCustomers.toLocaleString("id-ID")} hint={data.periodLabel} icon={Users} tone="violet" />
			<MetricCard label="Aktif di periode" value={data.activeInPeriod.toLocaleString("id-ID")} hint="last active" icon={Activity} tone="cyan" />
			<MetricCard label="Order Customer App" value={data.appOrders.toLocaleString("id-ID")} hint="paid / completed" icon={ShoppingBag} />
			<MetricCard label="Spending App" value={formatRupiah(data.appSpending)} hint="transaksi settled" icon={TrendingUp} tone="violet" />
			<MetricCard label="Kunjungan App" value={data.appVisits.toLocaleString("id-ID")} hint="akumulasi customer" icon={Activity} tone="cyan" />
			<MetricCard label="Saldo Djiwa Pay" value={formatRupiah(data.walletBalance)} hint="read-only" icon={CreditCard} />
		</section>
		<section className="grid gap-4 lg:grid-cols-2">
			<div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-4 flex items-start justify-between"><div><h2 className="text-sm font-black">Tren order</h2><p className="mt-1 text-[11px] text-muted-foreground">Order Customer App per hari</p></div><ShoppingBag className="h-4 w-4 text-sky-600" /></div><div className="h-56"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend}><defs><linearGradient id="appOrderFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} /><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} /><Tooltip /><Area type="monotone" dataKey="orders" name="Order" stroke="#0284c7" fill="url(#appOrderFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></div>
			<div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-4 flex items-start justify-between"><div><h2 className="text-sm font-black">Spending Customer App</h2><p className="mt-1 text-[11px] text-muted-foreground">Nilai transaksi settled per hari</p></div><TrendingUp className="h-4 w-4 text-violet-600" /></div><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.trend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={(value) => formatRupiah(Number(value))} /><Bar dataKey="spending" name="Spending" fill="#7c3aed" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
		</section>
		<section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
			<div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black">Produk populer</h2><p className="mt-1 text-[11px] text-muted-foreground">Dari order Customer App</p></div><ShoppingBag className="h-4 w-4 text-cyan-600" /></div>{data.topProducts.length === 0 ? <p className="mt-8 text-center text-xs text-muted-foreground">Belum ada produk pada periode ini.</p> : <div className="mt-4 space-y-3">{data.topProducts.map((product, index) => <div className="flex items-center gap-3" key={product.name}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-[11px] font-black text-cyan-700">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-xs"><span className="truncate font-bold">{product.name}</span><span className="shrink-0 font-black">{product.quantity}×</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(8, Math.min(100, (product.quantity / Math.max(data.topProducts[0].quantity, 1)) * 100))}%` }} /></div></div></div>)}</div>}</div>
			<div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black">Customer teratas</h2><p className="mt-1 text-[11px] text-muted-foreground">Spending dan aktivitas periode ini</p></div><Link to="/admin/customers" className="inline-flex items-center gap-1 text-[11px] font-black text-sky-700">Lihat semua <ArrowUpRight className="h-3 w-3" /></Link></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="pb-2">Customer</th><th className="pb-2 text-right">Order</th><th className="pb-2 text-right">Spending</th><th className="pb-2 text-right">Aktif</th></tr></thead><tbody className="divide-y divide-border">{data.topCustomers.length === 0 ? <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Belum ada aktivitas customer.</td></tr> : data.topCustomers.map((customer) => <tr key={customer.id}><td className="py-2.5"><Link to="/admin/customers" className="block max-w-[230px] truncate font-bold hover:text-sky-700">{customer.name}</Link><span className="block max-w-[230px] truncate text-[10px] text-muted-foreground">{customer.email}</span></td><td className="py-2.5 text-right font-bold">{customer.orders}</td><td className="py-2.5 text-right font-bold">{formatRupiah(customer.spending)}</td><td className="py-2.5 text-right text-[10px] text-muted-foreground">{formatDate(customer.lastActiveAt)}</td></tr>)}</tbody></table></div></div>
		</section>
	</motion.div>;
}
