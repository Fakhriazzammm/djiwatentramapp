import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import {
	ArrowLeft,
	Barcode,
	Bell,
	CheckCircle2,
	ChevronRight,
	Grid2X2,
	Loader2,
	Minus,
	PhoneCall,
	Plus,
	QrCode,
	Search,
	ShoppingCart,
	Trash2,
	Users,
	Wallet,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
	calculateEffectivePrice,
	isFreeRefillActive,
} from "@/lib/utils/pricing";

type RouteSearch = { table?: string; session?: string };
type Step = "welcome" | "party" | "refill" | "menu" | "checkout" | "receipt";
type MenuMode = "number" | "catalog";
type PaymentChoice = "cashier" | "mayar";
type ServiceRequestType = "call_staff" | "bring_dessert";

type CartItem = {
	productId: Id<"products">;
	name: string;
	price: number;
	originalPrice?: number;
	quantity: number;
	variant?: string;
	image?: string;
	categoryId: Id<"categories">;
	menuNumber?: number;
};

type ReceiptState = {
	orderId: Id<"orders">;
	fallbackReference: string;
	mode: "cashier_pending" | "mayar_pending" | "paid";
	paymentChoice: PaymentChoice;
	invoiceId?: string;
	invoiceUrl?: string;
	dessertLater: boolean;
};

const CUSTOMER_ORDERING_DEFAULTS = {
	enabled: true,
	welcomeTitle: "Welcome",
	welcomeSubtitle: "Pesan menu favoritmu langsung dari meja.",
	welcomeButtonLabel: "Mulai pesan",
	enablePartySizeSelection: true,
	enableFreeRefillPrompt: true,
	enableBarcodeScan: true,
	enableMenuNumberEntry: true,
	enableCatalogBrowsing: true,
	enableStaffCall: true,
	enableDessertLater: true,
	requireTableNumber: false,
	cashPaymentLabel: "Bayar di kasir",
	mayarPaymentLabel: "Bayar online",
};

