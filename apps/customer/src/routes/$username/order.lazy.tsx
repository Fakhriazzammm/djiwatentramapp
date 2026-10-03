import {
	Bell,
	ChevronRight,
	Loader2,
	LogIn,
	MapPin,
	LocateFixed,
	Pencil,
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
	useHybridActiveDiscounts,
	useHybridBestSellers,
	useHybridCategories,
	useHybridAllProducts,
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
	useHybridUpdateOrderStatus,
} from "@/hooks/use-hybrid-write-actions";
import { cn } from "@/lib/utils";
import { calculateOrderTax } from "@yumipos/web-shared/lib/tax-calculator";
import { getAdditionalOrderDiscount } from "@yumipos/web-shared/lib/order-pricing";
import { CustomerHeader } from "@/components/customer/customer-shell";
import { calculateEffectivePrice, isDjiwaPayCampaignActive, isFreeRefillActive } from "@/lib/utils/pricing";
import type { Doc, Id } from "@/types/backend-compat";

import { useOrderContext } from "@/hooks/use-order-context";
import type { OrderStep } from "@/hooks/use-order-context";
import type { CartItem, ServiceRequestType, PaymentChoice } from "@/components/customer/types";
import { CUSTOMER_ORDERING_DEFAULTS, currency, normalizeMenuCode, rememberGuestOrder } from "@/components/customer/types";
import { BottomButton, CartRow, CustomerOrderModeSelection, CustomerOrderProgress, SummaryCardLines, type CustomerOrderMode } from "@/components/customer/shared-components";
const BarcodeScanner = lazy(() => import("@/components/customer/barcode-scanner").then((module) => ({ default: module.BarcodeScanner })));
const ProductSheet = lazy(() => import("@/components/customer/product-sheet").then((module) => ({ default: module.ProductSheet })));
import { renderMenuSection } from "@/components/customer/menu-section";
import { renderCheckoutSection } from "@/components/customer/checkout-section";
import { renderReceiptSection } from "@/components/customer/receipt-section";
import { UpsellSheet } from "@/components/customer/upsell-sheet";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { useCustomerOrders } from "@/hooks/use-customer-data";
import { recordRecommendationEvent } from "@/lib/recommendation-events";
import { AuthModal } from "@/components/customer/auth-modal";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";
import { getCustomerContactMessage, getMissingCustomerFields, hasValidCustomerPhone } from "@/lib/customer-profile-completeness";
import { reserveDjiwaRunCheckoutReward, releaseDjiwaRunCheckoutReward, finalizeDjiwaRunCheckoutReward } from "@/lib/djiwa-run-client";

export const Route = createLazyFileRoute("/$username/order")({
	component: OrderPage,
});

