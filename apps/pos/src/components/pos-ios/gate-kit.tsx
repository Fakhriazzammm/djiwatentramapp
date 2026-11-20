import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedNumber, IOS_SPRING, IOS_SPRING_SOFT, listItemMotion } from "./ios-kit";
import { cn } from "@/lib/utils";

const count = (n: number) => String(Math.round(n));

/** Kartu progres "Sudah dicek x/y" dengan bar yang bergerak. */
export function GateProgress({ label, done, total }: { label: string; done: number; total: number }) {
	const pct = total > 0 ? (done / total) * 100 : 0;
	return (
		<div className="mb-2.5 rounded-2xl border border-border bg-card px-3 py-2.5">
			<div className="flex justify-between text-[12.5px] font-semibold">
				<span>{label}</span>
				<span className="tabular-nums"><AnimatedNumber value={done} format={count} />/{total}</span>
			</div>
			<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
				<motion.div className={cn("h-full rounded-full", done === total && total > 0 ? "bg-emerald-500" : "bg-primary")} initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} />
			</div>
		</div>
	);
}

export function GateQuick({ items }: { items: Array<{ label: string; onClick: () => void }> }) {
	return (
		<div className="mb-2 flex gap-1.5">
			{items.map((item) => (
				<motion.button key={item.label} type="button" whileTap={{ scale: 0.96 }} transition={IOS_SPRING} onClick={item.onClick} className="h-9 flex-1 rounded-[11px] bg-primary/10 px-2 text-[12px] font-bold text-primary">{item.label}</motion.button>
			))}
		</div>
	);
}

export function GateGroup({ children }: { children: ReactNode }) {
	return <p className="mx-1 mb-1.5 mt-3 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

/** Baris bahan/menu. Bingkai amber selama belum diisi. */
export function GateRow({ todo, index, children }: { todo: boolean; index: number; children: ReactNode }) {
	return (
		<motion.div layout="position" {...listItemMotion(index)} className={cn("mb-[7px] flex items-center justify-between gap-2 rounded-[14px] border bg-card px-[11px] py-2.5 transition-colors duration-300", todo ? "border-amber-500" : "border-border")}>
			{children}
		</motion.div>
	);
}

/** Saklar dua pilihan; latar pilihan aktif meluncur antar tombol. */
export function AdaHabisSwitch({ id, value, onChange, label }: { id: string; value: boolean | undefined; onChange: (next: boolean) => void; label: string }) {
	return (
		<div role="group" aria-label={label} className="flex shrink-0 rounded-[10px] bg-muted p-0.5">
			{([[true, "Ada"], [false, "Habis"]] as const).map(([v, text]) => {
				const on = value === v;
				return (
					<button key={text} type="button" aria-pressed={on} onClick={() => onChange(v)} className={cn("relative rounded-lg px-[11px] py-[7px] text-[12px] font-bold transition-colors", on ? "text-white" : "text-muted-foreground")}>
						{on ? <motion.span layoutId={`gate-seg-${id}`} transition={IOS_SPRING} className={cn("absolute inset-0 rounded-lg", v ? "bg-emerald-600" : "bg-rose-600")} /> : null}
						<span className="relative">{text}</span>
					</button>
				);
			})}
		</div>
	);
}

/** Pengisi jumlah sisa: tombol minus/plus dan kolom ketik. */
export function CountStepper({ value, unit, step = 1, label, onChange, todo }: { value: number | null | undefined; unit: string; step?: number; label: string; onChange: (next: number) => void; todo: boolean }) {
	const current = typeof value === "number" ? value : 0;
	return (
		<div className="flex shrink-0 items-center gap-1.5">
			<motion.button type="button" whileTap={{ scale: 0.88 }} transition={IOS_SPRING} aria-label={`Kurangi ${label}`} onClick={() => onChange(Math.max(0, current - step))} className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-muted"><Minus className="h-4 w-4" /></motion.button>
			<input inputMode="numeric" aria-label={`Sisa ${label}`} placeholder="0" value={typeof value === "number" ? String(value) : ""} onChange={(event) => { const digits = event.target.value.replace(/\D/g, ""); if (digits) onChange(Number(digits)); }} className={cn("h-[30px] w-[52px] rounded-[9px] border bg-card text-center text-[13px] font-bold tabular-nums outline-none focus:border-primary", todo ? "border-amber-500" : "border-border")} />
			<motion.button type="button" whileTap={{ scale: 0.88 }} transition={IOS_SPRING} aria-label={`Tambah ${label}`} onClick={() => onChange(current + step)} className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-muted"><Plus className="h-4 w-4" /></motion.button>
			<span className="w-8 text-[11.5px] text-muted-foreground">{unit}</span>
		</div>
	);
}

/** Petunjuk amber di atas tombol, memudar saat semua beres. */
export function GateHint({ text }: { text: string | null }) {
	return (
		<div className="mb-1.5 min-h-4 text-center text-[12px] font-semibold text-amber-700">
			<AnimatePresence mode="wait" initial={false}>
				{text ? <motion.span key={text} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="inline-block">{text}</motion.span> : null}
			</AnimatePresence>
		</div>
	);
}

export const gatePanelMotion = { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 }, transition: IOS_SPRING_SOFT } as const;
