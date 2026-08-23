import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SUPABASE_URL: z.string().url().optional(),
		VITE_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
		VITE_APP_BASE_URL: z.string().url().optional(),
	},
	runtimeEnv: {
		VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
		VITE_SUPABASE_PUBLISHABLE_KEY:
			import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
		VITE_APP_BASE_URL: import.meta.env.VITE_APP_BASE_URL,
	},
	emptyStringAsUndefined: true,
});
