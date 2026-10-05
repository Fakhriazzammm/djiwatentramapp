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
	| "createAuthUser"
	| "getPrivateProfile"
	| "getProfileCompleteness"
	| "getSessionUser"
	| "verifyHomePin"
	| "verifyAttendanceIdentity"
	| "enrollFace"
	| "createUser"
	| "updateUser"
	| "deleteUser"
	| "bindUserProfile"
	| "checkRoleAssignment";

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
	const { user: caller, role } = await requireSessionContext(token);
	const targetId = normalizeUserId(payload.sourceId) || String(caller.source_id);
	const isAdmin = hasUsersManagePermission(role);
	if (targetId !== String(caller.source_id) && !isAdmin) {
		throw new Error("Tidak berhak mengubah profil user lain");
	}
	let user: any = caller;
	if (targetId !== String(caller.source_id)) {
		const rows = await restQuery("yumi_users", "source_id,is_active,raw", {
			eq: { column: "source_id", value: targetId }, limit: 1,
		});
		user = rows?.[0];
	}
	if (!user || !user.is_active) throw new Error("User tidak ditemukan atau nonaktif");

	const updates: JsonRecord = {};
	const setIfString = (key: string, column: string) => {
		if (payload[key] === undefined) return;
		const value = toTrimmedString(payload[key]);
		if (value) updates[column] = value;
	};
	setIfString("name", "name");
	setIfString("username", "username");
	setIfString("slug", "slug");

	const rawFields = [
		"phone", "identityNumber", "address", "birthDate", "placeOfBirth",
		"emergencyContactName", "emergencyContactPhone", "bankName", "bankAccount",
	];
	const existingRaw = asRecord(user.raw);
	const nextRaw: JsonRecord = { ...existingRaw };
	let rawChanged = false;
	for (const field of rawFields) {
		if (payload[field] === undefined) continue;
		const value = toTrimmedString(payload[field]);
		if (!value) continue;
		nextRaw[field] = value;
		rawChanged = true;
	}
	if (rawChanged) updates.raw = nextRaw;

	let photoUrl: string | null = null;
	const photoBase64 = toTrimmedString(payload.photoBase64);
	if (photoBase64) {
		photoUrl = await uploadProfilePhoto(String(user.source_id), photoBase64, toTrimmedString(payload.photoContentType) || "image/jpeg");
		updates.photo_url = photoUrl;
	} else if (payload.photoUrl !== undefined) {
		const value = toTrimmedString(payload.photoUrl);
		if (value) { photoUrl = value; updates.photo_url = value; }
	}
	if (Object.keys(updates).length === 0) return { success: true, photoUrl };
	await restUpdate("yumi_users", updates, "source_id", String(user.source_id));
	return { success: true, photoUrl };
}

async function logoutSession(payload: JsonRecord) {
	const token = normalizeToken(payload.token);
	if (!token) return { success: true };

	await restDelete("yumi_sessions", "token", token);

	return { success: true };
}

const PRIVATE_PROFILE_FIELDS = [
	"phone", "identityNumber", "address", "birthDate", "placeOfBirth",
	"emergencyContactName", "emergencyContactPhone", "bankName", "bankAccount",
] as const;

const PROFILE_COMPLETENESS_FIELDS = [
	{ key: "phone", label: "Nomor HP" },
	{ key: "identityNumber", label: "Nomor identitas" },
	{ key: "address", label: "Alamat" },
	{ key: "birthDate", label: "Tanggal lahir" },
	{ key: "placeOfBirth", label: "Tempat lahir" },
	{ key: "emergencyContactName", label: "Nama kontak darurat" },
	{ key: "emergencyContactPhone", label: "Telepon kontak darurat" },
	{ key: "bankName", label: "Nama bank" },
	{ key: "bankAccount", label: "Nomor rekening" },
] as const;

