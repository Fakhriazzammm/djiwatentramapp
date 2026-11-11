import { useId, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { AdminOverview, Source } from "@/hooks/use-admin-overview";
import { formatCompactRupiah, formatDelta, percentChange, type Metric, type TrendSeriesPoint } from "@/lib/dashboard-analytics";
import type { DashboardPeriodKey } from "@/lib/dashboard-periods";
import { AnimatedNumber, DrawPath, Reveal, Segmented } from "./motion";
import { Card, Delta, Empty, Label, Masked, MUTED, RED, SourceError, SectionTitle, Skeleton, useMasked, useRupiah } from "./ui";

type Props = {
	overview: AdminOverview;
	period: DashboardPeriodKey;
	onPeriodChange: (next: DashboardPeriodKey) => void;
	periodLabel: string;
};

function valueOf<T>(source: Source<T>): T | null {
	return source.ok ? source.value : null;
}

function smoothPath(points: ReadonlyArray<readonly [number, number]>) {
	if (points.length === 0) return "";
	let path = `M${points[0][0]},${points[0][1]}`;
	for (let index = 1; index < points.length; index += 1) {
		const [prevX, prevY] = points[index - 1];
		const [x, y] = points[index];
		const midX = (prevX + x) / 2;
		path += ` C${midX},${prevY} ${midX},${y} ${x},${y}`;
	}
	return path;
}

export function SalesSection({ overview, period, onPeriodChange, periodLabel }: Props) {
	const rupiah = useRupiah();
	const summary = valueOf(overview.summary);
	const cashflow = valueOf(overview.cashflow);
	const previous = summary?.previous ?? null;
	const selected = summary?.selected ?? { orders: 0, revenue: 0, key: period };
	const average = selected.orders ? selected.revenue / selected.orders : 0;
	const revenueDelta = previous ? formatDelta(selected.revenue, previous.revenue) : null;
	const orderDelta = previous ? formatDelta(selected.orders, previous.orders) : null;

	return (
		<div className="space-y-3">
			<SectionTitle color={RED} right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{periodLabel}</span>}>
				Penjualan
			</SectionTitle>

			<div>
			<div className="grid grid-cols-2 gap-px border border-[#e4e4e8] bg-[#e4e4e8] lg:grid-cols-4">
				<KpiTile
					label="Pendapatan settled"
					value={summary ? <AnimatedNumber value={selected.revenue} format={(next) => rupiah(next)} /> : <Skeleton className="h-7 w-32" />}
					sub={revenueDelta && previous ? <Delta text={revenueDelta.text} direction={revenueDelta.direction} /> : <span className="text-[#666672]">pilih periode pembanding</span>}
					error={summary ? null : overviewError(overview.summary)}
				/>
				<KpiTile
					label="Order settled"
					value={summary ? <AnimatedNumber value={selected.orders} /> : <Skeleton className="h-7 w-16" />}
					sub={orderDelta && previous ? <Delta text={orderDelta.text} direction={orderDelta.direction} /> : <span className="text-[#666672]">jumlah transaksi</span>}
				/>
				<KpiTile
					label="Rata-rata per order"
					value={summary ? <AnimatedNumber value={average} format={(next) => rupiah(next)} /> : <Skeleton className="h-7 w-28" />}
					sub={<span className="text-[#666672]">{periodLabel.toLowerCase()}</span>}
				/>
				<KpiTile
					label="Kas bersih · periode"
					value={cashflow ? <AnimatedNumber value={cashflow.net} format={(next) => rupiah(next)} /> : <span className="text-[13px] text-[#666672]">{valueOf(overview.cashflow) === null ? "Perlu izin keuangan" : "—"}</span>}
					sub={cashflow ? <span className="text-[#666672]">masuk <Masked>{formatCompactRupiah(cashflow.income)}</Masked> · keluar <Masked>{formatCompactRupiah(cashflow.expense)}</Masked></span> : <span className="text-[#666672]">dari transaksi keuangan completed</span>}
				/>
			</div>

			<ComparisonStrip overview={overview} period={period} onPeriodChange={onPeriodChange} />
			</div>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
				<TrendCard overview={overview} period={period} />
				<FlowCard overview={overview} />
			</div>
		</div>
	);
}

function overviewError(source: Source<unknown>): string | null {
	return source.ok ? null : source.error;
}

