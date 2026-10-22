import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAYAR_API_BASE = Deno.env.get("MAYAR_API_BASE") || "https://api.mayar.id/hl/v2";
const MAYAR_API_KEY = Deno.env.get("MAYAR_API_KEY");
const MAYAR_DEFAULT_EMAIL = Deno.env.get("MAYAR_DEFAULT_EMAIL") || "";
const MAYAR_DEFAULT_MOBILE = Deno.env.get("MAYAR_DEFAULT_MOBILE") || "";
const MAYAR_REQUEST_TIMEOUT_MS = 12_000;

class PaymentError extends Error {}

async function fetchMayar(input: string, init: RequestInit = {}) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), MAYAR_REQUEST_TIMEOUT_MS);
	try {
		return await fetch(input, { ...init, signal: controller.signal });
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new PaymentError("Mayar tidak merespons dalam 12 detik");
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

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function paymentLink(value: unknown): string | undefined {
	const body = record(value);
	for (const candidate of [record(body.data), body]) {
		for (const key of ["paymentUrl", "payment_url", "paymentLink", "payment_link", "link", "url", "checkoutUrl", "checkout_url", "invoiceUrl"]) {
			if (typeof candidate[key] !== "string") continue;
			try {
				const url = new URL(candidate[key].trim());
				if (url.protocol === "https:" && !url.username && !url.password) return url.href;
			} catch { /* Try the next alias. */ }
		}
	}
}

function providerError(status: number) {
	// Never forward provider bodies: they can contain credentials or customer data.
	if (status === 429) return new PaymentError("Permintaan pembayaran terlalu sering. Tunggu satu menit lalu coba lagi.");
	if (status === 409) return new PaymentError("Invoice pembayaran sudah ada. Silakan coba kembali untuk memeriksa invoice.");
	if (status === 400 || status === 422) return new PaymentError("Mayar menolak data pembayaran. Periksa kontak dan metode pembayaran Anda.");
	return new PaymentError("Layanan pembayaran Mayar sedang tidak tersedia. Silakan coba lagi.");
}

function contactFallback(normalize: (value: unknown) => string, ...values: unknown[]) {
	for (const value of values) {
		try { return normalize(value); } catch { /* Try the next configured contact. */ }
	}
	return normalize(undefined);
}


function normalizeCustomerName(value: unknown) {
	const name = typeof value === "string" ? value.trim() : "";
	if (!name || /^pelanggan( umum)?$/i.test(name)) {
		throw new PaymentError("Nama customer wajib diisi untuk invoice Mayar");
	}
	return name;
}

function normalizeCustomerEmail(value: unknown) {
	const email = typeof value === "string" ? value.trim().toLowerCase() : "";
	if (!email || /@[^@]+\.(local|invalid|test)$/i.test(email)) {
		throw new PaymentError("Email customer wajib diisi untuk invoice Mayar");
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new PaymentError("Format email customer tidak valid");
	}
	return email;
}

function normalizeMobile(value: unknown) {
	const mobile = typeof value === "string" ? value.replace(/[^\d]/g, "") : "";
	if (mobile.length < 10 || mobile.length > 15) {
		throw new PaymentError("Nomor WhatsApp harus minimal 10 digit, contoh: 081234567890.");
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
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new PaymentError("Supabase storage is not configured");
  const response = await fetchMayar(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Accept-Profile": "pos",
    },
  });
  const body = await response.json().catch(() => []);
  if (!response.ok) throw new PaymentError(`Order lookup failed (${response.status})`);
  return body;
}

