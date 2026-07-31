import {
	ArrowLeft,
	Bell,
	CheckCircle2,
	ChevronRight,
	Grid2X2,
	LogIn,
	PhoneCall,
	ShoppingCart,
	Users,
	X,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
	useHybridActiveDiscounts,
	useHybridCategories,
	useHybridProducts,
	useHybridSiteSettings,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridBookingSettings } from "@/hooks/use-hybrid-booking-data";
import { useHybridMayarConfig, useHybridOrderById } from "@/hooks/use-hybrid-ops-data";
import {
	useHybridCreateOrder,
	useHybridCreateServiceRequest,
	useHybridMayarCreateInvoice,
	useHybridMayarGetInvoiceDetail,
	useHybridUpdateOrderPaymentGateway,
	useHybridUpdateOrderStatus,
} from "@/hooks/use-hybrid-write-actions";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice, isFreeRefillActive } from "@/lib/utils/pricing";
import type { Doc, Id } from "@/types/backend-compat";

import { useOrderContext } from "@/hooks/use-order-context";
import type { OrderStep } from "@/hooks/use-order-context";
import type { CartItem, ServiceRequestType, PaymentChoice } from "@/components/customer/types";
import { CUSTOMER_ORDERING_DEFAULTS, currency, normalizeMenuCode } from "@/components/customer/types";
import { BottomButton, CartRow, SummaryCardLines } from "@/components/customer/shared-components";
import { BarcodeScanner } from "@/components/customer/barcode-scanner";
import { ProductSheet } from "@/components/customer/product-sheet";
import { renderMenuSection } from "@/components/customer/menu-section";
import { renderCheckoutSection } from "@/components/customer/checkout-section";
import { renderReceiptSection } from "@/components/customer/receipt-section";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { AuthHeader } from "@/components/customer/auth-header";
import { AuthModal } from "@/components/customer/auth-modal";
import { CustomerPageSkeleton } from "@/components/customer/customer-states";

export const Route = createLazyFileRoute("/$username/order")({
	component: OrderPage,
});

