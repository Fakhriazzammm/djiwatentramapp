import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ChevronDown, Clock, CreditCard, Loader2, Plus, SquarePower, Trash2, Wallet, WalletCards, Banknote } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SHIFT_PAYMENT_CHANNELS, type ShiftPaymentBreakdown, type ShiftPaymentChannelKey } from "@/lib/shift-payment-breakdown";
import { cn } from "@/lib/utils";
import { AnimatedNumber, formatRp, IOS_SPRING, IOS_SPRING_SOFT, IosChip, IosSheet, StatusPill } from "./ios-kit";

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
}

const BILLS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];
const EXPENSE_CATS = ["Token Listrik", "Bahan Baku", "Operasional", "Lainnya"];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "del"] as const;

const diffTone = (d: number) => (d === 0 ? "ok" : d < 0 ? "warn" : "info") as "ok" | "warn" | "info";
const diffLabel = (d: number) => (d === 0 ? "Cocok" : d < 0 ? `Kurang ${formatRp(-d)}` : `Lebih ${formatRp(d)}`);

function ChannelIcon({ channel }: { channel: (typeof SHIFT_PAYMENT_CHANNELS)[number] }) {
	const Icon = channel.key === "tunai_kasir" ? Banknote : channel.key === "djiwa_pay" ? WalletCards : channel.group === "online" ? Wallet : CreditCard;
	return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>;
}

