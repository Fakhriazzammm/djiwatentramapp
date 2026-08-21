import { createClient as createSharedClient } from "@yumipos/web-shared/lib/client";
import { BOOKING_API_URL, BOOKING_SLUG, DEV_FALLBACK, SUPABASE_URL } from "./booking-constants";

export type BookingSettings = { slug: string; title: string | null; description: string | null; logoUrl: string | null; bannerUrl: string | null; themeColor: string | null; isActive: boolean; featuredProductIds: string[] | null; customFields: unknown[] | null; bookingWindowDays: number; defaultMaxPeople: number; defaultMaxTables: number; defaultPeoplePerTable: number };
export type Capacity = { date: string; maxPeople: number; maxTables: number; peoplePerTable: number; notes: string | null; isClosed?: boolean };
export type Product = { id: string; name: string; description: string | null; imageUrl: string | null; price: number; promoPrice: number | null; category: string | null; menuNumber: string | number | null };
export type BookingDraft = { date: string; guests: number; tableCount: number; items: Array<{ productId: string; name: string; price: number; quantity: number }>; customer: { name: string; phone: string; email: string; notes: string } };
export type BookingResult = { bookingId?: string; bookingCode: string; status: string; paymentStatus: string; date: string; guests: number; tableCount: number; totalAmount?: number; items: BookingDraft["items"]; invoiceId?: string; invoiceUrl?: string };

export function isDataConfigured() {
  return Boolean((import.meta.env.VITE_SUPABASE_URL?.trim() || SUPABASE_URL) && (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY));
}

