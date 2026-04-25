import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
	Camera,
	TrendingUp,
	Zap,
} from "lucide-react";
import { FaceRecognition } from "@/components/auth/FaceRecognition";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatCurrencyIDR } from "@/lib/export-utils";
import {
	useHybridCurrentMonthProgress,
	useHybridShiftDetails,
	useHybridShiftReportRows,
	useHybridSiteSettings,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridStaffStatsToday } from "@/hooks/use-hybrid-attendance-data";
import {
	useHybridClockIn,
	useHybridClockOut,
} from "@/hooks/use-hybrid-write-actions";
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
	const settings = useHybridSiteSettings();
	const storeName = settings?.storeName || "Yumi POS";
	const shiftRowsResult = useHybridShiftReportRows() as ShiftRow[] | null | undefined;
	const shiftRows = Array.isArray(shiftRowsResult) ? shiftRowsResult : [];
	const statsToday = useHybridStaffStatsToday(user?._id);
	const monthProgress = useHybridCurrentMonthProgress();
	const clockIn = useHybridClockIn();
	const clockOut = useHybridClockOut();
	
	const [showFaceModal, setShowFaceModal] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);

	const [currentTime, setCurrentTime] = useState(new Date());

	useEffect(() => {
		const timer = setInterval(() => {
			setCurrentTime(new Date());
		}, 1000);
		return () => clearInterval(timer);
	}, []);

	const activeShiftInfo = useMemo(() => {
		if (!settings?.shiftSettings?.shiftSchedules) return null;
		
		const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
		
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

	const dateText = useMemo(() => {
		const datePart = new Intl.DateTimeFormat("id-ID", {
			weekday: "long",
			day: "numeric",
			month: "long",
		}).format(currentTime);
		
		const timePart = currentTime.toLocaleTimeString("id-ID", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		
		return `${datePart} • ${timePart}`;
	}, [currentTime]);

	const greeting = useMemo(() => {
		const hour = currentTime.getHours();
		if (hour < 11) return "Semangat Pagi";
		if (hour < 15) return "Selamat Siang";
		if (hour < 18) return "Selamat Sore";
		return "Selamat Malam";
	}, [currentTime]);

	const [selectedShiftStart, setSelectedShiftStart] = useState<number | null>(null);

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

	const shiftDetails = useHybridShiftDetails(
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

	const hasFaceDescriptor = !!user?.hasFace;
	const workDurationLabel = `${statsToday?.totalHours ?? 0}j ${statsToday?.totalMinutes ?? 0}m`;

	const shiftPct = useMemo(() => {
		if (!monthProgress?.shiftTarget || monthProgress.shiftTarget <= 0) return null;
		return Math.round((monthProgress.shiftCollected / monthProgress.shiftTarget) * 100);
	}, [monthProgress]);

	const firstName = useMemo(() => user?.name?.split(" ")[0] ?? user?.name ?? "", [user?.name]);
	const primaryActionTitle = !hasFaceDescriptor
		? "Daftarkan Wajah"
		: statsToday?.isWorking
			? "Clock Out"
			: "Clock In";
	const primaryActionSubtitle = !hasFaceDescriptor
		? "Lengkapi verifikasi biometrik sebelum mulai absensi."
		: statsToday?.isWorking
			? "Akhiri sesi kerja."
			: "Mulai sesi kerja hari ini.";

	const handlePrimaryAttendanceAction = () => {
		if (!hasFaceDescriptor) {
			toast.info("Wajah belum terdaftar. Lengkapi dari halaman absensi tim.");
			navigate({ to: "/attendance" as any });
			return;
		}
		setShowFaceModal(true);
	};

	const getCurrentLocation = () =>
		new Promise<{ lat: number; lng: number }>((resolve, reject) => {
			if (!navigator.geolocation) {
				reject(new Error("Browser tidak mendukung geolokasi."));
				return;
			}
			navigator.geolocation.getCurrentPosition(
				(pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
				() => reject(new Error("Izin lokasi diperlukan untuk absensi.")),
				{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
			);
		});

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
				{/* Djiwa Personal Hub / Profile Card — Redesigned */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="app-card glass-strong relative mb-5 overflow-hidden"
				>
					{/* Layered gradient background */}
					<div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_30%)]" />
					{statsToday?.isWorking && (
						<div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.07),transparent_40%)]" />
					)}

					{/* ── HEADER: Avatar + Identity + Logout ── */}
					<div className="flex items-center gap-3 px-4 pt-4 pb-3">
						<Link
							to={user?.slug ? (`/attendance/${user.slug}` as any) : ("/attendance" as any)}
							className="relative shrink-0 active:scale-95 transition-transform"
						>
							<div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-primary to-sky-400 text-xl font-black text-white shadow-md">
								{user?.name?.charAt(0)?.toUpperCase()}
							</div>
							{/* Status dot */}
							<div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-[2.5px] border-card shadow-sm ${
								statsToday?.isWorking ? "bg-emerald-500" : "bg-muted-foreground/50"
							}`}>
								{statsToday?.isWorking && (
									<span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
								)}
							</div>
						</Link>

						<div className="flex-1 min-w-0">
							<p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/60 leading-none mb-0.5">
								{storeName}
							</p>
							<h2 className="text-base font-black tracking-tight text-foreground leading-tight truncate">
								{greeting}, {firstName}
							</h2>
							<div className="flex flex-wrap items-center gap-1.5 mt-1">
								<span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-primary">
									{userRole?.name || "Staff"}
								</span>
								<span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] transition-colors ${
									statsToday?.isWorking
										? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
										: "bg-muted/80 text-muted-foreground"
								}`}>
									<span className={`h-1.5 w-1.5 rounded-full ${statsToday?.isWorking ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
									{statsToday?.isWorking ? "Bertugas" : "Off Duty"}
								</span>
							</div>
						</div>

						<button
							onClick={handleLogout}
							type="button"
							className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground/70 transition-all hover:bg-destructive/10 hover:text-destructive active:scale-90"
						>
							<LogOut className="h-3.5 w-3.5" />
						</button>
					</div>

					{/* Face ID warning strip */}
					{!hasFaceDescriptor && (
						<motion.div
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-2"
						>
							<Camera className="h-3.5 w-3.5 text-sky-600 shrink-0" />
							<p className="text-[10px] font-bold text-sky-700 dark:text-sky-400">
								Face ID belum aktif — lengkapi untuk akses absensi.
							</p>
						</motion.div>
					)}

					{/* ── STATS: 3-column ── */}
					<div className="mx-4 grid grid-cols-3 divide-x divide-border/40 rounded-2xl border border-border/50 bg-background/60 shadow-sm overflow-hidden">
						{/* Hari ini */}
						<div className="px-3 py-2.5">
							<p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground leading-none">
								Hari Ini
							</p>
							<p className="mt-1.5 text-base font-black text-foreground leading-none">
								{workDurationLabel}
							</p>
							<p className="mt-0.5 text-[9px] text-muted-foreground/60">total kerja</p>
						</div>

						{/* Shift */}
						<div className="px-3 py-2.5">
							<p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground leading-none">
								Shift
							</p>
							<p className="mt-1.5 text-sm font-black text-foreground leading-none line-clamp-1">
								{activeShiftInfo ? activeShiftInfo.name : "—"}
							</p>
							{activeShiftInfo?.openTime && activeShiftInfo?.closeTime ? (
								<p className="mt-0.5 text-[9px] text-muted-foreground/60">
									{activeShiftInfo.openTime}–{activeShiftInfo.closeTime}
								</p>
							) : (
								<p className="mt-0.5 text-[9px] text-muted-foreground/60">belum ada</p>
							)}
						</div>

						{/* Target shift */}
						<div className="px-3 py-2.5">
							<p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground leading-none">
								Target
							</p>
							{shiftPct !== null ? (
								<>
									<p className={`mt-1.5 text-base font-black leading-none ${shiftPct >= 100 ? "text-emerald-600" : "text-foreground"}`}>
										{shiftPct}%
									</p>
									<div className="mt-1.5 h-1 w-full rounded-full bg-muted/50 overflow-hidden">
										<motion.div
											className={`h-full rounded-full ${shiftPct >= 100 ? "bg-emerald-500" : shiftPct >= 70 ? "bg-amber-500" : "bg-primary"}`}
											initial={{ width: 0 }}
											animate={{ width: `${Math.min(100, shiftPct)}%` }}
											transition={{ duration: 0.8, ease: "easeOut" }}
										/>
									</div>
								</>
							) : (
								<>
									<p className="mt-1.5 text-sm font-black text-muted-foreground/40 leading-none">—</p>
									<p className="mt-0.5 text-[9px] text-muted-foreground/40">no target</p>
								</>
							)}
						</div>
					</div>

					{/* ── ACTION AREA ── */}
					<div className="px-4 pb-4 pt-3 space-y-2">
						{/* Live datetime */}
						<p className="text-center text-[10px] text-muted-foreground/60 font-medium tracking-wide">
							{dateText}
						</p>

						{/* Primary CTA: Clock In / Out */}
						{(!hasFaceDescriptor || statsToday?.isWorking !== undefined) && (
							<motion.button
								whileTap={{ scale: 0.97 }}
								onClick={handlePrimaryAttendanceAction}
								disabled={isProcessing}
								type="button"
								className={`w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-left shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-70 active:shadow-sm ${
									!hasFaceDescriptor
										? "bg-sky-500 text-white hover:bg-sky-600"
										: statsToday?.isWorking
											? "bg-amber-500 text-amber-950 hover:bg-amber-400"
											: "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
								}`}
							>
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shrink-0">
										{isProcessing ? (
											<Loader2 className="h-5 w-5 animate-spin" />
										) : !hasFaceDescriptor ? (
											<Camera className="h-5 w-5" />
										) : statsToday?.isWorking ? (
											<Square className="h-5 w-5 fill-current" />
										) : (
											<Play className="h-5 w-5 fill-current" />
										)}
									</div>
									<div>
										<p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 leading-none">
											{!hasFaceDescriptor ? "Setup" : "Sesi Kerja"}
										</p>
										<p className="mt-0.5 text-base font-black leading-tight">{primaryActionTitle}</p>
									</div>
								</div>
								<div className="flex items-center gap-1 shrink-0">
									{statsToday?.isWorking && (
										<span className="text-[10px] font-bold opacity-70 mr-1">{workDurationLabel}</span>
									)}
									<ArrowRight className="h-5 w-5" />
								</div>
							</motion.button>
						)}

						{/* Secondary actions */}
						<div className="grid grid-cols-2 gap-2">
							<Link
								to={user?.slug ? (`/attendance/${user.slug}` as any) : ("/attendance" as any)}
								className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/70 py-2.5 text-[11px] font-bold text-foreground transition-all hover:bg-muted active:scale-95"
							>
								<User className="h-3.5 w-3.5 text-muted-foreground" />
								Profil Saya
							</Link>
							<Link
								to={"/attendance" as any}
								className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/70 py-2.5 text-[11px] font-bold text-foreground transition-all hover:bg-muted active:scale-95"
							>
								<History className="h-3.5 w-3.5 text-muted-foreground" />
								Absensi Tim
							</Link>
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
										onVerify={async (descriptor) => {
											if (isProcessing) return;
											setIsProcessing(true);
											const toastId = toast.loading(statsToday?.isWorking ? "Proses Clock Out..." : "Proses Clock In...");
											try {
												const location = await getCurrentLocation();
												if (statsToday?.isWorking) {
													await clockOut({
														userId: user!._id,
														faceDescriptor: descriptor,
														location,
													});
													toast.success("Berhasil Clock Out", { id: toastId });
												} else {
													await clockIn({
														userId: user!._id,
														faceDescriptor: descriptor,
														location,
													});
													toast.success("Berhasil Clock In", { id: toastId });
												}
												setShowFaceModal(false);
											} catch (err: any) {
												toast.error(err?.message || "Gagal memproses absensi", { id: toastId });
												throw err;
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
						<button
							type="button"
							disabled={!summaryText}
							onClick={async () => {
								if (!summaryText) return;
								try {
									const { sendTelegramReport } = await import("@/lib/telegram-report");
									const result = await sendTelegramReport(summaryText);
									if (result.ok) {
										toast.success("Ringkasan shift berhasil dikirim ke Telegram!");
									} else {
										toast.error(result.error || "Gagal mengirim ke Telegram");
									}
								} catch (err: any) {
									toast.error(err?.message || "Gagal mengirim ke Telegram");
								}
							}}
							className="inline-flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-500/10 hover:text-blue-700 disabled:opacity-50"
						>
							<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
							Kirim ke Telegram
						</button>
					</div>

					{shiftRowsResult === undefined ? (
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
