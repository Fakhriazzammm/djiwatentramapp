import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const convexSiteUrl =
	import.meta.env.VITE_CONVEX_SITE_URL ??
	import.meta.env.VITE_CONVEX_URL?.replace(".convex.cloud", ".convex.site");

if (!convexSiteUrl) {
	console.warn(
		"[Auth] VITE_CONVEX_SITE_URL atau VITE_CONVEX_URL tidak ditemukan. Auth mungkin tidak berfungsi dengan benar."
	);
}

export const authClient = createAuthClient({
	baseURL: convexSiteUrl,
	plugins: [convexClient()],
});

export const { signIn, signUp, useSession } = authClient;
