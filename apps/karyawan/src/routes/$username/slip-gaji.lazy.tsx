import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useStaffProfile } from "../$username.lazy";
import {
	useHybridStaffLogs,
	useHybridStaffStats,
	useHybridPayslips,
	useHybridSiteSettings,
	fetchShiftReports,
	createClient,
	generatePayslipPDF,
} from "@yumipos/web-shared";
import type { StaffRoleBonusConfig, PayslipBreakdown } from "@yumipos/web-shared";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { cn } from "@yumipos/web-shared/lib/utils";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
	FileText, Download, ChevronDown, Calendar,
} from "lucide-react";
import { toast } from "sonner";

const formatCurrency = (amount: number) => {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
	}).format(amount);
};

const MONTHS = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const ID_TO_EN: Record<string, string> = {
	januari:"january", februari:"february", maret:"march", april:"april",
	mei:"may", juni:"june", juli:"july", agustus:"august",
	september:"september", oktober:"october", november:"november", desember:"december",
	may:"may",
};
function normPeriod(p: string): string {
	const lower = p.toLowerCase().trim();
	for (const [id, en] of Object.entries(ID_TO_EN)) {
		if (lower.startsWith(id)) return en + lower.slice(id.length);
	}
	return lower;
}

// ── Payslip Detail Card ──
function PayslipDetailCard({
	payslip, onDownload,
}: {
	payslip: any;
	onDownload: (p: any) => void;
}) {
	const [expandedBonus, setExpandedBonus] = useState(false);
	const [expandedShifts, setExpandedShifts] = useState(false);
	const b = payslip.breakdown ?? {};
	const badgeMap: Record<string, { label: string; cls: string }> = {
		generated: { label: "Generated", cls: "bg-gray-100 text-gray-600" },
		live: { label: "Realtime", cls: "bg-blue-100 text-blue-600" },
		sent: { label: "Dikirim", cls: "bg-blue-100 text-blue-600" },
		acknowledged: { label: "Diterima", cls: "bg-emerald-100 text-emerald-600" },
		disputed: { label: "Dispute", cls: "bg-red-100 text-red-600" },
	};
	const badge = badgeMap[payslip.status] ?? badgeMap.generated;

	const items: { label: string; value: number; color?: string }[] = [];
	if ((b.monthly_fixed_salary ?? 0) > 0) items.push({ label: "Gaji Tetap", value: b.monthly_fixed_salary });
	const shiftWorkDates = b.shift_work_dates ?? [];
	if ((b.total_allowance ?? 0) > 0) items.push({ label: "Tunjangan Transportasi", value: b.total_allowance });
	const bonusTarget = b.bonus_target ?? {};
	const bonusShifts = bonusTarget.shifts ?? [];
	if ((b.total_penalty ?? 0) > 0) items.push({ label: "Denda Keterlambatan", value: -Math.abs(b.total_penalty), color: "text-red-600" });

	return (
		<div className="group rounded-xl border bg-card p-4 transition-all hover:border-primary/30 hover:bg-primary/[0.02]">
			<div className="flex items-start justify-between mb-3">
				<div className="flex items-center gap-2 min-w-0">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<FileText className="h-4 w-4" />
					</div>
					<div className="min-w-0">
						<p className="truncate font-bold text-xs">{payslip.period_name}</p>
						<p className="truncate text-[10px] text-muted-foreground">{b.role_name ?? payslip.role_name ?? ""}</p>
					</div>
				</div>
				<span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${badge.cls}`}>
					{badge.label}
				</span>
			</div>

			{items.length > 0 && (
				<div className="space-y-1 mb-3">
					{items.map((item, i) => (
						<div key={i} className="flex justify-between text-[11px]">
							<span className="text-muted-foreground">{item.label}</span>
							<span className={`font-semibold tabular-nums ${item.color ?? ""}`}>
								{item.value < 0 ? `-${formatCurrency(Math.abs(item.value))}` : formatCurrency(item.value)}
							</span>
						</div>
					))}
				</div>
			)}

			{(b.total_shift_pay ?? 0) > 0 && (
				<div className="space-y-1 mb-3">
					<button onClick={() => setExpandedShifts(!expandedShifts)} className="flex w-full items-center justify-between text-[11px] group/collapse">
						<span className="flex items-center gap-1 text-muted-foreground">
							Gaji Shift ({b.shifts ?? 0} shift)
							{shiftWorkDates.length > 0 && <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expandedShifts ? 'rotate-180' : ''}`} />}
						</span>
						<span className="font-semibold tabular-nums">{formatCurrency(b.total_shift_pay ?? 0)}</span>
					</button>
					<AnimatePresence initial={false}>
						{expandedShifts && shiftWorkDates.length > 0 && (
							<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
								<div className="mt-1.5 pl-2 border-l-2 border-primary/30 space-y-1">
									{shiftWorkDates.map((dateStr: string, i: number) => (
										<div key={i} className="flex items-center justify-between text-[10px]">
											<div className="flex items-center gap-1.5 min-w-0">
												<span className="w-1 h-1 rounded-full bg-primary/40 shrink-0" />
												<span className="text-muted-foreground">{dateStr}</span>
											</div>
											<span className="font-semibold shrink-0 ml-2">{formatCurrency(b.base_shift_rate ?? 0)}/shift</span>
										</div>
									))}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			)}

			{(bonusTarget.total_bonus ?? 0) > 0 && (
				<div className="space-y-1 mb-3">
					<button onClick={() => setExpandedBonus(!expandedBonus)} className="flex w-full items-center justify-between text-[11px] group/collapse">
						<span className="flex items-center gap-1 text-muted-foreground">
							Bonus Target
							{bonusShifts.length > 0 && <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expandedBonus ? 'rotate-180' : ''}`} />}
						</span>
						<span className="font-semibold tabular-nums text-emerald-600">{formatCurrency(bonusTarget.total_bonus ?? 0)}</span>
					</button>
					<AnimatePresence initial={false}>
						{expandedBonus && bonusShifts.length > 0 && (
							<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
								<div className="mt-1.5 pl-2 border-l-2 border-emerald-200 space-y-1">
									{bonusShifts.map((s: any, i: number) => (
										<div key={i} className="flex items-center justify-between text-[10px]">
											<div className="flex items-center gap-1.5 min-w-0">
												<span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
												<span className="text-muted-foreground truncate">{s.shiftName}</span>
												<span className="text-muted-foreground/50 shrink-0">• {s.date}</span>
											</div>
											<span className="font-semibold text-emerald-600 shrink-0 ml-2">+{formatCurrency(s.bonus)}</span>
										</div>
									))}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			)}

			<div className="border-t border-border/50 my-2" />
			<div className="space-y-1 mb-3">
				<div className="flex justify-between text-[11px]">
					<span className="text-muted-foreground">Total Gross</span>
					<span className="font-semibold tabular-nums">{formatCurrency(payslip.gross_pay ?? 0)}</span>
				</div>
				{(payslip.deductions ?? 0) > 0 && (
					<div className="flex justify-between text-[11px]">
						<span className="text-muted-foreground">Potongan</span>
						<span className="font-semibold tabular-nums text-red-600">-{formatCurrency(payslip.deductions)}</span>
					</div>
				)}
				<div className="flex justify-between text-sm font-bold pt-1 border-t border-border/30">
					<span>Net Diterima</span>
					<span className="text-emerald-600 tabular-nums">{formatCurrency(payslip.net_pay ?? 0)}</span>
				</div>
			</div>

			{(payslip.sent_at || payslip.acknowledged_at) && (
				<p className="text-[11px] text-muted-foreground/60 mb-2">
					{payslip.sent_at && `Dikirim: ${new Date(payslip.sent_at).toLocaleDateString("id-ID")}`}
					{payslip.sent_at && payslip.acknowledged_at && " · "}
					{payslip.acknowledged_at && `Diterima: ${new Date(payslip.acknowledged_at).toLocaleDateString("id-ID")}`}
				</p>
			)}

			<Button variant="outline" size="sm" className="w-full rounded-lg text-[10px] font-bold h-8" onClick={() => onDownload(payslip)}>
				<Download className="mr-1.5 h-3 w-3" />
				Download PDF
			</Button>
		</div>
	);
}

// ── Slip Gaji Page ──
function SlipGajiPage() {
	const { staff, username, isUnlocked } = useStaffProfile();
	const now = new Date();
	const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
	const [selectedYear, setSelectedYear] = useState(now.getFullYear());
	const [selectedPayslipIdx, setSelectedPayslipIdx] = useState(0);

	// Fetch
	const myPayslips = useHybridPayslips(isUnlocked && staff ? { userId: staff._id } : undefined);
	const logs = useHybridStaffLogs(isUnlocked && staff ? { userId: staff._id, month: selectedMonth, year: selectedYear } : undefined);
	const stats = useHybridStaffStats(isUnlocked && staff ? { userId: staff._id, month: selectedMonth, year: selectedYear } : undefined);
	const settings = useHybridSiteSettings() as any;
	const storeName = settings?.storeName || "TENTREM KOFFIE";
	const storeAddress = settings?.storeAddress || "";

	// Live payslip calculation
	const [livePayslip, setLivePayslip] = useState<any>(null);
	const [isLoadingLivePayslip, setIsLoadingLivePayslip] = useState(false);
	useEffect(() => {
		if (!staff?._id || !stats || !isUnlocked) return;
		setIsLoadingLivePayslip(true);
		(async () => {
			try {
				const supabase = createClient();
				const { data: roleData } = await supabase
					.from("pos_staff_roles")
					.select("raw")
					.eq("_id", staff.roleId)
					.maybeSingle();
				const raw = (roleData?.raw ?? {}) as Record<string, any>;
				const baseShiftRate = Number(raw.baseShiftRate ?? 0);
				const monthlyFixedSalary = Number(raw.monthlyFixedSalary ?? 0);
				const dailyAllowance = Number(raw.dailyAllowance ?? 0);
				const daysWorked = stats.daysWorked ?? 0;
				const sessionCount = stats.sessionCount ?? (logs ? Math.floor((logs.length ?? 0) / 2) : 0);
				const totalShiftSalary = sessionCount * baseShiftRate;
				const shiftWorkDates: string[] = [];
				if (logs) {
					const seenDates = new Set<string>();
					for (const log of logs) {
						if (log.type === "check_in") {
							const d = new Date(log.timestamp);
							const dateStr = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
							if (!seenDates.has(dateStr)) {
								seenDates.add(dateStr);
								shiftWorkDates.push(dateStr);
							}
						}
					}
				}
				const totalAllowance = daysWorked * dailyAllowance;
				const bonusCfg = (raw?.bonusTargetConfig ?? {}) as StaffRoleBonusConfig;
				const bonusBasis = bonusCfg?.basis ?? "shift";
				let totalTargetBonus = 0;
				const bonusShifts: { shiftName: string; bonus: number; date: string }[] = [];
				if (bonusBasis === "monthly" && bonusCfg?.tiers && bonusCfg.tiers.length > 0) {
					totalTargetBonus = Number(bonusCfg.tiers[0]?.bonusAmount ?? 0);
				} else {
					try {
						const allShiftsData = await fetchShiftReports();
						const staffNameUpper = (staff.name ?? "").toUpperCase().trim();
						if (Array.isArray(allShiftsData) && staffNameUpper) {
							for (const shift of allShiftsData) {
								const sd = new Date(shift.startTime);
								if (sd.getFullYear() !== selectedYear || sd.getMonth() + 1 !== selectedMonth) continue;
								const mb = shift.memberBonuses;
								if (!Array.isArray(mb)) continue;
								const myBonus = mb.find((b: any) => {
									const bn = (b.name ?? "").toUpperCase().trim();
									return bn === staffNameUpper || staffNameUpper.includes(bn) || bn.includes(staffNameUpper);
								})?.bonus ?? 0;
								if (myBonus > 0) {
									bonusShifts.push({
										shiftName: shift.shiftName ?? "Shift",
										bonus: myBonus,
										date: shift.startTime ? new Date(shift.startTime).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "",
									});
								}
							}
						}
					} catch (e) {
						console.warn("[LivePayslip] bonus fetch error:", e);
					}
				}
				const totalPenalty = 0;
				const gross = monthlyFixedSalary + totalShiftSalary + totalAllowance + totalTargetBonus;
				const net = gross - totalPenalty;
				const periodStart = new Date(selectedYear, selectedMonth - 1, 1);
				const periodEnd = new Date(selectedYear, selectedMonth, 0);
				const monthName = MONTHS[selectedMonth - 1];
				setLivePayslip({
					id: "live-" + staff._id,
					user_id: staff._id,
					user_name: staff.name,
					period_name: monthName + " " + selectedYear,
					period_start: periodStart.toISOString(),
					period_end: periodEnd.toISOString(),
					gross_pay: gross,
					net_pay: net,
					deductions: totalPenalty,
					status: "live",
					breakdown: {
						role_name: staff.roleName,
						monthly_fixed_salary: monthlyFixedSalary,
						base_shift_rate: baseShiftRate,
						shifts: sessionCount,
						shift_work_dates: shiftWorkDates.length > 0 ? shiftWorkDates : undefined,
						total_shift_pay: totalShiftSalary,
						days_worked: daysWorked,
						daily_allowance: dailyAllowance,
						total_allowance: totalAllowance,
						overtime_rate_per_hour: 0,
						total_overtime_bonus: 0,
						total_penalty: totalPenalty,
						bonus_target: { basis: bonusBasis, total_bonus: totalTargetBonus, ...(bonusShifts.length > 0 ? { shifts: bonusShifts } : {}) },
					},
				});
			} catch (e) {
				console.warn("[LivePayslip] error:", e);
			}
			setIsLoadingLivePayslip(false);
		})();
	}, [staff?._id, stats, logs, isUnlocked, selectedMonth, selectedYear]);

	// Merged payslips
	const allPayslips = useMemo(() => {
		const all: any[] = [];
		const seenPeriods = new Set<string>();
		if (livePayslip) { all.push(livePayslip); seenPeriods.add(normPeriod(livePayslip.period_name)); }
		if (myPayslips) (myPayslips as any[]).forEach((p: any) => {
			if ((p.gross_pay ?? 0) > 0 || (p.net_pay ?? 0) > 0) {
				if (!seenPeriods.has(normPeriod(p.period_name))) all.push(p);
			}
		});
		return all.sort((a, b) => (b.period_name || "").localeCompare(a.period_name || ""));
	}, [livePayslip, myPayslips]);

	// Clamp selected index
	useEffect(() => {
		setSelectedPayslipIdx((prev) => Math.min(prev, Math.max(0, allPayslips.length - 1)));
	}, [allPayslips.length]);

	// Download
	const handleDownloadPayslip = useCallback(async (payslip: any) => {
		try {
			const breakdown: PayslipBreakdown = payslip.breakdown ?? {};
			const blob = generatePayslipPDF(
				{
					id: payslip.id,
					user_id: payslip.user_id,
					user_name: payslip.user_name,
					period_name: payslip.period_name,
					period_start: payslip.period_start,
					period_end: payslip.period_end,
					gross_pay: payslip.gross_pay ?? 0,
					deductions: payslip.deductions ?? 0,
					net_pay: payslip.net_pay ?? 0,
					status: payslip.status ?? "generated",
					sent_at: payslip.sent_at,
					acknowledged_at: payslip.acknowledged_at,
					breakdown,
				},
				breakdown,
				storeName,
				storeAddress
			);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `slip-gaji-${(payslip.user_name ?? "karyawan").toLowerCase().replace(/\s+/g, "-")}-${(payslip.period_name ?? "").toLowerCase().replace(/\s+/g, "-")}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success("PDF berhasil diunduh");
		} catch (e: any) {
			toast.error(`Gagal mengunduh PDF: ${e?.message || e}`);
		}
	}, [storeName, storeAddress]);

	return (
		<div className="space-y-4">
			{/* Period Selector */}
			<div className="flex items-center justify-between gap-2 px-2">
				<div className="flex items-center gap-1.5">
					<Calendar className="h-3 w-3 text-primary" />
					<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Periode</span>
				</div>
				<div className="flex items-center gap-1.5">
					<select 
						className="bg-transparent text-xs font-black focus:outline-none py-0.5"
						value={selectedMonth}
						onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
					>
						{MONTHS.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
					</select>
					<select 
						className="bg-transparent text-xs font-black focus:outline-none py-0.5"
						value={selectedYear}
						onChange={(e) => setSelectedYear(parseInt(e.target.value))}
					>
						{[2024, 2025, 2026].map(y => (<option key={y} value={y}>{y}</option>))}
					</select>
				</div>
			</div>

			{/* Slip Gaji */}
			<div className="space-y-2">
				<div className="flex items-center justify-between px-2">
					<h3 className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px]">
						<FileText className="h-3 w-3 text-primary" />
						Slip Gaji
					</h3>
				</div>
				<div className="space-y-2">
					{!myPayslips && !livePayslip ? (
						<>
							{[1, 2, 3].map((i) => (
								<div key={i} className="animate-pulse rounded-xl border bg-card p-4 space-y-3">
									<div className="flex items-center gap-2"><div className="h-8 w-8 rounded-lg bg-muted" /><div className="space-y-1 flex-1"><div className="h-3 w-32 rounded bg-muted" /><div className="h-2.5 w-20 rounded bg-muted" /></div><div className="h-5 w-16 rounded bg-muted" /></div>
									{[1, 2, 3].map((j) => <div key={j} className="flex justify-between"><div className="h-3 w-28 rounded bg-muted" /><div className="h-3 w-16 rounded bg-muted" /></div>)}
									<div className="h-8 w-full rounded-lg bg-muted" />
								</div>
							))}
						</>
					) : allPayslips.length === 0 ? (
						<div className="rounded-xl border bg-card p-6 text-center">
							<FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
							<p className="text-xs font-medium text-muted-foreground">Belum ada slip gaji</p>
						</div>
					) : (
						<>
							{/* Timeline Chips */}
							<LayoutGroup id="payslip-chips">
								<div className="flex gap-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch] scrollbar-none">
									{allPayslips.map((p: any, i: number) => {
										const isActive = selectedPayslipIdx === i;
										const month = (p.period_name || "").split(" ")[0]?.substring(0, 3) || "";
										const net = p.net_pay ?? 0;
										const netShort = net >= 1_000_000
											? `${(net / 1_000_000).toFixed(1)}jt`
											: net >= 1_000
												? `${(net / 1_000).toFixed(0)}rb`
												: `${net}`;
										return (
											<motion.button
												key={p.id || i}
												layout
												type="button"
												onClick={() => setSelectedPayslipIdx(i)}
												whileTap={{ scale: 0.92 }}
												className={cn(
													"relative flex shrink-0 flex-col items-center rounded-lg border px-2 py-1 transition-colors",
													isActive
														? "bg-primary/10 border-primary/30 text-primary"
														: "bg-card border-border/50 text-muted-foreground hover:border-border"
												)}
											>
												<span className="text-[10px] font-bold uppercase leading-tight">{month}</span>
												<span className="text-[10px] font-black tabular-nums leading-tight">{netShort}</span>
												{isActive && (
													<motion.div
														layoutId="chip-indicator"
														className="absolute -bottom-px left-1 right-1 h-0.5 rounded-full bg-primary"
														transition={{ type: "spring", stiffness: 500, damping: 35 }}
													/>
												)}
											</motion.button>
										);
									})}
								</div>
							</LayoutGroup>

							{/* Detail Card */}
							<AnimatePresence mode="wait">
								<motion.div
									key={selectedPayslipIdx}
									initial={{ opacity: 0, y: 6 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -6 }}
									transition={{ duration: 0.15 }}
								>
									<PayslipDetailCard payslip={allPayslips[selectedPayslipIdx]} onDownload={handleDownloadPayslip} />
								</motion.div>
							</AnimatePresence>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

export const Route = createLazyFileRoute("/$username/slip-gaji")({
	component: SlipGajiPage,
});
