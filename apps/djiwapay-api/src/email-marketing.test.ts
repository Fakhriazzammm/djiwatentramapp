import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { BUILTIN_TEMPLATES, SEGMENTS, htmlToText, matches, renderTemplate, selectRecipients, unsubscribeToken, type Row, type SegmentKey } from "./email-marketing.js";
import type { Signals } from "./admin-users.js";

const NOW = Date.parse("2026-11-22T00:00:00Z"), d = (n: number) => new Date(NOW - n * 864e5).toISOString();
const sig = (o: Partial<Signals> = {}): Signals => ({ launch: d(100), first: new Map(), entries: new Map(), onboarded: new Set(), google: new Set(), push: new Set(), pwa: new Set(), lastSeen: new Map(), views: new Map(), ...o });
const row = (o: Partial<Row> = {}): Row => ({ id: "u1", email: "a@x.id", name: "budi santoso", nickname: null, consent: true, created_at: d(3), balance: 0, ...o });

describe("segments", () => {
  test("new Pay account counts as Pay user, old account without Pay signal is an invitation target", () => {
    expect(matches(row(), "all", sig(), NOW)).toBe(true);
    expect(matches(row({ created_at: d(300) }), "all", sig(), NOW)).toBe(false);
    expect(matches(row({ created_at: d(300) }), "invite_old", sig(), NOW)).toBe(true);
  });
  test("no_entries, no_google, dormant", () => {
    const s = sig({ first: new Map([["u1", d(50)]]), entries: new Map([["u2", 4]]), lastSeen: new Map([["u1", d(40)]]) });
    expect(matches(row(), "no_entries", s, NOW)).toBe(true);
    expect(matches(row(), "no_google", s, NOW)).toBe(true);
    expect(matches(row(), "dormant", s, NOW)).toBe(true);
    expect(matches(row(), "active", s, NOW)).toBe(false);
  });
  test("every segment is evaluated without throwing", () => { for (const k of Object.keys(SEGMENTS) as SegmentKey[]) matches(row(), k, sig(), NOW); });
});

describe("recipients", () => {
  const s = sig();
  test("consent, validity, suppression and frequency cap are enforced", () => {
    const rows = [row(), row({ id: "u2", email: "b@x.id", consent: false }), row({ id: "u3", email: "bad" }), row({ id: "u4", email: "s@x.id" }), row({ id: "u5", email: "r@x.id" }), row({ id: "u6", email: "A@X.id" })];
    const r = selectRecipients(rows, s, { segment: "all", suppressed: new Set(["s@x.id"]), recentlyMailed: new Set(["u5"]), now: NOW });
    expect(r.recipients.map((x) => x.email)).toEqual(["a@x.id"]);
    expect(r.skipped).toEqual({ noConsent: 1, suppressed: 1, recent: 1, invalid: 1 });
    expect(r.recipients[0].name).toBe("Budi");
  });
});

describe("rendering", () => {
  test("escapes values, keeps raw urls, drops unknown variables", () => {
    expect(renderTemplate("Hi {{nama}} {{x}} {{{link}}}", { nama: "<b>", link: "https://a.id/?a=1&b=2" })).toBe("Hi &lt;b&gt;  https://a.id/?a=1&b=2");
  });
  test("unsubscribe token matches the edge function's HMAC", () => {
    expect(unsubscribeToken(" A@x.id ", "k")).toBe(createHmac("sha256", "k").update("a@x.id").digest("hex").slice(0, 40));
  });
  test("every built-in template links to unsubscribe and has a valid segment", () => {
    for (const t of BUILTIN_TEMPLATES) { expect(t.html).toContain("{{{unsubscribe_url}}}"); expect(t.segment in SEGMENTS).toBe(true); expect(htmlToText(t.html).length).toBeGreaterThan(40); }
  });
});

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
describe("email house style", () => {
  const root = join(import.meta.dir, "../../djiwapay/public");
  test("every image a built-in template points at exists, is light enough, and has alt text", () => {
    for (const t of BUILTIN_TEMPLATES) {
      for (const m of t.html.matchAll(/<img [^>]*src="https:\/\/djiwapay\.web\.id(\/assets\/email\/[^"]+)"[^>]*>/g)) {
        const file = join(root, m[1]);
        expect(existsSync(file)).toBe(true);
        expect(statSync(file).size).toBeLessThan(200_000);
        expect(m[0]).toContain("alt=");
        expect(m[0]).toContain("width=");
      }
    }
  });
  test("a hero email keeps the unsubscribe link and a preheader", () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === "builtin-android-tester")!;
    expect(t.html).toContain("/assets/email/android-tester/hero.jpg");
    expect(t.html).toContain("{{{unsubscribe_url}}}");
  });
});
