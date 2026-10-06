import { AlertCircle, ArrowRight, ArrowUpDown, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronRight, FileText, Inbox, Loader2, RefreshCw, Search, Trash2, UserRound, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { RecruitmentCandidate, RecruitmentPosition } from "@/lib/recruitment-types";
import { RECRUITMENT_STATUSES } from "@/lib/recruitment-types";

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export function RecruitmentShell({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return <main className="min-h-full bg-slate-50/70 px-4 py-5 text-slate-950 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1440px] space-y-6"><header className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Recruitment App</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p></div>{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</header>{children}</div></main>;
}

export function RecruitmentToolbar({ search, onSearch, placeholder = "Cari kandidat...", children }: { search?: string; onSearch?: (value: string) => void; placeholder?: string; children?: ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="relative min-w-0 flex-1 sm:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search ?? ""} onChange={(event) => onSearch?.(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" aria-label={placeholder} /></div>{children && <div className="flex flex-wrap items-center gap-2">{children}</div>}</div>;
}

export function KpiStrip({ items }: { items: Array<{ label: string; value: number | string; hint?: string }> }) {
  return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{items.map((item) => <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{item.value}</p>{item.hint && <p className="mt-1 text-xs text-slate-400">{item.hint}</p>}</div>)}</section>;
}

export function PipelineBoard({ items }: { items: Array<{ status: string; count: number }> }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Pipeline kandidat</h2><p className="text-sm text-slate-500">Distribusi status dari API rekrutmen.</p></div><BriefcaseBusiness className="h-5 w-5 text-blue-500" /></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{items.length ? items.map((item) => <div key={item.status} className="rounded-xl bg-slate-50 p-3"><p className="truncate text-xs font-medium text-slate-500">{item.status}</p><p className="mt-2 text-xl font-semibold">{item.count}</p></div>) : <p className="col-span-full py-6 text-sm text-slate-500">Belum ada data pipeline.</p>}</div></section>;
}

export function StatusBadge({ status }: { status?: string | null }) {
  const value = status || "Unknown";
  const tone = value.toLowerCase().includes("hired") || value.toLowerCase().includes("offer") ? "bg-emerald-50 text-emerald-700" : value.toLowerCase().includes("reject") ? "bg-rose-50 text-rose-700" : value.toLowerCase().includes("interview") ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600";
  return <span className={cx("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tone)}>{value}</span>;
}

function CandidateSortHeader({ label, sortKey, sortBy, sortDirection, onSort }: { label: string; sortKey: string; sortBy?: string; sortDirection?: "asc" | "desc"; onSort?: (key: string) => void }) {
  const active = sortBy === sortKey;
  return <button type="button" className="inline-flex items-center gap-1 hover:text-blue-600" onClick={() => onSort?.(sortKey)} aria-label={`Urutkan ${label} ${active && sortDirection === "asc" ? "menurun" : "menaik"}`}>
    {label}<span aria-hidden="true" className="text-[11px] font-bold">{active ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span>
  </button>;
}

export function CandidateTable({ candidates, onSelect, sortBy, sortDirection, onSort, onStatusChange, selectedIds = [], onToggle, onToggleAll }: { candidates: RecruitmentCandidate[]; onSelect?: (candidate: RecruitmentCandidate) => void; sortBy?: string; sortDirection?: "asc" | "desc"; onSort?: (key: string) => void; onStatusChange?: (candidate: RecruitmentCandidate, status: string) => Promise<void>; selectedIds?: string[]; onToggle?: (id: string) => void; onToggleAll?: (checked: boolean) => void }) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const saveStatus = async (candidate: RecruitmentCandidate, status: string) => {
    if (!onStatusChange || status === candidate.status) return;
    setSavingId(candidate.id); setStatusError(null);
    try { await onStatusChange(candidate, status); } catch (reason) { setStatusError(reason instanceof Error ? reason.message : "Status gagal disimpan"); }
    finally { setSavingId(null); }
  };
  if (!candidates.length) return <EmptyState title="Belum ada kandidat" description="Kandidat dari endpoint /api/rekrutmen/candidates akan tampil di sini." />;
  return <div className="space-y-2">{statusError && <p className="px-1 text-xs text-rose-600" role="alert">{statusError}</p>}<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
    <th className="w-14 px-3 py-3 text-center font-medium">No.</th>
    <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Pilih maksimal 200 kandidat yang tampil" title="Batas aksi bulk: 200 kandidat per proses" checked={candidates.length > 0 && candidates.every((candidate) => selectedIds.includes(candidate.id))} onChange={(event) => onToggleAll?.(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" /></th>
    <th className="px-4 py-3 font-medium"><CandidateSortHeader label="Kandidat" sortKey="name" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /></th>
    <th className="px-4 py-3 font-medium"><CandidateSortHeader label="Gender" sortKey="gender" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /></th>
    <th className="px-4 py-3 font-medium"><CandidateSortHeader label="Lahir" sortKey="birthDate" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /></th>
    <th className="px-4 py-3 font-medium"><CandidateSortHeader label="Posisi" sortKey="position" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /></th>
    <th className="px-4 py-3 font-medium"><CandidateSortHeader label="Status" sortKey="status" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /></th>
    <th className="px-4 py-3 font-medium"><CandidateSortHeader label="Kontak" sortKey="phone" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /></th>
    <th className="px-4 py-3 font-medium"><CandidateSortHeader label="CV" sortKey="cv" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /></th>
    <th className="px-4 py-3 font-medium"><CandidateSortHeader label="Applied" sortKey="applicationDate" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} /></th>
    <th className="px-4 py-3" />
  </tr></thead><tbody className="divide-y divide-slate-100">{candidates.map((candidate, index) => <tr key={candidate.id} className={`transition ${selectedIds.includes(candidate.id) ? "bg-blue-50/70" : "hover:bg-blue-50/40"}`}>
    <td className="px-3 py-3 text-center tabular-nums text-slate-500">{index + 1}</td>
    <td className="px-3 py-3"><input type="checkbox" aria-label={`Pilih ${candidate.nama_lengkap}`} disabled={!selectedIds.includes(candidate.id) && selectedIds.length >= 200} checked={selectedIds.includes(candidate.id)} onChange={() => onToggle?.(candidate.id)} className="h-4 w-4 rounded border-slate-300 text-blue-600" /></td>
    <td className="px-4 py-3"><button type="button" onClick={() => onSelect?.(candidate)} className="flex items-center gap-3 text-left"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600"><UserRound className="h-4 w-4" /></span><span><span className="block font-medium text-slate-900">{candidate.nama_lengkap || "Tanpa nama"}</span><span className="block text-xs text-slate-500">{candidate.email || "Email belum tersedia"}</span></span></button></td>
    <td className="px-4 py-3 text-slate-600">{candidate.jenis_kelamin || "—"}</td>
    <td className="px-4 py-3 text-slate-600">{candidate.tanggal_lahir || "—"}</td>
    <td className="px-4 py-3 text-slate-600">{candidate.posisi_dilamar || "—"}</td>
    <td className="px-4 py-3"><select aria-label={`Status ${candidate.nama_lengkap}`} disabled={!onStatusChange || savingId === candidate.id} value={candidate.status || ""} onChange={(event) => void saveStatus(candidate, event.target.value)} className="h-9 max-w-[190px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"><option value="" disabled>Pilih status</option>{Array.from(new Set([...(RECRUITMENT_STATUSES as readonly string[]), (candidate.status ?? "")].filter(Boolean))).map((status) => <option key={status} value={status}>{status}</option>)}</select>{savingId === candidate.id && <span className="ml-2 text-[11px] text-blue-600">Menyimpan…</span>}</td>
    <td className="px-4 py-3 text-slate-600">{candidate.nomor_telepon || "—"}</td>
    <td className="px-4 py-3 text-slate-600">{candidate.cv_url ? <a href={candidate.cv_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"><FileText className="h-3.5 w-3.5" />Buka CV</a> : <span className="text-slate-400">Tidak tersedia</span>}</td>
    <td className="px-4 py-3 text-slate-500">{candidate.application_date ? new Date(candidate.application_date).toLocaleDateString("id-ID") : "—"}</td>
    <td className="px-4 py-3 text-right"><button type="button" onClick={() => onSelect?.(candidate)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Buka ${candidate.nama_lengkap}`}><ChevronRight className="h-4 w-4" /></button></td>
  </tr>)}</tbody></table></div></div></div>;
}
export function CandidateDetailSheet({ candidate, onClose }: { candidate: RecruitmentCandidate | null; onClose: () => void }) {
  if (!candidate) return null;
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-label={`Detail ${candidate.nama_lengkap}`}><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Detail kandidat</p><h2 className="mt-1 text-xl font-semibold">{candidate.nama_lengkap}</h2><div className="mt-2"><StatusBadge status={candidate.status} /></div></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" aria-label="Tutup detail"><X className="h-5 w-5" /></button></div><div className="mt-7 space-y-5">{[["ID", candidate.id], ["Airtable ID", candidate.airtable_id], ["Jenis kelamin", candidate.jenis_kelamin], ["Tanggal lahir", candidate.tanggal_lahir], ["Posisi", candidate.posisi_dilamar], ["Tipe kerja", candidate.tipe_kerja], ["Email", candidate.email], ["Nomor telepon", candidate.nomor_telepon], ["Sosial media", candidate.sosial_media], ["Tanggal melamar", candidate.application_date], ["Dibuat pada", candidate.created_at]].map(([label, value]) => <div key={label}><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm text-slate-800">{String(value || "Belum tersedia")}</p></div>)}<div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Catatan</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{candidate.notes || "Belum ada catatan."}</p></div>{candidate.cv_url && <a href={candidate.cv_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700"><FileText className="h-4 w-4" />Buka CV</a>}</div></aside></div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><Inbox className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>{action && <div className="mt-4">{action}</div>}</div></div>; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800" role="alert"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div className="flex-1"><p className="font-medium">Data rekrutmen gagal dimuat</p><p className="mt-1 text-sm text-rose-700">{message}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-rose-700 shadow-sm"><RefreshCw className="h-4 w-4" />Coba lagi</button>}</div></div>; }
export function LoadingSkeleton() { return <div className="space-y-3" aria-label="Memuat data" aria-busy="true"><div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" /></div>; }
export function ConfirmActionDialog({ open, title, description, onConfirm, onCancel }: { open: boolean; title: string; description: string; onConfirm: () => void; onCancel: () => void }) { if (!open) return null; return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/30 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-500">{description}</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Batal</button><button type="button" onClick={onConfirm} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Konfirmasi</button></div></div></div>; }

export function PageState({ loading, error, onRetry, children }: { loading: boolean; error: string | null; onRetry: () => void; children: ReactNode }) { if (loading) return <LoadingSkeleton />; if (error) return <ErrorState message={error} onRetry={onRetry} />; return <>{children}</>; }
export function SectionCard({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-2"><span className="text-blue-600">{icon}</span><h2 className="font-semibold">{title}</h2></div>{children}</section>; }
export function RefreshButton({ onClick, loading = false }: { onClick: () => void; loading?: boolean }) { return <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50" aria-label="Muat ulang data"><RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />Refresh</button>; }
export const RecruitmentIcons = { calendar: <CalendarDays className="h-4 w-4" />, check: <CheckCircle2 className="h-4 w-4" />, arrow: <ArrowRight className="h-4 w-4" />, loader: <Loader2 className="h-4 w-4 animate-spin" /> };
