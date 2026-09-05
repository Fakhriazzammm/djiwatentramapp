import { Outlet, createRootRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { YumiAuthProvider } from "@/hooks/useYumiAuth";
import { CustomerAuthProvider } from "@/hooks/use-customer-auth";
import { OrderProvider } from "@/hooks/use-order-context";
import { OwnerFooter } from "@yumipos/web-shared";
import { RouteTransitionSplash } from "@/components/customer/customer-entry";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";

export const Route = createRootRoute({
	pendingComponent: CustomerPageSkeleton,
	component: () => {
		const location = useLocation();
		const prevPathRef = useRef(location.pathname);
		const [visible, setVisible] = useState(false);

		useEffect(() => {
			const prev = prevPathRef.current;
			if (location.pathname !== prev) {
				prevPathRef.current = location.pathname;
				setVisible(true);
				const id = setTimeout(() => setVisible(false), 400);
				return () => clearTimeout(id);
			}
		}, [location.pathname]);

		return (
			<YumiAuthProvider>
				<CustomerAuthProvider>
					<OrderProvider>
						<div className="mobile-shell">
							<div className="min-h-app bg-background font-sans text-foreground antialiased">
								<Outlet />
								{visible && <RouteTransitionSplash />}
								<OwnerFooter compact twoLine className="mb-[calc(5.5rem+env(safe-area-inset-bottom))]" />
							</div>
						</div>
					</OrderProvider>
				</CustomerAuthProvider>
			</YumiAuthProvider>
		);
	},
});
