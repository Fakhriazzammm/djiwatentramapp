import { useMemo, useState } from "react";
import { AlertCircle, BarChart3, CalendarDays, Flame, Grid3X3, RefreshCw, Table2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	getHourlyAnalysisDateRange,
	getPeakPoint,
	getPeakRange,
	getPreviousHourlyAnalysisRange,
	getQuietPoint,
	MAX_CUSTOM_RANGE_DAYS,
	type HourlyConfidence,
	type HourlyMetric,
	type HourlyPeriod,
	type HourlySalesPoint,
} from "@/lib/hourly-transaction-analysis";
import { formatDateWIB, todayStrWIB } from "@/lib/wib-utils";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { triggerHybridRefresh, useHybridHourlySales } from "@/hooks/use-hybrid-pos-data";

type HourlyView = "chart" | "heatmap" | "top-hours";
type FilterMode = "preset" | "date" | "range";

const money = (value: number) => formatCurrencyIDR(Number.isFinite(value) ? value : 0);
const periodOptions: Array<{ value: HourlyPeriod; label: string }> = [
	{ value: "today", label: "Hari ini" },
	{ value: "7d", label: "7 hari" },
	{ value: "30d", label: "30 hari" },
];

function hourRange(start: number, end = start + 1) {
	return `${String(start).padStart(2, "0")}.00–${String(end % 24).padStart(2, "0")}.00`;
}

function metricValue(point: HourlySalesPoint, metric: HourlyMetric) {
	return metric === "orders" ? point.orderCount : point.revenue;
}

function formatShortMetric(value: number, metric: HourlyMetric) {
	if (metric === "orders") return String(Math.round(value));
	if (value >= 1_000_000) return `Rp${(value / 1_000_000).toFixed(1)}jt`;
	if (value >= 1_000) return `Rp${Math.round(value / 1_000)}rb`;
	return money(value);
}

function HourlyTooltip({ active, payload }: any) {
	if (!active || !payload?.length) return null;
	const point = payload[0].payload as HourlySalesPoint;
	return (
		<div className="rounded-xl border border-black/[.06] bg-white px-3 py-2 text-[11px] shadow-lg">
			<p className="font-semibold text-[#1d1d1f]">{hourRange(point.hour)}</p>
			<p className="mt-1 text-[#007aff]">{point.orderCount} order</p>
			<p className="text-[#6e6e73]">{money(point.revenue)}</p>
		</div>
	);
}

function SummaryItem({ label, value, detail, highlight = false }: { label: string; value: string; detail: string; highlight?: boolean }) {
	return (
		<div className={`min-w-0 rounded-xl border px-3 py-2.5 ${highlight ? "border-[#e5b94e]/50 bg-[#fffaf0]" : "border-transparent bg-[#f7faff]"}`}>
			<p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#667085]">{label}</p>
			<p className="mt-1 text-[15px] font-bold tabular-nums text-[#14213d]">{value}</p>
			<p className="mt-0.5 break-words text-[10px] leading-tight text-[#667085]">{detail}</p>
		</div>
	);
}

