import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { CartProvider } from "@/context/cart-context";
import { AppDataProvider } from "@/context/app-data-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { AppUpdatePrompt } from "@/components/app-update-prompt";
import { setPwaUpdateHandler, startAppUpdatePolling, checkForAppUpdate } from "@/lib/app-update";
import { registerSW } from "virtual:pwa-register";
import { APP_VERSION } from "@/lib/version";
import "./index.css";

// Set up Router instance
const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	context: {},
});

// Register things for typesafety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// Hermes: trigger Vercel rebuild — contract+payslip live
const rootElement = document.getElementById("root")!;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

const APP_VERSION_STORAGE_KEY = "__app_version__";
const APP_VERSION_REFRESH_KEY = "__app_version_refresh__";

async function refreshAppShellIfVersionChanged() {
	if (typeof window === "undefined") return;

	const previousVersion = localStorage.getItem(APP_VERSION_STORAGE_KEY);
	if (!previousVersion) {
		localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION.semantic);
		sessionStorage.removeItem(APP_VERSION_REFRESH_KEY);
		return;
	}

	if (previousVersion === APP_VERSION.semantic) {
		sessionStorage.removeItem(APP_VERSION_REFRESH_KEY);
		return;
	}

	const alreadyRefreshed = sessionStorage.getItem(APP_VERSION_REFRESH_KEY) === APP_VERSION.semantic;
	localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION.semantic);

	if (alreadyRefreshed) {
		return;
	}

	sessionStorage.setItem(APP_VERSION_REFRESH_KEY, APP_VERSION.semantic);

	try {
		if ("serviceWorker" in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			await Promise.all(
				registrations.map(async (registration) => {
					await registration.update().catch(() => undefined);
					await registration.unregister().catch(() => undefined);
				})
			);
		}

		if ("caches" in window) {
			const cacheNames = await caches.keys();
			await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
		}
	} catch (error) {
		console.warn("Failed to clear stale app shell caches:", error);
	}

	window.location.replace(`${window.location.pathname}?v=${encodeURIComponent(APP_VERSION.semantic)}`);
}

void refreshAppShellIfVersionChanged().finally(() => {
	// registerType: "autoUpdate" di vite.config.ts — SW auto-aktifasi + reload.
	// JANGAN kasih onNeedRefresh karena itu masukkin "prompt mode" yang bikin
	// SW stuck di "waiting" dan loop. Biarkan autoUpdate urus semuanya.
	updateSW = registerSW();
	setPwaUpdateHandler(updateSW);
	startAppUpdatePolling();

	// Force check on visibility change — panggil checkForAppUpdate langsung,
	// bukan lewat SW lifecycle (bisa false-positive byte-diff).
	if (typeof document !== "undefined") {
		let lastCheck = 0;
		const MIN_CHECK_INTERVAL = 30_000;

		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState !== "visible") return;
			const now = Date.now();
			if (now - lastCheck < MIN_CHECK_INTERVAL) return;
			lastCheck = now;
			void checkForAppUpdate();
		});
	}
});

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<ErrorBoundary>
			<ThemeProvider
				attribute="class"
				defaultTheme="light"
				disableTransitionOnChange
				storageKey="vite-ui-theme"
			>
				<AppDataProvider>
					<CartProvider>
						<RouterProvider router={router} />
						<AppUpdatePrompt />
						<Toaster richColors />
					</CartProvider>
				</AppDataProvider>
			</ThemeProvider>
		</ErrorBoundary>
	);
}
