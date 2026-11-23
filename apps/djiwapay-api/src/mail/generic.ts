/** Mail from senders we have no template for (a shop, a marketplace, an employer, a friend's invoice...). Opt-in, and never recorded without the
 *  person saying whether it was income or spending. Pure (no network, no database) so each rule is unit-tested. */
import type { Issuer } from "./extract.js";

/** Words in a subject that point at money having moved. The Apps Script and the Gmail poller both search with this; the pipeline decides again. */
const KEYWORDS = ["pembayaran", "\"bukti pembayaran\"", "transaksi", "struk", "invoice", "receipt", "\"payment received\"", "\"payment successful\"", "\"order confirmation\"", "pesanan", "pembelian",
  "\"top up\"", "topup", "transfer", "\"dana masuk\"", "\"uang masuk\"", "pemasukan", "pengeluaran", "refund", "\"pengembalian dana\"", "gaji", "\"slip gaji\"", "donasi", "langganan", "tagihan"];
export const broadQuery = () => `subject:(${KEYWORDS.join(" OR ")}) -category:promotions -category:social -category:forums -in:spam -in:trash`;

/** A day's worth of unknown-sender items that can be queued; beyond it the rest is dropped so one noisy sender cannot bury the queue. */
export const GENERIC_DAILY_LIMIT = 30;

const TLD = new Set(["com", "co", "id", "net", "org", "go", "or", "web", "ac", "sch", "my", "io", "app", "biz", "info", "me", "cc"]);
/** "notif.tokopedia.com" -> "Tokopedia", "mail.shopee.co.id" -> "Shopee". */
export function senderName(domain: string): string {
  const parts = domain.toLowerCase().split(".").filter(Boolean);
  while (parts.length > 1 && TLD.has(parts[parts.length - 1])) parts.pop();
  const base = parts[parts.length - 1] ?? domain;
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Pengirim lain";
}
export const genericIssuer = (domain: string): Issuer => ({ id: "other", name: senderName(domain), kind: "service", domains: [domain], packages: [] });

/** The mail really comes from the domain it claims: DMARC passed, or a DKIM signature of that domain (or a parent / child of it) verified. */
export function senderAuthentic(fromDomain: string, auth: { dmarcPass: boolean; dkimDomains: string[] }): boolean {
  if (auth.dmarcPass) return true;
  const f = fromDomain.toLowerCase();
  return auth.dkimDomains.some((d) => { const x = d.toLowerCase(); return x === f || f.endsWith("." + x) || x.endsWith("." + f); });
}
