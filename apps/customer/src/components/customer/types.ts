import type { Id } from "@/types/backend-compat";

export type RouteSearch = { table?: string; session?: string; orderId?: string };
export type Step = "welcome" | "party" | "refill" | "menu" | "checkout" | "receipt";
export type MenuMode = "number" | "catalog";
export type PaymentChoice = "cashier" | "mayar";
export type ServiceRequestType = "call_staff" | "bring_dessert";

export type CartItem = {
	productId: Id<"products">;
	name: string;
	price: number;
	originalPrice?: number;
	quantity: number;
	variant?: string;
	image?: string;
	categoryId: Id<"categories">;
	menuNumber?: number;
};

export type ReceiptState = {
	orderId: Id<"orders">;
	fallbackReference: string;
	mode: "cashier_pending" | "mayar_pending" | "paid";
	paymentChoice: PaymentChoice;
	invoiceId?: string;
	invoiceUrl?: string;
	dessertLater: boolean;
	cartSnapshot: CartItem[];
};

export const CUSTOMER_ORDERING_DEFAULTS = {
	enabled: true,
	welcomeTitle: "Welcome",
	welcomeSubtitle: "Pesan menu favoritmu langsung dari meja.",
	welcomeButtonLabel: "Mulai pesan",
	enablePartySizeSelection: true,
	enableFreeRefillPrompt: true,
	enableBarcodeScan: true,
	enableMenuNumberEntry: true,
	enableCatalogBrowsing: true,
	enableStaffCall: true,
	enableDessertLater: true,
	requireTableNumber: false,
	cashPaymentLabel: "Bayar di kasir",
	mayarPaymentLabel: "QRIS",
};

export const currency = (value: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(value);

export const normalizeMenuCode = (value: string | number | undefined | null) =>
	String(value ?? "")
		.replace(/\s+/g, "")
		.trim();

export const getSessionId = (seed?: string) => {
	if (seed) return seed;
	if (typeof window === "undefined") return "server-session";
	const storageKey = "customer-ordering-session";
	const existing = window.localStorage.getItem(storageKey);
	if (existing) return existing;
	const next =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `session-${Date.now().toString(36)}`;
	window.localStorage.setItem(storageKey, next);
	return next;
};
