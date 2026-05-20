import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import {
	ChevronDown,
	Copy,
	Loader2,
	X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatCurrencyIDR } from "@/lib/export-utils";
import {
	useHybridCurrentMonthProgress,
	useHybridShiftDetails,
	useHybridShiftReportRows,
	useHybridSiteSettings,
} from "@/hooks/use-hybrid-pos-data";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridStaffStatsToday } from "@/hooks/use-hybrid-attendance-data";
import {
	useHybridClockIn,
	useHybridClockOut,
} from "@/hooks/use-hybrid-write-actions";
import { useYumiAuth } from "@/hooks/useYumiAuth";

import { HomeSearchBar } from "@/components/home/home-search-bar";
import { HomeHeroOperational } from "@/components/home/home-hero-operational";
import { HomeQuickActions } from "@/components/home/home-quick-actions";
import { HomeServiceGrid } from "@/components/home/home-service-grid";
import { HomeStickyStrip } from "@/components/home/home-sticky-strip";
import { HomeRepeatUsage } from "@/components/home/home-repeat-usage";
import { HomeBottomNav } from "@/components/home/home-bottom-nav";

const FaceRecognition = lazy(() =>
	import("@/components/auth/FaceRecognition").then((m) => ({
		default: m.FaceRecognition,
	}))
);

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

