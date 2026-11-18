import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { api, ApiError } from "../lib/api";
import { Empty, Kpis, Panel, Tabs } from "../ui";
import { BookingExtras, SowPanel, type EmailRow, type SowVersion, type VisitSettings } from "./KolSow";

/* ------------------------------------------------------------------ */
/* Tipe data — bentuknya disamakan dengan snapshot /api/manager/kol    */
/* ------------------------------------------------------------------ */
type Platform = { platform: string; username: string; followers: number; profile_url?: string | null };
type Contact = { whatsapp?: string | null; email?: string | null; manager_name?: string | null; manager_contact?: string | null };
type Creator = {
  source_id: string; name: string; username: string; avatar_url?: string | null; location: string; category: string; status: string;
  public_reason?: string | null; application_data?: { averageViews?: number; contentTypes?: string[]; profileUrl?: string; source?: string } | null;
  visit_booking_eligible: boolean; linked: boolean; created_at?: string | null;
  kol_platforms?: Platform[] | null; contact: Contact | null;
  profile: { slug?: string | null; display_name?: string | null; bio?: string | null; is_public?: boolean | null; public_availability?: string | null } | null;
};
type Campaign = {
  id: number; slug: string; title: string; description: string; location?: string | null;
  benefit_description: string; deliverable_summary: string;
  application_deadline?: string | null; start_date?: string | null; end_date?: string | null; status: string; created_at?: string | null;
};
type Assignment = {
  id: number; campaign_id: number; kol_id: string; status: string; admin_note?: string | null;
  accepted_at?: string | null; completed_at?: string | null; created_at?: string | null;
  kol_creators?: { name: string; username: string } | null;
};
type Submission = {
  id: number; campaign_assignment_id: number; deliverable_type: string; content_url: string;
  insight_screenshot_url?: string | null; status: string; review_note?: string | null; created_at?: string | null;
  kol_campaign_assignments?: {
    id: number; kol_id: string; campaign_id: number;
    kol_creators?: { name: string; username: string } | null;
    kol_campaigns?: { title: string } | null;
  } | null;
};
type Badge = { kol_id: string; kol_badges?: { code: string; name: string } | null };
type Visit = {
  id: number; kol_id: string; booking_date: string; booking_time: string | null; status: string;
  admin_note?: string | null; visit_note?: string | null;
  consent_version?: string | null; consented_at?: string | null; created_at?: string | null; updated_at?: string | null;
  sow_version?: number | null; sow_snapshot?: { title: string; sections: Array<{ title: string; items: string[] }>; closing?: string; days?: number } | null; sow_customized?: boolean; post_deadline?: string | null;
  kol_creators?: { name: string; username: string; avatar_url?: string | null; kol_private_contacts?: Contact | Contact[] | null } | null;
};
type Inquiry = {
  id: number; kol_id: string; business_name: string; contact_name: string;
  contact_email?: string | null; contact_phone?: string | null; brief: string;
  preferred_contact: string; status: string; admin_note?: string | null; created_at: string;
  kol_creators?: { name: string; username: string } | null;
};
type Report = {
  id: number; post_id: number; reporter_kol_id: string; reason: string; note?: string | null; status: string; created_at: string;
  kol_public_posts?: {
    id: number; kol_id: string; post_type: string; title: string; body: string; media_url?: string | null;
    visibility: string; moderation_status: string;
    kol_creators?: { name: string; username: string } | null;
  } | null;
};
type Invite = {
  id: string; kol_id: string; status: string; expires_at: string; created_at: string; updated_at?: string | null;
  linked_auth_user_id?: string | null; kol_creators?: { name: string; username: string } | null;
};
type Snapshot = {
  campaigns: Campaign[]; assignments: Assignment[]; submissions: Submission[]; badges: Badge[];
  visits: Visit[]; inquiries: Inquiry[]; reports: Report[]; creators: Creator[]; invites: Invite[];
  sowVersions: SowVersion[]; settings: VisitSettings | null; emails: EmailRow[];
};
type Tab = "ringkasan" | "creator" | "kampanye" | "visit" | "komunitas" | "inquiry";
type Send = (body: Record<string, unknown>, message?: string) => Promise<{ ok: boolean; data: unknown }>;

/* ------------------------------------------------------------------ */
/* Aturan status — sama dengan apps/kol, admin, dan auth-server        */
/* ------------------------------------------------------------------ */
const CREATOR_STATUS: Record<string, [string, string]> = {
  Potential: ["Potensial", "ai"],
  "Belum Dihubungi": ["Belum dihubungi", "md"],
  "Sudah Dihubungi": ["Sudah dihubungi", "ai"],
  Negotiation: ["Negosiasi", "ai"],
  "Scheduled Visit": ["Terjadwal visit", "ai"],
  Collaboration: ["Kolaborasi", "ok"],
  Completed: ["Selesai", "ok"],
  Rejected: ["Ditolak", "hi"],
};
const CREATOR_ORDER = Object.keys(CREATOR_STATUS);
const CAMPAIGN_STATUS: Record<string, [string, string]> = { draft: ["Draf", ""], published: ["Dibuka", "ok"], closed: ["Ditutup", "md"], archived: ["Arsip", ""] };
const ASSIGNMENT_STATUS: Record<string, [string, string]> = {
  invited: ["Diundang", "md"], accepted: ["Diterima", "ai"], declined: ["Menolak", "hi"],
  active: ["Berjalan", "ai"], completed: ["Selesai", "ok"], cancelled: ["Dibatalkan", ""],
};
const SUBMISSION_STATUS: Record<string, [string, string]> = {
  submitted: ["Menunggu review", "md"], needs_revision: ["Perlu revisi", "ai"], approved: ["Disetujui", "ok"], rejected: ["Ditolak", "hi"],
};
const VISIT_STATUS: Record<string, [string, string]> = {
  requested: ["Menunggu konfirmasi", "md"], confirmed: ["Terkonfirmasi", "ok"], completed: ["Selesai", "ai"],
  cancelled: ["Dibatalkan", ""], no_show: ["Tidak hadir", "hi"],
};
const VISIT_TRANSITIONS: Record<string, string[]> = { requested: ["confirmed", "cancelled"], confirmed: ["cancelled", "completed", "no_show"] };
const VISIT_ACTION: Record<string, string> = { confirmed: "Konfirmasi", cancelled: "Batalkan", completed: "Tandai selesai", no_show: "Tidak hadir" };
const INQUIRY_STATUS: Record<string, [string, string]> = {
  new: ["Baru", "ai"], reviewing: ["Ditinjau", "md"], contacted: ["Sudah dihubungi", "ai"], declined: ["Ditolak", "hi"], closed: ["Selesai", "ok"],
};
const INVITE_STATUS: Record<string, [string, string]> = {
  created: ["Dibuat", "md"], opened: ["Dibuka", "ai"], authenticated: ["Login", "ai"], linked: ["Tertaut", "ai"],
  schedule_selected: ["Pilih jadwal", "ai"], confirmed: ["Terkonfirmasi", "ok"], expired: ["Kedaluwarsa", ""],
  revoked: ["Dicabut", "hi"], needs_review: ["Perlu ditinjau", "hi"],
};
const REPORT_REASON: Record<string, string> = { spam: "Spam", privacy: "Melanggar privasi", misleading: "Menyesatkan", harassment: "Pelecehan", other: "Lainnya" };
const POST_TYPE: Record<string, string> = { text: "Update", portfolio: "Karya", campaign: "Kampanye", achievement: "Pencapaian" };
const BADGES: [string, string][] = [
  ["verified_creator", "Verified Creator"],
  ["active_partner", "Active Partner"],
  ["completed_collaboration", "Completed Collaboration"],
];
const AVAILABILITY: Record<string, string> = { not_set: "Belum diatur", open: "Terbuka untuk kolaborasi", selective: "Kampanye tertentu", unavailable: "Tidak tersedia" };
const PREFERRED: Record<string, string> = { email: "Email", phone: "Telepon", either: "Email atau telepon" };

