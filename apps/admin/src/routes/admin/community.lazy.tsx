import { createLazyFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldAlert, Trash2, EyeOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { Button } from "@/components/ui/button";

type Report = { id: string; post_id: string; reporter_source_id: string; reason: string; status: string; created_at: string };
const API_BASE = (import.meta.env.VITE_CUSTOMER_COMMUNITY_API_URL?.trim() || "https://djiwa-customer-community.zantaratechnology.workers.dev").replace(/\/$/, "");

export const Route = createLazyFileRoute("/admin/community")({ component: CommunityModerationPage });

function CommunityModerationPage() {
  const { token, isAdmin } = useYumiAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !isAdmin) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${API_BASE}/admin/reports`, { headers: { Authorization: `Bearer ${token}` }, credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || "Gagal memuat moderation queue.");
      setReports(payload.data ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal memuat moderation queue."); }
    finally { setLoading(false); }
  }, [isAdmin, token]);

  useEffect(() => { void load(); }, [load]);

  const moderate = async (postId: string, action: "publish" | "hide" | "remove") => {
    setActing(`${postId}:${action}`);
    try {
      const response = await fetch(`${API_BASE}/admin/posts/${encodeURIComponent(postId)}/moderate`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || "Aksi moderasi gagal.");
      setReports((current) => current.filter((report) => report.post_id !== postId));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Aksi moderasi gagal."); }
    finally { setActing(null); }
  };

  if (!isAdmin) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Halaman ini hanya untuk admin.</div>;

  return <div className="mx-auto max-w-4xl space-y-4 pb-24"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldAlert className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Community safety</p><h1 className="text-xl font-black tracking-tight">Moderasi Komunitas Djiwa</h1><p className="mt-1 text-sm text-muted-foreground">Tinjau laporan customer tanpa mengekspos identitas reporter ke publik.</p></div></div>{error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}<section className="rounded-xl border border-border bg-card p-4 shadow-sm">{loading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat laporan...</div> : reports.length === 0 ? <div className="py-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-2 text-sm font-black">Tidak ada laporan terbuka</p><p className="mt-1 text-xs text-muted-foreground">Queue moderasi sedang bersih.</p></div> : <div className="space-y-3">{reports.map((report) => <article key={report.id} className="rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">Post {report.post_id.slice(0, 8)}</p><p className="mt-1 text-sm">{report.reason}</p><p className="mt-1 text-[10px] text-muted-foreground">Dilaporkan {new Date(report.created_at).toLocaleString("id-ID")}</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">OPEN</span></div><div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={Boolean(acting)} onClick={() => void moderate(report.post_id, "publish")}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Tetap tampil</Button><Button type="button" size="sm" variant="outline" disabled={Boolean(acting)} onClick={() => void moderate(report.post_id, "hide")}><EyeOff className="mr-1 h-3.5 w-3.5" /> Sembunyikan</Button><Button type="button" size="sm" variant="destructive" disabled={Boolean(acting)} onClick={() => void moderate(report.post_id, "remove")}><Trash2 className="mr-1 h-3.5 w-3.5" /> Hapus</Button></div></article>)}</div>}</section></div>;
}
