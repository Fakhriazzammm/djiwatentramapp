import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerAppAnalytics, type CustomerAnalyticsPeriod } from "@/hooks/use-customer-app-analytics";
import { agoLabel, HeatStrip, Kpis, monoLabel, num, Panel, Rank, rupiah, SegmentBar, Tabs } from "@/components/djiwa-app/ui";

export const Route = createLazyFileRoute("/admin/djiwa-app")({
	component: DjiwaAppDashboard,
});

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
const quickPeriods = ["today", "this_week", "this_month", "this_3_months", "this_year"] as const;
const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const RETENTION_COLORS: Record<string, string> = { Aktif: "#166534", "Perlu diingatkan": "#9a6200", "Belum kembali": "#c2570c", "Berisiko hilang": "#c73822", "Belum aktif": "#9a9aa6" };
const axis = { fontSize: 10, fontFamily: "ui-monospace, Menlo, monospace", fill: "#9a9aa6" } as const;

function DashboardSkeleton() {
	return (
		<div className="space-y-3.5" aria-busy="true" aria-live="polite">
			<div className="flex items-center gap-2 border border-border bg-card px-3 py-2 font-mono text-[11px] text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Memuat data Djiwa App…</div>
			<Skeleton className="h-8 w-full rounded-none" />
			<div className="grid grid-cols-2 gap-px lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton className="h-20 rounded-none" key={index} />)}</div>
			<div className="grid gap-3.5 lg:grid-cols-2"><Skeleton className="h-64 rounded-none" /><Skeleton className="h-64 rounded-none" /></div>
		</div>
	);
}

