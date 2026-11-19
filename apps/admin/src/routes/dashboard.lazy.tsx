import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";

import UserMenu from "@/components/user-menu";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { Button } from "@/components/ui/button";

export const Route = createLazyFileRoute("/dashboard")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = useNavigate();
	const { isAuthenticated } = useYumiAuth();

	return (
		<>
			{isAuthenticated ? (
				<div>
					<h1>Dashboard</h1>
					<Button onClick={() => navigate({ to: "/admin" })}>Buka Panel Admin</Button>
					<UserMenu />
				</div>
			) : (
				<div style={{ padding: "2rem", textAlign: "center" }}>
					<h2>Login Required</h2>
					<p>You need to log in to access the dashboard.</p>
					<Button onClick={() => navigate({ to: "/admin/login" })}>
						Login dengan PIN
					</Button>
				</div>
			)}
		</>
	);
}
