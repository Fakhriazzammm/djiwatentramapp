import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
};

const MAYAR_API_BASE = Deno.env.get("MAYAR_API_BASE") || "https://api.mayar.id/hl/v2";
const MAYAR_API_KEY = Deno.env.get("MAYAR_API_KEY");

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, "Content-Type": "application/json" },
	});
}

function fail(code: string, message: string, status = 400) {
	return json({ success: false, error: { code, message } }, status);
}

function normalizeExtraData(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((result, [key, item]) => {
		if (item === null || item === undefined) return result;
		result[key] = typeof item === "string" ? item : JSON.stringify(item);
		return result;
	}, {});
}

async function createInvoice(payload: Record<string, unknown>) {
	if (!MAYAR_API_KEY) {
		throw new Error("MAYAR_API_KEY tidak dikonfigurasi");
	}

	const body: Record<string, unknown> = {
		name: payload.name,
		email: payload.email || "no-reply@restaurant.local",
		mobile: payload.mobile || "085000000000",
		redirectUrl: (payload.redirectUrl as string)?.trim() || "https://zantara.myr.id",
		description: payload.description || "",
		expiredAt: payload.expiredAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
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

	const resp = await fetch(`${MAYAR_API_BASE}/invoices/create`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${MAYAR_API_KEY}`,
		},
		body: JSON.stringify(body),
	});

	const result: any = await resp.json();

	if (!resp.ok || result?.statusCode !== 200) {
		const msg = result?.messages || result?.message || `Mayar API error ${resp.status}`;
		console.error("Mayar invoice create failed", resp.status, result);
		throw new Error(String(msg));
	}

	const createdData: any = result?.data || {};
	let paymentUrl = createdData.paymentUrl;
	if (!paymentUrl && createdData.id) {
		const detail: any = await getInvoiceDetail(String(createdData.id));
		paymentUrl = detail?.data?.paymentUrl;
	}
	return {
		...result,
		data: {
			...createdData,
			paymentUrl,
			link: paymentUrl || createdData.link,
		},
	};
}

async function getInvoiceDetail(invoiceId: string) {
	if (!MAYAR_API_KEY) {
		throw new Error("MAYAR_API_KEY tidak dikonfigurasi");
	}

	const resp = await fetch(`${MAYAR_API_BASE}/invoices/${encodeURIComponent(invoiceId)}`, {
		method: "GET",
		headers: {
			"Authorization": `Bearer ${MAYAR_API_KEY}`,
		},
	});

	const result = await resp.json();

	if (!resp.ok) {
		const msg = result?.messages || result?.message || `Mayar API error ${resp.status}`;
		throw new Error(msg);
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
		return fail(
			"INTERNAL_ERROR",
			error instanceof Error ? error.message : JSON.stringify(error),
			400
		);
	}
});
