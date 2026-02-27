import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

export interface CartItem {
	productId: string;
	name: string;
	price: number;
	quantity: number;
	variant?: string; // e.g. "Large, Less Sugar"
	image?: string;
	category?: string;
}

export interface AppliedVoucher {
	_id: string;
	name: string;
	type: "FIXED" | "PERCENTAGE" | "FLAT_PRICE";
	value: number;
	targetType: "ALL" | "CATEGORY" | "PRODUCT";
	targetIds?: string[];
}

interface CartContextType {
	items: CartItem[];
	addToCart: (item: CartItem) => void;
	removeFromCart: (productId: string, variant?: string) => void;
	updateQuantity: (
		productId: string,
		variant: string | undefined,
		delta: number
	) => void;
	clearCart: () => void;
	totalAmount: number;
	totalItems: number;
	appliedVoucher: AppliedVoucher | null;
	applyVoucher: (voucher: AppliedVoucher | null) => void;
	discountAmount: number;
	finalTotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
	const [items, setItems] = useState<CartItem[]>(() => {
		// Load cart from localStorage on mount
		if (typeof window !== "undefined") {
			const savedCart = localStorage.getItem("pos_cart");
			if (savedCart) {
				try {
					return JSON.parse(savedCart);
				} catch {
					return [];
				}
			}
		}
		return [];
	});

	const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(
		() => {
			if (typeof window !== "undefined") {
				const savedVoucher = localStorage.getItem("pos_voucher");
				if (savedVoucher) {
					try {
						return JSON.parse(savedVoucher);
					} catch {
						return null;
					}
				}
			}
			return null;
		}
	);

	// Save cart to localStorage whenever it changes
	useEffect(() => {
		if (typeof window !== "undefined") {
			localStorage.setItem("pos_cart", JSON.stringify(items));
		}
	}, [items]);

	// Save voucher to localStorage
	useEffect(() => {
		if (typeof window !== "undefined") {
			if (appliedVoucher) {
				localStorage.setItem("pos_voucher", JSON.stringify(appliedVoucher));
			} else {
				localStorage.removeItem("pos_voucher");
			}
		}
	}, [appliedVoucher]);

	const addToCart = (newItem: CartItem) => {
		setItems((prev) => {
			const existing = prev.find(
				(i) =>
					i.productId === newItem.productId && i.variant === newItem.variant
			);
			if (existing) {
				return prev.map((i) =>
					i.productId === newItem.productId && i.variant === newItem.variant
						? { ...i, quantity: i.quantity + newItem.quantity }
						: i
				);
			}
			return [...prev, newItem];
		});
	};

	const removeFromCart = (productId: string, variant?: string) => {
		setItems((prev) =>
			prev.filter((i) => !(i.productId === productId && i.variant === variant))
		);
	};

	const updateQuantity = (
		productId: string,
		variant: string | undefined,
		delta: number
	) => {
		setItems((prev) =>
			prev
				.map((i) => {
					if (i.productId === productId && i.variant === variant) {
						return { ...i, quantity: Math.max(0, i.quantity + delta) };
					}
					return i;
				})
				.filter((i) => i.quantity > 0)
		);
	};

	const clearCart = () => {
		setItems([]);
		setAppliedVoucher(null);
	};

	const applyVoucher = (voucher: AppliedVoucher | null) => {
		setAppliedVoucher(voucher);
	};

	const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
	const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

	// Calculate discount amount based on voucher type and target
	const discountAmount = items.reduce((discount, item) => {
		if (!appliedVoucher) {
			return discount;
		}

		// Check if item is eligible for discount
		const isEligible =
			appliedVoucher.targetType === "ALL" ||
			(appliedVoucher.targetType === "CATEGORY" &&
				appliedVoucher.targetIds?.includes(item.category || "")) ||
			(appliedVoucher.targetType === "PRODUCT" &&
				appliedVoucher.targetIds?.includes(item.productId));

		if (!isEligible) {
			return discount;
		}

		const itemTotal = item.price * item.quantity;

		if (appliedVoucher.type === "PERCENTAGE") {
			return discount + itemTotal * (appliedVoucher.value / 100);
		}
		if (appliedVoucher.type === "FIXED") {
			return discount + appliedVoucher.value;
		}
		// FLAT_PRICE - not typically a discount, skip
		return discount;
	}, 0);

	const finalTotal = Math.max(0, totalAmount - discountAmount);

	return (
		<CartContext.Provider
			value={{
				items,
				addToCart,
				removeFromCart,
				updateQuantity,
				clearCart,
				totalAmount,
				totalItems,
				appliedVoucher,
				applyVoucher,
				discountAmount,
				finalTotal,
			}}
		>
			{children}
		</CartContext.Provider>
	);
}

export function useCart() {
	const context = useContext(CartContext);
	if (!context) {
		throw new Error("useCart must be used within a CartProvider");
	}
	return context;
}