// Unknown roles fail closed until HR explicitly classifies them as employees.
const HUMAN_EMPLOYEE_ROLE_NAMES = new Set([
	"barista", "chef", "kasir", "manager", "waiters", "waiter", "waitress",
	"kitchen", "supervisor", "hrd", "staff",
]);

function asRecord(value: unknown): JsonRecord {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as JsonRecord
		: {};
}

function normalizedRoleName(value: unknown) {
	return toTrimmedString(value).toLowerCase().replace(/\s+/g, " ");
}

async function getRoleForUser(roleSourceId: unknown) {
	const roleId = toTrimmedString(roleSourceId);
	if (!roleId) return null;
	const rows = await restQuery("yumi_roles", "source_id,name,permissions", {
		eq: { column: "source_id", value: roleId },
		limit: 1,
	});
	return rows?.[0] ?? null;
}

function hasUsersManagePermission(role: any) {
	const name = normalizedRoleName(role?.name);
	const permissions = asStringArray(role?.permissions).map((permission) => permission.trim().toLowerCase());
	return ["admin", "administrator", "owner", "superadmin", "super admin"].includes(name)
		|| permissions.includes("users:manage");
}

async function requireSessionContext(token: string) {
	const user = await requireSessionUser(
		token,
		"source_id,name,slug,username,email,employee_nip,role_source_id,is_active,raw,auth_user_id",
	);
	const role = await getRoleForUser(user.role_source_id);
	return { user, role };
}

async function getLinkedOnboardingApplication(user: any) {
	const selected = "id,status,approved_user_source_id,phone,identity_number,address,birth_date,birth_place,emergency_contact,employment,employee_nip";
	const raw = asRecord(user.raw);
	const linkedId = toTrimmedString(raw.onboardingApplicationId);
	if (linkedId) {
		const rows = await restQuery("employee_onboarding_applications", selected, {
			eq: { column: "id", value: linkedId },
			limit: 1,
		});
		const application = rows?.[0];
		if (application && String(application.approved_user_source_id ?? "") === String(user.source_id)) return application;
	}
	const rows = await restQuery("employee_onboarding_applications", selected, {
		eq: { column: "approved_user_source_id", value: user.source_id },
		limit: 1,
	});
	return rows?.[0] ?? null;
}

function resolvePrivateFields(user: any, application: any) {
	const legacyRaw = asRecord(user.raw);
	const emergency = asRecord(application?.emergency_contact);
	const onboarding: Record<string, unknown> = {
		phone: application?.phone,
		identityNumber: application?.identity_number,
		address: application?.address,
		birthDate: application?.birth_date,
		placeOfBirth: application?.birth_place,
		emergencyContactName: emergency.name,
		emergencyContactPhone: emergency.phone,
	};
	const values: JsonRecord = {};
	for (const key of PRIVATE_PROFILE_FIELDS) {
		const appValue = onboarding[key];
		const legacyValue = legacyRaw[key];
		values[key] = typeof appValue === "string" && appValue.trim()
			? appValue.trim()
			: typeof legacyValue === "string" && legacyValue.trim()
				? legacyValue.trim()
				: null;
	}
	return values;
}

function resolveEmployment(user: any, role: any, application: any) {
	const applicationEmployment = asRecord(application?.employment);
	const legacyRaw = asRecord(user.raw);
	const employment: JsonRecord = {};
	for (const key of ["roleName", "startDate", "employmentType", "location"]) {
		const appValue = applicationEmployment[key];
		const legacyValue = legacyRaw[key];
		employment[key] = typeof appValue === "string" && appValue.trim()
			? appValue.trim()
			: typeof legacyValue === "string" && legacyValue.trim()
				? legacyValue.trim()
				: key === "roleName" ? toTrimmedString(role?.name) || null : null;
	}
	return employment;
}

