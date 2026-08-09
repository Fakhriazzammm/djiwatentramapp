import type { Id } from "@/types/backend-compat";

export const GUEST_ORDER_HISTORY_KEY = "customer-guest-order-history-v1";
const GUEST_ORDER_TTL_MS = 60 * 60 * 1000;

type GuestOrderReference = { orderId: string; expiresAt: number };

export function rememberGuestOrder(orderId: string) {
	if (typeof window === "undefined" || !orderId) return;
	try {
		const now = Date.now();
		const current = readGuestOrderReferences(now);
		const next = [{ orderId, expiresAt: now + GUEST_ORDER_TTL_MS }, ...current.filter((item) => item.orderId !== orderId)].slice(0, 10);
		window.localStorage.setItem(GUEST_ORDER_HISTORY_KEY, JSON.stringify(next));
	} catch { /* ignore storage errors */ }
}

export function readGuestOrderReferences(now = Date.now()): GuestOrderReference[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(GUEST_ORDER_HISTORY_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		const active = Array.isArray(parsed)
			? parsed.filter((item): item is GuestOrderReference => Boolean(item?.orderId) && Number(item.expiresAt) > now)
			: [];
		if (active.length === 0) window.localStorage.removeItem(GUEST_ORDER_HISTORY_KEY);
		else window.localStorage.setItem(GUEST_ORDER_HISTORY_KEY, JSON.stringify(active));
		return active;
	} catch {
		return [];
	}
}

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
