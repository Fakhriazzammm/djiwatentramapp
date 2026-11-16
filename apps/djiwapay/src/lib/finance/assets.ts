import { useEffect, useState } from "react";
import type { Asset, AssetSub } from "./types";

/* ---------- gold reference price (shared module store, loaded once) ---------- */
export type GoldPoint = [string, number];
export type GoldData = { points: GoldPoint[]; asOf: string | null; source: string };
let gold: GoldData | null = null;
let inflight: Promise<GoldData | null> | null = null;
const listeners = new Set<() => void>();

export function loadGold(force = false): Promise<GoldData | null> {
  if (gold && !force) return Promise.resolve(gold);
  inflight ??= fetch("/api/finance/prices/gold", { credentials: "include" })
    .then(async (r) => (r.ok ? await r.json() : null))
    .then((b) => { if (b?.points?.length) { gold = { points: b.points, asOf: b.asOf ?? null, source: b.source ?? "" }; listeners.forEach((l) => l()); } return gold; })
    .catch(() => gold)
    .finally(() => { inflight = null; });
  return inflight;
}
export function useGold(): GoldData | null {
  const [, tick] = useState(0);
  useEffect(() => { const l = () => tick((n) => n + 1); listeners.add(l); void loadGold(); return () => { listeners.delete(l); }; }, []);
  return gold;
}
export const goldNow = () => (gold ? gold.points[gold.points.length - 1][1] : null);

/** Reference price on a day (the last known price on or before it; the first point if earlier). */
export function priceOn(points: GoldPoint[], day: string): number {
  let lo = 0, hi = points.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (points[mid][0] <= day) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return points[ans][1];
}

/* ---------- valuation ---------- */
export const isGoldAsset = (a: Pick<Asset, "kind" | "auto" | "weight">) => a.kind === "gold" && Boolean(a.auto) && (a.weight ?? 0) > 0;
export const KARAT: [string, number][] = [["24K", 0.9999], ["22K", 0.9167], ["18K", 0.75], ["16K", 0.6667], ["14K", 0.5833], ["10K", 0.4167]];
export const purityLabel = (p?: number) => (p ? KARAT.find(([, v]) => Math.abs(v - p) < 0.003)?.[0] ?? `${(p * 100).toFixed(1)}%` : "");
export const SUB_LABEL: Record<AssetSub, string> = { batangan: "Emas batangan", perhiasan: "Perhiasan", koin: "Koin", lainnya: "Lainnya" };
export const BUYBACK_CUT: Record<AssetSub, number> = { batangan: 0.05, koin: 0.05, perhiasan: 0.15, lainnya: 0.1 };

/** Value that follows the gold price since the purchase date, keeping what was actually paid as the base. */
export function assetValue(a: Asset, points: GoldPoint[] | null = gold?.points ?? null): number {
  if (!isGoldAsset(a) || !points?.length) return a.value;
  const now = points[points.length - 1][1], weight = a.weight ?? 0, fine = weight * (a.purity ?? 0.9999);
  if (a.cost && a.boughtOn) return Math.round(a.cost * (now / priceOn(points, a.boughtOn)));
  return Math.round(fine * now);
}

export type Stats = { series: { day: string; value: number }[]; high: number; low: number; gain: number; gainPct: number; perYear: number | null; days: number };
/** Value of a gold asset day by day from its purchase date. */
export function assetSeries(a: Asset, points: GoldPoint[]): { day: string; value: number }[] {
  if (!isGoldAsset(a) || !points.length) return [];
  const from = a.boughtOn ?? points[Math.max(0, points.length - 180)][0];
  const base = a.cost && a.boughtOn ? a.cost / priceOn(points, a.boughtOn) : (a.weight ?? 0) * (a.purity ?? 0.9999);
  const days = points.filter(([d]) => d >= from);
  const rows = days.map(([day, p]) => ({ day, value: Math.round(base * p) }));
  if (a.boughtOn && a.cost && (!rows.length || rows[0].day > a.boughtOn)) rows.unshift({ day: a.boughtOn, value: Math.round(a.cost) });
  return rows;
}
export function assetStats(a: Asset, points: GoldPoint[], now = new Date()): Stats | null {
  const series = assetSeries(a, points);
  if (series.length < 2) return null;
  const values = series.map((s) => s.value), last = values[values.length - 1], base = a.cost ?? values[0];
  const days = Math.max(1, Math.round((now.getTime() - Date.parse(series[0].day)) / 864e5));
  const gain = last - base, gainPct = base > 0 ? (gain / base) * 100 : 0;
  const perYear = days >= 60 && base > 0 && last > 0 ? (Math.pow(last / base, 365 / days) - 1) * 100 : null;
  return { series, high: Math.max(...values), low: Math.min(...values), gain, gainPct, perYear, days };
}
export function holdingLabel(days: number): string {
  const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30);
  return y ? `${y} th${m ? ` ${m} bln` : ""}` : m ? `${m} bln` : `${days} hari`;
}
export function gainOf(a: Asset): { gain: number; pct: number } | null {
  if (!a.cost || a.cost <= 0) return null;
  const v = assetValue(a);
  return { gain: v - a.cost, pct: ((v - a.cost) / a.cost) * 100 };
}

