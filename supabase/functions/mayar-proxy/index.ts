import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
};

const MAYAR_API_BASE = Deno.env.get("MAYAR_API_BASE") || "https://api.mayar.id/hl/v2";
const MAYAR_API_KEY = Deno.env.get("MAYAR_API_KEY");
const MAYAR_DEFAULT_EMAIL = Deno.env.get("MAYAR_DEFAULT_EMAIL") || "no-reply@restaurant.local";
const MAYAR_REQUEST_TIMEOUT_MS = 12_000;

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
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : MAYAR_DEFAULT_EMAIL;
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

async function createInvoice(payload: Record<string, unknown>) {
	if (!MAYAR_API_KEY) {
		throw new Error("MAYAR_API_KEY tidak dikonfigurasi");
	}

	const body: Record<string, unknown> = {
		name: normalizeCustomerName(payload.name),
		email: normalizeCustomerEmail(payload.email),
		mobile: normalizeMobile(payload.mobile),
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

		switch (action) {
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
				return fail("UNKNOWN_ACTION", "Action tidak dikenali. Gunakan: create-invoice, get-invoice-detail", 404);
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
