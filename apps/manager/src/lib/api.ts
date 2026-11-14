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
export type Chapter = { slug: string; position: number; title: string; body: { h?: string; text?: string; steps?: string[]; auto?: string[]; issue?: [string, string][] }[] };
export type Document = {
  slug: string; category: string; title: string; position: number;
  body: {
    id?: string; cat?: string; t?: string; who?: string; to?: string; when?: string; fmt?: string;
    purpose?: string; steps?: string[]; sources?: string[]; tips?: string[]; mistakes?: string[];
    ex?: { title?: string; blocks?: { h?: string; p?: string; list?: string[]; kv?: [string, string][]; cols?: string[]; rows?: string[][]; total?: string[]; check?: [string, boolean][]; sign?: [string, string][] }[] };
  };
};
export type ExpenseItem = { name: string; qty: number; unit: string; price: number; total: number; category: string };
export type ExpenseDraft = {
  id: string; channel: string; created_by: string | null; created_by_name: string | null; status: "draft" | "saved" | "pending_approval" | "rejected";
  photo_url: string | null; merchant: string | null; tx_date: string; payment_method: string; items: ExpenseItem[];
  total: string; finance_source_id: string | null; decision_note: string | null; created_at: string;
};
export type PurchaseOrder = {
  id: string; number: string; supplier_name: string; items: { name: string; qty: number; unit: string; price: number; total?: number }[];
  total: string; status: "draft" | "sent" | "received" | "cancelled"; note: string | null; created_at: string;
};
export type StockItem = {
  source_id: string; ingredient_name: string; unit: string; display_unit: string | null; base_unit: string | null;
  operational_unit: string | null; preferred_purchase_unit: string | null; unit_conversions: unknown;
  content_to_base_factor: string | null; pack_net_quantity: string | null; pack_net_unit: string | null;
  last_purchase_price: string | null; category: string | null; ingredient_group: string | null;
  low_stock_threshold: string; quantity: string;
  mode?: "availability" | "count"; status?: string; updatedAt?: number | null; updatedBy?: string | null;
  inventoryId?: string;
};


export type FeedItem = { at: number; kind: string; app: string; status: string; name: string; amount: number; detail: string | null };
export type Comment = { id: string; author_name: string | null; body: string; created_at: string };

export const API_ORIGIN = import.meta.env.VITE_MANAGER_API_URL?.trim() || "https://api.djiwatentram.web.id";
export const fileUrl = (u: string) => (u.startsWith("/") ? `${API_ORIGIN}${u}` : u);

export async function uploadFile(file: File): Promise<Attachment> {
  const data: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
  const res = await api<{ attachment: Attachment }>("/api/manager/uploads", { method: "POST", body: { name: file.name, data } });
  return res.attachment;
}
