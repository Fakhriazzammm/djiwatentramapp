import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShoppingCart, LogIn } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { AuthModal } from "@/components/customer/auth-modal";
import { AuthHeader } from "@/components/customer/auth-header";

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
		registrationNeedsEmailConfirm,
	} = useCustomerAuth();

	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [authError, setAuthError] = useState<string | undefined>(undefined);
	const [welcomeReady, setWelcomeReady] = useState(false);

	const storeName = import.meta.env.VITE_BRAND_NAME || "Djiwatentram";
	const logoUrl = import.meta.env.VITE_BRAND_LOGO_URL || "";

	// ── Redirect member ke /{username} ────────────────────────────
	useEffect(() => {
		if (!isLoading && isAuthenticated && customer) {
			navigate({ to: `/${customer.username}` });
		}
	}, [isLoading, isAuthenticated, customer, navigate]);

	// ── Guest — tampilkan welcome page ───────────────────────
	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			setWelcomeReady(true);
		}
	}, [isLoading, isAuthenticated]);

	// ── Loading state ────────────────────────────────────────
	if (isLoading || !welcomeReady) {
		return (
			<div className="flex min-h-app items-center justify-center bg-background">
				<div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
					<Loader2 className="h-4 w-4 animate-spin text-primary" />
					<span className="text-xs font-medium text-muted-foreground">
						Menyiapkan halaman...
					</span>
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

				{/* ── Auth header ──────────────────────────────── */}
				<div className="px-3 pt-3">
					<AuthHeader
						isAuthenticated={false}
						customer={null}
						isLoading={false}
						onOpenAuth={() => setAuthModalOpen(true)}
						onLogout={logout}
						onProfileClick={() => navigate({ to: "/profile" })}
					/>
				</div>

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

							{/* ── Tombol Masuk / Daftar ───────────── */}
							<button
								type="button"
								className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-black text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								onClick={() => setAuthModalOpen(true)}
							>
								<LogIn className="h-3.5 w-3.5" />
								Masuk / Daftar untuk poin
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
