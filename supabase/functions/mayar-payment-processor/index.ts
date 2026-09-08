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

async function settleBooking(bookingId: string, invoiceId: string, transaction: Record<string, unknown>) {
  const transactionId = String(transaction.id || "");
  if (!bookingId || !transactionId) return null;
  const bookingResponse = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/booking_orders?source_id=eq.${encodeURIComponent(bookingId)}&select=source_id,total_amount,payment_gateway&limit=1`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Accept-Profile": "pos" } },
  );
  if (!bookingResponse.ok) throw new Error(`Booking lookup failed (${bookingResponse.status})`);
  const bookings = await bookingResponse.json() as Array<Record<string, unknown>>;
  const booking = bookings[0];
  if (!booking) throw new Error("Booking not found");
  const expectedInvoice = String(parseExtraData(booking.payment_gateway)?.invoiceId || "");
  if (expectedInvoice && invoiceId && expectedInvoice !== invoiceId) throw new Error("Booking invoice mismatch");
  const providerAmount = Number(transaction.amount ?? transaction.totalAmount ?? transaction.grossAmount ?? transaction.paidAmount ?? NaN);
  const bookingAmount = Number(booking.total_amount ?? NaN);
  if (Number.isFinite(providerAmount) && Number.isFinite(bookingAmount) && providerAmount > 0 && Math.abs(providerAmount - bookingAmount) > 0.01) {
    throw new Error("Booking payment amount mismatch");
  }
  const paidAt = Number(transaction.updatedAt || transaction.createdAt || Date.now());
  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/settle_public_booking_payment`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_booking_id: bookingId,
      p_invoice_id: invoiceId,
      p_transaction_id: transactionId,
      p_paid_at: paidAt,
    }),
  });
  if (!response.ok) throw new Error(`Booking settlement failed (${response.status})`);
  return await response.json();
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

async function settleCoffeePassportListing(listingPaymentId: string, invoiceId: string, transaction: Record<string, unknown>) {
  const transactionId = String(transaction.id || "");
  if (!listingPaymentId || !transactionId) return null;
  const providerAmount = Number(transaction.amount ?? transaction.totalAmount ?? transaction.grossAmount ?? transaction.paidAmount ?? NaN);
  if (!Number.isFinite(providerAmount) || providerAmount !== 1000) throw new Error("Coffee passport listing payment amount mismatch");
  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/coffee_passport_settle_listing`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", "Content-Profile": "pos" },
    body: JSON.stringify({ p_listing_payment_id: listingPaymentId, p_invoice_id: invoiceId, p_transaction_id: transactionId, p_paid_at: new Date(Number(transaction.updatedAt || transaction.createdAt || Date.now())).toISOString() }),
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("Coffee passport listing settlement rejected", response.status, errorBody.slice(0, 300));
    throw new Error(`Coffee passport listing settlement failed (${response.status})`);
  }
  return await response.json();
}

async function reconcilePendingCoffeePassportListings() {
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/rpc/coffee_passport_pending_listing_payments`,
    { method: "POST", headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", "Content-Profile": "pos" }, body: "{}" },
  );
  if (!response.ok) throw new Error(`Pending coffee passport listing lookup failed (${response.status})`);
  const payments = await response.json() as Array<Record<string, unknown>>;
  const settled: Array<Record<string, unknown>> = [];
  for (const payment of payments) {
    const invoiceId = String(payment.mayar_invoice_id || "");
    if (!invoiceId) continue;
    const invoiceResponse = await fetchWithTimeout(
      `${MAYAR_API_BASE}/invoices/${encodeURIComponent(invoiceId)}`,
      { headers: { Authorization: `Bearer ${MAYAR_API_KEY}` } },
    );
    const invoiceBody = await invoiceResponse.json().catch(() => ({})) as Record<string, unknown>;
    const invoiceData = invoiceBody.data && typeof invoiceBody.data === "object"
      ? invoiceBody.data as Record<string, unknown>
      : invoiceBody;
    const transactionId = String(invoiceData.transactionId || invoiceData.transaction_id || "");
    if (!transactionId) continue;
    const transaction = await verifyTransaction(transactionId);
    if (!transaction) continue;
    const result = await settleCoffeePassportListing(String(payment.listing_payment_id || ""), invoiceId, transaction);
    settled.push({ listingPaymentId: payment.listing_payment_id, ...((result && typeof result === "object") ? result : {}) });
  }
  return { scanned: payments.length, settled };
}

