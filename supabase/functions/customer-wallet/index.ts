import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { validateWalletSourceApp } from "./provenance.ts";

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
  const { data, error } = await admin.schema("pos").from("customers").select("source_id,email,name,phone").eq("source_id", sourceId).maybeSingle();
  if (error) throw error;
  if (!data || text(data.email).toLowerCase() !== email.toLowerCase()) throw new Error("Customer tidak memiliki akses ke wallet ini");
  return data;
}

async function getWallet(payload: Json) {
  const sourceId = text(payload.sourceId);
  const email = text(payload.email);
  const sourceApp = validateWalletSourceApp(payload.sourceApp);
  await ownedCustomer(sourceId, email);
  const { data, error } = await admin.schema("pos").from("customer_wallets").select("*").eq("customer_id", sourceId).maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: ensured, error: ensureError } = await admin.schema("pos").rpc("wallet_ensure", { p_customer_id: sourceId });
    if (ensureError) throw ensureError;
    return { wallet: ensured, ledger: [], transactions: [] };
  }
  let ledgerQuery = admin.schema("pos").from("customer_wallet_ledger").select("*").eq("customer_id", sourceId);
  if (sourceApp) ledgerQuery = ledgerQuery.eq("source_app", sourceApp);
  const { data: ledger, error: ledgerError } = await ledgerQuery.order("created_at", { ascending: false }).limit(100);
  if (ledgerError) throw ledgerError;
  const { data: transactions, error: transactionError } = await admin.schema("pos").rpc("wallet_transactions_for_customer", { p_customer_id: sourceId, p_limit: 100, p_offset: 0 });
  if (transactionError) throw transactionError;
  return { wallet: data, ledger: ledger ?? [], transactions: transactions ?? [] };
}

