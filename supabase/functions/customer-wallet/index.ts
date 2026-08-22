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
function idempotency(value: unknown) { return text(value) || crypto.randomUUID(); }

async function ownedCustomer(sourceId: string, email: string) {
  if (!sourceId || !email) throw new Error("sourceId dan email wajib diisi");
  const { data, error } = await admin.schema("pos").from("customers").select("source_id,email,name").eq("source_id", sourceId).maybeSingle();
  if (error) throw error;
  if (!data || text(data.email).toLowerCase() !== email.toLowerCase()) throw new Error("Customer tidak memiliki akses ke wallet ini");
  return data;
}

async function getWallet(payload: Json) {
  const sourceId = text(payload.sourceId);
  const email = text(payload.email);
  await ownedCustomer(sourceId, email);
  const { data, error } = await admin.schema("pos").from("customer_wallets").select("*").eq("customer_id", sourceId).maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: ensured, error: ensureError } = await admin.schema("pos").rpc("wallet_ensure", { p_customer_id: sourceId });
    if (ensureError) throw ensureError;
    return { wallet: ensured, ledger: [] };
  }
  const { data: ledger, error: ledgerError } = await admin.schema("pos").from("customer_wallet_ledger").select("*").eq("customer_id", sourceId).order("created_at", { ascending: false }).limit(100);
  if (ledgerError) throw ledgerError;
  return { wallet: data, ledger: ledger ?? [] };
}

async function createHold(payload: Json) {
  const sourceId = text(payload.sourceId); const email = text(payload.email);
  await ownedCustomer(sourceId, email);
  const orderId = text(payload.orderId); const amount = Number(payload.amount); const key = idempotency(payload.idempotencyKey);
  if (!orderId || !Number.isSafeInteger(amount) || amount <= 0) throw new Error("orderId dan nominal wallet wajib valid");
  const { data, error } = await admin.schema("pos").rpc("wallet_create_hold", { p_customer_id: sourceId, p_order_id: orderId, p_amount: amount, p_idempotency_key: key });
  if (error) throw error;
  return data;
}

async function mutateHold(payload: Json, action: "capture" | "release") {
  const sourceId = text(payload.sourceId); const email = text(payload.email); const holdId = text(payload.holdId);
  await ownedCustomer(sourceId, email);
  if (!holdId) throw new Error("holdId wajib diisi");
  const { data: hold, error: holdError } = await admin.schema("pos").from("customer_wallet_holds").select("customer_id").eq("hold_id", holdId).maybeSingle();
  if (holdError) throw holdError;
  if (!hold || hold.customer_id !== sourceId) throw new Error("Wallet hold tidak ditemukan");
  const key = idempotency(payload.idempotencyKey);
  const { data, error } = action === "capture"
    ? await admin.schema("pos").rpc("wallet_capture_hold", { p_hold_id: holdId, p_idempotency_key: key })
    : await admin.schema("pos").rpc("wallet_release_hold", { p_hold_id: holdId, p_idempotency_key: key, p_reason: text(payload.reason) || "Order dibatalkan" });
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  try {
    const body = await req.json() as Json;
    const action = text(body.action);
    if (action === "get") return response({ success: true, ...(await getWallet(body)) });
    if (action === "hold") return response({ success: true, result: await createHold(body) });
    if (action === "capture") return response({ success: true, result: await mutateHold(body, "capture") });
    if (action === "release") return response({ success: true, result: await mutateHold(body, "release") });
    return fail("UNKNOWN_ACTION", "Gunakan action get, hold, capture, atau release", 404);
  } catch (error) {
    console.error("customer-wallet failed", error);
    const message = error instanceof Error ? error.message : "Gagal memproses wallet";
    return fail("WALLET_ERROR", message, 400);
  }
});
