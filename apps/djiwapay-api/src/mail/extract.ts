import { paymentDetails, type PaymentDetails } from "./details.js";
/** Reads payment notifications. Pure (no network, no DB) so every rule is unit-tested.
 *  Deterministic rules run first; the LLM in llm.ts is only a fallback, and anything unsure goes to the review queue. */

export type Issuer = { id: string; name: string; kind: "bank" | "ewallet" | "service"; domains: string[] };

// Allowlist of sender domains. A mail is only read when its From domain (or a parent) is listed here.
export const ISSUERS: Issuer[] = [
  { id: "bca", name: "BCA", kind: "bank", domains: ["bca.co.id", "klikbca.com", "bcadigital.co.id"] },
  { id: "blu", name: "blu", kind: "bank", domains: ["blubybcadigital.id", "blu.co.id"] },
  { id: "mandiri", name: "Mandiri", kind: "bank", domains: ["bankmandiri.co.id", "livin.id"] },
  { id: "bri", name: "BRI", kind: "bank", domains: ["bri.co.id", "bri.id"] },
  { id: "bni", name: "BNI", kind: "bank", domains: ["bni.co.id", "bni.id"] },
  { id: "cimb", name: "CIMB Niaga", kind: "bank", domains: ["cimbniaga.co.id", "cimb.id"] },
  { id: "jago", name: "Jago", kind: "bank", domains: ["jago.com", "bankjago.com"] },
  { id: "jenius", name: "Jenius", kind: "bank", domains: ["jenius.com", "btpn.com"] },
  { id: "seabank", name: "SeaBank", kind: "bank", domains: ["seabank.co.id"] },
  { id: "gopay", name: "GoPay", kind: "ewallet", domains: ["gopay.co.id", "gojek.com", "go-jek.com"] },
  { id: "ovo", name: "OVO", kind: "ewallet", domains: ["ovo.id"] },
  { id: "dana", name: "DANA", kind: "ewallet", domains: ["dana.id"] },
  { id: "shopeepay", name: "ShopeePay", kind: "ewallet", domains: ["shopee.co.id", "shopeepay.co.id", "shopee.com"] },
  { id: "linkaja", name: "LinkAja", kind: "ewallet", domains: ["linkaja.id"] },
  { id: "grab", name: "Grab", kind: "service", domains: ["grab.com"] },
  { id: "tokopedia", name: "Tokopedia", kind: "service", domains: ["tokopedia.com"] },
  { id: "pln", name: "PLN", kind: "service", domains: ["pln.co.id"] },
  { id: "telkom", name: "Telkom / IndiHome", kind: "service", domains: ["telkom.co.id", "indihome.co.id", "telkomsel.com"] },
  { id: "bpjs", name: "BPJS", kind: "service", domains: ["bpjs-kesehatan.go.id", "bpjsketenagakerjaan.go.id"] },
];

export const domainOf = (address: string) => (address.split("@").pop() || "").trim().toLowerCase().replace(/[>\s]+$/g, "");

export function issuerFor(domain: string): Issuer | null {
  const d = domain.toLowerCase();
  return ISSUERS.find((i) => i.domains.some((x) => d === x || d.endsWith("." + x))) ?? null;
}

/** Gmail's own mail that carries the forwarding confirmation code. Not a payment. */
export function forwardingCode(from: string, subject: string, text: string): string | null {
  if (!/(^|\.)google\.com$/.test(domainOf(from))) return null;
  if (!/forwarding|penerusan/i.test(subject + " " + text.slice(0, 400))) return null;
  const m = text.match(/(?:code|kode)[^\d]{0,40}(\d{6,9})/i) ?? text.match(/\b(\d{9})\b/);
  return m ? m[1] : null;
}

/** One-time codes, PINs and password resets must never be read or kept. */
export function isSecretMail(subject: string, text: string): boolean {
  const head = `${subject}\n${text.slice(0, 600)}`;
  if (/\b(otp|one[- ]?time|kode (verifikasi|rahasia|otp|keamanan)|verification code|reset (kata sandi|password)|lupa (pin|password)|ubah (pin|password)|jangan (berikan|bagikan))\b/i.test(head)) return true;
  return /\b(pin|password|kata sandi)\b.{0,30}\b(baru|anda|kamu|reset)\b/i.test(head);
}

