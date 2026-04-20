import { createLazyFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
	User, 
	Lock, 
	Unlock, 
	Clock, 
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

const MONTHS = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function StaffProfilePage() {
	const { username } = useParams({ from: "/attendance/$username" as any }) as { username: string };
	const navigate = useNavigate();
	const { user: authUser, isAdmin, isAuthenticated, token } = useYumiAuth();
	
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
	const [editName, setEditName] = useState("");
	const [editEmail, setEditEmail] = useState("");
	const [editSlug, setEditSlug] = useState("");
	const [editOldPassword, setEditOldPassword] = useState("");
	const [editNewPassword, setEditNewPassword] = useState("");
	const [isSavingProfile, setIsSavingProfile] = useState(false);

	// Auto-unlock if current user is the owner or an admin
	useEffect(() => {
		if (isAuthenticated && authUser) {
			const isOwner = authUser.slug === username;
			if (isOwner || isAdmin) {
				setIsUnlocked(true);
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

	useEffect(() => {
		if (staff && isUnlocked) {
			setEditName(staff.name || "");
			setEditSlug(staff.slug || "");
		}
		if (privateData && isUnlocked) {
			setEditEmail(privateData.username || "");
		}
	}, [staff, privateData, isUnlocked]);

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

							{/* Slip Gaji Section */}
							<div className="space-y-4">
								<div className="flex items-center justify-between px-2">
									<h3 className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm">
										<FileText className="h-4 w-4 text-primary" />
										Slip Gaji Terakhir
									</h3>
									<Button variant="link" size="sm" className="text-xs">Lihat Semua</Button>
								</div>
								<div className="space-y-2">
									<div className="group flex items-center justify-between rounded-xl border bg-card p-3 transition-all hover:border-primary/30 hover:bg-primary/[0.02] opacity-50 grayscale">
										<div className="flex items-center gap-3">
											<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
												<FileText className="h-4 w-4" />
											</div>
											<div>
												<p className="font-bold text-xs">Slip Gaji {MONTHS[selectedMonth - 1]}</p>
												<p className="text-[9px] text-muted-foreground uppercase leading-tight">Rp 0 (Belum dikonfigurasi)</p>
											</div>
										</div>
										<Button variant="ghost" size="icon" className="rounded-lg h-8 w-8" disabled>
											<ChevronRight className="h-4 w-4" />
										</Button>
									</div>
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
													});
													
													toast.success("Profil berhasil diperbarui!");
													setIsEditMode(false);
													setEditOldPassword("");
													setEditNewPassword("");
													
													if (editSlug !== username) {
														navigate({ to: `/attendance/${editSlug}` as any, replace: true });
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
											{showChangePin ? "BATAL" : "UBAH PIN"}
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

export const Route = createLazyFileRoute("/attendance/$username" as any)({
	component: StaffProfilePage,
});
