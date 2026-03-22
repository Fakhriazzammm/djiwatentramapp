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
			iconBg: "bg-destructive/10",
			iconColor: "text-destructive",
			confirmBg:
				"bg-destructive text-destructive-foreground hover:bg-destructive/90",
		},
		warning: {
			icon: AlertTriangle,
			iconBg: "bg-accent/10",
			iconColor: "text-accent",
			confirmBg: "bg-accent text-accent-foreground hover:bg-accent/90",
		},
		info: {
			icon: AlertTriangle,
			iconBg: "bg-primary/10",
			iconColor: "text-primary",
			confirmBg: "bg-primary text-primary-foreground hover:bg-primary/90",
		},
	};

	const config = variantConfig[variant];
	const Icon = config.icon;

	return (
		<AnimatePresence>
			{isOpen && (
				<div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
					{/* Backdrop */}
					<motion.div
						animate={{ opacity: 1 }}
						className="fixed inset-0 bg-black/60 backdrop-blur-md"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
					/>

					{/* Modal Content */}
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						className="relative w-full max-w-xs overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl"
						exit={{ opacity: 0, scale: 0.95, y: 10 }}
						initial={{ opacity: 0, scale: 0.95, y: 10 }}
					>
						<div className="flex flex-col items-center text-center">
							<div
								className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${config.iconBg} ${config.iconColor} shadow-inner`}
							>
								<Icon className="h-7 w-7" />
							</div>

							<h3 className="font-black text-foreground text-lg tracking-tight">{title}</h3>
							<p className="mt-2 text-muted-foreground text-xs font-medium leading-relaxed">{message}</p>

							<div className="mt-8 flex w-full gap-3">
								<button
									className="flex-1 rounded-xl border border-border bg-background py-3 font-bold text-muted-foreground text-xs uppercase tracking-widest transition-all hover:bg-muted active:scale-95"
									onClick={onClose}
									type="button"
								>
									{cancelText}
								</button>
								<button
									className={`flex-1 rounded-xl py-3 font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg ${config.confirmBg}`}
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
