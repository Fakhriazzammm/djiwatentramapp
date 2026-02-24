import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import { CartProvider } from "@/context/cart-context";
import "../index.css";

// Using an interface instead of a type alias with {} to satisfy Biome
export interface RouterAppContext {
	// Optional properties to satisfy "no banned types" while keeping it flexible
	auth?: unknown;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	errorComponent: ({ error }) => (
		<div
			style={{
				padding: "2rem",
				fontFamily: "system-ui, sans-serif",
				maxWidth: "600px",
				margin: "4rem auto",
			}}
		>
			<h1
				style={{ fontSize: "1.5rem", marginBottom: "1rem", color: "#dc2626" }}
			>
				Terjadi Kesalahan
			</h1>
			<p style={{ marginBottom: "1rem", color: "#374151" }}>
				Halaman tidak dapat dimuat. Silakan coba muat ulang.
			</p>
			<details
				style={{
					background: "#f3f4f6",
					padding: "1rem",
					borderRadius: "0.5rem",
				}}
			>
				<summary style={{ cursor: "pointer", fontWeight: 600 }}>
					Detail Error
				</summary>
				<pre
					style={{
						marginTop: "0.5rem",
						whiteSpace: "pre-wrap",
						fontSize: "0.875rem",
						color: "#991b1b",
					}}
				>
					{error instanceof Error ? error.message : "Unknown error"}
				</pre>
			</details>
			<button
				onClick={() => window.location.reload()}
				style={{
					marginTop: "1rem",
					padding: "0.5rem 1rem",
					background: "#2563eb",
					color: "white",
					border: "none",
					borderRadius: "0.375rem",
					cursor: "pointer",
					fontSize: "0.875rem",
				}}
				type="button"
			>
				Muat Ulang
			</button>
		</div>
	),
	head: () => ({
		meta: [
			{
				title: "tkmpos",
			},
			{
				name: "description",
				content: "tkmpos is a web application",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/favicon.ico",
			},
		],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<ThemeProvider
				attribute="class"
				defaultTheme="light"
				disableTransitionOnChange
				storageKey="vite-ui-theme"
			>
				<CartProvider>
					<div className="flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground antialiased">
						<div className="flex-1 overflow-hidden">
							<Outlet />
						</div>
					</div>
					<Toaster richColors />
				</CartProvider>
			</ThemeProvider>
			<TanStackRouterDevtools position="bottom-left" />
		</>
	);
}