function OrderPage() {
	const shouldReduceMotion = useReducedMotion();
	const popupTransition = { type: "spring" as const, stiffness: 320, damping: 30, mass: 0.8 };
	const navigate = useNavigate();
	const { username } = Route.useParams();
	const search = Route.useSearch();
	const brandSlug = import.meta.env.VITE_BRAND_SLUG || "djiwatentram";
	const [menuRefreshTrigger, setMenuRefreshTrigger] = useState(0);
	const menuScrollRef = useRef<HTMLElement | null>(null);
	const categorySelectionLockRef = useRef(0);
	const checkoutRequestKeyRef = useRef<string | null>(null);
	const activityProductAppliedRef = useRef<string | null>(null);

	const siteSettings = useHybridSiteSettings();
	const brandSettings = useHybridBookingSettings(brandSlug);
	const categories = useHybridCategories(menuRefreshTrigger);
	const bestSellers = useHybridBestSellers(menuRefreshTrigger);
	const { orders: customerOrders } = useCustomerOrders();
	const recentProductIds = useMemo(() => customerOrders.filter((order) => ["paid", "completed", "settled"].includes(String(order.status).toLowerCase())).sort((a, b) => b.createdAt - a.createdAt).flatMap((order) => order.items.map((item) => String(item.productId))).filter((id, index, all) => id && all.indexOf(id) === index).slice(0, 8), [customerOrders]);
	const products = useHybridAllProducts(menuRefreshTrigger);
	const discounts = useHybridActiveDiscounts();
	const createOrder = useHybridCreateOrder();
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
		clearCart,
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
		authModalOpen,
		setAuthModalOpen,
		authError,
		setAuthError,
		sessionRef,
		addToCart,
		updateCartQuantity,
	} = useOrderContext();
	const selectMenuCategory = (value: Id<"categories"> | null) => { categorySelectionLockRef.current = Date.now() + 900; setActiveCategoryId(value); };
	const [orderMode, setOrderMode] = useState<CustomerOrderMode>("dine_in");
	const [orderModeConfirmed, setOrderModeConfirmed] = useState(false);
	const [deliveryProvider, setDeliveryProvider] = useState<"gojek" | "grab">("grab");
	const [deliveryAddressOverride, setDeliveryAddressOverride] = useState<string | null>(null);
	const [deliveryAddressEditorOpen, setDeliveryAddressEditorOpen] = useState(false);
	const [deliveryAddressPickerOpen, setDeliveryAddressPickerOpen] = useState(false);
	const [saveAddressToProfile, setSaveAddressToProfile] = useState(true);
	const [deliveryAddressFields, setDeliveryAddressFields] = useState({ street: "", rtRw: "", district: "", city: "", province: "", postalCode: "", landmark: "" });
	const [deliveryLocation, setDeliveryLocation] = useState<{ latitude: number; longitude: number; postalCode?: string } | null>(null);
	const [deliveryLocationLoading, setDeliveryLocationLoading] = useState(false);
	const [deliveryLocationError, setDeliveryLocationError] = useState<string | null>(null);
	const [shippingQuote, setShippingQuote] = useState<{ fee: number; courierCode: string; expiresAt: number } | null>(null);
	const [shippingQuoteLoading, setShippingQuoteLoading] = useState(false);
	const [shippingQuoteError, setShippingQuoteError] = useState<string | null>(null);
	const [, setShippingClock] = useState(() => Date.now());
	const [checkoutError, setCheckoutError] = useState<string | null>(null);
	const [guestEmail, setGuestEmail] = useState("");
	const [guestPhone, setGuestPhone] = useState("");
	const [retryingPayment, setRetryingPayment] = useState(false);

	const startNewOrder = () => {
		checkoutRequestKeyRef.current = null;
		setReceipt(null);
		clearCart();
		setCartOpen(false);
		setServiceOpen(false);
		setScannerOpen(false);
		setProductSheet(null);
		setCheckoutError(null);
		setGuestEmail("");
		setGuestPhone("");
		setDessertLater(false);
		setNotes("");
		setTableNumber("");
		setOrderMode("dine_in");
		setOrderModeConfirmed(false);
		setDeliveryProvider("gojek");
		setDeliveryAddressOverride(null);
		setDeliveryAddressEditorOpen(false);
		setDeliveryAddressPickerOpen(false);
		setSaveAddressToProfile(true);
		setDeliveryAddressFields({ street: "", rtRw: "", district: "", city: "", province: "", postalCode: "", landmark: "" });
		setDeliveryLocation(null);
		setDeliveryLocationError(null);
		setStep("table");
	};
	const goHome = () => navigate({ to: "/$username", params: { username } });

	const { isAuthenticated, customer, login, register, resetPassword, logout, signInWithGoogle, refreshCustomer, isLoading: authLoading, registrationNeedsEmailConfirm } = useCustomerAuth();
	useEffect(() => {
		if (step !== "menu" || !bestSellers?.length) return;
		for (const item of bestSellers.slice(0, 2)) void recordRecommendationEvent({ eventType: "impression", recommendedProductSourceId: item.productId, strategy: recentProductIds.length > 0 ? "recent_plus_bestseller" : "bestseller", customerSourceId: customer?.sourceId ?? null });
	}, [bestSellers, customer?.sourceId, recentProductIds.length, step]);
	const missingContactFields = getMissingCustomerFields(customer);
	const profileDeliveryAddress = isAuthenticated ? customer?.address?.trim() || "" : "";
	const formatDeliveryAddress = (fields: typeof deliveryAddressFields) => [
		fields.street,
		fields.rtRw && `RT/RW ${fields.rtRw}`,
		fields.district && `Kec. ${fields.district}`,
		fields.city,
		fields.province,
		fields.postalCode,
		fields.landmark && `Patokan: ${fields.landmark}`,
	].filter(Boolean).join(", ");
	const deliveryAddress = deliveryAddressOverride ?? (formatDeliveryAddress(deliveryAddressFields) || profileDeliveryAddress);
	useEffect(() => {
		if (deliveryAddressEditorOpen && !formatDeliveryAddress(deliveryAddressFields) && profileDeliveryAddress) {
			setDeliveryAddressFields((current) => ({
				...current,
				street: profileDeliveryAddress,
				city: customer?.city ?? "",
				province: customer?.province ?? "",
				postalCode: customer?.postalCode ?? "",
			}));
		}
	}, [customer?.city, customer?.postalCode, customer?.province, deliveryAddressEditorOpen, deliveryAddressFields, profileDeliveryAddress]);
	useEffect(() => {
		if (orderMode !== "delivery" || !deliveryAddress || !cart.length) {
			setShippingQuote(null);
			setShippingQuoteError(null);
			return;
		}
		if (products === undefined) {
			setShippingQuote(null);
			setShippingQuoteError(null);
			return;
		}
		const postalCode = (deliveryLocation?.postalCode ?? deliveryAddressFields.postalCode ?? customer?.postalCode ?? "").replace(/\D/g, "");
		if (!/^\d{5}$/.test(postalCode)) {
			setShippingQuote({ fee: 12000, courierCode: deliveryProvider, expiresAt: Date.now() + 30 * 60 * 1000 });
			setShippingQuoteError(null);
			setShippingQuoteLoading(false);
			return;
		}
		const items = cart.map((item) => {
			const product = products?.find((entry) => String(entry._id) === String(item.productId)) as any;
			const weight = Number(item.deliveryWeightGrams ?? product?.deliveryWeightGrams ?? product?.netWeight ?? product?.weight ?? 0);
			return { name: item.name, value: Math.max(0, Math.round(item.price)), quantity: item.quantity, weight, deliveryEnabled: item.deliveryEnabled ?? product?.deliveryEnabled !== false };
		});
		if (items.some((item) => !item.deliveryEnabled)) {
			setShippingQuote(null);
			setShippingQuoteError("Ada produk di keranjang yang hanya tersedia untuk pembelian langsung, bukan delivery.");
			return;
		}
		const flatDeliveryFee = 12000;
		let cancelled = false;
		setShippingQuote(null);
		setShippingQuoteError(null);
		setShippingQuoteLoading(true);
		void invokeEdgeFunction<{ rates?: Array<{ courierCode?: string; shippingFee?: number; price?: number }> }>("biteship-rates", {
			destination_postal_code: postalCode,
			destination_latitude: deliveryLocation?.latitude,
			destination_longitude: deliveryLocation?.longitude,
			couriers: deliveryProvider,
			items,
		}).then((response) => {
			if (cancelled) return;
			const rate = (response.rates ?? []).find((entry) => String(entry.courierCode ?? "").toLowerCase() === deliveryProvider);
			const fee = Number(rate?.shippingFee ?? rate?.price);
			setShippingQuote({ fee: rate && Number.isFinite(fee) && fee >= 0 ? Math.round(fee) : flatDeliveryFee, courierCode: deliveryProvider, expiresAt: Date.now() + 5 * 60 * 1000 });
		}).catch(() => {
			if (!cancelled) setShippingQuote({ fee: flatDeliveryFee, courierCode: deliveryProvider, expiresAt: Date.now() + 30 * 60 * 1000 });
		}).finally(() => { if (!cancelled) { setShippingQuoteError(null); setShippingQuoteLoading(false); } });
		return () => { cancelled = true; };
	}, [cart, customer?.postalCode, deliveryAddress, deliveryAddressFields.postalCode, deliveryLocation?.latitude, deliveryLocation?.longitude, deliveryLocation?.postalCode, deliveryProvider, orderMode, products]);

	const resolveManualDeliveryLocation = async () => {
		const query = [deliveryAddressFields.street, deliveryAddressFields.district, deliveryAddressFields.city, deliveryAddressFields.province, deliveryAddressFields.postalCode, "Indonesia"].filter(Boolean).join(", ");
		setDeliveryLocationLoading(true); setDeliveryLocationError(null);
		try {
			const queries = [query, [deliveryAddressFields.street, deliveryAddressFields.district, deliveryAddressFields.city, "Indonesia"].filter(Boolean).join(", "), [deliveryAddressFields.district, deliveryAddressFields.city, "Indonesia"].filter(Boolean).join(", ")].filter((value, index, all) => value && all.indexOf(value) === index);
			let result: any = null;
			for (const candidate of queries) {
				const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=id&q=${encodeURIComponent(candidate)}`, { headers: { Accept: "application/json" } });
				const results = await response.json().catch(() => []);
				if (Array.isArray(results) && results[0]) { result = results[0]; break; }
			}
			const latitude = Number(result?.lat); const longitude = Number(result?.lon);
			if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Lokasi alamat belum ditemukan. Gunakan tombol lokasi realtime untuk memilih titik pengantaran.");
			setDeliveryLocation({ latitude, longitude, postalCode: deliveryAddressFields.postalCode }); return true;
		} catch (error) { setDeliveryLocation(null); setDeliveryLocationError(error instanceof Error ? error.message : "Lokasi alamat belum ditemukan."); return false; }
		finally { setDeliveryLocationLoading(false); }
	};

	const useCurrentDeliveryLocation = () => {
		if (!navigator.geolocation) {
			setDeliveryLocationError("Perangkat ini tidak mendukung lokasi realtime.");
			return;
		}
		setDeliveryLocationLoading(true);
		setDeliveryLocationError(null);
		navigator.geolocation.getCurrentPosition(async ({ coords }) => {
			try {
				const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${encodeURIComponent(coords.latitude)}&lon=${encodeURIComponent(coords.longitude)}`, { headers: { Accept: "application/json" } });
				if (!response.ok) throw new Error("Gagal membaca alamat lokasi");
				const result = await response.json() as { display_name?: string; address?: { road?: string; house_number?: string; neighbourhood?: string; suburb?: string; village?: string; city_district?: string; town?: string; city?: string; municipality?: string; state?: string; province?: string; postcode?: string; country?: string } };
				const resolvedAddress = String(result.display_name ?? "").trim();
				if (!resolvedAddress) throw new Error("Alamat tidak ditemukan dari lokasi saat ini");
				const address = result.address ?? {};
				setDeliveryAddressFields((current) => ({ ...current, street: [address.road, address.house_number].filter(Boolean).join(" ") || resolvedAddress, district: address.city_district ?? address.suburb ?? address.village ?? "", city: address.city ?? address.town ?? address.municipality ?? "", province: address.state ?? address.province ?? "", postalCode: address.postcode ?? "" }));
				setDeliveryAddressOverride(null);
				setDeliveryLocation({ latitude: coords.latitude, longitude: coords.longitude, postalCode: result.address?.postcode });
				setDeliveryAddressEditorOpen(true);
			} catch (error) {
				setDeliveryLocationError(error instanceof Error ? error.message : "Alamat realtime belum dapat dibaca");
			} finally {
				setDeliveryLocationLoading(false);
			}
		}, (error) => {
			setDeliveryLocationLoading(false);
			setDeliveryLocationError(error.code === error.PERMISSION_DENIED ? "Izin lokasi ditolak. Kamu tetap bisa memasukkan alamat manual." : "Lokasi realtime belum tersedia.");
		}, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
	};
	const checkoutEmail = isAuthenticated ? customer?.email?.trim() || "" : guestEmail.trim();
	const checkoutPhone = isAuthenticated ? customer?.phone?.trim() || "" : guestPhone.trim();

	useEffect(() => {
		if (isAuthenticated && customer) {
			if (customer.name?.trim() && !customerName.trim()) setCustomerName(customer.name.trim());
			if (customer.customerDescription?.trim() && !customerDescription.trim()) setCustomerDescription(customer.customerDescription.trim());
			return;
		}
		if (isAuthenticated) return;
		try {
			const raw = window.localStorage.getItem("guest-data");
			if (!raw) return;
			const data = JSON.parse(raw) as Record<string, unknown>;
			if (typeof data.name === "string" && data.name.trim() && !customerName.trim()) setCustomerName(data.name.trim());
			if (typeof data.email === "string" && data.email.trim() && !guestEmail.trim()) setGuestEmail(data.email.trim());
			if (typeof data.phone === "string" && data.phone.trim() && !guestPhone.trim()) setGuestPhone(data.phone.trim());
			if (typeof data.description === "string" && data.description.trim() && !customerDescription.trim()) setCustomerDescription(data.description.trim());
		} catch {
			// Ignore malformed guest storage; checkout validation will show the missing field.
		}
	}, [customer, customerDescription, customerName, guestEmail, guestPhone, isAuthenticated, setCustomerDescription, setCustomerName]);
	const memberDiscounts = useMemo(
		() => isAuthenticated ? discounts : discounts?.filter((discount) => !discount.isHappyHour),
		[discounts, isAuthenticated],
	);
	const isMenuLoading = categories === undefined || products === undefined;
	const isMenuError = categories === null || products === null;
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
			const nextCart = currentCart.map((item) => {
				if (item.variant) return item;
				const product = products.find((entry) => entry._id === item.productId);
				if (!product) return item;
				const pricing = calculateEffectivePrice(
					{ _id: product._id, price: product.price, categoryId: product.categoryId },
					memberDiscounts,
					{ channel: "djiwa_app", paymentMethod: paymentChoice === "wallet" ? "wallet" : undefined },
				);
				if (item.price === pricing.finalPrice && item.originalPrice === pricing.originalPrice) return item;
				changed = true;
				return { ...item, price: pricing.finalPrice, originalPrice: pricing.originalPrice };
			});
			return changed ? nextCart : currentCart;
		});
	}, [memberDiscounts, products, setCart]);

	useEffect(() => {
		const sourceId = search.productSourceId;
		if (!sourceId || !products || !memberDiscounts || activityProductAppliedRef.current === sourceId) return;
		const product = products.find((entry) => entry._id === sourceId);
		const unavailable = !product || product.isAvailable === false || (product.quantity !== null && product.quantity !== undefined && product.quantity <= 0);
		if (unavailable) return;
		if (cart.some((item) => item.productId === sourceId)) {
			activityProductAppliedRef.current = sourceId;
			return;
		}
		const pricing = calculateEffectivePrice(
			{ _id: product._id, price: product.price, categoryId: product.categoryId },
			memberDiscounts,
			{ channel: "djiwa_app", paymentMethod: paymentChoice === "wallet" ? "wallet" : undefined },
		);
		addToCart({
			productId: product._id,
			name: product.name,
			price: pricing.finalPrice,
			originalPrice: pricing.originalPrice,
			quantity: 1,
			image: product.image,
			categoryId: product.categoryId,
			menuNumber: product.menuNumber,
		});
		activityProductAppliedRef.current = sourceId;
	}, [addToCart, cart, memberDiscounts, paymentChoice, products, search.productSourceId]);

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
	const selectedRunRewardId = paymentChoice === "wallet" ? (search.runRewardId ?? null) : null;
	const upsellEnabled = siteSettings?.upsellEnabled === true;
	const upsellMaxRecommendations = Number(siteSettings?.upsellMaxRecommendations);
	const upsellTitle = typeof siteSettings?.upsellTitle === "string" ? siteSettings.upsellTitle.trim() : "";
	const upsellSkipLabel = typeof siteSettings?.upsellSkipLabel === "string" ? siteSettings.upsellSkipLabel.trim() : "";
	const upsellAddedLabel = typeof siteSettings?.upsellAddedLabel === "string" ? siteSettings.upsellAddedLabel.trim() : "";
	const visibleUpsellRecommendations = useMemo(() => {
		if (!upsellEnabled || !Number.isInteger(upsellMaxRecommendations) || upsellMaxRecommendations <= 0) return [];
		if (!upsellRecommendations) return [];
		return upsellRecommendations
			.filter((recommendation) => recommendation.ctaLabel?.trim())
			.slice(0, upsellMaxRecommendations);
	}, [upsellEnabled, upsellMaxRecommendations, upsellRecommendations]);

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
	const filteredProducts = useMemo(() => {
		const query = catalogQuery.trim().toLowerCase();
		const categoryById = new Map(orderedCategories.map((category) => [String(category._id), category]));
		const selectedCategory = activeCategoryId ? categoryById.get(String(activeCategoryId)) : null;
		const matchesCategory = (product: (typeof orderedProducts)[number]) => {
			if (!selectedCategory) return true;
			const productCategory = categoryById.get(String(product.categoryId));
			return String(productCategory?._id ?? "") === String(selectedCategory._id) || String(productCategory?.parentId ?? "") === String(selectedCategory._id) || String(selectedCategory.parentId ?? "") === String(productCategory?._id ?? "");
		};
		// Customer catalog follows the reference anchor pattern: category chips
		// scroll to sections while the full catalog remains one vertical flow.
		// Category filtering remains scoped to POS; customer should not hit a
		// dead-end after the selected section.
		return orderedProducts.filter((product) => (!query || product.name.toLowerCase().includes(query) || String(product.menuNumber ?? "").includes(query)));
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
	const activeFreeRefillPromo = useMemo(() => {
		if (!discounts) return null;
		const now = new Date();
		const context = {
			currentTimestamp: now.getTime(),
			currentDay: now.getDay(),
			currentTimeVal: now.getHours() * 60 + now.getMinutes(),
		};
		return (
			discounts.find((discount: Doc<"discounts">) =>
				isFreeRefillActive(discount, context)
			) || null
		);
	}, [discounts]);
	const freeRefillCharge =
		freeRefillOptIn && activeFreeRefillPromo
			? (activeFreeRefillPromo.refillPrice ?? 0) * Math.max(1, partySize)
			: 0;
	const productSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
	const productGrossSubtotal = cart.reduce(
		(sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity,
		0
	);
	const subtotal = productSubtotal + freeRefillCharge;
	const grossSubtotal = productGrossSubtotal + freeRefillCharge;
	const promoDiscount = Math.max(0, grossSubtotal - subtotal);
	const activeDjiwaPayCampaign = discounts?.find((discount) => isDjiwaPayCampaignActive(discount)) ?? null;
	const djiwaPayDiscountPercent = activeDjiwaPayCampaign ? 50 : Number(siteSettings?.djiwaPayDiscountPercent ?? 20);
	const djiwaPayDiscount = paymentChoice === "wallet"
		? activeDjiwaPayCampaign
			? Math.min(
					productSubtotal,
					cart.reduce((sum, item) => {
						const masterProduct = products?.find((product) => product._id === item.productId);
						const basePrice = Number(masterProduct?.price ?? item.originalPrice ?? item.price);
						// Anti-stack: kalau item Rp30.000 sudah terdiskon ke Rp15.000
						// (oleh kampanye atau Happy Hour), jangan potong lagi di level order.
						// Hanya potong sisa yang benar-benar belum terdiskon.
						if (basePrice !== 30000) return sum;
						const remaining = Math.max(0, Math.min(item.price, basePrice) - 15000);
						return sum + remaining * item.quantity;
					}, 0),
				)
			: promoDiscount === 0
				? Math.min(productSubtotal, Math.max(0, Math.round(productSubtotal * (djiwaPayDiscountPercent / 100))))
				: 0
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
		paymentReceiptKind: paymentChoice === "cashier" ? "cashier_pending" : null,
	});
	const serviceChargeAmount = taxCalculation.serviceChargeAmount;
	const taxBase = taxCalculation.taxBase;
	const taxAmount = taxCalculation.taxAmount;
	const shippingQuoteExpired = Boolean(shippingQuote && shippingQuote.expiresAt <= Date.now());
	useEffect(() => {
		if (!shippingQuote) return;
		const timer = window.setInterval(() => setShippingClock(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [shippingQuote]);
	const shippingFee = orderMode === "delivery" && shippingQuote && !shippingQuoteExpired ? shippingQuote.fee : 0;
	const shippingPaymentBlocked = orderMode === "delivery" && (!shippingQuote || shippingQuoteExpired || shippingQuoteLoading || Boolean(shippingQuoteError));
	const shippingBlockerMessage = shippingQuoteLoading ? "Menunggu tarif pengantaran sebelum pembayaran." : shippingQuoteError || (shippingQuoteExpired ? "Tarif pengantaran kedaluwarsa. Kembali ke pengantaran untuk memuat ulang." : "Tarif pengantaran belum tersedia. Lengkapi lokasi dengan kode pos lalu pilih kurir.");
	const total = taxCalculation.finalTotal + shippingFee;
	const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
	const hasDessertInCart = cart.some((item) =>
		/(dessert|cake|pudding|ice cream|gelato|tiramisu|sweet)/i.test(item.name)
	);
	const paymentOptions = [
		{
			key: "cashier" as PaymentChoice,
			label: "Bayar Tunai di Kasir",
			description: "Tampilkan struk dan bayar langsung ke kasir.",
		},
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
		if (search.step && search.step !== step) {
			setStep(search.step as OrderStep);
		}
	}, [search.step]);

	// Sync: context state → URL (when step changes)
	useEffect(() => {
		const params: Record<string, string> = { step };
		if (step === "receipt" && receipt?.orderId) {
			params.orderId = String(receipt.orderId);
		}
		if (search.table) {
			params.table = search.table;
		}
		if (search.productSourceId) {
			params.productSourceId = search.productSourceId;
		}
		navigate({ to: "/$username/order", params: { username }, search: params as any, replace: true });
	}, [step]);

	// Sync: table from URL on mount
	useEffect(() => {
		if (search.table) {
			setTableNumber(search.table);
		}
	}, [search.table]);

	useEffect(() => {
		if ((step === "menu" || step === "review" || step === "payment") && orderMode === "dine_in" && !tableNumber.trim()) {
			setStep("table");
		}
		if ((step === "menu" || step === "shipping" || step === "review" || step === "payment") && orderMode === "delivery" && !deliveryAddress) {
			setStep("address");
		}
	}, [step, tableNumber, orderMode, deliveryAddress]);

	useEffect(() => {
		if (step !== "menu" || menuMode !== "catalog" || typeof document === "undefined") return;
		const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-category-section]"));
		if (!sections.length) return;
		const observer = new IntersectionObserver((entries) => {
			if (Date.now() < categorySelectionLockRef.current) return;
			const scrollRoot = menuScrollRef.current;
			if (scrollRoot && scrollRoot.scrollTop <= 48) {
				if (activeCategoryId !== null) setActiveCategoryId(null);
				return;
			}
			const visible = entries
				.filter((entry) => entry.isIntersecting)
				.sort((a, b) => {
					const topDelta = a.boundingClientRect.top - b.boundingClientRect.top;
					if (Math.abs(topDelta) > 8) return topDelta;
					// Root and subcategory headings share nearly the same top edge.
					// Prefer the more specific subcategory so Bubur is highlighted.
					const aSpecific = a.target.getAttribute("data-category-section-level") === "subcategory" ? 0 : 1;
					const bSpecific = b.target.getAttribute("data-category-section-level") === "subcategory" ? 0 : 1;
					return aSpecific - bSpecific;
				})[0];
			if (!visible) return;
			const categoryId = visible.target.getAttribute("data-category-section");
			if (categoryId && categoryId !== String(activeCategoryId ?? "")) setActiveCategoryId(categoryId as Id<"categories">);
		}, { root: menuScrollRef.current, rootMargin: "-96px 0px -55% 0px", threshold: 0.01 });
		sections.forEach((section) => observer.observe(section));
		return () => observer.disconnect();
	}, [activeCategoryId, menuMode, setActiveCategoryId, step]);

	useEffect(() => {
		if (step !== "menu" || menuMode !== "catalog" || !activeCategoryId || typeof document === "undefined") return;
		const chip = Array.from(document.querySelectorAll<HTMLElement>("[data-category-chip]"))
			.find((element) => element.dataset.categoryChip === String(activeCategoryId));
		chip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
	}, [activeCategoryId, menuMode, step]);

	// ── Side effects ────────────────────────────────────────────

	useEffect(() => {
		if (freeRefillOptIn !== null) return;
		if (!config.enableFreeRefillPrompt || !activeFreeRefillPromo) {
			setFreeRefillOptIn(false);
		}
	}, [activeFreeRefillPromo, config.enableFreeRefillPrompt, freeRefillOptIn]);

	useEffect(() => {
		if (!paymentOptions.find((option) => option.key === paymentChoice) || (paymentChoice === "wallet" && (!customer || (customer.walletBalance ?? 0) < total))) {
			setPaymentChoice("cashier");
		}
	}, [customer, paymentChoice, total]);

	useEffect(() => {
		if (!search.orderId || receipt?.orderId === search.orderId) return;
		setReceipt({
			orderId: search.orderId as Id<"orders">,
			fallbackReference: `SELF-${String(search.orderId).slice(-4).toUpperCase()}`,
			mode: "mayar_pending",
			paymentChoice: "mayar",
			dessertLater: false,
			cartSnapshot: [],
		});
		setStep("receipt");
	}, [search.orderId, receipt?.orderId, setReceipt, setStep]);

	useEffect(() => {
		if (!receipt || !currentOrder) return;
		const normalizedPaymentMethod = String(
			(currentOrder as any).paymentMethod ??
			(currentOrder as any).payment_method ??
			(currentOrder as any).paymentChoice ??
			(currentOrder as any).payment_choice ??
			""
		).toLowerCase();
		const paymentReceiptKind = String((currentOrder as any).paymentReceiptKind ?? (currentOrder as any).payment_receipt_kind ?? "").toLowerCase();
		const isCashierPayment = paymentReceiptKind === "cashier_pending" || normalizedPaymentMethod === "cash" || normalizedPaymentMethod.includes("cashier") || normalizedPaymentMethod.includes("tunai");
		const isWalletPayment = normalizedPaymentMethod.includes("wallet") || normalizedPaymentMethod.includes("djiwa");
		const resolvedPaymentChoice = isCashierPayment ? "cashier" : isWalletPayment ? "wallet" : "mayar";
		const isExpiredOrder = ["cancelled", "expired"].includes(String(currentOrder.status).toLowerCase());
		const resolvedMode = currentOrder.status === "paid" || currentOrder.status === "completed"
			? "paid"
			: receipt.mode === "cashier_expired" || isExpiredOrder
				? "cashier_expired"
				: isCashierPayment
					? "cashier_pending"
					: "mayar_pending";
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
		const catalogProduct = products?.find((entry) => String(entry._id) === String(item.productId)) as any;
		addToCart({
			...item,
			deliveryWeightGrams: item.deliveryWeightGrams ?? catalogProduct?.deliveryWeightGrams ?? null,
			deliveryEnabled: item.deliveryEnabled ?? catalogProduct?.deliveryEnabled !== false,
		});
		setUpsellMainItem(item);
		setUpsellSourceProductId(String(item.productId));
	};

	const handleProductSelect = (product: (typeof orderedProducts)[number]) => {
		if (product.isAvailable === false || (product.quantity != null && Number(product.quantity) <= 0)) {
			toast.info(`${product.name} sedang SOLD`);
			return;
		}
		const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;
		if (hasVariations) {
			setProductSheet(product);
			return;
		}
		const pricing = calculateEffectivePrice(
			{ _id: product._id, price: product.price, categoryId: product.categoryId },
			memberDiscounts,
			{ channel: "djiwa_app", paymentMethod: paymentChoice === "wallet" ? "wallet" : undefined },
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
			memberDiscounts,
			{ channel: "djiwa_app", paymentMethod: paymentChoice === "wallet" ? "wallet" : undefined },
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

	const checkout = async () => {
		if (isSubmitting) return;
		if (!cart.length) {
			toast.error("Pilih minimal satu produk");
			return;
		}
		if (orderMode === "dine_in" && config.requireTableNumber && !tableNumber.trim()) {
			rejectCheckout("Nomor meja wajib diisi sebelum checkout", "Nomor meja");
			return;
		}
		if (orderMode === "delivery" && !deliveryAddress) {
			rejectCheckout("Pilih alamat pengantaran terlebih dahulu");
			setStep("address");
			return;
		}
		if (orderMode === "delivery" && (!shippingQuote || shippingQuote.expiresAt <= Date.now() || shippingQuoteLoading || Boolean(shippingQuoteError))) {
			rejectCheckout(shippingBlockerMessage);
			return;
		}
		if (!isAuthenticated && paymentChoice === "mayar") {
			if (!customerName.trim()) {
				rejectCheckout("Nama customer wajib diisi", "Nama customer");
				return;
			}
			if (!/^\S+@\S+\.\S+$/.test(checkoutEmail)) {
				rejectCheckout("Isi email yang valid", "Email untuk pembayaran QRIS");
				return;
			}
			if (!hasValidCustomerPhone(checkoutPhone)) {
				rejectCheckout("Isi nomor WhatsApp yang valid", "Nomor WhatsApp untuk pembayaran QRIS");
				return;
			}
		}
		if (orderMode === "dine_in" && !tableNumber.trim()) {
			rejectCheckout("Pilih nomor meja terlebih dahulu", "Nomor meja");
			setStep("table");
			return;
		}
		if (orderMode === "dine_in" && (!Number.isInteger(partySize) || partySize < 1)) {
			rejectCheckout("Pilih jumlah orang terlebih dahulu", "Jumlah orang");
			setStep("party");
			return;
		}
		if (paymentChoice === "mayar") {
			if (isAuthenticated && missingContactFields.length > 0) {
				toast.error(getCustomerContactMessage(missingContactFields));
				navigate({ to: "/$username/profile", params: { username } });
				return;
			}
			if (!isAuthenticated && !/^\S+@\S+\.\S+$/.test(checkoutEmail)) {
				rejectCheckout("Isi email yang valid untuk pembayaran QRIS", "Email untuk pembayaran QRIS");
				return;
			}
			if (!isAuthenticated && !hasValidCustomerPhone(checkoutPhone)) {
				rejectCheckout("Isi nomor WhatsApp yang valid untuk pembayaran QRIS", "Nomor WhatsApp untuk pembayaran QRIS");
				return;
			}
		}
		if (paymentChoice === "wallet" && (!isAuthenticated || missingContactFields.length > 0)) {
			toast.error(isAuthenticated ? getCustomerContactMessage(missingContactFields) : "Masuk dan lengkapi profil untuk pembayaran Djiwa Pay");
			if (isAuthenticated) navigate({ to: "/$username/profile", params: { username } });
			else navigate({ to: "/masuk" });
			return;
		}
		setIsSubmitting(true);
		setCheckoutError(null);
		checkoutRequestKeyRef.current = checkoutRequestKeyRef.current ?? (globalThis.crypto?.randomUUID?.() || `customer-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		try {
			const normalizedCustomerName = customerName.trim();
			let guestCustomerSourceId: string | null = null;
			// Guest QRIS perlu disinkronkan agar identity dan contact dapat dipakai Mayar.
			// Guest bayar tunai tidak boleh dipaksa mengisi email/WhatsApp; nama dan ciri
			// customer tetap disimpan langsung pada pending order untuk kasir.
			if (!isAuthenticated && paymentChoice === "mayar") {
				const guestCapture = await invokeEdgeFunction<{ customerSourceId?: string }>("customer-sync", {
					action: "captureGuest",
					name: normalizedCustomerName,
					email: checkoutEmail,
					phone: checkoutPhone,
					customerDescription: customerDescription.trim().slice(0, 160),
					marketingConsent: guestMarketingConsent,
					guestSessionId: sessionRef.current,
				});
				guestCustomerSourceId = guestCapture.customerSourceId || null;
				if (!guestCustomerSourceId) throw new Error("Data guest belum berhasil disimpan");
			}
			if (paymentChoice === "mayar" && !normalizedCustomerName) {
				throw new Error("Nama customer wajib diisi sebelum pembayaran");
			}
			const orderCustomerName = normalizedCustomerName || `Customer ${orderMode === "delivery" ? "Delivery" : tableNumber.trim() || "Walk In"}`;
			const normalizedCustomerDescription = customerDescription.trim().slice(0, 160) || undefined;
			const normalizedTableNumber = orderMode === "dine_in" ? (tableNumber.trim() || undefined) : undefined;
			const normalizedDeliveryAddress = orderMode === "delivery" ? deliveryAddress : undefined;
			const normalizedNotes = notes.trim() || undefined;
			const payload = {
				items: cart.map((item) => {
					const masterProduct = products?.find((product) => product._id === item.productId);
					const isCampaignItem = paymentChoice === "wallet" && Boolean(activeDjiwaPayCampaign) && Number(masterProduct?.price ?? item.originalPrice ?? item.price) === 30000;
					return {
						productId: item.productId,
						productName: item.name,
						categoryId: item.categoryId,
						variant: item.variant,
						quantity: item.quantity,
						price: isCampaignItem ? 15000 : item.price,
						originalPrice: isCampaignItem ? 30000 : item.originalPrice,
					};
				}),
				totalAmount: total,
				shippingFee,
				shippingRateSnapshot: shippingQuote ? { provider: "biteship", courierCode: shippingQuote.courierCode, fee: shippingQuote.fee, currency: "IDR", quotedAt: new Date().toISOString(), expiresAt: new Date(shippingQuote.expiresAt).toISOString() } : null,
				shippingProvider: orderMode === "delivery" ? deliveryProvider : undefined,
				taxAmount,
				serviceChargeAmount,
				paymentMethod: paymentChoice === "mayar" ? "qris" : paymentChoice === "wallet" ? "wallet" : "cash",
				paymentChoice,
				idempotencyKey: checkoutRequestKeyRef.current,
				customerName: orderCustomerName,
				customerEmail: checkoutEmail || null,
				customerPhone: checkoutPhone || null,
				deliveryAddress: normalizedDeliveryAddress,
				deliveryProvider: orderMode === "delivery" ? deliveryProvider : undefined,
				customerDescription: normalizedCustomerDescription,
				tableNumber: normalizedTableNumber,
				orderType: orderMode,
				source: "customer_self_service" as const,
				brandSlug,
				guestCount: partySize,
				freeRefillSelected: Boolean(freeRefillOptIn),
				dessertLater,
				notes: normalizedNotes,
				discountAmount: getAdditionalOrderDiscount(promoDiscount, djiwaPayDiscount),
				voucherId: djiwaPayDiscount > 0 ? (activeDjiwaPayCampaign ? "DJIWA-PAY-50-SEPTEMBER-2026" : "djiwa-pay-20") : null,
				receiptMeta: {
					happyHourApplied: cart.some((item) => {
						const pricing = calculateEffectivePrice({ _id: item.productId, price: item.originalPrice ?? item.price, categoryId: item.categoryId }, memberDiscounts, { channel: "djiwa_app", paymentMethod: paymentChoice === "wallet" ? "wallet" : undefined });
						return pricing.isHappyHour && item.price < (item.originalPrice ?? item.price);
					}),
					...(freeRefillOptIn && activeFreeRefillPromo ? { adjustmentLines: [{ label: `${activeFreeRefillPromo.name || "Free Refill"} x${partySize}`, amount: freeRefillCharge }] } : {}),
					...(promoDiscount > 0 ? { promoDiscount } : {}),
					...(djiwaPayDiscount > 0 ? {
						djiwaPayDiscountPercent,
						djiwaPayDiscount,
						djiwaPayDiscountPaymentMethod: "wallet",
						...(activeDjiwaPayCampaign ? {
							djiwaPayCampaignCode: "DJIWA-PAY-50-SEPTEMBER-2026",
							djiwaPayCampaignLabel: "Djiwa Pay 50%",
						} : {}),
					} : {}),
				},
				customerSourceId: customer?.sourceId || guestCustomerSourceId,
			};

			if (paymentChoice === "wallet") {
				if (!customer?.sourceId || !customer.email) throw new Error("Login customer diperlukan untuk pembayaran saldo");
				const orderId = await createOrder({
					...payload,
					paymentMethod: "wallet",
					paymentReceiptKind: "wallet_pending",
					isOpenBill: true,
				});
				let walletHoldId: string | null = null;
				let walletCaptured = false;
				let runReservation: { rewardId: string; reservationId: string; amount: number } | null = null;
				try {
					if (selectedRunRewardId) {
						runReservation = await reserveDjiwaRunCheckoutReward({ customerSourceId: customer.sourceId, customerEmail: customer.email, rewardId: selectedRunRewardId, orderId: String(orderId), idempotencyKey: `${checkoutRequestKeyRef.current}:run-reserve` });
					}
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
					if (runReservation) {
						await finalizeDjiwaRunCheckoutReward({ customerSourceId: customer.sourceId, customerEmail: customer.email, rewardId: runReservation.rewardId, orderId: String(orderId), reservationId: runReservation.reservationId, idempotencyKey: `${checkoutRequestKeyRef.current}:run-finalize` });
					}
					if (!isAuthenticated) rememberGuestOrder(String(orderId));
					setReceipt({ orderId, fallbackReference: `SELF-${String(orderId).slice(-4).toUpperCase()}`, mode: "paid", paymentChoice, dessertLater, cartSnapshot: cart });
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
					if (runReservation && !walletCaptured) {
						await releaseDjiwaRunCheckoutReward({ customerSourceId: customer.sourceId, customerEmail: customer.email, rewardId: runReservation.rewardId, orderId: String(orderId), reservationId: runReservation.reservationId, idempotencyKey: `${checkoutRequestKeyRef.current}:run-release`, reason: "Checkout Djiwa Pay gagal, reward dikembalikan" }).catch(() => undefined);
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
				if (!isAuthenticated) rememberGuestOrder(String(orderId));
				const redirectUrl =
					typeof window !== "undefined"
						? `${window.location.origin}/${encodeURIComponent(username)}/order?step=receipt&session=${encodeURIComponent(sessionRef.current)}${normalizedTableNumber ? `&table=${encodeURIComponent(normalizedTableNumber)}` : ""}&orderId=${encodeURIComponent(String(orderId))}`
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
						name: normalizedCustomerName,
						email: checkoutEmail || undefined,
						mobile: checkoutPhone || "",
						redirectUrl,
						description: `Self-service order ${storeName}`,
						expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
						extraData: { orderId: String(orderId) },
						items: [
							...cart.map((item) => ({
								quantity: item.quantity,
								rate: item.price,
								description: item.variant ? `${item.name} (${item.variant})` : item.name,
							})),
							...(freeRefillOptIn && activeFreeRefillPromo
								? [
										{
											quantity: Math.max(1, partySize),
											rate: activeFreeRefillPromo.refillPrice ?? 0,
											description: activeFreeRefillPromo.name || "Free Refill",
										},
								  ]
							: []),
							...(shippingFee > 0 ? [{ quantity: 1, rate: shippingFee, description: `Biaya pengantaran ${deliveryProvider}` }] : []),
						],
					});
					if (!invoice?.data?.id) {
						throw new Error(invoice?.messages || "Gagal membuat invoice pembayaran");
					}
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
					dessertLater,
					cartSnapshot: cart,
				});

				if (invoice?.data?.link && typeof window !== "undefined") {
					clearCart();
					window.location.assign(invoice.data.link);
					return;
				}
			} else {
				const orderId = await createOrder({
					...payload,
					paymentReceiptKind: "cashier_pending",
					isOpenBill: true,
				});
				if (!isAuthenticated) rememberGuestOrder(String(orderId));
				setReceipt({
					orderId,
					fallbackReference: `SELF-${String(orderId).slice(-4).toUpperCase()}`,
					mode: "cashier_pending",
					paymentChoice,
					dessertLater,
					cartSnapshot: cart,
				});
			}
			clearCart();
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
				const redirectUrl = `${window.location.origin}/${encodeURIComponent(username)}/order?step=receipt&session=${encodeURIComponent(sessionRef.current)}&orderId=${encodeURIComponent(orderId)}`;
				const invoice = await createMayarInvoice({ orderId, idempotencyKey: `retry-mayar-${orderId}-${Date.now()}`, redirectUrl, paymentMethod: "qris", mobile: checkoutPhone || "", forceNew: true });
				if (!invoice?.data?.id || !invoice.data.link) throw new Error(invoice?.messages || "Link pembayaran baru tidak tersedia");
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
		navigate({ to: "/$username", params: { username } });
	};

	return (
		<div className="app-page h-app min-h-app overflow-hidden">
			<div className="app-shell mx-auto flex h-app max-h-app min-h-app max-w-md flex-col bg-background">
				{/* ── Sticky header ──────────────────────────────── */}
				<CustomerHeader
					eyebrow={step.toUpperCase()}
					title={storeName}
					subtitle="Djiwa Tentram Cafe & Resto"
					onBack={handleOrderHeaderBack}
					showPressHint
					leading={<span className="flex flex-col items-center justify-center gap-0.5 leading-none"><img src="/home-header-icon.png" alt="" className="h-4 w-4 object-contain" aria-hidden="true" /><span className="text-[9px] font-bold text-muted-foreground">Home</span></span>}
					right={orderModeConfirmed ? <span className="inline-flex min-h-9 items-center rounded-full bg-primary/10 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-primary">{totalItems} item</span> : null}
				/>

				<main
					ref={menuScrollRef}
					className={
						step === "menu"
							? "relative isolate min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe-with-nav"
							: step === "receipt"
								? "flex-1 overflow-y-auto pb-[calc(15rem+env(safe-area-inset-bottom))]"
								: "flex-1 min-h-0 overflow-y-auto pb-32"
					}
				>
					{orderModeConfirmed && !deliveryAddressPickerOpen ? <CustomerOrderProgress step={step} mode={orderMode} onModeChange={(nextMode) => { setOrderMode(nextMode); setOrderModeConfirmed(true); setStep(nextMode === "delivery" ? "address" : "table"); }} /> : null}
					{/* ── AuthModal ────────────────────────────────── */}
					<Sheet open={deliveryAddressPickerOpen} onOpenChange={setDeliveryAddressPickerOpen}>
										<SheetContent side="bottom" showCloseButton={false} className="z-[2000] h-[100dvh] max-h-[100dvh] overflow-y-auto rounded-none bg-background p-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
											<div className="border-b border-border px-4 pb-3 pt-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Delivery</p><h2 className="mt-1 text-lg font-black">Pilih alamat pengantaran</h2><p className="mt-1 text-xs text-muted-foreground">Gunakan alamat utama atau masukkan tujuan lain.</p></div>
											<div className="space-y-2 p-4">
												{profileDeliveryAddress ? <button type="button" className="flex min-h-16 w-full items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-left" onClick={() => { setDeliveryAddressOverride(null); setDeliveryAddressPickerOpen(false); }}><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><span className="min-w-0"><span className="flex items-center gap-2 text-sm font-black">Alamat utama <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">Profil</span></span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{profileDeliveryAddress}</span></span></button> : <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Belum ada alamat utama di profil.</div>}
												<button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border p-3 text-left" onClick={() => { setDeliveryAddressPickerOpen(false); setDeliveryAddressEditorOpen(true); }}><Pencil className="h-5 w-5 text-primary" /><span><span className="block text-sm font-black">Tambah atau cari alamat</span><span className="mt-1 block text-xs text-muted-foreground">Isi alamat, patokan, dan detail penerima.</span></span></button>
												<button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border p-3 text-left" onClick={() => { setDeliveryAddressPickerOpen(false); setDeliveryAddressEditorOpen(true); useCurrentDeliveryLocation(); }}><LocateFixed className="h-5 w-5 text-primary" /><span><span className="block text-sm font-black">Gunakan lokasi saya</span><span className="mt-1 block text-xs text-muted-foreground">Isi otomatis dari GPS, lalu periksa kembali alamatnya.</span></span></button>
											</div>
										</SheetContent>
									</Sheet>

									<AuthModal
						open={authModalOpen}
						onOpenChange={(val) => { setAuthModalOpen(val); if (!val) setAuthError(undefined); }}
						onLogin={async (email, password) => { try { setAuthError(undefined); await login(email, password); } catch (e: any) { setAuthError(e?.message || "Gagal masuk"); } }}
						onRegister={async (email, password, name) => { try { setAuthError(undefined); await register(email, password, name); } catch (e: any) { setAuthError(e?.message || "Gagal mendaftar"); } }}
						onSkip={() => setAuthModalOpen(false)}
						onGoogleSignIn={signInWithGoogle}
						onResetPassword={async (email) => { try { await resetPassword(email); } catch { } }}
						isLoading={authLoading}
						needsEmailConfirm={registrationNeedsEmailConfirm}
						error={authError}
					/>

					{!orderModeConfirmed ? <>
						<div className="px-2 pt-2">
							<img src="/order-greeting-cafe.jpg" alt="Suasana hangat Djiwa Tentram Cafe & Resto" className="h-auto max-h-40 w-full rounded-2xl object-cover shadow-sm" loading="eager" />
						</div>
						<CustomerOrderModeSelection themeColor={themeColor} onSelect={(nextMode) => { setOrderMode(nextMode); setOrderModeConfirmed(true); setStep(nextMode === "delivery" ? "address" : "table"); }} />
					</> : null}

					{/* ── Step 1: table selection ───────────────────── */}
					{orderModeConfirmed && ((step === "table" && orderMode === "dine_in") || (step === "address" && orderMode === "delivery")) ? (
						<section className="space-y-2 px-2 py-2">
							<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
								{orderMode === "delivery" ? <>
									<div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2.5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: themeColor }}>Delivery</p><h2 className="text-base font-black">{storeName}</h2></div></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black text-primary">Antar</span></div>
									<div className={deliveryAddressEditorOpen ? "fixed inset-0 z-[2000] h-[100dvh] overflow-y-auto bg-background px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]" : "mt-3 rounded-xl border border-border bg-background p-3"}><div className="flex items-start gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alamat pengantaran</p>{deliveryAddress ? <p className="mt-1 text-sm font-bold leading-relaxed">{deliveryAddress}</p> : <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Belum ada alamat tujuan. Masukkan alamat penerima di sini.</p>}</div></div>{deliveryAddressEditorOpen ? <div className="mt-3 space-y-2"><div className="grid min-w-0 grid-cols-2 gap-2"><div className="col-span-2"><label className="block text-[11px] font-bold text-foreground" htmlFor="delivery-street">Jalan lengkap <span className="text-destructive">*</span></label><input id="delivery-street" autoFocus value={deliveryAddressFields.street} onChange={(event) => setDeliveryAddressFields((current) => ({ ...current, street: event.target.value }))} placeholder="Jalan Gunung Bentang V No. 89" className="mt-1 w-full rounded-xl border border-primary/30 bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></div><div><label className="block text-[11px] font-bold text-foreground" htmlFor="delivery-rtrw">RT/RW</label><input id="delivery-rtrw" value={deliveryAddressFields.rtRw} onChange={(event) => setDeliveryAddressFields((current) => ({ ...current, rtRw: event.target.value }))} placeholder="03/05" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></div><div><label className="block text-[11px] font-bold text-foreground" htmlFor="delivery-district">Kecamatan <span className="text-destructive">*</span></label><input id="delivery-district" value={deliveryAddressFields.district} onChange={(event) => setDeliveryAddressFields((current) => ({ ...current, district: event.target.value }))} placeholder="Cidadap" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></div><div><label className="block text-[11px] font-bold text-foreground" htmlFor="delivery-city">Kota/Kabupaten <span className="text-destructive">*</span></label><input id="delivery-city" value={deliveryAddressFields.city} onChange={(event) => setDeliveryAddressFields((current) => ({ ...current, city: event.target.value }))} placeholder="Bandung" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></div><div><label className="block text-[11px] font-bold text-foreground" htmlFor="delivery-province">Provinsi</label><input id="delivery-province" value={deliveryAddressFields.province} onChange={(event) => setDeliveryAddressFields((current) => ({ ...current, province: event.target.value }))} placeholder="Jawa Barat" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></div><div><label className="block text-[11px] font-bold text-foreground" htmlFor="delivery-postal-code">Kode pos <span className="text-destructive">*</span></label><input id="delivery-postal-code" inputMode="numeric" maxLength={5} value={deliveryAddressFields.postalCode} onChange={(event) => setDeliveryAddressFields((current) => ({ ...current, postalCode: event.target.value.replace(/\D/g, "").slice(0, 5) }))} placeholder="40141" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></div><div className="col-span-2"><label className="block text-[11px] font-bold text-foreground" htmlFor="delivery-landmark">Patokan (opsional)</label><input id="delivery-landmark" value={deliveryAddressFields.landmark} onChange={(event) => setDeliveryAddressFields((current) => ({ ...current, landmark: event.target.value }))} placeholder="Dekat minimarket / gerbang warna putih" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></div></div><button type="button" disabled={deliveryLocationLoading} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-black text-primary disabled:opacity-60" onClick={useCurrentDeliveryLocation}><LocateFixed className="h-4 w-4" />{deliveryLocationLoading ? "Mencari lokasi realtime..." : "Isi dari lokasi saya"}</button>{deliveryLocation ? <a className="block text-[11px] font-bold text-primary underline" href={`https://www.google.com/maps/search/?api=1&query=${deliveryLocation.latitude},${deliveryLocation.longitude}`} target="_blank" rel="noreferrer">Buka titik lokasi di Google Maps</a> : null}{deliveryLocationError ? <p className="text-[11px] font-semibold text-destructive">{deliveryLocationError}</p> : null}<label className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-[11px] leading-relaxed"><input type="checkbox" checked={saveAddressToProfile} onChange={(event) => setSaveAddressToProfile(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span><span className="font-black">Simpan sebagai alamat utama profil</span><span className="block text-muted-foreground">Matikan untuk alamat teman atau tujuan lain yang hanya dipakai pada pesanan ini.</span></span></label><p className="text-[11px] leading-relaxed text-muted-foreground">Alamat tersimpan di profil kamu secara default. Saat memilih alamat lain, kamu bisa menggunakannya hanya untuk pesanan ini.</p><div className="grid grid-cols-2 gap-2"><button type="button" className="min-h-11 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-black" onClick={() => setDeliveryAddressEditorOpen(false)}>Batal</button><button type="button" disabled={!deliveryAddressFields.street.trim() || !deliveryAddressFields.district.trim() || !deliveryAddressFields.city.trim() || !/^\d{5}$/.test(deliveryAddressFields.postalCode)} className="min-h-11 rounded-xl px-3 py-2.5 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40" style={{ background: themeColor }} onClick={async () => {
								if (!(await resolveManualDeliveryLocation())) return; if (!saveAddressToProfile || !isAuthenticated || !customer) { setDeliveryAddressOverride(formatDeliveryAddress(deliveryAddressFields)); setDeliveryAddressEditorOpen(false); return; }
								try {
									await invokeEdgeFunction("customer-sync", { action: "updateProfile", sourceId: customer.sourceId, email: customer.email ?? undefined, address: formatDeliveryAddress(deliveryAddressFields), city: deliveryAddressFields.city.trim(), province: deliveryAddressFields.province.trim() || undefined, postalCode: deliveryAddressFields.postalCode.trim() || undefined });
									await refreshCustomer();
									setDeliveryAddressOverride(null); setDeliveryAddressEditorOpen(false); toast.success("Alamat utama tersimpan di profil");
								} catch (error) { toast.error((error as Error).message || "Gagal menyimpan alamat profil"); }
								}}>Simpan alamat</button></div></div> : <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-black text-primary" onClick={() => { setDeliveryAddressPickerOpen(true); }}><Pencil className="h-3.5 w-3.5" />{deliveryAddress ? "Ubah alamat tujuan" : "Tambah alamat tujuan"}</button>}</div>
									<button type="button" disabled={!deliveryAddress} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40" style={{ background: themeColor }} onClick={() => setStep("menu")}>Lanjut ke menu <ChevronRight className="h-4 w-4" /></button>
								</> : <>
									<div className="flex items-center gap-2.5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Table2 className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: themeColor }}>Step 1</p><h2 className="text-base font-black">Pilih meja</h2></div></div>
									<p className="mt-2 text-xs leading-relaxed text-muted-foreground">Masukkan nomor meja tempat kamu duduk. Data ini akan dicatat bersama pesanan.</p>
									<label className="mt-3 block text-xs font-bold" htmlFor="customer-table-number">Nomor meja</label>
									<input id="customer-table-number" inputMode="numeric" pattern="[0-9]*" minLength={1} maxLength={8} value={tableNumber} onChange={(event) => setTableNumber(event.target.value.replace(/[^0-9]/g, "").slice(0, 8))} placeholder="Contoh: 4" className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-3 text-center text-lg font-black outline-none focus:border-primary" />
									<button type="button" disabled={!tableNumber.trim()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40" style={{ background: themeColor }} onClick={() => setStep("party")}>Lanjut ke jumlah orang <ChevronRight className="h-4 w-4" /></button>
								</>}
							</div>
						</section>
					) : null}

					{/* ── Step 2: party size ───────────────────────── */}
					{step === "party" && orderMode === "dine_in" ? (
						<section className="space-y-2 px-2 py-2">
							<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
								<div className="flex items-center gap-2.5">
									<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Djiwa3DIcon name="party-size" size="micro" alt="" className="h-6 w-6 object-contain" /></div>
									<div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: themeColor }}>Step 2</p><h2 className="text-base font-black">Berapa orang yang memesan?</h2></div>
								</div>
								<div className="mt-2.5 grid grid-cols-3 gap-1.5">
									{[1,2,3,4,5,6,7,8].map((value) => (
										<button key={value} type="button" className={cn("rounded-xl border px-2 py-2 text-sm font-black transition-all", partySize===value ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background")} onClick={() => setPartySize(value)}>
											{value}
										</button>
									))}
									<button key={9} type="button" className={cn("rounded-xl border px-2 py-2 text-sm font-black transition-all", partySize >= 9 ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background")} onClick={() => setPartySize(partySize >= 9 ? partySize : 9)}>
										{partySize >= 9 ? partySize : "9+"}
									</button>
									{partySize >= 9 ? (
										<div className="col-span-3">
											<input type="number" min={9} max={999} value={partySize}
												onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
												className="w-full rounded-xl border border-border bg-background px-3 py-2 text-center text-lg font-black outline-none" />
										</div>
									) : null}
								</div>
								<div className="mt-2.5 grid grid-cols-2 gap-2"><button type="button" className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-black" onClick={() => setStep("table")}>← Kembali</button><button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black text-white shadow-sm" style={{ background: themeColor }} onClick={() => {
									if (config.enableFreeRefillPrompt && activeFreeRefillPromo) {
										setStep("refill");
										return;
									}
									setStep("menu");
								}}>Lanjut dengan {partySize} orang <ChevronRight className="h-4 w-4" /></button></div>
							</div>
						</section>
					) : null}

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
								<div className="mt-2.5 grid grid-cols-2 gap-1.5"><button type="button" className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-black" onClick={() => setStep("party")}>← Kembali</button><button type="button" className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-black" onClick={() => { setFreeRefillOptIn(false); setStep("menu"); }}>Tidak sekarang</button><button type="button" className="col-span-2 rounded-xl px-3 py-2.5 text-xs font-black text-white shadow-sm" style={{ background: themeColor }} onClick={() => { setFreeRefillOptIn(true); setStep("menu"); }}>Ya, tambahkan</button></div>
							</div>
						</section>
					) : null}

					{/* ── Menu section ────────────────────────────── */}
					{step === "menu"
						? renderMenuSection({ activeCategoryId, approvePendingNumberProduct, cancelPendingNumberProduct, cart, catalogQuery, codeFeedback, config, discounts: memberDiscounts, filteredProducts, freeRefillCharge, bestSellers, recentProductIds, handleProductSelect, isMenuError, isMenuLoading, onRetryMenu: () => setMenuRefreshTrigger((value) => value + 1), logoUrl, manualCode, menuMode, orderedCategories, partySize, pendingNumberProduct, pendingNumberQuantity, setActiveCategoryId: selectMenuCategory, setCartOpen, setCatalogQuery, setManualCode, setMenuMode, setPendingNumberQuantity, setScannerOpen, storeName, tableNumber, themeColor, total, totalItems, updateCartQuantity })
						: null}
					{step === "menu" ? <div className="grid grid-cols-2 gap-2 px-2 pb-4"><button type="button" onClick={() => setStep(orderMode === "delivery" ? "address" : "party")} className="min-h-11 rounded-[14px] border border-border bg-card px-3 py-2.5 text-xs font-black text-foreground">← Kembali</button><button type="button" disabled={!cart.length} onClick={() => setStep(orderMode === "delivery" ? "shipping" : "review")} className="min-h-11 rounded-[14px] bg-primary px-3 py-2.5 text-xs font-black text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">Lanjut ke {orderMode === "delivery" ? "pengantaran" : "review"} →</button></div> : null}

					{step === "shipping" && orderMode === "delivery" ? (
						<section className="space-y-2 px-2 py-2"><div className="rounded-xl border border-border bg-card p-3 shadow-sm"><div className="flex items-center gap-2.5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: themeColor }}>Step 3</p><h2 className="text-base font-black">Pilih kurir pengantaran</h2></div></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Pilih layanan yang tersedia untuk mengantar pesananmu.</p><div className="mt-3 grid grid-cols-2 gap-2">{([{ key: "gojek", label: "Gojek", detail: "Delivery tersedia" }, { key: "grab", label: "Grab", detail: "Delivery tersedia" }] as const).map((option) => <button key={option.key} type="button" onClick={() => setDeliveryProvider(option.key)} aria-pressed={deliveryProvider === option.key} className={cn("min-h-24 rounded-xl border p-3 text-left transition-all", deliveryProvider === option.key ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background")}><span className="flex items-center justify-between gap-2"><span className="text-sm font-black">{option.label}</span><span className={cn("h-4 w-4 rounded-full border-2", deliveryProvider === option.key ? "border-primary bg-primary ring-2 ring-primary/20" : "border-muted-foreground/40")} /></span><span className="mt-1 block text-[11px] text-muted-foreground">{option.detail}</span></button>)}</div><p className="mt-3 rounded-xl bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{shippingQuoteLoading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Memuat tarif pengantaran…</span> : shippingQuote ? `Biaya pengantaran ${currency(shippingQuote.fee)} · berlaku 5 menit.` : shippingQuoteError || "Lengkapi lokasi dengan kode pos agar tarif pengantaran dapat dihitung."}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setStep("menu")} className="min-h-11 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-black">← Kembali</button><button type="button" onClick={() => setStep("review")} className="min-h-11 rounded-xl bg-primary px-3 py-2.5 text-xs font-black text-primary-foreground">Lanjut ke review →</button></div></div></section>
					) : null}

					{/* ── Review and payment sections ───────────────── */}
					{(step === "review" || step === "payment") ? renderCheckoutSection({ cart, checkout, config, currency, customerName, customerDescription, guestEmail, guestPhone, isAuthenticated, dessertLater, djiwaPayDiscount, freeRefillCharge, shippingFee, shippingQuotePending: orderMode === "delivery" && shippingQuoteLoading, shippingQuoteError: orderMode === "delivery" && shippingPaymentBlocked ? shippingBlockerMessage : null, canPay: orderMode !== "delivery" && !shippingPaymentBlocked ? true : !shippingPaymentBlocked, hasDessertInCart, isSubmitting, notes, mode: step === "review" ? "review" : "payment", updateCartQuantity, onRemoveItem: (productId, variant) => setCart((current) => current.filter((entry) => entry.productId !== productId || entry.variant !== variant)), onEditMenu: () => setStep("menu"), onContinueToPayment: () => setStep("payment"), onBackToMenu: () => setStep(step === "payment" ? "review" : "menu"), paymentChoice, paymentOptions, productGrossSubtotal, promoDiscount, serviceChargeAmount, serviceChargeRate, setCustomerName, setCustomerDescription, setGuestEmail, setGuestPhone, setDessertLater: (value) => setDessertLater(typeof value === "function" ? value(dessertLater) : value), setNotes, setPaymentChoice, setTableNumber, tableNumber, taxAmount, taxEnabled, taxRate, total, walletBalance: customer?.walletBalance ?? 0, onTopup: () => navigate({ to: "/$username/saldo", params: { username } }), checkoutError }) : null}

					{/* ── Receipt section ─────────────────────────── */}
					{step === "receipt" && receipt ? renderReceiptSection({ actionsHidden: cartOpen, cartSnapshot: receipt.cartSnapshot, currentOrder, dessertLater: receipt.dessertLater, logoUrl, onOrderAgain: startNewOrder, onRetryPayment: retryPayment, retryPaymentLabel: String((currentOrder as any)?.paymentMethod ?? (currentOrder as any)?.payment_method ?? receipt.paymentChoice).toLowerCase().includes("wallet") ? "Coba bayar ulang dengan Djiwa Pay" : "Buat link pembayaran baru", retryingPayment, onHome: goHome, onCashierPaymentExpired: () => {
						if (!receipt?.orderId) return;
						void updateOrderStatus({ id: receipt.orderId, status: "cancelled" }).catch(() => undefined);
						setReceipt((previous) => previous ? { ...previous, mode: "cashier_expired" } : previous);
					}, onOpenService: () => setServiceOpen(true), receipt, storeName, total }) : null}
				</main>

				{/* ── Bottom bar ──────────────────────────────────── */}
				{step !== "table" && step !== "address" && step !== "party" && step !== "refill" && step !== "shipping" && step !== "review" && step !== "payment" && !cartOpen && !serviceOpen && !scannerOpen && !productSheet ? (
					<div className="app-bottom-bar fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-2 pb-2 pt-1.5">
						<div className="app-card grid grid-cols-5 gap-1.5 p-1.5">
							<BottomButton label="Menu" icon={<Djiwa3DIcon name="navigation-home" size="micro" alt="" className="h-5 w-5 object-contain" />} onClick={() => setStep("menu")} />
							<BottomButton label="Riwayat" icon={<Djiwa3DIcon name="navigation-history" size="micro" alt="" className="h-5 w-5 object-contain" />} onClick={() => navigate({ to: "/$username/riwayat", params: { username } })} />
							<BottomButton label="Keranjang" icon={<Djiwa3DIcon name="navigation-order" size="micro" alt="" className="h-5 w-5 object-contain" />} onClick={() => setCartOpen(true)} badge={totalItems > 0 ? String(totalItems) : undefined} />
							<BottomButton label="Staff" icon={<Djiwa3DIcon name="notifications-alerts" size="micro" alt="" className="h-5 w-5 object-contain" />} onClick={() => setServiceOpen(true)} />
							<BottomButton label={receipt ? "Struk" : orderMode === "delivery" ? "Kirim" : "Review"} icon={<Djiwa3DIcon name="order-receipt" size="micro" alt="" className="h-5 w-5 object-contain" />} onClick={() => setStep(receipt ? "receipt" : orderMode === "delivery" ? "shipping" : "review")} primary disabled={!receipt && !cart.length} />
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
							setStep("review");
						}}>Lanjut review pesanan</button></div>
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
						{config.enableDessertLater && receipt?.dessertLater ? <button type="button" className="flex w-full items-center gap-2.5 rounded-xl bg-[linear-gradient(135deg,#f59e0b,#d97706)] px-3 py-4 text-white shadow-sm" onClick={() => requestService("bring_dessert")}><Bell className="h-4 w-4" /><div><p className="font-black text-sm">Bawa dessert sekarang</p><p className="text-xs text-white/75">Kirim pengingat agar dessert dibawakan sekarang.</p></div></button> : null}
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
				<SheetContent side="bottom" showCloseButton={false} className="z-[2000] h-auto max-h-[calc(100dvh-0.75rem)] overflow-hidden rounded-t-3xl p-0">
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
							onAdd={(recommendation, item) => { addToCart(item); void recordRecommendationEvent({ eventType: "add_to_cart", recommendedProductSourceId: recommendation.recommendedProductSourceId, strategy: "pairing_upsell", customerSourceId: customer?.sourceId ?? null }); }}
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
