import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import bcrypt from "npm:bcryptjs@2.4.3";

type AuthAction =
	| "listPublicUsers"
	| "loginWithPin"
	| "validateSession"
	| "logoutSession";

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
			"source_id, name, slug, home_pin_hash, is_active, role_source_id, face_descriptor"
		)
		.eq("source_id", userId)
		.maybeSingle();

	if (error) throw error;
	if (!user || !user.is_active) {
		throw new Error("User tidak ditemukan atau nonaktif");
	}

	if (!user.home_pin_hash || !(await bcrypt.compare(pin, user.home_pin_hash))) {
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

	return {
		token,
		expiresAt,
		user: {
			_id: user.source_id,
			name: toTrimmedString(user.name),
			slug: toTrimmedString(user.slug) || undefined,
			hasFace:
				Array.isArray(user.face_descriptor) && user.face_descriptor.length > 0,
		},
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
			"source_id, username, name, slug, role_source_id, is_active, face_descriptor"
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
			default:
				return fail("Auth action tidak dikenali", 404);
		}
	} catch (error) {
		console.error("yumi-auth failed", error);
		return fail(error instanceof Error ? error.message : "Unknown error", 400);
	}
});
