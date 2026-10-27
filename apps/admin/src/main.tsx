import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { CartProvider } from "@/context/cart-context";
import { AppDataProvider } from "@/context/app-data-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { AppUpdatePrompt } from "@/components/app-update-prompt";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { startAppUpdatePolling, checkForAppUpdate, setPwaUpdateHandler } from "@/lib/app-update";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { installNumberInputBehavior } from "@yumipos/web-shared";

// Set up Router instance

installNumberInputBehavior();
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

const rootElement = document.getElementById("root")!;

// Register service worker in prompt mode so users see the update dialog first.
const updateSW = registerSW({
	immediate: true,
	onNeedRefresh() {
		// SW bisa mendeteksi perubahan byte/cache walaupun release metadata
		// masih sama. Checker versi menentukan apakah update benar-benar baru.
		void checkForAppUpdate();
	},
});
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
						<PwaInstallPrompt />
						<Toaster richColors />
					</CartProvider>
				</AppDataProvider>
			</ThemeProvider>
		</ErrorBoundary>
	);
}
