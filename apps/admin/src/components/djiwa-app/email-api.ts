import { invokeEdgeFunction } from "@/lib/api-helper";

export type Segment = { key: string; label: string; eligible: number };
export type TemplateRow = { id: string; name: string; description: string; subject: string; html: string; segment?: string; updated_at?: string };
export type Quota = { plan: string; limit: number; used: number; remaining: number | null; dailyLeft: number | null; payg: boolean; expiredAt: string | null } | null;
export type Overview = {
	segments: Segment[];
	customers: { total: number; consented: number; suppressed: number };
	quota: Quota;
	from: string;
	builtinTemplates: (TemplateRow & { segment: string })[];
	customTemplates: TemplateRow[];
};
export type Campaign = {
	id: string; name: string; subject: string; html: string; segment: string; status: "draft" | "scheduled" | "sending" | "paused" | "done" | "canceled";
	scheduled_at: string | null; total_recipients: number; created_at: string; started_at: string | null; finished_at: string | null; last_error: string | null;
	stats?: Record<string, number>;
};
export type RecipientRow = { id: number; customer_id: string; email: string; name: string; status: string; error: string | null; sent_at: string | null; delivered_at: string | null; opened_at: string | null; clicked_at: string | null };
export type CampaignDetail = { campaign: Campaign; recipients: RecipientRow[]; stats: Record<string, number>; opened: number; clicked: number; sentNow?: number; stopped?: string | null };
export type Suppression = { email: string; reason: string; source: string | null; created_at: string };
export type AudiencePreview = { total: number; skipped: { noConsent: number; suppressed: number; recent: number; invalid: number }; sample: { name: string; email: string }[] };

function staffToken() {
	const token = typeof window !== "undefined" ? window.localStorage.getItem("yumi_session_token") : "";
	if (!token) throw new Error("Sesi staff tidak ditemukan. Silakan masuk ulang.");
	return token;
}

export function emailApi<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}) {
	return invokeEdgeFunction<T>("email-marketing", { action, staffToken: staffToken(), ...payload });
}

export const STATUS_LABEL: Record<Campaign["status"], string> = { draft: "Draf", scheduled: "Terjadwal", sending: "Mengirim", paused: "Dijeda", done: "Selesai", canceled: "Dibatalkan" };
export const SAMPLE_VARS: Record<string, string> = { nama: "Ayu", saldo: "Rp25.000", exp_member: "31 Desember 2026", link: "https://djiwatentram.web.id", hari_tidak_aktif: "45", unsubscribe_url: "#" };

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function renderPreview(source: string) {
	return source
		.replace(/\{\{\{\s*([a-z_]+)\s*\}\}\}/gi, (_, key: string) => SAMPLE_VARS[key] ?? "")
		.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => esc(SAMPLE_VARS[key] ?? ""));
}
