/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "86400" };
const METRIC_COLUMNS = "strategy,placement,first_event_at,last_event_at,impression_count,click_count,add_to_cart_count,purchase_count,dismiss_count,not_interested_count,click_through_rate_pct,click_to_cart_rate_pct,cart_to_purchase_rate_pct,not_interested_rate_pct,unique_sessions,unique_customers";
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }); }
function bearer(req: Request) { const v = req.headers.get("authorization") ?? ""; return v.toLowerCase().startsWith("bearer ") ? v.slice(7).trim() : ""; }
async function isAllowed(supabase: any, req: Request) {
  const token = bearer(req); if (!token || token.startsWith("local_yumi_session:")) return false;
  const { data: session } = await supabase.from("yumi_sessions").select("user_source_id").eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!session?.user_source_id) return false;
  const { data: user } = await supabase.from("yumi_users").select("role_source_id,is_active").eq("source_id", session.user_source_id).maybeSingle();
  if (!user || user.is_active === false) return false;
  const { data: role } = await supabase.from("yumi_roles").select("name,permissions").eq("source_id", user.role_source_id).maybeSingle();
  if (!role) return false;
  const permissions = Array.isArray(role.permissions) ? role.permissions.map(String) : [];
  return String(role.name ?? "").trim().toLowerCase() === "admin" || permissions.includes("analytics:view");
}
serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ success: false, error: "Method tidak diizinkan" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ success: false, error: "Konfigurasi server belum lengkap" }, 500);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  if (!await isAllowed(supabase, req)) return json({ success: false, error: "Sesi atau permission analytics tidak valid" }, 401);
  try {
    const body = await req.json() as Record<string, unknown>;
    if (String(body.action ?? "") !== "strategyMetrics") return json({ success: false, error: "Action tidak dikenal" }, 400);
    const { data, error } = await supabase.schema("pos").from("product_recommendation_strategy_metrics").select(METRIC_COLUMNS).order("impression_count", { ascending: false }).limit(100);
    if (error) return json({ success: false, error: "Gagal memuat analytics recommendation" }, 500);
    return json({ success: true, data: data ?? [] });
  } catch { return json({ success: false, error: "Request tidak valid" }, 400); }
});
