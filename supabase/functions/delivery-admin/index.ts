import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { deliveryRest, getDeliveryConfig, validateDeliveryConfig } from "../_shared/customer-delivery.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (code: string, status: number) => reply({ success: false, error: { code, message: code === "INVALID_CONFIG" ? "Konfigurasi delivery tidak valid" : "Permintaan delivery tidak dapat diproses" } }, status);

type Row = Record<string, any>;
type JsonObject = Record<string, unknown>;
function isObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function coordinate(value: unknown, latitude: boolean): number | null { const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; return Number.isFinite(n) && Math.abs(n) <= (latitude ? 90 : 180) ? n : null; }
function providerStatus(value: unknown): string | null { const s = text(value).toLowerCase(); if (s === "delivered") return "delivered"; if (["cancelled", "canceled"].includes(s)) return "cancelled"; if (["confirmed", "scheduled", "allocated", "picking_up", "picked", "in_transit", "dropping_off"].includes(s)) return "out_for_delivery"; if (["on_hold", "return_in_transit", "returned", "rejected", "disposed", "courier_not_found", "failed"].includes(s)) return "failed"; return null; }
function providerId(payload: unknown): string { if (!isObject(payload)) return ""; const details = isObject(payload.details) ? payload.details : {}; return text(payload.order_id) || text(payload.orderId) || text(payload.id) || text(details.order_id); }
function trackingId(payload: unknown): string { if (!isObject(payload)) return ""; return text(payload.tracking_id) || text(payload.trackingId) || text(payload.tracking_number) || text(payload.trackingNumber); }
function waybillId(payload: unknown): string { if (!isObject(payload)) return ""; return text(payload.waybill_id) || text(payload.waybillId) || text(payload.awb) || text(payload.resi); }

