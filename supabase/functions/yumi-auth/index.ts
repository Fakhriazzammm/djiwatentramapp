import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import bcrypt from "npm:bcryptjs@2.4.3";

type AuthAction =
	| "listPublicUsers"
	| "loginWithPin"
	| "validateSession"
	| "logoutSession"
	| "updateEmail"
	| "backfillAuthUsers"
	| "createAuthUser";

type JsonRecord = Record<string, unknown>;

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceRoleKey) {
	throw new Error("Missing Supabase function secrets");
}

// Raw fetch helper — avoids supabase-js Authorization header bug in edge-runtime
async function restQuery(table: string, select: string, options?: { eq?: { column: string; value: unknown }; order?: { column: string; ascending: boolean }; limit?: number }) {
	const params = new URLSearchParams();
	params.set("select", select);
	if (options?.order) params.set("order", `${options.order.column}.${options.order.ascending ? "asc" : "desc"}`);
	if (options?.limit) params.set("limit", String(options.limit));
	if (options?.eq) params.set(`${options.eq.column}`, `eq.${options.eq.value}`);

	const url = `${supabaseUrl}/rest/v1/${table}?${params.toString()}`;
	const res = await fetch(url, {
		headers: {
			"apikey": supabaseServiceRoleKey,
			"Accept": "application/json",
		},
	});
	if (!res.ok) {
		const errBody = await res.text();
		throw new Error(`DB query failed (${res.status}): ${errBody}`);
	}
	return res.json();
}

// Raw RPC call (for PostgreSQL functions)
async function restRpc(fn: string, body: JsonRecord) {
	const url = `${supabaseUrl}/rest/v1/rpc/${fn}`;
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"apikey": supabaseServiceRoleKey,
			"Content-Type": "application/json",
			"Accept": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const errBody = await res.text();
		throw new Error(`RPC failed (${res.status}): ${errBody}`);
	}
	return res.json();
}

// Raw INSERT — POST to /rest/v1/<table>
async function restInsert(table: string, body: Record<string, unknown>) {
	const url = `${supabaseUrl}/rest/v1/${table}`;
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"apikey": supabaseServiceRoleKey,
			"Content-Type": "application/json",
			"Accept": "application/json",
			"Prefer": "return=minimal",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const errBody = await res.text();
		throw new Error(`DB insert failed (${res.status}): ${errBody}`);
	}
}

