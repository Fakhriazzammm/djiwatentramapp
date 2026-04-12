import { createLazyFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { api } from "@yumipos/backend/convex/_generated/api";
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
	Calendar
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

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

	// Auto-unlock if current user is the owner or an admin
	useEffect(() => {
		if (isAuthenticated && authUser) {
			const isOwner = authUser.slug === username;
			if (isOwner || isAdmin) {
				setIsUnlocked(true);
			}
		}
	}, [isAuthenticated, authUser, isAdmin, username]);
	
	const staff = useQuery(api.users.getUserBySlug, { slug: username });
	const stats = useQuery(api.attendance.getStaffStats, 
		(isUnlocked && staff) ? { userId: staff._id, month: selectedMonth, year: selectedYear } : undefined
	);

	const logs = useQuery(api.attendance.getStaffLogs, 
		(isUnlocked && staff) ? { userId: staff._id, month: selectedMonth, year: selectedYear } : undefined
	);
	
	const privateData = useQuery(api.users.getPrivateStaffData, 
		(isUnlocked && staff) ? { slug: username, token: token } : undefined
	);

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
			<header className="sticky top-0 z-10 border-b bg-background/80 px-4 py-3 backdrop-blur-md">
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

			<main className="mx-auto max-w-2xl px-6 py-10 pb-24">
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
								<div className="relative mb-6">
									<div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-primary/10 text-4xl font-black text-primary shadow-inner">
										{staff.name.charAt(0)}
									</div>
									<div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-lg">
										<Lock className="h-4 w-4" />
									</div>
								</div>
								<h1 className="text-3xl font-black tracking-tight">{staff.name}</h1>
								<p className="mt-1 font-medium text-primary uppercase tracking-wider">{staff.roleName}</p>
							</div>

							{/* Access Restriction View */}
							<div className="mx-auto max-w-[320px] space-y-6 text-center">
								<div className="space-y-2">
									<p className="text-sm font-semibold">Data Pribadi Dibatasi</p>
									<p className="text-xs text-muted-foreground">Detail riwayat absen dan slip gaji hanya dapat dilihat setelah login melalui portal utama.</p>
								</div>
								
								<div className="pt-4 space-y-3">
									<Button 
										className="h-14 w-full rounded-2xl text-lg font-bold shadow-lg shadow-primary/20"
										onClick={() => navigate({ to: "/login" as any })}
									>
										MASUK KE SISTEM
									</Button>
									
									<Button 
										variant="outline" 
										className="h-14 w-full rounded-2xl border-dashed border-primary/30 font-bold"
										onClick={() => (navigate as any)({ to: "/attendance" })}
									>
										<Camera className="mr-2 h-5 w-5" />
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
							<div className="flex items-center gap-6 rounded-3xl bg-primary/5 p-6 border border-primary/10">
								<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary text-3xl font-black text-primary-foreground shadow-xl">
									{staff.name.charAt(0)}
								</div>
								<div className="flex-1">
									<h1 className="text-2xl font-black tracking-tight">{staff.name}</h1>
									<p className="font-bold text-primary text-sm uppercase">{staff.roleName}</p>
									<p className="mt-1 text-xs text-muted-foreground">{privateData?.username}</p>
								</div>
								<Button variant="ghost" size="icon" onClick={() => setIsUnlocked(false)} className="rounded-xl">
									<LogOut className="h-5 w-5 text-muted-foreground" />
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
							<div className="grid grid-cols-2 gap-4">
								<div className="rounded-3xl border bg-card p-5 shadow-sm">
									<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
										<Clock className="h-5 w-5" />
									</div>
									<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Jam</p>
									<p className="mt-1 text-2xl font-black">{stats?.totalHours ?? 0} <span className="text-sm font-normal text-muted-foreground">jam</span></p>
									<p className="mt-1 text-[10px] text-orange-600 font-bold">{MONTHS[selectedMonth - 1]} {selectedYear}</p>
								</div>
								<div className="rounded-3xl border bg-card p-5 shadow-sm">
									<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
										<TrendingUp className="h-5 w-5" />
									</div>
									<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Kehadiran</p>
									<p className="mt-1 text-2xl font-black">{stats?.attendanceRate ?? 0}%</p>
									<p className="mt-1 text-[10px] text-emerald-600 font-bold">
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
									<div className="group flex items-center justify-between rounded-2xl border bg-card p-4 transition-all hover:border-primary/30 hover:bg-primary/[0.02] opacity-50 grayscale">
										<div className="flex items-center gap-4">
											<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
												<FileText className="h-5 w-5" />
											</div>
											<div>
												<p className="font-bold text-sm">Slip Gaji {MONTHS[selectedMonth - 1]}</p>
												<p className="text-[10px] text-muted-foreground uppercase">Rp 0 (Belum dikonfigurasi)</p>
											</div>
										</div>
										<Button variant="ghost" size="icon" className="rounded-xl" disabled>
											<ChevronRight className="h-5 w-5" />
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
								<div className="rounded-3xl border bg-card overflow-hidden">
									{!logs || logs.length === 0 ? (
										<div className="p-8 text-center text-sm text-muted-foreground">
											Tidak ada data absensi untuk periode ini.
										</div>
									) : (
										<div className="divide-y divide-border">
											{logs.map((log: any) => (
												<div key={log._id} className="flex items-center justify-between p-4 text-sm">
													<div className="flex items-center gap-3">
														<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-[10px] font-bold flex-col leading-tight">
															<span>{new Date(log.timestamp).getDate()}</span>
															<span>{MONTHS[new Date(log.timestamp).getMonth()].substring(0, 3).toUpperCase()}</span>
														</div>
														<div>
															<p className="font-bold capitalize">{log.type === "check_in" ? "Masuk" : "Keluar"}</p>
															<p className="text-[10px] text-muted-foreground">
																{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
															</p>
														</div>
													</div>
													<div className="text-right">
														<div className={`flex items-center gap-1.5 font-bold text-xs ${log.type === "check_in" ? "text-emerald-600" : "text-orange-600"}`}>
															<div className={`h-1.5 w-1.5 rounded-full ${log.type === "check_in" ? "bg-emerald-500" : "bg-orange-500"}`} />
															{log.type === "check_in" ? "ABSEN MASUK" : "ABSEN KELUAR"}
														</div>
														{log.notes && <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{log.notes}</p>}
													</div>
												</div>
											))}
										</div>
									)}
								</div>
							</div>

							{/* Quick Action Float */}
							<div className="fixed bottom-6 left-0 right-0 px-6">
								<Button 
									className="h-16 w-full max-w-2xl mx-auto rounded-3xl text-lg font-black shadow-2xl shadow-primary/40 flex items-center justify-center gap-3"
									onClick={() => navigate({ to: "/attendance" as any })}
								>
									<Camera className="h-6 w-6" />
									ABSENSI SEKARANG
								</Button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</main>

			<footer className="mt-10 p-10 text-center opacity-30">
				<p className="text-[10px] font-bold tracking-[0.2em] uppercase">Djiwa Tentram Management System</p>
			</footer>
		</div>
	);
}

export const Route = createLazyFileRoute("/attendance/$username" as any)({
	component: StaffProfilePage,
});
