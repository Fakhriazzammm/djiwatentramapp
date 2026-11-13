import { CheckoutSidebar, type CheckoutSidebarProps } from "@/components/pos/checkout-sidebar";
import { IosSheet } from "@/components/pos-ios/ios-kit";

/** Checkout di ponsel: sheet iOS hampir penuh, isi dari layar checkout baru. */
export function CartDrawer({
	isOpen,
	onClose,
	...checkoutProps
}: Omit<CheckoutSidebarProps, "onClose"> & {
	isOpen: boolean;
	onClose: () => void;
}) {
	return (
		<IosSheet open={isOpen} onClose={onClose} bare heightClass="h-[94dvh]" label="Checkout pesanan">
			<div className="min-h-0 flex-1">
				<CheckoutSidebar {...checkoutProps} onClose={onClose} />
			</div>
		</IosSheet>
	);
}
