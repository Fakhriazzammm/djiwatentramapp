import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Radio } from "lucide-react";
import { useHybridShiftStatus } from "@/hooks/use-hybrid-pos-data";
import { cn } from "@/lib/utils";

export function CustomerLiveShiftIndicator({ variant = "bar" }: { variant?: "bar" | "hero" } = {}) {
	const shiftStatus = useHybridShiftStatus();
	const ongoingShift = shiftStatus?.ongoingShift;
	const isLive = Boolean(shiftStatus?.isOpen && ongoingShift);
	const shiftName = ongoingShift?.shiftName ?? "Shift berjalan";
	const label = shiftStatus === undefined
		? "Memeriksa layanan"
		: shiftStatus === null
			? "Status layanan belum tersedia"
			: isLive
				? "Layanan aktif"
				: "Layanan sedang offline";
	const tone = isLive
		? "border-emerald-200/70 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100"
		: shiftStatus === null
			? "border-amber-200/70 bg-amber-50/80 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100"
			: "border-border/70 bg-muted/40 text-muted-foreground";

	if (variant === "hero") {
		return (
			<div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/35 bg-white/20 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_2px_12px_rgba(0,0,0,0.12)] backdrop-blur-xl" role="status" aria-live="polite">
				<span className={cn("h-2 w-2 shrink-0 rounded-full", isLive ? "bg-emerald-400" : shiftStatus === null ? "bg-amber-300" : "bg-white/70")} aria-hidden="true" />
				<span className="min-w-0 truncate">
					{label}
					{isLive ? <><span className="mx-1 opacity-70">•</span>{shiftName}</> : null}
				</span>
			</div>
		);
	}

	return (
		<div className={cn("mx-auto flex w-full max-w-md items-center gap-1.5 border-b px-3 py-1.5 text-[11px]", tone)} role="status" aria-live="polite">
			<span className={cn("relative flex h-2 w-2 shrink-0 rounded-full", isLive ? "bg-emerald-500" : shiftStatus === null ? "bg-amber-500" : "bg-muted-foreground/50")} aria-hidden="true" />
			<Radio className={cn("h-3.5 w-3.5 shrink-0", isLive ? "text-emerald-600" : shiftStatus === null ? "text-amber-600" : "text-muted-foreground")} aria-hidden="true" />
			<span className="min-w-0 truncate">
				<span className="font-bold">{label}</span>
				{isLive ? <><span className="mx-1 opacity-60">•</span>{shiftName}</> : null}
			</span>
		</div>
	);
}

export function CustomerHeader({
	backLabel = "Kembali",
	leading,
	onBack,
	right,
	showPressHint = false,
	subtitle,
	title,
	eyebrow,
}: {
	backLabel?: string;
	leading?: ReactNode;
	onBack?: () => void;
	right?: ReactNode;
	showPressHint?: boolean;
	subtitle?: string;
	title: string;
	eyebrow?: string;
}) {
	const shouldReduceMotion = useReducedMotion();

	return (
		<header className="sticky top-0 z-30 border-b border-black/[0.04] bg-background/90 px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
			<div className="grid min-h-11 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
				{onBack ? (
					<motion.button
						type="button"
						whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
						whileHover={shouldReduceMotion ? undefined : { y: -1 }}
						animate={showPressHint && !shouldReduceMotion ? { y: [0, -3, 0] } : undefined}
						transition={showPressHint ? { type: "spring", stiffness: 380, damping: 20, repeat: Infinity, repeatDelay: 1.8 } : { type: "spring", stiffness: 420, damping: 28, mass: 0.7 }}
						className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground shadow-[0_4px_16px_rgba(15,23,42,0.06)] transition-all duration-[180ms] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.97]"
						aria-label={backLabel}
						onClick={onBack}
					>
						{showPressHint && !shouldReduceMotion ? <motion.span aria-hidden="true" className="pointer-events-none absolute inset-[-4px] rounded-full border border-primary/40" animate={{ scale: [0.9, 1.16], opacity: [0.55, 0] }} transition={{ duration: 1.15, repeat: Infinity, repeatDelay: 1.8 }} /> : null}
						{leading}
					</motion.button>
				) : leading ? <div className="flex h-11 w-11 shrink-0 items-center justify-center">{leading}</div> : <span aria-hidden="true" />}
				<div className="min-w-0 text-center">
					{eyebrow ? <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{eyebrow}</p> : null}
					<h1 className="font-display truncate text-[15px] font-black leading-tight tracking-[-0.02em] text-foreground">{title}</h1>
					{subtitle ? <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">{subtitle}</p> : null}
				</div>
				<div className="flex min-h-11 w-11 shrink-0 items-center justify-end">{right ?? null}</div>
			</div>
		</header>
	);
}

