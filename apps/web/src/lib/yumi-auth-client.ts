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

export async function listPublicYumiUsers() {
	const data = await invokeAuth<{ users: YumiPublicUser[] }>({
		action: "listPublicUsers",
	});

	return data.users ?? [];
}

export async function loginWithYumiPin(userId: string, pin: string) {
	return await invokeAuth<LoginResponse>({
		action: "loginWithPin",
		userId,
		pin,
	});
}

export async function validateYumiSession(token: string) {
	const data = await invokeAuth<{ session: YumiValidatedSession | null }>({
		action: "validateSession",
		token,
	});

	return data.session ?? null;
}

export async function logoutYumiSession(token: string) {
	await invokeAuth<{ success: boolean }>({
		action: "logoutSession",
		token,
	});
}
