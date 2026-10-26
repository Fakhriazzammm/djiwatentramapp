/**
 * API Helper — standardized response parsing for Supabase Edge Functions.
 *
 * All Edge Functions should return the new standard format:
 *   Success: { success: true, ...data }
 *   Error:   { success: false, error: { code: "CODE", message: "..." } }
 *
 * This helper also handles legacy formats during transition:
 *   Old success: { ok: true, ...data }
 *   Old error:   { error: "string message" } or { ok: false }
 */

import { createClient } from "@/lib/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApiSuccessResponse<T = Record<string, unknown>> = {
	success: true;
} & T;

export type ApiErrorBody = {
	code: string;
	message: string;
};

export type ApiErrorResponse = {
	success: false;
	error: ApiErrorBody;
};

export type ApiResponse<T = Record<string, unknown>> =
	| ApiSuccessResponse<T>
	| ApiErrorResponse;

// ---------------------------------------------------------------------------
// ApiError class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
	code: string;
	status: number;

	constructor(code: string, message: string, status: number = 500) {
		super(message);
		this.name = "ApiError";
		this.code = code;
		this.status = status;
	}
}

// ---------------------------------------------------------------------------
// Response parser — handles both new standard format and legacy formats
// ---------------------------------------------------------------------------

/**
 * Parse a raw response object from an Edge Function and extract the data
 * or throw an ApiError.
 *
 * Handles:
 *  - New format: { success: true, ...data } / { success: false, error: { code, message } }
 *  - Legacy format: { ok: true/false, ...data }
 *  - Legacy format: { error: "string message" }
 *  - Legacy format: raw data without any wrapper
 */
export function parseEdgeFunctionResponse<T>(
	raw: unknown,
	defaultStatus: number = 500
): T {
	if (!raw || typeof raw !== "object") {
		return raw as T;
	}

	const obj = raw as Record<string, unknown>;

	// ---- New format ----
	if (obj.success === true) {
		// { success: true, ...data } → strip success and return the rest
		const { success: _, ...rest } = obj;
		return rest as T;
	}

	if (obj.success === false && obj.error && typeof obj.error === "object") {
		const err = obj.error as ApiErrorBody;
		throw new ApiError(
			err.code || "UNKNOWN_ERROR",
			err.message || "Unknown error",
			defaultStatus
		);
	}

	// ---- Legacy: { ok: true/false } ----
	if ("ok" in obj) {
		if (obj.ok === true) {
			const { ok: _, ...rest } = obj;
			return rest as T;
		}
		// ok === false
		throw new ApiError(
			"REQUEST_FAILED",
			(typeof obj.error === "string" ? obj.error : undefined) ||
				(obj.message as string) ||
				"Request failed",
			defaultStatus
		);
	}

	// ---- Legacy: { error: "string" } ----
	if ("error" in obj && typeof obj.error === "string") {
		throw new ApiError("REQUEST_FAILED", obj.error, defaultStatus);
	}

	// ---- No wrapper — return as-is (completely raw response) ----
	return raw as T;
}

// ---------------------------------------------------------------------------
// invokeEdgeFunction — wrapper around supabase.functions.invoke
// ---------------------------------------------------------------------------

/**
 * Call a Supabase Edge Function and return typed data.
 *
 * Usage:
 *   const data = await invokeEdgeFunction<{ user: YumiSessionUser }>(
 *     "yumi-auth",
 *     { action: "validateSession", token }
 *   );
 *   console.log(data.user);
 */
export async function invokeEdgeFunction<T = Record<string, unknown>>(
	fnName: string,
	body: Record<string, unknown>
): Promise<T> {
	const supabase = createClient();
	const { data, error } = await supabase.functions.invoke(fnName, { body });

	if (error) {
		// FunctionsHttpError — try to extract body for structured error
		let detail = error.message || "Gagal memanggil edge function";
		try {
			const context = (error as any).context;
			let errBody: unknown;
			if (context?.clone) {
				const responseText = await context.clone().text();
				try { errBody = JSON.parse(responseText); } catch { errBody = null; }
			} else if (context?.json) {
				errBody = await context.json();
			}
			if (errBody) return parseEdgeFunctionResponse<T>(errBody, error.status || 500);
		} catch (parseError) {
			// parseEdgeFunctionResponse uses ApiError for structured server errors.
			// Do not replace that useful message with the generic transport error.
			if (parseError instanceof ApiError) throw parseError;
			// keep the transport message when the response body is unavailable
		}
		throw new ApiError("FUNCTION_ERROR", detail, error.status || 500);
	}

	return parseEdgeFunctionResponse<T>(data);
}

// ---------------------------------------------------------------------------
// invokeDirectFetch — wrapper around raw fetch() (for non-Supabase endpoints
// or endpoints that need custom headers like x-admin-secret)
// ---------------------------------------------------------------------------

/**
 * Call any HTTP endpoint via fetch() and return typed data using the same
 * standardized response parsing.
 *
 * Usage:
 *   const result = await invokeDirectFetch<{ approved: boolean }>(
 *     "https://.../functions/v1/onboarding-admin",
 *     {
 *       method: "POST",
 *       headers: { "Content-Type": "application/json", "x-admin-secret": "..." },
 *       body: JSON.stringify({ action: "approve", ... }),
 *     }
 *   );
 */
export async function invokeDirectFetch<T = Record<string, unknown>>(
	url: string | URL,
	options: RequestInit = {}
): Promise<T> {
	const response = await fetch(url, options);

	let body: unknown;
	try {
		body = await response.json();
	} catch {
		// Non-JSON response
		const text = await response.text().catch(() => "");
		if (!response.ok) {
			throw new ApiError(
				"HTTP_ERROR",
				text || `HTTP ${response.status}`,
				response.status
			);
		}
		return (text || undefined) as T;
	}

	if (!response.ok) {
		// Try to parse error from body
		try {
			return parseEdgeFunctionResponse<T>(body, response.status);
		} catch {
			// If parseEdgeFunctionResponse didn't throw, or body is just raw,
			// throw our own error
			throw new ApiError(
				"HTTP_ERROR",
				(body as any)?.error ||
					(body as any)?.message ||
					`HTTP ${response.status}`,
				response.status
			);
		}
	}

	return parseEdgeFunctionResponse<T>(body, response.status);
}
