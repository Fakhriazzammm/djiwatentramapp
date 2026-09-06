const legacyStorageOrigin = "https://xaemykhjpkgypqqpfdcb.supabase.co";
const selfHostedStorageOrigin = "https://supabase.yumme.id";

export function resolvePosAssetUrl(value?: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const input = value.trim();
  if (!input) return undefined;
  if (!/^https?:\/\//i.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.origin === legacyStorageOrigin) {
      url.protocol = "https:";
      url.host = new URL(selfHostedStorageOrigin).host;
      return url.toString();
    }
  } catch {
    return undefined;
  }
  return input;
}
