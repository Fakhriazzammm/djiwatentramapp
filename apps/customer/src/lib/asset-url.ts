const configuredStorageBaseUrl = (
  import.meta.env.VITE_SUPABASE_STORAGE_PUBLIC_URL as string | undefined
)?.trim().replace(/\/+$/, "");

const legacyStorageOrigins = new Set([
  "https://xaemykhjpkgypqqpfdcb.supabase.co",
  "https://supabase.djiwatentram.web.id",
]);

const selfHostedStorageOrigin = "https://supabase.djiwatentram.web.id";

export function resolveCustomerAssetUrl(value?: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const input = value.trim();
  if (!input) return undefined;

  if (/^https?:\/\//i.test(input)) {
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

  if (input.startsWith("/")) return input;
  return configuredStorageBaseUrl ? `${configuredStorageBaseUrl}/${input.replace(/^\/+/, "")}` : input;
}

export const CUSTOMER_LOGO_FALLBACK = "/logo-djiwa.png";
export const CUSTOMER_PRODUCT_IMAGE_FALLBACK = "/logo-djiwa.png";
