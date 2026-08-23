import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-secret, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const actionMap: Record<string, string> = {
  createBooking: "admin_create_booking",
  updateBooking: "admin_update_booking",
  updateBookingStatus: "admin_update_booking_status",
  deleteBooking: "admin_delete_booking",
  upsertSettings: "admin_upsert_booking_settings",
  upsertCapacity: "admin_upsert_booking_capacity",
  upsertBulkCapacity: "admin_upsert_booking_bulk_capacity",
  readTimeline: "booking_read_timeline",
  readDelivery: "booking_read_delivery",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405);

  const expected = Deno.env.get("ONBOARDING_ADMIN_SECRET") ?? "";
  const received = req.headers.get("x-admin-secret") ?? "";
  if (!expected || received.length !== expected.length || received !== expected) {
    return json({ success: false, error: { code: "UNAUTHORIZED", message: "Admin booking authorization failed" } }, 401);
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    const fn = actionMap[action];
    if (!fn) return json({ success: false, error: { code: "UNKNOWN_ACTION", message: "Booking action is not supported" } }, 400);

    const url = Deno.env.get("SUPABASE_URL") ?? "http://kong:8000";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_KEY") ?? "";
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).schema("pos");

    let data: unknown;
    if (action === "createBooking") {
      const result = await db.rpc(fn, { p_payload: body.payload ?? {} });
      data = result.data;
      if (result.error) throw result.error;
    } else if (action === "updateBooking") {
      const result = await db.rpc(fn, {
        p_booking_id: String(body.bookingId ?? ""),
        p_payload: body.payload ?? {},
        p_items: body.items === null ? null : (body.items ?? []),
      });
      data = result.data;
      if (result.error) throw result.error;
    } else if (action === "updateBookingStatus") {
      const result = await db.rpc(fn, {
        p_booking_id: String(body.bookingId ?? ""),
        p_booking_status: body.bookingStatus ?? null,
        p_payment_status: body.paymentStatus ?? null,
        p_payment_date: body.paymentDate ?? null,
      });
      data = result.data;
      if (result.error) throw result.error;
    } else if (action === "deleteBooking") {
      const result = await db.rpc(fn, { p_booking_id: String(body.bookingId ?? "") });
      data = result.data;
      if (result.error) throw result.error;
    } else if (action === "upsertSettings") {
      const result = await db.rpc(fn, { p_payload: body.payload ?? {} });
      data = { sourceId: result.data };
      if (result.error) throw result.error;
    } else if (action === "readTimeline") {
      const result = await db.rpc(fn, { p_booking_id: String(body.bookingId ?? "") });
      data = result.data;
      if (result.error) throw result.error;
    } else if (action === "readDelivery") {
      const result = await db.rpc(fn, { p_booking_id: String(body.bookingId ?? "") });
      data = { deliveries: result.data ?? [] };
      if (result.error) throw result.error;
    } else {
      const result = await db.rpc(fn, { p_payload: body.payload ?? {} });
      data = { sourceId: result.data };
      if (result.error) throw result.error;
    }
    return json({ success: true, ...(data && typeof data === "object" ? data : { data }) });
  } catch (error) {
    console.error("booking-admin mutation failed", error);
    const message = error instanceof Error ? error.message : "Booking mutation failed";
    return json({ success: false, error: { code: "BOOKING_MUTATION_FAILED", message } }, 400);
  }
});
