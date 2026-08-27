import { createLazyFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { createClient } from "@yumipos/web-shared/lib/client";
import { useHybridStaffLogs, useHybridStaffStats, useHybridPayslips } from "@yumipos/web-shared";
import { Djiwa3DIcon, type Djiwa3DIconName } from "@yumipos/web-shared";
import { PersonalSchedule } from "@yumipos/web-shared/components/attendance/PersonalSchedule";
import { SmartBanner } from "@/components/karyawan/SmartBanner";
import { SaldoCard } from "@/components/karyawan/SaldoCard";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  ClipboardList, Check, Camera, Upload,
  Loader2, Sparkles, AlertTriangle, X, Brush, Save, Search, CheckCheck, Clock, ExternalLink,
  Lightbulb, Coffee, ChefHat, CookingPot, Armchair, Toilet, CalendarDays, UserRound, FileText, Bell, LogIn, LogOut, Send, Home, CircleDollarSign, CalendarOff, Trophy, NotebookText, Megaphone, Info, Briefcase
} from "lucide-react";
import {
  submitClosingViaEdge,
  prepareKebersihanPhoto,
  ClosingSubmitError,
  type OpnameItem,
} from "../hooks/use-closing-submit";

// ─── Search Schema ────────────────────────────

const searchSchema = z.object({
  uid: z.string().optional(),
  t: z.union([z.string(), z.number()]).optional(),
  sig: z.string().optional(),
  mode: z.enum(["home", "checkin", "checkout", "schedule", "recap", "leave", "profile", "closing"]).optional(),
});

// ─── Telegram WebApp Type ─────────────────

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: { id: number; first_name?: string; last_name?: string; username?: string };
          query_id?: string;
        };
        expand: () => void;
        ready: () => void;
        close: () => void;
        MainButton: {
          setText: (text: string) => void;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
          isVisible: boolean;
          setParams: (params: Record<string, string>) => void;
        };
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        colorScheme: string;
        isExpanded: boolean;
        version: string;
      };
    };
  }
}

// ─── Types ─────────────────────────────────

type KebersihanArea = {
  id: string;
  label: string;
  icon: "cooking" | "seating" | "toilet";
  status: "belum_dicek" | "bersih" | "perlu_perbaikan";
  /** Object URL — hanya untuk preview di layar. */
  foto: string | null;
  /** File aslinya; ini yang dikirim saat submit. */
  fotoFile?: File | null;
  catatan: string;
};

type StaffInfo = {
  sourceId: string;
  name: string;
  roleName: string;
  username?: string;
  photoUrl?: string | null;
  profile?: StaffProfileData;
};

type StaffProfileData = {
  email?: string | null;
  phone?: string | null;
  identityNumber?: string | null;
  placeOfBirth?: string | null;
  birthDate?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  startDate?: string | null;
  employmentType?: string | null;
  location?: string | null;
  area?: string | null;
};

// ─── Constants
// ─── Constants ────────────────────────────

const BAR_INGREDIENTS = new Set([
  "Air Galon", "Apple Juice", "Arabica Beans", "Beans Robusta",
  "C1000 Apple", "Es Batu", "Fresh Milk Greenfield", "Gula Aren",
  "Le Mineral", "Lemon Tea Max Tea", "Matcha Powder", "Peach Tea Max Tea",
  "Richgold Label", "Robusta Beans", "SKM Carnation 488gr", "Sirup Green Apple",
  "Sirup Peach", "Soda Water Schweppes", "Sprite", "Sunquick Lemon",
  "Susu Coconut", "Susu Kental Manis", "White Cream",
]);

const KITCHEN_INGREDIENTS = new Set([
  "Barbeque Sauce", "Baso Sapi", "Bawang Daun", "Bawang Goreng",
  "Beras", "Biji Wijen", "Bubur Base", "Butter", "Coklat Powder", "Daging Ayam",
  "Fla", "Garam", "Gula Pasir Putih", "Kecap Asin", "Kecap Ikan", "Kecap Manis",
  "Kemangi Instant", "Kentang", "Kerupuk", "Kulit Pangsit (Cap Jempol)",
  "Mayonaise", "Merica", "Micin", "Minyak Bawang Putih", "Mix Vegetable",
  "Nasi Ayam Chasiu Sauce", "Nasi Ayam Mentega Sauce",
  "Nasi Ayam Rempah Kemangi  Sauce", "Nasi Goreng Sauce",
  "Nasi Telor Omega Pontianak Sauce", "Patty Hamburg", "Pisang",
  "Roti (Bread Co)", "Saus Sambel (Del Monte)", "Saus Tiram (Mahsuri)",
  "Saus Tomat (Del Monte)", "Selada (Ibu Teti Pasar)", "Sosis (Salam)",
  "Telor Ayam (Yogya)", "Telor Omega (Happy Egg)", "Telur Ayam",
  "Tepung Terigu", "Timun", "Tongcai", "Ubi Cilembu", "Yamin Base",
]);

const AREAS_KEBERSIHAN: KebersihanArea[] = [
  { id: "bar_kitchen", label: "Bar & Kitchen", icon: "cooking", status: "belum_dicek", foto: null, catatan: "" },
  { id: "area_customer", label: "Area Customer", icon: "seating", status: "belum_dicek", foto: null, catatan: "" },
  { id: "wc", label: "Toilet/WC", icon: "toilet", status: "belum_dicek", foto: null, catatan: "" },
];

const KEBERSIHAN_ICONS = { cooking: CookingPot, seating: Armchair, toilet: Toilet };

// ─── Route ────────────────────────────────

export const Route = createLazyFileRoute("/absen-keluar-mini")({
  component: MiniClosingPage,
  validateSearch: searchSchema,
});

// ═══════════════════════════════════════════
//  M I N I   C L O S I N G   P A G E
// ═══════════════════════════════════════════

