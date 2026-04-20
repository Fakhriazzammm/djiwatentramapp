import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	CheckCircle2,
	Edit3,
	Target,
	TrendingUp,
	X,
	Clock,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useHybridCurrentMonthProgress } from "@/hooks/use-hybrid-pos-data";
import { useHybridSetFinancialTarget } from "@/hooks/use-hybrid-write-actions";

const formatCurrency = (amount: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(amount);

const TARGET_STEP_PCT = 50;

function buildTargetLevels(progressPct: number) {
	const safeProgress = Number.isFinite(progressPct) ? Math.max(progressPct, 0) : 0;
	const maxLevel = Math.max(
		200,
		Math.ceil(safeProgress / TARGET_STEP_PCT) * TARGET_STEP_PCT
	);
	const levels: number[] = [];
	for (let level = 100; level <= maxLevel; level += TARGET_STEP_PCT) {
		levels.push(level);
	}
	return levels;
}

// ─── Set Target Modal ─────────────────────────────────────────────────────────

function SetTargetModal({
	onClose,
	currentMonth,
	existing,
}: {
	onClose: () => void;
	currentMonth: string;
	existing?: { targetRevenue: number; targetProfit?: number; notes?: string };
}) {
	const [targetRevenue, setTargetRevenue] = useState(
		existing?.targetRevenue?.toString() ?? ""
	);
	const [targetProfit, setTargetProfit] = useState(
		existing?.targetProfit?.toString() ?? ""
	);
	const [notes, setNotes] = useState(existing?.notes ?? "");
	const [saving, setSaving] = useState(false);

	const setTarget = useHybridSetFinancialTarget();

	const handleSave = async () => {
		const rev = parseFloat(targetRevenue.replace(/[^0-9.]/g, ""));
		if (!rev || rev <= 0) {
			toast.error("Target pendapatan harus diisi dan lebih dari 0");
			return;
		}
		setSaving(true);
		try {
			await setTarget({
				month: currentMonth,
				targetRevenue: rev,
				targetProfit: targetProfit ? parseFloat(targetProfit.replace(/[^0-9.]/g, "")) : undefined,
				notes: notes || undefined,
			});
			toast.success("Target keuangan berhasil disimpan!");
			onClose();
		} catch (e) {
			toast.error("Gagal menyimpan target");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			data-admin-modal-backdrop
		>
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.95 }}
				className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl mx-4"
				data-admin-modal-card
			>
				<div className="mb-5 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="rounded-lg bg-primary/10 p-2">
							<Target className="h-5 w-5 text-primary" />
						</div>
						<div>
							<h3 className="font-bold text-lg">Set Target Keuangan</h3>
							<p className="text-muted-foreground text-xs">{currentMonth}</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="space-y-4">
					<div>
						<label className="mb-1.5 block text-sm font-medium">
							Target Omzet Bulanan <span className="text-destructive">*</span>
						</label>
						<input
							type="number"
							placeholder="Contoh: 10000000"
							value={targetRevenue}
							onChange={(e) => setTargetRevenue(e.target.value)}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
						/>
						{targetRevenue && !Number.isNaN(parseFloat(targetRevenue)) && (
							<p className="mt-1 text-muted-foreground text-xs">
								{formatCurrency(parseFloat(targetRevenue))}
							</p>
						)}
					</div>

					<div>
						<label className="mb-1.5 block text-sm font-medium">
							Target Profit Bersih{" "}
							<span className="text-muted-foreground">(opsional)</span>
						</label>
						<input
							type="number"
							placeholder="Contoh: 3000000"
							value={targetProfit}
							onChange={(e) => setTargetProfit(e.target.value)}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
						/>
					</div>

					<div>
						<label className="mb-1.5 block text-sm font-medium">
							Catatan{" "}
							<span className="text-muted-foreground">(opsional)</span>
						</label>
						<textarea
							placeholder="Contoh: Target Ramadan, naik 20% dari bulan lalu..."
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={2}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
						/>
					</div>
				</div>

				<div className="mt-5 flex gap-2">
					<button
						onClick={onClose}
						className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
						type="button"
					>
						Batal
					</button>
					<button
						onClick={handleSave}
						disabled={saving}
						className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50"
						type="button"
					>
						{saving ? "Menyimpan..." : "Simpan Target"}
					</button>
				</div>
			</motion.div>
		</div>
	);
}

// ─── Circular Progress ────────────────────────────────────────────────────────

