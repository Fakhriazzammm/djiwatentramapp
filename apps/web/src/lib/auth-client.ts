import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_CONVEX_URL?.replace(
		".convex.cloud",
		".convex.site"
	),
	plugins: [convexClient()],
});

export const { signIn, signUp, useSession } = authClient;
