import { v } from "convex/values";
import { action, query } from "./_generated/server";

type MayarConfig = {
	baseUrl: string;
	apiKey: string;
	authScheme: string;
	webToken?: string;
	defaultEmail: string;
	defaultMobile: string;
};

type MayarEnvelope<T> = {
	statusCode?: number;
	messages?: string;
	data?: T;
	hasMore?: boolean;
	pageCount?: number;
	pageSize?: number;
	page?: number;
};

function readMayarConfig(): MayarConfig {
	const baseUrl =
		process.env.MAYAR_BASE_URL ||
		process.env.VITE_MAYAR_BASE_URL ||
		process.env.VITE_MAYAR_API_BASE ||
		"https://api.mayar.id/hl/v1";
	const apiKey =
		process.env.MAYAR_API_KEY || process.env.VITE_MAYAR_API_KEY || "";
	const authScheme =
		process.env.MAYAR_AUTH_SCHEME ||
		process.env.VITE_MAYAR_AUTH_SCHEME ||
		"Bearer";
	const webToken = process.env.MAYAR_WEBTOKEN || process.env.VITE_MAYAR_WEBTOKEN;
	const defaultEmail =
		process.env.MAYAR_DEFAULT_EMAIL ||
		process.env.VITE_MAYAR_DEFAULT_EMAIL ||
		"no-reply@restaurant.local";
	const defaultMobile =
		process.env.MAYAR_DEFAULT_MOBILE ||
		process.env.VITE_MAYAR_DEFAULT_MOBILE ||
		"085000000000";

	return {
		baseUrl: baseUrl.replace(/\/$/, ""),
		apiKey,
		authScheme,
		webToken: webToken || undefined,
		defaultEmail,
		defaultMobile,
	};
}

function getMissingConfig(config: MayarConfig): string[] {
	const missing: string[] = [];
	if (!config.baseUrl) missing.push("MAYAR_BASE_URL");
	if (!config.apiKey) missing.push("MAYAR_API_KEY");
	return missing;
}

function assertConfigured(config: MayarConfig) {
	const missing = getMissingConfig(config);
	if (missing.length > 0) {
		throw new Error(
			`Konfigurasi Mayar belum lengkap: ${missing.join(", ")}`
		);
	}
}

async function parseMayarErrorResponse(response: Response): Promise<string> {
	try {
		const json = (await response.json()) as {
			statusCode?: number;
			messages?: string;
			message?: string;
			data?: unknown;
		};
		const statusCode = json.statusCode ?? response.status;
		const message = json.messages || json.message || response.statusText;
		return `Mayar API error ${statusCode}: ${message}`;
	} catch {
		const text = await response.text().catch(() => "");
		return `Mayar API error ${response.status}: ${text || response.statusText}`;
	}
}

async function mayarRequest<T>(
	path: string,
	init: RequestInit = {}
): Promise<MayarEnvelope<T>> {
	const config = readMayarConfig();
	assertConfigured(config);

	const headers = new Headers(init.headers ?? {});
	headers.set("Content-Type", "application/json");
	headers.set("Authorization", `${config.authScheme} ${config.apiKey}`);
	if (config.webToken) {
		headers.set("webtoken", config.webToken);
	}

	const response = await fetch(
		`${config.baseUrl}/${path.replace(/^\//, "")}`,
		{
			...init,
			headers,
		}
	);

	if (!response.ok) {
		throw new Error(await parseMayarErrorResponse(response));
	}

	const payload = (await response.json()) as MayarEnvelope<T>;
	if ((payload.statusCode ?? 200) !== 200) {
		throw new Error(
			`Mayar API error ${payload.statusCode ?? 500}: ${payload.messages ?? "unknown"}`
		);
	}
	return payload;
}

export const isConfigured = query({
	args: {},
	handler: async () => {
		const config = readMayarConfig();
		const missing = getMissingConfig(config);
		return {
			configured: missing.length === 0,
			missing,
			baseUrl: config.baseUrl,
		};
	},
});

export const listProducts = action({
	args: {
		page: v.optional(v.number()),
		pageSize: v.optional(v.number()),
	},
	handler: async (_, args) => {
		const page = args.page ?? 1;
		const pageSize = args.pageSize ?? 10;
		const params = new URLSearchParams({
			page: String(page),
			pageSize: String(pageSize),
		});
		const payload = await mayarRequest<unknown[]>(
			`product?${params.toString()}`,
			{ method: "GET" }
		);
		return {
			statusCode: payload.statusCode ?? 200,
			messages: payload.messages ?? "success",
			hasMore: payload.hasMore ?? false,
			pageCount: payload.pageCount ?? 1,
			pageSize: payload.pageSize ?? pageSize,
			page: payload.page ?? page,
			data: payload.data ?? [],
		};
	},
});

