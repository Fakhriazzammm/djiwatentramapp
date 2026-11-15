/** Browser side of the Google and payment-e-mail integrations. Tokens never reach the browser; this only talks to /api/finance. */
export type InboundSource = { forwarding: boolean; address: string; enabled: boolean; mailCount: number; lastMailAt: string | null; trusted: number; forwardCode: string | null };
export type InboundSummary = { configured: boolean; filter: string; source: InboundSource | null; review: number };
export type ReviewItem = {
  id: string; channel: string; status: "review" | "failed"; reason: string; confidence: number; createdAt: string;
  parsed: { amount?: number; kind?: "out" | "in"; direction?: string; merchant?: string; categoryId?: string; accountId?: string; accountHint?: string; at?: string; subject?: string; issuer?: string };
};
export type GoogleStatus = {
  configured: boolean; connected: boolean; email: string | null; features: { calendar: boolean; drive: boolean; gmail: boolean };
  gmail: { enabled: boolean; lastPolledAt: string | null; error: string | null; fetched: number } | null;
  calendar: { events: number }; drive: { uploaded: number; failed: number };
  sheet: { url: string | null; status: string; lastSyncedAt: string | null; error: string | null } | null;
};
export type GoogleFeature = "calendar" | "drive" | "gmail";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/finance${path}`, { credentials: "include", ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { success?: boolean; error?: string };
  if (!res.ok || body.success === false) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { code: body.error, status: res.status });
  return body;
}

export const getInbound = () => call<InboundSummary & { success: true }>("/inbound");
export const createSource = (rotate = false) => call<{ source: InboundSource }>("/inbound/source", { method: "POST", body: JSON.stringify({ rotate }) });
export const removeSource = (wipe: boolean) => call<object>(`/inbound/source${wipe ? "?wipe=1" : ""}`, { method: "DELETE" });
export const getReview = () => call<{ items: ReviewItem[] }>("/inbound/review");
export type ReviewEdits = { amount?: number; kind?: "out" | "in"; categoryId?: string; accountId?: string; note?: string };
export const approveItem = (id: string, edits: ReviewEdits = {}) => call<{ entryId: string }>(`/inbound/${encodeURIComponent(id)}/approve`, { method: "POST", body: JSON.stringify(edits) });
export const rejectItem = (id: string) => call<object>(`/inbound/${encodeURIComponent(id)}/reject`, { method: "POST" });
export type Origin = { id: string; channel: string; senderDomain: string; status: string; issuer: string; subject: string; receivedAt: string };
export const getOrigin = (id: string) => call<{ origin: Origin }>(`/inbound/${encodeURIComponent(id)}/origin`);

export const getGoogle = () => call<GoogleStatus & { success: true }>("/google/status");
export const connectGoogle = (features: GoogleFeature[]) => call<{ url: string }>("/google/connect", { method: "POST", body: JSON.stringify({ features }) });
export const pollGmailNow = () => call<object>("/google/gmail/poll", { method: "POST" });
export const gmailOff = () => call<object>("/google/gmail/off", { method: "POST" });
export const disconnectGoogle = () => call<object>("/google/disconnect", { method: "POST" });
export const syncGoogle = (what: "calendar" | "drive" | "sheets") => call<Record<string, unknown>>(what === "sheets" ? "/google/sheets/export" : `/google/${what}/sync`, { method: "POST" });

/** What the review card needs to show a channel. */
export const CHANNEL_NAME: Record<string, string> = { bca: "BCA", blu: "blu", mandiri: "Mandiri", bri: "BRI", bni: "BNI", cimb: "CIMB Niaga", jago: "Jago", jenius: "Jenius", seabank: "SeaBank", gopay: "GoPay", ovo: "OVO", dana: "DANA", shopeepay: "ShopeePay", linkaja: "LinkAja", grab: "Grab", tokopedia: "Tokopedia", pln: "PLN", telkom: "Telkom", bpjs: "BPJS" };
