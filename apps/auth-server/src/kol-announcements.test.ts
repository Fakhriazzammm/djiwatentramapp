import { expect, test } from "bun:test";
import { parseAnnouncement } from "./kol-announcements.ts";

const base = { title: "Jadwal visit dimajukan", body: "Jam datang dimajukan ke 11.00.", kind: "penting", audience: "all" };

test("pengumuman valid untuk semua KOL", () => {
  const r = parseAnnouncement({ ...base, pinned: true, requireAck: true });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value).toMatchObject({ kind: "penting", audience: "all", pinned: true, requireAck: true, campaignId: null, kolIds: [] });
});

test("judul, isi, jenis, dan target divalidasi", () => {
  expect(parseAnnouncement({ ...base, title: "ab" }).ok).toBe(false);
  expect(parseAnnouncement({ ...base, body: "ok" }).ok).toBe(false);
  expect(parseAnnouncement({ ...base, kind: "spam" }).ok).toBe(false);
  expect(parseAnnouncement({ ...base, audience: "campaign" })).toEqual({ ok: false, error: "CAMPAIGN_REQUIRED" });
  expect(parseAnnouncement({ ...base, audience: "selected", kolIds: [] })).toEqual({ ok: false, error: "RECIPIENTS_REQUIRED" });
});

test("target kampanye dan KOL pilihan dibersihkan", () => {
  const c = parseAnnouncement({ ...base, audience: "campaign", campaignId: "7", kolIds: ["x"] });
  expect(c.ok && c.value.campaignId === 7 && c.value.kolIds.length === 0).toBe(true);
  const s = parseAnnouncement({ ...base, audience: "selected", kolIds: ["a", "a", " b ", ""], campaignId: 3 });
  expect(s.ok && s.value.kolIds.join() === "a,b" && s.value.campaignId === null).toBe(true);
});
