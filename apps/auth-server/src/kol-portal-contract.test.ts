import { describe, expect, it } from "bun:test";
import { CAMPAIGN_STATUSES, KOL_PLATFORMS, SUBMISSION_STATUSES, VISIT_ACTIVE_STATUSES, VISIT_RELEASE_STATUSES, isValidKolUrl, normalizeKolSlug } from "./kol-portal-contract";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("KOL Creator Portal contracts", () => {
  it("normalizes public slugs deterministically", () => {
    expect(normalizeKolSlug(" @Creator Tasik!! ")).toBe("creator-tasik");
    expect(normalizeKolSlug("---")).toBe("");
  });

  it("accepts only bounded http(s) URLs", () => {
    expect(isValidKolUrl("https://example.com/video/1")).toBe(true);
    expect(isValidKolUrl("javascript:alert(1)")).toBe(false);
    expect(isValidKolUrl("short")).toBe(false);
  });

  it("keeps status vocabularies explicit", () => {
    expect(VISIT_ACTIVE_STATUSES).toEqual(["requested", "confirmed", "completed"]);
    expect(VISIT_RELEASE_STATUSES).toEqual(["cancelled", "no_show"]);
    expect(CAMPAIGN_STATUSES).toContain("published");
    expect(SUBMISSION_STATUSES).toContain("needs_revision");
    expect(KOL_PLATFORMS).toContain("TikTok");
  });

  it("preserves the one-active-creator-per-day database invariant", () => {
    const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20260923000003_kol_creator_portal_foundation.sql"), "utf8");
    expect(migration).toContain("idx_kol_visit_one_active_per_day");
    expect(migration).toContain("where status in ('requested','confirmed','completed')");
  });

  it("defines the additive public timeline security boundary", () => {
    const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20260924000000_kol_public_timeline.sql"), "utf8");
    expect(migration).toContain("create table if not exists pos.kol_public_posts");
    expect(migration).toContain("create table if not exists pos.kol_public_post_reports");
    expect(migration).toContain("alter table pos.kol_profiles");
    expect(migration).toContain("public.pos_kol_public_timeline");
    expect(migration).toContain("enable row level security");
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("drop column");
  });

  it("registers timeline and discovery routes", () => {
    const source = readFileSync(resolve(process.cwd(), "./src/kol-portal.ts"), "utf8");
    for (const route of ["/api/kol/portal/timeline", "/api/kol/public/:username/timeline", "/api/kol/portal/discovery", "/api/kol/public/creators", "/api/kol/portal/campaign-discovery", "/api/kol/portal/timeline/:id/report"]) {
      expect(source).toContain(route);
    }
  });

  it("does not expose private contacts in the public view", () => {
    const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20260923000003_kol_creator_portal_foundation.sql"), "utf8");
    const publicView = migration.slice(migration.indexOf("create or replace view public.pos_kol_public_profiles"), migration.indexOf("create or replace view public.pos_kol_visit_calendar"));
    expect(publicView).not.toContain("kol_private_contacts");
    expect(publicView).not.toContain("whatsapp");
    expect(publicView).not.toContain("email");
  });
});
