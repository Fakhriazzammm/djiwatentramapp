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
} from "@djiwaapps/web-shared";
import type { StaffRoleBonusConfig, PayslipBreakdown } from "@djiwaapps/web-shared";
import { DsButton, DsEmpty, DsGroup, DsGroupLabel, DsIconButton, DsPageTitle, DsPills, DsTag, ds3d } from "@djiwaapps/web-shared/components/ds";
import { Skeleton } from "@djiwaapps/web-shared";
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

// ── Payslip Detail Card (DS) ──
const SLIP_TAG: Record<string, ["ok" | "warn" | "info" | "danger" | undefined, string]> = { generated: ["info", "Dibuat"], sent: ["ok", "Terkirim"], acknowledged: ["ok", "Diterima"], disputed: ["danger", "Dispute"], draft: [undefined, "Draf"] };

function PayslipDetailCard({ payslip, onDownload }: { payslip: any; onDownload: (p: any) => void }) {
	const b = payslip.breakdown ?? {};
	const tag = SLIP_TAG[payslip.status] ?? SLIP_TAG.generated;
	const income: [string, number][] = [];
	if ((b.monthly_fixed_salary ?? 0) > 0) income.push(["Gaji pokok", b.monthly_fixed_salary]);
	if ((b.total_shift_pay ?? 0) > 0) income.push([`Gaji shift (${b.shifts ?? 0})`, b.total_shift_pay]);
	if ((b.total_allowance ?? 0) > 0) income.push(["Tunjangan", b.total_allowance]);
	if ((b.total_overtime_pay ?? b.overtime_pay ?? 0) > 0) income.push(["Lembur", b.total_overtime_pay ?? b.overtime_pay]);
	const bonus = b.bonus_target ?? {};
	const bonusTotal = Number(bonus.total ?? bonus.total_bonus ?? b.total_bonus ?? 0);
	if (bonusTotal > 0) income.push(["Bonus target", bonusTotal]);
	const deductions = Number(payslip.deductions ?? 0);
	const kv = (l: string, v: number, neg = false) => <div className="kx-kv" key={l}><span>{l}</span><b className="tabular-nums" style={neg ? { color: "var(--ds-danger)" } : undefined}>{neg ? "−" : ""}{formatCurrency(Math.abs(v))}</b></div>;
	return (
		<>
			<DsGroup>
				<div className="kx-cen">
					<img src={ds3d("employee-payslip")} alt="" style={{ width: 64, height: 64, objectFit: "contain", margin: "0 auto" }} />
					<DsTag tone={tag[0]}>{tag[1]}{payslip.acknowledged_at ? ` · ${new Date(payslip.acknowledged_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : payslip.sent_at ? ` · ${new Date(payslip.sent_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : ""}</DsTag>
					<div className="ds-display" style={{ marginTop: 8 }}>{formatCurrency(payslip.net_pay ?? 0)}</div>
					<div className="ds-sub">Gaji bersih · {payslip.period_name}{(b.role_name ?? payslip.role_name) ? ` · ${b.role_name ?? payslip.role_name}` : ""}</div>
				</div>
			</DsGroup>
			<DsGroupLabel>Pendapatan</DsGroupLabel>
			<DsGroup>
				{income.length === 0 ? kv("Total kotor", payslip.gross_pay ?? 0) : income.map(([l, v]) => kv(l, v))}
				{income.length > 0 && kv("Total kotor", payslip.gross_pay ?? 0)}
			</DsGroup>
			{(deductions > 0 || (b.total_penalty ?? 0) > 0) && (
				<>
					<DsGroupLabel>Potongan</DsGroupLabel>
					<DsGroup>{(b.total_penalty ?? 0) > 0 && kv("Denda keterlambatan", b.total_penalty, true)}{deductions > 0 && kv("Total potongan", deductions, true)}</DsGroup>
				</>
			)}
			<DsButton block onClick={() => onDownload(payslip)}>Unduh PDF</DsButton>
		</>
	);
}

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
		<>
			<DsPageTitle left={<DsIconButton aria-label="Kembali" onClick={() => window.history.back()}>‹</DsIconButton>}>Slip gaji</DsPageTitle>
			{!myPayslips && !livePayslip ? (
				<div className="space-y-2" role="status" aria-label="Memuat slip"><Skeleton className="h-40 rounded-3xl" /><Skeleton className="h-28 rounded-3xl" /></div>
			) : allPayslips.length === 0 ? (
				<DsEmpty icon={ds3d("employee-payslip")}>Belum ada slip gaji. Slip yang tersedia akan tampil di sini.</DsEmpty>
			) : (
				<>
					<DsPills value={String(selectedPayslipIdx)} onChange={(v) => setSelectedPayslipIdx(Number(v))} items={allPayslips.map((p: any, i: number): [string, string] => [String(i), `${(p.period_name || "").split(" ")[0]?.substring(0, 3) || ""} · ${(p.net_pay ?? 0) >= 1_000_000 ? `${((p.net_pay ?? 0) / 1_000_000).toFixed(1)}jt` : `${Math.round((p.net_pay ?? 0) / 1000)}rb`}`])} />
					<PayslipDetailCard payslip={allPayslips[selectedPayslipIdx]} onDownload={handleDownloadPayslip} />
				</>
			)}
		</>
	);
}

export const Route = createLazyFileRoute("/$username/slip-gaji")({
	component: SlipGajiPage,
});
