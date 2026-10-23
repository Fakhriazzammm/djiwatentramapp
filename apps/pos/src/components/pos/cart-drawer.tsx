import {
	CheckoutSidebar,
	type CheckoutSidebarProps,
} from "@/components/pos/checkout-sidebar";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet";

export function CartDrawer({
	isOpen,
	onClose,
	...checkoutProps
}: Omit<CheckoutSidebarProps, "onClose"> & {
	isOpen: boolean;
	onClose: () => void;
}) {
	return (
		<Sheet
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<SheetContent
				side="right"
				showCloseButton={false}
				className="h-dvh max-h-dvh w-full max-w-none gap-0 overflow-hidden p-0 pt-[env(safe-area-inset-top)] sm:max-w-none"
			>
				<SheetTitle className="sr-only">Checkout pesanan</SheetTitle>
				<SheetDescription className="sr-only">
					Tinjau pesanan, pilih pembayaran, lalu lihat hasil transaksi.
				</SheetDescription>
				<CheckoutSidebar {...checkoutProps} onClose={onClose} />
			</SheetContent>
		</Sheet>
	);
}
