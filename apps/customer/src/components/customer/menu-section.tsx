import { useState } from "react";
import { Barcode, Grid2X2, Minus, PackageSearch, Plus, RefreshCw, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice, getActiveHappyHourBanner, isDjiwaPayCampaignActive } from "@/lib/utils/pricing";
import { ImageWithPlaceholder } from "./image-with-placeholder";
import type { Doc, Id } from "@/types/backend-compat";
import type { CartItem, MenuMode } from "./types";
import { CUSTOMER_ORDERING_DEFAULTS, currency } from "./types";
import { chipClassName } from "./shared-components";


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
	handleProductSelect: (product: Doc<"products">) => void;
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
	const rootCategories = props.orderedCategories.filter((category) => !category.parentId && category.track !== "hidden");
	const categoryById = new Map(props.orderedCategories.map((category) => [String(category._id), category]));
	const rootCategoryForProduct = (product: Doc<"products">) => {
		const category = categoryById.get(String(product.categoryId));
		if (!category) return null;
		return category.parentId ? categoryById.get(String(category.parentId)) ?? category : category;
	};
	const firstProductIndexByRootCategory = new Map<string, number>();
	const firstProductIndexByCategory = new Map<string, number>();
	props.filteredProducts.forEach((product, index) => {
		const category = categoryById.get(String(product.categoryId));
		const rootCategory = rootCategoryForProduct(product);
		if (rootCategory && !firstProductIndexByRootCategory.has(String(rootCategory._id))) firstProductIndexByRootCategory.set(String(rootCategory._id), index);
		if (category && !firstProductIndexByCategory.has(String(category._id))) firstProductIndexByCategory.set(String(category._id), index);
	});
	const scrollToCategory = (categoryId: Id<"categories"> | null) => {
		props.setActiveCategoryId(categoryId);
		window.requestAnimationFrame(() => {
			if (!categoryId) {
				document.querySelector<HTMLElement>("[data-category-catalog]")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
				<div data-banner-variant="djiwa-pay" className="rounded-2xl border border-blue-200/70 bg-blue-50 px-3 py-2.5 text-blue-950">
					<div className="flex items-center justify-between gap-2">
						<div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">Promo Djiwa Pay</p><p className="mt-0.5 truncate text-sm font-black">Diskon 50% · Menu Rp30.000 jadi Rp15.000</p></div>
						<p className="shrink-0 text-[10px] font-bold text-blue-700">Berlaku 08:00–21:00 WIB</p>
					</div>
				</div>
			) : null}
			<div className="flex items-center justify-between gap-3 px-1 text-[11px] font-bold text-muted-foreground" aria-label="Ringkasan pesanan">
				<p className="min-w-0 truncate">Meja {props.tableNumber.trim() || "—"} · {props.partySize} orang</p>
				<p className="shrink-0">{props.totalItems} item · {currency(props.total)}</p>
			</div>
			{props.freeRefillCharge > 0 ? <p className="px-1 text-[11px] font-bold text-emerald-700">Free refill · {currency(props.freeRefillCharge)}</p> : null}

			<div className="grid grid-cols-2 gap-2 rounded-[18px] border border-border bg-card p-1.5 shadow-sm" role="tablist" aria-label="Mode pemilihan menu">
				<button type="button" role="tab" aria-selected={props.menuMode === "number"} className={cn("min-h-11 rounded-[14px] px-3 py-2 text-xs font-black transition-all duration-[180ms] active:scale-[.97]", props.menuMode === "number" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/60")} onClick={() => props.setMenuMode("number")}>Kode menu</button>
				<button type="button" role="tab" aria-selected={props.menuMode === "catalog"} className={cn("min-h-11 rounded-[14px] px-3 py-2 text-xs font-black transition-all duration-[180ms] active:scale-[.97]", props.menuMode === "catalog" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/60")} onClick={() => props.setMenuMode("catalog")}>Katalog</button>
			</div>
			<p className="px-1 text-xs text-muted-foreground">{props.menuMode === "number" ? "Masukkan nomor yang tertera di menu meja." : "Pilih makanan dan minuman dari katalog."}</p>

			{props.menuMode === "number" && props.config.enableMenuNumberEntry ? (
				<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
					<div className="flex items-center justify-between gap-2">
						<div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: props.themeColor }}>Mode cepat</p><h3 className="text-sm font-black">Input nomor produk</h3></div>
						{props.config.enableBarcodeScan ? <button type="button" className="flex min-h-11 items-center gap-1.5 rounded-[14px] border border-primary/20 bg-primary/5 px-3 py-2 text-[10px] font-bold text-primary" onClick={() => props.setScannerOpen(true)}><Barcode className="h-3.5 w-3.5" />Scan</button> : null}
					</div>
					<div className="mt-3 rounded-xl border border-border bg-background px-3 py-3 shadow-inner">
						<div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><input className="w-full bg-transparent text-xl font-black tracking-[0.25em] outline-none placeholder:text-base placeholder:font-semibold placeholder:tracking-normal" inputMode="numeric" placeholder="Ketik nomor menu" value={props.manualCode} onChange={(event) => props.setManualCode(event.target.value.replace(/\D/g, ""))} /></div>
					</div>
					{props.codeFeedback ? <p role={isCodeFeedbackError ? "alert" : "status"} className={cn("mt-2.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold", isCodeFeedbackError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>{props.codeFeedback}</p> : <p className="mt-2.5 text-xs text-muted-foreground">Masukkan nomor produk lengkap untuk mencari menu.</p>}
					{props.pendingNumberProduct ? (
						<div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
							<p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Konfirmasi Produk</p>
							<div className="mt-1 flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="truncate text-sm font-black text-foreground">{props.pendingNumberProduct.name}</p>
									<p className="mt-0.5 text-xs text-muted-foreground">Nomor {props.pendingNumberProduct.menuNumber ?? props.manualCode}</p>
								</div>
								<p className="shrink-0 text-sm font-black text-primary">{currency(calculateEffectivePrice({ _id: props.pendingNumberProduct._id, price: props.pendingNumberProduct.price, categoryId: props.pendingNumberProduct.categoryId }, props.discounts).finalPrice)}</p>
							</div>
							<div className="mt-3 flex items-center justify-between gap-2">
								<div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
									<button type="button" aria-label="Kurangi jumlah" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => props.setPendingNumberQuantity(Math.max(1, props.pendingNumberQuantity - 1))}><Minus className="h-4 w-4" /></button>
									<span className="min-w-8 text-center text-sm font-black">{props.pendingNumberQuantity}</span>
									<button type="button" aria-label="Tambah jumlah" className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground" onClick={() => props.setPendingNumberQuantity(props.pendingNumberQuantity + 1)}><Plus className="h-4 w-4" /></button>
								</div>
								<div className="flex items-center gap-1.5">
									<button type="button" className="min-h-11 rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground" onClick={props.cancelPendingNumberProduct}>Batal</button>
									<button type="button" className="min-h-11 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground" onClick={props.approvePendingNumberProduct}>Tambah ke keranjang</button>
								</div>
							</div>
						</div>
					) : null}
					<div className="mt-3 grid grid-cols-3 gap-2">
						{["1","2","3","4","5","6","7","8","9"].map((digit) => <button type="button" key={digit} className="rounded-xl border border-border bg-background px-3 py-3 text-xl font-black shadow-sm" onClick={() => props.setManualCode(`${props.manualCode}${digit}`)}>{digit}</button>)}
						<button type="button" className="rounded-xl border border-border bg-background px-3 py-3 text-xs font-black shadow-sm" onClick={() => props.setManualCode("")}>Clear</button>
						<button type="button" className="rounded-xl border border-border bg-background px-3 py-3 text-xl font-black shadow-sm" onClick={() => props.setManualCode(`${props.manualCode}0`)}>0</button>
						<button type="button" className="rounded-xl bg-primary px-3 py-3 text-xs font-black text-primary-foreground shadow-sm" onClick={() => props.setManualCode(props.manualCode.slice(0, -1))}>Delete</button>
					</div>
				</div>
			) : null}

			{props.menuMode === "catalog" && props.config.enableCatalogBrowsing ? (
				<div className="space-y-3">
					<div data-category-catalog className="-mx-1 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80">
						<div className="flex items-center gap-1.5"><Grid2X2 className="h-4 w-4 text-primary" /><h3 className="text-sm font-black">Katalog produk</h3></div>
						<div className="mt-3 relative">
							<Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								aria-label="Cari menu"
								className="min-h-11 w-full rounded-[14px] border border-border bg-background py-2 pl-9 pr-3 text-xs font-medium outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
								placeholder="Cari nama atau nomor menu"
								value={props.catalogQuery}
								onChange={(event) => props.setCatalogQuery(event.target.value)}
							/>
						</div>
						<div className="relative mt-3">
							<div aria-label="Kategori menu" className="flex gap-1.5 overflow-x-auto pb-1 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								<button type="button" data-category-chip="all" className={chipClassName(props.activeCategoryId === null)} onClick={() => scrollToCategory(null)}>Semua</button>
							{rootCategories.map((category) => {
								const hasActiveChild = props.orderedCategories.some((child) => child.parentId === category._id && child._id === props.activeCategoryId);
								return <button key={category._id} type="button" data-category-chip={String(category._id)} className={chipClassName(props.activeCategoryId === category._id || hasActiveChild)} onClick={() => scrollToCategory(category._id)}>{category.name}</button>;
							})}
							{props.isMenuLoading ? <span className="whitespace-nowrap rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">memuat...</span> : null}
							</div>
						</div>
						{(() => {
							const rootCategories = props.orderedCategories.filter((category) => !category.parentId && category.track !== "hidden");
							const activeRoot = rootCategories.find((category) =>
								category._id === props.activeCategoryId ||
								props.orderedCategories.some((child) => child.parentId === category._id && child._id === props.activeCategoryId)
							);
							const subcategories = activeRoot
								? props.orderedCategories.filter((category) => category.parentId === activeRoot._id && category.track !== "hidden")
								: [];
							if (!subcategories.length) return null;
							return (
								<div className="mt-2 rounded-[14px] bg-muted/40 p-1.5">
									<div aria-label={`Subkategori ${activeRoot.name}`} className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
										<button type="button" data-category-chip={String(activeRoot._id)} className={chipClassName(props.activeCategoryId === activeRoot._id)} onClick={() => scrollToCategory(activeRoot._id)}>Semua {activeRoot.name}</button>
										{subcategories.map((subcategory) => (
											<button type="button" key={subcategory._id} data-category-chip={String(subcategory._id)} className={chipClassName(props.activeCategoryId === subcategory._id)} onClick={() => scrollToCategory(subcategory._id)}>{subcategory.name}</button>
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
						<div className="grid grid-cols-2 gap-2.5">
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
							{props.filteredProducts.map((product, index) => {
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
										{showRootCategoryHeading ? <div data-category-section={rootCategoryId} className="scroll-mt-28 pt-3 first:pt-0"><h4 className="px-1 text-sm font-black text-foreground">{rootCategory.name}</h4><div className="mt-1 h-0.5 w-8 rounded-full bg-primary" /></div> : null}
										{showSubcategoryHeading ? <div data-category-section={String(productCategory._id)} className="scroll-mt-28 pt-3"><h5 className="px-1 text-xs font-black text-primary">{productCategory.name}</h5><div className="mt-1 h-px w-full bg-primary/15" /></div> : null}
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
												{hasNutritionValues ? <div className="mt-1 flex items-center gap-3 border-y border-primary/10 py-1"><p className="shrink-0 text-[10px] font-black text-primary">Gizi</p><div className="grid min-w-0 flex-1 grid-cols-5 gap-1">{[["Kalori", `${nutrition.caloriesKcal} kkal`], ["Protein", `${nutrition.proteinG} g`], ["Karbo", `${nutrition.carbohydratesG} g`], ["Lemak", `${nutrition.fatG} g`], ["Gula", `${nutrition.sugarG ?? "-"} g`]].map(([label, value]) => <div key={label} className="min-w-0"><p className="truncate text-[9px] leading-tight text-muted-foreground">{label}</p><p className="truncate text-[10px] font-black leading-tight text-foreground">{value}</p></div>)}</div></div> : null}
											</div>
											<div className="flex items-center justify-between gap-2">
													<div><p className="text-base font-black leading-none text-primary">{currency(pricing.finalPrice)}</p>{pricing.isPromo ? <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice)}</p> : null}</div>
													{hasVariations ? <button type="button" disabled={isSold} className="min-h-11 rounded-[14px] border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-black text-primary transition-transform duration-[180ms] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" onClick={() => props.handleProductSelect(product)}>{quantity > 0 ? `${quantity} di cart` : 'Pilih opsi'}</button> : <div className="flex min-h-11 items-center gap-1 rounded-[14px] border border-border bg-background p-1">
														{quantity > 0 ? <button type="button" disabled={isSold} aria-label={`Kurangi ${product.name}`} className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted-foreground transition-transform active:scale-[.97] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => props.updateCartQuantity(product._id, undefined, -1)}><Minus className="h-3.5 w-3.5" /></button> : null}
														{quantity > 0 ? <span className="min-w-6 text-center text-xs font-black">{quantity}</span> : null}
														<button type="button" disabled={isSold} aria-label={`Tambah ${product.name}`} className="flex h-9 min-w-9 items-center justify-center rounded-[10px] bg-primary px-2 text-primary-foreground transition-transform active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" onClick={() => quantity > 0 ? props.updateCartQuantity(product._id, undefined, 1) : props.handleProductSelect(product)}><Plus className="h-3.5 w-3.5" /></button>
													</div>}
												</div>
											</div>
										</div>
									</article>
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
