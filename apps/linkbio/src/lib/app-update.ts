import { APP_VERSION } from "./version";

export const APP_UPDATE_EVENT = "djiwa:linkbio-update-available";
export type AppUpdateInfo = { currentVersion: string; latestVersion: string; currentCommit: string; latestCommit: string; latestMessage?: string; buildDate?: string };
let latestUpdateInfo: AppUpdateInfo | null = null;

export function getLatestUpdateInfo() { return latestUpdateInfo; }
export function notifyAppUpdateAvailable(info: AppUpdateInfo) {
  latestUpdateInfo = info;
  window.dispatchEvent(new CustomEvent<AppUpdateInfo>(APP_UPDATE_EVENT, { detail: info }));
}

export async function checkForAppUpdate() {
  if (typeof window === "undefined" || import.meta.env.DEV) return null;
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    if (!response.ok) return null;
    const payload = await response.json() as { version?: string; commitHash?: string; commit?: string; message?: string; commitMessage?: string; buildDate?: string };
    const latestVersion = payload.version?.trim() || "";
    const latestCommit = (payload.commitHash ?? payload.commit ?? "").trim();
    if ((!latestVersion || latestVersion === APP_VERSION.semantic) && (!latestCommit || latestCommit === APP_VERSION.commitHash)) return null;
    const info = { currentVersion: APP_VERSION.semantic, latestVersion: latestVersion || APP_VERSION.semantic, currentCommit: APP_VERSION.commitHash, latestCommit: latestCommit || APP_VERSION.commitHash, latestMessage: (payload.message ?? payload.commitMessage)?.trim() || undefined, buildDate: payload.buildDate };
    notifyAppUpdateAvailable(info);
    return info;
  } catch { return null; }
}

export function startAppUpdatePolling(intervalMs = 60_000) {
  if (typeof window === "undefined" || import.meta.env.DEV) return () => undefined;
  void checkForAppUpdate();
  const interval = window.setInterval(() => void checkForAppUpdate(), intervalMs);
  return () => window.clearInterval(interval);
}