async function settleCoffeePassportBid(entryId: string, invoiceId: string, transaction: Record<string, unknown>) {
  const transactionId = String(transaction.id || "");
  if (!entryId || !transactionId) return null;
  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/coffee_passport_settle_bid`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", "Content-Profile": "pos" },
    body: JSON.stringify({ p_entry_id: entryId, p_invoice_id: invoiceId, p_transaction_id: transactionId, p_paid_at: new Date(Number(transaction.updatedAt || transaction.createdAt || Date.now())).toISOString() }),
  });
  if (!response.ok) throw new Error(`Coffee passport bid settlement failed (${response.status})`);
  return await response.json();
}

async function settleWalletTopup(topupId: string, transaction: Record<string, unknown>) {
  const transactionId=String(transaction.id||""); if(!topupId||!transactionId) return null;
  const response=await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/wallet_settle_topup`,{method:"POST",headers:{apikey:SERVICE_ROLE_KEY,Authorization:`Bearer ${SERVICE_ROLE_KEY}`,"Content-Type":"application/json","Content-Profile":"pos"},body:JSON.stringify({p_topup_id:topupId,p_transaction_id:transactionId,p_paid_at:new Date(Number(transaction.updatedAt||transaction.createdAt||Date.now())).toISOString()})});
  if(!response.ok) throw new Error(`Wallet topup settlement failed (${response.status})`);
  return await response.json();
}

