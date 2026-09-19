import { createLazyFileRoute, Outlet, useLocation, useMatches, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useOrderContext } from "@/hooks/use-order-context";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { AuthModal } from "@/components/customer/auth-modal";
import { MemberOnboarding, ProfileCompletionOnboarding } from "@/components/customer/member-onboarding";
import { CustomerBottomNav, CustomerLiveShiftIndicator } from "@/components/customer/customer-shell";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { getCustomerContactMessage, getMissingCustomerFields } from "@/lib/customer-profile-completeness";
import { CustomerHomeHeader, CustomerHomeServiceGrid, CustomerWalletSummary, DjiwaPayOfferCard } from "@/components/customer/customer-home-sections";
import { CustomerStoryRail } from "@/features/stories/customer-story-rail";
import { RecentOrdersCarousel } from "@/components/customer/recent-orders-carousel";
import { CustomerHomeDiscovery } from "@/components/customer/customer-home-discovery";
import { B2BPromoBanner } from "@/components/customer/b2b-promo-banner";

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

function greetingWord(): string {
	const hour = new Date().getHours();
	if (hour < 11) return "Selamat pagi";
	if (hour < 15) return "Selamat siang";
	if (hour < 18) return "Selamat sore";
	return "Selamat malam";
}

export const Route = createLazyFileRoute("/$username")({
	component: MemberHomePage,
});