async function getPrivateProfile(payload: JsonRecord) {
	const token = normalizeToken(payload.token);
	const { user: caller, role: callerRole } = await requireSessionContext(token);
	const routeIdentifier = normalizeUserId(payload.slug);
	let user = caller;
	let role = callerRole;
	const isCallerProfile = !routeIdentifier || [caller.slug, caller.source_id, caller.username]
		.some((value) => String(value ?? "") === routeIdentifier);
	if (!isCallerProfile) {
		if (!hasUsersManagePermission(callerRole)) throw new Error("Profil tidak sesuai dengan sesi aktif");
		let matched: any = null;
		for (const column of ["slug", "source_id", "username"]) {
			const rows = await restQuery("yumi_users", "source_id,name,slug,username,email,employee_nip,role_source_id,is_active,raw,auth_user_id", {
				eq: { column, value: routeIdentifier }, limit: 1,
			});
			if (rows?.[0]) { matched = rows[0]; break; }
		}
		if (!matched || !matched.is_active) throw new Error("Profil tidak ditemukan atau nonaktif");
		user = matched;
		role = await getRoleForUser(user.role_source_id);
	}
	const application = await getLinkedOnboardingApplication(user);
	return {
		profile: {
			_id: String(user.source_id),
			name: toTrimmedString(user.name),
			slug: toTrimmedString(user.slug),
			username: toTrimmedString(user.username),
			email: toTrimmedString(user.email) || null,
			employeeNip: toTrimmedString(user.employee_nip) || toTrimmedString(application?.employee_nip) || null,
			roleName: toTrimmedString(role?.name) || toTrimmedString(asRecord(user.raw).roleName) || null,
			hasAuthUser: Boolean(user.auth_user_id),
			raw: resolvePrivateFields(user, application),
			employment: resolveEmployment(user, role, application),
			applicationStatus: toTrimmedString(application?.status) || null,
		},
	};
}

async function getProfileCompleteness(payload: JsonRecord) {
	const token = normalizeToken(payload.token);
	const { role } = await requireSessionContext(token);
	if (!hasUsersManagePermission(role)) throw new Error("Akses admin diperlukan");
	const users = await restQuery("yumi_users", "source_id,name,slug,role_source_id,raw", {
		eq: { column: "is_active", value: true },
	});
	const roleIds = [...new Set((users ?? []).map((user: any) => toTrimmedString(user.role_source_id)).filter(Boolean))];
	const roles = await Promise.all(roleIds.map((roleId) => getRoleForUser(roleId)));
	const roleById = new Map(roles.filter(Boolean).map((item: any) => [String(item.source_id), item]));
	const eligibleUsers = (users ?? []).filter((user: any) => HUMAN_EMPLOYEE_ROLE_NAMES.has(
		normalizedRoleName(roleById.get(String(user.role_source_id))?.name),
	));
	const profiles = await Promise.all(eligibleUsers.map(async (user: any) => {
		const application = await getLinkedOnboardingApplication(user);
		const fields = resolvePrivateFields(user, application);
		const missingFields = PROFILE_COMPLETENESS_FIELDS
			.filter(({ key }) => !toTrimmedString(fields[key]))
			.map(({ label }) => label);
		return {
			sourceId: String(user.source_id),
			name: toTrimmedString(user.name),
			slug: toTrimmedString(user.slug),
			completionPercent: Math.round(((PROFILE_COMPLETENESS_FIELDS.length - missingFields.length) / PROFILE_COMPLETENESS_FIELDS.length) * 100),
			missingFields,
		};
	}));
	profiles.sort((a, b) => a.name.localeCompare(b.name));
	return { profiles };
}

async function handleUpdateEmail(payload: JsonRecord) {
	const token = normalizeToken(payload.token);
	const { user: caller, role } = await requireSessionContext(token);
	const targetId = normalizeUserId(payload.userId) || String(caller.source_id);
	if (targetId !== String(caller.source_id) && !hasUsersManagePermission(role)) throw new Error("Tidak berhak mengubah email user lain");
	const newEmail = normalizeToken(payload.newEmail).toLowerCase();
	if (!newEmail) throw new Error("Email wajib diisi");
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error("Format email tidak valid");
	const users = await restQuery("yumi_users", "auth_user_id,is_active", { eq: { column: "source_id", value: targetId }, limit: 1 });
	const user = users?.[0];
	if (!user || !user.is_active) throw new Error("User tidak ditemukan atau nonaktif");
	if (!user.auth_user_id) throw new Error("User tidak memiliki Supabase Auth account");
	await gotrueAdmin(`users/${user.auth_user_id}`, { email: newEmail, email_confirm: true });
	await restUpdate("yumi_users", { email: newEmail }, "source_id", targetId);
	return { success: true };
}

