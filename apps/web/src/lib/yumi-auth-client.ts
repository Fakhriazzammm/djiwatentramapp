import { createClient } from "@/lib/client";

export type YumiPublicUser = {
	_id: string;
	name: string;
	slug?: string;
	username?: string;
	initial: string;
	hasFace: boolean;
};

export type YumiSessionUser = {
	_id: string;
	name: string;
	username: string;
	slug?: string;
	roleId: string;
	hasFace: boolean;
};

export type YumiSessionRole = {
	_id?: string;
	name: string;
	permissions: string[];
};

export type YumiValidatedSession = {
	user: YumiSessionUser;
	role: YumiSessionRole;
	expiresAt: number;
};

type LoginResponse = {
	token: string;
	expiresAt: number;
	user: {
		_id: string;
		name: string;
		slug?: string;
		hasFace: boolean;
	};
};

type PublicUserRow = {
	_id: string;
	name: string;
	slug?: string | null;
	initial?: string | null;
	hasFace?: boolean | null;
	isActive?: boolean | null;
	username?: string | null;
	roleId?: string | null;
	roleName?: string | null;
	homePinFingerprint?: string | null;
};

async function sha256Hex(input: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const LOCAL_TOKEN_PREFIX = "local_yumi_session:";

function assertSupabaseConfig() {
	if (
		!import.meta.env.VITE_SUPABASE_URL ||
		!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
	) {
		throw new Error("Supabase auth belum dikonfigurasi");
	}
}

async function invokeAuth<T>(body: Record<string, unknown>) {
	assertSupabaseConfig();

	const supabase = createClient();
	const { data, error } = await supabase.functions.invoke("yumi-auth", {
		body,
	});

	if (error) {
		throw new Error(error.message || "Gagal memanggil auth service");
	}

	if (
		data &&
		typeof data === "object" &&
		"error" in data &&
		typeof data.error === "string"
	) {
		throw new Error(data.error);
	}

	return data as T;
}

function encodeLocalSession(session: YumiValidatedSession) {
	const json = JSON.stringify(session);
	const bytes = new TextEncoder().encode(json);
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
	return `${LOCAL_TOKEN_PREFIX}${btoa(binary)}`;
}

function decodeLocalSession(token: string) {
	if (!token.startsWith(LOCAL_TOKEN_PREFIX)) return null;

	try {
		const encoded = token.slice(LOCAL_TOKEN_PREFIX.length);
		const binary = atob(encoded);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		const json = new TextDecoder().decode(bytes);
		return JSON.parse(json) as YumiValidatedSession;
	} catch (error) {
		console.error("Failed to decode local Yumi session:", error);
		return null;
	}
}

async function fetchPublicUserById(userId: string) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_users_public")
		.select("*")
		.eq("_id", userId)
		.eq("isActive", true)
		.maybeSingle();

	if (error) {
		throw new Error(error.message || "Gagal memuat data pengguna");
	}

	return data as PublicUserRow | null;
}

async function fetchRoleById(roleId: string) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_staff_roles")
		.select("*")
		.eq("_id", roleId)
		.maybeSingle();

	if (error) {
		throw new Error(error.message || "Gagal memuat data role");
	}

	return data as
		| {
				_id: string;
				name: string;
				permissions: string[] | null;
		  }
		| null;
}

function mapPublicUsers(rows: PublicUserRow[]) {
	return rows
		.map((row) => {
			const name = String(row.name ?? "").trim();
			const username = String(row.username ?? "").trim();
			const fallbackInitial =
				name.charAt(0).toUpperCase() || username.charAt(0).toUpperCase() || "?";

			return {
				_id: String(row._id ?? ""),
				name,
				slug: row.slug ? String(row.slug) : undefined,
				username: username || undefined,
				initial: String(row.initial ?? (fallbackInitial || "?")),
				hasFace: Boolean(row.hasFace),
			} satisfies YumiPublicUser;
		})
		.filter((row: YumiPublicUser) => row._id && row.name);
}

