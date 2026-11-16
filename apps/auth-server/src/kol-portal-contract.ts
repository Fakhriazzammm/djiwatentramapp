export const KOL_PLATFORMS = ["TikTok", "Instagram", "YouTube", "Threads", "Other"] as const;
export const VISIT_ACTIVE_STATUSES = ["requested", "confirmed", "completed"] as const;
export const VISIT_RELEASE_STATUSES = ["cancelled", "no_show"] as const;
export const CAMPAIGN_STATUSES = ["draft", "published", "closed", "archived"] as const;
export const SUBMISSION_STATUSES = ["submitted", "needs_revision", "approved", "rejected"] as const;

export function normalizeKolSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

export function isValidKolUrl(value: unknown) {
  if (typeof value !== "string" || value.trim().length < 8 || value.trim().length > 2048) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Jam datang visit ke Djiwa Tentram: 11.00 sampai 17.00 WIB (inklusif). */
export const VISIT_TIME_MIN = "11:00";
export const VISIT_TIME_MAX = "17:00";
export function isVisitTimeAllowed(value: unknown) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  return value >= VISIT_TIME_MIN && value <= VISIT_TIME_MAX;
}

/** Teks persetujuan visit yang dicatat pada setiap booking (termasuk konsekuensi bila tidak hadir). */
export const VISIT_CONSENT_VERSION = "kol-visit-v2";
export const VISIT_CONSENT_TEXT =
  "Saya telah membaca dan menyetujui ketentuan kunjungan Djiwa Tentram. Saya siap hadir pada tanggal dan jam yang saya pilih. " +
  "Jika saya tidak hadir, saya bersedia menerima konsekuensi dan denda yang ditetapkan Djiwa Tentram, karena saya telah menyetujui jadwal ini.";