async function handleCreateAuthUser(payload: JsonRecord) {
	const token = normalizeToken(payload.token);
	const { user: caller, role } = await requireSessionContext(token);
	const sourceId = normalizeUserId(payload.sourceId) || String(caller.source_id);
	if (sourceId !== String(caller.source_id) && !hasUsersManagePermission(role)) throw new Error("Tidak berhak membuat akun user lain");
	const email = normalizeToken(payload.email).toLowerCase();
	const password = normalizeToken(payload.password);
	const name = toTrimmedString(payload.name);
	if (!email || !password) throw new Error("Email dan password wajib");
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Format email tidak valid");
	const existing = await restQuery("yumi_users", "source_id,is_active,auth_user_id", { eq: { column: "source_id", value: sourceId }, limit: 1 });
	if (!existing?.[0] || !existing[0].is_active) throw new Error("User tidak ditemukan atau nonaktif");
	if (existing[0].auth_user_id) throw new Error("User sudah memiliki akun login");
	const data = await gotrueAdmin("users", {
		email,
		password,
		email_confirm: true,
		user_metadata: { source_id: sourceId, name },
	}) as any;
	const authUserId = data.user?.id ?? data.id;
	if (!authUserId) throw new Error("Pembuatan akun login gagal");
	await restUpdate("yumi_users", { auth_user_id: authUserId, email }, "source_id", sourceId);
	return { authUserId };
}

async function handleBackfillAuthUsers(payload: JsonRecord) {
	const token = normalizeToken(payload.token);
	const { role } = await requireSessionContext(token);
	if (!hasUsersManagePermission(role)) throw new Error("Akses admin diperlukan");
	const users = await restQuery("yumi_users", "source_id,username,name,raw", { eq: { column: "auth_user_id", value: null } });
	if (!users?.length) return { message: "Semua user sudah punya auth_user_id", count: 0 };
	const allAuthUsers = await gotrueAdmin("users") as any;
	const authBySourceId = new Map<string, string>();
	for (const authUser of allAuthUsers?.users ?? []) {
		const sourceId = authUser.user_metadata?.source_id;
		if (sourceId) authBySourceId.set(sourceId, authUser.id);
	}
	let created = 0;
	const details: string[] = [];
	for (const user of users) {
		try {
			const authUserId = authBySourceId.get(user.source_id);
			if (!authUserId) { details.push(`${user.username}: tidak ditemukan di auth.users, skip`); continue; }
			await restUpdate("yumi_users", { auth_user_id: authUserId }, "source_id", user.source_id);
			created++;
			details.push(`${user.username}: mapped`);
		} catch (error: any) { details.push(`${user.username}: ${error.message}`); }
	}
	return { message: `Backfill selesai: ${created} user`, details };
}

function normalizeFaceDescriptor(value: unknown) {
	if (!Array.isArray(value) || value.length < 2 || value.length > 2048) return null;
	const descriptor = value.map((item) => typeof item === "number" ? item : NaN);
	return descriptor.every((item) => Number.isFinite(item) && Math.abs(item) <= 10) ? descriptor : null;
}

function faceDistance(a: number[], b: number[]) {
	if (a.length !== b.length) return Infinity;
	let sum = 0;
	for (let index = 0; index < a.length; index++) {
		const difference = a[index] - b[index];
		sum += difference * difference;
	}
	return Math.sqrt(sum);
}

