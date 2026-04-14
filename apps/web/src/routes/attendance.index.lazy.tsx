import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@yumipos/backend/convex/_generated/api";
import { FaceRecognition } from "@/components/auth/FaceRecognition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
	Coffee, 
	ArrowLeft, 
	KeyRound, 
	Loader2, 
	UserCheck, 
	LogIn, 
	LogOut, 
	Users, 
	MapPin,
	AlertCircle,
	CheckCircle2,
	Clock,
	Navigation,
	CalendarClock
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { Footer } from "@/components/layout/Footer";

// Helper for distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
	const R = 6371e3; // metres
	const φ1 = (lat1 * Math.PI) / 180;
	const φ2 = (lat2 * Math.PI) / 180;
	const Δφ = ((lat2 - lat1) * Math.PI) / 180;
	const Δλ = ((lon2 - lon1) * Math.PI) / 180;

	const a =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c; // in metres
}

function AttendancePage() {
	const navigate = useNavigate();
	const [step, setStep] = useState<"select" | "pin" | "face" | "success">("select");
	const { user: authUser, isAuthenticated } = useYumiAuth();
	
	const [pin, setPin] = useState("");
	const [user, setUser] = useState<{ id: string; name: string; faceDescriptor?: number[]; isCurrentlyIn?: boolean } | null>(null);
	const [isEnrolling, setIsEnrolling] = useState(false);
	const [isVerifyingPin, setIsVerifyingPin] = useState(false);
	
	// Geolocation State
	const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);

	// Convex Queries/Mutations
	const siteSettings = useQuery(api.site_settings.getSettings);
	const allStaff = useQuery(api.users.getPublicUsers);
	const currentlyIn = useQuery(api.attendance.getCurrentlyInStore);

	const verifyPin = useMutation(api.users.verifyHomePin);
	const updateFace = useMutation(api.users.updateFaceDescriptor);
	const clockIn = useMutation(api.attendance.clockIn);
	const clockOut = useMutation(api.attendance.clockOut);

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

		// No active shift found — find nearest upcoming shift
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

	// Watch Location
	useEffect(() => {
		if (!navigator.geolocation) {
			setLocationError("Browser tidak mendukung geolokasi.");
			return;
		}

		const watchId = navigator.geolocation.watchPosition(
			(pos) => {
				setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
				setLocationError(null);
			},
			(err) => {
				setLocationError("Izin lokasi diperlukan untuk absensi.");
				console.error(err);
			},
			{ enableHighAccuracy: true }
		);

		return () => navigator.geolocation.clearWatch(watchId);
	}, []);

	// Auto-select if authenticated
	useEffect(() => {
		if (isAuthenticated && authUser && step === "select") {
			const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === authUser._id);
			setUser({
				id: authUser._id,
				name: authUser.name,
				faceDescriptor: (authUser as any).faceDescriptor || null,
				isCurrentlyIn
			});
			setStep("face"); // Go to face scan since we have the token
		}
	}, [isAuthenticated, authUser, step, currentlyIn]);
	
	const handleUserSelect = (staff: any) => {
		const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === staff._id);
		setUser({
			id: staff._id,
			name: staff.name,
			faceDescriptor: staff.faceDescriptor || null,
			isCurrentlyIn
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
			if (!isInRadius && siteSettings?.attendanceLat) {
				toast.error("Gagal: Anda berada di luar radius kafe.");
				return;
			}

			// 2. If in enroll mode, save the face data first
			if (isEnrolling && descriptor && pin) {
				toast.loading("Mendaftarkan wajah...", { id: "save-face" });
				await updateFace({
					userId: user.id as any,
					pin: pin,
					faceDescriptor: descriptor,
				});
				toast.success("Wajah berhasil terdaftar!", { id: "save-face" });
				setIsEnrolling(false);
			}

			// 3. Smart Toggle: In or Out?
			toast.loading(user.isCurrentlyIn ? "Proses Keluar..." : "Proses Masuk...", { id: "clocking" });
			
			if (user.isCurrentlyIn) {
				await clockOut({ userId: user.id as any });
			} else {
				await clockIn({ 
				userId: user.id as any,
				shiftName: detectedShift?.name || undefined,
				shiftOpenTimeSnapshot: detectedShift?.openTime || undefined,
			});
			}
			
			toast.dismiss("clocking");
			setStep("success");
			
			setTimeout(() => {
				navigate({ to: "/home" });
			}, 3000);
		} catch (err) {
			toast.dismiss();
			toast.error("Gagal memproses absensi");
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
			if (isEnrolling && !user?.faceDescriptor) {
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
		<div className="flex min-h-screen w-full flex-col bg-background selection:bg-primary/20">
			{/* Animated Background Mesh */}
			<div className="fixed inset-0 -z-10 overflow-hidden">
				<div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-[120px] animate-pulse" />
				<div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-amber-500/5 blur-[120px] animate-pulse [animation-delay:2s]" />
			</div>

			{/* Header */}
			<header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border/40 bg-background/88 px-4 backdrop-blur-xl md:h-20 md:px-12">
				<div className="flex items-center gap-3 md:gap-4">
					<div className="group relative">
						<div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-primary to-amber-500 opacity-20 blur transition duration-300 group-hover:opacity-40" />
						<div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-border/50 bg-card text-primary shadow-sm md:h-12 md:w-12">
							<Coffee className="h-6 w-6 md:h-7 md:w-7" />
						</div>
					</div>
					<div className="min-w-0">
						<h1 className="text-lg font-black tracking-tight uppercase md:text-xl">Portal Presensi</h1>
						<div className="mt-0.5 flex items-center gap-2">
							<span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
							<p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground md:text-[10px]">
								Sistem Biometrik Online
							</p>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-2 md:gap-4">
					{/* Shift Detection Chip */}
					{detectedShift && (
						<div className={`hidden sm:flex items-center gap-2 rounded-full px-4 py-1.5 border text-xs font-bold transition-all ${
							isShiftActive 
								? "bg-blue-50 border-blue-100 text-blue-700" 
								: "bg-amber-50 border-amber-100 text-amber-700"
						}`}>
							<CalendarClock className="h-4 w-4" />
							<span>{detectedShift.name}</span>
							<span className="text-[10px] font-semibold opacity-70">
								{detectedShift.openTime}{detectedShift.closeTime ? `-${detectedShift.closeTime}` : ""}
							</span>
							{!isShiftActive && <span className="text-[9px] uppercase tracking-wider">(berikutnya)</span>}
						</div>
					)}

					{/* Status Lokasi Chip */}
					<div className={`hidden sm:flex items-center gap-2 rounded-full px-4 py-1.5 border text-xs font-bold transition-all ${
						isInRadius ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-700"
					}`}>
						{isInRadius ? <CheckCircle2 className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
						{isInRadius ? "Dalam Area Kafe" : "Luar Jangkauan"}
					</div>

					<Button 
						onClick={() => navigate({ to: "/home" })} 
						variant="ghost" 
						size="sm"
						className="rounded-xl px-2.5 hover:bg-muted/50 md:px-3"
					>
						<ArrowLeft className="h-4 w-4 md:mr-2" />
						<span className="hidden md:inline">Dashboard</span>
					</Button>
				</div>
			</header>

			<main className="flex flex-1 flex-col p-4 md:p-12">
				<AnimatePresence mode="wait">
					{step === "select" && (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -20 }}
							key="select-step"
							className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-12"
						>
							{/* Left: User Selection Grid */}
							<div className="space-y-5 lg:col-span-8 lg:space-y-8">
								<div className="space-y-2">
									<h2 className="text-2xl font-black tracking-tight md:text-3xl">SIAPA ANDA?</h2>
									<p className="text-sm font-medium text-muted-foreground">Pilih nama Anda untuk melanjutkan proses absensi.</p>
								</div>

								{!allStaff ? (
									<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-6">
										{Array.from({ length: 8 }).map((_, i) => (
											<div key={i} className="aspect-square rounded-3xl bg-muted animate-pulse" />
										))}
									</div>
								) : (
									<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-6">
										{allStaff.map((staff: any) => {
											const isIn = currentlyIn?.some((s: any) => s._id === staff._id);
											return (
												<motion.button
													whileHover={{ scale: 1.05 }}
													whileTap={{ scale: 0.95 }}
													key={staff._id}
													onClick={() => handleUserSelect(staff)}
													className={`group relative aspect-square rounded-[1.6rem] border-2 p-4 text-center transition-all duration-300 md:rounded-[2rem] md:p-6 ${
														isIn 
														? "bg-emerald-50/30 border-emerald-500/20 hover:border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.05)]" 
														: "bg-card border-border/50 hover:border-primary shadow-sm hover:shadow-xl"
													}`}
												>
													<div className="flex flex-col items-center gap-4 h-full justify-center">
														<div className="relative">
															<div className={`h-16 w-16 rounded-2xl flex items-center justify-center font-black text-2xl transition-all duration-300 ${
																isIn ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-white"
															}`}>
																{staff.name.charAt(0)}
															</div>
															{isIn && (
																<div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-background border-2 border-emerald-500 flex items-center justify-center">
																	<div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
																</div>
															)}
														</div>
														<div className="space-y-1">
															<p className="font-bold text-foreground text-sm leading-tight line-clamp-2 uppercase tracking-tight">
																{staff.name}
															</p>
															<div className="flex flex-col items-center gap-1">
																<p className={`text-[10px] font-black uppercase tracking-widest ${isIn ? "text-emerald-600" : "text-muted-foreground/60"}`}>
																	{isIn ? "BERTUGAS" : "OFF Duty"}
																</p>
																<div className={`mt-1 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-tighter text-white transition-all ${
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
								<div className="space-y-4 lg:sticky lg:top-32 lg:space-y-6">
									<div className="group relative overflow-hidden rounded-[2rem] border border-border/50 bg-card p-5 shadow-xl md:rounded-[2.5rem] md:p-8">
										<div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
											<Users className="h-32 w-32" />
										</div>
										
										<div className="relative space-y-4 md:space-y-6">
											<div className="flex items-center gap-3">
												<div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
													<Clock className="h-5 w-5" />
												</div>
												<div>
													<h3 className="font-bold text-lg leading-none">Tim Bertugas</h3>
													<p className="text-[10px] text-muted-foreground font-black mt-1 uppercase tracking-widest">Live Status Dashboard</p>
												</div>
											</div>

											<div className="space-y-3 md:space-y-4">
												{!currentlyIn ? (
													Array.from({ length: 3 }).map((_, i) => (
														<div key={i} className="h-12 w-full bg-muted/30 rounded-2xl animate-pulse" />
													))
												) : currentlyIn.length === 0 ? (
													<div className="py-12 text-center space-y-3">
														<div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground">
															<UserCheck className="h-6 w-6" />
														</div>
														<p className="text-sm text-muted-foreground font-medium">Belum ada staff yang masuk.</p>
													</div>
												) : (
													currentlyIn.map((staff: any) => (
														<div key={staff._id} className="flex items-center justify-between p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100/50 group/item hover:bg-emerald-50 transition-colors">
															<div className="flex items-center gap-3">
																<div className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold">
																	{staff.name.charAt(0)}
																</div>
																<div className="space-y-0.5">
																	<p className="font-bold text-sm text-foreground">{staff.name}</p>
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
										<div className={`rounded-[1.6rem] border p-4 md:rounded-[2rem] md:p-5 ${
											isShiftActive 
												? "bg-blue-50/50 border-blue-100/50" 
												: "bg-amber-50/50 border-amber-100/50"
										}`}>
											<div className="flex items-center gap-3 mb-2">
												<div className={`h-9 w-9 rounded-xl flex items-center justify-center ${
													isShiftActive ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"
												}`}>
													<CalendarClock className="h-4 w-4" />
												</div>
												<div>
													<p className="font-black text-sm leading-none">{detectedShift.name}</p>
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
										<div className="flex gap-4 rounded-3xl border border-red-100 bg-red-50 p-5 md:p-6">
											<div className="h-10 w-10 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
												<AlertCircle className="h-6 w-6" />
											</div>
											<div className="space-y-1">
												<p className="font-bold text-sm text-red-900">Peringatan Jarak</p>
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
							className="mx-auto w-full max-w-md space-y-5"
						>
							<div className="space-y-5 text-center">
								<div className="mb-1 inline-flex h-16 w-16 items-center justify-center rounded-[2rem] bg-amber-500/10 text-amber-600">
									<KeyRound className="h-8 w-8" />
								</div>
								<div className="space-y-2">
									<h2 className="text-2xl font-black tracking-tight uppercase md:text-3xl">Verifikasi PIN</h2>
									<p className="text-sm text-muted-foreground">Halo <strong>{user?.name}</strong>, masukkan PIN untuk mendaftarkan biometrik baru.</p>
								</div>

								<form className="space-y-4" onSubmit={handlePinSubmit}>
									<div className="relative">
										<Input
											autoFocus
											className="h-16 rounded-[1.6rem] border-2 pl-4 text-center text-3xl font-black tracking-[0.45em] transition-all focus:border-primary focus:ring-8 focus:ring-primary/5 md:h-20 md:rounded-[2rem] md:text-4xl"
											maxLength={6}
											onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
											placeholder="••••••"
											type="password"
											value={pin}
										/>
									</div>
									<div className="grid grid-cols-2 gap-3">
										<Button 
											type="button" 
											variant="outline" 
											className="h-12 rounded-2xl font-bold md:h-16"
											onClick={() => { setStep("select"); setPin(""); }}
										>
											KEMBALI
										</Button>
										<Button 
											className="h-12 rounded-2xl text-base font-bold md:h-16 md:text-lg" 
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
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.95 }}
							key="face-step"
							className="mx-auto w-full max-w-xl space-y-4"
						>
							<div className="flex items-center justify-between gap-3">
								<div className="space-y-1 min-w-0">
									<h2 className={`text-xl font-black tracking-tight uppercase md:text-2xl ${
										isEnrolling ? "text-foreground" : (user?.isCurrentlyIn ? "text-amber-500" : "text-emerald-500")
									}`}>
										{isEnrolling 
											? "Daftar Wajah Baru" 
											: (user?.isCurrentlyIn ? "Konfirmasi Absen Keluar" : "Konfirmasi Absen Masuk")
										}
									</h2>
									<p className="text-sm font-bold text-muted-foreground truncate">
										Staff: <span className="text-foreground">{user?.name}</span>
										{detectedShift && !user?.isCurrentlyIn && (
											<span className="text-muted-foreground/60"> — {detectedShift.name} ({detectedShift.openTime}{detectedShift.closeTime ? `-${detectedShift.closeTime}` : ""})</span>
										)}
									</p>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									{detectedShift && !user?.isCurrentlyIn && (
										<div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 border text-[10px] font-bold ${
											isShiftActive 
												? "bg-blue-50 border-blue-200 text-blue-700" 
												: "bg-amber-50 border-amber-200 text-amber-700"
										}`}>
											<CalendarClock className="h-3 w-3" />
											{detectedShift.name}
										</div>
									)}
									<div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 border text-[10px] font-bold uppercase tracking-wider ${
										isInRadius ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
									}`}>
										<div className={`h-1.5 w-1.5 rounded-full ${isInRadius ? "bg-emerald-500" : "bg-red-500"}`} />
										{isInRadius ? "Dalam Area" : "Luar Area"}
									</div>
								</div>
							</div>

							<div className="relative group">
								{!isInRadius && siteSettings?.attendanceLat ? (
									<div className="flex aspect-[3/4] w-full flex-col items-center justify-center space-y-4 rounded-3xl bg-muted p-6 text-center">
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
								) : (
									<FaceRecognition
										mode={isEnrolling ? "enroll" : "verify"}
										onCapture={isEnrolling ? handleFaceProcessed : undefined}
										onMatch={!isEnrolling ? () => handleFaceProcessed() : undefined}
										onModelError={() => {
											if (!isEnrolling) {
												toast.error("Gagal memuat sistem wajah. Silakan gunakan PIN.");
												setStep("pin");
											}
										}}
										targetDescriptor={user?.faceDescriptor}
									/>
								)}
							</div>

								<div className="flex flex-col gap-3">
									{!isEnrolling && (
										<Button 
											className={`h-14 w-full rounded-2xl font-black text-lg border-2 shadow-lg transition-all active:scale-95 ${
												user?.isCurrentlyIn 
													? "bg-amber-500 hover:bg-amber-600 border-amber-600 text-white" 
													: "bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white"
											}`}
											onClick={() => {
												setStep("pin");
												toast.info(`Masukkan PIN untuk ${user?.isCurrentlyIn ? 'Keluar' : 'Masuk'} manual.`);
											}}
										>
											<KeyRound className="mr-3 h-6 w-6" />
											{user?.isCurrentlyIn ? "ABSEN KELUAR (PIN)" : "ABSEN MASUK (PIN)"}
										</Button>
									)}
									
									<div className="flex items-center gap-3">
										{!isEnrolling && (
											<Button 
												className="h-11 flex-1 rounded-2xl font-bold"
												variant="secondary"
												onClick={() => {
													setIsEnrolling(true);
													setStep("pin");
													toast.info("Masukkan PIN untuk mendaftarkan wajah baru.");
												}}
											>
												DAFTAR ULANG WAJAH
											</Button>
										)}
										<Button 
											className="h-11 flex-1 rounded-2xl" 
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
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							key="success-step"
							className="max-w-md mx-auto w-full"
						>
							<div className="flex flex-col items-center space-y-8 text-center bg-card border border-border/50 rounded-[3rem] p-12 shadow-2xl relative overflow-hidden">
								<div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-500 to-primary" />
								
								<motion.div
									className="relative"
									initial={{ scale: 0, rotate: -180 }}
									animate={{ scale: 1, rotate: 0 }}
									transition={{ type: "spring", stiffness: 150, damping: 12 }}
								>
									<div className="absolute -inset-6 rounded-full bg-emerald-500/20 blur-2xl animate-pulse" />
									<motion.div
										className="relative flex h-32 w-32 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/20"
										animate={{ boxShadow: ["0 10px 25px -5px rgba(16,185,129,0.2)", "0 10px 40px -5px rgba(16,185,129,0.4)", "0 10px 25px -5px rgba(16,185,129,0.2)"] }}
										transition={{ duration: 2, repeat: Infinity }}
									>
										<UserCheck className="h-16 w-16" />
									</motion.div>
								</motion.div>

								<motion.div
									className="space-y-4"
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.3 }}
								>
									<div className="flex justify-center">
										<div className={`rounded-full px-6 py-2 text-sm font-black uppercase tracking-[0.2em] shadow-lg ${
											user?.isCurrentlyIn 
												? "bg-amber-100 text-amber-600 border border-amber-200 text-center" 
												: "bg-emerald-100 text-emerald-600 border border-emerald-200 text-center"
										}`}>
											{user?.isCurrentlyIn ? "Clock Out Berhasil" : "Clock In Berhasil"}
										</div>
									</div>
									<h2 className="text-4xl font-black tracking-tight text-foreground uppercase">SUKSES!</h2>
									<p className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-primary bg-clip-text text-transparent italic text-center">
										{user?.isCurrentlyIn ? "Sudah diabsen keluar. Hati-hati di jalan!" : "Berhasil diabsen masuk. Semangat!"}
									</p>
									<p className="text-sm text-muted-foreground">
										{user?.name} — {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
										{detectedShift && !user?.isCurrentlyIn && (
											<span className="block text-xs mt-1">
												Shift: <span className="font-bold">{detectedShift.name}</span> ({detectedShift.openTime}{detectedShift.closeTime ? `-${detectedShift.closeTime}` : ""})
											</span>
										)}
									</p>
								</motion.div>

								<motion.div
									className="flex items-center gap-3 rounded-2xl border border-border bg-muted/50 px-6 py-4 w-full"
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.6 }}
								>
									<Loader2 className="h-4 w-4 animate-spin text-primary" />
									<p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none">Mengalihkan ke Dashboard...</p>
								</motion.div>

								{/* Celebration particles */}
								{Array.from({ length: 12 }).map((_, i) => (
									<motion.div
										key={i}
										className="absolute rounded-full"
										style={{
											width: 4 + Math.random() * 8,
											height: 4 + Math.random() * 8,
											background: ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899"][i % 5],
										}}
										initial={{ top: "50%", left: "50%", opacity: 1, scale: 1 }}
										animate={{
											top: `${10 + Math.random() * 80}%`,
											left: `${5 + Math.random() * 90}%`,
											opacity: 0,
											scale: 0,
										}}
										transition={{ duration: 1.5 + Math.random(), delay: 0.2 + i * 0.08 }}
									/>
								))}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</main>

			<Footer className="pb-8" />
		</div>
	);
}

export const Route = createLazyFileRoute("/attendance/" as any)({
	component: AttendancePage,
});
