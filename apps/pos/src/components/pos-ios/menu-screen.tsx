import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, Minus, MoreHorizontal, Package, Plus, Receipt, ScanLine, Search, ShoppingBag, Wallet, X } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { AnimatedNumber, CountBadge, formatRp, IOS_SPRING, IOS_SPRING_SOFT, IosChip, StatusPill, listItemMotion } from "./ios-kit";

export interface MenuProductVM {
	id: string;
	raw: any;
	name: string;
	image?: string | null;
	menuNumber?: number | string | null;
	price: number;
	originalPrice: number;
	promoLabel: string | null;
	cartQty: number;
	sold: boolean;
	/** null = stok tidak dilacak di mode ini */
	stock: number | null;
	categoryName: string;
}

export interface MenuScreenProps {
	shiftOpen: boolean | undefined;
	cashierName?: string;
	shiftName?: string;
	statusSlot?: ReactNode;
	offlinePending: number;
	onOpenSync: () => void;
	unread: number;
	categoryTabs: any[];
	activeCategoryId: string | null;
	activeParentId: string | null;
	subcategories: any[];
	activeParentName: string;
	onSelectCategory: (index: number) => void;
	onSelectSubcategory: (id: string | null) => void;
	search: string;
	onSearch: (value: string) => void;
	products: MenuProductVM[];
	loading: boolean;
	hasMore: boolean;
	loadingMore: boolean;
	sentinelRef: RefObject<HTMLDivElement | null>;
	scrollRef: RefObject<HTMLDivElement | null>;
	onTapProduct: (product: MenuProductVM) => void;
	onDecrement: (product: MenuProductVM) => void;
	cartCount: number;
	cartTotal: number;
	hasCheckoutResult: boolean;
	onOpenCart: () => void;
	queueActive: number;
	queueDone: number;
	onOpenQueue: (tab: "active" | "done") => void;
	bonusPct: number | null;
	onOpenBonus: () => void;
	onScan: () => void;
	onOpenStock: () => void;
	onOpenNotifications: () => void;
	activePanel: string | null;
	onNavigate: (panel: string | null) => void;
	onOpenShift: () => void;
	stockButtonProps?: Record<string, string>;
}

const NAV = [
	{ id: null, label: "Kasir", Icon: ShoppingBag },
	{ id: "transaksi", label: "Pesanan", Icon: Receipt },
	{ id: "kas", label: "Shift", Icon: Wallet },
	{ id: "more", label: "Lainnya", Icon: MoreHorizontal },
] as const;

function Thumb({ src, name }: { src?: string | null; name: string }) {
	const [failed, setFailed] = useState(false);
	const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
	if (!src || failed) {
		return <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-muted text-[15px] font-extrabold text-muted-foreground">{initials}</div>;
	}
	return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-14 w-14 shrink-0 rounded-[14px] bg-muted object-cover" />;
}

