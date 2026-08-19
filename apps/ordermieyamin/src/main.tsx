import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { AppUpdatePrompt } from "@/components/app-update-prompt";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { startAppUpdatePolling, checkForAppUpdate } from "@/lib/app-update";
import { registerSW } from "virtual:pwa-register";
import "./index.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// Register service worker and notify the global prompt when a new worker waits.
registerSW({
	immediate: true,
	onNeedRefresh: () => {
		void checkForAppUpdate();
	},
});

// Start polling /version.json for update detection
startAppUpdatePolling();

// Visibility change → check for updates
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

const rootEl = document.getElementById("root");
if (rootEl) {
	const root = createRoot(rootEl);
	root.render(
		<StrictMode>
			<RouterProvider router={router} />
			<AppUpdatePrompt />
			<PwaInstallPrompt />
		</StrictMode>,
	);
}
