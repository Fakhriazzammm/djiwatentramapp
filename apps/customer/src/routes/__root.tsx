import { Outlet, createRootRoute, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { YumiAuthProvider } from "@/hooks/useYumiAuth";
import { CustomerAuthProvider } from "@/hooks/use-customer-auth";
import { OrderProvider } from "@/hooks/use-order-context";
import { OwnerFooter } from "@djiwaapps/web-shared";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { trackPageView } from "@/lib/web-analytics";

function PageViewTracker() {
	const pathname = useLocation({ select: (location) => location.pathname });
	useEffect(() => {
		trackPageView(pathname);
	}, [pathname]);
	return null;
}

export const Route = createRootRoute({
	pendingComponent: CustomerPageSkeleton,
	component: () => {
		return (
			<YumiAuthProvider>
				<CustomerAuthProvider>
					<OrderProvider>
						<div className="mobile-shell">
							<div className="min-h-app bg-background font-sans text-foreground antialiased">
								<PageViewTracker />
								<Outlet />
								<OwnerFooter compact twoLine className="mb-[calc(5.5rem+env(safe-area-inset-bottom))]" />
							</div>
						</div>
					</OrderProvider>
				</CustomerAuthProvider>
			</YumiAuthProvider>
		);
	},
});
