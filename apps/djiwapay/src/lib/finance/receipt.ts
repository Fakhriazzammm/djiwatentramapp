import { uid } from "./calc";
import type { Category, Entry } from "./types";

import { normalizeReceiptDocument } from "../../../../djiwapay-api/src/receipt-document";
import type { ReceiptDocument, ReceiptItem } from "../../../../djiwapay-api/src/receipt-document";
export { normalizeReceiptDocument, reconcileReceipt, receiptNumber, roundMoney } from "../../../../djiwapay-api/src/receipt-document";
export type { ReceiptDocument, ReceiptCharge } from "../../../../djiwapay-api/src/receipt-document";
export type ScannedItem = ReceiptItem;
export type TextBox = [number, number, number, number];
export type ScanBoxes = { merchant?: TextBox; date?: TextBox; total?: TextBox };
export type ScannedReceipt = ReceiptDocument & { boxes?: ScanBoxes; id: string; confidence: number; model: string; legacy?: boolean; reviewed?: boolean; revision?: string | null };
export type ScanErrorCode = "UNAUTHORIZED" | "NOT_A_RECEIPT" | "DAILY_LIMIT" | "SCAN_UNAVAILABLE" | "IMAGE_TOO_LARGE" | "BAD_IMAGE" | "SCAN_FAILED" | "NETWORK";
export class ScanError extends Error { constructor(public code: ScanErrorCode) { super(code); } }

export const SCAN_ERROR_TEXT: Record<ScanErrorCode, string> = {
  UNAUTHORIZED: "Sesi berakhir. Buka ulang Djiwa Pay dari akun Anda lalu coba lagi.",
  NOT_A_RECEIPT: "Gambar ini tidak terbaca sebagai struk. Pastikan satu struk, permukaan rata, dan cahaya cukup. Tidak ada kuota yang terpakai.",
  DAILY_LIMIT: "Batas scan hari ini sudah tercapai. Coba lagi besok atau catat manual.",
  SCAN_UNAVAILABLE: "Scan struk belum aktif di server. Catat manual dulu.",
  IMAGE_TOO_LARGE: "Gambar terlalu besar. Coba foto ulang.",
  BAD_IMAGE: "Format gambar tidak didukung. Pakai foto JPG, PNG, atau WebP.",
  SCAN_FAILED: "Struk belum bisa dibaca saat ini. Coba lagi sebentar atau catat manual.",
  NETWORK: "Tidak ada koneksi. Foto tidak terkirim; coba lagi saat online.",
};

/** Downscale and re-encode on the device so uploads stay small (long side ≤ 2560 px, ≤ ~2 MB). */
export async function compressImage(file: Blob, maxSide = 2560): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let side = maxSide, quality = 0.82, out = "";
  for (let i = 0; i < 4; i++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new ScanError("BAD_IMAGE");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    out = canvas.toDataURL("image/jpeg", quality);
    if (out.length < 2_600_000) break;
    side = Math.round(side * 0.8); quality = Math.max(0.6, quality - 0.08);
  }
  bitmap.close?.();
  return out;
}

export async function scanReceipt(image: string, id = uid()): Promise<ScannedReceipt> {
  let res: Response;
  try { res = await fetch("/api/finance/receipts/scan", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, id }) }); }
  catch { throw new ScanError("NETWORK"); }
  if (res.status === 401) throw new ScanError("UNAUTHORIZED");
  const body = await res.json().catch(() => null) as { success?: boolean; error?: string; receipt?: ScannedReceipt; boxes?: ScanBoxes } | null;
  if (!res.ok || !body?.success || !body.receipt) throw new ScanError((body?.error && body.error in SCAN_ERROR_TEXT ? body.error : "SCAN_FAILED") as ScanErrorCode);
  return { ...body.receipt, ...normalizeReceiptDocument(body.receipt), boxes: body.boxes ?? {} };
}
export const receiptImageUrl = (id: string) => `/api/finance/receipts/${encodeURIComponent(id)}/image`;

export type ReceiptDraftItem = ScannedItem & { key: string };
export const toDraftItems = (items: ScannedItem[], validCategories: Category[]): ReceiptDraftItem[] => items.map((i) => ({ ...i, key: uid(), categoryId: validCategories.some((c) => c.id === i.categoryId && !c.income) ? i.categoryId : "belanja" }));