function KpiTile({ label, value, sub, error }: { label: string; value: ReactNode; sub: ReactNode; error?: string | null }) {
	return (
		<div className="min-w-0 bg-white p-4">
			<div className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-[#111114] sm:text-[26px]">{error ? <span className="text-[14px] font-medium text-[#9b1c12]">Gagal memuat</span> : value}</div>
			<Label className="mt-2">{label}</Label>
			<div className="mt-1.5 font-mono text-[10px] text-[#666672]">{sub}</div>
		</div>
	);
}

function ComparisonStrip({ overview, period, onPeriodChange }: { overview: AdminOverview; period: DashboardPeriodKey; onPeriodChange: (next: DashboardPeriodKey) => void }) {
	const rupiah = useRupiah();
	const summary = valueOf(overview.summary);
	if (!summary) {
		return (
			<div className="grid grid-cols-2 gap-px border border-t-0 border-[#e4e4e8] bg-[#e4e4e8] sm:grid-cols-3 lg:grid-cols-6">
				{Array.from({ length: 6 }).map((_, index) => (
					<div key={index} className="bg-white p-3">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="mt-2 h-4 w-24" />
					</div>
				))}
			</div>
		);
	}
	return (
		<div>
			<div className="grid grid-cols-2 gap-px border border-t-0 border-[#e4e4e8] bg-[#e4e4e8] sm:grid-cols-3 lg:grid-cols-6" role="list" aria-label="Perbandingan periode. Klik untuk membuka periode tersebut.">
				{summary.comparison.map((item, index) => {
					const active = item.key === period;
					return (
						<motion.button
							role="listitem"
							key={item.key}
							type="button"
							onClick={() => onPeriodChange(item.key)}
							initial={false}
							whileTap={{ scale: 0.97 }}
							className={`min-w-0 p-3 text-left transition-colors duration-200 hover:bg-[#f6f9ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111114] ${active ? "bg-[#f1f6ff]" : "bg-white"}`}
							aria-pressed={active}
							data-index={index}
						>
							<Label>{item.label} · {item.orders} order</Label>
							<div className="mt-1.5 truncate font-display text-[15px] font-semibold tabular-nums text-[#111114]">{rupiah(item.revenue)}</div>
						</motion.button>
					);
				})}
			</div>

		</div>
	);
}

function TrendCard({ overview, period }: { overview: AdminOverview; period: DashboardPeriodKey }) {
	const [metric, setMetric] = useState<Metric>("revenue");
	const id = useId();
	const trend = valueOf(overview.trend);
	const error = overview.trend.ok ? null : overview.trend.error;
	return (
		<Card
			ariaLabel="Tren penjualan"
			label={
				<div className="flex items-center gap-2">
					<h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#111114]">Tren {metric === "revenue" ? "pendapatan" : "order"}</h2>
					<span className="font-mono text-[10px] text-[#666672]">{overview.range.trendBucket === "hour" ? "per jam" : overview.range.trendBucket === "day" ? "per hari" : "per bulan"}</span>
				</div>
			}
			action={<Segmented id={`trend-${id}`} label="Metrik tren" size="sm" value={metric} onChange={setMetric} options={[{ value: "revenue", label: "Revenue" }, { value: "orders", label: "Order" }]} />}
		>
			{error ? <SourceError message={error} /> : !trend ? <Skeleton className="h-[220px] w-full" /> : <TrendChart points={trend} metric={metric} redrawKey={`${period}-${metric}`} />}
		</Card>
	);
}

export function TrendChart({ points, metric, redrawKey }: { points: TrendSeriesPoint[]; metric: Metric; redrawKey: string }) {
	const rupiah = useRupiah();
	const reduceMotion = useReducedMotion();
	const [hover, setHover] = useState<number | null>(null);
	const width = 960;
	const height = 220;
	const padX = 14;
	const padTop = 20;
	const padBottom = 28;
	const values = points.map((point) => (metric === "orders" ? point.orders : point.revenue));
	const total = values.reduce((sum, value) => sum + value, 0);
	const max = Math.max(...values, 1);
	const count = points.length;

	if (count === 0 || total === 0) {
		return <Empty>Belum ada transaksi settled pada periode ini.</Empty>;
	}

	const xAt = (index: number) => (count <= 1 ? width / 2 : padX + (index / (count - 1)) * (width - padX * 2));
	const yAt = (value: number) => padTop + (1 - value / max) * (height - padTop - padBottom);
	const coords = values.map((value, index) => [xAt(index), yAt(value)] as const);
	const line = smoothPath(coords);
	const area = `${line} L${xAt(count - 1)},${height - padBottom} L${xAt(0)},${height - padBottom} Z`;
	const peakIndex = values.indexOf(Math.max(...values));
	const active = hover ?? peakIndex;
	const activePoint = points[active];
	const activeValue = values[active];
	const tooltipLeft = (xAt(active) / width) * 100;

	const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const ratio = (event.clientX - rect.left) / rect.width;
		setHover(Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1)))));
	};

	return (
		<div className="relative">
			<svg
				viewBox={`0 0 ${width} ${height}`}
				className="block h-[220px] w-full touch-none"
				role="img"
				aria-label={`Tren ${metric === "revenue" ? "pendapatan" : "order"}. Puncak ${metric === "revenue" ? rupiah(values[peakIndex]) : `${values[peakIndex]} order`} pada ${points[peakIndex]?.label ?? "-"}.`}
				onPointerMove={onPointerMove}
				onPointerDown={onPointerMove}
				onPointerLeave={() => setHover(null)}
			>
				{[0.25, 0.5, 0.75].map((ratio) => (
					<line key={ratio} x1={padX} x2={width - padX} y1={padTop + ratio * (height - padTop - padBottom)} y2={padTop + ratio * (height - padTop - padBottom)} stroke="#ececf0" strokeWidth={1} vectorEffect="non-scaling-stroke" />
				))}
				<motion.path
					key={`area-${redrawKey}`}
					d={area}
					fill={`${RED}1f`}
					initial={reduceMotion ? false : { opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.9, delay: 0.6 }}
				/>
				<DrawPath d={line} stroke={RED} strokeWidth={2.2} redrawKey={`line-${redrawKey}`} delay={0.1} />
				<line x1={xAt(active)} x2={xAt(active)} y1={padTop} y2={height - padBottom} stroke="#111114" strokeOpacity={0.25} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
				<circle cx={xAt(active)} cy={yAt(activeValue)} r={5} fill="#fff" stroke={RED} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
				{points.map((point, index) => (
					<text key={`${point.bucket}-${index}`} x={xAt(index)} y={height - 8} textAnchor="middle" fontSize={11} fill={MUTED} fontFamily="ui-monospace, monospace" style={{ display: count > 16 && index % Math.ceil(count / 8) !== 0 ? "none" : undefined }}>
						{point.label}
					</text>
				))}
			</svg>
			<div
				className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap border border-[#e4e4e8] bg-white px-2.5 py-1.5 font-mono text-[11px] shadow-[0_8px_22px_rgba(17,17,20,0.08)]"
				style={{ left: `${tooltipLeft}%` }}
				aria-hidden="true"
			>
				<div className="text-[#666672]">{activePoint?.label}</div>
				<div className="font-semibold text-[#111114]">{metric === "revenue" ? rupiah(activeValue) : `${activeValue} order`}</div>
				{metric === "revenue" && <div className="text-[#666672]">{activePoint?.orders ?? 0} order</div>}
			</div>
		</div>
	);
}

