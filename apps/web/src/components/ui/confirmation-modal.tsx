import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface ConfirmationModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	variant?: "danger" | "warning" | "info";
}

export function ConfirmationModal({
	isOpen,
	onClose,
	onConfirm,
	title,
	message,
	confirmText = "Konfirmasi",
	cancelText = "Batal",
	variant = "danger",
}: ConfirmationModalProps) {
	const variantConfig = {
		danger: {
			icon: Trash2,
			iconBg: "bg-red-50",
			iconColor: "text-red-500",
			confirmBg: "bg-red-500 text-white hover:bg-red-600",
		},
		warning: {
			icon: AlertTriangle,
			iconBg: "bg-yellow-50",
			iconColor: "text-yellow-500",
			confirmBg: "bg-yellow-500 text-white hover:bg-yellow-600",
		},
		info: {
			icon: AlertTriangle, // Fallback
			iconBg: "bg-blue-50",
			iconColor: "text-blue-500",
			confirmBg: "bg-blue-500 text-white hover:bg-blue-600",
		},
	};

	const config = variantConfig[variant];
	const Icon = config.icon;

	return (
		<AnimatePresence>
			{isOpen && (
				<div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
					{/* Backdrop */}
					<motion.div
						animate={{ opacity: 1 }}
						className="fixed inset-0 bg-black/40 backdrop-blur-sm"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
					/>

					{/* Modal Content */}
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						className="relative w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card p-6 shadow-2xl"
						exit={{ opacity: 0, scale: 0.95, y: 10 }}
						initial={{ opacity: 0, scale: 0.95, y: 10 }}
					>
						<button
							className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
							onClick={onClose}
							type="button"
						>
							<X className="h-5 w-5" />
						</button>

						<div className="flex flex-col items-center text-center">
							<div
								className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${config.iconBg} ${config.iconColor}`}
							>
								<Icon className="h-6 w-6" />
							</div>

							<h3 className="font-bold text-foreground text-lg">{title}</h3>
							<p className="mt-2 text-muted-foreground text-sm">{message}</p>

							<div className="mt-8 flex w-full gap-3">
								<button
									className="flex-1 rounded-lg border border-border bg-background py-3 font-medium text-foreground text-sm transition-all hover:bg-muted active:scale-[0.98]"
									onClick={onClose}
									type="button"
								>
									{cancelText}
								</button>
								<button
									className={`flex-1 rounded-lg py-3 font-semibold text-sm transition-all active:scale-[0.98] ${config.confirmBg}`}
									onClick={() => {
										onConfirm();
										onClose();
									}}
									type="button"
								>
									{confirmText}
								</button>
							</div>
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
