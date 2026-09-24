import { APP_VERSION } from "@/lib/version";

export const APP_UPDATE_EVENT = "djiwa:app-update-available";

const VERSION_ENDPOINT = "/version.json";

export type AppUpdateInfo = {
	currentVersion: string;
	latestVersion: string;
	currentCommit: string;
	latestCommit: string;
	latestMessage?: string;
	buildDate?: string;
};

let latestUpdateInfo: AppUpdateInfo | null = null;
let applyingUpdate = false;
let pwaUpdateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

export function setPwaUpdateHandler(updateSW: (reloadPage?: boolean) => Promise<void>) {
	pwaUpdateSW = updateSW;
}

function normalizeVersionValue(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function isNewerBuild(payload: any) {
	const latestVersion = normalizeVersionValue(payload?.version);
	if (latestVersion && latestVersion !== APP_VERSION.semantic) return true;
	const latestCommit = normalizeVersionValue(payload?.commitHash ?? payload?.commit);
	return Boolean(latestCommit && latestCommit !== APP_VERSION.commitHash);
}

export function getLatestUpdateInfo() {
	return latestUpdateInfo;
}

export function notifyAppUpdateAvailable(info?: Partial<AppUpdateInfo>) {
	latestUpdateInfo = {
		currentVersion: APP_VERSION.semantic,
		latestVersion: info?.latestVersion || latestUpdateInfo?.latestVersion || APP_VERSION.semantic,
		currentCommit: APP_VERSION.commitHash,
		latestCommit: info?.latestCommit || latestUpdateInfo?.latestCommit || APP_VERSION.commitHash,
		latestMessage: info?.latestMessage || latestUpdateInfo?.latestMessage,
		buildDate: info?.buildDate || latestUpdateInfo?.buildDate,
	};

	window.dispatchEvent(new CustomEvent<AppUpdateInfo>(APP_UPDATE_EVENT, { detail: latestUpdateInfo }));
}

export async function checkForAppUpdate() {
	if (typeof window === "undefined" || APP_VERSION.isDev) return null;

	// Cooldown setelah applyAppUpdate: skip 1x setelah reload.
	// SessionStorage survive refresh jadi flag ini mencegah dialog
	// muncul kembali saat bundle baru belum ter-download.
	const INFLIGHT_KEY = "__app_update_inflight__";
	const APPLIED_VERSION_KEY = "__app_update_applied_version__";

	// Skip jika versi di version.json sudah pernah diapply sebelumnya
	// Ini mencegah loop: user klik update → reload → bundle lama masih terload
	// → polling deteksi version.json masih beda → popup lagi ♾️
	const storedAppliedVersion = localStorage.getItem(APPLIED_VERSION_KEY);
	void storedAppliedVersion;

	if (sessionStorage.getItem(INFLIGHT_KEY) === "1") {
		sessionStorage.removeItem(INFLIGHT_KEY);
		return null;
	}

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
			latestMessage: normalizeVersionValue(payload.message ?? payload.commitMessage) || undefined,
			buildDate: normalizeVersionValue(payload.buildDate) || undefined,
		};

		notifyAppUpdateAvailable(updateInfo);
		return updateInfo;
	} catch (error) {
		console.warn("Gagal cek versi aplikasi terbaru:", error);
		return null;
	}
}

export function startAppUpdatePolling(intervalMs = 30_000) {
	if (typeof window === "undefined" || APP_VERSION.isDev) {
		return () => undefined;
	}

	// Immediate check on start
	void checkForAppUpdate();

	const interval = window.setInterval(() => {
		void checkForAppUpdate();
	}, intervalMs);

	return () => window.clearInterval(interval);
}

export async function applyAppUpdate() {
	if (typeof window === "undefined" || applyingUpdate) return;
	applyingUpdate = true;

	// Jika versi sama — update palsu (misal commit-only rebuild di Vercel).
	// Set inflight flag biar polling skip 1x, reset state, dan close dialog.
	// JANGAN reload — tidak ada update baru.
	if (latestUpdateInfo && latestUpdateInfo.currentVersion === latestUpdateInfo.latestVersion) {
		sessionStorage.setItem("__app_update_inflight__", "1");
		if ("serviceWorker" in navigator) {
			navigator.serviceWorker.getRegistrations().then((regs) => {
				regs.forEach((reg) => {
					if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
				});
			});
		}
		applyingUpdate = false;
		return;
	}

	// Tandai bahwa update sedang diproses — polling skip dialog
	// sampai reload berikutnya selesai.
	sessionStorage.setItem("__app_update_inflight__", "1");

	// Simpan versi yang sedang diapply — polling skip version.json yg sama
	// setelah reload. Ini mencegah loop popup terus-terusan.
	if (latestUpdateInfo?.latestVersion) {
		localStorage.setItem("__app_update_applied_version__", latestUpdateInfo.latestVersion);
	}

	try {
		// Activate waiting SW through vite-plugin-pwa when available.
		if (pwaUpdateSW) {
			await pwaUpdateSW(true).catch(() => undefined);
		}

		// 1. Activate waiting SW (jika ada) — biar SW baru bisa ambil alih
		if ("serviceWorker" in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			for (const reg of registrations) {
				if (reg.waiting) {
					reg.waiting.postMessage({ type: "SKIP_WAITING" });
				}
			}
		}

		// 2. Tunggu sebentar biar controllerchange sempat fire
		await new Promise<void>((resolve) => setTimeout(resolve, 400));

		// 3. Unregister SEMUA SW + hapus SEMUA cache
		//    Ini penting: setelah reload, halaman akan fresh install
		//    SW baru tanpa artefak dari versi lama.
		if ("serviceWorker" in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			await Promise.all(
				registrations.map((reg) => reg.unregister().catch(() => undefined)),
			);
		}
		if ("caches" in window) {
			const cacheNames = await caches.keys();
			await Promise.all(cacheNames.map((name) => caches.delete(name)));
		}
	} catch (e) {
		console.warn("applyAppUpdate: cleanup failed", e);
	}

	// Hard reload — bersih, tanpa query params lama, tanpa SW sisa.
	window.location.replace(
		`${window.location.pathname}?v=${encodeURIComponent(latestUpdateInfo?.latestVersion || APP_VERSION.semantic)}&_t=${Date.now()}`,
	);
}
