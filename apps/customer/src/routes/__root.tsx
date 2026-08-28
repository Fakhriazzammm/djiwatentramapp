import { Outlet, createRootRoute } from "@tanstack/react-router";
import { YumiAuthProvider } from "@/hooks/useYumiAuth";
import { CustomerAuthProvider } from "@/hooks/use-customer-auth";
import { OrderProvider } from "@/hooks/use-order-context";
import { OwnerFooter } from "@yumipos/web-shared";
import { CustomerTransactionVoiceListener } from "@/components/customer/customer-transaction-voice-listener";

export const Route = createRootRoute({
	component: () => (
		<YumiAuthProvider>
			<CustomerAuthProvider>
				<OrderProvider>
					<CustomerTransactionVoiceListener />
					<div className="mobile-shell">
						<div className="min-h-app bg-background font-sans text-foreground antialiased">
							<Outlet />
							<OwnerFooter compact className="mb-[calc(5.5rem+env(safe-area-inset-bottom))]" />
						</div>
					</div>
				</OrderProvider>
			</CustomerAuthProvider>
		</YumiAuthProvider>
	),
});