import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Delete, Minus, Plus } from "lucide-react";
import { useEffect } from "react";
import { Djiwa3DIcon } from "@djiwaapps/web-shared";
import { cn } from "@/lib/utils";
import { OrderModeSwitch, type FlowMode } from "./flow-header";
import { PrimaryButton, Rise, SPRING, StepScreen, StepTitle, tap } from "./step-parts";

const MAX_TABLE_DIGITS = 4;

/** Langkah 1 Dine In: nomor meja lewat keypad besar, tanpa keyboard HP yang menutupi layar. */
export function TableStep({ value, onChange, onNext, mode, onModeChange }: { value: string; onChange: (value: string) => void; onNext: () => void; mode: FlowMode; onModeChange: (mode: FlowMode) => void }) {
	const reduce = useReducedMotion();
	const press = (key: string) => {
		tap();
		if (key === "del") return onChange(value.slice(0, -1));
		if (value.length >= MAX_TABLE_DIGITS || (value === "" && key === "0")) return;
		onChange(value + key);
	};

	// Papan ketik fisik tetap bisa dipakai.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (target && /input|textarea|select/i.test(target.tagName)) return;
			if (/^[0-9]$/.test(event.key)) press(event.key);
			else if (event.key === "Backspace") press("del");
			else if (event.key === "Enter" && value) onNext();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	return (
		<StepScreen label="Pilih nomor meja">
			<Rise className="mb-4"><OrderModeSwitch mode={mode} onChange={onModeChange} /></Rise>
			<Rise className="flex justify-center">
				<motion.div animate={reduce ? undefined : { y: [0, -6, 0], rotate: [0, 2, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
					<Djiwa3DIcon name="restaurant-cafe" size="lg" alt="" className="h-[72px] w-[72px] object-contain drop-shadow-[0_14px_14px_rgba(15,35,71,0.2)]" />
				</motion.div>
			</Rise>
			<StepTitle title="Duduk di meja berapa?" lead="Data ini akan dicatat bersama pesanan." />
			<Rise className="my-3 text-center">
				<p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Nomor meja</p>
				<div className="flex h-[68px] items-center justify-center overflow-hidden" aria-live="polite" aria-label={value ? `Meja ${value}` : "Belum ada nomor meja"}>
					{value ? (
						<span className="flex font-display text-[64px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">
							<AnimatePresence initial={false} mode="popLayout">
								{value.split("").map((digit, index) => (
									<motion.span key={`${index}-${digit}`} layout initial={reduce ? false : { y: 36, opacity: 0, scale: 0.7 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={reduce ? undefined : { y: -30, opacity: 0, scale: 0.7 }} transition={SPRING}>{digit}</motion.span>
								))}
							</AnimatePresence>
						</span>
					) : (
						<span className="font-display text-[64px] font-extrabold leading-none text-black/15">–</span>
					)}
				</div>
			</Rise>
			<Rise>
				<div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Keypad nomor meja">
					{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((key) => (
						<Key key={key} onPress={() => press(key)}>{key}</Key>
					))}
					<span aria-hidden="true" />
					<Key onPress={() => press("0")}>0</Key>
					<Key onPress={() => press("del")} label="Hapus"><Delete className="mx-auto h-6 w-6" strokeWidth={2} /></Key>
				</div>
			</Rise>
			<Rise className="mt-auto pt-4"><PrimaryButton disabled={!value} onClick={onNext}>Lanjut ke jumlah orang</PrimaryButton></Rise>
		</StepScreen>
	);
}

function Key({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label?: string }) {
	const reduce = useReducedMotion();
	return (
		<motion.button type="button" aria-label={label} onClick={onPress} whileTap={reduce ? undefined : { scale: 0.92, backgroundColor: "#e5e5ea" }} transition={SPRING} className="h-[50px] rounded-2xl bg-white text-2xl font-semibold shadow-[0_1px_0_rgba(0,0,0,0.04)]">
			{children}
		</motion.button>
	);
}

const QUICK_PARTY = [1, 2, 3, 4, 5, 6, 7, 8];

/** Langkah 2 Dine In: jumlah orang dengan stepper besar dan pilihan cepat. */
export function PartyStep({ value, onChange, onNext, table }: { value: number; onChange: (value: number) => void; onNext: () => void; table: string }) {
	const reduce = useReducedMotion();
	const set = (next: number) => { tap(); onChange(Math.min(99, Math.max(1, next))); };
	return (
		<StepScreen label="Jumlah orang">
			<Rise>
				<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[13px] font-semibold text-primary">Meja {table || "–"}</span>
			</Rise>
			<Rise className="mt-2 flex justify-center">
				<motion.div animate={reduce ? undefined : { y: [0, -6, 0], rotate: [0, -2, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
					<Djiwa3DIcon name="party-size" size="lg" alt="" className="h-[104px] w-[104px] object-contain drop-shadow-[0_18px_18px_rgba(15,35,71,0.2)]" />
				</motion.div>
			</Rise>
			<StepTitle title="Berapa orang yang memesan?" lead="Data ini akan dicatat bersama pesanan." />
			<Rise className="my-4 flex items-center justify-center gap-5">
				<StepperButton label="Kurangi" onPress={() => set(value - 1)}><Minus className="h-[22px] w-[22px]" strokeWidth={3} /></StepperButton>
				<div className="relative flex h-[88px] min-w-[112px] items-center justify-center overflow-hidden" aria-live="polite">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.b key={value} initial={reduce ? false : { y: 40, opacity: 0, scale: 0.7 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={reduce ? undefined : { y: -40, opacity: 0, scale: 0.7 }} transition={SPRING} className="font-display text-[84px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">{value}</motion.b>
					</AnimatePresence>
				</div>
				<StepperButton label="Tambah" onPress={() => set(value + 1)}><Plus className="h-[22px] w-[22px]" strokeWidth={3} /></StepperButton>
			</Rise>
			<Rise>
				<div className="grid grid-cols-4 gap-2" role="group" aria-label="Pilihan cepat jumlah orang">
					{QUICK_PARTY.map((n) => (
						<motion.button key={n} type="button" onClick={() => set(n)} aria-pressed={value === n} whileTap={reduce ? undefined : { scale: 0.92 }} animate={{ scale: value === n ? 1.04 : 1 }} transition={SPRING} className={cn("h-12 rounded-2xl text-[17px] font-bold shadow-[inset_0_0_0_1px_rgba(60,60,67,0.16)] transition-colors", value === n ? "bg-primary text-primary-foreground shadow-none" : "bg-white")}>{n}</motion.button>
					))}
				</div>
			</Rise>
			<Rise className="mt-auto pt-4"><PrimaryButton onClick={onNext}>Lanjut dengan {value} orang</PrimaryButton></Rise>
		</StepScreen>
	);
}

function StepperButton({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }) {
	const reduce = useReducedMotion();
	return (
		<motion.button type="button" aria-label={label} onClick={onPress} whileTap={reduce ? undefined : { scale: 0.86 }} transition={SPRING} className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white text-primary shadow-[0_8px_20px_rgba(15,35,71,0.1)]">
			{children}
		</motion.button>
	);
}