async function requireTargetUser(payload: JsonRecord, options: { adminOnly?: boolean } = {}) {
	const { user: caller, role } = await requireSessionContext(normalizeToken(payload.token));
	const requestedId = normalizeUserId(payload.userId ?? payload.sourceId ?? payload.id);
	const targetId = requestedId || String(caller.source_id);
	const admin = hasUsersManagePermission(role);
	if (options.adminOnly && !admin) throw new Error("Akses admin diperlukan");
	if (targetId !== String(caller.source_id) && !admin) throw new Error("Tidak berhak mengakses user lain");
	if (targetId === String(caller.source_id)) {
		const rows = await restQuery("yumi_users", "source_id,name,username,email,slug,role_source_id,is_active,home_pin_hash,home_pin_fingerprint,face_descriptor,raw,auth_user_id", {
			eq: { column: "source_id", value: targetId }, limit: 1,
		});
		const target = rows?.[0];
		if (!target || !target.is_active) throw new Error("User tidak ditemukan atau nonaktif");
		return { caller, role, target, admin };
	}
	const rows = await restQuery("yumi_users", "source_id,name,username,email,slug,role_source_id,is_active,home_pin_hash,home_pin_fingerprint,face_descriptor,raw,auth_user_id", {
		eq: { column: "source_id", value: targetId }, limit: 1,
	});
	const target = rows?.[0];
	if (!target || !target.is_active) throw new Error("User tidak ditemukan atau nonaktif");
	return { caller, role, target, admin };
}

async function verifyPinForUser(user: any, pin: string) {
	if (!/^\\d{6}$/.test(pin)) return false;
	if (user.home_pin_hash) return bcrypt.compare(pin, String(user.home_pin_hash));
	return Boolean(user.home_pin_fingerprint) && (await sha256Hex(pin)) === String(user.home_pin_fingerprint);
}

async function getSessionUserAction(payload: JsonRecord) {
	return validateSession(payload);
}

async function verifyHomePinAction(payload: JsonRecord) {
	const { target } = await requireTargetUser(payload);
	const pin = normalizePin(payload.pinCode ?? payload.pin);
	if (!(await verifyPinForUser(target, pin))) throw new Error("PIN tidak valid atau pengguna tidak aktif");
	const role = await getRoleForUser(target.role_source_id);
	return { userId: String(target.source_id), name: toTrimmedString(target.name), role: toTrimmedString(role?.name) || "user" };
}

async function verifyAttendanceIdentityAction(payload: JsonRecord) {
	const { target } = await requireTargetUser(payload);
	const pin = normalizePin(payload.pinCode);
	const descriptor = normalizeFaceDescriptor(payload.faceDescriptor);
	if (!pin && !descriptor) throw new Error("Verifikasi identitas diperlukan: PIN atau wajah");
	const pinVerified = pin ? await verifyPinForUser(target, pin) : false;
	const raw = asRecord(target.raw);
	const stored = normalizeFaceDescriptor(target.face_descriptor) ?? normalizeFaceDescriptor(raw.faceDescriptor);
	const faceVerified = descriptor && stored ? faceDistance(descriptor, stored) <= 0.6 : false;
	if (!pinVerified && !faceVerified) throw new Error("Verifikasi identitas gagal: PIN atau wajah tidak cocok");
	return { userId: String(target.source_id), pinVerified, faceVerified };
}

async function enrollFaceAction(payload: JsonRecord) {
	const { target, admin } = await requireTargetUser(payload);
	const descriptor = normalizeFaceDescriptor(payload.faceDescriptor);
	if (!descriptor) throw new Error("Data pendaftaran wajah tidak valid");
	const skipPinVerification = Boolean(payload.skipPinVerification);
	if (skipPinVerification && !admin) throw new Error("Akses admin diperlukan untuk melewati verifikasi PIN");
	if (!skipPinVerification && !(await verifyPinForUser(target, normalizePin(payload.pin)))) {
		throw new Error("PIN salah. Pendaftaran wajah dibatalkan.");
	}
	const raw = { ...asRecord(target.raw), faceDescriptor: descriptor };
	await restUpdate("yumi_users", { face_descriptor: descriptor, raw }, "source_id", String(target.source_id));
	return { success: true, userId: String(target.source_id) };
}

