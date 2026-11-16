/** Pure receipt contract shared by the API and the review UI. No network/server imports. */
export type ReceiptItem = { name: string; qty: number | null; unit: string; unitPrice: number | null; discount: number; price: number | null; categoryId: string; confidence: number; components: { name: string; qty: number | null; unit: string }[] };
export type ReceiptCharge = { label: string; kind: "tax" | "service" | "shipping" | "other" | "rounding"; amount: number | null; included: boolean };
export type ReceiptDocument = {
  merchant: string; reference: string; paymentMethod: string; merchantAddress: string; purchasedAt: string | null; currency: string; subtotal: number | null; subtotalBeforeItemDiscounts: boolean; discount: number; total: number;
  items: ReceiptItem[]; charges: ReceiptCharge[]; tendered: number | null; change: number | null; warnings: string[];
};
export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function receiptNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/Rp\s*/gi, "").replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/[.,](?=\d{3}(?:[.,]|$))/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
const text = (x: unknown, max = 160) => typeof x === "string" ? x.trim().slice(0, max) : "";
const obj = (x: unknown): Record<string, unknown> => x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
const money = (x: unknown) => { const n = receiptNumber(x); return n === null ? null : roundMoney(n); };
export function normalizeReceiptDocument(input: unknown): ReceiptDocument {
  const r = obj(input);
  const rawItems = Array.isArray(r.items) ? r.items : [];
  const rawCharges = Array.isArray(r.charges) ? r.charges : null;
  const charges: ReceiptCharge[] = rawCharges ? rawCharges.slice(0, 50).map(x => {
    const c = obj(x);
    return { label: text(c.label) || "Biaya", kind: ["tax", "service", "shipping", "rounding"].includes(String(c.kind)) ? c.kind as ReceiptCharge["kind"] : "other", amount: money(c.amount), included: c.included === true };
  }) : (receiptNumber(r.tax) ?? 0) > 0 ? [{ label: "Pajak", kind: "tax", amount: money(r.tax), included: false }] : [];
  const warnings = (Array.isArray(r.warnings) ? r.warnings : []).map(x => text(x, 300)).filter(Boolean).slice(0, 30);
  if (rawItems.length > 200 || (rawCharges?.length ?? 0) > 50) warnings.push("Rincian terlalu panjang; sebagian belum terbaca. Pisahkan foto struk.");
  return {
    merchant: text(r.merchant), reference: text(r.reference), paymentMethod: text(r.paymentMethod, 80), merchantAddress: text(r.merchantAddress, 300), purchasedAt: typeof r.purchasedAt === "string" ? r.purchasedAt : null, currency: text(r.currency, 8) || "IDR",
    subtotal: money(r.subtotal), subtotalBeforeItemDiscounts: r.subtotalBeforeItemDiscounts === true, discount: money(r.discount) ?? 0, total: money(r.total) ?? 0,
    items: rawItems.slice(0, 200).map(x => { const i = obj(x); return { name: text(i.name), qty: receiptNumber(i.qty), unit: text(i.unit, 30), unitPrice: money(i.unitPrice), discount: money(i.discount) ?? 0, price: money(i.price), categoryId: text(i.categoryId, 80) || "belanja", confidence: Math.min(1, Math.max(0, receiptNumber(i.confidence) ?? .5)), components: (Array.isArray(i.components) ? i.components : []).slice(0,50).map(x=>{const c=obj(x);return {name:text(c.name),qty:receiptNumber(c.qty),unit:text(c.unit,30)};}) }; }),
    charges, tendered: money(r.tendered), change: money(r.change), warnings,
  };
}
export function reconcileReceipt(r: ReceiptDocument) {
  const problems: string[] = [];
  const okMoney = (n: number | null) => n !== null && Number.isFinite(n) && n >= 0 && n <= 1e12;
  if (r.currency !== "IDR") problems.push("Mata uang belum didukung; gunakan rupiah.");
  if (!okMoney(r.total) || r.total <= 0) problems.push("Total struk belum valid.");
  if (!r.items.length || r.items.length > 200) problems.push("Rincian item belum lengkap.");
  r.items.forEach((i, k) => {
    if (!i.name.trim() || i.qty === null || !Number.isFinite(i.qty) || i.qty <= 0 || i.qty > 1e6 || !okMoney(i.price) || !okMoney(i.discount) || (i.unitPrice !== null && !okMoney(i.unitPrice))) problems.push(`Periksa nama, kuantitas, dan harga item ${k + 1}.`);
    if (i.qty !== null && i.unitPrice !== null && i.price !== null && Math.abs(roundMoney(i.qty * i.unitPrice - i.discount) - i.price) > .01) problems.push(`Perkalian harga item ${k + 1} berbeda dari jumlah baris.`);
  });
  const itemSum = roundMoney(r.items.reduce((s, i) => s + (i.price ?? 0), 0));
  if (r.subtotal !== null && (!okMoney(r.subtotal) || Math.abs(r.subtotal - itemSum - (r.subtotalBeforeItemDiscounts ? r.items.reduce((s,i)=>s+i.discount,0) : 0)) > .01)) problems.push("Subtotal struk berbeda dari jumlah item.");
  if (!okMoney(r.discount) || r.discount > itemSum) problems.push("Diskon struk belum valid.");
  let adjustment = 0;
  for (const c of r.charges) {
    if (c.amount === null || !Number.isFinite(c.amount) || Math.abs(c.amount) > 1e12 || (c.kind !== "rounding" && c.amount < 0)) problems.push(`Periksa ${c.label}.`);
    if (!c.included) adjustment += c.amount ?? 0;
  }
  const computed = roundMoney(itemSum - r.discount + adjustment);
  const difference = roundMoney(r.total - computed);
  if (Math.abs(difference) > .01) problems.push("Total struk berbeda dari perhitungan rincian.");
  if (r.tendered !== null && !okMoney(r.tendered) || r.change !== null && !okMoney(r.change)) problems.push("Pembayaran atau kembalian belum valid.");
  if (r.tendered !== null && r.change !== null && Math.abs(roundMoney(r.tendered - r.change) - r.total) > .01) problems.push("Pembayaran dikurangi kembalian berbeda dari total.");
  if (r.warnings.some(w=>w.startsWith("Rincian terlalu panjang"))) problems.push("Struk belum lengkap.");
  return { itemSum, computed, difference, problems, valid: problems.length === 0 };
}
