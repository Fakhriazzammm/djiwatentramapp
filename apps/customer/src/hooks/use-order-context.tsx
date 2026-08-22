import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import type { Id } from "@/types/backend-compat";
import { createClient } from "@/lib/client";
import type {
	CartItem,
	MenuMode,
	PaymentChoice,
	ReceiptState,
} from "@/components/customer/types";
import { getSessionId } from "@/components/customer/types";

// ── Types ──────────────────────────────────────────────────────

export type OrderStep = "party" | "refill" | "menu" | "checkout" | "payment" | "receipt";

export interface OrderContextType {
	// ── Step / navigation ────────────────────────────────────
	step: OrderStep;
	setStep: (value: OrderStep) => void;

	// ── Party & refill ───────────────────────────────────────
	partySize: number;
	setPartySize: (value: number) => void;
	freeRefillOptIn: boolean | null;
	setFreeRefillOptIn: (value: boolean | null) => void;

	// ── Menu ────────────────────────────────────────────────
	menuMode: MenuMode;
	setMenuMode: (value: MenuMode) => void;
	activeCategoryId: Id<"categories"> | null;
	setActiveCategoryId: (value: Id<"categories"> | null) => void;
	manualCode: string;
	setManualCode: (value: string) => void;
	codeFeedback: string;
	setCodeFeedback: (value: string) => void;

