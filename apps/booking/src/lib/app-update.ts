import { APP_VERSION } from "./version";

export const APP_UPDATE_EVENT = "djiwa:booking-update-available";

type UpdateHandler = (reloadPage?: boolean) => Promise<void> | void;
let updateSW: UpdateHandler | undefined;
let latestUpdateInfo: AppUpdateInfo | null = null;

export function setAppUpdateHandler(handler: UpdateHandler | undefined) {
  updateSW = handler;
}

export type AppUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  currentCommit: string;
  latestCommit: string;
  latestMessage?: string;
  buildDate?: string;
};

export function notifyAppUpdateAvailable(info?: AppUpdateInfo) {
  if (typeof window === "undefined") return;
  latestUpdateInfo = info ?? null;
  window.dispatchEvent(new CustomEvent(APP_UPDATE_EVENT, { detail: info }));
}

export async function checkForAppUpdate() {
  if (typeof window === "undefined" || import.meta.env.DEV) return null;
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    if (!response.ok) return null;
    const payload = await response.json() as { version?: string; commitHash?: string; commit?: string; message?: string; commitMessage?: string; buildDate?: string };
    const latestVersion = payload.version?.trim() || "";
    const latestCommit = (payload.commitHash ?? payload.commit ?? "").trim();
    const latestBuildKey = `${latestVersion}:${latestCommit}`;
    const appliedBuildKey = localStorage.getItem("__app_update_applied_build__");
    if (appliedBuildKey === latestBuildKey) return null;
    if (appliedBuildKey) localStorage.removeItem("__app_update_applied_build__");
    if ((!latestVersion || latestVersion === APP_VERSION.semantic) && (!latestCommit || latestCommit === APP_VERSION.commitHash)) return null;
    const info = { currentVersion: APP_VERSION.semantic, latestVersion, currentCommit: APP_VERSION.commitHash, latestCommit, latestMessage: (payload.message ?? payload.commitMessage)?.trim() || undefined, buildDate: payload.buildDate };
    notifyAppUpdateAvailable(info);
    return info;
  } catch {
    return null;
  }
}

export function startAppUpdatePolling(intervalMs = 60_000) {
  if (typeof window === "undefined" || import.meta.env.DEV) return () => undefined;
  void checkForAppUpdate();
  const interval = window.setInterval(() => void checkForAppUpdate(), intervalMs);
  return () => window.clearInterval(interval);
}

export async function applyAppUpdate() {
  if (latestUpdateInfo) localStorage.setItem("__app_update_applied_build__", `${latestUpdateInfo.latestVersion}:${latestUpdateInfo.latestCommit}`);
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(async (registration) => {
      await registration.update().catch(() => undefined);
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    }));
  }
  await updateSW?.(true);
  const url = new URL(window.location.href);
  url.searchParams.set("appUpdated", String(Date.now()));
  window.location.replace(url.toString());
}

export { APP_VERSION };
