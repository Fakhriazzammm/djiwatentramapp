import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatedNumber, EASE_OUT, GrowBar, LiveDot, Reveal, Segmented } from "@/routes/admin/-dashboard/motion";
import { Card, Delta, Empty, Label, SectionTitle, Skeleton, SourceError, Tag } from "@/routes/admin/-dashboard/ui";

export { AnimatedNumber, Card, Delta, Empty, GrowBar, Label, LiveDot, Reveal, SectionTitle, Segmented, Skeleton, SourceError, Tag };

/** Kit komponen halaman Karyawan App. Bahasa visual sama dengan Dashboard Admin. */

export const KK = {
	ink: "#111114",
	mute: "#666672",
	line: "#e4e4e8",
	red: "#d92d20",
	blue: "#2f6fdf",
	green: "#16a34a",
	amber: "#b7791f",
	violet: "#6d4fd8",
} as const;

export type Tone = "ok" | "warn" | "bad" | "info" | "mute";
const TONE_COLOR: Record<Tone, string> = { ok: "#16a34a", warn: "#b7791f", bad: "#d92d20", info: "#2f6fdf", mute: "#666672" };

export function StatusTag({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
	return <Tag color={TONE_COLOR[tone]}>{children}</Tag>;
}

export function Page({ children }: { children: ReactNode }) {
	return (
		<main className="admin-command min-h-full bg-[#f4f4f6] pb-12 pt-1 font-sans text-[#111114]">
			<div className="w-full max-w-[1380px] space-y-[14px] px-3 sm:px-7">{children}</div>
		</main>
	);
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
	return (
		<Reveal>
			<header className="flex flex-wrap items-end justify-between gap-3 pt-2">
				<div className="min-w-0">
					<div className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#0b6bb0]">Karyawan App</div>
					<h1 className="mt-1 font-display text-[28px] font-normal leading-tight tracking-[-0.01em]">{title}</h1>
					{subtitle ? <p className="mt-0.5 max-w-[68ch] text-[14px] text-[#666672]">{subtitle}</p> : null}
				</div>
				{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
			</header>
		</Reveal>
	);
}

export function Btn({
	children,
	onClick,
	primary,
	danger,
	small,
	disabled,
	type = "button",
	title,
}: {
	children: ReactNode;
	onClick?: () => void;
	primary?: boolean;
	danger?: boolean;
	small?: boolean;
	disabled?: boolean;
	type?: "button" | "submit";
	title?: string;
}) {
	const reduce = useReducedMotion();
	const tone = primary
		? "border-[#111114] bg-[#111114] text-white hover:bg-[#2a2a30]"
		: danger
			? "border-[#d92d20] bg-white text-[#d92d20] hover:bg-[#fdecea]"
			: "border-[#d8d8de] bg-white text-[#111114] hover:bg-[#f5f5f7]";
	return (
		<motion.button
			type={type}
			title={title}
			disabled={disabled}
			onClick={onClick}
			whileTap={reduce || disabled ? undefined : { scale: 0.96 }}
			className={`inline-flex items-center justify-center gap-2 border font-mono uppercase tracking-[0.08em] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111114] disabled:cursor-not-allowed disabled:opacity-45 ${small ? "px-2.5 py-1.5 text-[10px]" : "px-4 py-2.5 text-[11px] font-semibold"} ${tone}`}
		>
			{children}
		</motion.button>
	);
}

export function PeriodBar<T extends string>({
	id,
	value,
	onChange,
	options,
	right,
	loading,
}: {
	id: string;
	value: T;
	onChange: (next: T) => void;
	options: ReadonlyArray<{ value: T; label: string }>;
	right?: ReactNode;
	loading?: boolean;
}) {
	const reduce = useReducedMotion();
	return (
		<div className="space-y-[14px]">
			<div className="flex flex-wrap items-center gap-3">
				<Segmented id={id} label="Periode data" value={value} onChange={onChange} options={options} />
				<div className="ml-auto flex flex-wrap items-center gap-3 font-mono text-[10px] text-[#666672]">{right}</div>
			</div>
			<div className="relative h-[2px] overflow-hidden bg-[#e4e4e8]" aria-hidden="true">
				{loading && !reduce && (
					<motion.div className="absolute inset-y-0 w-1/3 bg-[#111114]" initial={{ x: "-100%" }} animate={{ x: "300%" }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />
				)}
			</div>
		</div>
	);
}

export type Kpi = {
	label: string;
	value: number | string | null;
	format?: (n: number) => string;
	delta?: { text: string; direction: "up" | "down" | "flat" | "new" };
	sub?: ReactNode;
};

export function KpiStrip({ items, cols }: { items: Kpi[]; cols?: 3 | 4 | 5 }) {
	const count = cols ?? (Math.min(Math.max(items.length, 3), 5) as 3 | 4 | 5);
	const lg = count === 5 ? "lg:grid-cols-5" : count === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
	return (
		<div className={`grid grid-cols-2 gap-px border border-[#e4e4e8] bg-[#e4e4e8] ${lg}`}>
			{items.map((item, index) => (
				<motion.div
					key={item.label}
					className="min-w-0 bg-white p-4"
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, ease: EASE_OUT, delay: index * 0.05 }}
				>
					<div className="font-display text-[26px] font-normal leading-tight tracking-[-0.02em] tabular-nums">
						{item.value === null ? <Skeleton className="h-7 w-24" /> : typeof item.value === "number" ? <AnimatedNumber value={item.value} format={item.format} /> : item.value}
					</div>
					<Label className="mt-2">{item.label}</Label>
					<div className="mt-1.5 font-mono text-[10px] text-[#666672]">{item.delta ? <Delta text={item.delta.text} direction={item.delta.direction} /> : item.sub}</div>
				</motion.div>
			))}
		</div>
	);
}

/** Baris ringkasan periode (seperti strip perbandingan Dashboard). */
export function CompareStrip({ items, activeIndex = 0, onPick }: { items: { label: string; value: string }[]; activeIndex?: number; onPick?: (i: number) => void }) {
	return (
		<div className="grid grid-cols-2 gap-px border border-t-0 border-[#e4e4e8] bg-[#e4e4e8] sm:grid-cols-3 lg:grid-cols-6" role="list">
			{items.map((item, i) => (
				<motion.button
					key={item.label}
					role="listitem"
					type="button"
					onClick={() => onPick?.(i)}
					whileTap={{ scale: 0.97 }}
					className={`min-w-0 p-3 text-left transition-colors duration-200 hover:bg-[#f6f9ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111114] ${i === activeIndex ? "bg-[#f1f6ff]" : "bg-white"}`}
				>
					<Label>{item.label}</Label>
					<div className="mt-1.5 truncate font-display text-[15px] font-semibold tabular-nums">{item.value}</div>
				</motion.button>
			))}
		</div>
	);
}

export function Panel({ title, tone = "muted", right, children, className = "" }: { title: ReactNode; tone?: "muted" | "ink" | "red" | "amber" | "blue" | "green"; right?: ReactNode; children: ReactNode; className?: string }) {
	return (
		<Card className={className} label={<Label tone={tone}>{title}</Label>} action={right}>
			{children}
		</Card>
	);
}

export type FeedItem = { source: string; text: ReactNode; time: string; tone?: "green" | "blue" | "amber" | "red" };
const FEED_COLOR = { green: "#166534", blue: "#2f5d9e", amber: "#7a4b00", red: "#b42318" };

export function Feed({ items, empty = "Belum ada kejadian." }: { items: FeedItem[]; empty?: string }) {
	if (items.length === 0) return <Empty>{empty}</Empty>;
	return (
		<ul className="divide-y divide-[#efeff2]">
			<AnimatePresence initial={false}>
				{items.map((item, i) => (
					<motion.li
						key={`${item.source}-${i}-${item.time}`}
						layout
						initial={{ opacity: 0, x: -8 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.35, ease: EASE_OUT, delay: Math.min(i, 8) * 0.03 }}
						className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-[13px] max-sm:grid-cols-[minmax(0,1fr)_auto]"
					>
						<span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] max-sm:col-span-2" style={{ color: FEED_COLOR[item.tone ?? "green"] }}>
							{item.source}
						</span>
						<span className="min-w-0 break-words">{item.text}</span>
						<span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.04em] text-[#9a9aa5]">{item.time}</span>
					</motion.li>
				))}
			</AnimatePresence>
		</ul>
	);
}

