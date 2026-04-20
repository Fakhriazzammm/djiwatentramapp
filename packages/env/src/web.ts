import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SUPABASE_URL: z.string().url().optional(),
		VITE_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
		// Mayar Payment Gateway
		VITE_MAYAR_API_BASE: z.string().url().optional(),
		VITE_MAYAR_AUTH_SCHEME: z.string().optional(),
		VITE_MAYAR_API_KEY: z.string().optional(),
		VITE_MAYAR_WEBTOKEN: z.string().optional(),
		VITE_MAYAR_DEFAULT_EMAIL: z.string().email().optional(),
		VITE_MAYAR_DEFAULT_MOBILE: z.string().optional(),
		VITE_APP_BASE_URL: z.string().url().optional(),
	},
	runtimeEnv: {
		VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
		VITE_SUPABASE_PUBLISHABLE_KEY:
			import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
		VITE_MAYAR_API_BASE: import.meta.env.VITE_MAYAR_API_BASE,
		VITE_MAYAR_AUTH_SCHEME: import.meta.env.VITE_MAYAR_AUTH_SCHEME,
		VITE_MAYAR_API_KEY: import.meta.env.VITE_MAYAR_API_KEY,
		VITE_MAYAR_WEBTOKEN: import.meta.env.VITE_MAYAR_WEBTOKEN,
		VITE_MAYAR_DEFAULT_EMAIL: import.meta.env.VITE_MAYAR_DEFAULT_EMAIL,
		VITE_MAYAR_DEFAULT_MOBILE: import.meta.env.VITE_MAYAR_DEFAULT_MOBILE,
		VITE_APP_BASE_URL: import.meta.env.VITE_APP_BASE_URL,
	},
	emptyStringAsUndefined: true,
});
