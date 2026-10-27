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
				side="bottom"
				showCloseButton={false}
				className="h-[94dvh] max-h-[94dvh] w-full max-w-none gap-0 overflow-hidden rounded-t-[28px] border-x-0 border-b-0 border-t border-white/80 bg-[#F2F2F7] p-0 shadow-[0_-16px_48px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[#1C1C1E] sm:max-w-none"
			>
				<SheetTitle className="sr-only">Checkout pesanan</SheetTitle>
				<SheetDescription className="sr-only">
					Tinjau pesanan, pilih pembayaran, lalu lihat hasil transaksi.
				</SheetDescription>
				<div
					className="mx-auto mb-1 mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-400/35 dark:bg-slate-500/60"
					aria-hidden="true"
				/>
				<div className="min-h-0 flex-1">
					<CheckoutSidebar {...checkoutProps} onClose={onClose} />
				</div>
			</SheetContent>
		</Sheet>
	);
}
