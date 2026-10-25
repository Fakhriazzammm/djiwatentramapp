const configuredStorageBaseUrl = (
  import.meta.env.VITE_SUPABASE_STORAGE_PUBLIC_URL as string | undefined
)?.trim().replace(/\/+$/, "");

const retiredStorageOrigins = new Set([
  "https://supabase.yumme.id",
  "https://xaemykhjpkgypqqpfdcb.supabase.co",
]);

const liveStorageOrigin = "https://supabase.djiwatentram.web.id";
const defaultStorageBaseUrl = `${liveStorageOrigin}/storage/v1/object/public`;

export function resolveBookingAssetUrl(value?: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const input = value.trim();
  if (!input) return undefined;

  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      if (retiredStorageOrigins.has(url.origin)) {
        url.protocol = "https:";
        url.host = new URL(liveStorageOrigin).host;
        return url.toString();
      }
    } catch {
      return undefined;
    }
    return input;
  }

  if (input.startsWith("/")) return input;
  return `${configuredStorageBaseUrl || defaultStorageBaseUrl}/${input.replace(/^\/+/, "")}`;
}
