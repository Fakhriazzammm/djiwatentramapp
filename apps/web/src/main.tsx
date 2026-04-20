import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { CartProvider } from "@/context/cart-context";
import { AppDataProvider } from "@/context/app-data-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { registerSW } from "virtual:pwa-register";
import "./index.css";

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
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
updateSW = registerSW({
	onNeedRefresh() {
		void updateSW?.(true);
	},
});

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<ErrorBoundary>
			<ThemeProvider
				attribute="class"
				defaultTheme="light"
				disableTransitionOnChange
				storageKey="vite-ui-theme"
			>
				<AppDataProvider>
					<CartProvider>
						<RouterProvider router={router} />
						<Toaster richColors />
					</CartProvider>
				</AppDataProvider>
			</ThemeProvider>
		</ErrorBoundary>
	);
}
