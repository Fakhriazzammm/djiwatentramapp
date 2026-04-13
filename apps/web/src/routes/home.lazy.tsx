import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
	Beer,
	BookOpen,
	Bot,
	Calendar,
	ChefHat,
	ChevronsRight,
	ClipboardList,
	Copy,
	Croissant,
	LockKeyhole,
	Loader2,
	LogOut,
	Package,
	Receipt,
	ShieldCheck,
	Sparkles,
	Tags,
	User,
	UserCheck,
	UtensilsCrossed,
	Clock,
	X,
	KeyRound,
	Play,
	Square,
	ArrowRight,
	History,
	ExternalLink,
	Users,
	AlertCircle,
	Camera
} from "lucide-react";
import { FaceRecognition } from "@/components/auth/FaceRecognition";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { useYumiAuth } from "@/hooks/useYumiAuth";

type RoleMenuItem = {
	to: string;
	label: string;
	subtitle: string;
	icon: any;
	tone: string;
};

type ShiftRow = {
	shiftId: string;
	shiftName: string;
	cashierName: string;
	teamMembers: string;
	startTime: number;
	endTime?: number;
	status: "SELESAI" | "AKTIF";
	startingCash: number;
	cashRevenue: number;
	qrisRevenue: number;
	otherRevenue: number;
	totalGrossSales: number;
	totalDiscount: number;
	totalRevenue: number;
	totalExpenses: number;
	totalItemsSold: number;
	orderCount: number;
	bookingCount: number;
	hasTarget?: boolean;
	shiftTarget?: number;
	shiftCollected?: number;
	dailyTarget?: number;
	dailyCollected?: number;
	isShiftTargetMet?: boolean;
	isDailyTargetMet?: boolean;
};

const ROLE_SECTIONS: ReadonlyArray<{
	role: string;
	description: string;
	items: ReadonlyArray<RoleMenuItem>;
}> = [
	{
		role: "Kasir",
		description: "Checkout cepat & kendali layanan customer",
		items: [
			{
				to: "/menu",
				label: "POS Kasir",
				subtitle: "Mulai transaksi",
				icon: Receipt,
				tone: "from-rose-500 to-orange-400",
			},
			{
				to: "/admin/orders",
				label: "Pesanan",
				subtitle: "Monitor order",
				icon: ClipboardList,
				tone: "from-blue-500 to-cyan-400",
			},
			{
				to: "/admin/customer-service",
				label: "Layanan",
				subtitle: "Komplain & bantuan",
				icon: ShieldCheck,
				tone: "from-emerald-500 to-teal-400",
			},
			{
				to: "/admin/discounts",
				label: "Promo",
				subtitle: "Voucher & diskon",
				icon: Tags,
				tone: "from-fuchsia-500 to-pink-500",
			},
			{
				to: "/admin/booking",
				label: "Booking",
				subtitle: "Reservasi meja",
				icon: Calendar,
				tone: "from-violet-500 to-indigo-500",
			},
		],
	},
	{
		role: "Barista",
		description: "Antrian minuman, status racik, dan stok bar",
		items: [
			{
				to: "/admin/bar",
				label: "Antrian Bar",
				subtitle: "Order minuman",
				icon: Beer,
				tone: "from-indigo-500 to-blue-500",
			},
			{
				to: "/admin/bar",
				label: "Stok Bar",
				subtitle: "Kontrol bahan bar",
				icon: Croissant,
				tone: "from-cyan-500 to-sky-400",
			},
			{
				to: "/admin/products",
				label: "Menu Bar",
				subtitle: "Kelola item minuman",
				icon: Package,
				tone: "from-slate-600 to-slate-500",
			},
		],
	},
	{
		role: "Kitchen",
		description: "Antrian dapur, produksi, dan stok bahan",
		items: [
			{
				to: "/admin/kitchen",
				label: "Antrian Dapur",
				subtitle: "Pesanan masuk",
				icon: ChefHat,
				tone: "from-orange-500 to-amber-400",
			},
			{
				to: "/admin/kitchen",
				label: "Stok Dapur",
				subtitle: "Pantau bahan",
				icon: UtensilsCrossed,
				tone: "from-amber-600 to-yellow-500",
			},
			{
				to: "/admin/products",
				label: "Menu Dapur",
				subtitle: "Kelola produk",
				icon: Package,
				tone: "from-lime-600 to-green-500",
			},
		],
	},
] as const;

