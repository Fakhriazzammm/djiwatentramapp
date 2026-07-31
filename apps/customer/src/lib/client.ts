const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
	import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
	return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

// Shared components and customer routes must resolve to the same auth client.
export { createClient } from "@yumipos/web-shared/lib/client";
