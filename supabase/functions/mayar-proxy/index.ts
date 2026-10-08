import { trustedServer, verifiedStaff } from "../_shared/payment-auth.ts";
import { verifyQuote } from "../_shared/delivery-quote.ts";
import { appendOrderAdjustments } from "../_shared/invoice-adjustments.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type, x-yumi-session",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAYAR_API_BASE = Deno.env.get("MAYAR_API_BASE") || "https://api.mayar.id/hl/v2";
const MAYAR_API_KEY = Deno.env.get("MAYAR_API_KEY");
const MAYAR_DEFAULT_MOBILE = Deno.env.get("MAYAR_DEFAULT_MOBILE") || "";
const MAYAR_REQUEST_TIMEOUT_MS = 12_000;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function fetchMayar(input: string, init: RequestInit = {}) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), MAYAR_REQUEST_TIMEOUT_MS);
	try {
		return await fetch(input, { ...init, signal: controller.signal });
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new Error("Mayar tidak merespons dalam 12 detik");
		}
		throw error;
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

function fail(code: string, message: string, status = 400) {
	return json({ success: false, error: { code, message } }, status);
}

function extractMayarMessage(value: unknown, fallback: string) {
	if (!value || typeof value !== "object") return fallback;
	const body = value as Record<string, unknown>;
	if (Array.isArray(body.data)) {
		const firstError = body.data.find((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).message === "string") as Record<string, unknown> | undefined;
		if (typeof firstError?.message === "string" && firstError.message.trim()) return firstError.message.trim();
	}
	const messages = body.messages ?? body.message ?? body.error;
	if (typeof messages === "string" && messages.trim()) return messages.trim();
	if (messages && typeof messages === "object") {
		const nested = messages as Record<string, unknown>;
		if (typeof nested.message === "string" && nested.message.trim()) return nested.message.trim();
	}
	return fallback;
}


function normalizeCustomerName(value: unknown) {
	const name = typeof value === "string" ? value.trim() : "";
	if (!name || /^pelanggan( umum)?$/i.test(name)) {
		throw new Error("Nama customer wajib diisi untuk invoice Mayar");
	}
	return name;
}

function normalizeCustomerEmail(value: unknown) {
	const email = typeof value === "string" ? value.trim().toLowerCase() : "";
	if (!email || email === "no-reply@restaurant.local") {
		throw new Error("Email customer wajib diisi untuk invoice Mayar");
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new Error("Format email customer tidak valid");
	}
	return email;
}

function normalizeMobile(value: unknown) {
	const mobile = typeof value === "string" ? value.replace(/[^\d]/g, "") : "";
	if (mobile.length < 10) {
		throw new Error("Nomor WhatsApp harus minimal 10 digit, contoh: 081234567890.");
	}
	return mobile;
}

function normalizeExtraData(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((result, [key, item]) => {
		if (item === null || item === undefined) return result;
		result[key] = typeof item === "string" ? item : JSON.stringify(item);
		return result;
	}, {});
}

async function readJsonResponse(response: Response) {
	const text = await response.text();
	if (!text.trim()) return null;
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return { message: text.slice(0, 300) };
	}
}

