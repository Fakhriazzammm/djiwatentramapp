import { Link, Outlet, createRootRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useGlobalKeyboardNavigation } from "../hooks/useGlobalKeyboardNavigation";
import { useSiteBrandingMetadata } from "../hooks/useSiteBrandingMetadata";
import { useHybridSiteSettings } from "../hooks/use-hybrid-pos-data";
import { preloadFaceModels } from "../components/auth/FaceRecognition";
import { useYumiAuth, YumiAuthProvider } from "../hooks/useYumiAuth";
import { useDemoMode } from "@yumipos/web-shared";
import { useEffect } from "react";
import { clearTransactionVoiceQueue, unlockAudio } from "../lib/transaction-voice-queue";
import { isLoginRoute, isPublicRoute, loginPathFor, RETURN_PATH_KEY, safeReturnPath } from "../lib/route-metadata";
import { Skeleton } from "../components/ui/skeleton";

function PosRoutePending() {
	return (
		<div className="min-h-app bg-background px-3 py-4" aria-busy="true" aria-label="Memuat halaman" role="status">
			<div className="mx-auto max-w-5xl space-y-4">
				<div className="flex items-center justify-between"><Skeleton className="h-8 w-36" /><Skeleton className="h-9 w-24 rounded-xl" /></div>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 rounded-2xl" />)}</div>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-40 rounded-2xl" />)}</div>
			</div>
		</div>
	);
}

function RootContent() {
	const navigate = useNavigate();
	const location = useLocation();
	const { isAuthenticated, isLoading, role } = useYumiAuth();
	const siteSettings = useHybridSiteSettings();

	// Demo mode — client viewer: mask all numbers
	const isDemoViewer = role?.name === "CLIENT_VIEWER";
	useDemoMode(isDemoViewer);

	useGlobalKeyboardNavigation();
	useSiteBrandingMetadata();

	// Unlock browser audio on first user gesture so transaction voice alerts
	// can play even when notifications arrive from a background poll.
	useEffect(() => {
		clearTransactionVoiceQueue();
		const unlock = () => unlockAudio();
		window.addEventListener("pointerdown", unlock, { once: true });
		window.addEventListener("keydown", unlock, { once: true });
		window.addEventListener("touchstart", unlock, { once: true });
		return () => {
			window.removeEventListener("pointerdown", unlock);
			window.removeEventListener("keydown", unlock);
			window.removeEventListener("touchstart", unlock);
		};
	}, []);

	useEffect(() => {
		if (isLoading) return;

		const isPublicPage = isPublicRoute(location.pathname);
		if (!isAuthenticated) {
			if (location.pathname === "/register" && siteSettings?.employeeOnboarding?.registrationEnabled === false) {
				navigate({ to: "/kasir/login", replace: true });
				return;
			}
			if (!isPublicPage) {
				const returnPath = safeReturnPath(location.href);
				try {
					if (returnPath) sessionStorage.setItem(RETURN_PATH_KEY, returnPath);
				} catch { /* Login remains available when browser storage is disabled. */ }
				navigate({ to: loginPathFor(location.pathname), replace: true });
			}
		} else if (!isLoginRoute(location.pathname)) {
			// Login pages first navigate to their normal destination. Restore the
			// interrupted local route on that next render, without changing login flows.
			let returnPath: string | null = null;
			try {
				returnPath = safeReturnPath(sessionStorage.getItem(RETURN_PATH_KEY));
				sessionStorage.removeItem(RETURN_PATH_KEY);
			} catch { /* Storage is optional. */ }
			if (returnPath && returnPath !== location.href) {
				navigate({ href: returnPath, replace: true });
			}
		}
	}, [isAuthenticated, isLoading, location.href, location.pathname, navigate, siteSettings?.employeeOnboarding?.registrationEnabled]);

	// Preload face recognition models saat user login
	useEffect(() => {
		if (isAuthenticated) {
			preloadFaceModels();
		}
	}, [isAuthenticated]);

	if (isLoading || (!isAuthenticated && !isPublicRoute(location.pathname))) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-[#0a0a0b]">
				<div className="relative h-16 w-16">
					<div className="absolute inset-0 rounded-full border-4 border-primary/20" />
					<div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-app bg-background font-sans text-foreground antialiased">
			<Outlet />
		</div>
	);
}

function PosNotFound() {
	return (
		<main className="flex min-h-app flex-col items-center justify-center gap-4 px-6 text-center">
			<p className="text-sm text-muted-foreground">404</p>
			<h1 className="text-2xl font-semibold">Halaman tidak ditemukan</h1>
			<p className="max-w-sm text-muted-foreground">Tautan mungkin sudah berubah. Kembali ke POS untuk melanjutkan pekerjaan.</p>
			<Link to="/menu" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-medium text-primary-foreground">Kembali ke POS</Link>
		</main>
	);
}

export const Route = createRootRoute({
	notFoundComponent: PosNotFound,
	pendingComponent: PosRoutePending,
	component: () => (
		<YumiAuthProvider>
			<RootContent />
		</YumiAuthProvider>
	),
});