/** Wording that only a payment notification has; a campaign promises rupiah without ever moving any. */
const TXN_EVIDENCE = /(berhasil|telah (?:dibayar|diterima|ditransfer|diproses)|transaksi (?:berhasil|kamu|anda|dengan|nomor|no)|pembayaran (?:berhasil|kepada|anda|sebesar)|transfer (?:berhasil|ke|sebesar|masuk)|top ?up berhasil|dana (?:masuk|keluar)|penarikan|nominal|no\.? ?ref|nomor referensi|struk|bukti transaksi)/i;
const PROMO_WORD = /\b(promo\w*|promosi|diskon\w*|cashback|voucher|kupon|penawaran|spesial|flash ?sale|gratis|undian|hadiah|buruan|hemat\w*|jangan lewatkan|klik (?:di sini|link|tombol)|syarat (?:dan|&) ketentuan|berhenti berlangganan|unsubscribe|poin\w*|serunya|nikmat\w*|survei|survey|responden|kuesioner)/gi;

/** An email campaign, not a payment: "Spesial 11.11: Hemat s.d. Rp3,5 Juta!" is worth nothing in a ledger. */
export function isPromo(subject: string, text: string): boolean {
  const whole = `${subject}\n${flat(text)}`;
  const hits = (whole.match(PROMO_WORD) ?? []).length;
  if (!hits) return false;
  // A receipt may mention cashback or poin and still be a receipt; a campaign is mostly this vocabulary.
  if (TXN_EVIDENCE.test(whole) && hits < 3) return false;
  return hits >= 2 || /\b(promo\w*|penawaran|diskon\w*|flash ?sale|hemat\w*|spesial)\b/i.test(subject);
}

/** Announces money but moves none: a scam warning, a fee schedule, a product launch. */
export function isNoticeMail(subject: string, text: string): boolean {
  // Announcements of a product or a limit change ("[PENTING] Limit Baru Kartu Jago!") read as money too.
  if (/\b(waspada|hati-hati|modus|penipuan|scam|tips|edukasi|limit baru|kenaikan limit|kebijakan baru|fitur baru)\b/i.test(subject)) return true;
  // "biaya tidak aktif sebesar Rp10.000 akan didebet setiap bulan": a future charge is not a payment.
  return /\bakan\s+(?:didebet|dipotong|ditagih|dikenakan)\b/i.test(flat(text));
}

/** Does this mail read like a payment notification at all? Used before queueing something unreadable. */
export const looksLikePayment = (subject: string, text: string) => TXN_EVIDENCE.test(`${subject}\n${flat(text)}`);

/** A periodic report (merchant settlement, monthly statement, transaction history) is not one transaction, even when it carries a total. */
export const isReportMail = (subject: string) => /\b(laporan|statement|rekap\w*|ringkasan|mutasi|riwayat|settlement)\b/i.test(subject);

/* ---------------- bill reminders ---------------- */