/* ------------------------------------------------------------------ */
/* Pembantu format                                                     */
/* ------------------------------------------------------------------ */
const ERR: Record<string, string> = {
  UNAUTHORIZED: "Sesi berakhir. Masuk ulang.",
  FORBIDDEN: "Modul KOL hanya untuk peran Manager.",
  CREATOR_NOT_FOUND: "Creator tidak ditemukan.",
  CREATOR_NOT_ELIGIBLE: "Creator ini tidak bisa diundang (mungkin ditolak).",
  CREATOR_HAS_REFERENCES: "Creator masih punya inquiry. Tutup atau selesaikan inquiry-nya dulu.",
  CREATOR_HAS_ACTIVE_INVITE: "Undangan sebelumnya masih aktif.",
  REJECTED_CREATOR_CANNOT_BOOK: "Creator berstatus Ditolak tidak bisa diizinkan booking.",
  INVALID_CREATOR_STATUS: "Status creator tidak valid.",
  INVALID_ELIGIBILITY: "Data izin booking tidak valid.",
  BADGE_NOT_FOUND: "Badge tidak ditemukan atau tidak aktif.",
  INVITE_NOT_FOUND: "Undangan tidak ditemukan.",
  INVALID_EXPIRY: "Masa berlaku undangan tidak valid.",
  CREATOR_REQUIRED: "Pilih creator lebih dulu.",
  CAMPAIGN_SLUG_TITLE_REQUIRED: "Judul kampanye wajib diisi.",
  INVALID_ASSIGNMENT: "Data undangan kampanye tidak valid.",
  INVALID_SUBMISSION_REVIEW: "Review bukti tidak valid.",
  SUBMISSION_NOT_FOUND: "Bukti konten tidak ditemukan.",
  INVALID_INQUIRY_STATUS: "Status inquiry tidak valid.",
  INQUIRY_NOT_FOUND: "Inquiry tidak ditemukan.",
  INVALID_BOOKING_UPDATE: "Perubahan visit tidak valid.",
  BOOKING_NOT_FOUND: "Pengajuan visit tidak ditemukan.",
  INVALID_STATUS_TRANSITION: "Transisi status visit ini tidak diizinkan.",
  INVALID_MODERATION_DECISION: "Keputusan moderasi tidak valid.",
  REPORT_NOT_FOUND: "Laporan tidak ditemukan.",
  SOW_SECTIONS_INVALID: "SOW harus punya 1 sampai 12 bagian.",
  SOW_SECTION_INVALID: "Tiap bagian SOW butuh judul dan 1 sampai 40 poin.",
  SOW_ITEM_INVALID: "Tiap poin SOW harus berisi teks (maksimal 500 karakter).",
  SOW_TITLE_INVALID: "Judul SOW harus 2 sampai 160 karakter.",
  SOW_NOT_FOUND: "Belum ada SOW aktif.",
  EMAIL_KIND_INVALID: "Jenis email tidak valid.",
  INVALID_MAPS_URL: "Link Google Maps harus diawali https://",
  INVALID_DEADLINE_DAYS: "Batas tayang harus 1 sampai 60 hari.",
  UNKNOWN_ACTION: "Aksi tidak dikenal.",
};
const errText = (e: unknown) => {
  const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : "";
  return ERR[code] || code || "Perubahan belum tersimpan.";
};
const compact = (n: number) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const totalFollowers = (c: Creator) => (c.kol_platforms ?? []).reduce((sum, p) => sum + Number(p.followers || 0), 0);
const creatorLabel = (c: Creator) => c.profile?.display_name?.trim() || c.name;
const atUsername = (u?: string | null) => `@${String(u ?? "").replace(/^@+/, "")}`;
const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));
const dayDate = (key: string) => {
  const [y = "0", m = "1", d = "1"] = key.slice(0, 10).split("-");
  return new Date(Number(y), Number(m) - 1, Number(d));
};
const fmtDay = (key?: string | null) => (key ? dayDate(key).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }) : "—");
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : "—");
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "—");
const fmtTime = (t?: string | null) => (t ? String(t).slice(0, 5).replace(":", ".") : "");
/* Kalender visit — Senin sebagai hari pertama, tanggal lokal (bukan UTC). */
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthKey = (d: Date) => dateKey(d).slice(0, 7);
const todayKey = () => dateKey(new Date());
const monthTitle = (key: string) => dayDate(`${key}-01`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
const shiftMonth = (key: string, delta: number) => {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
};
const monthCells = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const start = new Date(y, m - 1, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: dateKey(d), day: d.getDate(), inMonth: d.getMonth() === m - 1 };
  });
};
const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const VISIT_TONE: Record<string, string> = { requested: "md", confirmed: "ok", completed: "ai", cancelled: "off", no_show: "hi" };
const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
const waUrl = (phone?: string | null, text?: string) => {
  const digits = String(phone ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits.startsWith("62") ? digits : `62${digits}`;
  return `https://wa.me/${normalized}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};
const profileUrl = (c: Pick<Creator, "username" | "profile">) =>
  `https://kol.djiwatentram.web.id/${encodeURIComponent((c.profile?.slug || c.username || "").replace(/^@/, ""))}/profile`;

function St({ map, k }: { map: Record<string, [string, string]>; k: string }) {
  const meta = map[k];
  return <span className={`tg ${meta?.[1] ?? ""}`}>{meta?.[0] ?? k}</span>;
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <label style={{ margin: "0 0 4px" }}>{k}</label>
      <div style={{ fontSize: 12.5 }}>{v}</div>
    </div>
  );
}

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Tautan disalin");
  } catch {
    toast.error("Gagal menyalin. Salin manual dari kolom tautan.");
  }
};

/* ------------------------------------------------------------------ */
/* Halaman utama                                                       */
/* ------------------------------------------------------------------ */
const TAB_ITEMS: [Tab, string][] = [
  ["ringkasan", "Ringkasan"],
  ["creator", "Creator"],
  ["kampanye", "Kampanye"],
  ["visit", "Visit"],
  ["komunitas", "Komunitas"],
  ["inquiry", "Inquiry"],
];