/** One entry for the whole receipt, or one per category so each budget stays accurate. */
export function receiptToEntries(o: { receiptId: string; merchant: string; items: Pick<ScannedItem, "price" | "categoryId">[]; mode: "one" | "split"; accountId: string; at: string; categories: Category[]; now?: string }): Entry[] {
  const now = o.now ?? new Date().toISOString(), merchant = o.merchant.trim() || "Struk";
  const byCat = new Map<string, number>();
  for (const i of o.items) if (i.price !== null && i.price > 0) byCat.set(i.categoryId, (byCat.get(i.categoryId) ?? 0) + i.price);
  if (!byCat.size) return [];
  const base = { kind: "out" as const, accountId: o.accountId, at: o.at, tags: [], source: "receipt" as const, receiptId: o.receiptId, createdAt: now };
  if (o.mode === "one") {
    const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return [{ ...base, id: uid(), amount: [...byCat.values()].reduce((s, v) => s + v, 0), categoryId: top, note: merchant }];
  }
  return [...byCat.entries()].map(([categoryId, amount]) => ({ ...base, id: uid(), amount, categoryId, note: `${merchant} · ${o.categories.find((c) => c.id === categoryId)?.name ?? categoryId}` }));
}

const RECEIPT_ERRORS: Record<string,string> = {
  RECEIPT_MISMATCH: "Rincian belum cocok dengan total. Periksa kembali struk.",
  RECEIPT_CHANGED: "Struk telah berubah atau terdiri dari beberapa catatan lama. Tutup dan buka kembali detailnya.",
  INVALID_ACCOUNT_OR_CATEGORY: "Dompet atau kategori belum tersedia. Sinkronkan catatan lalu coba lagi.",
  ALREADY_RECORDED: "Struk ini sudah tercatat. Buka dari riwayat.",
  ALREADY_REMOVED: "Catatan ini sudah dihapus. Pulihkan dari riwayat, jangan simpan struk yang sama lagi.",
};
export async function fetchReceipt(id: string): Promise<ScannedReceipt> {
  const r = await fetch(`/api/finance/receipts/${encodeURIComponent(id)}`, { credentials: "include" });
  if (!r.ok) throw new Error(r.status === 404 ? "Rincian struk tidak ditemukan." : r.status === 401 ? SCAN_ERROR_TEXT.UNAUTHORIZED : "Rincian struk belum dapat dimuat. Coba lagi.");
  const receipt = (await r.json()).receipt;
  return { ...receipt, ...normalizeReceiptDocument(receipt) };
}
export async function confirmScannedReceipt(receipt: ScannedReceipt, accountId: string, categoryId: string, revise = false): Promise<Entry> {
  const r = await fetch(`/api/finance/receipts/${encodeURIComponent(receipt.id)}/${revise ? "revise" : "confirm"}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: receipt, accountId, categoryId, reviewed: true, revision: receipt.revision ?? null }) });
  const body = await r.json().catch(()=>null);
  if (!r.ok || !body?.entry) throw new Error(r.status === 401 ? SCAN_ERROR_TEXT.UNAUTHORIZED : RECEIPT_ERRORS[body?.error] ?? "Belum tersimpan. Periksa koneksi lalu coba lagi; percobaan ulang tidak membuat catatan ganda.");
  return body.entry;
}

export async function rereadReceipt(id: string): Promise<ScannedReceipt> {
  const r = await fetch(`/api/finance/receipts/${encodeURIComponent(id)}/reread`, { method: "POST", credentials: "include" });
  const body = await r.json().catch(()=>null);
  if (!r.ok || !body?.receipt) throw new Error(SCAN_ERROR_TEXT[body?.error as ScanErrorCode] ?? "Foto struk belum dapat dibaca ulang. Coba lagi.");
  return { ...body.receipt, ...normalizeReceiptDocument(body.receipt), boxes: body.boxes ?? {} };
}

/** Adds the scanned receipt to an existing entry (e.g. from a payment e-mail) without changing what was paid. */
export async function attachScannedReceipt(receipt: ScannedReceipt, entry: Entry): Promise<Entry> {
  const r = await fetch(`/api/finance/receipts/${encodeURIComponent(receipt.id)}/attach`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: receipt, entryId: entry.id, reviewed: true }) });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.entry) throw new Error(r.status === 401 ? SCAN_ERROR_TEXT.UNAUTHORIZED : RECEIPT_ERRORS[body?.error] ?? "Belum tersimpan. Periksa koneksi lalu coba lagi.");
  return { ...entry, receiptId: receipt.id };
}
