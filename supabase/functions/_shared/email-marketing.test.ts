import { describe, expect, test } from "bun:test";
import { BUILTIN_TEMPLATES, firstName, htmlToText, isSegment, matchesSegment, renderTemplate, selectRecipients, unsubscribeToken, verifyHelipodSignature, verifyUnsubscribeToken, type CustomerRow } from "./email-marketing.ts";

const NOW = new Date("2026-11-18T05:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const row = (over: Partial<CustomerRow> = {}): CustomerRow => ({ source_id: "c1", email: "a@b.co", name: "ayu dian", marketing_consent: true, total_orders: 0, total_spent: 0, wallet_balance: 0, last_active_at: null, last_order_at: null, membership_expires_at: null, created_at: daysAgo(100), ...over });

describe("segments", () => {
	test("activity based segments", () => {
		expect(matchesSegment(row({ last_active_at: daysAgo(3) }), "active", NOW)).toBe(true);
		expect(matchesSegment(row({ last_active_at: daysAgo(40) }), "reactivate", NOW)).toBe(true);
		expect(matchesSegment(row({ last_active_at: daysAgo(40), last_order_at: daysAgo(2) }), "reactivate", NOW)).toBe(false);
		expect(matchesSegment(row(), "reactivate", NOW)).toBe(false); // never active is not "lapsed"
	});
	test("wallet and member segments", () => {
		expect(matchesSegment(row({ wallet_balance: 5000, last_active_at: daysAgo(45) }), "wallet_idle", NOW)).toBe(true);
		expect(matchesSegment(row({ wallet_balance: 5000, last_active_at: daysAgo(2) }), "wallet_idle", NOW)).toBe(false);
		expect(matchesSegment(row({ membership_expires_at: "2026-12-10" }), "member_expiring", NOW)).toBe(true);
		expect(matchesSegment(row({ membership_expires_at: "2027-06-10" }), "member_expiring", NOW)).toBe(false);
		expect(matchesSegment(row({ membership_expires_at: "2026-11-01" }), "member", NOW)).toBe(false);
	});
	test("segment guard", () => {
		expect(isSegment("reactivate")).toBe(true);
		expect(isSegment("drop table")).toBe(false);
	});
});

describe("selectRecipients", () => {
	test("requires consent, valid email, no suppression, no recent mail, dedupes", () => {
		const rows = [
			row({ source_id: "ok", email: "OK@Mail.com" }),
			row({ source_id: "noconsent", email: "n@x.co", marketing_consent: false }),
			row({ source_id: "null-consent", email: "m@x.co", marketing_consent: null }),
			row({ source_id: "bad", email: "not-an-email" }),
			row({ source_id: "sup", email: "sup@x.co" }),
			row({ source_id: "recent", email: "rec@x.co" }),
			row({ source_id: "dup", email: "ok@mail.com" }),
		];
		const { recipients, skipped } = selectRecipients(rows, { segment: "all", suppressed: new Set(["sup@x.co"]), recentlyMailed: new Set(["recent"]), now: NOW });
		expect(recipients.map((r) => r.customerId)).toEqual(["ok"]);
		expect(recipients[0].email).toBe("ok@mail.com");
		expect(skipped).toEqual({ noConsent: 2, suppressed: 1, recent: 1, invalid: 1 });
	});
	test("variables are filled", () => {
		const { recipients } = selectRecipients([row({ wallet_balance: 12500, last_active_at: daysAgo(50), membership_expires_at: "2026-12-31" })], { segment: "all", suppressed: new Set(), recentlyMailed: new Set(), now: NOW });
		expect(recipients[0].vars.saldo).toBe("Rp12.500");
		expect(recipients[0].vars.hari_tidak_aktif).toBe("50");
		expect(recipients[0].vars.exp_member).toContain("2026");
	});
});

describe("rendering", () => {
	test("escapes values, keeps raw urls, drops unknown variables", () => {
		const html = renderTemplate('<p>{{nama}}</p><a href="{{{unsubscribe_url}}}">x</a>{{unknown}}', { nama: '<b>"Ayu"</b>', unsubscribe_url: "https://x.co/u?e=a&t=1" });
		expect(html).toBe('<p>&lt;b&gt;&quot;Ayu&quot;&lt;/b&gt;</p><a href="https://x.co/u?e=a&t=1">x</a>');
	});
	test("first name handles numeric prefixes and blanks", () => {
		expect(firstName({ name: "068_suci nurul", nickname: null })).toBe("Suci");
		expect(firstName({ name: "  ", nickname: null })).toBe("Sahabat Djiwa");
		expect(firstName({ name: "Budi Santoso", nickname: "Bud" })).toBe("Bud");
	});
	test("built-in templates render with every variable and an unsubscribe link", () => {
		const vars = { nama: "Ayu", saldo: "Rp5.000", exp_member: "1 Januari 2027", link: "https://djiwatentram.web.id", hari_tidak_aktif: "40", unsubscribe_url: "https://u/x" };
		for (const template of BUILTIN_TEMPLATES) {
			const html = renderTemplate(template.html, vars);
			expect(html).not.toContain("{{");
			expect(html).toContain("https://u/x");
			expect(renderTemplate(template.subject, vars)).not.toContain("{{");
			expect(htmlToText(html).length).toBeGreaterThan(40);
		}
	});
});

describe("unsubscribe token", () => {
	test("verifies only the matching email and secret", async () => {
		const token = await unsubscribeToken("A@b.co", "s3cret");
		expect(await verifyUnsubscribeToken("a@b.co", token, "s3cret")).toBe(true);
		expect(await verifyUnsubscribeToken("other@b.co", token, "s3cret")).toBe(false);
		expect(await verifyUnsubscribeToken("a@b.co", token, "wrong")).toBe(false);
		expect(await verifyUnsubscribeToken("a@b.co", "", "s3cret")).toBe(false);
	});
});

describe("webhook signature", () => {
	const secret = "whsec";
	const body = JSON.stringify({ type: "email.delivered" });
	const sign = async (t: number, raw: string) => {
		const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
		return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)))).map((b) => b.toString(16).padStart(2, "0")).join("");
	};
	test("accepts a fresh valid signature and rejects tampering or replays", async () => {
		const now = 1_760_605_460_000, t = 1_760_605_450;
		const v1 = await sign(t, body);
		expect(await verifyHelipodSignature(body, `t=${t},v1=${v1}`, secret, now)).toBe(true);
		expect(await verifyHelipodSignature(body + " ", `t=${t},v1=${v1}`, secret, now)).toBe(false);
		expect(await verifyHelipodSignature(body, `t=${t},v1=${v1}`, "other", now)).toBe(false);
		expect(await verifyHelipodSignature(body, `t=${t},v1=${v1}`, secret, now + 3_600_000)).toBe(false);
		expect(await verifyHelipodSignature(body, "", secret, now)).toBe(false);
	});
});
