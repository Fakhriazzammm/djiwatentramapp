// Email automations: definitions, default templates and the pure "who should get this now" selectors.
// No Deno/network APIs here so everything is unit-testable with bun.
import {
	APP_URL, TRANSACTIONAL_FOOTER, box, builtinTemplate, button, dateId, firstName, h1, inactiveDays, matchesSegment, p, validEmail, wrapEmail,
	type CustomerRow,
} from "./email-marketing.ts";

export type AutomationKey = "welcome" | "winback" | "post_order" | "lead_intro" | "booking_confirm" | "booking_reminder" | "booking_thanks" | "order_receipt" | "review_invite";
export type AutomationKind = "marketing" | "transactional";

export type AutomationDef = {
	key: AutomationKey;
	kind: AutomationKind;
	/** Plain-language rule shown in the admin so nobody has to guess when an email goes out. */
	trigger: string;
	subject: string;
	html: string;
	sampleVars: Record<string, string>;
	variables: string[];
};

const DAY = 86_400_000;
const HOUR = 3_600_000;

const bookingBox = `<div style="margin:18px 0;padding:14px 16px;background:#eaf1fc;border-left:3px solid #1a5dc6;line-height:1.8;">
<strong>Kode:</strong> {{kode}}<br><strong>Tanggal:</strong> {{tanggal}}<br><strong>Jam:</strong> {{jam}} WIB<br><strong>Tamu:</strong> {{tamu}} orang</div>`;

export const GOOGLE_REVIEW_URL = "https://g.page/r/Ccd6bRmm1GH4EAE/review";
const ORDER_FOOTER = `Email ini dikirim otomatis sebagai struk pesananmu di Djiwa Tentram.<br><a href="${APP_URL}" style="color:#6a6a76;">djiwatentram.web.id</a>`;
const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DIGITAL_PAYMENT = /(qris|mayar|wallet|djiwa|transfer)/i;
const receiptBox = `<div style="margin:18px 0 24px;padding:18px 20px;background:#edf3fb;border-radius:14px;color:#203956;">
<p style="margin:0 0 4px;font-size:12px;">Nomor pesanan</p>
<p style="margin:0 0 12px;font-size:17px;font-weight:700;overflow-wrap:anywhere;">{{nomor_order}}</p>
<p style="margin:0;font-size:14px;">{{tanggal}} &middot; {{metode}}</p></div>`;