const currency = (value: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(value);

const normalizeMenuCode = (value: string | number | undefined | null) =>
	String(value ?? "")
		.replace(/\s+/g, "")
		.trim();

const getSessionId = (seed?: string) => {
	if (seed) return seed;
	if (typeof window === "undefined") return "server-session";
	const storageKey = "customer-ordering-session";
	const existing = window.localStorage.getItem(storageKey);
	if (existing) return existing;
	const next =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `session-${Date.now().toString(36)}`;
	window.localStorage.setItem(storageKey, next);
	return next;
};

export function CustomerOrderingPage({
	brandSlug,
	search,
}: {
	brandSlug: string;
	search: RouteSearch;
}) {
	const siteSettings = useQuery(api.site_settings.getSettings);
	const brandSettings = useQuery(api.booking.getSettings, { slug: brandSlug });
	const categories = useQuery(api.products.getCategories);
	const products = useQuery(api.products.getProducts, {});
	const discounts = useQuery(api.discounts.getActiveDiscounts);
	const createOrder = useMutation(api.orders.createOrder);
	const updateOrderPaymentGateway = useMutation(api.orders.updateOrderPaymentGateway);
	const createServiceRequest = useMutation(api.customerService.createRequest);
	const createMayarInvoice = useAction(api.mayar.createInvoice);
	const getMayarInvoiceDetail = useAction(api.mayar.getInvoiceDetail);
	const mayarConfig = useQuery(api.mayar.isConfigured);

	const [step, setStep] = useState<Step>("welcome");
	const [partySize, setPartySize] = useState(1);
	const [freeRefillOptIn, setFreeRefillOptIn] = useState<boolean | null>(null);
	const [menuMode, setMenuMode] = useState<MenuMode>("number");
	const [activeCategoryId, setActiveCategoryId] = useState<Id<"categories"> | null>(
		null
	);
	const [manualCode, setManualCode] = useState("");
	const [codeFeedback, setCodeFeedback] = useState("");
	const [cart, setCart] = useState<CartItem[]>([]);
	const [cartOpen, setCartOpen] = useState(false);
	const [serviceOpen, setServiceOpen] = useState(false);
	const [scannerOpen, setScannerOpen] = useState(false);
	const [productSheet, setProductSheet] = useState<any | null>(null);
	const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("cashier");
	const [customerName, setCustomerName] = useState("");
	const [tableNumber, setTableNumber] = useState(search.table ?? "");
	const [notes, setNotes] = useState("");
	const [dessertLater, setDessertLater] = useState(false);
	const [receipt, setReceipt] = useState<ReceiptState | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const sessionRef = useRef(getSessionId(search.session));

	const currentOrder = useQuery(api.orders.getOrder, receipt ? { id: receipt.orderId } : "skip");
	const config = siteSettings?.customerOrdering ?? CUSTOMER_ORDERING_DEFAULTS;
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
	const taxAmount = subtotal * (taxRate / 100);
	const serviceChargeAmount = subtotal * (serviceChargeRate / 100);
	const total = subtotal + taxAmount + serviceChargeAmount;
	const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
	const hasDessertInCart = cart.some((item) =>
		/(dessert|cake|pudding|ice cream|gelato|tiramisu|sweet)/i.test(item.name)
	);
	const paymentOptions = [
		{
			key: "cashier" as const,
			label: config.cashPaymentLabel,
			description: "Tampilkan struk dan bayar langsung ke kasir.",
		},
		...(canUseMayar
			? [
					{
						key: "mayar" as const,
						label: config.mayarPaymentLabel,
						description: "Invoice Mayar dibuat dan status struk akan berubah otomatis setelah dibayar.",
					},
			  ]
			: []),
	];

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
		if (!receipt || !currentOrder) return;
		if (
			(currentOrder.status === "paid" || currentOrder.status === "completed") &&
			receipt.mode !== "paid"
		) {
			setReceipt((value) => (value ? { ...value, mode: "paid" } : value));
		}
	}, [currentOrder, receipt]);

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
		if (!receipt || receipt.mode !== "mayar_pending" || !receipt.invoiceId) return;
		const timer = window.setInterval(async () => {
			try {
				const result = await getMayarInvoiceDetail({ invoiceId: receipt.invoiceId! });
				const normalized = String((result?.data as { status?: string } | null)?.status || "").toLowerCase();
				const isPaid =
					normalized.includes("paid") ||
					((result?.data as { transactions?: Array<{ status?: string }> } | null)?.transactions || []).some((item) =>
						String(item?.status || "").toLowerCase().includes("paid")
					);
				if (!isPaid) return;
				await updateOrderPaymentGateway({
					id: receipt.orderId,
					paymentGateway: {
						provider: "mayar",
						invoiceId: receipt.invoiceId!,
						invoiceUrl: receipt.invoiceUrl,
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
	}, [receipt, updateOrderPaymentGateway]);

	const addToCart = (item: CartItem) => {
		setCart((current) => {
			const existing = current.findIndex(
				(entry) => entry.productId === item.productId && entry.variant === item.variant
			);
			if (existing >= 0) {
				return current.map((entry, index) =>
					index === existing
						? { ...entry, quantity: entry.quantity + item.quantity }
						: entry
				);
			}
			return [...current, item];
		});
		setCodeFeedback(`${item.name} ditambahkan ke keranjang`);
		window.setTimeout(() => setCodeFeedback(""), 1800);
	};

	const updateCartQuantity = (productId: Id<"products">, variant: string | undefined, delta: number) => {
		setCart((current) =>
			current
				.map((item) =>
					item.productId === productId && item.variant === variant
						? { ...item, quantity: Math.max(0, item.quantity + delta) }
						: item
				)
				.filter((item) => item.quantity > 0)
		);
	};

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

	const goToMenuFlow = () => {
		if (config.enableFreeRefillPrompt && activeFreeRefillPromo) {
			setStep("refill");
			return;
		}
		setStep("menu");
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
				paymentMethod: paymentChoice === "mayar" ? "mayar" : "cash",
				customerName: customerName.trim() || undefined,
				tableNumber: tableNumber.trim() || undefined,
				orderType: "dine_in" as const,
				source: "customer_self_service" as const,
				brandSlug,
				guestCount: partySize,
				freeRefillSelected: Boolean(freeRefillOptIn),
				dessertLater,
				notes: notes.trim() || undefined,
				discountAmount: promoDiscount,
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
				const invoice = await createMayarInvoice({
					name: customerName.trim() || `Customer ${tableNumber.trim() || "Walk In"}`,
					email: undefined,
					mobile: siteSettings?.storePhone || "",
					redirectUrl: typeof window !== "undefined" ? window.location.href : undefined,
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
				const orderId = await createOrder({
					...payload,
					paymentGateway: {
						provider: "mayar",
						invoiceId: invoice.data.id,
						transactionId: invoice.data.transactionId,
						invoiceUrl: invoice.data.link,
						status: "created",
					},
					isOpenBill: true,
				});
				setReceipt({
					orderId,
					fallbackReference: `SELF-${String(orderId).slice(-4).toUpperCase()}`,
					mode: "mayar_pending",
					paymentChoice,
					invoiceId: invoice.data.id,
					invoiceUrl: invoice.data.link,
					dessertLater,
				});
				setCart([]);
				setStep("receipt");

				if (invoice.data.link && typeof window !== "undefined") {
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

	if (
		siteSettings === undefined ||
		brandSettings === undefined ||
		categories === undefined ||
		products === undefined ||
		discounts === undefined ||
		mayarConfig === undefined
	) {
		return (
			<div className="flex min-h-app items-center justify-center bg-background">
				<div className="flex items-center gap-3 rounded-3xl border border-border bg-card px-5 py-4 shadow-sm">
					<Loader2 className="h-5 w-5 animate-spin text-primary" />
					<span className="text-sm font-medium text-muted-foreground">
						Menyiapkan halaman customer...
					</span>
				</div>
			</div>
		);
	}

	if (brandSettings?.isActive === false || !config.enabled) {
		return (
			<div className="flex min-h-app items-center justify-center bg-background px-4">
				<div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
					<h1 className="text-2xl font-black">Halaman ordering belum aktif</h1>
					<p className="mt-3 text-sm text-muted-foreground">
						Customer self-service untuk brand ini sedang dimatikan dari admin.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="app-page min-h-app">
			<div className="app-shell mx-auto flex min-h-app max-w-md flex-col bg-background">
				<header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur-xl">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							{step !== "welcome" ? (
								<button
									type="button"
									className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
									onClick={() => {
										if (step === "party") setStep("welcome");
										if (step === "refill") setStep(config.enablePartySizeSelection ? "party" : "welcome");
										if (step === "menu") setStep(config.enableFreeRefillPrompt && activeFreeRefillPromo ? "refill" : config.enablePartySizeSelection ? "party" : "welcome");
										if (step === "checkout") setStep("menu");
									}}
								>
									<ArrowLeft className="h-4 w-4" />
								</button>
							) : null}
							{logoUrl ? (
								<img alt={storeName} className="h-12 w-12 rounded-2xl object-contain" src={logoUrl} />
							) : (
								<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
									<ShoppingCart className="h-6 w-6" />
								</div>
							)}
							<div>
								<p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: themeColor }}>
									{step}
								</p>
								<h1 className="text-base font-black tracking-tight">{storeName}</h1>
							</div>
						</div>
						<div className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
							{totalItems} item
						</div>
					</div>
				</header>

				<main className="flex-1 pb-28">
					{step === "welcome" ? (
						<section className="flex min-h-[calc(var(--app-min-height)-4.5rem)] flex-col items-center justify-center px-6 py-10 text-center">
							<div className="app-card-strong w-full px-6 py-10">
								<div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary/10">
									{logoUrl ? <img alt={storeName} className="h-14 w-14 object-contain" src={logoUrl} /> : <ShoppingCart className="h-8 w-8 text-primary" />}
								</div>
								<p className="mt-6 text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: themeColor }}>
									{config.welcomeTitle}
								</p>
								<h2 className="mt-3 text-3xl font-black tracking-tight">{storeName}</h2>
								<p className="mt-4 text-sm leading-relaxed text-muted-foreground">{config.welcomeSubtitle}</p>
								<button type="button" className="mt-8 rounded-[1.5rem] px-8 py-4 text-lg font-black text-white shadow-sm" style={{ background: themeColor }} onClick={() => setStep(config.enablePartySizeSelection ? "party" : config.enableFreeRefillPrompt && activeFreeRefillPromo ? "refill" : "menu")}>
									{config.welcomeButtonLabel}
								</button>
							</div>
						</section>
					) : null}

					{step === "party" ? (
						<section className="space-y-5 px-4 py-5">
							<div className="rounded-[2rem] border border-border bg-card p-5 shadow-sm">
								<div className="flex items-center gap-3">
									<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Users className="h-6 w-6" /></div>
									<div><p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: themeColor }}>Step 1</p><h2 className="text-xl font-black">Berapa orang yang memesan?</h2></div>
								</div>
								<div className="mt-5 grid grid-cols-3 gap-3">
									{[1,2,3,4,5,6,7,8,9].map((value) => (
										<button key={value} type="button" className={cn("rounded-[1.5rem] border px-3 py-5 text-lg font-black transition-all", partySize===value ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background")} onClick={() => setPartySize(value)}>
											{value === 9 ? "9+" : value}
										</button>
									))}
								</div>
								<button type="button" className="mt-5 flex w-full items-center justify-center gap-2 rounded-[1.5rem] px-4 py-4 text-base font-black text-white shadow-sm" style={{ background: themeColor }} onClick={goToMenuFlow}>
									Lanjut dengan {partySize} orang <ChevronRight className="h-5 w-5" />
								</button>
							</div>
						</section>
					) : null}

					{step === "refill" ? (
						<section className="space-y-5 px-4 py-5">
							<div className="rounded-[2rem] border border-border bg-card p-5 shadow-sm">
								<div className="flex items-center gap-3">
									<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bell className="h-6 w-6" /></div>
									<div><p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: themeColor }}>Step 2</p><h2 className="text-xl font-black">Tambahkan free refill?</h2></div>
								</div>
								<div className="mt-5 rounded-[1.75rem] border border-primary/15 bg-primary/5 p-4">
									<p className="text-base font-black">{activeFreeRefillPromo?.name || "Free refill minuman tersedia"}</p>
									<p className="mt-2 text-sm leading-relaxed text-muted-foreground">{activeFreeRefillPromo?.refillPrice ? `Tambahan ${currency(activeFreeRefillPromo.refillPrice)} per orang. Estimasi total ${currency((activeFreeRefillPromo.refillPrice || 0) * Math.max(1, partySize))}.` : `Promo refill aktif untuk ${partySize} orang.`}</p>
								</div>
								<div className="mt-5 grid grid-cols-2 gap-3">
									<button type="button" className="rounded-[1.5rem] border border-border bg-background px-4 py-4 text-base font-black" onClick={() => { setFreeRefillOptIn(false); setStep("menu"); }}>Tidak sekarang</button>
									<button type="button" className="rounded-[1.5rem] px-4 py-4 text-base font-black text-white shadow-sm" style={{ background: themeColor }} onClick={() => { setFreeRefillOptIn(true); setStep("menu"); }}>Ya, tambahkan</button>
								</div>
							</div>
						</section>
					) : null}

					{step === "menu"
						? renderMenuSection({ activeCategoryId, cart, codeFeedback, config, discounts, filteredProducts, freeRefillCharge, handleProductSelect, logoUrl, manualCode, menuMode, orderedCategories, partySize, setActiveCategoryId, setCartOpen, setManualCode, setMenuMode, setScannerOpen, storeName, tableNumber, themeColor, total, totalItems })
						: null}
					{step === "checkout" ? renderCheckoutSection({ config, currency, customerName, dessertLater, hasDessertInCart, isSubmitting, notes, paymentChoice, paymentOptions, promoDiscount, serviceChargeAmount, serviceChargeRate, setCustomerName, setDessertLater, setNotes, setPaymentChoice, setTableNumber, setStep, tableNumber, taxAmount, taxRate, total, checkout, productGrossSubtotal, freeRefillCharge }) : null}
					{step === "receipt" && receipt ? renderReceiptSection({ currentOrder, dessertLater: receipt.dessertLater, logoUrl, onOrderAgain: () => { setReceipt(null); setDessertLater(false); setNotes(""); setStep("menu"); }, onOpenService: () => setServiceOpen(true), receipt, storeName, total }) : null}
				</main>

				{step !== "welcome" && step !== "party" && step !== "refill" ? (
					<div className="app-bottom-bar fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-3 pb-3 pt-2">
						<div className="app-card grid grid-cols-4 gap-2 p-2">
							<BottomButton label="Menu" icon={<Grid2X2 className="h-4 w-4" />} onClick={() => setStep("menu")} />
							<BottomButton label="Basket" icon={<ShoppingCart className="h-4 w-4" />} onClick={() => setCartOpen(true)} badge={totalItems > 0 ? String(totalItems) : undefined} />
							<BottomButton label="Staff" icon={<Bell className="h-4 w-4" />} onClick={() => setServiceOpen(true)} />
							<BottomButton label={receipt ? "Struk" : "Checkout"} icon={receipt ? <CheckCircle2 className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} onClick={() => setStep(receipt ? "receipt" : "checkout")} primary disabled={!receipt && !cart.length} />
						</div>
					</div>
				) : null}
			</div>

			<Sheet open={cartOpen} onOpenChange={setCartOpen}>
				<SheetContent side="bottom" className="max-h-[90vh] rounded-t-[2rem] p-0">
					<div className="flex h-full flex-col">
						<div className="border-b border-border px-5 pb-4 pt-5"><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: themeColor }}>Review pesanan</p><h3 className="text-xl font-black">Order basket</h3></div><button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground" onClick={() => setCartOpen(false)}><X className="h-4 w-4" /></button></div></div>
						<div className="flex-1 overflow-y-auto px-5 py-4">{cart.length === 0 ? <div className="rounded-[1.5rem] border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-muted-foreground">Keranjang masih kosong.</div> : <div className="space-y-3">{cart.map((item) => <CartRow key={`${item.productId}-${item.variant || "default"}`} item={item} onDecrease={() => updateCartQuantity(item.productId, item.variant, -1)} onIncrease={() => updateCartQuantity(item.productId, item.variant, 1)} onRemove={() => setCart((current) => current.filter((entry) => entry.productId !== item.productId || entry.variant !== item.variant))} />)}</div>}</div>
						<div className="border-t border-border px-5 pb-6 pt-4"><SummaryCardLines productGrossSubtotal={productGrossSubtotal} freeRefillCharge={freeRefillCharge} promoDiscount={promoDiscount} taxAmount={taxAmount} taxRate={taxRate} serviceChargeAmount={serviceChargeAmount} serviceChargeRate={serviceChargeRate} total={total} /><button type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-[1.5rem] px-4 py-4 text-base font-black text-white shadow-sm disabled:opacity-60" style={{ background: themeColor }} onClick={() => { setCartOpen(false); setStep("checkout"); }} disabled={!cart.length}>Lanjut checkout <ChevronRight className="h-5 w-5" /></button></div>
					</div>
				</SheetContent>
			</Sheet>

			<Sheet open={serviceOpen} onOpenChange={setServiceOpen}>
				<SheetContent side="bottom" className="rounded-t-[2rem] p-0">
					<div className="space-y-4 px-5 py-6">
						<div><p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: themeColor }}>Layanan customer</p><h3 className="mt-1 text-xl font-black">Hubungi tim restoran</h3><p className="mt-2 text-sm text-muted-foreground">Request akan langsung muncul di halaman admin operasional.</p></div>
						<button type="button" className="flex w-full items-center gap-3 rounded-[1.5rem] bg-[linear-gradient(135deg,#ef4444,#b91c1c)] px-4 py-5 text-white shadow-sm" onClick={() => requestService("call_staff")}><PhoneCall className="h-5 w-5" /><div><p className="font-black text-base">Call the staff</p><p className="text-sm text-white/75">Panggil staff ke meja customer.</p></div></button>
						{config.enableDessertLater && receipt?.dessertLater ? <button type="button" className="flex w-full items-center gap-3 rounded-[1.5rem] bg-[linear-gradient(135deg,#f59e0b,#d97706)] px-4 py-5 text-white shadow-sm" onClick={() => requestService("bring_dessert")}><Bell className="h-5 w-5" /><div><p className="font-black text-base">Bring the dessert</p><p className="text-sm text-white/75">Kirim pengingat agar dessert dibawakan sekarang.</p></div></button> : null}
					</div>
				</SheetContent>
			</Sheet>

			<Sheet open={scannerOpen} onOpenChange={setScannerOpen}>
				<SheetContent side="bottom" className="rounded-t-[2rem] p-0">
					<BarcodeScanner onClose={() => setScannerOpen(false)} onDetected={(rawValue) => { const product = productByMenuNumber.get(normalizeMenuCode(rawValue.replace(/\D/g, ""))) || productByMenuNumber.get(normalizeMenuCode(rawValue)); if (!product) { toast.error("Barcode tidak cocok dengan nomor produk"); return; } handleProductSelect(product); setScannerOpen(false); }} />
				</SheetContent>
			</Sheet>

			<Sheet open={Boolean(productSheet)} onOpenChange={(open) => !open && setProductSheet(null)}>
				<SheetContent side="bottom" className="max-h-[90vh] rounded-t-[2rem] p-0">
					<ProductSheet product={productSheet} discounts={discounts} onClose={() => setProductSheet(null)} onAdd={(item) => { addToCart(item); setProductSheet(null); }} />
				</SheetContent>
			</Sheet>
		</div>
	);
}