function MiniClosingPage() {
  const search = useSearch({ from: "/absen-keluar-mini" });
  const navigate = useNavigate();

  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [verified, setVerified] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(true);
  const [shiftName, setShiftName] = useState<string>("Shift");
  const [shiftOpenTime, setShiftOpenTime] = useState<string>("");
  const [shiftCloseTime, setShiftCloseTime] = useState<string>("");

  // ── Telegram init ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.expand();
      tg.ready();
      tg.setHeaderColor("#1a1a2e");
      tg.setBackgroundColor("#ffffff");
    }
  }, []);

  // ── Verify link via Edge Function ──
  const uid = (search as any)?.uid || "";
  const t = (search as any)?.t || "";
  const sig = (search as any)?.sig || "";
  const initialMode = (search as any)?.mode || "closing";

  useEffect(() => {
    if (!uid || !t || !sig) {
      setLoadError("Tautan tidak valid (parameter tidak lengkap).");
      setLoadingStaff(false);
      setVerifying(false);
      return;
    }

    (async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(`${supabaseUrl}/functions/v1/verify-closing-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, t: parseInt(t, 10), sig }),
        });
        const data = await res.json();

        if (!data.valid) {
          setLoadError(data.error || "Tautan tidak valid.");
          setVerifying(false);
          setLoadingStaff(false);
          return;
        }

        setStaff(data.staff);
        setShiftName(data.shiftName || "Shift");
        setShiftOpenTime(data.openTime || "");
        setShiftCloseTime(data.closeTime || "");
        setVerified(true);
        setVerifying(false);
        setLoadingStaff(false);
      } catch (err: any) {
        setLoadError(err?.message || "Gagal memverifikasi tautan.");
        setVerifying(false);
        setLoadingStaff(false);
      }
    })();
  }, [uid, t, sig]);

  if (loadingStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Memuat data karyawan...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <AlertTriangle className="h-10 w-10 text-rose-400 mb-3" />
        <p className="font-bold text-sm text-center text-foreground">{loadError}</p>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Kembali ke Telegram dan klik tombol dari bot lagi.
        </p>
      </div>
    );
  }

  const role = (() => {
    const r = (staff?.roleName || "").toLowerCase();
    if (r.includes("bar")) return "bar" as const;
    if (r.includes("kitchen") || r.includes("chef") || r.includes("cook") || r.includes("dapur")) return "kitchen" as const;
    return null;
  })();

  if (initialMode === "closing" || (initialMode === "checkout" && role !== null)) {
    return <ClosingForm staff={staff!} role={role} shiftName={shiftName} openTime={shiftOpenTime} closeTime={shiftCloseTime} linkUid={uid} linkTimestamp={t} linkSignature={sig} />;
  }

  const signedQuery = `?uid=${encodeURIComponent(uid)}&t=${encodeURIComponent(String(t))}&sig=${encodeURIComponent(sig)}`;
  const workspaceSection = initialMode === "checkout" ? "checkin" : initialMode;
  return <MiniHrWorkspace staff={staff!} role={role} shiftName={shiftName} initialSection={workspaceSection as WorkspaceSection} signedQuery={signedQuery} />;
}

type WorkspaceSection = "home" | "schedule" | "checkin" | "notifications" | "recap" | "leave" | "profile" | "salary" | "contract" | "leaderboard";

type MiniLog = { type: string; timestamp: number };

function MiniHrWorkspace({
  staff,
  role,
  shiftName,
  initialSection,
  signedQuery,
}: {
  staff: StaffInfo;
  role: "bar" | "kitchen" | null;
  shiftName: string;
  initialSection: WorkspaceSection;
  signedQuery: string;
}) {
  const [section, setSection] = useState<WorkspaceSection>(initialSection);
  const [logs, setLogs] = useState<MiniLog[]>([]);
  const [schedules, setSchedules] = useState<Array<{ date: string; shift_name: string }>>([]);
  const [leaves, setLeaves] = useState<Array<{ leave_type: string; start_date: string; end_date: string; status: string }>>([]);
  const [leaveType, setLeaveType] = useState("izin");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const reportDate = new Date(`${monthStart}T00:00:00+07:00`);
  const sharedLogs = useHybridStaffLogs({ userId: staff.sourceId, month: reportDate.getMonth() + 1, year: reportDate.getFullYear() });
  const sharedStats = useHybridStaffStats({ userId: staff.sourceId, month: reportDate.getMonth() + 1, year: reportDate.getFullYear() });
  const payslips = useHybridPayslips({ userId: staff.sourceId });
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; type: string; date: string }>>([]);
  const effectiveLogs = (sharedLogs ?? logs) as MiniLog[];

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = createClient();
        const startMs = new Date(`${monthStart}T00:00:00+07:00`).getTime();
        const [logRes, scheduleRes, leaveRes] = await Promise.all([
          supabase.from("pos_attendance_logs").select("type,timestamp").eq("userId", staff.sourceId).gte("timestamp", startMs).order("timestamp", { ascending: false }).limit(200),
          supabase.schema("pos").from("attendance_schedules").select("date,shift_name").eq("user_id", staff.sourceId).gte("date", monthStart).order("date", { ascending: true }).limit(31),
          supabase.from("attendance_leave_requests").select("leave_type,start_date,end_date,status").eq("user_id", staff.sourceId).order("created_at", { ascending: false }).limit(5),
        ]);
        if (!mounted) return;
        setLogs((logRes.data ?? []) as MiniLog[]);
        setSchedules((scheduleRes.data ?? []) as Array<{ date: string; shift_name: string }>);
        setLeaves((leaveRes.data ?? []) as Array<{ leave_type: string; start_date: string; end_date: string; status: string }>);
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [monthStart, staff.sourceId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const items: Array<{ id: string; title: string; message: string; type: string; date: string }> = [];
      const supabase = createClient();
      const { data: announcements } = await supabase.from("announcements").select("id,title,subtitle,created_at").eq("is_active", true).order("created_at", { ascending: false }).limit(10);
      for (const item of announcements ?? []) items.push({ id: `ann-${item.id}`, title: item.title, message: item.subtitle || "Pengumuman terbaru", type: "announcement", date: new Date(item.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) });
      for (const item of leaves.slice(0, 5)) items.push({ id: `leave-${item.start_date}-${item.end_date}`, title: `Pengajuan ${item.leave_type}`, message: `${item.start_date} — ${item.end_date} · ${item.status}`, type: "leave", date: item.start_date });
      for (const item of (payslips ?? []).slice(0, 5) as any[]) items.push({ id: `slip-${item.id ?? item.period_name}`, title: `Slip Gaji ${item.period_name || ""}`.trim(), message: `Status: ${item.status || "tersedia"}`, type: "payslip", date: item.created_at ? new Date(item.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "" });
      if (mounted) setNotifications(items);
    })().catch(() => { if (mounted) setNotifications([]); });
    return () => { mounted = false; };
  }, [staff.sourceId, leaves, payslips]);

  const currentlyIn = effectiveLogs[0]?.type === "check_in";
  const attendanceAction: "checkin" | "checkout" = currentlyIn ? "checkout" : "checkin";
  const attendanceLink = `https://t.me/yumihrdbot?start=${attendanceAction}`;
  const openBot = (action: "checkin" | "checkout"): boolean => {
    const link = `https://t.me/yumihrdbot?start=${action}`;
    const tg = window.Telegram?.WebApp as any;
    const actionLabel = action === "checkin" ? "Absen Masuk" : "Absen Keluar";

    setNotice(`Membuka flow ${actionLabel} di @yumihrdbot...`);

    // Setelah Telegram menerima deep-link, tutup WebApp agar user kembali ke
    // chat bot. Fallback native tetap tersedia untuk WebView yang tidak expose
    // openTelegramLink/openLink.
    const closeMiniApp = () => {
      if (typeof tg?.close === "function") {
        window.setTimeout(() => tg.close(), 350);
      }
    };

    try {
      if (typeof tg?.openTelegramLink === "function") {
        tg.openTelegramLink(link);
        closeMiniApp();
        return true;
      }
      if (typeof tg?.openLink === "function") {
        tg.openLink(link);
        closeMiniApp();
        return true;
      }
    } catch (error) {
      console.warn("[mini] gagal membuka deep-link Telegram:", error);
    }

    // Fallback terakhir: navigasi native ke t.me. Ini juga bekerja ketika
    // Mini App dibuka di browser biasa, bukan hanya di Telegram WebView.
    window.location.assign(link);
    return true;
  };
  async function submitLeave() {
    if (!leaveStart || !leaveEnd || !leaveReason.trim()) { setNotice("Tanggal dan alasan wajib diisi."); return; }
    const { error } = await createClient().from("attendance_leave_requests").insert({ user_id: staff.sourceId, user_name: staff.name, leave_type: leaveType, start_date: leaveStart, end_date: leaveEnd, reason: leaveReason.trim(), status: "pending" });
    if (error) setNotice(error.message); else { setNotice("Pengajuan berhasil dikirim ke HRD."); setLeaveReason(""); setLeaves((prev) => [{ leave_type: leaveType, start_date: leaveStart, end_date: leaveEnd, status: "pending" }, ...prev]); }
  }
  const items: Array<{ id: WorkspaceSection; label: string; icon: any; illustration: Djiwa3DIconName }> = [
    { id: "home", label: "Beranda", icon: Home, illustration: "employee-home" },
    { id: "schedule", label: "Jadwal", icon: CalendarDays, illustration: "employee-schedule" },
    { id: "checkin", label: "Absensi", icon: currentlyIn ? LogOut : LogIn, illustration: "employee-attendance" },
    { id: "notifications", label: "Notifikasi", icon: Bell, illustration: "employee-notifications" },
    { id: "profile", label: "Profil", icon: UserRound, illustration: "employee-nav-profile" },
  ];
  const goClosing = () => { window.location.href = `${window.location.pathname}${signedQuery}&mode=closing`; };

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur-md"><div className="mx-auto flex max-w-2xl items-center justify-between"><div className="flex items-center gap-2"><img src="/logo-djiwa.png" alt="Djiwa Tentram" className="h-7 w-7 shrink-0 rounded-lg object-cover shadow-sm" /><span className="text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground">Djiwa Tentram</span></div><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${currentlyIn ? "bg-amber-500" : "bg-emerald-500"}`} /><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{currentlyIn ? "Sedang bertugas" : "Siap absen"}</span></div></div></header>
    <main className="space-y-3 px-4 py-4 pb-24">{notice && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-700">{notice}</div>}
      {section === "home" && <><MiniHomeHeader staff={staff} /><SmartBanner /><SaldoCard staffId={staff.sourceId} /><div className="grid grid-cols-3 gap-2"><div className="rounded-2xl border bg-card px-2 py-2 text-center"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Shift</p><p className="text-sm font-black">{sharedStats?.sessionCount ?? 0}</p></div><div className="rounded-2xl border bg-card px-2 py-2 text-center"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hadir</p><p className="text-sm font-black">{sharedStats?.attendanceRate ?? 0}<span className="text-[7px] font-normal text-muted-foreground">%</span></p></div><div className="rounded-2xl border bg-card px-2 py-2 text-center"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hari</p><p className="text-sm font-black">{sharedStats?.daysWorked ?? 0}</p></div></div><div><h2 className="mb-3 text-xs font-black uppercase tracking-wider text-foreground">Menu</h2><MiniMenuGrid onSelect={setSection} onTelegram={() => window.open("https://t.me/addlist/076D_FFRNFw5ZWI1", "_blank")} /></div><button type="button" onClick={() => openBot(attendanceAction)} className={`relative z-10 flex h-12 w-full touch-manipulation items-center justify-center gap-1.5 rounded-[14px] text-sm font-bold text-white shadow-lg active:scale-[.97] ${currentlyIn ? "bg-amber-500 shadow-amber-500/20" : "bg-primary shadow-primary/20"}`}>{currentlyIn ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}{currentlyIn ? "ABSEN KELUAR" : "ABSEN MASUK"}</button>{role && <button onClick={goClosing} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-slate-900 text-sm font-bold text-white"><ClipboardList className="h-4 w-4" /> Stock Opname & Closing</button>}</>}
      {section === "checkin" && <Panel title="Absensi" icon={currentlyIn ? LogOut : LogIn} subtitle="Lokasi, shift, dan foto tetap diverifikasi oleh flow resmi Yumi HR."><p className="text-sm font-bold">{currentlyIn ? "Kamu sedang tercatat masuk." : "Kamu belum tercatat masuk."}</p><p className="mt-1 text-xs text-slate-500">Tekan tombol untuk melanjutkan proses aman melalui @yumihrdbot.</p><a href={attendanceLink} onClick={(event) => { if (openBot(attendanceAction)) event.preventDefault(); }} aria-label={currentlyIn ? "Lanjut Absen Keluar" : "Lanjut Absen Masuk"} className="relative z-10 mt-4 flex min-h-12 w-full touch-manipulation items-center justify-center rounded-2xl bg-primary text-sm font-bold text-white">{currentlyIn ? "Lanjut Absen Keluar" : "Lanjut Absen Masuk"}</a></Panel>}
      {section === "schedule" && <Panel title="Jadwal Saya" icon={CalendarDays} subtitle="Jadwal shift bulan berjalan."><div className="rounded-2xl bg-white p-2 shadow-sm"><PersonalSchedule userId={staff.sourceId} userName={staff.name} userRole={staff.roleName} month={reportDate.getMonth() + 1} year={reportDate.getFullYear()} /></div>{loading ? <LoadingText /> : schedules.length ? schedules.map((s) => <div key={`${s.date}-${s.shift_name}`} className="mb-2 flex justify-between rounded-2xl bg-white p-4 shadow-sm"><span><b className="text-sm">{s.date}</b><br /><small className="text-slate-500">{s.shift_name || "OFF"}</small></span><CalendarDays className="h-5 w-5 text-primary" /></div>) : <EmptyText text="Belum ada jadwal." />}</Panel>}
      {section === "recap" && <Panel title="Rekap Absensi" icon={FileText} subtitle="Ringkasan bulan berjalan."><div className="grid grid-cols-2 gap-3"><Summary label="Total masuk" value={effectiveLogs.filter((x) => x.type === "check_in").length} /><Summary label="Total keluar" value={effectiveLogs.filter((x) => x.type === "check_out").length} /><Summary label="Hari kerja" value={sharedStats?.daysWorked ?? effectiveLogs.filter((x) => x.type === "check_in").length} /><Summary label="Bulan" value={monthStart.slice(0, 7)} /></div></Panel>}
      {section === "leave" && <Panel title="Ajukan Izin" icon={Send} subtitle="Pengajuan masuk ke HRD dengan status pending."><div className="space-y-2"><label className="block text-xs font-bold text-slate-500">Jenis pengajuan</label><select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="min-h-11 w-full rounded-xl border px-3 text-sm"><option value="izin">Izin</option><option value="cuti">Cuti</option><option value="sakit">Sakit</option><option value="other">Lainnya</option></select><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-slate-500">Mulai<input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-2 text-xs" /></label><label className="text-xs font-bold text-slate-500">Selesai<input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-2 text-xs" /></label></div><textarea value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} placeholder="Alasan pengajuan..." className="min-h-24 w-full rounded-xl border p-3 text-sm" /><button onClick={submitLeave} className="min-h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white">Kirim Pengajuan</button></div>{leaves.map((l, i) => <div key={`${l.start_date}-${i}`} className="mt-2 rounded-2xl bg-slate-50 p-3 text-xs"><b>{l.leave_type.toUpperCase()}</b> · {l.start_date} — {l.end_date}<span className="float-right font-bold text-amber-600">{l.status}</span></div>)}</Panel>}
      {section === "notifications" && <MiniNotifications items={notifications} storageKey={staff.sourceId} onNavigate={setSection} />}
      {section === "salary" && <Panel title="Slip Gaji" icon={CircleDollarSign} subtitle="Data slip gaji production Karyawan.">{payslips?.length ? (payslips as any[]).map((p) => <div key={p.id || p.period_name} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm"><div><p className="text-sm font-black">{p.period_name || "Periode gaji"}</p><p className="text-xs text-slate-500">Status: {p.status || "tersedia"}</p></div><span className="text-sm font-black text-primary">Rp {Number(p.net_pay || p.netPay || 0).toLocaleString("id-ID")}</span></div>) : <EmptyText text="Belum ada slip gaji yang tersedia." />}</Panel>}
      {section === "contract" && <Panel title="Kontrak Kerja" icon={FileText} subtitle="Buka dokumen kontrak dari aplikasi Karyawan."><p className="text-sm font-bold">Kontrak kerja tersedia di portal Karyawan.</p><button onClick={() => window.open(`https://karyawan.yumme.id/${staff.username || staff.sourceId}/kontrak`, "_blank")} className="mt-3 min-h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white">Buka Kontrak</button></Panel>}
      {section === "leaderboard" && <Panel title="Leaderboard Bonus" icon={Trophy} subtitle="Peringkat bonus dari aplikasi Karyawan."><p className="text-sm font-bold">Leaderboard production tetap tersedia di portal Karyawan.</p><button onClick={() => window.open(`https://karyawan.yumme.id/${staff.username || staff.sourceId}/leaderboard`, "_blank")} className="mt-3 min-h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white">Buka Leaderboard</button></Panel>}
      {section === "profile" && <Panel title="Profil Saya" icon={UserRound} subtitle="Data pribadi dan pekerjaan dari profil Karyawan."><div className="rounded-3xl bg-gradient-to-br from-primary to-blue-700 p-5 text-white"><div className="flex items-center gap-3"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/20 text-2xl font-black">{staff.photoUrl ? <img src={staff.photoUrl} alt={staff.name} className="h-full w-full object-cover" /> : staff.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-lg font-black">{staff.name}</p><p className="text-xs text-blue-100">@{staff.username || staff.sourceId.slice(0, 8)}</p><p className="mt-1 text-xs font-bold text-blue-100">{staff.roleName || "Karyawan"}</p></div></div></div><div className="rounded-2xl border bg-white p-4 shadow-sm"><h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider"><UserRound className="h-4 w-4 text-primary" /> Data Pribadi</h3><div className="space-y-1.5"><ProfileRow label="Nama" value={staff.name} /><ProfileRow label="Email" value={staff.profile?.email} /><ProfileRow label="Username" value={staff.username ? `@${staff.username}` : undefined} /><ProfileRow label="No HP" value={staff.profile?.phone} /><ProfileRow label="KTP" value={staff.profile?.identityNumber} /><ProfileRow label="Tmp/Tgl Lahir" value={[staff.profile?.placeOfBirth, staff.profile?.birthDate].filter(Boolean).join(", ")} /><ProfileRow label="Alamat" value={staff.profile?.address} /><ProfileRow label="Kontak Darurat" value={staff.profile?.emergencyContactName ? `${staff.profile.emergencyContactName} (${staff.profile.emergencyContactPhone || "-"})` : undefined} /></div></div><div className="rounded-2xl border bg-white p-4 shadow-sm"><h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary"><Briefcase className="h-4 w-4" /> Pekerjaan</h3><div className="space-y-1.5"><ProfileRow label="Role" value={staff.roleName} /><ProfileRow label="Area / Lokasi" value={staff.profile?.area || staff.profile?.location || (role === "bar" ? "Bar" : role === "kitchen" ? "Kitchen" : undefined)} /><ProfileRow label="Mulai" value={staff.profile?.startDate} /><ProfileRow label="Status" value={staff.profile?.employmentType} /></div></div><div className="rounded-2xl border bg-white p-4 shadow-sm"><h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider"><CircleDollarSign className="h-4 w-4 text-primary" /> Data Payroll</h3><div className="space-y-1.5"><ProfileRow label="Bank" value={staff.profile?.bankName} /><ProfileRow label="No Rekening" value={staff.profile?.bankAccount} /></div></div><button onClick={() => window.open(`https://karyawan.yumme.id/${staff.username || staff.sourceId}/profil`, "_blank")} className="min-h-12 w-full rounded-2xl border border-primary bg-white text-sm font-bold text-primary">Edit data di apps/karyawan</button></Panel>}
    </main><nav aria-label="Navigasi utama karyawan" className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]"><div className="mx-auto flex max-w-2xl px-1 py-1">{items.map((item) => { const { id, label, icon: Icon } = item; const active = section === id; return <button key={id} onClick={() => setSection(id)} className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-all duration-200 active:scale-95 ${active ? "text-blue-600" : "text-gray-400 hover:text-gray-600"}`}>{item.illustration ? <Djiwa3DIcon name={item.illustration} size="micro" alt="" className="h-6 w-6 object-contain" /> : <Icon className={`h-6 w-6 transition-all ${active ? "drop-shadow-[0_0_5px_rgba(37,99,235,0.3)]" : ""}`} />}<span className={`text-[11px] font-bold uppercase tracking-wider leading-none ${active ? "opacity-100" : "opacity-60"}`}>{label}</span>{active && <div className="absolute top-0 h-1 w-8 rounded-b-lg bg-blue-600" />}</button>; })}</div></nav>
  </div>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl bg-white/15 p-2 text-center"><p className="text-lg font-black">{value}</p><p className="text-[10px] text-blue-100">{label}</p></div>; }
function Summary({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xl font-black text-primary">{value}</p><p className="text-[11px] text-slate-500">{label}</p></div>; }
function MiniNotifications({ items, storageKey, onNavigate }: { items: Array<{ id: string; title: string; message: string; type: string; date: string }>; storageKey: string; onNavigate: (section: WorkspaceSection) => void }) { const [filter, setFilter] = useState<"all" | "announcement" | "payslip" | "leave">("all"); const [dismissed, setDismissed] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(`yumi_mini_notif_dismissed_${storageKey}`) || "[]")); } catch { return new Set(); } }); const visible = items.filter((n) => !dismissed.has(n.id)); const filtered = filter === "all" ? visible : visible.filter((n) => n.type === filter); const dismiss = (id: string) => { const next = new Set(dismissed); next.add(id); setDismissed(next); try { localStorage.setItem(`yumi_mini_notif_dismissed_${storageKey}`, JSON.stringify([...next])); } catch { /* storage unavailable */ } }; const dismissAll = () => { const next = new Set(items.map((n) => n.id)); setDismissed(next); try { localStorage.setItem(`yumi_mini_notif_dismissed_${storageKey}`, JSON.stringify([...next])); } catch { /* storage unavailable */ } }; const sources = [{ label: "Semua", key: "all" as const, icon: <Bell className="h-3 w-3" /> }, { label: "Pengumuman", key: "announcement" as const, icon: <Megaphone className="h-3 w-3" /> }, { label: "Penggajian", key: "payslip" as const, icon: <FileText className="h-3 w-3" /> }, { label: "Izin", key: "leave" as const, icon: <CalendarOff className="h-3 w-3" /> }]; const iconMap: Record<string, React.ReactNode> = { announcement: <Megaphone className="h-4 w-4 text-blue-500" />, payslip: <FileText className="h-4 w-4 text-emerald-500" />, leave: <CalendarOff className="h-4 w-4 text-purple-500" />, info: <Info className="h-4 w-4 text-muted-foreground" /> }; const typeBadge: Record<string, string> = { announcement: "bg-blue-100 text-blue-700", payslip: "bg-emerald-100 text-emerald-700", leave: "bg-purple-100 text-purple-700" }; const openNotification = (n: { id: string; type: string }) => { if (n.type === "payslip") onNavigate("salary"); else if (n.type === "leave") onNavigate("leave"); else dismiss(n.id); }; return <div className="space-y-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Bell className="h-4 w-4 text-blue-600" /><h1 className="text-lg font-bold tracking-tight">Notifikasi</h1>{visible.length > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">{visible.length}</span>}</div>{visible.length > 1 && <button onClick={dismissAll} className="karyawan-control flex items-center gap-1 bg-muted px-3 text-xs font-bold text-muted-foreground"><CheckCheck className="h-3 w-3" /> Tandai Semua Dibaca</button>}</div><div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1">{sources.map((source) => { const active = filter === source.key; const count = source.key === "all" ? visible.length : visible.filter((n) => n.type === source.key).length; return <button key={source.key} onClick={() => setFilter(source.key)} aria-pressed={active} className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${active ? "bg-blue-600 text-white shadow-sm" : "bg-muted text-muted-foreground"}`}>{source.icon}<span>{source.label}</span>{count > 0 && <span className={`ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-black ${active ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>{count}</span>}</button>; })}</div>{filtered.length === 0 ? <div className="karyawan-card border bg-card p-8 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">{filter === "all" ? <CheckCheck className="h-6 w-6 text-emerald-500" /> : <Bell className="h-6 w-6 text-muted-foreground/40" />}</div><p className="text-sm font-bold">{filter === "all" ? "Semua sudah dibaca" : `Tidak ada notifikasi ${sources.find((s) => s.key === filter)?.label.toLowerCase() || ""}`}</p><p className="mt-1 text-xs text-muted-foreground">{filter === "all" ? "Kamu sudah membaca semua notifikasi." : "Belum ada notifikasi jenis ini."}</p></div> : <div className="space-y-2">{filtered.map((n) => <div key={n.id} onClick={() => openNotification(n)} role={n.type === "announcement" ? undefined : "button"} className={`karyawan-card group relative overflow-hidden border bg-card p-4 ${n.type !== "announcement" ? "cursor-pointer active:scale-[.99]" : ""}`}><button onClick={(event) => { event.stopPropagation(); dismiss(n.id); }} aria-label={`Tandai ${n.title} sudah dibaca`} className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="h-3 w-3" /></button><div className="flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">{iconMap[n.type] || iconMap.info}</div><div className="min-w-0 flex-1 pr-4"><div className="flex flex-wrap items-center gap-1.5"><p className="text-xs font-bold">{n.title}</p><span className={`rounded px-1.5 py-0 text-[7px] font-bold uppercase tracking-wider ${typeBadge[n.type] || "bg-gray-100 text-gray-600"}`}>{n.type === "announcement" ? "Info" : n.type === "payslip" ? "Gaji" : n.type === "leave" ? "Izin" : "Info"}</span></div>{n.message && <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{n.message}</p>}<div className="mt-1.5 flex items-center gap-2">{n.date && <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50"><Clock className="h-2.5 w-2.5" />{n.date}</span>}{n.type === "payslip" && <button onClick={(event) => { event.stopPropagation(); onNavigate("salary"); }} className="karyawan-control inline-flex gap-1 bg-primary/10 px-3 text-xs font-bold text-primary">Lihat Slip Gaji <ExternalLink className="h-2.5 w-2.5" /></button>}{n.type === "leave" && <button onClick={(event) => { event.stopPropagation(); onNavigate("leave"); }} className="karyawan-control inline-flex gap-1 bg-primary/10 px-3 text-xs font-bold text-primary">Lihat Izin <ExternalLink className="h-2.5 w-2.5" /></button>}</div></div></div></div>)}</div>}</div>; }
function MiniHomeHeader({ staff }: { staff: StaffInfo }) { const now = new Date(); const hour = now.getHours(); const greeting = hour < 11 ? "Selamat Pagi" : hour < 15 ? "Selamat Siang" : hour < 18 ? "Selamat Sore" : "Selamat Malam"; const time = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }); const date = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" }); return <div className="flex items-start justify-between"><div className="flex min-w-0 items-center gap-2.5"><img src="/logo-djiwa.png" alt="Djiwa Tentram" className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-sm" /><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">TENTREM KOFFIE</p><p className="truncate text-xs font-medium text-muted-foreground">{greeting}, ({time})</p><h1 className="text-lg font-bold tracking-tight [overflow-wrap:anywhere]">{staff.name}</h1><p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">{staff.roleName || "Karyawan"}</p></div></div><div className="flex shrink-0 flex-col items-end gap-0.5">{staff.photoUrl ? <img src={staff.photoUrl} alt={staff.name} className="h-10 w-10 rounded-xl border-2 border-border object-cover shadow-sm" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-border bg-primary/10 text-base font-black text-primary">{staff.name.charAt(0)}</div>}<span className="text-[10px] font-medium text-muted-foreground/60">{date}</span></div></div>; }
function MiniMenuGrid({ onSelect, onTelegram }: { onSelect: (section: WorkspaceSection) => void; onTelegram: () => void }) {
  const items: Array<{ label: string; icon: any; illustration?: Djiwa3DIconName; section?: WorkspaceSection; external?: boolean }> = [
    { label: "Absensi", icon: LogIn, illustration: "employee-attendance-menu", section: "checkin" },
    { label: "Rekap Absensi", icon: NotebookText, illustration: "employee-recap", section: "recap" },
    { label: "Jadwal", icon: CalendarDays, illustration: "employee-schedule-menu", section: "schedule" },
    { label: "Izin/Cuti/Sakit", icon: CalendarOff, illustration: "employee-leave", section: "leave" },
    { label: "Slip Gaji", icon: CircleDollarSign, illustration: "employee-payslip", section: "salary" },
    { label: "Kontrak", icon: FileText, illustration: "employee-contract", section: "contract" },
    { label: "Grup Telegram", icon: Send, illustration: "employee-telegram", external: true },
    { label: "Leaderboard Bonus", icon: Trophy, illustration: "employee-leaderboard", section: "leaderboard" },
  ];
  return <div className="grid grid-cols-4 gap-2 sm:gap-3">{items.map((item) => { const Icon = item.icon; return <button key={item.label} onClick={item.external ? onTelegram : () => onSelect(item.section!)} className="karyawan-card flex min-h-24 min-w-0 flex-col items-center justify-center gap-1 border border-border/60 bg-card p-2 transition-all active:scale-[.97]">{item.illustration ? <Djiwa3DIcon name={item.illustration} size="sm" alt="" className="h-10 w-10 object-contain" /> : <Icon aria-hidden="true" className="h-6 w-6 text-gray-700" strokeWidth={2} />}<span className="text-center text-[11px] font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">{item.label}</span></button>; })}</div>;
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) { return <div className="flex items-start justify-between gap-3 text-[11px]"><span className="shrink-0 text-slate-500">{label}</span><span className="text-right font-bold">{value || "---"}</span></div>; }
function ActionCard({ icon: Icon, label, onClick, tone = "blue" }: { icon: any; label: string; onClick: () => void; tone?: "blue" | "green" | "amber" }) { return <button onClick={onClick} className={`flex min-h-28 flex-col items-start justify-between rounded-3xl p-4 text-left ${tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}><Icon className="h-5 w-5" /><span className="text-sm font-black">{label}</span></button>; }
function Panel({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: any; children: any }) { return <section className="space-y-3"><div className="flex items-center gap-3"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></div><div><h2 className="text-lg font-black">{title}</h2><p className="text-xs text-slate-500">{subtitle}</p></div></div>{children}</section>; }
function LoadingText() { return <div className="rounded-2xl bg-white p-6 text-center text-xs text-slate-500">Memuat data...</div>; }
function EmptyText({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed p-6 text-center text-xs text-slate-500">{text}</div>; }

// ═══════════════════════════════════════════
//  C L O S I N G   F O R M
// ═══════════════════════════════════════════

function ClosingForm({ staff, role, shiftName, openTime, closeTime, linkUid, linkTimestamp, linkSignature }: { staff: StaffInfo; role: "bar" | "kitchen" | null; shiftName: string; openTime: string; closeTime: string; linkUid: string; linkTimestamp: string | number; linkSignature: string }) {
  const [activeTab, setActiveTab] = useState<"opname" | "kebersihan">(role === null ? "kebersihan" : "opname");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);
  const [clockTick, setClockTick] = useState(() => Date.now());

  const opnameRef = useRef<{ getItems: () => OpnameItem[] }>(null);
  const kebersihanRef = useRef<{ getAreas: () => KebersihanArea[] }>(null);
  const needsOpname = role !== null;

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const closeScheduleNotice = useMemo(() => {
    if (!closeTime) return null;
    const [closeHour, closeMinute] = closeTime.split(":").map(Number);
    if (!Number.isFinite(closeHour) || !Number.isFinite(closeMinute)) return null;
    const [openHour, openMinute] = openTime.split(":").map(Number);
    const current = new Date(new Date(clockTick).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const currentMin = current.getHours() * 60 + current.getMinutes();
    const closeMin = closeHour * 60 + closeMinute;
    const openMin = Number.isFinite(openHour) && Number.isFinite(openMinute) ? openHour * 60 + openMinute : -1;
    const beforeClose = openMin >= 0 && openMin > closeMin
      ? currentMin >= openMin || currentMin < closeMin
      : currentMin < closeMin;
    if (!beforeClose) return null;
    return `⏰ Belum waktunya Absen Keluar. Shift ${shiftName} berakhir pukul ${String(closeHour).padStart(2, "0")}:${String(closeMinute).padStart(2, "0")} WIB. Silakan tunggu sampai jam tersebut.`;
  }, [clockTick, closeTime, openTime, shiftName]);

  const userId = staff.sourceId;
  const userName = staff.name;
  const roleName = staff.roleName;

  // ── Telegram MainButton sync ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    if (submitDone) return;

    tg.MainButton.setText(closeScheduleNotice ? `Tunggu sampai ${closeTime} WIB` : "Kirim Laporan Closing");
    tg.MainButton.show();
    if (closeScheduleNotice) tg.MainButton.disable(); else tg.MainButton.enable();
    tg.MainButton.onClick(handleSubmit);

    return () => {
      tg.MainButton.offClick(handleSubmit);
    };
  }, [submitDone, activeTab, closeScheduleNotice, closeTime]);

  // ── Show/update MainButton ──
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg || submitDone) return;

    if (isSubmitting) {
      tg.MainButton.setText("Menyimpan...");
      tg.MainButton.disable();
    } else {
      tg.MainButton.setText(closeScheduleNotice ? `Tunggu sampai ${closeTime} WIB` : "Kirim Laporan Closing");
      if (closeScheduleNotice) tg.MainButton.disable(); else tg.MainButton.enable();
    }
  }, [isSubmitting, submitDone, closeScheduleNotice, closeTime]);

  // ── Handle submit ──
  async function handleSubmit() {
    if (submitInFlightRef.current || submitDone) return;
    submitInFlightRef.current = true;
    setSubmitError(null);
    setSubmitNotice(closeScheduleNotice);
    if (closeScheduleNotice) return;
    const areasKebersihan = kebersihanRef.current?.getAreas() ?? [];
    const uncheckedAreas = areasKebersihan.filter((area) => area.status === "belum_dicek");
    if (uncheckedAreas.length > 0) {
      setSubmitError(`Pilih status kebersihan untuk: ${uncheckedAreas.map((area) => area.label).join(", ")}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const opnameItems = opnameRef.current?.getItems() ?? [];
      const markedChanged = opnameItems.filter(
        (i) => Math.abs(i.qtyAfter - i.qtyBefore) > 0.01
      );

      // Kebersihan: kecilkan foto lalu ikutkan ke payload. Sebelumnya data ini
      // hanya hidup di state dan hilang begitu submit, padahal layar sukses
      // sudah terlanjur bilang "kebersihan tersimpan".
      const kebersihan = await Promise.all(
        areasKebersihan.map(async (a) => ({
          id: a.id,
          label: a.label,
          status: a.status,
          catatan: a.catatan,
          ...(a.fotoFile ? await prepareKebersihanPhoto(a.fotoFile) : {}),
        })),
      );

      const result = await submitClosingViaEdge({
        userId,
        userName,
        roleName,
        shiftName,
        role,
        items: markedChanged.length > 0 ? markedChanged : opnameItems,
        source: "telegram_mini_app",
        kebersihan,
        linkUid,
        linkTimestamp,
        linkSignature,
      });

      setSubmitDone(true);

      // Close Mini App after 1.5s delay
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.MainButton.setText("Selesai, menutup...");
        setTimeout(() => tg.close(), 1500);
      }
    } catch (err: any) {
      const msg = err?.message || err?.toString() || "Terjadi kesalahan";
      if (err instanceof ClosingSubmitError && err.code === "BEFORE_CLOSE_TIME") {
        setSubmitNotice(`⏰ ${msg.replace(/^Closing belum bisa\.\s*/i, "Absen keluar belum tersedia. ")}`);
        setSubmitError(null);
      } else {
        setSubmitError(msg);
        setSubmitNotice(null);
      }
      console.error("[mini] handleSubmit error:", err);
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Mini header */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div>
            <p className="font-black text-xs tracking-tight">Closing Shift</p>
            <p className="text-[11px] text-muted-foreground font-semibold">
              {userName} • {roleName} • {shiftName}
            </p>
          </div>
          {submitDone && (
            <span className="ml-auto rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 flex items-center gap-1">
              <Check className="h-3 w-3" /> Selesai
            </span>
          )}
        </div>

        {closeScheduleNotice && !submitDone && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 shadow-sm"
          >
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Clock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-amber-900">Belum waktunya Absen Keluar</p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                  Shift {shiftName} berakhir pukul <strong>{closeTime} WIB</strong>. Silakan tunggu sampai waktunya.
                </p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-amber-700">Tombol kirim akan aktif otomatis</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Error banner */}
        {submitError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-rose-50 border border-rose-200 p-3 mt-3"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
              <p className="text-xs text-rose-700">{submitError}</p>
            </div>
          </motion.div>
        )}

        {submitNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-amber-50 border border-amber-200 p-3 mt-3"
          >
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800">{submitNotice}</p>
            </div>
          </motion.div>
        )}


        {/* Success banner */}
        {submitDone && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 mt-3 text-center"
          >
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 mb-1">
              <Check className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="font-bold text-sm text-emerald-800">Absen Keluar Berhasil!</p>
            <p className="text-xs text-emerald-600 mt-0.5">Laporan closing tersimpan.</p>
            <p className="text-[10px] text-emerald-500 mt-1">Menutup otomatis...</p>
          </motion.div>
        )}
      </div>

      {/* Tabs */}
      {!submitDone && (
        <div className="shrink-0 px-4 pt-3">
          <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
            {needsOpname && (
              <button
                onClick={() => setActiveTab("opname")}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] py-2 text-[11px] font-bold transition-all ${
                  activeTab === "opname"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ClipboardList className="h-4 w-4" /> Stock Opname
              </button>
            )}
            <button
              onClick={() => setActiveTab("kebersihan")}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] py-2 text-[11px] font-bold transition-all ${
                activeTab === "kebersihan"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Brush className="h-4 w-4" /> Kebersihan
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {!submitDone && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {activeTab === "opname" && needsOpname && (
            <StockOpnameSection ref={opnameRef} role={role!} mini onSave={() => void handleSubmit()} />
          )}
          {activeTab === "kebersihan" && (
            <KebersihanSection ref={kebersihanRef} onSave={() => void handleSubmit()} />
          )}
        </div>
      )}

      {/* Padding for Telegram safe area */}
      <div className="h-4 shrink-0" />
    </div>
  );
}

// ═══════════════════════════════════════════
//  STOCK OPNAME SECTION (reused)
// ═══════════════════════════════════════════

const StockOpnameSection = forwardRef<{ getItems: () => OpnameItem[] }, { role: "bar" | "kitchen"; mini?: boolean; onSave?: () => void }>(
  function StockOpnameSection({ role, mini, onSave }, ref) {
    const [items, setItems] = useState<OpnameItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [allSame, setAllSame] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const targetNames = role === "bar" ? BAR_INGREDIENTS : KITCHEN_INGREDIENTS;
    const RoleIcon = role === "bar" ? Coffee : ChefHat;
    const roleLabel = role === "bar" ? "BAR" : "KITCHEN";

    useEffect(() => {
      const load = async () => {
        try {
          setLoading(true);
          const supabase = createClient();
          const { data: inventory, error: invErr } = await supabase
            .schema("pos")
            .from("inventory")
            .select("source_id, ingredient_name, quantity, unit")
            .limit(500);

          if (invErr) throw invErr;

          const mapped: OpnameItem[] = (inventory || [])
            .filter((i: any) => targetNames.has((i.ingredient_name || "").trim()))
            .map((i: any) => ({
              inventoryId: i.source_id,
              name: (i.ingredient_name || "").trim(),
              unit: (i.unit || "").trim(),
              qtyBefore: parseFloat(i.quantity || "0"),
              qtyAfter: parseFloat(i.quantity || "0"),
            }))
            .sort((a: OpnameItem, b: OpnameItem) => a.name.localeCompare(b.name));

          setItems(mapped);
        } catch (err: any) {
          setError(err?.message || "Gagal memuat data stok");
        } finally {
          setLoading(false);
        }
      };
      load();
    }, [role]);

    useImperativeHandle(ref, () => ({
      getItems: () => items.map((i) => ({
        ...i,
        isChanged: Math.abs(i.qtyAfter - i.qtyBefore) > 0.01,
      })),
    }));

    const updateQty = (index: number, qty: number) => {
      setItems((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], qtyAfter: Math.max(0, qty) };
        return next;
      });
      setAllSame(false);
    };

    const markAllSame = () => {
      setItems((prev) =>
        prev.map((item) => ({ ...item, qtyAfter: item.qtyBefore }))
      );
      setAllSame(true);
    };

    const changedItems = items.filter(
      (i) => Math.abs(i.qtyAfter - i.qtyBefore) > 0.01
    );
    const filtered = searchQuery
      ? items.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : items;

    const lowStock = items.filter((i) => i.qtyAfter > 0 && i.qtyAfter <= 3);

    if (loading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Memuat data stok...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-rose-700">Gagal memuat data</p>
          <p className="text-xs text-rose-500 mt-1">{error}</p>
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        {/* Header card */}
        <div className="rounded-xl bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-bold text-xs"><RoleIcon className="h-3.5 w-3.5" /> {roleLabel} Stock Opname</p>
              <p className="text-[11px] text-muted-foreground">
                {items.length} bahan — {changedItems.length} berubah
              </p>
            </div>
            {allSame && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <Check className="h-3 w-3" /> Sama
              </span>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <button onClick={markAllSame} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-border bg-background px-3 py-2 text-[11px] font-bold hover:bg-muted">
            <Check className="h-3.5 w-3.5" /> Semua Sama
          </button>
          <button onClick={() => { setSaved(true); onSave?.(); }} className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-emerald-500 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600">
            <Save className="h-3.5 w-3.5" /> Simpan & Kirim
          </button>
        </div>

        {saved && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-center">
            <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-blue-700"><Check className="h-3.5 w-3.5" /> Opname tersimpan sementara.</p>
          </motion.div>
        )}

        {/* Info banner (compact for mini) */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
          <p className="flex items-start gap-1 text-[11px] font-medium text-amber-700 leading-relaxed">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Hanya <strong>orang terakhir</strong> yang absen keluar perubahannya diterapkan ke stok.</span>
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari bahan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full rounded-[14px] border border-border bg-background py-2 pl-9 pr-11 text-xs outline-none transition-all focus:ring-2 focus:ring-primary/20"
          />
          {searchQuery && (
            <button aria-label="Hapus pencarian" onClick={() => setSearchQuery("")} className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[14px] text-muted-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Stock list */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <p className="text-xs text-muted-foreground">{searchQuery ? "Bahan tidak ditemukan" : "Tidak ada data stok"}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((item, idx) => {
              const globalIdx = items.findIndex((i) => i.inventoryId === item.inventoryId);
              const diff = item.qtyAfter - item.qtyBefore;
              const isChanged = Math.abs(diff) > 0.01;

              return (
                <div key={item.inventoryId} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 transition-all ${
                  isChanged ? "border-amber-200 bg-amber-50/50" : "border-border bg-background"
                }`}>
                  <span className="w-5 text-[11px] font-bold text-muted-foreground text-right shrink-0">{globalIdx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.qtyBefore} {item.unit}
                      {isChanged && (
                        <span className={`ml-1 font-bold ${diff < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                          → {item.qtyAfter} ({diff > 0 ? "+" : ""}{diff})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => updateQty(globalIdx, item.qtyAfter - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-xs font-bold hover:bg-muted">−</button>
                    <input type="number" value={item.qtyAfter}
                      onChange={(e) => updateQty(globalIdx, parseFloat(e.target.value) || 0)}
                      className="h-6 w-12 rounded-md border border-border bg-background text-center text-[11px] font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min={0} step={1} />
                    <button onClick={() => updateQty(globalIdx, item.qtyAfter + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-xs font-bold hover:bg-muted">+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Low stock */}
        {lowStock.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-widest mb-1">Stok Menipis</p>
            {lowStock.slice(0, 3).map((item) => (
              <p key={item.name} className="text-[10px] text-amber-700">• {item.name} — {item.qtyAfter}</p>
            ))}
            {lowStock.length > 3 && <p className="text-[11px] text-amber-500">+{lowStock.length - 3} lainnya</p>}
          </div>
        )}
      </div>
    );
  }
);

// ═══════════════════════════════════════════
//  KEBERSIHAN SECTION (reused)
// ═══════════════════════════════════════════

const KebersihanSection = forwardRef<{ getAreas: () => KebersihanArea[] }, { onSave?: () => void }>(function KebersihanSection({ onSave }, ref) {
  const [areas, setAreas] = useState<KebersihanArea[]>(AREAS_KEBERSIHAN);
  const [saved, setSaved] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useImperativeHandle(ref, () => ({
    getAreas: () => areas,
  }));

  const updateStatus = (id: string, status: "bersih" | "perlu_perbaikan") => {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  const updateCatatan = (id: string, catatan: string) => {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, catatan } : a)));
  };

  const handleFileSelect = (id: string, file: File | null) => {
    if (!file) return;
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, foto: URL.createObjectURL(file), fotoFile: file } : a)));
  };

  const triggerFileInput = (id: string) => fileInputRefs.current[id]?.click();

  const checkedCount = areas.filter((a) => a.status !== "belum_dicek").length;
  const photoCount = areas.filter((a) => a.foto !== null).length;

  return (
    <div className="space-y-2.5">
      <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="flex items-center gap-1 font-bold text-xs"><Brush className="h-3.5 w-3.5" /> Checklist Kebersihan</p>
            <p className="text-[11px] text-muted-foreground">{checkedCount}/3 status dipilih · {photoCount}/3 foto</p>
          </div>
        </div>
      </div>

      {areas.map((area) => {
        const AreaIcon = KEBERSIHAN_ICONS[area.icon];
        return (
        <div key={area.id} className={`rounded-xl border p-3 transition-all ${
          area.status === "perlu_perbaikan" ? "border-amber-200 bg-amber-50/30" :
          area.foto ? "border-emerald-200 bg-emerald-50/30" : "border-border bg-background"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <AreaIcon className="h-4 w-4 text-muted-foreground" />
              <p className="font-bold text-xs">{area.label}</p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => updateStatus(area.id, "bersih")}
                className={`inline-flex min-h-11 items-center gap-1 rounded-[14px] px-2 py-1 text-[11px] font-bold transition-all ${
                  area.status === "bersih" ? "bg-emerald-500 text-white shadow-sm" : "bg-muted text-muted-foreground"
                }`}><Check className="h-3.5 w-3.5" /> Bersih</button>
              <button onClick={() => updateStatus(area.id, "perlu_perbaikan")}
                className={`inline-flex min-h-11 items-center gap-1 rounded-[14px] px-2 py-1 text-[11px] font-bold transition-all ${
                  area.status === "perlu_perbaikan" ? "bg-amber-500 text-white shadow-sm" : "bg-muted text-muted-foreground"
                }`}><AlertTriangle className="h-3.5 w-3.5" /> Perlu</button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {area.foto ? (
              <div className="relative">
                <img src={area.foto} alt={area.label} className="h-12 w-12 rounded-lg object-cover border" />
                <button aria-label={`Ganti foto ${area.label}`} onClick={() => triggerFileInput(area.id)} className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-white shadow">
                  <Camera className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <button aria-label={`Tambah foto ${area.label}`} onClick={() => triggerFileInput(area.id)} className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50">
                <Camera className="h-5 w-5" />
              </button>
            )}
            <input ref={(el) => { fileInputRefs.current[area.id] = el; }}
              type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => handleFileSelect(area.id, e.target.files?.[0] || null)} />
            <input type="text" placeholder="Catatan" value={area.catatan}
              onChange={(e) => updateCatatan(area.id, e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50" />
          </div>
        </div>
        );
      })}

      <button onClick={() => { setSaved(true); onSave?.(); }}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[14px] bg-emerald-500 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 active:scale-[0.98]">
        <Save className="h-3.5 w-3.5" /> Simpan & Kirim Laporan Closing
      </button>

      {saved && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-center">
          <p className="flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-700"><Check className="h-3.5 w-3.5" /> Pemeriksaan tersimpan</p>
          <p className="mt-1 text-[10px] font-medium text-emerald-700">Data pemeriksaan sudah dikirim. Jika belum waktunya, laporan akan menunggu sampai jadwal closing.</p>
        </motion.div>
      )}
    </div>
  );
});
