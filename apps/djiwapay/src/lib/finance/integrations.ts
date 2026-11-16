export type PaymentDetails = { description: string; items: {name:string;qty:number|null;unitPrice:number|null;amount:number|null}[]; subtotal:number|null; discount:number|null; charges:{label:string;amount:number;included:boolean}[]; total:number|null; warnings:string[] };
/** Browser side of the Google and payment-e-mail integrations. Tokens never reach the browser; this only talks to /api/finance. */
export type InboundSource = { forwarding: boolean; address: string; enabled: boolean; mailCount: number; lastMailAt: string | null; trusted: number; forwardCode: string | null };
export type InboundSummary = { configured: boolean; filter: string; source: InboundSource | null; review: number; importReady: number; autoRecent: number };
export type ReviewItem = {
  id: string; channel: string; status: "review" | "failed"; reason: string; confidence: number; createdAt: string;
  parsed: { amount?: number; kind?: "out" | "in"; direction?: string; merchant?: string; categoryId?: string; accountId?: string; accountHint?: string; at?: string; subject?: string; issuer?: string; details?: PaymentDetails; flags?: string[] };
};
export type GoogleStatus = {
  configured: boolean; connected: boolean; email: string | null; features: { calendar: boolean; drive: boolean; gmail: boolean };
  gmail: { enabled: boolean; lastPolledAt: string | null; error: string | null; fetched: number } | null;
  calendar: { events: number }; drive: { uploaded: number; failed: number; hold: string | null; lastCheckedAt: string | null };
  sheet: { url: string | null; status: string; lastSyncedAt: string | null; error: string | null; hold: string | null; pending: boolean; stats: Record<string, number> } | null;
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
export const getReview = (offset=0) => call<{ items: ReviewItem[];total:number }>(`/inbound/review?offset=${offset}`);
export const bulkReview = (ids:string[],action:"approve"|"reject")=>call<{results:{id:string;ok:boolean}[]}>("/inbound/bulk",{method:"POST",body:JSON.stringify({ids,action})});
export const rereadItem = (id:string)=>call<{details:PaymentDetails}>(`/inbound/${encodeURIComponent(id)}/reread`,{method:"POST"});
export type ReviewEdits = { amount?: number; kind?: "out" | "in"; categoryId?: string; accountId?: string; note?: string };
export const approveItem = (id: string, edits: ReviewEdits = {}) => call<{ entryId: string }>(`/inbound/${encodeURIComponent(id)}/approve`, { method: "POST", body: JSON.stringify(edits) });
export const rejectItem = (id: string) => call<object>(`/inbound/${encodeURIComponent(id)}/reject`, { method: "POST" });
export type Origin = { id: string; channel: string; senderDomain: string; status: string; issuer: string; subject: string; receivedAt: string; details?: PaymentDetails };
export const getOrigin = (id: string) => call<{ origin: Origin }>(`/inbound/${encodeURIComponent(id)}/origin`);

export const getGoogle = () => call<GoogleStatus & { success: true }>("/google/status");
export const connectGoogle = (features: GoogleFeature[]) => call<{ url: string }>("/google/connect", { method: "POST", body: JSON.stringify({ features }) });
export const confirmSheetDeletes = () => call<object>("/google/sheets/confirm", { method: "POST" });
export const confirmDriveRemovals = () => call<object>("/google/drive/confirm", { method: "POST" });
export const pollGmailNow = () => call<object>("/google/gmail/poll", { method: "POST" });
export const gmailOff = () => call<object>("/google/gmail/off", { method: "POST" });
export const disconnectGoogle = () => call<object>("/google/disconnect", { method: "POST" });
export const syncGoogle = (what: "calendar" | "drive" | "sheets") => call<Record<string, unknown>>(what === "sheets" ? "/google/sheets/export" : `/google/${what}/sync`, { method: "POST" });

/** What the review card needs to show a channel. */
export const CHANNEL_NAME: Record<string, string> = { bca: "BCA", blu: "blu", mandiri: "Mandiri", bri: "BRI", bni: "BNI", cimb: "CIMB Niaga", jago: "Jago", jenius: "Jenius", seabank: "SeaBank", gopay: "GoPay", ovo: "OVO", dana: "DANA", shopeepay: "ShopeePay", linkaja: "LinkAja", grab: "Grab", tokopedia: "Tokopedia", pln: "PLN", telkom: "Telkom", bpjs: "BPJS" };

/* ---- Import of old Gmail mail ---- */
export type ImportPreview = {
  sure: { count: number; income: number; expense: number }; check: { count: number };
  months: { month: string; count: number; income: number; expense: number }[]; categories: { categoryId: string; count: number; total: number }[];
};
export type ImportState = {
  id: string; status: "scanning" | "ready" | "done" | "cancelled" | "undone" | "failed"; periodDays: number; scanned: number; staged: number; progress: number;
  error: string | null; committed: number; movedToReview: number; scanningTo: string | null; since: string | null; preview?: ImportPreview;
};
export type ImportItem = { id: string; channel: string; confidence: number; parsed: { merchant?: string; amount?: number; kind?: string; subject?: string; sample?: string; issuer?: string; at?: string } };
export const startImport = (days: number) => call<{ id: string }>("/google/gmail/import", { method: "POST", body: JSON.stringify({ days }) });
export const getImport = () => call<{ import: ImportState | null }>("/google/gmail/import");
export const getImportItems = (id: string) => call<{ items: ImportItem[] }>(`/google/gmail/import/${encodeURIComponent(id)}/items`);
export const commitImport = (id: string) => call<{ committed: number; movedToReview: number; transfers: number }>(`/google/gmail/import/${encodeURIComponent(id)}/commit`, { method: "POST" });
export const undoImport = (id: string) => call<{ removed: number }>(`/google/gmail/import/${encodeURIComponent(id)}/undo`, { method: "POST" });
export const cancelImport = () => call<object>("/google/gmail/import/cancel", { method: "POST" });

/* ---- Review queue grouped by shop ---- */
export type ReviewGroup = { key: string; name: string; kind: "out" | "in"; count: number; total: number; flagged: number; categoryId: string; firstAt: string | null; lastAt: string | null; sample: { at: string | null; amount: number }[] };
export type GroupResult = { approved: number; skipped: number; income: number; expense: number; months: { y: number; m: number; n: number; out: number; inc: number }[] };
export const getReviewGroups = () => call<{ groups: ReviewGroup[]; groupedItems: number; total: number }>("/inbound/groups");
export const approveReviewGroup = (key: string, categoryId: string, accountId?: string) => call<GroupResult>("/inbound/groups/approve", { method: "POST", body: JSON.stringify({ key, categoryId, accountId }) });
export const rejectReviewGroup = (key: string) => call<{ rejected: number }>("/inbound/groups/reject", { method: "POST", body: JSON.stringify({ key }) });

/** Apps Script alternative: a script the user pastes into their own Google account posts bank mail to a private URL. No Google permission for Djiwa Pay is involved. */
export type HookInfo = { available?: boolean; enabled: boolean; url?: string; script?: string; lastAt?: string | null; lastStatus?: string | null; lastReason?: string | null; received?: number };
export const getHook = () => call<HookInfo & { success: true }>("/inbound/hook");
export const createHook = (rotate = false) => call<HookInfo & { success: true }>("/inbound/hook", { method: "POST", body: JSON.stringify({ rotate }) });
export const removeHook = () => call<object>("/inbound/hook", { method: "DELETE" });
