import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_AUTH_URL || "http://localhost:3000",
	plugins: [
		convexClient() as any,
	],
});