function OrderPage() {
	const navigate = useNavigate();
	const { username } = Route.useParams();
	const search = Route.useSearch();
	const brandSlug = import.meta.env.VITE_BRAND_SLUG || "djiwatentram";

	const siteSettings = useHybridSiteSettings();
	const brandSettings = useHybridBookingSettings(brandSlug);
	const categories = useHybridCategories();
	const products = useHybridProducts();
	const discounts = useHybridActiveDiscounts();
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

	const { isAuthenticated, customer, login, register, resetPassword, logout, signInWithGoogle, isLoading: authLoading, registrationNeedsEmailConfirm } = useCustomerAuth();
	const isMenuLoading = categories === undefined || products === undefined;

	const currentOrder = useHybridOrderById(receipt?.orderId);
	const config = {
		...CUSTOMER_ORDERING_DEFAULTS,
		...(siteSettings?.customerOrdering ?? {}),
	};
	const themeColor = brandSettings?.themeColor || "var(--color-primary)";
	const logoUrl = brandSettings?.logoUrl || siteSettings?.logoUrl || "";
	const storeName = brandSettings?.title || siteSettings?.storeName || "Ordering";
	const canUseMayar = Boolean(siteSettings?.mayarEnabled && mayarConfig?.configured);

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
		if (!activeCategoryId) return orderedProducts;
		const validCategoryIds = new Set<Id<"categories">>([activeCategoryId]);
		for (const category of orderedCategories) {
			if (category.parentId === activeCategoryId) validCategoryIds.add(category._id);
		}
		return orderedProducts.filter((product) => validCategoryIds.has(product.categoryId));
	}, [activeCategoryId, orderedCategories, orderedProducts]);
	const productByMenuNumber = useMemo(() => {
		const lookup = new Map<string, (typeof orderedProducts)[number]>();
		for (const product of orderedProducts) {
			if (product.menuNumber != null) {
				lookup.set(normalizeMenuCode(product.menuNumber), product);
			}
		}
		return lookup;
	}, [orderedProducts]);
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
	const taxRate = siteSettings?.taxRate ?? 0;
	const serviceChargeRate = siteSettings?.serviceChargeRate ?? 0;
	const serviceChargeAmount = subtotal * (serviceChargeRate / 100);
	const taxBase = subtotal + serviceChargeAmount;
	const taxAmount = taxBase * (taxRate / 100);
	const total = taxBase + taxAmount;
	const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
	const hasDessertInCart = cart.some((item) =>
		/(dessert|cake|pudding|ice cream|gelato|tiramisu|sweet)/i.test(item.name)
	);
	const paymentOptions = [
		{
			key: "cashier" as PaymentChoice,
			label: config.cashPaymentLabel,
			description: "Tampilkan struk dan bayar langsung ke kasir.",
		},
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
		navigate({ to: "/$username/order", params: { username }, search: params, replace: true });
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
		if (!paymentOptions.find((option) => option.key === paymentChoice)) {
			setPaymentChoice("cashier");
		}
	}, [paymentChoice, paymentOptions]);

	useEffect(() => {
		if (!search.orderId || receipt) return;
		setReceipt({
			orderId: search.orderId as Id<"orders">,
			fallbackReference: `SELF-${String(search.orderId).slice(-4).toUpperCase()}`,
			mode: "mayar_pending",
			paymentChoice: "mayar",
			dessertLater: false,
			cartSnapshot: [],
		});
		setStep("receipt");
	}, [search.orderId, receipt]);

	useEffect(() => {
		if (!receipt || !currentOrder) return;
		if (
			(currentOrder.status === "paid" || currentOrder.status === "completed") &&
			receipt.mode !== "paid"
		) {
			setReceipt((value) => (value ? { ...value, mode: "paid" } : value));
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
		const product = productByMenuNumber.get(normalizeMenuCode(manualCode));
		if (!product) return;
		const timer = window.setTimeout(() => {
			handleProductSelect(product);
			setManualCode("");
		}, 350);
		return () => window.clearTimeout(timer);
	}, [manualCode, menuMode, productByMenuNumber, step]);

	useEffect(() => {
		const invoiceId =
			receipt?.invoiceId ||
			((currentOrder?.paymentGateway as { invoiceId?: string } | undefined)
				?.invoiceId ?? undefined);
		const invoiceUrl =
			receipt?.invoiceUrl ||
			((currentOrder?.paymentGateway as { invoiceUrl?: string } | undefined)
				?.invoiceUrl ?? undefined);
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
				await updateOrderPaymentGateway({
					id: receipt.orderId,
					paymentGateway: {
						provider: "mayar",
						invoiceId,
						invoiceUrl,
						status: "paid",
						paidAt: Date.now(),
					},
					paymentReceiptKind: "gateway_paid",
				});
				setReceipt((value) => (value ? { ...value, mode: "paid" } : value));
				toast.success("Pembayaran Mayar terkonfirmasi");
			} catch {
				// Retry quietly.
			}
		}, 5000);
		return () => window.clearInterval(timer);
	}, [receipt, currentOrder, getMayarInvoiceDetail, updateOrderPaymentGateway]);

	// ── Handlers ────────────────────────────────────────────────

	const handleProductSelect = (product: (typeof orderedProducts)[number]) => {
		const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;
		if (hasVariations) {
			setProductSheet(product);
			return;
		}
		const pricing = calculateEffectivePrice(
			{ _id: product._id, price: product.price, categoryId: product.categoryId },
			discounts
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

	const checkout = async () => {
		if (!cart.length) {
			toast.error("Pilih minimal satu produk");
			return;
		}
		if (config.requireTableNumber && !tableNumber.trim()) {
			toast.error("Nomor meja wajib diisi");
			return;
		}
		setIsSubmitting(true);
		try {
			const normalizedCustomerName =
				customerName.trim() || `Customer ${tableNumber.trim() || "Walk In"}`;
			const normalizedTableNumber = tableNumber.trim() || undefined;
			const normalizedNotes = notes.trim() || undefined;
			const payload = {
				items: cart.map((item) => ({
					productId: item.productId,
					productName: item.name,
					variant: item.variant,
					quantity: item.quantity,
					price: item.price,
					originalPrice: item.originalPrice,
				})),
				totalAmount: total,
				taxAmount,
				serviceChargeAmount,
				paymentMethod: paymentChoice === "mayar" ? "djiwaapp" : "cash",
				customerName: normalizedCustomerName,
				tableNumber: normalizedTableNumber,
				orderType: "dine_in" as const,
				source: "customer_self_service" as const,
				brandSlug,
				guestCount: partySize,
				freeRefillSelected: Boolean(freeRefillOptIn),
				dessertLater,
				notes: normalizedNotes,
				discountAmount: promoDiscount,
				customerSourceId: customer?.sourceId || null,
				receiptMeta:
					freeRefillOptIn && activeFreeRefillPromo
						? {
								adjustmentLines: [
									{
										label: `${activeFreeRefillPromo.name || "Free Refill"} x${partySize}`,
										amount: freeRefillCharge,
									},
								],
						  }
						: undefined,
			};

			if (paymentChoice === "mayar") {
				const orderId = await createOrder({
					...payload,
					paymentReceiptKind: "cashier_pending",
					isOpenBill: true,
				});
				const redirectUrl =
					typeof window !== "undefined"
						? `${window.location.origin}/${brandSlug}?session=${encodeURIComponent(sessionRef.current)}${normalizedTableNumber ? `&table=${encodeURIComponent(normalizedTableNumber)}` : ""}&orderId=${encodeURIComponent(String(orderId))}`
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
						name: normalizedCustomerName,
						email: undefined,
						mobile: siteSettings?.storePhone || "",
						redirectUrl,
						description: `Self-service order ${storeName}`,
						expiredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
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
						],
					});
					if (!invoice?.data?.id) {
						throw new Error(invoice?.messages || "Gagal membuat invoice Mayar");
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
					await updateOrderStatus({ id: orderId, status: "cancelled" });
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
					window.location.assign(invoice.data.link);
					return;
				}
			} else {
				const orderId = await createOrder({
					...payload,
					paymentReceiptKind: "cashier_pending",
					isOpenBill: true,
				});
				setReceipt({
					orderId,
					fallbackReference: `SELF-${String(orderId).slice(-4).toUpperCase()}`,
					mode: "cashier_pending",
					paymentChoice,
					dessertLater,
					cartSnapshot: cart,
				});
			}
			setCart([]);
			setStep("receipt");
		} catch (error) {
			toast.error((error as Error).message || "Checkout gagal");
		} finally {
			setIsSubmitting(false);
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
					<ShoppingCart aria-hidden="true" className="mx-auto h-8 w-8 text-primary" strokeWidth={2} />
					<h1 className="mt-3 font-display text-lg font-black">Halaman ordering belum aktif</h1>
					<p className="mt-2 text-xs text-muted-foreground">
						Customer self-service untuk brand ini sedang dimatikan dari admin.
					</p>
				</div>
			</div>
		);
	}

	// ── Render ───────────────────────────────────────────────────

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
				{/* ── Sticky header ──────────────────────────────── */}
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur-xl">
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<button
								type="button"
								aria-label="Kembali"
								className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
								onClick={() => {
									if (step === "party") navigate({ to: "/$username", params: { username } });
									if (step === "refill") setStep(config.enablePartySizeSelection ? "party" : "party");
									if (step === "menu") setStep(config.enableFreeRefillPrompt && activeFreeRefillPromo ? "refill" : config.enablePartySizeSelection ? "party" : "party");
									if (step === "checkout") setStep("menu");
								}}
							>
								<ArrowLeft className="h-3.5 w-3.5" />
							</button>
							{logoUrl ? (
								<img alt={storeName} className="h-10 w-10 rounded-xl object-contain" src={logoUrl} />
							) : (
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
									<ShoppingCart className="h-5 w-5" />
								</div>
							)}
							<div>
								<p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: themeColor }}>
									{step}
								</p>
								<h1 className="text-sm font-black tracking-tight">{storeName}</h1>
							</div>
						</div>
						<div className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
							{totalItems} item
						</div>
					</div>
				</header>

				<main
					className={
						step === "menu"
							? "flex-1 overflow-y-auto pb-24"
							: step === "receipt"
								? "flex-1 overflow-y-auto pb-32"
								: "flex-1 overflow-hidden pb-20"
					}
				>
					{/* ── Auth header (always visible, no welcome) ── */}
					<div className="mt-3 mb-2 px-3">
						<AuthHeader
							isAuthenticated={isAuthenticated}
							customer={(customer ?? null) as any}
							isLoading={authLoading}
							onOpenAuth={() => setAuthModalOpen(true)}
							onLogout={logout}
							onProfileClick={() => navigate({ to: "/$username/profile", params: { username } })}
						/>
					</div>

					{/* ── AuthModal ────────────────────────────────── */}
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

					{/* ── Party section ───────────────────────────── */}
					{step === "party" ? (
						<section className="space-y-2 px-2 py-2">
							<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
								<div className="flex items-center gap-2.5">
									<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
									<div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: themeColor }}>Step 1</p><h2 className="text-base font-black">Berapa orang yang memesan?</h2></div>
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
								<button type="button" className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black text-white shadow-sm" style={{ background: themeColor }} onClick={() => {
									if (config.enableFreeRefillPrompt && activeFreeRefillPromo) {
										setStep("refill");
										return;
									}
									setStep("menu");
								}}>
									Lanjut dengan {partySize} orang <ChevronRight className="h-4 w-4" />
								</button>
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
								<div className="mt-2.5 grid grid-cols-2 gap-1.5">
									<button type="button" className="rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-black" onClick={() => { setFreeRefillOptIn(false); setStep("menu"); }}>Tidak sekarang</button>
									<button type="button" className="rounded-xl px-3 py-2.5 text-xs font-black text-white shadow-sm" style={{ background: themeColor }} onClick={() => { setFreeRefillOptIn(true); setStep("menu"); }}>Ya, tambahkan</button>
								</div>
							</div>
						</section>
					) : null}

					{/* ── Menu section ────────────────────────────── */}
					{step === "menu"
						? renderMenuSection({ activeCategoryId, cart, codeFeedback, config, discounts, filteredProducts, freeRefillCharge, handleProductSelect, isMenuLoading, logoUrl, manualCode, menuMode, orderedCategories, partySize, setActiveCategoryId, setCartOpen, setManualCode, setMenuMode, setScannerOpen, storeName, tableNumber, themeColor, total, totalItems })
						: null}

					{/* ── Checkout section ────────────────────────── */}
					{step === "checkout" ? renderCheckoutSection({ checkout, config, currency, customerName, dessertLater, freeRefillCharge, hasDessertInCart, isSubmitting, notes, paymentChoice, paymentOptions, productGrossSubtotal, promoDiscount, serviceChargeAmount, serviceChargeRate, setCustomerName, setDessertLater, setNotes, setPaymentChoice, setTableNumber, tableNumber, taxAmount, taxRate, total }) : null}

					{/* ── Receipt section ─────────────────────────── */}
					{step === "receipt" && receipt ? renderReceiptSection({ cartSnapshot: receipt.cartSnapshot, currentOrder, dessertLater: receipt.dessertLater, logoUrl, onOrderAgain: () => { setReceipt(null); setDessertLater(false); setNotes(""); setStep("menu"); }, onOpenService: () => setServiceOpen(true), receipt, storeName, total }) : null}
				</main>

				{/* ── Bottom bar ──────────────────────────────────── */}
				{step !== "party" && step !== "refill" ? (
					<div className="app-bottom-bar fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-2 pb-2 pt-1.5">
						<div className="app-card grid grid-cols-4 gap-1.5 p-1.5">
							<BottomButton label="Menu" icon={<Grid2X2 className="h-3.5 w-3.5" />} onClick={() => setStep("menu")} />
							<BottomButton label="Basket" icon={<ShoppingCart className="h-3.5 w-3.5" />} onClick={() => setCartOpen(true)} badge={totalItems > 0 ? String(totalItems) : undefined} />
							<BottomButton label="Staff" icon={<Bell className="h-3.5 w-3.5" />} onClick={() => setServiceOpen(true)} />
							<BottomButton label={receipt ? "Struk" : "Checkout"} icon={receipt ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} onClick={() => setStep(receipt ? "receipt" : "checkout")} primary disabled={!receipt && !cart.length} />
						</div>
					</div>
				) : null}
			</div>

			{/* ── Cart Sheet ─────────────────────────────────────── */}
			<Sheet open={cartOpen} onOpenChange={setCartOpen}>
				<SheetContent side="bottom" showCloseButton={false} className="max-h-[85vh] rounded-t-3xl p-0">
					<div className="flex h-full flex-col">
						<div className="border-b border-border px-4 pb-3 pt-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: themeColor }}>Review pesanan</p><h3 className="font-display text-lg font-black">Order basket</h3></div><button type="button" aria-label="Tutup keranjang" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground" onClick={() => setCartOpen(false)}><X className="h-3.5 w-3.5" /></button></div></div>
						<div className="flex-1 overflow-y-auto px-4 py-3">{cart.length === 0 ? <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-muted-foreground"><ShoppingCart aria-hidden="true" className="h-7 w-7" strokeWidth={2} /><p className="mt-2 font-display text-sm font-bold text-foreground">Keranjang masih kosong</p><p className="mt-1 text-xs">Pilih menu untuk mulai memesan.</p></div> : <div className="space-y-2.5">{cart.map((item) => <CartRow key={`${item.productId}-${item.variant || "default"}`} item={item} onDecrease={() => updateCartQuantity(item.productId, item.variant, -1)} onIncrease={() => updateCartQuantity(item.productId, item.variant, 1)} onRemove={() => setCart((current) => current.filter((entry) => entry.productId !== item.productId || entry.variant !== item.variant))} />)}</div>}</div>
						<div className="border-t border-border px-4 pb-5 pt-3"><SummaryCardLines productGrossSubtotal={productGrossSubtotal} freeRefillCharge={freeRefillCharge} promoDiscount={promoDiscount} taxAmount={taxAmount} taxRate={taxRate} serviceChargeAmount={serviceChargeAmount} serviceChargeRate={serviceChargeRate} total={total} /><button type="button" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60" style={{ background: themeColor }} onClick={() => { setCartOpen(false); setStep("checkout"); }} disabled={!cart.length}>Lanjut checkout <ChevronRight className="h-4 w-4" /></button></div>
					</div>
				</SheetContent>
			</Sheet>

			{/* ── Service Sheet ──────────────────────────────────── */}
			<Sheet open={serviceOpen} onOpenChange={setServiceOpen}>
				<SheetContent side="bottom" className="rounded-t-3xl p-0">
					<div className="space-y-3 px-4 py-5">
						<div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: themeColor }}>Layanan customer</p><h3 className="mt-0.5 text-lg font-black">Hubungi tim restoran</h3><p className="mt-1 text-xs text-muted-foreground">Request akan langsung muncul di halaman admin operasional.</p></div>
						<button type="button" className="flex w-full items-center gap-2.5 rounded-xl bg-[linear-gradient(135deg,#ef4444,#b91c1c)] px-3 py-4 text-white shadow-sm" onClick={() => requestService("call_staff")}><PhoneCall className="h-4 w-4" /><div><p className="font-black text-sm">Panggil staff</p><p className="text-xs text-white/75">Panggil staff ke meja customer.</p></div></button>
						{config.enableDessertLater && receipt?.dessertLater ? <button type="button" className="flex w-full items-center gap-2.5 rounded-xl bg-[linear-gradient(135deg,#f59e0b,#d97706)] px-3 py-4 text-white shadow-sm" onClick={() => requestService("bring_dessert")}><Bell className="h-4 w-4" /><div><p className="font-black text-sm">Bawa dessert sekarang</p><p className="text-xs text-white/75">Kirim pengingat agar dessert dibawakan sekarang.</p></div></button> : null}
					</div>
				</SheetContent>
			</Sheet>

			{/* ── Scanner Sheet ──────────────────────────────────── */}
			<Sheet open={scannerOpen} onOpenChange={setScannerOpen}>
				<SheetContent side="bottom" showCloseButton={false} className="rounded-t-3xl p-0">
					<BarcodeScanner onClose={() => setScannerOpen(false)} onDetected={(rawValue) => { const product = productByMenuNumber.get(normalizeMenuCode(rawValue.replace(/\D/g, ""))) || productByMenuNumber.get(normalizeMenuCode(rawValue)); if (!product) { toast.error("Barcode tidak cocok dengan nomor produk"); return; } handleProductSelect(product); setScannerOpen(false); }} />
				</SheetContent>
			</Sheet>

			{/* ── Product Sheet ──────────────────────────────────── */}
			<Sheet open={Boolean(productSheet)} onOpenChange={(open) => !open && setProductSheet(null)}>
				<SheetContent side="bottom" showCloseButton={false} className="max-h-[85vh] rounded-t-3xl p-0">
					<ProductSheet product={productSheet} discounts={discounts ?? []} onClose={() => setProductSheet(null)} onAdd={(item) => { addToCart(item); setProductSheet(null); }} />
				</SheetContent>
			</Sheet>
		</div>
	);
}
