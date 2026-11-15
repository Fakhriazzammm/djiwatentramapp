import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const EASE = [0.32, 0.72, 0, 1] as const;
export const SPRING = { type: "spring", stiffness: 380, damping: 26, mass: 0.8 } as const;

/** Haptic ringan bila perangkat mendukung; aman dipanggil di mana saja. */
export function tap(ms = 8) {
	try {
		if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
	} catch {
		/* perangkat tanpa haptic */
	}
}

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } } };

/** Pembungkus layar: anak-anaknya naik berurutan; tombol aksi menempel di bawah. */
export function StepScreen({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
	const reduce = useReducedMotion();
	return (
		<motion.section aria-label={label} variants={container} initial={reduce ? "show" : "hidden"} animate="show" className={cn("flex min-h-full flex-1 flex-col px-5 pb-6", className)}>
			{children}
		</motion.section>
	);
}

export function Rise({ children, className }: { children: ReactNode; className?: string }) {
	return <motion.div variants={item} className={className}>{children}</motion.div>;
}

export function StepTitle({ title, lead, center = true }: { title: string; lead?: string; center?: boolean }) {
	return (
		<Rise className={center ? "text-center" : undefined}>
			<h2 className="font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.04em]">{title}</h2>
			{lead ? <p className="mt-1.5 text-[15px] text-muted-foreground">{lead}</p> : null}
		</Rise>
	);
}

/** Tombol utama biru: efek tekan, kilau berkala, dan panah geser saat aktif. */
export function PrimaryButton({ children, onClick, disabled, themeColor, arrow = true, className }: { children: ReactNode; onClick: () => void; disabled?: boolean; themeColor?: string; arrow?: boolean; className?: string }) {
	const reduce = useReducedMotion();
	return (
		<motion.button
			type="button"
			disabled={disabled}
			onClick={() => { tap(10); onClick(); }}
			whileTap={reduce || disabled ? undefined : { scale: 0.97 }}
			animate={{ opacity: disabled ? 0.38 : 1 }}
			transition={SPRING}
			style={themeColor ? { background: themeColor } : undefined}
			className={cn("relative flex min-h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-[18px] bg-primary px-5 text-[17px] font-semibold tracking-tight text-primary-foreground shadow-lg shadow-primary/30 disabled:shadow-none", className)}
		>
			{!disabled && !reduce ? <motion.span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-16 -skew-x-[20deg] bg-white/35" initial={{ left: "-30%" }} animate={{ left: ["-30%", "-30%", "130%"] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", times: [0, 0.6, 1], delay: 1.5 }} /> : null}
			<span className="relative">{children}</span>
			{arrow ? <motion.span className="relative" animate={disabled || reduce ? undefined : { x: [0, 3, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}><ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.6} /></motion.span> : null}
		</motion.button>
	);
}

export function GhostButton({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
	const reduce = useReducedMotion();
	return (
		<motion.button type="button" onClick={onClick} whileTap={reduce ? undefined : { scale: 0.97 }} transition={SPRING} className={cn("flex min-h-12 w-full items-center justify-center rounded-2xl bg-white text-[15px] font-semibold text-foreground shadow-[inset_0_0_0_1px_rgba(60,60,67,0.16)]", className)}>
			{children}
		</motion.button>
	);
}
