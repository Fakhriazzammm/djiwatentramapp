const legacyStorageOrigins = new Set([
  "https://xaemykhjpkgypqqpfdcb.supabase.co",
  "https://supabase.yumme.id",
]);
const selfHostedStorageOrigin = "https://supabase.djiwatentram.web.id";

export function resolvePosAssetUrl(value?: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const input = value.trim();
  if (!input) return undefined;
  if (!/^https?:\/\//i.test(input)) return input;
  try {
    const url = new URL(input);
    if (legacyStorageOrigins.has(url.origin)) {
      url.protocol = "https:";
      url.host = new URL(selfHostedStorageOrigin).host;
      return url.toString();
    }
  } catch {
    return undefined;
  }
  return input;
}
