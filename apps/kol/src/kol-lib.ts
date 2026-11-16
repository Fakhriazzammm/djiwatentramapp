import { createAuthClient } from "better-auth/react";
export const AUTH_BASE = "https://api.djiwatentram.web.id/v1/auth";
export const KOL_API = "https://api.djiwatentram.web.id/v1/kol";

export class KolApiError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}

export async function kolApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${KOL_API}${path}`, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new KolApiError(String(body.error || "REQUEST_FAILED"));
  return (body.data ?? body) as T;
}

export const ERROR_TEXT: Record<string, string> = {
  DATE_ALREADY_BOOKED: "Tanggal itu baru saja diambil creator lain. Pilih tanggal lain ya.",
  CREATOR_ALREADY_HAS_ACTIVE_BOOKING: "Kamu sudah punya jadwal visit aktif.",
  INVALID_BOOKING_DATE: "Pilih tanggal mulai besok.",
  INVALID_BOOKING_TIME: "Jam datang hanya 11.00 sampai 17.00.",
  CONSENT_REQUIRED: "Setujui syarat dan komitmen kehadiran dulu.",
  INVALID_KOL_INTAKE: "Data belum lengkap. Periksa lagi nama, WhatsApp, dan username.",
  PROFILE_DUPLICATE: "Akun media sosial ini sudah terdaftar. Hubungi admin Djiwa Tentram bila itu akunmu.",
  ALREADY_REGISTERED: "Akun Google ini sudah terdaftar sebagai KOL.",
  UNAUTHORIZED: "Sesi Google berakhir. Masuk lagi ya.",
  VISIT_NOT_ELIGIBLE: "Akunmu belum diizinkan booking visit oleh admin.",
};
export const errorText = (error: unknown, fallback = "Permintaan belum berhasil. Coba lagi.") =>
  error instanceof KolApiError ? ERROR_TEXT[error.code] || fallback : fallback;

/** Jam datang visit: 11.00 sampai 17.00, tiap 30 menit. */
export const VISIT_TIMES: string[] = (() => {
  const out: string[] = [];
  for (let h = 11; h <= 17; h++) { out.push(`${String(h).padStart(2, "0")}:00`); if (h < 17) out.push(`${String(h).padStart(2, "0")}:30`); }
  return out;
})();
export const dotTime = (t?: string | null) => (t ? String(t).slice(0, 5).replace(":", ".") : "");

export type VisitRow = { booking_date: string; booking_time: string | null; status: string; own: boolean; creator_name?: string | null; category?: string | null; platform?: string | null };

export const dayKey = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const parseDay = (key: string) => { const [y = 0, m = 1, d = 1] = key.split("-").map(Number); return new Date(y, m - 1, d); };
export const longDate = (key: string) => parseDay(key).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const shortDate = (key: string) => parseDay(key).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
export function tomorrowKey() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return dayKey(d.getFullYear(), d.getMonth(), d.getDate()); }
export const AVATAR_COLORS = ["#7c3aed", "#e11d48", "#0891b2", "#d97706", "#059669", "#db2777", "#2563eb"];
export const colorFor = (text: string) => { let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; };

const authClient = createAuthClient({ baseURL: AUTH_BASE, fetchOptions: { credentials: "include" } });
/** Keluar: hapus sesi di server lewat Better Auth, lalu kembali ke layar masuk. */
export async function logoutKol() {
  try { await authClient.signOut(); } catch { /* tetap kembali ke layar masuk */ }
  window.location.assign("/");
}

export function timeAgo(value?: string | null) {
  if (!value) return "Baru saja";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Baru saja";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} hari lalu`;
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
