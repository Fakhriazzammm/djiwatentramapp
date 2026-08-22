import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function fail(code: string, message: string, status = 400) { return json({ success: false, error: { code, message } }, status); }
function text(value: unknown, maxLength: number) { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }
function token(value: unknown) { const result = text(value, 256); return result.length >= 32 ? result : ""; }

async function callRpc(name: string, body: JsonRecord) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Booking storage is not configured");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed: unknown = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  if (!response.ok) {
    const message = typeof parsed === "object" && parsed !== null && "message" in parsed ? String((parsed as JsonRecord).message) : "Booking request failed";
    const error = new Error(message); (error as Error & { status?: number }).status = response.status; throw error;
  }
  return parsed;
}

function normalizeBookingAnswers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as JsonRecord;
  const bookingType = text(input["Tipe booking"], 40);
  const bookingTypeLabel = text(input["Tipe booking label"], 120);
  const eventType = text(input["Jenis acara"], 80);
  const eventTypeLabel = text(input["Jenis acara label"], 120);
  const eventTypeOther = text(input["Jenis acara lainnya"], 120);
  if (bookingType === "event" && !eventType) throw Object.assign(new Error("Jenis acara wajib dipilih"), { status: 400 });
  if (eventType === "other" && !eventTypeOther) throw Object.assign(new Error("Jenis acara lainnya wajib diisi"), { status: 400 });
  return { ...input, "Tipe booking": bookingType, "Tipe booking label": bookingTypeLabel, "Jenis acara": eventType || null, "Jenis acara label": eventTypeLabel || null, "Jenis acara lainnya": eventTypeOther || null };
}

async function createBooking(body: JsonRecord) {
  const accessToken = token(body.accessToken);
  const idempotencyKey = token(body.idempotencyKey);
  if (!accessToken || !idempotencyKey) throw Object.assign(new Error("accessToken and idempotencyKey must be at least 32 characters"), { status: 400 });
  const payload = {
    slug: text(body.slug, 80), bookingDate: text(body.bookingDate, 10), customerName: text(body.customerName, 120),
    customerPhone: text(body.customerPhone, 40), customerEmail: text(body.customerEmail, 254), notes: text(body.notes, 1000),
    guestCount: body.guestCount, paymentMethod: text(body.paymentMethod, 40), customAnswers: normalizeBookingAnswers(body.customAnswers),
    items: Array.isArray(body.items) ? body.items.slice(0, 50).map((item) => { const row = item && typeof item === "object" ? item as JsonRecord : {}; return { productId: text(row.productId, 120), quantity: row.quantity }; }) : [],
  };
  if (!payload.slug || !payload.bookingDate || !payload.customerName || !payload.customerPhone) throw Object.assign(new Error("slug, bookingDate, customerName, and customerPhone are required"), { status: 400 });
  return callRpc("create_public_booking", { p_payload: payload, p_guest_session_id: text(body.guestSessionId, 160) || null, p_access_token: accessToken, p_idempotency_key: idempotencyKey });
}

async function getStatus(body: JsonRecord) {
  const slug = text(body.slug, 80), code = text(body.bookingCode, 40), accessToken = token(body.accessToken);
  if (!slug || !code || !accessToken) throw Object.assign(new Error("slug, bookingCode, and accessToken are required"), { status: 400 });
  return callRpc("get_public_booking_status", { p_slug: slug, p_booking_code: code, p_access_token: accessToken });
}

async function attachPayment(body: JsonRecord) {
  const slug = text(body.slug, 80), code = text(body.bookingCode, 40), accessToken = token(body.accessToken);
  const gateway = body.paymentGateway && typeof body.paymentGateway === "object" ? body.paymentGateway : null;
  if (!slug || !code || !accessToken || !gateway) {
    throw Object.assign(new Error("slug, bookingCode, accessToken, and paymentGateway are required"), { status: 400 });
  }
  return callRpc("attach_public_booking_payment", {
    p_slug: slug,
    p_booking_code: code,
    p_access_token: accessToken,
    p_payment_gateway: gateway,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  try {
    const body = await req.json() as JsonRecord;
    const action = text(body.action, 32);
    const result = action === "create"
      ? await createBooking(body)
      : action === "status"
        ? await getStatus(body)
        : action === "attach-payment"
          ? await attachPayment(body)
          : (() => { throw Object.assign(new Error("action must be create, status, or attach-payment"), { status: 400 }); })();
    return json({ success: true, data: result });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 500;
    const message = error instanceof Error ? error.message : "Booking request failed";
    const safeMessage = /key|token|authorization|secret/i.test(message) ? "Booking request failed" : message;
    const code = status === 404 || /not found/i.test(message) ? "BOOKING_NOT_FOUND" : status === 409 || /capacity|unavailable|full/i.test(message) ? "CAPACITY_CONFLICT" : status >= 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST";
    const responseStatus = code === "BOOKING_NOT_FOUND" ? 404 : code === "CAPACITY_CONFLICT" ? 409 : status >= 400 && status <= 599 ? status : 500;
    console.error("public-booking failed", { code, status: responseStatus, message: safeMessage });
    return fail(code, safeMessage, responseStatus);
  }
});