export function KolView() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [focus, setFocus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const res = await api<{ success: boolean; data: Snapshot }>("/api/manager/kol");
      setData(res.data);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const send = useCallback<Send>(async (body, message) => {
    try {
      const res = await api<{ success?: boolean; data?: unknown }>("/api/manager/kol", { method: "POST", body });
      if (message) toast.success(message);
      await load();
      return { ok: true, data: res?.data ?? null };
    } catch (e) {
      toast.error(errText(e));
      return { ok: false, data: null };
    }
  }, [load]);

  const go = (next: Tab, creatorId?: string) => {
    setFocus(creatorId ?? null);
    setTab(next);
  };

  return (
    <div className="koltabs">
      <Tabs items={TAB_ITEMS} value={tab} onChange={(v) => { setFocus(null); setTab(v); }} style={{ margin: 0 }} />
      {error && (
        <Panel title="Koneksi data KOL" meta="Gagal memuat" action={<button className="btn s" onClick={() => void load()}>Coba lagi</button>}>
          <div className="pad" style={{ fontSize: 12.5 }}>{error}</div>
        </Panel>
      )}
      {loading && !data && <div className="empty">MEMUAT DATA KOL…</div>}
      {data && tab === "ringkasan" && <RingkasanView data={data} onGo={go} />}
      {data && tab === "creator" && <CreatorView key={focus ?? "all"} data={data} send={send} initial={focus} onReload={load} />}
      {data && tab === "kampanye" && <KampanyeView data={data} send={send} onReload={load} />}
      {data && tab === "visit" && <VisitView data={data} send={send} />}
      {data && tab === "komunitas" && <KomunitasView data={data} send={send} />}
      {data && tab === "inquiry" && <InquiryView data={data} send={send} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ringkasan                                                           */
/* ------------------------------------------------------------------ */
function RingkasanView({ data, onGo }: { data: Snapshot; onGo: (tab: Tab, creatorId?: string) => void }) {
  const followers = data.creators.reduce((sum, c) => sum + totalFollowers(c), 0);
  const queue: { n: number; l: string; tab: Tab; s: string }[] = [
    { n: data.visits.filter((v) => v.status === "requested").length, l: "Visit menunggu konfirmasi", tab: "visit", s: "Konfirmasi atau batalkan jadwal creator" },
    { n: data.submissions.filter((s) => s.status === "submitted").length, l: "Bukti konten menunggu review", tab: "kampanye", s: "Setujui, minta revisi, atau tolak" },
    { n: data.reports.length, l: "Laporan komunitas terbuka", tab: "komunitas", s: "Sembunyikan postingan atau abaikan laporan" },
    { n: data.inquiries.filter((i) => i.status === "new").length, l: "Inquiry kolaborasi baru", tab: "inquiry", s: "Tindak lanjuti permintaan brand/klien" },
  ];
  const recent = [...data.creators].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))).slice(0, 6);
  const upcoming = data.visits
    .filter((v) => v.status === "requested" || v.status === "confirmed")
    .sort((a, b) => String(a.booking_date).localeCompare(String(b.booking_date)))
    .slice(0, 5);

  return (
    <>
      <Kpis items={[
        { v: data.creators.length, l: "Creator terdaftar", s: `${data.creators.filter((c) => c.linked).length} sudah login` },
        { v: compact(followers), l: "Total jangkauan", s: "jumlah follower platform" },
        { v: data.campaigns.filter((c) => c.status === "published").length, l: "Kampanye dibuka", s: `${data.campaigns.length} total kampanye` },
        { v: data.assignments.filter((a) => a.status === "active" || a.status === "accepted").length, l: "Kolaborasi berjalan", s: `${data.badges.length} badge diberikan` },
      ]} />

      <div className="row2">
        <Panel title="Antrean kerja" meta="yang perlu ditindaklanjuti">
          <div className="sc">
            {queue.map((q) => (
              <div key={q.l} className="mr">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 550 }}>{q.l}</div>
                  <div className="meta">{q.s}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`tg ${q.n > 0 ? "md" : ""}`}>{q.n}</span>
                  <button className="btn s" onClick={() => onGo(q.tab)}>Buka</button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Visit terdekat" meta={`${upcoming.length} jadwal`}>
          <div className="sc">
            {upcoming.length === 0 && <Empty>BELUM ADA JADWAL VISIT</Empty>}
            {upcoming.map((v) => (
              <div key={v.id} className="mr">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 550 }}>{v.kol_creators?.name ?? v.kol_id}</div>
                  <div className="meta">{fmtDay(v.booking_date)}{v.booking_time ? ` · ${fmtTime(v.booking_time)}` : ""}</div>
                </div>
                <St map={VISIT_STATUS} k={v.status} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel fill title="Creator terbaru" meta={`${data.creators.length} creator`} action={<button className="btn s" onClick={() => onGo("creator")}>Lihat semua</button>}>
        <div className="sc">
          <table>
            <thead><tr><th>Creator</th><th>Kategori</th><th>Jangkauan</th><th>Status</th><th>Booking visit</th></tr></thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.source_id} style={{ cursor: "pointer" }} onClick={() => onGo("creator", c.source_id)}>
                  <td><b>{creatorLabel(c)}</b><div className="meta">{atUsername(c.username)}</div></td>
                  <td>{c.category || "—"}<div className="meta">{c.location || "—"}</div></td>
                  <td className="mono">{compact(totalFollowers(c))}</td>
                  <td><St map={CREATOR_STATUS} k={c.status} /></td>
                  <td><span className={`tg ${c.visit_booking_eligible ? "ok" : ""}`}>{c.visit_booking_eligible ? "Diizinkan" : "Belum"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.length === 0 && <Empty>BELUM ADA CREATOR</Empty>}
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Creator                                                             */
/* ------------------------------------------------------------------ */
function CreatorView({ data, send, initial, onReload }: {
  data: Snapshot; send: Send; initial: string | null; onReload: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [visit, setVisit] = useState<"all" | "eligible" | "blocked">("all");
  const [openId, setOpenId] = useState<string | null>(initial);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    return data.creators.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (visit === "eligible" && !c.visit_booking_eligible) return false;
      if (visit === "blocked" && c.visit_booking_eligible) return false;
      if (!q) return true;
      return [c.name, c.username, creatorLabel(c), c.category, c.location, ...(c.kol_platforms ?? []).map((p) => p.username)]
        .join(" ").toLowerCase().includes(q);
    });
  }, [data.creators, query, status, visit]);

  const open = data.creators.find((c) => c.source_id === openId) ?? null;

  return (
    <>
      <Panel
        title="Creator"
        meta={`${filtered.length} dari ${data.creators.length}`}
        action={<button className="btn s" onClick={() => void onReload()}>Muat ulang</button>}
      >
        <div className="pad" style={{ paddingBottom: 10 }}>
          <div className="crow" style={{ marginTop: 0 }}>
            <input className="f" style={{ flex: 1, minWidth: 180 }} placeholder="Cari nama, username, kategori, atau lokasi" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="f" style={{ width: 170 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Semua status</option>
              {CREATOR_ORDER.map((k) => <option key={k} value={k}>{CREATOR_STATUS[k]?.[0] ?? k}</option>)}
            </select>
            <select className="f" style={{ width: 180 }} value={visit} onChange={(e) => setVisit(e.target.value as typeof visit)}>
              <option value="all">Semua booking visit</option>
              <option value="eligible">Boleh booking</option>
              <option value="blocked">Belum diizinkan</option>
            </select>
          </div>
        </div>
        <div className="sc">
          <table>
            <thead><tr><th>Creator</th><th>Kategori / lokasi</th><th>Jangkauan</th><th>Status</th><th>Booking visit</th><th /></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.source_id}>
                  <td>
                    <b>{creatorLabel(c)}</b>
                    {c.linked && <span className="tg ok" style={{ marginLeft: 6 }}>login</span>}
                    <div className="meta">{atUsername(c.username)}{c.profile?.is_public ? " · publik" : ""}</div>
                  </td>
                  <td>{c.category || "Tanpa kategori"}<div className="meta">{c.location || "—"}</div></td>
                  <td className="mono">{compact(totalFollowers(c))}</td>
                  <td><St map={CREATOR_STATUS} k={c.status} /></td>
                  <td><span className={`tg ${c.visit_booking_eligible ? "ok" : ""}`}>{c.visit_booking_eligible ? "Diizinkan" : "Belum"}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn s" onClick={() => setOpenId(c.source_id === openId ? null : c.source_id)}>{c.source_id === openId ? "Tutup" : "Kelola"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <Empty>TIDAK ADA CREATOR YANG COCOK</Empty>}
        </div>
      </Panel>

      {open && <CreatorDetail key={open.source_id} creator={open} data={data} send={send} onClose={() => setOpenId(null)} />}
    </>
  );
}