function DjiwaAppDashboard() {
	const [period, setPeriod] = useState<CustomerAnalyticsPeriod>("this_week");
	const [isRefreshing, setIsRefreshing] = useState(false);
	const { data, isLoading, isError, refresh } = useCustomerAppAnalytics(period);
	const isBusy = isLoading || isRefreshing || data?.period !== period;
	useEffect(() => {
		if (data?.period === period) setIsRefreshing(false);
	}, [data, period]);
	const changePeriod = (next: CustomerAnalyticsPeriod) => { setIsRefreshing(true); setPeriod(next); };
	const reload = () => { setIsRefreshing(true); refresh(); };

	const header = (
		<div className="flex flex-wrap items-end justify-between gap-3">
			<div>
				<div className="font-mono text-[10px] tracking-[0.04em] text-muted-foreground">DJIWA APP / DASHBOARD</div>
				<h1 className="text-[19px] font-semibold leading-tight tracking-tight">Dashboard</h1>
			</div>
			<button type="button" onClick={reload} aria-label="Muat ulang" className="inline-flex h-[34px] items-center gap-1.5 border border-border bg-card px-3 text-xs font-semibold hover:border-foreground/30"><RefreshCw className={`h-3.5 w-3.5 ${isBusy ? "animate-spin" : ""}`} /> Muat ulang</button>
		</div>
	);

	if (isBusy) return <div className="space-y-3.5">{header}<DashboardSkeleton /></div>;
	if (isError || !data) {
		return <div className="space-y-3.5">{header}<div className="border border-red-200 bg-red-50 p-4 text-red-900"><p className="font-bold">Dashboard belum dapat memuat data.</p><p className="mt-1 text-sm">Coba muat ulang untuk mengambil data Djiwa App terbaru.</p><button type="button" onClick={reload} className="mt-3 h-9 bg-red-600 px-4 text-xs font-bold text-white">Coba lagi</button></div></div>;
	}

	const updatedAt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());
	const conversion = data.totalCustomers ? Math.round((data.buyingCustomers / data.totalCustomers) * 100) : 0;
	const repeatRate = data.buyingCustomers ? Math.round((data.repeatCustomers / data.buyingCustomers) * 100) : 0;
	const peakHour = data.hourly.reduce((best, value, hour) => (value > data.hourly[best] ? hour : best), 0);
	const peakDay = data.weekday.reduce((best, value, day) => (value > data.weekday[best] ? day : best), 0);
	const hasOrders = data.appOrders > 0;
	const atRisk = (data.retention.find((item) => item.label === "Belum kembali")?.value ?? 0) + (data.retention.find((item) => item.label === "Berisiko hilang")?.value ?? 0);
	const insights: string[] = [];
	if (data.previous.appSpending > 0) {
		const diff = ((data.appSpending - data.previous.appSpending) / data.previous.appSpending) * 100;
		insights.push(`Belanja lewat app ${diff >= 0 ? "naik" : "turun"} ${Math.abs(diff).toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dibanding periode sebelumnya.`);
	}
	if (hasOrders) insights.push(`Jam paling ramai pukul ${String(peakHour).padStart(2, "0")}.00 dan hari tersibuk ${WEEKDAYS[peakDay]}.`);
	if (atRisk) insights.push(`${num(atRisk)} pelanggan tidak kembali >30 hari — kirim voucher atau pengingat saldo.`);
	if (data.buyingCustomers) insights.push(`${repeatRate}% pembeli memesan lebih dari sekali di periode ini.`);
	if (conversion < 30 && data.totalCustomers) insights.push(`Baru ${conversion}% pelanggan terdaftar pernah belanja — dorong order pertama.`);

	return (
		<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3.5 pb-8">
			{header}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Tabs items={quickPeriods.map((value) => [value, periods.find((item) => item.value === value)!.label] as const)} value={(quickPeriods as readonly string[]).includes(period) ? (period as (typeof quickPeriods)[number]) : ("" as (typeof quickPeriods)[number])} onChange={changePeriod} />
				<div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
					<select aria-label="Periode lain" value={period} onChange={(event) => changePeriod(event.target.value as CustomerAnalyticsPeriod)} className="h-8 border border-border bg-card px-2 text-[11.5px] text-foreground">{periods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
					<span>{data.periodLabel} · diperbarui {updatedAt}</span>
				</div>
			</div>

			<Kpis cols={4} items={[
				{ label: "Pelanggan baru", value: num(data.newCustomers), delta: { cur: data.newCustomers, prev: data.previous.newCustomers }, hint: `${num(data.totalCustomers)} total` },
				{ label: "Aktif di periode", value: num(data.activeInPeriod), delta: { cur: data.activeInPeriod, prev: data.previous.activeInPeriod }, hint: "terakhir aktif" },
				{ label: "Order Djiwa App", value: num(data.appOrders), delta: { cur: data.appOrders, prev: data.previous.appOrders }, hint: "paid / completed" },
				{ label: "Belanja via app", value: rupiah(data.appSpending), delta: { cur: data.appSpending, prev: data.previous.appSpending }, hint: "transaksi settled" },
				{ label: "Rata-rata order", value: rupiah(data.averageOrderValue), hint: hasOrders ? `${num(data.buyingCustomers)} pembeli` : "belum ada order" },
				{ label: "Repeat order", value: `${repeatRate}%`, hint: `${num(data.repeatCustomers)} pembeli ulang`, tone: repeatRate >= 30 ? "ok" : undefined },
				{ label: "Konversi pembeli", value: `${conversion}%`, hint: "pernah belanja / terdaftar" },
				{ label: "Saldo Djiwa Pay", value: rupiah(data.walletBalance), hint: `${num(data.customersWithBalance)} pelanggan · ${num(data.appVisits)} kunjungan`, tone: "ok" },
			]} />

			{insights.length ? (
				<Panel title="Analisis otomatis" meta={data.periodLabel}>
					<ul className="m-0 grid list-none gap-1.5 p-0 text-[12.5px]">{insights.map((line) => <li key={line} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 flex-none bg-[#111114]" />{line}</li>)}</ul>
				</Panel>
			) : null}

			<div className="grid gap-3.5 lg:grid-cols-2">
				<Panel title="Tren order" meta="order per hari">
					<div className="h-56"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend}><defs><linearGradient id="appOrderFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1a5dc6" stopOpacity={0.18} /><stop offset="100%" stopColor="#1a5dc6" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#ececf0" /><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" /><YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={28} /><Tooltip contentStyle={{ borderRadius: 0, fontSize: 12 }} /><Area type="monotone" dataKey="orders" name="Order" stroke="#1a5dc6" fill="url(#appOrderFill)" strokeWidth={1.8} /></AreaChart></ResponsiveContainer></div>
				</Panel>
				<Panel title="Belanja via app" meta="nilai settled per hari">
					<div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.trend}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#ececf0" /><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" /><YAxis tick={axis} tickLine={false} axisLine={false} width={40} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} /><Tooltip contentStyle={{ borderRadius: 0, fontSize: 12 }} formatter={(value) => rupiah(Number(value))} /><Bar dataKey="spending" name="Belanja" fill="#166534" /></BarChart></ResponsiveContainer></div>
				</Panel>
				<Panel title="Pendaftaran pelanggan" meta="akun baru per hari">
					<div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.trend}><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#ececf0" /><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" /><YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={28} /><Tooltip contentStyle={{ borderRadius: 0, fontSize: 12 }} /><Bar dataKey="signups" name="Pelanggan baru" fill="#7a3fb0" /></BarChart></ResponsiveContainer></div>
				</Panel>
				<Panel title="Segmen retensi" meta="seluruh basis pelanggan">
					<SegmentBar rows={data.retention.map((item) => ({ ...item, color: RETENTION_COLORS[item.label] ?? "#9a9aa6" }))} />
				</Panel>
			</div>

			<div className="grid gap-3.5 lg:grid-cols-2">
				<Panel title="Jam ramai order" meta={hasOrders ? `puncak ${String(peakHour).padStart(2, "0")}.00` : "belum ada order"}>
					<HeatStrip labels={data.hourly.map((_, hour) => String(hour).padStart(2, "0"))} values={data.hourly} />
				</Panel>
				<Panel title="Hari tersibuk" meta={hasOrders ? `puncak ${WEEKDAYS[peakDay]}` : "belum ada order"}>
					<HeatStrip labels={WEEKDAYS} values={data.weekday} color="22,101,52" />
				</Panel>
			</div>

			<div className="grid gap-3.5 lg:grid-cols-3">
				<Panel title="Produk populer" meta="dari order app">
					<Rank color="#0e7490" rows={data.topProducts.map((product) => ({ label: product.name, value: product.quantity, text: `${num(product.quantity)}×`, sub: rupiah(product.spending) }))} empty="Belum ada produk pada periode ini." />
				</Panel>
				<Panel title="Saldo terbesar" meta="dompet Djiwa Pay">
					<Rank color="#166534" rows={data.topWalletHolders.map((holder) => ({ label: holder.name, value: holder.balance, text: rupiah(holder.balance), sub: holder.email }))} empty="Belum ada saldo tersimpan." />
				</Panel>
				<Panel title="Pelanggan teratas" action={<Link to="/admin/customers" className="font-mono text-[11px] font-semibold text-[#1a5dc6]">Lihat semua →</Link>} flush>
					{data.topCustomers.length === 0 ? <p className="py-10 text-center text-xs text-muted-foreground">Belum ada aktivitas pelanggan.</p> : (
						<table className="w-full border-collapse text-[12.5px]">
							<thead><tr className="border-b border-border"><th className={`${monoLabel} px-3.5 py-2 text-left`}>Pelanggan</th><th className={`${monoLabel} px-3.5 py-2 text-right`}>Belanja</th></tr></thead>
							<tbody>{data.topCustomers.map((customer) => <tr key={customer.id} className="border-b border-muted last:border-0"><td className="px-3.5 py-2"><b className="block max-w-[170px] truncate">{customer.name}</b><small className="block max-w-[170px] truncate text-[11px] text-muted-foreground">{customer.orders} order · {agoLabel(customer.lastActiveAt)}</small></td><td className="px-3.5 py-2 text-right tabular-nums">{rupiah(customer.spending)}</td></tr>)}</tbody>
						</table>
					)}
				</Panel>
			</div>
		</motion.div>
	);
}
