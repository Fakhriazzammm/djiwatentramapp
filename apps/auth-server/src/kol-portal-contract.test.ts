import { describe, expect, it } from "bun:test";
import { CAMPAIGN_STATUSES, KOL_PLATFORMS, SUBMISSION_STATUSES, VISIT_ACTIVE_STATUSES, VISIT_RELEASE_STATUSES, isValidKolUrl, normalizeKolSlug } from "./kol-portal-contract";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { INQUIRY_STATUSES, isInquiryHoneypotFilled, validatePublicInquiry } from "./kol-inquiry-contract";

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

  it("keeps invite token handling hashed and private", () => {
    const source = readFileSync(resolve(process.cwd(), "./src/kol-portal.ts"), "utf8");
    expect(source).toContain("i.token_hash = $1");
    expect(source).toContain("createHash(\"sha256\")");
    expect(source).toContain("i.expires_at > now()");
    expect(source).toContain("i.revoked_at is null");
    expect(source).not.toContain("select p.email");
    const token = "kol-invite-contract-token";
    expect(createHash("sha256").update(token, "utf8").digest("hex")).toHaveLength(64);
  });

  it("covers the invite authorization and resolution error contract", () => {
    const source = readFileSync(resolve(process.cwd(), "./src/kol-portal.ts"), "utf8");
    for (const route of ["/api/kol/invites/:token", "/api/kol/invite/open", "/api/kol/invites/:token/claim", "/api/kol/invites/:token/booking"]) expect(source).toContain(route);
    for (const error of ["UNAUTHORIZED", "EMAIL_MATCH_NOT_FOUND", "AMBIGUOUS_EMAIL_MATCH", "ALREADY_LINKED", "INVITE_NOT_FOUND", "INVITE_NOT_LINKED", "DATE_ALREADY_BOOKED"]) expect(source).toContain(error);
    expect(source).toContain("where source_id = $2 and auth_user_id is null");
    expect(source).toContain("pos.kol_request_visit_booking");
    expect(source).toContain("invite.source_id");
    expect(source).not.toContain("body.kolId");
  });

  it("only returns the safe invite creator context", () => {
    const source = readFileSync(resolve(process.cwd(), "./src/kol-portal.ts"), "utf8");
    const start = source.indexOf("function inviteSafeContext");
    const end = source.indexOf("async function context", start);
    const safe = source.slice(start, end);
    expect(safe).not.toContain("email");
    expect(safe).not.toContain("whatsapp");
    expect(safe).not.toContain("application_data");
    expect(safe).not.toContain("manager_");
  });

  it("validates public collaboration inquiries and honeypot submissions", () => {
    expect(INQUIRY_STATUSES).toEqual(["new", "reviewing", "contacted", "declined", "closed"]);
    expect(validatePublicInquiry({ businessName: "Brand Co", contactName: "Ayu", contactEmail: " AYU@EXAMPLE.COM ", contactPhone: "", brief: "Kami ingin membahas kerja sama konten untuk campaign bulan depan.", preferredContact: "email" })).toEqual({ ok: true, value: { businessName: "Brand Co", contactName: "Ayu", contactEmail: "ayu@example.com", contactPhone: null, brief: "Kami ingin membahas kerja sama konten untuk campaign bulan depan.", preferredContact: "email" } });
    expect(validatePublicInquiry({ businessName: "B", contactName: "A", brief: "short" })).toMatchObject({ ok: false });
    expect(isInquiryHoneypotFilled({ website: "https://spam.test" })).toBe(true);
    expect(isInquiryHoneypotFilled({ website: "" })).toBe(false);
  });

  it("keeps inquiry writes private and profiles visibility-gated", () => {
    const api = readFileSync(resolve(process.cwd(), "./src/kol-portal.ts"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261006000000_kol_collaboration_inquiries.sql"), "utf8");
    const publicViewMigration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20260924000000_kol_public_timeline.sql"), "utf8");
    expect(api).toContain("/api/kol/public/:username/inquiries");
    expect(api).toContain("validatePublicInquiry(body)");
    expect(api).toContain("isInquiryRateLimited(limiterKey)");
    expect(api).toContain("from public.pos_kol_public_profiles where lower(username)=lower($1)");
    expect(api).toContain('"coalesce(p.is_public,false)=true"');
    expect(api).toContain("p.is_public=true and c.status <> 'Rejected'");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on pos.kol_collaboration_inquiries from anon, authenticated");
    expect(migration).not.toContain("grant select on pos.kol_collaboration_inquiries to anon");
    expect(publicViewMigration).toContain("coalesce(p.is_public, false) = true");
    expect(publicViewMigration).toContain("pi.review_status = 'approved' and pi.is_public = true");
  });

});
