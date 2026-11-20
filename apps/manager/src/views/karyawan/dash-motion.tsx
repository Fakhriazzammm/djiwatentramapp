import { animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Primitif animasi dashboard. Semua gerakan mengikuti "kurangi gerakan" (reduced motion)
// dari perangkat dan hanya memakai transform/opacity agar ringan di tablet.

export const EASE_OUT = [0.2, 0.7, 0.2, 1] as const;

export function clamp01(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/** Angka yang menghitung dari nilai terakhir yang tampil ke nilai baru. */
export function AnimatedNumber({
	value,
	format = (next: number) => Math.round(next).toLocaleString("id-ID"),
	className,
}: {
	value: number;
	format?: (next: number) => string;
	className?: string;
}) {
	const reduceMotion = useReducedMotion();
	const [display, setDisplay] = useState(value);
	const shownRef = useRef(value);

	useEffect(() => {
		if (reduceMotion || shownRef.current === value) {
			shownRef.current = value;
			setDisplay(value);
			return;
		}
		const controls = animate(shownRef.current, value, {
			duration: 0.9,
			ease: EASE_OUT,
			onUpdate: (latest) => {
				shownRef.current = latest;
				setDisplay(latest);
			},
		});
		return () => controls.stop();
	}, [value, reduceMotion]);

	return <span className={className}>{format(display)}</span>;
}

/** Blok yang muncul dari bawah dengan jeda bertingkat (stagger). */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
	const reduceMotion = useReducedMotion();
	return (
		<motion.div
			className={className}
			initial={reduceMotion ? false : { opacity: 0, y: 14 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.55, ease: EASE_OUT, delay }}
		>
			{children}
		</motion.div>
	);
}

/** Batang proporsi yang tumbuh dari sumbu dasar; `vertical` untuk grafik batang. */
export function GrowBar({
	ratio,
	vertical = false,
	delay = 0,
	className,
	style,
}: {
	ratio: number;
	vertical?: boolean;
	delay?: number;
	className?: string;
	style?: CSSProperties;
}) {
	const reduceMotion = useReducedMotion();
	const target = clamp01(ratio);
	const hidden = vertical ? { scaleY: 0 } : { scaleX: 0 };
	const shown = vertical ? { scaleY: target } : { scaleX: target };
	return (
		<motion.div
			className={className}
			style={{ originX: 0, originY: 1, ...style }}
			initial={reduceMotion ? false : hidden}
			animate={shown}
			transition={{ duration: 0.8, ease: EASE_OUT, delay }}
		/>
	);
}

/** Garis yang tergambar (pathLength). Gunakan `redrawKey` agar tergambar ulang saat data berganti. */
export function DrawPath({
	d,
	stroke,
	strokeWidth = 2,
	redrawKey,
	delay = 0,
	fill = "none",
}: {
	d: string;
	stroke: string;
	strokeWidth?: number;
	redrawKey: string;
	delay?: number;
	fill?: string;
}) {
	const reduceMotion = useReducedMotion();
	return (
		<motion.path
			key={redrawKey}
			d={d}
			fill={fill}
			stroke={stroke}
			strokeWidth={strokeWidth}
			vectorEffect="non-scaling-stroke"
			strokeLinejoin="round"
			strokeLinecap="round"
			initial={reduceMotion ? false : { pathLength: 0 }}
			animate={{ pathLength: 1 }}
			transition={{ duration: 1.3, ease: EASE_OUT, delay }}
		/>
	);
}

/** Pulsa untuk indikator "live". */
export function LiveDot({ tone = "green" }: { tone?: "green" | "amber" | "red" }) {
	const reduceMotion = useReducedMotion();
	const color = tone === "green" ? "#16a34a" : tone === "amber" ? "#d69e2e" : "#d92d20";
	return (
		<span aria-hidden="true" className="relative inline-flex h-2 w-2 shrink-0">
			<span className="absolute inset-0 rounded-full" style={{ background: color }} />
			{!reduceMotion && (
				<motion.span
					className="absolute inset-0 rounded-full"
					style={{ border: `1.5px solid ${color}` }}
					animate={{ scale: [1, 2.6], opacity: [0.8, 0] }}
					transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
				/>
			)}
		</span>
	);
}

/** Pil tombol yang meluncur ke pilihan aktif (layoutId). */
export function Segmented<T extends string>({
	id,
	label,
	options,
	value,
	onChange,
	size = "md",
}: {
	id: string;
	label: string;
	options: ReadonlyArray<{ value: T; label: string }>;
	value: T;
	onChange: (next: T) => void;
	size?: "sm" | "md";
}) {
	const height = size === "sm" ? "h-7" : "h-8";
	return (
		<div role="group" aria-label={label} className="flex max-w-full overflow-x-auto border border-[#d8d8de] bg-white">
			{options.map((option) => {
				const active = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(option.value)}
						className={`relative ${height} shrink-0 px-3 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#111114] ${
							active ? "text-white" : "text-[#444450] hover:text-[#111114]"
						}`}
					>
						{active && (
							<motion.span
								layoutId={`${id}-pill`}
								className="absolute inset-0 bg-[#111114]"
								transition={{ type: "spring", stiffness: 520, damping: 40 }}
							/>
						)}
						<span className="relative">{option.label}</span>
					</button>
				);
			})}
		</div>
	);
}
