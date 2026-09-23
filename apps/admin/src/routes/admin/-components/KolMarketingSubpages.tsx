import { BarChart3, CheckCircle2, Clock3, Mail, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { isAdminLevelRole } from "@/lib/admin-access";

type KolRow = { source_id: string; name: string; username: string; category: string; status: string; created_at?: string | null; application_data?: { collaboration?: string; barter?: string } | null; kol_platforms?: Array<{ platform?: string; followers?: number }> };
const STATUSES = ["Potential", "Belum Dihubungi", "Sudah Dihubungi", "Negotiation", "Scheduled Visit", "Collaboration", "Completed", "Rejected"];
const API_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/kol-public`;

async function listKols(token: string) {
  const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "admin_list" }) });
  const body = (await response.json().catch(() => ({}))) as { data?: KolRow[]; error?: string };
  if (!response.ok || body.error) throw new Error(body.error || `Request gagal (${response.status})`);
  return body.data ?? [];
}

function Shell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 sm:p-6"><header><p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">KOL MARKETING APP</p><h1 className="mt-1 text-2xl font-black tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></header>{children}</div>;
}

function useKols() {
  const { token, isAdmin, role } = useYumiAuth();
  const canManage = isAdmin || isAdminLevelRole(role?.name);
  const [rows, setRows] = useState<KolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { if (!token || !canManage) { setLoading(false); return; } void listKols(token).then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat data KOL.")).finally(() => setLoading(false)); }, [token, canManage]);
  return { rows, loading, error };
}

export function KolCollaborationsPage() {
  const { rows, loading, error } = useKols();
  if (loading) return <Shell title="Kolaborasi" description="Pipeline kerja sama creator berdasarkan status aktual."><div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Memuat pipeline kolaborasi…</div></Shell>;
  if (error) return <Shell title="Kolaborasi" description="Pipeline kerja sama creator berdasarkan status aktual."><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div></Shell>;
  return <Shell title="Kolaborasi" description="Pipeline kerja sama creator berdasarkan status aktual."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{STATUSES.map((status) => { const items = rows.filter((row) => row.status === status); return <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" key={status}><div className="flex items-center justify-between"><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700">{status}</span><strong className="text-lg">{items.length || "—"}</strong></div><div className="mt-4 space-y-2">{items.slice(0, 5).map((row) => <div className="rounded-xl bg-muted/50 p-3" key={row.source_id}><p className="truncate text-sm font-bold">{row.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{row.application_data?.collaboration || row.application_data?.barter || "Belum ada brief"}</p></div>)}{items.length > 5 && <p className="text-xs text-muted-foreground">+{items.length - 5} creator lainnya</p>}</div></section>; })}</div></Shell>;
}

export function KolReportsPage() {
  const { rows, loading, error } = useKols();
  const categories = useMemo(() => Array.from(new Set(rows.map((row) => row.category).filter(Boolean))).sort(), [rows]);
  const followers = useMemo(() => rows.reduce((sum, row) => sum + Number(row.kol_platforms?.[0]?.followers || 0), 0), [rows]);
  if (loading) return <Shell title="Laporan" description="Distribusi creator, platform, dan status pipeline."><div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Memuat laporan…</div></Shell>;
  if (error) return <Shell title="Laporan" description="Distribusi creator, platform, dan status pipeline."><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div></Shell>;
  return <Shell title="Laporan" description="Distribusi creator, platform, dan status pipeline."><div className="grid gap-3 sm:grid-cols-3"><Metric label="Total creator" value={rows.length} icon={Users} /><Metric label="Total followers" value={followers.toLocaleString("id-ID")} icon={Sparkles} /><Metric label="Selesai kolaborasi" value={rows.filter((row) => row.status === "Completed").length || "—"} icon={CheckCircle2} /></div><div className="grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="flex items-center gap-2 text-sm font-black"><BarChart3 className="h-4 w-4 text-sky-600" />Distribusi status</h2><div className="mt-4 space-y-3">{STATUSES.map((status) => { const count = rows.filter((row) => row.status === status).length; return <div key={status}><div className="flex justify-between text-xs"><span>{status}</span><strong>{count || "—"}</strong></div><div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-sky-500" style={{ width: `${rows.length ? Math.max(2, count / rows.length * 100) : 2}%` }} /></div></div>; })}</div></section><section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="flex items-center gap-2 text-sm font-black"><Mail className="h-4 w-4 text-violet-600" />Kategori creator</h2><div className="mt-4 divide-y divide-border">{categories.length ? categories.map((category) => <div className="flex justify-between py-2.5 text-sm" key={category}><span>{category}</span><strong>{rows.filter((row) => row.category === category).length}</strong></div>) : <p className="py-6 text-center text-xs text-muted-foreground">Belum ada kategori.</p>}</div></section></div></Shell>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) { return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><Icon className="h-4 w-4 text-sky-600" /><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>; }
