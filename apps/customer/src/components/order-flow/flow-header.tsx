import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, House } from "lucide-react";
import { cn } from "@/lib/utils";

export type FlowMode = "dine_in" | "delivery";
export type FlowStep = "table" | "address" | "party" | "refill" | "menu" | "shipping" | "review" | "payment" | "receipt";

const SPRING = { type: "spring", stiffness: 420, damping: 30, mass: 0.7 } as const;
const EASE = [0.32, 0.72, 0, 1] as const;

/** Urutan langkah sama dengan alur asli: delivery memilih kurir setelah menu karena tarif butuh isi keranjang. */
export const FLOW_STEPS: Record<FlowMode, ReadonlyArray<{ key: FlowStep; label: string; short: string }>> = {
	dine_in: [
		{ key: "table", label: "Pilih meja", short: "Meja" },
		{ key: "party", label: "Jumlah orang", short: "Orang" },
		{ key: "menu", label: "Pilih menu", short: "Menu" },
		{ key: "review", label: "Review pesanan", short: "Review" },
		{ key: "payment", label: "Pembayaran", short: "Bayar" },
		{ key: "receipt", label: "Selesai", short: "Selesai" },
	],
	delivery: [
		{ key: "address", label: "Alamat pengantaran", short: "Alamat" },
		{ key: "menu", label: "Pilih menu", short: "Menu" },
		{ key: "shipping", label: "Pilih kurir", short: "Kurir" },
		{ key: "review", label: "Review pesanan", short: "Review" },
		{ key: "payment", label: "Pembayaran", short: "Bayar" },
		{ key: "receipt", label: "Selesai", short: "Selesai" },
	],
};

export function flowIndex(step: FlowStep, mode: FlowMode) {
	const normalized = step === "refill" ? "party" : step;
	return Math.max(0, FLOW_STEPS[mode].findIndex((item) => item.key === normalized));
}

/** Langkah sebelumnya dalam alur; null berarti keluar ke Home. */
export function previousFlowStep(step: FlowStep, mode: FlowMode): FlowStep | null {
	if (step === "refill") return "party";
	const list = FLOW_STEPS[mode];
	const index = list.findIndex((item) => item.key === step);
	if (index <= 0 || step === "receipt") return null;
	return list[index - 1].key;
}

function GlassButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
	const reduce = useReducedMotion();
	return (
		<motion.button
			type="button"
			aria-label={label}
			onClick={onClick}
			whileTap={reduce ? undefined : { scale: 0.88 }}
			whileHover={reduce ? undefined : { y: -1 }}
			transition={SPRING}
			className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/70 text-foreground shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.9),0_8px_24px_rgba(15,35,71,0.1)] backdrop-blur-2xl", className)}
		>
			{children}
		</motion.button>
	);
}

export function OrderFlowHeader({
	step,
	mode,
	storeName,
	onBack,
	onHome,
}: {
	step: FlowStep;
	mode: FlowMode;
	storeName: string;
	onBack: () => void;
	onHome: () => void;
}) {
	const reduce = useReducedMotion();
	const steps = FLOW_STEPS[mode];
	const active = flowIndex(step, mode);
	const label = steps[active]?.label ?? "";
	const atStart = active === 0;
	return (
		<header className="sticky top-0 z-30 bg-gradient-to-b from-[#f2f2f7] via-[#f2f2f7]/95 to-[#f2f2f7]/0 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
			<div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
				<GlassButton label={atStart ? "Kembali ke beranda" : "Kembali ke langkah sebelumnya"} onClick={onBack}>
					<ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
				</GlassButton>
				<div className="min-w-0 text-center">
					<p className="truncate font-display text-[15px] font-black leading-tight tracking-[-0.02em]">{storeName}</p>
					<AnimatePresence mode="wait" initial={false}>
						<motion.p
							key={step}
							initial={reduce ? false : { opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={reduce ? undefined : { opacity: 0, y: -6 }}
							transition={{ duration: 0.22, ease: EASE }}
							className="truncate text-[11px] font-bold text-primary"
						>
							{label}
						</motion.p>
					</AnimatePresence>
				</div>
				<GlassButton label="Beranda" onClick={onHome}>
					<House className="h-[18px] w-[18px]" strokeWidth={2.2} />
				</GlassButton>
			</div>
			<div className="mt-3" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={active + 1} aria-valuetext={`Langkah ${active + 1} dari ${steps.length}: ${label}`}>
				<div className="flex gap-1">
					{steps.map((item, index) => (
						<span key={item.key} className="relative h-1 flex-1 overflow-hidden rounded-full bg-black/10">
							<motion.span
								className="absolute inset-0 origin-left rounded-full bg-primary"
								initial={false}
								animate={{ scaleX: index <= active ? 1 : 0 }}
								transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE, delay: index === active ? 0.08 : 0 }}
							/>
						</span>
					))}
				</div>
				<div className="mt-1.5 flex justify-between text-[11px] font-semibold text-muted-foreground">
					<span>Langkah {active + 1} dari {steps.length}</span>
					<motion.b key={steps[active]?.short} initial={reduce ? false : { opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} className="text-primary">{steps[active]?.short}</motion.b>
				</div>
			</div>
		</header>
	);
}

/** Pilihan Dine In / Delivery gaya iOS: pil putih bergeser mengikuti pilihan. */
export function OrderModeSwitch({ mode, onChange }: { mode: FlowMode; onChange: (mode: FlowMode) => void }) {
	const options = [
		{ key: "dine_in", label: "Dine In", hint: "Makan di tempat" },
		{ key: "delivery", label: "Delivery", hint: "Antar ke alamat" },
	] as const;
	return (
		<LayoutGroup id="order-mode">
			<div role="group" aria-label="Jenis pesanan" className="relative grid grid-cols-2 rounded-2xl bg-[rgba(118,118,128,0.14)] p-[3px]">
				{options.map((option) => {
					const selected = mode === option.key;
					return (
						<button key={option.key} type="button" aria-pressed={selected} onClick={() => onChange(option.key)} className={cn("relative z-10 rounded-[13px] px-2 py-2 text-center transition-colors", selected ? "text-primary" : "text-muted-foreground")}>
							{selected ? <motion.span layoutId="mode-pill" transition={SPRING} className="absolute inset-0 -z-10 rounded-[13px] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.1)]" /> : null}
							<span className="block text-sm font-bold">{option.label}</span>
							<span className="block text-[11px] font-medium opacity-80">{option.hint}</span>
						</button>
					);
				})}
			</div>
		</LayoutGroup>
	);
}
