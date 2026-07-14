import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShoppingCart, LogIn } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { AuthModal } from "@/components/customer/auth-modal";

export const Route = createLazyFileRoute("/")({
	component: BrandCustomerIndex,
});

function BrandCustomerIndex() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const {
		isAuthenticated,
		isLoading,
		customer,
		login,
		register,
		logout,
		resetPassword,
		signInWithGoogle,
		registrationNeedsEmailConfirm,
	} = useCustomerAuth();

	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [authError, setAuthError] = useState<string | undefined>(undefined);

	const storeName = import.meta.env.VITE_BRAND_NAME || "Djiwatentram";
	const logoUrl = import.meta.env.VITE_BRAND_LOGO_URL || "";

	// ponytail: sudah login → langsung ke /{username}, bukan /order
	useEffect(() => {
		if (isAuthenticated && customer) {
			navigate({ to: `/${customer.username}` });
		}
	}, [isAuthenticated, customer, navigate]);

	// ── Loading state ────────────────────────────────────────────
	// Cegah flash welcome page untuk user yang sudah login
	if (isLoading) {
		return (
			<div className="flex min-h-app items-center justify-center bg-background">
				<div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
					<Loader2 className="h-4 w-4 animate-spin text-primary" />
					<span className="text-xs font-medium text-muted-foreground">Menyiapkan halaman...</span>
				</div>
			</div>
		);
	}

	// ── Guest welcome page ───────────────────────────────────
	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
				{/* ── Sticky header ────────────────────────────── */}
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						{logoUrl ? (
							<img
								alt={storeName}
								className="h-10 w-10 rounded-xl object-contain"
								src={logoUrl}
							/>
						) : (
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
								<ShoppingCart className="h-5 w-5" />
							</div>
						)}
						<div>
							<p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
								Welcome
							</p>
							<h1 className="text-sm font-black tracking-tight">
								{storeName}
							</h1>
						</div>
					</div>
				</header>

				{/* ── Welcome card di tengah ───────────────────── */}
				<main className="flex flex-1 items-center justify-center px-3">
					<section className="flex w-full flex-col items-center justify-center text-center">
						<div className="app-card-strong w-full px-3 py-4">
							<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10">
								{logoUrl ? (
									<img
										alt={storeName}
										className="h-8 w-8 object-contain"
										src={logoUrl}
									/>
								) : (
									<ShoppingCart className="h-8 w-8 text-primary" />
								)}
							</div>
							<p className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
								Welcome
							</p>
							<h2 className="mt-1 text-xl font-black tracking-tight">
								{storeName}
							</h2>
							<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
								Pesan online tanpa antri — praktis dan cepat.
							</p>

							{/* ── Tombol Mulai pesan ──────────────── */}
							<button
								type="button"
								className="mt-3 w-full rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-white shadow-sm"
								onClick={() => navigate({ to: "/daftar" })}
							>
								Mulai pesan
							</button>

							{/* ── Benefit list ────────────────────── */}
							<div className="mt-4 grid grid-cols-3 gap-1.5">
								{[
									{ icon: "🪙", label: "Dapatkan Poin untuk Member\nLogin/Register" },
									{ icon: "🎉", label: "Daftar/Login untuk\nHappy Hour 15rb All Menu!" },
									{ icon: "🏷️", label: "Promo Spesial Khusus Member\nLogin/Register" },
								].map((b) => (
									<div key={b.label} className="rounded-xl border border-border/60 bg-muted/30 px-2 py-2 text-center">
										<span className="text-lg">{b.icon}</span>
										<p className="mt-0.5 whitespace-pre-line text-[9px] font-bold leading-tight text-muted-foreground">{b.label}</p>
									</div>
								))}
							</div>

							{/* ── Tombol Masuk / Daftar ───────────── */}
							<button
								type="button"
								className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-black text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								onClick={() => setAuthModalOpen(true)}
							>
								<LogIn className="h-3.5 w-3.5" />
								Login/Register untuk Happy Hour
							</button>
						</div>
					</section>
				</main>

				{/* ── Auth Modal ───────────────────────────────── */}
				<AuthModal
					open={authModalOpen}
					onOpenChange={(val) => {
						setAuthModalOpen(val);
						if (!val) setAuthError(undefined);
					}}
					onLogin={async (email, password) => {
						try {
							setAuthError(undefined);
							await login(email, password);
						} catch (e: any) {
							setAuthError(e?.message || "Gagal masuk");
						}
					}}
					onRegister={async (email, password, name) => {
						try {
							setAuthError(undefined);
							await register(email, password, name);
						} catch (e: any) {
							setAuthError(e?.message || "Gagal mendaftar");
						}
					}}
					onSkip={() => setAuthModalOpen(false)}
					onGoogleSignIn={signInWithGoogle}
					onResetPassword={async (email) => {
						try {
							await resetPassword(email);
						} catch {}
					}}
					isLoading={isLoading}
					needsEmailConfirm={registrationNeedsEmailConfirm}
					error={authError}
				/>
			</div>
		</div>
	);
}
