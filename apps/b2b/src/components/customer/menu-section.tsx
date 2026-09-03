import { useState } from "react";
import { Grid2X2, Minus, PackageSearch, Plus, RefreshCw, Search } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import type { Doc, Id } from "@/types/backend-compat";
import type { CartItem, MenuMode } from "./types";
import { CUSTOMER_ORDERING_DEFAULTS, currency } from "./types";
import { chipClassName } from "./shared-components";


function ProductImage({ src, alt }: { src?: string | null; alt: string }) {
	const [isLoaded, setIsLoaded] = useState(false);
	const [hasError, setHasError] = useState(false);
	const hasImage = Boolean(src) && !hasError;

	return (
		<>
			{hasImage && !isLoaded ? <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-muted/60 to-muted" /> : null}
			{hasImage ? (
				<img
					alt={alt}
					className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-300", isLoaded ? "opacity-100" : "opacity-0")}
					decoding="async"
					loading="lazy"
					onError={() => setHasError(true)}
					onLoad={() => setIsLoaded(true)}
					src={src as string}
				/>
			) : (
				<div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
					<PackageSearch className="h-7 w-7" strokeWidth={1.8} />
				</div>
			)}
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
	themeColor: string;
	total: number;
	totalItems: number;
	updateCartQuantity: (productId: Id<"products">, variant: string | undefined, delta: number) => void;
}

export function renderMenuSection(props: MenuSectionProps) {
	const isCodeFeedbackError = /belum unik|tidak|gagal|error/i.test(props.codeFeedback);

	return (
		<div className="space-y-3 px-3 py-3">
			{props.config.enableCatalogBrowsing ? (
				<div className="space-y-3">
					<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
						<div className="flex items-center gap-1.5"><Grid2X2 className="h-4 w-4 text-primary" /><h3 className="text-sm font-black">Katalog produk</h3></div>
						<div className="mt-3 relative">
							<Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								aria-label="Cari menu"
								className="min-h-11 w-full rounded-[14px] border border-border bg-background py-2 pl-9 pr-3 text-xs font-medium outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
								placeholder="Cari b2b"
								value={props.catalogQuery}
								onChange={(event) => props.setCatalogQuery(event.target.value)}
							/>
						</div>
						<div className="relative mt-3">
							<div aria-label="Kategori menu" className="flex gap-1.5 overflow-x-auto pb-1 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							{props.orderedCategories.filter((category) => !category.parentId && category.track !== "hidden").map((category) => {
								const hasActiveChild = props.orderedCategories.some((child) => child.parentId === category._id && child._id === props.activeCategoryId);
								return <button type="button" key={category._id} className={chipClassName(props.activeCategoryId === category._id || hasActiveChild)} onClick={() => props.setActiveCategoryId(category._id)}>{category.name}</button>;
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
										<button type="button" className={chipClassName(props.activeCategoryId === activeRoot._id)} onClick={() => props.setActiveCategoryId(activeRoot._id)}>Semua {activeRoot.name}</button>
										{subcategories.map((subcategory) => (
											<button type="button" key={subcategory._id} className={chipClassName(props.activeCategoryId === subcategory._id)} onClick={() => props.setActiveCategoryId(subcategory._id)}>{subcategory.name}</button>
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
							{props.filteredProducts.map((product) => {
								const pricing = calculateEffectivePrice({ _id: product._id, price: product.price, categoryId: product.categoryId }, props.discounts);
								const quantity = props.cart.filter((item) => item.productId === product._id).reduce((sum, item) => sum + item.quantity, 0);
								const isSold = product.isAvailable === false || (product.quantity != null && Number(product.quantity) <= 0);
								const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;
								return (
									<article key={product._id} className="flex items-center gap-3 rounded-[24px] border border-border/80 bg-card p-2.5 shadow-[0_4px_20px_rgba(9,9,11,0.05)] transition-transform duration-[180ms] ease-[cubic-bezier(.32,.72,0,1)]">
										<button type="button" aria-label={`Lihat ${product.name}`} className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[18px] bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[.97]" onClick={() => props.handleProductSelect(product)}>
											<ProductImage src={product.image} alt={product.name} />
											{isSold ? <span className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/55 text-[10px] font-black tracking-[0.18em] text-white">SOLD</span> : null}
											{pricing.isPromo ? <span className="absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black text-white shadow" style={{ background: pricing.isHappyHour ? '#f59e0b' : '#ef4444' }}>{pricing.isHappyHour ? 'HAPPY HOUR' : 'PROMO'}</span> : null}
										</button>
										<div className="min-w-0 flex-1 self-stretch py-0.5">
											<div className="flex min-h-full flex-col justify-between gap-1.5">
												<div>
													<p className="break-words text-sm font-black leading-tight">{product.name}</p>
													{product.description ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{product.description}</p> : <p className="mt-1 text-xs text-muted-foreground">Siap dikirim atau diambil sesuai pilihan toko.</p>}
												</div>
												<div className="flex items-end justify-between gap-2">
													<div><p className="text-sm font-black text-primary">{currency(pricing.finalPrice)}</p>{pricing.isPromo ? <p className="text-[10px] font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice)}</p> : null}</div>
													{hasVariations ? <button type="button" disabled={isSold} className="min-h-11 rounded-[14px] border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-black text-primary transition-transform duration-[180ms] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" onClick={() => props.handleProductSelect(product)}>{quantity > 0 ? `${quantity} di cart` : 'Pilih opsi'}</button> : <div className="flex min-h-11 items-center gap-1 rounded-[14px] border border-border bg-background p-1">
														{quantity > 0 ? <button type="button" disabled={isSold} aria-label={`Kurangi ${product.name}`} className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted-foreground transition-transform active:scale-[.97] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => props.updateCartQuantity(product._id, undefined, -1)}><Minus className="h-3.5 w-3.5" /></button> : null}
														{quantity > 0 ? <span className="min-w-6 text-center text-xs font-black">{quantity}</span> : null}
														<button type="button" disabled={isSold} aria-label={`Tambah ${product.name}`} className="flex h-9 min-w-9 items-center justify-center rounded-[10px] bg-primary px-2 text-primary-foreground transition-transform active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" onClick={() => quantity > 0 ? props.updateCartQuantity(product._id, undefined, 1) : props.handleProductSelect(product)}><Plus className="h-3.5 w-3.5" /></button>
													</div>}
												</div>
											</div>
										</div>
									</article>
								);
							})}
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}
