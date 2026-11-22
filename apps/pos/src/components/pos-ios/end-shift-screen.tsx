import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Camera, Check, ChevronLeft, Clock, Loader2, Lock, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SHIFT_PAYMENT_CHANNELS, type ShiftPaymentBreakdown, type ShiftPaymentChannelKey } from "@/lib/shift-payment-breakdown";
import { cn } from "@/lib/utils";
import { CashProofCamera } from "./cash-proof-camera";
import { AnimatedNumber, formatRp, IOS_SPRING, IosChip, IosSheet, StatusPill } from "./ios-kit";
import { OpnameReview, OpnameStep, opnameIssues, opnameNotesMissing, type OpnameController } from "./opname-step";

type Actual = Partial<Record<ShiftPaymentChannelKey, number | null>>;
export interface ExtraExpense { id: number; category: string; amount: string; description: string; savedId?: string }

export interface EndShiftController {
	shiftName: string;
	cashierName: string;
	closeTime?: string;
	gate: { blocked: boolean; message: string };
	ordersLoading: boolean;
	queuedCount: number;
	closing: { unpaid: number; inProduction: number };
	handover: boolean;
	setHandover: (value: boolean) => void;
	attendance: Array<{ name: string; userId: string; status: "active" | "checked_out" | "no_show" }>;
	attendanceLoading: boolean;
	attendanceError: string | null;
	expected: ShiftPaymentBreakdown;
	actual: Actual;
	onActual: (key: ShiftPaymentChannelKey, value: string) => void;
	breakdown: Record<string, number>;
	onBreakdown: (key: string, value: number) => void;
	onAutoFillCash: () => void;
	onResetCash: () => void;
	/** Uang yang ditinggal di laci sebagai modal shift berikutnya (rupiah, teks angka). */
	keptCash: string;
	setKeptCash: (value: string) => void;
	shiftExpense: number;
	expenseRows: Array<{ category?: string; description?: string; amount: number }>;
	extraExpenses: ExtraExpense[];
	setExtraExpenses: (updater: (prev: ExtraExpense[]) => ExtraExpense[]) => void;
	notes: string;
	setNotes: (value: string) => void;
	notice: string | null;
	error: string | null;
	submitting: boolean;
	showConfirm: boolean;
	setShowConfirm: (open: boolean) => void;
	onEnd: () => void;
	cashInRegister: number;
	nonCash: number;
	shiftCash: number;
	startingCash: number;
	cashPhoto: string | null;
	setCashPhoto: (value: string | null) => void;
	staffName: string;
	opname: OpnameController;
}

const BILLS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];
const EXPENSE_CATS = ["Token Listrik", "Bahan Baku", "Operasional", "Lainnya"];
const STEPS = ["CEK", "OPNAME", "TUNAI", "KIRIM"] as const;
const EASE = [0.3, 0.9, 0.3, 1] as const;

const diffTone = (d: number) => (d === 0 ? "ok" : d < 0 ? "bad" : "warn") as "ok" | "bad" | "warn";
const diffLabel = (d: number) => (d === 0 ? "✓ Cocok" : d < 0 ? `Kurang ${formatRp(-d)}` : `Lebih ${formatRp(d)}`);

