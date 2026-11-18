// Shared helpers for the email marketing Edge Functions: audience segments, template rendering,
// signed unsubscribe tokens and the built-in templates. Pure functions only (testable without Deno APIs).

export const APP_URL = "https://djiwatentram.web.id";
export const LOGO_URL = `${APP_URL}/logo-djiwa.png`;
export const FROM_DEFAULT = "Djiwa Tentram <hello@mail.djiwatentram.web.id>";
export const FUNCTIONS_BASE = "https://supabase.djiwatentram.web.id/functions/v1";
/** A customer who already received a campaign recently is skipped (frequency cap). */
export const FREQUENCY_CAP_HOURS = 72;

export type CustomerRow = {
	source_id: string | null;
	email: string | null;
	name: string | null;
	nickname?: string | null;
	marketing_consent: boolean | null;
	total_orders: number | null;
	total_spent: number | string | null;
	wallet_balance: number | string | null;
	last_active_at: string | null;
	last_order_at: string | null;
	membership_expires_at: string | null;
	created_at: string | null;
};

export const SEGMENTS = {
	all: "Semua pelanggan",
	active: "Aktif ≤14 hari",
	reactivate: "Perlu reaktivasi (>30 hari)",
	wallet: "Punya saldo Djiwa Pay",
	wallet_idle: "Saldo mengendap (>30 hari tidak aktif)",
	member: "Member aktif",
	member_expiring: "Member berakhir ≤30 hari",
	buyer: "Pernah belanja",
	never_bought: "Belum pernah belanja",
	new_joiners: "Pendaftar baru ≤14 hari",
} as const;
export type SegmentKey = keyof typeof SEGMENTS;
export const isSegment = (value: unknown): value is SegmentKey => typeof value === "string" && value in SEGMENTS;

const DAY = 86_400_000;
const time = (value: string | null | undefined) => {
	const t = value ? new Date(value).getTime() : 0;
	return Number.isFinite(t) ? t : 0;
};

/** Days since the latest activity or order; null when the customer never did anything. */
export function inactiveDays(customer: CustomerRow, now = Date.now()) {
	const latest = Math.max(time(customer.last_active_at), time(customer.last_order_at));
	return latest ? Math.max(0, Math.floor((now - latest) / DAY)) : null;
}

export function matchesSegment(customer: CustomerRow, segment: SegmentKey, now = Date.now()) {
	const days = inactiveDays(customer, now);
	const balance = Number(customer.wallet_balance ?? 0);
	const expiry = customer.membership_expires_at ? new Date(`${String(customer.membership_expires_at).slice(0, 10)}T23:59:59+07:00`).getTime() : 0;
	switch (segment) {
		case "all": return true;
		case "active": return days !== null && days <= 14;
		case "reactivate": return days !== null && days > 30;
		case "wallet": return balance > 0;
		case "wallet_idle": return balance > 0 && (days === null || days > 30);
		case "member": return expiry > now;
		case "member_expiring": return expiry > now && expiry - now <= 30 * DAY;
		case "buyer": return Number(customer.total_orders ?? 0) > 0;
		case "never_bought": return Number(customer.total_orders ?? 0) === 0;
		case "new_joiners": return time(customer.created_at) > 0 && now - time(customer.created_at) <= 14 * DAY;
	}
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
export const validEmail = (value: unknown): value is string => typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value.trim());

export type Recipient = { customerId: string; email: string; name: string; vars: Record<string, string> };

export const rupiah = (value: number) => `Rp${Math.round(value || 0).toLocaleString("id-ID")}`;
const dateId = (value: string | null | undefined) => {
	if (!value) return "";
	const date = new Date(`${String(value).slice(0, 10)}T12:00:00+07:00`);
	return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
};

export function firstName(customer: Pick<CustomerRow, "name" | "nickname">) {
	const raw = String(customer.nickname || customer.name || "").trim().replace(/^\d+[_-]+/, "");
	const first = raw.split(/\s+/)[0] ?? "";
	return first ? first.charAt(0).toUpperCase() + first.slice(1) : "Sahabat Djiwa";
}

/**
 * Picks recipients: consent given, valid email, not suppressed, in the segment, not mailed recently.
 * `now` is injectable so tests are deterministic.
 */