export type ProgressRow = { label: ReactNode; value: string; ratio: number; tone?: "blue" | "green" | "amber" | "red" };
const BAR: Record<string, string> = { blue: "#2f6fdf", green: "#16a34a", amber: "#d69e2e", red: "#d92d20" };

export function ProgressList({ rows }: { rows: ProgressRow[] }) {
	return (
		<ul className="space-y-3.5">
			{rows.map((row, i) => (
				<li key={String(row.label)}>
					<div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
						<span className="min-w-0 truncate">{row.label}</span>
						<span className="shrink-0 font-mono text-[11px] text-[#666672]">{row.value}</span>
					</div>
					<div className="h-[7px] overflow-hidden bg-[#ececf0]">
						<GrowBar ratio={row.ratio} delay={i * 0.05} className="h-full w-full" style={{ background: BAR[row.tone ?? "blue"] }} />
					</div>
				</li>
			))}
		</ul>
	);
}

export type Insight = { tone: "info" | "warn" | "bad" | "ok"; title: string; detail: string; action?: { label: string; onClick: () => void } };
const INS_STYLE = { info: ["#eaf3ff", "#2f5d9e", "i"], warn: ["#fdf3d8", "#7a4b00", "▲"], bad: ["#fdecea", "#b42318", "!"], ok: ["#e8f5ee", "#166534", "✓"] } as const;