export function CustomerSectionHeading({
	action,
	description,
	title,
}: {
	action?: ReactNode;
	description?: string;
	title: string;
}) {
	return (
		<div className="flex items-end justify-between gap-3">
			<div className="min-w-0">
				<h2 className="font-display text-lg font-extrabold leading-tight text-foreground">{title}</h2>
				{description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}

export function CustomerPrimaryCta({
	children,
	className,
	disabled,
	icon,
	onClick,
	type = "button",
}: {
	children: ReactNode;
	className?: string;
	disabled?: boolean;
	icon?: ReactNode;
	onClick?: () => void;
	type?: "button" | "submit" | "reset";
}) {
	return (
		<button
			type={type}
			className={cn(
				"inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-all duration-[180ms] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50",
				className
			)}
			disabled={disabled}
			onClick={onClick}
		>
			{icon}
			{children}
		</button>
	);
}

export function CustomerBottomNav({
	items,
	primaryLabel = "Pesan",
}: {
	items: Array<{
		active?: boolean;
		badge?: ReactNode;
		icon: ReactNode;
		label: string;
		onSelect?: () => void;
	}>;
	/** Item dengan label ini tampil sebagai tombol aksi bulat terpisah (pola tab bar iOS 26). */
	primaryLabel?: string;
}) {
	const shouldReduceMotion = useReducedMotion();
	const spring = { type: "spring" as const, stiffness: 420, damping: 28, mass: 0.7 };
	const shiftStatus = useHybridShiftStatus();
	const isLive = Boolean(shiftStatus?.isOpen && shiftStatus?.ongoingShift);
	const primary = items.find((item) => item.label === primaryLabel);
	const tabs = items.filter((item) => item.label !== primaryLabel);

	return (
		<nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3.5 pb-[max(1rem,var(--safe-area-bottom))]" aria-label="Navigasi utama">
			<div className="pointer-events-auto mx-auto flex max-w-md items-center gap-2.5">
				<div
					className="flex h-[62px] min-w-0 flex-1 items-center gap-0.5 rounded-full border border-white/80 bg-background/75 p-1.5 shadow-[0_8px_28px_rgba(20,32,63,0.18)] backdrop-blur-2xl backdrop-saturate-[1.8] [@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none"
					style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(tabs.length, 1)}, minmax(0, 1fr))` }}
				>
					{tabs.map((item) => (
						<motion.button
							key={item.label}
							type="button"
							whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
							transition={spring}
							className={cn(
								"relative flex h-[50px] min-w-11 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								item.active ? "text-primary" : "text-foreground/70 hover:text-foreground"
							)}
							onClick={item.onSelect}
							aria-current={item.active ? "page" : undefined}
						>
							{item.active ? <motion.span layoutId="customer-bottom-nav-active" transition={spring} className="absolute inset-0 rounded-full bg-primary/12" aria-hidden="true" /> : null}
							{item.badge ? <span className="absolute right-1/4 top-0.5 z-[1]">{item.badge}</span> : null}
							<span className="relative z-[1] flex h-5 items-center justify-center">{item.icon}</span>
							<span className="relative z-[1] max-w-full truncate">{item.label}</span>
						</motion.button>
					))}
				</div>
				{primary ? (
					<motion.button
						type="button"
						whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
						transition={spring}
						onClick={primary.onSelect}
						aria-current={primary.active ? "page" : undefined}
						aria-label={isLive ? primary.label : `${primary.label} (layanan sedang offline, lihat menu)`}
						className={cn(
							"relative flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border border-white/60 text-[10px] font-extrabold text-white shadow-[0_8px_24px_rgba(11,99,184,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							isLive ? "bg-primary" : "bg-[#7C8CA3] shadow-[0_8px_24px_rgba(85,101,125,0.3)]"
						)}
					>
						<span className="flex h-5 items-center justify-center rounded-md bg-white/90 px-0.5">{primary.icon}</span>
						<span>{primary.label}</span>
					</motion.button>
				) : null}
			</div>
		</nav>
	);
}