	// ── Cart ────────────────────────────────────────────────
	cart: CartItem[];
	setCart: (value: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
	cartOpen: boolean;
	setCartOpen: (value: boolean) => void;

	// ── Service request ─────────────────────────────────────
	serviceOpen: boolean;
	setServiceOpen: (value: boolean) => void;

	// ── Scanner ─────────────────────────────────────────────
	scannerOpen: boolean;
	setScannerOpen: (value: boolean) => void;

	// ── Product sheet ───────────────────────────────────────
	productSheet: any | null;
	setProductSheet: (value: any | null) => void;

	// ── Checkout / payment ──────────────────────────────────
	paymentChoice: PaymentChoice;
	setPaymentChoice: (value: PaymentChoice) => void;
	customerName: string;
	setCustomerName: (value: string) => void;
	customerDescription: string;
	setCustomerDescription: (value: string) => void;
	tableNumber: string;
	setTableNumber: (value: string) => void;
	notes: string;
	setNotes: (value: string) => void;
	dessertLater: boolean;
	setDessertLater: (value: boolean) => void;

	// ── Receipt ─────────────────────────────────────────────
	receipt: ReceiptState | null;
	setReceipt: (value: ReceiptState | null | ((prev: ReceiptState | null) => ReceiptState | null)) => void;
	isSubmitting: boolean;
	setIsSubmitting: (value: boolean) => void;

	// ── Auth modal ──────────────────────────────────────────
	authModalOpen: boolean;
	setAuthModalOpen: (value: boolean) => void;
	authError: string | undefined;
	setAuthError: (value: string | undefined) => void;

	// ── Guest form ──────────────────────────────────────────
	guestName: string;
	setGuestName: (value: string) => void;
	guestEmail: string;
	setGuestEmail: (value: string) => void;
	guestPhone: string;
	setGuestPhone: (value: string) => void;

	// ── Session ─────────────────────────────────────────────
	sessionRef: React.MutableRefObject<string>;

	// ── Helpers ─────────────────────────────────────────────
	addToCart: (item: CartItem) => void;
	updateCartQuantity: (
		productId: Id<"products">,
		variant: string | undefined,
		delta: number,
	) => void;
}

// ── Context ────────────────────────────────────────────────────

const OrderContext = createContext<OrderContextType | undefined>(undefined);

// ── Persistence ────────────────────────────────────────────────
// Cart di-persist ke localStorage agar tidak hilang saat refresh
// atau pindah halaman. Key div-version agar data lama tidak collide.
const CART_STORAGE_KEY = "customer-ordering-cart-v2";
const PREFILL_STORAGE_KEY = "customer-order-prefill-v1";

function isValidCartItem(item: unknown): item is CartItem {
	if (!item || typeof item !== "object") return false;
	const entry = item as Record<string, unknown>;
	return (
		typeof entry.productId === "string" &&
		typeof entry.name === "string" &&
		typeof entry.price === "number" &&
		typeof entry.quantity === "number" &&
		entry.quantity > 0 &&
		typeof entry.categoryId === "string"
	);
}

function loadPersistedCart(): CartItem[] {
	// 1) Prefill dari "Pesan lagi" (riwayat) — dikonsumsi sekali lalu dihapus
	try {
		const prefillRaw = window.localStorage.getItem(PREFILL_STORAGE_KEY);
		if (prefillRaw) {
			window.localStorage.removeItem(PREFILL_STORAGE_KEY);
			const parsed = JSON.parse(prefillRaw);
			if (Array.isArray(parsed)) {
				const items = parsed.filter(isValidCartItem);
				if (items.length > 0) return items;
			}
		}
	} catch { /* ignore */ }

	// 2) Cart tersimpan dari sesi sebelumnya
	try {
		const raw = window.localStorage.getItem(CART_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isValidCartItem) : [];
	} catch {
		return [];
	}
}

// ── Provider ───────────────────────────────────────────────────

export function OrderProvider({ children }: { children: ReactNode }) {
	// Step / navigation — always starts at a non-welcome step
	const [step, setStep] = useState<OrderStep>("party");

	// Party & refill
	const [partySize, setPartySize] = useState(1);
	const [freeRefillOptIn, setFreeRefillOptIn] = useState<boolean | null>(null);

	// Menu
	const [menuMode, setMenuMode] = useState<MenuMode>("number");
	const [activeCategoryId, setActiveCategoryId] = useState<Id<"categories"> | null>(null);
	const [manualCode, setManualCode] = useState("");
	const [codeFeedback, setCodeFeedback] = useState("");

	// Cart
	const [cart, setCart] = useState<CartItem[]>(() => loadPersistedCart());
	const [cartOpen, setCartOpen] = useState(false);

	// Service request
	const [serviceOpen, setServiceOpen] = useState(false);

	// Scanner
	const [scannerOpen, setScannerOpen] = useState(false);

	// Product sheet
	const [productSheet, setProductSheet] = useState<any | null>(null);

	// Checkout / payment
	const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("cashier");
	const [customerName, setCustomerName] = useState("");
	const [customerDescription, setCustomerDescription] = useState("");
	const [tableNumber, setTableNumber] = useState("");
	const [notes, setNotes] = useState("");
	const [dessertLater, setDessertLater] = useState(false);

	// Receipt
	const [receipt, setReceipt] = useState<ReceiptState | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Auth modal
	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [authError, setAuthError] = useState<string | undefined>(undefined);

	// Guest form
	const [guestName, setGuestName] = useState("");
	const [guestEmail, setGuestEmail] = useState("");
	const [guestPhone, setGuestPhone] = useState("");

	// Session
	const sessionRef = useRef(getSessionId(undefined));

	// Bootstrap client (side-effect-free instantiation at provider mount)
	createClient();

	// Auto-fill customerName & tableNumber from guest-data (filled at /daftar)
	useEffect(() => {
		try {
			const raw = window.localStorage.getItem("guest-data");
			if (raw) {
				const data = JSON.parse(raw);
				if (data?.name && !customerName) setCustomerName(data.name);
				if (data?.table && !tableNumber) setTableNumber(data.table);
			}
		} catch { /* ignore parse errors */ }
	}, []);

	// Persist cart ke localStorage setiap kali berubah
	useEffect(() => {
		try {
			if (cart.length > 0) {
				window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
			} else {
				window.localStorage.removeItem(CART_STORAGE_KEY);
			}
		} catch { /* ignore quota errors */ }
	}, [cart]);

	// ── Helpers ──────────────────────────────────────────────

	const addToCart = (item: CartItem) => {
		setCart((current) => {
			const existing = current.findIndex(
				(entry) => entry.productId === item.productId && entry.variant === item.variant,
			);
			if (existing >= 0) {
				return current.map((entry, index) =>
					index === existing
						? { ...entry, quantity: entry.quantity + item.quantity }
						: entry,
				);
			}
			return [...current, item];
		});
		setCodeFeedback(`${item.name} ditambahkan ke keranjang`);
		window.setTimeout(() => setCodeFeedback(""), 1800);
	};

	const updateCartQuantity = (
		productId: Id<"products">,
		variant: string | undefined,
		delta: number,
	) => {
		setCart((current) =>
			current
				.map((item) =>
					item.productId === productId && item.variant === variant
						? { ...item, quantity: Math.max(0, item.quantity + delta) }
						: item,
				)
				.filter((item) => item.quantity > 0),
		);
	};

	// ── Render ──────────────────────────────────────────────
	return (
		<OrderContext.Provider
			value={{
				// Step / navigation
				step,
				setStep,

				// Party & refill
				partySize,
				setPartySize,
				freeRefillOptIn,
				setFreeRefillOptIn,

				// Menu
				menuMode,
				setMenuMode,
				activeCategoryId,
				setActiveCategoryId,
				manualCode,
				setManualCode,
				codeFeedback,
				setCodeFeedback,

				// Cart
				cart,
				setCart,
				cartOpen,
				setCartOpen,

				// Service request
				serviceOpen,
				setServiceOpen,

				// Scanner
				scannerOpen,
				setScannerOpen,

				// Product sheet
				productSheet,
				setProductSheet,

				// Checkout / payment
				paymentChoice,
				setPaymentChoice,
				customerName,
				setCustomerName,
				customerDescription,
				setCustomerDescription,
				tableNumber,
				setTableNumber,
				notes,
				setNotes,
				dessertLater,
				setDessertLater,

				// Receipt
				receipt,
				setReceipt,
				isSubmitting,
				setIsSubmitting,

				// Auth modal
				authModalOpen,
				setAuthModalOpen,
				authError,
				setAuthError,

				// Guest form
				guestName,
				setGuestName,
				guestEmail,
				setGuestEmail,
				guestPhone,
				setGuestPhone,

				// Session
				sessionRef,

				// Helpers
				addToCart,
				updateCartQuantity,
			}}
		>
			{children}
		</OrderContext.Provider>
	);
}

// ── Hook ───────────────────────────────────────────────────────

export function useOrderContext() {
	const context = useContext(OrderContext);
	if (context === undefined) {
		throw new Error("useOrderContext must be used within an OrderProvider");
	}
	return context;
}