function CircularProgress({
	pct,
	size = 80,
}: {
	pct: number;
	size?: number;
}) {
	const r = (size - 12) / 2;
	const circumference = 2 * Math.PI * r;
	const visualPct = Math.max(0, Math.min(pct, 100));
	const dash = (visualPct / 100) * circumference;
	const color = pct >= 100 ? "#22c55e" : pct >= 70 ? "#3b82f6" : pct >= 40 ? "#f59e0b" : "#ef4444";

	return (
		<svg width={size} height={size} className="-rotate-90">
			<circle
				cx={size / 2}
				cy={size / 2}
				r={r}
				fill="none"
				stroke="currentColor"
				strokeWidth={8}
				className="text-muted/30"
			/>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={r}
				fill="none"
				stroke={color}
				strokeWidth={8}
				strokeDasharray={`${dash} ${circumference - dash}`}
				strokeLinecap="round"
				className="transition-all duration-700"
			/>
		</svg>
	);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FinancialTargetPanel({ compact = false }: { compact?: boolean }) {
	const [showModal, setShowModal] = useState(false);
	const progress = useHybridCurrentMonthProgress();

	if (progress === undefined) {
		return (
			<div className="rounded-xl border border-border bg-card p-6 animate-pulse">
				<div className="h-4 w-32 rounded bg-muted/50 mb-3" />
				<div className="h-20 w-full rounded bg-muted/50" />
			</div>
		);
	}

	const pct = progress.progressPct;
	const shiftPct =
		progress.shiftTarget > 0 ? (progress.shiftCollected / progress.shiftTarget) * 100 : 0;
	const dailyPct =
		progress.dailyTarget > 0 ? (progress.dailyCollected / progress.dailyTarget) * 100 : 0;
	const monthlyLevels = buildTargetLevels(pct);
	const dailyLevels = buildTargetLevels(dailyPct);
	const shiftLevels = buildTargetLevels(shiftPct);
	const isOverTarget = pct >= 100;

	if (!progress.hasTarget) {
		return (
			<>
				<div className="rounded-xl border border-border border-dashed bg-card/50 p-6 flex flex-col items-center text-center gap-3">
					<div className="rounded-full bg-muted p-3">
						<Target className="h-6 w-6 text-muted-foreground" />
					</div>
					<div>
						<p className="font-semibold">Belum ada target keuangan</p>
						<p className="text-muted-foreground text-xs mt-1">
							Set target omzet bulanan untuk tracking progress bisnis Anda
						</p>
					</div>
					<button
						onClick={() => setShowModal(true)}
						className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
						type="button"
					>
						<Target className="h-4 w-4" />
						Set Target Bulan Ini
					</button>
				</div>
				<AnimatePresence>
					{showModal && (
						<SetTargetModal
							onClose={() => setShowModal(false)}
							currentMonth={progress.month}
						/>
					)}
				</AnimatePresence>
			</>
		);
	}

	return (
		<>
			<div className="rounded-xl border border-border bg-card p-5">
				<div className="mb-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className={`rounded-lg p-1.5 ${isOverTarget ? "bg-green-500/10" : "bg-primary/10"}`}>
							{isOverTarget ? (
								<CheckCircle2 className="h-4 w-4 text-green-500" />
							) : (
								<Target className="h-4 w-4 text-primary" />
							)}
						</div>
						<div>
							<h3 className="font-bold text-base">Target Keuangan</h3>
							<p className="text-muted-foreground text-[11px]">{progress.monthLabel}</p>
						</div>
					</div>
					<button
						onClick={() => setShowModal(true)}
						className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
						type="button"
					>
						<Edit3 className="h-3 w-3" />
						Ubah
					</button>
				</div>

				{/* Progress Visualization */}
				<div className="flex items-center gap-5">
					{/* Circular */}
					<div className="relative flex-shrink-0">
						<CircularProgress pct={pct} size={88} />
						<div className="absolute inset-0 flex flex-col items-center justify-center">
							<span className="font-bold text-lg leading-none">{Math.round(pct)}%</span>
							<span className="text-[9px] text-muted-foreground">tercapai</span>
						</div>
					</div>

					{/* Stats */}
					<div className="flex-1 space-y-2">
						<div>
							<p className="text-muted-foreground text-[10px] uppercase tracking-wide">
								Omzet Saat Ini
							</p>
							<p className="font-bold text-lg text-green-600">
								{formatCurrency(progress.currentIncome)}
							</p>
						</div>
						<div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5">
							<span className="text-muted-foreground text-xs">Target</span>
							<span className="font-semibold text-xs">
								{formatCurrency(progress.targetRevenue)}
							</span>
						</div>
						{!isOverTarget && (
							<div className="flex items-center justify-between rounded-lg bg-orange-500/10 px-3 py-1.5">
								<span className="text-orange-600 text-xs">Sisa</span>
								<span className="font-bold text-orange-600 text-xs">
									{formatCurrency(progress.remaining)}
								</span>
							</div>
						)}
					</div>
				</div>

				{/* Progress Bar */}
				<div className="mt-4">
					<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
						<motion.div
							className={`h-full rounded-full ${isOverTarget ? "bg-green-500" : pct >= 70 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
							initial={{ width: 0 }}
							animate={{ width: `${Math.min(100, pct)}%` }}
							transition={{ duration: 0.8, ease: "easeOut" }}
						/>
					</div>
				</div>

				{/* Info Row */}
				{!compact && (
					<div className="mt-3 grid grid-cols-3 gap-2 border-border/50 border-t pt-3">
						<div className="text-center">
							<p className="font-semibold text-sm">{progress.daysRemaining}</p>
							<p className="text-muted-foreground text-[10px]">Hari tersisa</p>
						</div>
						<div className="text-center">
							<p className="font-semibold text-sm">
								{formatCurrency(Math.round(progress.dailyRate))}
							</p>
							<p className="text-muted-foreground text-[10px]">Rate/hari</p>
						</div>
						<div className="text-center">
							<p className="font-semibold text-sm">
								{formatCurrency(Math.round(progress.projectedMonthly))}
							</p>
							<p className="text-muted-foreground text-[10px]">Proyeksi</p>
						</div>
					</div>
				)}

				{/* AI Insight */}
				{progress.insight && (
					<div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
						isOverTarget
							? "bg-green-500/10 text-green-700 dark:text-green-400"
							: progress.daysRemaining <= 5 && pct < 80
								? "bg-red-500/10 text-red-700 dark:text-red-400"
								: "bg-primary/5 text-foreground"
					}`}>
						{isOverTarget ? (
							<CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
						) : progress.daysRemaining <= 5 && pct < 80 ? (
							<AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
						) : (
							<TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0" />
						)}
						<span>{progress.insight}</span>
					</div>
				)}

				{!compact && (
					<div className="mt-6 space-y-4 pt-4 border-t border-border/50">
						<div className="space-y-2">
							<div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
								<div className="flex items-center gap-1.5">
									<Clock className="w-3 h-3" />
									Target Per Sesi
								</div>
								<span>{Math.round(shiftPct)}%</span>
							</div>
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
								<motion.div
									className="h-full bg-primary"
									initial={{ width: 0 }}
									animate={{ width: `${Math.min(100, shiftPct)}%` }}
								/>
							</div>
							<div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
								<span>{formatCurrency(progress.shiftCollected)}</span>
								<span>{formatCurrency(progress.shiftTarget)}</span>
							</div>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
								<div className="flex items-center gap-1.5">
									<Target className="w-3 h-3" />
									Target Per Hari
								</div>
								<span>{Math.round(dailyPct)}%</span>
							</div>
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
								<motion.div
									className="h-full bg-blue-500"
									initial={{ width: 0 }}
									animate={{ width: `${Math.min(100, dailyPct)}%` }}
								/>
							</div>
							<div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
								<span>{formatCurrency(progress.dailyCollected)}</span>
								<span>{formatCurrency(progress.dailyTarget)}</span>
							</div>
						</div>

						<div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
							<p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
								Level Target Bertingkat
							</p>
							<div className="space-y-1.5">
								<p className="text-[10px] font-semibold text-muted-foreground">
									Bulan ({Math.round(pct)}%)
								</p>
								<div className="flex flex-wrap gap-1.5">
									{monthlyLevels.map((level) => (
										<span
											key={`month-${level}`}
											className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
												pct >= level
													? "bg-emerald-100 text-emerald-700"
													: "bg-muted text-muted-foreground"
											}`}
										>
											{level}%
										</span>
									))}
								</div>
							</div>
							<div className="space-y-1.5">
								<p className="text-[10px] font-semibold text-muted-foreground">
									Hari Ini ({Math.round(dailyPct)}%)
								</p>
								<div className="flex flex-wrap gap-1.5">
									{dailyLevels.map((level) => (
										<span
											key={`day-${level}`}
											className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
												dailyPct >= level
													? "bg-blue-100 text-blue-700"
													: "bg-muted text-muted-foreground"
											}`}
										>
											{level}%
										</span>
									))}
								</div>
							</div>
							<div className="space-y-1.5">
								<p className="text-[10px] font-semibold text-muted-foreground">
									Shift ({Math.round(shiftPct)}%)
								</p>
								<div className="flex flex-wrap gap-1.5">
									{shiftLevels.map((level) => (
										<span
											key={`shift-${level}`}
											className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
												shiftPct >= level
													? "bg-primary/20 text-primary"
													: "bg-muted text-muted-foreground"
											}`}
										>
											{level}%
										</span>
									))}
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			<AnimatePresence>
				{showModal && (
					<SetTargetModal
						onClose={() => setShowModal(false)}
						currentMonth={progress.month}
						existing={{
							targetRevenue: progress.targetRevenue,
							targetProfit: progress.targetProfit ?? undefined,
						}}
					/>
				)}
			</AnimatePresence>
		</>
	);
}
