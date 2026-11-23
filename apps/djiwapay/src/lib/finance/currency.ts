/** Currencies a receipt can be in. Everything stored and summed stays in rupiah; this is for showing and reading the original. */
export type CurrencyInfo = { name: string; symbol: string; decimals: number; country: string; flag: string; /** Hours from UTC where the currency is used, for reading the printed time. Missing: the device's own zone. */ offset?: number };
export const CURRENCIES: Record<string, CurrencyInfo> = {
  IDR: { name: "Rupiah", symbol: "Rp", decimals: 0, country: "Indonesia", flag: "🇮🇩", offset: 7 },
  JPY: { name: "Yen Jepang", symbol: "¥", decimals: 0, country: "Jepang", flag: "🇯🇵", offset: 9 },
  KRW: { name: "Won Korea", symbol: "₩", decimals: 0, country: "Korea Selatan", flag: "🇰🇷", offset: 9 },
  CNY: { name: "Yuan China", symbol: "CN¥", decimals: 2, country: "China", flag: "🇨🇳", offset: 8 },
  HKD: { name: "Dolar Hong Kong", symbol: "HK$", decimals: 2, country: "Hong Kong", flag: "🇭🇰", offset: 8 },
  TWD: { name: "Dolar Taiwan", symbol: "NT$", decimals: 0, country: "Taiwan", flag: "🇹🇼", offset: 8 },
  SGD: { name: "Dolar Singapura", symbol: "S$", decimals: 2, country: "Singapura", flag: "🇸🇬", offset: 8 },
  MYR: { name: "Ringgit Malaysia", symbol: "RM", decimals: 2, country: "Malaysia", flag: "🇲🇾", offset: 8 },
  THB: { name: "Baht Thailand", symbol: "฿", decimals: 2, country: "Thailand", flag: "🇹🇭", offset: 7 },
  VND: { name: "Dong Vietnam", symbol: "₫", decimals: 0, country: "Vietnam", flag: "🇻🇳", offset: 7 },
  PHP: { name: "Peso Filipina", symbol: "₱", decimals: 2, country: "Filipina", flag: "🇵🇭", offset: 8 },
  INR: { name: "Rupee India", symbol: "₹", decimals: 2, country: "India", flag: "🇮🇳", offset: 5.5 },
  AUD: { name: "Dolar Australia", symbol: "A$", decimals: 2, country: "Australia", flag: "🇦🇺", offset: 10 },
  USD: { name: "Dolar AS", symbol: "$", decimals: 2, country: "Amerika Serikat", flag: "🇺🇸" },
  EUR: { name: "Euro", symbol: "€", decimals: 2, country: "Eropa", flag: "🇪🇺" },
  GBP: { name: "Pound Inggris", symbol: "£", decimals: 2, country: "Inggris", flag: "🇬🇧" },
  SAR: { name: "Riyal Saudi", symbol: "SAR", decimals: 2, country: "Arab Saudi", flag: "🇸🇦", offset: 3 },
  AED: { name: "Dirham UEA", symbol: "AED", decimals: 2, country: "Uni Emirat Arab", flag: "🇦🇪", offset: 4 },
};
export const CURRENCY_CODES = Object.keys(CURRENCIES);
export const infoOf = (code: string): CurrencyInfo => CURRENCIES[code] ?? { name: code, symbol: code, decimals: 2, country: code, flag: "🌐" };
export const symbolOf = (code: string) => infoOf(code).symbol;

/** "¥1.200", "$12,50", "Rp 1.200": Indonesian digit grouping, the currency's own symbol and decimals. */
export function fmtMoney(n: number, code: string): string {
  const i = infoOf(code), sign = n < 0 ? "−" : "", s = Math.abs(n).toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: i.decimals });
  return `${sign}${i.symbol}${code === "IDR" || i.symbol.length > 2 ? " " : ""}${s}`;
}
export const toRupiah = (amount: number, rate: number) => Math.round(amount * rate);

/** The time as printed on a foreign receipt: the instant shown in the receipt's own zone, not the phone's. */
export function fmtReceiptTime(iso: string, code: string): string {
  const off = CURRENCIES[code]?.offset, d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const when = new Date(d.getTime() + (off === undefined ? -d.getTimezoneOffset() / 60 : off) * 3600_000), p = (n: number) => String(n).padStart(2, "0");
  const month = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][when.getUTCMonth()];
  return `${when.getUTCDate()} ${month} ${when.getUTCFullYear()} · ${p(when.getUTCHours())}.${p(when.getUTCMinutes())}`;
}
/** For <input type="datetime-local">, and back, in the receipt's zone. */
export function toLocalInput(iso: string | null, code: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const d = new Date(iso), off = CURRENCIES[code]?.offset;
  return new Date(d.getTime() + (off === undefined ? -d.getTimezoneOffset() / 60 : off) * 3600_000).toISOString().slice(0, 16);
}
export function fromLocalInput(value: string, code: string): string | null {
  if (!value) return null;
  const off = CURRENCIES[code]?.offset, asUtc = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(asUtc)) return null;
  return new Date(off === undefined ? asUtc + new Date(asUtc).getTimezoneOffset() * 60_000 : asUtc - off * 3600_000).toISOString();
}

/** Trips are tagged `trip:<CURRENCY>-<yyyy-mm>` on entries made from a foreign receipt. */
export const tripTag = (code: string, iso: string) => `trip:${code}-${iso.slice(0, 7)}`;
export function parseTrip(tag: string): { currency: string; month: string; label: string } | null {
  const m = tag.match(/^trip:([A-Z]{3})-(\d{4}-\d{2})$/); if (!m) return null;
  const [y, mo] = m[2].split("-"), names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return { currency: m[1], month: m[2], label: `${infoOf(m[1]).country} · ${names[Number(mo) - 1] ?? mo} ${y}` };
}