function ViewButton({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: typeof Grid3X3; onClick: () => void }) {
	return (
		<button
			aria-pressed={active}
			className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold transition-colors ${active ? "bg-white text-[#14213d] shadow-sm" : "text-[#667085] hover:text-[#14213d]"}`}
			onClick={onClick}
			type="button"
		>
			<Icon className="h-3.5 w-3.5" />
			{label}
		</button>
	);
}

function ConfidenceBadge({ confidence }: { confidence: HourlyConfidence }) {
	const config: Record<HourlyConfidence, { label: string; className: string }> = {
		insufficient: { label: "Data belum cukup", className: "bg-[#fff0ef] text-[#b42318]" },
		daily: { label: "Indikasi harian", className: "bg-[#eef6ff] text-[#175cd3]" },
		medium: { label: "Confidence sedang", className: "bg-[#fff7e6] text-[#8a5a00]" },
		high: { label: "Confidence tinggi", className: "bg-[#ecfdf3] text-[#027a48]" },
	};
	const item = config[confidence];
	return <span className={`rounded-full px-2 py-1 font-semibold ${item.className}`}>{item.label}</span>;
}

function HourlyLoading() {
	return <section aria-label="Memuat analisa jam operasional" className="rounded-[20px] border border-black/[.04] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,.035)]"><div className="flex items-center justify-between"><Skeleton className="h-5 w-44 rounded-lg" /><Skeleton className="h-8 w-32 rounded-lg" /></div><Skeleton className="mt-3 h-[150px] rounded-xl" /><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div></section>;
}

export default function HourlyTransactionAnalysis() {
	const [period, setPeriod] = useState<HourlyPeriod>("7d");
	const [metric, setMetric] = useState<HourlyMetric>("orders");
	const [view, setView] = useState<HourlyView>("chart");
	const [filterMode, setFilterMode] = useState<FilterMode>("preset");
	const [selectedDate, setSelectedDate] = useState("");
	const [rangeStart, setRangeStart] = useState("");
	const [rangeEnd, setRangeEnd] = useState("");
	const today = todayStrWIB();
	const customRange = useMemo(() => {
		if (filterMode === "date") return selectedDate ? getHourlyAnalysisDateRange(selectedDate) : null;
		if (filterMode === "range") return rangeStart && rangeEnd ? getHourlyAnalysisDateRange(rangeStart, rangeEnd) : null;
		return null;
	}, [filterMode, rangeEnd, rangeStart, selectedDate]);
	const dateKey = filterMode === "date" && selectedDate ? selectedDate : undefined;
	const insight = useHybridHourlySales(period, undefined, dateKey, filterMode === "range" && customRange ? { startDate: customRange.startDate, endDate: customRange.endDate } : undefined);
	const previousRange = customRange ? getPreviousHourlyAnalysisRange(customRange) : null;
	const comparison = useHybridHourlySales("today", undefined, undefined, previousRange ? { startDate: previousRange.startDate, endDate: previousRange.endDate } : undefined);
	const peak = useMemo(() => insight ? getPeakPoint(insight.points, metric) : null, [insight, metric]);
	const quiet = useMemo(() => insight ? getQuietPoint(insight.points) : null, [insight]);
	const activeRange = useMemo(() => insight ? getPeakRange(insight.points) : null, [insight]);
	const rankedPoints = useMemo(() => {
		if (!insight) return [];
		return [...insight.points]
			.filter((point) => point.orderCount > 0)
			.sort((left, right) => metricValue(right, metric) - metricValue(left, metric) || left.hour - right.hour)
			.slice(0, 5);
	}, [insight, metric]);
	const maxMetricValue = useMemo(() => Math.max(...(insight?.points ?? []).map((point) => metricValue(point, metric)), 1), [insight, metric]);
	const hasTransactions = Boolean(insight?.totalSettledOrders);
	const chartTitle = metric === "orders" ? "Order settled per jam" : "Revenue settled per jam";
	const metricUnit = metric === "orders" ? "Jumlah order" : "Revenue (Rp)";
	const peakContribution = peak && insight?.totalSettledOrders ? metric === "orders" ? (peak.orderCount / insight.totalSettledOrders) * 100 : insight.totalSettledRevenue ? (peak.revenue / insight.totalSettledRevenue) * 100 : 0 : 0;
	const dateLabel = customRange ? customRange.startDate === customRange.endDate ? formatDateWIB(customRange.start) : `${formatDateWIB(customRange.start)} – ${formatDateWIB(customRange.end)}` : null;
	const rangeError = filterMode === "range" && rangeStart && rangeEnd && !customRange;
	const comparisonDelta = insight && comparison && metric === "orders" ? insight.totalSettledOrders - comparison.totalSettledOrders : insight && comparison ? insight.totalSettledRevenue - comparison.totalSettledRevenue : null;

	if (insight === undefined) return <HourlyLoading />;
	if (insight === null) {
		return <section className="rounded-[20px] border border-[#ffd6d2] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,.035)]"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#fff0ef] text-[#d70015]"><AlertCircle className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-bold">Analisa jam operasional</h2><p className="mt-1 text-[11px] text-[#6e6e73]">Data transaksi per jam belum dapat dimuat.</p></div><Button className="h-8 shrink-0 rounded-lg px-2.5 text-[11px]" onClick={() => triggerHybridRefresh()} type="button" variant="outline"><RefreshCw className="mr-1 h-3 w-3" />Coba lagi</Button></div></section>;
	}

	return (
		<section aria-label="Analisa jam operasional" className="rounded-[20px] border border-black/[.04] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,.035)]">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2.5">
					<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#007aff]"><BarChart3 className="h-4 w-4" /></span>
					<div className="min-w-0"><h2 className="text-sm font-bold text-[#14213d]">Analisa jam operasional</h2><p className="mt-0.5 text-[11px] text-[#667085]">Jam ramai dan sepi dari transaksi settled · WIB</p></div>
				</div>
				<div className="flex max-w-full flex-wrap gap-1 rounded-xl bg-[#f5f5f7] p-1" role="group" aria-label="Periode analisa">
					{periodOptions.map((option) => <button aria-pressed={filterMode === "preset" && period === option.value} className={`min-h-8 rounded-lg px-2.5 text-[10px] font-semibold transition-colors ${filterMode === "preset" && period === option.value ? "bg-white text-[#007aff] shadow-sm" : "text-[#667085] hover:text-[#14213d]"}`} key={option.value} onClick={() => { setFilterMode("preset"); setPeriod(option.value); }} type="button">{option.label}</button>)}
					<button aria-pressed={filterMode === "date"} className={`min-h-8 rounded-lg px-2.5 text-[10px] font-semibold ${filterMode === "date" ? "bg-white text-[#007aff] shadow-sm" : "text-[#667085]"}`} onClick={() => setFilterMode("date")} type="button">Tanggal</button>
					<button aria-pressed={filterMode === "range"} className={`min-h-8 rounded-lg px-2.5 text-[10px] font-semibold ${filterMode === "range" ? "bg-white text-[#007aff] shadow-sm" : "text-[#667085]"}`} onClick={() => setFilterMode("range")} type="button">Rentang</button>
				</div>
			</div>

			<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#667085]">
				<div className="flex min-w-0 flex-wrap items-center gap-2"><span>{insight.totalSettledOrders} order settled · {insight.sampleDays} hari data</span>{dateLabel && <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f7] px-2 py-1 font-semibold text-[#14213d]"><CalendarDays className="h-3 w-3" />{dateLabel}</span>}<ConfidenceBadge confidence={insight.confidence} /></div>
				{filterMode === "date" && <label className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-black/[.06] px-2 font-semibold text-[#667085]"><CalendarDays className="h-3.5 w-3.5" /><span className="sr-only">Pilih tanggal WIB</span><input aria-label="Pilih tanggal WIB" className="w-[118px] bg-transparent text-[10px] font-semibold text-[#14213d] outline-none" max={today} onChange={(event) => setSelectedDate(event.target.value)} type="date" value={selectedDate} /></label>}
				{filterMode === "range" && <div className="flex flex-wrap items-center gap-1.5"><label className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-black/[.06] px-2"><span>Mulai</span><input aria-label="Tanggal mulai WIB" className="w-[112px] bg-transparent font-semibold text-[#14213d] outline-none" max={today} onChange={(event) => setRangeStart(event.target.value)} type="date" value={rangeStart} /></label><span>→</span><label className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-black/[.06] px-2"><span>Selesai</span><input aria-label="Tanggal selesai WIB" className="w-[112px] bg-transparent font-semibold text-[#14213d] outline-none" max={today} onChange={(event) => setRangeEnd(event.target.value)} type="date" value={rangeEnd} /></label></div>}
			</div>
			{rangeError && <p className="mt-2 text-[10px] font-semibold text-[#b42318]">Pilih rentang maksimal {MAX_CUSTOM_RANGE_DAYS} hari dan pastikan tanggal mulai tidak melewati tanggal selesai.</p>}

			{hasTransactions && <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1.25fr_1fr_1fr]">
				<SummaryItem detail={`${peak?.orderCount ?? 0} order · ${money(peak?.revenue ?? 0)} · ${peakContribution.toFixed(1)}% dari periode`} highlight label={metric === "orders" ? "Jam ramai" : "Revenue tertinggi"} value={peak ? hourRange(peak.hour) : "—"} />
				<SummaryItem detail={comparisonDelta === null ? "Belum ada pembanding" : `${comparisonDelta >= 0 ? "+" : ""}${formatShortMetric(comparisonDelta, metric)} vs periode sebelumnya`} label="Ringkasan periode" value={`${insight.totalSettledOrders} order`} />
				<SummaryItem detail={quiet ? `${quiet.orderCount} order · ${money(quiet.revenue)}` : "Belum ada data"} label="Jam tersepi" value={quiet ? hourRange(quiet.hour) : "—"} />
			</div>}
			{hasTransactions && <p className="mt-2 text-[10px] text-[#667085]">Fokus utama: {peak ? hourRange(peak.hour) : "belum ada peak"}. Rentang transaksi {activeRange ? hourRange(activeRange.startHour, activeRange.endHour + 1) : "belum terbentuk"} berarti jam berurutan yang memiliki transaksi settled.</p>}

			<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
				<div><p className="text-[11px] font-bold text-[#14213d]">{chartTitle}</p><p className="text-[10px] text-[#667085]">{metricUnit} · 24 jam WIB</p></div>
				<div className="flex max-w-full flex-wrap gap-1"><div className="flex rounded-xl bg-[#f5f5f7] p-1" role="group" aria-label="Tampilan analisa"><ViewButton active={view === "chart"} icon={BarChart3} label="Chart" onClick={() => setView("chart")} /><ViewButton active={view === "heatmap"} icon={Grid3X3} label="Heatmap" onClick={() => setView("heatmap")} /><ViewButton active={view === "top-hours"} icon={Table2} label="Jam teratas" onClick={() => setView("top-hours")} /></div><div className="flex rounded-xl border border-black/[.06] p-1" role="group" aria-label="Metrik analisa"><button aria-pressed={metric === "orders"} className={`min-h-7 rounded-md px-2.5 text-[10px] font-semibold ${metric === "orders" ? "bg-[#eaf3ff] text-[#007aff]" : "text-[#667085]"}`} onClick={() => setMetric("orders")} type="button">Order</button><button aria-pressed={metric === "revenue"} className={`min-h-7 rounded-md px-2.5 text-[10px] font-semibold ${metric === "revenue" ? "bg-[#eaf3ff] text-[#007aff]" : "text-[#667085]"}`} onClick={() => setMetric("revenue")} type="button">Revenue</button></div></div>
			</div>

			{hasTransactions ? <>
				{view === "chart" && <div aria-label={`${chartTitle}, ${metricUnit}`} className="mt-1 h-[178px] min-w-0"><ResponsiveContainer height="100%" width="100%"><BarChart data={insight.points} margin={{ top: 10, right: 2, bottom: 0, left: 4 }}><CartesianGrid vertical={false} stroke="#f0f0f2" /><XAxis axisLine={false} dataKey="hour" interval={2} tick={{ fill: "#667085", fontSize: 9 }} tickFormatter={(hour) => `${String(hour).padStart(2, "0")}`} tickLine={false} /><YAxis axisLine={false} tick={{ fill: "#667085", fontSize: 9 }} tickFormatter={(value) => formatShortMetric(Number(value), metric)} tickLine={false} width={metric === "orders" ? 22 : 42} /><Tooltip content={<HourlyTooltip />} cursor={{ fill: "#f5f9ff" }} /><Bar dataKey={metric === "orders" ? "orderCount" : "revenue"} radius={[4, 4, 0, 0]}>{insight.points.map((point) => <Cell fill={peak?.hour === point.hour ? "#d9a72b" : "#1683ff"} key={point.hour} />)}</Bar></BarChart></ResponsiveContainer></div>}
				{view === "heatmap" && <div aria-label={`${chartTitle} heatmap`} className="mt-3 rounded-xl bg-[#f8fbff] p-3"><div className="mb-3 flex items-center justify-between text-[10px] text-[#667085]"><span>Jam sepi</span><span className="font-semibold text-[#14213d]">{metricUnit}</span><span>Jam ramai</span></div><div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">{insight.points.map((point) => { const intensity = metricValue(point, metric) / maxMetricValue; const isPeak = peak?.hour === point.hour; return <div aria-label={`${hourRange(point.hour)}: ${point.orderCount} order, ${money(point.revenue)}`} className={`flex min-h-12 flex-col items-center justify-center rounded-lg border text-[9px] ${isPeak ? "border-[#d9a72b] ring-1 ring-[#d9a72b]/40" : "border-transparent"}`} key={point.hour} style={{ backgroundColor: intensity > 0 ? `rgba(0, 122, 255, ${0.12 + intensity * 0.72})` : "#eef2f7", color: intensity > 0.55 ? "white" : "#14213d" }} title={`${hourRange(point.hour)} · ${point.orderCount} order · ${money(point.revenue)}`}><span className="font-bold">{String(point.hour).padStart(2, "0")}</span><span>{formatShortMetric(metricValue(point, metric), metric)}</span></div>; })}</div></div>}
				{view === "top-hours" && <div className="mt-3 overflow-hidden rounded-xl border border-black/[.05]"><div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-[#f7faff] px-3 py-2 text-[10px] font-semibold text-[#667085]"><span>Jam</span><span>{metric === "orders" ? "Order" : "Revenue"}</span><span>{metric === "orders" ? "Revenue" : "Order"}</span></div>{rankedPoints.length ? rankedPoints.map((point, index) => <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-black/[.04] px-3 py-2 text-[11px]" key={point.hour}><span className="flex items-center gap-2 font-semibold text-[#14213d]"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#eaf3ff] text-[9px] text-[#007aff]">{index + 1}</span>{hourRange(point.hour)}</span><span className="font-bold tabular-nums text-[#14213d]">{metric === "orders" ? point.orderCount : money(point.revenue)}</span><span className="tabular-nums text-[#667085]">{metric === "orders" ? money(point.revenue) : `${point.orderCount} order`}</span></div>) : <div className="px-3 py-6 text-center text-[11px] text-[#667085]">Belum ada jam aktif.</div>}</div>}
			</> : <div className="mt-3 rounded-xl bg-[#f7f7f9] px-3 py-8 text-center text-[11px] text-[#667085]">Belum ada transaksi settled pada periode ini.</div>}
			{insight.isSparse && <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#667085]"><Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d9a72b]" />Data masih terbatas untuk kesimpulan kuat. Gunakan rentang 7 atau 30 hari untuk validasi pola.</p>}
		</section>
	);
}
