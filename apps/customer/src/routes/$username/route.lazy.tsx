import { createLazyFileRoute, Outlet, useLocation, useMatches, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerSplashGate } from "@/hooks/use-customer-splash-gate";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { useCustomerStories } from "@/features/stories/use-customer-stories";
import { useOrderContext } from "@/hooks/use-order-context";
import { useHybridAllProducts, useHybridBestSellers, useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { AuthModal } from "@/components/customer/auth-modal";
import { MemberOnboarding, ProfileCompletionOnboarding } from "@/components/customer/member-onboarding";
import { CustomerBottomNav, CustomerLiveShiftIndicator, type CustomerBottomNavItem } from "@/components/customer/customer-shell";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { CustomerSplash } from "@/components/customer/customer-entry";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { getCustomerContactMessage, getMissingCustomerFields } from "@/lib/customer-profile-completeness";
import { HomeFriendActivity, HomeTopSellersToday, HomeGuestWallet, HomeQuickPicks, HomeServiceRail, HomeShortcuts, HomeSky, HomeTop, HomeWalletCard, type WalletAction } from "@/components/customer/customer-home-v2";
import { CustomerStoryRail } from "@/features/stories/customer-story-rail";
import { useDayPeriod } from "@/lib/day-period";
import { JumatBerkahBanner } from "@/components/customer/jumat-berkah";
import { ReviewPromptCarousel } from "@/components/customer/review-prompt-carousel";
import { HomeRestaurantInfo, useLiveShift } from "@/components/customer/customer-home-editorial";
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

export const Route = createLazyFileRoute("/$username")({
	component: MemberHomePage,
});

function MemberHomePage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { isAuthenticated, isLoading, customer, login, logout, register, resetPassword, signInWithGoogle, registrationNeedsEmailConfirm, refreshCustomer } = useCustomerAuth();
	const { setCart } = useOrderContext();
	const { orders: customerOrders, isLoading: ordersLoading } = useCustomerOrders();
	const storyBootstrap = useCustomerStories(Boolean(customer));
	const homeProducts = useHybridAllProducts();
	const homeBestSellers = useHybridBestSellers();
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

	const period = useDayPeriod();
	const isLive = useLiveShift();
	const storeName = import.meta.env.VITE_BRAND_NAME || "Djiwatentram";
	const merchandiseChannelHref = isAuthenticated && customer ? `https://merchandise.djiwatentram.web.id/${encodeURIComponent(username)}/order?step=menu` : "https://merchandise.djiwatentram.web.id/daftar";

	const matches = useMatches();
	const isChildRoute = matches.some(m => m.routeId.startsWith("/$username/") && m.routeId !== "/$username");
	const isOrderChild = matches.some(m => m.routeId.startsWith("/$username/order"));
	const isCommunityChild = matches.some(m => m.routeId.startsWith("/$username/komunitas"));
	const homeDataReady = !customer || (!ordersLoading && homeProducts !== undefined && homeBestSellers !== undefined && siteSettings !== undefined && storyBootstrap.state !== "loading");
	const goCustomerPath = (path: string) => {
		if (typeof window !== "undefined") window.location.assign(path);
	};
	const goDjiwaPay = () => {
		if (typeof window === "undefined") return;
		window.location.assign(`/${encodeURIComponent(username)}/saldo`);
	};
	const goWalletAction = (action: WalletAction) => {
		if (typeof window === "undefined") return;
		window.location.assign(`/${encodeURIComponent(username)}/saldo?aksi=${action}`);
	};
	const customerNav: CustomerBottomNavItem[] = [
		{ label: "Home", active: location.pathname === `/${username}`, onSelect: () => goCustomerPath(`/${encodeURIComponent(username)}`) },
		{ label: "Pesan", active: location.pathname.includes("/order"), onSelect: () => goCustomerPath(`/${encodeURIComponent(username)}/order?step=table`) },
		{ label: "Komunitas", active: location.pathname.includes("/komunitas"), onSelect: () => goCustomerPath(`/${encodeURIComponent(username)}/komunitas`) },
		{ label: "Saldo", active: location.pathname.includes("/saldo"), onSelect: goDjiwaPay },
		{ label: "Profil", active: location.pathname.includes("/profile"), onSelect: () => goCustomerPath(`/${encodeURIComponent(username)}/profile`) },
	];

	const goMenu = () => navigate({ to: "/$username/order", params: { username }, search: { step: "table" } });
	const goCommunity = () => navigate({ to: "/$username/komunitas", params: { username } });
	const openJumatBerkah = () => navigate({ to: "/$username/jumat-berkah", params: { username }, search: {} });
	const donateJumatBerkah = () => navigate({ to: "/$username/jumat-berkah", params: { username }, search: { step: "sedekah" } });
	const donateJumatBerkahAsGuest = () => {
		try { window.sessionStorage.setItem("djiwa.jumatBerkah.intent", "1"); } catch { /* mode privat */ }
		navigate({ to: "/masuk", search: { next: "jumat-berkah" } as never });
	};
	const serviceHandlers = {
		onOrder: goMenu,
		onPromo: () => navigate({ to: "/$username/promo", params: { username } }),
		onWallet: goDjiwaPay,
		onHistory: () => navigate({ to: "/$username/riwayat", params: { username } }),
		onCommunity: goCommunity,
		onMerchandise: () => window.location.assign(merchandiseChannelHref),
		onBooking: () => window.location.assign("https://booking.djiwatentram.web.id/"),
		onDjiwaRun: () => navigate({ to: "/$username/run", params: { username } }),
		onJumatBerkah: () => navigate({ to: "/$username/jumat-berkah", params: { username }, search: {} }),
	};
	const activeOrderCards = customerOrders
		.filter((order) => !["completed", "cancelled"].includes(order.trackingStatus || order.status))
		.slice(0, 1)
		.map((order) => <CustomerLiveOrderCard key={order.id} order={order} onOpen={() => navigate({ to: "/$username/order", params: { username }, search: { step: "receipt", orderId: order.id } })} />);

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
		if (!customer?.email || consentPromptSaving) return;
		setConsentPromptSaving(true);
		try {
			await invokeEdgeFunction("customer-sync", {
				action: "updateProfile",
				sourceId: customer.sourceId,
				email: customer.email,
				name: customer.name ?? "",
				marketingConsent: true,
				sharePurchaseActivity: true,
				purchaseActivityNameMode: "first_name",
			});
			await refreshCustomer();
		} finally {
			setConsentPromptSaving(false);
		}
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
	const authResolved = resolved && (guestData ? true : !isLoading);
	const memberDataReady = isChildRoute || !customer || homeDataReady;
	const splashGate = useCustomerSplashGate({
		ready: authResolved && memberDataReady,
		// Resolve mengikuti kesiapan data saja; kalau auth menyusul belakangan,
		// animasi logo sudah selesai sehingga tidak menahan splash.
		resolveWhen: memberDataReady,
		// Degradasi hanya aman setelah identitas pengguna diketahui; kalau auth
		// sendiri belum resolve, satu-satunya jalan keluar adalah tombol coba lagi.
		allowDegrade: authResolved,
	});

	if (splashGate.visible) {
		return <CustomerSplash storeName={storeName} {...splashGate.splashProps} />;
	}

	// ── Child route aktif ──────────────────────────
	// PENTING: render Outlet untuk guest MAUPUN member — guard per-halaman
	// dilakukan di masing-masing child page. Sebelumnya guest kena
	// `if (!customer) return null` → halaman blank untuk semua tombol menu.
	if (isChildRoute) {
		return (
			<>
				{/* Halaman pesan memakai satu area scroll saja (di dalam halamannya): kolom setinggi layar, tanpa padding nav bawah. */}
				<div className={isOrderChild ? "flex h-app flex-col overflow-hidden" : "min-h-app pb-safe-with-nav"}>
					{!isCommunityChild ? <CustomerLiveShiftIndicator /> : null}
					{isOrderChild ? <div className="min-h-0 flex-1"><Outlet /></div> : <Outlet />}
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
					<div className="relative isolate">
						<HomeSky period={period} />
						<HomeTop period={period} name={guestData.name} points={null} onSearch={goMenu} onPoints={() => navigate({ to: "/masuk" })} />
						<main className="px-3 pb-32">
							<HomeShortcuts isLive={isLive} onOrder={goMenu} onPromo={serviceHandlers.onPromo} onBooking={serviceHandlers.onBooking} />
							{activeOrderCards.length > 0 ? <div className="mt-2.5 space-y-2.5">{activeOrderCards}</div> : null}
							<HomeGuestWallet onLogin={() => navigate({ to: "/masuk" })} />
							<HomeServiceRail {...serviceHandlers} />
							<div className="mt-3 space-y-3">
								<JumatBerkahBanner onOpen={openJumatBerkah} onDonate={donateJumatBerkahAsGuest} />
								<HomeQuickPicks username={username} />
								<HomeTopSellersToday username={username} />
								<HomeFriendActivity onOpenCommunity={goCommunity} />
								<HomeRestaurantInfo />
								{!isCurrentGuest ? <p className="text-center text-[10px] text-muted-foreground">Halaman ini milik {guestData.name}. <button type="button" className="font-bold underline" onClick={() => navigate({ to: "/daftar" })}>Mulai sebagai dirimu</button></p> : null}
							</div>
						</main>
					</div>
				</div>
				<CustomerBottomNav items={customerNav} />
				{authModal}
			</div>
		);
	}

	// ── Member view (authenticated) ────────────────
	// Auth/username redirects can briefly render this route before customer
	// profile state is ready. Keep a visible loading surface instead of blanking.
	if (!customer) return <CustomerPageSkeleton label="Menyiapkan akun" />;

	const displayName = customer.name || customer.username || "Member";
	const missingContactFields = getMissingCustomerFields(customer);
	const isContactComplete = confirmedProfileSourceId === customer.sourceId || missingContactFields.length === 0;

	return (
		<>
			<div className="app-page min-h-app">
				<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
					<div className="relative isolate">
						<HomeSky period={period} />
						<HomeTop
							period={period}
							name={displayName}
							points={Number(customer.totalPoints ?? 0)}
							unread={unreadNotificationCount}
							onSearch={goMenu}
							onPoints={() => navigate({ to: "/$username/poin", params: { username } })}
							onBell={() => navigate({ to: "/$username/notifikasi", params: { username } })}
						/>
						<main className="px-3 pb-32">
							<HomeShortcuts isLive={isLive} onOrder={goMenu} onPromo={serviceHandlers.onPromo} onBooking={serviceHandlers.onBooking} />
							{!isContactComplete && missingContactFields.length > 0 ? <div className="mx-3 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950 shadow-sm" role="alert"><div className="flex items-start gap-2.5"><span className="mt-0.5 text-base">!</span><div className="min-w-0 flex-1"><p className="text-xs font-black">Lengkapi data akun</p><p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/80">{getCustomerContactMessage(missingContactFields)}</p></div><button className="min-h-11 shrink-0 rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-black text-white active:scale-[.97]" onClick={() => navigate({ to: "/$username/profile", params: { username } })} type="button">Lengkapi</button></div></div> : null}
							{activeOrderCards.length > 0 ? <div className="mt-2.5 space-y-2.5">{activeOrderCards}</div> : null}
							<HomeWalletCard customer={customer} onOpen={goDjiwaPay} onAction={goWalletAction} />
							<HomeServiceRail {...serviceHandlers} />
							<div className="mt-3 space-y-3">
								<ReviewPromptCarousel orders={customerOrders} />
								<JumatBerkahBanner onOpen={openJumatBerkah} onDonate={donateJumatBerkah} />
								<HomeQuickPicks username={username} />
								<CustomerStoryRail onOpenCommunity={goCommunity} />
								<HomeTopSellersToday username={username} />
								<HomeFriendActivity onOpenCommunity={goCommunity} />
								<HomeRestaurantInfo />
							</div>
						</main>
					</div>
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
