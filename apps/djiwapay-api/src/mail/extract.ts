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

/** dd/mm/yyyy hh:mm, dd Mon yyyy hh:mm, yyyy-mm-dd hh:mm — printed in WIB unless a zone is given. */
export function parseWhen(text: string): number | null {
  const wib = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo, d, h - 7, mi);
  let m = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return wib(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  m = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:[ ,T]+(?:pukul\s*)?(\d{1,2})[:.](\d{2}))?/);
  if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); if (Number(m[2]) >= 1 && Number(m[2]) <= 12) return wib(y, Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0)); }
  m = text.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})(?:[ ,]+(?:pukul\s*)?(\d{1,2})[:.](\d{2}))?/);
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
const AMOUNT_LABEL = /(?:nominal|jumlah|total(?: pembayaran| transaksi| bayar)?|sebesar|senilai|amount|nilai transaksi|harga)\s*[:\-]?\s*(?:rp|idr)\.?\s*([\d.,]+)/i;
const AMOUNT_ANY = /(?:rp|idr)\.?\s*([\d][\d.,]*)/gi;
const FEE_NEAR = /(biaya admin|admin fee|biaya layanan|saldo|sisa|limit|bunga|pajak)/i;

function pickAmount(text: string): number {
  const labeled = text.match(AMOUNT_LABEL);
  if (labeled) { const n = parseRupiah(labeled[1]); if (n > 0) return n; }
  for (const m of text.matchAll(AMOUNT_ANY)) {
    const around = text.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
    if (FEE_NEAR.test(around)) continue;
    const n = parseRupiah(m[1]);
    if (n > 0) return n;
  }
  return 0;
}

function pickMerchant(text: string, subject: string): string {
  const pats = [
    /(?:pembayaran|pembelian|transaksi|belanja|payment|purchase)\s+(?:di|ke|kepada|at|to)\s+([A-Za-z0-9][A-Za-z0-9 &'.\-/]{1,38}?)(?=\s+(?:sebesar|senilai|dengan|pada|tanggal|berhasil|rp|idr|\d{1,2}[/.-]\d)|[,.\n]|$)/i,
    /(?:merchant|toko|penerima|nama penerima|kepada|beneficiary|tujuan)\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9 &'.\-/]{1,38})/i,
    /(?:transfer|kiriman)\s+(?:dari|from)\s+([A-Za-z][A-Za-z '.\-]{1,38}?)(?=\s+(?:sebesar|senilai|rp|idr)|[,.\n]|$)/i,
    /(?:top[- ]?up|isi saldo)\s+(?:ke|to)?\s*([A-Za-z0-9][A-Za-z0-9 ]{1,20})/i,
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
  const confidence = Math.max(0, Math.min(1, (amount ? 0.4 : 0) + (direction !== "unknown" ? 0.25 : 0) + (merchant ? 0.15 : 0) + (at !== null ? 0.1 : 0) + (acct ? 0.05 : 0) + (ref ? 0.05 : 0)));
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
