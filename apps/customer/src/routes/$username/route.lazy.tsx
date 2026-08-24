import { createLazyFileRoute, Outlet, useLocation, useMatches, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, Coins, Home, UserRound, ChevronRight, LogIn, LogOut, ShoppingCart, Star, User, Wallet, Plus } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { AuthModal } from "@/components/customer/auth-modal";
import { CustomerMenuGrid } from "@/components/customer/CustomerMenuGrid";
import { MemberOnboarding, ProfileCompletionOnboarding } from "@/components/customer/member-onboarding";
import { CustomerBottomNav, CustomerLiveShiftIndicator } from "@/components/customer/customer-shell";
import { currency } from "@/components/customer/types";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { getCustomerContactMessage, getMissingCustomerFields } from "@/lib/customer-profile-completeness";

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

function DjiwaPayMarketingBanner({ isMember, onAction }: { isMember: boolean; onAction: () => void }) {
	return (
		<section className="relative isolate overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50 shadow-sm" aria-label="Promo Djiwa Pay">
			<img src="/djiwa-pay-20-banner.png" alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-85" />
			<div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-950/95 via-emerald-900/80 to-emerald-900/15" />
			<div className="relative min-h-[178px] p-4 text-white sm:min-h-[190px] sm:p-5">
				<div className="max-w-[72%]">
					<p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Benefit member Djiwa Pay</p>
					<h2 className="mt-1 font-display text-2xl font-black leading-[1.05] tracking-tight sm:text-3xl">Bayar pakai Djiwa Pay, hemat 20%</h2>
					<p className="mt-2 text-[11px] font-medium leading-relaxed text-emerald-50 sm:text-xs">Top up saldo Djiwa Pay terlebih dahulu. Setiap transaksi berhasil juga mendapatkan saldo Djiwa Pay +Rp1.000.</p>
					<button type="button" onClick={onAction} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-[14px] bg-white px-3.5 py-2.5 text-xs font-black text-emerald-900 shadow-sm transition-transform duration-[180ms] active:scale-[.97]">{isMember ? "Top up Djiwa Pay" : "Masuk / Daftar"}<ChevronRight className="ml-1 h-3.5 w-3.5" /></button>
				</div>
			</div>
		</section>
	);
}

