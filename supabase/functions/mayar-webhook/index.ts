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
const FUNCTION_REQUEST_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FUNCTION_REQUEST_TIMEOUT_MS);
  try {
    return await globalThis.fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

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
  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/orders?${filter}`, {
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

async function tagFinancialTransaction(order: Record<string, unknown>) {
  const orderSourceId = String(order.source_id || "");
  const businessUnit = String(order.business_unit || "");
  const sourceApp = String(order.source_app || "");
  if (!orderSourceId || !businessUnit) return;
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/pos_financial_transactions?orderId=eq.${encodeURIComponent(orderSourceId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ businessUnit, sourceApp }),
    },
  );
  if (!response.ok) throw new Error(`Financial classification failed (${response.status})`);
}

async function insertFinancialTransaction(order: Record<string, unknown>, paymentGateway: Record<string, unknown>) {
  const orderSourceId = String(order.source_id || "");
  if (!orderSourceId) return false;
  const existingResponse = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/pos_financial_transactions?orderId=eq.${encodeURIComponent(orderSourceId)}&select=_id&limit=1`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  if (!existingResponse.ok) throw new Error(`Financial lookup failed (${existingResponse.status})`);
  const existing = (await existingResponse.json()) as Array<Record<string, unknown>>;
  if (existing.length > 0) return false;

  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/record_mayar_financial_transaction`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      p_order_id: orderSourceId,
      p_order_number: String(order.order_number || ""),
      p_amount: Number(order.total_amount || 0),
      p_customer_name: String(order.customer_name || ""),
      p_paid_at: Number(paymentGateway.paidAt || Date.now()),
      p_payment_gateway: paymentGateway,
    }),
  });
  if (!response.ok) throw new Error(`Financial transaction insert failed (${response.status})`);
  return true;
}

async function verifyTransaction(transactionId: string) {
  const response = await fetchWithTimeout(
    `${MAYAR_API_BASE}/transactions/${encodeURIComponent(transactionId)}`,
    { headers: { Authorization: `Bearer ${MAYAR_API_KEY}` } },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.statusCode !== 200) return null;
  return body?.data?.status === "paid" ? body.data : null;
}

function parseExtraData(value: unknown) {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function settleOrder(order: Record<string, unknown>, transaction: Record<string, unknown>, invoiceId: string) {
  const orderId = String(order.source_id || "");
  const transactionId = String(transaction.id || "");
  if (!orderId || !transactionId) return { updated: 0, transactionCreated: false };
  const paymentGateway = {
    provider: "mayar",
    invoiceId: invoiceId || String(order.gateway_invoice_id || ""),
    transactionId,
    status: "paid",
    paidAt: Number(transaction.updatedAt || transaction.createdAt || Date.now()),
  };
  const patch = {
    payment_gateway: paymentGateway,
    gateway_invoice_id: paymentGateway.invoiceId || null,
    payment_receipt_kind: "gateway_paid",
    status: "completed",
  };
  const updated = await patchOrder(`source_id=eq.${encodeURIComponent(orderId)}`, patch);
  const settledOrder = updated[0] || order;
  const transactionCreated = await insertFinancialTransaction(settledOrder, paymentGateway);
  await tagFinancialTransaction(settledOrder);
  return { updated: updated.length, transactionCreated };
}

async function reconcilePendingOrders() {
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/orders?select=source_id,order_number,status,total_amount,customer_name,gateway_invoice_id,payment_gateway&source=eq.customer_self_service&status=eq.pending&payment_gateway->>provider=eq.mayar&order=created_at.asc&limit=50`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Accept-Profile": "pos" } },
  );
  if (!response.ok) throw new Error(`Pending order lookup failed (${response.status})`);
  const orders = await response.json() as Array<Record<string, unknown>>;
  const results = [];
  for (const order of orders) {
    const gateway = parseExtraData(order.payment_gateway);
    const transactionId = String(gateway.transactionId || "");
    if (!transactionId) continue;
    const transaction = await verifyTransaction(transactionId);
    if (!transaction) continue;
    const result = await settleOrder(order, transaction, String(gateway.invoiceId || order.gateway_invoice_id || ""));
    results.push({ orderId: order.source_id, ...result });
  }
  return { scanned: orders.length, settled: results };
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
    const event = String(payload?.event?.received || payload?.action || "");
    if (event === "reconcile") {
      return json({ ok: true, ...(await reconcilePendingOrders()) });
    }
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
      data?.extraData?.orderId || parseExtraData(transaction?.extraData).orderId || customOrderId || "",
    );
    const invoiceId = String(data.id || "");
    let settled = { scanned: 0, settled: [] as Array<Record<string, unknown>> };
    if (orderId) {
      const directOrderResponse = await fetchWithTimeout(
        `${SUPABASE_URL}/rest/v1/orders?select=*&source_id=eq.${encodeURIComponent(orderId)}&limit=1`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Accept-Profile": "pos" } },
      );
      const directOrders = directOrderResponse.ok
        ? await directOrderResponse.json() as Array<Record<string, unknown>>
        : [];
      if (directOrders[0]) {
        const result = await settleOrder(directOrders[0], transaction, invoiceId);
        settled = { scanned: directOrders.length, settled: [{ orderId, ...result }] };
      }
    }
    if (!settled.settled.length && orderId) {
      settled = await reconcilePendingOrders();
    }
    if (!settled.settled.length && invoiceId) {
      const fallback = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/orders?select=*&gateway_invoice_id=eq.${encodeURIComponent(invoiceId)}&limit=1`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Profile": "pos" } });
      const orders = fallback.ok ? await fallback.json() as Array<Record<string, unknown>> : [];
      if (orders[0]) {
        const result = await settleOrder(orders[0], transaction, invoiceId);
        settled = { scanned: orders.length, settled: [{ orderId: orders[0].source_id, ...result }] };
      }
    }
    const first = settled.settled[0];
    return json({ ok: true, updated: first?.updated || 0, transactionCreated: first?.transactionCreated || false });
  } catch (error) {
    console.error("mayar-webhook failed", error);
    return json({ error: "Webhook processing failed" }, 500);
  }
});
