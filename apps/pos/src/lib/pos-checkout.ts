/** The parent creates the order/invoice, clears the cart and rotates its request key. */
export interface CheckoutSubmissionResult {
	orderId: string | null;
	status: "paid" | "pending" | "queued";
	paymentMethod: string;
	total: number;
	invoiceUrl?: string;
	customerName?: string;
	cashReceived?: number;
	changeAmount?: number;
}
export interface CheckoutCustomerInfo {
	name: string;
	email?: string;
	phone?: string;
	orderType: string;
	tableNumber: string;
	notes: string;
	isFreeRefill: boolean;
	isSubmitted: boolean;
	platform?: string;
	platformCommission?: number;
	customer_source_id?: string;
}
export interface CheckoutAssignment {
	groupType: "barista" | "kitchen";
	assignedTo: string;
	items: {
		productId?: string;
		productName: string;
		variant?: string;
		quantity: number;
		assignedTo: string;
	}[];
}
export interface CheckoutOrderData {
	tableNumber?: string;
	orderType?: string;
	notes?: string;
	autoComplete?: boolean;
	isOpenBill?: boolean;
	cashReceived?: number;
	changeAmount?: number;
	assignments?: CheckoutAssignment[];
}
export type ConfirmCheckoutPayment = (
	finalAmount: number,
	discountId?: string,
	paymentMethod?: string,
	orderData?: CheckoutOrderData,
) => Promise<CheckoutSubmissionResult>;
export interface CheckoutDraft {
	step: "order" | "payment" | "result";
	paymentMethod: string;
	cashReceived: number | "";
	autoComplete: boolean;
	assignments: CheckoutAssignment[];
	result: CheckoutSubmissionResult | null;
}
export const POS_CHECKOUT_STORAGE_KEY = "pos_checkout_draft_v1";
export const createCustomerInfo = (): CheckoutCustomerInfo => ({
	name: "",
	orderType: "dine_in",
	tableNumber: "",
	notes: "",
	isFreeRefill: false,
	isSubmitted: false,
});
export const createCheckoutDraft = (): CheckoutDraft => ({
	step: "order",
	paymentMethod: "",
	cashReceived: "",
	autoComplete: false,
	assignments: [],
	result: null,
});
const record = (v: unknown): Record<string, unknown> =>
	v !== null && typeof v === "object" && !Array.isArray(v)
		? (v as Record<string, unknown>)
		: {};
