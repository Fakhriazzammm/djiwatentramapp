import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { Pool } from "pg";
import { registerKolPortalRoutes } from "./kol-portal.js";

type Harness = { queries: string[]; parameters: unknown[][] };
function appFor(profileRows: any[] = []) {
  const harness: Harness = { queries: [], parameters: [] };
  const authStub = { api: { getSession: async () => null } } as unknown as Parameters<typeof registerKolPortalRoutes>[1];
  const poolStub = {
    query: async (sql: string, parameters?: unknown[]) => {
      harness.queries.push(sql);
      harness.parameters.push(parameters ?? []);
      if (sql.includes("public.pos_kol_public_profiles")) return { rows: profileRows };
      return { rows: [] };
    },
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }),
  } as unknown as Pool;
  const app = new Hono();
  registerKolPortalRoutes(app, authStub, poolStub);
  return { app, harness };
}

describe("KOL public visibility and inquiry API", () => {
  test("private or missing public-profile view rows return 404 without querying creator fallback", async () => {
    const { app, harness } = appFor([]);
    const response = await app.request("/api/kol/public/private-creator");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "PROFILE_NOT_FOUND" });
    expect(harness.queries).toHaveLength(1);
    expect(harness.queries[0]).toContain("public.pos_kol_public_profiles");
    expect(harness.queries[0]).not.toContain("pos.kol_creators");
  });

  test("public profile response projects allowlisted fields only", async () => {
    const { app } = appFor([{
      id: "public-id", name: "Annisa", username: "annisa", bio: "Creator kuliner",
      data: {
        platforms: [{ platform: "TikTok", username: "annisa", profileUrl: "https://tiktok.com/@annisa", followers: 4200, email: "private@example.com", engagementRate: 14 }],
        portfolio: [{ id: 31, platform: "TikTok", title: "Review", contentUrl: "https://tiktok.com/video/31", reviewNote: "internal", isPublic: false }],
        badges: [{ code: "verified", name: "Verified", adminNote: "private" }],
      },
      email: "private@example.com", whatsapp: "08123456789", status: "Potential", public_reason: "private",
    }]);
    const response = await app.request("/api/kol/public/annisa");
    const body = await response.json() as { data: Record<string, any> };
    expect(response.status).toBe(200);
    expect(body.data.platforms[0]).toEqual({ platform: "TikTok", username: "annisa", profile_url: "https://tiktok.com/@annisa", followers: 4200 });
    expect(body.data.portfolio[0]).toEqual({ id: 31, platform: "TikTok", title: "Review", content_url: "https://tiktok.com/video/31", thumbnail_url: null, description: null, published_at: null, pinned_order: null });
    expect(JSON.stringify(body)).not.toContain("private@example.com");
    expect(JSON.stringify(body)).not.toContain("08123456789");
    expect(JSON.stringify(body)).not.toContain("internal");
    expect(JSON.stringify(body)).not.toContain("engagementRate");
  });

  test("public discovery query excludes creators without explicit public opt-in", async () => {
    const { app, harness } = appFor([]);
    const response = await app.request("/api/kol/public/creators");
    expect(response.status).toBe(200);
    expect(harness.queries[0]).toContain("coalesce(p.is_public,false)=true");
    expect(harness.queries[0]).toContain("c.status <> 'Rejected'");
  });

  test("inquiry persists validated contact data but returns only generic receipt", async () => {
    const { app, harness } = appFor([{ id: "kol-public-id" }]);
    const response = await app.request("/api/kol/public/annisa/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://kolmarketing.djiwatentram.web.id" },
      body: JSON.stringify({
        businessName: "Brand Co",
        contactName: "Ayu",
        contactEmail: " AYU+kol-api-test@example.com ",
        brief: "Kami ingin membahas kerja sama konten untuk campaign bulan depan.",
        preferredContact: "email",
        website: "",
      }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: { received: true } });
    expect(harness.queries.some((sql) => sql.includes("insert into pos.kol_collaboration_inquiries"))).toBe(true);
    const insertIndex = harness.queries.findIndex((sql) => sql.includes("insert into pos.kol_collaboration_inquiries"));
    expect(harness.parameters[insertIndex]).toEqual([
      "kol-public-id", "Brand Co", "Ayu", "ayu+kol-api-test@example.com", null,
      "Kami ingin membahas kerja sama konten untuk campaign bulan depan.", "email",
    ]);
  });

  test("inquiry rejects unapproved origin and invalid form data", async () => {
    const { app, harness } = appFor([{ id: "kol-public-id" }]);
    const blocked = await app.request("/api/kol/public/annisa/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: JSON.stringify({}),
    });
    expect(blocked.status).toBe(403);
    const invalid = await app.request("/api/kol/public/annisa/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://kolmarketing.djiwatentram.web.id" },
      body: JSON.stringify({ businessName: "B", contactName: "A", brief: "no", contactEmail: "not-email" }),
    });
    expect(invalid.status).toBe(400);
    expect(harness.queries).toHaveLength(0);
  });
});
