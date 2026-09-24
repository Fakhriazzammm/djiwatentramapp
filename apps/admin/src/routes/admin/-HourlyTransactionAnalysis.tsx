import { useMemo, useState } from "react";
import { AlertCircle, BarChart3, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	getPeakPoint,
	getPeakRange,
	getQuietPoint,
	type HourlyMetric,
	type HourlyPeriod,
} from "@/lib/hourly-transaction-analysis";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { triggerHybridRefresh, useHybridHourlySales } from "@/hooks/use-hybrid-pos-data";

const money = (value: number) => formatCurrencyIDR(Number.isFinite(value) ? value : 0);
const periodOptions: Array<{ value: HourlyPeriod; label: string }> = [
	{ value: "today", label: "Hari ini" },
	{ value: "7d", label: "7 hari" },
	{ value: "30d", label: "30 hari" },
];

function hourRange(start: number, end = start + 1) {
	return `${String(start).padStart(2, "0")}.00–${String(end % 24).padStart(2, "0")}.00`;
}

function HourlyTooltip({ active, payload }: any) {
	if (!active || !payload?.length) return null;
	const point = payload[0].payload;
	return (
		<div className="rounded-xl border border-black/[.06] bg-white px-3 py-2 text-[11px] shadow-lg">
			<p className="font-semibold text-[#1d1d1f]">{hourRange(point.hour)}</p>
			<p className="mt-1 text-[#007aff]">{point.orderCount} order</p>
			<p className="text-[#6e6e73]">{money(point.revenue)}</p>
		</div>
	);
}

function SummaryItem({ label, value, detail }: { label: string; value: string; detail: string }) {
	return (
		<div className="min-w-0 rounded-xl bg-[#f7faff] px-2.5 py-2.5 sm:px-3">
			<p className="truncate text-[10px] font-semibold uppercase tracking-[0.04em] text-[#8e8e93]">{label}</p>
			<p className="mt-1 truncate text-[13px] font-bold tabular-nums text-[#1d1d1f]">{value}</p>
			<p className="mt-0.5 truncate text-[10px] text-[#6e6e73]">{detail}</p>
		</div>
	);
}

function HourlyLoading() {
	return <section aria-label="Memuat analisa jam operasional" className="rounded-[20px] border border-black/[.04] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,.035)]"><div className="flex items-center justify-between"><Skeleton className="h-5 w-44 rounded-lg" /><Skeleton className="h-8 w-32 rounded-lg" /></div><Skeleton className="mt-3 h-[150px] rounded-xl" /><div className="mt-3 grid grid-cols-3 gap-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div></section>;
}

export default function HourlyTransactionAnalysis() {
	const [period, setPeriod] = useState<HourlyPeriod>("7d");
	const [metric, setMetric] = useState<HourlyMetric>("orders");
	const insight = useHybridHourlySales(period);
	const peak = useMemo(() => insight ? getPeakPoint(insight.points, metric) : null, [insight, metric]);
	const quiet = useMemo(() => insight ? getQuietPoint(insight.points) : null, [insight]);
	const activeRange = useMemo(() => insight ? getPeakRange(insight.points) : null, [insight]);
	const hasTransactions = Boolean(insight?.totalSettledOrders);

	if (insight === undefined) return <HourlyLoading />;
	if (insight === null) {
		return <section className="rounded-[20px] border border-[#ffd6d2] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,.035)]"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fff0ef] text-[#d70015]"><AlertCircle className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-bold">Analisa jam operasional</h2><p className="mt-1 text-[11px] text-[#6e6e73]">Data transaksi per jam belum dapat dimuat.</p></div><Button className="h-8 shrink-0 rounded-lg px-2.5 text-[11px]" onClick={() => triggerHybridRefresh()} type="button" variant="outline"><RefreshCw className="mr-1 h-3 w-3" />Coba lagi</Button></div></section>;
	}

	return (
		<section aria-label="Analisa jam operasional" className="rounded-[20px] border border-black/[.04] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,.035)]">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2.5">
					<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#007aff]"><BarChart3 className="h-4 w-4" /></span>
					<div className="min-w-0"><h2 className="text-sm font-bold">Analisa jam operasional</h2><p className="mt-0.5 text-[11px] text-[#8e8e93]">Jam ramai dan sepi dari transaksi settled · WIB</p></div>
				</div>
				<div className="flex max-w-full flex-wrap gap-1 rounded-xl bg-[#f5f5f7] p-1" role="group" aria-label="Periode analisa">
					{periodOptions.map((option) => <button className={`min-h-7 rounded-lg px-2.5 text-[10px] font-semibold transition-colors ${period === option.value ? "bg-white text-[#007aff] shadow-sm" : "text-[#6e6e73] hover:text-[#1d1d1f]"}`} key={option.value} onClick={() => setPeriod(option.value)} type="button">{option.label}</button>)}
				</div>
			</div>

			<div className="mt-3 flex items-center justify-between gap-2"><p className="text-[10px] text-[#8e8e93]">{insight.totalSettledOrders} order settled · {insight.sampleDays} hari data</p><div className="flex rounded-lg border border-black/[.06] p-0.5" role="group" aria-label="Metrik grafik"><button className={`min-h-7 rounded-md px-2.5 text-[10px] font-semibold ${metric === "orders" ? "bg-[#eaf3ff] text-[#007aff]" : "text-[#8e8e93]"}`} onClick={() => setMetric("orders")} type="button">Order</button><button className={`min-h-7 rounded-md px-2.5 text-[10px] font-semibold ${metric === "revenue" ? "bg-[#eaf3ff] text-[#007aff]" : "text-[#8e8e93]"}`} onClick={() => setMetric("revenue")} type="button">Revenue</button></div></div>

			{hasTransactions ? <>
				<div className="mt-1 h-[150px] min-w-0"><ResponsiveContainer height="100%" width="100%"><BarChart data={insight.points} margin={{ top: 8, right: 2, bottom: 0, left: -22 }}><CartesianGrid vertical={false} stroke="#f0f0f2" /><XAxis axisLine={false} dataKey="hour" interval={2} tick={{ fill: "#8e8e93", fontSize: 9 }} tickFormatter={(hour) => `${String(hour).padStart(2, "0")}`} tickLine={false} /><YAxis axisLine={false} hide /><Tooltip content={<HourlyTooltip />} cursor={{ fill: "#f5f9ff" }} /><Bar dataKey={metric === "orders" ? "orderCount" : "revenue"} fill="#007aff" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
				<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"><SummaryItem detail={peak ? `${peak.orderCount} order · ${money(peak.revenue)}` : "Belum ada data"} label={metric === "orders" ? "Order terbanyak" : "Revenue tertinggi"} value={peak ? hourRange(peak.hour) : "—"} /><SummaryItem detail={quiet ? `${quiet.orderCount} order · ${money(quiet.revenue)}` : "Belum ada data"} label="Jam tersepi" value={quiet ? hourRange(quiet.hour) : "—"} /><SummaryItem detail={insight.isSparse ? "Sampel terbatas" : "Pola transaksi aktif"} label="Rentang aktif" value={activeRange ? hourRange(activeRange.startHour, activeRange.endHour + 1) : "—"} /></div>
				{insight.isSparse && <p className="mt-2 text-[10px] text-[#8e8e93]">Sampel terbatas: gunakan sebagai indikasi periode ini, bukan pola permanen.</p>}
			</> : <div className="mt-3 rounded-xl bg-[#f7f7f9] px-3 py-8 text-center text-[11px] text-[#6e6e73]">Belum ada transaksi settled pada periode ini.</div>}
		</section>
	);
}
