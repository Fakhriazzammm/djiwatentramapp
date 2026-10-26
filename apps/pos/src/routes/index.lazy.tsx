import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";

/* pos.djiwatentram.web.id is a till, not a brochure. "/" no longer introduces the product:
   it sends whoever arrived to the right door — the back-office login when there
   is no session, their own home when there is one. The marketing page that used
   to live here is still in git history if it is ever wanted as a public page. */
export const Route = createLazyFileRoute("/")({
	component: IndexPage,
});

function IndexPage() {
	const navigate = useNavigate();
	const { isAuthenticated, isLoading, isAdmin } = useYumiAuth();

	useEffect(() => {
		if (isLoading) return;
		navigate({
			to: (isAuthenticated ? (isAdmin ? "/admin" : "/menu") : "/kasir/login") as any,
			replace: true,
		});
	}, [isLoading, isAuthenticated, isAdmin, navigate]);

	// nothing to read here — the destination is decided above
	return (
		<div className="flex min-h-app items-center justify-center bg-background">
			<div className="relative h-12 w-12">
				<div className="absolute inset-0 rounded-full border-4 border-primary/20" />
				<div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
			</div>
		</div>
	);
}
