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

	// Skip jika versi di version.json sudah pernah diapply sebelumnya
	// Mencegah loop popup setelah user klik update tapi bundle lama masih terload
	const APPLIED_VERSION_KEY = "__app_update_applied_version__";
	const storedAppliedVersion = localStorage.getItem(APPLIED_VERSION_KEY);

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

		// Skip jika versi ini sudah pernah diapply
		if (storedAppliedVersion) {
			const latestVersion = normalizeVersionValue(payload.version);
			if (latestVersion && latestVersion === storedAppliedVersion) {
				return null;
			}
			localStorage.removeItem(APPLIED_VERSION_KEY);
		}

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

	// Simpan versi yang sedang diapply — polling skip version.json yg sama
	// setelah reload. Mencegah loop popup terus-terusan.
	if (latestUpdateInfo?.latestVersion) {
		localStorage.setItem("__app_update_applied_version__", latestUpdateInfo.latestVersion);
	}

	try {
		if ("serviceWorker" in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();

			if (!registeredSkipWaitingReload) {
				registeredSkipWaitingReload = true;
				navigator.serviceWorker.addEventListener("controllerchange", () => {
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

		const cacheBust = `appUpdated=${Date.now()}`;
		const url = new URL(window.location.href);
		url.searchParams.set("v", APP_VERSION.semantic);
		url.searchParams.set(cacheBust.split("=")[0], cacheBust.split("=")[1]);
		window.location.replace(url.toString());
	} catch (error) {
		console.warn("Gagal apply update aplikasi:", error);
		window.location.reload();
	}
}
