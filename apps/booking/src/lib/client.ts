import { createClient as createSharedClient } from "@yumipos/web-shared/lib/client";
import { BOOKING_API_URL, BOOKING_SLUG, DEV_FALLBACK } from "./booking-constants";

export type BookingSettings = { slug: string; title: string | null; description: string | null; logoUrl: string | null; bannerUrl: string | null; themeColor: string | null; isActive: boolean; customFields: unknown[] | null };
export type Capacity = { date: string; maxPeople: number; maxTables: number; peoplePerTable: number; notes: string | null };
export type Product = { id: string; name: string; description: string | null; imageUrl: string | null; price: number; promoPrice: number | null; category: string | null; menuNumber: string | number | null };
export type BookingDraft = { date: string; guests: number; tableCount: number; items: Array<{ productId: string; name: string; price: number; quantity: number }>; customer: { name: string; phone: string; email: string; notes: string } };
export type BookingResult = { bookingCode: string; status: string; paymentStatus: string; date: string; guests: number; tableCount: number; items: BookingDraft["items"] };

export function isDataConfigured() { return Boolean((import.meta.env.VITE_SUPABASE_URL?.trim() || "https://supabase.yumme.id") && (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)); }

export async function loadBookingData() {
  if (!isDataConfigured()) throw new Error("Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.");
  const supabase = createSharedClient();
  const [settings, capacities, products] = await Promise.all([
    supabase.from("pos_booking_settings").select("*").eq("slug", BOOKING_SLUG).maybeSingle(),
    supabase.from("pos_booking_date_capacity").select("*").eq("slug", BOOKING_SLUG).order("date", { ascending: true }),
    supabase.from("pos_products_all").select("*").eq("isAvailable", true).order("menuNumber", { ascending: true, nullsFirst: false }),
  ]);
  if (settings.error) throw settings.error;
  if (capacities.error) throw capacities.error;
  if (products.error) throw products.error;
  return {
    settings: settings.data ? { slug: settings.data.slug, title: settings.data.title, description: settings.data.description ?? null, logoUrl: settings.data.logoUrl ?? null, bannerUrl: settings.data.bannerUrl ?? null, themeColor: settings.data.themeColor ?? null, isActive: Boolean(settings.data.isActive), customFields: Array.isArray(settings.data.customFields) ? settings.data.customFields : null } : null,
    capacities: (capacities.data ?? []).map((row: any) => ({ date: row.date ?? row.bookingDate ?? "", maxPeople: Number(row.maxPeople ?? 0), maxTables: Number(row.maxTables ?? 0), peoplePerTable: Number(row.peoplePerTable ?? 4), notes: row.notes ?? null })),
    products: (products.data ?? []).map((row: any) => ({ id: String(row._id ?? row.id ?? row.sourceId), name: row.name ?? "", description: row.description ?? null, imageUrl: row.imageUrl ?? row.imagePath ?? null, price: Number(row.price ?? 0), promoPrice: row.promoPrice == null ? null : Number(row.promoPrice), category: row.categoryName ?? row.category ?? null, menuNumber: row.menuNumber ?? null })),
  };
}

const apiBase = () => BOOKING_API_URL.replace(/\/$/, "");
const randomToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

function getGuestCredentials() {
  const stored = localStorage.getItem("booking-guest-credentials");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { accessToken?: string; guestSessionId?: string; idempotencyKey?: string };
      if (parsed.accessToken && parsed.guestSessionId && parsed.idempotencyKey) return parsed;
    } catch { /* regenerate malformed local state */ }
  }
  const credentials = { accessToken: randomToken(), guestSessionId: `guest_${randomToken()}`, idempotencyKey: randomToken() };
  localStorage.setItem("booking-guest-credentials", JSON.stringify(credentials));
  return credentials;
}

async function callBookingRpc(name: "create_public_booking" | "get_public_booking_status", args: Record<string, unknown>) {
  const supabase = createSharedClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || "Booking gagal diproses.");
  return data as BookingResult & { bookingDate?: string; bookingStatus?: string; paymentStatus?: string; guestCount?: number; tableCount?: number };
}

function normalizeResult(raw: BookingResult & { bookingDate?: string; bookingStatus?: string; paymentStatus?: string; guestCount?: number; tableCount?: number }): BookingResult {
  return { ...raw, date: raw.date ?? raw.bookingDate ?? "", status: raw.status ?? raw.bookingStatus ?? "pending", paymentStatus: raw.paymentStatus ?? "pending", guests: raw.guests ?? raw.guestCount ?? 0, tableCount: raw.tableCount ?? 0 };
}

export async function createBooking(draft: BookingDraft): Promise<BookingResult> {
  if (BOOKING_API_URL) {
    const credentials = getGuestCredentials();
    const result = normalizeResult(await callBookingRpc("create_public_booking", { p_payload: { slug: BOOKING_SLUG, bookingDate: draft.date, guestCount: draft.guests, customerName: draft.customer.name, customerPhone: draft.customer.phone, customerEmail: draft.customer.email, notes: draft.customer.notes, items: draft.items }, p_guest_session_id: credentials.guestSessionId, p_access_token: credentials.accessToken, p_idempotency_key: credentials.idempotencyKey }));
    localStorage.setItem("booking-last-code", result.bookingCode);
    return result;
  }
  if (DEV_FALLBACK) {
    const result: BookingResult = { bookingCode: `DEV-${Date.now().toString(36).toUpperCase()}`, status: "pending", paymentStatus: "not_required", date: draft.date, guests: draft.guests, tableCount: draft.tableCount, items: draft.items };
    localStorage.setItem("booking-dev-draft", JSON.stringify(result));
    return result;
  }
  throw new Error("Endpoint booking publik belum dikonfigurasi.");
}

export async function lookupBooking(code: string) {
  if (!BOOKING_API_URL) throw new Error("Endpoint status booking belum dikonfigurasi.");
  const credentials = getGuestCredentials();
  return normalizeResult(await callBookingRpc("get_public_booking_status", { p_slug: BOOKING_SLUG, p_booking_code: code, p_access_token: credentials.accessToken }));
}
