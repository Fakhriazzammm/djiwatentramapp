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
  sticker_path: string | null;
  sticker_status: string | null;
};
export type PassportCollection = { customer_id: string; shop_id: string; shop_name: string; shop_slug: string; first_visit_at: string; visit_count: number; sticker_completed: boolean };
export type PassportState = { authenticated: boolean; customer: { name: string | null; email: string | null; photo_url: string | null } | null; shops: PassportShop[]; visits: PassportVisit[]; collection: PassportCollection[]; rewards: { available: number; count: number } };

const API_BASE = "https://djiwatentram.yumme.id/api/coffee-passport";
export async function fetchPassport(): Promise<PassportState> {
  const response = await fetch(`${API_BASE}/bootstrap`, { credentials: "include", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Passport API HTTP ${response.status}`);
  const payload = await response.json() as { success?: boolean } & PassportState;
  if (!payload.success) throw new Error("Passport API returned an invalid response");
  return payload;
}
export async function requestGoogleLogin() {
  const response = await fetch("https://djiwatentram.yumme.id/api/auth/sign-in/social", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "google", callbackURL: window.location.href }) });
  const payload = await response.json().catch(() => null) as { url?: string } | null;
  if (!response.ok || !payload?.url) throw new Error("Google OAuth tidak tersedia");
  window.location.assign(payload.url);
}

export async function requestCollectStamp(shopId: string, idempotencyKey: string) {
  const response = await fetch("https://djiwatentram.yumme.id/api/coffee-passport/collect", { method: "POST", credentials: "include", headers: { "content-type": "application/json", Accept: "application/json" }, body: JSON.stringify({ shop_id: shopId, idempotency_key: idempotencyKey }) });
  const payload = await response.json().catch(() => null) as { message?: string; status?: string } | null;
  if (!response.ok) throw new Error(payload?.message ?? "Stamp belum bisa disimpan. Coba lagi.");
  return payload;
}

export async function requestShopOnboarding(payload: { name: string; google_maps_url: string; area?: string; description?: string }) {
  const response = await fetch("https://djiwatentram.yumme.id/api/coffee-passport/shops/onboard", { method: "POST", credentials: "include", headers: { "content-type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => null) as { message?: string; shop_id?: string } | null;
  if (!response.ok) throw new Error(result?.message ?? "Data kedai belum bisa dikirim.");
  return result;
}