function formatDate(timestamp: number) {
	return new Date(timestamp).toLocaleDateString("id-ID", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

function formatTime(timestamp?: number) {
	if (!timestamp) return "Aktif";
	return new Date(timestamp).toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getHomeAdminEntryState(to: string) {
	return to.startsWith("/admin")
		? (prev: Record<string, unknown> = {}) => ({
				...prev,
				fromHomeEntry: true,
		  })
		: undefined;
}

function buildShiftSummaryText(shift: ShiftRow, details: any) {
	const topProducts = details?.topProducts ?? [];
	const productBreakdown = details?.productBreakdown ?? [];
	const expenseBreakdown = details?.expenseBreakdown ?? [];
	const teamLabel = shift.teamMembers?.trim() ? shift.teamMembers : "-";
	const lines: string[] = [
		"Daily Revenue Report",
		"Djiwa Tentram Cafe & Resto",
		`Tanggal: ${formatDate(shift.startTime)}`,
		"",
		`${shift.shiftName} (${shift.status})`,
		`Modal Kasir: ${formatCurrencyIDR(shift.startingCash)}`,
		`Tunai: ${formatCurrencyIDR(shift.cashRevenue)}`,
		`Debit/QRIS: ${formatCurrencyIDR(shift.qrisRevenue)}`,
		`Lainnya: ${formatCurrencyIDR(shift.otherRevenue)}`,
		"",
		`Total Penjualan Bruto: ${formatCurrencyIDR(shift.totalGrossSales)}`,
		`Total Potongan (Diskon): ${formatCurrencyIDR(shift.totalDiscount)}`,
		`Total Revenue Bersih: ${formatCurrencyIDR(shift.totalRevenue)}`,
		"",
		`Produk Terjual: ${shift.totalItemsSold}`,
		"Rincian Produk:",
	];

	if (productBreakdown.length > 0) {
		for (const category of productBreakdown) {
			lines.push(`- ${category.categoryName} (${category.totalQuantity})`);
			for (const item of category.items) {
				lines.push(`  - ${item.productName}: ${item.quantity}`);
			}
		}
	} else {
		lines.push("-");
	}

	lines.push("");
	lines.push("TOP 3 PRODUK TERLARIS:");
	if (topProducts.length > 0) {
		for (const item of topProducts) {
			lines.push(`- ${item.productName}: ${item.quantity}`);
		}
	} else {
		lines.push("-");
	}

	lines.push("");
	if (shift.hasTarget) {
		lines.push("STATUS TARGET:");
		lines.push(
			`- Target Shift: ${formatCurrencyIDR(shift.shiftTarget ?? 0)} (${shift.isShiftTargetMet ? "Tercapai" : "Belum Tercapai"})`,
		);
		lines.push(
			`- Target Harian: ${formatCurrencyIDR(shift.dailyTarget ?? 0)} (${shift.isDailyTargetMet ? "Tercapai" : "Belum Tercapai"})`,
		);
		lines.push(
			`- Revenue Harian: ${formatCurrencyIDR(shift.dailyCollected ?? 0)}`,
		);
		lines.push("");
	}

	lines.push(`Pengeluaran Shift: ${formatCurrencyIDR(shift.totalExpenses)}`);
	if (expenseBreakdown.length > 0) {
		for (const expense of expenseBreakdown) {
			lines.push(`- ${expense.category}: ${formatCurrencyIDR(expense.amount)}`);
		}
	}

	lines.push("");
	lines.push(`Kasir: ${shift.cashierName || "-"}`);
	lines.push(`Tim: ${teamLabel}`);

	return lines.join("\n");
}

export const Route = createLazyFileRoute("/home")({
	component: HomePage,
});

function HomePage() {
	const navigate = useNavigate();
	const { user, role: userRole, logout } = useYumiAuth();
	const settings = useQuery(api.site_settings.getSettings);
	const storeName = settings?.storeName || "Yumi POS";
	const shiftRows = useQuery(api.finance.getShiftReportTable, {}) as
		| ShiftRow[]
		| undefined;
	const statsToday = useQuery(api.attendance.getStaffStatsToday, user ? { userId: user._id } : "skip");
	const clockIn = useMutation(api.attendance.clockIn);
	const clockOut = useMutation(api.attendance.clockOut);
	
	const [showFaceModal, setShowFaceModal] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [liveNow, setLiveNow] = useState(() => new Date());

	const activeShiftInfo = useMemo(() => {
		if (!settings?.shiftSettings?.shiftSchedules) return null;
		
		const now = new Date();
		const currentMinutes = now.getHours() * 60 + now.getMinutes();
		
		return settings.shiftSettings.shiftSchedules.find((s: any) => {
			if (!s.openTime || !s.closeTime) return false;
			const [openH, openM] = s.openTime.split(':').map(Number);
			const [closeH, closeM] = s.closeTime.split(':').map(Number);
			const openTotal = openH * 60 + openM;
			const closeTotal = closeH * 60 + closeM;
			
			if (closeTotal < openTotal) { // Overnight shift
				return currentMinutes >= openTotal || currentMinutes <= closeTotal;
			}
			return currentMinutes >= openTotal && currentMinutes <= closeTotal;
		});
	}, [settings]);

	const dateText = new Intl.DateTimeFormat("id-ID", {
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(new Date());

	const greeting = useMemo(() => {
		const hour = new Date().getHours();
		if (hour < 11) return "Semangat Pagi";
		if (hour < 15) return "Selamat Siang";
		if (hour < 18) return "Selamat Sore";
		return "Selamat Malam";
	}, []);

	const [selectedShiftStart, setSelectedShiftStart] = useState<number | null>(null);

	useEffect(() => {
		const timer = window.setInterval(() => {
			setLiveNow(new Date());
		}, 60_000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		if (!shiftRows?.length) {
			setSelectedShiftStart(null);
			return;
		}
		if (
			selectedShiftStart === null ||
			!shiftRows.some((row) => row.startTime === selectedShiftStart)
		) {
			setSelectedShiftStart(shiftRows[0].startTime);
		}
	}, [shiftRows, selectedShiftStart]);

	const selectedShift =
		shiftRows?.find((shift) => shift.startTime === selectedShiftStart) ??
		shiftRows?.[0];

	const shiftDetails = useQuery(
		api.finance.getShiftDetails,
		selectedShift
			? {
					startTime: selectedShift.startTime,
					endTime: selectedShift.endTime,
			  }
			: "skip",
	);

	const summaryText = useMemo(() => {
		if (!selectedShift || !shiftDetails) return "";
		return buildShiftSummaryText(selectedShift, shiftDetails);
	}, [selectedShift, shiftDetails]);

	const hasFaceDescriptor =
		Array.isArray((user as any)?.faceDescriptor) &&
		((user as any)?.faceDescriptor?.length ?? 0) > 0;
	const currentTimeText = new Intl.DateTimeFormat("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
	}).format(liveNow);
	const workDurationLabel = `${statsToday?.totalHours ?? 0}j ${statsToday?.totalMinutes ?? 0}m`;
	const primaryActionTitle = !hasFaceDescriptor
		? "Daftarkan Wajah"
		: statsToday?.isWorking
			? "Clock Out"
			: "Clock In";
	const primaryActionSubtitle = !hasFaceDescriptor
		? "Lengkapi verifikasi biometrik sebelum mulai absensi."
		: statsToday?.isWorking
			? "Akhiri sesi kerja dengan verifikasi wajah."
			: "Mulai sesi kerja dan catat kehadiran hari ini.";

	const handlePrimaryAttendanceAction = () => {
		if (!hasFaceDescriptor) {
			toast.info("Wajah belum terdaftar. Lengkapi dari halaman absensi tim.");
			navigate({ to: "/attendance" as any });
			return;
		}
		setShowFaceModal(true);
	};

	const handleSwitchAccount = async () => {
		await logout();
		navigate({ to: "/login" as any });
	};

	const handleLogout = async () => {
		try {
			await logout();
			navigate({ to: "/login" as any });
		} catch (error) {
			console.error(error);
			toast.error("Gagal melakukan proses keluar");
		}
	};

	return (
		<div className="app-page min-h-app text-foreground">
			<div className="mx-auto w-full max-w-md px-4 pb-8 pt-6 md:max-w-4xl">
				{/* Djiwa Personal Hub / Profile Card */}
				<motion.div 
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="app-card relative mb-5 overflow-hidden p-0 border-none shadow-2xl bg-[#0a0a0b]"
				>
					{/* Animated Background Mesh for Card */}
					<div className="absolute inset-0 -z-10 overflow-hidden opacity-30">
						<div className="absolute top-[-20%] left-[-10%] h-[100%] w-[50%] rounded-full bg-primary/20 blur-[80px]" />
						<div className="absolute bottom-[-20%] right-[-10%] h-[100%] w-[50%] rounded-full bg-accent/20 blur-[80px]" />
					</div>

					<div className="p-6 md:p-8">
						<div className="flex flex-col gap-6 md:flex-row md:items-center">
							{/* Personal Info & Status */}
							<div className="flex flex-1 items-center gap-5">
								<div className="relative">
									<div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-br from-primary to-primary/60 text-3xl font-black text-white shadow-xl shadow-primary/20">
										{user?.name?.charAt(0)}
									</div>
									<div className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-4 border-[#0a0a0b] ${statsToday?.isWorking ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
								</div>
								<div>
									<h2 className="text-2xl font-black tracking-tight text-white mb-1">
										{user?.name}
									</h2>
									<div className="flex flex-wrap items-center gap-2">
										<span className="inline-flex items-center rounded-lg bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-primary border border-primary/20">
											{userRole?.name || "Staff"}
										</span>
										{statsToday?.isWorking ? (
											<span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-500 whitespace-nowrap">
												<span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
												Sedang Bertugas
											</span>
										) : (
											<span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground grayscale whitespace-nowrap">
												<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
												Off Duty
											</span>
										)}
									</div>
								</div>
							</div>

							{/* Stats & Shift Info */}
							<div className="grid grid-cols-2 gap-4 md:gap-8 border-t border-white/5 pt-6 md:border-t-0 md:pt-0">
								<div className="space-y-1">
									<p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hari Ini</p>
									<p className="text-xl font-black text-white">
										{statsToday?.totalHours ?? 0}<span className="text-sm font-medium text-muted-foreground ml-1">j</span> {statsToday?.totalMinutes ?? 0}<span className="text-sm font-medium text-muted-foreground ml-1">m</span>
									</p>
									<p className="text-[10px] font-medium text-primary uppercase">Total Kerja</p>
								</div>
								<div className="space-y-1">
									<p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Shift Aktif</p>
									<p className="text-xl font-black text-white">
										{activeShiftInfo ? activeShiftInfo.name : "N/A"}
									</p>
									<p className="text-[10px] font-medium text-muted-foreground uppercase opacity-70">
										{activeShiftInfo ? `${activeShiftInfo.openTime} - ${activeShiftInfo.closeTime}` : "No Schedule"}
									</p>
								</div>
							</div>
						</div>

						{/* Quick Actions Grid */}
						<div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
							<motion.button
								whileHover={{ y: -2 }}
								whileTap={{ scale: 0.98 }}
								onClick={() => setShowFaceModal(true)}
								className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-4 transition-all shadow-lg ${
									statsToday?.isWorking 
									? "bg-amber-500 text-amber-950 shadow-amber-500/20" 
									: "bg-emerald-500 text-emerald-950 shadow-emerald-500/20"
								}`}
							>
								{statsToday?.isWorking ? <Square className="h-6 w-6" /> : <Play className="h-6 w-6" />}
								<span className="text-xs font-black uppercase tracking-widest leading-none">
									{statsToday?.isWorking ? "CLOCK OUT" : "CLOCK IN"}
								</span>
							</motion.button>

							<Link 
								to={user?.slug ? (`/attendance/${user.slug}` as any) : ("/attendance" as any)}
								className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 p-4 transition-all hover:bg-white/10"
							>
								<User className="h-6 w-6 text-white" />
								<span className="text-xs font-black uppercase tracking-widest text-white leading-none">PROFIL</span>
							</Link>

							<Link 
								to={"/login" as any}
								className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 p-4 transition-all hover:bg-white/10"
							>
								<Users className="h-6 w-6 text-white" />
								<span className="text-xs font-black uppercase tracking-widest text-white leading-none">GANTI</span>
							</Link>

							<button 
								onClick={handleLogout}
								className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-destructive/10 border border-destructive/20 p-4 transition-all hover:bg-destructive/20"
							>
								<LogOut className="h-6 w-6 text-destructive" />
								<span className="text-xs font-black uppercase tracking-widest text-destructive leading-none">KELUAR</span>
							</button>
						</div>
					</div>
				</motion.div>

				<AnimatePresence>
					{showFaceModal && (
						<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
							<motion.div 
								initial={{ opacity: 0, scale: 0.9 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.9 }}
								className="relative w-full max-w-lg overflow-hidden rounded-[2.5rem] bg-card shadow-2xl"
							>
								<div className="absolute top-6 right-6 z-10">
									<Button 
										variant="ghost" 
										size="icon" 
										onClick={() => setShowFaceModal(false)}
										className="h-12 w-12 rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-md transition-all"
									>
										<X className="h-6 w-6" />
									</Button>
								</div>
								
								<div className="p-8">
									<h2 className="text-2xl font-black tracking-tight text-center mb-6 uppercase">
										Verifikasi Wajah
									</h2>
									<FaceRecognition 
										mode="verify" 
										targetDescriptor={(user as any)?.faceDescriptor}
										onMatch={async () => {
											if (isProcessing) return;
											setIsProcessing(true);
											const toastId = toast.loading(statsToday?.isWorking ? "Proses Clock Out..." : "Proses Clock In...");
											try {
												if (statsToday?.isWorking) {
													await clockOut({ userId: user!._id });
													toast.success("Berhasil Clock Out", { id: toastId });
												} else {
													await clockIn({ userId: user!._id });
													toast.success("Berhasil Clock In", { id: toastId });
												}
												setShowFaceModal(false);
											} catch (err) {
												toast.error("Gagal memproses absensi", { id: toastId });
											} finally {
												setIsProcessing(false);
											}
										}}
									/>
								</div>
							</motion.div>
						</div>
					)}
				</AnimatePresence>

				<div className="mt-5 space-y-4">
					{ROLE_SECTIONS.map((section) => (
						<div className="app-card p-4 md:p-5" key={section.role}>
							<div className="mb-3">
								<p className="font-black text-base tracking-tight text-foreground">
									{section.role}
								</p>
								<p className="text-xs text-muted-foreground">{section.description}</p>
							</div>

							<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
								{section.items.map((item) => (
									<Link
										className="group relative overflow-hidden rounded-2xl border border-border/70 bg-background p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
										key={`${section.role}-${item.label}`}
										state={getHomeAdminEntryState(item.to) as any}
										to={item.to}
									>
										<div
											className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.tone} text-white shadow-sm`}
										>
											<item.icon className="h-5 w-5" />
										</div>
										<p className="font-bold text-[13px] leading-tight text-foreground">
											{item.label}
										</p>
										<p className="mt-1 text-[11px] text-muted-foreground">
											{item.subtitle}
										</p>
										<div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
											Buka
											<ChevronsRight className="h-3.5 w-3.5" />
										</div>
									</Link>
								))}
							</div>
						</div>
					))}
				</div>

				<div className="app-card mt-4 p-4 md:p-5">
					<p className="mb-3 font-black text-base tracking-tight text-foreground">
						Manajemen Tim
					</p>
					<div className="grid grid-cols-1 gap-3">
						<Link
							className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border-2 border-primary/20 bg-primary/5 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
							to={"/attendance" as any}
						>
							<div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110">
								<UserCheck className="h-7 w-7" />
							</div>
							<div className="flex-1">
								<p className="font-black text-lg leading-tight text-foreground">
									Absensi Tim
								</p>
								<p className="mt-1 text-xs text-muted-foreground font-medium">
									Masuk PIN & Scan Wajah untuk mulai/selesai shift
								</p>
							</div>
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-background/50 text-muted-foreground shadow-inner transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
								<ChevronsRight className="h-5 w-5" />
							</div>
						</Link>
					</div>
				</div>

				<div className="app-card mt-4 p-4 md:p-5">
					<p className="mb-3 font-black text-base tracking-tight text-foreground">
						Shortcut Umum
					</p>
					<div className="grid grid-cols-2 gap-3">
						<Link
							className="group relative overflow-hidden rounded-2xl border border-border/70 bg-background p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
							state={(prev) => ({
								...prev,
								fromHomeEntry: true,
							})}
							to="/admin/ai-chat"
						>
							<div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-sm">
								<Bot className="h-5 w-5" />
							</div>
							<p className="font-bold text-[13px] leading-tight text-foreground">
								AI Chat
							</p>
							<p className="mt-1 text-[11px] text-muted-foreground">
								Asisten operasional cepat
							</p>
							<div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
								Buka
								<ChevronsRight className="h-3.5 w-3.5" />
							</div>
						</Link>
						<Link
							className="group relative overflow-hidden rounded-2xl border border-border/70 bg-background p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
							state={(prev) => ({
								...prev,
								fromHomeEntry: true,
							})}
							to="/admin/recipe/view"
						>
							<div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-400 text-white shadow-sm">
								<BookOpen className="h-5 w-5" />
							</div>
							<p className="font-bold text-[13px] leading-tight text-foreground">
								Buku Resep
							</p>
							<p className="mt-1 text-[11px] text-muted-foreground">
								Baca resep barista & kitchen
							</p>
							<div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
								Buka
								<ChevronsRight className="h-3.5 w-3.5" />
							</div>
						</Link>
					</div>
				</div>

				<div className="app-card mt-4 px-4 py-3 text-center text-[11px] font-semibold text-muted-foreground">
					Tap satu tombol untuk langsung pindah ke halaman kerja.
				</div>

				<div className="app-card mt-4 border border-border bg-card shadow-sm">
					<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
								Ringkasan Shift Realtime
							</p>
							<h3 className="mt-1 font-bold text-lg text-foreground">
								Ringkasan Per Shift
							</h3>
							<p className="mt-1 text-sm text-muted-foreground">
								Format sama seperti di halaman laporan shift, siap copy paste.
							</p>
						</div>
						<button
							type="button"
							disabled={!summaryText}
							onClick={async () => {
								if (!summaryText) return;
								await navigator.clipboard.writeText(summaryText);
								toast.success("Ringkasan shift berhasil disalin");
							}}
							className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
						>
							<Copy className="h-3.5 w-3.5" />
							Salin
						</button>
					</div>

					{shiftRows === undefined ? (
						<div className="px-4 py-8 text-sm text-muted-foreground">
							Memuat data shift...
						</div>
					) : shiftRows.length === 0 ? (
						<div className="px-4 py-8 text-sm text-muted-foreground">
							Belum ada data shift.
						</div>
					) : (
						<div className="space-y-4 p-4">
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="space-y-1.5">
									<label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
										Pilih Shift
									</label>
									<select
										className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
										value={selectedShift?.startTime ?? ""}
										onChange={(event) =>
											setSelectedShiftStart(Number(event.target.value))
										}
									>
										{shiftRows.map((shift) => (
											<option key={shift.shiftId} value={shift.startTime}>
												{shift.shiftName} - {formatDate(shift.startTime)} (
												{shift.status})
											</option>
										))}
									</select>
								</div>
								<div className="grid gap-2 rounded-2xl border border-border bg-muted/20 p-3 text-sm">
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Kasir</span>
										<span className="font-semibold text-foreground">
											{selectedShift?.cashierName || "-"}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Durasi</span>
										<span className="font-semibold text-foreground">
											{selectedShift
												? `${formatTime(selectedShift.startTime)} - ${formatTime(selectedShift.endTime)}`
												: "-"}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Revenue Bersih</span>
										<span className="font-semibold text-primary">
											{formatCurrencyIDR(selectedShift?.totalRevenue ?? 0)}
										</span>
									</div>
								</div>
							</div>

							<div className="rounded-2xl border border-border bg-slate-950 p-3 text-slate-50 shadow-inner">
								<div className="mb-3 flex items-center justify-between">
									<h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
										Format Ringkasan
									</h4>
									<span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
										Siap salin
									</span>
								</div>
								<pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-slate-100">
									{summaryText}
								</pre>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
