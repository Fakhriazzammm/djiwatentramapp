import type { Entry } from "./types";

/**
 * "Ke mana uangmu pergi": the people, shops and services money goes to (and comes from), found in the person's own records.
 * Pure and local: nothing here leaves the phone. A name is cleaned and merged ("Transfer ke RANI A." and "rani a" are one), classified
 * (orang, toko, layanan; the person can correct it) and measured: total, times, average, change against the period before.
 */
export type PayeeKind = "orang" | "toko" | "layanan";
export type PayeeMode = "out" | "in";
export type PayeePeriod = "bulan" | "3" | "6" | "12" | "semua";
export type Meta = { kinds: Record<string, PayeeKind>; labels: Record<string, string> };

const WIB = 7 * 3_600_000, DAY = 86_400_000;
const LEAD = /^(?:transfer|trf|tf|top[- ]?up|isi saldo|pembayaran|bayar|payment|pay|qris|kirim|pembelian|belanja|terima|diterima)\s*(?:ke|to|dari|from|di|at|saldo)?\s*[:\-]?\s*/i;
const SERVICE = /\b(pln|listrik|token|indihome|telkom|telkomsel|xl|indosat|smartfren|tri|pdam|bpjs|asuransi|pulsa|paket data|internet|wifi|netflix|spotify|youtube|google|apple|icloud|flip|gopay|ovo|dana|shopeepay|linkaja|xendit|midtrans|tagihan|cicilan|angsuran|kredivo|akulaku|adira|fif|bfi|prudential|allianz|axa|manulife|aia|bank|biaya|admin|pajak|pbb|samsat|settlement|payout)\b/i;
const SHOP = /\b(toko|warung|kedai|cafe|kafe|kopi|coffee|resto|restoran|bakso|mie|mi ayam|nasi|ayam|bakery|roti|mart|market|store|shop|apotek|klinik|rumah sakit|bengkel|laundry|barber|salon|indomaret|alfamart|tokopedia|shopee|lazada|grab|gojek|tiket|traveloka|kantin|depot|sate|pizza|burger|kfc|mcd|starbucks|rasa|sumber|jaya|abadi|makmur|mandiri|sejahtera|pt|cv|ud|tbk|algo|green)\b/i;
const SHOP_CATS = new Set(["makan", "belanja", "hiburan", "transport", "kesehatan", "pendidikan", "rumah", "perawatan"]);

/** What a person would call it: the lead words ("Transfer ke") and machine numbers go, capitals become a name. */
export function payeeName(note: string): string {
  let s = note.replace(/\s*[·|]\s*(?:pan|nmid|mid|tid|ref|no)\b.*$/i, "").replace(/\b\d{5,}\b/g, " ").replace(/[•*]{2,}\d*/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2 && LEAD.test(s); i++) s = s.replace(LEAD, "").trim();
  if (/^pan\b/i.test(s) || !s) return /^pan\b/i.test(note.trim()) ? "QRIS tanpa nama toko" : "Tanpa nama";
  s = s.replace(/[.,;:]+$/, "");
  return s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase()) : s;
}
export const payeeKeyOf = (note: string) => payeeName(note).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ") || "tanpa nama";

/** A saved bill is the same payee when its name reduces to the same key. */
export const billKey = payeeKeyOf;

