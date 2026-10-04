import { MARKETPLACE_BRAND_SLUG } from "@/lib/marketplace-config";
import {
	Bell,
	ChevronRight,
	LogIn,
	PhoneCall,
	Table2,
	X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { Djiwa3DIcon } from "@yumipos/web-shared";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
	useHybridCategories,
	useHybridAllProducts,
	useHybridMerchandiseCampaigns,
	useHybridSiteSettings,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridBookingSettings } from "@/hooks/use-hybrid-booking-data";
import { useHybridMayarConfig, useHybridOrderById } from "@/hooks/use-hybrid-ops-data";
import { useProductUpsellRecommendations } from "@/hooks/use-product-upsells";
import {
	useHybridCreateOrder,
	useHybridCreateServiceRequest,
	useHybridMayarCreateInvoice,
	useHybridMayarGetInvoiceDetail,
	useHybridUpdateOrderPaymentGateway,
	useHybridUpdateOrderStatus,
} from "@/hooks/use-hybrid-write-actions";
import { cn } from "@/lib/utils";
import { calculateOrderTax } from "@yumipos/web-shared/lib/tax-calculator";
import { getAdditionalOrderDiscount } from "@yumipos/web-shared/lib/order-pricing";
import { CustomerHeader } from "@/components/customer/customer-shell";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import type { Doc, Id } from "@/types/backend-compat";

import { useOrderContext } from "@/hooks/use-order-context";
import type { OrderStep } from "@/hooks/use-order-context";
import type { CartItem, ServiceRequestType, PaymentChoice } from "@/components/customer/types";
import { ShippingSection } from "@/components/customer/shipping-section";
import { CUSTOMER_ORDERING_DEFAULTS, currency, normalizeMenuCode, rememberGuestOrder } from "@/components/customer/types";
import { BottomButton, CartRow, CustomerOrderProgress, SummaryCardLines } from "@/components/customer/shared-components";
const BarcodeScanner = lazy(() => import("@/components/customer/barcode-scanner").then((module) => ({ default: module.BarcodeScanner })));
const ProductSheet = lazy(() => import("@/components/customer/product-sheet").then((module) => ({ default: module.ProductSheet })));
import { renderMenuSection } from "@/components/customer/menu-section";
import { renderCheckoutSection } from "@/components/customer/checkout-section";
import { renderReceiptSection } from "@/components/customer/receipt-section";
import { UpsellSheet } from "@/components/customer/upsell-sheet";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { AuthHeader } from "@/components/customer/auth-header";
import { redirectToDjiwaAppLogin } from "@/lib/auth-client";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { getCustomerContactMessage, getMissingCustomerFields, hasValidCustomerPhone } from "@/lib/customer-profile-completeness";

const NO_PRODUCT_DISCOUNTS: Doc<"discounts">[] = [];

function persistMerchandiseOrderAccessKey(orderId: string | number, key: string | null) {
	if (typeof window === "undefined" || !key) return;
	try {
		window.localStorage.setItem(`merchandise-order-access:${String(orderId)}`, key);
	} catch {
		// Keep checkout working if browser storage is unavailable; owner-only actions remain unavailable.
	}
}

export const Route = createLazyFileRoute("/$username/order")({
	component: OrderPage,
});

