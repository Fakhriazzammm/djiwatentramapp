import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowDownRight, ArrowLeft, ArrowUpRight, Banknote, Plus, SquarePlay } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useHybridAllTransactions } from "@/hooks/use-hybrid-finance-analytics-data";
import { useHybridShiftStatus } from "@/hooks/use-hybrid-pos-data";
import { cn } from "@/lib/utils";
import { AnimatedNumber, formatClock, formatRp, IOS_SPRING, IOS_SPRING_SOFT, listItemMotion } from "./ios-kit";
import { CashEntrySheet, type CashEntryType } from "./cash-entry-sheet";

type View = "book" | "shift";

/** Buku kas shift: estimasi laci + timeline. Alur buka/akhiri shift dipasang lewat `renderShiftFlow` (logika tetap di menu-sidebar). */
export function CashBookScreen({ renderShiftFlow }: { renderShiftFlow: (onClose: () => void) => ReactNode }) {
	const [view, setView] = useState<View>("book");
	const [entry, setEntry] = useState<{ open: boolean; type: CashEntryType }>({ open: false, type: "expense" });
	const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
	const transactions = useHybridAllTransactions({ startDate: today });
	const shiftStatus = useHybridShiftStatus();
	const isShiftOpen = shiftStatus?.isOpen ?? false;
	const startedAt = Number(shiftStatus?.latestMulai ?? 0);

	const lastAutoClosed = useMemo(() => {
		if (isShiftOpen) return null;
		const last = (shiftStatus?.allShifts ?? []).filter((s: any) => s.endTime !== undefined).sort((a: any, b: any) => (b.endTime ?? 0) - (a.endTime ?? 0))[0];
		return last?.isAutoClosed ? last : null;
	}, [isShiftOpen, shiftStatus?.allShifts]);

	const rows = useMemo(() => {
		if (!isShiftOpen || !startedAt) return [];
		const list = ((transactions as any[]) ?? []).filter((t) => t.date >= startedAt && t.status === "completed").sort((a, b) => a.date - b.date);
		let balance = 0;
		const withBalance = list.map((t) => {
			balance += t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : 0;
			return { t, balance };
		});
		return withBalance.reverse();
	}, [transactions, isShiftOpen, startedAt]);

	const totals = useMemo(() => {
		let income = 0, expense = 0, modal = 0;
		for (const { t } of rows) {
			if (t.type === "income") { income += t.amount; if (String(t.category ?? "").toLowerCase().includes("modal")) modal += t.amount; }
			else if (t.type === "expense") expense += t.amount;
		}
		return { income, expense, modal, balance: income - expense };
	}, [rows]);

	if (view === "shift") {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<button type="button" onClick={() => setView("book")} className="mb-2 flex h-10 w-fit items-center gap-1.5 rounded-full bg-muted px-3.5 text-[13px] font-bold"><ArrowLeft className="h-4 w-4" />Kembali</button>
				<div className="min-h-0 flex-1 overflow-y-auto">{renderShiftFlow(() => setView("book"))}</div>
			</div>
		);
	}

	if (!isShiftOpen) {
		return (
			<motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={IOS_SPRING_SOFT} className="flex flex-1 flex-col items-center justify-center px-4 text-center">
				<div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted"><Banknote className="h-10 w-10 text-muted-foreground/60" aria-hidden="true" /></div>
				<h3 className="text-[20px] font-extrabold tracking-tight">Shift kasir tertutup</h3>
				<p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-muted-foreground">Buka shift dulu untuk mencatat arus kas dan melayani pelanggan.</p>
				{lastAutoClosed ? (
					<div className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-left text-[12px] text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span><b>Shift {lastAutoClosed.shiftName} ditutup otomatis.</b> Shift sebelumnya melewati jadwal dan ditutup oleh sistem.</span></div>
				) : null}
				<motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => setView("shift")} className="mt-6 flex h-[52px] w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground"><SquarePlay className="h-5 w-5" />Buka shift sekarang</motion.button>
			</motion.div>
		);
	}

	const txCount = rows.length;
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<div className="flex items-end justify-between pb-1">
				<div>
					<p className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground">ESTIMASI UANG LACI</p>
					<AnimatedNumber value={totals.balance} className="text-[32px] font-extrabold leading-tight tracking-tight" />
					<p className="text-[12px] font-semibold text-emerald-600">SHIFT AKTIF · {shiftStatus?.shiftInfo?.cashierName || "Kasir"}</p>
				</div>
				<motion.button type="button" whileTap={{ scale: 0.94 }} onClick={() => setView("shift")} className="h-9 rounded-full bg-rose-50 px-4 text-[13px] font-bold text-rose-700">Akhiri</motion.button>
			</div>
			<div className="grid grid-cols-2 gap-2 pb-1 pt-2">
				<div className="rounded-2xl bg-emerald-50 px-3 py-2"><p className="text-[10.5px] font-bold tracking-wider text-emerald-700">MASUK</p><p className="text-[15px] font-extrabold tabular-nums text-emerald-800">+{formatRp(totals.income)}</p><p className="text-[10.5px] text-emerald-700/80">termasuk modal {formatRp(totals.modal)}</p></div>
				<div className="rounded-2xl bg-rose-50 px-3 py-2"><p className="text-[10.5px] font-bold tracking-wider text-rose-700">KELUAR</p><p className="text-[15px] font-extrabold tabular-nums text-rose-800">{formatRp(-totals.expense)}</p><p className="text-[10.5px] text-rose-700/80">{txCount} catatan shift ini</p></div>
			</div>
			<p className="px-1 pb-1.5 pt-3 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">BUKU KAS · SHIFT INI</p>
			<div className="relative min-h-0 flex-1 overflow-y-auto pb-28">
				<div className="pointer-events-none absolute bottom-0 left-[19px] top-0 w-0.5 bg-border" aria-hidden="true" />
				{transactions === undefined ? <p className="py-8 text-center text-sm text-muted-foreground">Memuat…</p> : null}
				{transactions !== undefined && rows.length === 0 ? <p className="py-10 text-center text-[13px] text-muted-foreground">Belum ada catatan kas.</p> : null}
				<AnimatePresence initial={false}>
					{rows.map(({ t, balance }, index) => {
						const isIncome = t.type === "income";
						const isModal = String(t.category ?? "").toLowerCase().includes("modal");
						return (
							<motion.div key={t._id ?? `${t.date}-${index}`} layout="position" {...listItemMotion(index)} className="relative flex items-center gap-3 py-2.5">
								<span className={cn("relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", isModal ? "bg-primary/10 text-primary" : isIncome ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
									{isModal ? <Banknote className="h-[18px] w-[18px]" /> : isIncome ? <ArrowUpRight className="h-[18px] w-[18px]" /> : <ArrowDownRight className="h-[18px] w-[18px]" />}
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-[14px] font-semibold">{t.category || (isIncome ? "Pemasukan" : "Pengeluaran")}</p>
									<p className="truncate text-[12px] text-muted-foreground">{formatClock(t.date)}{t.description ? ` · ${t.description}` : ""}</p>
								</div>
								<div className="shrink-0 text-right">
									<p className={cn("text-[14px] font-extrabold tabular-nums", isIncome ? "text-emerald-600" : "text-rose-600")}>{isIncome ? "+" : "−"}{formatRp(t.amount).replace("Rp ", "Rp ")}</p>
									<p className="text-[11px] tabular-nums text-muted-foreground">{formatRp(balance)}</p>
								</div>
							</motion.div>
						);
					})}
				</AnimatePresence>
				{rows.length > 0 && <p className="pt-3 text-center text-[11.5px] text-muted-foreground">Catat pengeluaran operasional agar estimasi laci akurat saat tutup shift.</p>}
			</div>
			<motion.button type="button" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={IOS_SPRING} whileTap={{ scale: 0.94 }} onClick={() => setEntry({ open: true, type: "expense" })} className="absolute bottom-3 right-1 z-20 flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-bold text-primary-foreground shadow-[0_10px_24px_rgba(26,93,198,0.4)]"><Plus className="h-5 w-5" />Catat kas</motion.button>
			<CashEntrySheet open={entry.open} initialType={entry.type} onClose={() => setEntry((cur) => ({ ...cur, open: false }))} />
		</div>
	);
}
