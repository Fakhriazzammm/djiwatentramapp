import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import type { AdminDeps } from "./admin.js";
import { paySignals, type Signals } from "./admin-users.js";

/**
 * Email marketing for Djiwa Pay. It shares the engine of Djiwa Tentram (tables pos.email_*, the Helipod Email account, the
 * unsubscribe and delivery-webhook functions) but keeps its own campaigns and templates (brand = 'djiwapay') and its own
 * audience: people who use Pay, cut by what they did in the app.
 */
export const BRAND = "djiwapay";
export const APP_URL = "https://djiwapay.web.id";
const LOGO_URL = `${APP_URL}/pwa-192.png`;
const FROM_DEFAULT = "Djiwa Pay <hello@mail.djiwatentram.web.id>";
const FUNCTIONS_BASE = "https://supabase.djiwatentram.web.id/functions/v1";
const HELIPOD = "https://mail.helipod.io/api/email";
const FREQUENCY_CAP_HOURS = 72, SEND_CHUNK = 25, TIME_BUDGET_MS = 50_000, DAY = 86_400_000;
const CAMPAIGN_STOPPING = new Set(["DAILY_QUOTA_EXCEEDED", "MONTHLY_QUOTA_EXCEEDED", "PAYG_DISABLED", "INSUFFICIENT_BALANCE", "REPUTATION_SUSPENDED", "PLATFORM_REPUTATION", "TENANT_PAUSED", "SENDING_DISABLED", "DOMAIN_NOT_VERIFIED", "DOMAIN_NOT_FOUND", "INVALID_API_KEY", "API_KEY_EXPIRED", "NO_PLAN", "RATE_LIMITED"]);

export const SEGMENTS = {
  all: "Semua pengguna Djiwa Pay",
  new: "Pendaftar baru ≤14 hari",
  not_onboarded: "Daftar tapi belum selesai onboarding",
  no_entries: "Belum pernah mencatat keuangan",
  active: "Aktif ≤14 hari",
  dormant: "Tidak aktif >30 hari",
  no_google: "Belum menghubungkan Google",
  wallet: "Punya saldo Djiwa Pay",
  invite_old: "Pelanggan lama yang belum mencoba Pay",
  android_testers: "Penguji Android (Gmail, setuju info)",
} as const;
export type SegmentKey = keyof typeof SEGMENTS;
export const isSegment = (v: unknown): v is SegmentKey => typeof v === "string" && v in SEGMENTS;

export type Row = { id: string; email: string | null; name: string | null; nickname: string | null; consent: boolean | null; created_at: string | Date | null; balance: number | string | null };
const t = (v: unknown) => { const n = v ? new Date(v as string).getTime() : 0; return Number.isFinite(n) ? n : 0; };
const rupiah = (n: number) => `Rp${Math.round(n || 0).toLocaleString("id-ID")}`;
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
export const validEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());
export function firstName(r: Pick<Row, "name" | "nickname">) {
  const raw = String(r.nickname || r.name || "").trim().replace(/^\d+[_-]+/, ""), first = raw.split(/\s+/)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "Sahabat Djiwa";
}

/** Does this person belong to the segment? `sig` says what they did in Pay (see paySignals). */
export function matches(r: Row, key: SegmentKey, sig: Signals, now = Date.now()): boolean {
  const created = t(r.created_at), launch = sig.launch ? t(sig.launch) : 0;
  const inPay = sig.first.has(r.id) || (launch > 0 && created >= launch);
  const seen = t(sig.lastSeen.get(r.id)), idle = seen ? Math.floor((now - seen) / DAY) : null;
  switch (key) {
    case "all": return inPay;
    case "new": return inPay && created > 0 && now - created <= 14 * DAY;
    case "not_onboarded": return inPay && !sig.onboarded.has(r.id);
    case "no_entries": return inPay && !(sig.entries.get(r.id) ?? 0);
    case "active": return idle !== null && idle <= 14;
    case "dormant": return idle !== null && idle > 30;
    case "no_google": return inPay && !sig.google.has(r.id);
    case "wallet": return inPay && Number(r.balance ?? 0) > 0;
    case "invite_old": return !inPay;
    case "android_testers": return /@(gmail|googlemail)\.com$/i.test(String(r.email ?? "").trim());
  }
}

