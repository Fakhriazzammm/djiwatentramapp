import { expect, test } from "bun:test";
import { daysUntil, estimateBudgetFee, parseRules, parseTikTokVideo, rewardAmount, reviewState, sqlError } from "./kol-rewards.ts";

const rules = { ratePer1000: 15000, minViews: 1000, maxPerContent: 50000, maxPerKol: 50000 };

test("setiap view dihitung: Rp15 per view pada tarif Rp15.000 per 1.000", () => {
  expect(rewardAmount(3100, rules)).toEqual({ computed: 46500, amount: 46500, capped: false });
  expect(rewardAmount(2480, rules).amount).toBe(37200);
  expect(rewardAmount(1001, rules).amount).toBe(15015);
});

test("reward dibatasi maksimal per KOL dan per konten", () => {
  expect(rewardAmount(41_800, rules)).toEqual({ computed: 627000, amount: 50000, capped: true });
  expect(rewardAmount(5000, { ...rules, maxPerContent: 30000 }).amount).toBe(30000);
});

test("di bawah minimal view tidak dibayar, pecahan rupiah dibulatkan ke bawah", () => {
  expect(rewardAmount(999, rules).amount).toBe(0);
  expect(rewardAmount(0, rules).amount).toBe(0);
  expect(rewardAmount(1234, { ...rules, ratePer1000: 1 }).amount).toBe(1);
  expect(rewardAmount(-5, rules).amount).toBe(0);
});

test("anggaran Rp100.000 menutup 6.666 view pada tarif Rp15", () => {
  expect(rewardAmount(6666, { ratePer1000: 15000, minViews: 0, maxPerContent: null, maxPerKol: null }).amount).toBe(99990);
});

test("biaya QRIS ditanggung Bisnis, dihitung dari nominal anggaran", () => {
  expect(estimateBudgetFee(100000, 0.7)).toBe(700);
  expect(estimateBudgetFee(100000, 0)).toBe(0);
});

test("waktu tayang dibaca dari ID video TikTok", () => {
  const seconds = Math.floor(Date.UTC(2026, 10, 17, 12, 0, 0) / 1000);
  const id = (BigInt(seconds) << 32n).toString();
  const parsed = parseTikTokVideo(`https://www.tiktok.com/@rani/video/${id}?lang=id`);
  expect(parsed?.videoId).toBe(id);
  expect(parsed?.postedAt.toISOString()).toBe("2026-11-17T12:00:00.000Z");
  expect(parseTikTokVideo("https://vm.tiktok.com/ZSabc123/")).toBeNull();
});

test("status review mengikuti tenggat dan ketersediaan view", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  expect(reviewState({ payout_id: 1 }, now)).toBe("paid");
  expect(reviewState({ settle_due_at: null }, now)).toBe("needs_date");
  expect(reviewState({ settle_due_at: "2026-11-25T00:00:00Z" }, now)).toBe("waiting");
  expect(reviewState({ settle_due_at: "2026-11-24T09:00:00Z", last_views: null }, now)).toBe("due");
  expect(reviewState({ settle_due_at: "2026-11-24T09:00:00Z", last_views: 3100 }, now)).toBe("ready");
  expect(daysUntil("2026-11-24T10:00:00Z", new Date("2026-11-20T10:00:00Z"))).toBe(4);
});

test("aturan reward divalidasi sebelum disimpan", () => {
  expect(parseRules({ rewardsEnabled: true, ratePer1000: 15000, maxPerKol: 50000 }).ok).toBe(true);
  expect(parseRules({ rewardsEnabled: true, ratePer1000: 15000 }).ok).toBe(false);
  expect(parseRules({ rewardsEnabled: true, ratePer1000: 0, maxPerKol: 1 }).ok).toBe(false);
  expect(parseRules({ rewardsEnabled: true, ratePer1000: 1, maxPerKol: 1, settleDays: 99 }).ok).toBe(false);
  expect(parseRules({ rewardsEnabled: false }).ok).toBe(true);
});

test("kode error SQL dipetakan ke status HTTP", () => {
  expect(sqlError({ code: "P0001", message: "CAMPAIGN_FULL" })).toEqual({ code: "CAMPAIGN_FULL", status: 409 });
  expect(sqlError({ code: "P0001", message: "SOMETHING_ELSE" })).toBeNull();
  expect(sqlError({ code: "23505", message: "dup" })).toBeNull();
});
