import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * In-memory storage — never reads/writes localStorage/cookies.
 * This avoids stale session tokens from previous logins (the old
 * @supabase/ssr client may have left session data in localStorage
 * that would override the anon key and cause 403 errors).
 */
function createMemoryStorage() {
	const store = new Map<string, string>();
	return {
		getItem: async (key: string) => store.get(key) ?? null,
		setItem: async (key: string, value: string) => { store.set(key, value); },
		removeItem: async (key: string) => { store.delete(key); },
	};
}

let browserClient: SupabaseClient | null = null;

export function createClient() {
	if (!browserClient) {
		browserClient = createSupabaseClient(
			import.meta.env.VITE_SUPABASE_URL!,
			import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
			{
				auth: {
					persistSession: false,
					autoRefreshToken: false,
					detectSessionInUrl: false,
					storage: createMemoryStorage(),
				},
			}
		);
	}

	return browserClient;
}
