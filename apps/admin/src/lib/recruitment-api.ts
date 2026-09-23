import type {
  RecruitmentCandidate,
  RecruitmentDashboard,
  RecruitmentEnvelope,
  RecruitmentInterview,
  RecruitmentOnboardingItem,
  RecruitmentPosition,
  RecruitmentReport,
} from "@/lib/recruitment-types";

export class RecruitmentApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "RecruitmentApiError"; this.status = status; }
}

function envelope<T>(payload: T | RecruitmentEnvelope<T>): T {
  if (payload && typeof payload === "object" && "data" in payload && Object.keys(payload).length <= 3) return (payload as RecruitmentEnvelope<T>).data;
  return payload as T;
}

export async function recruitmentRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) headers.set("X-Yumi-Session", token);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/rekrutmen${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? payload.error : payload?.error?.message || payload?.message;
    throw new RecruitmentApiError(detail || `Recruitment API error (${response.status})`, response.status);
  }
  return envelope(payload) as T;
}

export const recruitmentApi = {
  dashboard: (token?: string) => recruitmentRequest<RecruitmentDashboard>("/dashboard", {}, token),
  candidates: (token?: string) => recruitmentRequest<RecruitmentCandidate[] | RecruitmentEnvelope<RecruitmentCandidate[]>>("/candidates?pageSize=500", {}, token),
  candidate: (id: string, token?: string) => recruitmentRequest<RecruitmentCandidate>(`/candidates/${encodeURIComponent(id)}`, {}, token),
  positions: (token?: string) => recruitmentRequest<RecruitmentPosition[] | RecruitmentEnvelope<RecruitmentPosition[]>>("/positions", {}, token),
  updatePosition: (id: string, payload: Partial<Pick<RecruitmentPosition, "title" | "icon" | "summary" | "types" | "tags">> & { isOpen?: boolean; sortOrder?: number }, token?: string) => recruitmentRequest<RecruitmentPosition>(`/positions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }, token),
  interviews: (token?: string) => recruitmentRequest<RecruitmentInterview[] | RecruitmentEnvelope<RecruitmentInterview[]>>("/interviews", {}, token),
  onboarding: (token?: string) => recruitmentRequest<RecruitmentOnboardingItem[] | RecruitmentEnvelope<RecruitmentOnboardingItem[]>>("/onboarding", {}, token),
  reports: (token?: string) => recruitmentRequest<RecruitmentReport>("/reports", {}, token),
};
