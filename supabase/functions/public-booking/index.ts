import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { buildBookingInvoicePayload } from "./payment-contract.ts";
import { normalizeMayarPaymentUrl } from "./payment-url.ts";

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
function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }

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
    slug: text(body.slug, 80), bookingDate: text(body.bookingDate, 10), arrivalTime: text(body.arrivalTime, 5), customerName: text(body.customerName, 120),
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

async function createPayment(body: JsonRecord): Promise<Response> {
  const status = await getStatus(body) as JsonRecord;
  const args = {
    p_slug: text(body.slug, 80),
    p_booking_code: text(body.bookingCode, 40),
    p_access_token: token(body.accessToken),
  };
  const hasRequestedGateway = body.paymentGateway !== undefined && body.paymentGateway !== null;
  const requestedGateway = hasRequestedGateway && typeof body.paymentGateway === "object" && !Array.isArray(body.paymentGateway)
    ? body.paymentGateway as JsonRecord
    : null;
  if (hasRequestedGateway && !requestedGateway) return fail("INVALID_PAYMENT_URL", "Link pembayaran tersimpan tidak valid", 400);
  const requestedUrl = requestedGateway ? normalizeMayarPaymentUrl(requestedGateway.invoiceUrl) : null;
  if (requestedGateway && (requestedGateway.provider !== "mayar" || !text(requestedGateway.invoiceId, 160) || !requestedUrl)) {
    return fail("INVALID_PAYMENT_URL", "Link pembayaran tersimpan tidak valid", 400);
  }

  const claimId = crypto.randomUUID();
  const contract = await callRpc("prepare_public_booking_payment", {
    ...args,
    p_claim_id: claimId,
    ...(requestedGateway ? {
      p_payment_gateway: {
        provider: "mayar",
        invoiceId: text(requestedGateway.invoiceId, 160),
        invoiceUrl: requestedUrl,
        transactionId: requestedGateway.transactionId ? text(requestedGateway.transactionId, 160) : null,
        status: "pending",
      },
    } : {}),
  }) as JsonRecord;
  const gateway = record(contract.paymentGateway);
  const savedInvoiceId = text(gateway.invoiceId, 160);
  const savedUrl = normalizeMayarPaymentUrl(gateway.invoiceUrl);
  if (savedInvoiceId && savedUrl) {
    return json({ success: true, data: { ...status, invoiceId: savedInvoiceId, invoiceUrl: savedUrl } });
  }
  if (requestedGateway) return fail("PAYMENT_ATTACH_FAILED", "Stored payment link could not be attached; reconciliation required before retry", 502);
  if (contract.paymentInProgress === true || contract.claimed !== true) {
    return fail("PAYMENT_IN_PROGRESS", "Booking payment is being prepared; retry status shortly", 409);
  }

  let invoicePayload: ReturnType<typeof buildBookingInvoicePayload>;
  try {
    invoicePayload = buildBookingInvoicePayload({
      bookingId: text(contract.bookingId, 160),
      bookingCode: text(contract.bookingCode, 80),
      customerName: text(contract.customerName, 120),
      customerEmail: text(contract.customerEmail, 254),
      customerPhone: text(contract.customerPhone, 40),
      bookingDate: text(contract.bookingDate, 10),
      guestExpiresAt: contract.guestExpiresAt as string | number,
      items: (Array.isArray(contract.items) ? contract.items : []).map((item) => {
        const row = record(item);
        return { name: text(row.name, 160), price: Number(row.price), quantity: Number(row.quantity) };
      }),
    }, body.redirectUrl);
  } catch {
    return fail("PAYMENT_CREATE_FAILED", "Booking payment data is incomplete; reconciliation required before retry", 502);
  }

  let providerData: JsonRecord;
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/mayar-proxy`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(invoicePayload),
    });
    const result = await response.json().catch(() => null) as JsonRecord | null;
    providerData = record(result?.data);
    if (!response.ok || result?.success !== true || !text(providerData.id, 160) || !text(providerData.link, 2000)) {
      return fail("PAYMENT_CREATE_FAILED", "Unable to prepare booking payment; reconciliation required before retry", 502);
    }
  } catch {
    return fail("PAYMENT_CREATE_FAILED", "Layanan pembayaran tidak dapat dihubungi; silakan coba lagi", 502);
  }

  const invoiceId = text(providerData.id, 160);
  const invoiceUrl = normalizeMayarPaymentUrl(providerData.link);
  if (!invoiceId || !invoiceUrl) return fail("PAYMENT_CREATE_FAILED", "Layanan pembayaran mengembalikan data tidak valid; silakan coba lagi", 502);
  const attached = await callRpc("prepare_public_booking_payment", {
    ...args,
    p_claim_id: claimId,
    p_payment_gateway: {
      provider: "mayar",
      invoiceId,
      invoiceUrl,
      transactionId: providerData.transactionId ? text(providerData.transactionId, 160) : null,
      status: "pending",
    },
  });
  const saved = record((attached as JsonRecord).paymentGateway);
  const persistedId = text(saved.invoiceId, 160);
  const persistedUrl = normalizeMayarPaymentUrl(saved.invoiceUrl);
  if (!persistedId || !persistedUrl) return fail("PAYMENT_ATTACH_FAILED", "Data pembayaran belum tersimpan; silakan coba lagi", 502);
  return json({ success: true, data: { ...status, invoiceId: persistedId, invoiceUrl: persistedUrl } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  try {
    const body = await req.json() as JsonRecord;
    const action = text(body.action, 32);
    if (action === "create-payment" || action === "attach-payment") return await createPayment(body);
    const result = action === "create"
      ? await createBooking(body)
      : action === "status"
        ? await getStatus(body)
        : (() => { throw Object.assign(new Error("action must be create, status, or create-payment"), { status: 400 }); })();
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
