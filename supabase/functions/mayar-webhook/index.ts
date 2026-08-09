import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, x-webhook-token, x-mayar-webhook-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WEBHOOK_TOKEN = Deno.env.get("MAYAR_WEBHOOK_TOKEN") || "";
const MAYAR_API_BASE = Deno.env.get("MAYAR_API_BASE") || "https://api.mayar.id/hl/v2";
const MAYAR_API_KEY = Deno.env.get("MAYAR_API_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function tokenFromRequest(req: Request) {
  const direct =
    req.headers.get("x-webhook-token") ||
    req.headers.get("x-mayar-webhook-token");
  if (direct) return direct.trim();
  const queryToken = new URL(req.url).searchParams.get("token");
  if (queryToken) return queryToken.trim();
  const authorization = req.headers.get("authorization") || "";
  return authorization.replace(/^Bearer\s+/i, "").trim();
}

function safeTokenEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

async function patchOrder(filter: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/orders?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": "pos",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Order update failed (${response.status})`);
  return (await response.json()) as Array<Record<string, unknown>>;
}

async function insertFinancialTransaction(order: Record<string, unknown>, paymentGateway: Record<string, unknown>) {
  const orderSourceId = String(order.source_id || "");
  if (!orderSourceId) return false;
  const existingResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/financial_transactions?order_source_id=eq.${encodeURIComponent(orderSourceId)}&select=source_id&limit=1`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Profile": "pos" } },
  );
  if (!existingResponse.ok) throw new Error(`Financial lookup failed (${existingResponse.status})`);
  const existing = (await existingResponse.json()) as Array<Record<string, unknown>>;
  if (existing.length > 0) return false;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/financial_transactions`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": "pos",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      source_id: `fin_mayar_${orderSourceId}`,
      tx_type: "income",
      amount: Number(order.total_amount || 0),
      category: "Penjualan",
      description: `Penjualan Pesanan #${order.order_number || "-"}`,
      merchant: order.customer_name || null,
      tx_date: Number(paymentGateway.paidAt || Date.now()),
      payment_method: "mayar",
      status: "completed",
      order_source_id: orderSourceId,
      creation_time: Date.now(),
      metadata: {
        orderNumber: order.order_number || null,
        source: "customer_self_service",
        paymentGateway,
      },
      raw: { kind: "order_mayar_webhook_settlement", orderId: orderSourceId },
    }),
  });
  if (!response.ok) throw new Error(`Financial transaction insert failed (${response.status})`);
  return true;
}

async function verifyTransaction(transactionId: string) {
  const response = await fetch(
    `${MAYAR_API_BASE}/transactions/${encodeURIComponent(transactionId)}`,
    { headers: { Authorization: `Bearer ${MAYAR_API_KEY}` } },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.statusCode !== 200) return null;
  return body?.data?.status === "paid" ? body.data : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return json({ status: "ok", service: "mayar-webhook" });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!WEBHOOK_TOKEN || !safeTokenEqual(tokenFromRequest(req), WEBHOOK_TOKEN)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Webhook storage is not configured" }, 500);
  }

  try {
    const payload = await req.json();
    const event = String(payload?.event?.received || "");
    const data = payload?.data || {};
    if (event !== "payment.received") {
      return json({ ok: true, ignored: true, event });
    }

    const transactionId = String(data.transactionId || "");
    if (!transactionId || !MAYAR_API_KEY) {
      return json({ ok: true, ignored: true, reason: "missing_transaction_id" });
    }
    const transaction = await verifyTransaction(transactionId);
    if (!transaction) {
      return json({ ok: true, ignored: true, reason: "transaction_not_paid" });
    }

    const customFields = Array.isArray(data.custom_field) ? data.custom_field : [];
    const customOrderId = customFields.find((field: Record<string, unknown>) => field?.key === "order_id")?.value;
    const orderId = String(
      data?.extraData?.orderId || transaction?.extraData?.orderId || customOrderId || "",
    );
    const invoiceId = String(data.id || "");
    const paymentGateway = {
      provider: "mayar",
      invoiceId,
      transactionId,
      status: "paid",
      paidAt: Date.now(),
    };
    const patch = {
      payment_gateway: paymentGateway,
      gateway_invoice_id: invoiceId || null,
      payment_receipt_kind: "gateway_paid",
      status: "completed",
    };

    let updated = orderId
      ? await patchOrder(`source_id=eq.${encodeURIComponent(String(orderId))}`, patch)
      : [];
    if (!updated.length && invoiceId) {
      updated = await patchOrder(`gateway_invoice_id=eq.${encodeURIComponent(invoiceId)}`, patch);
    }
    const settledOrder = updated[0];
    const transactionCreated = settledOrder
      ? await insertFinancialTransaction(settledOrder, paymentGateway)
      : false;

    return json({ ok: true, updated: updated.length, transactionCreated });
  } catch (error) {
    console.error("mayar-webhook failed", error);
    return json({ error: "Webhook processing failed" }, 500);
  }
});
