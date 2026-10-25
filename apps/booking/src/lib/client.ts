import { createClient as createSharedClient } from "@yumipos/web-shared/lib/client";
import { BOOKING_API_URL, BOOKING_SLUG, DEV_FALLBACK, SUPABASE_URL, type BookingOption } from "./booking-constants";
import { resolveBookingAssetUrl } from "./asset-url";

export type BookingCustomField = { id: string; label: string; type: string; options: string[]; placeholder: string; required: boolean; isBookingEventOption?: boolean };
export type BookingSettings = {
  slug: string;
  title: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  themeColor: string | null;
  isActive: boolean;
  featuredProductIds: string[] | null;
  customFields: BookingCustomField[];
  bookingTypes: BookingOption[];
  eventTypes: BookingOption[];
  bookingWindowDays: number;
  defaultMaxPeople: number;
  defaultMaxTables: number;
  defaultPeoplePerTable: number;
};
export type Capacity = { date: string; maxPeople: number; maxTables: number; peoplePerTable: number; notes: string | null; isClosed?: boolean };
export type Category = { id: string; name: string; parentId: string | null; displayOrder: number };
export type Product = { id: string; name: string; description: string | null; imageUrl: string | null; price: number; promoPrice: number | null; categoryId: string | null; category: string | null; menuNumber: string | number | null };
export type BookingDraft = {
  bookingType: string;
  bookingTypeLabel: string;
  eventType?: string;
  eventTypeLabel?: string;
  eventTypeOther?: string;
  date: string;
  arrivalTime: string;
  guests: number;
  tableCount: number;
  items: Array<{ productId: string; name: string; price: number; quantity: number }>;
  customer: { name: string; phone: string; email: string; notes: string };
  customAnswers: Record<string, unknown>;
  customerSourceId?: string;
};
export type BookingResult = { bookingId?: string; bookingCode: string; status: string; paymentStatus: string; date: string; arrivalTime?: string | null; guests: number; tableCount: number; totalAmount?: number; items: BookingDraft["items"]; invoiceId?: string; invoiceUrl?: string };

export function isDataConfigured() {
  return Boolean((import.meta.env.VITE_SUPABASE_URL?.trim() || SUPABASE_URL) && (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY));
}

function optionList(value: unknown): BookingOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item, index) => ({
      key: String(item.key ?? "").trim(),
      label: String(item.label ?? "").trim(),
      description: String(item.description ?? "").trim(),
      icon: typeof item.icon === "string" ? item.icon : undefined,
      sortOrder: Number(item.sortOrder ?? index + 1),
      isActive: item.isActive !== false,
      requiresCustomText: item.requiresCustomText === true,
    }))
    .filter((item) => item.key && item.label && item.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function customFieldList(value: unknown): BookingCustomField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({
      id: String(item.id ?? "").trim(),
      label: String(item.label ?? "").trim(),
      type: String(item.type ?? "text").trim(),
      options: Array.isArray(item.options) ? item.options.map(String).filter(Boolean) : [],
      placeholder: String(item.placeholder ?? "").trim(),
      required: item.required === true,
      isBookingEventOption: item.isBookingEventOption === true,
    }))
    .filter((field) => field.id && field.label);
}

