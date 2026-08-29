import { Outlet, createRootRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useGlobalKeyboardNavigation } from "../hooks/useGlobalKeyboardNavigation";
import { useSiteBrandingMetadata } from "../hooks/useSiteBrandingMetadata";
import { useHybridSiteSettings } from "../hooks/use-hybrid-pos-data";
import { preloadFaceModels } from "../components/auth/FaceRecognition";
import { useYumiAuth, YumiAuthProvider } from "../hooks/useYumiAuth";
import { useDemoMode } from "@yumipos/web-shared";
import { useEffect } from "react";
import { clearTransactionVoiceQueue, unlockAudio } from "../lib/transaction-voice-queue";

function RootContent() {
	const navigate = useNavigate();
	const location = useLocation();
	const { isAuthenticated, isLoading, isStaff, isAdmin, user, role } = useYumiAuth();
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

		const isPublicPage =
			location.pathname === "/admin/login" ||
			location.pathname === "/karyawan/login" ||
			location.pathname === "/kasir/login" ||
			location.pathname === "/laporan" ||
			location.pathname === "/register" ||
			location.pathname.startsWith("/register/selesai/");
		
		if (!isAuthenticated) {
			if (location.pathname === "/register" && siteSettings?.employeeOnboarding?.registrationEnabled === false) {
				navigate({ to: "/kasir/login" as any, replace: true });
				return;
			}
			if (!isPublicPage) {
				navigate({ to: "/kasir/login" as any, replace: true });
			}
		}
	}, [isAuthenticated, isLoading, isStaff, user, location.pathname, navigate]);

	// Preload face recognition models saat user login
	useEffect(() => {
		if (isAuthenticated) {
			preloadFaceModels();
		}
	}, [isAuthenticated]);

	if (isLoading) {
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

export const Route = createRootRoute({
	component: () => (
		<YumiAuthProvider>
			<RootContent />
		</YumiAuthProvider>
	),
});
