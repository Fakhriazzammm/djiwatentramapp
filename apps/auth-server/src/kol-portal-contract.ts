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
