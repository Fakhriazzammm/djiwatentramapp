import { shouldShowPaymentProcessing } from "./payment-processing";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

describe("payment processing gate", () => {
	it("opens the receipt when Mayar confirms payment before the webhook settles the order", () => {
		assert.equal(shouldShowPaymentProcessing({
			processingOrderId: "order-1",
			processingCurrentOrder: true,
			backendSettled: false,
			existingNonMayarReceipt: false,
			providerPaid: true,
		}), false);
	});

	it("keeps waiting while neither provider nor backend confirms payment", () => {
		assert.equal(shouldShowPaymentProcessing({
			processingOrderId: "order-1",
			processingCurrentOrder: true,
			backendSettled: false,
			existingNonMayarReceipt: false,
			providerPaid: false,
		}), true);
	});
});
