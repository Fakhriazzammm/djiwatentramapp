export type PassportShop = {
  shop_id: string;
  name: string;
  slug: string;
  area: string | null;
  description: string | null;
  cover_url: string | null;
  google_maps_url: string | null;
  current_bid_amount: number;
};
export type PassportVisit = {
  visit_id: string;
  shop_id: string;
  shop_name: string;
  photo_path: string;
  photo_category: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  sticker_id: string | null;
  sticker_path: string | null;
  sticker_status: string | null;
};
export type PassportCollection = { customer_id: string; shop_id: string; shop_name: string; shop_slug: string; first_visit_at: string; visit_count: number; sticker_completed: boolean };
export type PassportState = { authenticated: boolean; customer: { name: string | null; email: string | null; photo_url: string | null } | null; shops: PassportShop[]; visits: PassportVisit[]; collection: PassportCollection[]; rewards: { available: number; count: number } };
export type BoardShop = PassportShop & { overall_rank: number; category_rank: number; clicks: number; today_clicks: number; created_at: string; current_bid_paid_sequence: number | null };
export type BoardActivity = { activity_id: string; shop_id: string; shop_name: string; from_rank: number | null; to_rank: number; bid_amount: number; created_at: string };
export type BoardPayload = { success: boolean; tab: string; shops: BoardShop[]; total: number; page: number; page_size: number; categories: string[]; next_top_bid_amount: number; minimum_new_bid_amount: number; minimum_top_increment: number; minimum_existing_increment: number; maximum_bid_amount: number; refund_policy: string; activity: BoardActivity[] };

export type StickerGenerateResponse = { success: boolean; status?: "generating" | "completed" | "failed"; sticker_id?: string; visit_id?: string; image_url?: string; message?: string };

const API_BASE = "https://djiwatentram.yumme.id/api/coffee-passport";
async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, credentials: "include", headers: { Accept: "application/json", ...(init?.headers || {}) } }); const payload = await response.json().catch(() => null); if (!response.ok) throw new Error((payload as { message?: string } | null)?.message || `Passport API HTTP ${response.status}`); return payload as T; }
export async function fetchPassport(): Promise<PassportState> { const payload = await jsonFetch<{ success?: boolean } & PassportState>(`${API_BASE}/bootstrap`); if (!payload.success) throw new Error("Passport API returned an invalid response"); return payload; }
export async function fetchBoard(params: { tab: "all-time" | "today" | "daily"; query?: string; category?: string; page?: number }): Promise<BoardPayload> { const search = new URLSearchParams({ tab: params.tab, page: String(params.page || 1), page_size: "50" }); if (params.query) search.set("q", params.query); if (params.category) search.set("category", params.category); return jsonFetch<BoardPayload>(`${API_BASE}/bid/board?${search}`); }
export async function fetchShopDetail(shopId: string) { return jsonFetch<{ success: boolean; shop: BoardShop }>(`${API_BASE}/bid/shops/${encodeURIComponent(shopId)}`); }
export async function recordBidClick(shopId: string) { const storageKey = "500kopitasik_visitor_key"; let visitorKey = localStorage.getItem(storageKey); if (!visitorKey) { visitorKey = `${crypto.randomUUID()}_${crypto.randomUUID()}`; localStorage.setItem(storageKey, visitorKey); } return jsonFetch<{ success: boolean; recorded: boolean }>(`${API_BASE}/bid/click`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shop_id: shopId, visitor_key: visitorKey }) }); }
export async function requestGoogleLogin() { const payload = await jsonFetch<{ url?: string }>("https://djiwatentram.yumme.id/api/auth/sign-in/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "google", callbackURL: window.location.href }) }); if (!payload.url) throw new Error("Google OAuth tidak tersedia"); window.location.assign(payload.url); }
export async function requestGenerateSticker(visitId: string, idempotencyKey: string) { return jsonFetch<StickerGenerateResponse>(`${API_BASE}/stickers/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ visit_id: visitId, idempotency_key: idempotencyKey }) }); }
export function stickerImageUrl(stickerId: string) { return `${API_BASE}/stickers/${encodeURIComponent(stickerId)}/image`; }
export async function requestCollectStamp(shopId: string, idempotencyKey: string) { return jsonFetch<{ message?: string; status?: string; visit_id?: string; shop_id?: string }>(`${API_BASE}/collect`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shop_id: shopId, idempotency_key: idempotencyKey }) }); }
export async function requestShopOnboarding(payload: { name: string; google_maps_url: string; area?: string; description?: string }) { return jsonFetch<{ message?: string; status?: string; shop_id?: string; listing_payment_id?: string; amount?: number; invoice_id?: string; invoice_url?: string }>(`${API_BASE}/shops/onboard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
export async function requestBid(shopId: string, bidAmount: number) { return jsonFetch<{ invoice_url?: string; message?: string }>(`${API_BASE}/bid/intent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shop_id: shopId, bid_amount: bidAmount, idempotency_key: `${crypto.randomUUID()}_${crypto.randomUUID()}` }) }); }
