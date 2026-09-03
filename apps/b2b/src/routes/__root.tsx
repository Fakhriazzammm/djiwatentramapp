import { Outlet, createRootRoute } from "@tanstack/react-router";
import { YumiAuthProvider } from "@/hooks/useYumiAuth";
import { CustomerAuthProvider } from "@/hooks/use-customer-auth";
import { OrderProvider } from "@/hooks/use-order-context";
import { OwnerFooter } from "@yumipos/web-shared";

export const Route = createRootRoute({
	component: () => {
		return (
			<YumiAuthProvider>
				<CustomerAuthProvider>
					<OrderProvider>
						<div className="mobile-shell">
							<div className="min-h-app bg-background font-sans text-foreground antialiased">
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
