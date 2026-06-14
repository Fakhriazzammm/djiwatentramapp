import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL =
	import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
	import.meta.env.VITE_SUPABASE_ANON_KEY

export function isSupabaseConfigured(): boolean {
	return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
	if (!browserClient) {
		browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
	}

	return browserClient;
}