function buildShiftSummaryText(shift: ShiftRow, details: any) {
	const topProducts = details?.topProducts ?? [];
	const productBreakdown = details?.productBreakdown ?? [];
	const expenseBreakdown = details?.expenseBreakdown ?? [];
	const teamLabel = shift.teamMembers?.trim() ? shift.teamMembers : "-";
	const derivedTotalItems = productBreakdown.reduce(
		(acc: number, category: any) => acc + Number(category?.totalQuantity ?? 0),
		0,
	);
	const totalItems = shift.totalItemsSold > 0 ? shift.totalItemsSold : derivedTotalItems;
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
		`Produk Terjual: ${totalItems}`,
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
	const { user, role: userRole } = useYumiAuth();
	const settings = useHybridSiteSettings();
	const storeName = settings?.storeName || "Yumi POS";
	const shiftRowsResult = useHybridShiftReportRows() as ShiftRow[] | null | undefined;
	const shiftRows = useMemo(() => {
		const raw = Array.isArray(shiftRowsResult) ? shiftRowsResult : [];
		// Deduplicate by (shiftName, date) — keep latest startTime
		const seen = new Map<string, ShiftRow>();
		for (const row of raw) {
			const dateKey = new Date(row.startTime).toLocaleDateString("id-ID");
			const dedupKey = `${row.shiftName}::${dateKey}`;
			const existing = seen.get(dedupKey);
			if (!existing || row.startTime > existing.startTime) {
				seen.set(dedupKey, row);
			}
		}
		return Array.from(seen.values()).sort((a, b) => b.startTime - a.startTime);
	}, [shiftRowsResult]);
	const statsToday = useHybridStaffStatsToday(user?._id);
	const monthProgress = useHybridCurrentMonthProgress();
	const clockIn = useHybridClockIn();
	const clockOut = useHybridClockOut();

	const [showFaceModal, setShowFaceModal] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);

	const [currentTime, setCurrentTime] = useState(new Date());
	const [searchQuery, setSearchQuery] = useState("");
	const [shiftExpanded, setShiftExpanded] = useState(false);

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

	const handleAvatarClick = () => {
		const to = user?.slug ? (`/karyawan/${user.slug}` as any) : ("/attendance" as any);
		navigate({ to });
	};

	const hasWorking = !!statsToday?.isWorking;

	const activeShiftName = activeShiftInfo?.name ?? "—";
	const activeShiftTime =
		activeShiftInfo?.openTime && activeShiftInfo?.closeTime
			? `${activeShiftInfo.openTime}–${activeShiftInfo.closeTime}`
			: "";

	return (
		<div className="app-page min-h-app text-foreground pb-safe-with-nav">
			<div className="mx-auto w-full max-w-md px-4 pb-8 pt-4 md:max-w-4xl">
				{/* 1. Search Bar */}
				<HomeSearchBar
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					userSlug={user?.slug}
					userName={user?.name}
				/>

				{/* 2. Hero Operational — universal (staff & admin) */}
				<HomeHeroOperational
					greeting={greeting}
					firstName={firstName}
					storeName={storeName}
					dateText={dateText}
					isWorking={hasWorking}
					hasFaceDescriptor={hasFaceDescriptor}
					workDurationLabel={workDurationLabel}
					shiftPct={shiftPct}
					activeShiftName={activeShiftName}
					activeShiftTime={activeShiftTime}
					userRoleName={userRole?.name || "Staff"}
				primaryActionTitle={primaryActionTitle}
				isProcessing={isProcessing}
					onPrimaryAction={handlePrimaryAttendanceAction}
					onAvatarClick={handleAvatarClick}
				/>

				{/* 3. Quick Actions */}
				<section className="mb-5">
					<HomeQuickActions userSlug={user?.slug} />
				</section>

				{/* 4. Service Grid */}
				<section className="mb-5">
					<div className="flex items-center gap-2 mb-3">
						<h2 className="app-overline">Fitur Lainnya</h2>
					</div>
					<HomeServiceGrid permissions={userRole?.permissions} />
				</section>

				{/* 5. Contextual Strip */}
				<div className="mb-5">
					<HomeStickyStrip
						hasFaceDescriptor={hasFaceDescriptor}
						isWorking={statsToday?.isWorking}
					/>
				</div>

				{/* 6. Repeat Usage */}
				<div className="mb-5">
					<HomeRepeatUsage />
				</div>

				{/* 7. Shift Summary — foldable */}
				<section id="shift-summary" className="app-card mb-5 overflow-hidden">
					<button
						type="button"
						onClick={() => setShiftExpanded(!shiftExpanded)}
						className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-muted/30"
					>
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
								Ringkasan Shift
							</p>
							<p className="mt-0.5 text-sm font-medium text-muted-foreground">
								Lihat, salin & kirim laporan shift
							</p>
						</div>
						<ChevronDown
							className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
								shiftExpanded ? "rotate-180" : ""
							}`}
						/>
					</button>

					{shiftExpanded && (
						<div className="border-t border-border px-4 pb-4 pt-4">
							{/* Action buttons row */}
							<div className="flex flex-wrap items-start justify-between gap-3 mb-4">
								<div>
									<p className="font-bold text-base text-foreground">
										Ringkasan Per Shift
									</p>
									<p className="text-xs text-muted-foreground">
										Format laporan siap copy paste.
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										disabled={!summaryText}
										onClick={async () => {
											if (!summaryText) return;
											await navigator.clipboard.writeText(summaryText);
											toast.success("Ringkasan shift berhasil disalin"); triggerHybridRefresh();
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
													toast.success("Ringkasan shift berhasil dikirim ke Telegram!"); triggerHybridRefresh();
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
										Telegram
									</button>
								</div>
							</div>

							{shiftRowsResult === undefined ? (
								<div className="py-8 text-sm text-muted-foreground">
									Memuat data shift...
								</div>
							) : shiftRows.length === 0 ? (
								<div className="py-8 text-sm text-muted-foreground">
									Belum ada data shift.
								</div>
							) : (
								<div className="space-y-4">
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
					)}
				</section>

				{/* Footer */}
				<div className="text-center text-[11px] font-semibold text-muted-foreground pb-4">
					Tap satu tombol untuk langsung pindah ke halaman kerja.
				</div>
			</div>

			{/* Face Recognition Modal */}
			<AnimatePresence>
				{showFaceModal && (
					<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-2 backdrop-blur-md">
						<motion.div
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.9 }}
							className="relative w-full max-w-sm md:max-w-lg overflow-hidden rounded-2xl bg-card shadow-2xl"
						>
							<div className="absolute top-3 right-3 z-10">
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setShowFaceModal(false)}
									className="h-8 w-8 rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-md transition-all"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>

							<div className="p-3">
								<Suspense fallback={<div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
									<FaceRecognition
										mode="verify"
										onVerify={async (descriptor) => {
											if (isProcessing) return;
											setIsProcessing(true);
											const toastId = toast.loading(statsToday?.isWorking ? "Proses Clock Out..." : "Proses Clock In...");
											try {
												const location = await getCurrentLocation();
												if (statsToday?.isWorking) {
													// Check if role needs stock opname
													const roleName = (userRole?.name || "").toLowerCase();
													const needsOpname = roleName.includes("bar") || roleName.includes("kitchen");
													if (needsOpname) {
														const opnameRole = roleName.includes("bar") ? "bar" : "kitchen";
														toast.dismiss(toastId);
														setShowFaceModal(false);
														navigate({
															to: "/attendance/stock-opname",
															search: {
																role: opnameRole,
																shiftId: selectedShift?.shiftId || "",
																shiftName: selectedShift?.shiftName || "Shift",
																userId: user!._id,
																userName: user?.name || "Staff",
																faceDescriptor: descriptor.join(","),
																location: JSON.stringify(location),
															}
														} as any);
														return;
													}
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
								</Suspense>
							</div>
						</motion.div>
					</div>
				)}
			</AnimatePresence>

			{/* Mobile Bottom Nav */}
			<HomeBottomNav />
		</div>
	);
}