async function createShipment(sourceId: string) {
  const apiKey = Deno.env.get("BITESHIP_API_KEY")?.trim() ?? "";
  const originName = Deno.env.get("BITESHIP_ORIGIN_CONTACT_NAME")?.trim() ?? "";
  const originPhone = Deno.env.get("BITESHIP_ORIGIN_CONTACT_PHONE")?.trim() ?? "";
  const originAddress = Deno.env.get("BITESHIP_ORIGIN_ADDRESS")?.trim() ?? "";
  if (!apiKey || !originName || !originPhone || !originAddress) return fail("SHIPMENT_NOT_CONFIGURED", 503);
  if (!sourceId || sourceId.length > 200) return fail("INVALID_ORDER", 400);
  const [order] = await deliveryRest("orders", { select: "source_id,order_number,status,order_type,delivery_status,delivery_address,delivery_contact_name,delivery_contact_phone,delivery_provider,delivery_provider_order_id,shipping_rate_snapshot", source_id: `eq.${sourceId}`, limit: "1" });
  if (!order) return fail("ORDER_NOT_FOUND", 404);
  if (text(order.delivery_provider_order_id)) return fail("SHIPMENT_ALREADY_CREATED", 409);
  if (text(order.order_type).toLowerCase() !== "delivery") return fail("ORDER_NOT_DELIVERY", 400);
  if (text(order.delivery_status).toLowerCase() !== "ready_to_ship") return fail("ORDER_NOT_READY", 409);
  if (!["paid", "completed"].includes(text(order.status).toLowerCase())) return fail("ORDER_NOT_PAID", 409);
  const snapshot = isObject(order.shipping_rate_snapshot) ? order.shipping_rate_snapshot : null;
  const orderProvider = text(order.delivery_provider);
  const quotedProvider = text(snapshot?.courierCode);
  const provider = orderProvider || quotedProvider;
  const serviceType = text(snapshot?.serviceType) || text(snapshot?.service_type);
  const courierType = text(snapshot?.courierType) || text(snapshot?.courier_type) || serviceType;
  const deliveryType = text(snapshot?.deliveryType) || text(snapshot?.delivery_type);
  const destinationLatitude = coordinate(snapshot?.destinationLatitude ?? snapshot?.destination_latitude, true);
  const destinationLongitude = coordinate(snapshot?.destinationLongitude ?? snapshot?.destination_longitude, false);
  if (!snapshot || text(snapshot.feeSource) !== "biteship" || !provider || (orderProvider && quotedProvider && orderProvider.toLowerCase() !== quotedProvider.toLowerCase()) || !serviceType || !courierType || !deliveryType || !text(order.delivery_address) || !text(order.delivery_contact_name) || !text(order.delivery_contact_phone)) return fail("SHIPMENT_DATA_INCOMPLETE", 422);
  const instant = /^(gojek|grab)$/i.test(provider) || /instant/i.test(`${serviceType} ${courierType} ${deliveryType}`);
  if (instant && (destinationLatitude === null || destinationLongitude === null)) return fail("DESTINATION_COORDINATES_REQUIRED", 422);
  const rows = await deliveryRest("order_items", { select: "product_source_id,product_name,quantity,price,status,line_no", order_source_id: `eq.${sourceId}`, order: "line_no.asc", limit: "100" });
  if (!rows.length || rows.some((row) => !text(row.product_source_id))) return fail("SHIPMENT_ITEMS_INCOMPLETE", 422);
  const ids = [...new Set(rows.map((row) => text(row.product_source_id)))];
  const products = await deliveryRest("products", { select: "source_id,name,delivery_weight_grams,delivery_enabled", source_id: `in.(${ids.map((id) => id.replace(/[(),]/g, "")).join(",")})`, limit: "100" });
  const byId = new Map(products.map((product) => [text(product.source_id), product]));
  const items: JsonObject[] = [];
  for (const row of rows) {
    const product = byId.get(text(row.product_source_id)); const quantity = Number(row.quantity); const weightPerUnit = Number(product?.delivery_weight_grams); const value = Number(row.price);
    const totalWeight = Math.round(weightPerUnit);
    if (!product || product.delivery_enabled !== true || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(weightPerUnit) || weightPerUnit <= 0 || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(totalWeight) || totalWeight <= 0) return fail("SHIPMENT_ITEMS_INCOMPLETE", 422);
    const name = text(row.product_name) || text(product.name); if (!name) return fail("SHIPMENT_ITEMS_INCOMPLETE", 422);
    items.push({ name, value: Math.round(value), quantity, weight: totalWeight });
  }
  const requestBody: JsonObject = { reference_id: text(order.source_id), origin_contact_name: originName, origin_contact_phone: originPhone, origin_address: originAddress, destination_contact_name: text(order.delivery_contact_name), destination_contact_phone: text(order.delivery_contact_phone), destination_address: text(order.delivery_address), courier_company: provider, courier_type: courierType, delivery_type: deliveryType, items };
  if (instant) {
    const originLatitude = coordinate(Deno.env.get("BITESHIP_ORIGIN_LATITUDE"), true); const originLongitude = coordinate(Deno.env.get("BITESHIP_ORIGIN_LONGITUDE"), false);
    if (originLatitude === null || originLongitude === null) return fail("ORIGIN_COORDINATES_REQUIRED", 503);
    requestBody.origin_coordinate = { latitude: originLatitude, longitude: originLongitude }; requestBody.destination_coordinate = { latitude: destinationLatitude, longitude: destinationLongitude };
  }
  let upstream: Response; try { upstream = await fetch("https://api.biteship.com/v1/orders", { method: "POST", headers: { authorization: apiKey, "content-type": "application/json" }, body: JSON.stringify(requestBody) }); } catch { return fail("SHIPMENT_PROVIDER_UNAVAILABLE", 503); }
  const payload: unknown = await upstream.json().catch(() => null); const id = providerId(payload);
  if (!upstream.ok && !id) return fail("SHIPMENT_PROVIDER_FAILED", upstream.status >= 500 ? 502 : 400);
  if (!id) return fail("INVALID_SHIPMENT_RESPONSE", 502);
  const update: Row = { delivery_provider: provider, delivery_provider_order_id: id }; const tracking = trackingId(payload); const waybill = waybillId(payload); const mapped = providerStatus(isObject(payload) ? payload.status : null);
  if (tracking) update.delivery_tracking_id = tracking; if (waybill) update.delivery_waybill_id = waybill; if (mapped) update.delivery_status = mapped;
  const updated = await deliveryRest("orders", { source_id: `eq.${sourceId}`, delivery_provider_order_id: "is.null" }, "pos", update);
  if (updated.length !== 1) { const [existing] = await deliveryRest("orders", { select: "delivery_provider_order_id", source_id: `eq.${sourceId}`, limit: "1" }); if (!text(existing?.delivery_provider_order_id)) return fail("SHIPMENT_PERSIST_FAILED", 503); }
  return reply({ success: true, providerOrderId: id, trackingId: tracking || null, waybillId: waybill || null, deliveryStatus: mapped || "ready_to_ship" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply({ ok: true });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);
  let body;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("INVALID_BODY", 400);
  const token = typeof body.staffToken === "string" ? body.staffToken.trim() : "";
  if (!token || token.startsWith("local_yumi_session")) return fail("UNAUTHORIZED", 401);
  try {
    const [session] = await deliveryRest("yumi_sessions", { select: "user_source_id,expires_at", token: `eq.${token}`, limit: "1" }, "public");
    if (!session || !Number.isFinite(Date.parse(session.expires_at)) || Date.parse(session.expires_at) <= Date.now()) return fail("UNAUTHORIZED", 401);
    const [user] = await deliveryRest("yumi_users", { select: "source_id,role_source_id,is_active", source_id: `eq.${session.user_source_id}`, limit: "1" }, "public");
    if (user?.is_active !== true) return fail("UNAUTHORIZED", 401);
    const [role] = await deliveryRest("yumi_roles", { select: "name,permissions", source_id: `eq.${user.role_source_id}`, limit: "1" }, "public");
    const admin = ["admin", "administrator", "owner", "superadmin", "super admin"].includes(String(role?.name ?? "").trim().toLowerCase());
    if (!admin && !(Array.isArray(role?.permissions) && role.permissions.includes("orders:view"))) return fail("FORBIDDEN", 403);
    if (body.action === "create_shipment") {
      if (!admin) return fail("FORBIDDEN", 403);
      const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : typeof body.orderSourceId === "string" ? body.orderSourceId.trim() : "";
      return await createShipment(sourceId);
    }
    if (body.action === "list_orders") {
      const orders = await deliveryRest("orders", { select: "source_id,order_number,customer_name,status,payment_method,delivery_status,delivery_provider,delivery_contact_name,delivery_contact_phone,delivery_address,delivery_provider_order_id,delivery_tracking_id,delivery_waybill_id,shipping_rate_snapshot,shipping_fee_amount,total_amount,created_at", source: "eq.customer_self_service", order_type: "eq.delivery", order: "created_at.desc.nullslast", limit: "100" });
      return reply({ success: true, orders });
    }
    if (body.action === "save_config") {
      if (!admin) return fail("FORBIDDEN", 403);
      let c;
      try { c = validateDeliveryConfig(body.config); } catch { return fail("INVALID_CONFIG", 400); }
      const rows = await deliveryRest("customer_delivery_settings", { singleton: "eq.true" }, "pos", { is_enabled: c.active, allowed_couriers: c.couriers, default_courier: c.defaultCourier, fallback_fee: c.fallbackFee, updated_by: user.source_id });
      if (rows.length !== 1) throw new Error("Settings unavailable");
    } else if (body.action !== "get_config") return fail("INVALID_ACTION", 400);
    const config = await getDeliveryConfig();
    const present = (name: string) => Boolean(Deno.env.get(name)?.trim());
    const lat = Deno.env.get("BITESHIP_ORIGIN_LATITUDE"), lng = Deno.env.get("BITESHIP_ORIGIN_LONGITUDE");
    return reply({ success: true, config, readiness: { apiKey: present("BITESHIP_API_KEY"), origin: /^\d{5}$/.test(Deno.env.get("BITESHIP_ORIGIN_POSTAL_CODE") ?? "") && Boolean(lat?.trim() && lng?.trim()) && Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90 && Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180, shipmentOrigin: Boolean(Deno.env.get("BITESHIP_ORIGIN_CONTACT_NAME")?.trim() && Deno.env.get("BITESHIP_ORIGIN_CONTACT_PHONE")?.trim() && Deno.env.get("BITESHIP_ORIGIN_ADDRESS")?.trim()), webhook: present("BITESHIP_WEBHOOK_TOKEN") } });
  } catch { return fail("SERVICE_UNAVAILABLE", 503); }
});
