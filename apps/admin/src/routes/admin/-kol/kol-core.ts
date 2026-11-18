// Inti modul admin KOL Marketing: tipe, panggilan API, aturan status, dan penyimpanan data bersama.
// Aturan status disamakan dengan apps/kol (portal creator) dan auth-server (kol-portal.ts).
import { useCallback, useEffect, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { isAdminLevelRole } from "@/lib/admin-access";
import type { KolMailKind, SowSection, SowSnapshot } from "../../../../../../supabase/functions/_shared/kol-mail";

/* ---------- Tipe ---------- */
export type Platform = { platform: string; username: string; followers: number; profile_url?: string | null };
export type Contact = { whatsapp?: string | null; email?: string | null; manager_name?: string | null; manager_contact?: string | null };
export type Creator = {
  source_id: string; name: string; username: string; avatar_url?: string | null; location: string; category: string; status: string;
  public_reason?: string | null; application_data?: { averageViews?: number; contentTypes?: string[]; profileUrl?: string; source?: string } | null;
  visit_booking_eligible: boolean; linked: boolean; created_at?: string | null;
  kol_platforms?: Platform[]; contact: Contact | null; profile: { slug?: string | null; display_name?: string | null; bio?: string | null; is_public?: boolean | null; public_availability?: string | null } | null;
};
export type Visit = {
  id: number; kol_id: string; booking_date: string; booking_time: string | null; status: string; admin_note?: string | null; visit_note?: string | null;
  consent_version?: string | null; consented_at?: string | null; created_at?: string; updated_at?: string;
  sow_version?: number | null; sow_snapshot?: SowSnapshot; sow_customized?: boolean; post_deadline?: string | null;
  kol_creators?: { name: string; username: string; avatar_url?: string | null; kol_private_contacts?: Contact | Contact[] | null } | null;
};
export type Campaign = {
  id: number; slug: string; title: string; description: string; location?: string | null; benefit_description: string; deliverable_summary: string;
  application_deadline?: string | null; start_date?: string | null; end_date?: string | null; status: string; created_at?: string;
};
export type Assignment = { id: number; campaign_id: number; kol_id: string; status: string; admin_note?: string | null; accepted_at?: string | null; completed_at?: string | null; kol_creators?: { name: string; username: string } | null };
export type Submission = {
  id: number; campaign_assignment_id: number; deliverable_type: string; content_url: string; insight_screenshot_url?: string | null; status: string; review_note?: string | null; created_at?: string;
  kol_campaign_assignments?: { id: number; kol_id: string; campaign_id: number; kol_creators?: { name: string; username: string } | null; kol_campaigns?: { title: string } | null } | null;
};
export type Inquiry = {
  id: number; kol_id: string; business_name: string; contact_name: string; contact_email?: string | null; contact_phone?: string | null; brief: string;
  preferred_contact: string; status: string; admin_note?: string | null; created_at: string; kol_creators?: { name: string; username: string } | null;
};
export type Report = {
  id: number; post_id: number; reporter_kol_id: string; reason: string; note?: string | null; status: string; created_at: string;
  kol_public_posts?: { id: number; kol_id: string; post_type: string; title: string; body: string; media_url?: string | null; visibility: string; moderation_status: string; kol_creators?: { name: string; username: string } | null } | null;
};
export type Badge = { kol_id: string; kol_badges?: { code: string; name: string } | null };
export type SowVersion = { id: number; version: number; title: string; sections: SowSection[]; closing: string; note?: string | null; is_active: boolean; created_by: string; created_at: string };
export type VisitSettings = { cafe_name: string; address: string; maps_url: string; wa_admin: string; wa_manager: string; post_deadline_days: number; updated_at?: string };
export type EmailRow = { id: number; kind: KolMailKind; booking_id: number | null; kol_id: string; to_email: string | null; status: string; attempts: number; last_error?: string | null; scheduled_at: string; sent_at?: string | null; created_at: string };
export type Overview = {
  campaigns: Campaign[]; assignments: Assignment[]; submissions: Submission[]; badges: Badge[]; visits: Visit[]; inquiries: Inquiry[]; reports: Report[];
  sowVersions: SowVersion[]; settings: VisitSettings | null; emails: EmailRow[];
};

export const EMAIL_KIND: Record<KolMailKind, string> = { visit_confirmed: "Konfirmasi visit", visit_cancelled: "Pembatalan visit", visit_reminder: "Pengingat H-1", sow_updated: "SOW diperbarui" };
export const EMAIL_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Dalam antrean", color: "#b7791f" }, sending: { label: "Mengirim", color: "#2f6fdf" }, sent: { label: "Terkirim", color: "#16a34a" },
  failed: { label: "Gagal", color: "#d92d20" }, skipped: { label: "Tidak dikirim", color: "#666672" },
};
export const EMAIL_NOTE: Record<string, string> = { EMAIL_TIDAK_ADA: "Creator belum punya email", EMAIL_TIDAK_VALID: "Alamat email tidak valid", BOOKING_DIBATALKAN: "Booking dibatalkan", DIBATALKAN_ADMIN: "Dibatalkan admin" };