export function selectRecipients(rows: CustomerRow[], opts: { segment: SegmentKey; suppressed: Set<string>; recentlyMailed: Set<string>; now?: number }): { recipients: Recipient[]; skipped: { noConsent: number; suppressed: number; recent: number; invalid: number } } {
	const skipped = { noConsent: 0, suppressed: 0, recent: 0, invalid: 0 };
	const seen = new Set<string>();
	const recipients: Recipient[] = [];
	for (const row of rows) {
		if (!matchesSegment(row, opts.segment, opts.now)) continue;
		if (row.marketing_consent !== true) { skipped.noConsent++; continue; }
		const email = String(row.email ?? "").trim().toLowerCase();
		if (!row.source_id || !validEmail(email)) { skipped.invalid++; continue; }
		if (opts.suppressed.has(email)) { skipped.suppressed++; continue; }
		if (opts.recentlyMailed.has(row.source_id)) { skipped.recent++; continue; }
		if (seen.has(email)) continue;
		seen.add(email);
		recipients.push({
			customerId: row.source_id,
			email,
			name: firstName(row),
			vars: {
				nama: firstName(row),
				saldo: rupiah(Number(row.wallet_balance ?? 0)),
				exp_member: dateId(row.membership_expires_at),
				link: APP_URL,
				hari_tidak_aktif: String(inactiveDays(row, opts.now) ?? ""),
			},
		});
	}
	return { recipients, skipped };
}

// ---------- rendering ----------
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Replaces {{var}} with HTML-escaped values; unknown variables become empty. {{{var}}} is left raw (urls only). */
export function renderTemplate(source: string, vars: Record<string, string>) {
	return source
		.replace(/\{\{\{\s*([a-z_]+)\s*\}\}\}/gi, (_, key: string) => vars[key] ?? "")
		.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => escapeHtml(vars[key] ?? ""));
}

export function htmlToText(html: string) {
	return html
		.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
		.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
		.replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
		.replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- unsubscribe tokens (HMAC-SHA256 over the email) ----------
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
export async function unsubscribeToken(email: string, secret: string) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.trim().toLowerCase()))).slice(0, 40);
}
export async function verifyUnsubscribeToken(email: string, token: string, secret: string) {
	const expected = await unsubscribeToken(email, secret);
	if (token.length !== expected.length) return false;
	let diff = 0;
	for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
	return diff === 0;
}
export async function unsubscribeUrl(email: string, secret: string) {
	return `${FUNCTIONS_BASE}/email-unsubscribe?e=${encodeURIComponent(email.trim().toLowerCase())}&t=${await unsubscribeToken(email, secret)}`;
}

/** Helipod-Signature: t=<unix>,v1=<hex hmac-sha256 of "<t>.<raw body>"> */
export async function verifyHelipodSignature(raw: string, header: string, secret: string, now = Date.now(), toleranceSec = 300) {
	const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=") as [string, string]));
	const t = Number(parts.t);
	if (!t || Math.abs(now / 1000 - t) > toleranceSec || !parts.v1) return false;
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
	if (expected.length !== parts.v1.length) return false;
	let diff = 0;
	for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
	return diff === 0;
}