export const getProductDetail = action({
	args: { productId: v.string() },
	handler: async (_, args) => {
		const payload = await mayarRequest<Record<string, unknown>>(
			`product/${encodeURIComponent(args.productId)}`,
			{ method: "GET" }
		);
		return {
			statusCode: payload.statusCode ?? 200,
			messages: payload.messages ?? "success",
			data: payload.data ?? null,
		};
	},
});

export const createInvoice = action({
	args: {
		name: v.string(),
		email: v.optional(v.string()),
		mobile: v.string(),
		redirectUrl: v.optional(v.string()),
		description: v.optional(v.string()),
		expiredAt: v.optional(v.string()),
		items: v.array(
			v.object({
				quantity: v.number(),
				rate: v.number(),
				description: v.string(),
			})
		),
	},
	handler: async (_, args) => {
		const config = readMayarConfig();
		const mobile = args.mobile.trim() || config.defaultMobile;
		const email = (args.email || "").trim() || config.defaultEmail;

		const payload = await mayarRequest<{
			id?: string;
			transactionId?: string;
			link?: string;
		}>("invoice/create", {
			method: "POST",
			body: JSON.stringify({
				name: args.name,
				email,
				mobile,
				redirectUrl: args.redirectUrl,
				description: args.description,
				expiredAt: args.expiredAt,
				items: args.items,
			}),
		});
		return {
			statusCode: payload.statusCode ?? 200,
			messages: payload.messages ?? "success",
			data: {
				id: payload.data?.id,
				transactionId: payload.data?.transactionId,
				link: payload.data?.link,
			},
		};
	},
});

export const getInvoiceDetail = action({
	args: { invoiceId: v.string() },
	handler: async (_, args) => {
		const payload = await mayarRequest<Record<string, unknown>>(
			`invoice/${encodeURIComponent(args.invoiceId)}`,
			{ method: "GET" }
		);
		return {
			statusCode: payload.statusCode ?? 200,
			messages: payload.messages ?? "success",
			data: payload.data ?? null,
		};
	},
});

export const createCustomer = action({
	args: {
		name: v.string(),
		email: v.string(),
		mobile: v.string(),
	},
	handler: async (_, args) => {
		const payload = await mayarRequest<Record<string, unknown>>(
			"customer/create",
			{
				method: "POST",
				body: JSON.stringify(args),
			}
		);
		return {
			statusCode: payload.statusCode ?? 200,
			messages: payload.messages ?? "success",
			data: payload.data ?? null,
		};
	},
});

export const getWebhookHistory = action({
	args: {
		page: v.optional(v.number()),
		pageSize: v.optional(v.number()),
		startAt: v.optional(v.string()),
		endAt: v.optional(v.string()),
		status: v.optional(v.string()),
		type: v.optional(v.string()),
		urlDestination: v.optional(v.string()),
	},
	handler: async (_, args) => {
		const params = new URLSearchParams();
		params.set("page", String(args.page ?? 1));
		params.set("pageSize", String(args.pageSize ?? 10));
		if (args.startAt) params.set("startAt", args.startAt);
		if (args.endAt) params.set("endAt", args.endAt);
		if (args.status) params.set("status", args.status);
		if (args.type) params.set("type", args.type);
		if (args.urlDestination) params.set("urlDestination", args.urlDestination);

		const payload = await mayarRequest<unknown[]>(
			`webhook/history?${params.toString()}`,
			{ method: "GET" }
		);
		return {
			statusCode: payload.statusCode ?? 200,
			messages: payload.messages ?? "success",
			hasMore: payload.hasMore ?? false,
			pageCount: payload.pageCount ?? 1,
			pageSize: payload.pageSize ?? args.pageSize ?? 10,
			page: payload.page ?? args.page ?? 1,
			data: payload.data ?? [],
		};
	},
});

export const registerWebhookUrl = action({
	args: { urlHook: v.string() },
	handler: async (_, args) => {
		const payload = await mayarRequest<null>("webhook/register", {
			method: "POST",
			body: JSON.stringify({ urlHook: args.urlHook }),
		});
		return {
			statusCode: payload.statusCode ?? 200,
			messages: payload.messages ?? "success",
		};
	},
});

export const testWebhookUrl = action({
	args: { urlHook: v.string() },
	handler: async (_, args) => {
		const payload = await mayarRequest<null>("webhook/test", {
			method: "POST",
			body: JSON.stringify({ urlHook: args.urlHook }),
		});
		return {
			statusCode: payload.statusCode ?? 200,
			messages: payload.messages ?? "success",
		};
	},
});

export const retryWebhookHistory = action({
	args: { webhookHistoryId: v.string() },
	handler: async (_, args) => {
		const payload = await mayarRequest<null>("webhook/retry", {
			method: "POST",
			body: JSON.stringify({ webhookHistoryId: args.webhookHistoryId }),
		});
		return {
			statusCode: payload.statusCode ?? 200,
			messages: payload.messages ?? "success",
		};
	},
});