async function reconcilePendingWalletTopups() {
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/customer_wallet_topups?select=topup_id,transaction_id,invoice_id,status&status=eq.pending&transaction_id=not.is.null&order=created_at.asc&limit=100`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Accept-Profile": "pos" } },
  );
  if (!response.ok) throw new Error(`Pending wallet topup lookup failed (${response.status})`);
  const topups = await response.json() as Array<Record<string, unknown>>;
  const settled: Array<Record<string, unknown>> = [];
  for (const topup of topups) {
    const transactionId = String(topup.transaction_id || "");
    const transaction = await verifyTransaction(transactionId);
    if (!transaction) continue;
    const result = await settleWalletTopup(String(topup.topup_id || ""), transaction);
    settled.push({ topupId: topup.topup_id, ...((result && typeof result === "object") ? result : {}) });
  }
  return { scanned: topups.length, settled };
}
async function settleOrder(order: Record<string, unknown>, transaction: Record<string, unknown>, invoiceId: string) {
  const orderId = String(order.source_id || "");
  const transactionId = String(transaction.id || "");
  if (!orderId || !transactionId) return { updated: 0, transactionCreated: false };
  const expectedInvoice = String(order.gateway_invoice_id || parseExtraData(order.payment_gateway)?.invoiceId || "");
  if (expectedInvoice && invoiceId && expectedInvoice !== invoiceId) {
    throw new Error("Order invoice mismatch");
  }
  const providerAmount = Number(transaction.amount ?? transaction.totalAmount ?? transaction.grossAmount ?? transaction.paidAmount ?? NaN);
  const orderAmount = Number(order.total_amount ?? NaN);
  if (!Number.isFinite(providerAmount) || !Number.isFinite(orderAmount) || providerAmount <= 0 || Math.abs(providerAmount - orderAmount) > 0.01) {
    throw new Error("Order payment amount mismatch");
  }
  const paymentGateway = {
    provider: "mayar",
    invoiceId: invoiceId || expectedInvoice,
    transactionId,
    status: "paid",
    paidAt: Number(transaction.updatedAt || transaction.createdAt || Date.now()),
  };
  const patch = {
    payment_gateway: paymentGateway,
    gateway_invoice_id: paymentGateway.invoiceId || null,
    payment_receipt_kind: "gateway_paid",
    delivery_status: "paid",
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
    `${SUPABASE_URL}/rest/v1/orders?select=source_id,order_number,status,total_amount,customer_name,gateway_invoice_id,payment_gateway,source&gateway_invoice_id=not.is.null&order=created_at.desc&limit=100`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Accept-Profile": "pos" } },
  );
  if (!response.ok) throw new Error(`Pending order lookup failed (${response.status})`);
  const orders = await response.json() as Array<Record<string, unknown>>;
  const mayarOrders = orders.filter((order) => {
    const status = String(order.status || "");
    const source = String(order.source || "");
    const gateway = parseExtraData(order.payment_gateway);
    return ["pending", "cancelled"].includes(status)
      && ["customer_self_service", "ordermieyamin_b2b"].includes(source)
      && gateway.provider === "mayar";
  });
  const results: Array<Record<string, unknown>> = [];
  for (const order of mayarOrders) {
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

async function completeEvent(id: string, status: string, error?: string) {
  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/complete_mayar_payment_event`, { method: "POST", headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", "Content-Profile": "pos" }, body: JSON.stringify({ p_id: id, p_status: status, p_error: error || null, p_max_attempts: 8 }) });
  if (!response.ok) throw new Error(`Mayar event completion failed (${response.status})`);
  return response.json();
}

async function processEvent(payload: Record<string, unknown>) {
  const data = (payload.data || {}) as Record<string, unknown>;
  const transactionId = String(data.transactionId || "");
  if (!transactionId || !MAYAR_API_KEY) throw new Error("Missing transaction verification identity");
  const transaction = await verifyTransaction(transactionId);
  if (!transaction) throw new Error("Transaction is not verified as paid");
  const transactionExtraData = parseExtraData(transaction.extraData);
  const extraData = parseExtraData(data.extraData);
  const walletTopupId = String(extraData.walletTopupId || transactionExtraData.walletTopupId || "");
  if (walletTopupId) return { walletTopup: await settleWalletTopup(walletTopupId, transaction) };
  const listingId = String(extraData.coffeePassportListingPaymentId || transactionExtraData.coffeePassportListingPaymentId || "");
  if (listingId) return { coffeePassportListing: await settleCoffeePassportListing(listingId, String(data.id || ""), transaction) };
  const bidId = String(extraData.coffeePassportBidEntryId || transactionExtraData.coffeePassportBidEntryId || "");
  if (bidId) return { coffeePassportBid: await settleCoffeePassportBid(bidId, String(data.id || ""), transaction) };
  const bookingId = String(extraData.bookingId || transactionExtraData.bookingId || "");
  const invoiceId = String(data.id || "");
  if (bookingId) return { booking: await settleBooking(bookingId, invoiceId, transaction) };
  const customFields = Array.isArray(data.custom_field) ? data.custom_field as Array<Record<string, unknown>> : [];
  const customOrderId = customFields.find((field) => field?.key === "order_id")?.value;
  const orderId = String(extraData.orderId || transactionExtraData.orderId || customOrderId || "");
  let settled = { scanned: 0, settled: [] as Array<Record<string, unknown>> };
  if (orderId) {
    const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/orders?select=*&source_id=eq.${encodeURIComponent(orderId)}&limit=1`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Accept-Profile": "pos" } });
    const orders = response.ok ? await response.json() as Array<Record<string, unknown>> : [];
    if (orders[0]) settled = { scanned: orders.length, settled: [{ orderId, ...(await settleOrder(orders[0], transaction, invoiceId)) }] };
  }
  if (!settled.settled.length && orderId) settled = await reconcilePendingOrders();
  if (!settled.settled.length && invoiceId) {
    const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/orders?select=*&gateway_invoice_id=eq.${encodeURIComponent(invoiceId)}&limit=1`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Accept-Profile": "pos" } });
    const orders = response.ok ? await response.json() as Array<Record<string, unknown>> : [];
    if (orders[0]) settled = { scanned: orders.length, settled: [{ orderId: orders[0].source_id, ...(await settleOrder(orders[0], transaction, invoiceId)) }] };
  }
  const first = settled.settled[0];
  return { updated: first?.updated || 0, transactionCreated: first?.transactionCreated || false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return json({ status: "ok", service: "mayar-payment-processor" });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!WEBHOOK_TOKEN || !safeTokenEqual(tokenFromRequest(req), WEBHOOK_TOKEN)) return json({ error: "Unauthorized" }, 401);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Processor storage is not configured" }, 500);
  if (Deno.env.get("MAYAR_PAYMENT_PROCESSOR_ENABLED") === "false") return json({ ok: true, disabled: true, claimed: 0 });
  try {
    const request = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(request?.limit || 10), 50));
    const claimedResponse = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/claim_mayar_payment_events`, { method: "POST", headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", "Content-Profile": "pos" }, body: JSON.stringify({ p_worker_id: crypto.randomUUID(), p_limit: limit }) });
    if (!claimedResponse.ok) throw new Error(`Mayar event claim failed (${claimedResponse.status})`);
    const events = await claimedResponse.json() as Array<Record<string, unknown>>;
    const results = [];
    for (const event of events) {
      try { const result = await processEvent(event.payload as Record<string, unknown>); results.push({ id: event.id, ...(await completeEvent(String(event.id), "sent")), result }); }
      catch (error) { const message = error instanceof Error ? error.message : "Processor failure"; results.push({ id: event.id, ...(await completeEvent(String(event.id), "retrying", message)) }); }
    }
    return json({ ok: true, claimed: events.length, results });
  } catch (error) {
    console.error("mayar-payment-processor failed", error);
    return json({ error: "Processor failed" }, 500);
  }
});
