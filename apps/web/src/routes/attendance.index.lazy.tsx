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
	Navigation
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { useYumiAuth } from "@/hooks/useYumiAuth";

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
	const [step, setStep] = useState<"select" | "face" | "success">("select");
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
				faceDescriptor: (authUser as any).faceDescriptor || [],
				isCurrentlyIn
			});
			setStep("pin");
		}
	}, [isAuthenticated, authUser, step, currentlyIn]);
	
	const handleUserSelect = (staff: any) => {
		const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === staff._id);
		setUser({
			id: staff._id,
			name: staff.name,
			faceDescriptor: staff.faceDescriptor || [],
			isCurrentlyIn
		});
		setStep("face");
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
			if (isEnrolling && descriptor) {
				toast.loading("Menyimpan biometrik...", { id: "save-face" });
				await updateFace({
					userId: user.id as any,
					faceDescriptor: descriptor,
				});
				toast.success("Wajah berhasil terdaftar!", { id: "save-face" });
			}

			// 3. Smart Toggle: In or Out?
			toast.loading(user.isCurrentlyIn ? "Proses Keluar..." : "Proses Masuk...", { id: "clocking" });
			
			if (user.isCurrentlyIn) {
				await clockOut({ userId: user.id as any });
			} else {
				await clockIn({ userId: user.id as any });
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

	return (
		<div className="flex min-h-screen w-full flex-col bg-background selection:bg-primary/20">
			{/* Animated Background Mesh */}
			<div className="fixed inset-0 -z-10 overflow-hidden">
				<div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-[120px] animate-pulse" />
				<div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-amber-500/5 blur-[120px] animate-pulse [animation-delay:2s]" />
			</div>

			{/* Header */}
			<header className="sticky top-0 z-50 flex h-20 items-center justify-between border-b border-border/40 bg-background/80 px-6 backdrop-blur-xl md:px-12">
				<div className="flex items-center gap-4">
					<div className="group relative">
						<div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-primary to-amber-500 opacity-20 blur transition duration-300 group-hover:opacity-40" />
						<div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-card border border-border/50 text-primary shadow-sm">
							<Coffee className="h-7 w-7" />
						</div>
					</div>
					<div>
						<h1 className="text-xl font-black tracking-tight uppercase">Portal Presensi</h1>
						<div className="flex items-center gap-2 mt-0.5">
							<span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
							<p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sistem Biometrik Online</p>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-4">
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
						className="rounded-xl hover:bg-muted/50"
					>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Dashboard
					</Button>
				</div>
			</header>

			<main className="flex flex-1 flex-col p-6 md:p-12">
				<AnimatePresence mode="wait">
					{step === "select" && (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -20 }}
							key="select-step"
							className="grid grid-cols-1 lg:grid-cols-12 gap-12 max-w-7xl mx-auto w-full"
						>
							{/* Left: User Selection Grid */}
							<div className="lg:col-span-8 space-y-8">
								<div className="space-y-2">
									<h2 className="text-3xl font-black tracking-tight">SIAPA ANDA?</h2>
									<p className="text-muted-foreground font-medium">Pilih nama Anda untuk melanjutkan proses absensi.</p>
								</div>

								{!allStaff ? (
									<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
										{Array.from({ length: 8 }).map((_, i) => (
											<div key={i} className="aspect-square rounded-3xl bg-muted animate-pulse" />
										))}
									</div>
								) : (
									<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
										{allStaff.map((staff: any) => {
											const isIn = currentlyIn?.some((s: any) => s._id === staff._id);
											return (
												<motion.button
													whileHover={{ scale: 1.05 }}
													whileTap={{ scale: 0.95 }}
													key={staff._id}
													onClick={() => handleUserSelect(staff)}
													className={`group relative aspect-square rounded-[2rem] p-6 text-center transition-all duration-300 border-2 ${
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
															<p className={`text-[10px] font-black uppercase tracking-widest ${isIn ? "text-emerald-600" : "text-muted-foreground/60"}`}>
																{isIn ? "BERTUGAS" : "OFF Duty"}
															</p>
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
								<div className="sticky top-32 space-y-6">
									<div className="rounded-[2.5rem] bg-card border border-border/50 p-8 shadow-xl relative overflow-hidden group">
										<div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
											<Users className="h-32 w-32" />
										</div>
										
										<div className="relative space-y-6">
											<div className="flex items-center gap-3">
												<div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
													<Clock className="h-5 w-5" />
												</div>
												<div>
													<h3 className="font-bold text-lg leading-none">Tim Bertugas</h3>
													<p className="text-[10px] text-muted-foreground font-black mt-1 uppercase tracking-widest">Live Status Dashboard</p>
												</div>
											</div>

											<div className="space-y-4">
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

									{/* Geofencing Warning for Select Step */}
									{!isInRadius && siteSettings?.attendanceLat && (
										<div className="rounded-3xl bg-red-50 border border-red-100 p-6 flex gap-4">
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


					{step === "face" && (
						<motion.div
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.95 }}
							key="face-step"
							className="max-w-xl mx-auto w-full space-y-8"
						>
							<div className="space-y-2 text-center">
								<h2 className="text-3xl font-black tracking-tight uppercase">
									{isEnrolling ? "Daftar Wajah" : "Verifikasi Wajah"}
								</h2>
								<p className="font-bold text-primary text-lg">Halo, {user?.name}</p>
								<p className="text-sm text-muted-foreground">
									{isEnrolling 
										? "Wajah Anda belum terdaftar. Harap lakukan pemindaian wajah." 
										: "Dekatkan wajah ke kamera untuk penyelesaian absensi."}
								</p>
							</div>

							<div className="relative group">
								<div className={`absolute -inset-4 rounded-[3rem] bg-gradient-to-tr transition-all duration-500 blur-2xl opacity-10 ${
									isInRadius ? "from-emerald-500 to-primary" : "from-red-500 to-orange-500"
								}`} />
								<div className="relative rounded-[2.5rem] bg-card border border-border/50 p-6 shadow-2xl overflow-hidden">
									{!isInRadius && siteSettings?.attendanceLat ? (
										<div className="aspect-video bg-muted rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-4">
											<div className="h-16 w-16 rounded-3xl bg-red-100 text-red-600 flex items-center justify-center">
												<Navigation className="h-8 w-8 animate-bounce" />
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
											targetDescriptor={user?.faceDescriptor}
										/>
									)}
								</div>
							</div>
							
							<div className="flex flex-col gap-4">
								<div className="flex items-center justify-center gap-3">
									<div className={`h-2 w-2 rounded-full ${isInRadius ? "bg-emerald-500" : "bg-red-500"}`} />
									<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
										Akurasi Lokasi: {distance !== null ? `${Math.round(distance)}m` : "Checking..."}
									</p>
								</div>

								{!isEnrolling && (
									<Button 
										variant="ghost"
										className="text-muted-foreground hover:text-primary rounded-xl"
										onClick={() => {
											setIsEnrolling(true);
											toast.info("Masuk ke mode pendaftaran wajah baru.");
										}}
									>
										Wajah Tidak Terdeteksi? Daftar Ulang
									</Button>
								)}
								<Button className="w-full h-14 rounded-2xl" onClick={() => setStep("select")} variant="outline">
									Ganti Identitas
								</Button>
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
								
								<div className="relative">
									<div className="absolute -inset-4 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
									<div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/20">
										<UserCheck className="h-16 w-16" />
									</div>
								</div>

								<div className="space-y-2">
									<h2 className="text-4xl font-black tracking-tight text-foreground uppercase">SUKSES!</h2>
									<p className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-primary bg-clip-text text-transparent italic">
										{user?.isCurrentlyIn ? "Sudah diabsen keluar. Hati-hati di jalan!" : "Berhasil diabsen masuk. Semangat!"}
									</p>
								</div>

								<div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/50 px-6 py-4 w-full">
									<Loader2 className="h-4 w-4 animate-spin text-primary" />
									<p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none">Mengalihkan ke Dashboard...</p>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</main>

			<footer className="p-8 text-center">
				<p className="text-[10px] font-black tracking-[0.3em] text-muted-foreground/30 uppercase">
					Djiwa Tentram Attendance System v2.0
				</p>
			</footer>
		</div>
	);
}

export const Route = createLazyFileRoute("/attendance/" as any)({
	component: AttendancePage,
});
