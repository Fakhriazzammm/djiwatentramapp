import { createLazyFileRoute, Outlet, useLocation, useMatches, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useOrderContext } from "@/hooks/use-order-context";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { MemberOnboarding, ProfileCompletionOnboarding } from "@/components/customer/member-onboarding";
import { CustomerBottomNav, CustomerLiveShiftIndicator } from "@/components/customer/customer-shell";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { getCustomerContactMessage, getMissingCustomerFields } from "@/lib/customer-profile-completeness";
import { CustomerHomeActions, CustomerHomeHeader, CustomerGreeting, CustomerWalletSummary, DjiwaPayOfferCard } from "@/components/customer/customer-home-sections";
import { MARKETPLACE_BRAND_NAME } from "@/lib/marketplace-config";
import { CustomerHomeDiscovery } from "@/components/customer/customer-home-discovery";

type GuestData = {
	name: string;
	email: string;
	phone: string;
	username: string;
};

function MerchandisePromoBanner() {
	return (
		<a href="https://merchandise.yumme.id/" aria-label="Jelajahi Merchandise Djiwa Tentram" className="relative block overflow-hidden rounded-[22px] border border-border bg-card shadow-sm transition-transform duration-[180ms] hover:-translate-y-0.5 active:scale-[.99]">
			<img src="/merchandise-promo-banner-v2.png" alt="Bawa Rasa Tentram ke Setiap Hari — Jelajahi Merchandise" className="block h-auto w-full" loading="lazy" />
		</a>
	);
}
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
	const { isAuthenticated, isLoading, customer, logout, refreshCustomer } = useCustomerAuth();
	const { setCart } = useOrderContext();
	const siteSettings = useHybridSiteSettings();
	const [showMemberOnboarding, setShowMemberOnboarding] = useState(false);
	const [showProfileCompletion, setShowProfileCompletion] = useState(false);
	const [confirmedProfileSourceId, setConfirmedProfileSourceId] = useState<string | null>(null);

	const storeName = import.meta.env.VITE_BRAND_NAME || MARKETPLACE_BRAND_NAME;
	const logoUrl = siteSettings?.logoUrl || "/logo-djiwa.png";
	const djiwaAppHref = isAuthenticated && customer ? `https://djiwatentram.yumme.id/${encodeURIComponent(username)}` : "https://djiwatentram.yumme.id/daftar";
	const djiwaHistoryHref = isAuthenticated && customer ? `https://djiwatentram.yumme.id/${encodeURIComponent(username)}/riwayat` : "https://djiwatentram.yumme.id/daftar";

	const matches = useMatches();
	const isChildRoute = matches.some(m => m.routeId.startsWith("/$username/") && m.routeId !== "/$username");
	const isOrderChild = matches.some(m => m.routeId.startsWith("/$username/order"));
	const customerNav = [
		{ label: "Djiwa App", icon: <Djiwa3DIcon name="navigation-home" size="micro" alt="" className="h-5 w-5 object-contain" />, active: false, onSelect: () => window.location.assign(djiwaAppHref) },
		{ label: "Menu Merch", icon: <Djiwa3DIcon name="delivery-management" size="micro" alt="" className="h-5 w-5 object-contain" />, active: location.pathname === `/${username}`, onSelect: () => navigate({ to: "/$username", params: { username } }) },
		{ label: "Pesan", icon: <Djiwa3DIcon name="navigation-order" size="micro" alt="" className="h-5 w-5 object-contain" />, active: location.pathname.includes("/order"), onSelect: () => navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } }) },
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
				{showProfileCompletion && customer ? <ProfileCompletionOnboarding name={customer.name || customer.username || "Member"} email={customer.email ?? ""} phone={customer.phone ?? ""} onSave={saveProfileCompletion} /> : null}
			</>
		);
	}

	// ── Guest view ─────────────────────────────────
	if (guestData && !isAuthenticated) {
		const isCurrentGuest = loadGuestData()?.username === username;
		return (
			<div className="app-page merchandise-app min-h-app">
				<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
					<CustomerHomeHeader logoUrl={logoUrl} storeName={storeName} eyebrow="Tamu" title={storeName} />
					<CustomerLiveShiftIndicator />
					<main className="flex-1 space-y-5 px-4 py-4 pb-32">
						<CustomerGreeting name={guestData.name} />
						<MerchandisePromoBanner />
						<section className="rounded-3xl border border-border bg-card p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Mulai dari sini</p><p className="mt-1 text-sm font-black">Temukan koleksi merchandise pilihan.</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Masuk sebagai member untuk memakai Djiwa Pay dan mendapatkan benefit.</p></section>
						<CustomerHomeDiscovery onMenu={() => navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } })} />
						<DjiwaPayOfferCard isMember={false} onAction={() => navigate({ to: "/masuk" })} />
						<CustomerHomeActions onHistory={() => window.location.assign(djiwaHistoryHref)} onOrder={() => navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } })} />
						{!isCurrentGuest ? <p className="text-center text-[10px] text-muted-foreground">Halaman ini milik {guestData.name}. <button type="button" className="font-bold underline" onClick={() => navigate({ to: "/daftar" })}>Mulai sebagai dirimu</button></p> : null}
					</main>
				</div>
				<CustomerBottomNav items={customerNav} />
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
			<div className="app-page merchandise-app min-h-app">
				<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
					<CustomerHomeHeader
						logoUrl={logoUrl}
						storeName={storeName}
						eyebrow="Member"
						title={displayName}
						action={<button type="button" aria-label="Keluar" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform duration-[180ms] hover:bg-destructive/10 hover:text-destructive active:scale-[.97]" onClick={async () => { setCart([]); await logout(); navigate({ to: "/" }); }}><LogOut className="h-4 w-4" /></button>}
					/>
					<CustomerLiveShiftIndicator />
					{!isContactComplete && missingContactFields.length > 0 ? <div className="mx-3 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950 shadow-sm" role="alert"><div className="flex items-start gap-2.5"><span className="mt-0.5 text-base">!</span><div className="min-w-0 flex-1"><p className="text-xs font-black">Lengkapi data akun</p><p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/80">{getCustomerContactMessage(missingContactFields)}</p></div><button className="min-h-11 shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-black text-white active:scale-[.97]" onClick={() => window.location.assign(`https://djiwatentram.yumme.id/${username}/profile`)} type="button">Lengkapi</button></div></div> : null}
					<main className="flex-1 space-y-5 px-4 py-4 pb-32">
						<CustomerGreeting name={displayName} />
						<MerchandisePromoBanner />
						<CustomerWalletSummary customer={customer} onTopup={() => window.location.assign(`https://djiwatentram.yumme.id/${username}/saldo`)} />
						<CustomerHomeDiscovery onMenu={() => navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } })} />
						<DjiwaPayOfferCard isMember onAction={() => window.location.assign(`https://djiwatentram.yumme.id/${username}/saldo`)} />
						<CustomerHomeActions onHistory={() => window.location.assign(djiwaHistoryHref)} onOrder={() => navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } })} />
					</main>
				</div>
			</div>
			<CustomerBottomNav items={customerNav} />
			{showProfileCompletion && customer ? <ProfileCompletionOnboarding name={displayName} email={customer.email ?? ""} phone={customer.phone ?? ""} onSave={saveProfileCompletion} /> : null}
			{!showProfileCompletion && showMemberOnboarding && customer ? <MemberOnboarding name={displayName} onDismiss={dismissMemberOnboarding} onStartOrdering={() => { dismissMemberOnboarding(); navigate({ to: "/$username/order", params: { username }, search: { step: "menu" } }); }} /> : null}
		</>
	);
}
