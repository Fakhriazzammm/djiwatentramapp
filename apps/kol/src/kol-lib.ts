import { createAuthClient } from "better-auth/react";
import type { SowSnapshot } from "../../../supabase/functions/_shared/kol-mail";
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
  CONSENT_REQUIRED: "Setujui semua persetujuan dulu (syarat, kehadiran, dan konsekuensi bila tidak hadir).",
  INVALID_KOL_INTAKE: "Data belum lengkap. Periksa lagi nama, WhatsApp, dan username.",
  PROFILE_DUPLICATE: "Akun media sosial ini sudah terdaftar. Hubungi admin Djiwa Tentram bila itu akunmu.",
  ALREADY_REGISTERED: "Akun Google ini sudah terdaftar sebagai KOL.",
  UNAUTHORIZED: "Sesi Google berakhir. Masuk lagi ya.",
  CAMPAIGN_NOT_OPEN: "Pendaftaran kampanye ini sudah ditutup.",
  CAMPAIGN_PROOF_PLATFORM_INVALID: "Link konten harus berasal dari platform yang dipilih.",
  CAMPAIGN_PROOF_REVISION_UNAVAILABLE: "Bukti belum bisa direvisi. Periksa status bukti dan platform tautannya.",
  CAMPAIGN_PROOF_UNAVAILABLE: "Bukti untuk platform ini sudah dikirim atau kunjungan belum ditandai selesai.",
  CAMPAIGN_NOT_FOUND: "Kampanye tidak ditemukan.",
  CAMPAIGN_TERMS_CHANGED: "Syarat kampanye berubah. Baca lagi dan setujui versi terbaru.",
  CAMPAIGN_VISIT_OUTSIDE_PERIOD: "Jadwalmu di luar periode kunjungan kampanye ini.",
  ACTIVE_VISIT_NOT_FOUND: "Jadwal visit aktif sudah berubah. Pilih jadwal baru.",
  VISIT_LINKED_TO_CAMPAIGN: "Jadwal visit ini sudah dipakai untuk kampanye lain.",
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

export type VisitRow = { booking_date: string; booking_time: string | null; status: string; own: boolean; creator_name?: string | null; category?: string | null; platform?: string | null; sow?: SowSnapshot; post_deadline?: string | null; note?: string | null };

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

/** Persetujuan ketiga pada booking visit. Teks resmi yang dicatat server ada di kol-portal-contract.ts. */
export const CONSENT_NO_SHOW = "Jika saya tidak hadir pada tanggal dan jam yang saya pilih, saya bersedia menerima konsekuensi dan denda yang ditetapkan Djiwa Tentram, karena saya telah menyetujui jadwal ini.";

/** Nama aplikasi bila halaman dibuka di browser dalam aplikasi (Google memblokir login Google di sana), selain itu null. */
export function inAppBrowserName(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): string | null {
  const rules: Array<[RegExp, string]> = [
    [/Instagram/i, "Instagram"], [/FBAN|FBAV|FB_IAB/i, "Facebook"], [/TikTok|musical_ly|BytedanceWebview/i, "TikTok"],
    [/Line\//i, "LINE"], [/Snapchat/i, "Snapchat"], [/Twitter/i, "X (Twitter)"], [/MicroMessenger/i, "WeChat"], [/GSA\//i, "aplikasi Google"],
  ];
  for (const [pattern, name] of rules) if (pattern.test(ua)) return name;
  return /; wv\)/.test(ua) ? "aplikasi" : null;
}

/** Pesan ramah untuk kode galat OAuth yang dikembalikan Better Auth ke ?error=. */
export function loginErrorText(code: string | null): string {
  switch (code) {
    case "access_denied": return "Akses Google dibatalkan atau ditolak. Ketuk lagi, pilih akunmu, lalu izinkan.";
    case "state_mismatch": case "please_restart_the_process": case "invalid_state":
      return "Proses masuk terputus. Ketuk \"Lanjutkan dengan Google\" satu kali saja dan tunggu sampai selesai.";
    case "email_not_found": return "Akun Google tidak memberikan alamat email. Gunakan akun Google lain.";
    case "signup_disabled": return "Pendaftaran akun belum dibuka untuk akun ini. Hubungi admin Djiwa Tentram.";
    default: return "Masuk dengan Google belum berhasil. Coba lagi, atau buka link ini di Chrome atau Safari.";
  }
}
