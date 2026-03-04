import ReactDOM from "react-dom/client";

import { ErrorBoundary } from "./components/error-boundary";

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

async function initApp(el: HTMLElement) {
	try {
		const [
			{ env },
			{ ConvexReactClient },
			{ ConvexBetterAuthProvider },
			{ createRouter, RouterProvider },
			{ authClient },
			{ default: Loader },
			{ routeTree },
		] = await Promise.all([
			import("@yumipos/env/web"),
			import("convex/react"),
			import("@convex-dev/better-auth/react"),
			import("@tanstack/react-router"),
			import("@/lib/auth-client"),
			import("./components/loader"),
			import("./routeTree.gen"),
		]);

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

		const root = ReactDOM.createRoot(el);
		root.render(
			<ErrorBoundary>
				<RouterProvider router={router} />
			</ErrorBoundary>
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";

		el.innerHTML = `
			<div style="padding: 2rem; font-family: system-ui, sans-serif; max-width: 600px; margin: 4rem auto;">
				<h1 style="font-size: 1.5rem; margin-bottom: 1rem; color: #dc2626;">
					Aplikasi gagal dimuat
				</h1>
				<p style="margin-bottom: 1rem; color: #374151;">
					Terjadi kesalahan saat memuat aplikasi. Pastikan file <code>.env</code> sudah dikonfigurasi dengan benar.
				</p>
				<details style="background: #f3f4f6; padding: 1rem; border-radius: 0.5rem;">
					<summary style="cursor: pointer; font-weight: 600;">Detail Error</summary>
					<pre style="margin-top: 0.5rem; white-space: pre-wrap; font-size: 0.875rem; color: #991b1b;">${message}</pre>
				</details>
				<button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #2563eb; color: white; border: none; border-radius: 0.375rem; cursor: pointer; font-size: 0.875rem;">
					Muat Ulang
				</button>
			</div>
		`;
	}
}

initApp(rootElement);
