import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { CartProvider } from "@/context/cart-context";
import { AppDataProvider } from "@/context/app-data-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { AppUpdatePrompt } from "@/components/app-update-prompt";
import { notifyAppUpdateAvailable, setPwaUpdateHandler, startAppUpdatePolling } from "@/lib/app-update";
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

const SW_HANDLED_KEY = "__sw_handled_version__";

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
	updateSW = registerSW({
			onNeedRefresh() {
				// SessionStorage guard: jika update spurious (sama) sudah pernah
				// di-handle di sesi ini, skip sepenuhnya — cegah loop.
				if (sessionStorage.getItem(SW_HANDLED_KEY) === APP_VERSION.semantic) {
					return;
				}

				// Fetch actual latest version from version.json for accurate display
				fetch(`/version.json?t=${Date.now()}`, {
					cache: "no-store",
					headers: { "Cache-Control": "no-cache" },
				})
					.then((res) => (res.ok ? res.json() : null))
					.then((payload) => {
						const latestVersion = payload?.version || APP_VERSION.semantic;
						const latestCommit = payload?.commitHash || payload?.commit || APP_VERSION.commitHash;
						const buildDate = payload?.buildDate || undefined;

						// Anti-loop: jika versi sama, jangan reload —
						// cukup SKIP_WAITING silent di background
						if (
							latestVersion === APP_VERSION.semantic &&
							(latestCommit === APP_VERSION.commitHash || !latestCommit)
						) {
							sessionStorage.setItem(SW_HANDLED_KEY, APP_VERSION.semantic);
							if ("serviceWorker" in navigator) {
								navigator.serviceWorker.getRegistrations().then((regs) => {
									regs.forEach((reg) => {
										if (reg.waiting) {
											reg.waiting.postMessage({ type: "SKIP_WAITING" });
										}
									});
								});
							}
							return;
						}

						notifyAppUpdateAvailable({
							latestVersion,
							latestCommit,
							buildDate,
						});
					})
					.catch(() => {
						// fetch /version.json gagal — set flag + silent SW activation
						sessionStorage.setItem(SW_HANDLED_KEY, APP_VERSION.semantic);
						if (updateSW) {
							void updateSW(true).catch(() => window.location.reload());
						}
					});
		},
	});
	setPwaUpdateHandler(updateSW);
	startAppUpdatePolling();

	// Force service worker update check when user returns to the PWA
	// (critical for mobile where SW lifecycle is throttled by the OS)
	if (typeof document !== "undefined") {
		let lastCheck = 0;
		const MIN_CHECK_INTERVAL = 30_000; // throttle to max once per 30s

		const forceUpdateCheck = async () => {
			if (!("serviceWorker" in navigator)) return;
			try {
				const registrations = await navigator.serviceWorker.getRegistrations();
				await Promise.all(
					registrations.map(async (reg) => {
						await reg.update().catch(() => undefined);
					}),
				);
			} catch {
				// silently ignore — browser may throttle
			}
		};

		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState !== "visible") return;
			const now = Date.now();
			if (now - lastCheck < MIN_CHECK_INTERVAL) return;
			lastCheck = now;
			void forceUpdateCheck();
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
