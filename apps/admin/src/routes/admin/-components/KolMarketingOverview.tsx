import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BarChart3, CheckCircle2, Clock3, Layers3, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { isAdminLevelRole } from "@/lib/admin-access";

type Platform = { platform?: string; followers?: number };
type KolRow = { source_id: string; name: string; username: string; category: string; status: string; created_at?: string | null; kol_platforms?: Platform[] };
const API_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/kol-public`;
const STATUSES = ["Potential", "Belum Dihubungi", "Sudah Dihubungi", "Negotiation", "Scheduled Visit", "Collaboration", "Completed", "Rejected"];

async function listKols(token: string) {
  const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "admin_list" }) });
  const body = (await response.json().catch(() => ({}))) as { data?: KolRow[]; error?: string };
  if (!response.ok || body.error) throw new Error(body.error || `Request gagal (${response.status})`);
  return body.data ?? [];
}

function number(value: number) { return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0); }
function MetricCard({ label, value, detail, icon: Icon, tone, to }: { label: string; value: string | number; detail: string; icon: typeof Users; tone: string; to: string }) {
  return <Link to={to as any} className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span></div><span className="mt-4 inline-flex items-center gap-1 text-[11px] font-black text-primary">Buka data <ArrowUpRight className="h-3 w-3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span></Link>;
}

export function KolMarketingOverview() {
  const { token, isAdmin, role } = useYumiAuth();
  const canManage = isAdmin || isAdminLevelRole(role?.name);
  const [rows, setRows] = useState<KolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { if (!token || !canManage) { setLoading(false); return; } let active = true; setLoading(true); void listKols(token).then((data) => { if (active) setRows(data); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Gagal memuat dashboard KOL."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [token, canManage]);
  const followers = useMemo(() => rows.reduce((sum, row) => sum + Number(row.kol_platforms?.reduce((total, platform) => total + Number(platform.followers || 0), 0) || 0), 0), [rows]);
  const completed = rows.filter((row) => row.status === "Completed").length;
  const activeCollaborations = rows.filter((row) => ["Collaboration", "Scheduled Visit", "Negotiation"].includes(row.status)).length;
  const categories = useMemo(() => Array.from(new Set(rows.map((row) => row.category).filter(Boolean))).length, [rows]);
  const topCreators = useMemo(() => [...rows].sort((a, b) => Number(b.kol_platforms?.[0]?.followers || 0) - Number(a.kol_platforms?.[0]?.followers || 0)).slice(0, 5), [rows]);
  const statusCounts = useMemo(() => STATUSES.map((status) => ({ status, count: rows.filter((row) => row.status === status).length })), [rows]);

  return <section className="mb-5 space-y-5 rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm md:p-5">
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-sky-700"><Sparkles className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-[0.18em]">KOL MARKETING APP</span></div><h1 className="mt-1 text-xl font-black tracking-tight md:text-2xl">Dashboard KOL Marketing</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Ringkasan creator, jangkauan audiens, dan pipeline kolaborasi berdasarkan data KOL aktual.</p></div><Link to="/admin/kol-data" className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-3 text-xs font-black text-sky-700 shadow-sm">Kelola data KOL <ArrowUpRight className="h-3.5 w-3.5" /></Link></header>
    {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Total creator" value={loading ? "—" : rows.length} detail="database KOL aktif" icon={Users} tone="bg-sky-100 text-sky-700" to="/admin/kol-data" /><MetricCard label="Total followers" value={loading ? "—" : number(followers)} detail="seluruh platform creator" icon={BarChart3} tone="bg-violet-100 text-violet-700" to="/admin/kol-reports" /><MetricCard label="Pipeline aktif" value={loading ? "—" : activeCollaborations} detail="negosiasi sampai kunjungan" icon={Clock3} tone="bg-indigo-100 text-indigo-700" to="/admin/kol-collaborations" /><MetricCard label="Kolaborasi selesai" value={loading ? "—" : completed} detail={`${categories} kategori creator`} icon={CheckCircle2} tone="bg-emerald-100 text-emerald-700" to="/admin/kol-reports" /></div>
      {!loading && <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-black"><Users className="h-4 w-4 text-sky-600" />Top creator berdasarkan followers</h2><Link to="/admin/kol-data" className="text-[11px] font-black text-primary">Lihat semua</Link></div><div className="mt-3 divide-y divide-border">{topCreators.length ? topCreators.map((row) => <div className="flex items-center justify-between gap-3 py-2.5" key={row.source_id}><div className="min-w-0"><p className="truncate text-sm font-bold">{row.name}</p><p className="truncate text-xs text-muted-foreground">@{row.username} · {row.category || "Tanpa kategori"}</p></div><span className="shrink-0 text-xs font-black text-violet-700">{number(Number(row.kol_platforms?.[0]?.followers || 0))}</span></div>) : <p className="py-6 text-center text-xs text-muted-foreground">Belum ada data creator.</p>}</div></section><section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="flex items-center gap-2 text-sm font-black"><Layers3 className="h-4 w-4 text-violet-600" />Pipeline kolaborasi</h2><div className="mt-3 space-y-2.5">{statusCounts.map(({ status, count }) => <div key={status}><div className="flex justify-between text-xs"><span>{status}</span><strong>{count}</strong></div><div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${rows.length ? Math.max(count ? 4 : 0, count / rows.length * 100) : 0}%` }} /></div></div>)}</div></section></div>}
    </>}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sky-100 pt-3 text-[11px] font-semibold text-muted-foreground"><span>Data live dari database KOL</span><span className="inline-flex items-center gap-1 text-emerald-700">● Tanpa metrik operasional yang tidak teratribusi</span><Link to="/admin/kol-collaborations" className="font-black text-primary">Kelola pipeline <ArrowUpRight className="inline h-3 w-3" /></Link></div>
  </section>;
}