function renderMenuSection(props: {
	activeCategoryId: Id<"categories"> | null;
	cart: CartItem[];
	codeFeedback: string;
	config: typeof CUSTOMER_ORDERING_DEFAULTS;
	discounts: Doc<"discounts">[];
	filteredProducts: Doc<"products">[];
	freeRefillCharge: number;
	handleProductSelect: (product: Doc<"products">) => void;
	logoUrl: string;
	manualCode: string;
	menuMode: MenuMode;
	orderedCategories: Doc<"categories">[];
	partySize: number;
	setActiveCategoryId: (value: Id<"categories"> | null) => void;
	setCartOpen: (value: boolean) => void;
	setManualCode: (value: string) => void;
	setMenuMode: (value: MenuMode) => void;
	setScannerOpen: (value: boolean) => void;
	storeName: string;
	tableNumber: string;
	themeColor: string;
	total: number;
	totalItems: number;
}) {
	return (
		<div className="space-y-5 px-4 py-5">
			<div className="rounded-[2rem] px-5 py-5 text-white shadow-[0_20px_50px_rgba(15,23,42,0.18)]" style={{ background: `linear-gradient(135deg, ${props.themeColor}, rgba(15,23,42,0.9))` }}>
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/75">Session aktif</p>
						<h2 className="mt-2 text-2xl font-black">Pilih menu</h2>
						<p className="mt-2 text-sm text-white/75">Ketik nomor produk lengkap, scan barcode, atau pilih lewat katalog.</p>
					</div>
					<div className="rounded-2xl bg-white/12 px-4 py-3 text-right backdrop-blur">
						<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Orang</p>
						<p className="mt-1 text-2xl font-black">{props.partySize}</p>
					</div>
				</div>
				<div className="mt-4 flex flex-wrap gap-2 text-xs">
					<BadgePill label={props.tableNumber.trim() ? `Meja ${props.tableNumber.trim()}` : "Meja belum diisi"} />
					{props.freeRefillCharge > 0 ? <BadgePill label={`Free refill ${currency(props.freeRefillCharge)}`} /> : null}
					<BadgePill label={`${props.totalItems} item • ${currency(props.total)}`} />
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3 rounded-[1.75rem] border border-border bg-card p-2 shadow-sm">
				<button type="button" className={cn("rounded-[1.25rem] px-4 py-3 text-sm font-black transition-all", props.menuMode === "number" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")} onClick={() => props.setMenuMode("number")}>Nomor Produk</button>
				<button type="button" className={cn("rounded-[1.25rem] px-4 py-3 text-sm font-black transition-all", props.menuMode === "catalog" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")} onClick={() => props.setMenuMode("catalog")}>Katalog Menu</button>
			</div>

			{props.menuMode === "number" && props.config.enableMenuNumberEntry ? (
				<div className="rounded-[2rem] border border-border bg-card p-4 shadow-sm">
					<div className="flex items-center justify-between gap-3">
						<div><p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: props.themeColor }}>Mode cepat</p><h3 className="mt-1 text-lg font-black">Input nomor produk</h3></div>
						{props.config.enableBarcodeScan ? <button type="button" className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-bold text-primary" onClick={() => props.setScannerOpen(true)}><Barcode className="h-4 w-4" />Scan</button> : null}
					</div>
					<div className="mt-4 rounded-[1.5rem] border border-border bg-background px-4 py-4 shadow-inner">
						<div className="flex items-center gap-3"><Search className="h-5 w-5 text-muted-foreground" /><input className="w-full bg-transparent text-2xl font-black tracking-[0.3em] outline-none placeholder:text-lg placeholder:font-semibold placeholder:tracking-normal" inputMode="numeric" placeholder="Ketik nomor menu" value={props.manualCode} onChange={(event) => props.setManualCode(event.target.value.replace(/\D/g, ""))} /></div>
					</div>
					{props.codeFeedback ? <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{props.codeFeedback}</p> : <p className="mt-3 text-sm text-muted-foreground">Item akan langsung masuk ke keranjang saat nomor produk lengkap cocok.</p>}
					<div className="mt-4 grid grid-cols-3 gap-3">
						{["1","2","3","4","5","6","7","8","9"].map((digit) => <button type="button" key={digit} className="rounded-[1.35rem] border border-border bg-background px-4 py-4 text-2xl font-black shadow-sm" onClick={() => props.setManualCode(`${props.manualCode}${digit}`)}>{digit}</button>)}
						<button type="button" className="rounded-[1.35rem] border border-border bg-background px-4 py-4 text-base font-black shadow-sm" onClick={() => props.setManualCode("")}>Clear</button>
						<button type="button" className="rounded-[1.35rem] border border-border bg-background px-4 py-4 text-2xl font-black shadow-sm" onClick={() => props.setManualCode(`${props.manualCode}0`)}>0</button>
						<button type="button" className="rounded-[1.35rem] bg-primary px-4 py-4 text-base font-black text-primary-foreground shadow-sm" onClick={() => props.setManualCode(props.manualCode.slice(0, -1))}>Delete</button>
					</div>
				</div>
			) : null}

			{props.menuMode === "catalog" && props.config.enableCatalogBrowsing ? (
				<div className="space-y-4">
					<div className="rounded-[2rem] border border-border bg-card p-4 shadow-sm">
						<div className="flex items-center gap-2"><Grid2X2 className="h-5 w-5 text-primary" /><h3 className="text-lg font-black">Katalog produk</h3></div>
						<div className="mt-4 flex gap-2 overflow-x-auto pb-1">
							<button type="button" className={chipClassName(props.activeCategoryId === null)} onClick={() => props.setActiveCategoryId(null)}>Semua</button>
							{props.orderedCategories.filter((category) => !category.parentId).map((category) => <button type="button" key={category._id} className={chipClassName(props.activeCategoryId === category._id)} onClick={() => props.setActiveCategoryId(category._id)}>{category.name}</button>)}
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3">
						{props.filteredProducts.map((product) => {
							const pricing = calculateEffectivePrice({ _id: product._id, price: product.price, categoryId: product.categoryId }, props.discounts);
							const quantity = props.cart.filter((item) => item.productId === product._id).reduce((sum, item) => sum + item.quantity, 0);
							return (
								<button type="button" key={product._id} className="overflow-hidden rounded-[1.75rem] border border-border bg-card text-left shadow-sm transition-all active:scale-[0.99]" onClick={() => props.handleProductSelect(product)}>
									<div className="relative h-36 w-full bg-muted">{product.image ? <img alt={product.name} className="h-full w-full object-cover" src={product.image} /> : null}{product.menuNumber != null ? <span className="absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold text-white">#{product.menuNumber}</span> : null}{quantity > 0 ? <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">{quantity} di cart</span> : null}</div>
									<div className="space-y-2 p-4"><p className="line-clamp-2 text-sm font-black leading-snug">{product.name}</p><div className="flex items-end justify-between gap-2"><div><p className="text-base font-black text-primary">{currency(pricing.finalPrice)}</p>{pricing.isPromo ? <p className="text-xs font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice)}</p> : null}</div><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><Plus className="h-4 w-4" /></div></div></div>
								</button>
							);
						})}
					</div>
				</div>
			) : null}
		</div>
	);
}

function renderCheckoutSection(props: any) {
	return (
		<div className="space-y-5 px-4 py-5">
			<div className="rounded-[2rem] border border-border bg-card p-5 shadow-sm">
				<div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Wallet className="h-6 w-6" /></div><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/70">Step akhir</p><h2 className="text-xl font-black">Checkout pesanan</h2></div></div>
				<div className="mt-5 space-y-4">
					<div className="space-y-2"><label className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Nama customer</label><input className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium outline-none" value={props.customerName} onChange={(event) => props.setCustomerName(event.target.value)} placeholder="Opsional" type="text" /></div>
					<div className="space-y-2"><label className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Nomor meja</label><input className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium outline-none" value={props.tableNumber} onChange={(event) => props.setTableNumber(event.target.value.replace(/[^\dA-Za-z-]/g, ""))} placeholder="Contoh 12" type="text" /></div>
					<div className="space-y-2"><label className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Catatan order</label><textarea className="min-h-[88px] w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium outline-none" value={props.notes} onChange={(event) => props.setNotes(event.target.value)} placeholder="Contoh: saus dipisah, tanpa es" /></div>
					{props.config.enableDessertLater && props.hasDessertInCart ? <label className="flex items-center justify-between rounded-2xl border border-primary/15 bg-primary/5 px-4 py-4"><div><p className="font-bold text-sm text-foreground">Bawakan dessert nanti</p><p className="text-xs text-muted-foreground">Setelah order dibuat, customer bisa menekan tombol request dessert.</p></div><button type="button" className={cn("relative h-7 w-12 rounded-full transition-all", props.dessertLater ? "bg-primary" : "bg-muted-foreground/20")} onClick={() => props.setDessertLater((value: boolean) => !value)}><span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all", props.dessertLater ? "right-1" : "left-1")} /></button></label> : null}
				</div>
			</div>
			<div className="rounded-[2rem] border border-border bg-card p-5 shadow-sm">
				<div className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary" /><h3 className="text-lg font-black">Pilih pembayaran</h3></div>
				<div className="mt-4 space-y-3">{props.paymentOptions.map((option: any) => <button type="button" key={option.key} className={cn("flex w-full items-start justify-between rounded-[1.5rem] border px-4 py-4 text-left transition-all", props.paymentChoice === option.key ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background")} onClick={() => props.setPaymentChoice(option.key)}><div><p className="font-black text-sm">{option.label}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{option.description}</p></div><div className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", props.paymentChoice === option.key ? "border-primary bg-primary" : "border-muted-foreground/30")}>{props.paymentChoice === option.key ? <div className="h-2.5 w-2.5 rounded-full bg-white" /> : null}</div></button>)}</div>
			</div>
			<div className="rounded-[2rem] border border-border bg-card p-5 shadow-sm">
				<SummaryCardLines productGrossSubtotal={props.productGrossSubtotal} freeRefillCharge={props.freeRefillCharge} promoDiscount={props.promoDiscount} taxAmount={props.taxAmount} taxRate={props.taxRate} serviceChargeAmount={props.serviceChargeAmount} serviceChargeRate={props.serviceChargeRate} total={props.total} />
				<button type="button" className="mt-5 flex w-full items-center justify-center gap-2 rounded-[1.5rem] bg-primary px-4 py-4 text-base font-black text-primary-foreground shadow-sm transition-all disabled:opacity-60" onClick={props.checkout} disabled={props.isSubmitting}>{props.isSubmitting ? <><Loader2 className="h-5 w-5 animate-spin" />Memproses checkout...</> : <>Checkout {props.currency(props.total)}</>}</button>
			</div>
		</div>
	);
}

function renderReceiptSection(props: any) {
	const orderReference = props.currentOrder?.orderNumber || props.receipt.fallbackReference;
	const mode = props.currentOrder?.status === "paid" || props.currentOrder?.status === "completed" ? "paid" : props.receipt.mode;
	return (
		<div className="space-y-5 px-4 py-5">
			<div className="rounded-[2rem] border border-border bg-card p-6 text-center shadow-sm">
				<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">{mode === "paid" ? <CheckCircle2 className="h-8 w-8" /> : <Wallet className="h-8 w-8" />}</div>
				<p className="mt-4 text-[11px] font-bold uppercase tracking-[0.24em] text-primary/70">{mode === "paid" ? "Payment completed" : "Payment receipt"}</p>
				<h2 className="mt-2 text-2xl font-black tracking-tight">{mode === "paid" ? "Struk lunas" : "Tunjukkan ke kasir"}</h2>
				<p className="mt-3 text-sm leading-relaxed text-muted-foreground">{mode === "cashier_pending" ? "Silakan tunjukkan layar ini ke kasir untuk menyelesaikan pembayaran." : mode === "mayar_pending" ? "Invoice Mayar sudah dibuat. Status struk akan berubah otomatis setelah dibayar." : "Pembayaran sudah diterima. Pesanan akan diproses restoran."}</p>
				<div className="mt-6 rounded-[1.75rem] border border-border bg-background px-4 py-5">{props.logoUrl ? <img alt={props.storeName} className="mx-auto h-16 object-contain" src={props.logoUrl} /> : null}<div className="mt-4 space-y-1"><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Nomor order</p><p className="text-3xl font-black tracking-[0.18em] text-foreground">{orderReference}</p></div><div className="mt-5 rounded-[1.4rem] bg-muted/35 px-4 py-4"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Metode</span><span className="font-bold">{props.receipt.paymentChoice === "mayar" ? "Mayar Payment Gateway" : "Kasir"}</span></div><div className="mt-2 flex items-center justify-between text-sm"><span className="text-muted-foreground">Status</span><span className={cn("font-bold", mode === "paid" ? "text-emerald-600" : "text-orange-600")}>{mode === "paid" ? "LUNAS" : "MENUNGGU PEMBAYARAN"}</span></div><div className="mt-2 flex items-center justify-between text-sm"><span className="text-muted-foreground">Total</span><span className="font-black">{currency(props.currentOrder?.totalAmount ?? props.total)}</span></div></div><BarcodeLines value={orderReference} /></div>
				{props.receipt.invoiceUrl && mode === "mayar_pending" ? <a className="mt-5 inline-flex items-center justify-center gap-2 rounded-[1.3rem] bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-sm" href={props.receipt.invoiceUrl} rel="noreferrer" target="_blank"><QrCode className="h-4 w-4" />Buka invoice Mayar</a> : null}
			</div>
			<div className="grid grid-cols-2 gap-3"><button type="button" className="rounded-[1.5rem] border border-border bg-card px-4 py-4 text-sm font-black shadow-sm" onClick={props.onOrderAgain}>Pesan lagi</button><button type="button" className="rounded-[1.5rem] bg-primary px-4 py-4 text-sm font-black text-primary-foreground shadow-sm" onClick={props.onOpenService}>{props.dessertLater ? "Call staff / dessert" : "Call staff"}</button></div>
		</div>
	);
}

function BadgePill({ label }: { label: string }) {
	return <span className="rounded-full bg-white/12 px-3 py-1.5 font-semibold text-white/85 backdrop-blur">{label}</span>;
}

function chipClassName(active: boolean) {
	return cn(
		"whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-all",
		active ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-background text-muted-foreground"
	);
}

function BottomButton({ badge, disabled, icon, label, onClick, primary }: { badge?: string; disabled?: boolean; icon: ReactNode; label: string; onClick: () => void; primary?: boolean; }) {
	return <button type="button" className={cn("relative flex flex-col items-center justify-center gap-1 rounded-[1.25rem] px-2 py-2 text-[11px] font-bold transition-all", primary ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground", disabled ? "opacity-40" : "")} disabled={disabled} onClick={onClick}>{badge ? <span className="absolute right-2 top-1 flex min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] text-white">{badge}</span> : null}{icon}<span>{label}</span></button>;
}

function SummaryCardLines({ freeRefillCharge, productGrossSubtotal, promoDiscount, serviceChargeAmount, serviceChargeRate, taxAmount, taxRate, total }: { freeRefillCharge: number; productGrossSubtotal: number; promoDiscount: number; serviceChargeAmount: number; serviceChargeRate: number; taxAmount: number; taxRate: number; total: number; }) {
	return <div className="space-y-2 rounded-[1.5rem] bg-muted/35 p-4"><Line label="Subtotal produk" value={currency(productGrossSubtotal)} />{freeRefillCharge > 0 ? <Line label="Free refill minuman" value={currency(freeRefillCharge)} /> : null}{promoDiscount > 0 ? <Line label="Promo / diskon" value={`-${currency(promoDiscount)}`} className="text-orange-600" /> : null}{serviceChargeAmount > 0 ? <Line label={`Service (${serviceChargeRate}%)`} value={currency(serviceChargeAmount)} /> : null}{taxAmount > 0 ? <Line label={`Pajak (${taxRate}%)`} value={currency(taxAmount)} /> : null}<div className="flex items-center justify-between border-t border-border pt-3"><span className="text-sm font-black uppercase tracking-[0.18em] text-foreground">Total</span><span className="text-xl font-black text-foreground">{currency(total)}</span></div></div>;
}

function Line({ className, label, value }: { className?: string; label: string; value: string; }) {
	return <div className="flex items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className={cn("font-semibold text-foreground", className)}>{value}</span></div>;
}

function CartRow({ item, onDecrease, onIncrease, onRemove }: { item: CartItem; onDecrease: () => void; onIncrease: () => void; onRemove: () => void; }) {
	return <div className="rounded-[1.5rem] border border-border bg-card p-4 shadow-sm"><div className="flex gap-3"><div className="h-16 w-16 overflow-hidden rounded-2xl bg-muted">{item.image ? <img alt={item.name} className="h-full w-full object-cover" src={item.image} /> : null}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black leading-snug">{item.name}</p>{item.variant ? <p className="mt-1 text-xs text-muted-foreground">{item.variant}</p> : null}</div><button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive" onClick={onRemove}><Trash2 className="h-4 w-4" /></button></div><div className="mt-4 flex items-center justify-between"><p className="text-sm font-black text-primary">{currency(item.price * item.quantity)}</p><div className="flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1"><button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-muted" onClick={onDecrease}><Minus className="h-4 w-4" /></button><span className="min-w-[1.5rem] text-center text-sm font-black">{item.quantity}</span><button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground" onClick={onIncrease}><Plus className="h-4 w-4" /></button></div></div></div></div></div>;
}

function BarcodeLines({ value }: { value: string }) {
	const pattern = Array.from(value.replace(/\s+/g, "")).map((character, index) => ((character.charCodeAt(0) + index * 7) % 4) + 1).flatMap((width) => [width, 1]);
	return <div className="mt-6 rounded-[1.5rem] border border-border bg-white px-4 py-4 shadow-inner"><div className="flex h-24 items-end justify-center gap-[2px]">{pattern.map((width, index) => <span key={`${value}-${index}`} className="bg-black" style={{ width: `${Math.max(2, width * 2)}px`, height: `${index % 2 === 0 ? 92 : 78}px` }} />)}</div><p className="mt-4 text-center font-mono text-sm font-bold tracking-[0.32em] text-foreground">{value}</p></div>;
}

function BarcodeScanner({ onClose, onDetected }: { onClose: () => void; onDetected: (rawValue: string) => void; }) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [status, setStatus] = useState("Mengaktifkan kamera...");

	useEffect(() => {
		let stream: MediaStream | null = null;
		let frame = 0;
		let cancelled = false;

		const start = async () => {
			if (typeof window === "undefined" || !("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
				setStatus("Browser ini belum mendukung scan barcode. Gunakan input nomor produk.");
				return;
			}
			try {
				stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
				if (cancelled) return;
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play();
				}
				setStatus("Arahkan kamera ke barcode menu.");
				const Detector = (window as any).BarcodeDetector;
				const detector = new Detector({ formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"] });
				const detectLoop = async () => {
					if (cancelled || !videoRef.current) return;
					try {
						const result = await detector.detect(videoRef.current);
						const rawValue = result.find((item: any) => item.rawValue)?.rawValue;
						if (rawValue) {
							onDetected(rawValue);
							return;
						}
					} catch {
						// ignore frame failures
					}
					frame = window.requestAnimationFrame(detectLoop);
				};
				frame = window.requestAnimationFrame(detectLoop);
			} catch (error) {
				setStatus((error as Error).message || "Kamera tidak dapat diakses.");
			}
		};

		start();
		return () => {
			cancelled = true;
			window.cancelAnimationFrame(frame);
			stream?.getTracks().forEach((track) => track.stop());
		};
	}, [onDetected]);

	return <div className="space-y-4 px-5 py-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/70">Barcode scanner</p><h3 className="mt-1 text-xl font-black">Scan nomor produk</h3></div><button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground" onClick={onClose}><X className="h-4 w-4" /></button></div><div className="overflow-hidden rounded-[2rem] bg-black"><video ref={videoRef} autoPlay className="aspect-[4/5] w-full object-cover" muted playsInline /></div><p className="rounded-[1.5rem] bg-muted/35 px-4 py-3 text-sm text-muted-foreground">{status}</p><button type="button" className="w-full rounded-[1.4rem] border border-border bg-card px-4 py-4 text-sm font-black" onClick={onClose}>Kembali ke input nomor</button></div>;
}

function ProductSheet({ discounts, onAdd, onClose, product }: { discounts: Doc<"discounts">[]; onAdd: (item: CartItem) => void; onClose: () => void; product: Doc<"products"> | null; }) {
	const [quantity, setQuantity] = useState(1);
	const [variants, setVariants] = useState<Record<string, string>>({});
	useEffect(() => {
		setQuantity(1);
		setVariants({});
	}, [product]);
	if (!product) return null;
	const groups = Array.isArray(product.variations) ? product.variations as Array<{ type: string; options: Array<{ name: string; price: number }> }> : [];
	const pricing = calculateEffectivePrice({ _id: product._id, price: product.price, categoryId: product.categoryId }, discounts);
	const variantPrice = Object.entries(variants).reduce((sum, [groupName, optionName]) => {
		const group = groups.find((entry) => entry.type === groupName);
		const option = group?.options.find((entry) => entry.name === optionName);
		return sum + (option?.price ?? 0);
	}, 0);
	const unitPrice = pricing.finalPrice + variantPrice;
	return <div className="flex max-h-[90vh] flex-col"><div className="relative h-60 bg-muted">{product.image ? <img alt={product.name} className="h-full w-full object-cover" src={product.image} /> : null}<button type="button" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white" onClick={onClose}><X className="h-4 w-4" /></button>{product.menuNumber != null ? <span className="absolute bottom-4 left-4 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white">#{product.menuNumber}</span> : null}</div><div className="flex-1 overflow-y-auto px-5 py-5"><h3 className="text-2xl font-black tracking-tight">{product.name}</h3>{product.description ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{product.description}</p> : null}<div className="mt-4 flex items-center gap-3"><span className="text-2xl font-black text-primary">{currency(unitPrice)}</span>{pricing.isPromo ? <span className="text-sm font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice + variantPrice)}</span> : null}</div>{groups.length > 0 ? <div className="mt-6 space-y-5">{groups.map((group) => <div key={group.type} className="space-y-2"><p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{group.type}</p><div className="flex flex-wrap gap-2">{group.options.map((option) => <button type="button" key={option.name} className={cn("rounded-full border px-3 py-2 text-sm font-bold transition-all", variants[group.type] === option.name ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")} onClick={() => setVariants((value) => ({ ...value, [group.type]: option.name }))}>{option.name}{option.price > 0 ? ` +${currency(option.price)}` : ""}</button>)}</div></div>)}</div> : null}</div><div className="border-t border-border px-5 py-4"><div className="flex items-center gap-3"><div className="flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1"><button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-muted" onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Minus className="h-4 w-4" /></button><span className="min-w-[1.5rem] text-center text-sm font-black">{quantity}</span><button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground" onClick={() => setQuantity((value) => value + 1)}><Plus className="h-4 w-4" /></button></div><button type="button" className="flex flex-1 items-center justify-between rounded-[1.5rem] bg-primary px-4 py-4 text-sm font-black text-primary-foreground shadow-sm" onClick={() => onAdd({ productId: product._id, name: product.name, price: unitPrice, originalPrice: pricing.originalPrice + variantPrice, quantity, variant: Object.values(variants).length > 0 ? Object.values(variants).join(", ") : undefined, image: product.image, categoryId: product.categoryId, menuNumber: product.menuNumber })}><span>Tambah ke keranjang</span><span>{currency(unitPrice * quantity)}</span></button></div></div></div>;
}