function FlowCard({ overview }: { overview: AdminOverview }) {
	const breakdown = valueOf(overview.breakdown);
	const error = overview.breakdown.ok ? null : overview.breakdown.error;
	const masked = useMasked();
	if (error) return <Card label={<Label tone="red">Alur order · periode</Label>}><SourceError message={error} /></Card>;
	if (!breakdown) return <Card label={<Label tone="red">Alur order · periode</Label>}><Skeleton className="h-40 w-full" /></Card>;
	const status = breakdown.statusCounts;
	const created = Object.values(status).reduce((sum, value) => sum + value, 0);
	const paid = (status.paid ?? 0) + (status.completed ?? 0);
	const done = status.completed ?? 0;
	const cancelled = status.cancelled ?? 0;
	const pending = status.pending ?? 0;
	const steps = [
		{ label: "Dibuat", value: created, color: "#d92d20" },
		{ label: "Dibayar", value: paid, color: "#d92d20" },
		{ label: "Selesai", value: done, color: "#d92d20" },
		{ label: "Menunggu bayar", value: pending, color: "#b7791f" },
		{ label: "Dibatalkan", value: cancelled, color: "#9ca3af" },
	];
	return (
		<Card label={<Label tone="red">Alur order · periode</Label>}>
			<div className="space-y-3">
				{steps.map((step, index) => {
					const ratio = created ? step.value / created : 0;
					return (
						<div key={step.label}>
							<div className="flex items-baseline justify-between gap-2 text-[12px]">
								<span>{step.label}</span>
								<span className="font-mono text-[11px] text-[#444450]">{masked ? "•••" : `${step.value} · ${Math.round(ratio * 100)}%`}</span>
							</div>
							<div className="mt-1 h-1.5 overflow-hidden bg-[#ececf0]">
								<motion.div
									className="h-full"
									style={{ background: step.color, originX: 0 }}
									initial={{ scaleX: 0 }}
									animate={{ scaleX: ratio }}
									transition={{ duration: 0.8, delay: 0.15 + index * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
								/>
							</div>
						</div>
					);
				})}
			</div>
			<p className="mt-4 font-mono text-[10px] leading-relaxed text-[#666672]">
				Persentase dihitung dari seluruh order yang dibuat pada periode ini, termasuk yang belum dibayar.
			</p>
			{percentChange(paid, created) !== null && (
				<Reveal delay={0.4} className="mt-2 font-mono text-[10px] text-[#444450]">
					Konversi dibayar: {Math.round((paid / Math.max(1, created)) * 100)}%
				</Reveal>
			)}
		</Card>
	);
}
