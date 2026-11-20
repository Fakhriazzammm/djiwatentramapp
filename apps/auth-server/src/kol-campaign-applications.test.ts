import { expect, test } from "bun:test";
import { campaignFieldsForUpdate, campaignProofMatchesPlatform, generateCampaignDraft, parseCampaignFields } from "../../../supabase/functions/_shared/kol-campaign.ts";

test("publishing a visit campaign requires a SOW and explicit terms", () => {
  expect(() => parseCampaignFields({ status: "published", applicationMode: "visit" })).toThrow();
  const result = parseCampaignFields({
    status: "published", applicationMode: "visit", terms: ["Datang sesuai jadwal."],
    sow: { title: "Scope of Work", sections: [{ title: "Konten", items: ["Satu video."] }], days: 7 },
    coverUrl: "/campaign-images/visit-djiwa-tentram.jpg", proofPlatforms: ["TikTok", "Instagram"],
  });
  expect(result.proof_platforms).toEqual(["TikTok", "Instagram"]);
  expect(result.sow?.days).toBe(7);
});

test("rejects unsafe media URLs and proof platforms outside the catalog", () => {
  expect(() => parseCampaignFields({ coverUrl: "//example.com/photo" })).toThrow();
  expect(() => parseCampaignFields({ proofPlatforms: ["Unlisted"] })).toThrow();
});

test("AI can edit copy without touching benefits, SOW, or terms", async () => {
  const mockFetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    description: "Datang dan ceritakan pengalamanmu.", deliverableSummary: "Satu video.", terms: ["Tambahan"], benefitDescription: "Rp1.000.000",
  }) } }] }));
  const draft = await generateCampaignDraft({ title: "Visit", brief: "1 video" }, {
    key: "test", baseUrl: "https://example.com", model: "test",
  }, mockFetch as typeof fetch);
  expect(draft).toEqual({ description: "Datang dan ceritakan pengalamanmu.", deliverableSummary: "Satu video." });
});

test("a legacy editor can save without erasing terms or proof requirements", () => {
  const prior = parseCampaignFields({
    applicationMode: "open", terms: ["Setuju."],
    sow: { sections: [{ title: "Konten", items: ["Buat video."] }] }, proofPlatforms: ["TikTok"],
  });
  expect(campaignFieldsForUpdate({ status: "published", title: "Judul baru" }, prior)).toEqual({});
  expect(campaignFieldsForUpdate({ status: "published", coverUrl: "" }, prior)).toEqual({ cover_url: null });
});

test("required platform proof validates a link's actual host", () => {
  expect(campaignProofMatchesPlatform("https://vm.tiktok.com/id", "TikTok")).toBe(true);
  expect(campaignProofMatchesPlatform("https://vm.tiktok.com/id", "Instagram")).toBe(false);
  expect(campaignProofMatchesPlatform("https://instagram.com.example.com/reel", "Instagram")).toBe(false);
});