function MemberHomePage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { isAuthenticated, isLoading, customer, login, logout, register, resetPassword, signInWithGoogle, registrationNeedsEmailConfirm, refreshCustomer } = useCustomerAuth();
	const { setCart } = useOrderContext();
	const siteSettings = useHybridSiteSettings();
	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [authError, setAuthError] = useState<string | undefined>(undefined);
	const [showMemberOnboarding, setShowMemberOnboarding] = useState(false);
	const [showProfileCompletion, setShowProfileCompletion] = useState(false);
	const [confirmedProfileSourceId, setConfirmedProfileSourceId] = useState<string | null>(null);

	const storeName = import.meta.env.VITE_BRAND_NAME || "Djiwatentram";
	const logoUrl = siteSettings?.logoUrl || "/logo-djiwa.png";
	const b2bChannelHref = isAuthenticated && customer ? `https://b2b.yumme.id/${encodeURIComponent(username)}/order?step=menu` : "https://b2b.yumme.id/daftar";

	const matches = useMatches();
	const isChildRoute = matches.some(m => m.routeId.startsWith("/$username/") && m.routeId !== "/$username");
	const isOrderChild = matches.some(m => m.routeId.startsWith("/$username/order"));
	const isCommunityChild = matches.some(m => m.routeId.startsWith("/$username/komunitas"));
	const goCustomerPath = (path: string) => {
		if (typeof window !== "undefined") window.location.assign(path);
	};
	const customerNav = [
		{ label: "Home", icon: <Djiwa3DIcon name="navigation-home" size="micro" alt="" className="h-5 w-5 object-contain" />, active: location.pathname === `/${username}`, onSelect: () => goCustomerPath(`/${encodeURIComponent(username)}`) },
		{ label: "Pesan", icon: <Djiwa3DIcon name="navigation-order" size="micro" alt="" className="h-5 w-5 object-contain" />, active: location.pathname.includes("/order"), onSelect: () => goCustomerPath(`/${encodeURIComponent(username)}/order?step=table`) },
		{ label: "Komunitas", icon: <Djiwa3DIcon name="navigation-community" size="micro" alt="" className="h-5 w-5 object-contain" />, active: location.pathname.includes("/komunitas"), onSelect: () => goCustomerPath(`/${encodeURIComponent(username)}/komunitas`) },
		{ label: "Saldo", icon: <Djiwa3DIcon name="navigation-wallet" size="micro" alt="" className="h-5 w-5 object-contain" />, active: location.pathname.includes("/saldo"), onSelect: () => goCustomerPath(`/${encodeURIComponent(username)}/saldo`) },
		{ label: "Profil", icon: <Djiwa3DIcon name="navigation-profile" size="micro" alt="" className="h-5 w-5 object-contain" />, active: location.pathname.includes("/profile"), onSelect: () => goCustomerPath(`/${encodeURIComponent(username)}/profile`) },
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
			onGoogleSignIn={async () => {
				try {
					setAuthError(undefined);
					await signInWithGoogle();
				} catch (e: any) {
					setAuthError(e?.message || "Gagal masuk dengan Google");
				}
			}}
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
					{!isCommunityChild ? <CustomerLiveShiftIndicator /> : null}
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
					<CustomerHomeHeader logoUrl={logoUrl} storeName={storeName} eyebrow={greetingWord()} title={guestData.name} />
					<CustomerLiveShiftIndicator />
					<main className="flex-1 space-y-5 px-4 py-4 pb-32">
						<B2BPromoBanner href={b2bChannelHref} />
						<section className="rounded-3xl border border-border bg-card p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Mulai dari sini</p><p className="mt-1 text-sm font-black">Pesan menu favoritmu dengan mudah.</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Masuk sebagai member untuk memakai Djiwa Pay dan mendapatkan benefit.</p></section>
						<RecentOrdersCarousel username={username} />
						<DjiwaPayOfferCard isMember={false} onAction={() => navigate({ to: "/masuk" })} />
						<CustomerHomeServiceGrid
							onOrder={() => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } })}
							onPromo={() => navigate({ to: "/$username/promo", params: { username } })}
							onWallet={() => navigate({ to: "/$username/saldo", params: { username } })}
							onHistory={() => navigate({ to: "/$username/riwayat", params: { username } })}
							onCommunity={() => navigate({ to: "/$username/komunitas", params: { username } })}
							onMerchandise={() => window.location.assign(`https://merchandise.yumme.id/${encodeURIComponent(username)}/order?step=menu`)}
							onBooking={() => window.location.assign("https://booking.yumme.id/")}
							onProfile={() => navigate({ to: "/$username/profile", params: { username } })}
						/>
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
						eyebrow={greetingWord()}
						title={displayName}
						action={
						<div className="flex items-center gap-1.5">
							<button
									type="button"
									onClick={() => navigate({ to: "/$username/profile", params: { username } })}
									aria-label="Member Djiwa Tentram — Kartu member berlaku sampai Desember 2026. Buka profil."
									className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-[#f4d27a]/45 bg-[#0b1740] px-3 text-white shadow-sm transition-transform duration-[180ms] active:scale-[.97]"
								>
									<ShieldCheck className="h-3.5 w-3.5 text-[#f4d27a]" aria-hidden="true" />
									<span className="text-left leading-none">
										<span className="block text-[9px] font-black uppercase tracking-[0.14em] text-[#f4d27a]">Member</span>
										<span className="mt-0.5 block text-[9px] font-semibold text-blue-100/90">s/d Des 2026</span>
									</span>
								</button>
								<button
									type="button"
									onClick={() => navigate({ to: "/$username/notifikasi", params: { username } })}
									aria-label="Buka notifikasi"
									className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-sm transition-transform duration-[180ms] active:scale-[.97]"
								>
									<Djiwa3DIcon name="notifications-alerts" size="micro" alt="" className="h-5 w-5 object-contain" />
								</button>
							</div>
						}
					/>
					<CustomerLiveShiftIndicator />
					{!isContactComplete && missingContactFields.length > 0 ? <div className="mx-3 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950 shadow-sm" role="alert"><div className="flex items-start gap-2.5"><span className="mt-0.5 text-base">!</span><div className="min-w-0 flex-1"><p className="text-xs font-black">Lengkapi data akun</p><p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/80">{getCustomerContactMessage(missingContactFields)}</p></div><button className="min-h-11 shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-black text-white active:scale-[.97]" onClick={() => navigate({ to: "/$username/profile", params: { username } })} type="button">Lengkapi</button></div></div> : null}
					<main className="flex-1 space-y-5 px-4 py-4 pb-32">
						<CustomerStoryRail />
						<CustomerWalletSummary customer={customer} onTopup={() => navigate({ to: "/$username/saldo", params: { username } })} />
						<CustomerHomeServiceGrid
							onOrder={() => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } })}
							onPromo={() => navigate({ to: "/$username/promo", params: { username } })}
							onWallet={() => navigate({ to: "/$username/saldo", params: { username } })}
							onHistory={() => navigate({ to: "/$username/riwayat", params: { username } })}
							onCommunity={() => navigate({ to: "/$username/komunitas", params: { username } })}
							onMerchandise={() => window.location.assign(`https://merchandise.yumme.id/${encodeURIComponent(username)}/order?step=menu`)}
							onBooking={() => window.location.assign("https://booking.yumme.id/")}
							onProfile={() => navigate({ to: "/$username/profile", params: { username } })}
						/>
						<RecentOrdersCarousel username={username} />
						<DjiwaPayOfferCard isMember onAction={() => navigate({ to: "/$username/saldo", params: { username } })} />
						<CustomerHomeDiscovery onMenu={() => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } })} b2bHref={b2bChannelHref} />
					</main>
				</div>
			</div>
			<CustomerBottomNav items={customerNav} />
			{authModal}
			{showProfileCompletion && customer ? <ProfileCompletionOnboarding name={displayName} email={customer.email ?? ""} phone={customer.phone ?? ""} onSave={saveProfileCompletion} /> : null}
			{!showProfileCompletion && showMemberOnboarding && customer ? <MemberOnboarding name={displayName} onDismiss={dismissMemberOnboarding} onStartOrdering={() => { dismissMemberOnboarding(); navigate({ to: "/$username/order", params: { username }, search: { step: "table" } }); }} /> : null}
		</>
	);
}
