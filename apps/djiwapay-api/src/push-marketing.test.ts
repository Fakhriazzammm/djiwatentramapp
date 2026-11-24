import { describe, expect, test } from "bun:test";
import { DEFAULT_TOPICS, inQuietHours, pickDevices, renderPush, type Device } from "./push-marketing.js";
import { fcmBody, sendFcm, signJwt } from "./fcm.js";
import { generateKeyPairSync } from "node:crypto";

const dv = (userId: string, platform: "web" | "android" = "web", n = 1): Device => ({ userId, platform, endpoint: `${platform}-${userId}-${n}` });
const base = { prefs: new Map(), topic: "promo" as const, platform: "all" as const, members: null, sent: new Map(), channels: { web: true, android: true } };

describe("quiet hours (WIB)", () => {
  const at = (h: number) => Date.UTC(2026, 10, 25, h - 7, 0, 0);
  test("21:00 to 07:00 is quiet", () => { expect(inQuietHours(at(21))).toBe(true); expect(inQuietHours(at(23))).toBe(true); expect(inQuietHours(at(3))).toBe(true); expect(inQuietHours(at(6))).toBe(true); });
  test("daytime is not", () => { expect(inQuietHours(at(7))).toBe(false); expect(inQuietHours(at(12))).toBe(false); expect(inQuietHours(at(20))).toBe(false); });
});

describe("pickDevices", () => {
  test("a person with no saved choice gets the default topics", () => { expect(DEFAULT_TOPICS).toContain("promo"); expect(pickDevices([dv("a")], base).devices).toHaveLength(1); });
  test("marketing off or topic off excludes", () => {
    const prefs = new Map([["a", { marketing: false, topics: ["promo"] }], ["b", { marketing: true, topics: ["tips"] }], ["c", { marketing: true, topics: ["promo"] }]]);
    const r = pickDevices([dv("a"), dv("b"), dv("c")], { ...base, prefs });
    expect(r.devices.map((x) => x.userId)).toEqual(["c"]); expect(r.skipped.optedOut).toBe(2);
  });
  test("segment members only", () => { const r = pickDevices([dv("a"), dv("b")], { ...base, members: new Set(["b"]) }); expect(r.devices.map((x) => x.userId)).toEqual(["b"]); expect(r.skipped.notInSegment).toBe(1); });
  test("platform filter", () => { const r = pickDevices([dv("a", "web"), dv("a", "android")], { ...base, platform: "android" }); expect(r.devices.map((x) => x.platform)).toEqual(["android"]); });
  test("a channel that is not configured is left out, not failed", () => { const r = pickDevices([dv("a", "web"), dv("b", "android")], { ...base, channels: { web: true, android: false } }); expect(r.devices.map((x) => x.userId)).toEqual(["a"]); expect(r.skipped.noChannel).toBe(1); });
  test("1 per day and 3 per week per person", () => {
    const sent = new Map([["a", { day: 1, week: 1 }], ["b", { day: 0, week: 3 }], ["c", { day: 0, week: 2 }]]);
    const r = pickDevices([dv("a"), dv("a", "android"), dv("b"), dv("c")], { ...base, sent });
    expect(r.devices.map((x) => x.userId)).toEqual(["c"]); expect(r.skipped.capped).toBe(2);
  });
  test("two devices of one person both receive and count as one user", () => { const r = pickDevices([dv("a", "web"), dv("a", "android")], base); expect(r.devices).toHaveLength(2); expect(r.users).toBe(1); });
});

test("renderPush fills {{nama}} and blanks unknown names", () => { expect(renderPush("Hai {{nama}}!", { nama: "Ayu" })).toBe("Hai Ayu!"); expect(renderPush("Hai {{x}}", {})).toBe("Hai "); });

describe("fcm", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const acc = { project_id: "demo", client_email: "svc@demo.iam.gserviceaccount.com", private_key: privateKey };
  test("jwt has three parts and the right scope", () => { const t = signJwt(acc).split("."); expect(t).toHaveLength(3); expect(JSON.parse(Buffer.from(t[1], "base64url").toString()).scope).toContain("firebase.messaging"); });
  test("body keeps data as strings and sets the channel", () => { const b = fcmBody("tok", { title: "T", body: "B", data: { n: 1 as never }, channel: "promo", image: "https://x.id/a.png" }); expect(b.message.data.n).toBe("1"); expect(b.message.android.notification.channel_id).toBe("promo"); expect(b.message.notification.image).toBe("https://x.id/a.png"); });
  test("not configured is reported, not thrown", async () => { expect(await sendFcm("t", { title: "a", body: "b" }, { account: null })).toEqual({ ok: false, dead: false, error: "FCM_NOT_CONFIGURED" }); });
  test("unregistered token is marked dead; success is ok", async () => {
    const mk = (send: Response) => (async (url: string) => (String(url).includes("oauth2") ? new Response(JSON.stringify({ access_token: "x", expires_in: 3600 })) : send)) as never;
    expect(await sendFcm("t", { title: "a", body: "b" }, { account: acc, fetch: mk(new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 })) })).toEqual({ ok: false, dead: true, error: "UNREGISTERED" });
    expect(await sendFcm("t", { title: "a", body: "b" }, { account: acc, fetch: mk(new Response("{}", { status: 200 })) })).toEqual({ ok: true });
  });
});
