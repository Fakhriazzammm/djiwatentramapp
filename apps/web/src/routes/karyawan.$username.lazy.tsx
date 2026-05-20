import { createLazyFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
	User, 
	Lock, 
	Unlock, 
	Clock, 
	Download,
	ChevronLeft, 
	FileText, 
	TrendingUp, 
	UserCircle,
	Camera,
	ShieldCheck,
	History,
	LogOut,
	ChevronRight,
	Calendar,
	KeyRound,
	X
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { PersonalSchedule } from "@/components/attendance/PersonalSchedule";
import {
	useHybridPrivateStaffData,
	useHybridStaffBySlug,
	useHybridStaffLogs,
	useHybridStaffStats,
} from "@/hooks/use-hybrid-attendance-data";
import {
	useHybridUpdateUserPin,
	useHybridUpdateUserProfile,
} from "@/hooks/use-hybrid-write-actions";
import {
	useHybridPayslips,
} from "@/hooks/use-hybrid-payroll-data";
import { generatePayslipPDF, type PayslipData, type PayslipBreakdown } from "@/lib/payslip-pdf";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";

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

function StaffProfilePage() {
	const { username } = useParams({ from: "/karyawan/$username" as any }) as { username: string };
	const navigate = useNavigate();
	const { user: authUser, isAdmin, isAuthenticated, token } = useYumiAuth();
	const requiresPinChange = Boolean(authUser?.requiresPinChange && authUser.slug === username);
	
	const [pin, setPin] = useState("");
	const [isUnlocked, setIsUnlocked] = useState(false);
	const [isVerifying, setIsVerifying] = useState(false);
	
	const now = new Date();
	const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
	const [selectedYear, setSelectedYear] = useState(now.getFullYear());
	const [showChangePin, setShowChangePin] = useState(false);
	const [newPin, setNewPin] = useState("");
	const [oldPin, setOldPin] = useState("");
	const [isUpdatingPin, setIsUpdatingPin] = useState(false);

	const updatePinMutation = useHybridUpdateUserPin();
	const updateProfileMutation = useHybridUpdateUserProfile();

	const [isEditMode, setIsEditMode] = useState(false);
	const [showAllPayslips, setShowAllPayslips] = useState(false);
	const [editName, setEditName] = useState("");
	const [editEmail, setEditEmail] = useState("");
	const [editSlug, setEditSlug] = useState("");
	const [editOldPassword, setEditOldPassword] = useState("");
	const [editNewPassword, setEditNewPassword] = useState("");
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [editPhone, setEditPhone] = useState("");
	const [editIdentityNumber, setEditIdentityNumber] = useState("");
	const [editAddress, setEditAddress] = useState("");
	const [editBirthDate, setEditBirthDate] = useState("");
	const [editPlaceOfBirth, setEditPlaceOfBirth] = useState("");
	const [editEmergencyContactName, setEditEmergencyContactName] = useState("");
	const [editEmergencyContactPhone, setEditEmergencyContactPhone] = useState("");

	// Auto-unlock if current user is the owner or an admin
	useEffect(() => {
		if (isAuthenticated && authUser) {
			const isOwner = authUser.slug === username;
			if (isOwner || isAdmin) {
				setIsUnlocked(true);
			}
			if (isOwner && authUser.requiresPinChange) {
				setShowChangePin(true);
			}
		}
	}, [isAuthenticated, authUser, isAdmin, username]);
	
	const staff = useHybridStaffBySlug(username);
	const stats = useHybridStaffStats(
		isUnlocked && staff
			? { userId: staff._id, month: selectedMonth, year: selectedYear }
			: undefined
	);

	const logs = useHybridStaffLogs(
		isUnlocked && staff
			? { userId: staff._id, month: selectedMonth, year: selectedYear }
			: undefined
	);

	const privateData = useHybridPrivateStaffData(
		isUnlocked && staff ? { slug: username, token } : undefined
	);

	const myPayslips = useHybridPayslips(
		isUnlocked && staff
			? { userId: staff._id }
			: undefined
	);

	const settings = useHybridSiteSettings() as any;
	const storeName = settings?.storeName || "TENTREM KOFFIE";
	const storeAddress = settings?.storeAddress || "";
	useEffect(() => {
		if (staff && isUnlocked) {
			setEditName(staff.name || "");
			setEditSlug(staff.slug || "");
		}
		if (privateData && isUnlocked) {
			setEditEmail(privateData.username || "");
			const raw = (privateData as any).raw ?? {};
			setEditPhone(raw.phone || "");
			setEditIdentityNumber(raw.identityNumber || "");
			setEditAddress(raw.address || "");
			setEditBirthDate(raw.birthDate || "");
			setEditPlaceOfBirth(raw.placeOfBirth || "");
			setEditEmergencyContactName(raw.emergencyContactName || "");
			setEditEmergencyContactPhone(raw.emergencyContactPhone || "");
		}
	}, [staff, privateData, isUnlocked]);

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
			toast.error(`Gagal mengunduh PDF: ${e.message}`);
		}
	}, [storeName, storeAddress]);

	if (staff === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
					<Clock className="h-8 w-8 text-primary opacity-50" />
				</motion.div>
			</div>
		);
	}

	if (staff === null) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
				<div className="mb-6 rounded-full bg-destructive/10 p-6 text-destructive">
					<UserCircle className="h-16 w-16" />
				</div>
				<h2 className="mb-2 text-2xl font-bold">Profil Tidak Ditemukan</h2>
				<p className="mb-8 text-muted-foreground">Staff dengan username "{username}" tidak terdaftar atau nonaktif.</p>
				<Button onClick={() => navigate({ to: "/attendance" as any })}>Kembali ke Portal</Button>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Navigation Header */}
			<header className="sticky top-0 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur-md">
				<div className="mx-auto flex max-w-2xl items-center justify-between">
					<Button onClick={() => navigate({ to: "/attendance" as any })} variant="ghost" size="sm">
						<ChevronLeft className="mr-1 h-4 w-4" />
						Portal Absen
					</Button>
					<div className="flex items-center gap-2">
						<ShieldCheck className={`h-4 w-4 ${isUnlocked ? "text-emerald-500" : "text-muted-foreground"}`} />
						<span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							{isUnlocked ? "Private Access" : "Data Restricted"}
						</span>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-2xl px-4 py-8 pb-24">
				<AnimatePresence mode="wait">
					{!isUnlocked ? (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95 }}
							key="locked"
							className="space-y-10"
						>
							{/* Header Profile */}
							<div className="flex flex-col items-center text-center">
								<div className="relative mb-4">
									<div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-3xl font-black text-primary shadow-inner">
										{staff.name.charAt(0)}
									</div>
									<div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-lg">
										<Lock className="h-4 w-4" />
									</div>
								</div>
								<h1 className="text-2xl font-black tracking-tight">{staff.name}</h1>
								<p className="mt-0.5 font-bold text-primary uppercase tracking-wider text-xs">{staff.roleName}</p>
							</div>

							{/* Access Restriction View */}
							<div className="mx-auto max-w-[320px] space-y-6 text-center">
								<div className="space-y-1">
									<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Akses Terbatas</p>
									<p className="text-xs text-muted-foreground">Detail riwayat absen & slip gaji hanya dapat dilihat setelah login.</p>
								</div>
								
								<div className="pt-2 space-y-2.5">
									<Button 
										className="h-12 w-full rounded-xl text-base font-bold shadow-lg shadow-primary/20"
										onClick={() => navigate({ to: "/login" as any })}
									>
										MASUK KE SISTEM
									</Button>
									
									<Button 
										variant="outline" 
										className="h-12 w-full rounded-xl border-dashed border-primary/30 font-bold text-sm"
										onClick={() => (navigate as any)({ to: "/attendance" })}
									>
										<Camera className="mr-2 h-4 w-4" />
										LANGSUNG ABSENSI
									</Button>
								</div>
							</div>
						</motion.div>
					) : (
						<motion.div
							initial={{ opacity: 0, scale: 1.05 }}
							animate={{ opacity: 1, scale: 1 }}
							key="unlocked"
							className="space-y-8"
						>
							{/* Header Unlocked */}
							<div className="flex items-center gap-4 rounded-2xl bg-primary/5 p-4 border border-primary/10">
								<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary text-2xl font-black text-primary-foreground shadow-lg">
									{staff.name.charAt(0)}
								</div>
								<div className="flex-1">
									<h1 className="text-xl font-black tracking-tight">{staff.name}</h1>
									<p className="font-bold text-primary text-[10px] uppercase">{staff.roleName}</p>
									<p className="text-[10px] text-muted-foreground leading-none">{privateData?.username}</p>
								</div>
								<Button variant="ghost" size="icon" onClick={() => setIsUnlocked(false)} className="rounded-lg h-8 w-8">
									<LogOut className="h-4 w-4 text-muted-foreground" />
								</Button>
							</div>

							{/* Period Selector */}
							<div className="flex items-center justify-between gap-3 px-2">
								<div className="flex items-center gap-2">
									<Calendar className="h-4 w-4 text-primary" />
									<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Periode</span>
								</div>
								<div className="flex items-center gap-2">
									<select 
										className="bg-transparent text-sm font-black focus:outline-none"
										value={selectedMonth}
										onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
									>
										{MONTHS.map((m, i) => (
											<option key={m} value={i + 1}>{m}</option>
										))}
									</select>
									<select 
										className="bg-transparent text-sm font-black focus:outline-none"
										value={selectedYear}
										onChange={(e) => setSelectedYear(parseInt(e.target.value))}
									>
										{[2024, 2025, 2026].map(y => (
											<option key={y} value={y}>{y}</option>
										))}
									</select>
								</div>
							</div>

							{/* Dashboard Grid */}
							<div className="grid grid-cols-2 gap-3">
								<div className="rounded-2xl border bg-card p-4 shadow-sm">
									<div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
										<Clock className="h-4 w-4" />
									</div>
									<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Total Jam</p>
									<p className="mt-0.5 text-xl font-black">{stats?.totalHours ?? 0} <span className="text-[10px] font-normal text-muted-foreground">jam</span></p>
									<p className="text-[9px] text-orange-600 font-bold">{MONTHS[selectedMonth - 1]} {selectedYear}</p>
								</div>
								<div className="rounded-2xl border bg-card p-4 shadow-sm">
									<div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
										<TrendingUp className="h-4 w-4" />
									</div>
									<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Kehadiran</p>
									<p className="mt-0.5 text-xl font-black">{stats?.attendanceRate ?? 0}%</p>
									<p className="text-[9px] text-emerald-600 font-bold">
										{stats ? (stats.attendanceRate > 90 ? "Sangat Baik" : "Baik") : "..."}
									</p>
								</div>
							</div>

							{/* Personal Schedule */}
							{isUnlocked && staff && (
								<PersonalSchedule
									userId={staff._id}
									month={selectedMonth}
									year={selectedYear}
								/>
							)}

							{/* Slip Gaji Section */}
							<div className="space-y-4">
								<div className="flex items-center justify-between px-2">
									<h3 className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm">
										<FileText className="h-4 w-4 text-primary" />
										Slip Gaji {showAllPayslips ? "" : "Terakhir"}
									</h3>
									{myPayslips && myPayslips.length > 3 && (
										<Button
											variant="link"
											size="sm"
											className="text-xs"
											onClick={() => setShowAllPayslips(!showAllPayslips)}
										>
											{showAllPayslips ? "Sembunyikan" : "Lihat Semua"}
										</Button>
									)}
								</div>
								<div className="space-y-2">
									{!myPayslips ? (
										// Loading skeleton
										<>
											{[1, 2, 3].map((i) => (
												<div
													key={i}
													className="flex animate-pulse items-center justify-between rounded-xl border bg-card p-3"
												>
													<div className="flex items-center gap-3">
														<div className="h-9 w-9 rounded-lg bg-muted" />
														<div className="space-y-1.5">
															<div className="h-3 w-32 rounded bg-muted" />
															<div className="h-2.5 w-20 rounded bg-muted" />
														</div>
													</div>
												</div>
											))}
										</>
									) : myPayslips.length === 0 ? (
										// Empty state
										<div className="rounded-xl border bg-card p-6 text-center">
											<FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
											<p className="text-xs font-medium text-muted-foreground">Belum ada slip gaji</p>
										</div>
									) : (
										// Payslip list
										(myPayslips as any[])
											.slice(0, showAllPayslips ? undefined : 3)
											.map((payslip: any) => {
										const statusBadge = ({
											generated: { label: "Generated", cls: "bg-gray-100 text-gray-600" },
											sent: { label: "Dikirim", cls: "bg-blue-100 text-blue-600" },
											acknowledged: { label: "Diterima", cls: "bg-emerald-100 text-emerald-600" },
											disputed: { label: "Dispute", cls: "bg-red-100 text-red-600" },
										} as any)[payslip.status] ?? { label: payslip.status, cls: "bg-gray-100 text-gray-600" };

												return (
													<div
														key={payslip.id}
														className="group flex items-center justify-between rounded-xl border bg-card p-3 transition-all hover:border-primary/30 hover:bg-primary/[0.02]"
													>
														<div className="flex items-center gap-3 min-w-0">
															<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
																<FileText className="h-4 w-4" />
															</div>
															<div className="min-w-0">
																<p className="truncate font-bold text-xs">{payslip.period_name}</p>
																<p className="text-[10px] font-semibold text-muted-foreground">
																	{formatCurrency(payslip.net_pay)}
																</p>
															</div>
														</div>
														<div className="flex items-center gap-2 shrink-0">
														<span className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusBadge.cls}`}>
																{statusBadge.label}
															</span>
															<Button
																variant="ghost"
																size="icon"
																className="rounded-lg h-8 w-8"
																onClick={() => handleDownloadPayslip(payslip)}
															>
																<Download className="h-4 w-4" />
															</Button>
														</div>
													</div>
												);
											})
									)}
								</div>
							</div>

							{/* Riwayat Absensi */}
							<div className="space-y-4">
								<h3 className="flex items-center gap-2 px-2 font-bold uppercase tracking-wider text-sm">
									<History className="h-4 w-4 text-primary" />
									Log Kehadiran {MONTHS[selectedMonth - 1]} {selectedYear}
								</h3>
								<div className="rounded-2xl border bg-card overflow-hidden">
									{!logs || logs.length === 0 ? (
										<div className="p-8 text-center text-xs text-muted-foreground">
											Tidak ada data absensi untuk periode ini.
										</div>
									) : (
										<div className="divide-y divide-border">
											{logs.map((log: any) => (
												<div key={log._id} className="flex items-center justify-between p-3 text-sm">
													<div className="flex items-center gap-2.5">
														<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[10px] font-bold flex-col leading-tight shrink-0">
															<span>{new Date(log.timestamp).getDate()}</span>
															<span className="text-[8px] opacity-60">{MONTHS[new Date(log.timestamp).getMonth()].substring(0, 3).toUpperCase()}</span>
														</div>
														<div>
															<p className="font-bold capitalize text-xs">{log.type === "check_in" ? "Masuk" : "Keluar"}</p>
															<p className="text-[10px] text-muted-foreground mt-0.5">
																{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
															</p>
														</div>
													</div>
													<div className="text-right">
														<div className={`flex items-center gap-1.5 font-bold text-[10px] ${log.type === "check_in" ? "text-emerald-600" : "text-orange-600"}`}>
															<div className={`h-1.5 w-1.5 rounded-full ${log.type === "check_in" ? "bg-emerald-500" : "bg-orange-500"}`} />
															{log.type === "check_in" ? "MASUK" : "KELUAR"}
														</div>
														{log.notes && <p className="text-[9px] text-muted-foreground truncate max-w-[80px] mt-0.5">{log.notes}</p>}
													</div>
												</div>
											))}
										</div>
									)}
								</div>
							</div>

							{/* Incomplete data badge */}
							{isUnlocked && privateData?.raw && (
								(() => {
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
												<Button variant="outline" size="sm" className="shrink-0 rounded-lg font-bold text-[10px] h-8 px-3 border-amber-300 text-amber-800 hover:bg-amber-100" onClick={() => setIsEditMode(true)}>
													EDIT NOW
												</Button>
											</div>
										</div>
									);
								})()
							)}

							{/* Account Settings */}
							<div className="space-y-4">
								<div className="flex items-center justify-between px-2">
									<h3 className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm">
										<User className="h-4 w-4 text-primary" />
										Data Pribadi
									</h3>
									<Button 
										variant="ghost" 
										size="sm" 
										className="text-xs font-bold"
										onClick={() => setIsEditMode(!isEditMode)}
									>
										{isEditMode ? "BATAL" : "EDIT PROFIL"}
									</Button>
								</div>
								
								<div className="rounded-2xl border bg-card p-4 space-y-4">
									{!isEditMode ? (
										<div className="space-y-3">
											<div className="flex justify-between items-center text-xs">
												<span className="text-muted-foreground font-medium">Nama Lengkap</span>
												<span className="font-bold">{staff.name}</span>
											</div>
											<div className="flex justify-between items-center text-xs">
												<span className="text-muted-foreground font-medium">Email / Username</span>
												<span className="font-bold">{privateData?.username || "---"}</span>
											</div>
											<div className="flex justify-between items-center text-xs">
												<span className="text-muted-foreground font-medium">Username Profil</span>
												<span className="font-bold">@{staff.slug}</span>
											</div>
											<div className="flex justify-between items-center text-xs">
												<span className="text-muted-foreground font-medium">No HP / WA</span>
												<span className="font-bold">{privateData?.raw?.phone || "---"}</span>
											</div>
											<div className="flex justify-between items-center text-xs">
												<span className="text-muted-foreground font-medium">No Identitas (KTP)</span>
												<span className="font-bold">{privateData?.raw?.identityNumber || "---"}</span>
											</div>
											<div className="flex justify-between items-center text-xs">
												<span className="text-muted-foreground font-medium">Tempat, Tgl Lahir</span>
												<span className="font-bold">{[privateData?.raw?.placeOfBirth, privateData?.raw?.birthDate].filter(Boolean).join(", ") || "---"}</span>
											</div>
											<div className="flex justify-between items-center text-xs">
												<span className="text-muted-foreground font-medium">Alamat</span>
												<span className="font-bold max-w-[180px] truncate">{privateData?.raw?.address || "---"}</span>
											</div>
											<div className="flex justify-between items-center text-xs">
												<span className="text-muted-foreground font-medium">Kontak Darurat</span>
												<span className="font-bold text-right max-w-[180px]">{privateData?.raw?.emergencyContactName ? `${privateData.raw.emergencyContactName} (${privateData.raw.emergencyContactPhone || "-"})` : "---"}</span>
											</div>
										</div>
									) : (
										<form 
											className="space-y-3"
											onSubmit={async (e) => {
												e.preventDefault();
												if (!token) return;
												
												setIsSavingProfile(true);
												try {
													await updateProfileMutation({
														token,
														name: editName !== staff?.name ? editName : undefined,
														username: editEmail !== privateData?.username ? editEmail : undefined,
														slug: editSlug !== staff?.slug ? editSlug : undefined,
														password: editNewPassword || undefined,
														oldPassword: editNewPassword ? editOldPassword : undefined,
														phone: editPhone || undefined,
														identityNumber: editIdentityNumber || undefined,
														address: editAddress || undefined,
														birthDate: editBirthDate || undefined,
														placeOfBirth: editPlaceOfBirth || undefined,
														emergencyContactName: editEmergencyContactName || undefined,
														emergencyContactPhone: editEmergencyContactPhone || undefined,
													});
													
													toast.success("Profil berhasil diperbarui!");
													setIsEditMode(false);
													setEditOldPassword("");
													setEditNewPassword("");
													
													if (editSlug !== username) {
														navigate({ to: `/karyawan/${editSlug}` as any, replace: true });
													}
												} catch (err: any) {
													toast.error(err.message || "Gagal memperbarui profil");
												} finally {
													setIsSavingProfile(false);
												}
											}}
										>
											<div className="space-y-2.5">
												<div className="space-y-1">
													<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Nama Lengkap</label>
													<Input 
														value={editName}
														onChange={(e) => setEditName(e.target.value)}
														className="h-10 rounded-xl font-bold text-xs"
														placeholder="Nama Lengkap"
													/>
												</div>
												<div className="space-y-1">
													<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Email / Username</label>
													<Input 
														value={editEmail}
														onChange={(e) => setEditEmail(e.target.value)}
														className="h-10 rounded-xl font-bold text-xs"
														placeholder="email@example.com"
													/>
												</div>
												<div className="space-y-1">
													<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Username Profil (Slug)</label>
													<Input 
														value={editSlug}
														onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
														className="h-10 rounded-xl font-bold text-xs"
														placeholder="username-profil"
													/>
												</div>

												<div className="pt-2 border-t mt-2 space-y-2.5">
													<p className="text-[9px] font-black text-primary uppercase ml-1">Data Tambahan</p>
													<div className="space-y-1">
														<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">No HP / WA</label>
														<Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Contoh: 08123456789" />
													</div>
													<div className="space-y-1">
														<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">No Identitas (KTP)</label>
														<Input value={editIdentityNumber} onChange={(e) => setEditIdentityNumber(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="KTP / SIM" />
													</div>
													<div className="space-y-1">
														<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Tempat Lahir</label>
														<Input value={editPlaceOfBirth} onChange={(e) => setEditPlaceOfBirth(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Contoh: Jakarta" />
													</div>
													<div className="space-y-1">
														<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Tanggal Lahir</label>
														<Input value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="YYYY-MM-DD" />
													</div>
													<div className="space-y-1">
														<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Alamat</label>
														<Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Alamat lengkap" />
													</div>
													<div className="space-y-1">
														<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Kontak Darurat (Nama)</label>
														<Input value={editEmergencyContactName} onChange={(e) => setEditEmergencyContactName(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="Nama kontak darurat" />
													</div>
													<div className="space-y-1">
														<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Kontak Darurat (No HP)</label>
														<Input value={editEmergencyContactPhone} onChange={(e) => setEditEmergencyContactPhone(e.target.value)} className="h-10 rounded-xl font-bold text-xs" placeholder="No HP kontak darurat" />
													</div>
												</div>

												<div className="pt-2 border-t mt-2 space-y-2.5">
													<p className="text-[9px] font-black text-primary uppercase ml-1">Ubah Password (Opsional)</p>
													<div className="space-y-1">
														<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Password Lama</label>
														<Input 
															type="password"
															value={editOldPassword}
															onChange={(e) => setEditOldPassword(e.target.value)}
															className="h-10 rounded-xl font-bold text-xs"
															placeholder="Ketik password lama"
														/>
													</div>
													<div className="space-y-1">
														<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Password Baru</label>
														<Input 
															type="password"
															value={editNewPassword}
															onChange={(e) => setEditNewPassword(e.target.value)}
															className="h-10 rounded-xl font-bold text-xs"
															placeholder="Minimal 6 karakter"
														/>
													</div>
												</div>
											</div>

											<div className="pt-2">
												<Button 
													type="submit" 
													className="w-full h-10 rounded-xl font-bold shadow-md text-xs"
													disabled={isSavingProfile}
												>
													{isSavingProfile ? <Clock className="h-4 w-4 animate-spin" /> : "SIMPAN PERUBAHAN"}
												</Button>
											</div>
										</form>
									)}
								</div>
							</div>

							{/* Account Settings */}
							<div className="space-y-4">
								<h3 className="flex items-center gap-2 px-2 font-bold uppercase tracking-wider text-sm">
									<ShieldCheck className="h-4 w-4 text-primary" />
									Pengaturan Akun
								</h3>
								<div className="rounded-2xl border bg-card p-3 space-y-3">
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
										<Button 
											variant="outline" 
											size="sm" 
											className="rounded-lg font-bold text-[10px] h-8 px-3"
											onClick={() => setShowChangePin(!showChangePin)}
										>
											{showChangePin ? "BATAL" : requiresPinChange ? "GANTI SEKARANG" : "UBAH PIN"}
										</Button>
									</div>

									<AnimatePresence>
										{showChangePin && (
											<motion.div
												initial={{ height: 0, opacity: 0 }}
												animate={{ height: "auto", opacity: 1 }}
												exit={{ height: 0, opacity: 0 }}
												className="overflow-hidden border-t pt-3"
											>
												<form 
													className="space-y-3"
													onSubmit={async (e) => {
														e.preventDefault();
														if (newPin.length !== 6 || oldPin.length !== 6) {
															toast.error("PIN harus 6 digit");
															return;
														}
														if (newPin === "696969") {
															toast.error("PIN baru tidak boleh sama dengan PIN default");
															return;
														}
														setIsUpdatingPin(true);
														try {
															await updatePinMutation({
																token: token!,
																oldPin,
																newPin
															});
															toast.success("PIN berhasil diperbarui!");
															setShowChangePin(false);
															setNewPin("");
															setOldPin("");
														} catch (err) {
															toast.error((err as any).message || "Gagal memperbarui PIN");
														} finally {
															setIsUpdatingPin(false);
														}
													}}
												>
													<div className="grid grid-cols-2 gap-3">
														<div className="space-y-1">
															<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">PIN Lama</label>
															<Input 
																type="password"
																maxLength={6}
																value={oldPin}
																onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))}
																className="h-10 rounded-xl text-center font-bold tracking-widest text-xs"
																placeholder="••••••"
															/>
														</div>
														<div className="space-y-1">
															<label className="text-[9px] font-black text-muted-foreground uppercase ml-1">PIN Baru</label>
															<Input 
																type="password"
																maxLength={6}
																value={newPin}
																onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
																className="h-10 rounded-xl text-center font-bold tracking-widest text-xs"
																placeholder="••••••"
															/>
														</div>
													</div>
													<Button 
														type="submit" 
														className="w-full h-10 rounded-xl font-bold text-xs"
														disabled={isUpdatingPin || newPin.length !== 6 || oldPin.length !== 6}
													>
														{isUpdatingPin ? <Clock className="h-4 w-4 animate-spin" /> : "SIMPAN PIN BARU"}
													</Button>
												</form>
											</motion.div>
										)}
									</AnimatePresence>
								</div>
							</div>

							{/* Quick Action Float */}
							<div className="fixed bottom-6 left-0 right-0 px-4">
								<Button 
									className="h-14 w-full max-w-2xl mx-auto rounded-2xl text-base font-black shadow-2xl shadow-primary/40 flex items-center justify-center gap-2"
									onClick={() => navigate({ to: "/attendance" as any })}
								>
									<Camera className="h-5 w-5" />
									ABSENSI SEKARANG
								</Button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</main>

			<Footer className="mt-6 pb-6" />
		</div>
	);
}

export const Route = createLazyFileRoute("/karyawan/$username" as any)({
	component: StaffProfilePage,
});
