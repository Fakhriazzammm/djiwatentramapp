import type { CartItem } from "@/components/customer/types";

export const CART_STORAGE_KEY_PREFIX = "customer-ordering-cart-v3";
export const LEGACY_CART_STORAGE_KEY = "customer-ordering-cart-v2";
export const CART_STORAGE_VERSION = 3;

export type CartOwnerKey = `member:${string}` | `guest:${string}`;

export type PersistedCart = {
	version: typeof CART_STORAGE_VERSION;
	ownerKey: CartOwnerKey;
	dateKey: string;
	savedAt: number;
	items: CartItem[];
};

export function getJakartaDateKey(date = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Jakarta",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

export function getCartStorageKey(ownerKey: CartOwnerKey): string {
	return `${CART_STORAGE_KEY_PREFIX}:${ownerKey}`;
}

export function isCartOwnerKey(value: unknown): value is CartOwnerKey {
	return typeof value === "string" && /^(member|guest):[^:]+$/.test(value);
}

export function isPersistedCart(value: unknown): value is PersistedCart {
	if (!value || typeof value !== "object") return false;
	const entry = value as Partial<PersistedCart>;
	return (
		entry.version === CART_STORAGE_VERSION &&
		isCartOwnerKey(entry.ownerKey) &&
		typeof entry.dateKey === "string" &&
		typeof entry.savedAt === "number" &&
		Number.isFinite(entry.savedAt) &&
		Array.isArray(entry.items)
	);
}

export function loadPersistedCart(ownerKey: CartOwnerKey, storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): CartItem[] {
	if (!storage) return [];
	try {
		const raw = storage.getItem(getCartStorageKey(ownerKey));
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!isPersistedCart(parsed) || parsed.ownerKey !== ownerKey || parsed.dateKey !== getJakartaDateKey()) {
			storage.removeItem(getCartStorageKey(ownerKey));
			return [];
		}
		return parsed.items;
	} catch {
		return [];
	}
}

export function persistCart(ownerKey: CartOwnerKey, items: CartItem[], storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): void {
	if (!storage) return;
	try {
		const key = getCartStorageKey(ownerKey);
		if (items.length === 0) {
			storage.removeItem(key);
			return;
		}
		const envelope: PersistedCart = {
			version: CART_STORAGE_VERSION,
			ownerKey,
			dateKey: getJakartaDateKey(),
			savedAt: Date.now(),
			items,
		};
		storage.setItem(key, JSON.stringify(envelope));
	} catch {
		// Cart tetap bekerja in-memory jika storage tidak tersedia.
	}
}

export function clearPersistedCart(ownerKey: CartOwnerKey, storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): void {
	try {
		storage?.removeItem(getCartStorageKey(ownerKey));
	} catch {
		// Ignore unavailable storage.
	}
}

export function clearLegacyCart(storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage): void {
	try {
		storage?.removeItem(LEGACY_CART_STORAGE_KEY);
	} catch {
		// Ignore unavailable storage.
	}
}
