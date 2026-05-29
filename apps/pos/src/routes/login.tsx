import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Building2, UserCircle2 } from "lucide-react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { Footer } from "@/components/layout/Footer";
import { useEffect } from "react";

export const Route = createFileRoute("/login" as any)({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const { isAuthenticated, isAdmin } = useYumiAuth();

	// Redirect if already logged in
	useEffect(() => {
		if (isAuthenticated) {
			if (isAdmin) {
				navigate({ to: "/admin" as any, replace: true });
			} else {
				navigate({ to: "/home" as any, replace: true });
			}
		}
	}, [isAuthenticated, isAdmin, navigate]);

	return (
		<div className="app-page relative min-h-screen w-full overflow-hidden text-foreground">
			{/* Soft Background Bubbles */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[100px]" />
				<div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-accent/20 blur-[100px]" />
			</div>

			<main className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center p-4">
				{/* Header */}
				<motion.div
					initial={{ opacity: 0, y: -12 }}
					animate={{ opacity: 1, y: 0 }}
					className="mb-8 md:mb-12 text-center space-y-2 md:space-y-3"
				>
					<motion.div
						initial={{ scale: 0.9 }}
						animate={{ scale: 1 }}
						className="mx-auto mb-4 md:mb-5 flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-[2rem] md:rounded-[2.5rem] bg-gradient-to-br from-primary to-sky-400 text-white shadow-xl shadow-primary/20"
					>
						<Building2 className="h-8 w-8 md:h-10 md:w-10" />
					</motion.div>
					<h1 className="text-3xl md:text-5xl font-black tracking-tight">Djiwa Tentram</h1>
					<p className="text-sm md:text-base text-muted-foreground font-medium max-w-md mx-auto">
						Pilih jenis akses untuk memulai sesi
					</p>
				</motion.div>

				{/* Role Cards */}
				<div className="grid w-full max-w-lg grid-cols-2 gap-4 md:gap-5">
					{/* Admin Card */}
					<motion.button
						initial={{ opacity: 0, x: -20 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 25 }}
						whileHover={{ scale: 1.02, y: -3 }}
						whileTap={{ scale: 0.97 }}
						onClick={() => navigate({ to: "/admin/login" as any })}
						className="group relative flex flex-col items-center gap-4 md:gap-5 rounded-2xl md:rounded-3xl border border-border/60 bg-card p-6 md:p-8 shadow-lg transition-colors hover:border-primary/30 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
					>
						<div className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl md:rounded-[1.75rem] bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-500/20 transition-transform group-hover:scale-105">
							<Building2 className="h-8 w-8 md:h-10 md:w-10" />
						</div>
						<div className="text-center">
							<h2 className="text-lg md:text-xl font-black tracking-tight">Admin</h2>
							<p className="mt-1 text-[10px] md:text-xs font-semibold text-muted-foreground/70">
								Dashboard &amp; Manajemen
							</p>
						</div>
						<div className="absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
					</motion.button>

					{/* Karyawan Card */}
					<motion.button
						initial={{ opacity: 0, x: 20 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 25 }}
						whileHover={{ scale: 1.02, y: -3 }}
						whileTap={{ scale: 0.97 }}
						onClick={() => navigate({ to: "/karyawan/login" as any })}
						className="group relative flex flex-col items-center gap-4 md:gap-5 rounded-2xl md:rounded-3xl border border-border/60 bg-card p-6 md:p-8 shadow-lg transition-colors hover:border-primary/30 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
					>
						<div className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl md:rounded-[1.75rem] bg-gradient-to-br from-sky-400 to-teal-400 text-white shadow-lg shadow-sky-400/20 transition-transform group-hover:scale-105">
							<UserCircle2 className="h-8 w-8 md:h-10 md:w-10" />
						</div>
						<div className="text-center">
							<h2 className="text-lg md:text-xl font-black tracking-tight">Karyawan</h2>
							<p className="mt-1 text-[10px] md:text-xs font-semibold text-muted-foreground/70">
								Absensi &amp; Slip Gaji
							</p>
						</div>
						<div className="absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
					</motion.button>
				</div>

				{/* Registration link */}
				<motion.p
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.4 }}
					className="mt-8 md:mt-10 text-xs text-muted-foreground/50"
				>
					Belum punya akun?{" "}
					<button
						onClick={() => navigate({ to: "/register" as any })}
						className="font-bold text-primary underline-offset-2 hover:underline"
					>
						Daftar di sini
					</button>
				</motion.p>
			</main>

			<Footer className="absolute bottom-8 left-0 right-0 pointer-events-none" />
		</div>
	);
}