export function InsightList({ items }: { items: Insight[] }) {
	if (items.length === 0) return <Empty>Belum ada wawasan. Data masih terlalu sedikit.</Empty>;
	return (
		<ul className="divide-y divide-[#efeff2]">
			{items.map((item, i) => {
				const [bg, fg, mark] = INS_STYLE[item.tone];
				return (
					<motion.li key={item.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT, delay: i * 0.06 }} className="flex items-start gap-3 py-3">
						<span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center font-mono text-[11px] font-semibold" style={{ background: bg, color: fg }}>
							{mark}
						</span>
						<div className="min-w-0 flex-1">
							<div className="text-[13px] font-semibold">{item.title}</div>
							<div className="mt-0.5 text-[12px] text-[#666672]">{item.detail}</div>
						</div>
						{item.action ? (
							<Btn small onClick={item.action.onClick}>
								{item.action.label}
							</Btn>
						) : null}
					</motion.li>
				);
			})}
		</ul>
	);
}

/** Grafik garis berskala nyata: grid, sumbu, area, garis tergambar, titik akhir ditonjolkan. */
export function LineChart({
	series,
	labels,
	height = 190,
	format = (n: number) => String(Math.round(n)),
	redrawKey,
}: {
	series: { name: string; values: number[]; color: string }[];
	labels: string[];
	height?: number;
	format?: (n: number) => string;
	redrawKey: string;
}) {
	const reduce = useReducedMotion();
	const W = 600;
	const pl = 38;
	const pr = 12;
	const pt = 14;
	const pb = 26;
	const ih = height - pt - pb;
	const iw = W - pl - pr;
	const max = Math.max(1, ...series.flatMap((s) => s.values));
	const step = max > 1000 ? 500 : max > 100 ? 50 : max > 20 ? 10 : max > 5 ? 2 : 1;
	const top = Math.max(step, Math.ceil((max * 1.1) / step) * step);
	const X = (i: number) => (labels.length <= 1 ? pl + iw / 2 : pl + (i * iw) / (labels.length - 1));
	const Y = (v: number) => pt + ih - (v / top) * ih;
	const every = Math.ceil(labels.length / 8);
	return (
		<div>
			<svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img" aria-label="Grafik tren">
				{[0, 1, 2, 3, 4].map((k) => {
					const v = (top * k) / 4;
					return (
						<g key={k}>
							<line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke="#ececf0" />
							<text x={pl - 6} y={Y(v) + 3} textAnchor="end" fontSize="9" fill="#8e8e93" fontFamily="ui-monospace,monospace">
								{format(v)}
							</text>
						</g>
					);
				})}
				{labels.map((l, i) =>
					i % every === 0 || i === labels.length - 1 ? (
						<text key={`${l}-${i}`} x={X(i)} y={height - 8} textAnchor="middle" fontSize="9" fill="#8e8e93" fontFamily="ui-monospace,monospace">
							{l}
						</text>
					) : null,
				)}
				{series.map((s, si) => {
					if (s.values.length === 0) return null;
					const pts = s.values.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
					const li = s.values.length - 1;
					return (
						<g key={`${s.name}-${redrawKey}`}>
							<motion.polygon points={`${X(0)},${Y(0)} ${pts} ${X(li)},${Y(0)}`} fill={s.color} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 0.08 }} transition={{ duration: 0.8, delay: 0.5 }} />
							<motion.polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: EASE_OUT, delay: si * 0.1 }} />
							<motion.circle cx={X(li)} cy={Y(s.values[li])} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1 }} style={{ originX: `${X(li)}px`, originY: `${Y(s.values[li])}px` }} />
							<text x={X(li)} y={Y(s.values[li]) - 10} textAnchor="end" fontSize="10" fill="#111114" fontFamily="ui-monospace,monospace">
								{format(s.values[li])}
							</text>
						</g>
					);
				})}
			</svg>
			<div className="mt-1 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">
				{series.map((s) => (
					<span key={s.name} className="inline-flex items-center gap-1.5">
						<i className="inline-block h-2 w-2" style={{ background: s.color }} />
						{s.name}
					</span>
				))}
			</div>
		</div>
	);
}