const ADMIN_RAW_FIELDS = new Set([
	"phone", "identityNumber", "address", "birthDate", "placeOfBirth",
	"emergencyContactName", "emergencyContactPhone", "bankName", "bankAccount",
	"requiresPinChange", "roleName",
]);

function allowlistedRaw(payload: JsonRecord, existing: unknown = {}) {
	const raw = { ...asRecord(existing) };
	for (const key of ADMIN_RAW_FIELDS) {
		if (payload[key] !== undefined && key !== "requiresPinChange") raw[key] = toTrimmedString(payload[key]);
		if (key === "requiresPinChange" && payload[key] !== undefined) raw[key] = Boolean(payload[key]);
	}
	return raw;
}

async function requireRole(roleId: string) {
	if (!roleId || !(await getRoleForUser(roleId))) throw new Error("Role tidak ditemukan");
}

async function createUserAction(payload: JsonRecord) {
	await requireTargetUser(payload, { adminOnly: true });
	const username = toTrimmedString(payload.username).toLowerCase();
	const name = toTrimmedString(payload.name);
	const roleId = toTrimmedString(payload.roleId);
	if (!username || !name || !roleId) throw new Error("Data user tidak lengkap");
	await requireRole(roleId);
	const existing = await restQuery("yumi_users", "source_id", { eq: { column: "username", value: username }, limit: 1 });
	if (existing?.[0]) throw new Error("Username sudah digunakan");
	const sourceId = `user_${crypto.randomUUID().replaceAll("-", "")}`;
	const homePin = normalizePin(payload.homePin);
	if (homePin && !/^\\d{6}$/.test(homePin)) throw new Error("PIN harus 6 digit angka");
	const email = toTrimmedString(payload.email).toLowerCase();
	await restInsert("yumi_users", {
		source_id: sourceId, username, name, slug: toTrimmedString(payload.slug) || username.split("@")[0],
		role_source_id: roleId, is_active: true,
		receive_report_emails: Boolean(payload.receiveReportEmails), auth_user_id: null,
		email: email || null,
		home_pin_hash: homePin ? await bcrypt.hash(homePin, 10) : null,
		home_pin_fingerprint: homePin ? await sha256Hex(homePin) : null,
		raw: allowlistedRaw(payload, {}),
	});
	return { sourceId };
}

async function updateUserAction(payload: JsonRecord) {
	const { target } = await requireTargetUser(payload, { adminOnly: true });
	const updates: JsonRecord = {};
	if (payload.username !== undefined) updates.username = toTrimmedString(payload.username).toLowerCase();
	if (payload.name !== undefined) updates.name = toTrimmedString(payload.name);
	if (payload.slug !== undefined) updates.slug = toTrimmedString(payload.slug) || null;
	if (payload.roleId !== undefined) {
		const roleId = toTrimmedString(payload.roleId);
		await requireRole(roleId);
		updates.role_source_id = roleId;
	}
	if (payload.isActive !== undefined) updates.is_active = Boolean(payload.isActive);
	if (payload.receiveReportEmails !== undefined) updates.receive_report_emails = Boolean(payload.receiveReportEmails);
	if (payload.homePin !== undefined) {
		const pin = normalizePin(payload.homePin);
		if (pin && !/^\\d{6}$/.test(pin)) throw new Error("PIN harus 6 digit angka");
		updates.home_pin_hash = pin ? await bcrypt.hash(pin, 10) : null;
		updates.home_pin_fingerprint = pin ? await sha256Hex(pin) : null;
	}
	if (payload.faceDescriptor !== undefined) {
		const descriptor = normalizeFaceDescriptor(payload.faceDescriptor);
		updates.face_descriptor = descriptor;
		updates.raw = { ...allowlistedRaw(payload, target.raw), ...(descriptor ? { faceDescriptor: descriptor } : {}) };
	} else {
		const raw = allowlistedRaw(payload, target.raw);
		if (JSON.stringify(raw) !== JSON.stringify(asRecord(target.raw))) updates.raw = raw;
	}
	if (!Object.keys(updates).length) throw new Error("Tidak ada perubahan user");
	await restUpdate("yumi_users", updates, "source_id", String(target.source_id));
	return { sourceId: String(target.source_id) };
}

