import { useEffect, useRef, useState } from "react";
import { Grid2X2, Minus, PackageSearch, Plus, RefreshCw, Search, Star, X, ZoomIn, ZoomOut } from "lucide-react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
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
	if (!enabled || isLoading || !summary || summary.publishedCount < 1 || summary.ratingAverage == null) return <span ref={anchorRef} className="block min-h-3" aria-hidden="true" />;
	return <span ref={anchorRef} className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground" aria-label={`Rating ${summary.ratingAverage.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dari 5, ${summary.publishedCount} ulasan`}><Star className="h-3 w-3 shrink-0 text-amber-500" fill="currentColor" />{summary.ratingAverage.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<span aria-hidden="true">·</span><span className="truncate">{summary.publishedCount} ulasan</span></span>;
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
			<button type="button" aria-label={`Lihat gambar ${alt}`} disabled={!src} className="relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-[12px] bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[.97] disabled:cursor-default" onClick={() => setIsOpen(true)}>
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
export interface MenuSectionProps {
	activeCategoryId: Id<"categories"> | null;
	cart: CartItem[];
	codeFeedback: string;
	config: typeof CUSTOMER_ORDERING_DEFAULTS;
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
				<div data-banner-variant={happyHourBanner.session} className="rounded-2xl border border-indigo-200/50 bg-indigo-50 px-3 py-2.5 text-indigo-950">
					<div className="flex items-center justify-between gap-2">
						<div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">Happy Hour {happyHourBanner.sessionLabel}</p><p className="mt-0.5 truncate text-sm font-black">{happyHourBanner.priceLabel}</p></div>
						<p className="shrink-0 text-[10px] font-bold text-indigo-700">{happyHourBanner.startTime}–{happyHourBanner.endTime} WIB</p>
					</div>
				</div>
			) : null}
			{activeDjiwaPayPromo ? (
				<details data-banner-variant="djiwa-pay" className="group rounded-xl border border-blue-200/70 bg-blue-50 text-blue-950">
					<summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1.5 text-left [&::-webkit-details-marker]:hidden">
						<span className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">Promo Djiwa Pay · Diskon 50%</span>
						<span className="shrink-0 text-[10px] font-black text-blue-700 group-open:hidden">Detail</span>
						<span className="hidden shrink-0 text-[10px] font-black text-blue-700 group-open:inline">Tutup</span>
					</summary>
					<div id="djiwa-pay-promo-detail" className="border-t border-blue-200/70 px-2.5 py-2 text-[10px] font-bold text-blue-800"><div className="flex items-center justify-between gap-2"><span>Menu Rp30.000 jadi Rp15.000</span><span className="shrink-0">08:00–21:00 WIB</span></div></div>
				</details>
			) : null}
			<div className="flex items-center justify-between gap-3 px-1 text-[11px] font-bold text-muted-foreground" aria-label="Ringkasan pesanan">
				<p className="min-w-0 truncate">Meja {props.tableNumber.trim() || "—"} · {props.partySize} orang</p>
				<p className="shrink-0">{props.totalItems} item · {currency(props.total)}</p>
			</div>
			{props.freeRefillCharge > 0 ? <p className="px-1 text-[11px] font-bold text-emerald-700">Free refill · {currency(props.freeRefillCharge)}</p> : null}

			<p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Katalog menu</p>

			{props.config.enableCatalogBrowsing ? (
				<div className="relative space-y-3">
					<div data-menu-catalog-top className="-mx-1 rounded-xl border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
						<div className="flex items-center gap-1.5"><Grid2X2 className="h-4 w-4 shrink-0 text-primary" /><h3 className="text-sm font-black leading-tight">Katalog produk</h3></div>
						<div className="relative mt-1.5">
							<Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
							<input
								aria-label="Cari menu"
								className="min-h-10 w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2.5 text-xs font-medium outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
								placeholder="Cari nama atau nomor menu"
								value={props.catalogQuery}
								onChange={(event) => props.setCatalogQuery(event.target.value)}
							/>
						</div>
					</div>
					<div data-category-catalog className="sticky top-0 z-40 isolate self-start -mx-1 w-full rounded-lg border border-border bg-card p-1 shadow-[0_6px_16px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-card/95" style={{ position: "sticky", top: 0, zIndex: 40 }}>
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
								const isSold = product.isAvailable === false || (product.quantity != null && Number(product.quantity) <= 0);
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
										{showRootCategoryHeading ? <div data-category-section={rootCategoryId} data-category-section-level="root" className="scroll-mt-28 pt-3 first:pt-0"><h4 className="px-1 text-sm font-black text-foreground">{rootCategory.name}</h4><div className="mt-1 h-0.5 w-8 rounded-full bg-primary" /></div> : null}
										{showSubcategoryHeading ? <div data-category-section={String(productCategory._id)} data-category-section-level="subcategory" className="scroll-mt-28 pt-3 pb-2"><h5 className="px-1 text-xs font-black text-primary">{productCategory.name}</h5><div className="mt-1 h-px w-full bg-primary/15" /></div> : null}
										<article className="flex items-start gap-2 rounded-[16px] border border-border/80 bg-card p-1.5 shadow-[0_2px_10px_rgba(9,9,11,0.04)] transition-transform duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)]">
										<ProductImageButton src={product.image} alt={product.name} isSold={isSold} />
										<div className="min-w-0 flex-1 py-0">
											<div className="flex min-h-full flex-col gap-1">
											<div>
												<div className="mb-0.5 flex min-h-4 items-center gap-1.5">
													{product.menuNumber != null ? <span className="shrink-0 text-[9px] font-bold text-muted-foreground">#{product.menuNumber}</span> : null}
													{isDjiwaPayEligible ? <span className="rounded-full bg-[#2563eb]/10 px-1.5 py-0.5 text-[9px] font-black leading-none text-[#2563eb]">Djiwa Pay 50%</span> : pricing.isPromo ? <span className="rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none" style={{ background: pricing.isHappyHour ? '#f59e0b1a' : '#ef44441a', color: pricing.isHappyHour ? '#b45309' : '#dc2626' }}>{pricing.isHappyHour ? 'HAPPY HOUR' : 'PROMO'}</span> : null}
												</div>
												<p className="break-words text-[13px] font-black leading-tight">{product.name}</p>
												{product.description ? <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{product.description}</p> : <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Siap dipesan di meja Anda.</p>}
												<ProductReviewSignal productSourceId={String(product._id)} />
												{hasNutritionValues ? <div className="mt-1 flex items-center gap-3 border-y border-primary/10 py-1"><p className="shrink-0 text-[10px] font-black text-primary">Gizi</p><div className="grid min-w-0 flex-1 grid-cols-5 gap-1">{[["Kalori", `${nutrition.caloriesKcal} kkal`], ["Protein", `${nutrition.proteinG} g`], ["Karbo", `${nutrition.carbohydratesG} g`], ["Lemak", `${nutrition.fatG} g`], ["Gula", `${nutrition.sugarG ?? "-"} g`]].map(([label, value]) => <div key={label} className="min-w-0"><p className="truncate text-[9px] leading-tight text-muted-foreground">{label}</p><p className="truncate text-[10px] font-black leading-tight text-foreground">{value}</p></div>)}</div></div> : null}
											</div>
											<div className="flex items-center justify-between gap-2">
													<div><p className="text-base font-black leading-none text-primary">{currency(pricing.finalPrice)}</p>{pricing.isPromo ? <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice)}</p> : null}</div>
													{hasVariations ? <button type="button" disabled={isSold} className="min-h-11 rounded-[14px] border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-black text-primary transition-transform duration-[180ms] active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" onClick={(event) => { props.onProductIntent?.(product, event.currentTarget.getBoundingClientRect()); props.handleProductSelect(product); }}>{quantity > 0 ? `${quantity} di cart` : 'Pilih opsi'}</button> : <div className="flex min-h-11 items-center gap-1 rounded-[14px] border border-border bg-background p-1">
														{quantity > 0 ? <button type="button" disabled={isSold} aria-label={`Kurangi ${product.name}`} className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted-foreground transition-transform active:scale-[.97] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => props.updateCartQuantity(product._id, undefined, -1)}><Minus className="h-3.5 w-3.5" /></button> : null}
														{quantity > 0 ? <span className="min-w-6 text-center text-xs font-black">{quantity}</span> : null}
														<button type="button" disabled={isSold} aria-label={`Tambah ${product.name}`} className="flex h-9 min-w-9 items-center justify-center rounded-[10px] bg-primary px-2 text-primary-foreground transition-transform active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" onClick={(event) => { if (quantity > 0) { props.updateCartQuantity(product._id, undefined, 1); props.onProductAdded?.(product, event.currentTarget.getBoundingClientRect()); return; } const added = props.handleProductSelect(product); if (added) props.onProductAdded?.(product, event.currentTarget.getBoundingClientRect()); }}><Plus className="h-3.5 w-3.5" /></button>
													</div>}
												</div>
											</div>
										</div>
									</article>
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
