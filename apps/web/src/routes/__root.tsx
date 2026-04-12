import { Outlet, createRootRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useGlobalKeyboardNavigation } from "../hooks/useGlobalKeyboardNavigation";
import { useSiteBrandingMetadata } from "../hooks/useSiteBrandingMetadata";
import { useYumiAuth } from "../hooks/useYumiAuth";
import { useEffect } from "react";

function RootComponent() {
	const navigate = useNavigate();
	const location = useLocation();
	const { isAuthenticated, isLoading, isStaff, user } = useYumiAuth();

	useGlobalKeyboardNavigation();
	useSiteBrandingMetadata();

	useEffect(() => {
		if (isLoading) return;

		const isLoginPage = location.pathname === "/login";
		
		if (!isAuthenticated) {
			if (!isLoginPage) {
				navigate({ to: "/login" as any });
			}
		} else if (isStaff && user?.slug) {
			// Staff only access to their profile
			const profilePath = `/attendance/${user.slug}`;
			if (location.pathname !== profilePath) {
				navigate({ to: profilePath as any });
			}
		}
	}, [isAuthenticated, isLoading, isStaff, user, location.pathname, navigate]);

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-[#0a0a0b]">
				<div className="relative h-16 w-16">
					<div className="absolute inset-0 rounded-full border-4 border-primary/20" />
					<div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-app bg-background font-sans text-foreground antialiased">
			<Outlet />
		</div>
	);
}

export const Route = createRootRoute({
	component: RootComponent,
});
