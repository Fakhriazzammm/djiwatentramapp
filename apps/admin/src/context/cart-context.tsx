import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { useAppData } from "@/context/app-data-context";
import { isDiscountApplicable, isFreeRefillActive } from "@/lib/utils/pricing";
import { calculateOrderTax } from "@yumipos/web-shared/lib/tax-calculator";

export interface CartItem {
	productId: string;
	name: string;
	price: number;
	originalPrice?: number;
	platformPrice?: number; // harga override dari platform (GoFood/GrabFood/dll)
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
	updateItemPrice: (
		productId: string,
		variant: string | undefined,
		newPrice: number
	) => void;
	clearCart: () => void;
	totalAmount: number;
	grossAmount: number;
	totalItems: number;
	appliedVoucher: AppliedVoucher | null;
	applyVoucher: (voucher: AppliedVoucher | null) => void;
	setCart: (items: CartItem[], voucher?: AppliedVoucher | null) => void;
	discountAmount: number;
	promoDiscountAmount: number;
	voucherDiscountAmount: number;
	finalTotal: number;
	taxRate: number;
	taxAmount: number;
	serviceChargeRate: number;
	serviceChargeAmount: number;
	platformTotal: number;
	commissionAmount: number;
	netRevenue: number;
	customerInfo: {
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
	};
	updateCustomerInfo: (info: Partial<CartContextType["customerInfo"]>) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
	const { siteSettings, activeDiscounts } = useAppData();

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

	const [customerInfo, setCustomerInfo] = useState<{
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
	}>({
			name: "",
			orderType: "dine_in",
			tableNumber: "",
			notes: "",
			isFreeRefill: false,
			isSubmitted: false,
		});

	const updateCustomerInfo = (info: Partial<typeof customerInfo>) => {
		setCustomerInfo((prev) => ({ ...prev, ...info }));
	};

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

	// Automatic Free Refill Logic
	useEffect(() => {
		if (!activeDiscounts) return;

		const now = new Date();
		const context = {
			currentTimestamp: now.getTime(),
			currentDay: now.getDay(),
			currentTimeVal: now.getHours() * 60 + now.getMinutes(),
		};

		// Find if any Free Refill promo is currently active
		const activeRefillPromo = activeDiscounts.find((d: any) =>
			isFreeRefillActive(d, context)
		);

		const refillId = "promo-free-refill";
		const hasRefillInCart = items.some((i) => i.productId === refillId);
		const otherItemsCount = items.filter((i) => i.productId !== refillId).length;

		if (activeRefillPromo && otherItemsCount > 0 && customerInfo.isFreeRefill) {
			// Add if not present or price/quantity changed
			const refillPrice = activeRefillPromo.refillPrice || 20000;
			const currentRefill = items.find((i) => i.productId === refillId);

			if (!currentRefill || currentRefill.price !== refillPrice || currentRefill.quantity !== 1) {
				const refillItem: CartItem = {
					productId: refillId,
					name: "Add-on: Free Refill Minuman",
					price: refillPrice,
					quantity: 1,
					category: "Promo",
				};

				setItems((prev) => {
					const filtered = prev.filter((i) => i.productId !== refillId);
					return [...filtered, refillItem];
				});
			}
		} else if (hasRefillInCart) {
			// Remove if no active promo, no other items, or customerInfo.isFreeRefill is false
			setItems((prev) => prev.filter((i) => i.productId !== refillId));
		}
		}, [activeDiscounts, items.length, customerInfo.isFreeRefill]);

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

	const updateItemPrice = (
		productId: string,
		variant: string | undefined,
		newPrice: number
	) => {
		setItems((prev) =>
			prev.map((i) => {
				if (i.productId === productId && i.variant === variant) {
					return { ...i, price: newPrice, platformPrice: newPrice };
				}
				return i;
			})
		);
	};

	const clearCart = () => {
		setItems([]);
		setAppliedVoucher(null);
		setCustomerInfo({
			name: "",
			orderType: "dine_in",
			tableNumber: "",
			notes: "",
			isFreeRefill: false,
			isSubmitted: false,
		});
	};

	const setCart = (newItems: CartItem[], voucher: AppliedVoucher | null = null) => {
		setItems(newItems);
		setAppliedVoucher(voucher);
	};

	const applyVoucher = (voucher: AppliedVoucher | null) => {
		setAppliedVoucher(voucher);
	};

	const grossAmount = items.reduce(
		(sum, i) => sum + (i.originalPrice ?? i.price) * i.quantity,
		0
	);
	const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
	const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

	const promoDiscountAmount = items.reduce((discount, item) => {
		const originalPrice = item.originalPrice ?? item.price;
		return discount + Math.max(0, originalPrice - item.price) * item.quantity;
	}, 0);

	const eligibleVoucherSubtotal = items.reduce((subtotal, item) => {
		if (!appliedVoucher) {
			return subtotal;
		}

		const isEligible =
			appliedVoucher.targetType === "ALL" ||
			(appliedVoucher.targetType === "CATEGORY" &&
				appliedVoucher.targetIds?.includes(item.category || "")) ||
			(appliedVoucher.targetType === "PRODUCT" &&
				appliedVoucher.targetIds?.includes(item.productId));

		if (!isEligible) {
			return subtotal;
		}

		return subtotal + item.price * item.quantity;
	}, 0);

	const voucherDiscountAmount = !appliedVoucher
		? 0
		: appliedVoucher.type === "PERCENTAGE"
			? eligibleVoucherSubtotal * (appliedVoucher.value / 100)
			: appliedVoucher.type === "FIXED"
				? Math.min(appliedVoucher.value, eligibleVoucherSubtotal)
				: 0;

	const discountAmount = promoDiscountAmount + voucherDiscountAmount;

	const subTotalAfterDiscount = Math.max(0, totalAmount - voucherDiscountAmount);

	// Canonical tax/service calculation for the Admin POS preview.
	// Cart item prices already include item-level/promo discounts; only the
	// additional voucher discount is passed to the shared calculator.
	const taxCalculation = calculateOrderTax({
		items,
		voucherDiscountAmount,
		taxRate: siteSettings?.taxRate ?? 0,
		serviceChargeRate: siteSettings?.serviceChargeRate ?? 0,
		source: "pos",

	});
	const taxRate = taxCalculation.taxRate;
	const serviceChargeRate = taxCalculation.serviceChargeRate;
	const serviceChargeAmount = taxCalculation.serviceChargeAmount;
	const taxAmount = taxCalculation.taxAmount;
	const finalTotal = taxCalculation.finalTotal;

	// Platform-specific calculations (for online orders)
	const platformTotal = items.reduce((sum, i) => sum + (i.platformPrice ?? i.price) * i.quantity, 0);
	const commissionAmount = Math.round(platformTotal * (customerInfo.platformCommission ?? 0));
	const netRevenue = platformTotal - commissionAmount;

	return (
		<CartContext.Provider
			value={{
				items,
				addToCart,
				removeFromCart,
				updateQuantity,
				updateItemPrice,
				clearCart,
				totalAmount,
				grossAmount,
				totalItems,
				appliedVoucher,
				applyVoucher,
				setCart,
				customerInfo,
				updateCustomerInfo,
				discountAmount,
				promoDiscountAmount,
				voucherDiscountAmount,
				finalTotal,
				taxRate,
				taxAmount,
				serviceChargeRate,
				serviceChargeAmount,
				platformTotal,
				commissionAmount,
				netRevenue,
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
