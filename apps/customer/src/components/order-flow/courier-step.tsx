import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, RefreshCw, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { GhostButton, PrimaryButton, Rise, SPRING, StepScreen, StepTitle, tap } from "./step-parts";

export type CourierKey = "gojek" | "grab";
export type CourierQuoteView = { fee: number; duration?: string; feeSource: "biteship" | "fallback" };

const COURIER_META: Record<CourierKey, { label: string; service: string; color: string }> = {
	grab: { label: "Grab", service: "Grab Instant", color: "#00a85a" },
	gojek: { label: "Gojek", service: "Gojek Instant", color: "#00aa13" },
};

/** Estimasi dari Biteship berbahasa Inggris ("1 - 3 Hours"); tampilkan dalam bahasa Indonesia. */
export function formatDuration(value?: string) {
	if (!value) return null;
	return value.replace(/hours?/i, "jam").replace(/minutes?/i, "menit").replace(/days?/i, "hari").replace(/\s+/g, " ").trim();
}

export function CourierStep({
	options,
	selected,
	quotes,
	loading,
	error,
	canRetry,
	blocked,
	currency,
	onSelect,
	onRetry,
	onBack,
	onNext,
}: {
	options: CourierKey[];
	selected: CourierKey;
	quotes: Partial<Record<CourierKey, CourierQuoteView>>;
	loading: boolean;
	error: string | null;
	canRetry: boolean;
	blocked: boolean;
	currency: (value: number) => string;
	onSelect: (key: CourierKey) => void;
	onRetry: () => void;
	onBack: () => void;
	onNext: () => void;
}) {
	const reduce = useReducedMotion();
	const current = quotes[selected];
	const cheapest = options.reduce<CourierKey | null>((best, key) => (quotes[key] && (!best || quotes[key]!.fee < quotes[best]!.fee) ? key : best), null);
	return (
		<StepScreen label="Pilih kurir">
			<Rise className="mb-3 flex justify-center">
				<motion.div animate={reduce ? undefined : { x: [0, 6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary/10 text-primary"><Truck className="h-8 w-8" /></motion.div>
			</Rise>
			<StepTitle title="Pilih kurir" lead="Tarif dihitung dari alamat dan isi pesananmu." />
			<div className="mt-5 flex flex-col gap-2.5" role="radiogroup" aria-label="Kurir pengantaran">
				{options.map((key, index) => {
					const meta = COURIER_META[key];
					const quote = quotes[key];
					const on = selected === key;
					return (
						<Rise key={key}>
							<motion.button
								type="button"
								role="radio"
								aria-checked={on}
								onClick={() => { tap(); onSelect(key); }}
								whileTap={reduce ? undefined : { scale: 0.98 }}
								animate={{ scale: on ? 1.015 : 1 }}
								transition={SPRING}
								className={cn("flex w-full items-center gap-3.5 rounded-[22px] p-4 text-left transition-colors", on ? "bg-[#f4f9ff] shadow-[inset_0_0_0_2px_var(--primary)]" : "bg-white shadow-[inset_0_0_0_1px_rgba(60,60,67,0.16)]")}
							>
								<span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] text-base font-extrabold text-white" style={{ background: meta.color }}>{meta.label[0]}</span>
								<span className="min-w-0 flex-1">
									<span className="flex items-center gap-2 text-[17px] font-bold">{meta.service}{cheapest === key && options.length > 1 && quote ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">Termurah</span> : null}</span>
									<span className="block text-[13px] text-muted-foreground">{quote ? (formatDuration(quote.duration) ? `Estimasi ${formatDuration(quote.duration)}` : quote.feeSource === "fallback" ? "Tarif tetap" : "Antar langsung ke alamatmu") : loading ? "Menghitung tarif…" : "Tarif belum tersedia"}</span>
								</span>
								<span className="text-right">
									<AnimatePresence mode="wait" initial={false}>
										{quote ? (
											<motion.span key={quote.fee} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="block text-[17px] font-extrabold tabular-nums">{currency(quote.fee)}</motion.span>
										) : (
											<motion.span key="wait" className="block h-5 w-16 animate-pulse rounded-md bg-black/10" />
										)}
									</AnimatePresence>
									<span className="block text-[12px] text-muted-foreground">{quote?.feeSource === "fallback" ? "tetap" : "ongkir"}</span>
								</span>
								<span aria-hidden="true" className={cn("h-[22px] w-[22px] shrink-0 rounded-full transition-all", on ? "shadow-[inset_0_0_0_7px_var(--primary)]" : "shadow-[inset_0_0_0_2px_#c4c7d0]")} style={{ transitionDelay: `${index * 20}ms` }} />
							</motion.button>
						</Rise>
					);
				})}
			</div>
			<Rise className="mt-3">
				<AnimatePresence mode="wait" initial={false}>
					<motion.p key={loading ? "l" : error ? "e" : current ? current.feeSource : "n"} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status" className={cn("rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed", error && !loading ? "bg-destructive/10 text-destructive" : "bg-primary/5 text-muted-foreground")}>
						{loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Memuat tarif pengantaran…</span>
							: error ? error
							: current ? (current.feeSource === "fallback" ? `Tarif pengantaran tetap ${currency(current.fee)} karena tarif kurir belum bisa dimuat. Berlaku 5 menit.` : `Biaya pengantaran ${currency(current.fee)}${formatDuration(current.duration) ? ` · estimasi ${formatDuration(current.duration)}` : ""}. Berlaku 5 menit.`)
							: "Lengkapi lokasi dengan kode pos agar tarif pengantaran dapat dihitung."}
						{!loading && canRetry && (error || !current || current.feeSource === "fallback") ? <button type="button" onClick={onRetry} className="ml-2 inline-flex min-h-8 items-center gap-1 font-bold text-primary underline underline-offset-2"><RefreshCw className="h-3.5 w-3.5" />Muat ulang tarif</button> : null}
					</motion.p>
				</AnimatePresence>
			</Rise>
			<Rise className="mt-auto space-y-2 pt-4">
				<PrimaryButton disabled={blocked} onClick={onNext}>Lanjut ke review</PrimaryButton>
				<GhostButton onClick={onBack}>Kembali ke menu</GhostButton>
			</Rise>
		</StepScreen>
	);
}
