const FIRST_PARTY_ORIGIN_MAP: Readonly<Record<string, string>> = {
  "https://supabase.yumme.id": "https://supabase.djiwatentram.web.id",
  "https://api.yumme.id": "https://api.djiwatentram.web.id",
  "https://djiwatentram.yumme.id": "https://djiwatentram.web.id",
  "https://admindjiwatentram.yumme.id": "https://admin.djiwatentram.web.id",
  "https://pos.yumme.id": "https://pos.djiwatentram.web.id",
  "https://b2b.yumme.id": "https://b2b.djiwatentram.web.id",
  "https://merchandise.yumme.id": "https://merchandise.djiwatentram.web.id",
  "https://ordermieyamin.yumme.id": "https://ordermieyamin.djiwatentram.web.id",
  "https://karyawan.yumme.id": "https://karyawan.djiwatentram.web.id",
  "https://kolmarketing.yumme.id": "https://kol.djiwatentram.web.id",
  "https://investor.yumme.id": "https://investor.djiwatentram.web.id",
  "https://booking.yumme.id": "https://booking.djiwatentram.web.id",
  "https://500kopitasik.yumme.id": "https://kopitasik.djiwatentram.web.id",
  "https://linkbio.yumme.id": "https://linkbio.djiwatentram.web.id",
  "https://pay.yumme.id": "https://pay.djiwatentram.web.id",
};

const SIGNED_QUERY_KEY = /^(token|signature|sig|expires|x-amz-|x-goog-|sv|se|sp)$/i;

function isSignedUrl(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (SIGNED_QUERY_KEY.test(key)) return true;
  }
  return false;
}

/** Rewrites only known first-party legacy origins; never guesses external hosts. */
export function resolveCanonicalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const input = value.trim();
  if (!input) return undefined;
  if (!/^https?:\/\//i.test(input)) return input;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }

  const canonicalOrigin = FIRST_PARTY_ORIGIN_MAP[url.origin];
  if (!canonicalOrigin || isSignedUrl(url)) return input;
  const canonical = new URL(canonicalOrigin);
  url.protocol = canonical.protocol;
  url.host = canonical.host;
  return url.toString();
}

/** Resolve the first non-empty candidate while retaining image snapshots. */
export function resolveCanonicalAssetUrl(...candidates: unknown[]): string | undefined {
  const candidate = candidates.find((value) => typeof value === "string" && value.trim());
  return resolveCanonicalUrl(candidate);
}
