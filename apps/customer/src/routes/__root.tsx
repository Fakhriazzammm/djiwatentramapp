import { Outlet, createRootRoute } from "@tanstack/react-router";
import { YumiAuthProvider } from "@/hooks/useYumiAuth";
import { CustomerAuthProvider } from "@/hooks/use-customer-auth";

export const Route = createRootRoute({
	component: () => (
		<YumiAuthProvider>
			<CustomerAuthProvider>
				<div className="min-h-app bg-background font-sans text-foreground antialiased">
					<Outlet />
				</div>
			</CustomerAuthProvider>
		</YumiAuthProvider>
	),
});
