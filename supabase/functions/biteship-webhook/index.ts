import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const webhookToken = Deno.env.get("BITESHIP_WEBHOOK_TOKEN")?.trim() ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function tokenFromRequest(req: Request) {
  const direct = req.headers.get("x-biteship-webhook-token") || req.headers.get("x-webhook-token");
  if (direct) return direct.trim();
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function stringValue(...values: unknown[]) {
  return values.find((value) => typeof value === "string" && value.trim())?.toString().trim() ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return json({ status: "ok", service: "biteship-webhook", environment: "sandbox" });
  }
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "WEBHOOK_NOT_CONFIGURED" }, 503);

  if (webhookToken && tokenFromRequest(req) !== webhookToken) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const rawBody = await req.text();
  if (!rawBody.trim()) return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  if (!payload || typeof payload !== "object") return json({ error: "INVALID_JSON" }, 400);
  const body = payload as Record<string, any>;
  const data = body.data && typeof body.data === "object" ? body.data : body;
  const eventType = stringValue(body.event, body.event_type, body.type, data.status, "unknown");
  const providerOrderId = stringValue(data.order_id, data.orderId, data.id, body.order_id, body.orderId);
  const providerEventKey = stringValue(
    req.headers.get("x-biteship-event-id"),
    body.event_id,
    body.eventId,
    body.id,
    providerOrderId && `${providerOrderId}:${eventType}:${stringValue(data.updated_at, data.updatedAt, body.timestamp)}`,
  );
  if (!providerEventKey) return json({ error: "MISSING_EVENT_ID" }, 400);

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/enqueue_biteship_webhook_event`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      "Content-Profile": "pos",
      "Accept-Profile": "pos",
    },
    body: JSON.stringify({
      p_provider_event_key: providerEventKey,
      p_event_type: eventType,
      p_provider_order_id: providerOrderId,
      p_payload: body,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("biteship webhook enqueue failed", response.status, result);
    return json({ error: "EVENT_NOT_QUEUED" }, 500);
  }

  const status = stringValue(data.status, body.status).toLowerCase();
  const trackingId = stringValue(data.tracking_id, data.trackingId, data.tracking_number, data.trackingNumber);
  const waybillId = stringValue(data.waybill_id, data.waybillId, data.awb, data.resi);
  if (providerOrderId) {
    const deliveryStatus = ["confirmed", "allocated", "picking_up", "picked", "dropping_off", "delivered", "cancelled"].includes(status) ? status : null;
    const courierCompany = stringValue(data.courier?.company, data.courier_company, data.courierCompany).toLowerCase();
    const normalizedProvider = courierCompany.includes("grab") ? "grab" : courierCompany.includes("gojek") ? "gojek" : null;
    const update: Record<string, unknown> = {
      ...(normalizedProvider ? { delivery_provider: normalizedProvider } : {}),
      delivery_tracking_id: trackingId || null,
      delivery_waybill_id: waybillId || null,
    };
    if (deliveryStatus) update.delivery_status = deliveryStatus;
    const orderResponse = await fetch(`${supabaseUrl}/rest/v1/orders?delivery_provider_order_id=eq.${encodeURIComponent(providerOrderId)}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        "Content-Profile": "pos",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(update),
    });
    if (!orderResponse.ok) console.warn("biteship order mapping deferred", orderResponse.status);
  }

  return json({ ok: true, received: true, event: result });
});