async function walletNotifications(sourceId: string) {
  const { data: notifications, error } = await admin
    .from("pos_notifications")
    .select("*,pos_notification_reads(read_at,acknowledged_at)")
    .eq("target_user_id", sourceId)
    .eq("is_active", true)
    .in("notification_type", ["wallet_transfer_sent", "wallet_transfer_received"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (notifications ?? []).map((row: any) => ({ ...row, unread: !row.pos_notification_reads?.[0]?.read_at }));
}

async function markWalletNotification(payload: Json, markAll = false) {
  const sourceId = text(payload.sourceId); const email = text(payload.email);
  await ownedCustomer(sourceId, email);
  if (markAll) {
    const { data: rows, error } = await admin.from("pos_notifications").select("id").eq("target_user_id", sourceId).eq("is_active", true).in("notification_type", ["wallet_transfer_sent", "wallet_transfer_received"]);
    if (error) throw error;
    for (const row of rows ?? []) {
      const { error: writeError } = await admin.from("pos_notification_reads").upsert({ notification_id: row.id, user_id: sourceId, read_at: new Date().toISOString() }, { onConflict: "notification_id,user_id" });
      if (writeError) throw writeError;
    }
    return { success: true };
  }
  const notificationId = text(payload.notificationId);
  if (!notificationId) throw new Error("notificationId wajib diisi");
  const { data: visible, error: visibleError } = await admin.from("pos_notifications").select("id").eq("id", notificationId).eq("target_user_id", sourceId).eq("is_active", true).maybeSingle();
  if (visibleError) throw visibleError;
  if (!visible) throw new Error("Notification tidak ditemukan");
  const { error } = await admin.from("pos_notification_reads").upsert({ notification_id: notificationId, user_id: sourceId, read_at: new Date().toISOString() }, { onConflict: "notification_id,user_id" });
  if (error) throw error;
  return { success: true };
}

async function createTopup(payload: Json) {
  const sourceId = text(payload.sourceId);
  const email = text(payload.email);
  const customer = await ownedCustomer(sourceId, email);
  const sourceApp = validateWalletSourceApp(payload.sourceApp);
  const amount = Number(payload.amount);
  if (!Number.isSafeInteger(amount) || amount < 1000) throw new Error("Nominal top up minimal Rp1.000");
  const key = idempotency(payload.idempotencyKey);
  const topupId = `wt_${crypto.randomUUID()}`;
  const { error: insertError } = await admin.schema("pos").from("customer_wallet_topups").insert({
    topup_id: topupId,
    customer_id: sourceId,
    amount,
    idempotency_key: key,
    source_app: sourceApp,
  });
  if (insertError) throw insertError;
  const origin = text(payload.origin);
  const redirectUrl = origin ? `${origin.replace(/\/$/, "")}/saldo` : undefined;
  const invoiceResponse = await fetch(`${supabaseUrl}/functions/v1/mayar-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify({
      action: "create-invoice",
      name: text(customer.name) || "Customer",
      email,
      mobile: text(customer.phone),
      redirectUrl,
      description: "Top up saldo customer",
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      extraData: { walletTopupId: topupId, customerId: sourceId },
      items: [{ quantity: 1, rate: amount, description: `Top up saldo Rp${amount.toLocaleString("id-ID")}` }],
    }),
  });
  const invoice: any = await invoiceResponse.json().catch(() => ({}));
  if (!invoiceResponse.ok || !invoice?.data?.id) {
    const detail = invoice?.error && typeof invoice.error === "object" ? invoice.error.message : invoice?.messages || invoice?.message;
    throw new Error(typeof detail === "string" && detail.trim() ? detail : "Gagal membuat invoice top up");
  }
  const { error: updateError } = await admin.schema("pos").from("customer_wallet_topups").update({
    invoice_id: invoice.data.id,
    transaction_id: invoice.data.transactionId || null,
  }).eq("topup_id", topupId);
  if (updateError) throw updateError;
  return { topup_id: topupId, invoice_id: invoice.data.id, invoice_url: invoice.data.link, status: "pending" };
}

async function createHold(payload: Json) {
  const sourceId = text(payload.sourceId); const email = text(payload.email);
  await ownedCustomer(sourceId, email);
  const orderId = text(payload.orderId); const key = idempotency(payload.idempotencyKey);
  if (!orderId) throw new Error("orderId wajib diisi");
  const { data: order, error: orderError } = await admin.schema("pos").from("orders").select("source_id,customer_source_id,total_amount,payment_method,status,brand_slug,source").eq("source_id", orderId).maybeSingle();
  if (orderError) throw orderError;
  if (!order || order.customer_source_id !== sourceId) throw new Error("Order bukan milik customer");
  if (String(order.payment_method || "").toLowerCase() !== "wallet") throw new Error("Order bukan pembayaran Djiwa Pay");
  if (["paid", "completed", "cancelled"].includes(String(order.status || "").toLowerCase())) throw new Error("Status order tidak dapat ditahan");
  if (String(order.brand_slug || "").trim().toLowerCase() === "merchandise") {
    if (String(order.source || "") !== "customer_self_service") {
      throw new Error("Pre-order merchandise tidak dapat dibuat melalui POS kasir");
    }
    const { error: reservationError } = await admin.schema("pos").rpc("reserve_merchandise_preorder_order", { p_order_source_id: orderId });
    if (reservationError) throw reservationError;
  }
  const amount = Math.round(Number(order.total_amount));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Total order tidak valid");
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


async function verifyStaff(payload: Json) {
  const token = text(payload.staffToken);
  let staffId = text(payload.staffSourceId);
  if (!token) throw new Error("Sesi staff wajib diisi");
  if (token.startsWith("local_yumi_session:")) {
    try {
      const raw = token.slice("local_yumi_session:".length);
      const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))));
      if (Date.now() > Number(decoded?.expiresAt ?? 0)) throw new Error("Sesi staff kedaluwarsa");
      staffId = text(decoded?.user?._id) || staffId;
    } catch { throw new Error("Sesi staff tidak valid"); }
  } else {
    const { data: session, error } = await admin.from("yumi_sessions").select("user_source_id").eq("token", token).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw error;
    staffId = text(session?.user_source_id) || staffId;
  }
  if (!staffId) throw new Error("Identitas staff tidak ditemukan");
  const { data: user, error: userError } = await admin.from("yumi_users").select("source_id,role_source_id,is_active").eq("source_id", staffId).maybeSingle();
  if (userError) throw userError;
  if (!user?.is_active) throw new Error("Staff tidak aktif");
  const { data: role, error: roleError } = await admin.from("yumi_roles").select("name").eq("source_id", user.role_source_id).maybeSingle();
  if (roleError) throw roleError;
  const roleName = text(role?.name).toLowerCase();
  if (!/(admin|manager|owner|supervisor)/.test(roleName)) throw new Error("Role tidak memiliki akses wallet adjustment");
  return staffId;
}

async function settleOrder(payload: Json) {
  const sourceId = text(payload.sourceId); const email = text(payload.email); const orderId = text(payload.orderId); const holdId = text(payload.holdId); const key = idempotency(payload.idempotencyKey);
  await ownedCustomer(sourceId, email);
  if (!orderId || !holdId) throw new Error("orderId dan holdId wajib diisi");
  const { data, error } = await admin.schema("pos").rpc("wallet_settle_order", { p_customer_id: sourceId, p_order_id: orderId, p_hold_id: holdId, p_idempotency_key: key });
  if (error) throw error;
  return data;
}
async function adminUpdateCustomer(payload: Json) {
  const staffId = await verifyStaff(payload);
  const customerId = text(payload.customerId);
  if (!customerId) throw new Error("Customer wajib dipilih");
  const allowed = ["name", "phone", "nickname", "birth_date", "gender", "address", "city", "province", "postal_code", "customer_description", "marketing_consent"] as const;
  const updates: Record<string, unknown> = {};
  for (const field of allowed) {
    if (field in payload) updates[field] = field === "marketing_consent" ? Boolean(payload[field]) : (text(payload[field]) || null);
  }
  if (Object.keys(updates).length === 0) throw new Error("Tidak ada data customer yang diubah");
  updates.updated_at = new Date().toISOString();
  const { data, error } = await admin.schema("pos").from("customers").update(updates).eq("source_id", customerId).select("*").single();
  if (error) throw error;
  console.info("admin customer profile updated", { staffId, customerId, fields: Object.keys(updates) });
  return data;
}

async function adminAdjust(payload: Json) {
  const staffId = await verifyStaff(payload);
  const customerId = text(payload.customerId);
  const amount = Number(payload.amount);
  const direction = text(payload.direction);
  const note = text(payload.note);
  if (!customerId || !Number.isSafeInteger(amount) || amount <= 0 || !['credit', 'debit'].includes(direction) || !note) throw new Error("Customer, nominal, arah, dan alasan wajib valid");
  const key = idempotency(payload.idempotencyKey);
  const { data, error } = await admin.schema("pos").rpc("wallet_admin_adjust", { p_customer_id: customerId, p_amount: amount, p_direction: direction, p_note: note, p_created_by: staffId, p_idempotency_key: key });
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  try {
    const body = await req.json() as Json;
    const action = text(body.action);
    if (action === "get") return response({ success: true, ...(await getWallet(body)) });
    if (action === "notifications") {
      const sourceId = text(body.sourceId); const email = text(body.email);
      await ownedCustomer(sourceId, email);
      return response({ success: true, notifications: await walletNotifications(sourceId) });
    }
    if (action === "mark-notification-read") return response(await markWalletNotification(body));
    if (action === "mark-all-notifications-read") return response(await markWalletNotification(body, true));
    if (action === "topup") return response({ success: true, result: await createTopup(body) });
    if (action === "hold") return response({ success: true, result: await createHold(body) });
    if (action === "capture") return response({ success: true, result: await mutateHold(body, "capture") });
    if (action === "release") return response({ success: true, result: await mutateHold(body, "release") });
    if (action === "settle-order") return response({ success: true, result: await settleOrder(body) });
    if (action === "admin-adjustment") return response({ success: true, result: await adminAdjust(body) });
    if (action === "admin-update-customer") return response({ success: true, result: await adminUpdateCustomer(body) });
    return fail("UNKNOWN_ACTION", "Gunakan action get, topup, hold, capture, release, settle-order, admin-adjustment, atau admin-update-customer", 404);
  } catch (error) {
    console.error("customer-wallet failed", error);
    const message = error instanceof Error ? error.message : "Gagal memproses wallet";
    return fail("WALLET_ERROR", message, 400);
  }
});
