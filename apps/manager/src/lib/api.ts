import { API_BASE } from "./auth";

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    credentials: "include",
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(response.status, data.error ?? `HTTP_${response.status}`);
  return data;
}

export type Role = "manager" | "supervisor";
export type Attachment = { type: "link" | "file" | "photo" | "video"; name: string; url: string };
export type Task = {
  id: string; title: string; detail: string | null; source: string; source_ref: string | null;
  assignee_role: Role; priority: "low" | "normal" | "high"; kind: string; due_at: string | null;
  status: "open" | "done" | "cancelled"; attachments: Attachment[]; comment_count: number; created_at: string;
};
export type Report = {
  id: string; kind: string; title: string; body: Record<string, string>; from_name: string | null;
  from_role: Role; to_role: "manager" | "owner"; status: string; review_note: string | null; created_at: string;
};
export type Chapter = { slug: string; position: number; title: string; body: { h?: string; steps?: string[]; text?: string }[] };
