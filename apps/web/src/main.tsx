import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { CartProvider } from "@/context/cart-context";
import "./index.css";

// Set up Convex client (optional - graceful fallback if URL not configured)
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

// Set up Router instance
const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	context: {},
});

// Register things for typesafety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<ThemeProvider
			attribute="class"
			defaultTheme="light"
			disableTransitionOnChange
			storageKey="vite-ui-theme"
		>
			{convex ? (
				<ConvexProvider client={convex}>
					<CartProvider>
						<div className="flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground antialiased">
							<div className="flex-1 overflow-hidden">
								<RouterProvider router={router} />
							</div>
						</div>
						<Toaster richColors />
					</CartProvider>
				</ConvexProvider>
			) : (
				<CartProvider>
					<div className="flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground antialiased">
						<div className="flex-1 overflow-hidden">
							<RouterProvider router={router} />
						</div>
					</div>
					<Toaster richColors />
				</CartProvider>
			)}
		</ThemeProvider>
	);
}
