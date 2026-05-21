import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
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

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});

function json(body: JsonRecord, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...corsHeaders,
			"Content-Type": "application/json",
		},
	});
}

function fail(message: string, status = 400) {
	return json({ error: message }, status);
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
	const { data, error } = await supabaseAdmin
		.from("yumi_users")
		.select("source_id, name, slug, face_descriptor, is_active")
		.eq("is_active", true)
		.order("name", { ascending: true });

	if (error) throw error;

	return {
		users: (data ?? []).map((user) => {
			const name = toTrimmedString(user.name);
			return {
				_id: user.source_id,
				name,
				slug: toTrimmedString(user.slug) || undefined,
				initial: name.charAt(0).toUpperCase(),
				hasFace: Array.isArray(user.face_descriptor) && user.face_descriptor.length > 0,
			};
		}),
	};
}

async function loginWithPin(payload: JsonRecord) {
	const userId = normalizeUserId(payload.userId);
	const pin = normalizePin(payload.pin);

	if (!userId) throw new Error("User ID wajib diisi");
	if (!/^\d{6}$/.test(pin)) throw new Error("PIN harus terdiri dari 6 digit angka");

	const { data: user, error } = await supabaseAdmin
		.from("yumi_users")
		.select(
			"source_id, name, slug, home_pin_hash, home_pin_fingerprint, is_active, role_source_id, face_descriptor, raw"
		)
		.eq("source_id", userId)
		.maybeSingle();

	if (error) throw error;
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

	const { error: sessionError } = await supabaseAdmin.from("yumi_sessions").insert({
		token,
		user_source_id: user.source_id,
		expires_at: new Date(expiresAt).toISOString(),
	});

	if (sessionError) throw sessionError;

	await supabaseAdmin
		.from("yumi_users")
		.update({ last_login_at: new Date().toISOString() })
		.eq("source_id", user.source_id);

	// --- START: Supabase Auth dual session ---
	let supabaseAccessToken: string | null = null;
	let supabaseRefreshToken: string | null = null;

	try {
		const { data: userRecord } = await supabaseAdmin
			.from("yumi_users")
			.select("auth_user_id")
			.eq("source_id", user.source_id)
			.single();

		if (userRecord?.auth_user_id) {
			const { data: sessionData, error: sessionError } =
				await supabaseAdmin.auth.admin.createSession({
					user_id: userRecord.auth_user_id,
				});

			if (!sessionError && sessionData) {
				supabaseAccessToken = sessionData.access_token;
				supabaseRefreshToken = sessionData.refresh_token;
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
				Array.isArray(user.face_descriptor) && user.face_descriptor.length > 0,
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

	const { data: session, error: sessionError } = await supabaseAdmin
		.from("yumi_sessions")
		.select("token, user_source_id, expires_at")
		.eq("token", token)
		.maybeSingle();

	if (sessionError) throw sessionError;
	if (!session) {
		return { session: null };
	}

	const expiresAt = new Date(session.expires_at).getTime();
	if (Date.now() > expiresAt) {
		await supabaseAdmin.from("yumi_sessions").delete().eq("token", token);
		return { session: null };
	}

	const { data: user, error: userError } = await supabaseAdmin
		.from("yumi_users")
		.select(
			"source_id, username, name, slug, role_source_id, is_active, face_descriptor, raw"
		)
		.eq("source_id", session.user_source_id)
		.maybeSingle();

	if (userError) throw userError;
	if (!user || !user.is_active) {
		await supabaseAdmin.from("yumi_sessions").delete().eq("token", token);
		return { session: null };
	}

	const { data: role, error: roleError } = await supabaseAdmin
		.from("yumi_roles")
		.select("source_id, name, permissions")
		.eq("source_id", user.role_source_id)
		.maybeSingle();

	if (roleError) throw roleError;

	await supabaseAdmin
		.from("yumi_sessions")
		.update({ last_seen_at: new Date().toISOString() })
		.eq("token", token);

	return {
		session: {
			user: {
				_id: user.source_id,
				name: toTrimmedString(user.name),
				username: toTrimmedString(user.username),
				slug: toTrimmedString(user.slug) || undefined,
				roleId: user.role_source_id,
				hasFace:
					Array.isArray(user.face_descriptor) && user.face_descriptor.length > 0,
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

	const { error } = await supabaseAdmin.from("yumi_sessions").delete().eq("token", token);
	if (error) throw error;

	return { success: true };
}

async function handleUpdateEmail(
	supabaseAdmin: ReturnType<typeof createClient>,
	payload: JsonRecord
) {
	const userId = normalizeUserId(payload.userId);
	const newEmail = normalizeToken(payload.newEmail);
	if (!userId || !newEmail) throw new Error("userId dan newEmail wajib");
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error("Format email tidak valid");

	const { data: user } = await supabaseAdmin
		.from("yumi_users")
		.select("auth_user_id")
		.eq("source_id", userId)
		.single();
	if (!user?.auth_user_id) throw new Error("User tidak memiliki Supabase Auth account");

	const { error } = await supabaseAdmin.auth.admin.updateUserById(user.auth_user_id, {
		email: newEmail,
		email_confirm: true,
	});
	if (error) throw error;

	await supabaseAdmin.from("yumi_users").update({ email: newEmail }).eq("source_id", userId);

	return { success: true };
}

async function handleCreateAuthUser(payload: JsonRecord) {
	const sourceId = normalizeUserId(payload.sourceId);
	const email = normalizeToken(payload.email);
	const password = normalizeToken(payload.password);
	const name = toTrimmedString(payload.name);

	if (!sourceId || !email || !password) throw new Error("sourceId, email, password wajib");

	const { data, error } = await supabaseAdmin.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
		user_metadata: { source_id: sourceId, name },
	});
	if (error) throw error;

	// Update yumi_users.auth_user_id
	await supabaseAdmin.from("yumi_users").update({ auth_user_id: data.user.id }).eq("source_id", sourceId);

	return { authUserId: data.user.id };
}

async function handleBackfillAuthUsers() {
	const { data: users, error } = await supabaseAdmin
		.from("yumi_users")
		.select("source_id, username, name, raw")
		.is("auth_user_id", null);

	if (error) throw error;
	if (!users?.length) return { message: "Semua user sudah punya auth_user_id", count: 0 };

	// Fetch all auth.users and map by user_metadata->source_id
	const { data: allAuthUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
	if (authError) throw authError;

	const authBySourceId = new Map<string, string>();
	for (const au of allAuthUsers.users || []) {
		const sid = au.user_metadata?.source_id;
		if (sid) authBySourceId.set(sid, au.id);
	}

	let created = 0;
	let details_list: string[] = [];

	for (const user of users) {
		try {
			const authUserId = authBySourceId.get(user.source_id);
			if (!authUserId) {
				details_list.push(`${user.username}: tidak ditemukan di auth.users, skip`);
				continue;
			}

			await supabaseAdmin
				.from("yumi_users")
				.update({ auth_user_id: authUserId })
				.eq("source_id", user.source_id);

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
				return json(await handleUpdateEmail(supabaseAdmin, body));
			case "backfillAuthUsers":
				return json(await handleBackfillAuthUsers());
			case "createAuthUser":
				return json(await handleCreateAuthUser(body));
			default:
				return fail("Auth action tidak dikenali", 404);
		}
	} catch (error) {
		console.error("yumi-auth failed", error);
		return fail(error instanceof Error ? error.message : "Unknown error", 400);
	}
});
