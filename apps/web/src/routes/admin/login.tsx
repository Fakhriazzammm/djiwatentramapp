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
		<div className="app-page flex min-h-app w-full overflow-hidden bg-background">
			<div className="fade-in relative hidden flex-1 animate-in flex-col justify-between overflow-hidden bg-[linear-gradient(145deg,var(--foreground),color-mix(in_srgb,var(--primary)_42%,var(--foreground)_58%))] p-12 duration-1000 lg:flex">
				<div className="absolute right-0 top-0 h-96 w-96 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/8 blur-3xl" />
				<div className="absolute bottom-0 left-0 h-96 w-96 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />

				<div className="relative z-10 flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md">
						<Coffee className="h-6 w-6 text-primary-foreground" />
					</div>
					<span className="text-xl font-black tracking-tight text-primary-foreground">
						{storeName}
					</span>
				</div>

				<div className="relative z-10 max-w-lg space-y-6">
					<h1 className="text-6xl font-black leading-[1.1] tracking-tight text-primary-foreground">
						Kelola Bisnis Anda <br />
						<span className="text-secondary">Lebih Cerdas.</span>
					</h1>
					<p className="max-w-md text-lg font-medium leading-relaxed text-primary-foreground/70">
						Sistem manajemen modern untuk kafe dan restoran. Pantau penjualan,
						stok, dan laporan keuangan dalam satu dashboard.
					</p>
				</div>

				<div className="relative z-10">
					<div className="flex items-center gap-4 border-t border-white/10 pt-8">
						<div className="flex -space-x-2">
							{[1, 2, 3].map((i) => (
								<div
									className="h-8 w-8 rounded-full border-2 border-foreground bg-white/20"
									key={i}
								/>
							))}
						</div>
						<p className="text-sm italic text-primary-foreground/50">
							Dipercaya oleh ratusan pemilik bisnis di Indonesia.
						</p>
					</div>
				</div>
			</div>

			<div className="fade-in slide-in-from-right-8 flex w-full animate-in flex-col justify-center bg-background p-8 duration-700 lg:w-[480px] xl:w-[540px]">
				<div className="mx-auto w-full max-w-sm space-y-10">
					<div className="space-y-2">
						<div className="lg:hidden">
							<div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
								<Coffee className="h-6 w-6" />
							</div>
						</div>
						<h2 className="text-3xl font-black tracking-tight text-foreground">
							Selamat Datang Kembali
						</h2>
						<p className="app-overline">Masuk Ke Dashboard Admin</p>
					</div>

					<form className="space-y-6" onSubmit={handleLogin}>
						<div className="space-y-4">
							<div className="space-y-2">
								<label
									className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
									htmlFor="username"
								>
									Email / Username
								</label>
								<div className="group relative">
									<div className="absolute inset-y-0 left-0 flex items-center pl-4 text-muted-foreground/50 transition-colors group-focus-within:text-primary">
										<User className="h-4 w-4" />
									</div>
									<input
										autoFocus
										className="w-full rounded-2xl border border-border bg-card py-4 pl-12 pr-4 text-sm font-bold text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/20 focus:bg-background focus:ring-4 focus:ring-primary/10"
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
										className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
										htmlFor="password"
									>
										Password
									</label>
									<button
										className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 transition-colors hover:text-primary"
										type="button"
									>
										Lupa Kata Sandi?
									</button>
								</div>
								<div className="group relative">
									<div className="absolute inset-y-0 left-0 flex items-center pl-4 text-muted-foreground/50 transition-colors group-focus-within:text-primary">
										<Lock className="h-4 w-4" />
									</div>
									<input
										className="w-full rounded-2xl border border-border bg-card py-4 pl-12 pr-4 text-sm font-bold text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/20 focus:bg-background focus:ring-4 focus:ring-primary/10"
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
							className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-primary px-4 py-4 font-mono text-xs font-black uppercase tracking-[0.2em] text-primary-foreground shadow-xl transition-all hover:translate-y-[-2px] hover:shadow-2xl active:translate-y-0 active:scale-95 disabled:opacity-70 disabled:hover:translate-y-0"
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
							<div className="w-full border-t border-border" />
						</div>
						<div className="relative flex justify-center text-sm">
							<span className="bg-background px-4 text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
								Metode Lain
							</span>
						</div>
					</div>

					<button
						className="flex w-full items-center justify-center gap-3 rounded-2xl border border-border bg-card py-4 text-sm font-bold text-foreground shadow-sm transition-all hover:bg-muted hover:shadow-md active:scale-95 disabled:opacity-70"
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
						<span className="text-xs font-bold uppercase tracking-widest text-foreground">
							{isGoogleLoading ? "MEMPROSES..." : "MASUK DENGAN GOOGLE"}
						</span>
					</button>

					<p className="text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						© 2026 {storeName} - BY ZANTARA
					</p>
				</div>
			</div>
		</div>
	);
}
