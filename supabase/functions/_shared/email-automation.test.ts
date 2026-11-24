import { describe, expect, test } from "bun:test";
import { jakartaDate, selectCandidates, type BookingRow, type LeadRow, type SelectCtx } from "./email-automation.ts";
import type { CustomerRow } from "./email-marketing.ts";

const NOW = Date.parse("2026-11-22T05:00:00Z"); // 12:00 WIB
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();
const customer = (over: Partial<CustomerRow> & { source_id: string }): CustomerRow => ({
	email: `${over.source_id}@x.id`, name: "Ayu Lestari", nickname: null, marketing_consent: true, total_orders: 0, total_spent: 0, wallet_balance: 0,
	last_active_at: null, last_order_at: null, membership_expires_at: null, created_at: iso(-100), ...over,
});
const ctx = (over: Partial<SelectCtx> = {}): SelectCtx => ({ now: NOW, suppressedAll: new Set(), suppressedHard: new Set(), recentEmails: new Set(), sent: new Set(), customers: [], leads: [], bookings: [], delayHours: 0, ...over });
const booking = (over: Partial<BookingRow> & { source_id: string }): BookingRow => ({ customer_name: "Budi", customer_email: "budi@x.id", booking_code: "DJW-1", booking_date: jakartaDate(NOW, 1), arrival_time: "19:00", guest_count: 4, booking_status: "confirmed", ...over });

describe("jakartaDate", () => {
	test("uses WIB, not UTC, near midnight", () => {
		expect(jakartaDate(Date.parse("2026-11-22T18:00:00Z"))).toBe("2026-11-23");
		expect(jakartaDate(NOW, 1)).toBe("2026-11-23");
	});
});

describe("welcome", () => {
	test("only recent, consented signups past the delay", () => {
		const customers = [
			customer({ source_id: "new", created_at: new Date(NOW - 5 * 3_600_000).toISOString() }),
			customer({ source_id: "toofresh", created_at: new Date(NOW - 30 * 60_000).toISOString() }),
			customer({ source_id: "old", created_at: iso(-40) }),
			customer({ source_id: "noconsent", created_at: iso(-1), marketing_consent: false }),
		];
		expect(selectCandidates("welcome", ctx({ customers, delayHours: 2 })).map((c) => c.customerId)).toEqual(["new"]);
	});
	test("never twice, never to suppressed or recently mailed", () => {
		const customers = [customer({ source_id: "a", created_at: iso(-1) }), customer({ source_id: "b", created_at: iso(-1) }), customer({ source_id: "c", created_at: iso(-1) })];
		const out = selectCandidates("welcome", ctx({ customers, sent: new Set(["welcome:a"]), suppressedAll: new Set(["b@x.id"]), recentEmails: new Set(["c@x.id"]) }));
		expect(out).toHaveLength(0);
	});
});

describe("winback", () => {
	test("inactive >30 days, once per 60-day bucket", () => {
		const customers = [customer({ source_id: "gone", last_order_at: iso(-45) }), customer({ source_id: "active", last_order_at: iso(-3) })];
		const out = selectCandidates("winback", ctx({ customers }));
		expect(out.map((c) => c.customerId)).toEqual(["gone"]);
		expect(out[0].vars.hari_tidak_aktif).toBe("45");
		expect(selectCandidates("winback", ctx({ customers, sent: new Set([out[0].refKey]) }))).toHaveLength(0);
	});
});

describe("post_order", () => {
	test("order within window past the delay, once per order", () => {
		const customers = [
			customer({ source_id: "ok", total_orders: 3, last_order_at: new Date(NOW - 4 * DAY).toISOString() }),
			customer({ source_id: "toorecent", total_orders: 1, last_order_at: new Date(NOW - 12 * 3_600_000).toISOString() }),
			customer({ source_id: "toold", total_orders: 1, last_order_at: iso(-20) }),
			customer({ source_id: "never", total_orders: 0, last_order_at: null }),
		];
		const out = selectCandidates("post_order", ctx({ customers, delayHours: 72 }));
		expect(out.map((c) => c.customerId)).toEqual(["ok"]);
		expect(selectCandidates("post_order", ctx({ customers, delayHours: 72, sent: new Set([out[0].refKey]) }))).toHaveLength(0);
	});
});

describe("lead_intro", () => {
	test("consented lead that is not already a customer", () => {
		const leads: LeadRow[] = [
			{ source_id: "l1", email: "lead@x.id", name: "Siti", marketing_consent: true, created_at: iso(-2) },
			{ source_id: "l2", email: "a@x.id", name: "Dup", marketing_consent: true, created_at: iso(-2) },
			{ source_id: "l3", email: "no@x.id", name: "No", marketing_consent: false, created_at: iso(-2) },
		];
		const out = selectCandidates("lead_intro", ctx({ leads, customers: [customer({ source_id: "a" })], delayHours: 24 }));
		expect(out.map((c) => c.email)).toEqual(["lead@x.id"]);
	});
});