/* ---------- Konstanta (sama dengan apps/kol) ---------- */
export const CATEGORIES = ["Food & Beverage", "Coffee", "Lifestyle", "Travel", "Fashion", "Beauty", "Entertainment", "Other"];
export const PLATFORMS = ["TikTok", "Instagram", "YouTube", "Threads", "Other"];
export const CREATOR_STATUSES: Array<{ key: string; label: string; color: string }> = [
  { key: "Potential", label: "Potensial", color: "#2f6fdf" },
  { key: "Belum Dihubungi", label: "Belum dihubungi", color: "#b7791f" },
  { key: "Sudah Dihubungi", label: "Sudah dihubungi", color: "#0e7490" },
  { key: "Negotiation", label: "Negosiasi", color: "#6d4fd8" },
  { key: "Scheduled Visit", label: "Terjadwal visit", color: "#4338ca" },
  { key: "Collaboration", label: "Kolaborasi", color: "#16a34a" },
  { key: "Completed", label: "Selesai", color: "#15803d" },
  { key: "Rejected", label: "Ditolak", color: "#d92d20" },
];
export const creatorStatus = (key: string) => CREATOR_STATUSES.find((s) => s.key === key) ?? { key, label: key, color: "#666672" };

export const VISIT_STATUS: Record<string, { label: string; color: string }> = {
  requested: { label: "Menunggu konfirmasi", color: "#b7791f" },
  confirmed: { label: "Terkonfirmasi", color: "#16a34a" },
  completed: { label: "Selesai", color: "#2f6fdf" },
  cancelled: { label: "Dibatalkan", color: "#666672" },
  no_show: { label: "Tidak hadir", color: "#d92d20" },
};
/** Perubahan status booking yang diizinkan (sama dengan server). */
export const VISIT_TRANSITIONS: Record<string, string[]> = { requested: ["confirmed", "cancelled"], confirmed: ["cancelled", "completed", "no_show"] };
export const VISIT_ACTION_LABEL: Record<string, string> = { confirmed: "Konfirmasi", cancelled: "Batalkan", completed: "Tandai selesai", no_show: "Tidak hadir" };

export const CAMPAIGN_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draf", color: "#666672" }, published: { label: "Dibuka", color: "#16a34a" }, closed: { label: "Ditutup", color: "#b7791f" }, archived: { label: "Arsip", color: "#444450" },
};
export const ASSIGNMENT_STATUS: Record<string, { label: string; color: string }> = {
  invited: { label: "Diundang", color: "#b7791f" }, accepted: { label: "Diterima", color: "#2f6fdf" }, declined: { label: "Menolak", color: "#d92d20" },
  active: { label: "Berjalan", color: "#6d4fd8" }, completed: { label: "Selesai", color: "#16a34a" }, cancelled: { label: "Dibatalkan", color: "#666672" },
};
export const SUBMISSION_STATUS: Record<string, { label: string; color: string }> = {
  submitted: { label: "Menunggu review", color: "#b7791f" }, needs_revision: { label: "Perlu revisi", color: "#6d4fd8" }, approved: { label: "Disetujui", color: "#16a34a" }, rejected: { label: "Ditolak", color: "#d92d20" },
};
export const INQUIRY_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: "Baru", color: "#2f6fdf" }, reviewing: { label: "Ditinjau", color: "#b7791f" }, contacted: { label: "Sudah dihubungi", color: "#0e7490" }, declined: { label: "Ditolak", color: "#d92d20" }, closed: { label: "Selesai", color: "#16a34a" },
};
export const REPORT_REASON: Record<string, string> = { spam: "Spam", privacy: "Melanggar privasi", misleading: "Menyesatkan", harassment: "Pelecehan", other: "Lainnya" };
export const POST_TYPE: Record<string, string> = { text: "Update", portfolio: "Karya", campaign: "Kampanye", achievement: "Pencapaian" };
/** Badge aktif dari tabel pos.kol_badges (sama dengan yang dipakai portal creator). */
export const BADGES: Array<{ code: string; label: string }> = [
  { code: "verified_creator", label: "Verified Creator" },
  { code: "active_partner", label: "Active Partner" },
  { code: "completed_collaboration", label: "Completed Collaboration" },
];
export const AVAILABILITY: Record<string, string> = { not_set: "Belum diatur", open: "Terbuka untuk kolaborasi", selective: "Campaign tertentu", unavailable: "Tidak tersedia" };

