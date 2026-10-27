const activeStorageOrigin = "https://supabase.djiwatentram.web.id";
const activeStorageHost = new URL(activeStorageOrigin).host;
const legacyStorageHosts = new Set([
	new URL("https://xaemykhjpkgypqqpfdcb.supabase.co").host,
	new URL("https://supabase.yumme.id").host,
]);

export function resolvePosAssetUrl(value?: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const input = value.trim();
  if (!input) return undefined;

  if (!/^https?:\/\//i.test(input)) {
    const relativePath = input.replace(/^\/+/, "");
    if (relativePath.startsWith("storage/v1/object/")) {
      return `${activeStorageOrigin}/${relativePath}`;
    }
    return undefined;
  }

  try {
    const url = new URL(input);
    if (legacyStorageHosts.has(url.host.toLowerCase())) {
      url.protocol = "https:";
      url.host = activeStorageHost;
      return url.toString();
    }
  } catch {
    return undefined;
  }
  return input;
}
