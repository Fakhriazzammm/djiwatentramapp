import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

export const Route = createRootRoute({
	component: () => (
		<div className="min-h-screen bg-background">
			<Outlet />
			{import.meta.env.DEV && <TanStackRouterDevtools />}
		</div>
	),
});