export type Recipient = { customerId: string; email: string; name: string; vars: Record<string, string> };
export function selectRecipients(rows: Row[], sig: Signals, o: { segment: SegmentKey; suppressed: Set<string>; recentlyMailed: Set<string>; now?: number }) {
  const skipped = { noConsent: 0, suppressed: 0, recent: 0, invalid: 0 }, seen = new Set<string>(), recipients: Recipient[] = [], now = o.now ?? Date.now();
  for (const r of rows) {
    if (!matches(r, o.segment, sig, now)) continue;
    if (r.consent !== true) { skipped.noConsent++; continue; }
    const email = String(r.email ?? "").trim().toLowerCase();
    if (!validEmail(email)) { skipped.invalid++; continue; }
    if (o.suppressed.has(email)) { skipped.suppressed++; continue; }
    if (o.recentlyMailed.has(r.id)) { skipped.recent++; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    const seenAt = t(sig.lastSeen.get(r.id));
    recipients.push({ customerId: r.id, email, name: firstName(r), vars: { nama: firstName(r), saldo: rupiah(Number(r.balance ?? 0)), jumlah_catatan: String(sig.entries.get(r.id) ?? 0), hari_tidak_aktif: seenAt ? String(Math.floor((now - seenAt) / DAY)) : "", link: APP_URL } });
  }
  return { recipients, skipped };
}

/* ---------- rendering ---------- */
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** {{var}} is HTML-escaped, {{{var}}} is raw (urls only); unknown variables become empty. */
export const renderTemplate = (src: string, vars: Record<string, string>) => src.replace(/\{\{\{\s*([a-z_]+)\s*\}\}\}/gi, (_, k: string) => vars[k] ?? "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => esc(vars[k] ?? ""));
export function htmlToText(html: string) {
  return html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "").replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)").replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
}
/** Same token as the email-unsubscribe function checks: first 40 hex chars of HMAC-SHA256(email). */
export const unsubscribeToken = (email: string, secret: string) => createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex").slice(0, 40);
export const unsubscribeUrl = (email: string, secret: string) => `${FUNCTIONS_BASE}/email-unsubscribe?e=${encodeURIComponent(email.trim().toLowerCase())}&t=${unsubscribeToken(email, secret)}`;
export const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function wrapEmail(inner: string, preheader = "") {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Djiwa Pay</title></head>
<body style="margin:0;padding:0;background:#f5f1e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16161a;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1e8;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4ddcd;">
<tr><td style="padding:18px 28px;border-bottom:1px solid #e4ddcd;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="40" style="padding:0 10px 0 0;"><img src="${LOGO_URL}" alt="" width="36" height="36" style="display:block;width:36px;height:36px;border:0;border-radius:9px;"></td><td style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#16161a;">Djiwa Pay</td></tr></table></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6;">${inner}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e4ddcd;background:#faf7f0;font-size:12px;line-height:1.6;color:#6c6a62;">
Kamu menerima email ini karena kamu memakai Djiwa Pay dan setuju menerima info dari kami.<br>
<a href="{{{unsubscribe_url}}}" style="color:#6c6a62;">Berhenti berlangganan</a> · <a href="${APP_URL}" style="color:#6c6a62;">djiwapay.web.id</a>
</td></tr></table></td></tr></table></body></html>`;
}
const button = (label: string, href = "{{{link}}}") => `<p style="margin:26px 0 8px;"><a href="${href}" style="display:inline-block;background:#16161a;color:#ffffff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:10px;">${label}</a></p>`;
const h1 = (s: string) => `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;letter-spacing:-0.01em;">${s}</h1>`;
const p = (s: string) => `<p style="margin:0 0 14px;">${s}</p>`;
const steps = (items: string[]) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 4px;">${items.map((x, i) => `<tr><td width="34" valign="top" style="padding:0 0 12px;"><div style="width:24px;height:24px;border-radius:12px;background:#16161a;color:#ffffff;font-size:13px;font-weight:700;line-height:24px;text-align:center;">${i + 1}</div></td><td style="padding:0 0 12px;font-size:15px;line-height:1.55;">${x}</td></tr>`).join("")}</table>`;
const feature = (title: string, body: string) => `<tr><td style="padding:0 0 12px;"><strong>${title}</strong><br><span style="color:#55534c;">${body}</span></td></tr>`;
const box = (s: string) => `<div style="margin:18px 0;padding:14px 16px;background:#f3eddc;border-left:3px solid #16161a;">${s}</div>`;

/* ---------- house style for campaign email: hero image, animated section GIFs, one button (see docs/djiwapay-email-standard.md) ---------- */
/** Art lives in apps/djiwapay/public/assets/email/<slug>/ and is served from APP_URL. Alt text is required: many clients block images. */
export const emailArt = (slug: string, file: string, alt: string, width: number) =>
  `<img src="${APP_URL}/assets/email/${slug}/${file}" alt="${alt}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:12px;">`;

export const emailHero = (slug: string, alt: string) => emailArt(slug, "hero.jpg", alt, 504);
/** A titled block with a small looping GIF (176px source, shown at 72px) beside the heading. */
export const emailSection = (slug: string, gif: string, title: string, content: string) =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 8px;"><tr><td width="72" style="padding-right:14px;">${emailArt(slug, gif, "", 72)}</td><td><h2 style="margin:0;font-size:18px;line-height:1.3;">${title}</h2></td></tr></table>${content}`;

export type Builtin = { id: string; name: string; description: string; segment: SegmentKey; subject: string; html: string };
export const BUILTIN_TEMPLATES: Builtin[] = [
  { id: "builtin-welcome", name: "Sambutan pengguna baru", description: "Untuk pendaftar baru: kenalkan cara mencatat pertama.", segment: "new", subject: "Selamat datang di Djiwa Pay, {{nama}}!",
    html: wrapEmail(h1("Selamat datang, {{nama}} 👋") + p("Djiwa Pay membantu kamu mencatat uang masuk dan keluar tanpa repot. Tiga langkah awal:") + `<ol style="margin:0 0 14px;padding-left:20px;"><li style="margin-bottom:6px;">Catat pengeluaran pertamamu</li><li style="margin-bottom:6px;">Tambahkan dompet atau rekening</li><li style="margin-bottom:6px;">Hubungkan Gmail agar catatan terisi otomatis</li></ol>` + button("Buka Djiwa Pay"), "Mulai catat keuanganmu dalam satu menit.") },
  { id: "builtin-first-entry", name: "Dorong catatan pertama", description: "Untuk yang sudah daftar tapi belum pernah mencatat.", segment: "no_entries", subject: "{{nama}}, catatan pertamamu cuma 10 detik",
    html: wrapEmail(h1("Belum ada catatan, {{nama}}") + p("Akunmu sudah siap. Ketuk tombol <strong>Catat</strong>, isi jumlah dan kategori, selesai.") + box("Tidak mau mengetik? Foto struk atau hubungkan Gmail, Djiwa Pay yang mencatatkan.") + button("Catat sekarang"), "Satu catatan untuk memulai.") },
  { id: "builtin-connect-google", name: "Hubungkan Google & Gmail", description: "Untuk yang belum menghubungkan Google: catat otomatis dari email pembayaran.", segment: "no_google", subject: "{{nama}}, biar Djiwa Pay yang mencatat untukmu",
    html: wrapEmail(h1("Catat otomatis dari email") + p("Hubungkan akun Google, lalu notifikasi pembayaran dari bank dan e-wallet masuk sebagai catatan tanpa kamu mengetik.") + box("Kamu bisa menyalakan atau mematikan tiap layanan kapan saja: Gmail, Kalender, Spreadsheet, dan foto struk.") + button("Hubungkan sekarang", "{{{link}}}/integrasi"), "Catatan terisi sendiri dari email pembayaran.") },
  { id: "builtin-comeback", name: "Ajakan kembali", description: "Untuk pengguna yang lebih dari 30 hari tidak membuka Djiwa Pay.", segment: "dormant", subject: "{{nama}}, sudah {{hari_tidak_aktif}} hari — yuk rapikan catatanmu",
    html: wrapEmail(h1("Halo {{nama}}, sudah lama ya!") + p("Sudah sekitar {{hari_tidak_aktif}} hari kamu belum membuka Djiwa Pay. Catatanmu masih tersimpan ({{jumlah_catatan}} catatan).") + box("Luangkan 2 menit untuk melihat ringkasan bulan ini dan menandai pengeluaran yang belum tercatat.") + button("Lihat ringkasan"), "Catatanmu menunggu.") },
  { id: "builtin-wallet", name: "Pengingat saldo", description: "Untuk pengguna yang masih punya saldo Djiwa Pay.", segment: "wallet", subject: "{{nama}}, saldo Djiwa Pay-mu {{saldo}}",
    html: wrapEmail(h1("Saldomu masih aman") + p("Kamu punya saldo Djiwa Pay sebesar:") + `<p style="margin:0 0 18px;font-size:30px;font-weight:700;letter-spacing:-0.02em;">{{saldo}}</p>` + p("Pakai untuk belanja di Djiwa Tentram, dan semua pengeluarannya tercatat otomatis.") + button("Buka Djiwa Pay"), "Saldo Djiwa Pay kamu siap dipakai.") },
  { id: "builtin-invite", name: "Undangan untuk pelanggan lama", description: "Untuk pelanggan Djiwa Tentram yang belum membuka Djiwa Pay.", segment: "invite_old", subject: "{{nama}}, kenalan dengan Djiwa Pay",
    html: wrapEmail(h1("Halo {{nama}}, ada yang baru!") + p("Akun Djiwa Tentram-mu sudah bisa dipakai di <strong>Djiwa Pay</strong>, aplikasi pencatat keuangan pribadi dari kami.") + box("Masuk dengan akun yang sama. Tidak perlu daftar ulang.") + button("Coba Djiwa Pay"), "Pencatat keuangan dari Djiwa Tentram.") },
  { id: "builtin-android-tester", name: "Undangan uji coba Android", description: "Untuk pelanggan ber-Gmail yang setuju info: ajak jadi penguji pertama aplikasi Android Djiwa Pay.", segment: "android_testers", subject: "{{nama}}, kamu diundang jadi yang pertama mencoba Djiwa Pay di Android",
    html: wrapEmail(
      emailHero("android-tester", "Maskot Djiwa Pay memeriksa struk kopi di ponselnya.") +
      `<p style="margin:16px 0 6px;font-size:12px;color:#695746;">Djiwa Pay by Djiwa Tentram &amp; Zantara Technology</p>` +
      h1("{{nama}}, aplikasi Android Djiwa Pay sudah siap dicoba") +
      p("Kami sedang membuka uji coba terbatas untuk pelanggan Djiwa Tentram, sebelum aplikasinya tersedia untuk umum. Kamu salah satu yang kami undang, gratis.") +
      emailSection("android-tester", "receipt.gif", "Mulai dari struk kopi hari ini",
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">` +
        feature("Foto struk, langsung tercatat", "Arahkan kamera ke struk. Item, pajak, dan total terbaca otomatis, kamu tinggal memeriksa.") +
        feature("Catat dengan suara atau teks", "Cukup bilang “kopi 25rb dan parkir 5rb”.") +
        feature("Catat otomatis dari email pembayaran", "Kalau mau, hubungkan Gmail untuk mencatat pembayaran dari email.") + `</table>`) +
      emailSection("android-tester", "budget.gif", "Lihat ke mana uangmu pergi",
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">` +
        feature("Tagihan, anggaran, dan laporan", "Cek sisa anggaran, lihat pengeluaran bulan ini, dan pasang pengingat tagihan.") +
        feature("Foto aset jadi stiker", "Emas, perhiasan, atau aset lain dipantau nilainya dari waktu ke waktu.") + `</table>`) +
      emailSection("android-tester", "invite.gif", "Cara bergabung dalam tiga langkah",
        steps(["Buka tombol di bawah <strong>dari HP Android</strong> dan masuk dengan akun Google yang sama dengan alamat email ini.", "Ketuk <strong>Jadi penguji</strong>, lalu <strong>Unduh di Google Play</strong>.", "Masuk dengan akun Djiwa Tentram-mu. Tidak perlu daftar ulang."])) +
      button("Gabung sebagai penguji", "https://play.google.com/apps/internaltest/4701234918447287738") +
      box("Untuk Android 7.0 ke atas. Ini versi uji coba, jadi mungkin masih ada yang kurang rapi. Kalau menemukan sesuatu yang janggal, cukup balas email ini dan ceritakan, masukanmu sangat berarti.") +
      p(`<span style="color:#6c6a62;font-size:13px;">Tombol hanya berfungsi untuk alamat Gmail yang kami daftarkan. Pengguna iPhone tetap bisa memakai Djiwa Pay lewat <a href="{{{link}}}" style="color:#6c6a62;">djiwapay.web.id</a>.</span>`), "Undangan uji coba terbatas, gratis. Tinggal tiga langkah.") },
  { id: "builtin-announcement", name: "Pengumuman / fitur baru", description: "Kerangka bebas. Ubah teksnya sebelum dikirim.", segment: "active", subject: "Kabar baru dari Djiwa Pay",
    html: wrapEmail(h1("Halo {{nama}}, ada kabar baru!") + p("Tulis isi pengumuman di sini: apa yang baru, kenapa berguna, dan apa yang perlu dilakukan pengguna.") + box("<strong>Tips:</strong> satu pesan utama dan satu tombol ajakan.") + button("Lihat selengkapnya"), "Ada kabar baru dari Djiwa Pay.") },
];

/* ---------- engine ---------- */
class UserError extends Error { constructor(message: string, public code = "BAD_REQUEST") { super(message); } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
type Db = NonNullable<AdminDeps["authDb"]>;
type Json = Record<string, unknown>;

export function emailEngine(d: AdminDeps) {
  const need = (): Db => { if (!d.authDb) throw new UserError("Database pelanggan belum terhubung", "NOT_CONFIGURED"); return d.authDb; };
  const cache = new Map<string, { v: string; at: number }>();
  async function setting(name: string): Promise<string> {
    const env = process.env[name]?.trim(); if (env) return env;
    const hit = cache.get(name); if (hit && Date.now() - hit.at < 60_000) return hit.v;
    const r = await need().query("select value from pos.email_settings where key = $1", [name]), v = String(r.rows[0]?.value ?? "").trim();
    if (v) cache.set(name, { v, at: Date.now() });
    return v;
  }
  const must = async (name: string) => { const v = await setting(name); if (!v) throw new UserError(`Konfigurasi ${name} belum dipasang di server`, "NOT_CONFIGURED"); return v; };
  const fromAddress = async () => (await setting("EMAIL_FROM_DJIWAPAY")) || FROM_DEFAULT;

  async function helipod(path: string, init: { method?: string; body?: unknown } = {}) {
    const res = await fetch(`${HELIPOD}${path}`, { method: init.method ?? "GET", headers: { Authorization: `Bearer ${await must("HELIPOD_EMAIL_API_KEY")}`, "Content-Type": "application/json" }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    const json = await res.json().catch(() => null) as { success?: boolean; data?: any; error?: string; code?: string } | null;
    return { status: res.status, retryAfter: Number(res.headers.get("retry-after") ?? 0), json };
  }
  async function quota() {
    try {
      const { json } = await helipod("/status"), x = json?.data; if (!x) return null;
      const limit = Number(x.usage?.monthlyLimit ?? 0), used = Number(x.usage?.month ?? 0), dl = Number(x.usage?.dailyLimit ?? 0);
      return { plan: x.plan?.code ?? "", limit, used, remaining: limit ? Math.max(0, limit - used) : null, dailyLeft: dl ? Math.max(0, dl - Number(x.usage?.today ?? 0)) : null, payg: Boolean(x.subscription?.paygEnabled), expiredAt: x.subscription?.expiredAt ?? null };
    } catch { return null; }
  }

  async function customers(): Promise<Row[]> {
    const r = await need().query("select c.source_id id, c.email, c.name, c.nickname, c.marketing_consent consent, c.created_at, coalesce(w.available_balance,0) balance from pos.customers c left join pos.customer_wallets w on w.customer_id = c.source_id");
    return r.rows;
  }
  const suppressed = async () => new Set<string>((await need().query("select email from pos.email_suppressions")).rows.map((x: any) => String(x.email).toLowerCase()));
  const recentlyMailed = async (exclude?: string) => new Set<string>((await need().query(`select distinct customer_id from pos.email_campaign_recipients where sent_at >= now() - ($1 || ' hours')::interval and status in ('sent','delivered','bounced','complained') and ($2::uuid is null or campaign_id <> $2::uuid)`, [String(FREQUENCY_CAP_HOURS), exclude ?? null])).rows.map((x: any) => String(x.customer_id)));
  async function audience(segment: SegmentKey, exclude?: string) {
    const [rows, sig, sup, recent] = await Promise.all([customers(), paySignals(d, true), suppressed(), recentlyMailed(exclude)]);
    return { rows, sig, sup, recent, ...selectRecipients(rows, sig, { segment, suppressed: sup, recentlyMailed: recent }) };
  }

  async function overview() {
    const db = need(), [rows, sig, sup, recent, q, tpl] = await Promise.all([customers(), paySignals(d, true), suppressed(), recentlyMailed(), quota(), db.query("select id, name, description, subject, html, updated_at from pos.email_templates where brand = $1 order by updated_at desc", [BRAND])]);
    const segments = (Object.keys(SEGMENTS) as SegmentKey[]).map((key) => ({ key, label: SEGMENTS[key], eligible: selectRecipients(rows, sig, { segment: key, suppressed: sup, recentlyMailed: recent }).recipients.length, members: rows.filter((r) => matches(r, key, sig)).length }));
    const payUsers = rows.filter((r) => matches(r, "all", sig));
    return { segments, customers: { total: rows.length, pay: payUsers.length, payConsented: payUsers.filter((r) => r.consent === true).length, consented: rows.filter((r) => r.consent === true).length, suppressed: sup.size }, quota: q, from: await fromAddress(), builtinTemplates: BUILTIN_TEMPLATES, customTemplates: tpl.rows };
  }
  async function preview(b: Json) {
    if (!isSegment(b.segment)) throw new UserError("Segmen tidak dikenal");
    const { recipients, skipped } = await audience(b.segment, text(b.campaignId) || undefined);
    return { total: recipients.length, skipped, sample: recipients.slice(0, 5).map((r) => ({ name: r.name, email: r.email })) };
  }
  function content(b: Json) {
    const name = text(b.name).slice(0, 120), subject = text(b.subject).slice(0, 300), html = typeof b.html === "string" ? b.html : "";
    if (!subject) throw new UserError("Subjek wajib diisi");
    if (html.trim().length < 20) throw new UserError("Isi email terlalu pendek");
    if (html.length > 400_000) throw new UserError("Isi email terlalu besar");
    if (!html.includes("{{{unsubscribe_url}}}")) throw new UserError("Email wajib memuat link berhenti berlangganan: {{{unsubscribe_url}}}");
    return { name, subject, html };
  }
  async function saveTemplate(b: Json, by: string) {
    const c = content({ ...b, name: b.name || "x" }), name = text(b.name).slice(0, 120); if (!name) throw new UserError("Nama template wajib diisi");
    const id = text(b.id), db = need();
    const r = id ? await db.query("update pos.email_templates set name=$2, description=$3, subject=$4, html=$5, updated_at=now() where id=$1::uuid and brand=$6 returning id,name,description,subject,html,updated_at", [id, name, text(b.description).slice(0, 300), c.subject, c.html, BRAND])
      : await db.query("insert into pos.email_templates (name, description, subject, html, created_by, brand) values ($1,$2,$3,$4,$5,$6) returning id,name,description,subject,html,updated_at", [name, text(b.description).slice(0, 300), c.subject, c.html, by, BRAND]);
    return { template: r.rows[0] };
  }
  async function deleteTemplate(b: Json) { await need().query("delete from pos.email_templates where id = $1::uuid and brand = $2", [text(b.id), BRAND]); return { deleted: true }; }

  async function createCampaign(b: Json, by: string) {
    const c = content(b); if (!c.name) throw new UserError("Nama kampanye wajib diisi");
    if (!isSegment(b.segment)) throw new UserError("Segmen tidak dikenal");
    let at: string | null = null;
    if (b.scheduledAt) { const dt = new Date(String(b.scheduledAt)); if (Number.isNaN(dt.getTime()) || dt.getTime() < Date.now() + 60_000) throw new UserError("Jadwal harus minimal 1 menit dari sekarang"); at = dt.toISOString(); }
    const r = await need().query("insert into pos.email_campaigns (name, subject, html, template_id, segment, status, scheduled_at, from_address, created_by, brand) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *", [c.name, c.subject, c.html, text(b.templateId) || null, b.segment, at ? "scheduled" : "draft", at, await fromAddress(), by, BRAND]);
    return { campaign: r.rows[0] };
  }
  const stats = async (ids: string[]) => { const out: Record<string, Record<string, number>> = {}; if (!ids.length) return out; for (const x of (await need().query("select campaign_id, status, count(*)::int n from pos.email_campaign_recipients where campaign_id = any($1::uuid[]) group by 1,2", [ids])).rows) (out[x.campaign_id] ??= {})[x.status] = Number(x.n); return out; };
  async function listCampaigns() {
    const rows = (await need().query("select * from pos.email_campaigns where brand = $1 order by created_at desc limit 100", [BRAND])).rows, s = await stats(rows.map((x: any) => x.id));
    const open = await need().query("select campaign_id, count(*) filter (where opened_at is not null)::int o, count(*) filter (where clicked_at is not null)::int c from pos.email_campaign_recipients where campaign_id = any($1::uuid[]) group by 1", [rows.map((x: any) => x.id)]);
    const oc = new Map(open.rows.map((x: any) => [x.campaign_id, x]));
    return { campaigns: rows.map((x: any) => ({ ...x, stats: s[x.id] ?? {}, opened: Number((oc.get(x.id) as any)?.o ?? 0), clicked: Number((oc.get(x.id) as any)?.c ?? 0) })) };
  }
  async function getCampaign(b: Json) {
    const id = text(b.id), db = need(), c = (await db.query("select * from pos.email_campaigns where id = $1::uuid and brand = $2", [id, BRAND])).rows[0];
    if (!c) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND");
    const status = text(b.status);
    const [recips, s, oc] = await Promise.all([
      db.query(`select id, customer_id, email, name, status, error, sent_at, delivered_at, opened_at, clicked_at from pos.email_campaign_recipients where campaign_id = $1::uuid ${status ? "and status = $2" : ""} order by id limit 300`, status ? [id, status] : [id]),
      stats([id]), db.query("select count(*) filter (where opened_at is not null)::int o, count(*) filter (where clicked_at is not null)::int c from pos.email_campaign_recipients where campaign_id = $1::uuid", [id]),
    ]);
    return { campaign: c, recipients: recips.rows, stats: s[id] ?? {}, opened: Number(oc.rows[0].o), clicked: Number(oc.rows[0].c), running: running.has(id) };
  }
  async function deleteCampaign(b: Json) {
    const id = text(b.id), r = (await need().query("select status from pos.email_campaigns where id = $1::uuid and brand = $2", [id, BRAND])).rows[0];
    if (!r) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND");
    if (!["draft", "scheduled", "canceled"].includes(r.status)) throw new UserError("Hanya draf, terjadwal, atau dibatalkan yang bisa dihapus");
    await need().query("delete from pos.email_campaigns where id = $1::uuid", [id]); return { deleted: true };
  }
  async function sendTest(b: Json) {
    const to = text(b.to).toLowerCase(); if (!validEmail(to)) throw new UserError("Alamat email uji tidak valid");
    const c = content({ ...b, name: "uji" }), vars = { nama: "Tes", saldo: "Rp25.000", jumlah_catatan: "12", hari_tidak_aktif: "45", link: APP_URL, unsubscribe_url: unsubscribeUrl(to, await must("EMAIL_UNSUB_SECRET")) };
    const html = renderTemplate(c.html, vars), { status, json } = await helipod("/send", { method: "POST", body: { from: await fromAddress(), to: [to], subject: `[UJI] ${renderTemplate(c.subject, vars)}`, html, text: htmlToText(html) } });
    if (!json?.success) throw new UserError(`Email uji ditolak: ${json?.error ?? status}`, json?.code ?? "PROVIDER_ERROR");
    return { sent: true };
  }

  async function materialize(c: { id: string; segment: string }) {
    const { recipients } = await audience(c.segment as SegmentKey, c.id);
    if (!recipients.length) throw new UserError("Tidak ada penerima yang memenuhi syarat untuk segmen ini");
    for (let i = 0; i < recipients.length; i += 500) {
      const part = recipients.slice(i, i + 500);
      await need().query(`insert into pos.email_campaign_recipients (campaign_id, customer_id, email, name, vars) select $1::uuid, x.customer_id, x.email, x.name, x.vars from jsonb_to_recordset($2::jsonb) as x(customer_id text, email text, name text, vars jsonb) on conflict (campaign_id, customer_id) do nothing`,
        [c.id, JSON.stringify(part.map((r) => ({ customer_id: r.customerId, email: r.email, name: r.name, vars: r.vars })))]);
    }
    return recipients.length;
  }
  const running = new Set<string>();
  async function startCampaign(b: Json) {
    const id = text(b.id), db = need(), c = (await db.query("select * from pos.email_campaigns where id = $1::uuid and brand = $2", [id, BRAND])).rows[0];
    if (!c) throw new UserError("Kampanye tidak ditemukan", "NOT_FOUND");
    if (!["draft", "scheduled", "paused"].includes(c.status)) throw new UserError(`Kampanye berstatus ${c.status} dan tidak bisa dimulai`);
    const q = await quota();
    if (q?.remaining !== null && q?.remaining !== undefined && !q.payg) {
      const planned = c.status === "paused" ? Number((await db.query("select count(*)::int n from pos.email_campaign_recipients where campaign_id = $1::uuid and status = 'queued'", [id])).rows[0].n) : (await audience(c.segment, id)).recipients.length;
      if (planned > q.remaining) throw new UserError(`Kuota bulan ini tersisa ${q.remaining} email, sedangkan kampanye butuh ${planned}. Kurangi segmen, aktifkan pay-as-you-go, atau tunggu periode berikutnya.`, "QUOTA");
    }
    const total = c.status === "paused" ? c.total_recipients : await materialize(c);
    await db.query("update pos.email_campaigns set status='sending', total_recipients=$2, started_at=coalesce(started_at, now()), scheduled_at=null, last_error=null where id=$1::uuid", [id, total]);
    void drive(id);   // sends in the background; the page polls the campaign
    return await getCampaign({ id });
  }
  /** Keeps one campaign moving until it is done, paused or out of time; the worker picks it up again every minute. */
  async function drive(id: string) {
    if (running.has(id)) return; running.add(id);
    try { await processCampaign(id); } catch (e) { console.error("email campaign failed", id, e instanceof Error ? e.message : e); await need().query("update pos.email_campaigns set status='paused', last_error=$2 where id=$1::uuid and status='sending'", [id, (e instanceof Error ? e.message : String(e)).slice(0, 300)]).catch(() => {}); }
    finally { running.delete(id); }
  }
  async function processCampaign(id: string) {
    const db = need(), deadline = Date.now() + TIME_BUDGET_MS, secret = await must("EMAIL_UNSUB_SECRET"), from = await fromAddress();
    let stopped: string | null = null;
    for (;;) {
      const c = (await db.query("select * from pos.email_campaigns where id = $1::uuid", [id])).rows[0]; if (!c || c.status !== "sending") break;
      const batch = (await db.query("select id, customer_id, email, vars, attempts from pos.email_campaign_recipients where campaign_id = $1::uuid and status = 'queued' order by id limit $2", [id, SEND_CHUNK])).rows;
      if (!batch.length) { await db.query("update pos.email_campaigns set status='done', finished_at=now() where id=$1::uuid and status='sending'", [id]); break; }
      const messages = batch.map((row: any) => {
        const vars: Record<string, string> = {}; for (const [k, v] of Object.entries((row.vars ?? {}) as Record<string, string>)) vars[k] = String(v).replaceAll("{{", "{ {");
        vars.unsubscribe_url = unsubscribeUrl(row.email, secret); const html = renderTemplate(c.html, vars);
        return { from, to: [row.email], subject: renderTemplate(c.subject, vars), html, text: htmlToText(html), headers: { "List-Unsubscribe": `<${vars.unsubscribe_url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, metadata: { campaignId: id }, idempotencyKey: `${id}-${row.customer_id}`.slice(0, 128) };
      });
      const res = await helipod("/send/batch", { method: "POST", body: { messages } });
      type Item = { id?: string; error?: string; code?: string };
      const items: Item[] | null = Array.isArray(res.json?.data) ? res.json!.data : Array.isArray(res.json?.data?.results) ? res.json!.data.results : null;
      if (res.status === 429) { await sleep(Math.min(10, Math.max(1, res.retryAfter || 2)) * 1000); continue; }
      const bad = async (row: any, err: string) => { const n = row.attempts + 1; await db.query("update pos.email_campaign_recipients set attempts=$2, error=$3, status=$4 where id=$1", [row.id, n, err.slice(0, 300), n >= 3 ? "failed" : "queued"]); };
      if (!items) {
        const code = res.json?.code ?? `HTTP_${res.status}`;
        if (CAMPAIGN_STOPPING.has(code) || [401, 402, 403].includes(res.status)) { stopped = `${code}: ${res.json?.error ?? "ditolak penyedia email"}`; break; }
        for (const row of batch) await bad(row, code);
        if (Date.now() > deadline) break; continue;
      }
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i], it = items[i] ?? {};
        if (it.id) await db.query("update pos.email_campaign_recipients set status='sent', provider_id=$2, sent_at=now(), attempts=$3, error=null where id=$1", [row.id, it.id, row.attempts + 1]);
        else if (it.code === "RECIPIENT_SUPPRESSED") { await db.query("update pos.email_campaign_recipients set status='skipped', error=$2 where id=$1", [row.id, it.error ?? it.code]); await db.query("insert into pos.email_suppressions (email, reason, source) values ($1,'bounce','provider') on conflict do nothing", [row.email]); }
        else if (it.code && CAMPAIGN_STOPPING.has(it.code)) stopped = `${it.code}: ${it.error ?? ""}`;
        else await bad(row, it.error ?? it.code ?? "unknown");
      }
      if (stopped || Date.now() > deadline) break;
      await sleep(1200);
    }
    if (stopped) await db.query("update pos.email_campaigns set status='paused', last_error=$2 where id=$1::uuid and status='sending'", [id, stopped]);
  }
  async function setStatus(b: Json, to: "paused" | "canceled") {
    const id = text(b.id), allowed = to === "paused" ? ["sending"] : ["draft", "scheduled", "sending", "paused"];
    const r = await need().query(`update pos.email_campaigns set status=$2 ${to === "canceled" ? ", finished_at=now()" : ""} where id=$1::uuid and brand=$3 and status = any($4::text[]) returning id`, [id, to, BRAND, allowed]);
    if (!r.rows.length) throw new UserError("Status kampanye tidak bisa diubah");
    if (to === "canceled") await need().query("update pos.email_campaign_recipients set status='skipped', error='kampanye dibatalkan' where campaign_id=$1::uuid and status='queued'", [id]);
    return await getCampaign({ id });
  }
  async function suppressions() { return { suppressions: (await need().query("select email, reason, source, created_at from pos.email_suppressions order by created_at desc limit 500")).rows }; }
  async function addSuppression(b: Json) { const e = text(b.email).toLowerCase(); if (!validEmail(e)) throw new UserError("Alamat email tidak valid"); await need().query("insert into pos.email_suppressions (email, reason, source) values ($1,'manual','admin-djiwapay') on conflict (email) do update set reason='manual'", [e]); return suppressions(); }
  async function removeSuppression(b: Json) { await need().query("delete from pos.email_suppressions where email = $1", [text(b.email).toLowerCase()]); return suppressions(); }

  /** Called every minute: start due scheduled campaigns and re-drive the ones that were mid-send. */
  async function tick() {
    if (!d.authDb) return;
    const due = (await d.authDb.query("select id from pos.email_campaigns where brand = $1 and status = 'scheduled' and scheduled_at <= now() limit 3", [BRAND])).rows;
    for (const c of due) await startCampaign({ id: c.id }).catch(async (e) => { await d.authDb!.query("update pos.email_campaigns set status='paused', last_error=$2 where id=$1::uuid", [c.id, (e instanceof Error ? e.message : String(e)).slice(0, 300)]); });
    for (const c of (await d.authDb.query("select id from pos.email_campaigns where brand = $1 and status = 'sending' limit 3", [BRAND])).rows) void drive(c.id);
  }
  return { overview, preview, saveTemplate, deleteTemplate, createCampaign, listCampaigns, getCampaign, deleteCampaign, sendTest, startCampaign, pause: (b: Json) => setStatus(b, "paused"), cancel: (b: Json) => setStatus(b, "canceled"), suppressions, addSuppression, removeSuppression, tick };
}

export function registerEmailRoutes(app: Hono, d: AdminDeps, json: (c: any, body: unknown, status?: number) => Response) {
  const eng = emailEngine(d);
  // /api/finance/admin/* is already behind the admin guard (see registerAdminRoutes)
  const by = (c: any) => String(c.get("adminEmail") ?? "admin");
  const wrap = (fn: (c: any, body: Json) => Promise<unknown>) => async (c: any) => {
    try { const body = c.req.method === "GET" || c.req.method === "DELETE" ? {} : await c.req.json().catch(() => ({})); return json(c, { success: true, ...(await fn(c, body) as object) }); }
    catch (e) { if (e instanceof UserError) return json(c, { success: false, error: e.message, code: e.code }, e.code === "NOT_FOUND" ? 404 : 400); console.error("email admin failed", e instanceof Error ? e.message : e); return json(c, { success: false, error: "QUERY_FAILED" }, 500); }
  };
  const P = "/api/finance/admin/email";
  app.get(`${P}/overview`, wrap(() => eng.overview()));
  app.post(`${P}/preview`, wrap((_, b) => eng.preview(b)));
  app.post(`${P}/templates`, wrap((c, b) => eng.saveTemplate(b, by(c))));
  app.delete(`${P}/templates/:id`, wrap((c) => eng.deleteTemplate({ id: c.req.param("id") })));
  app.get(`${P}/campaigns`, wrap(() => eng.listCampaigns()));
  app.post(`${P}/campaigns`, wrap((c, b) => eng.createCampaign(b, by(c))));
  app.get(`${P}/campaigns/:id`, wrap((c) => eng.getCampaign({ id: c.req.param("id"), status: c.req.query("status") })));
  app.delete(`${P}/campaigns/:id`, wrap((c) => eng.deleteCampaign({ id: c.req.param("id") })));
  app.post(`${P}/campaigns/:id/start`, wrap((c) => eng.startCampaign({ id: c.req.param("id") })));
  app.post(`${P}/campaigns/:id/pause`, wrap((c) => eng.pause({ id: c.req.param("id") })));
  app.post(`${P}/campaigns/:id/cancel`, wrap((c) => eng.cancel({ id: c.req.param("id") })));
  app.post(`${P}/test`, wrap((_, b) => eng.sendTest(b)));
  app.get(`${P}/suppressions`, wrap(() => eng.suppressions()));
  app.post(`${P}/suppressions`, wrap((_, b) => eng.addSuppression(b)));
  app.delete(`${P}/suppressions/:email`, wrap((c) => eng.removeSuppression({ email: decodeURIComponent(c.req.param("email")) })));
  if (d.authDb && process.env.EMAIL_WORKER !== "off") setInterval(() => { eng.tick().catch((e) => console.error("email worker", e instanceof Error ? e.message : e)); }, 60_000).unref?.();
  return eng;
}
