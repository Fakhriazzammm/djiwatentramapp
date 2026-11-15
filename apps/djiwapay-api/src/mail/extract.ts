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
  if (/\b(waspada|hati-hati|modus|penipuan|scam|tips|edukasi)\b/i.test(subject)) return true;
  // "biaya tidak aktif sebesar Rp10.000 akan didebet setiap bulan": a future charge is not a payment.
  return /\bakan\s+(?:didebet|dipotong|ditagih|dikenakan)\b/i.test(flat(text));
}

/** Does this mail read like a payment notification at all? Used before queueing something unreadable. */
export const looksLikePayment = (subject: string, text: string) => TXN_EVIDENCE.test(`${subject}\n${flat(text)}`);

/** A periodic report (merchant settlement, monthly statement, transaction history) is not one transaction, even when it carries a total. */
export const isReportMail = (subject: string) => /\b(laporan|statement|rekap\w*|ringkasan|mutasi|riwayat|settlement)\b/i.test(subject);

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
export function parseWhen(text: string): number | null {
  const wib = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo, d, h - 7, mi);
  // Anchored so "2026-10-21" can never be read as the 26-10-21 inside it (which became 2021-10-26).
  let m = text.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{2}):(\d{2}))?(?!\d)/);
  if (m) return wib(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  m = text.match(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)(?:[ ,T]+(?:pukul\s*)?(\d{1,2})[:.](\d{2}))?/);
  if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); if (Number(m[2]) >= 1 && Number(m[2]) <= 12) return wib(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0)); }
  m = text.match(/(?<!\d)(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})(?:[ ,]+(?:pukul\s*)?(\d{1,2})[:.](\d{2}))?/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return wib(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0));
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
};

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

function pickMerchant(text: string, subject: string): string {
  // A name ends where the next field starts: a keyword, a date, a comma or a line break.
  const stop = String.raw`(?=\.?\s+(?:sebesar|senilai|jumlah|nominal|total|dengan|pada|tanggal|berhasil|rp|idr|saldo|no\.?\s|ref|\d{1,2}[/.-]\d)|[,;\n]|$)`;
  const name = String.raw`([A-Za-z0-9][A-Za-z0-9 &'.\-/]{1,38}?)`;
  const pats = [
    new RegExp(String.raw`(?:pembayaran|pembelian|transaksi|belanja|payment|purchase)\s+(?:di|ke|kepada|at|to)\s+` + name + stop, "i"),
    new RegExp(String.raw`(?:merchant|toko|penerima|nama penerima|kepada|beneficiary|tujuan|pengirim)\s*[:\-]\s*` + name + stop, "i"),
    new RegExp(String.raw`(?:transfer|kiriman)\s+(?:dari|from)\s+` + name + stop, "i"),
    new RegExp(String.raw`(?:top[- ]?up|isi saldo)\s+(?:ke|to)?\s*([A-Za-z0-9][A-Za-z0-9 ]{1,20}?)` + stop, "i"),
  ];
  for (const p of pats) { const m = text.match(p) ?? subject.match(p); if (m) return m[1].trim().replace(/\s+/g, " ").slice(0, 40); }
  return "";
}

export function extractPayment(subject: string, bodyText: string): Extracted {
  const text = bodyText.replace(/\r/g, "").replace(/[ \t]+/g, " ").slice(0, 20_000);
  const whole = `${subject}\n${text}`;
  const amount = pickAmount(whole);
  const outHits = (whole.match(OUT_RE) ?? []).length, inHits = (whole.match(IN_RE) ?? []).length;
  const direction: Extracted["direction"] = outHits === inHits ? "unknown" : outHits > inHits ? "out" : "in";
  const acct = whole.match(/(?:rek(?:ening)?|no\.? ?rek|kartu|card|a\/c|akun|account)[^\d\n]{0,14}(?:[x*•·]+[\s-]*)*(\d{4})\b/i) ?? whole.match(/(?:[x*•]{3,}[\s-]*)(\d{4})\b/i);
  const ref = whole.match(/(?:no\.? ?(?:ref(?:erensi)?|transaksi)|ref(?:erence)? ?(?:no|id|number)?|trx ?id|id transaksi|kode transaksi|order id)\b\s*[:#]?\s*(?=[A-Z0-9-]*\d)([A-Z0-9][A-Z0-9-]{4,29})\b/i);
  const at = parseWhen(whole);
  const merchant = pickMerchant(text, subject);
  const missing: string[] = [];
  if (!amount) missing.push("amount");
  if (direction === "unknown") missing.push("direction");
  if (!merchant) missing.push("merchant");
  if (at === null) missing.push("at");
  const confidence = Math.max(0, Math.min(1, (amount ? 0.4 : 0) + (direction !== "unknown" ? 0.25 : 0) + (merchant ? 0.15 : 0) + (at !== null ? 0.1 : 0) + (acct ? 0.05 : 0) + (ref ? 0.05 : 0) + (TXN_EVIDENCE.test(whole) ? 0 : -0.3)));
  return { amount, direction, merchant, accountHint: acct?.[1] ?? "", ref: ref?.[1] ?? "", at, confidence, missing };
}

/** Deterministic read is trusted only when amount and direction are both clear. */
export const isConfident = (x: Extracted) => x.amount > 0 && x.direction !== "unknown" && x.confidence >= 0.65;

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