export function EndShiftScreen({ c }: { c: EndShiftController }) {
	const [step, setStep] = useState(1);
	const [dir, setDir] = useState(1);
	const [expenseOpen, setExpenseOpen] = useState(false);
	const [cameraOpen, setCameraOpen] = useState(false);

	const go = (next: number) => { setDir(next > step ? 1 : -1); setStep(next); };

	const channels = SHIFT_PAYMENT_CHANNELS;
	const cashSalesExpected = Number(c.expected.tunai_kasir || 0) + Number(c.expected.djiwaapp_bayar_kasir || 0);
	const autoChannels = useMemo(() => channels.filter((ch) => ch.key !== "tunai_kasir" && ch.key !== "djiwaapp_bayar_kasir" && Number(c.expected[ch.key] || 0) > 0), [channels, c.expected]);
	const zeroChannels = useMemo(() => channels.filter((ch) => ch.key !== "tunai_kasir" && ch.key !== "djiwaapp_bayar_kasir" && Number(c.expected[ch.key] || 0) === 0), [channels, c.expected]);
	const nonCashTotal = autoChannels.reduce((sum, ch) => sum + Number(c.expected[ch.key] || 0), 0);
	const systemTotal = nonCashTotal + cashSalesExpected;

	// Semua kanal non-tunai tercatat sistem: aktual diisi otomatis. Hanya uang laci yang dihitung manual.
	const autoSig = channels.filter((ch) => ch.key !== "tunai_kasir").map((ch) => `${ch.key}:${Number(c.expected[ch.key] || 0)}`).join(",");
	useEffect(() => {
		for (const ch of channels) {
			if (ch.key === "tunai_kasir") continue;
			const exp = Number(c.expected[ch.key] || 0);
			if (ch.key === "djiwaapp_bayar_kasir") { if (exp === 0 && c.actual[ch.key] !== 0) c.onActual(ch.key, "0"); continue; }
			if (c.actual[ch.key] !== exp) c.onActual(ch.key, String(exp));
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoSig]);

	const extraTotal = c.extraExpenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
	const expenseTotal = c.shiftExpense + extraTotal;
	const drawerExpected = c.startingCash + c.shiftCash - expenseTotal;
	const counted = c.cashInRegister;
	const diff = counted - drawerExpected;
	const keptValue = c.keptCash === "" ? null : Number(c.keptCash);
	const separatedValue = keptValue === null ? null : counted - keptValue;

	const activeStaff = c.attendance.filter((member) => member.status === "active");
	const hasUnfinished = c.closing.unpaid > 0 || c.closing.inProduction > 0;
	const step1Issues: string[] = [];
	if (c.ordersLoading) step1Issues.push("pesanan masih dimuat");
	if (c.queuedCount > 0) step1Issues.push("sinkronkan pesanan offline");
	if (hasUnfinished && !c.handover) step1Issues.push("centang serah terima pesanan");
	if (c.attendanceLoading) step1Issues.push("absensi masih dimuat");
	if (c.attendanceError) step1Issues.push("absensi gagal dimuat");
	if (activeStaff.length > 0) step1Issues.push(`${activeStaff.length} belum absen keluar`);
	const opnameStepIssues = opnameIssues(c.opname);
	const cashIssues: string[] = [];
	if (counted <= 0) cashIssues.push("hitung uang di laci");
	if (!c.cashPhoto) cashIssues.push("ambil foto bukti tunai");
	if (keptValue === null) cashIssues.push("isi uang yang ditinggal untuk shift berikutnya");
	else if (keptValue > counted) cashIssues.push("uang ditinggal melebihi uang di laci");
	const sendIssues: string[] = [];
	const missingNotes = opnameNotesMissing(c.opname);
	if (missingNotes > 0) sendIssues.push(`${missingNotes} catatan selisih bahan`);
	if (c.gate.blocked) sendIssues.push(c.closeTime ? `tunggu ${c.closeTime} WIB` : "belum jadwal tutup");
	if (!navigator.onLine) sendIssues.push("butuh koneksi internet");
	const issues = step === 1 ? step1Issues : step === 2 ? opnameStepIssues : step === 3 ? cashIssues : sendIssues;
	const disabled = c.submitting || issues.length > 0;

	const onCta = () => { if (step < 4) go(step + 1); else c.onEnd(); };
	const stampText = `${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "medium" })} WIB · ${c.staffName || c.cashierName || "Kasir"} · ${formatRp(counted)}`;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Stepper */}
			<div className="shrink-0 pb-2">
				<div className="flex items-center gap-2">
					<AnimatePresence initial={false}>
						{step > 1 ? <motion.button key="back" type="button" initial={{ width: 0, opacity: 0 }} animate={{ width: 32, opacity: 1 }} exit={{ width: 0, opacity: 0 }} onClick={() => go(step - 1)} aria-label="Langkah sebelumnya" className="flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"><ChevronLeft className="h-5 w-5" /></motion.button> : null}
					</AnimatePresence>
					<div className="min-w-0 flex-1"><p className="truncate text-[15px] font-extrabold tracking-tight">Tutup kasir</p><p className="truncate text-[12px] text-muted-foreground">{c.shiftName || "Shift berjalan"} · {c.cashierName || "Kasir"}</p></div>
				</div>
				<div className="mt-2.5 flex gap-1.5">{STEPS.map((_, i) => <span key={i} className="relative h-[5px] flex-1 overflow-hidden rounded-full bg-border"><motion.span initial={false} animate={{ scaleX: i < step ? 1 : 0 }} transition={{ duration: 0.5, ease: EASE }} className="absolute inset-0 origin-left rounded-full bg-primary" /></span>)}</div>
				<div className="mt-1.5 flex">{STEPS.map((label, i) => <span key={label} className={cn("flex-1 text-[11px] font-bold tracking-wide transition-colors", i + 1 === step ? "text-primary" : "text-muted-foreground")}>{i + 1} · {label}</span>)}</div>
			</div>

			{/* Halaman */}
			<div className="relative min-h-0 flex-1 overflow-x-hidden">
				<AnimatePresence mode="wait" initial={false} custom={dir}>
					<motion.div key={step} custom={dir} initial={{ opacity: 0, x: dir * 36 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -36 }} transition={{ duration: 0.28, ease: EASE }} className="h-full overflow-y-auto pb-3">
						{step === 1 ? (
							<div>
								{c.gate.blocked ? <div className="mb-2.5 flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-[12.5px] font-semibold text-amber-900"><Clock className="mt-0.5 h-4 w-4 shrink-0" />{c.gate.message}</div> : null}
								<div className="grid grid-cols-2 gap-2">
									<div className="rounded-2xl bg-primary px-3.5 py-3 text-primary-foreground"><p className="text-[10.5px] font-bold tracking-wider opacity-80">PEMASUKAN SISTEM</p><AnimatedNumber value={systemTotal} className="text-[20px] font-extrabold tracking-tight" /></div>
									<div className="rounded-2xl border border-border bg-card px-3.5 py-3"><p className="text-[10.5px] font-bold tracking-wider text-muted-foreground">NON-TUNAI</p><AnimatedNumber value={nonCashTotal} className="text-[20px] font-extrabold tracking-tight" /></div>
								</div>

								<p className="px-1 pb-1.5 pt-4 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">KESIAPAN</p>
								<div className="overflow-hidden rounded-[18px] border border-border bg-card">
									{[
										{ ok: !c.ordersLoading && c.queuedCount === 0 && !(hasUnfinished && !c.handover), title: "Pesanan", sub: c.ordersLoading ? "Memuat pesanan…" : `${c.queuedCount} belum sinkron · ${c.closing.unpaid} belum lunas`, tag: `${c.closing.inProduction} produksi` },
										{ ok: !c.attendanceLoading && !c.attendanceError && activeStaff.length === 0, title: "Absensi tim", sub: c.attendanceError ?? (c.attendanceLoading ? "Memuat absensi…" : activeStaff.length ? `Belum absen keluar: ${activeStaff.map((m) => m.name).join(", ")}` : c.attendance.length ? "Semua sudah absen keluar" : "Tidak ada data tim"), tag: "" },
									].map((item, index) => (
										<div key={item.title} className={cn("flex items-center gap-3 px-3.5 py-2.5", index > 0 && "border-t border-border/70")}>
											<motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={IOS_SPRING} className={cn("flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full", item.ok ? "bg-emerald-500 text-white" : "bg-amber-50 text-amber-700")}>{item.ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}</motion.span>
											<div className="min-w-0 flex-1"><p className="text-[14px] font-bold">{item.title}</p><p className="text-[12px] text-muted-foreground">{item.sub}</p></div>
											{item.tag ? <StatusPill tone="neutral">{item.tag}</StatusPill> : null}
										</div>
									))}
									{c.queuedCount > 0 ? <p role="alert" className="border-t border-border/70 bg-amber-50 px-3.5 py-2 text-[12px] font-semibold text-amber-800">Kirim pesanan offline lewat Pusat sinkronisasi dulu.</p> : null}
									{hasUnfinished ? (
										<label className="flex cursor-pointer items-start gap-3 border-t border-border/70 px-3.5 py-2.5 text-[13px]">
											<input type="checkbox" checked={c.handover} onChange={(event) => c.setHandover(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
											<span>{c.closing.unpaid} belum lunas dan {c.closing.inProduction} dalam produksi. Saya sudah serah terima ke shift berikutnya.</span>
										</label>
									) : null}
								</div>

								<div className="flex items-center justify-between px-1 pb-1.5 pt-4"><p className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground">PEMBAYARAN</p><span className="flex items-center gap-1.5 text-[10.5px] font-extrabold text-emerald-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />TERISI OTOMATIS</span></div>
								<div className="overflow-hidden rounded-[18px] border border-border bg-card">
									{autoChannels.map((ch, index) => (
										<motion.div key={ch.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={cn("flex items-center gap-3 px-3.5 py-2.5", index > 0 && "border-t border-border/70")}>
											<span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" /></span>
											<p className="min-w-0 flex-1 truncate text-[14px] font-bold">{ch.label}</p>
											<p className="text-[14px] font-extrabold tabular-nums">{formatRp(Number(c.expected[ch.key] || 0))}</p>
										</motion.div>
									))}
									<div className={cn("flex items-center gap-3 px-3.5 py-2.5", autoChannels.length > 0 && "border-t border-border/70")}>
										<span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Lock className="h-3.5 w-3.5" /></span>
										<div className="min-w-0 flex-1"><p className="text-[14px] font-bold">Tunai (POS + Djiwa App di kasir)</p><p className="text-[12px] text-muted-foreground">Dihitung manual di langkah 2</p></div>
										<p className="text-[14px] font-extrabold tabular-nums">{formatRp(cashSalesExpected)}</p>
									</div>
									{zeroChannels.length > 0 ? (
										<div className="border-t border-border/70 px-3.5 py-2.5">
											<p className="pb-1.5 text-[12px] font-bold text-muted-foreground">Tanpa transaksi · Rp 0 terisi otomatis</p>
											<div className="flex flex-wrap gap-1.5">{zeroChannels.map((ch) => <span key={ch.key} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700">✓ {ch.label.split(" — ")[0]}</span>)}</div>
										</div>
									) : null}
								</div>

								<p className="px-1 pb-1.5 pt-4 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">PENGELUARAN</p>
								{c.shiftExpense > 0 ? (
									<div className="mb-2 rounded-2xl bg-rose-50 px-3.5 py-2.5">
										<div className="flex justify-between text-[12px] font-bold text-rose-700"><span>Pengeluaran shift</span><span className="tabular-nums">{formatRp(c.shiftExpense)}</span></div>
										{c.expenseRows.map((row, i) => <div key={i} className="mt-1 flex justify-between gap-3 text-[12px] text-rose-700/90"><span className="truncate">{row.category || "Lainnya"}{row.description ? ` — ${row.description}` : ""}</span><span className="shrink-0 tabular-nums">{formatRp(row.amount)}</span></div>)}
									</div>
								) : null}
								{c.extraExpenses.map((exp, index) => (
									<div key={exp.id} className="mb-2 flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-2.5">
										<div className="min-w-0 flex-1"><p className="truncate text-[14px] font-bold">{exp.category}{exp.description ? ` — ${exp.description}` : ""}</p><p className="text-[12px] text-muted-foreground">{exp.savedId ? "Sudah tersimpan" : `Pengeluaran #${index + 1} · dicatat saat tutup`}</p></div>
										<b className="tabular-nums text-rose-600">{formatRp(Number(exp.amount) || 0)}</b>
										{!exp.savedId ? <button type="button" aria-label="Hapus pengeluaran" onClick={() => c.setExtraExpenses((prev) => prev.filter((e) => e.id !== exp.id))} className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Trash2 className="h-4 w-4" /></button> : null}
									</div>
								))}
								<button type="button" onClick={() => setExpenseOpen(true)} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card text-[13px] font-bold text-muted-foreground"><Plus className="h-4 w-4" />Tambah pengeluaran</button>
							</div>
						) : null}

						{step === 2 ? (
							<div>
								<p className="mb-2.5 rounded-xl bg-primary/5 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">Hitung bahan baku dulu sebelum uang. Tandai <b className="text-foreground">Ada</b> atau <b className="text-foreground">Habis</b>, atau isi jumlah sisa.</p>
								<OpnameStep opname={c.opname} />
							</div>
						) : null}

						{step === 3 ? (
							<div>
								<div className="rounded-[18px] border border-border bg-card px-3 py-3 text-center">
									<p className="text-[11px] font-bold tracking-wider text-muted-foreground">SEHARUSNYA ADA DI LACI</p>
									<p className="my-0.5 text-[30px] font-extrabold leading-tight tracking-tight tabular-nums">{formatRp(drawerExpected)}</p>
									<p className="text-[11.5px] text-muted-foreground">Modal {formatRp(c.startingCash)} + tunai {formatRp(c.shiftCash)} − pengeluaran {formatRp(expenseTotal)}</p>
								</div>

								<p className="px-1 pb-1.5 pt-4 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">HITUNG UANG DI LACI</p>
								<div className="mb-2 rounded-[18px] border border-border bg-card px-3 py-3 text-center">
									<p className="text-[11px] font-bold tracking-wider text-muted-foreground">TOTAL DIHITUNG</p>
									<AnimatedNumber value={counted} className="my-0.5 block text-[34px] font-extrabold leading-tight tracking-tight" />
									<motion.span key={counted === 0 ? "none" : diffLabel(diff)} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={IOS_SPRING} className="inline-block"><StatusPill tone={counted === 0 ? "neutral" : diffTone(diff)}>{counted === 0 ? "Belum dihitung" : diffLabel(diff)}</StatusPill></motion.span>
								</div>
								<div className="grid grid-cols-2 gap-2">
									{BILLS.map((bill) => {
										const key = `bill${bill}`;
										const count = c.breakdown[key] || 0;
										return (
											<div key={bill} className={cn("flex items-center gap-1.5 rounded-2xl border px-2.5 py-2 transition-colors", count > 0 ? "border-primary bg-primary/10" : "border-border bg-card")}>
												<div className="min-w-0 flex-1"><p className="text-[13px] font-extrabold tabular-nums">{bill.toLocaleString("id-ID")}</p><p className="text-[11px] font-semibold tabular-nums text-muted-foreground">{formatRp(bill * count)}</p></div>
												<motion.button type="button" whileTap={{ scale: 0.8 }} aria-label={`Kurangi ${bill}`} onClick={() => { c.onBreakdown(key, count - 1); navigator.vibrate?.(8); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[19px] font-bold text-primary">−</motion.button>
												<motion.b key={count} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="min-w-5 text-center tabular-nums">{count}</motion.b>
												<motion.button type="button" whileTap={{ scale: 0.8 }} aria-label={`Tambah ${bill}`} onClick={() => { c.onBreakdown(key, count + 1); navigator.vibrate?.(8); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[19px] font-bold text-primary">+</motion.button>
											</div>
										);
									})}
								</div>
								<div className="mt-2.5 flex justify-center gap-2"><IosChip onClick={() => c.onAutoFillCash()}>Pas sesuai sistem</IosChip><IosChip onClick={() => c.onResetCash()}>Reset</IosChip></div>

								<p className="px-1 pb-1.5 pt-4 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">FOTO BUKTI TUNAI <span className="text-rose-600">WAJIB</span></p>
								{c.cashPhoto ? (
									<div className="relative overflow-hidden rounded-[18px] border-2 border-emerald-500">
										<img src={c.cashPhoto} alt="Foto bukti tunai" className="block w-full" />
										<span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white"><Check className="h-3 w-3" />Foto tersimpan</span>
										<button type="button" onClick={() => { c.setCashPhoto(null); setCameraOpen(true); }} className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-bold text-white"><RotateCcw className="h-3.5 w-3.5" />Ulangi</button>
									</div>
								) : (
									<motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => setCameraOpen(true)} className="flex min-h-[130px] w-full flex-col items-center justify-center gap-1 rounded-[18px] border-2 border-dashed border-border bg-card px-4 text-center">
										<Camera className="h-8 w-8 text-primary" />
										<b className="text-[14px]">Ambil foto uang tunai</b>
										<span className="text-[12px] text-muted-foreground">Hanya lewat kamera, tidak bisa dari galeri. Susun semua uang dalam satu frame.</span>
									</motion.button>
								)}
								<p className="px-1 pt-2 text-[11.5px] text-muted-foreground">🔒 Foto otomatis diberi cap waktu, kasir, dan nominal.</p>

								<p className="px-1 pb-1.5 pt-4 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">CATATAN / KENDALA</p>
								<textarea value={c.notes} onChange={(event) => c.setNotes(event.target.value)} placeholder="Contoh: selisih uang Rp 2.000, barang rusak…" rows={2} className="w-full resize-none rounded-[14px] bg-muted px-3.5 py-3 text-[15px] outline-none placeholder:text-muted-foreground focus:bg-background focus:shadow-[0_0_0_1px_var(--border)]" />

								<p className="px-1 pb-1.5 pt-4 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">SERAH TERIMA KE SHIFT BERIKUTNYA <span className="text-rose-600">WAJIB</span></p>
								<div className="rounded-[18px] border border-border bg-card px-3.5 py-3">
									<p className="text-[12.5px] leading-relaxed text-muted-foreground">Pisahkan uang shift ini. Uang yang <b className="text-foreground">ditinggal di laci</b> jadi modal awal shift berikutnya, sisanya <b className="text-foreground">dipisah/disetor</b> dan tidak ikut dihitung shift berikutnya.</p>
									<label className="mt-2.5 block text-[11px] font-bold tracking-wider text-muted-foreground">DITINGGAL DI LACI (RP)</label>
									<input value={c.keptCash} onChange={(event) => c.setKeptCash(event.target.value.replace(/\D/g, "").slice(0, 9))} inputMode="numeric" placeholder="0" aria-label="Uang ditinggal di laci" className="mt-1 h-12 w-full rounded-[13px] bg-muted px-3.5 text-[20px] font-extrabold tabular-nums outline-none focus:bg-background focus:shadow-[0_0_0_1px_var(--border)]" />
									<div className="mt-2 flex flex-wrap gap-2">
										{[100000, 50000].filter((value) => value <= counted).map((value) => <IosChip key={value} active={c.keptCash === String(value)} onClick={() => c.setKeptCash(String(value))} className="h-8 px-3.5 text-[12.5px]">{formatRp(value)}</IosChip>)}
										<IosChip active={counted > 0 && c.keptCash === String(counted)} onClick={() => c.setKeptCash(String(Math.max(0, counted)))} className="h-8 px-3.5 text-[12.5px]">Semua</IosChip>
										<IosChip active={c.keptCash === "0"} onClick={() => c.setKeptCash("0")} className="h-8 px-3.5 text-[12.5px]">Tidak ada</IosChip>
									</div>
									<div className="mt-3 flex items-center justify-between rounded-2xl bg-muted px-3.5 py-2.5 text-[13.5px]">
										<span className="text-muted-foreground">Dipisah/disetor shift ini</span>
										<b className={cn("tabular-nums", separatedValue !== null && separatedValue < 0 ? "text-rose-600" : "")}>{separatedValue === null ? "—" : formatRp(separatedValue)}</b>
									</div>
									{separatedValue !== null && separatedValue > 0 ? <p className="mt-2 text-[12px] font-semibold text-amber-800">Masukkan {formatRp(separatedValue)} ke amplop/setoran dan beri label shift ini. Jangan campur dengan laci.</p> : null}
								</div>
							</div>
						) : null}

						{step === 4 ? (
							<div>
								<OpnameReview opname={c.opname} />
								<div className="overflow-hidden rounded-[18px] border border-border bg-card text-[14px]">
									{[
										["Pendapatan sistem", formatRp(systemTotal)],
										["Non-tunai (otomatis)", formatRp(nonCashTotal)],
										["Tunai seharusnya di laci", formatRp(drawerExpected)],
										["Tunai dihitung kasir", formatRp(counted)],
										["Dipisah/disetor shift ini", separatedValue === null ? "—" : formatRp(separatedValue)],
										["Ditinggal untuk shift berikutnya", keptValue === null ? "—" : formatRp(keptValue)],
									].map(([label, value], i) => <div key={label} className={cn("flex justify-between px-3.5 py-2.5", i > 0 && "border-t border-border/70")}><span className="text-muted-foreground">{label}</span><b className="tabular-nums">{value}</b></div>)}
									<div className="flex items-center justify-between border-t border-border/70 px-3.5 py-2.5"><span className="text-muted-foreground">Selisih tunai</span><StatusPill tone={diffTone(diff)}>{diffLabel(diff)}</StatusPill></div>
								</div>
								<p className="px-1 pb-1.5 pt-4 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">DIKIRIM OTOMATIS KE TELEGRAM</p>
								<div className="rounded-[18px] bg-[#17212b] p-3 text-[#e8eef5]">
									<div className="mb-2 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-violet-500 text-[12px] font-extrabold text-white">K</span><div><p className="text-[12.5px] font-bold">Kaelis | Supervisor Djiwa Tentram</p><p className="text-[11px] text-[#7f93a6]">@YummeSupervisorAIbot</p></div></div>
									<div className="rounded-xl rounded-bl-sm bg-[#2b5278] p-2.5 text-[12.5px] leading-relaxed">
										{c.cashPhoto ? <img src={c.cashPhoto} alt="" className="mb-2 block w-full rounded-lg" /> : null}
										<p className="font-bold">📊 LAPORAN TUTUP SHIFT</p>
										<p>🏪 Djiwa Tentram · {c.shiftName}</p>
										<p>💰 Sistem {formatRp(systemTotal)} · 💵 Laci {formatRp(counted)}</p>
										<p>{diff === 0 ? "✅ Tunai cocok" : diff < 0 ? `⬇️ Kurang ${formatRp(-diff)}` : `⬆️ Lebih ${formatRp(diff)}`}</p>
									</div>
								</div>
								<p className="px-1 pt-2 text-[12px] text-muted-foreground">📨 Terkirim ke grup <b>Report</b>, <b>Transaksi</b>, <b>Bar</b>, dan <b>Kitchen</b> beserta foto tunai.</p>
								{c.notice ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] font-semibold text-amber-800">{c.notice}</p> : null}
								{c.error ? <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-semibold text-rose-700">{c.error}</p> : null}
							</div>
						) : null}
					</motion.div>
				</AnimatePresence>
			</div>

			{/* Bar bawah */}
			<div className="shrink-0 border-t border-border bg-background pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
				<div className="mb-2 flex gap-1.5">
					{[["SISTEM", formatRp(systemTotal)], ["TUNAI", formatRp(counted)], ["BEDA TUNAI", counted === 0 ? "—" : diff === 0 ? "Cocok" : `${diff < 0 ? "−" : "+"}${formatRp(Math.abs(diff))}`]].map(([label, value]) => <div key={label} className="flex-1 rounded-xl bg-muted py-1.5 text-center"><p className="text-[10px] font-extrabold tracking-wider text-muted-foreground">{label}</p><p className="text-[13px] font-extrabold tabular-nums">{value}</p></div>)}
				</div>
				<motion.button type="button" whileTap={{ scale: disabled ? 1 : 0.97 }} disabled={disabled} onClick={onCta} className={cn("flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white transition-colors disabled:bg-muted disabled:text-muted-foreground", step === 4 ? "bg-rose-600" : "bg-primary")}>
					{c.submitting ? <><Loader2 className="h-5 w-5 animate-spin" />Mengirim laporan & foto…</> : step === 1 ? "Lanjut opname bahan →" : step === 2 ? "Lanjut hitung tunai →" : step === 3 ? "Lanjut tinjau & kirim →" : <><Send className="h-5 w-5" />Akhiri & kirim laporan</>}
				</motion.button>
				<p className="mt-1 min-h-4 text-center text-[12px] text-muted-foreground">{issues.length ? `Lengkapi: ${issues.join(", ")}` : ""}</p>
			</div>

			<CashProofCamera open={cameraOpen} stampText={stampText} onClose={() => setCameraOpen(false)} onCapture={(dataUrl) => { c.setCashPhoto(dataUrl); setCameraOpen(false); }} />
			<ExpenseSheet open={expenseOpen} onClose={() => setExpenseOpen(false)} onAdd={(row) => { c.setExtraExpenses((prev) => [...prev, row]); setExpenseOpen(false); }} />
		</div>
	);
}

function ExpenseSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (row: ExtraExpense) => void }) {
	const [category, setCategory] = useState(EXPENSE_CATS[0]);
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [lastOpen, setLastOpen] = useState(false);
	if (open !== lastOpen) { setLastOpen(open); if (open) { setCategory(EXPENSE_CATS[0]); setAmount(""); setDescription(""); } }
	return (
		<IosSheet open={open} onClose={onClose} title="Pengeluaran saat tutup" heightClass="max-h-[80dvh]" footer={<button type="button" disabled={!(Number(amount) > 0)} onClick={() => onAdd({ id: Date.now(), category, amount, description })} className="h-[52px] w-full rounded-2xl bg-rose-600 text-[16px] font-bold text-white disabled:opacity-50">Tambahkan</button>}>
			<div className="flex flex-wrap gap-2 pb-3">{EXPENSE_CATS.map((cat) => <IosChip key={cat} active={category === cat} onClick={() => setCategory(cat)}>{cat}</IosChip>)}</div>
			<input value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Jumlah (Rp)" aria-label="Jumlah pengeluaran" className="h-12 w-full rounded-[13px] bg-muted px-3.5 text-[20px] font-extrabold outline-none placeholder:font-normal placeholder:text-muted-foreground focus:bg-background focus:shadow-[0_0_0_1px_var(--border)]" />
			<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Keterangan, mis. token 200rb" aria-label="Keterangan" className="mt-2 h-11 w-full rounded-[13px] bg-muted px-3.5 text-[15px] outline-none placeholder:text-muted-foreground focus:bg-background focus:shadow-[0_0_0_1px_var(--border)]" />
		</IosSheet>
	);
}
