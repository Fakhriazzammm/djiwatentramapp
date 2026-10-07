import { createLazyFileRoute, Outlet, useLocation, useMatches, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogIn, ShieldCheck } from "lucide-react";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerOrders } from "@/hooks/use-customer-data";
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
import { CustomerLiveOrderCard } from "@/components/customer/customer-live-order-card";

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
	const { isAuthenticated, isLoading, customer, login, logout, register, resetPassword, signInWithGoogle, registrationNeedsEmailConfirm, refreshCustomer, confirmCustomerConsent } = useCustomerAuth();
	const { setCart } = useOrderContext();
	const { orders: customerOrders } = useCustomerOrders();
	const siteSettings = useHybridSiteSettings();
	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [authError, setAuthError] = useState<string | undefined>(undefined);
	const [showMemberOnboarding, setShowMemberOnboarding] = useState(false);
	const [showProfileCompletion, setShowProfileCompletion] = useState(false);
	const [confirmedProfileSourceId, setConfirmedProfileSourceId] = useState<string | null>(null);
	const [consentPromptSaving, setConsentPromptSaving] = useState(false);
	const [notificationSeenAt, setNotificationSeenAt] = useState<number>(() => {
		try {
			const stored = Number(localStorage.getItem("djiwa-customer-notif-seen"));
			return Number.isFinite(stored) && stored > 0 ? stored : Date.now();
		} catch {
			return Date.now();
		}
	});
	const unreadNotificationCount = isAuthenticated && customer
		? customerOrders.filter((order) => order.createdAt > notificationSeenAt).length
		: 0;

	useEffect(() => {
		const handleStorage = (event: StorageEvent) => {
			if (event.key !== "djiwa-customer-notif-seen") return;
			const next = Number(event.newValue);
			if (Number.isFinite(next) && next > 0) setNotificationSeenAt(next);
		};
		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, []);

	const storeName = import.meta.env.VITE_BRAND_NAME || "Djiwatentram";
	const logoUrl = siteSettings?.logoUrl || "/logo-djiwa.png";
	const b2bChannelHref = isAuthenticated && customer ? `https://b2b.yumme.id/${encodeURIComponent(username)}/order?step=menu` : "https://b2b.yumme.id/daftar";
	const merchandiseChannelHref = isAuthenticated && customer ? `https://merchandise.yumme.id/${encodeURIComponent(username)}/order?step=menu` : "https://merchandise.yumme.id/daftar";

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

	const acceptExistingConsent = async () => {
		if (consentPromptSaving) return;
		if (!customer?.email) {
			toast.error("Email akun belum tersedia. Silakan keluar dan masuk kembali sebelum menyetujui.");
			return;
		}

		setConsentPromptSaving(true);
		try {
			const result = await invokeEdgeFunction<{
				customer?: {
					marketing_consent?: boolean;
					share_purchase_activity?: boolean;
				} | null;
			}>("customer-sync", {
				action: "updateProfile",
				sourceId: customer.sourceId,
				email: customer.email,
				name: customer.name ?? "",
				marketingConsent: true,
				sharePurchaseActivity: true,
				purchaseActivityNameMode: "first_name",
			});
			if (result.customer?.marketing_consent !== true || result.customer?.share_purchase_activity !== true) {
				throw new Error("Consent update was not confirmed");
			}

			confirmCustomerConsent(customer.sourceId);
			toast.success("Persetujuan berhasil disimpan.");
			void refreshCustomer();
		} catch {
			toast.error("Persetujuan belum berhasil disimpan. Silakan coba lagi.");
		} finally {
			setConsentPromptSaving(false);
		}
	};
	const saveProfileCompletion = async (phone: string) => {
		if (!customer?.email) throw new Error("Email akun belum tersedia. Silakan keluar dan masuk kembali.");
		const normalizedPhone = phone.replace(/[^\d]/g, "");
		const result = await invokeEdgeFunction<{
			customer?: { phone?: string | null } | null;
		}>("customer-sync", {
			action: "updateProfile",
			sourceId: customer.sourceId,
			email: customer.email,
			name: customer.name ?? "",
			phone: phone.trim(),
		});
		const savedPhone = result.customer?.phone?.replace(/[^\d]/g, "") ?? "";
		if (savedPhone !== normalizedPhone) {
			throw new Error("Nomor WhatsApp belum terkonfirmasi tersimpan. Silakan coba lagi.");
		}
		setConfirmedProfileSourceId(customer.sourceId);
		setShowProfileCompletion(false);
		await refreshCustomer();
	};

	const authModal = (
		<AuthModal
			open={authModalOpen}
			onOpenChange={(val) => { setAuthModalOpen(val); if (!val) setAuthError(undefined); }}
			onLogin={async (email, password) => { try { setAuthError(undefined); await login(email, password); } catch (e: any) { setAuthError(e?.message || "Gagal masuk"); } }}
			onRegister={async (email, password, name, consentAll) => { try { setAuthError(undefined); await register(email, password, name, consentAll); } catch (e: any) { setAuthError(e?.message || "Gagal mendaftar"); } }}
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
				{customer && !customer.sharePurchaseActivity ? <ExistingConsentPrompt saving={consentPromptSaving} onAccept={acceptExistingConsent} onOpenProfile={() => navigate({ to: "/$username/profile", params: { username } })} /> : null}
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
					<main className="flex-1 space-y-3 px-3 py-3 pb-32">
						<B2BPromoBanner href={b2bChannelHref} />
						<section className="rounded-3xl border border-border bg-card p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Mulai dari sini</p><p className="mt-1 text-sm font-black">Pesan menu favoritmu dengan mudah.</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Masuk sebagai member untuk memakai Djiwa Pay dan mendapatkan benefit.</p></section>
						{customerOrders.filter((order) => !["completed", "cancelled"].includes(order.trackingStatus || order.status)).slice(0, 1).map((order) => <CustomerLiveOrderCard key={order.id} order={order} onOpen={() => navigate({ to: "/$username/order", params: { username }, search: { step: "receipt", orderId: order.id } })} />)}
						<RecentOrdersCarousel username={username} />
						<DjiwaPayOfferCard isMember={false} onAction={() => navigate({ to: "/masuk" })} />
						<CustomerHomeServiceGrid
							onOrder={() => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } })}
							onPromo={() => navigate({ to: "/$username/promo", params: { username } })}
							onWallet={() => navigate({ to: "/$username/saldo", params: { username } })}
							onHistory={() => navigate({ to: "/$username/riwayat", params: { username } })}
							onCommunity={() => navigate({ to: "/$username/komunitas", params: { username } })}
							onMerchandise={() => window.location.assign(merchandiseChannelHref)}
							onBooking={() => window.location.assign("https://booking.yumme.id/")}
							onDjiwaRun={() => navigate({ to: "/$username/run", params: { username } })}
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
									className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-sm transition-transform duration-[180ms] active:scale-[.97] ${unreadNotificationCount > 0 ? "animate-djiwa-notification-bell" : ""}`}
								>
									<Djiwa3DIcon name="notifications-alerts" size="micro" alt="" className="h-5 w-5 object-contain" />
									{unreadNotificationCount > 0 ? <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-red-500 px-1 text-[9px] font-black leading-none text-white" aria-label={`${unreadNotificationCount} notifikasi belum dibaca`}>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span> : null}
								</button>
							</div>
						}
					/>
					<CustomerLiveShiftIndicator />
					{!isContactComplete && missingContactFields.length > 0 ? <div className="mx-3 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950 shadow-sm" role="alert"><div className="flex items-start gap-2.5"><span className="mt-0.5 text-base">!</span><div className="min-w-0 flex-1"><p className="text-xs font-black">Lengkapi data akun</p><p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/80">{getCustomerContactMessage(missingContactFields)}</p></div><button className="min-h-11 shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-black text-white active:scale-[.97]" onClick={() => navigate({ to: "/$username/profile", params: { username } })} type="button">Lengkapi</button></div></div> : null}
					<main className="flex-1 space-y-3 px-3 py-3 pb-32">
						<CustomerStoryRail />
						<CustomerWalletSummary customer={customer} onTopup={() => navigate({ to: "/$username/saldo", params: { username } })} />
						{customerOrders.filter((order) => !["completed", "cancelled"].includes(order.trackingStatus || order.status)).slice(0, 1).map((order) => <CustomerLiveOrderCard key={order.id} order={order} onOpen={() => navigate({ to: "/$username/order", params: { username }, search: { step: "receipt", orderId: order.id } })} />)}
						<CustomerHomeServiceGrid
							onOrder={() => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } })}
							onPromo={() => navigate({ to: "/$username/promo", params: { username } })}
							onWallet={() => navigate({ to: "/$username/saldo", params: { username } })}
							onHistory={() => navigate({ to: "/$username/riwayat", params: { username } })}
							onCommunity={() => navigate({ to: "/$username/komunitas", params: { username } })}
							onMerchandise={() => window.location.assign(merchandiseChannelHref)}
							onBooking={() => window.location.assign("https://booking.yumme.id/")}
							onDjiwaRun={() => navigate({ to: "/$username/run", params: { username } })}
						/>
						<RecentOrdersCarousel username={username} />
						<DjiwaPayOfferCard isMember onAction={() => navigate({ to: "/$username/saldo", params: { username } })} />
						<CustomerHomeDiscovery onMenu={() => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } })} b2bHref={b2bChannelHref} />
					</main>
				</div>
			</div>
			<CustomerBottomNav items={customerNav} />
			{authModal}
			{customer && !customer.sharePurchaseActivity ? <ExistingConsentPrompt saving={consentPromptSaving} onAccept={acceptExistingConsent} onOpenProfile={() => navigate({ to: "/$username/profile", params: { username } })} /> : null}
			{showProfileCompletion && customer ? <ProfileCompletionOnboarding name={displayName} email={customer.email ?? ""} phone={customer.phone ?? ""} onSave={saveProfileCompletion} /> : null}
			{!showProfileCompletion && showMemberOnboarding && customer ? <MemberOnboarding name={displayName} onDismiss={dismissMemberOnboarding} onStartOrdering={() => { dismissMemberOnboarding(); navigate({ to: "/$username/order", params: { username }, search: { step: "table" } }); }} /> : null}
		</>
	);
}


function ExistingConsentPrompt({ saving, onAccept, onOpenProfile }: { saving: boolean; onAccept: () => void; onOpenProfile: () => void }) {
	return <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl border border-cyan-200 bg-white p-3 shadow-xl"><p className="text-xs font-black text-slate-950">Persetujuan Djiwa</p><p className="mt-1 text-[10px] leading-relaxed text-slate-600">Setujui penggunaan data untuk layanan, marketing, cookies non-esensial, dan aktivitas pembelian di Komunitas.</p><div className="mt-2 flex items-center gap-2"><button type="button" disabled={saving} onClick={onAccept} className="min-h-8 flex-1 rounded-lg bg-cyan-700 px-3 text-[10px] font-black text-white disabled:opacity-60">{saving ? "Menyimpan..." : "Saya setuju"}</button><button type="button" disabled={saving} onClick={onOpenProfile} className="min-h-8 rounded-lg border border-slate-200 px-3 text-[10px] font-bold text-slate-700">Lihat Profil</button></div></div>;
}
