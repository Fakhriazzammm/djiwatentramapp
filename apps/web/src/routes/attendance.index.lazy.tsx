import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { FaceRecognition, preloadFaceModels } from "@/components/auth/FaceRecognition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
	Coffee, 
	ArrowLeft, 
	KeyRound, 
	Loader2, 
	UserCheck, 
	MapPin,
	AlertCircle,
	CheckCircle2,
	Clock,
	Navigation,
	CalendarClock,
	RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import {
	useHybridCurrentlyInStore,
	useHybridPublicUsers,
} from "@/hooks/use-hybrid-attendance-data";
import {
	useHybridClockIn,
	useHybridClockOut,
	useHybridEnrollFace,
	useHybridVerifyHomePin,
} from "@/hooks/use-hybrid-write-actions";
import { useYumiAuth } from "@/hooks/useYumiAuth";

// Helper for distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
	const R = 6371e3; // metres
	const phi1 = (lat1 * Math.PI) / 180;
	const phi2 = (lat2 * Math.PI) / 180;
	const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
	const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

	const a =
		Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
		Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c; // in metres
}

function AttendancePage() {
	const navigate = useNavigate();
	const [step, setStep] = useState<"select" | "pin" | "face" | "success">("select");
	const [refreshCount, setRefreshCount] = useState(0);
	const { user: authUser, isAuthenticated, role: authRole } = useYumiAuth();
	
	const [pin, setPin] = useState("");
	const [user, setUser] = useState<{ id: string; name: string; hasFace?: boolean; isCurrentlyIn?: boolean; roleName?: string } | null>(null);
	const [isEnrolling, setIsEnrolling] = useState(false);
	const [isVerifyingPin, setIsVerifyingPin] = useState(false);
	
	// Geolocation State
	const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [locationLoading, setLocationLoading] = useState(false);

	// Data Queries/Mutations
	const siteSettings = useHybridSiteSettings();
	const allStaff = useHybridPublicUsers();
	const currentlyIn = useHybridCurrentlyInStore(refreshCount);

	const verifyPin = useHybridVerifyHomePin();
	const enrollFace = useHybridEnrollFace();
	const clockIn = useHybridClockIn();
	const clockOut = useHybridClockOut();

	// Shift Detection based on local device time
	const shiftSchedules = siteSettings?.shiftSettings?.shiftSchedules || [];

	const detectedShift = useMemo(() => {
		if (!shiftSchedules.length) return null;

		const now = new Date();
		const currentMinutes = now.getHours() * 60 + now.getMinutes();

		// Try to find current shift (time is within openTime-closeTime range)
		for (const schedule of shiftSchedules) {
			if (!schedule.openTime || !schedule.closeTime) continue;
			const [oH, oM] = schedule.openTime.split(":").map(Number);
			const [cH, cM] = schedule.closeTime.split(":").map(Number);
			const openMin = oH * 60 + oM;
			const closeMin = cH * 60 + cM;

			if (openMin <= closeMin) {
				// Same day shift (e.g. 07:00 - 15:00)
				if (currentMinutes >= openMin && currentMinutes < closeMin) {
					return schedule;
				}
			} else {
				// Overnight shift (e.g. 22:00 - 06:00)
				if (currentMinutes >= openMin || currentMinutes < closeMin) {
					return schedule;
				}
			}
		}

		// No active shift found - find nearest upcoming shift
		let nearest: typeof shiftSchedules[number] | null = null;
		let minDiff = Infinity;

		for (const schedule of shiftSchedules) {
			if (!schedule.openTime) continue;
			const [oH, oM] = schedule.openTime.split(":").map(Number);
			const openMin = oH * 60 + oM;
			let diff = openMin - currentMinutes;
			if (diff < 0) diff += 24 * 60; // wrap around midnight
			if (diff < minDiff) {
				minDiff = diff;
				nearest = schedule;
			}
		}

		return nearest ? { ...nearest, upcoming: true } : null;
	}, [shiftSchedules]);

	const isShiftActive = useMemo(() => {
		if (!detectedShift) return false;
		return !(detectedShift as any).upcoming;
	}, [detectedShift]);

	// Check if user is in-store radius
	const distance = useMemo(() => {
		if (!userLocation || !siteSettings?.attendanceLat || !siteSettings?.attendanceLng) return null;
		return calculateDistance(
			userLocation.lat,
			userLocation.lng,
			siteSettings.attendanceLat,
			siteSettings.attendanceLng
		);
	}, [userLocation, siteSettings]);

	const isInRadius = useMemo(() => {
		if (distance === null) return false;
		return distance <= (siteSettings?.attendanceRadius ?? 50);
	}, [distance, siteSettings]);

	const attendanceLocation = useMemo(() => {
		if (!userLocation) return undefined;
		return { lat: userLocation.lat, lng: userLocation.lng };
	}, [userLocation]);

	// Lokasi: single-shot getCurrentPosition — gak perlu continuous GPS
	const fetchLocation = useCallback(() => {
		if (!navigator.geolocation) {
			setLocationError("Browser tidak mendukung geolokasi.");
			return;
		}
		setLocationLoading(true);
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
				setLocationError(null);
				setLocationLoading(false);
			},
			(err) => {
				// Coba sekali lagi setelah error (kadang GPS butuh warmup)
				if (err.code === err.POSITION_UNAVAILABLE) {
					setTimeout(() => {
						navigator.geolocation.getCurrentPosition(
							(pos2) => {
								setUserLocation({ lat: pos2.coords.latitude, lng: pos2.coords.longitude });
								setLocationError(null);
								setLocationLoading(false);
							},
							(err2) => {
								setLocationError("Izin lokasi diperlukan untuk absensi.");
								console.error(err2);
								setLocationLoading(false);
							},
							{ enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
						);
					}, 2000);
				} else {
					setLocationError("Izin lokasi diperlukan untuk absensi.");
					console.error(err);
					setLocationLoading(false);
				}
			},
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
		);
	}, []);

	// Single shot on mount — gak perlu watchPosition (sumber utama lag)
	useEffect(() => {
		fetchLocation();
	}, [fetchLocation]);

		// Auto-select if authenticated (hanya jalankan sekali pas mount)
		const autoSelectedRef = useRef(false);
		useEffect(() => {
			if (isAuthenticated && authUser && step === "select" && !autoSelectedRef.current) {
				autoSelectedRef.current = true;
				const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === authUser._id);
				const staffFromList = allStaff?.find((s: any) => s._id === authUser._id);
				setUser({
					id: authUser._id,
					name: authUser.name,
					hasFace: !!authUser.hasFace,
					isCurrentlyIn,
					roleName: authRole?.name || staffFromList?.roleName || "",
				});
				if (authUser.hasFace) {
					setIsEnrolling(false);
					setStep("face");
				} else {
					setIsEnrolling(true);
					setStep("pin");
				}
			}
		}, [isAuthenticated, authUser, step, currentlyIn]);

	// Preload face models when user is on select step
	useEffect(() => {
		if (step === "select") preloadFaceModels();
	}, [step]);
	
	const handleUserSelect = (staff: any) => {
		const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === staff._id);
		setUser({
			id: staff._id,
			name: staff.name,
			hasFace: !!staff.hasFace,
			isCurrentlyIn,
			roleName: staff.roleName || "",
		});

		if (!staff.hasFace) {
			setStep("pin"); // Need PIN to enroll
			setIsEnrolling(true);
		} else {
			setStep("face");
			setIsEnrolling(false);
		}
	};


	const handleFaceProcessed = async (descriptor?: number[]) => {
		if (!user) return;

		try {
			// 1. Double check Geofencing before mutation
			// Bug #11: Jangan skip saat siteSettings belum load
			if (siteSettings?.attendanceLat) {
				if (!attendanceLocation) {
					toast.error("Lokasi belum siap. Aktifkan GPS lalu coba lagi.");
					return;
				}
				if (!isInRadius) {
					toast.error("Gagal: Anda berada di luar radius kafe.");
					return;
				}
			}

			// 2. If in enroll mode, save the face data first
			if (isEnrolling && descriptor) {
				toast.loading("Mendaftarkan wajah...", { id: "save-face" });
				await enrollFace({
					userId: user.id as any,
					pin: pin || undefined,
					faceDescriptor: descriptor,
					skipPinVerification: !pin,
				});
				toast.success("Wajah berhasil terdaftar!", { id: "save-face" });
				setIsEnrolling(false);
				setUser((prev) => (prev ? { ...prev, hasFace: true } : prev));
			}

			// 3. Smart Toggle: In or Out?
			toast.loading(user.isCurrentlyIn ? "Proses Keluar..." : "Proses Masuk...", { id: "clocking" });
			const verificationPayload = {
				userId: user.id as any,
				faceDescriptor: descriptor,
				pinCode: pin || undefined,
				location: attendanceLocation,
			};
			
			if (user.isCurrentlyIn) {
				// Check if this role needs stock opname before clock out
				const roleName = (user.roleName || "").toLowerCase();
				const needsOpname = roleName.includes("bar") || roleName.includes("kitchen");
				
				if (needsOpname) {
					// Save clock-out payload for opname page to complete
					const opnameRole = roleName.includes("bar") ? "bar" : "kitchen";
					sessionStorage.setItem("__clockout_payload__", JSON.stringify({
						userId: user.id,
						faceDescriptor: descriptor,
						pinCode: pin || undefined,
						location: attendanceLocation,
						role: opnameRole,
						userName: user.name,
						shiftName: detectedShift?.name || "Shift",
						shiftId: detectedShift?.id || "",
					}));
					toast.dismiss("clocking");
					navigate({ 
						to: "/attendance/stock-opname",
						search: {
							role: opnameRole,
							shiftId: detectedShift?.id || "",
							shiftName: detectedShift?.name || "Shift",
							userId: user.id,
							userName: user.name,
						}
					} as any);
					return;
				}
				
				await clockOut({
					...verificationPayload,
				});
			} else {
				await clockIn({ 
					...verificationPayload,
					shiftName: detectedShift?.name || undefined,
					shiftOpenTimeSnapshot: detectedShift?.openTime || undefined,
				});
			}
			
			toast.dismiss("clocking");
			setRefreshCount(c => c + 1);
			setStep("success");
			$
			setTimeout(() => {
				sessionStorage.setItem("__attendance_clockout__", "1");
				navigate({ to: "/home" });
			}, 3000);
		} catch (err: any) {
			toast.dismiss();
			toast.error(err?.message || "Gagal memproses absensi");
		}
	};

	const handlePinSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (pin.length !== 6) return;

		setIsVerifyingPin(true);
		try {
			// 1. Verify PIN and get user data
			const result = await verifyPin({ pinCode: pin });
			
			// 2. Security: Ensure the PIN belongs to the selected user (if one was selected)
			if (user && result.userId !== user.id) {
				toast.error("PIN ini bukan milik Anda.");
				setIsVerifyingPin(false);
				return;
			}

			// 3. If we were enrolling, move to face step
			if (isEnrolling && !user?.hasFace) {
				setStep("face");
			} else {
				// 4. Otherwise, this was a PIN fallback attendance
				await handleFaceProcessed(); // Process attendance directly
			}
		} catch (err: any) {
			toast.error(err.message || "PIN salah.");
		} finally {
			setIsVerifyingPin(false);
		}
	};

	return (
		<div className="flex min-h-screen w-full flex-col bg-background selection:bg-primary/20 pb-safe">
			{/* Header */}
			<header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-border/30 bg-background/90 px-3 backdrop-blur-lg md:h-14 md:px-6">
				<div className="flex items-center gap-2 md:gap-4">
					<div className="group relative">
						<div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-primary to-amber-500 opacity-20 blur transition duration-300 group-hover:opacity-40" />
						<div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-card text-primary shadow-sm">
							<Coffee className="h-5 w-5" />
						</div>
					</div>
					<div className="min-w-0">
						<h1 className="text-sm md:text-base font-bold tracking-tight">Absensi</h1>
					</div>
				</div>

				<div className="flex items-center gap-2 md:gap-4">

					{/* Status Lokasi Chip */}
					{locationLoading ? (
						<div className="hidden sm:flex items-center gap-2 rounded-full px-4 py-1.5 border text-xs font-bold bg-amber-50 border-amber-100 text-amber-700 transition-all">
							<Loader2 className="h-4 w-4 animate-spin" />
							Mendeteksi Lokasi...
						</div>
					) : (
						<div className={`hidden sm:flex items-center gap-2 rounded-full px-4 py-1.5 border text-xs font-bold transition-all ${
							isInRadius ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-700"
						}`}>
							{isInRadius ? <CheckCircle2 className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
							{isInRadius ? "Dalam Area Kafe" : "Luar Jangkauan"}
						</div>
					)}
					{!locationLoading && (
						<button onClick={fetchLocation} className="hidden sm:flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/50 transition-colors" title="Refresh lokasi">
							<RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
						</button>
					)}

					<Button 
						onClick={() => navigate({ to: "/home" })} 
						variant="ghost" 
						size="sm"
						className="rounded-xl px-2.5 hover:bg-muted/50 md:px-3"
					>
						<ArrowLeft className="h-4 w-4" />
						<span className="hidden md:inline">Dashboard</span>
					</Button>
				</div>
			</header>

			<main className="flex flex-1 flex-col p-3 md:p-6">
				<AnimatePresence mode="wait">
					{step === "select" && (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -20 }}
							key="select-step"
							className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6"
						>
							{/* Left: User Selection Grid */}
							<div className="space-y-4 lg:col-span-8 lg:space-y-6">
								<div className="space-y-2">
									<h2 className="text-base font-bold tracking-tight">Pilih nama</h2>
									<p className="text-[11px] font-semibold text-muted-foreground">Pilih nama Anda untuk melanjutkan.</p>
								</div>

								{!allStaff ? (
									<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 md:gap-3">
										{Array.from({ length: 8 }).map((_, i) => (
											<div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
										))}
									</div>
								) : (
									<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 md:gap-3">
										{allStaff.map((staff: any) => {
											const isIn = currentlyIn?.some((s: any) => s._id === staff._id);
											return (
												<motion.button
													whileHover={{ scale: 1.02 }}
													whileTap={{ scale: 0.97 }}
													key={staff._id}
													onClick={() => handleUserSelect(staff)}
													className={`group relative aspect-square rounded-xl border-2 p-3 text-center transition-all duration-200 ${
														isIn 
														? "bg-emerald-50/30 border-emerald-500/20 hover:border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.05)]" 
														: "bg-card border-border/50 hover:border-primary shadow-sm"
													}`}
												>
													<div className="flex flex-col items-center gap-2 h-full justify-center">
														<div className="relative">
															<div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm md:h-12 md:w-12 md:text-base transition-all duration-200 ${
																isIn ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-white"
															}`}>
																{staff.name.charAt(0)}
															</div>
															{isIn && (
																<div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border-2 border-emerald-500 flex items-center justify-center">
																	<div className="h-2 w-2 rounded-full bg-emerald-500" />
																</div>
															)}
														</div>
														<div className="space-y-1">
															<p className="font-bold text-foreground text-[10px] leading-tight line-clamp-2 uppercase tracking-tight md:text-xs">
																{staff.name}
															</p>
															<div className="flex flex-col items-center gap-1">
																<p className={`text-[9px] font-bold uppercase tracking-widest ${isIn ? "text-emerald-600" : "text-muted-foreground/60"}`}>
																	{isIn ? "BERTUGAS" : "OFF Duty"}
																</p>
																<div className={`mt-0.5 rounded-full px-2 py-0.5 text-[7px] font-bold uppercase tracking-tighter text-white transition-all ${
																	isIn ? "bg-amber-500 group-hover:bg-amber-600" : "bg-primary group-hover:bg-primary/80"
																}`}>
																	{isIn ? "Klik untuk Keluar" : "Klik untuk Masuk"}
																</div>
															</div>
														</div>
													</div>
												</motion.button>
											);
										})}
									</div>
								)}
							</div>

							{/* Right: Live Status Board */}
							<div className="lg:col-span-4">
								<div className="space-y-3 lg:sticky lg:top-28 lg:space-y-4">
									<div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-4 shadow-lg">
										<div className="relative space-y-3 md:space-y-4">
											<div className="flex items-center gap-2">
												<div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
													<Clock className="h-4 w-4" />
												</div>
												<div>
													<h3 className="font-bold text-sm leading-none">Tim Bertugas</h3>
													<p className="text-[9px] text-muted-foreground font-bold mt-0.5 uppercase tracking-widest">Live Status Dashboard</p>
												</div>
											</div>

											<div className="space-y-3 md:space-y-4">
												{!currentlyIn ? (
													Array.from({ length: 3 }).map((_, i) => (
														<div key={i} className="h-10 w-full bg-muted/30 rounded-xl animate-pulse" />
													))
												) : currentlyIn.length === 0 ? (
													<div className="py-8 text-center space-y-2">
														<div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
															<UserCheck className="h-6 w-6" />
														</div>
														<p className="text-sm text-muted-foreground font-medium">Belum ada staff yang masuk.</p>
													</div>
												) : (
													currentlyIn.map((staff: any) => (
														<div key={staff._id} className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 border border-emerald-100/50 group/item hover:bg-emerald-50 transition-colors">
															<div className="flex items-center gap-2">
																<div className="h-8 w-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold">
																	{staff.name.charAt(0)}
																</div>
																<div className="space-y-0.5">
																	<p className="font-bold text-xs text-foreground">{staff.name}</p>
																	<p className="text-[10px] text-emerald-600 font-bold">
																		Masuk sejak {new Date(staff.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
																	</p>
																</div>
															</div>
															<div className="h-2 w-2 rounded-full bg-emerald-500" />
														</div>
													))
												)}
											</div>
										</div>
									</div>

									{/* Shift Info Card */}
									{detectedShift && (
										<div className={`rounded-2xl border p-3 ${
											isShiftActive 
												? "bg-blue-50/50 border-blue-100/50" 
												: "bg-amber-50/50 border-amber-100/50"
										}`}>
											<div className="flex items-center gap-2 mb-2">
												<div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
													isShiftActive ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"
												}`}>
													<CalendarClock className="h-4 w-4" />
												</div>
												<div>
													<p className="font-bold text-xs leading-none">{detectedShift.name}</p>
													<p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${
														isShiftActive ? "text-blue-600" : "text-amber-600"
													}`}>
														{isShiftActive ? "Shift Aktif Sekarang" : "Shift Berikutnya"}
													</p>
												</div>
											</div>
											{detectedShift.openTime && detectedShift.closeTime && (
												<div className="flex items-center gap-2 mt-2 text-xs">
													<Clock className="h-3.5 w-3.5 text-muted-foreground" />
													<span className="font-bold">{detectedShift.openTime} — {detectedShift.closeTime}</span>
												</div>
											)}
										</div>
									)}

									{/* Geofencing Warning for Select Step */}
									{!isInRadius && siteSettings?.attendanceLat && (
										<div className="flex gap-3 rounded-xl border border-red-100 bg-red-50 p-3">
											<div className="h-8 w-8 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
												<AlertCircle className="h-4 w-4" />
											</div>
											<div className="space-y-1">
												<p className="font-bold text-xs text-red-900">Peringatan Jarak</p>
												<p className="text-xs text-red-700 leading-relaxed">
													Anda terdeteksi di luar area kafe. Absensi hanya dapat dilakukan dalam jarak <strong>{siteSettings.attendanceRadius}m</strong> dari lokasi.
												</p>
											</div>
										</div>
									)}
								</div>
							</div>
						</motion.div>
					)}


					{step === "pin" && (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -20 }}
							key="pin-step"
							className="mx-auto w-full max-w-sm space-y-4"
						>
							<div className="space-y-4 text-center">
								<div className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
									<KeyRound className="h-6 w-6" />
								</div>
								<div className="space-y-2">
									<h2 className="text-xl font-bold tracking-tight md:text-2xl">Masukkan PIN</h2>
									<p className="text-xs text-muted-foreground">{isEnrolling ? `Halo ${user?.name}, masukkan PIN untuk mendaftarkan wajah.` : 'Masukkan PIN 6 digit.'}</p>
								</div>

								<form className="space-y-4" onSubmit={handlePinSubmit}>
									<div className="relative">
										<Input
											autoFocus
											className="h-14 rounded-xl border-2 pl-3 text-center text-xl font-bold tracking-[0.4em] transition-all focus:border-primary focus:ring-4 focus:ring-primary/5 md:text-2xl"
											maxLength={6}
											onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
											placeholder="••••••"
											type="password"
											value={pin}
										/>
									</div>
									<div className="grid grid-cols-2 gap-2">
										<Button 
											type="button" 
											variant="outline" 
											className="h-12 rounded-xl font-bold"
											onClick={() => { setStep("select"); setPin(""); }}
										>
											KEMBALI
										</Button>
										<Button 
											className="h-10 md:h-12 rounded-xl text-sm md:text-base font-bold" 
											disabled={pin.length !== 6 || isVerifyingPin} 
											type="submit"
										>
											{isVerifyingPin ? <Loader2 className="h-6 w-6 animate-spin" /> : "LANJUT"}
										</Button>
									</div>
								</form>
							</div>
						</motion.div>
					)}

					{step === "face" && (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -20 }}
							key="face-step"
							className="mx-auto w-full max-w-sm md:max-w-md lg:max-w-lg space-y-3"
						>
							<div className="flex items-center justify-between gap-2">
								<div className="space-y-1 min-w-0">
									<h2 className={`text-base font-bold tracking-tight ${
										isEnrolling ? "text-foreground" : (user?.isCurrentlyIn ? "text-amber-500" : "text-emerald-500")
									}`}>
										{isEnrolling 
											? "Daftar Wajah" 
											: (user?.isCurrentlyIn ? "Absen Keluar" : "Absen Masuk")
										}
									</h2>
									<p className="text-[11px] font-semibold text-muted-foreground truncate">
										<span className="text-foreground">{user?.name}</span>
										{detectedShift && !user?.isCurrentlyIn && (
											<span className="text-muted-foreground/60"> — {detectedShift.name}</span>
										)}
									</p>
								</div>
								<div className="flex items-center gap-1.5 shrink-0">
									{detectedShift && !user?.isCurrentlyIn && (
										<div className={`flex items-center gap-1 rounded-full px-2 py-1 border text-[9px] font-bold ${
											isShiftActive 
												? "bg-blue-50 border-blue-200 text-blue-700" 
												: "bg-amber-50 border-amber-200 text-amber-700"
										}`}>
											<CalendarClock className="h-3 w-3" />
											{detectedShift.name}
										</div>
									)}
									<div className={`flex items-center gap-1 rounded-full px-2 py-1 border text-[9px] font-bold uppercase tracking-wider ${
										isInRadius ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
									}`}>
										<div className={`h-1.5 w-1.5 rounded-full ${isInRadius ? "bg-emerald-500" : "bg-red-500"}`} />
										{isInRadius ? "Dalam Area" : "Luar Area"}
									</div>
								</div>
							</div>

							<div className="relative group">
								{!isInRadius && siteSettings?.attendanceLat ? (
									<div className="flex aspect-[4/3] w-full flex-col items-center justify-center space-y-3 rounded-xl bg-muted p-4 text-center">
										<div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-red-100 text-red-600">
											<Navigation className="h-7 w-7 animate-bounce" />
										</div>
										<div className="space-y-2">
											<p className="font-bold text-red-900">DI LUAR AREA KERJA</p>
											<p className="text-xs text-red-700">Akses diblokir. Harap berada di dalam jangkauan kafe untuk melakukan absensi.</p>
										</div>
										<Button onClick={() => setStep("select")} variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50">
											Pilih User Lain
										</Button>
									</div>
								) : !isEnrolling && !user?.hasFace ? (
									<div className="flex aspect-[4/3] w-full flex-col items-center justify-center space-y-3 rounded-xl bg-muted p-4 text-center">
										<div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-amber-100 text-amber-600">
											<AlertCircle className="h-7 w-7" />
										</div>
										<div className="space-y-2">
											<p className="font-bold text-amber-900">DATA WAJAH BELUM TERSEDIA</p>
											<p className="text-xs text-amber-700">Silakan lanjut dengan PIN lalu daftar ulang wajah agar absensi otomatis kembali aktif.</p>
										</div>
										<Button
											onClick={() => setStep("pin")}
											variant="outline"
											className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"
										>
											<KeyRound className="mr-2 h-4 w-4" />
											Lanjut Dengan PIN
										</Button>
									</div>
								) : (
									<FaceRecognition
										mode={isEnrolling ? "enroll" : "verify"}
										onCapture={isEnrolling ? handleFaceProcessed : undefined}
										onVerify={!isEnrolling ? handleFaceProcessed : undefined}
										onModelError={() => {
											if (!isEnrolling) {
												toast.error("Gagal memuat sistem wajah. Silakan gunakan PIN.");
												setStep("pin");
											}
										}}
									/>
								)}
							</div>

								<div className="flex flex-col gap-2">
									{!isEnrolling && (
										<Button 
											className="h-12 w-full rounded-xl font-bold text-sm shadow-md active:scale-95"
											onClick={() => {
												setStep("pin");
												toast.info(`Masukkan PIN untuk ${user?.isCurrentlyIn ? 'Keluar' : 'Masuk'} manual.`);
											}}
										>
											<KeyRound className="mr-2 h-4 w-4" />
											{user?.isCurrentlyIn ? "Absen Keluar (PIN)" : "Absen Masuk (PIN)"}
										</Button>
									)}
									
									<div className="flex items-center gap-2">
										{!isEnrolling && (
											<Button 
												className="h-10 flex-1 rounded-xl font-bold text-[11px]"
												variant="secondary"
												onClick={() => {
													setIsEnrolling(true);
													setStep("face");
												}}
											>
												Daftar Ulang Wajah
											</Button>
										)}
										<Button 
											className="h-10 flex-1 rounded-xl text-[11px]" 
											onClick={() => {
												setStep("select");
												setIsEnrolling(false);
											}} 
											variant="outline"
										>
											Ganti Identitas
										</Button>
									</div>
								</div>
						</motion.div>
					)}

					{step === "success" && (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							key="success-step"
							className="max-w-md mx-auto w-full"
						>
							<div className="flex flex-col items-center space-y-5 text-center bg-card border border-border/50 rounded-2xl p-6 shadow-lg relative overflow-hidden">
										
								<motion.div
									className="relative"
									initial={{ scale: 0 }}
									animate={{ scale: 1 }}
									transition={{ duration: 0.3 }}
								>
												<div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
										<UserCheck className="h-12 w-12" />
									</div>
								</motion.div>

								<motion.div
									className="space-y-3"
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.3 }}
								>
									<div className="flex justify-center">
										<div className={`rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] shadow-sm ${
											user?.isCurrentlyIn 
												? "bg-amber-100 text-amber-600 border border-amber-200 text-center" 
												: "bg-emerald-100 text-emerald-600 border border-emerald-200 text-center"
										}`}>
											{user?.isCurrentlyIn ? "Berhasil Absen Keluar" : "Berhasil Absen Masuk"}
										</div>
									</div>
									<h2 className="text-2xl font-bold text-emerald-600">Berhasil!</h2>
									<p className="text-sm font-semibold text-center">
										{user?.isCurrentlyIn ? "Sudah diabsen keluar. Hati-hati di jalan!" : "Berhasil diabsen masuk. Semangat!"}
									</p>
									<p className="text-xs text-muted-foreground">
										{user?.name} — {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
										{detectedShift && !user?.isCurrentlyIn && (
											<span className="block text-xs mt-1">
												Shift: <span className="font-bold">{detectedShift.name}</span> ({detectedShift.openTime}{detectedShift.closeTime ? `-${detectedShift.closeTime}` : ""})
											</span>
										)}
									</p>
								</motion.div>

								<motion.div
									className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-4 py-3 w-full"
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.3 }}
								>
									<Loader2 className="h-4 w-4 animate-spin text-primary" />
									<p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none">Mengalihkan ke Dashboard...</p>
								</motion.div>

							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</main>

		</div>
	);
}

export const Route = createLazyFileRoute("/attendance/" as any)({
	component: AttendancePage,
});