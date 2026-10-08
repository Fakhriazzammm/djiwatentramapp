import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { deliveryRest, getDeliveryConfig, validateDeliveryConfig } from "../_shared/customer-delivery.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (code: string, status: number) => reply({ success: false, error: { code, message: code === "INVALID_CONFIG" ? "Konfigurasi delivery tidak valid" : "Permintaan delivery tidak dapat diproses" } }, status);
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
    if (body.action === "list_orders") {
      const orders = await deliveryRest("orders", { select: "source_id,order_number,customer_name,status,payment_method,delivery_status,delivery_provider,delivery_contact_name,delivery_contact_phone,delivery_address,delivery_provider_order_id,delivery_tracking_id,delivery_waybill_id,shipping_fee_amount,total_amount,created_at", source: "eq.customer_self_service", order_type: "eq.delivery", order: "created_at.desc.nullslast", limit: "100" });
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
    return reply({ success: true, config, readiness: { apiKey: present("BITESHIP_API_KEY"), origin: /^\d{5}$/.test(Deno.env.get("BITESHIP_ORIGIN_POSTAL_CODE") ?? "") && Boolean(lat?.trim() && lng?.trim()) && Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90 && Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180, webhook: present("BITESHIP_WEBHOOK_TOKEN") } });
  } catch { return fail("SERVICE_UNAVAILABLE", 503); }
});
