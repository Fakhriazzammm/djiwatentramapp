export function shouldShowPaymentProcessing(input: {
	processingOrderId: string | null;
	processingCurrentOrder: boolean;
	backendSettled: boolean;
	existingNonMayarReceipt: boolean;
	providerPaid: boolean;
}) {
	if (!input.processingOrderId) return false;
	if (input.providerPaid) return false;
	if (!input.processingCurrentOrder) return true;
	return !input.backendSettled && !input.existingNonMayarReceipt;
}
