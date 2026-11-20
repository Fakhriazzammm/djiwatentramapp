import type { ReactNode } from "react";

const INK = "#111114";

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