// Raw UPDATE — PATCH to /rest/v1/<table> with eq filter
async function restUpdate(table: string, body: Record<string, unknown>, eqColumn: string, eqValue: string) {
	const url = `${supabaseUrl}/rest/v1/${table}?${eqColumn}=eq.${encodeURIComponent(eqValue)}`;
	const res = await fetch(url, {
		method: "PATCH",
		headers: {
			"apikey": supabaseServiceRoleKey,
			"Content-Type": "application/json",
			"Accept": "application/json",
			"Prefer": "return=minimal",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const errBody = await res.text();
		throw new Error(`DB update failed (${res.status}): ${errBody}`);
	}
}

// Raw DELETE — DELETE from /rest/v1/<table> with eq filter
async function restDelete(table: string, eqColumn: string, eqValue: string) {
	const url = `${supabaseUrl}/rest/v1/${table}?${eqColumn}=eq.${encodeURIComponent(eqValue)}`;
	const res = await fetch(url, {
		method: "DELETE",
		headers: {
			"apikey": supabaseServiceRoleKey,
			"Accept": "application/json",
		},
	});
	if (!res.ok) {
		const errBody = await res.text();
		throw new Error(`DB delete failed (${res.status}): ${errBody}`);
	}
}

// GoTrue Admin API — POST to http://auth:8081/admin/<path>
const gotrueUrl = Deno.env.get("SUPABASE_URL")?.replace("kong:8000", "auth:8081") ?? "http://auth:8081";
async function gotrueAdmin(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
	const url = `${gotrueUrl}/admin/${path}`;
	const res = await fetch(url, {
		method: body ? "POST" : "GET",
		headers: {
			"apikey": supabaseServiceRoleKey,
			"Authorization": `Bearer ${supabaseServiceRoleKey}`,
			"Content-Type": "application/json",
			"Accept": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		const errBody = await res.text();
		throw new Error(`GoTrue admin failed (${res.status}): ${errBody}`);
	}
	const text = await res.text();
	return text ? JSON.parse(text) : {};
}

function json(body: JsonRecord, status = 200) {
	return new Response(JSON.stringify({ success: true, ...body }), {
		status,
		headers: {
			...corsHeaders,
			"Content-Type": "application/json",
		},
	});
}

function fail(code: string, message: string, status = 400) {
	return json({ success: false, error: { code, message } }, status);
}

function normalizeToken(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeUserId(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function normalizePin(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function toTrimmedString(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function buildSessionToken() {
	const randomBytes = crypto.getRandomValues(new Uint8Array(18));
	const randomPart = Array.from(randomBytes, (byte) =>
		byte.toString(16).padStart(2, "0")
	).join("");

	return `ys_${crypto.randomUUID().replaceAll("-", "")}_${randomPart}`;
}

async function sha256Hex(input: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function listPublicUsers() {
	const data = await restQuery("yumi_users", "source_id, name, slug, face_descriptor, is_active", {
		eq: { column: "is_active", value: true },
		order: { column: "name", ascending: true },
	});

	return {
		users: (data ?? []).map((user: Record<string, unknown>) => {
			const name = toTrimmedString(user.name);
			return {
				_id: user.source_id,
				name,
				slug: toTrimmedString(user.slug) || undefined,
				initial: name.charAt(0).toUpperCase(),
				hasFace: Array.isArray(user.face_descriptor) && (user.face_descriptor as unknown[]).length > 0,
			};
		}),
	};
}

async function loginWithPin(payload: JsonRecord) {
	const userId = normalizeUserId(payload.userId);
	const pin = normalizePin(payload.pin);

	if (!userId) throw new Error("User ID wajib diisi");
	if (!/^\d{6}$/.test(pin)) throw new Error("PIN harus terdiri dari 6 digit angka");

	const users = await restQuery("yumi_users", "source_id, name, slug, home_pin_hash, home_pin_fingerprint, is_active, role_source_id, face_descriptor, raw", {
		eq: { column: "source_id", value: userId },
		limit: 1,
	});
	const user = users?.[0];
	if (!user || !user.is_active) {
		throw new Error("User tidak ditemukan atau nonaktif");
	}

	const pinValid = user.home_pin_hash
		? await bcrypt.compare(pin, user.home_pin_hash)
		: user.home_pin_fingerprint
			? await sha256Hex(pin) === user.home_pin_fingerprint
			: false;

	if (!pinValid) {
		throw new Error("PIN yang Anda masukkan salah");
	}

	const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
	const token = buildSessionToken();

	await restInsert("yumi_sessions", {
		token,
		user_source_id: user.source_id,
		expires_at: new Date(expiresAt).toISOString(),
	});

	await restUpdate("yumi_users", { last_login_at: new Date().toISOString() }, "source_id", user.source_id);

	// --- START: Supabase Auth dual session ---
	let supabaseAccessToken: string | null = null;
	let supabaseRefreshToken: string | null = null;

	try {
		const authUsers = await restQuery("yumi_users", "auth_user_id", {
			eq: { column: "source_id", value: user.source_id },
			limit: 1,
		});
		const userRecord = authUsers?.[0];

		if (userRecord?.auth_user_id) {
			const sessionData = await gotrueAdmin("sessions", {
				user_id: userRecord.auth_user_id,
			}) as any;

			if (sessionData) {
				supabaseAccessToken = sessionData.access_token ?? null;
				supabaseRefreshToken = sessionData.refresh_token ?? null;
			}
		}
	} catch (sessionErr) {
		console.warn("[yumi-auth] Failed to create Supabase session:", sessionErr);
		// Non-fatal — custom token tetap return
	}
	// --- END: Supabase Auth dual session ---

	return {
		token,
		expiresAt,
		user: {
			_id: user.source_id,
			name: toTrimmedString(user.name),
			slug: toTrimmedString(user.slug) || undefined,
			hasFace:
				Array.isArray(user.face_descriptor) && (user.face_descriptor as unknown[]).length > 0,
			requiresPinChange: Boolean(user.raw?.requiresPinChange),
		},
		supabaseAccessToken,
		supabaseRefreshToken,
	};
}

async function validateSession(payload: JsonRecord) {
	const token = normalizeToken(payload.token);
	if (!token) {
		return { session: null };
	}

	const sessions = await restQuery("yumi_sessions", "token, user_source_id, expires_at", {
		eq: { column: "token", value: token },
		limit: 1,
	});
	const session = sessions?.[0];

	if (!session) {
		return { session: null };
	}

	const expiresAt = new Date(session.expires_at).getTime();
	if (Date.now() > expiresAt) {
		await restDelete("yumi_sessions", "token", token);
		return { session: null };
	}

	const users = await restQuery("yumi_users", "source_id, username, name, slug, role_source_id, is_active, face_descriptor, raw", {
		eq: { column: "source_id", value: session.user_source_id },
		limit: 1,
	});
	const user = users?.[0];

	if (!user || !user.is_active) {
		await restDelete("yumi_sessions", "token", token);
		return { session: null };
	}

	const roles = await restQuery("yumi_roles", "source_id, name, permissions", {
		eq: { column: "source_id", value: user.role_source_id },
		limit: 1,
	});
	const role = roles?.[0];

	await restUpdate("yumi_sessions", { last_seen_at: new Date().toISOString() }, "token", token);

	return {
		session: {
			user: {
				_id: user.source_id,
				name: toTrimmedString(user.name),
				username: toTrimmedString(user.username),
				slug: toTrimmedString(user.slug) || undefined,
				roleId: user.role_source_id,
				hasFace:
					Array.isArray(user.face_descriptor) && (user.face_descriptor as unknown[]).length > 0,
				requiresPinChange: Boolean(user.raw?.requiresPinChange),
			},
			role: {
				_id: role?.source_id ?? "",
				name: toTrimmedString(role?.name ?? "staff"),
				permissions: asStringArray(role?.permissions),
			},
			expiresAt,
		},
	};
}

async function logoutSession(payload: JsonRecord) {
	const token = normalizeToken(payload.token);
	if (!token) return { success: true };

	await restDelete("yumi_sessions", "token", token);

	return { success: true };
}

async function handleUpdateEmail(payload: JsonRecord) {
	const userId = normalizeUserId(payload.userId);
	const newEmail = normalizeToken(payload.newEmail);
	if (!userId || !newEmail) throw new Error("userId dan newEmail wajib");
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error("Format email tidak valid");

	const users = await restQuery("yumi_users", "auth_user_id", {
		eq: { column: "source_id", value: userId },
		limit: 1,
	});
	const user = users?.[0];
	if (!user?.auth_user_id) throw new Error("User tidak memiliki Supabase Auth account");

	await gotrueAdmin(`users/${user.auth_user_id}`, {
		email: newEmail,
		email_confirm: true,
	});

	await restUpdate("yumi_users", { email: newEmail }, "source_id", userId);

	return { success: true };
}

async function handleCreateAuthUser(payload: JsonRecord) {
	const sourceId = normalizeUserId(payload.sourceId);
	const email = normalizeToken(payload.email);
	const password = normalizeToken(payload.password);
	const name = toTrimmedString(payload.name);

	if (!sourceId || !email || !password) throw new Error("sourceId, email, password wajib");

	const data = await gotrueAdmin("users", {
		email,
		password,
		email_confirm: true,
		user_metadata: { source_id: sourceId, name },
	}) as any;

	// Update yumi_users.auth_user_id
	await restUpdate("yumi_users", { auth_user_id: data.user?.id ?? data.id }, "source_id", sourceId);

	return { authUserId: data.user?.id ?? data.id };
}

async function handleBackfillAuthUsers() {
	const users = await restQuery("yumi_users", "source_id, username, name, raw", {
		eq: { column: "auth_user_id", value: null },
	});

	if (!users?.length) return { message: "Semua user sudah punya auth_user_id", count: 0 };

	// Fetch all auth.users and map by user_metadata->source_id
	const allAuthUsers = await gotrueAdmin("users") as any;
	const authUsersList = allAuthUsers?.users ?? [];

	const authBySourceId = new Map<string, string>();
	for (const au of authUsersList) {
		const sid = au.user_metadata?.source_id;
		if (sid) authBySourceId.set(sid, au.id);
	}

	let created = 0;
	const details_list: string[] = [];

	for (const user of users) {
		try {
			const authUserId = authBySourceId.get(user.source_id);
			if (!authUserId) {
				details_list.push(`${user.username}: tidak ditemukan di auth.users, skip`);
				continue;
			}

			await restUpdate("yumi_users", { auth_user_id: authUserId }, "source_id", user.source_id);

			created++;
			details_list.push(`${user.username}: mapped`);
		} catch (e: any) {
			details_list.push(`${user.username}: ${e.message}`);
		}
	}

	return { message: `Backfill selesai: ${created} user`, details: details_list };
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	try {
		const body = (await req.json()) as JsonRecord;
		const action = body.action as AuthAction | undefined;

		switch (action) {
			case "listPublicUsers":
				return json(await listPublicUsers());
			case "loginWithPin":
				return json(await loginWithPin(body));
			case "validateSession":
				return json(await validateSession(body));
			case "logoutSession":
				return json(await logoutSession(body));
			case "updateEmail":
				return json(await handleUpdateEmail(body));
			case "backfillAuthUsers":
				return json(await handleBackfillAuthUsers());
			case "createAuthUser":
				return json(await handleCreateAuthUser(body));
			default:
				return fail("UNKNOWN_ACTION", "Auth action tidak dikenali", 404);
		}
	} catch (error) {
		console.error("yumi-auth failed", error);
		return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Unknown error", 400);
	}
});