export function EndShiftScreen({ c }: { c: EndShiftController }) {
	const [channelKey, setChannelKey] = useState<ShiftPaymentChannelKey | null>(null);
	const [expenseOpen, setExpenseOpen] = useState(false);
	const [zeroOpen, setZeroOpen] = useState(false);
	const [cashTouched, setCashTouched] = useState(false);

	const channels = SHIFT_PAYMENT_CHANNELS;
	const required = useMemo(() => channels.filter((ch) => Number(c.expected[ch.key] || 0) > 0), [channels, c.expected]);
	const zero = useMemo(() => channels.filter((ch) => Number(c.expected[ch.key] || 0) === 0), [channels, c.expected]);

	// Kanal tanpa transaksi dikonfirmasi Rp 0 otomatis (tetap bisa diubah dari lipatan).
	useEffect(() => {
		for (const ch of zero) if (ch.key !== "tunai_kasir" && (c.actual[ch.key] === null || c.actual[ch.key] === undefined)) c.onActual(ch.key, "0");
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [zero.map((ch) => ch.key).join(",")]);

	const confirmed = (key: ShiftPaymentChannelKey) => (key === "tunai_kasir" ? cashTouched : c.actual[key] !== null && c.actual[key] !== undefined);
	const doneCount = required.filter((ch) => confirmed(ch.key)).length;
	const totalExpected = channels.reduce((sum, ch) => sum + Number(c.expected[ch.key] || 0), 0);
	const totalActual = channels.reduce((sum, ch) => sum + (c.actual[ch.key] == null ? 0 : Number(c.actual[ch.key])), 0);
	const allConfirmed = doneCount === required.length;

	const activeStaff = c.attendance.filter((member) => member.status === "active");
	const hasUnfinished = c.closing.unpaid > 0 || c.closing.inProduction > 0;
	const paymentIncomplete = Object.keys(c.expected).some((key) => c.actual[key as ShiftPaymentChannelKey] === null || c.actual[key as ShiftPaymentChannelKey] === undefined);
	const disabled = c.submitting || c.ordersLoading || !navigator.onLine || c.queuedCount > 0 || (hasUnfinished && !c.handover) || c.attendanceLoading || Boolean(c.attendanceError) || c.gate.blocked || paymentIncomplete;

	const reasons: string[] = [];
	if (c.gate.blocked) reasons.push(c.closeTime ? `tunggu ${c.closeTime} WIB` : "jadwal tutup");
	if (c.queuedCount > 0) reasons.push("sinkronkan pesanan offline");
	if (hasUnfinished && !c.handover) reasons.push("konfirmasi serah terima");
	if (activeStaff.length > 0) reasons.push(`${activeStaff.length} belum absen keluar`);
	if (!allConfirmed) reasons.push(`${required.length - doneCount} kanal`);
	if (!navigator.onLine) reasons.push("butuh koneksi");

	const channel = channelKey ? channels.find((ch) => ch.key === channelKey) ?? null : null;
	const checks = [
		{ ok: c.queuedCount === 0 && !(hasUnfinished && !c.handover), title: "Pesanan", sub: c.ordersLoading ? "Memuat pesanan shift…" : `${c.queuedCount} belum sinkron · ${c.closing.unpaid} belum lunas · ${c.closing.inProduction} produksi` },
		{ ok: !c.attendanceLoading && !c.attendanceError && activeStaff.length === 0, title: "Absensi tim", sub: c.attendanceError ? c.attendanceError : c.attendanceLoading ? "Memuat absensi…" : activeStaff.length ? `${activeStaff.length} belum absen keluar` : c.attendance.length ? "Semua sudah absen keluar" : "Tidak ada data tim" },
		{ ok: allConfirmed, title: "Pembayaran", sub: `${doneCount}/${required.length} kanal terkonfirmasi` },
	];

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto pb-4">
				<div className="px-0.5 pb-3">
					<h3 className="text-[22px] font-extrabold tracking-tight">Akhiri shift</h3>
					<p className="text-[13px] text-muted-foreground">{c.shiftName || "Shift berjalan"} · {c.cashierName || "Kasir"}</p>
				</div>

				{c.closeTime ? (
					<div className={cn("mb-3 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-[12.5px] font-semibold", c.gate.blocked ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800")}>
						<Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
						<span>{c.gate.blocked ? c.gate.message : `Jadwal tutup ${c.closeTime} WIB sudah tercapai.`}</span>
					</div>
				) : c.gate.blocked ? <div className="mb-3 flex items-start gap-2.5 rounded-2xl bg-amber-50 px-3.5 py-3 text-[12.5px] font-semibold text-amber-900"><Clock className="mt-0.5 h-4 w-4 shrink-0" />{c.gate.message}</div> : null}

				{/* Kesiapan */}
				<div className="overflow-hidden rounded-[20px] border border-border bg-card">
					{checks.map((item, index) => (
						<div key={item.title} className={cn("flex items-center gap-3 px-3.5 py-3", index > 0 && "border-t border-border/70")}>
							<motion.span layout initial={false} animate={{ scale: item.ok ? [1, 1.25, 1] : 1 }} transition={IOS_SPRING} className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full", item.ok ? "bg-emerald-500 text-white" : "bg-amber-50 text-amber-700")}>
								{item.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
							</motion.span>
							<div className="min-w-0 flex-1"><p className="text-[14px] font-bold">{item.title}</p><p className="text-[12px] text-muted-foreground">{item.sub}</p></div>
						</div>
					))}
					{c.queuedCount > 0 ? <p role="alert" className="border-t border-border/70 bg-amber-50 px-3.5 py-2.5 text-[12px] font-semibold text-amber-800">Kirim pesanan offline lewat Pusat sinkronisasi sebelum melanjutkan.</p> : null}
					{hasUnfinished ? (
						<label className="flex cursor-pointer items-start gap-3 border-t border-border/70 px-3.5 py-3 text-[13px]">
							<input type="checkbox" checked={c.handover} onChange={(event) => c.setHandover(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
							<span>Ada {c.closing.unpaid} pesanan belum lunas dan {c.closing.inProduction} dalam produksi. Saya konfirmasi sudah serah terima ke shift berikutnya.</span>
						</label>
					) : null}
					{activeStaff.length > 0 ? <div className="border-t border-border/70 bg-amber-50 px-3.5 py-2.5 text-[12px] font-semibold text-amber-800">Belum absen keluar: {activeStaff.map((member) => member.name).join(", ")}</div> : null}
				</div>

				{/* Pembayaran */}
				<p className="px-1 pb-2 pt-5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">KONFIRMASI PEMBAYARAN</p>
				{(["direct", "online"] as const).map((group) => {
					const list = required.filter((ch) => ch.group === group);
					if (!list.length) return null;
					return (
						<div key={group} className="mb-1">
							<p className="px-1 pb-1.5 text-[12px] font-bold text-muted-foreground">{group === "direct" ? "Langsung" : "Online food"}</p>
							{list.map((ch) => {
								const exp = Number(c.expected[ch.key] || 0);
								const isConfirmed = confirmed(ch.key);
								const act = ch.key === "tunai_kasir" ? c.cashInRegister : Number(c.actual[ch.key] || 0);
								return (
									<motion.button key={ch.key} type="button" whileTap={{ scale: 0.985 }} onClick={() => setChannelKey(ch.key)} className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 text-left">
										<ChannelIcon channel={ch} />
										<div className="min-w-0 flex-1"><p className="truncate text-[14px] font-bold">{ch.label}</p><p className="text-[12px] text-muted-foreground">Sistem {formatRp(exp)}</p></div>
										<div className="shrink-0 text-right">
											<p className="text-[14px] font-extrabold tabular-nums">{isConfirmed ? formatRp(act) : "—"}</p>
											<StatusPill tone={isConfirmed ? diffTone(act - exp) : "neutral"}>{isConfirmed ? diffLabel(act - exp) : "Belum diisi"}</StatusPill>
										</div>
									</motion.button>
								);
							})}
						</div>
					);
				})}
				{zero.length > 0 ? (
					<>
						<button type="button" onClick={() => setZeroOpen((v) => !v)} aria-expanded={zeroOpen} className="flex w-full items-center justify-between px-1 py-2 text-[13px] font-semibold text-muted-foreground">Tanpa transaksi ({zero.length})<ChevronDown className={cn("h-4 w-4 transition-transform duration-300", zeroOpen && "rotate-180")} /></button>
						<AnimatePresence initial={false}>
							{zeroOpen ? (
								<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={IOS_SPRING_SOFT} className="overflow-hidden">
									{zero.map((ch) => (
										<button key={ch.key} type="button" onClick={() => setChannelKey(ch.key)} className="flex w-full items-center justify-between px-1 py-1.5 text-[13px] text-muted-foreground"><span>{ch.label}</span><span>{formatRp(Number(c.actual[ch.key] || 0))} · {diffLabel(Number(c.actual[ch.key] || 0))}</span></button>
									))}
									<p className="px-1 pb-2 pt-1 text-[11.5px] text-muted-foreground">Dikonfirmasi Rp 0 otomatis. Ketuk untuk mengubah jika ada uang masuk.</p>
								</motion.div>
							) : null}
						</AnimatePresence>
					</>
				) : null}

				{/* Pengeluaran */}
				<p className="px-1 pb-2 pt-4 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">PENGELUARAN</p>
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
				<button type="button" onClick={() => setExpenseOpen(true)} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border text-[13px] font-bold text-muted-foreground"><Plus className="h-4 w-4" />Tambah pengeluaran</button>

				<p className="px-1 pb-2 pt-5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">CATATAN / KENDALA</p>
				<textarea value={c.notes} onChange={(event) => c.setNotes(event.target.value)} placeholder="Contoh: selisih uang Rp 2.000, barang rusak…" rows={2} className="w-full resize-none rounded-[14px] bg-muted px-3.5 py-3 text-[15px] outline-none placeholder:text-muted-foreground focus:bg-background focus:shadow-[0_0_0_1px_var(--border)]" />
				{c.notice ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] font-semibold text-amber-800">{c.notice}</p> : null}
				{c.error ? <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-semibold text-rose-700">{c.error}</p> : null}
			</div>

			{/* Bar total menempel */}
			<div className="shrink-0 border-t border-border bg-background pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2.5">
				<div className="mb-2 flex rounded-2xl bg-muted py-2.5 text-center">
					<div className="flex-1"><p className="text-[10.5px] font-bold tracking-wider text-muted-foreground">SISTEM</p><p className="text-[14px] font-extrabold tabular-nums">{formatRp(totalExpected)}</p></div>
					<div className="flex-1"><p className="text-[10.5px] font-bold tracking-wider text-muted-foreground">AKTUAL</p><AnimatedNumber value={totalActual} className="text-[14px] font-extrabold" /></div>
					<div className="flex-1"><p className="text-[10.5px] font-bold tracking-wider text-muted-foreground">BEDA</p><p className={cn("text-[14px] font-extrabold tabular-nums", allConfirmed ? (totalActual === totalExpected ? "text-emerald-600" : totalActual < totalExpected ? "text-amber-700" : "text-primary") : "text-muted-foreground")}>{allConfirmed ? formatRp(totalActual - totalExpected) : "—"}</p></div>
				</div>
				<motion.button type="button" whileTap={{ scale: disabled ? 1 : 0.97 }} disabled={disabled} onClick={() => c.setShowConfirm(true)} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 text-[15px] font-bold text-white transition-colors disabled:bg-muted disabled:text-muted-foreground">
					{c.submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : c.gate.blocked ? <Clock className="h-5 w-5" /> : <SquarePower className="h-5 w-5" />}
					{c.gate.blocked && c.closeTime ? `Tunggu sampai ${c.closeTime} WIB` : "Akhiri & kirim laporan"}
				</motion.button>
				<p className="mt-1.5 min-h-4 text-center text-[12px] text-muted-foreground">{disabled && reasons.length ? `Lengkapi: ${reasons.join(", ")}` : disabled ? "" : "Semua siap ditutup"}</p>
			</div>

			<ChannelSheet channel={channel} onClose={() => setChannelKey(null)} c={c} expected={channel ? Number(c.expected[channel.key] || 0) : 0} onCashTouched={() => setCashTouched(true)} />
			<ExpenseSheet open={expenseOpen} onClose={() => setExpenseOpen(false)} onAdd={(row) => { c.setExtraExpenses((prev) => [...prev, row]); setExpenseOpen(false); }} />
			<IosSheet open={c.showConfirm} onClose={() => c.setShowConfirm(false)} title="Konfirmasi tutup shift" heightClass="max-h-[80dvh]" footer={
				<div className="flex gap-2.5">
					<button type="button" onClick={() => c.setShowConfirm(false)} className="h-12 flex-1 rounded-2xl bg-muted text-[15px] font-bold">Kembali</button>
					<motion.button type="button" whileTap={{ scale: 0.97 }} disabled={c.submitting} onClick={c.onEnd} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 text-[15px] font-bold text-white disabled:opacity-60">{c.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Akhiri shift</motion.button>
				</div>
			}>
				<div className="space-y-2 pb-2 text-[14px]">
					<div className="flex justify-between"><span className="text-muted-foreground">Shift</span><b>{c.shiftName}</b></div>
					<div className="flex justify-between"><span className="text-muted-foreground">Kasir</span><b>{c.cashierName}</b></div>
					<div className="flex justify-between"><span className="text-muted-foreground">Uang fisik</span><b className="tabular-nums">{formatRp(c.cashInRegister)}</b></div>
					<div className="flex justify-between"><span className="text-muted-foreground">QRIS / EDC</span><b className="tabular-nums">{formatRp(c.nonCash)}</b></div>
					{(() => { const diff = c.cashInRegister - c.shiftCash; return <div className={cn("flex justify-between", diff === 0 ? "text-emerald-600" : diff > 0 ? "text-amber-600" : "text-rose-600")}><span>Selisih tunai</span><b className="tabular-nums">{diffLabel(diff)}</b></div>; })()}
					{c.shiftExpense > 0 ? <div className="flex justify-between"><span className="text-muted-foreground">Pengeluaran</span><b className="tabular-nums">{formatRp(c.shiftExpense)}</b></div> : null}
					{c.notes ? <p className="border-t border-border pt-2 text-[13px] text-muted-foreground">Catatan: {c.notes}</p> : null}
				</div>
			</IosSheet>
		</div>
	);
}

function ChannelSheet({ channel, onClose, c, expected, onCashTouched }: { channel: (typeof SHIFT_PAYMENT_CHANNELS)[number] | null; onClose: () => void; c: EndShiftController; expected: number; onCashTouched: () => void }) {
	const [text, setText] = useState("");
	const [lastKey, setLastKey] = useState<string | null>(null);
	if ((channel?.key ?? null) !== lastKey) {
		setLastKey(channel?.key ?? null);
		if (channel && channel.key !== "tunai_kasir") setText(c.actual[channel.key] ? String(c.actual[channel.key]) : "");
	}
	const isCash = channel?.key === "tunai_kasir";
	const value = isCash ? c.cashInRegister : Number(text) || 0;
	const press = (key: (typeof KEYS)[number]) => setText((cur) => (key === "del" ? cur.slice(0, -1) : `${cur}${key}`.replace(/^0+(?=\d)/, "").slice(0, 10)));
	const save = () => {
		if (!channel) return;
		if (isCash) onCashTouched();
		else c.onActual(channel.key, text === "" ? "0" : text);
		onClose();
	};
	return (
		<IosSheet open={Boolean(channel)} onClose={onClose} title={channel?.label} heightClass="max-h-[92dvh]" footer={<motion.button type="button" whileTap={{ scale: 0.97 }} onClick={save} className="h-[52px] w-full rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground">Simpan</motion.button>}>
			<div className="flex items-center justify-between text-[13px] text-muted-foreground"><span>Menurut sistem <b className="text-foreground">{formatRp(expected)}</b></span><StatusPill tone={diffTone(value - expected)}>{diffLabel(value - expected)}</StatusPill></div>
			{isCash ? (
				<div className="pb-2">
					<div className="flex items-center justify-between pb-1 pt-2"><p className="text-[28px] font-extrabold tabular-nums">{formatRp(c.cashInRegister)}</p><button type="button" onClick={() => { c.onAutoFillCash(); onCashTouched(); }} className="h-9 rounded-full bg-primary/10 px-3.5 text-[12.5px] font-bold text-primary">Isi sesuai estimasi</button></div>
					{BILLS.map((bill) => {
						const key = `bill${bill}`;
						const count = c.breakdown[key] || 0;
						return (
							<div key={bill} className="flex items-center gap-3 border-b border-border/60 py-2">
								<span className="w-24 text-[14px] font-bold">{formatRp(bill)}</span>
								<span className="flex items-center rounded-full bg-muted"><button type="button" aria-label={`Kurangi ${bill}`} onClick={() => { c.onBreakdown(key, count - 1); onCashTouched(); }} className="h-9 w-9 text-[18px] font-bold text-primary">−</button><b className="min-w-7 text-center tabular-nums">{count}</b><button type="button" aria-label={`Tambah ${bill}`} onClick={() => { c.onBreakdown(key, count + 1); onCashTouched(); }} className="h-9 w-9 text-[18px] font-bold text-primary">+</button></span>
								<span className="flex-1 text-right text-[13px] tabular-nums text-muted-foreground">{formatRp(bill * count)}</span>
							</div>
						);
					})}
				</div>
			) : (
				<>
					<motion.p key={text} initial={{ scale: 1.05 }} animate={{ scale: 1 }} transition={IOS_SPRING} className="my-3 text-center text-[36px] font-extrabold tabular-nums">{formatRp(Number(text) || 0)}</motion.p>
					<div className="flex justify-center pb-2"><IosChip onClick={() => setText(String(expected))}>Sama dengan sistem</IosChip></div>
					<div className="grid grid-cols-3 gap-2 pb-1">
						{KEYS.map((key) => <motion.button key={key} type="button" whileTap={{ scale: 0.92 }} transition={IOS_SPRING} onClick={() => press(key)} className="flex h-[50px] items-center justify-center rounded-2xl bg-muted text-[21px] font-semibold">{key === "del" ? "⌫" : key}</motion.button>)}
					</div>
				</>
			)}
		</IosSheet>
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
