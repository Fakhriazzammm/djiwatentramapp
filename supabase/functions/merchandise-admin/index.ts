import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Json = Record<string, unknown>;
const allowedRoles = new Set(["admin", "manager", "owner", "supervisor"]);
const campaignLifecycles = new Set(["draft", "scheduled", "open", "paused", "closed"]);
const fulfillmentStatuses = new Set(["pending", "preparing", "ready_to_ship", "shipped", "completed"]);
const refundStatuses = new Set(["approved", "denied", "processed"]);

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = url && serviceRoleKey
  ? createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function fail(code: string, message: string, status = 400) {
  return response({ success: false, error: { code, message } }, status);
}
function requiredText(value: unknown, name: string, max = 200): string {
  const result = text(value);
  if (!result || result.length > max) throw new Error(`${name} wajib diisi`);
  return result;
}
function uuid(value: unknown, name: string): string {
  const result = requiredText(value, name, 80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new Error(`${name} tidak valid`);
  return result;
}
function finitePositive(value: unknown, name: string, nullable = false): number | null {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1_000_000_000_000) throw new Error(`${name} tidak valid`);
  return number;
}
function isoDate(value: unknown, name: string): string {
  const result = requiredText(value, name, 40);
  const parsed = new Date(result);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} tidak valid`);
  return result;
}
function dateOnly(value: unknown, name: string): string {
  const result = requiredText(value, name, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  const parsed = match ? new Date(`${result}T00:00:00Z`) : new Date("invalid");
  if (!match || Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() + 1 !== Number(match[2]) || parsed.getUTCDate() !== Number(match[3])) throw new Error(`${name} tidak valid`);
  return result;
}
function ensureDb() { if (!db) throw new Error("Supabase service is not configured"); return db; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Gagal memproses merchandise preorder"; }

async function verifyStaff(payload: Json): Promise<string> {
  const admin = ensureDb();
  const token = text(payload.staffToken);
  if (!token || token.startsWith("local_yumi_session:")) throw new Error("Sesi staff tidak valid");
  const { data: session, error: sessionError } = await admin.from("yumi_sessions")
    .select("user_source_id").eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (sessionError) throw sessionError;
  const staffId = text(session?.user_source_id);
  if (!staffId) throw new Error("Sesi staff tidak valid");
  const { data: user, error: userError } = await admin.from("yumi_users")
    .select("source_id,role_source_id,is_active").eq("source_id", staffId).maybeSingle();
  if (userError) throw userError;
  if (!user?.is_active) throw new Error("Staff tidak aktif");
  const { data: role, error: roleError } = await admin.from("yumi_roles")
    .select("name").eq("source_id", user.role_source_id).maybeSingle();
  if (roleError) throw roleError;
  if (!allowedRoles.has(text(role?.name).toLowerCase())) throw new Error("Role tidak memiliki akses merchandise preorder");
  return staffId;
}

async function ownedOrder(payload: Json, orderId = text(payload.orderId)): Promise<{ order: Json; customerId: string }> {
  const admin = ensureDb();
  const customerId = requiredText(payload.sourceId, "sourceId", 160);
  const email = requiredText(payload.email, "email", 320).toLowerCase();
  const orderAccessKey = requiredText(payload.orderAccessKey, "orderAccessKey", 200);
  if (!orderId) throw new Error("orderId wajib diisi");
  const { data: order, error } = await admin.schema("pos").from("orders")
    .select("source_id,customer_source_id,brand_slug,source,status,idempotency_key")
    .eq("source_id", orderId).maybeSingle();
  if (error) throw error;
  if (!order || text(order.brand_slug).toLowerCase() !== "merchandise"
      || text(order.source) !== "customer_self_service"
      || text(order.customer_source_id) !== customerId
      || text(order.idempotency_key) !== orderAccessKey) throw new Error("Order tidak ditemukan");
  const { data: customer, error: customerError } = await admin.schema("pos").from("customers").select("source_id,email").eq("source_id", customerId).maybeSingle();
  if (customerError) throw customerError;
  if (!customer || text(customer.email).toLowerCase() !== email) throw new Error("Verifikasi customer gagal");
  return { order: order as Json, customerId };
}

async function getCustomerPreorder(payload: Json) {
  const admin = ensureDb();
  const { order, customerId } = await ownedOrder(payload);
  const { data: reservations, error } = await admin.schema("pos").from("merchandise_reservations")
    .select("id,campaign_id,order_source_id,line_no,product_source_id,quantity,status,fulfillment_status,expected_dispatch_start,expected_dispatch_end,tracking_carrier,tracking_number,shipped_at,completed_at,held_at,expires_at,confirmed_at,released_at")
    .eq("order_source_id", text(order.source_id)).order("line_no", { ascending: true });
  if (error) throw error;
  const ids = (reservations ?? []).map((row: Json) => row.id).filter(Boolean);
  let refunds: unknown[] = [];
  let fulfillmentEvents: unknown[] = [];
  if (ids.length) {
    const result = await admin.schema("pos").from("merchandise_refund_requests")
      .select("id,reservation_id,order_source_id,request_reason,status,reviewed_at,decision_reason,refund_reference,processed_at,created_at")
      .eq("order_source_id", text(order.source_id)).in("reservation_id", ids).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    refunds = result.data ?? [];
    const history = await admin.schema("pos").from("merchandise_fulfillment_events")
      .select("id,reservation_id,event_type,actor_source_id,previous_status,next_status,tracking_carrier,tracking_number,created_at")
      .in("reservation_id", ids).order("created_at", { ascending: true });
    if (history.error) throw history.error;
    fulfillmentEvents = history.data ?? [];
  }
  return { order: { source_id: order.source_id, status: order.status, customer_source_id: customerId }, reservations: reservations ?? [], refunds, fulfillmentEvents };
}

async function requestRefund(payload: Json) {
  const admin = ensureDb();
  const { order, customerId } = await ownedOrder(payload);
  const reservationId = uuid(payload.reservationId, "reservationId");
  const reason = requiredText(payload.reason, "reason", 2000);
  if (!new Set(["paid", "completed", "settled"]).has(text(order.status).toLowerCase())) throw new Error("Refund hanya dapat diajukan untuk order yang sudah dibayar");
  const { data: reservation, error: reservationError } = await admin.schema("pos").from("merchandise_reservations")
    .select("id,order_source_id,status,fulfillment_status").eq("id", reservationId).eq("order_source_id", text(order.source_id)).maybeSingle();
  if (reservationError) throw reservationError;
  if (!reservation || reservation.status !== "confirmed" || reservation.fulfillment_status === "cancelled") throw new Error("Reservasi tidak memenuhi syarat refund");
  const { data: existing, error: existingError } = await admin.schema("pos").from("merchandise_refund_requests")
    .select("id,status").eq("reservation_id", reservationId).in("status", ["pending", "approved", "processed"]).maybeSingle();
  if (existingError) throw existingError;
  if (existing) throw new Error("Refund request masih diproses atau sudah selesai");
  const { data, error } = await admin.schema("pos").from("merchandise_refund_requests").insert({ reservation_id: reservationId, order_source_id: text(order.source_id), requested_by: customerId, request_reason: reason }).select("id,reservation_id,order_source_id,request_reason,status,created_at").single();
  if (error) throw error;
  return data;
}

async function listCampaigns(payload: Json) {
  const admin = ensureDb();
  const query = admin.schema("pos").from("merchandise_campaigns").select("*").order("sale_window_start", { ascending: false });
  const lifecycle = text(payload.lifecycle);
  if (lifecycle) { if (!campaignLifecycles.has(lifecycle)) throw new Error("lifecycle tidak valid"); query.eq("lifecycle", lifecycle); }
  const { data, error } = await query;
  if (error) throw error;
  return { campaigns: data ?? [] };
}

async function saveCampaign(payload: Json, staffId: string, update: boolean) {
  const admin = ensureDb();
  const productId = requiredText(payload.productSourceId, "productSourceId", 160);
  const lifecycle = text(payload.lifecycle) || "draft";
  if (!campaignLifecycles.has(lifecycle)) throw new Error("lifecycle tidak valid");
  const start = isoDate(payload.saleWindowStart, "saleWindowStart");
  const end = isoDate(payload.saleWindowEnd, "saleWindowEnd");
  if (new Date(end) <= new Date(start)) throw new Error("saleWindowEnd harus setelah saleWindowStart");
  const dispatchStart = dateOnly(payload.expectedDispatchStart, "expectedDispatchStart");
  const dispatchEnd = dateOnly(payload.expectedDispatchEnd, "expectedDispatchEnd");
  if (dispatchEnd < dispatchStart) throw new Error("expectedDispatchEnd tidak valid");
  const values = { product_source_id: productId, lifecycle, sale_window_start: start, sale_window_end: end, expected_dispatch_start: dispatchStart, expected_dispatch_end: dispatchEnd, capacity: finitePositive(payload.capacity, "capacity", true), max_per_customer: finitePositive(payload.maxPerCustomer, "maxPerCustomer", true), updated_by: staffId };
  if (update) {
    const id = uuid(payload.campaignId, "campaignId");
    const { data, error } = await admin.schema("pos").from("merchandise_campaigns").update(values).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await admin.schema("pos").from("merchandise_campaigns").insert({ ...values, created_by: staffId }).select("*").single();
  if (error) throw error;
  return data;
}

async function adminReservations(payload: Json) {
  const admin = ensureDb();
  const query = admin.schema("pos").from("merchandise_reservations").select("*").order("held_at", { ascending: false });
  const campaignId = text(payload.campaignId); const orderId = text(payload.orderId); const status = text(payload.status);
  if (campaignId) query.eq("campaign_id", uuid(campaignId, "campaignId"));
  if (orderId) query.eq("order_source_id", requiredText(orderId, "orderId", 160));
  if (status) { if (!["held", "confirmed", "released", "expired"].includes(status)) throw new Error("status tidak valid"); query.eq("status", status); }
  const { data, error } = await query.limit(500);
  if (error) throw error;
  const orderIds = [...new Set((data ?? []).map((row: Json) => text(row.order_source_id)).filter(Boolean))];
  const ordersById = new Map<string, Json>();
  if (orderIds.length) {
    const { data: orders, error: ordersError } = await admin.schema("pos").from("orders")
      .select("source_id,order_number,customer_name,customer_email,delivery_contact_name,delivery_contact_phone,delivery_address,total_amount,status,payment_method,payment_gateway,created_at")
      .in("source_id", orderIds);
    if (ordersError) throw ordersError;
    for (const order of orders ?? []) ordersById.set(text(order.source_id), order as Json);
  }
  return { reservations: (data ?? []).map((row) => ({ ...row, order: ordersById.get(text(row.order_source_id)) ?? null })) };
}

async function reviewRefund(payload: Json, staffId: string) {
  const admin = ensureDb();
  const id = uuid(payload.refundRequestId, "refundRequestId");
  const status = text(payload.status);
  const reason = requiredText(payload.reason, "reason", 2000);
  if (!refundStatuses.has(status)) throw new Error("Status review tidak valid");
  const reference = text(payload.refundReference);
  if (status === "processed" && !reference) throw new Error("refundReference wajib untuk processed");
  if (reference.length > 240) throw new Error("refundReference terlalu panjang");
  const { data: current, error: currentError } = await admin.schema("pos").from("merchandise_refund_requests").select("id,status").eq("id", id).maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("Refund request tidak ditemukan");
  if ((current.status === "pending" && !["approved", "denied"].includes(status)) || (current.status === "approved" && status !== "processed") || ["denied", "processed"].includes(current.status)) throw new Error("Perubahan status refund tidak diizinkan");
  const updates: Json = { status, reviewed_by: staffId, reviewed_at: new Date().toISOString(), decision_reason: reason };
  if (status === "processed") { updates.refund_reference = reference; updates.processed_at = new Date().toISOString(); }
  const { data, error } = await admin.schema("pos").from("merchandise_refund_requests").update(updates)
    .eq("id", id).eq("status", current.status).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Status refund berubah; muat ulang sebelum mencoba lagi");
  return data;
}

async function updateFulfillment(payload: Json, staffId: string) {
  const admin = ensureDb();
  const id = uuid(payload.reservationId, "reservationId");
  const fulfillmentStatus = text(payload.fulfillmentStatus);
  if (!fulfillmentStatuses.has(fulfillmentStatus)) throw new Error("fulfillmentStatus tidak valid");
  const { data: current, error: currentError } = await admin.schema("pos").from("merchandise_reservations")
    .select("id,status,fulfillment_status,tracking_carrier,tracking_number")
    .eq("id", id).maybeSingle();
  if (currentError) throw currentError;
  if (!current || current.status !== "confirmed") throw new Error("Reservasi preorder tidak ditemukan atau belum dibayar");
  const currentStatus = text(current.fulfillment_status);
  const transitions: Record<string, string[]> = {
    pending: ["preparing"], preparing: ["ready_to_ship"], ready_to_ship: ["shipped"], shipped: ["completed"], completed: [],
  };
  if (fulfillmentStatus !== currentStatus && !(transitions[currentStatus] ?? []).includes(fulfillmentStatus)) {
    throw new Error(`Perpindahan fulfillment ${currentStatus} ke ${fulfillmentStatus} tidak diizinkan`);
  }
  const carrier = text(payload.trackingCarrier) || text(current.tracking_carrier);
  const tracking = text(payload.trackingNumber) || text(current.tracking_number);
  if (fulfillmentStatus === "shipped" && (!carrier || !tracking)) throw new Error("Carrier dan tracking number wajib saat shipped");
  if (carrier.length > 120 || tracking.length > 200) throw new Error("Data tracking terlalu panjang");
  const updates: Json = { fulfillment_status: fulfillmentStatus, updated_by: staffId };
  if (carrier) updates.tracking_carrier = carrier;
  if (tracking) updates.tracking_number = tracking;
  if (currentStatus !== fulfillmentStatus && fulfillmentStatus === "shipped") updates.shipped_at = new Date().toISOString();
  if (currentStatus !== fulfillmentStatus && fulfillmentStatus === "completed") updates.completed_at = new Date().toISOString();
  const { data, error } = await admin.schema("pos").from("merchandise_reservations").update(updates)
    .eq("id", id).eq("fulfillment_status", currentStatus).select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Status fulfillment berubah; muat ulang sebelum mencoba lagi");
  console.info("merchandise fulfillment updated", { staffId, reservationId: id, fulfillmentStatus });
  return data;
}

async function adminFulfillmentEvents(payload: Json) {
  const admin = ensureDb();
  const reservationId = uuid(payload.reservationId, "reservationId");
  const { data, error } = await admin.schema("pos").from("merchandise_fulfillment_events")
    .select("id,reservation_id,event_type,actor_source_id,previous_status,next_status,tracking_carrier,tracking_number,created_at")
    .eq("reservation_id", reservationId).order("created_at", { ascending: true }).limit(100);
  if (error) throw error;
  return { events: data ?? [] };
}

async function adminRefunds(payload: Json) {
  const admin = ensureDb();
  const query = admin.schema("pos").from("merchandise_refund_requests").select("*").order("created_at", { ascending: false });
  const status = text(payload.status);
  if (status) { if (!new Set(["pending", "approved", "denied", "processed"]).has(status)) throw new Error("status tidak valid"); query.eq("status", status); }
  const { data, error } = await query.limit(500);
  if (error) throw error;
  const reservationIds = [...new Set((data ?? []).map((row) => text(row.reservation_id)).filter(Boolean))];
  const reservationsById = new Map<string, Json>();
  if (reservationIds.length) {
    const { data: reservations, error: reservationError } = await admin.schema("pos").from("merchandise_reservations")
      .select("id,product_source_id,quantity,fulfillment_status")
      .in("id", reservationIds);
    if (reservationError) throw reservationError;
    for (const reservation of reservations ?? []) reservationsById.set(text(reservation.id), reservation as Json);
  }
  const orderIds = [...new Set((data ?? []).map((row: Json) => text(row.order_source_id)).filter(Boolean))];
  const ordersById = new Map<string, Json>();
  if (orderIds.length) {
    const { data: orders, error: ordersError } = await admin.schema("pos").from("orders")
      .select("source_id,order_number,customer_name,customer_email,total_amount,status,payment_method,payment_gateway,created_at")
      .in("source_id", orderIds);
    if (ordersError) throw ordersError;
    for (const order of orders ?? []) ordersById.set(text(order.source_id), order as Json);
  }
  return { refunds: (data ?? []).map((row: Json) => ({
    ...row,
    reservation: reservationsById.get(text(row.reservation_id)) ?? null,
    order: ordersById.get(text(row.order_source_id)) ?? null,
  })) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "POST required", 405);
  try {
    const body = await req.json() as Json;
    const action = text(body.action).replace(/([A-Z])/g, "-$1").toLowerCase();
    if (!action) return fail("INVALID_ACTION", "action wajib diisi", 400);
    if (["get-status", "get-preorder", "request-refund"].includes(action)) {
      if (action === "get-status" || action === "get-preorder") return response({ success: true, ...(await getCustomerPreorder(body)) });
      return response({ success: true, refund: await requestRefund(body) });
    }
    const staffId = await verifyStaff(body);
    let result: unknown;
    switch (action) {
      case "list-campaigns": result = await listCampaigns(body); break;
      case "create-campaign": result = await saveCampaign(body, staffId, false); break;
      case "update-campaign": result = await saveCampaign(body, staffId, true); break;
      case "list-reservations": result = await adminReservations(body); break;
      case "list-refunds": result = await adminRefunds(body); break;
      case "review-refund": result = await reviewRefund(body, staffId); break;
      case "update-fulfillment": result = await updateFulfillment(body, staffId); break;
      case "list-fulfillment-events": result = await adminFulfillmentEvents(body); break;
      default: return fail("UNKNOWN_ACTION", "Action merchandise preorder tidak didukung", 404);
    }
    return response({ success: true, result });
  } catch (error) {
    console.error("merchandise-admin failed", error);
    const detail = errorMessage(error);
    const safe = /wajib|tidak valid|tidak ditemukan|tidak diizinkan|tidak memenuhi|sudah dibayar|masih diproses|Sesi|Role|Carrier|Status|Action/i.test(detail)
      ? detail : "Gagal memproses merchandise preorder";
    return fail("MERCHANDISE_ADMIN_ERROR", safe, 400);
  }
});
