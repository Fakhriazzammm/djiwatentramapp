import { createLazyFileRoute, Outlet, useLocation, useMatches, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, Home, UserRound, LogIn, LogOut, ShoppingCart, User, Wallet } from "lucide-react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { AuthModal } from "@/components/customer/auth-modal";
import { CustomerMenuGrid } from "@/components/customer/CustomerMenuGrid";
import { MemberOnboarding, ProfileCompletionOnboarding } from "@/components/customer/member-onboarding";
import { CustomerBottomNav, CustomerLiveShiftIndicator } from "@/components/customer/customer-shell";
import { currency } from "@/components/customer/types";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { getCustomerContactMessage, getMissingCustomerFields } from "@/lib/customer-profile-completeness";
import { CustomerHomeHeader, CustomerHomePrimaryAction, CustomerWalletHero, DjiwaPayOfferCard } from "@/components/customer/customer-home-sections";
import { RecentOrdersCarousel } from "@/components/customer/recent-orders-carousel";

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
					<CustomerHomeHeader logoUrl={logoUrl} storeName={storeName} eyebrow="Tamu" title={storeName} />
					<CustomerLiveShiftIndicator />
					<main className="flex-1 space-y-4 px-3 py-4 pb-32">
						<section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
							<p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Selamat datang</p>
							<h2 className="mt-1 font-display text-2xl font-black tracking-tight">{guestData.name}</h2>
						</section>
						<DjiwaPayOfferCard isMember={false} onAction={() => setAuthModalOpen(true)} />
						<section aria-labelledby="guest-menu-title">
							<div className="mb-2 px-0.5"><h2 id="guest-menu-title" className="text-sm font-black">Akses cepat</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Mulai pesan atau lihat benefit member.</p></div>
							<CustomerMenuGrid baseRoute={username} />
						</section>
						<CustomerHomePrimaryAction onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } })} />
						{!isCurrentGuest ? <p className="text-center text-[10px] text-muted-foreground">Halaman ini milik {guestData.name}. <button type="button" className="font-bold underline" onClick={() => navigate({ to: "/daftar" })}>Mulai sebagai dirimu</button></p> : null}
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
					<CustomerHomeHeader
						logoUrl={logoUrl}
						storeName={storeName}
						eyebrow="Member"
						title={displayName}
						action={<button type="button" aria-label="Keluar" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform duration-[180ms] hover:bg-destructive/10 hover:text-destructive active:scale-[.97]" onClick={async () => { await logout(); navigate({ to: "/" }); }}><LogOut className="h-4 w-4" /></button>}
					/>
					<CustomerLiveShiftIndicator />
					{!isContactComplete && missingContactFields.length > 0 ? <div className="mx-3 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950 shadow-sm" role="alert"><div className="flex items-start gap-2.5"><span className="mt-0.5 text-base">!</span><div className="min-w-0 flex-1"><p className="text-xs font-black">Lengkapi data akun</p><p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/80">{getCustomerContactMessage(missingContactFields)}</p></div><button className="min-h-11 shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-black text-white active:scale-[.97]" onClick={() => navigate({ to: "/$username/profile", params: { username } })} type="button">Lengkapi</button></div></div> : null}
					<main className="flex-1 space-y-4 px-3 py-4 pb-32">
						<CustomerWalletHero customer={customer} onTopup={() => navigate({ to: "/$username/saldo", params: { username } })} />
						<RecentOrdersCarousel username={username} />
						<DjiwaPayOfferCard isMember onAction={() => navigate({ to: "/$username/saldo", params: { username } })} />
						<section aria-labelledby="member-menu-title"><div className="mb-2 px-0.5"><h2 id="member-menu-title" className="text-sm font-black">Akses cepat</h2><p className="mt-0.5 text-[11px] text-muted-foreground">Promo, favorit, notifikasi, saldo, dan profil.</p></div><CustomerMenuGrid baseRoute={username} /></section>
						<CustomerHomePrimaryAction onClick={() => navigate({ to: "/$username/order", params: { username }, search: { step: "party" } })} />
					</main>
				</div>
			</div>
			<CustomerBottomNav items={customerNav} />
			{authModal}
			{showProfileCompletion && customer ? <ProfileCompletionOnboarding name={displayName} email={customer.email ?? ""} phone={customer.phone ?? ""} onSave={saveProfileCompletion} /> : null}
			{!showProfileCompletion && showMemberOnboarding && customer ? <MemberOnboarding name={displayName} onDismiss={dismissMemberOnboarding} onStartOrdering={() => { dismissMemberOnboarding(); navigate({ to: "/$username/order", params: { username }, search: { step: "party" } }); }} /> : null}
		</>
	);
}
