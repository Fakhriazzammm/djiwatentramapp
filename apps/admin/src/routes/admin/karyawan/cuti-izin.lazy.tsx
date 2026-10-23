import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardCheck, FileClock, Search, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { useAdminConfirm } from "@/hooks/use-admin-confirm";
import { invokeDirectFetch } from "@/lib/api-helper";

type LeaveRow = {
  id: string;
  user_id: string;
  user_name?: string | null;
  leave_type: "izin" | "cuti" | "sakit" | "other" | string;
  start_date: string;
  end_date: string;
  reason: string;
  status?: "pending" | "approved" | "rejected" | "cancelled" | string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  created_at?: string | null;
};

const TYPE_LABEL: Record<string, string> = { izin: "Izin", cuti: "Cuti", sakit: "Sakit", other: "Lainnya" };
const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak", cancelled: "Dibatalkan" };

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export const Route = createLazyFileRoute("/admin/karyawan/cuti-izin")({ component: LeaveRequestsPage });

function LeaveRequestsPage() {
  const { token } = useYumiAuth();
  const [rows, setRows] = useState<LeaveRow[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useAdminConfirm();

  useEffect(() => {
    let active = true;
    setRows(undefined);
    setError(null);
    if (!token) {
      setError("Sesi admin tidak tersedia. Silakan login ulang.");
      return () => { active = false; };
    }
    const url = `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "")}/functions/v1/leave-admin`;
    void invokeDirectFetch<{ data?: LeaveRow[] }>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "list" }),
    }).then((result) => {
      if (active) setRows(Array.isArray(result.data) ? result.data : []);
    }).catch(() => {
      if (active) setError("Data Cuti & Izin belum dapat dimuat. Sesi admin atau permission tidak valid.");
    });
    return () => { active = false; };
  }, [refreshKey, token]);

  const updateStatus = async (requestId: string, nextStatus: "approve" | "reject") => {
    if (!token || processingId) return;
    const label = nextStatus === "approve" ? "menyetujui" : "menolak";
    const accepted = await confirm({
      title: nextStatus === "approve" ? "Setujui pengajuan?" : "Tolak pengajuan?",
      message: `Yakin ${label} pengajuan ini?`,
      confirmText: nextStatus === "approve" ? "Setujui" : "Tolak",
      variant: nextStatus === "approve" ? "info" : "danger",
    });
    if (!accepted) return;
    setProcessingId(requestId);
    setError(null);
    try {
      const url = `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "")}/functions/v1/leave-admin`;
      await invokeDirectFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: nextStatus, requestId }),
      });
      setRefreshKey((value) => value + 1);
    } catch {
      setError("Status belum berubah. Pengajuan mungkin sudah diproses admin lain.");
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      const matchesStatus = status === "all" || (row.status ?? "pending") === status;
      const haystack = `${row.user_name ?? ""} ${row.user_id} ${row.reason} ${TYPE_LABEL[row.leave_type] ?? row.leave_type}`.toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [query, rows, status]);

  const counts = useMemo(() => ({
    pending: (rows ?? []).filter((row) => (row.status ?? "pending") === "pending").length,
    approved: (rows ?? []).filter((row) => row.status === "approved").length,
    rejected: (rows ?? []).filter((row) => row.status === "rejected").length,
  }), [rows]);

  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      {confirmDialog}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Karyawan App</p>
          <h1 className="text-2xl font-black tracking-tight">Cuti &amp; Izin</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pantau pengajuan ketidakhadiran tanpa membuka data sensitif yang tidak diperlukan.</p>
        </div>
        <button className="min-h-11 rounded-xl border border-border bg-card px-4 text-sm font-bold hover:bg-muted" onClick={() => setRefreshKey((value) => value + 1)} type="button">Muat ulang</button>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          { label: "Menunggu", value: counts.pending, Icon: FileClock, color: "text-amber-600 bg-amber-50" },
          { label: "Disetujui", value: counts.approved, Icon: ClipboardCheck, color: "text-emerald-600 bg-emerald-50" },
          { label: "Ditolak", value: counts.rejected, Icon: ShieldAlert, color: "text-rose-600 bg-rose-50" },
        ] satisfies Array<{ label: string; value: number; Icon: LucideIcon; color: string }>).map(({ label, value, Icon, color }) => <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4" key={label}><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span><div><p className="text-xs font-bold text-muted-foreground">{label}</p><p className="text-xl font-black">{value}</p></div></div>)}
      </section>

      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 rounded-xl pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, ID, atau alasan..." value={query} /></div>
          <select aria-label="Filter status" className="h-11 rounded-xl border border-input bg-background px-3 text-sm" onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">Semua status</option><option value="pending">Menunggu</option><option value="approved">Disetujui</option><option value="rejected">Ditolak</option><option value="cancelled">Dibatalkan</option></select>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {error ? <div className="p-8 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-rose-500" /><p className="mt-3 text-sm font-bold">{error}</p><button className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground" onClick={() => setRefreshKey((value) => value + 1)} type="button">Coba lagi</button></div> : rows === undefined ? <div className="space-y-3 p-5">{[1, 2, 3, 4, 5].map((item) => <Skeleton className="h-12 w-full rounded-xl" key={item} />)}</div> : filtered.length === 0 ? <div className="p-10 text-center"><CalendarDays className="mx-auto h-9 w-9 text-muted-foreground/40" /><p className="mt-3 text-sm font-bold">Belum ada pengajuan yang cocok.</p><p className="mt-1 text-xs text-muted-foreground">Data akan muncul dari tabel pengajuan kehadiran yang sudah ada.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Karyawan</th><th className="px-4 py-3">Jenis</th><th className="px-4 py-3">Periode</th><th className="px-4 py-3">Alasan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Dibuat</th><th className="px-4 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-border">{filtered.map((row) => { const rowStatus = row.status ?? "pending"; return <tr className="hover:bg-muted/20" key={row.id}><td className="px-4 py-3"><p className="font-bold">{row.user_name || "Tanpa nama"}</p><p className="text-xs text-muted-foreground">{row.user_id}</p></td><td className="px-4 py-3">{TYPE_LABEL[row.leave_type] ?? row.leave_type}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(row.start_date)} — {formatDate(row.end_date)}</td><td className="max-w-[260px] truncate px-4 py-3 text-muted-foreground" title={row.reason}>{row.reason}</td><td className="px-4 py-3"><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{STATUS_LABEL[rowStatus] ?? rowStatus}</span></td><td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(row.created_at)}</td><td className="px-4 py-3"><div className="flex gap-2">{rowStatus === "pending" ? <><button className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-50" disabled={processingId !== null} onClick={() => void updateStatus(row.id, "approve")} type="button">Setujui</button><button className="min-h-10 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50" disabled={processingId !== null} onClick={() => void updateStatus(row.id, "reject")} type="button">Tolak</button></> : <span className="text-xs text-muted-foreground">Selesai</span>}</div></td></tr>; })}</tbody></table></div>}
      </section>
    </main>
  );
}
