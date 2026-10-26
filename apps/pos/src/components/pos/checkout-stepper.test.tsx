import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	CheckoutStepHeader,
	canNavigateToCheckoutStep,
	getCheckoutStepState,
} from "./checkout-stepper";

describe("checkout stepper", () => {
	it("allows returning from payment to the order step", () => {
		expect(canNavigateToCheckoutStep("payment", "order")).toBe(true);
		expect(canNavigateToCheckoutStep("order", "payment")).toBe(false);
		expect(canNavigateToCheckoutStep("result", "payment")).toBe(false);
	});

	it("marks previous, active, and upcoming steps for a payment checkout", () => {
		expect(getCheckoutStepState("payment", "order")).toBe("complete");
		expect(getCheckoutStepState("payment", "payment")).toBe("current");
		expect(getCheckoutStepState("payment", "result")).toBe("upcoming");
	});

	it("renders a clear back affordance and elevated step header", () => {
		const html = renderToStaticMarkup(
			<CheckoutStepHeader activeStep="payment" onStepChange={() => {}} />,
		);
		expect(html).toContain('aria-label="Kembali ke Pesanan"');
		expect(html).toContain('aria-current="step"');
		expect(html).toContain("shadow-sm");
		expect(html).toContain("bg-card");
	});

	it("locks back navigation while checkout recovery is pending", () => {
		const html = renderToStaticMarkup(
			<CheckoutStepHeader
				activeStep="payment"
				disabled
				onStepChange={() => {}}
			/>,
		);
		expect(html).toContain('aria-label="Kembali ke Pesanan"');
		expect(html).toContain("disabled=\"\"");
	});
});
