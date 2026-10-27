import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CheckoutStep = "order" | "payment" | "result";

const CHECKOUT_STEPS: readonly { id: CheckoutStep; label: string }[] = [
	{ id: "order", label: "Pesanan" },
	{ id: "payment", label: "Pembayaran" },
	{ id: "result", label: "Hasil" },
];

export function getCheckoutStepState(
	activeStep: CheckoutStep,
	step: CheckoutStep,
): "complete" | "current" | "upcoming" {
	const activeIndex = CHECKOUT_STEPS.findIndex(({ id }) => id === activeStep);
	const stepIndex = CHECKOUT_STEPS.findIndex(({ id }) => id === step);
	if (stepIndex < activeIndex) return "complete";
	if (stepIndex === activeIndex) return "current";
	return "upcoming";
}

export function canNavigateToCheckoutStep(
	activeStep: CheckoutStep,
	targetStep: CheckoutStep,
): boolean {
	return activeStep !== "result" && getCheckoutStepState(activeStep, targetStep) === "complete";
}

interface CheckoutStepHeaderProps {
	activeStep: CheckoutStep;
	onStepChange: (step: CheckoutStep) => void;
	disabled?: boolean;
	onClose?: () => void;
}

export function CheckoutStepHeader({
	activeStep,
	onStepChange,
	disabled = false,
	onClose,
}: CheckoutStepHeaderProps) {
	return (
		<header className="shrink-0 border-b border-black/[0.06] bg-white/90 px-3 py-2 backdrop-blur-xl dark:border-white/10 dark:bg-[#1C1C1E]/90 sm:px-4">
			<nav
				aria-label="Tahapan checkout"
				className="flex items-center gap-1"
			>
				{CHECKOUT_STEPS.map(({ id, label }, index) => {
					const state = getCheckoutStepState(activeStep, id);
					const navigable = canNavigateToCheckoutStep(activeStep, id);
					const content = (
						<>
							<span
								className={cn(
									"grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
									state === "current" && "bg-primary text-primary-foreground",
									state === "complete" && "bg-emerald-100 text-emerald-700",
									state === "upcoming" && "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
								)}
							>
								{state === "complete" ? <Check className="size-4" aria-hidden="true" /> : index + 1}
							</span>
							<span className="hidden max-w-[5.5rem] truncate whitespace-nowrap text-xs min-[360px]:inline">{label}</span>
						</>
					);
					return (
						<div key={id} className="flex min-w-0 flex-1 items-center gap-1">
							{navigable ? (
								<Button
									type="button"
									variant="ghost"
									className="min-h-11 h-auto min-w-0 justify-start gap-1.5 rounded-xl px-1.5 py-1 text-left text-xs font-semibold text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 sm:px-2"
									aria-label={`Kembali ke ${label}`}
									disabled={disabled}
									onClick={() => onStepChange(id)}
								>
									{content}
								</Button>
							) : (
								<span
									aria-current={state === "current" ? "step" : undefined}
									className={cn(
										"flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl px-1.5 py-1 text-xs font-semibold sm:px-2",
										state === "current" && "bg-primary/10 text-primary",
										state === "complete" && "text-emerald-700",
										state === "upcoming" && "text-muted-foreground",
									)}
								>
									{content}
								</span>
							)}
							{index < CHECKOUT_STEPS.length - 1 && (
								<span
									className={cn(
										"h-px flex-1",
										state === "complete" ? "bg-emerald-300" : "bg-border",
									)}
									aria-hidden="true"
								/>
							)}
						</div>
					);
				})}
				{activeStep === "payment" && (
					<Button
						type="button"
						variant="outline"
						className="hidden h-11 shrink-0 gap-1 rounded-xl px-3 text-sm font-semibold sm:inline-flex"
						aria-label="Kembali ke Pesanan"
							disabled={disabled}
						onClick={() => onStepChange("order")}
					>
						<ArrowLeft className="size-3.5" aria-hidden="true" />
						Kembali
					</Button>
				)}
				{onClose && (
					<Button
						variant="ghost"
						aria-label="Tutup checkout"
					className="h-11 w-11 shrink-0 rounded-full px-0 text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
						onClick={onClose}
					>
						<X className="size-5" />
					</Button>
				)}
			</nav>
		</header>
	);
}