describe("bookings (transactional)", () => {
	test("confirm: confirmed and not in the past; ignores marketing caps and unsubscribe", () => {
		const bookings = [booking({ source_id: "b1" }), booking({ source_id: "b2", booking_status: "pending" }), booking({ source_id: "b3", booking_date: jakartaDate(NOW, -5) }), booking({ source_id: "b4", customer_email: "" })];
		const out = selectCandidates("booking_confirm", ctx({ bookings, recentEmails: new Set(["budi@x.id"]), suppressedAll: new Set(["budi@x.id"]) }));
		expect(out.map((c) => c.refKey)).toEqual(["booking_confirm:b1"]);
		expect(out[0].vars).toMatchObject({ kode: "DJW-1", jam: "19.00", tamu: "4" });
	});
	test("hard suppression (bounce) still blocks transactional mail", () => {
		expect(selectCandidates("booking_confirm", ctx({ bookings: [booking({ source_id: "b1" })], suppressedHard: new Set(["budi@x.id"]) }))).toHaveLength(0);
	});
	test("reminder only for tomorrow; thanks only for yesterday", () => {
		const bookings = [booking({ source_id: "tom" }), booking({ source_id: "yest", booking_date: jakartaDate(NOW, -1), booking_status: "completed" }), booking({ source_id: "today", booking_date: jakartaDate(NOW) })];
		expect(selectCandidates("booking_reminder", ctx({ bookings })).map((c) => c.refKey)).toEqual(["booking_reminder:tom"]);
		expect(selectCandidates("booking_thanks", ctx({ bookings })).map((c) => c.refKey)).toEqual(["booking_thanks:yest"]);
	});
	test("already sent is skipped", () => {
		expect(selectCandidates("booking_reminder", ctx({ bookings: [booking({ source_id: "tom" })], sent: new Set(["booking_reminder:tom"]) }))).toHaveLength(0);
	});
});

describe("order_receipt", () => {
	const order = (over: Record<string, unknown> = {}) => ({ source_id: "o1", order_number: "ORD-1", total_amount: 60000, status: "paid", payment_method: "qris_mayar", customer_name: "Ayu Lestari", customer_email: "ayu@x.id", customer_source_id: "c1", created_at: NOW - 10 * 60_000, ...over });
	const items = [{ order_source_id: "o1", product_name: "Nasi Ayam", variant: null, quantity: 2, price: 30000 }];
	test("paid recent order with email gets a receipt, with the review link for digital payments", () => {
		const out = selectCandidates("order_receipt", ctx({ orders: [order()], orderItems: items }));
		expect(out).toHaveLength(1);
		expect(out[0].email).toBe("ayu@x.id");
		expect(out[0].vars.ulasan_blok).toContain("g.page/r/Ccd6bRmm1GH4EAE/review");
		expect(out[0].vars.rincian).toContain("Nasi Ayam");
	});
	test("cash at the cashier gets the receipt without the review block", () => {
		const out = selectCandidates("order_receipt", ctx({ orders: [order({ payment_method: "cash" })], orderItems: items }));
		expect(out[0].vars.ulasan_blok).toBe("");
		expect(out[0].vars.metode).toBe("Bayar di kasir");
	});
	test("falls back to the member account email, skips unpaid, old, duplicate and suppressed", () => {
		const customers = [customer({ source_id: "c1", email: "acct@x.id" })];
		const out = selectCandidates("order_receipt", ctx({ customers, orderItems: items, orders: [order({ customer_email: null })] }));
		expect(out[0].email).toBe("acct@x.id");
		const none = (o: Record<string, unknown>, extra: Partial<SelectCtx> = {}) => selectCandidates("order_receipt", ctx({ orderItems: items, orders: [order(o)], ...extra }));
		expect(none({ status: "pending" })).toHaveLength(0);
		expect(none({ created_at: NOW - 2 * DAY })).toHaveLength(0);
		expect(none({}, { sent: new Set(["order_receipt:o1"]) })).toHaveLength(0);
		expect(none({}, { suppressedHard: new Set(["ayu@x.id"]) })).toHaveLength(0);
		expect(none({ customer_email: null, customer_source_id: null })).toHaveLength(0);
	});
});

describe("review_invite timing", () => {
	test("waits `delay` hours after the last order so the receipt comes first", () => {
		const customers = [
			customer({ source_id: "fresh", total_orders: 1, last_order_at: new Date(NOW - 3 * 3_600_000).toISOString() }),
			customer({ source_id: "ready", total_orders: 1, last_order_at: new Date(NOW - 30 * 3_600_000).toISOString() }),
		];
		expect(selectCandidates("review_invite", ctx({ customers, delayHours: 24 })).map((c) => c.customerId)).toEqual(["ready"]);
	});
});

describe("review_invite", () => {
	test("consented customers who ordered, once, never suppressed", () => {
		const customers = [
			customer({ source_id: "a", total_orders: 3 }),
			customer({ source_id: "never", total_orders: 0 }),
			customer({ source_id: "noconsent", total_orders: 2, marketing_consent: false }),
			customer({ source_id: "done", total_orders: 2 }),
			customer({ source_id: "blocked", total_orders: 2 }),
		];
		const out = selectCandidates("review_invite", ctx({ customers, sent: new Set(["review_invite:done"]), suppressedAll: new Set(["blocked@x.id"]) }));
		expect(out.map((c) => c.customerId)).toEqual(["a"]);
		expect(out[0].vars.link_ulasan).toContain("g.page/r/Ccd6bRmm1GH4EAE/review");
	});
});