function MemberHomePage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { isAuthenticated, isLoading, customer, login, logout, register, resetPassword, signInWithGoogle, registrationNeedsEmailConfirm, refreshCustomer } = useCustomerAuth();
	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [authError, setAuthError] = useState<string | undefined>(undefined);
	const [showMemberOnboarding, setShowMemberOnboarding] = useState(false);
	const [showProfileCompletion, setShowProfileCompletion] = useState(false);
	const [confirmedProfileSourceId, setConfirmedProfileSourceId] = useState<string | null>(null);

	const storeName = import.meta.env.VITE_BRAND_NAME || "Djiwatentram";
	const logoUrl = import.meta.env.VITE_BRAND_LOGO_URL || "";

	const matches = useMatches();
	const isChildRoute = matches.some(m => m.routeId.startsWith("/$username/") && m.routeId !== "/$username");
	const isOrderChild = matches.some(m => m.routeId.startsWith("/$username/order"));
	const customerNav = [
		{ label: "Home", icon: <Home className="h-4 w-4" />, active: location.pathname === `/${username}`, onSelect: () => navigate({ to: "/$username", params: { username } }) },
		{ label: "Pesan", icon: <ShoppingCart className="h-4 w-4" />, active: location.pathname.includes("/order"), onSelect: () => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } }) },
		{ label: "Riwayat", icon: <ClipboardList className="h-4 w-4" />, active: location.pathname.includes("/riwayat"), onSelect: () => navigate({ to: "/$username/riwayat", params: { username } }) },
				{ label: "Saldo", icon: <Wallet className="h-4 w-4" />, active: location.pathname.includes("/saldo"), onSelect: () => navigate({ to: "/$username/saldo", params: { username } }) },
		{ label: "Profil", icon: <UserRound className="h-4 w-4" />, active: location.pathname.includes("/profile"), onSelect: () => navigate({ to: "/$username/profile", params: { username } }) },
	];

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

	// Sinkronkan guest data kalau berubah (mis. setelah daftar ulang)
	useEffect(() => {
		setGuestData(loadGuestData());
	}, [username]);

	useEffect(() => {
		if (!customer?.createdAt) return;
		const createdAt = Date.parse(customer.createdAt);
		if (!Number.isFinite(createdAt) || Date.now() - createdAt < 0 || Date.now() - createdAt > 24 * 60 * 60 * 1000) return;
		try {
			if (localStorage.getItem(`djiwa-member-onboarding:${customer.sourceId}`) !== "done") {
				setShowMemberOnboarding(true);
			}
		} catch {
			setShowMemberOnboarding(true);
		}
	}, [customer?.createdAt, customer?.sourceId]);

	useEffect(() => {
		if (!customer || !isAuthenticated) {
			setConfirmedProfileSourceId(null);
			setShowProfileCompletion(false);
			return;
		}
		const isComplete = confirmedProfileSourceId === customer.sourceId || getMissingCustomerFields(customer).length === 0;
		setShowProfileCompletion(!isComplete);
	}, [customer, isAuthenticated, confirmedProfileSourceId]);

	const dismissMemberOnboarding = () => {
		if (customer) {
			try {
				localStorage.setItem(`djiwa-member-onboarding:${customer.sourceId}`, "done");
			} catch {
				// Onboarding tetap boleh ditutup jika storage tidak tersedia.
			}
		}
		setShowMemberOnboarding(false);
	};

	const saveProfileCompletion = async (phone: string) => {
		if (!customer?.email) throw new Error("Email akun belum tersedia. Silakan keluar dan masuk kembali.");
		await invokeEdgeFunction("customer-sync", {
			action: "updateProfile",
			sourceId: customer.sourceId,
			email: customer.email,
			name: customer.name ?? "",
			phone: phone.trim(),
		});
		setConfirmedProfileSourceId(customer.sourceId);
		setShowProfileCompletion(false);
		await refreshCustomer();
	};

	const authModal = (
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
	);

	// ── Loading ────────────────────────────────────
	// Guest match → skip loading (resolved=true sejak awal, tanpa network)
	// Non-guest → nunggu auth baru resolve
	if (!resolved || (!guestData && isLoading)) {
		return <CustomerPageSkeleton label="Menyiapkan halaman member" />;
	}

	// ── Child route aktif ──────────────────────────
	// PENTING: render Outlet untuk guest MAUPUN member — guard per-halaman
	// dilakukan di masing-masing child page. Sebelumnya guest kena
	// `if (!customer) return null` → halaman blank untuk semua tombol menu.
	if (isChildRoute) {
		return (
			<>
				<div className="min-h-app pb-safe-with-nav">
					<CustomerLiveShiftIndicator />
					<Outlet />
				</div>
				{!isOrderChild ? <CustomerBottomNav items={customerNav} /> : null}
				{authModal}
				{showProfileCompletion && customer ? <ProfileCompletionOnboarding name={customer.name || customer.username || "Member"} email={customer.email ?? ""} phone={customer.phone ?? ""} onSave={saveProfileCompletion} /> : null}
			</>
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
					<CustomerLiveShiftIndicator />

					<main className="flex-1 px-3 py-4 pb-safe-with-nav">
						<div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
							<div className="flex items-center gap-3">
								<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
									<User className="h-6 w-6" />
								</div>
								<div>
									<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Selamat datang</p>
									<h2 className="font-display text-xl font-black">{guestData.name}</h2>
								</div>
							</div>

							<DjiwaPayMarketingBanner isMember={false} onAction={() => setAuthModalOpen(true)} />

							{/* ── Quick actions ──────────────────────── */}
							<div className="mt-6 space-y-2">
								<button
									type="button"
									className="flex min-h-11 w-full items-center justify-between rounded-[14px] bg-primary px-4 py-3 text-sm font-black text-white shadow-sm transition-transform duration-[180ms] active:scale-[.97]"
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
									className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[14px] border border-border bg-background px-3 py-2.5 text-xs font-black text-muted-foreground"
									onClick={() => setAuthModalOpen(true)}
								>
									<LogIn className="h-3.5 w-3.5" />
									Masuk / Daftar untuk Saldo
								</button>
							</div>

							{/* ─── Menu (guest juga bisa akses semua tombol) ─── */}
							<div className="mt-4">
								<h2 className="text-xs font-black uppercase tracking-wider text-foreground">Akses cepat</h2>
								<p className="mt-1 text-[11px] text-muted-foreground">Cek promo, favorit, notifikasi, dan fitur lainnya dari sini.</p>
								<CustomerMenuGrid baseRoute={username} />
							</div>
						</div>
					</main>
				</div>

				<CustomerBottomNav items={customerNav} />
				{authModal}
			</div>
		);
	}

	// ── Member view (authenticated) ────────────────
	if (!customer) return null;

	const displayName = customer.name || customer.username || "Member";
	const missingContactFields = getMissingCustomerFields(customer);
	const isContactComplete = confirmedProfileSourceId === customer.sourceId || missingContactFields.length === 0;

	return (
		<>
			<div className="app-page min-h-app">
			<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center justify-between gap-2">
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
						<button
							type="button"
							aria-label="Keluar"
							className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-[color,background-color,transform] duration-[180ms] hover:bg-destructive/10 hover:text-destructive active:scale-[.97]"
							onClick={async () => {
								await logout();
								navigate({ to: "/" });
							}}
						>
							<LogOut className="h-4 w-4" />
						</button>
					</div>
				</header>
				<CustomerLiveShiftIndicator />
				{!isContactComplete && missingContactFields.length > 0 ? (
					<div className="mx-3 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950 shadow-sm" role="alert">
						<div className="flex items-start gap-2.5"><span className="mt-0.5 text-base">!</span><div className="min-w-0 flex-1"><p className="text-xs font-black">Lengkapi data akun</p><p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/80">{getCustomerContactMessage(missingContactFields)}</p></div><button className="min-h-11 shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-black text-white shadow-sm active:scale-[.97]" onClick={() => navigate({ to: "/$username/profile", params: { username } })} type="button">Lengkapi</button></div>
					</div>
				) : null}

				<main className="flex-1 px-3 py-4 pb-safe-with-nav">
					<div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
						<div className="flex items-center gap-3">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
								<User className="h-6 w-6" />
							</div>
							<div>
								<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Selamat datang</p>
								<h2 className="font-display text-xl font-black">{displayName}</h2>
							</div>
						</div>

						<div className="mt-4 rounded-[20px] bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Wallet className="h-4 w-4 text-emerald-500" />
									<span className="text-xs font-bold text-muted-foreground">Djiwa Pay</span>
								</div>
								<span className="text-lg font-black">{currency(customer.walletBalance)}</span>
							</div>
							<p className="mt-0.5 text-[10px] text-muted-foreground">Total masuk Djiwa Pay: {currency(customer.walletTotalCredited)}</p>
							<button
								type="button"
								className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-white/70 px-3 py-2 text-[11px] font-black text-emerald-700 transition-colors hover:bg-white active:scale-[.98]"
								onClick={() => navigate({ to: "/$username/saldo", params: { username } })}
							>
								<Plus className="h-3.5 w-3.5" />
								Top up Djiwa Pay
							</button>
						</div>

						<DjiwaPayMarketingBanner isMember={true} onAction={() => navigate({ to: "/$username/saldo", params: { username } })} />

						<button type="button" className="mt-4 flex min-h-12 w-full items-center justify-between rounded-[14px] bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-sm transition-transform duration-[180ms] active:scale-[.97]" onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } })}>
							<span>Mulai pesan</span>
							<ChevronRight className="h-4 w-4" />
						</button>

						{/* ─── Menu ─── */}
						<div className="mt-4">
							<h2 className="text-xs font-black uppercase tracking-wider text-foreground">Akses cepat</h2>
							<p className="mt-1 text-[11px] text-muted-foreground">Cek promo, favorit, notifikasi, dan fitur lainnya dari sini.</p>
							<CustomerMenuGrid baseRoute={username} />
						</div>
					</div>
				</main>
				</div>
			</div>

			<CustomerBottomNav items={customerNav} />
			{authModal}
			{showProfileCompletion && customer ? (
				<ProfileCompletionOnboarding name={displayName} email={customer.email ?? ""} phone={customer.phone ?? ""} onSave={saveProfileCompletion} />
			) : null}
			{!showProfileCompletion && showMemberOnboarding && customer ? (
				<MemberOnboarding
					name={displayName}
					onDismiss={dismissMemberOnboarding}
					onStartOrdering={() => {
						dismissMemberOnboarding();
						navigate({ to: "/$username/order", params: { username }, search: { step: "party" } });
					}}
				/>
			) : null}
		</>
	);
}
