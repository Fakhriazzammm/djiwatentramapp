import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import bcrypt from "npm:bcryptjs@2.4.3";

type AuthAction =
	| "listPublicUsers"
	| "loginWithPin"
	| "validateSession"
	| "logoutSession"
	| "changePin"
	| "updateProfile"
	| "updateEmail"
	| "backfillAuthUsers"
	| "createAuthUser";

type JsonRecord = Record<string, unknown>;

const supabaseUrl = Deno.env.get("YUMI_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");

/**
 * Base URL yang bisa dibuka browser. `SUPABASE_URL` di dalam container adalah
 * http://kong:8000 (hanya valid antar-container), dan `SUPABASE_PUBLIC_URL` di
 * server ini salah konfigurasi — menunjuk ke https://pos.yumme.id (app POS),
 * bukan ke API gateway. Jadi URL publik diambil dari env khusus, dengan default
 * ke domain API yang dipakai semua app (lihat VITE_SUPABASE_URL di apps/*).
 */
const publicSupabaseUrl = (
	Deno.env.get("YUMI_PUBLIC_SUPABASE_URL") ?? "https://supabase.yumme.id"
).replace(/\/+$/, "");
const supabaseServiceRoleKey = Deno.env.get("YUMI_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceRoleKey) {
	throw new Error("Missing Supabase function secrets (YUMI_SUPABASE_URL / YUMI_SERVICE_ROLE_KEY)");
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
			// PostgREST menentukan role dari JWT di header Authorization, bukan dari
			// apikey. Tanpa ini query jalan sebagai `anon` dan tabel tanpa grant anon
			// (mis. yumi_sessions) balas 401 "permission denied".
			"Authorization": `Bearer ${supabaseServiceRoleKey}`,
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
			"Authorization": `Bearer ${supabaseServiceRoleKey}`,
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
			"Authorization": `Bearer ${supabaseServiceRoleKey}`,
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
			"Authorization": `Bearer ${supabaseServiceRoleKey}`,
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
			"Authorization": `Bearer ${supabaseServiceRoleKey}`,
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

/** Endpoint GoTrue non-admin (mis. /verify). */
async function gotruePublic(path: string, body: Record<string, unknown>) {
	const res = await fetch(`${gotrueUrl}/${path}`, {
		method: "POST",
		headers: {
			"apikey": supabaseServiceRoleKey,
			"Content-Type": "application/json",
			"Accept": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(`GoTrue ${path} failed (${res.status}): ${await res.text()}`);
	}
	return await res.json() as Record<string, unknown>;
}

/**
 * Terbitkan sesi Supabase Auth untuk user, tanpa perlu password.
 *
 * Caranya: minta magic link lewat admin API (ini TIDAK mengirim email — yang
 * mengirim email adalah endpoint /magiclink, bukan /admin/generate_link), lalu
 * tukar `hashed_token`-nya jadi access/refresh token lewat /verify.
 *
 * Versi lama memanggil POST /admin/sessions yang tidak pernah ada di GoTrue —
 * selalu 404, sehingga token Supabase selalu null dan seluruh app berjalan
 * sebagai `anon`.
 */
async function issueSupabaseSession(email: string) {
	const link = await gotrueAdmin("generate_link", { type: "magiclink", email });
	const hashedToken = link.hashed_token;
	if (typeof hashedToken !== "string" || !hashedToken) {
		throw new Error("GoTrue tidak mengembalikan hashed_token");
	}

	const session = await gotruePublic("verify", {
		type: "magiclink",
		token_hash: hashedToken,
	});

	return {
		accessToken: typeof session.access_token === "string" ? session.access_token : null,
		refreshToken: typeof session.refresh_token === "string" ? session.refresh_token : null,
	};
}
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
		const authUsers = await restQuery("yumi_users", "auth_user_id, email", {
			eq: { column: "source_id", value: user.source_id },
			limit: 1,
		});
		const userRecord = authUsers?.[0];
		const email = toTrimmedString(userRecord?.email);

		if (userRecord?.auth_user_id && email) {
			const session = await issueSupabaseSession(email);
			supabaseAccessToken = session.accessToken;
			supabaseRefreshToken = session.refreshToken;
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

/**
 * Ganti PIN. Wajib lewat sini, bukan UPDATE langsung dari browser:
 * `anon` tidak punya (dan tidak boleh punya) hak UPDATE atas yumi_users.
 *
 * Menulis home_pin_hash (bcrypt) DAN home_pin_fingerprint (SHA-256) sekaligus.
 * loginWithPin memprioritaskan bcrypt — kalau hanya fingerprint yang diperbarui
 * (perilaku hook lama), PIN baru akan ditolak saat login untuk user yang sudah
 * punya bcrypt hash. Fingerprint masih ditulis karena apps web/customer/pos
 * belum dipindah dan masih mencocokkannya; hapus kolom itu setelah mereka pindah.
 */
async function changePin(payload: JsonRecord) {
	const token = normalizeToken(payload.token);
	const newPin = normalizePin(payload.newPin);
	const oldPin = normalizePin(payload.oldPin);

	if (!/^\d{6}$/.test(newPin)) throw new Error("PIN baru harus 6 digit angka");

	const user = await requireSessionUser(
		token,
		"source_id, home_pin_hash, home_pin_fingerprint, is_active, raw",
	);

	// Kalau user sudah punya PIN, PIN lama wajib benar.
	const currentHash = user.home_pin_hash as string | null;
	const currentFingerprint = user.home_pin_fingerprint as string | null;
	if (currentHash || currentFingerprint) {
		if (!/^\d{6}$/.test(oldPin)) throw new Error("PIN lama wajib diisi");
		const oldValid = currentHash
			? await bcrypt.compare(oldPin, currentHash)
			: (await sha256Hex(oldPin)) === currentFingerprint;
		if (!oldValid) throw new Error("PIN lama salah");
		if (oldPin === newPin) throw new Error("PIN baru harus berbeda dari PIN lama");
	}

	const raw =
		user.raw && typeof user.raw === "object" && !Array.isArray(user.raw)
			? { ...(user.raw as JsonRecord), requiresPinChange: false }
			: { requiresPinChange: false };

	await restUpdate(
		"yumi_users",
		{
			home_pin_hash: await bcrypt.hash(newPin, 10),
			home_pin_fingerprint: await sha256Hex(newPin),
			raw,
		},
		"source_id",
		user.source_id,
	);

	return { success: true };
}

/** Ambil user dari token sesi, atau lempar error kalau sesi tidak sah. */
async function requireSessionUser(token: string, columns: string) {
	if (!token) throw new Error("Sesi tidak valid atau telah berakhir");

	const sessions = await restQuery("yumi_sessions", "token, user_source_id, expires_at", {
		eq: { column: "token", value: token },
		limit: 1,
	});
	const session = sessions?.[0];
	if (!session) throw new Error("Sesi tidak valid atau telah berakhir");

	if (Date.now() > new Date(session.expires_at).getTime()) {
		await restDelete("yumi_sessions", "token", token);
		throw new Error("Sesi telah berakhir, silakan login ulang");
	}

	const users = await restQuery("yumi_users", columns, {
		eq: { column: "source_id", value: session.user_source_id },
		limit: 1,
	});
	const user = users?.[0];
	if (!user || !user.is_active) throw new Error("User tidak ditemukan atau nonaktif");
	return user;
}

/** Upload foto profil ke storage pakai service role, kembalikan public URL. */
async function uploadProfilePhoto(sourceId: string, base64: string, contentType: string) {
	const allowed = ["image/jpeg", "image/png", "image/webp"];
	if (!allowed.includes(contentType)) {
		throw new Error("Format foto harus JPG, PNG, atau WEBP");
	}

	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	if (bytes.byteLength > 5 * 1024 * 1024) {
		throw new Error("Ukuran foto maksimal 5MB");
	}

	const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
	const path = `${sourceId}/${Date.now()}.${ext}`;

	const res = await fetch(`${supabaseUrl}/storage/v1/object/profile-photos/${path}`, {
		method: "POST",
		headers: {
			"apikey": supabaseServiceRoleKey,
			"Authorization": `Bearer ${supabaseServiceRoleKey}`,
			"Content-Type": contentType,
			"x-upsert": "true",
		},
		body: bytes,
	});
	if (!res.ok) {
		throw new Error(`Upload foto gagal (${res.status}): ${await res.text()}`);
	}

	return `${publicSupabaseUrl}/storage/v1/object/public/profile-photos/${path}`;
}

/**
 * Update profil karyawan. Wajib lewat sini: `anon` tidak punya hak UPDATE atas
 * yumi_users, jadi versi lama (UPDATE langsung dari browser) selalu gagal
 * "permission denied". Field sensitif seperti role, is_active, dan PIN sengaja
 * TIDAK bisa diubah lewat endpoint ini — user hanya boleh mengubah datanya sendiri.
 */
async function updateProfile(payload: JsonRecord) {
	const token = normalizeToken(payload.token);
	const user = await requireSessionUser(token, "source_id, is_active, raw");

	const updates: JsonRecord = {};
	const setIfString = (key: string, column: string) => {
		if (payload[key] === undefined) return;
		const value = toTrimmedString(payload[key]);
		if (value) updates[column] = value;
	};
	setIfString("name", "name");
	setIfString("username", "username");
	setIfString("slug", "slug");

	// Field bebas disimpan di kolom JSON `raw`, digabung dengan yang sudah ada.
	const rawFields = [
		"phone", "identityNumber", "address", "birthDate", "placeOfBirth",
		"emergencyContactName", "emergencyContactPhone", "bankName", "bankAccount",
		"startDate", "employmentType", "location",
	];
	const existingRaw =
		user.raw && typeof user.raw === "object" && !Array.isArray(user.raw)
			? { ...(user.raw as JsonRecord) }
			: {};
	let rawChanged = false;
	for (const field of rawFields) {
		if (payload[field] === undefined) continue;
		existingRaw[field] = payload[field];
		rawChanged = true;
	}
	if (rawChanged) updates.raw = existingRaw;

	// Foto: terima base64 dan upload di server, atau terima URL yang sudah jadi.
	let photoUrl: string | null = null;
	const photoBase64 = toTrimmedString(payload.photoBase64);
	if (photoBase64) {
		photoUrl = await uploadProfilePhoto(
			String(user.source_id),
			photoBase64,
			toTrimmedString(payload.photoContentType) || "image/jpeg",
		);
		updates.photo_url = photoUrl;
	} else if (payload.photoUrl !== undefined) {
		const value = toTrimmedString(payload.photoUrl);
		if (value) {
			photoUrl = value;
			updates.photo_url = value;
		}
	}

	if (Object.keys(updates).length === 0) return { success: true, photoUrl };

	await restUpdate("yumi_users", updates, "source_id", user.source_id);
	return { success: true, photoUrl };
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

		// Debug action
		if (action === "debug") {
			return json({
				supabaseUrl: supabaseUrl,
				supabaseUrlPrefix: supabaseUrl?.slice(0,30),
				keyPrefix: supabaseServiceRoleKey?.slice(0,20),
				keyLength: supabaseServiceRoleKey?.length,
			});
		}

		switch (action) {
			case "listPublicUsers":
				return json(await listPublicUsers());
			case "loginWithPin":
				return json(await loginWithPin(body));
			case "validateSession":
				return json(await validateSession(body));
			case "logoutSession":
				return json(await logoutSession(body));
			case "changePin":
				return json(await changePin(body));
			case "updateProfile":
				return json(await updateProfile(body));
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
