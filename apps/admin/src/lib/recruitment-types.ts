export const RECRUITMENT_STATUSES = [
  "Application Received",
  "Applied",
  "Screening",
  "Interview Scheduled",
  "Interview Completed",
  "Offer",
  "Hired",
  "Rejected",
  "Withdrawn",
] as const;

export type RecruitmentStatus = (typeof RECRUITMENT_STATUSES)[number];
export type RecruitmentResource = "dashboard" | "candidates" | "positions" | "interviews" | "onboarding" | "reports";

export interface RecruitmentCandidate {
  id: string;
  nama_lengkap: string;
  email?: string | null;
  nomor_telepon?: string | null;
  posisi_dilamar?: string | null;
  tipe_kerja?: string | null;
  status?: string | null;
  cv_url?: string | null;
  notes?: string | null;
  application_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface RecruitmentPosition {
  id: string;
  title: string;
  icon?: string | null;
  summary?: string | null;
  types?: string[] | null;
  tags?: string[] | null;
  is_open: boolean;
  sort_order?: number | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface RecruitmentInterview {
  id: string;
  candidate_id?: string | null;
  candidate_name?: string | null;
  interviewer_name?: string | null;
  interviewer_user_id?: string | null;
  scheduled_at?: string | null;
  timezone?: string | null;
  location?: string | null;
  meeting_url?: string | null;
  status?: string | null;
  notes?: string | null;
  result?: string | null;
  [key: string]: unknown;
}

export interface RecruitmentOnboardingItem {
  id: string;
  candidate_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  status?: string | null;
  review_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  tasks?: Array<{ id: string; label: string; task_key?: string | null; status: string; due_date?: string | null }>;
  label?: string | null;
  task_key?: string | null;
  due_date?: string | null;
  [key: string]: unknown;
}

export interface RecruitmentDashboard {
  totals?: Record<string, number>;
  pipeline?: Array<{ status: string; count: number }>;
  recent_candidates?: RecruitmentCandidate[];
  open_positions?: RecruitmentPosition[];
  [key: string]: unknown;
}

export interface RecruitmentReport {
  funnel?: Array<{ status: string; count: number }>;
  metrics?: Record<string, number | string>;
  by_position?: Array<{ position: string; count: number }>;
  [key: string]: unknown;
}

export interface RecruitmentEnvelope<T> {
  data: T;
  meta?: { total?: number; page?: number; pageSize?: number; [key: string]: unknown };
}

export interface RecruitmentErrorPayload { error?: string | { message?: string }; message?: string }