export async function loadBookingData() {
  if (!isDataConfigured()) throw new Error("Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY (atau VITE_SUPABASE_ANON_KEY).");
  const supabase = createSharedClient();
  const [settings, capacities, products] = await Promise.all([
    supabase.from("pos_booking_settings").select("*").eq("slug", BOOKING_SLUG).maybeSingle(),
    supabase.from("pos_booking_date_capacity").select("*").eq("slug", BOOKING_SLUG).order("date", { ascending: true }),
    supabase.from("pos_products_all").select("*").eq("isAvailable", true).order("menuNumber", { ascending: true, nullsFirst: false }),
  ]);
  if (settings.error) throw settings.error;
  if (capacities.error) throw capacities.error;
  if (products.error) throw products.error;
  const settingsValue = settings.data ? { slug: settings.data.slug, title: settings.data.title, description: settings.data.description ?? null, logoUrl: settings.data.logoUrl ?? null, bannerUrl: settings.data.bannerUrl ?? null, themeColor: settings.data.themeColor ?? null, isActive: Boolean(settings.data.isActive), featuredProductIds: Array.isArray(settings.data.featuredProductIds) ? settings.data.featuredProductIds.map(String) : null, customFields: Array.isArray(settings.data.customFields) ? settings.data.customFields : null, bookingWindowDays: Math.max(1, Number(settings.data.bookingWindowDays ?? 90)), defaultMaxPeople: Math.max(0, Number(settings.data.defaultMaxPeople ?? 100)), defaultMaxTables: Math.max(0, Number(settings.data.defaultMaxTables ?? 25)), defaultPeoplePerTable: Math.max(1, Number(settings.data.defaultPeoplePerTable ?? 4)) } : null;
  const overrides = (capacities.data ?? []).map((row: any) => ({ date: row.date ?? row.bookingDate ?? "", maxPeople: Number(row.maxPeople ?? 0), maxTables: Number(row.maxTables ?? 0), peoplePerTable: Number(row.peoplePerTable ?? 4), notes: row.notes ?? null, isClosed: Boolean(row.isClosed ?? row.is_closed) }));
  const overrideByDate = new Map(overrides.map((entry) => [entry.date, entry]));
  const generated: Capacity[] = [];
  if (settingsValue) {
    const start = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00`);
    for (let offset = 0; offset < settingsValue.bookingWindowDays; offset += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const dateKey = date.toISOString().slice(0, 10);
      const override = overrideByDate.get(dateKey);
      if (override?.isClosed) continue;
      generated.push(override ? { date: override.date, maxPeople: override.maxPeople, maxTables: override.maxTables, peoplePerTable: override.peoplePerTable, notes: override.notes, isClosed: false } : { date: dateKey, maxPeople: settingsValue.defaultMaxPeople, maxTables: settingsValue.defaultMaxTables, peoplePerTable: settingsValue.defaultPeoplePerTable, notes: null });
    }
  }
  return {
    settings: settingsValue,
    capacities: generated,
    products: (() => {
      const mapped = (products.data ?? []).map((row: any) => ({ id: String(row._id ?? row.id ?? row.sourceId), name: row.name ?? "", description: row.description ?? null, imageUrl: row.imageUrl ?? row.imagePath ?? row.image ?? null, price: Number(row.price ?? 0), promoPrice: row.promoPrice == null ? null : Number(row.promoPrice), category: row.categoryName ?? row.category ?? null, menuNumber: row.menuNumber ?? null }));
      const featuredIds = settingsValue?.featuredProductIds ?? [];
      if (featuredIds.length === 0) return mapped;
      const byId = new Map(mapped.map((product) => [product.id, product]));
      return featuredIds.map((id: string) => byId.get(String(id))).filter((product: (typeof mapped)[number] | undefined): product is (typeof mapped)[number] => Boolean(product));
    })(),
  };
}

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

function getPublishableKey() {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";
}

async function callBookingApi(action: "create" | "status" | "attach-payment", body: Record<string, unknown>) {
  const key = getPublishableKey();
  const response = await fetch(BOOKING_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ action, ...body }),
  });
  const result = await response.json().catch(() => null) as { success?: boolean; data?: unknown; error?: { message?: string } } | null;
  if (!response.ok || !result?.success) throw new Error(result?.error?.message || "Booking gagal diproses.");
  return result.data as BookingResult & { bookingDate?: string; bookingStatus?: string; paymentStatus?: string; guestCount?: number; tableCount?: number; totalAmount?: number };
}

async function callMayar(body: Record<string, unknown>) {
  const key = getPublishableKey();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/mayar-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null) as { success?: boolean; data?: any; error?: { message?: string } } | null;
  if (!response.ok || !result?.success) throw new Error(result?.error?.message || "Pembayaran Pembayaran QRIS belum berhasil disiapkan.");
  return result.data;
}

function normalizeResult(raw: BookingResult & { bookingId?: string; bookingDate?: string; bookingStatus?: string; paymentStatus?: string; guestCount?: number; tableCount?: number; totalAmount?: number }): BookingResult {
  return { ...raw, bookingId: raw.bookingId, date: raw.date ?? raw.bookingDate ?? "", status: raw.status ?? raw.bookingStatus ?? "pending", paymentStatus: raw.paymentStatus ?? "pending", guests: raw.guests ?? raw.guestCount ?? 0, tableCount: raw.tableCount ?? 0, totalAmount: Number(raw.totalAmount ?? 0), items: Array.isArray(raw.items) ? raw.items : [] };
}

export async function createBooking(draft: BookingDraft): Promise<BookingResult> {
  if (BOOKING_API_URL) {
    const credentials = getGuestCredentials();
    const result = normalizeResult(await callBookingApi("create", { slug: BOOKING_SLUG, bookingDate: draft.date, guestCount: draft.guests, customerName: draft.customer.name, customerPhone: draft.customer.phone, customerEmail: draft.customer.email, notes: draft.customer.notes, items: draft.items.map((item) => ({ productId: item.productId, quantity: item.quantity })), guestSessionId: credentials.guestSessionId, accessToken: credentials.accessToken, idempotencyKey: credentials.idempotencyKey }));
    localStorage.setItem("booking-last-code", result.bookingCode);
    return result;
  }
  if (DEV_FALLBACK) {
    const result: BookingResult = { bookingCode: `DEV-${Date.now().toString(36).toUpperCase()}`, status: "pending", paymentStatus: "not_required", date: draft.date, guests: draft.guests, tableCount: draft.tableCount, totalAmount: draft.items.reduce((sum, item) => sum + item.price * item.quantity, 0), items: draft.items };
    localStorage.setItem("booking-dev-draft", JSON.stringify(result));
    return result;
  }
  throw new Error("Endpoint booking publik belum dikonfigurasi.");
}

export async function createBookingPayment(booking: BookingResult, draft: BookingDraft) {
  if (!booking.bookingId || !booking.bookingCode || !booking.totalAmount || booking.totalAmount <= 0 || !booking.items.length) {
    throw new Error("Pilih minimal satu menu agar booking dapat dibayar melalui QRIS.");
  }
  const credentials = getGuestCredentials();
  const redirectUrl = `${window.location.origin}/booking/status?code=${encodeURIComponent(booking.bookingCode)}`;
  const invoiceResponse = await callMayar({
    action: "create-invoice",
    name: draft.customer.name,
    email: draft.customer.email || undefined,
    mobile: draft.customer.phone,
    redirectUrl,
    description: `Booking ${BOOKING_SLUG} ${booking.bookingCode} untuk ${draft.date}`,
    expiredAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    extraData: { bookingId: booking.bookingId, bookingCode: booking.bookingCode, slug: BOOKING_SLUG },
    items: booking.items.map((item) => ({ quantity: item.quantity, rate: item.price, description: item.name })),
  });
  const payment = invoiceResponse?.data || invoiceResponse;
  const invoiceId = String(payment?.id || "");
  const invoiceUrl = String(payment?.link || payment?.paymentUrl || payment?.url || "");
  if (!invoiceId || !invoiceUrl) throw new Error("Pembayaran QRIS belum mengembalikan link pembayaran.");
  await callBookingApi("attach-payment", { slug: BOOKING_SLUG, bookingCode: booking.bookingCode, accessToken: credentials.accessToken, paymentGateway: { provider: "mayar", invoiceId, invoiceUrl, transactionId: payment?.transactionId || null, status: "pending" } });
  return { invoiceId, invoiceUrl };
}

export async function lookupBooking(code: string) {
  if (!BOOKING_API_URL) throw new Error("Endpoint status booking belum dikonfigurasi.");
  const credentials = getGuestCredentials();
  return normalizeResult(await callBookingApi("status", { slug: BOOKING_SLUG, bookingCode: code, accessToken: credentials.accessToken }));
}