// ---------- layout + built-in templates ----------
export function wrapEmail(inner: string, preheader = "") {
	return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Djiwa Tentram</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111114;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6ea;">
<tr><td style="padding:18px 28px;border-bottom:1px solid #e6e6ea;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="40" style="padding:0 10px 0 0;"><img src="${LOGO_URL}" alt="" width="36" height="36" style="display:block;width:36px;height:36px;border:0;border-radius:18px;"></td><td style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#1a5dc6;">Djiwa Tentram</td></tr></table></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6;">${inner}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e6e6ea;background:#fafafb;font-size:12px;line-height:1.6;color:#6a6a76;">
Kamu menerima email ini karena kamu terdaftar di Djiwa Tentram dan setuju menerima info promo.<br>
<a href="{{{unsubscribe_url}}}" style="color:#6a6a76;">Berhenti berlangganan</a> · <a href="${APP_URL}" style="color:#6a6a76;">djiwatentram.web.id</a>
</td></tr></table></td></tr></table></body></html>`;
}

const button = (label: string, href = "{{{link}}}") => `<p style="margin:26px 0 8px;"><a href="${href}" style="display:inline-block;background:#1a5dc6;color:#ffffff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:10px;">${label}</a></p>`;
const h1 = (text: string) => `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;letter-spacing:-0.01em;">${text}</h1>`;
const p = (text: string) => `<p style="margin:0 0 14px;">${text}</p>`;
const box = (text: string) => `<div style="margin:18px 0;padding:14px 16px;background:#eaf1fc;border-left:3px solid #1a5dc6;">${text}</div>`;

export type BuiltinTemplate = { id: string; name: string; description: string; segment: SegmentKey; subject: string; html: string };

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
	{
		id: "builtin-comeback",
		name: "Ajakan kembali",
		description: "Untuk pelanggan yang lama tidak berkunjung: undang kembali ke Djiwa Tentram.",
		segment: "reactivate",
		subject: "{{nama}}, kami kangen kamu di Djiwa Tentram ☕",
		html: wrapEmail(
			h1("Halo {{nama}}, sudah lama ya!") +
			p("Sudah sekitar {{hari_tidak_aktif}} hari kamu belum mampir. Meja favoritmu masih menunggu, dan menu kami terus bertambah.") +
			box("<strong>Pesan lewat Djiwa App</strong> tanpa antre: pilih menu, bayar, lalu ambil. Bisa juga bayar dengan saldo Djiwa Pay.") +
			p("Yuk mampir lagi minggu ini — kami siapkan yang terbaik untukmu.") +
			button("Pesan sekarang"),
			"Sudah lama tidak mampir. Yuk kembali ke Djiwa Tentram.",
		),
	},
	{
		id: "builtin-wallet-reminder",
		name: "Pengingat saldo Djiwa Pay",
		description: "Untuk pelanggan yang masih punya saldo tapi lama tidak aktif.",
		segment: "wallet_idle",
		subject: "{{nama}}, saldo Djiwa Pay-mu {{saldo}} menunggu dipakai",
		html: wrapEmail(
			h1("Saldomu masih aman, {{nama}}") +
			p("Kamu masih punya saldo Djiwa Pay sebesar:") +
			`<p style="margin:0 0 18px;font-size:30px;font-weight:700;letter-spacing:-0.02em;">{{saldo}}</p>` +
			p("Pakai untuk pesan kopi, makanan, atau menu favoritmu di Djiwa Tentram. Pembayaran lebih cepat, tanpa uang tunai.") +
			button("Pakai saldo sekarang"),
			"Saldo Djiwa Pay kamu siap dipakai.",
		),
	},
	{
		id: "builtin-welcome",
		name: "Sambutan pelanggan baru",
		description: "Untuk pendaftar baru: perkenalkan Djiwa App dan ajak order pertama.",
		segment: "new_joiners",
		subject: "Selamat datang di Djiwa Tentram, {{nama}}!",
		html: wrapEmail(
			h1("Selamat datang, {{nama}} 👋") +
			p("Terima kasih sudah bergabung dengan Djiwa Tentram. Beberapa hal yang bisa kamu lakukan di Djiwa App:") +
			`<ul style="margin:0 0 14px;padding-left:20px;"><li style="margin-bottom:6px;">Pesan menu tanpa antre</li><li style="margin-bottom:6px;">Isi saldo Djiwa Pay dan bayar lebih cepat</li><li style="margin-bottom:6px;">Kumpulkan poin dan nikmati keuntungan member</li></ul>` +
			p("Mulai dengan pesanan pertamamu hari ini.") +
			button("Pesan pertamamu"),
			"Terima kasih sudah bergabung.",
		),
	},
	{
		id: "builtin-first-order",
		name: "Dorong order pertama",
		description: "Untuk pelanggan yang sudah daftar tapi belum pernah belanja.",
		segment: "never_bought",
		subject: "{{nama}}, yuk cicipi menu Djiwa Tentram",
		html: wrapEmail(
			h1("Belum sempat mencoba, {{nama}}?") +
			p("Akunmu sudah siap. Tinggal satu langkah: pilih menu dan pesan lewat Djiwa App.") +
			box("Tanpa antre, bisa dibayar dengan saldo Djiwa Pay, dan pesananmu bisa dipantau langsung dari aplikasi.") +
			button("Lihat menu"),
			"Akunmu sudah siap — pesan pertamamu menunggu.",
		),
	},
	{
		id: "builtin-member-renewal",
		name: "Member hampir berakhir",
		description: "Untuk member yang masa berlakunya berakhir dalam 30 hari.",
		segment: "member_expiring",
		subject: "{{nama}}, keanggotaanmu berakhir {{exp_member}}",
		html: wrapEmail(
			h1("Keanggotaanmu segera berakhir") +
			p("Halo {{nama}}, keanggotaan member Djiwa Tentram milikmu berlaku sampai <strong>{{exp_member}}</strong>.") +
			p("Manfaatkan dulu keuntungan member-mu, dan hubungi kasir kami bila ingin memperpanjang.") +
			button("Buka Djiwa App"),
			"Masa berlaku member akan segera habis.",
		),
	},
	{
		id: "builtin-announcement",
		name: "Pengumuman / promo",
		description: "Kerangka bebas untuk promo, menu baru, atau acara. Ubah teksnya sebelum dikirim.",
		segment: "active",
		subject: "Kabar baru dari Djiwa Tentram",
		html: wrapEmail(
			h1("Halo {{nama}}, ada kabar baru!") +
			p("Tulis isi pengumuman atau promo kamu di sini. Ceritakan apa yang baru, kapan berlakunya, dan kenapa pelanggan perlu mampir.") +
			box("<strong>Tips:</strong> satu pesan utama, satu tombol ajakan, dan kalimat singkat lebih efektif.") +
			button("Lihat selengkapnya"),
			"Ada kabar baru dari Djiwa Tentram.",
		),
	},
];

export const builtinTemplate = (id: string) => BUILTIN_TEMPLATES.find((template) => template.id === id) ?? null;
