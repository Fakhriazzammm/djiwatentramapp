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
