import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Spring dipakai bersama agar semua gerak terasa satu keluarga (gaya iOS). */
export const IOS_SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const;
export const IOS_SPRING_SOFT = { type: "spring", stiffness: 260, damping: 28 } as const;

export function formatRp(value: number | null | undefined): string {
	const n = Math.round(Number(value) || 0);
	const sign = n < 0 ? "−" : "";
	return `${sign}Rp ${Math.abs(n).toLocaleString("id-ID")}`;
}

/** "22.41" gaya Indonesia dari timestamp ms. */
export function formatClock(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** Angka yang menghitung naik/turun saat nilainya berubah. */
export function AnimatedNumber({ value, format = formatRp, className }: { value: number; format?: (n: number) => string; className?: string }) {
	const reduce = useReducedMotion();
	const [shown, setShown] = useState(value);
	const fromRef = useRef(value);
	useEffect(() => {
		if (reduce) {
			setShown(value);
			fromRef.current = value;
			return;
		}
		const controls = animate(fromRef.current, value, {
			duration: 0.55,
			ease: [0.22, 1, 0.36, 1],
			onUpdate: (latest) => setShown(latest),
			onComplete: () => {
				fromRef.current = value;
			},
		});
		return () => {
			fromRef.current = value;
			controls.stop();
		};
	}, [value, reduce]);
	return <span className={cn("tabular-nums", className)}>{format(Math.round(shown))}</span>;
}

/** Bottom sheet gaya iOS: backdrop, grabber, tarik ke bawah untuk menutup. */
export function IosSheet({
	open,
	onClose,
	title,
	children,
	footer,
	heightClass = "max-h-[86dvh]",
	label,
}: {
	open: boolean;
	onClose: () => void;
	title?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	heightClass?: string;
	label?: string;
}) {
	const y = useMotionValue(0);
	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);
	if (typeof document === "undefined") return null;
	return createPortal(
		<AnimatePresence>
			{open ? (
				<div className="fixed inset-0 z-[70] flex items-end justify-center">
					<motion.div
						aria-hidden="true"
						className="absolute inset-0 bg-black/35"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25 }}
						onClick={onClose}
					/>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-label={label ?? (typeof title === "string" ? title : "Panel")}
						className={cn("relative flex w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-background shadow-[0_-12px_48px_rgba(0,0,0,0.22)]", heightClass)}
						style={{ y }}
						initial={{ y: "100%" }}
						animate={{ y: 0 }}
						exit={{ y: "100%" }}
						transition={IOS_SPRING_SOFT}
					>
						<DragHandle y={y} onClose={onClose} />
						{title ? <div className="px-5 pb-2 text-[19px] font-extrabold tracking-tight">{title}</div> : null}
						<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3">{children}</div>
						{footer ? <div className="px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-1">{footer}</div> : <div className="pb-[env(safe-area-inset-bottom)]" />}
					</motion.div>
				</div>
			) : null}
		</AnimatePresence>,
		document.body,
	);
}

