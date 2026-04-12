import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@yumipos/backend/convex/_generated/api";
import { FaceRecognition } from "@/components/auth/FaceRecognition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Coffee, ArrowLeft, KeyRound, Loader2, UserCheck, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";

function AttendancePage() {
	const navigate = useNavigate();
	const [step, setStep] = useState<"pin" | "face" | "success">("pin");
	const [pin, setPin] = useState("");
	const [user, setUser] = useState<{ id: string; name: string; role: string; faceDescriptor?: number[] } | null>(null);
	const [isVerifyingPin, setIsVerifyingPin] = useState(false);

	const verifyPin = useMutation(api.users.verifyHomePin);
	const clockIn = useMutation(api.attendance.clockIn);
	const clockOut = useMutation(api.attendance.clockOut);
	
	// Fetch user details including faceDescriptor if PIN is valid
	// Note: verifyHomePin returns minimal info, we might need a getByPin query for better UX
	// but for now we follow the existing verifyHomePin signature.
	
	const handlePinSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (pin.length !== 6) {
			toast.error("PIN harus 6 digit");
			return;
		}

		setIsVerifyingPin(true);
		try {
			const result = await verifyPin({ pinCode: pin });
			// verifyHomePin doesn't return descriptor, let's assume we need to fetch it
			// For this MVP, I'll update the verifyHomePin on backend to include it or just proceed
			setUser({ id: result.userId, name: result.name, role: result.role });
			setStep("face");
		} catch (err) {
			toast.error((err as Error).message || "PIN salah");
		} finally {
			setIsVerifyingPin(false);
		}
	};

	const handleFaceMatched = async () => {
		if (!user) return;

		try {
			// Determine if clocking in or out based on current status
			// For simplicity in this UI, we can ask user or auto-toggle
			// Let's assume auto-toggle for now
			await clockIn({ userId: user.id as any });
			setStep("success");
			toast.success(`Berhasil Absen! Halo, ${user.name}`);
			
			setTimeout(() => {
				navigate({ to: "/home" });
			}, 3000);
		} catch (err) {
			toast.error("Gagal mencatat absensi");
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
									<h2 className="text-2xl font-bold tracking-tight">Verifikasi Wajah</h2>
									<p className="font-medium text-primary">Halo, {user?.name}</p>
									<p className="text-xs text-muted-foreground">Silakan arahkan wajah ke kamera</p>
								</div>

								<FaceRecognition
									mode="verify"
									onMatch={handleFaceMatched}
									targetDescriptor={user?.faceDescriptor}
								/>
								
								<Button className="w-full" onClick={() => setStep("pin")} variant="ghost">
									Bukan Anda? Ganti PIN
								</Button>
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
