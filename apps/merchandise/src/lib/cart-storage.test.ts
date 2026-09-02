import {
	getCartStorageKey,
	getJakartaDateKey,
	loadPersistedCart,
	persistCart,
	type CartOwnerKey,
} from "@/lib/cart-storage";
import type { CartItem } from "@/components/customer/types";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
	toBe(expected: unknown): void;
	toEqual(expected: unknown): void;
};

class MemoryStorage implements Storage {
	private values = new Map<string, string>();
	get length() { return this.values.size; }
	clear() { this.values.clear(); }
	getItem(key: string) { return this.values.get(key) ?? null; }
	key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
	removeItem(key: string) { this.values.delete(key); }
	setItem(key: string, value: string) { this.values.set(key, value); }
}

const item: CartItem = {
	productId: "product-1" as CartItem["productId"],
	name: "Kopi Susu",
	price: 25000,
	quantity: 1,
	categoryId: "category-1" as CartItem["categoryId"],
};
const guestOwner = "guest:session-a" as CartOwnerKey;

function envelope(ownerKey: CartOwnerKey, dateKey = getJakartaDateKey(), items: CartItem[] = [item]) {
	return JSON.stringify({ version: 3, ownerKey, dateKey, savedAt: Date.now(), items });
}

describe("customer cart storage", () => {
	it("persists and loads a cart for the same owner and WIB date", () => {
		const storage = new MemoryStorage();
		persistCart(guestOwner, [item], storage);
		expect(loadPersistedCart(guestOwner, storage)).toEqual([item]);
	});

	it("does not load another owner's cart", () => {
		const storage = new MemoryStorage();
		storage.setItem(getCartStorageKey(guestOwner), envelope(guestOwner));
		expect(loadPersistedCart("guest:session-b", storage)).toEqual([]);
	});

	it("removes a cart from a previous Jakarta date", () => {
		const storage = new MemoryStorage();
		storage.setItem(getCartStorageKey(guestOwner), envelope(guestOwner, "2000-01-01"));
		expect(loadPersistedCart(guestOwner, storage)).toEqual([]);
		expect(storage.getItem(getCartStorageKey(guestOwner))).toBe(null);
	});

	it("rejects malformed or old-version envelopes", () => {
		const storage = new MemoryStorage();
		storage.setItem(getCartStorageKey(guestOwner), JSON.stringify({ version: 2, items: [item] }));
		expect(loadPersistedCart(guestOwner, storage)).toEqual([]);
	});

	it("removes the scoped payload when the cart becomes empty", () => {
		const storage = new MemoryStorage();
		persistCart(guestOwner, [item], storage);
		persistCart(guestOwner, [], storage);
		expect(storage.getItem(getCartStorageKey(guestOwner))).toBe(null);
	});
});
