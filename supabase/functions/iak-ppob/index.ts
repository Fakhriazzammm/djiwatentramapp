import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildSignature } from "./adapter.ts";
import { createIakActionHandler } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const username = Deno.env.get("IAK_USERNAME")?.trim() ?? "";
const apiKey = Deno.env.get("IAK_API_KEY")?.trim() ?? "";
const baseUrl = (Deno.env.get("IAK_BASE_URL")?.trim() || "https://api.iak.id/api").replace(/\/$/, "");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase function secrets");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Json = Record<string, unknown>;
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
function reply(body: Json, status = 200) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function sign(value: string) { return buildSignature("", "", value); }
function configured() { return Boolean(username && apiKey); }
function authError() { return reply({ success: false, error: { code: "IAK_NOT_CONFIGURED", message: "IAK username/API key belum dikonfigurasi sebagai secret server" } }, 503); }

const actionHandler = createIakActionHandler({ username, apiKey, baseUrl });

async function callback(request: Request) {
  if (!configured()) return authError();
  const incoming = await request.json().catch(() => null) as Json | null;
  const data = incoming && typeof incoming.data === "object" && incoming.data !== null ? incoming.data as Json : incoming;
  if (!data) return reply({ success: false, error: { code: "INVALID_JSON", message: "Payload callback bukan JSON valid" } }, 400);
  const refId = text(data.ref_id);
  const receivedSign = text(data.sign).toLowerCase();
  if (!refId || !receivedSign) return reply({ success: false, error: { code: "INVALID_CALLBACK", message: "ref_id dan sign wajib diisi" } }, 400);
  if (receivedSign !== sign(`${username}${apiKey}${refId}`)) return reply({ success: false, error: { code: "INVALID_SIGNATURE", message: "Signature callback tidak valid" } }, 401);
  const status = text(data.status);
  if (!["0", "1", "2"].includes(status)) return reply({ success: false, error: { code: "INVALID_STATUS", message: "Status callback tidak dikenal" } }, 400);
  const existing = await admin.schema("pos").from("ppob_transactions").select("payload,wallet_hold_id,payment_status").eq("ref_id", refId).maybeSingle();
  if (existing.error) {
    console.error("iak callback lookup failed", { code: existing.error.code });
    return reply({ success: false, error: { code: "CALLBACK_LOOKUP_FAILED", message: "Callback belum dapat diproses" } }, 500);
  }
  const existingPayload = existing.data?.payload && typeof existing.data.payload === "object" ? existing.data.payload as Json : {};
  const mergedPayload = { ...existingPayload, ...data };
  const holdId = text(existing.data?.wallet_hold_id || existingPayload.wallet_hold_id);
  if (holdId && status === "1") {
    const captured = await admin.schema("pos").rpc("wallet_capture_hold", { p_hold_id: holdId, p_idempotency_key: `callback_capture_${refId}` });
    if (captured.error) return reply({ success: false, error: { code: "CALLBACK_SETTLEMENT_FAILED", message: "Saldo belum dapat diselesaikan" } }, 500);
  } else if (holdId && status === "2") {
    const released = await admin.schema("pos").rpc("wallet_release_hold", { p_hold_id: holdId, p_idempotency_key: `callback_release_${refId}`, p_reason: text(data.message) || "Transaksi PPOB gagal" });
    if (released.error) return reply({ success: false, error: { code: "CALLBACK_SETTLEMENT_FAILED", message: "Saldo belum dapat dikembalikan" } }, 500);
  }
  const row = {
    ref_id: refId,
    status,
    product_code: text(data.code || data.product_code) || null,
    customer_id: text(data.hp || data.customer_id) || null,
    price: Number(data.price) || null,
    message: text(data.message) || null,
    serial_number: text(data.sn) || null,
    iak_balance: Number(data.balance) || null,
    iak_transaction_id: text(data.tr_id) || null,
    response_code: text(data.rc) || null,
    wallet_hold_id: holdId || null,
    payment_status: status === "1" ? "paid" : status === "2" ? "failed" : (existing.data?.payment_status || "pending"),
    provider_status: status === "1" ? "success" : status === "2" ? "failed" : "pending",
    provider_updated_at: new Date().toISOString(),
    payload: mergedPayload,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.schema("pos").from("ppob_transactions").upsert(row, { onConflict: "ref_id", ignoreDuplicates: false });
  if (error) {
    console.error("iak callback persistence failed", { code: error.code });
    return reply({ success: false, error: { code: "CALLBACK_PERSIST_FAILED", message: "Callback belum dapat disimpan" } }, 500);
  }
  return reply({ success: true });
}

async function handleAction(body: Json) {
  const result = await actionHandler(body);
  return reply(result.body, result.status);
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
