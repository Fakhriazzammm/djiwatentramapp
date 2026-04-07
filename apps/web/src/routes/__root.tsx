import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useGlobalKeyboardNavigation } from "../hooks/useGlobalKeyboardNavigation";
import { useSiteBrandingMetadata } from "../hooks/useSiteBrandingMetadata";

function RootComponent() {
	useGlobalKeyboardNavigation();
	useSiteBrandingMetadata();
	return (
		<div className="min-h-app bg-background font-sans text-foreground antialiased">
			<Outlet />
		</div>
	);
}

export const Route = createRootRoute({
	component: RootComponent,
});
