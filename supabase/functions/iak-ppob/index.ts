import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import md5 from "npm:blueimp-md5@2.19.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const username = Deno.env.get("IAK_USERNAME")?.trim() ?? "";
const apiKey = Deno.env.get("IAK_API_KEY")?.trim() ?? "";
const baseUrl = (Deno.env.get("IAK_BASE_URL")?.trim() || "https://prepaid.iak.id/api").replace(/\/$/, "");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase function secrets");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Json = Record<string, unknown>;
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
function reply(body: Json, status = 200) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }); }
function text(v: unknown) { return typeof v === "string" ? v.trim() : ""; }
function sign(input: string) { return md5(input); }
function configured() { return Boolean(username && apiKey); }
function authError() { return reply({ success: false, error: { code: "IAK_NOT_CONFIGURED", message: "IAK username/API key belum dikonfigurasi sebagai secret server" } }, 503); }
async function iak(path: string, body: Json) {
  const response = await fetch(`${baseUrl}/${path.replace(/^\//, "")}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`IAK HTTP ${response.status}`);
  return payload;
}
async function callback(request: Request) {
  if (!configured()) return authError();
  const incoming = await request.json().catch(() => null) as Json | null;
  const data = incoming && typeof incoming.data === "object" && incoming.data !== null ? incoming.data as Json : incoming;
  if (!data) return reply({ success: false, error: { code: "INVALID_JSON", message: "Payload callback bukan JSON valid" } }, 400);
  const refId = text(data.ref_id);
  const receivedSign = text(data.sign).toLowerCase();
  if (!refId || !receivedSign) return reply({ success: false, error: { code: "INVALID_CALLBACK", message: "ref_id dan sign wajib diisi" } }, 400);
  const expectedSign = sign(`${username}${apiKey}${refId}`);
  if (receivedSign !== expectedSign) return reply({ success: false, error: { code: "INVALID_SIGNATURE", message: "Signature callback tidak valid" } }, 401);
  const status = text(data.status);
  if (!["0", "1", "2"].includes(status)) return reply({ success: false, error: { code: "INVALID_STATUS", message: "Status callback tidak dikenal" } }, 400);
  const row = { ref_id: refId, status, product_code: text(data.code || data.product_code) || null, customer_id: text(data.hp || data.customer_id) || null, price: Number(data.price) || null, message: text(data.message) || null, serial_number: text(data.sn) || null, iak_balance: Number(data.balance) || null, iak_transaction_id: text(data.tr_id) || null, response_code: text(data.rc) || null, payload: data, updated_at: new Date().toISOString() };
  const { error } = await admin.schema("pos").from("ppob_transactions").upsert(row, { onConflict: "ref_id", ignoreDuplicates: false });
  if (error) { console.error("iak callback persistence failed", { code: error.code }); return reply({ success: false, error: { code: "CALLBACK_PERSIST_FAILED", message: "Callback belum dapat disimpan" } }, 500); }
  return reply({ success: true });
}
async function handleAction(body: Json) {
  if (!configured()) return authError();
  const action = text(body.action);
  if (action === "check-balance") return reply({ success: true, data: await iak("check-balance", { username, sign: sign(`${username}${apiKey}bl`) }) });
  if (action === "price-list") return reply({ success: true, data: await iak("price-list", { username, sign: sign(`${username}${apiKey}pl`) }) });
  if (action === "top-up") {
    const refId = text(body.ref_id); const customerId = text(body.customer_id); const productCode = text(body.product_code);
    if (!refId || !customerId || !productCode) return reply({ success: false, error: { code: "INVALID_TOPUP", message: "ref_id, customer_id, dan product_code wajib diisi" } }, 400);
    return reply({ success: true, data: await iak("top-up", { username, ref_id: refId, customer_id: customerId, product_code: productCode, sign: sign(`${username}${apiKey}${refId}`) }) });
  }
  return reply({ success: false, error: { code: "UNKNOWN_ACTION", message: "Gunakan check-balance, price-list, atau top-up" } }, 400);
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  try {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/callback")) {
      if (request.method !== "POST") return reply({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Callback harus POST" } }, 405);
      return await callback(request);
    }
    if (request.method !== "POST") return reply({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Request harus POST" } }, 405);
    return await handleAction(await request.json() as Json);
  } catch (error) {
    console.error("iak-ppob failed", error instanceof Error ? error.message : "unknown error");
    return reply({ success: false, error: { code: "IAK_PROVIDER_ERROR", message: "PPOB provider tidak tersedia" } }, 502);
  }
});