async function supabaseGet(path: string) {
  const [table, queryString = ""] = path.split("?", 2);
  const params = new URLSearchParams(queryString);
  let query = db.schema("pos").from(table).select(params.get("select") || "*");
  for (const [key, raw] of params.entries()) {
    if (key === "select" || key === "limit" || key === "order") continue;
    if (raw.startsWith("eq.")) query = query.eq(key, decodeURIComponent(raw.slice(3)));
  }
  if (params.has("order")) {
    const [column, direction] = String(params.get("order")).split(".");
    query = query.order(column, { ascending: direction !== "desc" });
  }
  if (params.has("limit")) query = query.limit(Number(params.get("limit")) || 1);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function supabasePatch(path: string, body: Record<string, unknown>) {
  const [table, queryString = ""] = path.split("?", 2);
  const params = new URLSearchParams(queryString);
  let query = db.schema("pos").from(table).update(body);
  for (const [key, raw] of params.entries()) {
    if (raw.startsWith("eq.")) query = query.eq(key, decodeURIComponent(raw.slice(3)));
  }
  const { data, error } = await query.select("*");
  if (error) throw error;
  return data ?? [];
}

async function supabaseRpc(name: string, payload: Record<string, unknown>) {
  const { data, error } = await db.schema("pos").rpc(name, payload);
  if (error) throw error;
  return data;
}

async function createInvoiceFromOrder(payload: Record<string, unknown>, staff = false) {
  const orderId = typeof payload.orderId === "string" ? payload.orderId.trim() : "";
  if (!orderId) throw new Error("orderId wajib diisi");

  const orders = await supabaseGet(
    `orders?select=source_id,customer_source_id,customer_email,order_number,order_type,total_amount,shipping_fee_amount,shipping_rate_snapshot,delivery_provider,subtotal_amount,discount_amount,tax_amount,service_charge_amount,rounding_adjustment,status,source,brand_slug,payment_method,payment_receipt_kind,customer_name,customer_email,delivery_contact_name,delivery_contact_phone,payment_gateway,idempotency_key&source_id=eq.${encodeURIComponent(orderId)}&limit=1`,
  ) as Array<Record<string, unknown>>;
  const order = orders[0];
  if (!order) throw new Error("Order tidak ditemukan");
  if (!staff && !["customer_self_service", "ordermieyamin_b2b"].includes(String(order.source || ""))) {
    throw new Error("Order bukan order online yang dapat dibayar Mayar");
  }
  if (!staff) {
    const callerSourceId = typeof payload.customerSourceId === "string" ? payload.customerSourceId.trim() : "";
    const callerEmail = typeof payload.customerEmail === "string" ? payload.customerEmail.trim().toLowerCase() : "";
    if (!callerSourceId || !callerEmail || callerSourceId !== String(order.customer_source_id || "") || callerEmail !== String(order.customer_email || "").trim().toLowerCase()) {
      throw new Error("Customer tidak memiliki akses ke order ini");
    }
  }
  if (!["pending", "created"].includes(String(order.status || ""))) {
    throw new Error("Order tidak berada pada status pending");
  }
  if (staff && order.order_type === "delivery") throw new Error("Delivery payments require the member API");
  if (order.order_type === "delivery" && (order.payment_method !== "qris" || order.payment_receipt_kind !== "gateway_pending")) {
    throw new Error("Invoice delivery hanya tersedia untuk pesanan QRIS Mayar pending");
  }
  if (order.order_type === "delivery") {
    const quote = await verifyQuote(order.shipping_rate_snapshot);
    if (!["biteship", "fallback"].includes(String(quote.feeSource)) || quote.provider !== "biteship"
      || !["gojek", "grab"].includes(quote.courierCode) || !quote.courierType
      || quote.courierCode !== order.delivery_provider || quote.fee !== Number(order.shipping_fee_amount)) {
      throw new Error("Tarif delivery tidak tersedia");
    }
  }
  const isMerchandiseOrder = String(order.brand_slug || "").trim().toLowerCase() === "merchandise";
  const existingGateway = order.payment_gateway && typeof order.payment_gateway === "object"
    ? order.payment_gateway as Record<string, unknown>
    : {};
  const existingLink = typeof existingGateway.invoiceUrl === "string" && existingGateway.invoiceUrl.trim()
    ? existingGateway.invoiceUrl.trim()
    : typeof existingGateway.link === "string" && existingGateway.link.trim()
      ? existingGateway.link.trim()
      : "";
  const forceNew = payload.forceNew === true;
  if (existingLink && existingGateway.invoiceId && !forceNew) {
    return { statusCode: 200, messages: "success", data: { id: existingGateway.invoiceId, transactionId: existingGateway.transactionId, link: existingLink, reused: true } };
  }
  if (isMerchandiseOrder) {
    if (String(order.source || "") !== "customer_self_service"
      || !["qris", "mayar"].includes(String(order.payment_method || "").toLowerCase())) {
      throw new Error("Pre-order merchandise hanya menerima pembayaran Mayar");
    }
    if ((existingGateway.invoiceId || existingGateway.transactionId) && !forceNew) {
      throw new Error("Invoice lama masih aktif atau perlu diverifikasi; invoice baru tidak dibuat");
    }
    if (forceNew && (existingGateway.invoiceId || existingGateway.transactionId)) {
      const finalStatus = String(existingGateway.status || "").toLowerCase();
      if (!["expired", "cancelled", "canceled", "void"].includes(finalStatus)
        || !existingGateway.providerStatusVerifiedAt) {
        throw new Error("Invoice lama belum terverifikasi final oleh Mayar");
      }
    }
  }
  const invoiceExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  if (isMerchandiseOrder) {
    await supabaseRpc("reserve_merchandise_preorder_order", {
      p_order_source_id: orderId,
      p_hold_expires_at: invoiceExpiresAt,
    });
  }

  const itemRows = await supabaseGet(
    `order_items?select=product_name,variant,quantity,price,status&order_source_id=eq.${encodeURIComponent(orderId)}&order=line_no.asc`,
  ) as Array<Record<string, unknown>>;
  const items = itemRows
    .filter((item) => item.status !== "cancelled" && Number(item.quantity || 0) > 0)
    .map((item) => ({
      description: String(item.variant ? `${item.product_name || "Produk"} (${item.variant})` : item.product_name || "Produk"),
      quantity: Number(item.quantity),
      rate: Number(item.price || 0),
    }));
  if (!items.length) throw new Error("Order tidak memiliki item pembayaran");
  appendOrderAdjustments(items, order);

  const requestedPaymentMethod = typeof payload.paymentMethod === "string"
    ? payload.paymentMethod.trim().toLowerCase()
    : "";
  if (requestedPaymentMethod) {
    const channels = await getPaymentChannels();
    const activeMethods = new Set<string>();
    for (const channel of Array.isArray(channels?.config) ? channels.config : []) {
      if (channel?.status !== true) continue;
      const code = String(channel.code || "").trim().toLowerCase();
      const type = String(channel.type || "").trim().toLowerCase();
      if (type === "qris" && code === "qris") activeMethods.add("qris");
      if (type === "va" && ["bni", "bri", "mandiri", "cimb", "permata", "bjb", "bsi"].includes(code)) {
        activeMethods.add(`va/${code}`);
      }
      if (type === "ewallet" && ["dana", "gopay", "linkaja", "shopeepay", "jenius"].includes(code)) {
        activeMethods.add(`ewallet/${code}`);
      }
      if (type === "retail" && code === "alfamart") activeMethods.add("outlet/alfamart");
    }
    if (!activeMethods.has(requestedPaymentMethod)) {
      throw new Error("Channel pembayaran Mayar sedang tidak aktif atau belum didukung");
    }
  }

  const result = await createInvoice({
    name: order.customer_name,
    email: order.customer_email,
    mobile: order.delivery_contact_phone || payload.mobile || MAYAR_DEFAULT_MOBILE,
    redirectUrl: payload.redirectUrl,
    description: `Pembayaran order ${order.order_number || orderId}`,
    expiredAt: invoiceExpiresAt,
    items,
    paymentMethod: payload.paymentMethod,
    extraData: { orderId },
  });
  const invoiceData = result?.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  const previousInvoices = Array.isArray(existingGateway.previousInvoices)
    ? existingGateway.previousInvoices
    : [];
  const archivedInvoice = forceNew && (existingGateway.invoiceId || existingGateway.transactionId)
    ? [{
      invoiceId: existingGateway.invoiceId || null,
      transactionId: existingGateway.transactionId || null,
      status: existingGateway.status || "unknown",
      verifiedAt: existingGateway.providerStatusVerifiedAt || null,
    }]
    : [];
  const paymentGateway = {
    provider: "mayar",
    invoiceId: invoiceData.id || null,
    transactionId: invoiceData.transactionId || null,
    invoiceUrl: invoiceData.link || null,
    expiresAt: invoiceExpiresAt,
    status: "created",
    previousInvoices: [...previousInvoices, ...archivedInvoice],
  };
  await supabasePatch(`orders?source_id=eq.${encodeURIComponent(orderId)}`, {
    payment_gateway: paymentGateway,
    gateway_invoice_id: paymentGateway.invoiceId,
    payment_receipt_kind: "gateway_pending",
  });
  return result;
}

async function getPaymentChannels() {
  if (!MAYAR_API_KEY) throw new Error("MAYAR_API_KEY tidak dikonfigurasi");
  const response = await fetchMayar(`${MAYAR_API_BASE}/payment-channels`, {
    headers: { "Authorization": `Bearer ${MAYAR_API_KEY}` },
  });
  const result = await readJsonResponse(response);
  const statusCode = Number((result as any)?.statusCode ?? response.status);
  if (!response.ok || statusCode >= 400) throw new Error("Konfigurasi channel pembayaran Mayar tidak tersedia");
  return (result as any)?.data || {};
}

async function createInvoice(payload: Record<string, unknown>) {
	if (!MAYAR_API_KEY) {
		throw new Error("MAYAR_API_KEY tidak dikonfigurasi");
	}

	const body: Record<string, unknown> = {
		name: normalizeCustomerName(payload.name),
		email: normalizeCustomerEmail(payload.email),
		mobile: normalizeMobile(payload.mobile || MAYAR_DEFAULT_MOBILE),
		redirectUrl: (payload.redirectUrl as string)?.trim() || "https://zantara.myr.id",
		description: payload.description || "",
		expiredAt: payload.expiredAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
		items: (Array.isArray(payload.items) ? payload.items : []).map((item: any) => {
			const description = String(item?.description || item?.name || "Item");
			return {
				description,
				quantity: Number(item?.quantity ?? 1),
				rate: Number(item?.rate ?? item?.price ?? 0),
			};
		}),
		extraData: normalizeExtraData(payload.extraData),
	};
	const paymentMethod = typeof payload.paymentMethod === "string" ? payload.paymentMethod.trim().toLowerCase() : "";
	if (paymentMethod) body.paymentMethod = paymentMethod;

	const resp = await fetchMayar(`${MAYAR_API_BASE}/invoices/create`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${MAYAR_API_KEY}`,
		},
		body: JSON.stringify(body),
	});

	const result: any = await readJsonResponse(resp);

	const statusCode = Number(result?.statusCode ?? result?.status ?? resp.status);
	if (!resp.ok || (statusCode < 200 || statusCode >= 300)) {
		const msg = extractMayarMessage(result, `Mayar API error ${resp.status}`);
		console.error("Mayar invoice create failed", resp.status, msg);
		throw new Error(msg);
	}

	const createdData: any = result?.data && typeof result.data === "object" ? result.data : result || {};
	let paymentUrl = createdData.paymentUrl || createdData.payment_url || createdData.link || createdData.url || createdData.checkoutUrl;
	if (!paymentUrl && createdData.id) {
		const detail: any = await getInvoiceDetail(String(createdData.id));
		paymentUrl = detail?.data?.paymentUrl || detail?.data?.payment_url || detail?.data?.link || detail?.data?.url || detail?.paymentUrl || detail?.link;
	}
	if (!paymentUrl) throw new Error("Mayar belum mengembalikan link pembayaran. Silakan coba lagi.");
	return {
		...result,
		data: {
			...createdData,
			paymentUrl,
			link: paymentUrl,
		},
	};
}

async function getInvoiceDetail(invoiceId: string) {
	if (!MAYAR_API_KEY) {
		throw new Error("MAYAR_API_KEY tidak dikonfigurasi");
	}

	const resp = await fetchMayar(`${MAYAR_API_BASE}/invoices/${encodeURIComponent(invoiceId)}`, {
		method: "GET",
		headers: {
			"Authorization": `Bearer ${MAYAR_API_KEY}`,
		},
	});

	const result: any = await readJsonResponse(resp);

	if (!resp.ok) {
		throw new Error(extractMayarMessage(result, `Mayar API error ${resp.status}`));
	}
	if (!result || typeof result !== "object") {
		throw new Error("Mayar mengembalikan detail invoice kosong.");
	}

	return result;
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") {
		return new Response(null, { headers: corsHeaders });
	}
	if (req.method !== "POST") {
		return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
	}

	try {
		const body = await req.json();
		const action = body.action as string | undefined;
        const server = trustedServer(req);
        let staff: string | null = null;
        if (["create-invoice", "create-invoice-from-order", "get-invoice-detail"].includes(action || "")) {
          // Generic invoices remain server-only; order invoices verify ownership below.
          if (!server && action === "create-invoice") return fail("UNAUTHORIZED", "Authenticated payment server required", 401);
          if (!server && action === "get-invoice-detail") staff = await verifiedStaff(req.headers.get("x-yumi-session"));
          if (!server && action === "get-invoice-detail" && !staff) return fail("UNAUTHORIZED", "Sesi pembayaran tidak valid", 401);
        }

		switch (action) {
			case "get-payment-channels": {
				const channels = await getPaymentChannels();
				return json({ success: true, statusCode: 200, messages: "success", data: { config: channels?.config || [] } });
			}
		case "create-invoice-from-order": {
				const result = await createInvoiceFromOrder(body, !!staff);
				return json({
					success: true,
					statusCode: 200,
					messages: "success",
					data: result?.data || result,
				});
			}
			case "create-invoice": {
				const result = await createInvoice(body);
				return json({
					success: true,
					statusCode: 200,
					messages: "success",
					data: {
						id: result?.data?.id,
						transactionId: result?.data?.transactionId,
						link: result?.data?.link,
					},
				});
			}
			case "get-invoice-detail": {
				let invoiceId = body.invoiceId as string;
                if (staff) {
                  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
                  if (!orderId) return fail("MISSING_ORDER_ID", "orderId wajib diisi");
                  const orders = await supabaseGet(`orders?select=payment_gateway,order_type&source_id=eq.${encodeURIComponent(orderId)}&limit=1`) as Array<Record<string, any>>;
                  if (!orders[0] || orders[0].order_type === "delivery") return fail("ORDER_UNAVAILABLE", "Order tidak tersedia", 403);
                  invoiceId = orders[0].payment_gateway?.invoiceId;
                }
				if (!invoiceId) return fail("MISSING_INVOICE_ID", "invoiceId wajib diisi");
				const result = await getInvoiceDetail(invoiceId);
				return json({
					success: true,
					data: result?.data || null,
				});
			}
			default:
				return fail("UNKNOWN_ACTION", "Action tidak dikenali. Gunakan: create-invoice-from-order, create-invoice, get-invoice-detail", 404);
		}
	} catch (error) {
		console.error("mayar-proxy failed", error);
		const detail = error instanceof Error ? error.message : "";
		const safeMessage = detail && !/api[_ -]?key|bearer|token|authorization/i.test(detail)
			? detail
			: "Gagal menyiapkan pembayaran Mayar. Silakan coba lagi.";
		return fail(
			"INTERNAL_ERROR",
			safeMessage,
			detail.includes("tidak merespons") ? 504 : 400
		);
	}
});