async function deleteUserAction(payload: JsonRecord) {
	const { target, caller } = await requireTargetUser(payload, { adminOnly: true });
	if (String(target.source_id) === String(caller.source_id)) throw new Error("Tidak dapat menghapus user sendiri");
	await restDelete("yumi_users", "source_id", String(target.source_id));
	return { sourceId: String(target.source_id) };
}

async function bindUserProfileAction(payload: JsonRecord) {
	await requireTargetUser(payload, { adminOnly: true });
	const authUserId = toTrimmedString(payload.authUserId);
	const email = toTrimmedString(payload.email).toLowerCase();
	const name = toTrimmedString(payload.name);
	if (!authUserId || !email || !name) throw new Error("Data profil tidak lengkap");
	const authUser = await gotrueAdmin(`users/${encodeURIComponent(authUserId)}`);
	if (!authUser?.id || String(authUser.id) !== authUserId) throw new Error("Auth user tidak ditemukan");
	const byAuth = await restQuery("yumi_users", "source_id", { eq: { column: "auth_user_id", value: authUserId }, limit: 1 });
	if (byAuth?.[0]) return { sourceId: String(byAuth[0].source_id) };
	const byEmail = await restQuery("yumi_users", "source_id", { eq: { column: "username", value: email }, limit: 1 });
	if (byEmail?.[0]) {
		await restUpdate("yumi_users", { auth_user_id: authUserId, email }, "source_id", String(byEmail[0].source_id));
		return { sourceId: String(byEmail[0].source_id) };
	}
	const roleId = toTrimmedString(payload.roleId);
	await requireRole(roleId);
	const sourceId = `user_${crypto.randomUUID().replaceAll("-", "")}`;
	await restInsert("yumi_users", { source_id: sourceId, username: email, email, name, role_source_id: roleId, auth_user_id: authUserId, is_active: true, receive_report_emails: false, raw: {} });
	return { sourceId };
}

async function checkRoleAssignmentAction(payload: JsonRecord) {
	await requireTargetUser(payload, { adminOnly: true });
	const roleId = toTrimmedString(payload.roleId);
	await requireRole(roleId);
	const rows = await restQuery("yumi_users", "source_id", { eq: { column: "role_source_id", value: roleId }, limit: 1 });
	return { assigned: Boolean(rows?.[0]) };
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
			case "changePin":
				return json(await changePin(body));
			case "updateProfile":
				return json(await updateProfile(body));
			case "getPrivateProfile":
				return json(await getPrivateProfile(body));
			case "getProfileCompleteness":
				return json(await getProfileCompleteness(body));
			case "getSessionUser":
				return json(await getSessionUserAction(body));
			case "verifyHomePin":
				return json(await verifyHomePinAction(body));
			case "verifyAttendanceIdentity":
				return json(await verifyAttendanceIdentityAction(body));
			case "enrollFace":
				return json(await enrollFaceAction(body));
			case "createUser":
				return json(await createUserAction(body));
			case "updateUser":
				return json(await updateUserAction(body));
			case "deleteUser":
				return json(await deleteUserAction(body));
			case "bindUserProfile":
				return json(await bindUserProfileAction(body));
			case "checkRoleAssignment":
				return json(await checkRoleAssignmentAction(body));
			case "updateEmail":
				return json(await handleUpdateEmail(body));
			case "backfillAuthUsers":
				return json(await handleBackfillAuthUsers(body));
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