/** Item table + totals as an email-safe HTML block (passed to the template as the raw variable {{{rincian}}}). */
export function receiptRowsHtml(items: Array<{ name: string; variant?: string | null; quantity: number; price: number }>, total: number, extras: Array<{ label: string; amount: number }> = []) {
	const rows = items.map((item) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eceef3;">${esc(item.name)}${item.variant ? `<br><span style="color:#6a6a76;font-size:12px;">${esc(item.variant)}</span>` : ""}</td><td style="padding:6px 8px;border-bottom:1px solid #eceef3;text-align:center;white-space:nowrap;">${item.quantity}x</td><td style="padding:6px 0;border-bottom:1px solid #eceef3;text-align:right;white-space:nowrap;">${rupiah(item.price * item.quantity)}</td></tr>`).join("");
	const extra = extras.filter((e) => e.amount).map((e) => `<tr><td colspan="2" style="padding:4px 0;color:#6a6a76;">${esc(e.label)}</td><td style="padding:4px 0;text-align:right;white-space:nowrap;">${e.amount < 0 ? "-" : ""}${rupiah(Math.abs(e.amount))}</td></tr>`).join("");
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 4px;font-size:14px;">${rows}${extra}<tr><td colspan="2" style="padding:14px 10px;background:#123765;color:#ffffff;font-weight:700;">Total dibayar</td><td style="padding:14px 10px;background:#123765;color:#ffffff;font-size:19px;text-align:right;font-weight:700;white-space:nowrap;">${rupiah(total)}</td></tr></table>`;
}

const welcome = builtinTemplate("builtin-welcome")!;
const comeback = builtinTemplate("builtin-comeback")!;

/** "Beri ulasan" call-to-action; empty string when the order was paid in cash. */
export const reviewBlock = (url: string) => `<div style="margin:22px 0 0;padding:16px 18px;background:#faf6ef;border-radius:12px;color:#473823;">
<p style="margin:0 0 4px;font-weight:700;">Bagaimana pengalamanmu?</p>
<p style="margin:0 0 8px;font-size:14px;">Ceritakan menu yang kamu coba atau pelayanan yang kamu rasakan.</p>
<a href="${esc(url)}" style="color:#774016;text-decoration:underline;font-weight:700;">Beri ulasan di Google</a></div>`;

export const AUTOMATIONS: AutomationDef[] = [
	{
		key: "welcome", kind: "marketing",
		trigger: "Pendaftar baru (≤7 hari) yang berizin pemasaran, dikirim setelah jeda yang diatur.",
		subject: welcome.subject, html: welcome.html,
		sampleVars: { nama: "Ayu" }, variables: ["nama", "link"],
	},
	{
		key: "winback", kind: "marketing",
		trigger: "Pelanggan berizin yang >30 hari tidak aktif. Maksimal sekali per 60 hari per orang.",
		subject: comeback.subject, html: comeback.html,
		sampleVars: { nama: "Ayu", hari_tidak_aktif: "45" }, variables: ["nama", "hari_tidak_aktif", "link"],
	},
	{
		key: "post_order", kind: "marketing",
		trigger: "Pelanggan berizin yang pesanan terakhirnya sudah lewat jeda yang diatur (maks. 7 hari lalu). Sekali per pesanan.",
		subject: "Terima kasih sudah mampir, {{nama}} ☕",
		html: wrapEmail(
			h1("Terima kasih, {{nama}}!") +
			p("Senang kamu sudah memesan di Djiwa Tentram. Semoga menunya cocok dan harimu jadi lebih tenang.") +
			box("Pesan lagi lewat <strong>Djiwa App</strong>: tanpa antre, bisa bayar pakai saldo Djiwa Pay, dan pesanan bisa dipantau langsung.") +
			button("Pesan lagi"),
			"Terima kasih sudah memesan. Sampai jumpa lagi!",
		),
		sampleVars: { nama: "Ayu" }, variables: ["nama", "link"],
	},
	{
		key: "review_invite", kind: "marketing",
		trigger: "Pelanggan berizin pemasaran yang pernah memesan, sejak pesanan terakhirnya lewat jeda yang diatur (standar 24 jam, setelah struk). Sekali seumur hidup per orang, dikirim bertahap sesuai batas harian. Tanpa imbalan apa pun (kebijakan Google melarang ulasan berinsentif).",
		subject: "{{nama}}, ceritakan pengalamanmu di Djiwa Tentram?",
		html: wrapEmail(
			`<img src="${APP_URL}/order-greeting-cafe.jpg" width="502" alt="Ilustrasi suasana kedai Djiwa Tentram" style="display:block;width:100%;max-width:502px;height:auto;border:0;border-radius:12px;">
			<p style="margin:22px 0 6px;color:#725137;font-size:14px;">Halo {{nama}},</p>
			<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:30px;line-height:1.2;color:#382b24;">Bagaimana rasanya mampir ke Djiwa?</h1>` +
			p("Kami ingin mendengar ceritamu. Mungkin ada menu yang berkesan, atau sesuatu yang bisa kami perbaiki saat kamu datang lagi.") +
			p("Satu atau dua kalimat di Google sudah sangat membantu, apa pun penilaianmu.") +
			button("Tulis ulasan di Google", "{{{link_ulasan}}}") +
			`<p style="margin:22px 0 0;color:#64554c;">Salam hangat,<br><strong>Tim Djiwa Tentram</strong></p>`,
			"Satu menit untuk berbagi pengalamanmu di Djiwa Tentram.",
		),
		sampleVars: { nama: "Ayu", link_ulasan: GOOGLE_REVIEW_URL }, variables: ["nama", "link_ulasan", "link"],
	},
	{
		key: "lead_intro", kind: "marketing",
		trigger: "Pembeli tamu (belum punya akun) yang berizin pemasaran, dikirim setelah jeda yang diatur.",
		subject: "{{nama}}, buat akun Djiwa App yuk",
		html: wrapEmail(
			h1("Halo {{nama}}, terima kasih sudah memesan") +
			p("Kamu sudah mencoba Djiwa Tentram sebagai tamu. Dengan akun Djiwa App, pesananmu lebih cepat dan ada keuntungan tambahan:") +
			`<ul style="margin:0 0 14px;padding-left:20px;"><li style="margin-bottom:6px;">Riwayat pesanan tersimpan</li><li style="margin-bottom:6px;">Saldo Djiwa Pay untuk bayar tanpa tunai</li><li style="margin-bottom:6px;">Poin dan keuntungan member</li></ul>` +
			button("Buat akun"),
			"Buat akun Djiwa App untuk pesan lebih cepat.",
		),
		sampleVars: { nama: "Ayu" }, variables: ["nama", "link"],
	},
	{
		key: "order_receipt", kind: "transactional",
		trigger: "Pesanan yang sudah dibayar dalam 24 jam terakhir dan punya email (email di pesanan, atau email akun member). Sekali per pesanan. Link ulasan Google hanya untuk pembayaran digital (QRIS, Djiwa Pay), bukan tunai di kasir.",
		subject: "Struk pesananmu {{nomor_order}}",
		html: wrapEmail(
			`<p style="margin:0 0 6px;color:#326049;font-size:13px;font-weight:700;">Pembayaran diterima</p>` +
			h1("Terima kasih, {{nama}}!") + receiptBox +
			`<h2 style="margin:0 0 8px;font-size:17px;color:#203956;">Rincian pesanan</h2>` + "{{{rincian}}}" +
			"{{{ulasan_blok}}}" + button("Buka Djiwa App"),
			"Struk pesananmu di Djiwa Tentram.", ORDER_FOOTER,
		),
		sampleVars: {
			nama: "Ayu", nomor_order: "ORD-APP-D-0008-241126", tanggal: "26 November 2026", metode: "QRIS",
			rincian: receiptRowsHtml([{ name: "Nasi Ayam Kemangi", quantity: 1, price: 30000 }, { name: "Americano Long Black", variant: "Dingin", quantity: 1, price: 30000 }], 60000),
			ulasan_blok: reviewBlock(GOOGLE_REVIEW_URL),
			link_ulasan: GOOGLE_REVIEW_URL,
		},
		variables: ["nama", "nomor_order", "tanggal", "metode", "rincian", "ulasan_blok", "link_ulasan", "link"],
	},
	{
		key: "booking_confirm", kind: "transactional",
		trigger: "Reservasi berstatus terkonfirmasi dengan jadwal hari ini atau setelahnya. Tanpa jeda.",
		subject: "Reservasi {{kode}} dikonfirmasi",
		html: wrapEmail(
			h1("Reservasimu dikonfirmasi, {{nama}}") + p("Kami sudah menyiapkan tempat untukmu. Ini detailnya:") + bookingBox + p("Sampai jumpa di Djiwa Tentram!") + button("Buka Djiwa App"),
			"Reservasi kamu dikonfirmasi.", TRANSACTIONAL_FOOTER,
		),
		sampleVars: { nama: "Ayu", kode: "DJW-1234", tanggal: "25 November 2026", jam: "19.00", tamu: "4" }, variables: ["nama", "kode", "tanggal", "jam", "tamu", "link"],
	},
	{
		key: "booking_reminder", kind: "transactional",
		trigger: "Reservasi terkonfirmasi yang jadwalnya besok (WIB).",
		subject: "Besok kami tunggu kamu, {{nama}}",
		html: wrapEmail(
			h1("Sampai jumpa besok, {{nama}}!") + p("Pengingat singkat untuk reservasimu:") + bookingBox + p("Kalau rencanamu berubah, kabari kami lebih awal ya."),
			"Pengingat reservasi untuk besok.", TRANSACTIONAL_FOOTER,
		),
		sampleVars: { nama: "Ayu", kode: "DJW-1234", tanggal: "25 November 2026", jam: "19.00", tamu: "4" }, variables: ["nama", "kode", "tanggal", "jam", "tamu", "link"],
	},
	{
		key: "booking_thanks", kind: "transactional",
		trigger: "Sehari setelah jadwal reservasi terkonfirmasi atau selesai.",
		subject: "Terima kasih sudah berkunjung, {{nama}}",
		html: wrapEmail(
			h1("Terima kasih sudah datang, {{nama}}") + p("Kami senang menyambutmu kemarin. Semoga kunjunganmu menyenangkan, dan kami tunggu kedatanganmu berikutnya.") + button("Pesan lagi atau reservasi"),
			"Terima kasih sudah berkunjung.", TRANSACTIONAL_FOOTER,
		),
		sampleVars: { nama: "Ayu" }, variables: ["nama", "link"],
	},
];
export const automationDef = (key: string) => AUTOMATIONS.find((a) => a.key === key) ?? null;

// ---------- selection ----------
export type Candidate = { refKey: string; customerId: string; email: string; name: string; vars: Record<string, string> };
export type LeadRow = { source_id: string | null; email: string | null; name: string | null; marketing_consent: boolean | null; created_at: string | null };
export type BookingRow = { source_id: string | null; customer_name: string | null; customer_email: string | null; booking_code: string | null; booking_date: string | null; arrival_time: string | null; guest_count: number | null; booking_status: string | null };

export type OrderRow = { source_id: string | null; order_number: string | null; total_amount: number | null; status: string | null; payment_method: string | null; customer_name: string | null; customer_email: string | null; customer_source_id: string | null; /** pos.orders.created_at is epoch milliseconds (double precision) */ created_at: number | string | null; discount_amount?: number | null; tax_amount?: number | null; service_charge_amount?: number | null; shipping_fee_amount?: number | null; daily_receipt_no?: number | null };
export type OrderItemRow = { order_source_id: string | null; product_name: string | null; variant: string | null; quantity: number | null; price: number | null };

export type SelectCtx = {
	now: number;
	/** every suppressed address (unsubscribed + bounce + complaint + manual) — blocks marketing */
	suppressedAll: Set<string>;
	/** only bounce/complaint/manual — blocks transactional too; an "unsubscribed" address may still get booking mail */
	suppressedHard: Set<string>;
	/** emails mailed recently by campaigns or marketing automations (frequency cap) */
	recentEmails: Set<string>;
	/** ref keys already sent for this automation */
	sent: Set<string>;
	customers: CustomerRow[];
	leads: LeadRow[];
	bookings: BookingRow[];
	/** paid orders from the last day (receipt candidates) with their line items */
	orders?: OrderRow[];
	orderItems?: OrderItemRow[];
	delayHours: number;
};

const clean = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();
const time = (value: string | number | null | undefined) => { const t = value ? (typeof value === "number" ? value : /^\d{12,}$/.test(String(value)) ? Number(value) : new Date(value).getTime()) : 0; return Number.isFinite(t) ? t : 0; };

/** Jakarta calendar date (YYYY-MM-DD) for `now` shifted by `days`. */
export const jakartaDate = (now: number, days = 0) => new Date(now + 7 * HOUR + days * DAY).toISOString().slice(0, 10);

function marketingAllowed(email: string, ctx: SelectCtx, seen: Set<string>) {
	if (!validEmail(email) || seen.has(email) || ctx.suppressedAll.has(email) || ctx.recentEmails.has(email)) return false;
	seen.add(email);
	return true;
}

function customerCandidates(ctx: SelectCtx, accept: (c: CustomerRow) => string | null, vars: (c: CustomerRow) => Record<string, string>): Candidate[] {
	const out: Candidate[] = [];
	const seen = new Set<string>();
	for (const c of ctx.customers) {
		if (c.marketing_consent !== true || !c.source_id) continue;
		const refKey = accept(c);
		if (!refKey || ctx.sent.has(refKey)) continue;
		const email = clean(c.email);
		if (!marketingAllowed(email, ctx, seen)) continue;
		out.push({ refKey, customerId: c.source_id, email, name: firstName(c), vars: { nama: firstName(c), link: APP_URL, ...vars(c) } });
	}
	return out;
}

function bookingCandidates(ctx: SelectCtx, accept: (b: BookingRow) => boolean): Candidate[] {
	const out: Candidate[] = [];
	for (const b of ctx.bookings) {
		if (!b.source_id || !accept(b)) continue;
		const refKey = b.source_id;
		const email = clean(b.customer_email);
		if (ctx.sent.has(refKey) || !validEmail(email) || ctx.suppressedHard.has(email)) continue;
		const name = firstName({ name: b.customer_name, nickname: null });
		out.push({
			refKey, customerId: b.source_id, email, name,
			vars: { nama: name, kode: String(b.booking_code ?? ""), tanggal: dateId(b.booking_date), jam: String(b.arrival_time ?? "").replace(":", "."), tamu: String(b.guest_count ?? 1), link: APP_URL },
		});
	}
	return out;
}

export function selectCandidates(key: AutomationKey, ctx: SelectCtx): Candidate[] {
	const delay = ctx.delayHours * HOUR;
	const today = jakartaDate(ctx.now);
	switch (key) {
		case "welcome":
			return customerCandidates(ctx, (c) => {
				const created = time(c.created_at);
				return created && ctx.now - created >= delay && ctx.now - created <= 7 * DAY ? `welcome:${c.source_id}` : null;
			}, () => ({}));
		case "winback":
			return customerCandidates(ctx, (c) => (matchesSegment(c, "reactivate", ctx.now) ? `winback:${c.source_id}:${Math.floor(ctx.now / (60 * DAY))}` : null), (c) => ({ hari_tidak_aktif: String(inactiveDays(c, ctx.now) ?? "") }));
		case "post_order":
			return customerCandidates(ctx, (c) => {
				const last = time(c.last_order_at);
				return Number(c.total_orders ?? 0) > 0 && last && ctx.now - last >= delay && ctx.now - last <= 7 * DAY ? `post_order:${c.source_id}:${last}` : null;
			}, () => ({}));
		case "review_invite":
			return customerCandidates(ctx, (c) => {
				if (Number(c.total_orders ?? 0) <= 0) return null;
				// The receipt goes out first; the review invite follows `delay` hours after the last order (never right on top of it).
				const last = time(c.last_order_at);
				return !last || ctx.now - last >= delay ? `review_invite:${c.source_id}` : null;
			}, () => ({ link_ulasan: GOOGLE_REVIEW_URL }));
		case "lead_intro": {
			const customerEmails = new Set(ctx.customers.map((c) => clean(c.email)));
			const out: Candidate[] = [];
			const seen = new Set<string>();
			for (const lead of ctx.leads) {
				const email = clean(lead.email);
				const created = time(lead.created_at);
				if (lead.marketing_consent !== true || !lead.source_id || !created || customerEmails.has(email)) continue;
				if (ctx.now - created < delay || ctx.now - created > 14 * DAY) continue;
				const refKey = `lead_intro:${lead.source_id}`;
				if (ctx.sent.has(refKey) || !marketingAllowed(email, ctx, seen)) continue;
				const name = firstName({ name: lead.name, nickname: null });
				out.push({ refKey, customerId: lead.source_id, email, name, vars: { nama: name, link: APP_URL } });
			}
			return out;
		}
		case "order_receipt": {
			const accountEmail = new Map(ctx.customers.map((c) => [c.source_id ?? "", clean(c.email)]));
			const itemsByOrder = new Map<string, OrderItemRow[]>();
			for (const item of ctx.orderItems ?? []) {
				if (!item.order_source_id) continue;
				const list = itemsByOrder.get(item.order_source_id) ?? [];
				list.push(item);
				itemsByOrder.set(item.order_source_id, list);
			}
			const out: Candidate[] = [];
			for (const order of ctx.orders ?? []) {
				if (!order.source_id || !["paid", "completed"].includes(clean(order.status))) continue;
				const created = time(order.created_at);
				if (!created || ctx.now - created < delay || ctx.now - created > DAY) continue;
				const refKey = `order_receipt:${order.source_id}`;
				const email = clean(order.customer_email) || accountEmail.get(order.customer_source_id ?? "") || "";
				if (ctx.sent.has(refKey) || !validEmail(email) || ctx.suppressedHard.has(email)) continue;
				const items = (itemsByOrder.get(order.source_id) ?? []).map((i) => ({ name: String(i.product_name ?? "Item"), variant: i.variant, quantity: Number(i.quantity ?? 1), price: Number(i.price ?? 0) }));
				if (!items.length) continue;
				const method = String(order.payment_method ?? "");
				const digital = DIGITAL_PAYMENT.test(method);
				const label = /wallet|djiwa/i.test(method) ? "Djiwa Pay" : /qris|mayar/i.test(method) ? "QRIS" : digital ? "Transfer" : "Bayar di kasir";
				const name = firstName({ name: order.customer_name, nickname: null });
				out.push({
					refKey, customerId: order.customer_source_id ?? order.source_id, email, name,
					vars: {
						nama: name, link: APP_URL, nomor_order: String(order.order_number ?? order.source_id), tanggal: dateId(new Date(created).toISOString()), metode: label,
						rincian: receiptRowsHtml(items, Number(order.total_amount ?? 0), [
							{ label: "Ongkos kirim", amount: Number(order.shipping_fee_amount ?? 0) },
							{ label: "Diskon", amount: -Number(order.discount_amount ?? 0) },
							{ label: "Pajak", amount: Number(order.tax_amount ?? 0) },
							{ label: "Biaya layanan", amount: Number(order.service_charge_amount ?? 0) },
						]),
						ulasan_blok: digital ? reviewBlock(GOOGLE_REVIEW_URL) : "",
						link_ulasan: GOOGLE_REVIEW_URL,
					},
				});
			}
			return out;
		}
		case "booking_confirm":
			return bookingCandidates(ctx, (b) => b.booking_status === "confirmed" && String(b.booking_date ?? "") >= today).map((c) => ({ ...c, refKey: `booking_confirm:${c.refKey}` })).filter((c) => !ctx.sent.has(c.refKey));
		case "booking_reminder":
			return bookingCandidates(ctx, (b) => b.booking_status === "confirmed" && b.booking_date === jakartaDate(ctx.now, 1)).map((c) => ({ ...c, refKey: `booking_reminder:${c.refKey}` })).filter((c) => !ctx.sent.has(c.refKey));
		case "booking_thanks":
			return bookingCandidates(ctx, (b) => (b.booking_status === "confirmed" || b.booking_status === "completed") && b.booking_date === jakartaDate(ctx.now, -1)).map((c) => ({ ...c, refKey: `booking_thanks:${c.refKey}` })).filter((c) => !ctx.sent.has(c.refKey));
	}
}
