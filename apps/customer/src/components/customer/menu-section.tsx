import { Barcode, Grid2X2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateEffectivePrice } from "@/lib/utils/pricing";
import type { Doc, Id } from "@/types/backend-compat";
import type { CartItem, MenuMode } from "./types";
import { CUSTOMER_ORDERING_DEFAULTS, currency } from "./types";
import { BadgePill, chipClassName } from "./shared-components";

export interface MenuSectionProps {
	showHappyHourBanner?: boolean;
	onOpenAuth?: () => void;
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
}

export function renderMenuSection(props: MenuSectionProps) {
	return (
		<div className="space-y-3 px-3 py-3">
			<div className="rounded-xl px-3 py-3 text-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]" style={{ background: `linear-gradient(135deg, ${props.themeColor}, rgba(15,23,42,0.9))` }}>
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">Session aktif</p>
						<h2 className="mt-1 text-xl font-black leading-none">Pilih menu</h2>
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

			{props.showHappyHourBanner ? (
				<div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/60 p-3 shadow-sm dark:border-amber-800 dark:from-amber-900/20 dark:to-amber-800/10">
					<div className="flex items-start gap-2.5">
						<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs">🎉</div>
						<div className="min-w-0 flex-1">
							<p className="text-xs font-black text-amber-900 dark:text-amber-100">Happy Hour sedang berlangsung!</p>
							<p className="mt-0.5 text-[11px] leading-relaxed text-amber-800/80 dark:text-amber-200/80">Masuk/Daftar untuk dapatkan harga spesial hingga Rp 15.000!</p>
							<button type="button" className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black text-white shadow-sm transition-all hover:bg-amber-600 active:scale-95" onClick={() => props.onOpenAuth?.()}>
								🔒 Masuk / Daftar
							</button>
						</div>
					</div>
				</div>
			) : null}

			<div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-1.5 shadow-sm">
				<button type="button" className={cn("rounded-xl px-3 py-2 text-xs font-black transition-all", props.menuMode === "number" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")} onClick={() => props.setMenuMode("number")}>Nomor Produk</button>
				<button type="button" className={cn("rounded-xl px-3 py-2 text-xs font-black transition-all", props.menuMode === "catalog" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")} onClick={() => props.setMenuMode("catalog")}>Katalog Menu</button>
			</div>

			{props.menuMode === "number" && props.config.enableMenuNumberEntry ? (
				<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
					<div className="flex items-center justify-between gap-2">
						<div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: props.themeColor }}>Mode cepat</p><h3 className="text-sm font-black">Input nomor produk</h3></div>
						{props.config.enableBarcodeScan ? <button type="button" className="flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[10px] font-bold text-primary" onClick={() => props.setScannerOpen(true)}><Barcode className="h-3.5 w-3.5" />Scan</button> : null}
					</div>
					<div className="mt-3 rounded-xl border border-border bg-background px-3 py-3 shadow-inner">
						<div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><input className="w-full bg-transparent text-xl font-black tracking-[0.25em] outline-none placeholder:text-base placeholder:font-semibold placeholder:tracking-normal" inputMode="numeric" placeholder="Ketik nomor menu" value={props.manualCode} onChange={(event) => props.setManualCode(event.target.value.replace(/\D/g, ""))} /></div>
					</div>
					{props.codeFeedback ? <p className="mt-2.5 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">{props.codeFeedback}</p> : <p className="mt-2.5 text-xs text-muted-foreground">Item akan langsung masuk ke keranjang saat nomor produk lengkap cocok.</p>}
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
						<div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
							<button type="button" className={chipClassName(props.activeCategoryId === null)} onClick={() => props.setActiveCategoryId(null)}>Semua</button>
							{props.orderedCategories.filter((category) => !category.parentId && category.track !== "hidden").map((category) => <button type="button" key={category._id} className={chipClassName(props.activeCategoryId === category._id)} onClick={() => props.setActiveCategoryId(category._id)}>{category.name}</button>)}
							{props.isMenuLoading ? <span className="whitespace-nowrap rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">memuat...</span> : null}
						</div>
					</div>
					{props.isMenuLoading ? (
						<div className="grid grid-cols-2 gap-2.5">
							{[1,2,3,4].map((i) => (
								<div key={i} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm animate-pulse">
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
						{props.filteredProducts.map((product) => {
							const pricing = calculateEffectivePrice({ _id: product._id, price: product.price, categoryId: product.categoryId }, props.discounts);
							const quantity = props.cart.filter((item) => item.productId === product._id).reduce((sum, item) => sum + item.quantity, 0);
							return (
								<button type="button" key={product._id} className="overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all active:scale-[0.99]" onClick={() => props.handleProductSelect(product)}>
									<div className="relative h-28 w-full bg-muted">{product.image ? <img alt={product.name} className="h-full w-full object-cover" src={product.image} /> : null}{product.menuNumber != null ? <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white shadow">#{product.menuNumber}</span> : null}{pricing.isPromo ? <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 font-bold text-[10px] text-white shadow" style={{ background: pricing.isHappyHour ? '#f59e0b' : '#ef4444' }}>{pricing.isHappyHour ? 'HAPPY HOUR' : 'PROMO'}</span> : null}{quantity > 0 ? <span className="absolute right-2 top-9 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">{quantity} di cart</span> : null}</div>
									<div className="space-y-1.5 p-2.5"><p className="line-clamp-2 text-xs font-black leading-snug">{product.name}</p><div className="flex items-end justify-between gap-1.5"><div><p className="text-sm font-black text-primary">{currency(pricing.finalPrice)}</p>{pricing.isPromo ? <p className="text-[10px] font-semibold text-muted-foreground line-through">{currency(pricing.originalPrice)}</p> : null}</div><div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><Plus className="h-3.5 w-3.5" /></div></div></div>
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