function DragHandle({ y, onClose }: { y: ReturnType<typeof useMotionValue<number>>; onClose: () => void }) {
	// Area tarik hanya di grabber agar daftar di dalam sheet tetap bisa di-scroll.
	const startY = useRef<number | null>(null);
	return (
		<div
			className="flex cursor-grab touch-none justify-center pb-2 pt-2.5 active:cursor-grabbing"
			onPointerDown={(event) => {
				startY.current = event.clientY;
				(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (startY.current === null) return;
				y.set(Math.max(0, event.clientY - startY.current));
			}}
			onPointerUp={(event) => {
				if (startY.current === null) return;
				const delta = event.clientY - startY.current;
				startY.current = null;
				if (delta > 90) onClose();
				else animate(y, 0, IOS_SPRING);
			}}
		>
			<span className="h-1.5 w-10 rounded-full bg-border" />
		</div>
	);
}

export interface SegmentedOption<T extends string> {
	value: T;
	label: ReactNode;
}

/** Segmented control dengan pil putih yang meluncur (layoutId). */
export function IosSegmented<T extends string>({
	options,
	value,
	onChange,
	id,
	className,
}: {
	options: SegmentedOption<T>[];
	value: T;
	onChange: (value: T) => void;
	id: string;
	className?: string;
}) {
	return (
		<div role="tablist" className={cn("relative flex rounded-[14px] bg-muted p-[3px]", className)}>
			{options.map((option) => {
				const active = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(option.value)}
						className={cn("relative z-10 h-9 flex-1 rounded-[11px] text-[13px] font-bold transition-colors", active ? "text-foreground" : "text-muted-foreground")}
					>
						{active ? <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded-[11px] bg-background shadow-[0_1px_4px_rgba(0,0,0,0.14)]" transition={IOS_SPRING} /> : null}
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

/** Chip pil. `tone` untuk status; aktif = warna primer. */
export function IosChip({
	active,
	onClick,
	children,
	className,
	count,
}: {
	active?: boolean;
	onClick?: () => void;
	children: ReactNode;
	className?: string;
	count?: number;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileTap={{ scale: 0.94 }}
			transition={IOS_SPRING}
			className={cn(
				"inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold",
				active ? "bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(26,93,198,0.28)]" : "bg-muted text-foreground",
				className,
			)}
		>
			{children}
			{count !== undefined ? <span className={cn("text-[12px] font-extrabold", active ? "text-primary-foreground/90" : "text-muted-foreground")}>{count}</span> : null}
		</motion.button>
	);
}

export type StatusTone = "ok" | "warn" | "info" | "bad" | "neutral";
const TONE: Record<StatusTone, string> = {
	ok: "bg-emerald-50 text-emerald-700",
	warn: "bg-amber-50 text-amber-700",
	info: "bg-primary/10 text-primary",
	bad: "bg-rose-50 text-rose-700",
	neutral: "bg-muted text-muted-foreground",
};

export function StatusPill({ tone = "neutral", children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
	return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11px] font-bold", TONE[tone], className)}>{children}</span>;
}

/** Tombol tekan dengan feedback skala. */
export function PressButton({ className, children, ...props }: React.ComponentProps<typeof motion.button>) {
	return (
		<motion.button whileTap={{ scale: 0.95 }} transition={IOS_SPRING} type="button" className={className} {...props}>
			{children}
		</motion.button>
	);
}

/** Item daftar yang muncul bertahap. */
export const listItemMotion = (index: number) => ({
	initial: { opacity: 0, y: 12 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, x: 40, transition: { duration: 0.22 } },
	transition: { ...IOS_SPRING_SOFT, delay: Math.min(index, 8) * 0.035 },
});

/** Indikator numerik kecil di atas ikon (badge merah). */
export function CountBadge({ value, className }: { value: number; className?: string }) {
	if (value <= 0) return null;
	return (
		<span className={cn("absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-none text-white", className)}>
			{value > 99 ? "99+" : value}
		</span>
	);
}

/** Konfirmasi gaya iOS untuk aksi destruktif / sulit dibatalkan. */
export function ConfirmSheet({
	open,
	title,
	message,
	confirmLabel = "Lanjutkan",
	destructive,
	busy,
	onConfirm,
	onClose,
}: {
	open: boolean;
	title: string;
	message: string;
	confirmLabel?: string;
	destructive?: boolean;
	busy?: boolean;
	onConfirm: () => void;
	onClose: () => void;
}) {
	return (
		<IosSheet open={open} onClose={onClose} title={title} heightClass="max-h-[60dvh]">
			<p className="pb-2 text-[14px] leading-relaxed text-muted-foreground">{message}</p>
			<div className="flex gap-2.5 pb-3 pt-3">
				<button type="button" onClick={onClose} className="h-12 flex-1 rounded-2xl bg-muted text-[15px] font-bold">Batal</button>
				<motion.button
					type="button"
					whileTap={{ scale: 0.97 }}
					disabled={busy}
					onClick={onConfirm}
					className={cn("h-12 flex-1 rounded-2xl text-[15px] font-bold text-white disabled:opacity-60", destructive ? "bg-rose-600" : "bg-primary")}
				>
					{busy ? "Memproses…" : confirmLabel}
				</motion.button>
			</div>
		</IosSheet>
	);
}
