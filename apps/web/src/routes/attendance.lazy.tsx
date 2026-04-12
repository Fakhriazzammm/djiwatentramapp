import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@yumipos/backend/convex/_generated/api";
import { FaceRecognition } from "@/components/auth/FaceRecognition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Coffee, ArrowLeft, KeyRound, Loader2, UserCheck, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { useYumiAuth } from "@/hooks/useYumiAuth";

function AttendancePage() {
	const navigate = useNavigate();
	const [step, setStep] = useState<"pin" | "face" | "success">("pin");
	const { user: authUser, isAuthenticated } = useYumiAuth();
	
	const [pin, setPin] = useState("");
	const [user, setUser] = useState<{ id: string; name: string; role: string; faceDescriptor?: number[] } | null>(null);
	const [isEnrolling, setIsEnrolling] = useState(false);
	const [isVerifyingPin, setIsVerifyingPin] = useState(false);

	const verifyPin = useMutation(api.users.verifyHomePin);
	const updateFace = useMutation(api.users.updateFaceDescriptor);
	const clockIn = useMutation(api.attendance.clockIn);
	const clockOut = useMutation(api.attendance.clockOut);

	// Auto-login from Yumi Session
	useEffect(() => {
		if (isAuthenticated && authUser && step === "pin") {
			// Get full user detail for face descriptor
			// Wait, authUser from hook might not have faceDescriptor.
			// However, in this context we can just set the step to face 
			// and the FaceRecognition component will handle the rest if we fetch the descriptor.
			// Actually, let's just trigger a pseudo-pin-submit logic or similar.
			setUser({
				id: authUser._id,
				name: authUser.name,
				role: "placeholder", // will be fetched or ignored
				faceDescriptor: (authUser as any).faceDescriptor || []
			});
			
			if (!(authUser as any).faceDescriptor || (authUser as any).faceDescriptor.length === 0) {
				setIsEnrolling(true);
			}
			setStep("face");
		}
	}, [isAuthenticated, authUser, step]);
	
	const handlePinSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (pin.length !== 6) {
			toast.error("PIN harus 6 digit");
			return;
		}

		setIsVerifyingPin(true);
		try {
			const result = await verifyPin({ pinCode: pin });
			setUser({ 
				id: result.userId, 
				name: result.name, 
				role: result.role,
				faceDescriptor: result.faceDescriptor 
			});
			
			// If no face data, go to enroll mode automatically
			if (!result.faceDescriptor || result.faceDescriptor.length === 0) {
				setIsEnrolling(true);
			}
			
			setStep("face");
		} catch (err) {
			toast.error((err as Error).message || "PIN salah");
		} finally {
			setIsVerifyingPin(false);
		}
	};

	const handleFaceProcessed = async (descriptor: number[]) => {
		if (!user) return;

		try {
			// If in enroll mode, save the face data first
			if (isEnrolling) {
				toast.loading("Menyimpan biometrik...", { id: "save-face" });
				await updateFace({
					userId: user.id as any,
					faceDescriptor: descriptor,
				});
				toast.success("Wajah berhasil terdaftar!", { id: "save-face" });
			}

			// Proceed with attendance recording
			toast.loading("Mencatat kehadiran...", { id: "clocking" });
			await clockIn({ userId: user.id as any });
			toast.dismiss("clocking");
			
			setStep("success");
			toast.success(`Berhasil! Selamat bertugas, ${user.name}`);
			
			setTimeout(() => {
				navigate({ to: "/home" });
			}, 3000);
		} catch (err) {
			toast.dismiss();
			toast.error("Gagal memproses absensi");
		}
	};

	return (
		<div className="flex min-h-screen w-full flex-col bg-background">
			{/* Header */}
			<header className="flex h-16 items-center justify-between border-b bg-card px-6">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
						<Coffee className="h-6 w-6" />
					</div>
					<h1 className="text-xl font-black tracking-tight">PRESENSI TIM</h1>
				</div>
				<Button onClick={() => navigate({ to: "/home" })} variant="ghost" size="sm">
					<ArrowLeft className="mr-2 h-4 w-4" />
					Kembali
				</Button>
			</header>

			<main className="flex flex-1 flex-col items-center justify-center p-6">
				<div className="w-full max-w-md space-y-8">
					<AnimatePresence mode="wait">
						{step === "pin" && (
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								className="space-y-6 text-center"
								exit={{ opacity: 0, y: -20 }}
								initial={{ opacity: 0, y: 20 }}
								key="pin-step"
							>
								<div className="space-y-2">
									<h2 className="text-2xl font-bold tracking-tight">Masukkan PIN Anda</h2>
									<p className="text-muted-foreground">Gunakan 6 digit PIN akses operasional Anda</p>
								</div>

								<form className="space-y-4" onSubmit={handlePinSubmit}>
									<div className="relative">
										<KeyRound className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
										<Input
											autoFocus
											className="h-16 rounded-2xl border-2 pl-12 text-center text-3xl font-black tracking-[0.5em] focus:border-primary focus:ring-4 focus:ring-primary/10"
											maxLength={6}
											onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
											placeholder="••••••"
											type="password"
											value={pin}
										/>
									</div>
									<Button className="h-14 w-full rounded-2xl text-lg font-bold" disabled={pin.length !== 6 || isVerifyingPin} type="submit">
										{isVerifyingPin ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
										LANJUTKAN
									</Button>
								</form>
							</motion.div>
						)}

						{step === "face" && (
							<motion.div
								animate={{ opacity: 1, scale: 1 }}
								className="space-y-6 text-center"
								exit={{ opacity: 0, scale: 0.95 }}
								initial={{ opacity: 0, scale: 0.95 }}
								key="face-step"
							>
								<div className="space-y-1">
									<h2 className="text-2xl font-bold tracking-tight">
										{isEnrolling ? "Pendaftaran Wajah Baru" : "Verifikasi Wajah"}
									</h2>
									<p className="font-medium text-primary text-lg">Halo, {user?.name}</p>
									<p className="text-sm text-black font-semibold">
										{isEnrolling 
											? "Wajah Anda belum terdaftar. Silakan lakukan pemindaian wajah untuk pertama kali." 
											: "Silakan arahkan wajah ke kamera"}
									</p>
								</div>

								<FaceRecognition
									mode={isEnrolling ? "enroll" : "verify"}
									onCapture={isEnrolling ? handleFaceProcessed : undefined}
									onMatch={!isEnrolling ? () => handleFaceProcessed(user?.faceDescriptor || []) : undefined}
									targetDescriptor={user?.faceDescriptor}
								/>
								
								<div className="flex flex-col gap-2 pt-2">
									{!isEnrolling && (
										<Button 
											className="w-full text-muted-foreground transition-colors hover:text-destructive" 
											variant="outline"
											onClick={() => {
												setIsEnrolling(true);
												toast.info("Anda sekarang dalam mode pendaftaran ulang wajah.");
											}}
										>
											Wajah Berubah? Daftar Ulang Wajah
										</Button>
									)}
									<Button className="w-full" onClick={() => setStep("pin")} variant="ghost">
										Bukan Anda? Ganti PIN
									</Button>
								</div>
							</motion.div>
						)}

						{step === "success" && (
							<motion.div
								animate={{ opacity: 1, scale: 1 }}
								className="flex flex-col items-center space-y-6 text-center"
								initial={{ opacity: 0, scale: 0.9 }}
								key="success-step"
							>
								<div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
									<UserCheck className="h-12 w-12" />
								</div>
								<div className="space-y-2">
									<h2 className="text-3xl font-black tracking-tight text-foreground">ABSENSI BERHASIL</h2>
									<p className="text-lg font-medium text-emerald-600">Selamat bertugas!</p>
								</div>
								<div className="w-full rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
									Sistem akan kembali ke dashboard otomatis dalam 3 detik...
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</main>

			<footer className="p-8 text-center text-xs text-muted-foreground opacity-50">
				© 2026 DJAWA TENTRAM - SISTEM PRESENSI BIOMETRIK
			</footer>
		</div>
	);
}

export const Route = createLazyFileRoute("/attendance" as any)({
	component: AttendancePage,
});