async function fetchPublicUsersViaRestApi() {
	assertSupabaseConfig();

	const url = new URL("/rest/v1/pos_users_public", import.meta.env.VITE_SUPABASE_URL);
	url.searchParams.set(
		"select",
		"_id,name,slug,username,initial,hasFace,isActive,roleName"
	);
	url.searchParams.set("isActive", "eq.true");
	url.searchParams.set("order", "name.asc");

	const res = await fetch(url.toString(), {
		headers: {
			apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
			Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
		},
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || `REST API gagal (${res.status})`);
	}

	const data = (await res.json()) as PublicUserRow[];
	return mapPublicUsers(data ?? []);
}

export async function listPublicYumiUsers() {
	try {
		const supabase = createClient();
		const { data, error } = await supabase
			.from("pos_users_public")
			.select("_id,name,slug,username,initial,hasFace,isActive,roleName")
			.eq("isActive", true)
			.order("name", { ascending: true });

		if (error) {
			throw new Error(error.message || "Gagal memuat daftar pengguna");
		}

		const publicUsers = mapPublicUsers((data ?? []) as PublicUserRow[]);

		if (publicUsers.length > 0) {
			return publicUsers;
		}
	} catch (viewError) {
		console.warn(
			"[yumi-auth] listPublicUsers via pos_users_public failed, falling back to edge function",
			viewError
		);
	}

	try {
		const restUsers = await fetchPublicUsersViaRestApi();
		if (restUsers.length > 0) {
			return restUsers;
		}
	} catch (restError) {
		console.warn("[yumi-auth] listPublicUsers via REST API failed", restError);
	}

	try {
		const data = await invokeAuth<{ users: YumiPublicUser[] }>({
			action: "listPublicUsers",
		});
		return (data.users ?? []).filter((user) => {
			if (!user?._id || !user?.name) return false;
			return String(user.name).trim().toLowerCase() !== "admin";
		});
	} catch (invokeError) {
		console.warn("[yumi-auth] listPublicUsers edge function fallback failed", invokeError);
		throw new Error("Gagal memuat daftar pengguna");
	}
}

export async function loginWithYumiPin(userId: string, pin: string) {
	try {
		return await invokeAuth<LoginResponse>({
			action: "loginWithPin",
			userId,
			pin,
		});
	} catch (invokeError) {
		console.warn(
			"[yumi-auth] loginWithPin failed, falling back to public views",
			invokeError
		);

		if (!/^\d{6}$/.test(pin)) {
			throw new Error("PIN harus terdiri dari 6 digit angka");
		}

		const user = await fetchPublicUserById(userId);
		if (!user) {
			throw new Error("User tidak ditemukan atau nonaktif");
		}

		const fingerprint = user.homePinFingerprint;
		if (!fingerprint || fingerprint !== (await sha256Hex(pin))) {
			throw new Error("PIN yang Anda masukkan salah");
		}

		const role = user.roleId ? await fetchRoleById(user.roleId) : null;
		const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
		const session: YumiValidatedSession = {
			user: {
				_id: user._id,
				name: user.name ?? "",
				username: user.username ?? "",
				slug: user.slug ?? undefined,
				roleId: user.roleId ?? "",
				hasFace: Boolean(user.hasFace),
			},
			role: {
				_id: role?._id ?? user.roleId ?? "",
				name: role?.name ?? user.roleName ?? "staff",
				permissions:
					role && Array.isArray(role.permissions) ? role.permissions : [],
			},
			expiresAt,
		};

		return {
			token: encodeLocalSession(session),
			expiresAt,
			user: {
				_id: session.user._id,
				name: session.user.name,
				slug: session.user.slug,
				hasFace: session.user.hasFace,
			},
		};
	}
}

export async function validateYumiSession(token: string) {
	const localSession = decodeLocalSession(token);
	if (localSession) {
		if (Date.now() > localSession.expiresAt) {
			return null;
		}
		return localSession;
	}

	const data = await invokeAuth<{ session: YumiValidatedSession | null }>({
		action: "validateSession",
		token,
	});

	return data.session ?? null;
}

export async function logoutYumiSession(token: string) {
	if (token.startsWith(LOCAL_TOKEN_PREFIX)) {
		return;
	}

	await invokeAuth<{ success: boolean }>({
		action: "logoutSession",
		token,
	});
}
