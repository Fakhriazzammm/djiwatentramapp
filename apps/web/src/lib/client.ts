import { createBrowserClient } from "@supabase/ssr";

let browserClient:
	| ReturnType<typeof createBrowserClient>
	| null = null;

export function createClient() {
	if (!browserClient) {
		browserClient = createBrowserClient(
			import.meta.env.VITE_SUPABASE_URL!,
			import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!
		);
	}

	return browserClient;
}
