import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useStaffProfile } from "../$username.lazy";
import {
	useHybridStaffLogs,
	useHybridStaffStats,
	useHybridPrivateStaffData,
	useHybridPayslips,
	useHybridUpdateUserPin,
	useHybridUpdateUserProfile,
	useHybridSiteSettings,
	fetchShiftReports,
	createClient,
	generatePayslipPDF,
} from "@yumipos/web-shared";
import type { StaffRoleBonusConfig, PayslipData, PayslipBreakdown } from "@yumipos/web-shared";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { Input } from "@yumipos/web-shared/components/ui/input";
import { cn } from "@yumipos/web-shared/lib/utils";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
	User, Lock, Unlock, Clock, Download, FileText, TrendingUp,
	UserCircle, Camera, ShieldCheck, Bell, Check,
	LogOut, ChevronRight, Calendar, KeyRound, X, ChevronDown, ChevronUp
} from "lucide-react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/$username/profil")({
	component: ProfilPage,
});

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

// Payslip Detail Card
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
				<span className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>
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
				<p className="text-[9px] text-muted-foreground/60 mb-2">
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

function ProfilPage() {
	const { staff, username, isUnlocked, isAdmin, authUser, isAuthenticated, token, navigate, refreshKey } = useStaffProfile();
	const now = new Date();
	const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
	const [selectedYear, setSelectedYear] = useState(now.getFullYear());

	// Auth
	// PIN state
	const [showChangePin, setShowChangePin] = useState(false);
	const [newPin, setNewPin] = useState("");
	const [oldPin, setOldPin] = useState("");
	const [isUpdatingPin, setIsUpdatingPin] = useState(false);
	const updatePinMutation = useHybridUpdateUserPin();

	// Edit profile
	const [isEditMode, setIsEditMode] = useState(false);
	const [editName, setEditName] = useState("");
	const [editEmail, setEditEmail] = useState("");
	const [editSlug, setEditSlug] = useState("");
	const [editNewPassword, setEditNewPassword] = useState("");
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [editPhone, setEditPhone] = useState("");
	const [editIdentityNumber, setEditIdentityNumber] = useState("");
	const [editAddress, setEditAddress] = useState("");
	const [editBirthDate, setEditBirthDate] = useState("");
	const [editPlaceOfBirth, setEditPlaceOfBirth] = useState("");
	const [editEmergencyContactName, setEditEmergencyContactName] = useState("");
	const [editEmergencyContactPhone, setEditEmergencyContactPhone] = useState("");
	const [editBankName, setEditBankName] = useState("");
	const [editBankAccount, setEditBankAccount] = useState("");
	const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
	const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

	const updateProfileMutation = useHybridUpdateUserProfile();

	// Fetch data
	const privateData = useHybridPrivateStaffData(isUnlocked && staff ? { slug: username, token } : undefined);
	const myPayslips = useHybridPayslips(isUnlocked && staff ? { userId: staff._id } : undefined);
	const logs = useHybridStaffLogs(isUnlocked && staff ? { userId: staff._id, month: selectedMonth, year: selectedYear, refreshTrigger: refreshKey } : undefined);
	const stats = useHybridStaffStats(isUnlocked && staff ? { userId: staff._id, month: selectedMonth, year: selectedYear, refreshTrigger: refreshKey } : undefined);
	const settings = useHybridSiteSettings() as any;
	const storeName = settings?.storeName || "TENTREM KOFFIE";
	const storeAddress = settings?.storeAddress || "";

	const requiresPinChange = Boolean(authUser?.requiresPinChange && authUser.slug === username);

	// Contract data
	const [contractData, setContractData] = useState<any>(null);
	const [isLoadingContract, setIsLoadingContract] = useState(false);
	useEffect(() => {
		if (!staff?._id) return;
		setIsLoadingContract(true);
		const supabase = createClient();
		supabase
			.from("employee_onboarding_applications")
			.select("id, full_name, contract, contract_pdf_url, employment, raw, created_at, status")
			.eq("approved_user_source_id", staff._id)
			.in("status", ["approved", "expired", "completed"])
			.order("created_at", { ascending: false })
			.maybeSingle()
			.then((result: any) => {
				const { data, error } = result;
				if (data) setContractData(data);
				else if (error) console.warn("[Kontrak] fetch error:", error);
				setIsLoadingContract(false);
			});
	}, [staff?._id]);

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

			// ── Payslip data (merged + sorted) ──
			const allPayslips = useMemo(() => {
				const all: any[] = [];
				const seenPeriods = new Set<string>();
				if (livePayslip) { all.push(livePayslip); seenPeriods.add(normPeriod(livePayslip.period_name)); }
				if (myPayslips) (myPayslips as any[]).forEach((p: any) => {
					if ((p.gross_pay??0) > 0 || (p.net_pay??0) > 0) {
						if (!seenPeriods.has(normPeriod(p.period_name))) all.push(p);
					}
				});
				return all.sort((a, b) => (b.period_name || "").localeCompare(a.period_name || ""));
			}, [livePayslip, myPayslips]);

			// Clamp selected index when data changes
			useEffect(() => {
				setSelectedPayslipIdx((prev) => Math.min(prev, Math.max(0, allPayslips.length - 1)));
			}, [allPayslips.length]);

			// Init edit form
	const hasLoadedRef = useRef(false);
	useEffect(() => {
		if (hasLoadedRef.current) return;
		if (staff && isUnlocked) {
			hasLoadedRef.current = true;
			setEditName(staff.name || "");
			setEditSlug(staff.slug || "");
		}
		if (privateData && isUnlocked) {
			setEditEmail(privateData.email || privateData.username || "");
			const raw = (privateData as any).raw ?? {};
			setEditPhone(raw.phone || "");
			setEditIdentityNumber(raw.identityNumber || "");
			setEditAddress(raw.address || "");
			setEditBirthDate(raw.birthDate || "");
			setEditPlaceOfBirth(raw.placeOfBirth || "");
			setEditEmergencyContactName(raw.emergencyContactName || "");
			setEditEmergencyContactPhone(raw.emergencyContactPhone || "");
			setEditBankName(String((raw as any)?.bankName ?? ""));
			setEditBankAccount(String((raw as any)?.bankAccount ?? ""));
		}
	}, [staff, privateData, isUnlocked]);

	// Onboarding state
	const ONBOARDING_DISMISS_KEY = "karyawan_onboarding_dismissed";
	const [showOnboarding, setShowOnboarding] = useState(() => {
		if (typeof window === "undefined") return false;
		if (authUser?.slug !== username) return false;
		return !localStorage.getItem(ONBOARDING_DISMISS_KEY);
	});
	const [completedSteps, setCompletedSteps] = useState(0);
	const [isCelebrating, setIsCelebrating] = useState(false);
	const [showEditTooltip, setShowEditTooltip] = useState(false);
		const [selectedPayslipIdx, setSelectedPayslipIdx] = useState(0);

	const dismissOnboarding = useCallback(() => {
		setIsCelebrating(true);
		setTimeout(() => {
			localStorage.setItem(ONBOARDING_DISMISS_KEY, "true");
			setShowOnboarding(false);
			setIsCelebrating(false);
			setCompletedSteps(0);
		}, 800);
	}, []);

	const handleLengkapiData = useCallback(() => {
		setCompletedSteps(1);
		localStorage.setItem(ONBOARDING_DISMISS_KEY, "true");
		setShowOnboarding(false);
		setIsEditMode(true);
		setShowEditTooltip(true);
		setTimeout(() => setShowEditTooltip(false), 4000);
	}, []);

	const handleGabungGrup = useCallback(() => {
		setCompletedSteps(2);
		window.open("https://t.me/addlist/076D_FFRNFw5ZWI1", "_blank");
	}, []);

	const handleAvatarClick = useCallback(() => {
		navigate({ to: "/$username/absensi" as any, params: { username } });
	}, [navigate, username]);

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
					<span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Periode</span>
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

			{/* Incomplete data badge */}
			{privateData?.raw && (() => {
				const r = privateData.raw as any;
				const missingFields = [r.phone, r.identityNumber, r.address, r.birthDate, r.emergencyContactName].filter(f => !f);
				if (missingFields.length === 0) return null;
				return (
					<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
						<div className="flex items-start gap-3">
							<div className="shrink-0 mt-0.5">⚠️</div>
							<div className="flex-1 min-w-0">
								<p className="text-[10px] font-black uppercase tracking-wide">Lengkapi Data Diri</p>
								<p className="mt-0.5 text-[11px] font-medium">Isi No HP, Alamat, dan data lainnya untuk memudahkan administrasi.</p>
							</div>
							<Button variant="outline" size="sm" className="shrink-0 rounded-lg font-bold text-[10px] h-8 px-3 border-amber-300 text-amber-800 hover:bg-amber-100" onClick={() => setIsEditMode(true)}>EDIT NOW</Button>
						</div>
					</div>
				);
			})()}

			{/* Data Pribadi */}
			<div className="space-y-2">
				<div className="flex items-center justify-between px-2">
					<h3 className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px]">
						<User className="h-3 w-3 text-primary" />
						Data Pribadi
					</h3>
					<div className="flex items-center gap-1">
						<Button variant="ghost" size="sm" className="text-[10px] font-bold h-6 px-2" onClick={() => setIsEditMode(!isEditMode)}>
							{isEditMode ? "BATAL" : "EDIT"}
						</Button>
						{showEditTooltip && (
							<motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="relative inline-flex items-center gap-1.5">
								<motion.div animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
									<span className="text-base">👉</span>
								</motion.div>
								<span className="whitespace-nowrap rounded-lg bg-primary px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-primary-foreground shadow-lg">Isi data dirimu!</span>
							</motion.div>
						)}
					</div>
				</div>
				<div className="rounded-xl border bg-card p-3 space-y-2.5">
					{!isEditMode ? (
						<div className="space-y-1.5">
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Nama</span>
								<span className="font-bold text-right max-w-[200px] truncate">{staff.name}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Email</span>
								<span className="font-bold text-right max-w-[200px] truncate">{privateData?.email || privateData?.username || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Username</span>
								<span className="font-bold">@{staff.slug}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">No HP</span>
								<span className="font-bold">{privateData?.raw?.phone || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">KTP</span>
								<span className="font-bold">{privateData?.raw?.identityNumber || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Tmp/Tgl Lahir</span>
								<span className="font-bold text-right max-w-[200px]">{[privateData?.raw?.placeOfBirth, privateData?.raw?.birthDate].filter(Boolean).join(", ") || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Alamat</span>
								<span className="font-bold text-right max-w-[200px] truncate">{privateData?.raw?.address || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Bank</span>
								<span className="font-bold">{(privateData as any)?.raw?.bankName || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">No Rekening</span>
								<span className="font-bold">{(privateData as any)?.raw?.bankAccount || "---"}</span>
							</div>
							<div className="flex justify-between items-center text-[10px]">
								<span className="text-muted-foreground">Kontak Darurat</span>
								<span className="font-bold text-right max-w-[200px]">{privateData?.raw?.emergencyContactName ? `${privateData.raw.emergencyContactName} (${privateData.raw.emergencyContactPhone || "-"})` : "---"}</span>
							</div>
							<div className="border-t pt-2 mt-2 space-y-1.5">
								<p className="text-[8px] font-black text-primary uppercase">Pekerjaan</p>
								<div className="flex justify-between items-center text-[10px]">
									<span className="text-muted-foreground">Mulai</span>
									<span className="font-bold">{privateData?.raw?.startDate || "---"}</span>
								</div>
								<div className="flex justify-between items-center text-[10px]">
									<span className="text-muted-foreground">Status</span>
									<span className="font-bold">{privateData?.raw?.employmentType === "probation" ? "Probation" : privateData?.raw?.employmentType || "---"}</span>
								</div>
								<div className="flex justify-between items-center text-[10px]">
									<span className="text-muted-foreground">Lokasi</span>
									<span className="font-bold">{privateData?.raw?.location || "---"}</span>
								</div>
							</div>
						</div>
					) : (
						<form className="space-y-2" onSubmit={async (e) => {
							e.preventDefault();
							if (!token) return;
							setIsSavingProfile(true);
							try {
								let photoUrl: string | undefined;
								if (editPhotoFile) {
									setIsUploadingPhoto(true);
									try {
										const supabase = createClient();
										const ext = editPhotoFile.name.split('.').pop() || 'jpg';
										const objectPath = `profile-photos/${staff?.slug || username}_${Date.now()}.${ext}`;
										const { error: uploadError } = await supabase.storage
											.from("profile-photos")
											.upload(objectPath, editPhotoFile, { contentType: editPhotoFile.type || "image/jpeg", upsert: true });
										if (uploadError) throw uploadError;
										const { data: publicUrlData } = supabase.storage.from("profile-photos").getPublicUrl(objectPath);
										photoUrl = publicUrlData.publicUrl;
									} finally { setIsUploadingPhoto(false); }
								}
								await updateProfileMutation({
									token,
									name: editName !== staff?.name ? editName : undefined,
									slug: editSlug !== staff?.slug ? editSlug : undefined,
									phone: editPhone || undefined,
									identityNumber: editIdentityNumber || undefined,
									address: editAddress || undefined,
									birthDate: editBirthDate || undefined,
									placeOfBirth: editPlaceOfBirth || undefined,
									emergencyContactName: editEmergencyContactName || undefined,
									emergencyContactPhone: editEmergencyContactPhone || undefined,
									bankName: editBankName || undefined,
									bankAccount: editBankAccount || undefined,
									photoUrl,
								});
								if (editEmail && editEmail !== privateData?.email && editEmail !== privateData?.username) {
									const supabase = createClient();
									// Cek apakah user sudah punya Supabase Auth account
									const { data: yumiUser } = await supabase
										.from("yumi_users")
										.select("auth_user_id, email")
										.eq("source_id", staff._id)
										.maybeSingle();
									const hasAuthUser = Boolean(yumiUser?.auth_user_id);
									const existingEmail = yumiUser?.email || privateData?.email || privateData?.username;
									if (!hasAuthUser) {
										// First time: create Supabase Auth user
										const authPassword = editNewPassword || Array.from({ length: 16 }, () =>
											Math.random().toString(36).charAt(2)
										).join("") + "Aa1!";
										const { error: createError } = await supabase.functions.invoke("yumi-auth", {
											body: {
												action: "createAuthUser",
												sourceId: staff._id,
												email: editEmail,
												password: authPassword,
												name: editName || staff?.name || "",
											},
										});
										if (createError) throw new Error(createError.message || "Gagal membuat akun auth");
									} else {
										// Already has auth
										if (editEmail !== existingEmail) {
											const { error: emailError } = await supabase.functions.invoke("yumi-auth", {
												body: { action: "updateEmail", userId: staff._id, newEmail: editEmail },
											});
											if (emailError) throw new Error(emailError.message || "Gagal update email");
										}
										if (editNewPassword) {
											const { error: pwError } = await supabase.auth.updateUser({ password: editNewPassword });
											if (pwError) throw pwError;
										}
									}
								}
								toast.success("Profil berhasil diperbarui!");
								setIsEditMode(false);
								setEditNewPassword("");
								setEditPhotoFile(null);
								setIsUploadingPhoto(false);
								if (editSlug !== username) {
									navigate({ to: `/${editSlug}` as any, replace: true });
								}
							} catch (err: any) {
								toast.error(err?.message || "Gagal memperbarui profil");
							} finally { setIsSavingProfile(false); }
						}}>
							<div className="space-y-1.5">
								<div className="space-y-1">
									<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Nama Lengkap</label>
									<Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Nama Lengkap" />
								</div>
								<div className="space-y-1">
									<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Username (login, tidak bisa diubah)</label>
									<Input value={privateData?.username || ""} className="h-10 rounded-xl font-bold text-xs opacity-60" disabled />
								</div>
								<div className="space-y-1">
									<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Email</label>
									<Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="email@example.com" />
								</div>
								<div className="space-y-1">
									<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Username Profil (Slug)</label>
									<Input value={editSlug} onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} className="h-10 rounded-xl font-bold text-xs" placeholder="username-profil" />
								</div>

								<div className="pt-2 border-t mt-2 space-y-2.5">
									<p className="text-[9px] font-black text-primary uppercase ml-1">Data Tambahan</p>
									<div className="space-y-1"><label className="text-[9px] font-black text-muted-foreground uppercase ml-1">No HP / WA</label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Contoh: 08123456789" /></div>
									<div className="space-y-1"><label className="text-[9px] font-black text-muted-foreground uppercase ml-1">No Identitas (KTP)</label><Input value={editIdentityNumber} onChange={(e) => setEditIdentityNumber(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="KTP / SIM" /></div>
									<div className="space-y-1"><label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Tempat Lahir</label><Input value={editPlaceOfBirth} onChange={(e) => setEditPlaceOfBirth(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Contoh: Jakarta" /></div>
									<div className="space-y-1"><label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Tanggal Lahir</label><Input value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="YYYY-MM-DD" /></div>
									<div className="space-y-1"><label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Alamat</label><Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Alamat lengkap" /></div>
									<div className="space-y-1"><label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Nama Bank</label><Input value={editBankName} onChange={(e) => setEditBankName(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Contoh: BCA, Mandiri" /></div>
									<div className="space-y-1"><label className="text-[9px] font-black text-muted-foreground uppercase ml-1">No Rekening</label><Input value={editBankAccount} onChange={(e) => setEditBankAccount(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Nomor rekening" /></div>
									<div className="space-y-1"><label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Kontak Darurat (Nama)</label><Input value={editEmergencyContactName} onChange={(e) => setEditEmergencyContactName(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Nama kontak darurat" /></div>
									<div className="space-y-1"><label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Kontak Darurat (No HP)</label><Input value={editEmergencyContactPhone} onChange={(e) => setEditEmergencyContactPhone(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="No HP kontak darurat" /></div>
								</div>

								<div className="pt-2 border-t mt-2 space-y-2.5">
									<p className="text-[9px] font-black text-primary uppercase ml-1">Foto Profile</p>
									<div className="space-y-2">
										{staff.photoUrl && !editPhotoFile && (
											<div className="flex items-center gap-3">
												<img src={staff.photoUrl} alt="Profile" className="h-16 w-16 rounded-full object-cover border-2 border-primary/20" />
												<span className="text-xs text-muted-foreground">Foto saat ini</span>
											</div>
										)}
										{editPhotoFile && (
											<div className="flex items-center gap-3">
												<img src={URL.createObjectURL(editPhotoFile)} alt="Preview" className="h-16 w-16 rounded-full object-cover border-2 border-primary/20" />
												<Button type="button" variant="ghost" size="sm" className="text-xs text-destructive h-8" onClick={() => setEditPhotoFile(null)}>Hapus</Button>
											</div>
										)}
										<label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
											<Camera className="h-4 w-4" />
											<span>{editPhotoFile ? editPhotoFile.name : "Pilih file foto"}</span>
											<input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setEditPhotoFile(file); }} />
										</label>
									</div>
								</div>

								<div className="pt-2 border-t mt-2 space-y-2.5">
									<p className="text-[9px] font-black text-primary uppercase ml-1">Password Akun (untuk login web)</p>
									<div className="space-y-1">
										<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Password Baru</label>
										<Input type="password" value={editNewPassword} onChange={(e) => setEditNewPassword(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Minimal 6 karakter" />
									</div>
								</div>
							</div>
							<div className="pt-2">
								<Button type="submit" className="w-full h-10 rounded-xl font-bold shadow-md text-xs" disabled={isSavingProfile}>
									{isSavingProfile ? <Clock className="h-4 w-4 animate-spin" /> : "SIMPAN PERUBAHAN"}
								</Button>
							</div>
						</form>
					)}
				</div>
			</div>

			{/* Kontrak Kerja */}
			<div className="space-y-2">
				<h3 className="flex items-center gap-1.5 px-2 font-bold uppercase tracking-wider text-[10px]">
					<FileText className="h-3 w-3 text-emerald-500" />
					Kontrak Kerja
				</h3>
				<div className="rounded-xl border bg-card p-3">
					{isLoadingContract ? (
						<div className="animate-pulse space-y-2">
							<div className="h-3 w-40 rounded bg-muted" />
							<div className="h-3 w-32 rounded bg-muted" />
							<div className="h-8 w-full rounded-lg bg-muted mt-3" />
						</div>
					) : contractData ? (
						<>
							<div className="space-y-2">
								{(() => {
									const endDate = (contractData as any)?.employment?.endDate;
									const startDate = (contractData as any)?.employment?.startDate;
									const durationMonths = Number((contractData as any)?.employment?.contractDuration ?? 0);
									const computedEndDate = endDate || (startDate && durationMonths > 0 ? new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + durationMonths, new Date(startDate).getDate()).toISOString() : null);
									const isExpired = (computedEndDate && new Date(computedEndDate) < new Date()) || (contractData as any)?.status === "expired" || (contractData as any)?.status === "completed";
									const status = (contractData as any)?.status;
									const isActive = !isExpired && (status === "approved" || !status);
									return (
										<>
											<div className="flex items-center justify-between">
												<span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Status</span>
												<span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{isActive ? "Aktif" : "Berakhir"}</span>
											</div>
											<div className="flex items-center justify-between">
												<span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Jenis</span>
												<span className="text-xs font-bold">{((contractData as any)?.employment?.type) || "PKWT - Full Time"}</span>
											</div>
											<div className="flex items-center justify-between">
												<span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Mulai</span>
												<span className="text-xs font-bold">{((contractData as any)?.employment?.startDate) ? new Date((contractData as any).employment.startDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—"}</span>
											</div>
											<div className="flex items-center justify-between">
												<span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Berakhir</span>
												<span className="text-xs font-bold">{computedEndDate ? new Date(computedEndDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : status === "expired" || status === "completed" ? "Selesai" : "—"}</span>
											</div>
										</>
									);
								})()}
							</div>
							{contractData.contract_pdf_url && (
								<Button variant="outline" size="sm" className="w-full mt-3 rounded-lg text-[10px] font-bold h-8" onClick={() => window.open(contractData.contract_pdf_url, "_blank")}>
									<Download className="mr-1.5 h-3 w-3" />
									Download Kontrak PDF
								</Button>
							)}
						</>
					) : (
						<div className="py-4 text-center">
							<p className="text-[11px] font-medium text-muted-foreground">Belum ada kontrak kerja</p>
						</div>
					)}
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
												<span className="text-[8px] font-bold uppercase leading-tight">{month}</span>
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

			{/* Pengaturan Akun */}
			<div className="space-y-2">
				<h3 className="flex items-center gap-1.5 px-2 font-bold uppercase tracking-wider text-[10px]">
					<ShieldCheck className="h-3 w-3 text-primary" />
					Pengaturan Akun
				</h3>
				<div className="rounded-xl border bg-card p-3 space-y-2.5">
					{requiresPinChange && (
						<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
							<p className="text-[10px] font-black uppercase tracking-wide">PIN default masih aktif</p>
							<p className="mt-1 text-[11px] font-medium">Untuk keamanan akun, ganti PIN 696969 dengan PIN baru milik Anda.</p>
						</div>
					)}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
								<KeyRound className="h-4 w-4" />
							</div>
							<div>
								<p className="font-bold text-xs">PIN Keamanan</p>
								<p className="text-[9px] text-muted-foreground uppercase">Gunakan PIN untuk absensi</p>
							</div>
						</div>
						<Button variant="outline" size="sm" className="rounded-lg font-bold text-[10px] h-8 px-3" onClick={() => setShowChangePin(!showChangePin)}>
							{showChangePin ? "BATAL" : requiresPinChange ? "GANTI SEKARANG" : "UBAH PIN"}
						</Button>
					</div>

					<AnimatePresence>
						{showChangePin && (
							<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t pt-3">
								<form className="space-y-3" onSubmit={async (e) => {
									e.preventDefault();
									if (newPin.length !== 6 || oldPin.length !== 6) { toast.error("PIN harus 6 digit"); return; }
									if (newPin === "696969") { toast.error("PIN baru tidak boleh sama dengan PIN default"); return; }
									setIsUpdatingPin(true);
									try {
										await updatePinMutation({ token: token!, oldPin, newPin });
										toast.success("PIN berhasil diperbarui!");
										setShowChangePin(false);
										setNewPin("");
										setOldPin("");
									} catch (err) {
										toast.error((err as any).message || "Gagal memperbarui PIN");
									} finally { setIsUpdatingPin(false); }
								}}>
									<div className="grid grid-cols-2 gap-3">
										<div className="space-y-1">
											<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">PIN Lama</label>
											<Input type="password" maxLength={6} value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))} className="h-10 rounded-xl text-center font-bold tracking-widest text-xs" placeholder="••••••" />
										</div>
										<div className="space-y-1">
											<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">PIN Baru</label>
											<Input type="password" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} className="h-10 rounded-xl text-center font-bold tracking-widest text-xs" placeholder="••••••" />
										</div>
									</div>
									<Button type="submit" className="w-full h-10 rounded-xl font-bold text-xs" disabled={isUpdatingPin || newPin.length !== 6 || oldPin.length !== 6}>
										{isUpdatingPin ? <Clock className="h-4 w-4 animate-spin" /> : "SIMPAN PIN BARU"}
									</Button>
								</form>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</div>

			{/* Grup Telegram */}
			<div className="space-y-2">
				<h3 className="flex items-center gap-1.5 px-2 font-bold uppercase tracking-wider text-[10px]">
					<Bell className="h-3 w-3 text-sky-500" />
					Grup Telegram
				</h3>
				<div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
					<div className="flex items-start gap-3">
						<div className="shrink-0 mt-0.5 text-lg">💬</div>
						<div className="flex-1 min-w-0">
							<p className="text-[10px] font-black uppercase tracking-wide text-sky-800">Gabung Grup Karyawan</p>
							<p className="mt-0.5 text-[11px] font-medium text-sky-700">Dapatkan pengumuman, jadwal, dan info terbaru dari tim.</p>
							<Button variant="outline" size="sm" className="mt-2 h-8 rounded-lg text-[10px] font-bold px-3 border-sky-300 text-sky-700 hover:bg-sky-100 hover:text-sky-800" onClick={() => window.open("https://t.me/addlist/076D_FFRNFw5ZWI1", "_blank")}>
								GABUNG GRUP
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Onboarding Overlay */}
			<AnimatePresence>
				{showOnboarding && (() => {
					return (
						<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
							<motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="relative w-full sm:max-w-md bg-card border rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-8 sm:pb-6 shadow-2xl max-h-[85vh] overflow-y-auto">
								{isCelebrating && (
									<div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-10">
										{Array.from({ length: 12 }).map((_, i) => (
											<motion.div key={i} className="absolute h-2 w-2 rounded-full"
												style={{ left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 40}%`, background: ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"][i % 5] }}
												initial={{ opacity: 1, scale: 1, y: 0 }}
												animate={{ opacity: 0, scale: 0, y: -80 - Math.random() * 120, x: (Math.random() - 0.5) * 60, rotate: Math.random() * 360 }}
												transition={{ duration: 0.6, ease: "easeOut" }}
											/>
										))}
										<motion.div className="absolute inset-0 flex items-center justify-center"
											initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1.5, opacity: [0, 1, 1, 0] }} transition={{ duration: 0.6 }}>
											<div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
												<Check className="h-8 w-8 text-white" />
											</div>
										</motion.div>
									</div>
								)}
								<button onClick={dismissOnboarding} className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
									<X className="h-4 w-4" />
								</button>

								<div className="mb-5 mt-2">
									<div className="flex items-center justify-between mb-1.5">
										<span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
											{completedSteps === 0 ? 'Baru Mulai' : completedSteps === 1 ? '1 Langkah Selesai' : 'Selesai!'}
										</span>
										<span className="text-[9px] font-bold text-muted-foreground">{completedSteps}/2</span>
									</div>
									<div className="h-1.5 rounded-full bg-muted overflow-hidden">
										<motion.div initial={{ width: "0%" }} animate={{ width: `${(completedSteps / 2) * 100}%` }} transition={{ type: "spring", damping: 20, stiffness: 200 }} className={`h-full rounded-full ${completedSteps === 2 ? "bg-emerald-500" : "bg-primary"}`} />
									</div>
								</div>

								<div className="text-center mb-6">
									<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", damping: 15 }} className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
										<span className="text-2xl">✨</span>
									</motion.div>
									<h2 className="text-lg sm:text-xl font-black tracking-tight">Selamat Datang!</h2>
									<p className="text-xs text-muted-foreground mt-1">Selesaikan 2 langkah berikut untuk memulai.</p>
								</div>

								{completedSteps >= 1 ? (
									<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 mb-3">
										<div className="flex items-center gap-3">
											<div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white"><Check className="h-4 w-4" /></div>
											<div><p className="font-bold text-sm text-emerald-800">Data Diri ✓</p><p className="text-[11px] text-emerald-600">Sudah dilengkapi</p></div>
										</div>
									</div>
								) : (
									<motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="rounded-xl border p-3.5 mb-3">
										<div className="flex items-start gap-3">
											<div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm sm:text-base font-black text-primary">1</div>
											<div className="flex-1 min-w-0">
												<p className="font-bold text-sm">Lengkapi Data Diri</p>
												<p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Isi No HP, alamat, dan data lainnya agar administrasi lebih mudah.</p>
												<Button size="sm" className="mt-2 h-8 rounded-lg text-[10px] font-bold px-3" onClick={handleLengkapiData}>LENGKAPI SEKARANG</Button>
											</div>
										</div>
									</motion.div>
								)}

								{completedSteps >= 2 ? (
									<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 mb-4">
										<div className="flex items-center gap-3">
											<div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white"><Check className="h-4 w-4" /></div>
											<div><p className="font-bold text-sm text-emerald-800">Grup Telegram ✓</p><p className="text-[11px] text-emerald-600">Sudah bergabung</p></div>
										</div>
									</div>
								) : (
									<motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="rounded-xl border p-3.5 mb-4">
										<div className="flex items-start gap-3">
											<div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sm sm:text-base font-black text-sky-600">2</div>
											<div className="flex-1 min-w-0">
												<p className="font-bold text-sm">Gabung Grup Telegram</p>
												<p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">Dapatkan informasi terbaru, pengumuman, dan update dari tim.</p>
												<Button variant="outline" size="sm" className="mt-2 h-8 rounded-lg text-[10px] font-bold px-3" onClick={handleGabungGrup}>GABUNG GRUP</Button>
											</div>
										</div>
									</motion.div>
								)}

								<div className="text-center">
									<button onClick={dismissOnboarding} className="text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors">Nanti Saja</button>
								</div>
							</motion.div>
						</motion.div>
					);
				})()}
			</AnimatePresence>
		</div>
	);
}
