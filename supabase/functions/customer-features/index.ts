import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Json = Record<string, unknown>;
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase function secrets");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

function response(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function fail(code: string, message: string, status = 400) {
  return response({ success: false, error: { code, message } }, status);
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

/** The customer owns these records only when `sourceId` + `email` both match, like `customer-wallet`. */
async function ownedCustomer(sourceId: string, email: string) {
  if (!sourceId || !email) throw new Error("sourceId dan email wajib diisi");
  const { data, error } = await admin.schema("pos").from("customers").select("source_id,email").eq("source_id", sourceId).maybeSingle();
  if (error) throw error;
  if (!data || text(data.email).toLowerCase() !== email.toLowerCase()) throw new Error("Customer tidak dikenali");
  return data;
}

/** Every feature id this person has seen, mapped to the ISO timestamp of their first sighting. */
async function seenMap(sourceId: string): Promise<Record<string, string>> {
  const { data, error } = await admin.schema("pos").from("customer_feature_seen").select("feature_id,first_seen_at").eq("customer_id", sourceId);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r: any) => [String(r.feature_id), new Date(r.first_seen_at).toISOString()]));
}

const FEATURE_RE = /^[a-z0-9][a-z0-9_-]{1,60}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  try {
    const body = await req.json() as Json;
    const action = text(body.action);
    const sourceId = text(body.sourceId);
    const email = text(body.email);
    await ownedCustomer(sourceId, email);

    if (action === "get") {
      return response({ success: true, seen: await seenMap(sourceId) });
    }
    if (action === "seen") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter((k): k is string => typeof k === "string" && FEATURE_RE.test(k)).slice(0, 20);
      for (const id of ids) {
        // First sighting wins; later calls never move it.
        await admin.schema("pos").from("customer_feature_seen").upsert({ customer_id: sourceId, feature_id: id, first_seen_at: new Date().toISOString() }, { onConflict: "customer_id,feature_id", ignoreDuplicates: true });
      }
      return response({ success: true, seen: await seenMap(sourceId) });
    }
    return fail("UNKNOWN_ACTION", "Gunakan action get atau seen", 404);
  } catch (error) {
    console.error("customer-features failed", error);
    const message = error instanceof Error ? error.message : "Gagal memproses fitur baru";
    return fail("FEATURES_ERROR", message, 400);
  }
});
