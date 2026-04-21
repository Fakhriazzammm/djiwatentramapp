import { createClient } from "@/lib/client";

export type YumiPublicUser = {
	_id: string;
	name: string;
	slug?: string;
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
	raw?: Record<string, unknown> | null;
};

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

export async function listPublicYumiUsers() {
	try {
		const data = await invokeAuth<{ users: YumiPublicUser[] }>({
			action: "listPublicUsers",
		});
		return data.users ?? [];
	} catch (invokeError) {
		console.warn(
			"[yumi-auth] listPublicUsers failed, falling back to pos_users_public",
			invokeError
		);

		const supabase = createClient();
		const { data, error } = await supabase
			.from("pos_users_public")
			.select("_id,name,slug,initial,hasFace,isActive")
			.eq("isActive", true)
			.order("name", { ascending: true });

		if (error) {
			throw new Error(error.message || "Gagal memuat daftar pengguna");
		}

		return (data ?? []).map((row: any) => ({
			_id: String(row._id ?? ""),
			name: String(row.name ?? ""),
			slug: row.slug ? String(row.slug) : undefined,
			initial: String(row.initial ?? "?"),
			hasFace: Boolean(row.hasFace),
		}));
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

		const homePin =
			typeof user.raw?.homePin === "string" ? user.raw.homePin.trim() : "";
		if (!homePin || homePin !== pin) {
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
