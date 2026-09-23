import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, CheckCircle2, FileText, GripVertical, Loader2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RECRUITMENT_STATUSES, type RecruitmentPipelineCard } from "@/lib/recruitment-types";

export const PIPELINE_COLUMNS = [
  "Application Received",
  "Screening",
  "Interview Scheduled",
  "Interview Completed",
  "Offer",
  "Hired",
  "Onboarding",
  "Selesai",
  "Rejected",
  "Withdrawn",
] as const;

type TransitionHandler = (candidate: RecruitmentPipelineCard, toStatus: string, reason?: string) => Promise<void>;

function normalizeStatus(status?: string | null) { return status === "Applied" ? "Application Received" : status || "Application Received"; }

function PipelineColumn({ status, children, count }: { status: string; children: React.ReactNode; count: number }) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return <section ref={setNodeRef} className={`flex min-h-[420px] w-[290px] shrink-0 flex-col rounded-2xl border p-3 transition-colors ${isOver ? "border-blue-400 bg-blue-50/70" : "border-slate-200 bg-slate-50/80"}`}><header className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-800">{status}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{count}</span></header><div className="space-y-2">{children}</div></section>;
}

function CandidateCard({ candidate, onOpen, onStatusChange, saving }: { candidate: RecruitmentPipelineCard; onOpen: () => void; onStatusChange: (status: string) => void; saving: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: candidate.id, data: { candidate } });
  const style = { transform: CSS.Translate.toString(transform) };
  const progress = candidate.onboardingProgress;
  return <article ref={setNodeRef} style={style} className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow ${isDragging ? "z-10 opacity-60 shadow-xl" : "hover:shadow-md"}`}><div className="flex items-start gap-2"><button type="button" {...listeners} {...attributes} aria-label={`Geser ${candidate.nama_lengkap}`} className="mt-0.5 cursor-grab rounded-lg p-1 text-slate-400 hover:bg-slate-100 active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button><button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left"><span className="flex items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-blue-600" /><span className="truncate font-medium text-slate-900">{candidate.nama_lengkap || "Tanpa nama"}</span></span><span className="mt-1 block truncate text-xs text-slate-500">{candidate.posisi_dilamar || "Posisi belum tersedia"} · {candidate.tipe_kerja || "Tipe kerja belum tersedia"}</span></button></div><div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500"><span className="rounded-full bg-slate-100 px-2 py-1">{candidate.application_date || "Tanggal belum ada"}</span>{candidate.cv_url && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700"><FileText className="h-3 w-3" />CV</span>}{candidate.latestInterview?.scheduled_at && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-violet-700"><CalendarClock className="h-3 w-3" />Interview</span>}{progress && <span className={`rounded-full px-2 py-1 ${progress.overdue ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{progress.completed}/{progress.total} onboarding</span>}</div><div className="mt-3 flex items-center gap-2"><select aria-label={`Status ${candidate.nama_lengkap}`} disabled={saving} value={normalizeStatus(candidate.status)} onChange={(event) => onStatusChange(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"><option value="Application Received">Application Received</option>{RECRUITMENT_STATUSES.filter((status) => status !== "Applied" && status !== "Application Received").map((status) => <option key={status} value={status}>{status}</option>)}<option value="Onboarding">Onboarding</option><option value="Selesai">Selesai</option></select>{saving && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}</div></article>;
}

export function RecruitmentPipelineBoard({ candidates, loading, onOpenCandidate, onTransition }: { candidates: RecruitmentPipelineCard[]; loading?: boolean; onOpenCandidate: (candidate: RecruitmentPipelineCard) => void; onTransition: TransitionHandler }) {
  const [items, setItems] = useState(candidates);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ candidate: RecruitmentPipelineCard; toStatus: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  useEffect(() => setItems(candidates), [candidates]);
  const grouped = useMemo(() => PIPELINE_COLUMNS.reduce<Record<string, RecruitmentPipelineCard[]>>((result, status) => { result[status] = items.filter((candidate) => normalizeStatus(candidate.status) === status); return result; }, {}), [items]);
  const active = activeId ? items.find((candidate) => candidate.id === activeId) : null;
  const requestTransition = async (candidate: RecruitmentPipelineCard, toStatus: string, reason?: string) => {
    const previous = normalizeStatus(candidate.status);
    if (previous === toStatus) return;
    setSavingId(candidate.id); setError(null);
    setItems((current) => current.map((item) => item.id === candidate.id ? { ...item, status: toStatus } : item));
    try { await onTransition(candidate, toStatus, reason); } catch (reasonValue) { setItems((current) => current.map((item) => item.id === candidate.id ? { ...item, status: previous } : item)); const message = reasonValue instanceof Error ? reasonValue.message : "Status kandidat gagal disimpan"; setError(message); throw reasonValue; } finally { setSavingId(null); }
  };
  const askTransition = (candidate: RecruitmentPipelineCard, toStatus: string) => {
    if (["Hired", "Rejected", "Withdrawn"].includes(toStatus)) setPending({ candidate, toStatus });
    else void requestTransition(candidate, toStatus).catch(() => undefined);
  };
  const handleDragEnd = ({ active: dragActive, over }: DragEndEvent) => { setActiveId(null); if (!over) return; const candidate = items.find((item) => item.id === String(dragActive.id)); const toStatus = String(over.id); if (candidate && PIPELINE_COLUMNS.includes(toStatus as typeof PIPELINE_COLUMNS[number])) askTransition(candidate, toStatus); };
  return <div className="space-y-3">{error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</div>}{loading ? <div className="flex gap-3 overflow-x-auto pb-3"><div className="h-[420px] w-[290px] shrink-0 animate-pulse rounded-2xl bg-slate-200" /><div className="h-[420px] w-[290px] shrink-0 animate-pulse rounded-2xl bg-slate-200" /><div className="h-[420px] w-[290px] shrink-0 animate-pulse rounded-2xl bg-slate-200" /></div> : !items.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Belum ada kandidat pada pipeline.</div> : <DndContext sensors={sensors} onDragStart={({ active: dragActive }) => setActiveId(String(dragActive.id))} onDragCancel={() => setActiveId(null)} onDragEnd={handleDragEnd}><div className="flex gap-3 overflow-x-auto pb-3">{PIPELINE_COLUMNS.map((status) => <PipelineColumn key={status} status={status} count={grouped[status].length}>{grouped[status].map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} onOpen={() => onOpenCandidate(candidate)} onStatusChange={(next) => askTransition(candidate, next)} saving={savingId === candidate.id} />)}</PipelineColumn>)}</div><DragOverlay>{active ? <div className="w-[290px] rounded-xl border border-blue-200 bg-white p-3 shadow-2xl"><p className="font-medium text-slate-900">{active.nama_lengkap}</p><p className="text-xs text-slate-500">{active.posisi_dilamar}</p></div> : null}</DragOverlay></DndContext>}{pending && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-blue-600" /><h2 className="text-lg font-semibold">Konfirmasi perubahan status</h2></div><p className="mt-3 text-sm leading-6 text-slate-600">Pindahkan <strong>{pending.candidate.nama_lengkap}</strong> ke status <strong>{pending.toStatus}</strong>?</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPending(null)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Batal</button><button type="button" onClick={() => { const next = pending; setPending(null); void requestTransition(next.candidate, next.toStatus, `Konfirmasi Admin: ${next.toStatus}`).catch(() => undefined); }} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Konfirmasi</button></div></div></div>}</div>;
}
