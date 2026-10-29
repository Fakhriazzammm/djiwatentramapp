const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "authorization, apikey, content-type, x-yumi-session-token",
	"Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = (Deno.env.get("YUMI_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const SERVICE_ROLE_KEY = Deno.env.get("YUMI_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_ROLES = new Set(["admin", "administrator", "owner", "superadmin", "super admin"]);
const ACTIONS = {
	orders: { table: "pos_orders", permission: "orders:view" },
	booking: { table: "pos_booking_orders", permission: "orders:view" },
	finance: { table: "pos_financial_transactions", permission: "finance:view" },
} as const;

type Json = Record<string, unknown>;
type Query = {
	select?: string;
	eq?: Record<string, unknown>;
	gte?: Record<string, unknown>;
	gt?: Record<string, unknown>;
	lte?: Record<string, unknown>;
	lt?: Record<string, unknown>;
	in?: Record<string, unknown[]>;
	order?: Array<{ column: string; ascending?: boolean; nullsFirst?: boolean }>;
	range?: [number, number];
	limit?: number;
};

function response(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}
function fail(code: string, message: string, status: number) {
	return response({ success: false, error: { code, message } }, status);
}
function safeColumn(value: unknown): string {
	const column = String(value ?? "");
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) throw new Error("Invalid query column");
	return column;
}
function encodeFilter(params: URLSearchParams, operator: string, column: string, value: unknown) {
	// PostgREST expects duplicate query keys for combined bounds, e.g.
	// `createdAt=gte.<start>&createdAt=lte.<end>`. `set()` silently replaced
	// the lower bound with the upper bound and made time-windowed dashboard
	// reads return old rows instead of the requested period.
	if (value === null) params.append(column, "is.null");
	else params.append(column, `${operator}.${String(value)}`);
}
async function restRead(table: string, query: Query) {
	if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Protected read is not configured");
	const params = new URLSearchParams();
	const select = query.select ? String(query.select) : "*";
	if (!/^[A-Za-z0-9_.*(), ]+$/.test(select)) throw new Error("Invalid select");
	params.set("select", select);
	for (const [column, value] of Object.entries(query.eq ?? {})) encodeFilter(params, "eq", safeColumn(column), value);
	for (const [column, value] of Object.entries(query.gte ?? {})) encodeFilter(params, "gte", safeColumn(column), value);
	for (const [column, value] of Object.entries(query.gt ?? {})) encodeFilter(params, "gt", safeColumn(column), value);
	for (const [column, value] of Object.entries(query.lte ?? {})) encodeFilter(params, "lte", safeColumn(column), value);
	for (const [column, value] of Object.entries(query.lt ?? {})) encodeFilter(params, "lt", safeColumn(column), value);
	for (const [column, values] of Object.entries(query.in ?? {})) {
		if (!Array.isArray(values) || values.length > 200) throw new Error("Invalid in filter");
		params.set(safeColumn(column), `in.(${values.map((item) => String(item).replace(/[(),]/g, "")).join(",")})`);
	}
	for (const item of query.order ?? []) {
		const direction = item.ascending === false ? "desc" : "asc";
		const nulls = item.nullsFirst === true ? ".nullsfirst" : item.nullsFirst === false ? ".nullslast" : "";
		params.append("order", `${safeColumn(item.column)}.${direction}${nulls}`);
	}
	if (query.range) {
		const [from, to] = query.range;
		if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to - from > 1000) throw new Error("Invalid range");
		params.set("offset", String(from));
		params.set("limit", String(to - from + 1));
	} else if (query.limit !== undefined) {
		const limit = Number(query.limit);
		if (!Number.isInteger(limit) || limit < 0 || limit > 2000) throw new Error("Invalid limit");
		params.set("limit", String(limit));
	}
	let result: Response | undefined;
	let lastError: unknown;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			result = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
				headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Accept: "application/json" },
				signal: AbortSignal.timeout(8_000),
			});
			if (result.ok || (result.status < 500 && result.status !== 429) || attempt === 1) break;
		} catch (error) {
			lastError = error;
			if (attempt === 1) throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	if (!result) throw lastError instanceof Error ? lastError : new Error("Protected DB read failed");
	if (!result.ok) throw new Error(`Protected DB read failed (${result.status})`);
	return await result.json();
}
async function requireAdmin(token: string, permission: string) {
	if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
	const sessions = await restRead("yumi_sessions", { select: "user_source_id,expires_at", eq: { token }, limit: 1 });
	const session = sessions?.[0];
	if (!session || !session.expires_at || Date.now() >= new Date(session.expires_at).getTime()) throw Object.assign(new Error("Session expired or invalid"), { status: 401 });
	const users = await restRead("yumi_users", { select: "source_id,is_active,role_source_id", eq: { source_id: session.user_source_id }, limit: 1 });
	const user = users?.[0];
	if (!user?.is_active) throw Object.assign(new Error("Inactive user"), { status: 403 });
	const roles = await restRead("yumi_roles", { select: "name,permissions", eq: { source_id: user.role_source_id }, limit: 1 });
	const role = roles?.[0];
	const roleName = String(role?.name ?? "").trim().toLowerCase();
	const permissions = Array.isArray(role?.permissions) ? role.permissions.map(String) : [];
	if (!ADMIN_ROLES.has(roleName) && !permissions.includes(permission)) throw Object.assign(new Error("Admin permission required"), { status: 403 });
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return response({ ok: true });
	if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "POST required", 405);
	try {
		const token = (req.headers.get("x-yumi-session-token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
		if (!token) return fail("FORBIDDEN", "Unauthorized", 401);
		const body = await req.json() as Json;
		const action = body.action as keyof typeof ACTIONS;
		const config = ACTIONS[action];
		if (!config) return fail("UNKNOWN_ACTION", "Read action is not allowed", 400);
		await requireAdmin(token, config.permission);
		const data = await restRead(config.table, (body.query ?? {}) as Query);
		return response({ success: true, data: Array.isArray(data) ? data : [] });
	} catch (error) {
		const status = Number((error as { status?: number })?.status ?? 500);
		if (status >= 500) console.error("admin-protected-read failed", error);
		return fail(status === 401 || status === 403 ? "FORBIDDEN" : "READ_FAILED", status >= 500 ? "Protected read unavailable" : String((error as Error).message), status);
	}
});
