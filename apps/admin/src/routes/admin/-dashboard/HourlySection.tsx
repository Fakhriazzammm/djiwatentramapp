import { Fragment, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { AdminOverview, Source } from "@/hooks/use-admin-overview";
import {
	buildHeatmapTotals,
	type DayTotal,
	type HourTotal,
	CONFIDENCE_LABEL,
	confidenceForSampleDays,
	DOW_LABELS,
	DOW_LONG,
	heatIntensity,
	metricValue,
	topDays,
	topHours,
	type HeatCell,
	type HeatmapPayload,
	type Metric,
} from "@/lib/dashboard-analytics";
import { GrowBar, Segmented } from "./motion";
import { AMBER, BLUE, Card, Empty, Label, Masked, SourceError, Skeleton, Tag, useRupiah } from "./ui";

type View = "chart" | "heatmap" | "hours" | "days";

const VIEW_OPTIONS: ReadonlyArray<{ value: View; label: string }> = [
	{ value: "chart", label: "Chart" },
	{ value: "heatmap", label: "Heatmap" },
	{ value: "hours", label: "Jam teratas" },
	{ value: "days", label: "Hari teratas" },
];
const METRIC_OPTIONS: ReadonlyArray<{ value: Metric; label: string }> = [
	{ value: "orders", label: "Order" },
	{ value: "revenue", label: "Revenue" },
];

function valueOf<T>(source: Source<T>): T | null {
	return source.ok ? source.value : null;
}

function hourRange(hour: number) {
	return `${String(hour).padStart(2, "0")}.00–${String((hour + 1) % 24).padStart(2, "0")}.00`;
}

const CONFIDENCE_COLOR: Record<ReturnType<typeof confidenceForSampleDays>, string> = {
	high: "#166534",
	medium: "#166534",
	daily: AMBER,
	insufficient: "#b42318",
};

export function HourlySection({ overview, periodLabel }: { overview: AdminOverview; periodLabel: string }) {
	const heatmap = valueOf(overview.heatmap);
	const error = overview.heatmap.ok ? null : overview.heatmap.error;
	const [view, setView] = useState<View>("chart");
	const [metric, setMetric] = useState<Metric>("orders");
	const [selected, setSelected] = useState<HeatCell | null>(null);

	return (
		<Card
			ariaLabel="Analisa jam operasional"
			label={
				<div className="space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#111114]">Analisa jam operasional</h2>
						<span className="font-mono text-[10px] text-[#666672]">{periodLabel} · WIB</span>
					</div>
					{heatmap && (
						<div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-[#666672]">
							<span>{heatmap.sampleDays} hari berisi transaksi settled</span>
							<Tag color={CONFIDENCE_COLOR[confidenceForSampleDays(heatmap.sampleDays)]}>
								{CONFIDENCE_LABEL[confidenceForSampleDays(heatmap.sampleDays)]}
							</Tag>
						</div>
					)}
				</div>
			}
			action={
				<div className="flex flex-wrap items-center gap-2">
					<Segmented id="hourly-metric" label="Metrik jam" size="sm" value={metric} onChange={setMetric} options={METRIC_OPTIONS} />
					<Segmented id="hourly-view" label="Tampilan jam" size="sm" value={view} onChange={setView} options={VIEW_OPTIONS} />
				</div>
			}
		>
			{error ? (
				<SourceError message={error} />
			) : !heatmap ? (
				<Skeleton className="h-[260px] w-full" />
			) : heatmap.cells.length === 0 ? (
				<Empty>Belum ada transaksi settled pada periode ini. Pola jam akan muncul setelah ada transaksi.</Empty>
			) : (
				<HourlyBody heatmap={heatmap} view={view} metric={metric} selected={selected} onSelect={setSelected} />
			)}
		</Card>
	);
}

function HourlyBody({
	heatmap,
	view,
	metric,
	selected,
	onSelect,
}: {
	heatmap: HeatmapPayload;
	view: View;
	metric: Metric;
	selected: HeatCell | null;
	onSelect: (cell: HeatCell | null) => void;
}) {
	const rupiah = useRupiah();
	const { hours, days, grid } = useMemo(() => buildHeatmapTotals(heatmap.cells), [heatmap.cells]);
	const peak = topHours(hours, metric, 1)[0];
	const quiet = hours.filter((hour) => metricValue(hour, metric) > 0).sort((a, b) => metricValue(a, metric) - metricValue(b, metric))[0];
	const totalOrders = hours.reduce((sum, hour) => sum + hour.orders, 0);
	const totalRevenue = hours.reduce((sum, hour) => sum + hour.revenue, 0);
	const maxHour = Math.max(...hours.map((hour) => metricValue(hour, metric)), 1);
	const cellMax = Math.max(...heatmap.cells.map((cell) => metricValue(cell, metric)), 1);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-px border border-[#e4e4e8] bg-[#e4e4e8] sm:grid-cols-3">
				<div className="bg-[#fff8e6] p-3">
					<Label tone="amber">Jam ramai</Label>
					<div className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-[#111114]">{peak ? hourRange(peak.hour) : "—"}</div>
					<div className="mt-1 font-mono text-[10px] text-[#444450]">
						{peak ? (
							<>
								<Masked>{peak.orders} order · {rupiah(peak.revenue)}</Masked>
								{totalOrders > 0 && <> · {Math.round((peak.orders / totalOrders) * 100)}% order</>}
							</>
						) : (
							"belum ada data"
						)}
					</div>
				</div>
				<div className="bg-white p-3">
					<Label>Ringkasan periode</Label>
					<div className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-[#111114]">
						<Masked>{totalOrders} order</Masked>
					</div>
					<div className="mt-1 font-mono text-[10px] text-[#444450]">
						<Masked>{rupiah(totalRevenue)}</Masked> total settled
					</div>
				</div>
				<div className="bg-white p-3">
					<Label>Jam tersepi</Label>
					<div className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-[#111114]">{quiet ? hourRange(quiet.hour) : "—"}</div>
					<div className="mt-1 font-mono text-[10px] text-[#444450]">
						{quiet ? <Masked>{quiet.orders} order · {rupiah(quiet.revenue)}</Masked> : "belum ada data"}
					</div>
				</div>
			</div>

			{view === "chart" && <HourChart hours={hours} metric={metric} maxValue={maxHour} peakHour={peak?.hour ?? -1} />}
			{view === "heatmap" && (
				<Heatmap grid={grid} metric={metric} cellMax={cellMax} selected={selected} onSelect={onSelect} />
			)}
			{view === "hours" && <TopHoursList hours={topHours(hours, metric, 5)} metric={metric} maxValue={maxHour} />}
			{view === "days" && <TopDaysList days={topDays(days, metric)} metric={metric} />}

			<p className="font-mono text-[10px] leading-relaxed text-[#666672]">
				Pola jam dihitung dari transaksi settled (paid/completed) dalam WIB. Keyakinan naik seiring jumlah hari yang berisi transaksi.
			</p>
		</div>
	);
}

function HourChart({ hours, metric, maxValue, peakHour }: { hours: Array<{ hour: number; orders: number; revenue: number }>; metric: Metric; maxValue: number; peakHour: number }) {
	const rupiah = useRupiah();
	return (
		<div className="overflow-x-auto">
			<div className="min-w-[640px]">
				<div className="flex h-[210px] items-end gap-1.5 border-b border-[#d8d8de] pb-0.5">
					{hours.map((hour, index) => {
						const value = metricValue(hour, metric);
						const ratio = value / maxValue;
						const isPeak = hour.hour === peakHour && value > 0;
						return (
							<div key={hour.hour} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${hourRange(hour.hour)}: ${metric === "orders" ? `${hour.orders} order` : rupiah(hour.revenue)}`}>
								<span className="mb-1 font-mono text-[10px] text-[#444450] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
									{value > 0 ? (metric === "orders" ? hour.orders : compactValue(hour.revenue)) : ""}
								</span>
								<GrowBar vertical ratio={ratio} delay={0.05 + index * 0.03} className="w-full max-w-[44px] transition-[filter] duration-200 group-hover:brightness-110" style={{ background: isPeak ? AMBER : BLUE, height: "100%" }} />
							</div>
						);
					})}
				</div>
				<div className="mt-1.5 flex gap-1.5">
					{hours.map((hour) => (
						<span key={hour.hour} className="min-w-0 flex-1 text-center font-mono text-[10px] text-[#666672]">
							{hour.hour % 2 === 0 ? String(hour.hour).padStart(2, "0") : ""}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

function compactValue(value: number) {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")}jt`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}rb`;
	return String(Math.round(value));
}

function Heatmap({
	grid,
	metric,
	cellMax,
	selected,
	onSelect,
}: {
	grid: Map<string, HeatCell>;
	metric: Metric;
	cellMax: number;
	selected: HeatCell | null;
	onSelect: (cell: HeatCell | null) => void;
}) {
	const rupiah = useRupiah();
	const reduceMotion = useReducedMotion();
	const [mounted, setMounted] = useState(Boolean(reduceMotion));
	useEffect(() => {
		const frame = requestAnimationFrame(() => setMounted(true));
		return () => cancelAnimationFrame(frame);
	}, []);
	const rgb = metric === "orders" ? "47,111,223" : "183,121,31";
	return (
		<div className="space-y-3">
			<div className="overflow-x-auto">
				<div className="min-w-[720px]">
					<div className="grid gap-[3px]" style={{ gridTemplateColumns: "44px repeat(24, minmax(0, 1fr))" }} role="group" aria-label="Heatmap order per hari dan jam">
						<div aria-hidden="true" className="font-mono text-[10px] text-[#666672]" />
						{Array.from({ length: 24 }, (_, hour) => (
							<div aria-hidden="true" key={hour} className="text-center font-mono text-[10px] text-[#666672]">
								{hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
							</div>
						))}
						{[1, 2, 3, 4, 5, 6, 7].map((dow) => (
							<Fragment key={dow}>
								<div aria-hidden="true" className="flex items-center font-mono text-[11px] text-[#444450]">{DOW_LABELS[dow]}</div>
								{Array.from({ length: 24 }, (_, hour) => {
									const cell = grid.get(`${dow}-${hour}`);
									const value = cell ? metricValue(cell, metric) : 0;
									const alpha = value > 0 ? 0.12 + 0.88 * heatIntensity(value, cellMax) : 0;
									const isSelected = selected?.dow === dow && selected?.hour === hour;
									const label = `${DOW_LONG[dow]} ${hourRange(hour)}: ${cell?.orders ?? 0} order, ${rupiah(cell?.revenue ?? 0)}`;
									return (
										<button
											key={hour}
											type="button"
											aria-label={label}
											title={label}
											aria-pressed={isSelected}
											onClick={() => onSelect(cell ?? { dow, hour, orders: 0, revenue: 0 })}
											className={`aspect-[1/1] min-h-[22px] w-full transition-[transform,opacity] duration-500 hover:scale-[1.15] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111114] ${isSelected ? "ring-2 ring-[#111114] ring-offset-1" : ""}`}
											style={{
												background: value > 0 ? `rgba(${rgb},${alpha})` : "#f3f3f6",
												opacity: mounted ? 1 : 0,
												transitionDelay: mounted ? `${(dow - 1) * 40 + hour * 6}ms` : "0ms",
											}}
										/>
									);
								})}
							</Fragment>
						))}
					</div>
				</div>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3 border border-[#e4e4e8] bg-[#f8f8fa] p-3 font-mono text-[11px] text-[#444450]">
				{selected ? (
					<>
						<span className="text-[#111114]">
							{DOW_LONG[selected.dow]} · {hourRange(selected.hour)}
						</span>
						<span>
							<Masked>{selected.orders} order · {rupiah(selected.revenue)}</Masked>
						</span>
						<button type="button" onClick={() => onSelect(null)} className="text-[#2f5d9e] underline-offset-2 hover:underline">
							tutup
						</button>
					</>
				) : (
					<span>Klik sel untuk melihat detail hari dan jam. Warna makin pekat berarti makin ramai.</span>
				)}
			</div>
		</div>
	);
}

function RankedBars<T extends { orders: number; revenue: number }>({
	items,
	metric,
	maxValue,
	title,
	rankLabel,
	rowKey,
}: {
	items: Array<T>;
	metric: Metric;
	maxValue: number;
	title: (item: T) => string;
	rankLabel: (item: T) => string;
	rowKey: (item: T) => string | number;
}) {
	const rupiah = useRupiah();
	const reduceMotion = useReducedMotion();
	return (
		<ol className="divide-y divide-[#efeff2] border-y border-[#efeff2]">
			{items.map((item, index) => {
				const ratio = metricValue(item, metric) / maxValue;
				return (
					<motion.li
						key={rowKey(item)}
						initial={reduceMotion ? false : { opacity: 0, x: -10 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 0.45, delay: index * 0.05, ease: [0.2, 0.7, 0.2, 1] }}
						className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-2.5"
					>
						<span className="font-mono text-[11px] font-semibold text-[#8e8e93]">{index + 1}</span>
						<div className="min-w-0">
							<div className="flex items-baseline justify-between gap-2">
								<span className="truncate font-mono text-[13px] font-semibold text-[#111114]">{title(item)}</span>
								<span className="shrink-0 font-mono text-[11px] text-[#444450]">
									<Masked>{rankLabel(item)}</Masked>
								</span>
							</div>
							<div className="mt-1.5 h-1.5 overflow-hidden bg-[#ececf0]">
								<GrowBar ratio={ratio} delay={index * 0.05 + 0.1} className="h-full" style={{ background: index === 0 ? AMBER : BLUE }} />
							</div>
						</div>
						<span className="text-right font-mono text-[11px] text-[#666672]">
							<Masked>{rupiah(item.revenue)}</Masked>
						</span>
					</motion.li>
				);
			})}
		</ol>
	);
}

function TopHoursList({ hours, metric, maxValue }: { hours: Array<HourTotal>; metric: Metric; maxValue: number }) {
	if (hours.length === 0) return <Empty>Belum ada jam yang tercatat.</Empty>;
	return (
		<RankedBars
			items={hours}
			metric={metric}
			maxValue={maxValue}
			title={(hour) => hourRange(hour.hour)}
			rankLabel={(hour) => `${hour.orders} order`}
			rowKey={(hour) => hour.hour}
		/>
	);
}

function TopDaysList({ days, metric }: { days: Array<DayTotal>; metric: Metric }) {
	if (days.length === 0) return <Empty>Belum ada hari yang tercatat.</Empty>;
	const max = Math.max(...days.map((day) => metricValue(day, metric)), 1);
	return (
		<RankedBars
			items={days}
			metric={metric}
			maxValue={max}
			title={(day) => DOW_LONG[day.dow]}
			rankLabel={(day) => `${day.orders} order`}
			rowKey={(day) => day.dow}
		/>
	);
}