async function supabasePatch(path: string, body: Record<string, unknown>) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new PaymentError("Supabase storage is not configured");
  const response = await fetchMayar(`${SUPABASE_URL}/rest/v1/${path}`, {
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
  const result = await response.json().catch(() => []);
  if (!response.ok) throw new PaymentError(`Order payment metadata update failed (${response.status})`);
  return result;
}

async function supabaseRpc(name: string, payload: Record<string, unknown>) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new PaymentError("Supabase storage is not configured");
  const response = await fetchMayar(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": "pos",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await readJsonResponse(response);
  if (!response.ok) throw new PaymentError(`Preorder reservation failed (${response.status})`);
  return body;
}

async function createInvoiceFromOrder(payload: Record<string, unknown>) {
  const orderId = typeof payload.orderId === "string" ? payload.orderId.trim() : "";
  if (!orderId) throw new PaymentError("orderId wajib diisi");

  const orders = await supabaseGet(
    `orders?select=source_id,order_number,total_amount,subtotal_amount,discount_amount,tax_amount,service_charge_amount,status,source,brand_slug,payment_method,customer_name,customer_email,delivery_contact_name,delivery_contact_phone,payment_gateway,idempotency_key&source_id=eq.${encodeURIComponent(orderId)}&limit=1`,
  ) as Array<Record<string, unknown>>;
  const order = orders[0];
  if (!order) throw new PaymentError("Order tidak ditemukan");
  const checkoutKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
  if (!checkoutKey || checkoutKey !== String(order.idempotency_key || "")) {
    throw new PaymentError("Checkout authorization tidak valid");
  }
  if (!["customer_self_service", "ordermieyamin_b2b"].includes(String(order.source || ""))) {
    throw new PaymentError("Order bukan order online yang dapat dibayar Mayar");
  }
  if (!["pending", "created"].includes(String(order.status || ""))) {
    throw new PaymentError("Order tidak berada pada status pending");
  }
  const isMerchandiseOrder = String(order.brand_slug || "").trim().toLowerCase() === "merchandise";
  const existingGateway = order.payment_gateway && typeof order.payment_gateway === "object"
    ? order.payment_gateway as Record<string, unknown>
    : {};
  const existingLink = paymentLink(existingGateway);
  const forceNew = payload.forceNew === true;
  if (existingLink && existingGateway.invoiceId && !forceNew) {
    return { statusCode: 200, messages: "success", data: { id: existingGateway.invoiceId, transactionId: existingGateway.transactionId, link: existingLink, reused: true } };
  }
  if (isMerchandiseOrder) {
    if (String(order.source || "") !== "customer_self_service"
      || !["qris", "mayar"].includes(String(order.payment_method || "").toLowerCase())) {
      throw new PaymentError("Pre-order merchandise hanya menerima pembayaran Mayar");
    }
    if ((existingGateway.invoiceId || existingGateway.transactionId) && !forceNew) {
      throw new PaymentError("Invoice lama masih aktif atau perlu diverifikasi; invoice baru tidak dibuat");
    }
    if (forceNew && (existingGateway.invoiceId || existingGateway.transactionId)) {
      const finalStatus = String(existingGateway.status || "").toLowerCase();
      if (!["expired", "cancelled", "canceled", "void"].includes(finalStatus)
        || !existingGateway.providerStatusVerifiedAt) {
        throw new PaymentError("Invoice lama belum terverifikasi final oleh Mayar");
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
  if (!items.length) throw new PaymentError("Order tidak memiliki item pembayaran");
  const itemTotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const orderTotal = Number(order.total_amount || 0);
  const recordedDiscount = Math.max(0, Number(order.discount_amount || 0));
  if (!Number.isFinite(orderTotal) || orderTotal <= 0 || itemTotal - orderTotal > recordedDiscount + 0.01) {
    throw new PaymentError("Total order tidak cocok dengan item database");
  }
  const adjustment = Math.round((orderTotal - itemTotal) * 100) / 100;
  if (adjustment < 0) {
    if (recordedDiscount + 0.01 < Math.abs(adjustment)) {
      throw new PaymentError("Total order tidak cocok dengan item database");
    }
    items.push({ description: "Diskon promo", quantity: 1, rate: adjustment });
  } else if (adjustment > 0) {
    items.push({ description: "Pajak, biaya layanan, atau ongkir", quantity: 1, rate: adjustment });
  }

  const requestedPaymentMethod = typeof payload.paymentMethod === "string"
    ? payload.paymentMethod.trim().toLowerCase()
    : "";
  // The invoice endpoint validates availability; channel config is not a checkout gate.

  const result = await createInvoice({
    name: order.customer_name || payload.name,
    email: contactFallback(normalizeCustomerEmail, order.customer_email, payload.email, MAYAR_DEFAULT_EMAIL),
    mobile: contactFallback(normalizeMobile, order.delivery_contact_phone, payload.mobile, MAYAR_DEFAULT_MOBILE),
    redirectUrl: payload.redirectUrl,
    description: `Pembayaran order ${order.order_number || orderId}`,
    expiredAt: invoiceExpiresAt,
    items,
    paymentMethod: requestedPaymentMethod,
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
  if (!MAYAR_API_KEY) throw new PaymentError("MAYAR_API_KEY tidak dikonfigurasi");
  const response = await fetchMayar(`${MAYAR_API_BASE}/payment-channels`, {
    headers: { "Authorization": `Bearer ${MAYAR_API_KEY}` },
  });
  const result = await readJsonResponse(response);
  const statusCode = Number(result?.statusCode ?? response.status);
  if (!response.ok || statusCode >= 400) throw new PaymentError("Konfigurasi channel pembayaran Mayar tidak tersedia");
  return record(result?.data);
}

async function createInvoice(payload: Record<string, unknown>) {
	if (!MAYAR_API_KEY) {
		throw new PaymentError("MAYAR_API_KEY tidak dikonfigurasi");
	}

	const body: Record<string, unknown> = {
		name: normalizeCustomerName(payload.name),
		email: contactFallback(normalizeCustomerEmail, payload.email, MAYAR_DEFAULT_EMAIL),
		mobile: contactFallback(normalizeMobile, payload.mobile, MAYAR_DEFAULT_MOBILE),
		redirectUrl: (payload.redirectUrl as string)?.trim() || "https://zantara.myr.id",
		description: payload.description || "",
		expiredAt: payload.expiredAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
		items: (Array.isArray(payload.items) ? payload.items : []).map((value: unknown) => {
			const item = record(value);
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

	const result = await readJsonResponse(resp);
	const statusCode = Number(result?.statusCode ?? resp.status);
	if (!resp.ok || !Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) {
		throw providerError(resp.ok ? statusCode : resp.status);
	}
	const createdData = { ...record(result), ...record(result?.data) };
	let paymentUrl = paymentLink(result);
	if (!paymentUrl && createdData.id) {
		paymentUrl = paymentLink(await getInvoiceDetail(String(createdData.id)));
	}
	if (!paymentUrl) throw new PaymentError("Mayar belum mengembalikan link pembayaran. Silakan coba lagi.");
	return {
		statusCode: 200,
		data: {
			id: createdData.id,
			transactionId: createdData.transactionId,
			paymentUrl,
			link: paymentUrl,
		},
	};
}

async function getInvoiceDetail(invoiceId: string) {
	if (!MAYAR_API_KEY) {
		throw new PaymentError("MAYAR_API_KEY tidak dikonfigurasi");
	}

	const resp = await fetchMayar(`${MAYAR_API_BASE}/invoices/${encodeURIComponent(invoiceId)}`, {
		method: "GET",
		headers: {
			"Authorization": `Bearer ${MAYAR_API_KEY}`,
		},
	});

	const result = await readJsonResponse(resp);

	if (!resp.ok || Number(result?.statusCode ?? resp.status) >= 400) {
		throw providerError(resp.status);
	}
	if (!result || typeof result !== "object") {
		throw new PaymentError("Mayar mengembalikan detail invoice kosong.");
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

	let action: string | undefined;
	try {
		const body = await req.json();
		action = body.action as string | undefined;

		switch (action) {
			case "get-payment-channels": {
				const channels = await getPaymentChannels();
				return json({ success: true, statusCode: 200, messages: "success", data: { config: channels?.config || [] } });
			}
		case "create-invoice-from-order": {
				const result = await createInvoiceFromOrder(body);
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
				const invoiceId = body.invoiceId as string;
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
		console.error("mayar-proxy failed");
		const detail = error instanceof PaymentError ? error.message : "";
		const safeMessage = detail && !/api[_ -]?key|bearer|token|authorization|https?:\/\//i.test(detail)
			? detail
			: "Gagal menyiapkan pembayaran Mayar. Silakan coba lagi.";
		return fail(
			"INTERNAL_ERROR",
			safeMessage,
			["create-invoice", "create-invoice-from-order"].includes(action || "")
				? 200 // Checkout consumes structured application errors, not transport errors.
				: detail.includes("tidak merespons") ? 504 : 400
		);
	}
});
