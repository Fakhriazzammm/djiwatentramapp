import { AnimatePresence, motion } from "framer-motion";
import { CheckoutSidebar } from "@/components/pos/checkout-sidebar";

export function CartDrawer({
	isOpen,
	onClose,
	onConfirmPayment,
	isSubmitting,
	lastOrderId,
	onPrintLastOrder,
	onPrintOpenBill,
	onPrintKitchen,
	canPrintOpenBill,
}: {
	isOpen: boolean;
	onClose: () => void;
	onConfirmPayment?: any;
	isSubmitting?: boolean;
	lastOrderId?: string | null;
	onPrintLastOrder?: () => void;
	onPrintOpenBill?: () => void;
	onPrintKitchen?: () => void;
	canPrintOpenBill?: boolean;
}) {
	return (
		<AnimatePresence>
			{isOpen && (
				<>
					{/* Backdrop */}
					<motion.div
						animate={{ opacity: 1 }}
						className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md md:hidden"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
					/>
					{/* Drawer Wrapper for Mobile */}
					<motion.div
						animate={{ x: 0 }}
						className="fixed top-0 right-0 z-50 flex h-full w-full flex-col bg-card shadow-2xl md:hidden"
						exit={{ x: "100%" }}
						initial={{ x: "100%" }}
						transition={{ type: "spring", damping: 25, stiffness: 200 }}
					>
						<CheckoutSidebar 
							onConfirmPayment={onConfirmPayment}
							isSubmitting={isSubmitting}
							onClose={onClose}
							lastOrderId={lastOrderId}
							onPrintLastOrder={onPrintLastOrder}
							onPrintOpenBill={onPrintOpenBill}
							onPrintKitchen={onPrintKitchen}
							canPrintOpenBill={canPrintOpenBill}
						/>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}
