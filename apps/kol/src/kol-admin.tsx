import { useEffect, useMemo, useState } from "react";
import { createAuthClient } from "better-auth/react";
import { CalendarDays, Check, Clock3, LogOut, RefreshCw, Search, ShieldCheck, Users, X } from "lucide-react";

const AUTH_BASE = "https://api.djiwatentram.web.id/v1/auth";
const API_BASE = "https://api.djiwatentram.web.id/v1/kol/admin";
const authClient = createAuthClient({ baseURL: AUTH_BASE, fetchOptions: { credentials: "include" } });

type Creator = {
  source_id: string; name: string; username: string; location: string; category: string; status: string;
  public_reason?: string | null; application_data?: Record<string, unknown>; visit_booking_eligible: boolean;
  visit_booking_eligible_at?: string | null; visit_booking_eligibility_note?: string | null;
  platform?: string | null; profile_url?: string | null; followers?: number | null; email?: string | null; whatsapp?: string | null;
};
type Visit = {
  id: number; kol_id: string; name: string; username: string; booking_date: string; booking_time: string | null;
  status: string; admin_note?: string | null; consent_terms: boolean; consent_attendance: boolean;
  consent_version: string | null; consented_at: string | null; email?: string | null; whatsapp?: string | null;
};
type AdminSession = { name: string; role: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.error || `Request gagal (${response.status})`);
  return body.data as T;
}

const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(value));
}
function errorText(error: unknown) { return error instanceof Error ? error.message : "Permintaan belum berhasil."; }