/* ---------- API ---------- */
type KolFunction = "kol-portal-admin" | "kol-public";
const endpoint = (fn: KolFunction) => `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/${fn}`;

export async function kolCall<T = any>(fn: KolFunction, action: string, token: string | null, payload: Record<string, unknown> = {}): Promise<T> {
  if (!token) throw new Error("Sesi admin tidak tersedia atau telah berakhir. Masuk ulang.");
  const response = await fetch(endpoint(fn), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(() => ({}));
  const detail = typeof body.error === "string" ? body.error : body.error?.message;
  if (!response.ok || body.error || body.success === false) throw new Error(detail || `Permintaan gagal (${response.status})`);
  return (body.data !== undefined ? body.data : body) as T;
}

/* ---------- Penyimpanan data bersama antar halaman ---------- */
type Snapshot = { at: number; overview: Overview; creators: Creator[] };
let cache: Snapshot | null = null;
const emptyOverview: Overview = { campaigns: [], assignments: [], submissions: [], badges: [], visits: [], inquiries: [], reports: [], sowVersions: [], settings: null, emails: [] };

export function useKolData() {
  const { token, isAdmin, role } = useYumiAuth();
  const canManage = Boolean(isAdmin || isAdminLevelRole(role?.name));
  const [snapshot, setSnapshot] = useState<Snapshot | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token || !canManage) { setLoading(false); return; }
    setError("");
    try {
      const [overview, creators] = await Promise.all([kolCall<Overview>("kol-portal-admin", "overview", token), kolCall<Creator[]>("kol-portal-admin", "creator_list", token)]);
      cache = { at: Date.now(), overview: { ...emptyOverview, ...overview }, creators };
      setSnapshot(cache);
    } catch (e) { setError(e instanceof Error ? e.message : "Data KOL belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [token, canManage]);

  useEffect(() => { if (!cache || Date.now() - cache.at > 20000) void load(); else setLoading(false); }, [load]);
  return { token, canManage, loading, error, overview: snapshot?.overview ?? emptyOverview, creators: snapshot?.creators ?? [], reload: load, ready: Boolean(snapshot) };
}

/* ---------- Pembantu ---------- */
export const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));
export const compact = (n: number) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
export const totalFollowers = (c: Creator) => (c.kol_platforms ?? []).reduce((sum, p) => sum + Number(p.followers || 0), 0);
const parseDay = (key: string) => { const [y = 0, m = 1, d = 1] = key.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayKey = () => dayKey(new Date());
export const fmtDay = (key?: string | null, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => (key ? parseDay(key).toLocaleDateString("id-ID", opts) : "—");
export const fmtTime = (t?: string | null) => (t ? String(t).slice(0, 5).replace(":", ".") : "");
export const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "—");
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : "—");
export function waUrl(phone?: string | null, text?: string) {
  const digits = String(phone ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits.startsWith("62") ? digits : `62${digits}`;
  return `https://wa.me/${normalized}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
export const profileUrl = (c: Pick<Creator, "username" | "profile">) => `https://kol.djiwatentram.web.id/${encodeURIComponent((c.profile?.slug || c.username || "").replace(/^@/, ""))}/profile`;
export const creatorLabel = (c: Creator) => c.profile?.display_name?.trim() || c.name;
export const atUsername = (username?: string | null) => `@${String(username ?? "").replace(/^@+/, "")}`;
export const KOL_PORTAL_URL = "https://kol.djiwatentram.web.id/";
const COLORS = ["#7c3aed", "#e11d48", "#0891b2", "#d97706", "#059669", "#db2777", "#2563eb"];
export const avatarColor = (text: string) => { let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
