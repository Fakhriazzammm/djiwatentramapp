import { useCallback, useEffect, useState } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { recruitmentApi, recruitmentRequest } from "@/lib/recruitment-api";
import type { RecruitmentCandidate, RecruitmentDashboard, RecruitmentInterview, RecruitmentOnboardingItem, RecruitmentPipelineCard, RecruitmentPosition, RecruitmentReport } from "@/lib/recruitment-types";

type AsyncState<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };

function useRecruitmentQuery<T>(load: (token?: string) => Promise<T>, enabled = true): AsyncState<T> {
  const { token } = useYumiAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    setLoading(true); setError(null);
    load(token).then((value) => { if (!cancelled) setData(value); }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Gagal memuat data rekrutmen"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, load, revision, token]);
  return { data, loading, error, reload };
}

export function useRecruitmentDashboard() { return useRecruitmentQuery<RecruitmentDashboard>(useCallback((token?: string) => recruitmentApi.dashboard(token), [])); }
export function useRecruitmentCandidates() { return useRecruitmentQuery<RecruitmentCandidate[] | { data: RecruitmentCandidate[] }>(useCallback((token?: string) => recruitmentApi.candidates(token), [])); }
export function useRecruitmentPipeline() { return useRecruitmentQuery<RecruitmentPipelineCard[] | { data: RecruitmentPipelineCard[] }>(useCallback((token?: string) => recruitmentApi.pipeline(token), [])); }
export function useRecruitmentPositions() { return useRecruitmentQuery<RecruitmentPosition[] | { data: RecruitmentPosition[] }>(useCallback((token?: string) => recruitmentApi.positions(token), [])); }
export function useRecruitmentInterviews() { return useRecruitmentQuery<RecruitmentInterview[] | { data: RecruitmentInterview[] }>(useCallback((token?: string) => recruitmentApi.interviews(token), [])); }
export function useRecruitmentOnboarding() { return useRecruitmentQuery<RecruitmentOnboardingItem[] | { data: RecruitmentOnboardingItem[] }>(useCallback((token?: string) => recruitmentApi.onboarding(token), [])); }
export function useRecruitmentReports() { return useRecruitmentQuery<RecruitmentReport>(useCallback((token?: string) => recruitmentApi.reports(token ?? undefined), [])); }

export function useRecruitmentMutation() {
  const { token } = useYumiAuth();
  return useCallback(<T,>(path: string, init: RequestInit) => recruitmentRequest<T>(path, init, token ?? undefined), [token]);
}

export function listData<T>(value: T[] | { data: T[] } | null | undefined): T[] { return Array.isArray(value) ? value : value?.data ?? []; }