function ProductRow({ product, index, onTap, onDec }: { product: MenuProductVM; index: number; onTap: () => void; onDec: () => void }) {
	const low = product.stock !== null && product.stock > 0 && product.stock <= 5;
	return (
		<motion.div layout="position" {...listItemMotion(index)} className="mb-2 flex items-center gap-3 rounded-2xl bg-muted/55 p-2.5">
			<button type="button" onClick={onTap} disabled={product.sold} aria-label={`Tambah ${product.name}`} className={cn("flex min-w-0 flex-1 items-center gap-3 text-left", product.sold && "opacity-50")}>
				<div className="relative">
					<Thumb src={product.image} name={product.name} />
					{product.sold ? <span className="absolute inset-0 flex items-center justify-center rounded-[14px] bg-black/55 text-[9px] font-black tracking-widest text-white">HABIS</span> : null}
				</div>
				<div className="min-w-0 flex-1">
					<p className="line-clamp-2 text-[14px] font-bold leading-tight">{product.name}</p>
					<div className="mt-1 flex flex-wrap items-center gap-1.5">
						<span className="text-[14px] font-extrabold text-primary">{formatRp(product.price)}</span>
						{product.promoLabel ? (
							<>
								<span className="text-[11px] text-muted-foreground line-through">{formatRp(product.originalPrice)}</span>
								<StatusPill tone="bad">{product.promoLabel}</StatusPill>
							</>
						) : null}
						{product.menuNumber != null ? <span className="text-[11px] font-bold text-muted-foreground">#{product.menuNumber}</span> : null}
						{low ? <StatusPill tone="warn">Sisa {product.stock}</StatusPill> : null}
					</div>
				</div>
			</button>
			<div className="flex shrink-0 items-center">
				<AnimatePresence mode="popLayout" initial={false}>
					{product.cartQty > 0 ? (
						<motion.div key="step" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={IOS_SPRING} className="flex items-center rounded-full bg-primary/10 text-primary">
							<button type="button" onClick={onDec} aria-label={`Kurangi ${product.name}`} className="flex h-10 w-9 items-center justify-center"><Minus className="h-4 w-4" /></button>
							<motion.span key={product.cartQty} initial={{ scale: 1.4 }} animate={{ scale: 1 }} transition={IOS_SPRING} className="min-w-5 text-center text-[14px] font-extrabold">{product.cartQty}</motion.span>
							<button type="button" onClick={onTap} disabled={product.sold} aria-label={`Tambah ${product.name}`} className="flex h-10 w-9 items-center justify-center"><Plus className="h-4 w-4" /></button>
						</motion.div>
					) : (
						<motion.button key="add" type="button" whileTap={{ scale: 0.86 }} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={IOS_SPRING} onClick={onTap} disabled={product.sold} aria-label={`Tambah ${product.name}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
							<Plus className="h-5 w-5" />
						</motion.button>
					)}
				</AnimatePresence>
			</div>
		</motion.div>
	);
}

function RowSkeleton() {
	return <div className="mb-2 h-[76px] animate-pulse rounded-2xl bg-muted/70" />;
}

export function MenuScreen(props: MenuScreenProps) {
	const reduce = useReducedMotion();
	const [compact, setCompact] = useState(false);
	const lastY = useMemo(() => ({ v: 0 }), []);
	const showCartBar = props.cartCount > 0 || props.hasCheckoutResult;
	const activeTab = props.activeParentId ?? "all";

	return (
		<div className="relative flex min-h-0 flex-1 flex-col bg-background">
			{props.shiftOpen === false ? (
				<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-40 flex items-center justify-center bg-background/85 p-6 backdrop-blur-md">
					<motion.div initial={{ y: 20, scale: 0.96 }} animate={{ y: 0, scale: 1 }} transition={IOS_SPRING_SOFT} className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-xl ring-1 ring-border">
						<div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600"><Wallet className="h-6 w-6" /></div>
						<h2 className="text-lg font-extrabold tracking-tight">Shift kasir tertutup</h2>
						<p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">Buka shift dulu untuk mulai melayani pelanggan dan mencatat transaksi.</p>
						<motion.button type="button" whileTap={{ scale: 0.96 }} onClick={props.onOpenShift} className="mt-5 h-12 w-full rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground">Buka shift sekarang</motion.button>
					</motion.div>
				</motion.div>
			) : null}

			{/* Status + pencarian (mengecil saat scroll ke bawah) */}
			<header className="z-30 shrink-0 bg-background/95 backdrop-blur-md">
				<AnimatePresence initial={false}>
					{!compact ? (
						<motion.div key="status" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
							<div className="flex items-center justify-between gap-2 px-4 pb-1 pt-2.5 text-[12px] text-muted-foreground">
								<div className="flex min-w-0 items-center gap-2">
									<span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wider", props.shiftOpen ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
										<span className={cn("h-1.5 w-1.5 rounded-full", props.shiftOpen ? "animate-pulse bg-emerald-500" : "bg-rose-500")} />
										{props.shiftOpen ? "SHIFT AKTIF" : "SHIFT TUTUP"}
									</span>
									{props.shiftOpen && props.cashierName ? <span className="truncate">{props.cashierName}{props.shiftName ? ` · ${props.shiftName}` : ""}</span> : null}
								</div>
								<div className="flex shrink-0 items-center gap-2">
									{props.statusSlot}
									{props.offlinePending > 0 ? <button type="button" onClick={props.onOpenSync} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">Sync {props.offlinePending}</button> : null}
								</div>
							</div>
						</motion.div>
					) : null}
				</AnimatePresence>
				<div className="flex items-center gap-2 px-3 pb-2 pt-1.5">
					<label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[14px] bg-muted px-3 transition-shadow focus-within:bg-background focus-within:shadow-[0_0_0_1px_var(--border),0_6px_18px_rgba(0,0,0,0.08)]">
						<Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
						<input type="search" inputMode="search" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Cari produk…" aria-label="Cari produk" className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
						{props.search ? <button type="button" onClick={() => props.onSearch("")} aria-label="Hapus pencarian" className="flex h-6 w-6 items-center justify-center rounded-full bg-muted-foreground/20"><X className="h-3.5 w-3.5" /></button> : null}
					</label>
					<motion.button type="button" whileTap={{ scale: 0.9 }} onClick={props.onScan} aria-label="Scan barcode transaksi" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-muted"><ScanLine className="h-5 w-5" /></motion.button>
					<motion.button type="button" whileTap={{ scale: 0.9 }} onClick={props.onOpenStock} aria-label="Buka pengaturan stok" {...props.stockButtonProps} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-primary text-primary-foreground"><Package className="h-5 w-5" /></motion.button>
					<motion.button type="button" whileTap={{ scale: 0.9 }} onClick={props.onOpenNotifications} aria-label={props.unread > 0 ? `${props.unread} notifikasi belum dibaca` : "Buka notifikasi"} className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-muted"><Bell className="h-5 w-5" /><CountBadge value={props.unread} /></motion.button>
				</div>
				{/* Strip: antrian, selesai, bonus */}
				<div className="flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<IosChip className="bg-primary/10 text-primary" onClick={() => props.onOpenQueue("active")} count={props.queueActive}>Antrian</IosChip>
					<IosChip className="bg-emerald-50 text-emerald-700" onClick={() => props.onOpenQueue("done")} count={props.queueDone}>Selesai</IosChip>
					{props.bonusPct !== null ? (
						<IosChip className="border border-border bg-background" onClick={props.onOpenBonus}>
							<span className="relative h-3.5 w-3.5 rounded-full" style={{ background: `conic-gradient(var(--primary) ${Math.min(100, props.bonusPct)}%, var(--border) 0)` }}><span className="absolute inset-[3px] rounded-full bg-background" /></span>
							Bonus <b className="text-primary">{Math.round(props.bonusPct)}%</b>
						</IosChip>
					) : null}
				</div>
			</header>

			<div className="flex min-h-0 flex-1 border-t border-border/70">
				{/* Rail kategori */}
				<nav aria-label="Kategori" className="w-[74px] shrink-0 space-y-1.5 overflow-y-auto border-r border-border/70 px-1.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{props.categoryTabs.map((tab, index) => {
						const active = activeTab === tab._id;
						return (
							<motion.button key={tab._id} type="button" whileTap={{ scale: 0.92 }} onClick={() => props.onSelectCategory(index)} aria-current={active ? "true" : undefined} className={cn("relative flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-center text-[10.5px] font-bold leading-tight", active ? "text-primary" : "text-muted-foreground")}>
								{active ? <motion.span layoutId="menu-rail-active" className="absolute inset-0 -z-0 rounded-2xl bg-primary/10" transition={IOS_SPRING} /> : null}
								<span className={cn("relative flex h-9 w-9 items-center justify-center rounded-xl text-[13px] font-extrabold transition-colors", active ? "bg-primary text-primary-foreground" : "bg-muted")}>{tab.name.slice(0, 1).toUpperCase()}</span>
								<span className="relative line-clamp-2 break-words">{tab.name}</span>
							</motion.button>
						);
					})}
				</nav>

				{/* Daftar produk */}
				<div
					ref={props.scrollRef}
					className="relative min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-6"
					onScroll={(event) => {
						const y = event.currentTarget.scrollTop;
						if (y > lastY.v + 8 && y > 60) setCompact(true);
						else if (y < lastY.v - 8 || y < 24) setCompact(false);
						lastY.v = y;
					}}
				>
					{props.subcategories.length > 0 ? (
						<div className="sticky top-0 z-10 -mx-3 flex gap-2 overflow-x-auto bg-background/95 px-3 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							<IosChip active={props.activeCategoryId === props.activeParentId} onClick={() => props.onSelectSubcategory(null)} className="h-8 px-3 text-[12px]">Semua {props.activeParentName}</IosChip>
							{props.subcategories.map((sub) => (
								<IosChip key={sub._id} active={props.activeCategoryId === sub._id} onClick={() => props.onSelectSubcategory(sub._id)} className="h-8 px-3 text-[12px]">{sub.name}</IosChip>
							))}
						</div>
					) : null}

					<div className="pt-1">
						{props.loading ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />) : null}
						{!props.loading && props.products.length === 0 ? (
							<div className="flex flex-col items-center py-16 text-center">
								<ShoppingBag className="mb-3 h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
								<p className="text-[14px] font-semibold text-muted-foreground">{props.search ? "Produk tidak ditemukan" : "Menu kosong"}</p>
								<p className="text-[12px] text-muted-foreground/70">{props.search ? "Coba kata kunci lain" : "Belum ada produk tersedia"}</p>
							</div>
						) : null}
						<AnimatePresence initial={false} mode="popLayout">
							{props.products.map((product, index) => {
								const prev = props.products[index - 1];
								const showSection = props.activeParentId === null && !props.search && (!prev || prev.categoryName !== product.categoryName);
								return (
									<Fragment key={product.id}>
										{showSection ? <div className="px-1 pb-1.5 pt-3 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">{product.categoryName.toUpperCase()}</div> : null}
										<ProductRow product={product} index={index} onTap={() => props.onTapProduct(product)} onDec={() => props.onDecrement(product)} />
									</Fragment>
								);
							})}
						</AnimatePresence>
						{!props.loading && props.hasMore ? <div ref={props.sentinelRef} className="h-6 w-full" aria-hidden="true" /> : null}
						{props.loadingMore ? Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={`more-${i}`} />) : null}
					</div>
				</div>
			</div>

			{/* Bar keranjang */}
			<AnimatePresence>
				{showCartBar ? (
					<motion.button
						key="cartbar"
						type="button"
						initial={{ y: 120, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 120, opacity: 0 }}
						transition={IOS_SPRING}
						whileTap={{ scale: 0.97 }}
						onClick={props.onOpenCart}
						className="fixed inset-x-3 bottom-[calc(4.9rem+env(safe-area-inset-bottom))] z-40 flex h-14 items-center justify-between rounded-[18px] bg-foreground pl-4 pr-2 text-background shadow-[0_10px_24px_rgba(0,0,0,0.24)] md:hidden"
					>
						{props.cartCount > 0 ? (
							<>
								<span className="text-left">
									<motion.small key={props.cartCount} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="block text-[11px] opacity-70">{props.cartCount} item</motion.small>
									<AnimatedNumber value={props.cartTotal} className="text-[16px] font-extrabold" />
								</span>
								<span className="rounded-xl bg-primary px-4 py-2.5 text-[14px] font-bold text-primary-foreground">Lihat pesanan</span>
							</>
						) : (
							<span className="w-full pr-2 text-center text-[14px] font-bold">Lihat hasil transaksi</span>
						)}
					</motion.button>
				) : null}
			</AnimatePresence>

			{/* Navigasi bawah */}
			<nav aria-label="Navigasi kasir" className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl md:hidden">
				<div className="mx-auto grid max-w-xl grid-cols-4 gap-1">
					{NAV.map(({ id, label, Icon }) => {
						const active = props.activePanel === id;
						return (
							<motion.button key={label} type="button" whileTap={{ scale: 0.9 }} aria-current={active ? "page" : undefined} onClick={() => props.onNavigate(id)} className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold", active ? "text-primary" : "text-muted-foreground")}>
								{active ? <motion.span layoutId="menu-nav-active" className="absolute inset-0 rounded-2xl bg-primary/10" transition={IOS_SPRING} /> : null}
								<span className="relative"><Icon className="h-5 w-5" aria-hidden="true" />{id === "kas" && props.shiftOpen === false ? <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-500" /> : null}</span>
								<span className="relative">{label}</span>
							</motion.button>
						);
					})}
				</div>
			</nav>
		</div>
	);
}
