export function shouldAllocateReceiptNumber(args: {
	isOpenBill?: boolean;
	autoComplete?: boolean;
}) {
	return !Boolean(args.isOpenBill) || Boolean(args.autoComplete);
}
