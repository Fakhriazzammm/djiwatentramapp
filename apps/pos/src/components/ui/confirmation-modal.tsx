import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useState } from "react";

interface ConfirmationModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	subtitle?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	variant?: "danger" | "warning" | "info";
	loading?: boolean;
}

export function ConfirmationModal({
	isOpen,
	onClose,
	onConfirm,
	title,
	subtitle,
	message,
	confirmText = "Konfirmasi",
	cancelText = "Batal",
	variant = "danger",
	loading = false,
}: ConfirmationModalProps) {
	const [mounted, setMounted] = useState(false);
	const titleId = useId();

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !loading) onClose();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [isOpen, loading, onClose]);

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

	const modalContent = (
		<AnimatePresence>
			{isOpen && (
				<div
					className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
					data-slot="confirmation-modal-root"
				>
					{/* Backdrop */}
					<motion.div
						animate={{ opacity: 1 }}
						className="fixed inset-0 bg-black/60 backdrop-blur-md"
						data-slot="confirmation-modal-backdrop"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						onClick={onClose}
						transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
					/>

					{/* Modal Content */}
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						aria-labelledby={titleId}
						aria-modal="true"
						className="relative w-full max-w-xs overflow-hidden rounded-[24px] border border-border bg-card p-6 shadow-2xl"
						data-slot="confirmation-modal-card"
						exit={{ opacity: 0, scale: 0.95, y: 10 }}
						initial={{ opacity: 0, scale: 0.95, y: 10 }}
						role="dialog"
						transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
					>
						<div className="flex flex-col items-center text-center">
							<div
								className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${config.iconBg} ${config.iconColor} shadow-inner`}
							>
								<Icon className="h-7 w-7" />
							</div>

							<h3 className="font-display font-black text-foreground text-lg tracking-tight" id={titleId}>{title}</h3>
							{subtitle && (
								<p className="mt-1 text-muted-foreground text-xs italic">{subtitle}</p>
							)}
							<p className="mt-2 text-muted-foreground text-xs font-medium leading-relaxed">{message}</p>

							<div className="mt-8 flex w-full gap-3">
								<button
									className="min-h-11 flex-1 rounded-[14px] border border-border bg-background py-3 font-bold text-muted-foreground text-xs uppercase tracking-widest transition-all duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] hover:bg-muted active:scale-[.97]"
									onClick={onClose}
									type="button"
								>
									{cancelText}
								</button>
								<button
									className={`min-h-11 flex-1 rounded-[14px] py-3 font-black text-xs uppercase tracking-widest transition-all duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)] active:scale-[.97] shadow-lg ${config.confirmBg}`}
									disabled={loading}
									onClick={() => {
										onConfirm();
										onClose();
									}}
									type="button"
								>
									{loading && <Loader2 className="h-4 w-4 animate-spin inline mr-1" />}
									{confirmText}
								</button>
							</div>
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);

	if (!mounted) return null;

	return createPortal(modalContent, document.body);
}
