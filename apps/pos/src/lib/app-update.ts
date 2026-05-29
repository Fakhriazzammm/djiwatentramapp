import { APP_VERSION } from "@/lib/version";

export const APP_UPDATE_EVENT = "djiwa:app-update-available";

const VERSION_ENDPOINT = "/version.json";

export type AppUpdateInfo = {
	currentVersion: string;
	latestVersion: string;
	currentCommit: string;
	latestCommit: string;
	buildDate?: string;
};

let latestUpdateInfo: AppUpdateInfo | null = null;
let applyingUpdate = false;
let registeredSkipWaitingReload = false;
let pwaUpdateHandler: ((reloadPage?: boolean) => Promise<void>) | undefined;

function normalizeVersionValue(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function isNewerBuild(payload: any) {
	const latestVersion = normalizeVersionValue(payload?.version);
	const latestCommit = normalizeVersionValue(payload?.commitHash ?? payload?.commit);

	// Guard: "service-worker-update" adalah nilai fake dari catch block —
	// bukan real build baru. Jangan trigger update dialog.
	if (latestCommit === "service-worker-update") return false;

	if (latestCommit && latestCommit !== APP_VERSION.commitHash) return true;
	if (latestVersion && latestVersion !== APP_VERSION.semantic) return true;

	return false;
}

export function getLatestUpdateInfo() {
	return latestUpdateInfo;
}

export function setPwaUpdateHandler(handler: ((reloadPage?: boolean) => Promise<void>) | undefined) {
	pwaUpdateHandler = handler;
}

export function notifyAppUpdateAvailable(info?: Partial<AppUpdateInfo>) {
	latestUpdateInfo = {
		currentVersion: APP_VERSION.semantic,
		latestVersion: info?.latestVersion || latestUpdateInfo?.latestVersion || APP_VERSION.semantic,
		currentCommit: APP_VERSION.commitHash,
		latestCommit: info?.latestCommit || latestUpdateInfo?.latestCommit || APP_VERSION.commitHash,
		buildDate: info?.buildDate || latestUpdateInfo?.buildDate,
	};

	window.dispatchEvent(new CustomEvent<AppUpdateInfo>(APP_UPDATE_EVENT, { detail: latestUpdateInfo }));
}

export async function checkForAppUpdate() {
	if (typeof window === "undefined" || APP_VERSION.isDev) return null;

	try {
		const response = await fetch(`${VERSION_ENDPOINT}?t=${Date.now()}`, {
			cache: "no-store",
			headers: {
				"Cache-Control": "no-cache",
				Pragma: "no-cache",
			},
		});

		if (!response.ok) return null;

		const payload = await response.json();
		if (!isNewerBuild(payload)) return null;

		const updateInfo: AppUpdateInfo = {
			currentVersion: APP_VERSION.semantic,
			latestVersion: normalizeVersionValue(payload.version) || APP_VERSION.semantic,
			currentCommit: APP_VERSION.commitHash,
			latestCommit: normalizeVersionValue(payload.commitHash ?? payload.commit) || APP_VERSION.commitHash,
			buildDate: normalizeVersionValue(payload.buildDate) || undefined,
		};

		notifyAppUpdateAvailable(updateInfo);
		return updateInfo;
	} catch (error) {
		console.warn("Gagal cek versi aplikasi terbaru:", error);
		return null;
	}
}

export function startAppUpdatePolling(intervalMs = 60_000) {
	if (typeof window === "undefined" || APP_VERSION.isDev) {
		return () => undefined;
	}

	void checkForAppUpdate();
	const interval = window.setInterval(() => {
		void checkForAppUpdate();
	}, intervalMs);

	return () => window.clearInterval(interval);
}

export async function applyAppUpdate() {
	if (typeof window === "undefined" || applyingUpdate) return;
	applyingUpdate = true;

	// Anti-loop: jika versi sama dengan latest, tidak perlu SW skip-waiting —
	// langsung reload. Ini mencegah update loop palsu saat SW byte-diff
	// terdeteksi tapi konten tidak berubah.
	if (latestUpdateInfo && latestUpdateInfo.currentVersion === latestUpdateInfo.latestVersion) {
		window.location.replace(
			`${window.location.pathname}?v=${encodeURIComponent(APP_VERSION.semantic)}&t=${Date.now()}`,
		);
		return;
	}

	// Safety net: force reload after 12 seconds no matter what
	const FALLBACK_TIMEOUT_MS = 12_000;
	const fallbackTimer = window.setTimeout(() => {
		window.location.reload();
	}, FALLBACK_TIMEOUT_MS);

	try {
		if ("serviceWorker" in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();

			if (!registeredSkipWaitingReload) {
				registeredSkipWaitingReload = true;
				navigator.serviceWorker.addEventListener("controllerchange", () => {
					window.clearTimeout(fallbackTimer);
					window.location.reload();
				});
			}

			await Promise.all(
				registrations.map(async (registration) => {
					await registration.update().catch(() => undefined);
					if (registration.waiting) {
						registration.waiting.postMessage({ type: "SKIP_WAITING" });
					}
				})
			);
		}

		if (pwaUpdateHandler) {
			await pwaUpdateHandler(true).catch(() => undefined);
		}

		window.clearTimeout(fallbackTimer);
		const cacheBust = `appUpdated=${Date.now()}`;
		const url = new URL(window.location.href);
		url.searchParams.set("v", APP_VERSION.semantic);
		url.searchParams.set(cacheBust.split("=")[0], cacheBust.split("=")[1]);
		window.location.replace(url.toString());
	} catch (error) {
		window.clearTimeout(fallbackTimer);
		console.warn("Gagal apply update aplikasi:", error);
		window.location.reload();
	}
}