function CreatorDetail({ creator, data, send, onClose }: { creator: Creator; data: Snapshot; send: Send; onClose: () => void }) {
  const contact = creator.contact ?? {};
  const [status, setStatus] = useState(creator.status);
  const [note, setNote] = useState(creator.public_reason ?? "");
  const [badge, setBadge] = useState(BADGES[0]?.[0] ?? "");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(false);

  const awarded = new Set(data.badges.filter((b) => b.kol_id === creator.source_id).map((b) => b.kol_badges?.code).filter((x): x is string => Boolean(x)));
  const visits = data.visits.filter((v) => v.kol_id === creator.source_id).slice(0, 6);
  const wa = waUrl(contact.whatsapp, `Halo ${creatorLabel(creator)}, kami dari Djiwa Tentram.`);

  const saveStatus = async () => {
    setBusy("status");
    await send({ action: "creator_status", id: creator.source_id, status }, "Status creator diperbarui");
    setBusy("");
  };
  const setEligibility = async (eligible: boolean) => {
    setBusy("elig");
    await send({ action: "creator_eligibility", kolId: creator.source_id, eligible, note }, eligible ? "Creator diizinkan booking visit" : "Izin booking dicabut");
    setBusy("");
  };
  const award = async () => {
    if (!badge) return;
    setBusy("badge");
    await send({ action: "badge_award", kolId: creator.source_id, code: badge }, "Badge diberikan");
    setBusy("");
  };
  const invite = async () => {
    setBusy("invite");
    const res = await send({ action: "invite_create", kolId: creator.source_id }, "Undangan visit dibuat");
    const payload = res.data as { inviteUrl?: string } | null;
    if (payload?.inviteUrl) setInviteUrl(payload.inviteUrl);
    setBusy("");
  };
  const destroy = async () => {
    setBusy("delete");
    const res = await send({ action: "creator_delete", id: creator.source_id }, "Creator dihapus");
    setBusy("");
    if (res.ok) onClose();
  };

  return (
    <Panel
      title={creatorLabel(creator)}
      meta={`${atUsername(creator.username)} · ${creator.status}`}
      action={<button className="btn s" onClick={onClose}>Tutup</button>}
    >
      <div className="pad">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
          <KV k="Kategori" v={creator.category || "—"} />
          <KV k="Lokasi" v={creator.location || "—"} />
          <KV k="Jangkauan" v={<span className="mono">{compact(totalFollowers(creator))} follower</span>} />
          <KV k="Terdaftar" v={fmtDate(creator.created_at)} />
          <KV k="Profil publik" v={creator.profile?.is_public ? (AVAILABILITY[creator.profile.public_availability ?? "not_set"] ?? "Publik") : "Belum publik"} />
          <KV k="Kontak" v={
            <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {contact.whatsapp && wa && <a className="btn s" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
              {contact.email && <a className="btn s" href={`mailto:${contact.email}`}>{contact.email}</a>}
              {!contact.whatsapp && !contact.email && "—"}
            </span>
          } />
          <KV k="Tautan" v={<a className="btn s" href={profileUrl(creator)} target="_blank" rel="noreferrer">Profil KOL</a>} />
        </div>

        {creator.application_data && (
          <div className="box" style={{ marginTop: 12 }}>
            <b style={{ fontSize: 12 }}>Data pendaftaran</b>
            <div className="meta" style={{ marginTop: 4 }}>
              {creator.application_data.averageViews ? `Rata-rata view ${compact(creator.application_data.averageViews)} · ` : ""}
              {(creator.application_data.contentTypes ?? []).join(", ") || "Tipe konten belum diisi"}
            </div>
          </div>
        )}

        <div className="row2" style={{ marginTop: 14 }}>
          <div>
            <label style={{ marginTop: 0 }}>Status pipeline</label>
            <div className="crow" style={{ marginTop: 0 }}>
              <select className="f" style={{ flex: 1, minWidth: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
                {CREATOR_ORDER.map((k) => <option key={k} value={k}>{CREATOR_STATUS[k]?.[0] ?? k}</option>)}
              </select>
              <button className="btn p s" disabled={busy === "status" || status === creator.status} onClick={() => void saveStatus()}>Simpan</button>
            </div>
          </div>
          <div>
            <label style={{ marginTop: 0 }}>Badge</label>
            <div className="crow" style={{ marginTop: 0 }}>
              <select className="f" style={{ flex: 1, minWidth: 150 }} value={badge} onChange={(e) => setBadge(e.target.value)}>
                {BADGES.map(([code, label]) => <option key={code} value={code}>{label}{awarded.has(code) ? " ✓" : ""}</option>)}
              </select>
              <button className="btn s" disabled={busy === "badge"} onClick={() => void award()}>Beri badge</button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ marginTop: 0 }}>Izin booking visit</label>
          <div className="crow" style={{ marginTop: 0 }}>
            <span className={`tg ${creator.visit_booking_eligible ? "ok" : ""}`}>{creator.visit_booking_eligible ? "Diizinkan" : "Belum diizinkan"}</span>
            <button className="btn s p" disabled={busy === "elig" || creator.visit_booking_eligible} onClick={() => void setEligibility(true)}>Izinkan</button>
            <button className="btn s" disabled={busy === "elig" || !creator.visit_booking_eligible} onClick={() => void setEligibility(false)}>Cabut izin</button>
            <input className="f" style={{ flex: 1, minWidth: 180 }} placeholder="Catatan kelayakan (opsional)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </div>
          {creator.public_reason && <div className="meta" style={{ marginTop: 6 }}>Alasan publik: {creator.public_reason}</div>}
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ marginTop: 0 }}>Undangan visit</label>
          <div className="crow" style={{ marginTop: 0 }}>
            <button className="btn s p" disabled={busy === "invite"} onClick={() => void invite()}>{busy === "invite" ? "Membuat…" : "Buat undangan (7 hari)"}</button>
            <span className="meta">Tautan dikirim manual ke creator; hanya tampil sekali di sini.</span>
          </div>
          {inviteUrl && (
            <div className="crow" style={{ marginTop: 8 }}>
              <input className="f" readOnly value={inviteUrl} style={{ flex: 1, minWidth: 200 }} />
              <button className="btn s" onClick={() => void copyText(inviteUrl)}>Salin</button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ marginTop: 0 }}>Visit creator ini</label>
          {visits.length === 0 && <div className="meta">Belum ada pengajuan visit.</div>}
          {visits.map((v) => (
            <div key={v.id} className="mr" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <div>
                <b style={{ fontSize: 12 }}>{fmtDay(v.booking_date)}{v.booking_time ? ` · ${fmtTime(v.booking_time)}` : ""}</b>
                <div className="meta">{v.admin_note || v.visit_note || "Tanpa catatan"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <St map={VISIT_STATUS} k={v.status} />
                <VisitButtons visit={v} onUpdate={(next) => void send({ action: "visit_update", id: v.id, status: next }, "Status visit diperbarui")} />
              </div>
            </div>
          ))}
        </div>

        <div className="crow" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          {!confirm && <button className="btn s r" disabled={busy === "delete"} onClick={() => setConfirm(true)}>Hapus creator</button>}
          {confirm && (
            <>
              <span className="meta">Hapus permanen profil, kontak, dan riwayat creator?</span>
              <button className="btn s" onClick={() => setConfirm(false)}>Batal</button>
              <button className="btn s r" disabled={busy === "delete"} onClick={() => void destroy()}>{busy === "delete" ? "Menghapus…" : "Ya, hapus"}</button>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

function VisitButtons({ visit, onUpdate }: { visit: Visit; onUpdate: (status: string) => void }) {
  const next = VISIT_TRANSITIONS[visit.status] ?? [];
  if (next.length === 0) return null;
  return (
    <>
      {next.map((s) => (
        <button key={s} className={`btn s${s === "cancelled" || s === "no_show" ? "" : " p"}`} onClick={() => onUpdate(s)}>
          {VISIT_ACTION[s] ?? s}
        </button>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Kampanye                                                            */
/* ------------------------------------------------------------------ */
function KampanyeView({ data, send, onReload }: { data: Snapshot; send: Send; onReload: () => Promise<void> }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<number | "new" | null>(null);

  const assignmentsBy = useMemo(() => {
    const map = new Map<number, Assignment[]>();
    for (const a of data.assignments) map.set(a.campaign_id, [...(map.get(a.campaign_id) ?? []), a]);
    return map;
  }, [data.assignments]);

  const submissionsBy = useMemo(() => {
    const map = new Map<number, Submission[]>();
    for (const s of data.submissions) {
      const campaignId = s.kol_campaign_assignments?.campaign_id;
      if (!campaignId) continue;
      map.set(campaignId, [...(map.get(campaignId) ?? []), s]);
    }
    return map;
  }, [data.submissions]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.campaigns.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      return [c.title, c.slug, c.description, c.location].join(" ").toLowerCase().includes(q);
    });
  }, [data.campaigns, filter, query]);

  const editingCampaign = typeof editing === "number" ? data.campaigns.find((c) => c.id === editing) ?? null : null;

  return (
    <>
      <Panel
        title="Kampanye"
        meta={`${rows.length} dari ${data.campaigns.length}`}
        action={<div style={{ display: "flex", gap: 6 }}>
          <button className="btn s p" onClick={() => setEditing("new")}>+ Kampanye</button>
          <button className="btn s" onClick={() => void onReload()}>Muat ulang</button>
        </div>}
      >
        <div className="pad" style={{ paddingBottom: 10 }}>
          <div className="crow" style={{ marginTop: 0 }}>
            <input className="f" style={{ flex: 1, minWidth: 180 }} placeholder="Cari judul, slug, atau lokasi" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="f" style={{ width: 160 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Semua status</option>
              {Object.entries(CAMPAIGN_STATUS).map(([k, m]) => <option key={k} value={k}>{m[0]}</option>)}
            </select>
          </div>
        </div>
        <div className="sc">
          <table>
            <thead><tr><th>Kampanye</th><th>Status</th><th>Creator</th><th>Bukti</th><th>Tenggat</th><th /></tr></thead>
            <tbody>
              {rows.map((c) => {
                const assignments = (assignmentsBy.get(c.id) ?? []).filter((a) => a.status !== "cancelled");
                const submissions = submissionsBy.get(c.id) ?? [];
                const pending = submissions.filter((s) => s.status === "submitted").length;
                return (
                  <tr key={c.id}>
                    <td><b>{c.title}</b><div className="meta">{c.slug}{c.location ? ` · ${c.location}` : ""}</div></td>
                    <td>
                      <St map={CAMPAIGN_STATUS} k={c.status} />
                      {pending > 0 && <span className="tg md" style={{ marginLeft: 6 }}>{pending} bukti baru</span>}
                    </td>
                    <td className="mono">{assignments.length}</td>
                    <td className="mono">{submissions.length}</td>
                    <td>{c.end_date ? fmtDate(c.end_date) : "—"}</td>
                    <td><button className="btn s" onClick={() => setEditing(c.id)}>Kelola</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>BELUM ADA KAMPANYE</Empty>}
        </div>
      </Panel>

      {editing !== null && (
        <CampaignDetail
          key={editingCampaign?.id ?? "new"}
          campaign={editingCampaign}
          data={data}
          assignments={editingCampaign ? assignmentsBy.get(editingCampaign.id) ?? [] : []}
          submissions={editingCampaign ? submissionsBy.get(editingCampaign.id) ?? [] : []}
          send={send}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CampaignDetail({ campaign, data, assignments, submissions, send, onClose }: {
  campaign: Campaign | null; data: Snapshot; assignments: Assignment[]; submissions: Submission[]; send: Send; onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: campaign?.title ?? "",
    slug: campaign?.slug ?? "",
    description: campaign?.description ?? "",
    benefitDescription: campaign?.benefit_description ?? "",
    deliverableSummary: campaign?.deliverable_summary ?? "",
    location: campaign?.location ?? "",
    applicationDeadline: campaign?.application_deadline?.slice(0, 10) ?? "",
    startDate: campaign?.start_date?.slice(0, 10) ?? "",
    endDate: campaign?.end_date?.slice(0, 10) ?? "",
    status: campaign?.status ?? "draft",
  });
  const [assignId, setAssignId] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [busy, setBusy] = useState("");

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const assignedIds = new Set(assignments.filter((a) => a.status !== "cancelled").map((a) => a.kol_id));
  const available = useMemo(
    () => data.creators.filter((c) => !assignedIds.has(c.source_id)).sort((a, b) => totalFollowers(b) - totalFollowers(a)),
    [data.creators, assignedIds],
  );

  const save = async () => {
    if (!form.title.trim()) { toast.error("Judul kampanye wajib diisi"); return; }
    setBusy("save");
    const res = await send({
      action: "campaign_save",
      ...(campaign ? { id: campaign.id } : {}),
      ...form,
      slug: form.slug.trim() || slugify(form.title),
    }, campaign ? "Kampanye diperbarui" : "Kampanye dibuat");
    setBusy("");
    if (res.ok && !campaign) onClose();
  };

  const assign = async () => {
    if (!campaign || !assignId) return;
    setBusy("assign");
    await send({ action: "campaign_assign", campaignId: campaign.id, kolId: assignId, note: assignNote }, "Creator diundang ke kampanye");
    setAssignId("");
    setAssignNote("");
    setBusy("");
  };

  return (
    <Panel
      title={campaign ? campaign.title : "Kampanye baru"}
      meta={campaign ? `slug ${campaign.slug}` : "dibuat sebagai draf"}
      action={<div style={{ display: "flex", gap: 6 }}>
        <button className="btn s" onClick={onClose}>Tutup</button>
        <button className="btn s p" disabled={busy === "save"} onClick={() => void save()}>{busy === "save" ? "Menyimpan…" : campaign ? "Simpan" : "Buat"}</button>
      </div>}
    >
      <div className="pad">
        <div className="row2">
          <div><label style={{ marginTop: 0 }}>Judul</label><input className="f" value={form.title} maxLength={160} onChange={(e) => set("title", e.target.value)} /></div>
          <div><label style={{ marginTop: 0 }}>Slug</label><input className="f" value={form.slug} maxLength={120} placeholder={slugify(form.title) || "visit-review-menu"} onChange={(e) => set("slug", e.target.value)} /></div>
          <div>
            <label style={{ marginTop: 0 }}>Status</label>
            <select className="f" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(CAMPAIGN_STATUS).map(([k, m]) => <option key={k} value={k}>{m[0]}</option>)}
            </select>
          </div>
          <div><label style={{ marginTop: 0 }}>Lokasi</label><input className="f" value={form.location} maxLength={160} onChange={(e) => set("location", e.target.value)} /></div>
          <div><label style={{ marginTop: 0 }}>Tenggat pendaftaran</label><input className="f" type="date" value={form.applicationDeadline} onChange={(e) => set("applicationDeadline", e.target.value)} /></div>
          <div><label style={{ marginTop: 0 }}>Mulai</label><input className="f" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>
          <div><label style={{ marginTop: 0 }}>Selesai</label><input className="f" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} /></div>
        </div>
        <label>Benefit</label>
        <textarea className="f" rows={2} value={form.benefitDescription} maxLength={1000} onChange={(e) => set("benefitDescription", e.target.value)} />
        <label>Ringkasan deliverable</label>
        <textarea className="f" rows={2} value={form.deliverableSummary} maxLength={2000} onChange={(e) => set("deliverableSummary", e.target.value)} />
        <label>Deskripsi</label>
        <textarea className="f" rows={3} value={form.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} />
      </div>

      {campaign && (
        <div className="pad" style={{ borderTop: "1px solid var(--line)" }}>
          <label style={{ marginTop: 0 }}>Undang creator</label>
          <div className="crow" style={{ marginTop: 0 }}>
            <select className="f" style={{ flex: 1, minWidth: 180 }} value={assignId} onChange={(e) => setAssignId(e.target.value)}>
              <option value="">Pilih creator…</option>
              {available.map((c) => <option key={c.source_id} value={c.source_id}>{creatorLabel(c)} · {atUsername(c.username)}</option>)}
            </select>
            <input className="f" style={{ flex: 1, minWidth: 160 }} placeholder="Catatan untuk creator (opsional)" value={assignNote} maxLength={1000} onChange={(e) => setAssignNote(e.target.value)} />
            <button className="btn s p" disabled={!assignId || busy === "assign"} onClick={() => void assign()}>Undang</button>
          </div>

          <label>Creator di kampanye ini</label>
          {assignments.length === 0 && <div className="meta">Belum ada creator yang diundang.</div>}
          {assignments.map((a) => (
            <div key={a.id} className="mr" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <div>
                <b style={{ fontSize: 12 }}>{a.kol_creators?.name ?? a.kol_id}</b>
                <div className="meta">{atUsername(a.kol_creators?.username)} · {fmtDateTime(a.created_at)}{a.admin_note ? ` · ${a.admin_note}` : ""}</div>
              </div>
              <St map={ASSIGNMENT_STATUS} k={a.status} />
            </div>
          ))}

          <label style={{ marginTop: 16 }}>Bukti konten</label>
          {submissions.length === 0 && <div className="meta">Belum ada bukti yang dikirim creator.</div>}
          {submissions.map((s) => <SubmissionItem key={s.id} submission={s} send={send} />)}
        </div>
      )}
    </Panel>
  );
}

function SubmissionItem({ submission, send }: { submission: Submission; send: Send }) {
  const [note, setNote] = useState(submission.review_note ?? "");
  const [busy, setBusy] = useState("");
  const review = async (status: string) => {
    setBusy(status);
    await send({ action: "submission_review", id: submission.id, status, note }, "Review bukti tersimpan");
    setBusy("");
  };
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 12 }}>{submission.deliverable_type}</b>
        <St map={SUBMISSION_STATUS} k={submission.status} />
        <span className="meta">{fmtDateTime(submission.created_at)}</span>
        <a className="btn s" href={submission.content_url} target="_blank" rel="noreferrer">Buka konten</a>
        {submission.insight_screenshot_url && <a className="btn s" href={submission.insight_screenshot_url} target="_blank" rel="noreferrer">Insight</a>}
      </div>
      <div className="crow" style={{ marginTop: 6 }}>
        <input className="f" style={{ flex: 1, minWidth: 180 }} placeholder="Catatan review (opsional)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        <button className="btn s p" disabled={Boolean(busy)} onClick={() => void review("approved")}>Setujui</button>
        <button className="btn s" disabled={Boolean(busy)} onClick={() => void review("needs_revision")}>Minta revisi</button>
        <button className="btn s r" disabled={Boolean(busy)} onClick={() => void review("rejected")}>Tolak</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Visit                                                               */
/* ------------------------------------------------------------------ */
function VisitView({ data, send }: { data: Snapshot; send: Send }) {
  const [sub, setSub] = useState<"schedule" | "invites" | "sow">("schedule");
  const [filter, setFilter] = useState("all");
  const [noMail, setNoMail] = useState<Record<number, boolean>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [createKol, setCreateKol] = useState("");
  const [days, setDays] = useState("7");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [view, setView] = useState<"calendar" | "table">("calendar");
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(() => todayKey());

  const visits = useMemo(() => {
    const rows = data.visits.filter((v) => filter === "all" || v.status === filter);
    return rows.sort((a, b) => String(b.booking_date).localeCompare(String(a.booking_date)));
  }, [data.visits, filter]);

  // Jadwal per hari, diurutkan berdasarkan jam untuk tampilan kalender.
  const byDay = useMemo(() => {
    const map = new Map<string, Visit[]>();
    for (const v of visits) {
      const key = String(v.booking_date).slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(v);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => String(a.booking_time ?? "").localeCompare(String(b.booking_time ?? "")));
    return map;
  }, [visits]);

  const cells = useMemo(() => monthCells(month), [month]);
  const monthVisits = visits.filter((v) => String(v.booking_date).slice(0, 7) === month).length;
  const dayVisits = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const goToday = () => { setMonth(monthKey(new Date())); setSelectedDay(todayKey()); };

  const createInvite = async () => {
    if (!createKol) { toast.error("Pilih creator lebih dulu"); return; }
    setBusy("invite");
    const expiresAt = new Date(Date.now() + Math.max(1, Number(days) || 7) * 86400000).toISOString();
    const res = await send({ action: "invite_create", kolId: createKol, expiresAt }, "Undangan visit dibuat");
    const payload = res.data as { inviteUrl?: string } | null;
    if (payload?.inviteUrl) setInviteUrl(payload.inviteUrl);
    setBusy("");
  };

  const resend = async (invite: Invite) => {
    setBusy(invite.id);
    const res = await send({ action: "invite_resend", invitationId: invite.id, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }, "Undangan diperbarui");
    const payload = res.data as { inviteUrl?: string } | null;
    if (payload?.inviteUrl) setInviteUrl(payload.inviteUrl);
    setBusy("");
  };

  return (
    <>
      <Panel
        title="Visit creator"
        meta="konfirmasi jadwal dan undangan"
        action={<Tabs items={[["schedule", "Jadwal"], ["invites", "Undangan"], ["sow", "SOW & Email"]]} value={sub} onChange={setSub} style={{ margin: 0 }} />}
      >
        {sub === "sow" ? (
          <SowPanel versions={data.sowVersions} settings={data.settings} visits={data.visits} send={send} />
        ) : sub === "schedule" ? (
          <>
            <div className="pad" style={{ paddingBottom: 10 }}>
              <div className="crow" style={{ marginTop: 0 }}>
                <select className="f" style={{ width: 190 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">Semua status</option>
                  {Object.entries(VISIT_STATUS).map(([k, m]) => <option key={k} value={k}>{m[0]}</option>)}
                </select>
                <Tabs items={[["calendar", "Kalender"], ["table", "Tabel"]]} value={view} onChange={setView} style={{ margin: 0 }} />
                <span className="meta">Hanya transisi yang diizinkan server yang ditampilkan.</span>
              </div>
            </div>
            {view === "calendar" ? (
              <>
                <div className="calbar">
                  <div className="calnav">
                    <button className="btn s" aria-label="Bulan sebelumnya" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
                    <b>{monthTitle(month)}</b>
                    <button className="btn s" aria-label="Bulan berikutnya" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
                  </div>
                  <div className="crow" style={{ marginTop: 0 }}>
                    <button className="btn s" onClick={goToday}>Hari ini</button>
                    <span className="meta">{monthVisits} jadwal bulan ini</span>
                  </div>
                </div>
                <div className="calwrap">
                  <div className="cal" aria-label={`Kalender visit ${monthTitle(month)}`}>
                    {WEEKDAYS.map((d) => <div key={d} className="cal-w">{d}</div>)}
                    {cells.map((cell) => {
                      const list = byDay.get(cell.key) ?? [];
                      const cls = ["cal-cell", cell.inMonth ? "" : "out", cell.key === todayKey() ? "today" : "", cell.key === selectedDay ? "sel" : ""].filter(Boolean).join(" ");
                      return (
                        <button
                          key={cell.key}
                          type="button"
                          className={cls}
                          aria-label={`${fmtDay(cell.key)}, ${list.length} jadwal`}
                          aria-pressed={cell.key === selectedDay}
                          onClick={() => {
                            if (!cell.inMonth) setMonth(cell.key.slice(0, 7));
                            setSelectedDay(cell.key);
                          }}
                        >
                          <span className="cal-d">{cell.day}</span>
                          {list.slice(0, 2).map((v) => (
                            <span key={v.id} className={`cal-ev ${VISIT_TONE[v.status] ?? ""}`} title={`${v.booking_time ? fmtTime(v.booking_time) : "jam belum dipilih"} · ${v.kol_creators?.name ?? v.kol_id}`}>
                              {v.booking_time ? fmtTime(v.booking_time) : "—"} {v.kol_creators?.name ?? v.kol_id}
                            </span>
                          ))}
                          {list.length > 2 && <span className="cal-more">+{list.length - 2} lagi</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="cal-day">
                    <div className="cal-dayhead">
                      <b>{selectedDay ? dayDate(selectedDay).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" }) : "Pilih tanggal"}</b>
                      <span className="meta">{dayVisits.length ? `${dayVisits.length} jadwal` : "—"}</span>
                    </div>
                    {dayVisits.length === 0 && <div className="meta">Tidak ada jadwal visit pada tanggal ini.</div>}
                    {dayVisits.map((v) => {
                      const contact = one(v.kol_creators?.kol_private_contacts) ?? null;
                      const wa = waUrl(contact?.whatsapp);
                      return (
                        <div key={v.id} className="cal-item">
                          <div className="cal-itemtop">
                            <b>{v.booking_time ? fmtTime(v.booking_time) : "Jam belum dipilih"}</b>
                            <St map={VISIT_STATUS} k={v.status} />
                          </div>
                          <div>{v.kol_creators?.name ?? v.kol_id} <span className="meta">{atUsername(v.kol_creators?.username)}</span></div>
                          <div className="meta">{v.visit_note || "Tanpa catatan creator"}</div>
                          <div className="crow" style={{ marginTop: 4 }}>
                            {wa ? <a className="btn s" href={wa} target="_blank" rel="noreferrer">WhatsApp</a> : contact?.email ? <span className="meta">{contact.email}</span> : null}
                          </div>
                          <input className="f" placeholder="Catatan admin" value={notes[v.id] ?? ""} maxLength={1000}
                            onChange={(e) => setNotes((prev) => ({ ...prev, [v.id]: e.target.value }))} />
                          {(VISIT_TRANSITIONS[v.status] ?? []).includes("confirmed") && (
                            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "6px 0 0", fontSize: 12 }}>
                              <input type="checkbox" disabled={!contact?.email} checked={Boolean(contact?.email) && !noMail[v.id]} onChange={(e) => setNoMail((prev) => ({ ...prev, [v.id]: !e.target.checked }))} style={{ marginTop: 2 }} />
                              <span>{contact?.email ? <>Kirim email konfirmasi + SOW ke <b>{contact.email}</b></> : "Creator belum punya email, jadi email tidak dikirim."}</span>
                            </label>
                          )}
                          <div className="crow" style={{ marginTop: 4 }}>
                            <VisitButtons visit={v} onUpdate={(next) => void send({ action: "visit_update", id: v.id, status: next, note: notes[v.id] ?? "", skipEmail: next === "confirmed" && Boolean(noMail[v.id]) }, next === "confirmed" && !noMail[v.id] ? "Visit dikonfirmasi. Email dikirim dalam ±1 menit" : "Status visit diperbarui")} />
                          </div>
                          <BookingExtras visit={v} emails={data.emails} send={send} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
            <div className="sc">
              <table>
                <thead><tr><th>Tanggal</th><th>Creator</th><th>Kontak</th><th>Catatan</th><th>Status</th><th>Aksi</th></tr></thead>
                <tbody>
                  {visits.map((v) => {
                    const contact = one(v.kol_creators?.kol_private_contacts) ?? null;
                    const wa = waUrl(contact?.whatsapp);
                    return (
                      <tr key={v.id}>
                        <td><b>{fmtDay(v.booking_date)}</b><div className="meta">{v.booking_time ? fmtTime(v.booking_time) : "jam belum dipilih"}</div></td>
                        <td>{v.kol_creators?.name ?? v.kol_id}<div className="meta">{atUsername(v.kol_creators?.username)}</div></td>
                        <td>{wa ? <a className="btn s" href={wa} target="_blank" rel="noreferrer">WhatsApp</a> : (contact?.email ?? "—")}</td>
                        <td>
                          <div className="meta">{v.visit_note || "—"}</div>
                          <input className="f" style={{ marginTop: 4, minWidth: 150 }} placeholder="Catatan admin" value={notes[v.id] ?? ""} maxLength={1000}
                            onChange={(e) => setNotes((prev) => ({ ...prev, [v.id]: e.target.value }))} />
                        </td>
                        <td><St map={VISIT_STATUS} k={v.status} /></td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <VisitButtons visit={v} onUpdate={(next) => void send({ action: "visit_update", id: v.id, status: next, note: notes[v.id] ?? "", skipEmail: next === "confirmed" && Boolean(noMail[v.id]) }, next === "confirmed" && !noMail[v.id] ? "Visit dikonfirmasi. Email dikirim dalam ±1 menit" : "Status visit diperbarui")} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visits.length === 0 && <Empty>BELUM ADA PENGAJUAN VISIT</Empty>}
            </div>
            )}
          </>
        ) : (
          <>
            <div className="pad">
              <div className="crow" style={{ marginTop: 0 }}>
                <select className="f" style={{ flex: 1, minWidth: 200 }} value={createKol} onChange={(e) => setCreateKol(e.target.value)}>
                  <option value="">Pilih creator…</option>
                  {data.creators.filter((c) => c.status !== "Rejected").map((c) => (
                    <option key={c.source_id} value={c.source_id}>{creatorLabel(c)} · {atUsername(c.username)}</option>
                  ))}
                </select>
                <select className="f" style={{ width: 110 }} value={days} onChange={(e) => setDays(e.target.value)}>
                  {["3", "7", "14", "30"].map((d) => <option key={d} value={d}>{d} hari</option>)}
                </select>
                <button className="btn s p" disabled={busy === "invite"} onClick={() => void createInvite()}>{busy === "invite" ? "Membuat…" : "Buat undangan"}</button>
              </div>
              {inviteUrl && (
                <div className="crow">
                  <input className="f" readOnly value={inviteUrl} style={{ flex: 1, minWidth: 200 }} />
                  <button className="btn s" onClick={() => void copyText(inviteUrl)}>Salin</button>
                </div>
              )}
            </div>
            <div className="sc">
              <table>
                <thead><tr><th>Creator</th><th>Status</th><th>Kedaluwarsa</th><th>Dibuat</th><th>Aksi</th></tr></thead>
                <tbody>
                  {data.invites.map((inv) => {
                    const active = ["created", "opened", "authenticated", "linked", "schedule_selected"].includes(inv.status);
                    return (
                      <tr key={inv.id}>
                        <td>{inv.kol_creators?.name ?? inv.kol_id}<div className="meta">{atUsername(inv.kol_creators?.username)}</div></td>
                        <td><St map={INVITE_STATUS} k={inv.status} /></td>
                        <td>{fmtDateTime(inv.expires_at)}</td>
                        <td>{fmtDateTime(inv.created_at)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {active && <button className="btn s" disabled={busy === inv.id} onClick={() => void resend(inv)}>Perbarui tautan</button>}
                          {active && <button className="btn s r" style={{ marginLeft: 6 }} onClick={() => void send({ action: "invite_revoke", invitationId: inv.id }, "Undangan dicabut")}>Cabut</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.invites.length === 0 && <Empty>BELUM ADA UNDANGAN</Empty>}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Komunitas                                                           */
/* ------------------------------------------------------------------ */
type ReportGroup = { postId: number; post: Report["kol_public_posts"]; reports: Report[] };

function KomunitasView({ data, send }: { data: Snapshot; send: Send }) {
  const [reason, setReason] = useState("all");
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const map = new Map<number, ReportGroup>();
    for (const report of data.reports) {
      const current = map.get(report.post_id) ?? { postId: report.post_id, post: report.kol_public_posts ?? null, reports: [] };
      current.reports.push(report);
      map.set(report.post_id, current);
    }
    const q = query.trim().toLowerCase();
    return [...map.values()].filter((group) => {
      if (reason !== "all" && !group.reports.some((r) => r.reason === reason)) return false;
      if (!q) return true;
      return [
        group.post?.title, group.post?.body, group.post?.kol_creators?.name, group.post?.kol_creators?.username,
        ...group.reports.map((r) => r.note),
      ].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [data.reports, reason, query]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of data.reports) map.set(r.reason, (map.get(r.reason) ?? 0) + 1);
    return map;
  }, [data.reports]);

  return (
    <>
      <Panel title="Komunitas" meta={`${data.reports.length} laporan terbuka`}>
        <div className="pad" style={{ paddingBottom: 10 }}>
          <div className="crow" style={{ marginTop: 0 }}>
            <input className="f" style={{ flex: 1, minWidth: 200 }} placeholder="Cari judul postingan, creator, atau isi laporan" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="f" style={{ width: 180 }} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="all">Semua alasan</option>
              {Object.entries(REPORT_REASON).map(([k, label]) => <option key={k} value={k}>{label} ({counts.get(k) ?? 0})</option>)}
            </select>
          </div>
        </div>
      </Panel>

      {groups.length === 0 && <Panel><Empty>TIDAK ADA LAPORAN TERBUKA</Empty></Panel>}
      {groups.map((group) => <ReportCard key={group.postId} group={group} send={send} />)}
    </>
  );
}

function ReportCard({ group, send }: { group: ReportGroup; send: Send }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const post = group.post;
  const creator = post?.kol_creators;
  const primary = group.reports[0];
  if (!primary) return null;

  const resolve = async (decision: "hide" | "dismiss") => {
    setBusy(decision);
    await send({ action: "report_resolve", id: primary.id, decision, note }, decision === "hide" ? "Postingan disembunyikan" : "Laporan diabaikan");
    setBusy("");
  };

  return (
    <Panel
      title={creator?.name ?? post?.kol_id ?? `Postingan #${group.postId}`}
      meta={`${atUsername(creator?.username)} · ${post ? POST_TYPE[post.post_type] ?? post.post_type : "postingan"}`}
      action={<span className="tg hi">{group.reports.length} laporan</span>}
    >
      <div className="pad">
        <b style={{ fontSize: 13 }}>{post?.title ?? `Postingan #${group.postId}`}</b>
        {post?.body && <p style={{ fontSize: 12, color: "#444450", margin: "6px 0 0", whiteSpace: "pre-line" }}>{post.body.length > 320 ? `${post.body.slice(0, 320)}…` : post.body}</p>}
        <div className="crow">
          {post && <span className={`tg ${post.visibility === "published" ? "ok" : ""}`}>{post.visibility}</span>}
          {post && <span className="tg">{`moderasi ${post.moderation_status}`}</span>}
          {post?.media_url && <a className="btn s" href={post.media_url} target="_blank" rel="noreferrer">Lihat media</a>}
          {creator?.username && <a className="btn s" href={`https://kol.djiwatentram.web.id/${encodeURIComponent(String(creator.username).replace(/^@/, ""))}/profile`} target="_blank" rel="noreferrer">Profil creator</a>}
        </div>

        <label>Laporan</label>
        {group.reports.map((r) => (
          <div key={r.id} style={{ fontSize: 11.5, lineHeight: 1.5, padding: "3px 0" }}>
            <b>{REPORT_REASON[r.reason] ?? r.reason}</b>
            <span className="meta" style={{ marginLeft: 6 }}>{fmtDateTime(r.created_at)}</span>
            {r.note && <div style={{ color: "#666672" }}>“{r.note}”</div>}
          </div>
        ))}

        <div className="crow" style={{ marginTop: 10 }}>
          <input className="f" style={{ flex: 1, minWidth: 200 }} placeholder="Catatan moderasi (opsional)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          <button className="btn s r" disabled={Boolean(busy)} onClick={() => void resolve("hide")}>{busy === "hide" ? "Menyembunyikan…" : "Sembunyikan postingan"}</button>
          <button className="btn s" disabled={Boolean(busy)} onClick={() => void resolve("dismiss")}>{busy === "dismiss" ? "Menyimpan…" : "Abaikan laporan"}</button>
        </div>
        <div className="meta" style={{ marginTop: 6 }}>Menyembunyikan postingan juga menutup semua laporan lain untuk postingan ini.</div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Inquiry                                                             */
/* ------------------------------------------------------------------ */
function InquiryView({ data, send }: { data: Snapshot; send: Send }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.inquiries.filter((i) => {
      if (filter !== "all" && i.status !== filter) return false;
      if (!q) return true;
      return [i.business_name, i.contact_name, i.contact_email, i.contact_phone, i.brief, i.kol_creators?.name, i.kol_creators?.username]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [data.inquiries, filter, query]);

  return (
    <>
      <Panel title="Inquiry kolaborasi" meta={`${rows.length} dari ${data.inquiries.length}`}>
        <div className="pad" style={{ paddingBottom: 10 }}>
          <div className="crow" style={{ marginTop: 0 }}>
            <input className="f" style={{ flex: 1, minWidth: 200 }} placeholder="Cari brand, kontak, atau creator" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="f" style={{ width: 170 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Semua status</option>
              {Object.entries(INQUIRY_STATUS).map(([k, m]) => <option key={k} value={k}>{m[0]}</option>)}
            </select>
          </div>
        </div>
        <div className="sc">
          <table>
            <thead><tr><th>Brand / bisnis</th><th>Creator</th><th>Kontak</th><th>Status</th><th>Masuk</th><th /></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.business_name}</b><div className="meta">{i.contact_name}</div></td>
                  <td>{i.kol_creators?.name ?? i.kol_id}<div className="meta">{atUsername(i.kol_creators?.username)}</div></td>
                  <td>{i.contact_email || i.contact_phone || "—"}<div className="meta">{PREFERRED[i.preferred_contact] ?? i.preferred_contact}</div></td>
                  <td><St map={INQUIRY_STATUS} k={i.status} /></td>
                  <td>{fmtDateTime(i.created_at)}</td>
                  <td><button className="btn s" onClick={() => setOpenId(openId === i.id ? null : i.id)}>{openId === i.id ? "Tutup" : "Buka"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>BELUM ADA INQUIRY</Empty>}
        </div>
      </Panel>

      {rows.filter((i) => i.id === openId).map((i) => <InquiryDetail key={i.id} inquiry={i} send={send} onClose={() => setOpenId(null)} />)}
    </>
  );
}

function InquiryDetail({ inquiry, send, onClose }: { inquiry: Inquiry; send: Send; onClose: () => void }) {
  const [status, setStatus] = useState(inquiry.status);
  const [note, setNote] = useState(inquiry.admin_note ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await send({ action: "inquiry_update", id: inquiry.id, status, adminNote: note }, "Inquiry diperbarui");
    setBusy(false);
  };

  return (
    <Panel
      title={inquiry.business_name}
      meta={fmtDateTime(inquiry.created_at)}
      action={<button className="btn s" onClick={onClose}>Tutup</button>}
    >
      <div className="pad">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
          <KV k="Creator" v={`${inquiry.kol_creators?.name ?? inquiry.kol_id} ${atUsername(inquiry.kol_creators?.username)}`} />
          <KV k="Kontak" v={inquiry.contact_name} />
          <KV k="Email" v={inquiry.contact_email || "—"} />
          <KV k="Telepon" v={inquiry.contact_phone || "—"} />
          <KV k="Cara dihubungi" v={PREFERRED[inquiry.preferred_contact] ?? inquiry.preferred_contact} />
        </div>
        <label>Brief</label>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-line" }}>{inquiry.brief}</div>
        <div className="row2" style={{ marginTop: 12 }}>
          <div>
            <label style={{ marginTop: 0 }}>Status</label>
            <select className="f" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(INQUIRY_STATUS).map(([k, m]) => <option key={k} value={k}>{m[0]}</option>)}
            </select>
          </div>
          <div>
            <label style={{ marginTop: 0 }}>Catatan admin</label>
            <input className="f" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="crow" style={{ marginTop: 12 }}>
          {inquiry.contact_email && <a className="btn s" href={`mailto:${inquiry.contact_email}`}>Balas email</a>}
          {waUrl(inquiry.contact_phone) && <a className="btn s" href={waUrl(inquiry.contact_phone) ?? "#"} target="_blank" rel="noreferrer">WhatsApp</a>}
          <button className="btn s p" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan status"}</button>
        </div>
      </div>
    </Panel>
  );
}