export type BillInfo = { amount: number; due: string | null; name: string };
const pad2 = (n: number) => String(n).padStart(2, "0");
/** "20-NOV-26", "20 November 2026", "20/11/2026", "2026-11-20", or only "tgl 20" (the next such day). Returns YYYY-MM-DD (WIB calendar day). */
export function parseDueDate(raw: string, now: Date): string | null {
  const t = raw.trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  const ok = (y: number, mo: number, d: number) => (mo >= 0 && mo < 12 && d >= 1 && d <= 31 ? `${y}-${pad2(mo + 1)}-${pad2(d)}` : null);
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  if (m) return ok(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = t.match(/(\d{1,2})[\s\-\/.]([A-Za-z]{3,9})[\s\-\/.,]*(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return ok(year(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  m = t.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) return ok(year(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = t.match(/(?:tgl\.?|tanggal)?\s*(\d{1,2})\b/i);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
    const w = new Date(now.getTime() + 7 * 3600_000), d = Number(m[1]);
    let y = w.getUTCFullYear(), mo = w.getUTCMonth();
    if (d < w.getUTCDate()) { mo += 1; if (mo > 11) { mo = 0; y += 1; } }
    return ok(y, mo, d);
  }
  return null;
}

/** A bill reminder ("tagihan IndiHome bulan ini Rp340215, jatuh tempo tgl 20-NOV-26"): what is owed, to whom, and by when. Null when there is no amount. */
export function extractBill(subject: string, text: string, issuerName: string, now: Date): BillInfo | null {
  const whole = `${subject}\n${flat(text)}`;
  const amount = extractPayment(subject, text).amount;
  if (!(amount > 0)) return null;
  const dueAt = whole.match(/(?:jatuh tempo|due date|paling lambat|bayar sebelum|batas (?:waktu )?pembayaran)[^0-9A-Za-z]{0,14}(\d{4}-\d{2}-\d{2}|(?:tgl\.?|tanggal)?\s*\d{1,2}(?:[\s\-\/.][A-Za-z0-9]{2,9}(?:[\s\-\/.,]+\d{2,4})?)?)/i);
  const due = dueAt ? parseDueDate(dueAt[1], now) : null;
  const named = whole.match(/tagihan\s+([A-Za-z][A-Za-z0-9&.' -]{1,28}?)\s+(?:bulan|periode|anda|kamu|sebesar|senilai|rp|untuk|sudah|telah|jatuh|sebelum)/i);
  const generic = /^(?:ini|anda|kamu|listrik|air|internet|kartu|baru|tertunggak)$/i;
  const name = named && !generic.test(named[1].trim()) ? named[1].trim() : issuerName;
  return { amount, due, name: name.slice(0, 80) };
}

/** "Transfer Tidak Berhasil", "Top-up gagal": the money never left, so there is nothing to record. */
export const isFailedMail = (subject: string) => /\b(tidak berhasil|gagal|dibatalkan|cancelled|canceled|ditolak|unsuccessful|failed)\b/i.test(subject);

/** Collapses the padded table markup of e-bill mail; without it the useful lines sit past any slice. */
const flat = (text: string) => text.replace(/[ \t]+/g, " ").replace(/\n{1,}/g, " ").slice(0, 6000);

/** Wording that proves a payment really happened; a reminder asks for one instead. */
const PAID_EVIDENCE = /(?:pembayaran|transaksi|transfer|top[-\s]?up)[^.]{0,120}(?:berhasil|sukses|telah diterima)|(?:telah|sudah)\s+(?:berhasil\s+)?(?:dibayar|diterima)/i;

/** "Tagihan IndiHome bulan ini Rp340.215, jatuh tempo 20 Nov, bayar di sini": a bill, not a movement of money. */
export function isBillReminder(subject: string, text: string): boolean {
  const whole = `${subject}\n${flat(text)}`;
  if (PAID_EVIDENCE.test(whole)) return false;
  const bill = /\b(tagihan|billing|e-?bill|jumlah tagihan|total tagihan|jatuh tempo|due date)\b/i.test(whole);
  const ask = /\b(bayar sekarang|bayar sebelum|lakukan pembayaran|belum (?:kamu )?bayar|bayar dengan klik|jatuh tempo)\b/i.test(whole);
  return bill && ask;
}

const MONTHS: Record<string, number> = { jan: 0, januari: 0, feb: 1, februari: 1, mar: 2, maret: 2, apr: 3, april: 3, mei: 4, may: 4, jun: 5, juni: 5, jul: 6, juli: 6, agu: 7, agt: 7, agustus: 7, aug: 7, sep: 8, sept: 8, september: 8, okt: 9, oktober: 9, oct: 9, nov: 10, november: 10, des: 11, desember: 11, dec: 11 };

/** "Rp 1.250.000", "IDR 1,250,000.50", "Rp125.000,00" → number. */
export function parseRupiah(raw: string): number {
  const s = raw.replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
  if (!s) return 0;
  const seps = s.match(/[.,]/g) ?? [];
  if (!seps.length) return Number(s) || 0;
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  const after = s.length - last - 1;
  const sameKind = new Set(seps).size === 1;
  // A lone separator type repeated ("1.250.000") is thousands. A single one is thousands only when exactly 3 digits follow.
  const decimal = sameKind ? seps.length === 1 && after !== 3 && after <= 2 : after <= 2;
  const n = decimal ? Number(s.slice(0, last).replace(/[.,]/g, "") + "." + s.slice(last + 1)) : Number(s.replace(/[.,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** dd/mm/yyyy hh:mm, dd Mon yyyy hh:mm, yyyy-mm-dd [hh:mm] — printed in WIB unless a zone is given. */
/** Mandiri prints "Tanggal 17 Nov 2026 | Jam 20:31:01 WIB": the time sits behind its own label, not next to the date. */
const labelTime = (text: string): [number, number] => { const k = text.match(/(?:jam|pukul|waktu|time)\s*:?\s*(\d{1,2})[:.](\d{2})/i); return k ? [Number(k[1]), Number(k[2])] : [0, 0]; };
export function parseWhen(text: string): number | null {
  const wib = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo, d, h - 7, mi);
  // Anchored so "2026-10-21" can never be read as the 26-10-21 inside it (which became 2021-10-26).
  let m = text.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{2}):(\d{2}))?(?!\d)/);
  if (m) { const [h, mi] = m[4] === undefined ? labelTime(text) : [Number(m[4]), Number(m[5])]; return wib(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi); }
  m = text.match(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)(?:[ ,T]+(?:pukul\s*)?(\d{1,2})[:.](\d{2}))?/);
  if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); if (Number(m[2]) >= 1 && Number(m[2]) <= 12) { const [h, mi] = m[4] === undefined ? labelTime(text) : [Number(m[4]), Number(m[5])]; return wib(y, Number(m[2]) - 1, Number(m[1]), h, mi); } }
  m = text.match(/(?<!\d)(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})(?:[ ,]+(?:pukul\s*)?(\d{1,2})[:.](\d{2}))?/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) { const [h, mi] = m[4] === undefined ? labelTime(text) : [Number(m[4]), Number(m[5])]; return wib(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), h, mi); }
  return null;
}

export type Extracted = {
  amount: number;
  direction: "out" | "in" | "unknown";
  merchant: string;
  accountHint: string;       // last 4 digits, or ""
  ref: string;
  at: number | null;         // epoch ms
  confidence: number;
  missing: string[];
  details?: PaymentDetails;
  /** A top-up moves money between the person's own accounts: it is not income or spending. */
  transfer?: TopUp;
};
export type TopUp = { provider: string; side: "from-bank" | "to-wallet"; nominal: number; fee: number };
const WALLETS: [RegExp, string][] = [[/gopay|go-pay/i, "GoPay"], [/shopee\s?pay/i, "ShopeePay"], [/\bovo\b/i, "OVO"], [/\bdana\b/i, "DANA"], [/link\s?aja/i, "LinkAja"], [/isaku|sakuku/i, "iSaku"]];
/** "Top-up Berhasil" from a bank (money left an account for a wallet) or from the wallet itself (money arrived). */
export function topUpOf(subject: string, text: string, x: { direction: Extracted["direction"]; amount: number; details?: PaymentDetails }, fromSource: boolean): TopUp | undefined {
  const whole = `${subject}\n${text}`;
  if (!/top[\s-]?up/i.test(whole) || !/top[\s-]?up\s*(berhasil|sukses)|nominal top[\s-]?up|top[\s-]?up\s+\w+\s+sebesar|top[\s-]?up .{0,30}berhasil/i.test(whole)) return undefined;
  const near = whole.match(/(?:penyedia jasa|top[\s-]?up(?: ke)?|tujuan)\s*[:\-]?\s*([^\n]{0,40})/i)?.[1] ?? "";
  const provider = WALLETS.find(([re]) => re.test(near) || re.test(x.details?.description ?? ""))?.[1] ?? WALLETS.find(([re]) => re.test(whole))?.[1] ?? "Dompet digital";
  const item = x.details?.items?.[0]?.amount ?? 0, charged = (x.details?.charges ?? []).filter((c) => !c.included).reduce((n, c) => n + c.amount, 0);
  const nominal = item > 0 && item <= x.amount ? item : charged > 0 && x.amount > charged ? x.amount - charged : 0;
  const side: TopUp["side"] = fromSource || x.direction === "out" ? "from-bank" : "to-wallet";
  return { provider, side, nominal, fee: nominal > 0 ? x.amount - nominal : 0 };
}

const OUT_RE = /(pembayaran|pembelian|bayar(?:an)?|membayar|dibayar|transfer (?:ke|keluar|berhasil ke)|dikirim|pengiriman dana|penarikan|tarik tunai|debit|belanja|top[- ]?up ke|payment|purchase|paid|withdraw)/gi;
const IN_RE = /(diterima|dana masuk|uang masuk|menerima|kredit|pemasukan|received|refund|pengembalian dana|cashback|gaji|top[- ]?up berhasil|saldo (?:bertambah|masuk)|transfer masuk)/gi;
const AMOUNT_LABEL = /(?:nominal|jumlah|total|sebesar|senilai|amount|nilai transaksi|harga)(?:\s+(?:pembayaran|transaksi|bayar|top[-\s]?up|transfer|tagihan))?\s*[:\-]?\s*(?:rp|idr)\.?\s*([\d.,]+)/gi;
const AMOUNT_ANY = /(?:rp|idr)\.?\s*([\d][\d.,]*)/gi;
const FEE_NEAR = /(biaya admin|admin fee|biaya layanan|saldo|sisa|limit|bunga|pajak)/i;
/** "s.d. Rp 3,5 Juta", "hingga Rp 500.000", "maks 10rb": a ceiling or an estimate, never what was paid. */
const ESTIMATE_NEAR = /(s\.?\s?d\.?|sampai|hingga|maks(?:imal|\.)?|mulai dari|dari|s\/d|up to)\s*$/i;
const MIN_AMOUNT = 100, MAX_AMOUNT = 1e12;   // "Rp 4" out of a promo is not a payment; neither is a typo'd 10^12

/** Rupiah with the shorthand people actually print: "3,5 Juta" is 3.500.000, "25rb" is 25.000. */
function valueAt(text: string, at: number, digits: string): number {
  const unit = text.slice(at + digits.length, at + digits.length + 10).match(/^\s*(juta|jt|ribu|rb|k)\b/i)?.[1]?.toLowerCase();
  const n = parseRupiah(digits) * (unit ? (/^j/.test(unit) ? 1e6 : 1e3) : 1);
  return Math.round(n);
}

function pickAmount(text: string): number {
  const labeled = [...text.matchAll(AMOUNT_LABEL)];
  // "Nominal Top-up Rp 2.000.000 ... Total Transaksi Rp 2.001.200": the nominal is the money, the total also carries the fee.
  const best = labeled.find((m) => /^nominal/i.test(m[0])) ?? labeled[0];
  if (best) { const n = valueAt(text, (best.index ?? 0) + best[0].lastIndexOf(best[1]), best[1]); if (n >= MIN_AMOUNT) return n; }
  for (const m of text.matchAll(AMOUNT_ANY)) {
    const i = m.index ?? 0;
    const before = text.slice(Math.max(0, i - 24), i);
    if (FEE_NEAR.test(before) || ESTIMATE_NEAR.test(before)) continue;
    const n = valueAt(text, i + m[0].lastIndexOf(m[1]), m[1]);
    if (n >= MIN_AMOUNT && n <= MAX_AMOUNT) return n;
  }
  return 0;
}

/** "Total Transaksi Rp 42.200": what the bank actually debited, admin fee included. */
function pickTotal(text: string): number {
  const m = text.match(/(?:total(?: transaksi| pembayaran| bayar)?|jumlah (?:transaksi|transfer|pembayaran))\s*[:\-]?\s*(?:rp|idr)\.?\s*([\d.,]+)/i);
  return m ? valueAt(text, (m.index ?? 0) + m[0].lastIndexOf(m[1]), m[1]) : 0;
}

function pickMerchant(body: string, subject: string): string {
  // E-bill mail is padded with newlines and blank lines: read it flat so a name and its field stay together.
  const text = flat(body);
  // A name ends where the next field starts: a keyword, a date, a comma or a line break.
  const stop = String.raw`(?=\.?\s+(?:sebesar|senilai|jumlah|nominal|total|dengan|pada|tanggal|berhasil|rp|idr|saldo|no\.?\s|ref|bank|rekening|\d{1,2}[/.-]\d)|[,;*\n]|\s-\s|\d{3,}|$)`;
  const name = String.raw`([A-Za-z0-9][A-Za-z0-9 &'.\-/]{1,38}?)`;
  const pats = [
    new RegExp(String.raw`(?:penyedia jasa|merchant|toko|penerima|nama penerima|beneficiary|tujuan|pengirim)\b\s*[:\-]?\s*` + name + stop, "i"),
    new RegExp(String.raw`(?:pembayaran|pembelian|transaksi|belanja|payment|purchase)\s+(?:di|ke|kepada|at|to)\s+` + name + stop, "i"),
    new RegExp(String.raw`(?:transfer|kiriman)\s+(?:dari|from)\s+` + name + stop, "i"),
    new RegExp(String.raw`(?:top[- ]?up|isi saldo)\s+(?:ke|to)?\s*([A-Za-z0-9][A-Za-z0-9 ]{1,20}?)` + stop, "i"),
  ];
  for (const p of pats) { const m = text.match(p) ?? subject.match(p); if (m) return m[1].trim().replace(/\s+/g, " ").slice(0, 40); }
  return "";
}

export function extractPayment(subject: string, bodyText: string): Extracted {
  const text = bodyText.replace(/\r/g, "").replace(/[ \t]+/g, " ").slice(0, 20_000);
  const whole = `${subject}\n${text}`;
  const nominal = pickAmount(whole);
  const outHits = (whole.match(OUT_RE) ?? []).length, inHits = (whole.match(IN_RE) ?? []).length;
  let direction: Extracted["direction"] = outHits === inHits ? "unknown" : outHits > inHits ? "out" : "in";
  // "Rekening Sumber ... ****4399" is the user's own account: the money left it. Livin prints this on a
  // top-up to GoPay and on an outgoing transfer, both of which read as "Top-up Berhasil" otherwise.
  const srcAcct = whole.match(/(?:rekening sumber|sumber dana|akun sumber|dari rekening|dari kartu)[^\d]{0,40}(?:[x*•·]+[\s-]*)*(\d{4})\b/i);
  if (srcAcct) direction = "out";
  // On the bank's own account the debit is the total, so the balance still matches the statement.
  const amount = srcAcct ? pickTotal(whole) || nominal : nominal;
  const acct = srcAcct ?? whole.match(/(?:rek(?:ening)?|no\.? ?rek|kartu|card|a\/c|akun|account)[^\d\n]{0,14}(?:[x*•·]+[\s-]*)*(\d{4})\b/i) ?? whole.match(/(?:[x*•]{3,}[\s-]*)(\d{4})\b/i);
  const ref = whole.match(/(?:no\.? ?(?:ref(?:erensi)?|transaksi)|ref(?:erence)? ?(?:no|id|number)?|trx ?id|id transaksi|kode transaksi|order id)\b\s*[:#]?\s*(?=[A-Z0-9-]*\d)([A-Z0-9][A-Z0-9-]{4,29})\b/i);
  const at = parseWhen(whole);
  const details = paymentDetails(text);
  const picked = pickMerchant(text, "");
  const merchant = picked && picked.length > 1 && !/aplikasi|livin.*mandiri|^(pan|qris|ref|id|nmid)\b/i.test(picked) ? picked : details.description;
  const missing: string[] = [];
  if (!amount) missing.push("amount");
  if (direction === "unknown") missing.push("direction");
  if (!merchant) missing.push("merchant");
  if (at === null) missing.push("at");
  const confidence = Math.max(0, Math.min(1, (amount ? 0.4 : 0) + (direction !== "unknown" ? 0.25 : 0) + (merchant ? 0.15 : 0) + (at !== null ? 0.1 : 0) + (acct ? 0.05 : 0) + (ref ? 0.05 : 0) + (TXN_EVIDENCE.test(whole) ? 0 : -0.3)));
  const transfer = topUpOf(subject, text, { direction, amount, details }, Boolean(srcAcct));
  return { amount, direction, merchant, accountHint: acct?.[1] ?? "", ref: ref?.[1] ?? "", at, confidence, missing, details, ...(transfer ? { transfer } : {}) };
}

/** Deterministic read is trusted only when amount and direction are both clear. */
export const isConfident = (x: Extracted) => x.amount > 0 && x.direction !== "unknown" && x.confidence >= 0.65;

/** Bumped whenever the read changes meaning, so an old staged row can be told apart from a new one. */
export const RULES_VERSION = 5;

/** A payment mail is about a day or two, never years away: "26-10-21" once put 2026 mail in 2021. */
const MAX_DRIFT_MS = 45 * 86400_000;

/** Every rupiah the mail prints, with "rb"/"juta" read the way a person reads them. */
function printedAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?:rp|idr)\.?\s*([\d][\d.,]*)\s*(juta|jt|ribu|rb|k)?/gi)) {
    const n = parseRupiah(m[1]);
    if (!n) continue;
    const unit = (m[2] ?? "").toLowerCase();
    out.push(Math.round(n * (/^j/.test(unit) ? 1e6 : /^(rb|ribu|k)$/.test(unit) ? 1e3 : 1)));
  }
  return out;
}

/** Where the read disagrees with the mail itself, whatever shape the mail has. Knowing the shapes that
 *  fooled us only fixes those; this catches the next unknown one before it can be recorded. */
export function implausible(text: string, x: { amount: number; at: number | null }, mailDate?: number | null): string[] {
  const problems: string[] = [];
  // The money must be a number the mail actually prints (a rounded fee may differ by a rupiah).
  if (x.amount > 0 && !printedAmounts(text).some((p) => Math.abs(p - x.amount) <= 1)) problems.push("amount-not-printed");
  // A transaction mail describes today. A date years off means the date was misread, not that mail was late.
  if (x.at && mailDate && Math.abs(x.at - mailDate) > MAX_DRIFT_MS) problems.push("date-drift");
  return problems;
}

// Merchant/keyword → category. Falls back to "lainnya"; learned rules (finance.merchant_rules) win over this.
const CATEGORY_HINTS: [string, string[]][] = [
  ["makan", ["kopi", "coffee", "resto", "restaurant", "cafe", "warung", "bakso", "mie", "ayam", "nasi", "grabfood", "gofood", "shopeefood", "kfc", "mcd", "starbucks", "pizza", "burger", "bakery", "roti"]],
  ["transport", ["gojek", "grab", "gocar", "goride", "grabcar", "bluebird", "kai", "kereta", "tol", "parkir", "pertamina", "shell", "bbm", "spbu", "transjakarta", "mrt", "lrt", "commuter"]],
  ["belanja", ["tokopedia", "shopee", "lazada", "bukalapak", "indomaret", "alfamart", "supermarket", "mart", "toko", "blibli", "zalora", "ikea"]],
  ["tagihan", ["pln", "listrik", "token", "pdam", "indihome", "telkom", "internet", "pulsa", "paket data", "bpjs", "asuransi", "cicilan", "kartu kredit"]],
  ["hiburan", ["netflix", "spotify", "youtube", "disney", "steam", "game", "bioskop", "cgv", "xxi", "tiket konser"]],
  ["kesehatan", ["apotek", "klinik", "rumah sakit", "dokter", "halodoc", "kimia farma", "guardian"]],
  ["pendidikan", ["kursus", "sekolah", "kampus", "udemy", "coursera", "spp", "buku"]],
  ["rumah", ["sewa", "kontrakan", "kos", "furniture", "bangunan"]],
];
export function guessCategory(merchant: string, subject: string, direction: "out" | "in" | "unknown"): string {
  if (direction === "in") return /gaji|salary|payroll/i.test(subject + merchant) ? "gaji" : "bonus";
  const hay = `${merchant} ${subject}`.toLowerCase();
  for (const [id, words] of CATEGORY_HINTS) if (words.some((w) => hay.includes(w))) return id;
  return "lainnya";
}

/** What two spellings of the same shop share: machine suffixes ("· PAN 9360…") and long numbers are dropped. Used to group the review queue and to learn categories. */
export const groupKey = (name: string) => name.toLowerCase().replace(/\s*[·|]\s*(pan|nmid|mid|tid|ref|no)\b.*$/, "").replace(/\b\d{6,}\b/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
export const merchantKey = (merchant: string) => merchant.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);

/** Masks long digit runs (card/account numbers) before anything is sent to a model. */
export function redact(text: string): string {
  return text.replace(/\b(\d{4})[\d\s-]{6,}(\d{4})\b/g, "••••$2").replace(/\b\d{9,}\b/g, (d) => "•".repeat(d.length - 4) + d.slice(-4));
}

/** For text a person will copy out of the app and share so a parser can be fixed: masks numbers, addresses and names. */
export function redactForShare(text: string): string {
  return redact(text)
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "■■■@■■■")
    .replace(/(?:\+62|62|0)8\d{7,11}/g, "08■■■■■■■■")
    .replace(/\b(Yth\.?|Halo|Hai|Kepada|Dear|Bapak\/Ibu|Bapak|Ibu|Sdr\.?)\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3}/g, "$1 ■■■")
    .replace(/\s+/g, " ").trim().slice(0, 900);
}