export async function loadBookingData() {
  if (!isDataConfigured()) throw new Error("Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY (atau VITE_SUPABASE_ANON_KEY).");
  const supabase = createSharedClient();
  const [settings, capacities, products, categories] = await Promise.all([
    supabase.from("pos_booking_settings").select("*").eq("slug", BOOKING_SLUG).maybeSingle(),
    supabase.from("pos_booking_date_capacity").select("*").eq("slug", BOOKING_SLUG).order("date", { ascending: true }),
    supabase.from("pos_products_all").select("*").eq("isAvailable", true).order("menuNumber", { ascending: true, nullsFirst: false }),
    supabase.from("pos_categories").select("*").order("displayOrder", { ascending: true }),
  ]);
  if (settings.error) throw settings.error;
  if (capacities.error) throw capacities.error;
  if (products.error) throw products.error;
  if (categories.error) throw categories.error;

  const raw = settings.data?.raw && typeof settings.data.raw === "object" ? settings.data.raw as Record<string, unknown> : {};
  const customFields = customFieldList(settings.data?.customFields);
  const bookingTypes = optionList(raw.bookingTypes);
  const eventTypes = optionList(raw.eventTypes);
  const settingsValue = settings.data ? {
    slug: settings.data.slug,
    title: settings.data.title,
    description: settings.data.description ?? null,
    logoUrl: settings.data.logoUrl ?? null,
    bannerUrl: settings.data.bannerUrl ?? null,
    themeColor: settings.data.themeColor ?? null,
    isActive: Boolean(settings.data.isActive),
    featuredProductIds: Array.isArray(settings.data.featuredProductIds) ? settings.data.featuredProductIds.map(String) : null,
    customFields,
    bookingTypes,
    eventTypes,
    bookingWindowDays: Math.max(1, Number(settings.data.bookingWindowDays ?? 90)),
    defaultMaxPeople: Math.max(0, Number(settings.data.defaultMaxPeople ?? 100)),
    defaultMaxTables: Math.max(0, Number(settings.data.defaultMaxTables ?? 25)),
    defaultPeoplePerTable: Math.max(1, Number(settings.data.defaultPeoplePerTable ?? 4)),
  } : null;

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
    categories: (categories.data ?? []).map((row: any) => ({
      id: String(row._id ?? row.id ?? row.sourceId),
      name: String(row.name ?? ""),
      parentId: row.parentId == null ? null : String(row.parentId),
      displayOrder: Number(row.displayOrder ?? 0),
    })).filter((category) => category.id && category.name),
    products: (() => {
      const mapped = (products.data ?? []).map((row: any) => ({ id: String(row._id ?? row.id ?? row.sourceId), name: row.name ?? "", description: row.description ?? null, imageUrl: resolveBookingAssetUrl(row.imageUrl ?? row.imagePath ?? row.image_url ?? row.image_path ?? row.image), price: Number(row.price ?? 0), promoPrice: row.promoPrice == null ? null : Number(row.promoPrice), categoryId: row.categoryId == null ? null : String(row.categoryId), category: row.categoryName ?? row.category ?? null, menuNumber: row.menuNumber ?? null }));
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

function getPendingPayment(code: string) {
  try {
    const raw = sessionStorage.getItem(`booking-pending-payment-${code}`);
    return raw ? JSON.parse(raw) as { invoiceId?: string; invoiceUrl?: string } : null;
  } catch { return null; }
}

function getPublishableKey() {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "";
}

async function callBookingApi(action: "create" | "status" | "create-payment" | "attach-payment", body: Record<string, unknown>) {
  const key = getPublishableKey();
  const response = await fetch(BOOKING_API_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify({ action, ...body }) });
  const result = await response.json().catch(() => null) as { success?: boolean; data?: unknown; error?: { message?: string } } | null;
  if (!response.ok || !result?.success) throw new Error(result?.error?.message || "Booking gagal diproses.");
  return result.data as BookingResult & { bookingDate?: string; bookingStatus?: string; paymentStatus?: string; guestCount?: number; tableCount?: number; totalAmount?: number };
}

function normalizeResult(raw: BookingResult & { bookingId?: string; bookingDate?: string; bookingStatus?: string; paymentStatus?: string; guestCount?: number; tableCount?: number; totalAmount?: number }): BookingResult {
  return { ...raw, bookingId: raw.bookingId, date: raw.date ?? raw.bookingDate ?? "", arrivalTime: raw.arrivalTime ?? null, status: raw.status ?? raw.bookingStatus ?? "pending", paymentStatus: raw.paymentStatus ?? "pending", guests: raw.guests ?? raw.guestCount ?? 0, tableCount: raw.tableCount ?? 0, totalAmount: Number(raw.totalAmount ?? 0), items: Array.isArray(raw.items) ? raw.items : [] };
}

export async function createBooking(draft: BookingDraft): Promise<BookingResult> {
  if (BOOKING_API_URL) {
    const credentials = getGuestCredentials();
    let result = normalizeResult(await callBookingApi("create", { slug: BOOKING_SLUG, bookingDate: draft.date, arrivalTime: draft.arrivalTime, guestCount: draft.guests, customerName: draft.customer.name, customerPhone: draft.customer.phone, customerEmail: draft.customer.email, customerSourceId: draft.customerSourceId, notes: draft.customer.notes, customAnswers: draft.customAnswers, items: draft.items.map((item) => ({ productId: item.productId, quantity: item.quantity })), paymentMethod: "qris", guestSessionId: credentials.guestSessionId, accessToken: credentials.accessToken, idempotencyKey: credentials.idempotencyKey }));
    if (result.bookingId && result.bookingCode && result.items.length === 0) {
      try {
        const recovered = await lookupBooking(result.bookingCode);
        result = { ...result, ...recovered, items: recovered.items.length ? recovered.items : result.items };
      } catch { /* keep the create response; payment will report a clear error if items are unavailable */ }
    }
    localStorage.setItem("booking-last-code", result.bookingCode);
    return result;
  }
  if (DEV_FALLBACK) {
    const result: BookingResult = { bookingCode: `DEV-${Date.now().toString(36).toUpperCase()}`, status: "pending", paymentStatus: "not_required", date: draft.date, arrivalTime: draft.arrivalTime, guests: draft.guests, tableCount: draft.tableCount, totalAmount: draft.items.reduce((sum, item) => sum + item.price * item.quantity, 0), items: draft.items };
    localStorage.setItem("booking-dev-draft", JSON.stringify(result));
    return result;
  }
  throw new Error("Endpoint booking publik belum dikonfigurasi.");
}

export async function createBookingPayment(booking: BookingResult, _draft: BookingDraft) {
  if (!booking.bookingId || !booking.bookingCode || !booking.totalAmount || booking.totalAmount <= 0 || !booking.items.length) throw new Error("Pilih minimal satu menu agar booking dapat dibayar.");
  const credentials = getGuestCredentials();
  const storageKey = `booking-payment-${booking.bookingCode}`;
  const stored = sessionStorage.getItem(storageKey);
  if (stored) {
    try {
      const existing = JSON.parse(stored) as { invoiceId?: string; invoiceUrl?: string };
      if (existing.invoiceId && existing.invoiceUrl) {
        await callBookingApi("create-payment", { slug: BOOKING_SLUG, bookingCode: booking.bookingCode, accessToken: credentials.accessToken, redirectUrl: `${window.location.origin}/status?code=${encodeURIComponent(booking.bookingCode)}`, paymentGateway: { provider: "mayar", invoiceId: existing.invoiceId, invoiceUrl: existing.invoiceUrl, status: "pending" } });
        return existing;
      }
    } catch { sessionStorage.removeItem(storageKey); }
  }
  const pending = getPendingPayment(booking.bookingCode);
  if (pending?.invoiceId && pending.invoiceUrl) {
    await callBookingApi("create-payment", { slug: BOOKING_SLUG, bookingCode: booking.bookingCode, accessToken: credentials.accessToken, redirectUrl: `${window.location.origin}/status?code=${encodeURIComponent(booking.bookingCode)}`, paymentGateway: { provider: "mayar", invoiceId: pending.invoiceId, invoiceUrl: pending.invoiceUrl, status: "pending" } });
    return pending;
  }
  const redirectUrl = `${window.location.origin}/status?code=${encodeURIComponent(booking.bookingCode)}`;
  const payment = await callBookingApi("create-payment", { slug: BOOKING_SLUG, bookingCode: booking.bookingCode, accessToken: credentials.accessToken, redirectUrl });
  const invoiceId = String(payment?.invoiceId || "");
  const invoiceUrl = String(payment?.invoiceUrl || "");
  if (!invoiceId || !invoiceUrl) throw new Error("Link pembayaran belum tersedia.");
  sessionStorage.setItem(storageKey, JSON.stringify({ invoiceId, invoiceUrl }));
  sessionStorage.setItem(`booking-pending-payment-${booking.bookingCode}`, JSON.stringify({ invoiceId, invoiceUrl }));
  return { invoiceId, invoiceUrl };
}

export async function lookupBooking(code: string) {
  if (!BOOKING_API_URL) throw new Error("Endpoint status booking belum dikonfigurasi.");
  const credentials = getGuestCredentials();
  return normalizeResult(await callBookingApi("status", { slug: BOOKING_SLUG, bookingCode: code, accessToken: credentials.accessToken }));
}
