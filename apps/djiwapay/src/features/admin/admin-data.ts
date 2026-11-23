import { useCallback, useEffect, useRef, useState } from "react";

/* ---------- date ranges (Asia/Jakarta, weeks start on Monday) ---------- */
export type RangeKey = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | "custom";
export const RANGES: [RangeKey, string][] = [["today", "Hari ini"], ["yesterday", "Kemarin"], ["this_week", "Minggu ini"], ["last_week", "Minggu kemarin"], ["this_month", "Bulan ini"], ["last_month", "Bulan kemarin"], ["this_year", "Tahun ini"], ["custom", "Pilih tanggal"]];
const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
/** "Today" in WIB as a UTC-midnight Date so day arithmetic never meets a DST or device-timezone shift. */
export const todayWib = (now = new Date()) => { const w = new Date(now.getTime() + 7 * 3600_000); return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate())); };
export function rangeOf(key: RangeKey, custom?: { from: string; to: string }, now = new Date()): { from: string; to: string } {
  const t = todayWib(now), add = (d: Date, n: number) => new Date(d.getTime() + n * 864e5), dow = (t.getUTCDay() + 6) % 7;
  switch (key) {
    case "today": return { from: fmt(t), to: fmt(t) };
    case "yesterday": return { from: fmt(add(t, -1)), to: fmt(add(t, -1)) };
    case "this_week": return { from: fmt(add(t, -dow)), to: fmt(t) };
    case "last_week": return { from: fmt(add(t, -dow - 7)), to: fmt(add(t, -dow - 1)) };
    case "this_month": return { from: fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))), to: fmt(t) };
    case "last_month": return { from: fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1))), to: fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0))) };
    case "this_year": return { from: `${t.getUTCFullYear()}-01-01`, to: fmt(t) };
    default: { const c = custom ?? { from: fmt(add(t, -6)), to: fmt(t) }; return c.from <= c.to ? c : { from: c.to, to: c.from }; }
  }
}

/* ---------- API ---------- */
export class AdminError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/finance/admin/${path}`, { credentials: "include", ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const body = await res.json().catch(() => null) as ({ success?: boolean; error?: string } & T) | null;
  if (!res.ok || !body?.success) throw new AdminError(res.status, body?.error ?? `HTTP ${res.status}`);
  return body;
}

/** Loads one admin endpoint, reloads when the key changes, keeps the previous data on screen while refreshing. */
export function useAdmin<T>(path: string | null, refreshMs = 0, refreshVersion = 0): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [state, set] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: Boolean(path) });
  const seq = useRef(0), cache = useRef(new Map<string, T>());
  const run = useCallback(() => {
    if (!path) return; const id = ++seq.current, hit = cache.current.get(path);
    set((s) => ({ data: hit ?? s.data, error: null, loading: true }));
    adminFetch<T>(path).then((d) => { if (id !== seq.current) return; cache.current.set(path, d); set({ data: d, error: null, loading: false }); }, (e: Error) => { if (id === seq.current) set((s) => ({ data: s.data, error: e.message, loading: false })); });
  }, [path]);
  useEffect(() => { run(); if (!refreshMs) return; const t = window.setInterval(run, refreshMs); return () => window.clearInterval(t); }, [run, refreshMs, refreshVersion]);
  return { ...state, reload: run };
}

/* ---------- formats ---------- */
export const rp = (n: number) => `${n < 0 ? "−" : ""}Rp${Math.abs(Math.round(n || 0)).toLocaleString("id-ID")}`;
export const nf = (n: number) => Math.round(n || 0).toLocaleString("id-ID");
export const compact = (n: number) => { const a = Math.abs(n), s = n < 0 ? "−" : ""; return a >= 1e9 ? `${s}${(a / 1e9).toFixed(1).replace(".", ",")} M` : a >= 1e6 ? `${s}${(a / 1e6).toFixed(1).replace(".", ",")} jt` : a >= 1e3 ? `${s}${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(".", ",")} rb` : `${s}${Math.round(a)}`; };
export const pctChange = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : null);
export const dShort = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
export const dLong = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const dTime = (v: string | Date | null | undefined) => (v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":") : "—");
export const ago = (v: string | Date | null | undefined) => { if (!v) return "—"; const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000); return s < 60 ? "baru saja" : s < 3600 ? `${Math.floor(s / 60)} mnt lalu` : s < 86400 ? `${Math.floor(s / 3600)} jam lalu` : `${Math.floor(s / 86400)} hari lalu`; };

/* ---------- types ---------- */
export type Daily = { day: string; views: number; visitors: number; entries: number; spent: number; income: number; scans: number; newUsers: number; topup: number; spend: number };
export type Kpi = { views: number; visitors: number; activeUsers: number; pwaViews: number; entries: number; spent: number; income: number; transfers: number; entryUsers: number; receipts: number; scans: number; mails: number; mailsOk: number; mailsReview: number; newUsers: number; topups: number; topupCount: number; spend: number; txCount: number; rewards: number };
export type Overview = { range: { from: string; to: string; days: number }; previous: { from: string; to: string }; current: Kpi; before: Kpi; daily: Daily[]; totals: Record<string, number> };
