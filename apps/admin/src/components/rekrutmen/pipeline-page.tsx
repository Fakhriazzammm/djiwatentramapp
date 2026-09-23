import { useMemo, useState } from "react";
import { CandidateDetailSheet, RecruitmentShell, RefreshButton } from "@/components/rekrutmen";
import { RecruitmentPipelineBoard } from "@/components/rekrutmen/pipeline-board";
import { useRecruitmentMutation, useRecruitmentPipeline, listData } from "@/hooks/use-recruitment-admin";
import type { RecruitmentPipelineCard } from "@/lib/recruitment-types";

export function RecruitmentPipelinePage() {
  const query = useRecruitmentPipeline();
  const mutate = useRecruitmentMutation();
  const [position, setPosition] = useState("");
  const [selected, setSelected] = useState<RecruitmentPipelineCard | null>(null);
  const cards = listData<RecruitmentPipelineCard>(query.data);
  const positions = useMemo(() => Array.from(new Set(cards.map((card) => card.posisi_dilamar).filter(Boolean))).sort(), [cards]);
  const visible = useMemo(() => position ? cards.filter((card) => card.posisi_dilamar === position) : cards, [cards, position]);
  const transition = async (candidate: RecruitmentPipelineCard, toStatus: string, reason?: string) => {
    await mutate(`/candidates/${encodeURIComponent(candidate.id)}/status-transition`, { method: "POST", body: JSON.stringify({ toStatus, expectedStatus: candidate.status === "Applied" ? "Application Received" : candidate.status, reason }) });
    await query.reload();
  };
  return <RecruitmentShell title="Recruitment Pipeline" description="Geser kandidat antar tahap. Perubahan status disimpan dan dicatat ke histori." actions={<RefreshButton onClick={query.reload} loading={query.loading} />}><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-slate-700">{visible.length} dari {cards.length} kandidat</span><select aria-label="Filter posisi pipeline" value={position} onChange={(event) => setPosition(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Semua posisi</option>{positions.map((item) => <option key={item} value={item}>{item}</option>)}</select>{position && <button type="button" onClick={() => setPosition("")} className="h-10 rounded-xl px-3 text-sm font-medium text-blue-700 hover:bg-blue-50">Reset filter</button>}</div><RecruitmentPipelineBoard candidates={visible} loading={query.loading} onOpenCandidate={setSelected} onTransition={transition} /><CandidateDetailSheet candidate={selected} onClose={() => setSelected(null)} /></RecruitmentShell>;
}