export default function KolAdminApp() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const current = await request<AdminSession>("/session");
      setSession(current); setDenied(false);
      const [creatorRows, visitRows] = await Promise.all([request<Creator[]>("/creators"), request<Visit[]>("/visits")]);
      setCreators(creatorRows); setVisits(visitRows);
    } catch (e) {
      const message = errorText(e);
      setSession(null); setDenied(message === "FORBIDDEN");
      if (message !== "UNAUTHORIZED" && message !== "FORBIDDEN") setError(message);
    } finally { setLoading(false); setChecking(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => creators.filter((creator) => {
    const text = `${creator.name} ${creator.username} ${creator.location} ${creator.category} ${creator.email || ""}`.toLowerCase();
    return (statusFilter === "all" || creator.status === statusFilter) && text.includes(query.trim().toLowerCase());
  }), [creators, query, statusFilter]);

  const login = async () => {
    setError("");
    const result = await authClient.signIn.social({ provider: "google", callbackURL: `${window.location.origin}/admin` });
    if (result.error) setError(result.error.message || "Login Google belum berhasil dibuka.");
    else if (result.data?.url) window.location.assign(result.data.url);
    else setError("URL login Google tidak diterima server.");
  };
  const logout = async () => {
    await authClient.signOut();
    window.location.assign("/admin");
  };
  const toggleEligibility = async (creator: Creator) => {
    const eligible = !creator.visit_booking_eligible;
    if (!eligible && !window.confirm(`Cabut akses booking untuk ${creator.name}? Jadwal yang sudah ada tidak dihapus.`)) return;
    setBusy(`eligibility:${creator.source_id}`); setError(""); setNotice("");
    try {
      await request(`/creators/${encodeURIComponent(creator.source_id)}/eligibility`, {
        method: "PATCH", body: JSON.stringify({ eligible }),
      });
      setNotice(`Akses booking ${eligible ? "dibuka untuk" : "dicabut dari"} ${creator.name}.`);
      await load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(""); }
  };
  const updateVisit = async (visit: Visit, status: string) => {
    const label = status === "cancelled" ? "Batalkan" : status === "confirmed" ? "Konfirmasi" : status === "completed" ? "Tandai selesai" : "Tandai tidak hadir";
    if (!window.confirm(`${label} jadwal kunjungan ${visit.name} pada ${dateLabel(visit.booking_date)}?`)) return;
    setBusy(`visit:${visit.id}`); setError(""); setNotice("");
    try {
      await request(`/visits/${visit.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setNotice(`Status jadwal ${visit.name} diperbarui.`);
      await load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(""); }
  };

  if (checking) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Memeriksa sesi admin...</main>;
  if (!session) return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8 text-slate-900"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl"><img src="/logo-djiwa.png" alt="Djiwa Tentram" className="mx-auto h-14 w-14 rounded-2xl"/><p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-blue-700">Workspace privat</p><h1 className="mt-2 text-2xl font-extrabold">Admin KOL Marketing</h1><p className="mt-3 text-sm leading-6 text-slate-500">Masuk menggunakan akun Google admin Djiwa Tentram. Akses diverifikasi ulang oleh server.</p>{denied && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">Akun ini belum memiliki role Admin.</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button onClick={() => void login()} className={`${button} mt-6 w-full bg-blue-700 text-white`}>Masuk dengan Google</button><a href="/" className="mt-4 block text-xs font-semibold text-slate-500">Kembali ke Portal KOL</a></section></main>;

  const statusOptions = [...new Set(creators.map((creator) => creator.status))].sort();
  const upcoming = visits.filter((visit) => ["requested", "confirmed"].includes(visit.status));
  return <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900 sm:px-7 sm:py-8">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3"><img src="/logo-djiwa.png" alt="" className="h-11 w-11 rounded-xl"/><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-blue-700">Djiwa Tentram · KOL Marketing</p><h1 className="mt-1 text-xl font-extrabold sm:text-2xl">Workspace Admin</h1><p className="mt-1 text-xs text-slate-500">Halo, {session.name || "Admin"} · Role {session.role}</p></div></div>
        <div className="flex gap-2"><button onClick={() => void load()} disabled={loading} className={`${button} border border-slate-200 bg-white text-slate-700`}><RefreshCw size={15} className={loading ? "animate-spin" : ""}/>Refresh</button><button onClick={() => void logout()} className={`${button} border border-slate-200 bg-white text-slate-700`}><LogOut size={15}/>Keluar</button></div>
      </header>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
      <section className="grid gap-3 sm:grid-cols-3"><div className={card}><p className="text-xs font-semibold text-slate-500">Total pendaftar</p><p className="mt-2 text-3xl font-extrabold tabular-nums">{creators.length}</p></div><div className={card}><p className="text-xs font-semibold text-slate-500">Eligible booking</p><p className="mt-2 text-3xl font-extrabold tabular-nums text-blue-700">{creators.filter((creator) => creator.visit_booking_eligible).length}</p></div><div className={card}><p className="text-xs font-semibold text-slate-500">Jadwal aktif</p><p className="mt-2 text-3xl font-extrabold tabular-nums text-emerald-700">{upcoming.length}</p></div></section>
      <section className={`${card} space-y-4`}>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-blue-700"><Users size={15}/>Review pendaftar</p><h2 className="mt-1 text-lg font-extrabold">Akses kalender visit</h2><p className="mt-1 text-xs leading-5 text-slate-500">Link bersama: <a className="font-semibold text-blue-700 underline" href="/visit" target="_blank" rel="noreferrer">kolmarketing.djiwatentram.web.id/visit</a>. Hanya creator yang diizinkan dapat booking.</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><label className="relative min-w-48 flex-1 sm:flex-none"><Search size={15} className="absolute left-3 top-3 text-slate-400"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama / username" className="min-h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500"/></label><select aria-label="Filter status pendaftaran" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold"><option value="all">Semua status</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></div></div>
        {loading ? <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Memuat data KOL...</div> : filtered.length === 0 ? <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Tidak ada pendaftar untuk filter ini.</div> : <div className="space-y-3">{filtered.map((creator) => <article key={creator.source_id} className="grid gap-4 rounded-2xl border border-slate-200 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{creator.name}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{creator.status}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${creator.visit_booking_eligible ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{creator.visit_booking_eligible ? "Eligible visit" : "Belum eligible"}</span></div><p className="mt-1 text-sm text-slate-600">@{creator.username} · {creator.location} · {creator.category}</p><p className="mt-1 text-xs text-slate-500">{creator.platform || "Platform"}{creator.followers ? ` · ${Number(creator.followers).toLocaleString("id-ID")} followers` : ""}{creator.email ? ` · ${creator.email}` : ""}{creator.whatsapp ? ` · WA ${creator.whatsapp}` : ""}</p>{creator.public_reason && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{creator.public_reason}</p>}{creator.visit_booking_eligibility_note && <p className="mt-2 text-[11px] text-slate-500">Catatan eligibility: {creator.visit_booking_eligibility_note}</p>}</div><button disabled={busy === `eligibility:${creator.source_id}` || (creator.status === "Rejected" && !creator.visit_booking_eligible)} onClick={() => void toggleEligibility(creator)} className={`${button} ${creator.visit_booking_eligible ? "border border-red-200 bg-white text-red-700" : "bg-blue-700 text-white"}`}><ShieldCheck size={15}/>{busy === `eligibility:${creator.source_id}` ? "Menyimpan..." : creator.visit_booking_eligible ? "Cabut akses booking" : "Izinkan booking"}</button></article>)}</div>}
      </section>
      <section className={`${card} space-y-4`}>
        <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-emerald-700"><CalendarDays size={15}/>Kalender bersama</p><h2 className="mt-1 text-lg font-extrabold">Jadwal kunjungan KOL</h2><p className="mt-1 text-xs text-slate-500">Persetujuan dan waktu WIB tersimpan sebagai audit. Membatalkan jadwal membebaskan tanggal tanpa menghapus histori.</p></div>
        {loading ? <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Memuat kalender...</div> : visits.length === 0 ? <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Belum ada booking.</div> : <div className="grid gap-3 md:grid-cols-2">{visits.map((visit) => <article key={visit.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold">{visit.name} <span className="font-normal text-slate-500">@{visit.username}</span></h3><p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><CalendarDays size={15}/>{dateLabel(visit.booking_date)}{visit.booking_time && <><Clock3 size={14}/>{String(visit.booking_time).slice(0,5)} WIB</>}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">{visit.status}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>{visit.consent_terms && visit.consent_attendance ? `Consent ${visit.consent_version || "tersimpan"}` : "Booking legacy tanpa consent"}</span>{visit.consented_at && <span>{new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(visit.consented_at))} WIB</span>}{visit.email && <span>{visit.email}</span>}{visit.whatsapp && <span>WA {visit.whatsapp}</span>}</div>{visit.admin_note && <p className="mt-2 text-xs text-slate-500">Catatan: {visit.admin_note}</p>}{["requested","confirmed"].includes(visit.status) && <div className="mt-4 flex flex-wrap gap-2">{visit.status === "requested" && <button disabled={busy === `visit:${visit.id}`} onClick={() => void updateVisit(visit,"confirmed")} className={`${button} bg-emerald-700 text-white`}><Check size={14}/>Konfirmasi</button>}{visit.status === "confirmed" && <><button disabled={busy === `visit:${visit.id}`} onClick={() => void updateVisit(visit,"completed")} className={`${button} bg-blue-700 text-white`}><Check size={14}/>Tandai selesai</button><button disabled={busy === `visit:${visit.id}`} onClick={() => void updateVisit(visit,"no_show")} className={`${button} border border-slate-200 bg-white text-slate-700`}>Tidak hadir</button></>}<button disabled={busy === `visit:${visit.id}`} onClick={() => void updateVisit(visit,"cancelled")} className={`${button} border border-red-200 bg-white text-red-700`}><X size={14}/>Batalkan</button></div>}</article>)}</div>}
      </section>
      <footer className="pb-6 text-center text-[11px] text-slate-400">Data privat hanya dimuat setelah role Admin diverifikasi oleh API.</footer>
    </div>
  </main>;
}
