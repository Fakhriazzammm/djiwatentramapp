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
import {
	clearLegacyCart,
	clearPersistedCart,
	getJakartaDateKey,
	loadPersistedCart,
	persistCart,
	type CartOwnerKey,
} from "@/lib/cart-storage";
import { useCustomerAuth } from "@/hooks/use-customer-auth";

// ── Types ──────────────────────────────────────────────────────

export type OrderStep = "table" | "party" | "refill" | "menu" | "checkout" | "payment" | "receipt";

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
	shippingReceiverName: string;
	setShippingReceiverName: (value: string) => void;
	shippingAddress: string;
	setShippingAddress: (value: string) => void;
	shippingPhone: string;
	setShippingPhone: (value: string) => void;
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
	guestDescription: string;
	setGuestDescription: (value: string) => void;
	guestMarketingConsent: boolean;
	setGuestMarketingConsent: (value: boolean) => void;

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
// Cart disimpan per member/guest-session dan hanya berlaku untuk tanggal WIB aktif.

function getCartOwnerKey(
	isAuthenticated: boolean,
	customerSourceId: string | undefined,
	sessionId: string,
): CartOwnerKey | null {
	if (isAuthenticated) return customerSourceId ? `member:${customerSourceId}` : null;
	return `guest:${sessionId}`;
}

// ── Provider ───────────────────────────────────────────────────

export function OrderProvider({ children }: { children: ReactNode }) {
	// Step / navigation — always starts at a non-welcome step
	const [step, setStep] = useState<OrderStep>("menu");

	// Party & refill
	const [partySize, setPartySize] = useState(1);
	const [freeRefillOptIn, setFreeRefillOptIn] = useState<boolean | null>(null);

	// Menu
	const [menuMode, setMenuMode] = useState<MenuMode>("catalog");
	const [activeCategoryId, setActiveCategoryId] = useState<Id<"categories"> | null>(null);
	const [manualCode, setManualCode] = useState("");
	const [codeFeedback, setCodeFeedback] = useState("");

	// Cart
	const [cart, setCart] = useState<CartItem[]>([]);
	const [cartOpen, setCartOpen] = useState(false);

	// Service request
	const [serviceOpen, setServiceOpen] = useState(false);

	// Scanner
	const [scannerOpen, setScannerOpen] = useState(false);

	// Product sheet
	const [productSheet, setProductSheet] = useState<any | null>(null);

	// Checkout / payment
	const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("mayar");
	const [customerName, setCustomerName] = useState("");
	const [shippingReceiverName, setShippingReceiverName] = useState("");
	const [shippingAddress, setShippingAddress] = useState("");
	const [shippingPhone, setShippingPhone] = useState("");
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
	const [guestDescription, setGuestDescription] = useState("");
	const [guestMarketingConsent, setGuestMarketingConsent] = useState(false);

	// Session
	const sessionRef = useRef(getSessionId(undefined));
	const { isLoading: authLoading, isAuthenticated, customer } = useCustomerAuth();
	const cartOwnerKey = getCartOwnerKey(isAuthenticated, customer?.sourceId, sessionRef.current);
	const cartDateRef = useRef(getJakartaDateKey());
	const hydratedOwnerRef = useRef<CartOwnerKey | null>(null);
	const skipNextPersistRef = useRef(false);

	// Bootstrap client (side-effect-free instantiation at provider mount)
	createClient();

	// Auto-fill checkout identity from guest-data (filled at /daftar)
	useEffect(() => {
		try {
			const raw = window.localStorage.getItem("guest-data");
			if (raw) {
				const data = JSON.parse(raw);
				if (data?.name && !customerName) setCustomerName(data.name);
				if (data?.email && !guestEmail) setGuestEmail(data.email);
				if (data?.phone && !guestPhone) setGuestPhone(data.phone);
				if (data?.description && !customerDescription) setCustomerDescription(data.description);
				if (data?.marketingConsent === true) setGuestMarketingConsent(true);
				if (data?.table && !tableNumber) setTableNumber(data.table);
			}
		} catch { /* ignore parse errors */ }
	}, []);

	// Hydrate hanya setelah auth selesai, lalu buang legacy cart global yang tidak punya owner/date.
	useEffect(() => {
		if (authLoading || !cartOwnerKey || hydratedOwnerRef.current === cartOwnerKey) return;
		hydratedOwnerRef.current = cartOwnerKey;
		cartDateRef.current = getJakartaDateKey();
		clearLegacyCart();
		skipNextPersistRef.current = true;
		setCart(loadPersistedCart(cartOwnerKey));
	}, [authLoading, cartOwnerKey]);

	// Persist cart scoped ke identity aktif. Skip sekali setelah hydration agar state [] lama
	// tidak menghapus payload tersimpan sebelum hasil load masuk ke render berikutnya.
	useEffect(() => {
		if (!cartOwnerKey || hydratedOwnerRef.current !== cartOwnerKey) return;
		if (skipNextPersistRef.current) {
			skipNextPersistRef.current = false;
			return;
		}
		persistCart(cartOwnerKey, cart);
	}, [cart, cartOwnerKey]);

	// Jika aplikasi tetap terbuka melewati tengah malam WIB, cart harus expired.
	useEffect(() => {
		const interval = window.setInterval(() => {
			const today = getJakartaDateKey();
			if (today === cartDateRef.current) return;
			cartDateRef.current = today;
			if (cartOwnerKey) clearPersistedCart(cartOwnerKey);
			setCart([]);
		}, 60_000);
		return () => window.clearInterval(interval);
	}, [cartOwnerKey]);

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
				shippingReceiverName,
				setShippingReceiverName,
				shippingAddress,
				setShippingAddress,
				shippingPhone,
				setShippingPhone,
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
				guestDescription,
				setGuestDescription,
				guestMarketingConsent,
				setGuestMarketingConsent,

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
