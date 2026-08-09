import { Barcode, Grid2X2, Minus, PackageSearch, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import type { Doc, Id } from "@/types/backend-compat";
import type { CartItem, MenuMode } from "./types";
import { CUSTOMER_ORDERING_DEFAULTS, currency } from "./types";
import { BadgePill, chipClassName } from "./shared-components";

export interface MenuSectionProps {
	activeCategoryId: Id<"categories"> | null;
	cart: CartItem[];
	codeFeedback: string;
	config: typeof CUSTOMER_ORDERING_DEFAULTS;
	discounts: Doc<"discounts">[] | undefined;
	filteredProducts: Doc<"products">[];
	freeRefillCharge: number;
	handleProductSelect: (product: Doc<"products">) => void;
	isMenuLoading: boolean;
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
}

export function renderMenuSection(props: MenuSectionProps) {
	return (
		<div className="space-y-3 px-3 py-3">
			<div className="rounded-3xl px-4 py-4 text-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]" style={{ background: `linear-gradient(135deg, ${props.themeColor}, rgba(15,23,42,0.9))` }}>
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">Session aktif</p>
						<h2 className="mt-1 font-display text-xl font-black leading-none">Pilih menu</h2>
						<p className="mt-1 text-xs text-white/75">Ketik nomor produk lengkap, scan barcode, atau pilih lewat katalog.</p>
					</div>
					<div className="rounded-xl bg-white/12 px-2.5 py-1.5 text-right backdrop-blur">
						<p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">Orang</p>
						<p className="mt-0.5 text-lg font-black">{props.partySize}</p>
					</div>
				</div>
				<div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px]">
					<BadgePill label={props.tableNumber.trim() ? `Meja ${props.tableNumber.trim()}` : "Meja belum diisi"} />
					{props.freeRefillCharge > 0 ? <BadgePill label={`Free refill ${currency(props.freeRefillCharge)}`} /> : null}
					<BadgePill label={`${props.totalItems} item • ${currency(props.total)}`} />
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-1.5 shadow-sm">
				<button type="button" className={cn("min-h-11 rounded-[14px] px-3 py-2 text-xs font-black transition-all", props.menuMode === "number" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")} onClick={() => props.setMenuMode("number")}>Nomor Produk</button>
				<button type="button" className={cn("min-h-11 rounded-[14px] px-3 py-2 text-xs font-black transition-all", props.menuMode === "catalog" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")} onClick={() => props.setMenuMode("catalog")}>Katalog Menu</button>
			</div>

			{props.menuMode === "number" && props.config.enableMenuNumberEntry ? (
				<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
					<div className="flex items-center justify-between gap-2">
						<div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: props.themeColor }}>Mode cepat</p><h3 className="text-sm font-black">Input nomor produk</h3></div>
						{props.config.enableBarcodeScan ? <button type="button" className="flex min-h-11 items-center gap-1.5 rounded-[14px] border border-primary/20 bg-primary/5 px-3 py-2 text-[10px] font-bold text-primary" onClick={() => props.setScannerOpen(true)}><Barcode className="h-3.5 w-3.5" />Scan</button> : null}
					</div>
					<div className="mt-3 rounded-xl border border-border bg-background px-3 py-3 shadow-inner">
						<div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><input className="w-full bg-transparent text-xl font-black tracking-[0.25em] outline-none placeholder:text-base placeholder:font-semibold placeholder:tracking-normal" inputMode="numeric" placeholder="Ketik nomor menu" value={props.manualCode} onChange={(event) => props.setManualCode(event.target.value.replace(/\D/g, ""))} /></div>
					</div>
					{props.codeFeedback ? <p className="mt-2.5 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">{props.codeFeedback}</p> : <p className="mt-2.5 text-xs text-muted-foreground">Masukkan nomor produk lengkap untuk mencari menu.</p>}
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
									<button type="button" aria-label="Kurangi jumlah" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => props.setPendingNumberQuantity(Math.max(1, props.pendingNumberQuantity - 1))}><Minus className="h-4 w-4" /></button>
									<span className="min-w-8 text-center text-sm font-black">{props.pendingNumberQuantity}</span>
									<button type="button" aria-label="Tambah jumlah" className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground" onClick={() => props.setPendingNumberQuantity(props.pendingNumberQuantity + 1)}><Plus className="h-4 w-4" /></button>
								</div>
								<div className="flex items-center gap-1.5">
									<button type="button" className="rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground" onClick={props.cancelPendingNumberProduct}>Batal</button>
									<button type="button" className="rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground" onClick={props.approvePendingNumberProduct}>Tambah ke keranjang</button>
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
					<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
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
					{props.isMenuLoading ? (
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
					<div className="grid grid-cols-2 gap-2.5">
						{props.filteredProducts.length === 0 ? <div className="col-span-2 flex flex-col items-center rounded-3xl border border-dashed border-border px-4 py-10 text-center"><PackageSearch aria-hidden="true" className="h-7 w-7 text-muted-foreground" strokeWidth={2} /><p className="mt-3 font-display text-sm font-bold">Menu belum tersedia</p><p className="mt-1 text-xs text-muted-foreground">Pilih kategori lain atau coba lagi sebentar.</p></div> : null}
						{props.filteredProducts.map((product) => {
							const pricing = calculateEffectivePrice({ _id: product._id, price: product.price, categoryId: product.categoryId }, props.discounts);
							const quantity = props.cart.filter((item) => item.productId === product._id).reduce((sum, item) => sum + item.quantity, 0);
							return (
								<button type="button" key={product._id} className="overflow-hidden rounded-[20px] border border-border bg-card text-left shadow-sm transition-all duration-[180ms] active:scale-[.97]" onClick={() => props.handleProductSelect(product)}>
									<div className="relative h-28 w-full bg-muted"><div className="flex h-full w-full items-center justify-center text-muted-foreground"><PackageSearch aria-hidden="true" className="h-7 w-7" strokeWidth={1.8} /></div>{product.image ? <img alt={product.name} className="absolute inset-0 h-full w-full object-cover" src={product.image} onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}{product.menuNumber != null ? <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white shadow">#{product.menuNumber}</span> : null}{pricing.isPromo ? <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 font-bold text-[10px] text-white shadow" style={{ background: pricing.isHappyHour ? '#f59e0b' : '#ef4444' }}>{pricing.isHappyHour ? 'HAPPY HOUR' : 'PROMO'}</span> : null}{quantity > 0 ? <span className="absolute right-2 top-9 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">{quantity} di cart</span> : null}</div>
									<div className="space-y-1.5 p-2.5"><p className="break-words text-xs font-black leading-snug">{product.name}</p><div className="flex items-end justify-between gap-1.5"><div><p className="text-sm font-black text-primary">{currency(pricing.finalPrice)}</p>{pricing.isPromo ? <p className="text-[10px] font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice)}</p> : null}</div><div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"><Plus className="h-3.5 w-3.5" /></div></div></div>
								</button>
							);
						})}
					</div>
					)}
				</div>
			) : null}
		</div>
	);
}
