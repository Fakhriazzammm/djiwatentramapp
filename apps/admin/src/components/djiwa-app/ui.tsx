import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Flat "command-center" primitives shared by the Djiwa App pages (mirrors Djiwa Pay admin → Pengguna). */

export const rupiah = (value: number) => `Rp${Math.round(value || 0).toLocaleString("id-ID")}`;
export const num = (value: number) => Math.round(value || 0).toLocaleString("id-ID");

export function agoLabel(value: string | null | undefined) {
	if (!value) return "—";
	const diff = Date.now() - new Date(value).getTime();
	if (!Number.isFinite(diff)) return "—";
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "baru saja";
	if (minutes < 60) return `${minutes} mnt lalu`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	const days = Math.floor(hours / 24);
	if (days < 60) return `${days} hari lalu`;
	return `${Math.floor(days / 30)} bln lalu`;
}

export const monoLabel = "font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";

export function Panel({ title, meta, action, children, flush, className = "" }: { title?: ReactNode; meta?: ReactNode; action?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
	return (
		<motion.section className={`min-w-0 border border-border bg-card ${className}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
			{title !== undefined ? (
				<header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
					<span className={monoLabel}>{title}</span>
					{action ?? (meta !== undefined ? <span className="text-[11.5px] text-muted-foreground">{meta}</span> : null)}
				</header>
			) : null}
			<div className={flush ? "" : "p-3.5"}>{children}</div>
		</motion.section>
	);
}

export type KpiItem = { label: string; value: ReactNode; hint?: string; delta?: { cur: number; prev: number }; tone?: "ok" | "warn" | "bad" };

function Delta({ cur, prev }: { cur: number; prev: number }) {
	if (!prev) return <span className="font-mono text-[11px] text-muted-foreground">—</span>;
	const pct = ((cur - prev) / prev) * 100;
	const flat = Math.abs(pct) < 0.05;
	return <span className={`font-mono text-[11px] font-semibold ${flat ? "text-muted-foreground" : pct > 0 ? "text-emerald-700" : "text-red-700"}`}>{pct > 0 ? "▲" : pct < 0 ? "▼" : ""} {Math.abs(pct).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</span>;
}

export function Kpis({ items, cols = 4 }: { items: KpiItem[]; cols?: number }) {
	const grid = cols === 6 ? "lg:grid-cols-6" : cols === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";
	return (
		<div className={`grid grid-cols-2 gap-px border border-border bg-border ${grid}`}>
			{items.map((item, index) => (
				<motion.div key={item.label} className="grid min-w-0 content-start gap-0.5 bg-card px-3.5 py-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.035, duration: 0.35 }}>
					<span className={monoLabel}>{item.label}</span>
					<b className={`break-words text-xl font-bold leading-tight tracking-tight ${item.tone === "ok" ? "text-emerald-700" : item.tone === "warn" ? "text-amber-700" : item.tone === "bad" ? "text-red-700" : ""}`}>{item.value}</b>
					<div className="flex min-h-4 flex-wrap items-center gap-2">
						{item.delta ? <Delta cur={item.delta.cur} prev={item.delta.prev} /> : null}
						{item.hint ? <span className="text-[11.5px] text-muted-foreground">{item.hint}</span> : null}
					</div>
				</motion.div>
			))}
		</div>
	);
}

export function Tabs<T extends string>({ items, value, onChange }: { items: readonly (readonly [T, string, number?])[]; value: T; onChange: (value: T) => void }) {
	return (
		<div className="flex max-w-full overflow-x-auto border border-border bg-card [scrollbar-width:none]" role="tablist">
			{items.map(([key, label, count]) => (
				<button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} className={`h-8 flex-none whitespace-nowrap border-r border-border px-3 font-mono text-[11.5px] font-medium last:border-r-0 ${value === key ? "bg-[#111114] text-white" : "text-[#444450] hover:bg-muted"}`}>
					{label}{count !== undefined ? <span className={`ml-1.5 ${value === key ? "text-white/60" : "text-muted-foreground"}`}>{count.toLocaleString("id-ID")}</span> : null}
				</button>
			))}
		</div>
	);
}

export function Pill({ tone = "", children }: { tone?: "ok" | "warn" | "bad" | "info" | ""; children: ReactNode }) {
	const tones = { ok: "bg-emerald-50 text-emerald-800", warn: "bg-amber-50 text-amber-800", bad: "bg-red-50 text-red-800", info: "bg-blue-50 text-blue-800", "": "bg-muted text-[#444450]" };
	return <span className={`mr-1 inline-block whitespace-nowrap px-1.5 py-px font-mono text-[10px] font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Avatar({ name, photo, size = 34 }: { name: string | null; photo: string | null; size?: number }) {
	return (
		<span className="inline-grid flex-none place-items-center overflow-hidden rounded-full bg-[#111114] font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.42 }}>
			{photo ? <img src={photo} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" /> : (name ?? "?").trim()[0]?.toUpperCase() || "?"}
		</span>
	);
}

export function Rank({ rows, color = "#1a5dc6", empty = "Belum ada data." }: { rows: { label: ReactNode; value: number; text?: string; sub?: ReactNode }[]; color?: string; empty?: string }) {
	const max = Math.max(1, ...rows.map((row) => row.value));
	if (!rows.length) return <p className="py-8 text-center text-xs text-muted-foreground">{empty}</p>;
	return (
		<ul className="m-0 grid list-none gap-3 p-0">
			{rows.map((row, index) => (
				<motion.li key={index} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.03 }}>
					<div className="flex justify-between gap-2.5 text-[12.5px]"><span className="min-w-0 truncate">{row.label}</span><b className="flex-none">{row.text ?? num(row.value)}</b></div>
					<div className="mt-1 h-[5px] bg-muted"><motion.i className="block h-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${Math.max(3, (row.value / max) * 100)}%` }} transition={{ duration: 0.6 }} /></div>
					{row.sub ? <small className="text-[11px] text-muted-foreground">{row.sub}</small> : null}
				</motion.li>
			))}
		</ul>
	);
}

/** Stacked horizontal bar showing share of each segment. */
export function SegmentBar({ rows }: { rows: { label: string; value: number; color: string }[] }) {
	const total = rows.reduce((sum, row) => sum + row.value, 0);
	if (!total) return <p className="py-6 text-center text-xs text-muted-foreground">Belum ada data.</p>;
	return (
		<div>
			<div className="flex h-3 w-full overflow-hidden bg-muted">{rows.map((row) => row.value ? <motion.i key={row.label} className="block h-full" title={`${row.label}: ${row.value}`} style={{ background: row.color }} initial={{ width: 0 }} animate={{ width: `${(row.value / total) * 100}%` }} transition={{ duration: 0.6 }} /> : null)}</div>
			<ul className="mt-3 grid gap-1.5">{rows.map((row) => <li key={row.label} className="flex items-center gap-2 text-[12.5px]"><i className="h-2 w-2 flex-none" style={{ background: row.color }} /><span className="flex-1 truncate">{row.label}</span><b>{num(row.value)}</b><em className="w-9 text-right text-[11px] not-italic text-muted-foreground">{Math.round((row.value / total) * 100)}%</em></li>)}</ul>
		</div>
	);
}

/** 7×24 style heat strip: values per bucket, darker = more. */
export function HeatStrip({ labels, values, color = "26,93,198" }: { labels: string[]; values: number[]; color?: string }) {
	const max = Math.max(1, ...values);
	return (
		<div>
			<div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
				{values.map((value, index) => <div key={index} title={`${labels[index]}: ${value}`} className="h-9 border border-border" style={{ background: value ? `rgba(${color},${0.12 + (value / max) * 0.88})` : "transparent" }} />)}
			</div>
			<div className="mt-1 grid font-mono text-[9.5px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>{labels.map((label, index) => <span key={index} className="text-center">{index % Math.ceil(values.length / 8) === 0 ? label : ""}</span>)}</div>
		</div>
	);
}
