import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { Coffee, Lock, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute("/admin/login" as any)({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isGoogleLoading, setIsGoogleLoading] = useState(false);

	const settings = useQuery(api.site_settings.getSettings);
	const storeName = settings?.storeName || "Yumi POS";

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!(username && password)) {
			toast.error("Mohon isi email dan password");
			return;
		}

		setIsLoading(true);
		try {
			// Try to sign in as email
			await authClient.signIn.email(
				{
					email: username,
					password,
				},
				{
					onSuccess: () => {
						toast.success("Login berhasil!");
						navigate({ to: "/admin" });
					},
					onError: (ctx: { error: { message: string } }) => {
						toast.error(ctx.error.message || "Login gagal");
						setIsLoading(false);
					},
				}
			);
		} catch (_error) {
			// Fallback error
			setIsLoading(false);
			toast.error("Terjadi kesalahan sistem");
		}
	};

	const handleGoogleSignIn = async () => {
		setIsGoogleLoading(true);
		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL: "/admin",
			});
		} catch (_error) {
			setIsGoogleLoading(false);
			toast.error("Gagal masuk dengan Google");
		}
	};

	return (
		<div className="flex min-h-screen w-full overflow-hidden bg-background">
			{/* Left Side: Branding & Visuals (Hidden on Mobile) */}
			<div className="fade-in relative hidden flex-1 animate-in flex-col justify-between overflow-hidden bg-[#4A3728] p-12 duration-1000 lg:flex">
				{/* Decorative Background Elements */}
				<div className="absolute top-0 right-0 h-96 w-96 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5 blur-3xl" />
				<div className="absolute bottom-0 left-0 h-96 w-96 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />

				<div className="relative z-10 flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md">
						<Coffee className="h-6 w-6 text-[#F5F0E1]" />
					</div>
					<span className="font-black text-[#F5F0E1] text-xl tracking-tight">
						{storeName}
					</span>
				</div>

				<div className="relative z-10 max-w-lg space-y-6">
					<h1 className="font-black text-6xl text-[#F5F0E1] leading-[1.1] tracking-tight">
						Kelola Bisnis Anda <br />
						<span className="text-primary/80">Lebih Cerdas.</span>
					</h1>
					<p className="max-w-md font-medium text-[#F5F0E1]/60 text-lg leading-relaxed">
						Sistem manajemen modern untuk kafe dan restoran. Pantau penjualan,
						stok, dan laporan keuangan dalam satu dashboard.
					</p>
				</div>

				<div className="relative z-10">
					<div className="flex items-center gap-4 border-white/10 border-t pt-8">
						<div className="flex -space-x-2">
							{[1, 2, 3].map((i) => (
								<div
									className="h-8 w-8 rounded-full border-2 border-[#4A3728] bg-muted"
									key={i}
								/>
							))}
						</div>
						<p className="text-[#F5F0E1]/40 text-sm italic">
							Dipercaya oleh ratusan pemilik bisnis di Indonesia.
						</p>
					</div>
				</div>
			</div>

			{/* Right Side: Login Form */}
			<div className="fade-in slide-in-from-right-8 flex w-full animate-in flex-col justify-center bg-[#F5F0E1] p-8 duration-700 lg:w-[480px] xl:w-[540px]">
				<div className="mx-auto w-full max-w-sm space-y-10">
					<div className="space-y-2">
						<div className="lg:hidden">
							<div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4A3728] text-[#F5F0E1] shadow-lg">
								<Coffee className="h-6 w-6" />
							</div>
						</div>
						<h2 className="font-black text-3xl text-[#4A3728] tracking-tight">
							Selamat Datang Kembali
						</h2>
						<p className="font-bold text-[#4A3728]/50 text-xs uppercase tracking-[0.2em]">
							Masuk Ke Dashboard Admin
						</p>
					</div>

					<form className="space-y-6" onSubmit={handleLogin}>
						<div className="space-y-4">
							<div className="space-y-2">
								<label
									className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
									htmlFor="username"
								>
									Email / Username
								</label>
								<div className="group relative">
									<div className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#4A3728]/30 transition-colors group-focus-within:text-primary">
										<User className="h-4 w-4" />
									</div>
									<input
										autoFocus
										className="w-full rounded-xl border border-[#4A3728]/5 bg-[#E8E1CF]/30 py-4 pr-4 pl-12 font-bold text-[#4A3728] text-sm outline-none transition-all placeholder:text-[#4A3728]/20 focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/10"
										id="username"
										onChange={(e) => setUsername(e.target.value)}
										placeholder="admin@example.com"
										type="text"
										value={username}
									/>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<label
										className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
										htmlFor="password"
									>
										Password
									</label>
									<button
										className="font-bold text-[#4A3728]/40 text-[10px] uppercase tracking-widest transition-colors hover:text-primary"
										type="button"
									>
										Lupa Kata Sandi?
									</button>
								</div>
								<div className="group relative">
									<div className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#4A3728]/30 transition-colors group-focus-within:text-primary">
										<Lock className="h-4 w-4" />
									</div>
									<input
										className="w-full rounded-xl border border-[#4A3728]/5 bg-[#E8E1CF]/30 py-4 pr-4 pl-12 font-bold text-[#4A3728] text-sm outline-none transition-all placeholder:text-[#4A3728]/20 focus:border-primary/20 focus:bg-white focus:ring-4 focus:ring-primary/10"
										id="password"
										onChange={(e) => setPassword(e.target.value)}
										placeholder="••••••••"
										type="password"
										value={password}
									/>
								</div>
							</div>
						</div>

						<button
							className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#4A3728] py-4 pr-4 pl-4 font-black font-mono text-[#F5F0E1] text-xs uppercase tracking-[0.2em] shadow-xl transition-all hover:translate-y-[-2px] hover:shadow-2xl active:translate-y-0 active:scale-95 disabled:opacity-70 disabled:hover:translate-y-0"
							disabled={isLoading}
							type="submit"
						>
							{isLoading ? (
								<span className="flex items-center gap-2">
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
									MEMPROSES
								</span>
							) : (
								"MASUK SEKARANG"
							)}
						</button>
					</form>

					<div className="relative">
						<div className="absolute inset-0 flex items-center">
							<div className="w-full border-[#4A3728]/5 border-t" />
						</div>
						<div className="relative flex justify-center text-sm">
							<span className="bg-[#F5F0E1] px-4 font-bold text-[#4A3728]/30 text-[10px] uppercase tracking-[0.3em]">
								Metode Lain
							</span>
						</div>
					</div>

					<button
						className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#4A3728]/10 bg-white py-4 font-bold text-[#4A3728] text-sm shadow-sm transition-all hover:bg-[#E8E1CF]/20 hover:shadow-md active:scale-95 disabled:opacity-70"
						disabled={isGoogleLoading}
						onClick={handleGoogleSignIn}
						type="button"
					>
						<svg className="h-5 w-5" viewBox="0 0 24 24">
							<title>Google Logo</title>
							<path
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
								fill="#4285F4"
							/>
							<path
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
								fill="#34A853"
							/>
							<path
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
								fill="#FBBC05"
							/>
							<path
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
								fill="#EA4335"
							/>
						</svg>
						<span className="font-bold text-[#4A3728] text-xs uppercase tracking-widest">
							{isGoogleLoading ? "MEMPROSES..." : "MASUK DENGAN GOOGLE"}
						</span>
					</button>

					<p className="text-center font-bold text-[#4A3728]/30 text-[10px] uppercase tracking-widest">
						© 2026 {storeName} — BY ZANTARA
					</p>
				</div>
			</div>
		</div>
	);
}