const money = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v) && v >= 0;
export function isCheckoutResult(
	value: unknown,
): value is CheckoutSubmissionResult {
	const r = record(value);
	return (
		(r.status === "paid" || r.status === "pending" || r.status === "queued") &&
		(r.orderId === null ||
			(typeof r.orderId === "string" && r.orderId.length > 0)) &&
		typeof r.paymentMethod === "string" &&
		money(r.total) &&
		["invoiceUrl", "customerName"].every(
			(key) => r[key] === undefined || typeof r[key] === "string",
		) &&
		["cashReceived", "changeAmount"].every(
			(key) => r[key] === undefined || money(r[key]),
		)
	);
}
export function parseCheckoutStorage(raw: string | null): {
	customerInfo: CheckoutCustomerInfo;
	checkout: CheckoutDraft;
} {
	const fallback = {
		customerInfo: createCustomerInfo(),
		checkout: createCheckoutDraft(),
	};
	try {
		const data = record(JSON.parse(raw || "null"));
		if (data.version !== 1) return fallback;
		const c = record(data.customerInfo),
			d = record(data.checkout);
		const customer = fallback.customerInfo;
		for (const key of [
			"name",
			"email",
			"phone",
			"orderType",
			"tableNumber",
			"notes",
			"platform",
			"customer_source_id",
		] as const) {
			const value = c[key];
			if (typeof value === "string") customer[key] = value;
		}
		if (money(c.platformCommission))
			customer.platformCommission = c.platformCommission;
		customer.isFreeRefill = c.isFreeRefill === true;
		customer.isSubmitted = c.isSubmitted === true;
		const checkout = fallback.checkout;
		checkout.paymentMethod =
			typeof d.paymentMethod === "string" ? d.paymentMethod : "";
		checkout.cashReceived = money(d.cashReceived) ? d.cashReceived : "";
		checkout.autoComplete = d.autoComplete === true;
		checkout.result = isCheckoutResult(d.result) ? d.result : null;
		checkout.step = checkout.result
			? "result"
			: d.step === "payment"
				? "payment"
				: "order";
		if (Array.isArray(d.assignments))
			checkout.assignments = d.assignments.flatMap((value) => {
				const g = record(value);
				if (
					(g.groupType !== "barista" && g.groupType !== "kitchen") ||
					!Array.isArray(g.items)
				)
					return [];
				return [
					{
						groupType: g.groupType,
						assignedTo: typeof g.assignedTo === "string" ? g.assignedTo : "",
						items: g.items.flatMap((value) => {
							const i = record(value);
							if (
								typeof i.productName !== "string" ||
								!money(i.quantity) ||
								i.quantity === 0
							)
								return [];
							return [
								{
									productName: i.productName,
									quantity: i.quantity,
									assignedTo:
										typeof i.assignedTo === "string" ? i.assignedTo : "",
									...(typeof i.productId === "string"
										? { productId: i.productId }
										: {}),
									...(typeof i.variant === "string"
										? { variant: i.variant }
										: {}),
								},
							];
						}),
					},
				];
			});
		return fallback;
	} catch {
		return fallback;
	}
}
export function readCheckoutStorage() {
	try {
		return parseCheckoutStorage(
			typeof window === "undefined"
				? null
				: window.localStorage.getItem(POS_CHECKOUT_STORAGE_KEY),
		);
	} catch {
		return parseCheckoutStorage(null);
	}
}
export function reconcileAssignments(
	items: {
		productId: string;
		name: string;
		variant?: string;
		quantity: number;
		category?: string;
	}[],
	categories: { _id: string; track?: string | null }[],
	previous: CheckoutAssignment[],
): CheckoutAssignment[] {
	const groups: CheckoutAssignment[] = [];
	for (const groupType of ["barista", "kitchen"] as const) {
		const old = previous.find((g) => g.groupType === groupType);
		const entries = items
			.filter(
				(i) =>
					(categories.find((c) => c._id === i.category)?.track === "kitchen"
						? "kitchen"
						: "barista") === groupType,
			)
			.map((i) => {
				const saved = previous
					.flatMap((group) => group.items)
					.find((p) => p.productId === i.productId && p.variant === i.variant);
				return {
					productId: i.productId,
					productName: i.name,
					variant: i.variant,
					quantity: i.quantity,
					assignedTo: saved?.assignedTo ?? old?.assignedTo ?? "",
				};
			});
		if (entries.length)
			groups.push({
				groupType,
				assignedTo: old?.assignedTo ?? "",
				items: entries,
			});
	}
	return groups;
}
export function validateCheckout(input: {
	itemCount: number;
	total: number;
	paymentMethod: string;
	cashReceived: number | "";
	isShiftOpen: boolean;
	customer: CheckoutCustomerInfo;
	isOpenBill?: boolean;
}): string | null {
	if (input.itemCount <= 0) return "Tambahkan menu ke pesanan terlebih dahulu.";
	if (!input.isShiftOpen) return "Buka shift terlebih dahulu di Dashboard.";
	if (!money(input.total)) return "Total pesanan tidak valid. Periksa pesanan.";
	if (input.isOpenBill) return null;
	if (!input.paymentMethod) return "Pilih metode pembayaran.";
	if (input.paymentMethod === "tunai" || input.paymentMethod === "cash") {
		if (!money(input.cashReceived))
			return "Masukkan uang diterima atau pilih Uang pas.";
		if (input.cashReceived < input.total)
			return "Uang diterima masih kurang dari total pesanan.";
	}
	if (input.paymentMethod === "qris_mayar") {
		if (!input.customer.name.trim())
			return "Nama pelanggan wajib untuk QRIS dinamis.";
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customer.email?.trim() || ""))
			return "Email pelanggan yang valid wajib untuk QRIS dinamis.";
		if (!input.customer.phone?.trim())
			return "Nomor telepon pelanggan wajib untuk QRIS dinamis.";
	}
	return null;
}
export function canPrintCheckoutResult(
	result: CheckoutSubmissionResult | null,
	currentOrderId?: string | null,
) {
	return Boolean(
		result?.orderId &&
		result.status !== "queued" &&
		result.orderId === currentOrderId,
	);
}
