import { Outlet, createRootRoute } from "@tanstack/react-router";
import { YumiAuthProvider } from "@/hooks/useYumiAuth";

export const Route = createRootRoute({
	component: () => (
		<YumiAuthProvider>
			<div className="min-h-app bg-background font-sans text-foreground antialiased">
				<Outlet />
			</div>
		</YumiAuthProvider>
	),
});
