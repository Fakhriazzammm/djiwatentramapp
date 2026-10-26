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
		<header className="shrink-0 border-b border-border/70 bg-card/95 px-3 py-3 shadow-sm backdrop-blur sm:px-4">
			<nav
				aria-label="Tahapan checkout"
				className="flex items-center gap-2"
			>
				{CHECKOUT_STEPS.map(({ id, label }, index) => {
					const state = getCheckoutStepState(activeStep, id);
					const navigable = canNavigateToCheckoutStep(activeStep, id);
					const content = (
						<>
							<span
								className={cn(
									"grid size-7 shrink-0 place-items-center rounded-full text-xs font-black transition-colors",
									state === "current" && "bg-primary text-primary-foreground shadow-sm",
									state === "complete" && "bg-emerald-100 text-emerald-700",
									state === "upcoming" && "bg-muted text-muted-foreground",
								)}
							>
								{state === "complete" ? <Check className="size-4" aria-hidden="true" /> : index + 1}
							</span>
							<span className="hidden min-[360px]:inline">{label}</span>
						</>
					);
					return (
						<div key={id} className="flex min-w-0 flex-1 items-center gap-2">
							{navigable ? (
								<Button
									type="button"
									variant="ghost"
									className="h-auto min-w-0 justify-start gap-2 rounded-xl px-1.5 py-1.5 text-left text-xs font-bold text-foreground hover:bg-primary/10 hover:text-primary sm:px-2"
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
										"flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-1.5 text-xs font-bold sm:px-2",
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
						className="hidden h-9 shrink-0 gap-1.5 rounded-xl px-2.5 text-xs font-bold sm:inline-flex"
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
						className="h-10 w-10 shrink-0 rounded-xl px-0"
						onClick={onClose}
					>
						<X className="size-5" />
					</Button>
				)}
			</nav>
		</header>
	);
}
