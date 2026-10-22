export const WALLET_SOURCE_APPS = [
  "djiwa-travel",
  "djiwa-tentram",
  "b2b",
  "ordermieyamin",
] as const;

export type WalletSourceApp = (typeof WALLET_SOURCE_APPS)[number];

const allowedSourceApps = new Set<string>(WALLET_SOURCE_APPS);

export function validateWalletSourceApp(value: unknown): WalletSourceApp | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("sourceApp tidak valid");
  const normalized = value.trim().toLowerCase();
  if (!allowedSourceApps.has(normalized)) throw new Error("sourceApp tidak diizinkan");
  return normalized as WalletSourceApp;
}

export function filterWalletLedger<T extends { source_app?: string | null }>(rows: T[], sourceApp: WalletSourceApp | null) {
  return sourceApp === null ? rows : rows.filter((row) => row.source_app === sourceApp);
}