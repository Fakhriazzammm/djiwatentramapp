import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useGlobalKeyboardNavigation } from "../hooks/useGlobalKeyboardNavigation";

function RootComponent() {
	useGlobalKeyboardNavigation();
	return (
		<div className="min-h-screen bg-background font-sans text-foreground antialiased">
			<Outlet />
		</div>
	);
}

export const Route = createRootRoute({
	component: RootComponent,
});