const PLACE = /\b(jakarta|bandung|garut|tasikmalaya|bekasi|bogor|depok|tangerang|surabaya|semarang|yogyakarta|jogja|solo|malang|medan|bali|makassar|palembang|cirebon|cimahi|sukabumi|utara|selatan|barat|timur|pusat|cabang|branch|city|kota|kab|kabupaten|plaza|mall|mal|square|tower|livin|qris|idm|alfa|pasar|terminal|stasiun|bandara)\b/i;
const FOOD = /\b(sushi|ramen|kebab|steak|seafood|geprek|boba|teh|jus|juice|donut|cake|warteg|padang|bakmi|siomay|batagor|baso|cilok|sop|soto|gado|rawon|pecel|lele|bebek|burger|pizza|cafe|kafe|resto|restoran|kitchen|dapur|garden|house|corner|bar|grill|bbq|snack|bread|pastry|fried|chicken|noodle)\b/i;
const NOT_PERSON_CATS = new Set(["lainnya", "transfer", ""]);
const looksLikePerson = (name: string) => /^[A-Za-z'.\- ]{3,40}$/.test(name) && name.trim().split(/\s+/).length <= 4 && !SHOP.test(name) && !SERVICE.test(name) && !PLACE.test(name) && !FOOD.test(name);

/** A person, a shop or a service. Signals, strongest first: a known service or shop word, a QRIS/PAN terminal on the mail, the root category of its records (a restaurant category is a shop),
 *  a place or food word in the name, and only then "a name that reads like a person's, on records nobody has sorted". `cats` are root category ids. */
export function classify(name: string, cats: string[] = [], signals: { qris?: boolean } = {}): PayeeKind {
  if (SERVICE.test(name)) return "layanan";
  if (SHOP.test(name) || /\d/.test(name) || signals.qris || PLACE.test(name) || FOOD.test(name)) return "toko";
  const sorted = cats.filter((c) => !NOT_PERSON_CATS.has(c));
  if (sorted.length) {
    const share = (set: (c: string) => boolean) => sorted.filter(set).length / sorted.length;
    if (share((c) => c === "tagihan") > 0.5) return "layanan";
    if (share((c) => SHOP_CATS.has(c)) > 0.5) return "toko";
  }
  return looksLikePerson(name) ? "orang" : "toko";
}

const jakarta = (iso: string) => new Date(new Date(iso).getTime() + WIB);
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

/** The window and the one before it, in epoch ms. "bulan" is the calendar month (Jakarta); the others count whole months back. "semua" has nothing before it. */
export function periodRange(period: PayeePeriod, now = new Date(), cursor?: { y: number; m: number }) {
  const j = new Date(now.getTime() + WIB), y = cursor?.y ?? j.getUTCFullYear(), m = cursor?.m ?? j.getUTCMonth();
  const back = period === "bulan" ? 1 : period === "semua" ? 0 : Number(period);
  const end = Date.UTC(y, m + 1, 1) - WIB, start = period === "semua" ? 0 : Date.UTC(y, m + 1 - back, 1) - WIB;
  const prevStart = period === "semua" ? null : Date.UTC(y, m + 1 - 2 * back, 1) - WIB;
  return { start, end, prevStart, prevEnd: period === "semua" ? null : start };
}

export type PayeeMonth = { key: string; label: string; total: number };
export type Payee = {
  key: string; name: string; kind: PayeeKind; label: string; total: number; count: number; avg: number; prevTotal: number; trend: number | null; share: number;
  firstAt: string; lastAt: string; entries: Entry[]; categoryId: string; months: PayeeMonth[]; typicalDay: number; typicalAmount: number; monthly: boolean;
};
export type Analysis = {
  list: Payee[]; total: number; count: number; avg: number; top: Payee[]; topShare: number;
  insights: { largest: Payee | null; often: Payee | null; rise: Payee | null; fresh: Payee[] };
};

const SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function analyze(entries: Entry[], o: { mode: PayeeMode; start: number; end: number; prevStart: number | null; prevEnd: number | null; meta?: Meta; now?: Date; /** Maps a category id to its top-level parent, so a sub category like "Restoran & warung" counts as food. */ rootOf?: (id: string) => string }): Analysis {
  const meta = o.meta ?? { kinds: {}, labels: {} }, now = o.now ?? new Date();
  const all = entries.filter((e) => e.kind === o.mode && !e.tags.includes("loan-receipt") && (e.note || "").trim().length > 0);
  const groups = new Map<string, Entry[]>();
  for (const e of all) { const k = payeeKeyOf(e.note); groups.set(k, [...(groups.get(k) ?? []), e]); }
  const list: Payee[] = [];
  for (const [key, every] of groups) {
    const inWin = every.filter((e) => { const t = +new Date(e.at); return t >= o.start && t < o.end; });
    if (!inWin.length) continue;
    const prev = o.prevStart !== null && o.prevEnd !== null ? every.filter((e) => { const t = +new Date(e.at); return t >= o.prevStart! && t < o.prevEnd!; }) : [];
    const total = inWin.reduce((s, e) => s + e.amount, 0), prevTotal = prev.reduce((s, e) => s + e.amount, 0);
    const sorted = [...inWin].sort((a, b) => +new Date(b.at) - +new Date(a.at));
    const names = new Map<string, number>(); for (const e of every) { const n = payeeName(e.note); names.set(n, (names.get(n) ?? 0) + 1); }
    const name = [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const cats = new Map<string, number>(); for (const e of every) cats.set(e.categoryId, (cats.get(e.categoryId) ?? 0) + 1);
    const roots = every.map((e) => (o.rootOf ? o.rootOf(e.categoryId) : e.categoryId)), qris = every.some((e) => /\bPAN\b|qris/i.test(e.note));
    const categoryId = [...cats.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const months: PayeeMonth[] = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)), k = monthKey(d); months.push({ key: k, label: SHORT[d.getUTCMonth()], total: every.filter((e) => monthKey(jakarta(e.at)) === k).reduce((s, e) => s + e.amount, 0) }); }
    const recent = every.filter((e) => +now - +new Date(e.at) < 200 * DAY), days = recent.map((e) => jakarta(e.at).getUTCDate());
    const monthsWith = new Set(recent.map((e) => monthKey(jakarta(e.at)))).size, spread = days.length ? Math.max(...days) - Math.min(...days) : 99;
    list.push({
      key, name, kind: meta.kinds[key] ?? classify(name, roots, { qris }), label: meta.labels[key] ?? "", total, count: inWin.length, avg: total / inWin.length, prevTotal,
      trend: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null, share: 0, firstAt: [...every].sort((a, b) => +new Date(a.at) - +new Date(b.at))[0].at, lastAt: sorted[0].at,
      entries: sorted, categoryId, months, typicalDay: Math.round(median(days)) || 1, typicalAmount: Math.round(median(recent.map((e) => e.amount))), monthly: monthsWith >= 3 && spread <= 6,
    });
  }
  list.sort((a, b) => b.total - a.total);
  const total = list.reduce((s, p) => s + p.total, 0), count = list.reduce((s, p) => s + p.count, 0);
  for (const p of list) p.share = total ? (p.total / total) * 100 : 0;
  const top = list.slice(0, 5), topShare = total ? (top.reduce((s, p) => s + p.total, 0) / total) * 100 : 0;
  const rise = list.filter((p) => p.trend !== null && p.trend > 0 && p.prevTotal > 0).sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0))[0] ?? null;
  const fresh = list.filter((p) => { const f = +new Date(p.firstAt); return f >= o.start && +now - f < 30 * DAY; });
  return { list, total, count, avg: count ? total / count : 0, top, topShare, insights: { largest: list[0] ?? null, often: [...list].sort((a, b) => b.count - a.count)[0] ?? null, rise, fresh } };
}

/** A person you sent several transfers to for the first time, lately, adding up to something worth a label. */
export function newBigPayees(entries: Entry[], meta: Meta, now = new Date(), minTotal = 1_000_000, days = 14): Payee[] {
  const r = periodRange("semua", now), a = analyze(entries, { mode: "out", start: 0, end: now.getTime() + DAY, prevStart: null, prevEnd: null, meta, now });
  void r;
  return a.list.filter((p) => p.kind === "orang" && !p.label && +now - +new Date(p.firstAt) < days * DAY && p.count >= 2 && p.total >= minTotal);
}
