import { useEffect, useRef, useState } from "react";
import { Grid2X2, Minus, PackageSearch, Plus, RefreshCw, Search, Star, X, ZoomIn, ZoomOut } from "lucide-react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice, getActiveHappyHourBanner, isDjiwaPayCampaignActive } from "@/lib/utils/pricing";
import { ImageWithPlaceholder } from "./image-with-placeholder";
import type { Doc, Id } from "@/types/backend-compat";
import type { CartItem, MenuMode } from "./types";
import { CUSTOMER_ORDERING_DEFAULTS, currency } from "./types";
import { chipClassName } from "./shared-components";
import { deterministicRecommendationScore, trendLiftScore } from "@/lib/recommendation-engine";
import { markRecommendationNotInterested, recommendationFatiguePenalty, recommendationFeedbackPenalty, recordRecommendationEvent } from "@/lib/recommendation-events";
import { useProductReviewSummary } from "@/hooks/use-product-reviews";


function ProductImage({ src, alt }: { src?: string | null; alt: string }) {
	return (
		<ImageWithPlaceholder
			src={src ?? undefined}
			alt={alt}
			containerClassName="absolute inset-0"
			className="object-cover"
			loading="lazy"
			decoding="async"
			fallback={<PackageSearch className="h-7 w-7" strokeWidth={1.8} />}
		/>
	);
}

function ProductReviewSignal({ productSourceId }: { productSourceId: string }) {
	const anchorRef = useRef<HTMLDivElement | null>(null);
	const [enabled, setEnabled] = useState(false);
	useEffect(() => {
		const node = anchorRef.current;
		if (!node || typeof IntersectionObserver === "undefined") { setEnabled(true); return; }
		const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setEnabled(true); observer.disconnect(); } }, { rootMargin: "160px" });
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	const { summary, isLoading } = useProductReviewSummary(productSourceId, enabled);
	const hasRating = Boolean(summary && summary.publishedCount > 0 && summary.ratingAverage != null);
	const ratingLabel = hasRating ? `Rating ${summary!.ratingAverage!.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dari 5, ${summary!.publishedCount} ulasan` : "Belum ada rating publik";
	return <span ref={anchorRef} className="flex min-h-4 min-w-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground" aria-label={ratingLabel}>{hasRating ? <><Star className="h-3 w-3 shrink-0 text-amber-500" fill="currentColor" />{summary!.ratingAverage!.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<span aria-hidden="true">·</span><span className="truncate">{summary!.publishedCount} ulasan</span></> : <><Star className="h-3 w-3 shrink-0 text-muted-foreground/60" />{isLoading ? "Memuat rating…" : "Belum ada rating"}</>}</span>;
}