export function Heatmap({ rows, cols, matrix, label }: { rows: string[]; cols: string[]; matrix: number[][]; label?: string }) {
	const max = Math.max(1, ...matrix.flat());
	return (
		<div role="img" aria-label={label ?? "Peta panas"} className="grid gap-[3px]" style={{ gridTemplateColumns: `40px repeat(${cols.length}, minmax(0,1fr))` }}>
			<div />
			{cols.map((c) => (
				<div key={c} className="text-center font-mono text-[10px] uppercase text-[#666672]">
					{c}
				</div>
			))}
			{rows.map((r, ri) => (
				<div key={r} className="contents">
					<div className="flex items-center font-mono text-[10px] uppercase text-[#666672]">{r}</div>
					{matrix[ri].map((v, ci) => (
						<motion.div
							key={`${r}-${ci}`}
							title={`${r} ${cols[ci]}: ${v}`}
							initial={{ opacity: 0, scale: 0.8 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.3, delay: (ri * cols.length + ci) * 0.008 }}
							className="grid aspect-[2.2] place-items-center font-mono text-[10px]"
							style={{ background: `color-mix(in srgb, #2f6fdf ${Math.round((v / max) * 85)}%, #f4f4f6)`, color: v / max > 0.55 ? "#fff" : "#111114" }}
						>
							{v || ""}
						</motion.div>
					))}
				</div>
			))}
		</div>
	);
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string }> }) {
	return (
		<div className="flex flex-wrap gap-2">
			{options.map((o) => (
				<motion.button
					key={o.value}
					type="button"
					whileTap={{ scale: 0.96 }}
					onClick={() => onChange(o.value)}
					aria-pressed={o.value === value}
					className={`border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors duration-200 ${o.value === value ? "border-[#111114] bg-[#111114] text-white" : "border-[#d8d8de] bg-white text-[#111114] hover:bg-[#f5f5f7]"}`}
				>
					{o.label}
				</motion.button>
			))}
		</div>
	);
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
	const id = useId();
	return (
		<label htmlFor={id} className="block min-w-[220px] max-w-[360px] flex-1">
			<span className="sr-only">{placeholder}</span>
			<input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 w-full border border-[#d8d8de] bg-white px-3 text-[13px] outline-none focus:border-[#111114]" />
		</label>
	);
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
	const reduce = useReducedMotion();
	return (
		<AnimatePresence>
			{open ? (
				<>
					<motion.div className="fixed inset-0 z-[60] bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
					<motion.aside
						role="dialog"
						aria-label={title}
						className="fixed inset-y-0 right-0 z-[61] w-[440px] max-w-full overflow-y-auto border-l border-[#d8d8de] bg-white p-6 shadow-xl"
						initial={reduce ? false : { x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={{ duration: 0.35, ease: EASE_OUT }}
					>
						<div className="mb-4 flex items-center justify-between">
							<Label tone="blue">{title}</Label>
							<button type="button" onClick={onClose} aria-label="Tutup" className="flex h-8 w-8 items-center justify-center border border-[#d8d8de] hover:bg-[#f5f5f7]">
								<X className="h-4 w-4" />
							</button>
						</div>
						{children}
					</motion.aside>
				</>
			) : null}
		</AnimatePresence>
	);
}

export function DataTable<T>({
	columns,
	rows,
	rowKey,
	onRow,
	empty = "Tidak ada data.",
}: {
	columns: { key: string; header: string; align?: "right"; render: (row: T) => ReactNode; className?: string }[];
	rows: T[];
	rowKey: (row: T) => string;
	onRow?: (row: T) => void;
	empty?: string;
}) {
	return (
		<div className="overflow-x-auto border border-[#e4e4e8] bg-white">
			<table className="w-full min-w-[640px] text-left text-[13px]">
				<thead className="bg-[#fafafb]">
					<tr>
						{columns.map((c) => (
							<th key={c.key} className={`px-4 py-3 font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-[#666672] ${c.align === "right" ? "text-right" : ""}`}>
								{c.header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td colSpan={columns.length} className="p-4">
								<Empty>{empty}</Empty>
							</td>
						</tr>
					) : (
						rows.map((row, i) => (
							<motion.tr
								key={rowKey(row)}
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: Math.min(i, 12) * 0.02 }}
								onClick={onRow ? () => onRow(row) : undefined}
								className={`border-t border-[#efeff2] ${onRow ? "cursor-pointer hover:bg-[#fafafb]" : ""}`}
							>
								{columns.map((c) => (
									<td key={c.key} className={`px-4 py-3 tabular-nums ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
										{c.render(row)}
									</td>
								))}
							</motion.tr>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}

export function Note({ tone = "warn", children }: { tone?: "warn" | "info"; children: ReactNode }) {
	const style = tone === "warn" ? "border-[#d69e2e] bg-[#fdf3d8] text-[#7a4b00]" : "border-[#2f6fdf] bg-[#eaf3ff] text-[#2f5d9e]";
	return (
		<motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`border-l-[3px] px-4 py-3 text-[13px] ${style}`} role="status">
			{children}
		</motion.div>
	);
}
