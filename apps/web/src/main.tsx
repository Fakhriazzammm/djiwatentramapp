import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { env } from "@tkmpos/env/web";
import { ConvexReactClient } from "convex/react";
import ReactDOM from "react-dom/client";

import { authClient } from "@/lib/auth-client";

import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";

const convex = new ConvexReactClient(env.VITE_CONVEX_URL);

const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	defaultPendingComponent: () => <Loader />,
	context: {},
	Wrap({ children }: { children: React.ReactNode }) {
		return (
			<ConvexBetterAuthProvider authClient={authClient} client={convex}>
				{children}
			</ConvexBetterAuthProvider>
		);
	},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(<RouterProvider router={router} />);
}
