import { Outlet, createRootRoute } from "@tanstack/react-router";
import { YumiAuthProvider } from "@/hooks/useYumiAuth";
import { CustomerAuthProvider } from "@/hooks/use-customer-auth";
import { OrderProvider } from "@/hooks/use-order-context";
import { OwnerFooter } from "@yumipos/web-shared";
import { useEffect } from "react";
import { CustomerTransactionVoiceListener } from "@/components/customer/customer-transaction-voice-listener";
import { unlockAudio } from "@/lib/transaction-voice-queue";

export const Route = createRootRoute({
	component: () => {
		// Unlock browser audio on first user gesture so transaction voice alerts
		// can play even when notifications arrive from a background poll.
		useEffect(() => {
			const unlock = () => unlockAudio();
			window.addEventListener("pointerdown", unlock, { once: true });
			window.addEventListener("keydown", unlock, { once: true });
			window.addEventListener("touchstart", unlock, { once: true });
			return () => {
				window.removeEventListener("pointerdown", unlock);
				window.removeEventListener("keydown", unlock);
				window.removeEventListener("touchstart", unlock);
			};
		}, []);

		return (
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
		);
	},
});
