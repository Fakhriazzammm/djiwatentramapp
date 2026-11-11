import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DrawPath } from "./motion";
import { formatRupiah } from "@/lib/dashboard-analytics";

// Komponen UI bersama untuk Pusat Pantau Operasional. Gaya datar: kartu persegi,
// garis tipis, label mono kapital. Warna status memakai token sederhana di bawah.

export const INK = "#111114";
export const MUTED = "#666672";
export const SUBTLE = "#444450";
export const RED = "#d92d20";
export const BLUE = "#2f6fdf";
export const AMBER = "#b7791f";
export const GREEN = "#16a34a";
export const VIOLET = "#6d4fd8";

export const MaskContext = createContext(false);

export function useMasked() {
	return useContext(MaskContext);
}

/** Menyamarkan teks (uang, nama, jumlah) saat mode "sembunyikan angka" aktif. */
export function Masked({ children }: { children: ReactNode }) {
	const masked = useMasked();
	return <>{masked ? "•••" : children}</>;
}

export function Card({
	children,
	className = "",
	label,
	action,
	ariaLabel,
}: {
	children: ReactNode;
	className?: string;
	label?: ReactNode;
	action?: ReactNode;
	ariaLabel?: string;
}) {
	return (
		<section
			aria-label={ariaLabel}
			className={`relative min-w-0 border border-[#e4e4e8] bg-white p-4 transition-[transform,box-shadow,border-color] duration-300 hover:border-[#cfcfd6] hover:shadow-[0_8px_22px_rgba(17,17,20,0.06)] ${className}`}
		>
			{(label || action) && (
				<div className="mb-3 flex items-start justify-between gap-3">
					<div className="min-w-0">{label}</div>
					{action}
				</div>
			)}
			{children}
		</section>
	);
}

export function Label({ children, tone = "muted", className = "" }: { children: ReactNode; tone?: "muted" | "ink" | "red" | "amber" | "blue" | "green"; className?: string }) {
	const color = {
		muted: "text-[#666672]",
		ink: "text-[#111114] font-semibold",
		red: "text-[#d92d20] font-semibold",
		amber: "text-[#7a4b00] font-semibold",
		blue: "text-[#2f5d9e] font-semibold",
		green: "text-[#166534] font-semibold",
	}[tone];
	return <div className={`font-mono text-[10px] uppercase leading-snug tracking-[0.08em] ${color} ${className}`}>{children}</div>;
}

export function SectionTitle({ children, color = INK, right }: { children: ReactNode; color?: string; right?: ReactNode }) {
	return (
		<div className="mb-2 mt-2 flex flex-wrap items-center justify-between gap-3">
			<div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#111114]">
				<span aria-hidden="true" className="inline-block h-[7px] w-[7px]" style={{ background: color }} />
				{children}
			</div>
			{right}
		</div>
	);
}

export function Empty({ children }: { children: ReactNode }) {
	return <div className="bg-[#f6f6f9] p-3 text-center text-[11px] text-[#666672]">{children}</div>;
}

export function SourceError({ message }: { message: string }) {
	return (
		<div role="alert" className="border border-[#f5c2bd] bg-[#fff5f4] p-3 text-[11px] text-[#9b1c12]">
			Data bagian ini belum tersedia. <span className="text-[#666672]">({message})</span>
		</div>
	);
}

export function Skeleton({ className = "" }: { className?: string }) {
	return <div aria-hidden="true" className={`animate-pulse bg-[#ececf0] ${className}`} />;
}

/** Penanda kecil berwarna untuk status/aplikasi. */
export function Tag({ children, color }: { children: ReactNode; color: string }) {
	return (
		<span className="inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color, background: `${color}14` }}>
			{children}
		</span>
	);
}

export function Delta({ text, direction }: { text: string; direction: "up" | "down" | "flat" | "new" }) {
	const style = {
		up: "text-[#166534] bg-[#e8f5ee]",
		down: "text-[#b42318] bg-[#fdecea]",
		flat: "text-[#444450] bg-[#f0f0f3]",
		new: "text-[#2f5d9e] bg-[#eaf3ff]",
	}[direction];
	const arrow = direction === "up" ? "↗ " : direction === "down" ? "↘ " : "";
	return <span className={`inline-flex px-1.5 py-0.5 font-mono text-[10px] font-semibold ${style}`}>{arrow}{text}</span>;
}

/** Sparkline tipis dari nilai per bucket. Kosong/0 menjadi garis datar. */
export function Sparkline({ values, color, redrawKey }: { values: number[]; color: string; redrawKey: string }) {
	const width = 100;
	const height = 30;
	const safe = values.length > 1 ? values : [0, 0];
	const max = Math.max(...safe, 1);
	const points = safe.map((value, index) => [
		(index / (safe.length - 1)) * width,
		height - 3 - (value / max) * (height - 6),
	] as const);
	let path = `M${points[0][0]},${points[0][1]}`;
	for (let index = 1; index < points.length; index += 1) {
		const [prevX, prevY] = points[index - 1];
		const [x, y] = points[index];
		const midX = (prevX + x) / 2;
		path += ` C${midX},${prevY} ${midX},${y} ${x},${y}`;
	}
	return (
		<svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" className="h-[30px] w-[84px] shrink-0 overflow-visible">
			<DrawPath d={path} stroke={color} strokeWidth={1.6} redrawKey={redrawKey} delay={0.2} />
		</svg>
	);
}

/** Waktu sejak "sekarang" dalam bahasa Indonesia singkat. */
export function formatAgo(at: number, now: number): string {
	const seconds = Math.max(0, Math.round((now - at) / 1000));
	if (seconds < 10) return "baru saja";
	if (seconds < 60) return `${seconds} dtk lalu`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} mnt lalu`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	return `${Math.round(hours / 24)} hari lalu`;
}

export function formatClockWIB(at: number): string {
	const shifted = new Date(at + 7 * 3600_000);
	return `${String(shifted.getUTCHours()).padStart(2, "0")}.${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

export function formatDateTimeWIB(at: number): string {
	const shifted = new Date(at + 7 * 3600_000);
	const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
	return `${shifted.getUTCDate()} ${months[shifted.getUTCMonth()]}, ${formatClockWIB(at)}`;
}

/** Rupiah yang ikut tersamarkan bila mode sembunyikan angka aktif. */
export function useRupiah() {
	const masked = useMasked();
	return (value: number) => (masked ? "•••" : formatRupiah(value));
}

export function useNow(intervalMs = 1000) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
		return () => window.clearInterval(timer);
	}, [intervalMs]);
	return now;
}

export const APP_COLOR: Record<string, string> = {
	POS: "#2f5d9e",
	DJIWAAPP: "#0e7490",
	ONLINE: "#475569",
	TELEGRAM: "#0369a1",
	BOOKING: AMBER,
	KARYAWAN: "#166534",
	DJIWAPAY: VIOLET,
	"JUMAT BERKAH": "#166534",
};