function OrderPage() {
	const shouldReduceMotion = useReducedMotion();
	const popupTransition = { type: "spring" as const, stiffness: 320, damping: 30, mass: 0.8 };
	const navigate = useNavigate();
	const { username } = Route.useParams();
	const search = Route.useSearch();
	const brandSlug = MARKETPLACE_BRAND_SLUG;
	const [menuRefreshTrigger, setMenuRefreshTrigger] = useState(0);
	const checkoutRequestKeyRef = useRef<string | null>(null);

	const siteSettings = useHybridSiteSettings();
	const brandSettings = useHybridBookingSettings(brandSlug);
	const categories = useHybridCategories(menuRefreshTrigger);
	const products = useHybridAllProducts(menuRefreshTrigger);
	const campaigns = useHybridMerchandiseCampaigns(menuRefreshTrigger);

	const createOrder = useHybridCreateOrder();
	const updateOrderPaymentGateway = useHybridUpdateOrderPaymentGateway();
	const updateOrderStatus = useHybridUpdateOrderStatus();
	const createServiceRequest = useHybridCreateServiceRequest();
	const createMayarInvoice = useHybridMayarCreateInvoice();
	const getMayarInvoiceDetail = useHybridMayarGetInvoiceDetail();
	const mayarConfig = useHybridMayarConfig();

	const {
		step,
		setStep,
		partySize,
		setPartySize,
		freeRefillOptIn,
		setFreeRefillOptIn,
		menuMode,
		setMenuMode,
		activeCategoryId,
		setActiveCategoryId,
		manualCode,
		setManualCode,
		codeFeedback,
		setCodeFeedback,
		cart,
		setCart,
		cartOpen,
		setCartOpen,
		serviceOpen,
		setServiceOpen,
		scannerOpen,
		setScannerOpen,
		productSheet,
		setProductSheet,
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
		shippingProvider,
		setShippingProvider,
		customerDescription,
		setCustomerDescription,
		guestMarketingConsent,
		tableNumber,
		setTableNumber,
		notes,
		setNotes,
		dessertLater,
		setDessertLater,
		receipt,
		setReceipt,
		isSubmitting,
		setIsSubmitting,
		sessionRef,
		addToCart,
		updateCartQuantity,
	} = useOrderContext();
	const [checkoutError, setCheckoutError] = useState<string | null>(null);
	const [guestEmail, setGuestEmail] = useState("");
	const [guestPhone, setGuestPhone] = useState("");
	const [retryingPayment, setRetryingPayment] = useState(false);

	const startNewOrder = () => {
		checkoutRequestKeyRef.current = null;
		setReceipt(null);
		setCart([]);
		setCartOpen(false);
		setServiceOpen(false);
		setScannerOpen(false);
		setProductSheet(null);
		setCheckoutError(null);
		setGuestEmail("");
		setGuestPhone("");
		setShippingReceiverName("");
		setShippingAddress("");
		setShippingPhone("");
		setShippingProvider(null);
		setDessertLater(false);
		setNotes("");
		setTableNumber("");
		setStep("menu");
	};
	const goHome = () => navigate({ to: "/$username", params: { username } });

	const { isAuthenticated, customer, logout, isLoading: authLoading } = useCustomerAuth();
	const missingContactFields = getMissingCustomerFields(customer);
	const checkoutEmail = isAuthenticated ? customer?.email?.trim() || "" : guestEmail.trim();
	const checkoutPhone = isAuthenticated ? customer?.phone?.trim() || "" : guestPhone.trim();

	useEffect(() => {
		if (isAuthenticated && customer) {
			if (customer.name?.trim() && !customerName.trim()) setCustomerName(customer.name.trim());
			if (customer.name?.trim() && !shippingReceiverName.trim()) setShippingReceiverName(customer.name.trim());
			if (customer.phone?.trim() && !shippingPhone.trim()) setShippingPhone(customer.phone.trim());
			if (customer.customerDescription?.trim() && !customerDescription.trim()) setCustomerDescription(customer.customerDescription.trim());
			return;
		}
		if (isAuthenticated) return;
		try {
			const raw = window.localStorage.getItem("guest-data");
			if (!raw) return;
			const data = JSON.parse(raw) as Record<string, unknown>;
			if (typeof data.name === "string" && data.name.trim() && !customerName.trim()) setCustomerName(data.name.trim());
			if (typeof data.name === "string" && data.name.trim() && !shippingReceiverName.trim()) setShippingReceiverName(data.name.trim());
			if (typeof data.email === "string" && data.email.trim() && !guestEmail.trim()) setGuestEmail(data.email.trim());
			if (typeof data.phone === "string" && data.phone.trim() && !guestPhone.trim()) setGuestPhone(data.phone.trim());
			if (typeof data.phone === "string" && data.phone.trim() && !shippingPhone.trim()) setShippingPhone(data.phone.trim());
			if (typeof data.description === "string" && data.description.trim() && !customerDescription.trim()) setCustomerDescription(data.description.trim());
		} catch {
			// Ignore malformed guest storage; checkout validation will show the missing field.
		}
	}, [customer, customerDescription, customerName, guestEmail, guestPhone, isAuthenticated, setCustomerDescription, setCustomerName, setShippingPhone, setShippingReceiverName, shippingPhone, shippingReceiverName]);
	const memberDiscounts = NO_PRODUCT_DISCOUNTS;
	const isMenuLoading = categories === undefined || products === undefined || campaigns === undefined;
	const isMenuError = categories === null || products === null || campaigns === null;
	const [catalogQuery, setCatalogQuery] = useState("");
	const [pendingNumberProduct, setPendingNumberProduct] = useState<Doc<"products"> | null>(null);
	const [pendingNumberQuantity, setPendingNumberQuantity] = useState(1);
	const [upsellMainItem, setUpsellMainItem] = useState<CartItem | null>(null);
	const [upsellSourceProductId, setUpsellSourceProductId] = useState<string | null>(null);
	const upsellRecommendations = useProductUpsellRecommendations(upsellSourceProductId, menuRefreshTrigger);

	useEffect(() => {
		if (!products || !memberDiscounts) return;
		setCart((currentCart) => {
			let changed = false;
			const nextCart = currentCart
				.filter((item) => {
					const productExists = products.some((entry) => entry._id === item.productId);
					if (!productExists) changed = true;
					return productExists;
				})
				.map((item) => {
					if (item.variant) return item;
					const product = products.find((entry) => entry._id === item.productId);
					if (!product) return item;
					const pricing = calculateEffectivePrice(
						{ _id: product._id, price: product.price, categoryId: product.categoryId },
						memberDiscounts,
					);
					if (item.price === pricing.finalPrice && item.originalPrice === pricing.originalPrice) return item;
					changed = true;
					return { ...item, price: pricing.finalPrice, originalPrice: pricing.originalPrice };
				});
			return changed ? nextCart : currentCart;
		});
	}, [memberDiscounts, products, setCart]);

	const currentOrder = useHybridOrderById(receipt?.orderId);
	const config = {
		...CUSTOMER_ORDERING_DEFAULTS,
		...(siteSettings?.customerOrdering ?? {}),
	};
	const themeColor = brandSettings?.themeColor || "var(--color-primary)";
	const logoUrl = brandSettings?.logoUrl || siteSettings?.logoUrl || "";
	const storeName = brandSettings?.title || siteSettings?.storeName || "Ordering";
	const canUseMayar = Boolean(siteSettings?.mayarEnabled && mayarConfig?.configured);
	const canUseWallet = Boolean(isAuthenticated && customer && customer.walletStatus !== "blocked");
	const upsellEnabled = siteSettings?.upsellEnabled === true;
	const upsellMaxRecommendations = Number(siteSettings?.upsellMaxRecommendations);
	const upsellTitle = typeof siteSettings?.upsellTitle === "string" ? siteSettings.upsellTitle.trim() : "";
	const upsellSkipLabel = typeof siteSettings?.upsellSkipLabel === "string" ? siteSettings.upsellSkipLabel.trim() : "";
	const upsellAddedLabel = typeof siteSettings?.upsellAddedLabel === "string" ? siteSettings.upsellAddedLabel.trim() : "";
	const visibleUpsellRecommendations = useMemo(() => {
		if (!upsellEnabled || !Number.isInteger(upsellMaxRecommendations) || upsellMaxRecommendations <= 0) return [];
		if (!upsellRecommendations || !products) return [];
		const merchandiseProductIds = new Set(products.map((product) => product._id));
		return upsellRecommendations
			.filter((recommendation) => merchandiseProductIds.has(recommendation.recommendedProductSourceId))
			.filter((recommendation) => recommendation.ctaLabel?.trim())
			.slice(0, upsellMaxRecommendations);
	}, [upsellEnabled, upsellMaxRecommendations, upsellRecommendations, products]);

	const orderedCategories = useMemo(
		() => (categories ? [...categories].sort((a, b) => a.order - b.order) : []),
		[categories]
	);
	const orderedProducts = useMemo(
		() =>
			products
				? [...products].sort((a, b) =>
					(a.menuNumber ?? 99999) - (b.menuNumber ?? 99999) || a.name.localeCompare(b.name)
				  )
				: [],
		[products]
	);
	const campaignByProductId = useMemo(
		() => new Map((campaigns ?? []).map((campaign) => [campaign.productSourceId, campaign])),
		[campaigns],
	);
	const filteredProducts = useMemo(() => {
		const categoryFiltered = !activeCategoryId
			? orderedProducts
			: (() => {
					const validCategoryIds = new Set<Id<"categories">>([activeCategoryId]);
					for (const category of orderedCategories) {
						if (category.parentId === activeCategoryId) validCategoryIds.add(category._id);
					}
					return orderedProducts.filter((product) => validCategoryIds.has(product.categoryId));
			  })();
		const query = catalogQuery.trim().toLowerCase();
		if (!query) return categoryFiltered;
		return categoryFiltered.filter((product) =>
			product.name.toLowerCase().includes(query) ||
			String(product.menuNumber ?? "").includes(query),
		);
	}, [activeCategoryId, catalogQuery, orderedCategories, orderedProducts]);
	const menuNumberIndex = useMemo(() => {
		const lookup = new Map<string, (typeof orderedProducts)[number]>();
		const duplicates = new Set<string>();
		for (const product of orderedProducts) {
			if (product.menuNumber == null) continue;
			const code = normalizeMenuCode(product.menuNumber);
			if (lookup.has(code)) duplicates.add(code);
			else lookup.set(code, product);
		}
		return { lookup, duplicates };
	}, [orderedProducts]);
	const productByMenuNumber = menuNumberIndex.lookup;
	const activeFreeRefillPromo: Doc<"discounts"> | null = null;
	const freeRefillCharge = 0;
	const productSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
	const productGrossSubtotal = cart.reduce(
		(sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity,
		0
	);
	const subtotal = productSubtotal + freeRefillCharge;
	const grossSubtotal = productGrossSubtotal + freeRefillCharge;
	const promoDiscount = Math.max(0, grossSubtotal - subtotal);
	const djiwaPayDiscountPercent = Number(siteSettings?.djiwaPayDiscountPercent ?? 20);
	const djiwaPayDiscount = paymentChoice === "wallet" && promoDiscount === 0
		? Math.min(productSubtotal, Math.max(0, Math.round(productSubtotal * (djiwaPayDiscountPercent / 100))))
		: 0;
	const chargeableSubtotal = Math.max(0, subtotal - djiwaPayDiscount);
	const taxEnabled = siteSettings?.taxEnabled ?? false;
	const taxRate = Number(siteSettings?.taxRate ?? 0);
	const serviceChargeRate = siteSettings?.serviceChargeRate ?? 0;
	const taxCalculation = calculateOrderTax({
		items: [
			...cart.map((item) => ({ price: item.price, quantity: item.quantity })),
			...(freeRefillCharge > 0 ? [{ price: freeRefillCharge, quantity: 1 }] : []),
		],
		discountAmount: djiwaPayDiscount,
		taxEnabled,
		taxRate,
		serviceChargeRate,
		source: "customer_self_service",
		paymentMethod: paymentChoice === "mayar" ? "qris" : paymentChoice === "wallet" ? "wallet" : "cash",
		paymentChoice,
		paymentReceiptKind: null,
	});
	const serviceChargeAmount = taxCalculation.serviceChargeAmount;
	const taxBase = taxCalculation.taxBase;
	const taxAmount = taxCalculation.taxAmount;
	const total = taxCalculation.finalTotal;
	const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
	const hasDessertInCart = cart.some((item) =>
		/(dessert|cake|pudding|ice cream|gelato|tiramisu|sweet)/i.test(item.name)
	);
	const paymentOptions = [
		...(canUseWallet
			? [
					{
						key: "wallet" as PaymentChoice,
						label: "Djiwa Pay",
						description: `Gunakan saldo Djiwa Pay ${currency(customer?.walletBalance ?? 0)} untuk membayar pesanan.`,
					},
			  ]
			: []),
		...(canUseMayar
			? [
					{
						key: "mayar" as PaymentChoice,
						label: "QRIS",
						description: "Bayar cepat dan cashierless dengan QRIS",
					},
			  ]
			: []),
	];

	// ── URL sync ────────────────────────────────────────────────

	// Sync: URL query param → context state (on mount / URL change)
	useEffect(() => {
		if (!search.step) return;
		const requestedStep = search.step === "table" || search.step === "party" ? "menu" : search.step;
		if (requestedStep !== step) setStep(requestedStep as OrderStep);
	}, [search.step, setStep]);

	// Sync: context state → URL (when step changes)
	useEffect(() => {
		const params: Record<string, string> = { step };
		if (step === "receipt" && receipt?.orderId) {
			params.orderId = String(receipt.orderId);
		}
		if (search.table) {
			params.table = search.table;
		}
		navigate({ to: "/$username/order", params: { username }, search: params as any, replace: true });
	}, [step]);

	// Sync: table from URL on mount
	useEffect(() => {
		if (search.table) {
			setTableNumber(search.table);
		}
	}, [search.table]);


	// ── Side effects ────────────────────────────────────────────

	useEffect(() => {
		if (freeRefillOptIn !== null) return;
		if (!config.enableFreeRefillPrompt || !activeFreeRefillPromo) {
			setFreeRefillOptIn(false);
		}
	}, [activeFreeRefillPromo, config.enableFreeRefillPrompt, freeRefillOptIn]);

	useEffect(() => {
		if (!paymentOptions.find((option) => option.key === paymentChoice) || (paymentChoice === "wallet" && (!customer || (customer.walletBalance ?? 0) < total))) {
			setPaymentChoice(paymentOptions[0]?.key ?? "mayar");
		}
	}, [customer, paymentChoice, total]);

	useEffect(() => {
		if (!search.orderId || receipt) return;
		setReceipt({
			orderId: search.orderId as Id<"orders">,
			fallbackReference: `SELF-${String(search.orderId).slice(-4).toUpperCase()}`,
			mode: "mayar_pending",
			paymentChoice: "mayar",
			cartSnapshot: [],
		});
		setStep("receipt");
	}, [search.orderId, receipt]);

	useEffect(() => {
		if (!receipt || !currentOrder) return;
		const normalizedPaymentMethod = String(
			(currentOrder as any).paymentMethod ??
			(currentOrder as any).payment_method ??
			(currentOrder as any).paymentChoice ??
			(currentOrder as any).payment_choice ??
			""
		).toLowerCase();
		const isWalletPayment = normalizedPaymentMethod.includes("wallet") || normalizedPaymentMethod.includes("djiwa");
		const resolvedPaymentChoice = isWalletPayment ? "wallet" : "mayar";
		const resolvedMode = currentOrder.status === "paid" || currentOrder.status === "completed" ? "paid" : "mayar_pending";
		if (receipt.paymentChoice !== resolvedPaymentChoice || receipt.mode !== resolvedMode) {
			setReceipt((value) => value ? { ...value, paymentChoice: resolvedPaymentChoice, mode: resolvedMode } : value);
		}
	}, [currentOrder, receipt]);

	useEffect(() => {
		if (!receipt || !currentOrder) return;
		const gateway = currentOrder.paymentGateway as
			| { invoiceId?: string; invoiceUrl?: string; provider?: string }
			| undefined;
		if (receipt.paymentChoice !== "mayar") return;
		if (!receipt.invoiceId && gateway?.invoiceId) {
			setReceipt((value) =>
				value
					? {
							...value,
							invoiceId: gateway.invoiceId,
							invoiceUrl: value.invoiceUrl ?? gateway.invoiceUrl,
					  }
					: value
			);
		}
	}, [receipt, currentOrder]);

	useEffect(() => {
		if (step !== "menu" || menuMode !== "number" || !manualCode.trim()) return;
		const code = normalizeMenuCode(manualCode);
		if (menuNumberIndex.duplicates.has(code)) {
			setCodeFeedback(`Nomor menu ${code} belum unik. Pilih menu dari katalog atau minta staff memperbaiki nomor produk.`);
			return;
		}
		const product = productByMenuNumber.get(code);
		if (!product) return;
		const timer = window.setTimeout(() => {
			if (Array.isArray(product.variations) && product.variations.length > 0) {
				handleProductSelect(product);
				return;
			}
			setPendingNumberProduct(product);
			setPendingNumberQuantity(1);
		}, 350);
		return () => window.clearTimeout(timer);
	}, [manualCode, menuMode, menuNumberIndex.duplicates, productByMenuNumber, setCodeFeedback, step]);

	useEffect(() => {
		const invoiceId =
			receipt?.invoiceId ||
			((currentOrder?.paymentGateway as { invoiceId?: string } | undefined)
				?.invoiceId ?? undefined);
		if (!receipt || receipt.mode !== "mayar_pending" || !invoiceId) return;
		const timer = window.setInterval(async () => {
			try {
				const result = await getMayarInvoiceDetail({ invoiceId });
				const data = (result?.data as {
					status?: string;
					transactionStatus?: string;
					transactions?: Array<{ status?: string; transactionStatus?: string }>;
				} | null) ?? null;
				const normalized = String(data?.status || "").toLowerCase();
				const normalizedTransactionStatus = String(
					data?.transactionStatus || ""
				).toLowerCase();
				const isPaid =
					normalized.includes("paid") ||
					normalized.includes("success") ||
					normalizedTransactionStatus.includes("paid") ||
					normalizedTransactionStatus.includes("success") ||
					(data?.transactions || []).some((item) =>
						String(item?.status || item?.transactionStatus || "")
							.toLowerCase()
							.match(/paid|success/)
					);
				if (!isPaid) return;
				// Browser hanya membaca status provider. Settlement order dilakukan
				// oleh webhook terverifikasi agar tidak ada client-side fulfillment.
				return;
			} catch {
				// Retry quietly.
			}
		}, 5000);
		return () => window.clearInterval(timer);
	}, [receipt, currentOrder, getMayarInvoiceDetail]);

	// ── Handlers ────────────────────────────────────────────────

	const addItemAndOfferUpsells = (item: CartItem) => {
		addToCart(item);
		setUpsellMainItem(item);
		setUpsellSourceProductId(String(item.productId));
	};

	const handleProductSelect = (product: (typeof orderedProducts)[number]) => {
		const campaign = campaignByProductId.get(String(product._id));
		const now = Date.now();
		const campaignOpen = campaign?.lifecycle === "open"
			&& now >= Date.parse(campaign.saleWindowStart)
			&& now < Date.parse(campaign.saleWindowEnd);
		if (!campaignOpen) {
			toast.info(campaign?.lifecycle === "scheduled" ? `${product.name} belum dibuka untuk preorder` : `${product.name} sedang tidak tersedia untuk preorder`);
			return;
		}
		const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;
		if (hasVariations) {
			setProductSheet(product);
			return;
		}
		const pricing = calculateEffectivePrice(
			{ _id: product._id, price: product.price, categoryId: product.categoryId },
			memberDiscounts
		);
		addItemAndOfferUpsells({
			productId: product._id,
			name: product.name,
			price: pricing.finalPrice,
			originalPrice: pricing.originalPrice,
			quantity: 1,
			image: product.image,
			categoryId: product.categoryId,
			menuNumber: product.menuNumber,
		});
	};

	const approvePendingNumberProduct = () => {
		if (!pendingNumberProduct) return;
		const pricing = calculateEffectivePrice(
			{ _id: pendingNumberProduct._id, price: pendingNumberProduct.price, categoryId: pendingNumberProduct.categoryId },
			memberDiscounts
		);
		addItemAndOfferUpsells({
			productId: pendingNumberProduct._id,
			name: pendingNumberProduct.name,
			price: pricing.finalPrice,
			originalPrice: pricing.originalPrice,
			quantity: pendingNumberQuantity,
			image: pendingNumberProduct.image,
			categoryId: pendingNumberProduct.categoryId,
			menuNumber: pendingNumberProduct.menuNumber,
		});
		setPendingNumberProduct(null);
		setPendingNumberQuantity(1);
		setManualCode("");
	};

	const cancelPendingNumberProduct = () => {
		setPendingNumberProduct(null);
		setPendingNumberQuantity(1);
		setManualCode("");
	};

	const requestService = async (type: ServiceRequestType) => {
		const activeTable = tableNumber.trim() || search.table || undefined;
		if (!activeTable && !receipt?.orderId) {
			toast.error("Isi nomor meja atau checkout dulu untuk mengirim request");
			return;
		}
		await createServiceRequest({
			brandSlug,
			orderId: receipt?.orderId,
			requestType: type,
			tableNumber: activeTable,
			customerName: customerName.trim() || undefined,
		});
		toast.success(type === "call_staff" ? "Staff dipanggil" : "Request dessert dikirim");
		setServiceOpen(false);
	};

	const focusCheckoutField = (label: string) => {
		if (typeof document === "undefined") return;
		window.requestAnimationFrame(() => {
			const field = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
			field?.scrollIntoView({ behavior: "smooth", block: "center" });
			field?.focus();
		});
	};

	const rejectCheckout = (message: string, fieldLabel?: string) => {
		setCheckoutError(message);
		toast.error(message);
		if (fieldLabel) focusCheckoutField(fieldLabel);
	};

	const redirectToCustomerAuth = () => {
		const returnTo = `${window.location.origin}/${encodeURIComponent(username)}/order?step=checkout`;
		redirectToDjiwaAppLogin(returnTo);
	};

	const continueToShipping = () => {
		if (!isAuthenticated) {
			redirectToCustomerAuth();
			return;
		}
		setStep("shipping");
	};

	useEffect(() => {
		if (authLoading || isAuthenticated || step !== "shipping") return;
		redirectToCustomerAuth();
	}, [authLoading, isAuthenticated, step, username]);

	const checkout = async () => {
		if (isSubmitting) return;
		if (!isAuthenticated) {
			setCheckoutError("Login customer diperlukan sebelum membuat preorder.");
			redirectToCustomerAuth();
			return;
		}
		if (typeof navigator !== "undefined" && !navigator.onLine) {
			rejectCheckout("Koneksi internet sedang offline. Sambungkan internet lalu coba lagi.");
			return;
		}
		if (!cart.length) {
			toast.error("Pilih minimal satu produk");
			return;
		}
		if (!shippingReceiverName.trim()) {
			rejectCheckout("Nama penerima wajib diisi", "Nama penerima");
			return;
		}
		if (!shippingAddress.trim()) {
			rejectCheckout("Alamat pengiriman wajib diisi", "Alamat pengiriman");
			return;
		}
		if (!hasValidCustomerPhone(shippingPhone)) {
			rejectCheckout("Isi nomor WhatsApp penerima yang valid", "Nomor WhatsApp penerima");
			return;
		}
		if (!shippingProvider) {
			rejectCheckout("Pilih kurir pengiriman terlebih dahulu");
			return;
		}
		if (!paymentOptions.length) {
			rejectCheckout("Metode pembayaran belum tersedia. Silakan coba lagi nanti.");
			return;
		}
		if (paymentChoice === "mayar") {
			if (isAuthenticated && missingContactFields.length > 0) {
				toast.error(getCustomerContactMessage(missingContactFields));
				window.location.assign(`https://djiwatentram.yumme.id/${username}/profile`);
				return;
			}
		}
		if (paymentChoice === "wallet" && (!isAuthenticated || missingContactFields.length > 0)) {
			toast.error(isAuthenticated ? getCustomerContactMessage(missingContactFields) : "Masuk dan lengkapi profil untuk pembayaran Djiwa Pay");
			if (isAuthenticated) window.location.assign(`https://djiwatentram.yumme.id/${username}/profile`);
			else navigate({ to: "/masuk" });
			return;
		}
		setIsSubmitting(true);
		setCheckoutError(null);
		checkoutRequestKeyRef.current = checkoutRequestKeyRef.current ?? (globalThis.crypto?.randomUUID?.() || `customer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		try {
			const orderCustomerName = shippingReceiverName.trim();
			const normalizedNotes = notes.trim() || undefined;
			const guestAccessToken = !isAuthenticated && typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null;
			const payload = {
				items: cart.map((item) => ({
					productId: item.productId,
					productName: item.name,
					categoryId: item.categoryId,
					variant: item.variant,
					quantity: item.quantity,
					price: item.price,
					originalPrice: item.originalPrice,
				})),
				totalAmount: total,
				taxAmount,
				serviceChargeAmount,
				paymentMethod: paymentChoice === "mayar" ? "qris" : "wallet",
				paymentChoice,
				idempotencyKey: checkoutRequestKeyRef.current,
				customerName: orderCustomerName,
				customerEmail: checkoutEmail || null,
				customerPhone: shippingPhone.trim(),
				orderType: "takeaway" as const,
				deliveryAddress: shippingAddress.trim(),
				deliveryProvider: shippingProvider,
				source: "customer_self_service" as const,
				brandSlug,
				isOpenBill: true,
				paymentReceiptKind: "gateway_pending",
				notes: normalizedNotes,
				discountAmount: getAdditionalOrderDiscount(promoDiscount, djiwaPayDiscount),
				voucherId: djiwaPayDiscount > 0 ? "djiwa-pay-20" : null,
				receiptMeta: {
					happyHourApplied: cart.some((item) => {
						const pricing = calculateEffectivePrice({ _id: item.productId, price: item.originalPrice ?? item.price, categoryId: item.categoryId }, memberDiscounts);
						return pricing.isHappyHour && item.price < (item.originalPrice ?? item.price);
					}),
					...(djiwaPayDiscount > 0 ? { djiwaPayDiscountPercent, djiwaPayDiscount, djiwaPayDiscountPaymentMethod: "wallet" } : {}),
					merchandiseFulfillment: {
						fulfillmentType: "physical_preorder",
						receiverName: shippingReceiverName.trim(),
						address: shippingAddress.trim(),
						phone: shippingPhone.trim(),
						shippingStatus: "awaiting_payment",
						provider: shippingProvider,
					},
				},
				customerSourceId: customer?.sourceId,
				guestAccessToken,
			};

			if (paymentChoice === "wallet") {
				if (!customer?.sourceId || !customer.email) throw new Error("Login customer diperlukan untuk pembayaran saldo");
				const orderId = await createOrder({
					...payload,
					paymentMethod: "wallet",
					paymentReceiptKind: "wallet_pending",
					isOpenBill: true,
				});
				persistMerchandiseOrderAccessKey(orderId, checkoutRequestKeyRef.current);
				if (!isAuthenticated) rememberGuestOrder(String(orderId), guestAccessToken ?? undefined);
				let walletHoldId: string | null = null;
				let walletCaptured = false;
				try {
					const holdResponse = await invokeEdgeFunction<{ result?: { ok?: boolean; hold_id?: string; available_balance?: number; required?: number } }>("customer-wallet", {
						action: "hold",
						sourceId: customer.sourceId,
						email: customer.email,
						orderId: String(orderId),
						amount: Math.round(total),
						idempotencyKey: `${checkoutRequestKeyRef.current}:hold`,
					});
					const hold = holdResponse.result;
					if (!hold?.ok || !hold.hold_id) {
						const available = Number(hold?.available_balance ?? 0);
						throw new Error(`Saldo Djiwa Pay tidak cukup. Saldo tersedia ${currency(available)}, total order ${currency(total)}.`);
					}
					walletHoldId = hold.hold_id;
					await invokeEdgeFunction("customer-wallet", {
						action: "settle-order",
						sourceId: customer.sourceId,
						email: customer.email,
						orderId: String(orderId),
						holdId: walletHoldId,
						idempotencyKey: checkoutRequestKeyRef.current,
					});
					walletCaptured = true;
					setReceipt({ orderId, fallbackReference: `SELF-${String(orderId).slice(-4).toUpperCase()}`, mode: "paid", paymentChoice, cartSnapshot: cart });
				} catch (error) {
					if (walletHoldId && !walletCaptured) {
						await invokeEdgeFunction("customer-wallet", {
							action: "release",
							sourceId: customer.sourceId,
							email: customer.email,
							holdId: walletHoldId,
							idempotencyKey: `${checkoutRequestKeyRef.current}:release`,
							reason: "Checkout Djiwa Pay gagal, saldo dikembalikan",
						}).catch(() => undefined);
					}
					await updateOrderStatus({ id: orderId, status: "cancelled" }).catch(() => undefined);
					throw error;
				}
			} else if (paymentChoice === "mayar") {
				const orderId = await createOrder({
					...payload,
					paymentReceiptKind: "gateway_pending",
					isOpenBill: true,
				});
				persistMerchandiseOrderAccessKey(orderId, checkoutRequestKeyRef.current);
				if (!isAuthenticated) rememberGuestOrder(String(orderId), guestAccessToken ?? undefined);
				const redirectUrl =
					typeof window !== "undefined"
						? `${window.location.origin}/${encodeURIComponent(username)}/order?step=receipt&session=${encodeURIComponent(sessionRef.current)}&orderId=${encodeURIComponent(String(orderId))}`
						: undefined;
				let invoice:
					| {
							statusCode?: number;
							messages?: string;
							data?: { id?: string; transactionId?: string; link?: string };
					  }
					| undefined;
				try {
					invoice = await createMayarInvoice({
						orderId: String(orderId),
						idempotencyKey: checkoutRequestKeyRef.current,
						paymentMethod: "qris",
						name: shippingReceiverName.trim(),
						email: checkoutEmail || undefined,
						mobile: shippingPhone.trim(),
						redirectUrl,
						description: `Self-service order ${storeName}`,
						expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
						extraData: { orderId: String(orderId), shippingProvider },
						items: cart.map((item) => ({
							quantity: item.quantity,
							rate: item.price,
							description: item.variant ? `${item.name} (${item.variant})` : item.name,
						})),
					});
					if (!invoice?.data?.id) {
						throw new Error(invoice?.messages || "Gagal membuat invoice pembayaran");
					}
					await updateOrderPaymentGateway({
						id: orderId,
						paymentGateway: {
							provider: "mayar",
							invoiceId: invoice.data.id,
							transactionId: invoice.data.transactionId,
							invoiceUrl: invoice.data.link,
							status: "created",
						},
					});
				} catch (error) {
					// Jangan membatalkan order: invoice Mayar bisa sudah tercipta/terbayar
					// walau response browser gagal diterima. Rekonsiliasi server akan memverifikasi provider.
					await updateOrderStatus({ id: orderId, status: "pending" }).catch(() => undefined);
					throw error;
				}
				setReceipt({
					orderId,
					fallbackReference: `SELF-${String(orderId).slice(-4).toUpperCase()}`,
					mode: "mayar_pending",
					paymentChoice,
					invoiceId: invoice?.data?.id,
					invoiceUrl: invoice?.data?.link,
					cartSnapshot: cart,
					shipping: { provider: shippingProvider ?? undefined, receiverName: shippingReceiverName.trim(), address: shippingAddress.trim(), phone: shippingPhone.trim() },
				});

				if (invoice?.data?.link && typeof window !== "undefined") {
					window.location.assign(invoice.data.link);
					return;
				}
			} else {
				throw new Error("Metode pembayaran Merchandise tidak tersedia");
			}
			setCart([]);
			checkoutRequestKeyRef.current = null;
			setStep("receipt");
		} catch (error) {
			const message = (error as Error).message || "Checkout gagal";
			setCheckoutError(message);
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	const retryPayment = async () => {
		if (retryingPayment || !receipt?.orderId || !currentOrder) return;
		const orderId = String(receipt.orderId);
		const paymentMethod = String((currentOrder as any).paymentMethod ?? receipt.paymentChoice).toLowerCase();
		if (currentOrder.status === "paid" || currentOrder.status === "completed") {
			toast.info("Pesanan ini sudah lunas");
			return;
		}
		setRetryingPayment(true);
		try {
			await updateOrderStatus({ id: receipt.orderId, status: "pending" });
			if (paymentMethod.includes("wallet") || paymentMethod.includes("djiwa")) {
				if (!customer?.sourceId || !customer.email) throw new Error("Masuk dan lengkapi profil untuk retry Djiwa Pay");
				const key = `retry-wallet-${orderId}-${Date.now()}`;
				const holdResponse = await invokeEdgeFunction<{ result?: { ok?: boolean; hold_id?: string; available_balance?: number } }>("customer-wallet", {
					action: "hold",
					sourceId: customer.sourceId,
					email: customer.email,
					orderId,
					amount: Math.round(Number((currentOrder as any).totalAmount ?? 0)),
					idempotencyKey: `${key}:hold`,
				});
				if (!holdResponse.result?.ok || !holdResponse.result.hold_id) throw new Error("Saldo Djiwa Pay tidak cukup atau pembayaran belum dapat diproses");
				await invokeEdgeFunction("customer-wallet", { action: "settle-order", sourceId: customer.sourceId, email: customer.email, orderId, holdId: holdResponse.result.hold_id, idempotencyKey: key });
				toast.success("Pembayaran Djiwa Pay berhasil diproses");
			} else {
				const currentGateway = (currentOrder as any)?.paymentGateway || (currentOrder as any)?.payment_gateway || {};
				const finalInvoiceStatus = ["expired", "cancelled", "canceled", "void"].includes(String(currentGateway.status || "").toLowerCase());
				if ((currentGateway.invoiceId || (currentOrder as any)?.gatewayInvoiceId) && !finalInvoiceStatus) {
					throw new Error("Invoice lama masih aktif; tunggu konfirmasi status dari Mayar sebelum membuat invoice baru");
				}
				const orderAccessKey = window.localStorage.getItem(`merchandise-order-access:${orderId}`);
				if (!orderAccessKey) throw new Error("Kunci akses order tidak tersedia di perangkat ini; hubungi admin untuk bantuan");
				const redirectUrl = `${window.location.origin}/${encodeURIComponent(username)}/order?step=receipt&session=${encodeURIComponent(sessionRef.current)}&orderId=${encodeURIComponent(orderId)}`;
				const invoice = await createMayarInvoice({ orderId, idempotencyKey: orderAccessKey, redirectUrl, paymentMethod: "qris", mobile: checkoutPhone || "", forceNew: true });
				if (!invoice?.data?.id || !invoice.data.link) throw new Error(invoice?.messages || "Link pembayaran baru tidak tersedia");
				await updateOrderPaymentGateway({ id: receipt.orderId, paymentGateway: {
					provider: "mayar",
					invoiceId: invoice.data.id,
					transactionId: invoice.data.transactionId,
					invoiceUrl: invoice.data.link,
					expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
					status: "created",
					retryOf: currentGateway.invoiceId ?? (currentOrder as any).gatewayInvoiceId ?? (currentOrder as any).gateway_invoice_id ?? null,
					previousInvoices: [
						...(Array.isArray(currentGateway.previousInvoices) ? currentGateway.previousInvoices : []),
						...(currentGateway.invoiceId ? [{ invoiceId: currentGateway.invoiceId, transactionId: currentGateway.transactionId ?? null, status: currentGateway.status ?? "unknown", verifiedAt: currentGateway.providerStatusVerifiedAt ?? null }] : []),
					],
				} });
				setReceipt((value) => value ? { ...value, mode: "mayar_pending", paymentChoice: "mayar", invoiceId: invoice.data?.id, invoiceUrl: invoice.data?.link } : value);
				window.location.assign(invoice.data.link);
				return;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Retry pembayaran gagal";
			setCheckoutError(message);
			toast.error(message);
		} finally {
			setRetryingPayment(false);
		}
	};

	// ── Loading state ────────────────────────────────────────────

	if (
		siteSettings === undefined ||
		brandSettings === undefined
	) {
		return <CustomerPageSkeleton label="Menyiapkan halaman customer" />;
	}

	if (brandSettings?.isActive === false || !config.enabled) {
		return (
			<div className="flex min-h-app items-center justify-center bg-background px-4">
				<div className="max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
					<Djiwa3DIcon name="navigation-order" size="md" alt="" className="mx-auto h-8 w-8 object-contain" />
					<h1 className="mt-3 font-display text-lg font-black">Halaman ordering belum aktif</h1>
					<p className="mt-2 text-xs text-muted-foreground">
						Customer self-service untuk brand ini sedang dimatikan dari admin.
					</p>
				</div>
			</div>
		);
	}

	// ── Render ───────────────────────────────────────────────────

	const handleOrderHeaderBack = () => {
		window.location.assign(`https://djiwatentram.yumme.id/${encodeURIComponent(username)}`);
	};

	return (
		<div className="app-page merchandise-app min-h-app">
			<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
				{/* ── Sticky header ──────────────────────────────── */}
				<CustomerHeader
					eyebrow={step.toUpperCase()}
					title={storeName}
					subtitle="Merchandise Store"
					onBack={handleOrderHeaderBack}
					showPressHint
					leading={<span className="flex flex-col items-center justify-center gap-0.5 leading-none"><img src="/home-header-icon.png" alt="" className="h-4 w-4 object-contain" aria-hidden="true" /><span className="text-[9px] font-bold text-muted-foreground">Home</span></span>}
					right={<span className="inline-flex min-h-9 items-center rounded-full bg-primary/10 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-primary">{totalItems} item</span>}
				/>

				<main
					className={
						step === "menu"
							? "flex-1 overflow-y-auto pb-safe-with-nav"
							: step === "receipt"
								? "flex-1 overflow-y-auto pb-[calc(15rem+env(safe-area-inset-bottom))]"
								: "flex-1 min-h-0 overflow-y-auto pb-32"
					}
				>
					<CustomerOrderProgress step={step} />
					{/* ── Auth header (always visible, no welcome) ── */}
					<div className="mt-3 mb-2 px-3">
						<AuthHeader
							isAuthenticated={isAuthenticated}
							customer={(customer ?? null) as any}
							isLoading={authLoading}
							onOpenAuth={() => navigate({ to: "/masuk" })}
							onLogout={logout}
							onProfileClick={() => window.location.assign(`https://djiwatentram.yumme.id/${username}/profile`)}
						/>
					</div>

					{/* ── Refill section ──────────────────────────── */}
					{step === "refill" ? (
						<section className="space-y-2 px-2 py-2">
							<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
								<div className="flex items-center gap-2.5">
									<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bell className="h-5 w-5" /></div>
									<div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: themeColor }}>Step 2</p><h2 className="text-base font-black">Tambahkan free refill?</h2></div>
								</div>
								<div className="mt-2.5 rounded-xl border border-primary/15 bg-primary/5 p-2.5">
									<p className="text-xs font-black">{activeFreeRefillPromo?.name || "Free refill minuman tersedia"}</p>
									<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{activeFreeRefillPromo?.refillPrice ? `Tambahan ${currency(activeFreeRefillPromo.refillPrice)} per orang. Estimasi total ${currency((activeFreeRefillPromo.refillPrice || 0) * Math.max(1, partySize))}.` : `Promo refill aktif untuk ${partySize} orang.`}</p>
								</div>
								<div className="mt-2.5 grid grid-cols-2 gap-1.5">
									<button type="button" className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-black" onClick={() => { setFreeRefillOptIn(false); setStep("menu"); }}>Tidak sekarang</button>
									<button type="button" className="rounded-xl px-3 py-2.5 text-xs font-black text-white shadow-sm" style={{ background: themeColor }} onClick={() => { setFreeRefillOptIn(true); setStep("menu"); }}>Ya, tambahkan</button>
								</div>
							</div>
						</section>
					) : null}

					{/* ── Menu section ────────────────────────────── */}
					{step === "menu"
						? renderMenuSection({ activeCategoryId, approvePendingNumberProduct, cancelPendingNumberProduct, cart, campaignByProductId, catalogQuery, codeFeedback, config, discounts: memberDiscounts, filteredProducts, freeRefillCharge, handleProductSelect, isMenuError, isMenuLoading, onRetryMenu: () => setMenuRefreshTrigger((value) => value + 1), logoUrl, manualCode, menuMode, orderedCategories, partySize, pendingNumberProduct, pendingNumberQuantity, setActiveCategoryId, setCartOpen, setCatalogQuery, setManualCode, setMenuMode, setPendingNumberQuantity, setScannerOpen, storeName, tableNumber, themeColor, total, totalItems, updateCartQuantity })
						: null}

					{/* ── Checkout section ────────────────────────── */}
					{step === "checkout" ? renderCheckoutSection({ cart, checkout, config, currency, customerName, shippingReceiverName, shippingAddress, shippingPhone, guestEmail, isAuthenticated, djiwaPayDiscount, isSubmitting, notes, onBackToMenu: () => setStep("menu"), onContinueToShipping: continueToShipping, paymentChoice, paymentOptions, productGrossSubtotal, promoDiscount, serviceChargeAmount, serviceChargeRate, setCustomerName, setShippingReceiverName, setShippingAddress, setShippingPhone, setGuestEmail, setNotes, setPaymentChoice, taxAmount, taxEnabled, taxRate, total, walletBalance: customer?.walletBalance ?? 0, onTopup: () => window.location.assign(`https://djiwatentram.yumme.id/${username}/saldo`), checkoutError }) : null}
					{step === "shipping" ? <ShippingSection cart={cart} shippingProvider={shippingProvider} setShippingProvider={setShippingProvider} onBackToCheckout={() => setStep("checkout")} onContinueToPayment={checkout} isSubmitting={isSubmitting} productSubtotal={productSubtotal} total={total} checkoutError={checkoutError} /> : null}

					{/* ── Receipt section ─────────────────────────── */}
					{step === "receipt" && receipt ? renderReceiptSection({ actionsHidden: cartOpen, cartSnapshot: receipt.cartSnapshot, currentOrder, logoUrl, onOrderAgain: startNewOrder, onRetryPayment: retryPayment, retryPaymentLabel: String((currentOrder as any)?.paymentMethod ?? (currentOrder as any)?.payment_method ?? receipt.paymentChoice).toLowerCase().includes("wallet") ? "Coba bayar ulang dengan Djiwa Pay" : "Buat link pembayaran baru", retryingPayment, onHome: goHome, onOpenService: () => setServiceOpen(true), receipt, storeName, total }) : null}
				</main>

				{/* ── Bottom bar ──────────────────────────────────── */}
				{step !== "checkout" && !cartOpen && !serviceOpen && !scannerOpen && !productSheet ? (
					<div className="app-bottom-bar fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-2 pb-2 pt-1.5">
						<div className="app-card grid grid-cols-4 gap-1.5 p-1.5">
							<BottomButton label="Djiwa App" icon={<Djiwa3DIcon name="navigation-home" size="micro" alt="" className="h-5 w-5 object-contain" />} onClick={() => window.location.assign(`https://djiwatentram.yumme.id/${encodeURIComponent(username)}`)} />
							<BottomButton label="Menu" icon={<Djiwa3DIcon name="delivery-management" size="micro" alt="" className="h-5 w-5 object-contain" />} onClick={() => setStep("menu")} />
							<BottomButton label="Keranjang" icon={<Djiwa3DIcon name="navigation-order" size="micro" alt="" className="h-5 w-5 object-contain" />} onClick={() => setCartOpen(true)} badge={totalItems > 0 ? String(totalItems) : undefined} />
							<BottomButton label={receipt ? "Struk" : "Checkout"} icon={<Djiwa3DIcon name="order-receipt" size="micro" alt="" className="h-5 w-5 object-contain" />} onClick={() => setStep(receipt ? "receipt" : "checkout")} primary disabled={!receipt && !cart.length} />
						</div>
					</div>
				) : null}
			</div>

			{/* ── Cart Sheet ─────────────────────────────────────── */}
			<Sheet open={cartOpen} onOpenChange={setCartOpen}>
				<SheetContent side="bottom" showCloseButton={false} className="z-[1002] max-h-[85vh] overflow-hidden rounded-t-3xl bg-background p-0">
					<motion.div
						initial={shouldReduceMotion ? false : { opacity: 0, y: 28 }}
						animate={{ opacity: 1, y: 0 }}
						transition={popupTransition}
						className="flex h-full flex-col"
					>
						<div className="border-b border-border px-4 pb-3 pt-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: themeColor }}>Review pesanan</p><h3 className="font-display text-lg font-black">Order basket</h3></div><button type="button" aria-label="Tutup keranjang" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" onClick={() => setCartOpen(false)}><X className="h-3.5 w-3.5" /></button></div></div>
						<div className="flex-1 overflow-y-auto px-4 py-3">{cart.length === 0 ? <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-muted-foreground"><Djiwa3DIcon name="navigation-order" size="sm" alt="" className="h-8 w-8 object-contain" /><p className="mt-2 font-display text-sm font-bold text-foreground">Keranjang masih kosong</p><p className="mt-1 text-xs">Pilih menu untuk mulai memesan.</p></div> : <div className="space-y-2.5">{cart.map((item) => <CartRow key={`${item.productId}-${item.variant || "default"}`} item={item} onDecrease={() => updateCartQuantity(item.productId, item.variant, -1)} onIncrease={() => updateCartQuantity(item.productId, item.variant, 1)} onRemove={() => setCart((current) => current.filter((entry) => entry.productId !== item.productId || entry.variant !== item.variant))} />)}</div>}</div>
						<div className="border-t border-border px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3"><SummaryCardLines productGrossSubtotal={productGrossSubtotal} freeRefillCharge={freeRefillCharge} promoDiscount={promoDiscount} taxAmount={taxAmount} taxEnabled={taxEnabled} taxRate={taxRate} serviceChargeAmount={serviceChargeAmount} serviceChargeRate={serviceChargeRate} total={total} /><button type="button" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-black text-white" style={{ backgroundColor: themeColor }} onClick={() => {
							setCartOpen(false);
							setStep("checkout");
						}}>Lanjut checkout</button></div>
					</motion.div>
				</SheetContent>
			</Sheet>

			{/* ── Service Sheet ──────────────────────────────────── */}
			<Sheet open={serviceOpen} onOpenChange={setServiceOpen}>
				<SheetContent side="bottom" className="z-[60] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-3xl p-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
					<motion.div
						initial={shouldReduceMotion ? false : { opacity: 0, y: 28 }}
						animate={{ opacity: 1, y: 0 }}
						transition={popupTransition}
						className="space-y-3 px-4 py-5"
					>
						<div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: themeColor }}>Layanan customer</p><h3 className="mt-0.5 text-lg font-black">Hubungi tim restoran</h3><p className="mt-1 text-xs text-muted-foreground">Request akan langsung muncul di halaman admin operasional.</p></div>
						<button type="button" className="flex w-full items-center gap-2.5 rounded-xl bg-[linear-gradient(135deg,#ef4444,#b91c1c)] px-3 py-4 text-white shadow-sm" onClick={() => requestService("call_staff")}><PhoneCall className="h-4 w-4" /><div><p className="font-black text-sm">Panggil staff</p><p className="text-xs text-white/75">Panggil staff ke meja customer.</p></div></button>
					</motion.div>
				</SheetContent>
			</Sheet>

			{/* ── Scanner Sheet ──────────────────────────────────── */}
			<Sheet open={scannerOpen} onOpenChange={setScannerOpen}>
				<SheetContent side="bottom" showCloseButton={false} className="rounded-t-3xl p-0">
					<Suspense fallback={<div className="p-6 text-center text-xs text-muted-foreground">Menyiapkan scanner...</div>}>
						<BarcodeScanner onClose={() => setScannerOpen(false)} onDetected={(rawValue) => { const product = productByMenuNumber.get(normalizeMenuCode(rawValue.replace(/\D/g, ""))) || productByMenuNumber.get(normalizeMenuCode(rawValue)); if (!product) { toast.error("Barcode tidak cocok dengan nomor produk"); return; } handleProductSelect(product); setScannerOpen(false); }} />
					</Suspense>
				</SheetContent>
			</Sheet>

			{/* ── Product Sheet ──────────────────────────────────── */}
			<Sheet open={Boolean(productSheet)} onOpenChange={(open) => !open && setProductSheet(null)}>
				<SheetContent side="bottom" showCloseButton={false} className="h-auto max-h-[calc(100dvh-0.75rem)] overflow-hidden rounded-t-3xl p-0">
					<Suspense fallback={<div className="p-6 text-center text-xs text-muted-foreground">Menyiapkan detail menu...</div>}>
						<ProductSheet product={productSheet} discounts={memberDiscounts ?? []} onClose={() => setProductSheet(null)} onAdd={(item) => { addItemAndOfferUpsells(item); setProductSheet(null); }} />
					</Suspense>
				</SheetContent>
			</Sheet>

			<Sheet
				open={Boolean(upsellMainItem && upsellSourceProductId && visibleUpsellRecommendations.length > 0 && upsellTitle && upsellSkipLabel && upsellAddedLabel)}
				onOpenChange={(open) => {
					if (!open) {
						setUpsellMainItem(null);
						setUpsellSourceProductId(null);
					}
				}}
			>
				<SheetContent side="bottom" showCloseButton={false} className="z-[70] h-[min(78dvh,640px)] max-h-[calc(100dvh-1rem)] overflow-hidden rounded-t-3xl p-0">
					<Suspense fallback={<div className="space-y-3 p-4" aria-label="Memuat rekomendasi"><div className="h-5 w-2/3 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded-2xl bg-muted" /><div className="h-20 animate-pulse rounded-2xl bg-muted" /></div>}>
						<UpsellSheet
							open
							mainItem={upsellMainItem}
							recommendations={visibleUpsellRecommendations}
							discounts={memberDiscounts ?? []}
							title={upsellTitle}
							skipLabel={upsellSkipLabel}
							addedLabel={upsellAddedLabel}
							onClose={() => { setUpsellMainItem(null); setUpsellSourceProductId(null); }}
							onAdd={(_recommendation, item) => { addToCart(item); }}
							onChooseOptions={(recommendation) => {
							const product = products?.find((entry) => entry._id === recommendation.recommendedProductSourceId);
							if (product) {
								setUpsellMainItem(null);
								setUpsellSourceProductId(null);
								setProductSheet(product);
							}
						}}
						/>
					</Suspense>
				</SheetContent>
			</Sheet>
		</div>
	);
}