function ProductImageButton({ src, alt, isSold }: { src?: string | null; alt: string; isSold: boolean }) {
	const [isOpen, setIsOpen] = useState(false);
	const [zoom, setZoom] = useState(1);
	const closeViewer = () => {
		setIsOpen(false);
		setZoom(1);
	};
	return (
		<>
			<button type="button" aria-label={`Lihat gambar ${alt}`} disabled={!src} className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[18px] bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[.97] disabled:cursor-default" onClick={() => setIsOpen(true)}>
				<ProductImage src={src} alt={alt} />
				{isSold ? <span className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/55 text-[10px] font-black tracking-[0.18em] text-white">SOLD</span> : null}
			</button>
			{isOpen && src && typeof document !== "undefined" ? createPortal(
				<div className="fixed inset-0 z-[2000] flex flex-col bg-slate-950/95 p-4 text-white" role="dialog" aria-modal="true" aria-label={`Gambar ${alt}`} onClick={closeViewer}>
					<div className="flex items-center justify-between gap-3">
						<p className="min-w-0 truncate text-sm font-bold">{alt}</p>
						<button type="button" aria-label="Tutup gambar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-[.97]" onClick={closeViewer}><X className="h-5 w-5" /></button>
					</div>
					<div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden py-4" onClick={(event) => event.stopPropagation()}>
						<img src={src} alt={alt} className="max-h-full max-w-full select-none object-contain transition-transform duration-200 ease-out" style={{ transform: `scale(${zoom})` }} draggable={false} />
					</div>
					<div className="flex items-center justify-center gap-2 pb-[env(safe-area-inset-bottom)]">
						<button type="button" aria-label="Perkecil gambar" disabled={zoom <= 1} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 disabled:opacity-40" onClick={() => setZoom((value) => Math.max(1, value - 0.5))}><ZoomOut className="h-5 w-5" /></button>
						<button type="button" aria-label="Reset ukuran gambar" className="rounded-full bg-white/10 px-4 py-2.5 text-xs font-bold" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
						<button type="button" aria-label="Perbesar gambar" disabled={zoom >= 3} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 disabled:opacity-40" onClick={() => setZoom((value) => Math.min(3, value + 0.5))}><ZoomIn className="h-5 w-5" /></button>
					</div>
				</div>,
				document.body,
			) : null}
		</>
	);
}
/** Tombol tambah: lingkaran "+" yang berubah jadi stepper; angka bergulir dan tombol memantul. */
function ProductAddControl({ name, quantity, disabled, onAdd, onMinus }: { name: string; quantity: number; disabled: boolean; onAdd: (origin: DOMRect) => void; onMinus: () => void }) {
	const reduce = useReducedMotion();
	const spring = { type: "spring", stiffness: 420, damping: 26 } as const;
	return (
		<motion.div layout transition={spring} className={cn("flex h-10 items-center overflow-hidden rounded-full", quantity > 0 ? "bg-primary/10 text-primary" : "bg-primary text-primary-foreground shadow-md shadow-primary/30")}>
			<AnimatePresence initial={false} mode="popLayout">
				{quantity > 0 ? (
					<motion.button key="minus" type="button" disabled={disabled} aria-label={`Kurangi ${name}`} initial={reduce ? false : { opacity: 0, scale: 0.4, width: 0 }} animate={{ opacity: 1, scale: 1, width: 36 }} exit={reduce ? undefined : { opacity: 0, scale: 0.4, width: 0 }} transition={spring} whileTap={reduce ? undefined : { scale: 0.8 }} className="flex h-10 w-9 items-center justify-center" onClick={onMinus}><Minus className="h-4 w-4" strokeWidth={2.8} /></motion.button>
				) : null}
			</AnimatePresence>
			{quantity > 0 ? (
				<span className="relative flex h-10 min-w-6 items-center justify-center overflow-hidden text-[15px] font-bold tabular-nums" aria-live="polite">
					<AnimatePresence initial={false} mode="popLayout"><motion.span key={quantity} initial={reduce ? false : { y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? undefined : { y: -16, opacity: 0 }} transition={spring}>{quantity}</motion.span></AnimatePresence>
				</span>
			) : null}
			<motion.button type="button" disabled={disabled} aria-label={`Tambah ${name}`} whileTap={reduce ? undefined : { scale: 0.8, rotate: 90 }} transition={spring} className="flex h-10 w-10 items-center justify-center disabled:opacity-40" onClick={(event) => onAdd(event.currentTarget.getBoundingClientRect())}><Plus className="h-[18px] w-[18px]" strokeWidth={2.8} /></motion.button>
		</motion.div>
	);
}

export interface MenuSectionProps {
	integratedStock?: boolean;
	activeCategoryId: Id<"categories"> | null;
	cart: CartItem[];
	codeFeedback: string;
	config: typeof CUSTOMER_ORDERING_DEFAULTS;
	showDineInSummary: boolean;
	discounts: Doc<"discounts">[] | undefined;
	filteredProducts: Doc<"products">[];
	freeRefillCharge: number;
	bestSellers?: Array<{ productId: string; totalSold: number; period?: "today" | "week" | "previous_week" | "month" | "all" }> | undefined;
	recentProductIds?: string[];
	handleProductSelect: (product: Doc<"products">) => boolean;
	onProductAdded?: (product: Doc<"products">, origin: DOMRect) => void;
		onProductIntent?: (product: Doc<"products">, origin: DOMRect) => void;
	isMenuError: boolean;
	isMenuLoading: boolean;
	onRetryMenu: () => void;
	logoUrl: string;
	manualCode: string;
	catalogQuery: string;
	menuMode: MenuMode;
	orderedCategories: Doc<"categories">[];
	partySize: number;
	pendingNumberProduct: Doc<"products"> | null;
	pendingNumberQuantity: number;
	approvePendingNumberProduct: () => void;
	cancelPendingNumberProduct: () => void;
	setPendingNumberQuantity: (value: number) => void;
	setActiveCategoryId: (value: Id<"categories"> | null) => void;
	setCartOpen: (value: boolean) => void;
	setManualCode: (value: string) => void;
	setCatalogQuery: (value: string) => void;
	setMenuMode: (value: MenuMode) => void;
	setScannerOpen: (value: boolean) => void;
	storeName: string;
	tableNumber: string;
	themeColor: string;
	total: number;
	totalItems: number;
	updateCartQuantity: (productId: Id<"products">, variant: string | undefined, delta: number) => void;
}

export function renderMenuSection(props: MenuSectionProps) {
	const happyHourBanner = getActiveHappyHourBanner(props.discounts);
	const activeDjiwaPayPromo = props.discounts?.find((discount) => isDjiwaPayCampaignActive(discount));
	const djiwaPayCampaignActive = Boolean(activeDjiwaPayPromo);
	const isCodeFeedbackError = /belum unik|tidak|gagal|error/i.test(props.codeFeedback);
	const categoryDisplayPriority = (category: Doc<"categories"> | null) =>
		Number.isFinite(Number(category?.displayOrder)) ? Number(category?.displayOrder) : 9999;
	const rootCategories = props.orderedCategories
		.filter((category) => !category.parentId && category.track !== "hidden")
		.sort((a, b) => categoryDisplayPriority(a) - categoryDisplayPriority(b));
	const categoryById = new Map(props.orderedCategories.map((category) => [String(category._id), category]));
	const rootCategoryForProduct = (product: Doc<"products">) => {
		const category = categoryById.get(String(product.categoryId));
		if (!category) return null;
		return category.parentId ? categoryById.get(String(category.parentId)) ?? category : category;
	};
	const selectedCategory = props.activeCategoryId
		? categoryById.get(String(props.activeCategoryId)) ?? null
		: null;
	const subcategoryDisplayPriority = (category: Doc<"categories"> | null) =>
		Number.isFinite(Number(category?.displayOrder)) ? Number(category?.displayOrder) : 9999;
	const productCategoryRank = (product: Doc<"products">) => {
		if (!selectedCategory) return 1;
		const category = categoryById.get(String(product.categoryId));
		if (!category) return 2;
		// When Bubur is selected, Bubur must be the first vertical section;
		// the remaining sections stay available below it in the same scroll.
		if (String(category._id) === String(selectedCategory._id)) return 0;
		if (String(category.parentId ?? "") === String(selectedCategory._id)) return 0;
		if (String(selectedCategory.parentId ?? "") === String(category.parentId ?? "")) return 1;
		return 2;
	};
	const catalogProducts = [...props.filteredProducts].sort((a, b) => {
		const aRoot = rootCategoryForProduct(a);
		const bRoot = rootCategoryForProduct(b);
		const rankDelta = productCategoryRank(a) - productCategoryRank(b);
		const aCategory = categoryById.get(String(a.categoryId));
		const bCategory = categoryById.get(String(b.categoryId));
		const rootDelta = categoryDisplayPriority(aRoot) - categoryDisplayPriority(bRoot);
		const subcategoryDelta = subcategoryDisplayPriority(aCategory) - subcategoryDisplayPriority(bCategory);
		return rootDelta || rankDelta || subcategoryDelta;
	});
	const bestSellerRank = new Map((props.bestSellers ?? []).map((item) => [String(item.productId), Number(item.totalSold)]));
	const recentRank = new Map((props.recentProductIds ?? []).map((id, index) => [String(id), Math.max(1, 8 - index)]));
	const inlineRecommendations = catalogProducts.filter((product) => !props.cart.some((item) => String(item.productId) === String(product._id))).filter((product) => bestSellerRank.has(String(product._id)) || recentRank.has(String(product._id))).sort((a, b) => ((recentRank.get(String(b._id)) ?? 0) * 1000 + (bestSellerRank.get(String(b._id)) ?? 0)) - ((recentRank.get(String(a._id)) ?? 0) * 1000 + (bestSellerRank.get(String(a._id)) ?? 0))).slice(0, 2);
	const recommendationTitle = (props.recentProductIds ?? []).length > 0 ? "Rekomendasi untuk kamu" : "Paling sering dipesan";
	const recommendationSubtitle = (props.recentProductIds ?? []).length > 0 ? "Pesanan terakhir dan favoritmu" : "Favorit pelanggan Djiwa Tentram";
	const periodRank = (period: "today" | "week" | "previous_week" | "month" | "all") => new Map((props.bestSellers ?? []).filter((item) => (item.period ?? "all") === period).map((item) => [String(item.productId), Number(item.totalSold)]));
	const recommendationBlocks = (() => {
		const cartIds = new Set(props.cart.map((item) => String(item.productId)));
		const recentIds = new Set((props.recentProductIds ?? []).map(String));
		const today = periodRank("today");
		const week = periodRank("week");
		const previousWeek = periodRank("previous_week");
		const month = periodRank("month");
		const allTime = periodRank("all");
		const makeCandidates = (kind: "recent" | "today" | "week" | "month" | "all") => catalogProducts.filter((product) => !cartIds.has(String(product._id))).filter((product) => kind === "recent" ? recentIds.has(String(product._id)) : (kind === "today" ? today.has(String(product._id)) : kind === "week" ? week.has(String(product._id)) : kind === "month" ? month.has(String(product._id)) : allTime.has(String(product._id)))).sort((a, b) => {
			const rank = (product: typeof a) => deterministicRecommendationScore({ recentScore: kind === "recent" ? (recentRank.get(String(product._id)) ?? 0) : 0, periodScore: kind === "recent" ? 0 : (kind === "today" ? (today.get(String(product._id)) ?? 0) : kind === "week" ? (week.get(String(product._id)) ?? 0) : kind === "month" ? (month.get(String(product._id)) ?? 0) : (allTime.get(String(product._id)) ?? 0)), pairingScore: kind === "week" ? trendLiftScore(week.get(String(product._id)) ?? 0, previousWeek.get(String(product._id)) ?? 0) : 0, diversityPenalty: recommendationFatiguePenalty(String(product._id)) + recommendationFeedbackPenalty(String(product._id)) });
			return rank(b) - rank(a);
		});
		const diversifyCandidates = (products: typeof catalogProducts) => {
			const selected: typeof catalogProducts = [];
			const usedRoots = new Set<string>();
			for (const product of products) {
				const root = rootCategoryForProduct(product);
				const rootKey = String(root?._id ?? product.categoryId ?? "uncategorized");
				if (usedRoots.has(rootKey)) continue;
				usedRoots.add(rootKey);
				selected.push(product);
				if (selected.length === 2) return selected;
			}
			return selected.concat(products.filter((product) => !selected.includes(product))).slice(0, 2);
		};
		const definitions = [
			{ kind: "recent" as const, title: "Pesanan sebelumnya", subtitle: "Pesan lagi menu yang pernah kamu pilih", strategy: "recent_history" },
			{ kind: "today" as const, title: "Best seller hari ini", subtitle: "Paling banyak dipesan hari ini", strategy: "bestseller_today" },
			{ kind: "week" as const, title: "Sedang naik minggu ini", subtitle: "Menu dengan tren pesanan yang meningkat", strategy: "trending_week" },
			{ kind: "month" as const, title: "Favorit bulan ini", subtitle: "Menu favorit pelanggan bulan ini", strategy: "bestseller_month" },
			{ kind: "all" as const, title: "Favorit pelanggan", subtitle: "Pilihan populer di Djiwa Tentram", strategy: "bestseller_all" },
		];
		return definitions.map((definition) => ({ ...definition, products: diversifyCandidates(makeCandidates(definition.kind)) })).filter((block) => block.products.length > 0);
	})();
	const recommendationPositions = [2, 6, 11, 17].map((position, index) => ({ position, sort: (catalogProducts.length * 31 + index * 17) % 101 })).sort((a, b) => a.sort - b.sort).map((entry) => entry.position).filter((position) => position < catalogProducts.length);
	const recommendationBlocksByIndex = new Map(recommendationBlocks.slice(0, recommendationPositions.length).map((block, index) => [recommendationPositions[index], block]));
	const renderRecommendationBlock = (block: (typeof recommendationBlocks)[number]) => <section className="col-span-2 mt-3 rounded-2xl border border-primary/15 bg-primary/5 p-2.5" aria-label={block.title}><div className="mb-2"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">{block.title}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{block.subtitle}</p></div><div className="grid grid-cols-2 gap-2">{block.products.map((recommendation) => <div key={`${block.strategy}-${recommendation._id}`} className="relative min-w-0"><button type="button" onClick={(event) => { void recordRecommendationEvent({ eventType: "click", recommendedProductSourceId: String(recommendation._id), strategy: block.strategy }); const added = props.handleProductSelect(recommendation); if (added) props.onProductAdded?.(recommendation, event.currentTarget.getBoundingClientRect()); }} className="flex min-h-16 w-full items-center gap-2 rounded-xl border border-border bg-card p-2 pr-9 text-left shadow-sm"><span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">{recommendation.image ? <img src={recommendation.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}</span><span className="min-w-0"><span className="block line-clamp-2 text-xs font-black leading-tight">{recommendation.name}</span><span className="mt-1 block text-[10px] font-bold text-primary">{currency(Number(recommendation.price ?? 0))}</span></span></button><button type="button" aria-label={`Tidak tertarik dengan ${recommendation.name}`} title="Tidak tertarik" className="absolute right-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" onClick={() => { markRecommendationNotInterested(String(recommendation._id)); void recordRecommendationEvent({ eventType: "not_interested", recommendedProductSourceId: String(recommendation._id), strategy: block.strategy }); }}><X className="h-4 w-4" strokeWidth={2} aria-hidden="true" /></button></div>)}</div></section>;
	const firstProductIndexByRootCategory = new Map<string, number>();
	const firstProductIndexByCategory = new Map<string, number>();
	catalogProducts.forEach((product, index) => {
		const category = categoryById.get(String(product.categoryId));
		const rootCategory = rootCategoryForProduct(product);
		if (rootCategory && !firstProductIndexByRootCategory.has(String(rootCategory._id))) firstProductIndexByRootCategory.set(String(rootCategory._id), index);
		if (category && !firstProductIndexByCategory.has(String(category._id))) firstProductIndexByCategory.set(String(category._id), index);
	});
	const scrollToCategory = (categoryId: Id<"categories"> | null) => {
		props.setActiveCategoryId(categoryId);
		window.requestAnimationFrame(() => {
			if (!categoryId) {
				document.querySelector<HTMLElement>("[data-menu-catalog-top]")?.scrollIntoView({ behavior: "smooth", block: "start" });
				return;
			}
			document.querySelector<HTMLElement>(`[data-category-section="${String(categoryId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
		});
	};

	return (
		<div className="space-y-3 px-3 py-3">
			{happyHourBanner ? (
				<div data-banner-variant={happyHourBanner.session} className="rounded-[22px] bg-gradient-to-br from-[#0f2347] to-[#17407f] px-4 py-3 text-white shadow-[0_10px_30px_rgba(15,35,71,0.18)]">
					<div className="flex items-center justify-between gap-2">
						<div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Happy Hour {happyHourBanner.sessionLabel}</p><p className="mt-0.5 truncate text-sm font-black">{happyHourBanner.priceLabel}</p></div>
						<p className="shrink-0 text-[11px] font-semibold text-white/75">{happyHourBanner.startTime}–{happyHourBanner.endTime} WIB</p>
					</div>
				</div>
			) : null}
			{activeDjiwaPayPromo ? (
				<details data-banner-variant="djiwa-pay" className="group rounded-[20px] bg-primary/10 text-blue-950">
					<summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1.5 text-left [&::-webkit-details-marker]:hidden">
						<span className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">Promo Djiwa Pay · Diskon 50%</span>
						<span className="shrink-0 text-[10px] font-black text-blue-700 group-open:hidden">Detail</span>
						<span className="hidden shrink-0 text-[10px] font-black text-blue-700 group-open:inline">Tutup</span>
					</summary>
					<div id="djiwa-pay-promo-detail" className="border-t border-blue-200/70 px-2.5 py-2 text-[10px] font-bold text-blue-800"><div className="flex items-center justify-between gap-2"><span>Menu Rp30.000 jadi Rp15.000</span><span className="shrink-0">08:00–21:00 WIB</span></div></div>
				</details>
			) : null}
			<div className="flex items-center justify-between gap-3 px-1 text-[13px] font-semibold text-muted-foreground" aria-label="Ringkasan pesanan">
				{props.showDineInSummary ? <p className="min-w-0 truncate">Meja {props.tableNumber.trim() || "—"} · {props.partySize} orang</p> : <span />}
				<p className="shrink-0">{props.totalItems} item · {currency(props.total)}</p>
			</div>
			{props.freeRefillCharge > 0 ? <p className="px-1 text-[11px] font-bold text-emerald-700">Free refill · {currency(props.freeRefillCharge)}</p> : null}

			

			{props.config.enableCatalogBrowsing ? (
				<div className="relative space-y-3">
					<div data-menu-catalog-top className="-mx-1 pt-1">
						<h3 className="px-1 font-display text-[32px] font-extrabold leading-none tracking-[-0.04em]">Menu</h3>
						<div className="relative mt-3">
							<Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								aria-label="Cari menu"
								className="h-11 w-full rounded-[14px] bg-[rgba(118,118,128,0.12)] py-1.5 pl-9 pr-3 text-[16px] font-medium outline-none transition-shadow focus:bg-white focus:shadow-[inset_0_0_0_2px_var(--primary)]"
								placeholder="Cari nama atau nomor menu"
								value={props.catalogQuery}
								onChange={(event) => props.setCatalogQuery(event.target.value)}
							/>
						</div>
					</div>
					<div data-category-catalog className="sticky top-0 z-40 isolate self-start -mx-1 w-full rounded-2xl bg-white/80 p-1.5 shadow-[0_8px_24px_rgba(15,35,71,0.1)] backdrop-blur-2xl" style={{ position: "sticky", top: 0, zIndex: 40 }}>
						<div className="relative">
							<p className="mb-1 px-1 text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">Kategori utama</p>
							<div aria-label="Kategori utama menu" className="flex gap-1 overflow-x-auto pb-0.5 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								<button type="button" data-category-chip="all" className={chipClassName(props.activeCategoryId === null, true)} onClick={() => scrollToCategory(null)}>Semua</button>
								{rootCategories.map((category) => {
									const hasActiveChild = props.orderedCategories.some((child) => child.parentId === category._id && child._id === props.activeCategoryId);
									return <button key={category._id} type="button" data-category-chip={String(category._id)} className={chipClassName(props.activeCategoryId === category._id || hasActiveChild, true)} onClick={() => scrollToCategory(category._id)}>{category.name}</button>;
								})}
								{props.isMenuLoading ? <span className="whitespace-nowrap rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">memuat...</span> : null}
							</div>
						</div>
						{(() => {
							const activeRoot = rootCategories.find((category) =>
								category._id === props.activeCategoryId ||
								props.orderedCategories.some((child) => child.parentId === category._id && child._id === props.activeCategoryId)
							);
							const subcategories = activeRoot
								? props.orderedCategories
									.filter((category) => category.parentId === activeRoot._id && category.track !== "hidden")
									.sort((a, b) => subcategoryDisplayPriority(a) - subcategoryDisplayPriority(b))
								: [];
							if (!subcategories.length) return null;
							return (
								<div className="mt-1 rounded-md bg-muted/40 p-1">
									<p className="mb-1 px-1 text-[9px] font-black uppercase tracking-[0.14em] text-primary/80">Subkategori {activeRoot.name} · navigasi menu</p>
									<div aria-label={`Subkategori ${activeRoot.name}`} className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
										<button type="button" data-category-chip={String(activeRoot._id)} className={chipClassName(props.activeCategoryId === activeRoot._id, true)} onClick={() => scrollToCategory(activeRoot._id)}>Semua {activeRoot.name}</button>
										{subcategories.map((subcategory) => (
											<button type="button" key={subcategory._id} data-category-chip={String(subcategory._id)} className={chipClassName(props.activeCategoryId === subcategory._id, true)} onClick={() => scrollToCategory(subcategory._id)}>{subcategory.name}</button>
										))}
									</div>
								</div>
							);
						})()}
					</div>
					{props.isMenuError ? (
						<div role="alert" className="col-span-2 flex flex-col items-center rounded-3xl border border-red-200 bg-red-50 px-4 py-10 text-center text-red-800">
							<PackageSearch aria-hidden="true" className="h-7 w-7" strokeWidth={2} />
							<p className="mt-3 font-display text-sm font-bold">Menu gagal dimuat</p>
							<p className="mt-1 text-xs text-red-700/80">Periksa koneksi lalu coba lagi.</p>
							<button type="button" onClick={props.onRetryMenu} disabled={props.isMenuLoading} aria-busy={props.isMenuLoading} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-red-700 px-4 py-2.5 text-xs font-black text-white disabled:pointer-events-none disabled:opacity-60"><motion.span aria-hidden="true" animate={props.isMenuLoading ? { rotate: 360 } : { rotate: 0 }} transition={props.isMenuLoading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}><RefreshCw className="h-3.5 w-3.5" /></motion.span>{props.isMenuLoading ? "Memuat menu..." : "Coba lagi"}</button>
						</div>
					) : props.isMenuLoading ? (
						<div className="grid grid-cols-2 gap-x-2.5 gap-y-4">
							{[1,2,3,4].map((i) => (
								<div key={i} className="relative overflow-hidden rounded-[20px] border border-border bg-card shadow-sm before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-full before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent before:animate-shimmer">
									<div className="h-28 w-full bg-muted" />
									<div className="space-y-2 p-2.5">
										<div className="h-3 w-3/4 rounded bg-muted" />
										<div className="h-4 w-1/2 rounded bg-muted" />
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="space-y-2.5">
							{props.filteredProducts.length === 0 ? <div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-4 py-10 text-center"><PackageSearch aria-hidden="true" className="h-7 w-7 text-muted-foreground" strokeWidth={2} /><p className="mt-3 font-display text-sm font-bold">Menu belum tersedia</p><p className="mt-1 text-xs text-muted-foreground">Pilih kategori lain atau coba lagi sebentar.</p></div> : null}
							{catalogProducts.map((product, index) => {
								const pricing = calculateEffectivePrice({ _id: product._id, price: product.price, categoryId: product.categoryId }, props.discounts);
								const isDjiwaPayEligible = djiwaPayCampaignActive && Number(product.price) === 30000;
								const quantity = props.cart.filter((item) => item.productId === product._id).reduce((sum, item) => sum + item.quantity, 0);
								const isSold = product.isAvailable === false || (props.integratedStock && product.quantity != null && Number(product.quantity) <= 0);
								const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;
								const nutrition = product.nutrition && typeof product.nutrition === "object" && product.nutrition.status !== "rejected" ? product.nutrition : null;
								const hasNutritionValues = nutrition && [nutrition.caloriesKcal, nutrition.proteinG, nutrition.carbohydratesG, nutrition.fatG].every((value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0);
								const rootCategory = rootCategoryForProduct(product);
								const rootCategoryId = rootCategory ? String(rootCategory._id) : "uncategorized";
								const productCategory = categoryById.get(String(product.categoryId));
								const showRootCategoryHeading = rootCategory && firstProductIndexByRootCategory.get(rootCategoryId) === index;
								const showSubcategoryHeading = productCategory?.parentId && firstProductIndexByCategory.get(String(productCategory._id)) === index;
								return (
									<div key={product._id}>
										{showRootCategoryHeading ? <div data-category-section={rootCategoryId} data-category-section-level="root" className="scroll-mt-28 pt-3 first:pt-0"><h4 className="px-1 font-display text-[22px] font-extrabold tracking-[-0.02em] text-foreground">{rootCategory.name}</h4><div className="mt-1.5 h-1 w-9 rounded-full bg-primary" /></div> : null}
										{showSubcategoryHeading ? <div data-category-section={String(productCategory._id)} data-category-section-level="subcategory" className="scroll-mt-28 pt-3 pb-2"><h5 className="px-1 text-[15px] font-bold text-primary">{productCategory.name}</h5><div className="mt-1 h-px w-full bg-primary/15" /></div> : null}
										<motion.article initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }} whileTap={{ scale: 0.985 }} className="flex items-start gap-3 rounded-[24px] bg-white p-2.5 shadow-[0_6px_18px_rgba(15,35,71,0.06)]">
										<ProductImageButton src={product.image} alt={product.name} isSold={isSold} />
										<div className="min-w-0 flex-1 py-0">
											<div className="flex min-h-full flex-col gap-1">
											<div>
												<div className="mb-0.5 flex min-h-4 items-center gap-1.5">
													{product.menuNumber != null ? <span className="shrink-0 text-[11px] font-semibold text-muted-foreground/80">#{product.menuNumber}</span> : null}
													{isDjiwaPayEligible ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold leading-none text-primary">Djiwa Pay 50%</span> : pricing.isPromo ? <span className="rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none" style={{ background: pricing.isHappyHour ? '#f59e0b1a' : '#ef44441a', color: pricing.isHappyHour ? '#b45309' : '#dc2626' }}>{pricing.isHappyHour ? 'HAPPY HOUR' : 'PROMO'}</span> : null}
												</div>
												<p className="break-words text-[16px] font-bold leading-tight tracking-[-0.01em]">{product.name}</p>
												{product.description ? <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">{product.description}</p> : <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">Siap dipesan di meja Anda.</p>}
												<ProductReviewSignal productSourceId={String(product._id)} />
												{hasNutritionValues ? <div className="mt-1.5 flex items-center gap-2.5 border-y border-black/[0.07] py-1.5"><p className="shrink-0 text-[11px] font-bold text-primary">Gizi</p><div className="grid min-w-0 flex-1 grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-1">{[["Kalori", `${nutrition.caloriesKcal} kkal`], ["Protein", `${nutrition.proteinG} g`], ["Karbo", `${nutrition.carbohydratesG} g`], ["Lemak", `${nutrition.fatG} g`], ["Gula", `${nutrition.sugarG ?? "-"} g`]].map(([label, value]) => <div key={label} className="min-w-0"><p className="truncate text-[9px] leading-tight text-muted-foreground">{label}</p><p className="whitespace-nowrap text-[10.5px] font-bold leading-tight tabular-nums text-foreground">{value}</p></div>)}</div></div> : null}
											</div>
											<div className="flex items-center justify-between gap-2">
													<div><p className="text-[17px] font-extrabold leading-none tabular-nums text-foreground">{currency(pricing.finalPrice)}</p>{pricing.isPromo ? <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice)}</p> : null}</div>
													{hasVariations ? <motion.button type="button" disabled={isSold} whileTap={{ scale: 0.95 }} className="min-h-10 rounded-full bg-primary/10 px-4 py-2 text-[13px] font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={(event) => { props.onProductIntent?.(product, event.currentTarget.getBoundingClientRect()); props.handleProductSelect(product); }}>{quantity > 0 ? `${quantity} di keranjang` : 'Pilih opsi'}</motion.button> : <ProductAddControl name={product.name} quantity={quantity} disabled={Boolean(isSold)} onMinus={() => props.updateCartQuantity(product._id, undefined, -1)} onAdd={(origin) => { if (quantity > 0) { props.updateCartQuantity(product._id, undefined, 1); props.onProductAdded?.(product, origin); return; } const added = props.handleProductSelect(product); if (added) props.onProductAdded?.(product, origin); }} />}
												</div>
											</div>
										</div>
									</motion.article>
									{recommendationBlocksByIndex.has(index) ? renderRecommendationBlock(recommendationBlocksByIndex.get(index)!) : null}
									</div>
								);
							})}
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}
