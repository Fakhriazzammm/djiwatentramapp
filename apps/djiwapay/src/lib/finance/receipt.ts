import { uid } from "./calc";
import type { Category, Entry } from "./types";

export type ScannedItem = { name: string; qty: number; price: number; categoryId: string; confidence: number };
export type ScannedReceipt = { id: string; merchant: string; purchasedAt: string | null; total: number; tax: number; items: ScannedItem[]; confidence: number; mismatch: number; model: string };
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

/** Downscale and re-encode on the device so uploads stay small (long side ≤ 1600 px, ≤ ~2 MB). */
export async function compressImage(file: Blob, maxSide = 1600): Promise<string> {
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
  const body = await res.json().catch(() => null) as { success?: boolean; error?: string; receipt?: ScannedReceipt } | null;
  if (!res.ok || !body?.success || !body.receipt) throw new ScanError((body?.error && body.error in SCAN_ERROR_TEXT ? body.error : "SCAN_FAILED") as ScanErrorCode);
  return body.receipt;
}
export const receiptImageUrl = (id: string) => `/api/finance/receipts/${encodeURIComponent(id)}/image`;

export type ReceiptDraftItem = ScannedItem & { key: string };
export const toDraftItems = (items: ScannedItem[], validCategories: Category[]): ReceiptDraftItem[] => items.map((i) => ({ ...i, key: uid(), categoryId: validCategories.some((c) => c.id === i.categoryId && !c.income) ? i.categoryId : "belanja" }));

/** One entry for the whole receipt, or one per category so each budget stays accurate. */
export function receiptToEntries(o: { receiptId: string; merchant: string; items: Pick<ScannedItem, "price" | "categoryId">[]; mode: "one" | "split"; accountId: string; at: string; categories: Category[]; now?: string }): Entry[] {
  const now = o.now ?? new Date().toISOString(), merchant = o.merchant.trim() || "Struk";
  const byCat = new Map<string, number>();
  for (const i of o.items) if (i.price > 0) byCat.set(i.categoryId, (byCat.get(i.categoryId) ?? 0) + i.price);
  if (!byCat.size) return [];
  const base = { kind: "out" as const, accountId: o.accountId, at: o.at, tags: [], source: "receipt" as const, receiptId: o.receiptId, createdAt: now };
  if (o.mode === "one") {
    const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return [{ ...base, id: uid(), amount: [...byCat.values()].reduce((s, v) => s + v, 0), categoryId: top, note: merchant }];
  }
  return [...byCat.entries()].map(([categoryId, amount]) => ({ ...base, id: uid(), amount, categoryId, note: `${merchant} · ${o.categories.find((c) => c.id === categoryId)?.name ?? categoryId}` }));
}
