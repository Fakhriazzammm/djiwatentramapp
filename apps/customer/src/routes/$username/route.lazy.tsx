import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, LogIn, ShoppingCart, Star, User } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { AuthModal } from "@/components/customer/auth-modal";
import { CustomerMenuGrid } from "@/components/customer/CustomerMenuGrid";

type GuestData = {
	name: string;
	email: string;
	phone: string;
	username: string;
};

function loadGuestData(): GuestData | null {
	try {
		const raw = localStorage.getItem("guest-data");
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed?.name && parsed?.username) return parsed as GuestData;
		return null;
	} catch {
		return null;
	}
}

export const Route = createLazyFileRoute("/$username")({
	component: MemberHomePage,
});

function MemberHomePage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const { isAuthenticated, isLoading, customer, login, register, logout, resetPassword, signInWithGoogle, registrationNeedsEmailConfirm } = useCustomerAuth();
	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [authError, setAuthError] = useState<string | undefined>(undefined);

	const storeName = import.meta.env.VITE_BRAND_NAME || "Djiwatentram";
	const logoUrl = import.meta.env.VITE_BRAND_LOGO_URL || "";

	// ── Guest data dari localStorage (synchronous, no network) ──
	// Langsung resolve kalau guest match — tanpa nunggu auth check
	const [guestData, setGuestData] = useState<GuestData | null>(() => loadGuestData());
	const [resolved, setResolved] = useState(() => {
		const g = loadGuestData();
		return g?.username === username;
	});

	// ── Detect: member vs unknown (guest sudah ter-resolve di atas) ──
	useEffect(() => {
		if (resolved) return; // Already guest match
		if (isLoading) return; // Auth still loading

		// Member authenticated + username cocok
		if (isAuthenticated && customer) {
			if (customer.username === username) {
				setResolved(true);
				return;
			}
			// Member tapi username salah → redirect ke username sendiri
			navigate({ to: `/${customer.username}` });
			return;
		}

		// Tidak cocok → redirect ke landing
		navigate({ to: "/" });
	}, [resolved, isLoading, isAuthenticated, customer, username, navigate]);

	// ── Loading ────────────────────────────────────
	// Guest match → skip loading (resolved=true sejak awal, tanpa network)
	// Non-guest → nunggu auth baru resolve
	if (!resolved || (!guestData && isLoading)) {
		return (
			<div className="flex min-h-app items-center justify-center bg-background">
				<div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
					<Loader2 className="h-4 w-4 animate-spin text-primary" />
					<span className="text-xs font-medium text-muted-foreground">Menyiapkan halaman...</span>
				</div>
			</div>
		);
	}

	// ── Guest view ─────────────────────────────────
	if (guestData && !isAuthenticated) {
		const isCurrentGuest = loadGuestData()?.username === username;
		return (
			<div className="app-page min-h-app">
				<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
					<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
						<div className="flex items-center gap-2">
							{logoUrl ? (
								<img alt={storeName} className="h-10 w-10 rounded-xl object-contain" src={logoUrl} />
							) : (
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<ShoppingCart className="h-5 w-5" />
								</div>
							)}
							<div>
								<p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Tamu</p>
								<h1 className="text-sm font-black tracking-tight">{storeName}</h1>
							</div>
						</div>
					</header>

					<main className="flex-1 px-3 py-4">
						<div className="rounded-xl border border-border bg-card p-4 shadow-sm">
							<div className="flex items-center gap-3">
								<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
									<User className="h-6 w-6" />
								</div>
								<div>
									<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Selamat datang</p>
									<h2 className="text-lg font-black">{guestData.name}</h2>
								</div>
							</div>

							{/* ── Quick actions ──────────────────────── */}
							<div className="mt-6 space-y-2">
								<button
									type="button"
									className="flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-black text-white shadow-sm"
									onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } })}
								>
									<span>Mulai pesan</span>
									<ChevronRight className="h-4 w-4" />
								</button>
								{!isCurrentGuest ? (
									<p className="text-center text-[10px] text-muted-foreground">
										Halaman ini milik {guestData.name}.{" "}
										<button type="button" className="underline" onClick={() => navigate({ to: "/daftar" })}>
											Mulai pesan sebagai dirimu
										</button>
									</p>
								) : null}
								<button
									type="button"
									className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-black text-muted-foreground"
									onClick={() => setAuthModalOpen(true)}
								>
									<LogIn className="h-3.5 w-3.5" />
									Masuk / Daftar untuk poin
								</button>
							</div>
						</div>
					</main>
				</div>

				<AuthModal
					open={authModalOpen}
					onOpenChange={(val) => { setAuthModalOpen(val); if (!val) setAuthError(undefined); }}
					onLogin={async (email, password) => { try { setAuthError(undefined); await login(email, password); } catch (e: any) { setAuthError(e?.message || "Gagal masuk"); } }}
					onRegister={async (email, password, name) => { try { setAuthError(undefined); await register(email, password, name); } catch (e: any) { setAuthError(e?.message || "Gagal mendaftar"); } }}
					onSkip={() => setAuthModalOpen(false)}
					onGoogleSignIn={signInWithGoogle}
					onResetPassword={async (email) => { try { await resetPassword(email); } catch {} }}
					isLoading={isLoading}
					needsEmailConfirm={registrationNeedsEmailConfirm}
					error={authError}
				/>
			</div>
		);
	}

	// ── Member view (authenticated) ────────────────
	if (!customer) return null;

	const displayName = customer.name || customer.username || "Member";

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center gap-2">
						{logoUrl ? (
							<img alt={storeName} className="h-10 w-10 rounded-xl object-contain" src={logoUrl} />
						) : (
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
								<ShoppingCart className="h-5 w-5" />
							</div>
						)}
						<div>
							<p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Member</p>
							<h1 className="text-sm font-black tracking-tight">{storeName}</h1>
						</div>
					</div>
				</header>

				<main className="flex-1 px-3 py-4">
					<div className="rounded-xl border border-border bg-card p-4 shadow-sm">
						<div className="flex items-center gap-3">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
								<User className="h-6 w-6" />
							</div>
							<div>
								<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Selamat datang</p>
								<h2 className="text-lg font-black">{displayName}</h2>
							</div>
						</div>

						<div className="mt-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 px-3 py-3">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Star className="h-4 w-4 text-amber-500" />
									<span className="text-xs font-bold text-muted-foreground">Yumi Poin</span>
								</div>
								<span className="text-lg font-black">{customer.totalPoints.toLocaleString("id-ID")}</span>
							</div>
							{customer.lifetimePoints > 0 ? (
								<p className="mt-0.5 text-[10px] text-muted-foreground">Total: {customer.lifetimePoints.toLocaleString("id-ID")} poin seumur hidup</p>
							) : null}
						</div>

						{/* ─── Menu ─── */}
						<div className="mt-4">
							<h2 className="text-xs font-black uppercase tracking-wider text-foreground mb-3">
								Menu
							</h2>
							<CustomerMenuGrid baseRoute={username} />
						</div>
					</div>
				</main>
			</div>

			<AuthModal
				open={authModalOpen}
				onOpenChange={(val) => { setAuthModalOpen(val); if (!val) setAuthError(undefined); }}
				onLogin={async (email, password) => { try { setAuthError(undefined); await login(email, password); } catch (e: any) { setAuthError(e?.message || "Gagal masuk"); } }}
				onRegister={async (email, password, name) => { try { setAuthError(undefined); await register(email, password, name); } catch (e: any) { setAuthError(e?.message || "Gagal mendaftar"); } }}
				onSkip={() => setAuthModalOpen(false)}
				onGoogleSignIn={signInWithGoogle}
				onResetPassword={async (email) => { try { await resetPassword(email); } catch {} }}
				isLoading={isLoading}
				needsEmailConfirm={registrationNeedsEmailConfirm}
				error={authError}
			/>
		</div>
	);
}
