import type { CartItem, AppliedVoucher } from "@/context/cart-context";
import type { useAppData } from "@/context/app-data-context";
import type { CheckoutCustomerInfo, CheckoutOrderData } from "@/lib/pos-checkout";

export interface CheckoutRecoveryRequest {
	snapshot: {
		cartItems: CartItem[];
		customerInfo: CheckoutCustomerInfo;
		appliedVoucher: AppliedVoucher | null;
		promoDiscountAmount: number;
		voucherDiscountAmount: number;
		activeDiscounts: ReturnType<typeof useAppData>["activeDiscounts"];
		taxPolicy: { taxEnabled: boolean; taxRate: number; serviceChargeRate: number };
		shiftId?: string | null;
	};
	finalAmount: number;
	discountId?: string;
	paymentMethod?: string;
	orderData?: CheckoutOrderData;
}

const REQUEST_KEY = "pos_order_request_v1";
let activeKey: string | null = null;
const retiredKeys = new Set<string>();

function defaultRequestStorage(): Storage {
	// The POS cart and checkout draft survive a tab restart in localStorage.
	// The unresolved request identity must use the same lifetime, otherwise a
	// reopened terminal can submit a second order with a fresh idempotency key.
	if (typeof window !== "undefined") return window.localStorage;
	const memory = new Map<string, string>();
	return {
		getItem: (key) => memory.get(key) ?? null,
		setItem: (key, value) => { memory.set(key, value); },
		removeItem: (key) => { memory.delete(key); },
		clear: () => { memory.clear(); },
		key: (index) => [...memory.keys()][index] ?? null,
		get length() { return memory.size; },
	};
}

export function getOrderRequestKey(fingerprint: string, storage: Pick<Storage, "getItem" | "setItem"> = defaultRequestStorage()): string {
	const saved = storage.getItem(REQUEST_KEY);
	if (saved) {
		let request: {fingerprint?: string; key?: string} | null = null;
		try { request = JSON.parse(saved); } catch { /* Malformed metadata is not an attempted request. */ }
		if (request && typeof request.key === "string" && request.key && !retiredKeys.has(request.key)) {
			if (request.fingerprint !== fingerprint) throw new Error("Hasil pesanan sebelumnya belum pasti. Pulihkan pesanan awal sebelum mengirim perubahan agar tidak membuat transaksi ganda.");
			activeKey = request.key;
			return request.key;
		}
	}
	const key = globalThis.crypto?.randomUUID?.() || `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	storage.setItem(REQUEST_KEY, JSON.stringify({ fingerprint, key }));
	activeKey = key;
	return key;
}

/** Immutable attempted inputs, not the currently edited cart, are the retry source. */
export function readPendingCheckoutRecovery(storage: Pick<Storage, "getItem"> = defaultRequestStorage()): CheckoutRecoveryRequest | null {
	try {
		const record = JSON.parse(storage.getItem(REQUEST_KEY) || "null");
		if (!record || typeof record.key !== "string" || retiredKeys.has(record.key)) return null;
		const attempt = JSON.parse(record.fingerprint);
		const snapshot = attempt?.snapshot;
		if (!snapshot || !Array.isArray(snapshot.cartItems) || !snapshot.cartItems.length ||
			!snapshot.cartItems.every((item: CartItem) => item && typeof item.productId === "string" && typeof item.name === "string" && Number.isFinite(item.price) && item.price >= 0 && Number.isFinite(item.quantity) && item.quantity > 0) ||
			typeof snapshot.customerInfo?.name !== "string" || !snapshot.taxPolicy ||
			![attempt.finalAmount, snapshot.promoDiscountAmount, snapshot.voucherDiscountAmount, snapshot.taxPolicy.taxRate, snapshot.taxPolicy.serviceChargeRate].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0) ||
			(attempt.paymentMethod !== undefined && typeof attempt.paymentMethod !== "string")) return null;
		return attempt as CheckoutRecoveryRequest;
	} catch { return null; }
}

export function clearOrderRequestKey(storage: Pick<Storage, "removeItem"> = defaultRequestStorage()) {
	if (activeKey) retiredKeys.add(activeKey);
	activeKey = null;
	// The order is already durable. Cleanup must never invite another submission.
	try { storage.removeItem(REQUEST_KEY); } catch { /* Retain the retry key if storage becomes unavailable. */ }
}
