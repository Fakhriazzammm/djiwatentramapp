import { createClient } from "./client";
import { invokeEdgeFunction } from "./api-helper";

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
	requiresPinChange?: boolean;
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
};

/**
 * Prefix token "local session" yang dulu dipakai sebagai fallback offline.
 * Sekarang hanya dipakai untuk MENOLAK token lama: isinya cuma base64 JSON
 * tanpa tanda tangan, jadi siapa pun bisa mengarang sesi (termasuk role admin)
 * lewat localStorage. Semua sesi wajib divalidasi ke server.
 */
const LEGACY_LOCAL_TOKEN_PREFIX = "local_yumi_session:";

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
	return invokeEdgeFunction<T>("yumi-auth", body);
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

const YUMI_USERS_CACHE_KEY = "yumi_users_cache";
const YUMI_USERS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const inFlightPromises = new Map<string, Promise<YumiPublicUser[]>>();

export async function listPublicYumiUsers({ forceRefresh }: { forceRefresh?: boolean } = {}) {
	// Check localStorage cache first (skip if forceRefresh)
	if (!forceRefresh && typeof window !== "undefined") {
		try {
			const cached = localStorage.getItem(YUMI_USERS_CACHE_KEY);
			if (cached) {
				const { data, timestamp } = JSON.parse(cached);
				if (Date.now() - timestamp < YUMI_USERS_CACHE_TTL) {
					return data as YumiPublicUser[];
				}
			}
		} catch {
			// Ignore parse errors, refetch
		}
	}

	// Dedup concurrent fetch — if a fetch is already in-flight, reuse the promise
	const dedupKey = "listPublicYumiUsers";
	const existing = inFlightPromises.get(dedupKey);
	if (existing) {
		return existing;
	}

	const promise = (async (): Promise<YumiPublicUser[]> => {
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
	})();

	inFlightPromises.set(dedupKey, promise);

	try {
		const result = await promise;

		// Cache result in localStorage
		if (typeof window !== "undefined") {
			try {
				localStorage.setItem(
					YUMI_USERS_CACHE_KEY,
					JSON.stringify({ data: result, timestamp: Date.now() })
				);
			} catch {
				// localStorage full or unavailable — ignore
			}
		}

		return result;
	} finally {
		inFlightPromises.delete(dedupKey);
	}
}

/**
 * Login dengan PIN. Verifikasi PIN HANYA dilakukan di server (edge function
 * `yumi-auth`), yang membandingkan bcrypt hash dan mencatat sesi di
 * `yumi_sessions`. Tidak ada fallback verifikasi di browser — dulu ada, tapi
 * itu mencocokkan SHA-256 PIN dari view publik lalu menerbitkan token buatan
 * sendiri, sehingga login bisa dilewati sepenuhnya dari sisi klien.
 */
export async function loginWithYumiPin(userId: string, pin: string) {
	if (!/^\d{6}$/.test(pin)) {
		throw new Error("PIN harus terdiri dari 6 digit angka");
	}

	const response = await invokeAuth<
		LoginResponse & {
			supabaseAccessToken?: string | null;
			supabaseRefreshToken?: string | null;
		}
	>({
		action: "loginWithPin",
		userId,
		pin,
	});

	if (!response?.token) {
		throw new Error("Login gagal: server tidak mengembalikan token sesi");
	}

	// Sesi Supabase Auth bersifat opsional — dipakai sebagai jalur cepat
	// validasi. Kegagalan di sini tidak membatalkan login.
	if (response.supabaseAccessToken && response.supabaseRefreshToken) {
		try {
			const supabase = createClient();
			await supabase.auth.setSession({
				access_token: response.supabaseAccessToken,
				refresh_token: response.supabaseRefreshToken,
			});
		} catch (sessionErr) {
			console.warn("[yumi-auth] Failed to set Supabase session:", sessionErr);
		}
	}

	return response;
}

/**
 * Validasi token sesi.
 *
 * Kontrak pemanggil penting:
 *  - `null`  → server memastikan sesi TIDAK valid (kedaluwarsa/dicabut/user
 *              nonaktif). Pemanggil harus menghapus sesi lokal.
 *  - throw   → gagal menghubungi/menjalankan validasi (offline, 5xx, dsb).
 *              Pemanggil TIDAK boleh menghapus sesi, cukup coba lagi nanti.
 */
export async function validateYumiSession(token: string) {
	// Token "local session" lawas tidak bertanda tangan → selalu tolak.
	if (token.startsWith(LEGACY_LOCAL_TOKEN_PREFIX)) {
		return null;
	}

	// Token yang diterima fungsi ini adalah custom Yumi token. Validasi langsung
	// ke server agar tidak melakukan request GoTrue /user redundan sesaat setelah
	// loginWithYumiPin() men-set Supabase session. Pemulihan Supabase session saat
	// custom token tidak ada ditangani terpisah oleh YumiAuthProvider.
	const data = await invokeAuth<{ session: YumiValidatedSession | null }>({
		action: "validateSession",
		token,
	});

	return data.session ?? null;
}

export async function logoutYumiSession(token: string) {
	// Selalu bersihkan sesi Supabase Auth, apa pun jenis tokennya.
	const signOutSupabase = async () => {
		try {
			const supabase = createClient();
			await supabase.auth.signOut();
		} catch {
			// Silent — token lokal sudah dihapus pemanggil.
		}
	};

	if (token.startsWith(LEGACY_LOCAL_TOKEN_PREFIX)) {
		await signOutSupabase();
		return;
	}

	await invokeAuth<{ success: boolean }>({
		action: "logoutSession",
		token,
	});

	await signOutSupabase();
}