/* ---------- stickers ---------- */
export type StickerMode = "ai" | "local";
export const stickerUrl = (id: string) => `/api/finance/assets/stickers/${encodeURIComponent(id)}`;

/** Small on purpose: the image model downloads the photo itself and times out on large files. */
async function toDataUrl(file: Blob, maxSide = 640): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return c.toDataURL("image/jpeg", 0.68);
}
export async function createSticker(file: Blob): Promise<{ id: string; mode: StickerMode }> {
  const image = await toDataUrl(file);
  const res = await fetch("/api/finance/assets/stickers", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
  const b = await res.json().catch(() => null);
  if (res.status === 429) throw new Error("Batas foto aset hari ini sudah tercapai. Coba lagi besok.");
  if (res.status === 401) throw new Error("Sesi berakhir. Buka ulang Djiwa Pay lalu coba lagi.");
  if (!res.ok || !b?.id) throw new Error("Foto belum bisa diproses. Periksa koneksi lalu coba lagi.");
  return { id: b.id, mode: b.mode === "ai" ? "ai" : "local" };
}
export async function fetchRaw(id: string): Promise<Blob> {
  const r = await fetch(`${stickerUrl(id)}/raw`, { credentials: "include" });
  if (!r.ok) throw new Error("Foto tidak ditemukan.");
  return r.blob();
}
export async function uploadSticker(id: string, png: string): Promise<void> {
  const r = await fetch(`${stickerUrl(id)}/final`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: png }) });
  if (!r.ok) throw new Error("Stiker belum tersimpan. Coba lagi.");
}

type RGB = [number, number, number];
const dist = (d: Uint8ClampedArray, i: number, c: RGB) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);

/** Make a flat key colour transparent, with a soft edge and the colour spill removed from the rim. */
export function keyOutColour(data: ImageData, key: RGB, inner = 70, outer = 150): void {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = dist(d, i, key);
    if (k >= outer) continue;
    const a = k <= inner ? 0 : (k - inner) / (outer - inner);
    d[i + 3] = Math.round(d[i + 3] * a);
    if (a > 0) { // despill: pull magenta back toward the neighbouring channel
      const spill = Math.max(0, Math.min(d[i], d[i + 2]) - d[i + 1]);
      d[i] = Math.max(0, d[i] - spill * 0.8); d[i + 2] = Math.max(0, d[i + 2] - spill * 0.8);
    }
  }
}
/** Plain-photo fallback: flood fill from the border over pixels close to the corner colour. */
export function floodOutBackground(data: ImageData, tol = 46): void {
  const { width: w, height: h, data: d } = data;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  const bg: RGB = [0, 0, 0]; corners.forEach((i) => { bg[0] += d[i] / 4; bg[1] += d[i + 1] / 4; bg[2] += d[i + 2] / 4; });
  const seen = new Uint8Array(w * h), stack: number[] = [];
  const push = (x: number, y: number) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const p = y * w + x; if (seen[p]) return; if (dist(d, p * 4, bg) > tol) return; seen[p] = 1; stack.push(p); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) { const p = stack.pop()!, x = p % w, y = (p - x) / w; d[p * 4 + 3] = 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  // feather: pixels touching transparency become semi-transparent
  const copy = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const p = (y * w + x) * 4; if (copy[p + 3] === 0) continue; if (copy[p - 4 + 3] === 0 || copy[p + 4 + 3] === 0 || copy[p - w * 4 + 3] === 0 || copy[p + w * 4 + 3] === 0) d[p + 3] = 150; }
}
/** Crop to the visible object with a small margin and scale to at most `max` px. */
export function cropToObject(c: HTMLCanvasElement, max = 768): HTMLCanvasElement {
  const g = c.getContext("2d")!, { width: w, height: h } = c, d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return c;
  const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, s = Math.min(1, max / Math.max(cw, ch));
  const out = document.createElement("canvas"); out.width = Math.max(1, Math.round(cw * s)); out.height = Math.max(1, Math.round(ch * s));
  out.getContext("2d")!.drawImage(c, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out;
}
/** Turn the stored raw image into a transparent PNG sticker, on the device. */
export async function makeStickerPng(raw: Blob, mode: StickerMode): Promise<string> {
  const bmp = await createImageBitmap(raw);
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  const img = g.getImageData(0, 0, c.width, c.height);
  if (mode === "ai") keyOutColour(img, [255, 0, 255]); else floodOutBackground(img);
  g.putImageData(img, 0, 0);
  return cropToObject(c).toDataURL("image/png");
}

/** What the gold-backed assets gained or lost over the last `days` days (assets held for less than that are skipped). */
export function assetsChange(assets: Asset[], points: GoldPoint[] | null, days = 30, now = new Date()): { delta: number; base: number } | null {
  if (!points?.length) return null;
  const day = new Date(now.getTime() - days * 864e5).toISOString().slice(0, 10), latest = points[points.length - 1][1], before = priceOn(points, day);
  let delta = 0, base = 0;
  for (const a of assets) {
    if (!isGoldAsset(a) || (a.boughtOn && a.boughtOn > day)) continue;
    const now$ = assetValue(a, points), ratio = latest / before; // the same asset valued at the earlier price
    const then = now$ / ratio; delta += now$ - then; base += then;
  }
  return base > 0 ? { delta, base } : null;
}
