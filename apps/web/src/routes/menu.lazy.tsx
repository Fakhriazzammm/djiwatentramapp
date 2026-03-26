import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingCart, Tag, Trash2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { MenuSidebar } from "@/components/pos/menu-sidebar";
import { PaymentConfirmationModal } from "@/components/pos/payment-modal";
import { TransactionHistorySidebar } from "@/components/pos/transaction-history-sidebar";
import { VoucherModal } from "@/components/pos/voucher-modal";
import { SkipLink } from "@/components/ui/a11y";
import { EmptyCart } from "@/components/ui/empty-state";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
	Coffee, 
	ShoppingBag, 
	User, 
	Hash, 
	MessageSquare,
	Zap,
	AlertCircle
} from "lucide-react";
import type { CartItem } from "@/context/cart-context";
import { useCart } from "@/context/cart-context";
import { bluetoothPrinter } from "@/lib/bluetooth-printer";
import { calculateEffectivePrice } from "@/lib/utils/pricing";

interface Product {
	_id: string;
	name: string;
	price: number;
	promoPrice?: number;
	image?: string;
	description?: string;
	categoryId?: string;
	menuNumber?: number;
}

const formatCurrency = (amount: number) =>
	new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(amount);

// ============================================
// Cart Item Row
// ============================================
function CartItemRow({
	item,
	onUpdateQuantity,
}: {
	item: CartItem;
	onUpdateQuantity: (
		productId: string,
		variant: string | undefined,
		delta: number
	) => void;
}) {
	return (
		<div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
			{item.image ? (
				<img
					alt={item.name}
					className="h-14 w-14 shrink-0 rounded-lg object-cover"
					height={56}
					src={item.image}
					width={56}
				/>
			) : (
				<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10">
					<span className="font-bold text-primary/50 text-base">
						{item.name.charAt(0)}
					</span>
				</div>
			)}

			<div className="min-w-0 flex-1">
				<span className="line-clamp-1 font-medium text-foreground text-sm">
					{item.name}
				</span>
				<div className="mt-0.5 font-semibold text-primary text-sm">
					{formatCurrency(item.price * item.quantity)}
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				{item.quantity === 1 ? (
					<button
						aria-label={`Hapus ${item.name}`}
						className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive active:scale-95 transition-transform"
						onClick={() => onUpdateQuantity(item.productId, item.variant, -1)}
						type="button"
					>
						<Trash2 className="h-4 w-4" />
					</button>
				) : (
					<button
						aria-label={`Kurangi jumlah ${item.name}`}
						className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-foreground active:scale-95 transition-transform"
						onClick={() => onUpdateQuantity(item.productId, item.variant, -1)}
						type="button"
					>
						<Minus className="h-4 w-4" />
					</button>
				)}
				<output
					aria-live="polite"
					className="min-w-[2.5rem] text-center font-bold text-base"
				>
					{item.quantity}
				</output>
				<button
					aria-label={`Tambah jumlah ${item.name}`}
					className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground active:scale-95 transition-transform"
					onClick={() => onUpdateQuantity(item.productId, item.variant, 1)}
					type="button"
				>
					<Plus className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}

// ============================================
// Receipt Item Row (Simplified for Sidebar)
// ============================================
function ReceiptItemRow({
	item,
	onUpdateQuantity,
}: {
	item: CartItem;
	onUpdateQuantity: (
		productId: string,
		variant: string | undefined,
		delta: number
	) => void;
}) {
	return (
		<div className="group relative flex flex-col py-3 font-mono text-xs border-b border-dashed border-border/30 last:border-0">
			<div className="flex justify-between items-start mb-1">
				<div className="flex-1 pr-2">
					<span className="uppercase font-bold tracking-tight">{item.name}</span>
					{item.variant && <p className="text-[10px] text-muted-foreground mt-0.5">{item.variant}</p>}
				</div>
				<span className="font-bold shrink-0 text-sm">{formatCurrency(item.price * item.quantity)}</span>
			</div>
			
			<div className="flex justify-between items-center mt-1">
				<div className="text-[10px] text-muted-foreground italic">
					{item.quantity} x {formatCurrency(item.price)}
				</div>
				
				{/* Touch-friendly Controls */}
				<div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border/50">
					<button
						aria-label="Kurangi"
						className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-foreground shadow-sm active:bg-muted active:scale-90 transition-all"
						onClick={() => onUpdateQuantity(item.productId, item.variant, -1)}
					>
						{item.quantity === 1 ? (
							<Trash2 className="h-4 w-4 text-destructive" />
						) : (
							<Minus className="h-4 w-4" />
						)}
					</button>
					<span className="font-bold min-w-[2rem] text-center text-sm">{item.quantity}</span>
					<button
						aria-label="Tambah"
						className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-foreground shadow-sm active:bg-muted active:scale-90 transition-all"
						onClick={() => onUpdateQuantity(item.productId, item.variant, 1)}
					>
						<Plus className="h-4 w-4 text-primary" />
					</button>
				</div>
			</div>
		</div>
	);
}

// ============================================
// Receipt Style Price Summary
// ============================================
function ReceiptPriceSummary({
	totalAmount,
	discountAmount,
	taxAmount,
	serviceChargeAmount,
	taxRate,
	serviceChargeRate,
	finalTotal,
}: {
	totalAmount: number;
	discountAmount: number;
	taxAmount: number;
	serviceChargeAmount: number;
	taxRate: number;
	serviceChargeRate: number;
	finalTotal: number;
}) {
	return (
		<div className="space-y-1 font-mono text-xs border-t border-dashed pt-3">
			<div className="flex justify-between">
				<span>SUBTOTAL</span>
				<span>{formatCurrency(totalAmount)}</span>
			</div>
			{discountAmount > 0 && (
				<div className="flex justify-between text-green-600">
					<span>DISKON</span>
					<span>-{formatCurrency(discountAmount)}</span>
				</div>
			)}
			{serviceChargeAmount > 0 && (
				<div className="flex justify-between">
					<span>SC ({serviceChargeRate}%)</span>
					<span>{formatCurrency(serviceChargeAmount)}</span>
				</div>
			)}
			{taxAmount > 0 && (
				<div className="flex justify-between">
					<span>PAJAK ({taxRate}%)</span>
					<span>{formatCurrency(taxAmount)}</span>
				</div>
			)}
			<div className="flex justify-between border-t border-double pt-2 mt-2 font-bold text-sm">
				<span>TOTAL</span>
				<span>{formatCurrency(finalTotal)}</span>
			</div>
		</div>
	);
}

// ============================================
// Price Summary (Original)
// ============================================
function PriceSummary({
	totalAmount,
	discountAmount,
	taxAmount,
	serviceChargeAmount,
	taxRate,
	serviceChargeRate,
	finalTotal,
}: {
	totalAmount: number;
	discountAmount: number;
	taxAmount: number;
	serviceChargeAmount: number;
	taxRate: number;
	serviceChargeRate: number;
	finalTotal: number;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-sm">Subtotal</span>
				<span className="font-medium text-sm">
					{formatCurrency(totalAmount)}
				</span>
			</div>
			{discountAmount > 0 && (
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground text-sm">Diskon</span>
					<span className="font-medium text-green-600 text-sm">
						-{formatCurrency(discountAmount)}
					</span>
				</div>
			)}
			{serviceChargeAmount > 0 && (
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground text-sm leading-tight">Service Chg. ({serviceChargeRate}%)</span>
					<span className="font-medium text-muted-foreground text-sm">
						{formatCurrency(serviceChargeAmount)}
					</span>
				</div>
			)}
			{taxAmount > 0 && (
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground text-sm">Pajak ({taxRate}%)</span>
					<span className="font-medium text-muted-foreground text-sm">
						{formatCurrency(taxAmount)}
					</span>
				</div>
			)}
			<div className="flex items-center justify-between border-border border-t pt-1.5 mt-1.5">
				<span className="font-semibold text-foreground">Total</span>
				<span className="font-bold text-foreground text-xl">
					{formatCurrency(finalTotal)}
				</span>
			</div>
		</div>
	);
}

// ============================================
// Mobile Bottom Bar
// ============================================
function MobileBottomBar({
	appliedVoucher,
	discountAmount,
	totalAmount,
	finalTotal,
	totalItems,
	isSubmitting,
	hasItems,
	onRemoveVoucher,
	onOpenCart,
	onOpenVoucher,
	onCheckout,
}: {
	appliedVoucher: { name: string } | null;
	discountAmount: number;
	totalAmount: number;
	finalTotal: number;
	totalItems: number;
	isSubmitting: boolean;
	hasItems: boolean;
	onRemoveVoucher: () => void;
	onOpenCart: () => void;
	onOpenVoucher: () => void;
	onCheckout: () => void;
}) {
		return (
		<div className="safe-area-bottom border-border border-t bg-background px-3 pt-2.5 pb-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.10)]">
			<div className="flex items-center gap-2.5">
				<button
					aria-label="Lihat keranjang"
					className="flex min-w-0 flex-1 flex-col justify-center text-left active:opacity-70 transition-opacity"
					disabled={!hasItems}
					onClick={onOpenCart}
					type="button"
				>
					{discountAmount > 0 && (
						<span className="text-xs text-muted-foreground line-through">
							{formatCurrency(totalAmount)}
						</span>
					)}
					<span className="font-bold text-lg text-foreground">
						{formatCurrency(finalTotal)}
					</span>
				</button>

				<button
					aria-label={`Keranjang: ${totalItems} item`}
					className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card active:scale-95 transition-transform"
					onClick={onOpenCart}
					type="button"
				>
					<ShoppingCart className="h-6 w-6 text-foreground" />
					{totalItems > 0 && (
						<span className="absolute -top-2 -right-2 flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-primary px-1.5 font-bold text-[11px] text-primary-foreground shadow-md">
							{totalItems}
						</span>
					)}
				</button>

				<button
					aria-label="Pakai voucher"
					className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-500/50 border-dashed bg-emerald-50 active:scale-95 transition-transform"
					onClick={onOpenVoucher}
					type="button"
				>
					<Tag className="h-5 w-5 text-emerald-600" />
				</button>

				<button
					aria-label="Bayar pesanan"
					className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-6 font-bold text-base text-primary-foreground shadow-lg active:scale-95 transition-transform disabled:opacity-50"
					disabled={!hasItems || isSubmitting}
					onClick={onCheckout}
					type="button"
				>
					{getPayButtonLabel(isSubmitting, hasItems, totalItems)}
				</button>
			</div>
		</div>
	);
}

// ============================================
// Customer Info Form
// ============================================
function CustomerInfoForm() {
	const { customerInfo, updateCustomerInfo } = useCart();

	return (
		<div className="mb-4 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
			<div className="flex items-center gap-2 border-b border-border/50 pb-3">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<User className="h-4 w-4 text-primary" />
				</div>
				<h3 className="font-bold text-sm uppercase tracking-wider text-foreground">
					Informasi Pelanggan
				</h3>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div className="space-y-1.5">
					<Label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
						<User className="h-3 w-3" /> Nama Pelanggan
					</Label>
					<Input
						className="h-10 rounded-xl border-border/50 bg-muted/20 font-medium focus:bg-background"
						onChange={(e) => updateCustomerInfo({ name: e.target.value })}
						placeholder="Input nama..."
						value={customerInfo.name}
					/>
				</div>

				<div className="space-y-1.5">
					<Label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
						<Coffee className="h-3 w-3" /> Tipe Pesanan
					</Label>
					<div className="grid grid-cols-2 gap-2 rounded-xl border border-border/50 bg-muted/20 p-1">
						<button
							className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-bold uppercase transition-all ${
								customerInfo.orderType === "dine_in"
									? "bg-background text-primary shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
							onClick={() => updateCustomerInfo({ orderType: "dine_in" })}
							type="button"
						>
							<Coffee className="h-3 w-3" /> Dine In
						</button>
						<button
							className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-bold uppercase transition-all ${
								customerInfo.orderType === "takeaway"
									? "bg-background text-primary shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
							onClick={() => updateCustomerInfo({ orderType: "takeaway" })}
							type="button"
						>
							<ShoppingBag className="h-3 w-3" /> Takeaway
						</button>
					</div>
				</div>

				<div className="space-y-1.5">
					<Label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
						<Hash className="h-3 w-3" /> Nomor Meja
					</Label>
					<Input
						className={`h-10 rounded-xl border-border/50 bg-muted/20 font-bold focus:bg-background ${
							customerInfo.orderType === "takeaway"
								? "cursor-not-allowed opacity-50"
								: ""
						}`}
						disabled={customerInfo.orderType === "takeaway"}
						onChange={(e) => updateCustomerInfo({ tableNumber: e.target.value })}
						placeholder="No. Meja"
						value={customerInfo.tableNumber}
					/>
				</div>

				<div className="space-y-1.5">
					<Label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
						<Zap className="h-3 w-3" /> Free Refill?
					</Label>
					<button
						className={`flex h-10 w-full items-center justify-between rounded-xl border px-4 transition-all ${
							customerInfo.isFreeRefill
								? "border-emerald-500/50 bg-emerald-50 text-emerald-700 shadow-sm"
								: "border-border/50 bg-muted/20 text-muted-foreground hover:text-foreground"
						}`}
						onClick={() =>
							updateCustomerInfo({ isFreeRefill: !customerInfo.isFreeRefill })
						}
						type="button"
					>
						<span className="text-[10px] font-bold uppercase tracking-widest">
							{customerInfo.isFreeRefill ? "AKTIF" : "TIDAK AKTIF"}
						</span>
						<div
							className={`h-2 w-2 rounded-full ${
								customerInfo.isFreeRefill ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30"
							}`}
						/>
					</button>
				</div>
			</div>
		</div>
	);
}

// ============================================
// Mobile Cart Drawer
// ============================================
function MobileCartDrawer({
	isOpen,
	onOpenChange,
	items,
	totalItems,
	appliedVoucher,
	totalAmount,
	discountAmount,
	taxAmount,
	serviceChargeAmount,
	taxRate,
	serviceChargeRate,
	finalTotal,
	isSubmitting,
	onUpdateQuantity,
	onClearCart,
	onOpenVoucher,
	onCancel,
	onCheckout,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	items: CartItem[];
	totalItems: number;
	appliedVoucher: { name: string } | null;
	totalAmount: number;
	discountAmount: number;
	taxAmount: number;
	serviceChargeAmount: number;
	taxRate: number;
	serviceChargeRate: number;
	finalTotal: number;
	isSubmitting: boolean;
	onUpdateQuantity: (
		productId: string,
		variant: string | undefined,
		delta: number
	) => void;
	onClearCart: () => void;
	onOpenVoucher: () => void;
	onCancel: () => void;
	onCheckout: () => void;
}) {
	return (
		<Sheet onOpenChange={onOpenChange} open={isOpen}>
			<SheetContent
				className="flex max-h-[85vh] flex-col rounded-t-2xl md:hidden"
				showCloseButton={false}
				side="bottom"
			>
				<div className="flex justify-center pt-2 pb-1">
					<div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
				</div>

				<SheetHeader className="flex-row items-center justify-between px-4 pt-1 pb-2">
					<SheetTitle className="font-bold text-foreground text-lg">
						Pesanan ({totalItems})
					</SheetTitle>
					<div className="flex items-center gap-2">
						{items.length > 0 && (
							<button
								className="rounded-lg px-4 py-2.5 font-bold text-destructive text-xs uppercase tracking-wider active:bg-destructive/10 transition-colors"
								onClick={onClearCart}
								type="button"
							>
								Hapus
							</button>
						)}
						<button
							aria-label="Tutup keranjang"
							className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground active:scale-95 transition-transform"
							onClick={() => onOpenChange(false)}
							type="button"
						>
							<X className="h-5 w-5" />
						</button>
					</div>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto px-6 py-3 bg-white mx-4 my-2 rounded-xl border border-border shadow-inner">
					{items.length === 0 ? (
						<EmptyCart className="py-8" size="sm" />
					) : (
						<div className="divide-y divide-dashed divide-border/50">
							{items.map((item) => (
								<ReceiptItemRow
									item={item}
									key={`${item.productId}-${item.variant}`}
									onUpdateQuantity={onUpdateQuantity}
								/>
							))}
						</div>
					)}
				</div>

				{items.length > 0 && (
					<div className="safe-area-bottom border-border border-t bg-background px-4 pt-3 pb-3">
						<button
							className="mb-4 flex w-full items-center justify-between rounded-xl border border-emerald-500/30 border-dashed bg-emerald-50 p-3 active:bg-emerald-100"
							onClick={onOpenVoucher}
							type="button"
						>
							<div className="flex items-center gap-2">
								<Tag className="h-4 w-4 text-emerald-600" />
								<span className="font-bold text-emerald-700 text-xs uppercase tracking-wider">
									{appliedVoucher ? appliedVoucher.name : "Pakai Voucher"}
								</span>
							</div>
							{appliedVoucher && (
								<span className="rounded-full bg-emerald-600 px-2 py-0.5 font-bold text-white text-[10px] uppercase">
									Aktif
								</span>
							)}
						</button>

						<div className="mb-4 px-2">
							<ReceiptPriceSummary
								discountAmount={discountAmount}
								finalTotal={finalTotal}
								serviceChargeAmount={serviceChargeAmount}
								serviceChargeRate={serviceChargeRate}
								taxAmount={taxAmount}
								taxRate={taxRate}
								totalAmount={totalAmount}
							/>
						</div>

						<div className="grid grid-cols-4 gap-3">
							<button
								className="col-span-1 flex items-center justify-center rounded-xl border border-border bg-background p-4 font-bold text-muted-foreground text-xs uppercase tracking-widest active:bg-muted transition-colors"
								onClick={onCancel}
								type="button"
							>
								Batal
							</button>
							<button
								className={`col-span-3 flex items-center justify-center rounded-xl bg-primary p-4 font-bold text-sm text-primary-foreground uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform ${
									isSubmitting ? "cursor-not-allowed opacity-50" : ""
								}`}
								disabled={isSubmitting}
								onClick={onCheckout}
								type="button"
							>
								{isSubmitting
									? "..."
									: `Bayar ${formatCurrency(finalTotal)}`}
							</button>
						</div>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}

// ============================================

function getPayButtonLabel(
	isSubmitting: boolean,
	hasItems: boolean,
	totalItems: number
) {
	if (isSubmitting) {
		return "Memproses...";
	}
	if (!hasItems) {
		return "Bayar";
	}
	return `Bayar (${totalItems} Item)`;
}

function MenuPage() {
	// ============================================
	// Flying Item Animation
	// ============================================
	function FlyingItem({ 
		startPos, 
		targetPos, 
		image, 
		onComplete 
	}: { 
		startPos: { x: number, y: number }, 
		targetPos: { x: number, y: number }, 
		image?: string,
		onComplete: () => void 
	}) {
		return (
			<motion.div
				initial={{ 
					x: startPos.x, 
					y: startPos.y, 
					scale: 1, 
					opacity: 1,
					zIndex: 100 
				}}
				animate={{ 
					x: targetPos.x - 20, 
					y: targetPos.y - 20, 
					scale: 0.2, 
					opacity: 0.5,
					transition: { 
						duration: 0.6, 
						ease: [0.16, 1, 0.3, 1] // Custom cubic-bezier for smooth arc-like feel
					}
				}}
				onAnimationComplete={onComplete}
				className="fixed left-0 top-0 pointer-events-none"
			>
				<div className="h-16 w-16 overflow-hidden rounded-full border-2 border-primary bg-white shadow-xl flex items-center justify-center">
					{image ? (
						<img src={image} alt="" className="h-full w-full object-cover" />
					) : (
						<div className="h-full w-full bg-primary/10" />
					)}
				</div>
			</motion.div>
		);
	}

	const categories = useQuery(api.products.getCategories);
	const siteSettings = useQuery(api.site_settings.getSettings);
	const activeDiscounts = useQuery(api.discounts.getActiveDiscounts);

	const [selectedCategory, setSelectedCategory] =
		useState<Id<"categories"> | null>(null);
	const {
		items,
		addToCart,
		updateQuantity,
		totalAmount,
		clearCart,
		appliedVoucher,
		applyVoucher,
		discountAmount,
		finalTotal,
		taxAmount,
		taxRate,
		serviceChargeAmount,
		serviceChargeRate,
		customerInfo,
	} = useCart();
	const createOrder = useMutation(api.orders.createOrder);
	const navigate = useNavigate();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
	const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
	const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
	
	// Animation state
	const [flyingItems, setFlyingItems] = useState<{ id: number, start: { x: number, y: number }, image?: string }[]>([]);

	const products = useQuery(api.products.getProducts, {
		categoryId: selectedCategory ?? undefined,
	}) as (Product & { categoryId: string })[] | undefined;

	// Optimization: Pre-calculate cart state to avoid re-renders
	const { totalItems, hasItems } = useMemo(() => ({
		totalItems: items.reduce((acc: number, i) => acc + i.quantity, 0),
		hasItems: items.length > 0,
	}), [items]);

	const handleAddToCart = useCallback(
		(product: Product, event?: React.MouseEvent) => {
			// Trigger animation if we have event coordinates
			if (event) {
				const newItem = {
					id: Date.now(),
					start: { x: event.clientX, y: event.clientY },
					image: product.image
				};
				setFlyingItems(prev => [...prev, newItem]);
			}

			const { finalPrice } = calculateEffectivePrice(
				{
					_id: product._id,
					price: product.price,
					categoryId: product.categoryId || "",
				},
				activeDiscounts
			);

			addToCart({
				productId: product._id,
				name: product.name,
				price: finalPrice,
				quantity: 1,
				image: product.image,
			});
			toast.success(`${product.name} ditambahkan`, {
				position: "bottom-left",
				duration: 800,
			});
		},
		[activeDiscounts, addToCart]
	);

	const handleCheckout = async (
		finalAmount?: number,
		_discountId?: string,
		paymentMethod: string = "tunai",
		extraOrderData?: {
			tableNumber?: string;
			orderType?: "dine_in" | "takeaway";
			notes?: string;
			autoComplete?: boolean;
		}
	) => {
		if (items.length === 0) {
			toast.error("Keranjang kosong. Tambahkan item terlebih dahulu.");
			return;
		}

		if (finalAmount === undefined) {
			setIsPaymentModalOpen(true);
			return;
		}

		setIsSubmitting(true);
		const { name: custName, orderType: custOrderType, tableNumber: custTable, notes: custNotes } = customerInfo;

		try {
			await createOrder({
				items: items.map((i) => ({
					productId: i.productId as Id<"products">,
					productName: i.name,
					variant: i.variant,
					quantity: i.quantity,
					price: i.price,
				})),
				totalAmount: finalAmount,
				paymentMethod: paymentMethod,
				customerName: custName || "Pelanggan",
				tableNumber: extraOrderData?.tableNumber || custTable,
				orderType: extraOrderData?.orderType || custOrderType,
				notes: extraOrderData?.notes || custNotes,
				autoComplete: extraOrderData?.autoComplete,
			});

			const orderDetails = {
				orderNumber: `ORDER-${Date.now().toString().slice(-4)}`,
				items: items.map((i) => ({
					productId: i.productId,
					name: i.name,
					variant: i.variant,
					price: i.price,
					quantity: i.quantity,
				})),
				totalAmount: finalAmount,
				subtotal: totalAmount,
				discountAmount,
				taxAmount,
				serviceChargeAmount,
				paymentMethod: paymentMethod,
				createdAt: Date.now(),
				customerName: custName || (custTable ? `Meja ${custTable}` : "Pelanggan"),
				orderType: custOrderType,
				tableNumber: custTable,
				notes: custNotes,
			};

			if (siteSettings?.autoPrint && bluetoothPrinter.isConnected()) {
				try {
					await bluetoothPrinter.print(orderDetails, {
						storeName: siteSettings.storeName,
						storeAddress: siteSettings.storeAddress,
						storePhone: siteSettings.storePhone,
						receiptFooter: siteSettings.receiptFooter,
						receiptLogo: siteSettings.receiptLogo,
						receiptHeader: siteSettings.receiptHeader,
						receiptShowLogo: siteSettings.receiptShowLogo,
						receiptShowAddress: siteSettings.receiptShowAddress,
						receiptShowPhone: siteSettings.receiptShowPhone,
						receiptShowOrderNumber: siteSettings.receiptShowOrderNumber,
						receiptShowCustomerName: siteSettings.receiptShowCustomerName,
						receiptShowNotes: siteSettings.receiptShowNotes,
						receiptFontSize: siteSettings.receiptFontSize,
					});
					toast.success("Struk dicetak otomatis");
				} catch (printError) {
					console.error("Auto print failed:", printError);
					toast.error("Gagal cetak struk otomatis");
				}
			}

			clearCart();
			setIsPaymentModalOpen(false);
			setIsMobileCartOpen(false);
			toast.success("Pesanan berhasil dibuat!", {
				description: "Silakan tunggu staf kami memproses pesanan Anda.",
				position: "top-center",
				action: {
					label: "Cetak Struk",
					onClick: async () => {
						if (!bluetoothPrinter.isConnected()) {
							toast.error(
								"Printer tidak terhubung. Silakan hubungkan di Pengaturan."
							);
							return;
						}
						try {
							await bluetoothPrinter.print(orderDetails, {
								storeName: siteSettings?.storeName,
								storeAddress: siteSettings?.storeAddress,
								storePhone: siteSettings?.storePhone,
								receiptFooter: siteSettings?.receiptFooter,
								receiptLogo: siteSettings?.receiptLogo,
								receiptHeader: siteSettings?.receiptHeader,
								receiptShowLogo: siteSettings?.receiptShowLogo,
								receiptShowAddress: siteSettings?.receiptShowAddress,
								receiptShowPhone: siteSettings?.receiptShowPhone,
								receiptShowOrderNumber: siteSettings?.receiptShowOrderNumber,
								receiptShowCustomerName: siteSettings?.receiptShowCustomerName,
								receiptShowNotes: siteSettings?.receiptShowNotes,
								receiptFontSize: siteSettings?.receiptFontSize,
							});
							toast.success("Struk sedang dicetak");
						} catch (_e) {
							toast.error("Gagal mencetak struk.");
						}
					},
				},
			});
		} catch (e) {
			console.error(e);
			toast.error("Gagal membuat pesanan. Silakan coba lagi.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCancelAction = () => {
		if (items.length > 0) {
			clearCart();
			toast.info("Pesanan dibatalkan.");
		} else {
			navigate({ to: "/" });
		}
	};

	return (
		<div className="flex h-dvh w-full flex-col overflow-hidden bg-background font-sans text-sm">
			<SkipLink target="main-content" />

			{/* Header - Top bar + Category filter */}
			<header className="shrink-0 border-border border-b bg-background/95 backdrop-blur-sm shadow-sm">
				{/* Top row: title + action buttons */}
				<div className="flex items-center justify-between gap-2 px-3 py-2">
					<span className="font-bold text-foreground text-base">Menu</span>
					<div className="flex shrink-0 items-center gap-1.5">
						<TransactionHistorySidebar />
						<MenuSidebar />
					</div>
				</div>
				{/* Category filter row - full width, compact pills */}
				<div
					className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2 scroll-smooth"
					role="tablist"
					style={{ WebkitOverflowScrolling: 'touch' }}
				>
					<button
						aria-label="Tampilkan semua kategori"
						aria-selected={selectedCategory === null}
						className={`shrink-0 whitespace-nowrap rounded-full border px-5 py-2.5 font-bold text-xs transition-all active:scale-95 ${
							selectedCategory === null
								? "border-primary bg-primary text-primary-foreground shadow-sm"
								: "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground"
						}`}
						onClick={() => setSelectedCategory(null)}
						role="tab"
						type="button"
					>
						Semua
					</button>
					{categories
						? categories.map((cat: Doc<"categories">) => (
								<button
									aria-label={`Tampilkan kategori ${cat.name}`}
									aria-selected={selectedCategory === cat._id}
									className={`shrink-0 whitespace-nowrap rounded-full border px-5 py-2.5 font-bold text-xs transition-all active:scale-95 ${
										selectedCategory === cat._id
											? "border-primary bg-primary text-primary-foreground shadow-sm"
											: "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground"
									}`}
									key={cat._id}
									onClick={() => setSelectedCategory(cat._id)}
									role="tab"
									type="button"
								>
									{cat.name}
								</button>
							))
						: Array.from({ length: 5 }).map((_, i) => (
								<Skeleton className="h-7 w-20 shrink-0 rounded-full" key={i} />
							))}
				</div>
			</header>

			{/* Main Content Area */}
			<div className="flex flex-1 overflow-hidden">
				{/* Product Grid */}
				<main
					className="flex-1 overflow-y-auto bg-muted/20 p-2 pb-40 md:pb-2 md:p-3"
					id="main-content"
					tabIndex={-1}
				>
					<CustomerInfoForm />
					{products ? (
						<div className="grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
							{products.map((product) => {
								const { finalPrice } = calculateEffectivePrice(
									{
										_id: product._id,
										price: product.price,
										categoryId: product.categoryId || "",
									},
									activeDiscounts
								);
								const cartItem = items.find((i) => i.productId === product._id);

								return (
									<button
										className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.95] active:bg-muted/10"
										key={product._id}
										onClick={(e) => handleAddToCart(product, e)}
										type="button"
									>
										{product.menuNumber != null && (
											<div className="absolute top-1.5 left-1.5 z-10 flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 bg-black/80 text-white font-bold text-xs leading-none shadow-md">
												{product.menuNumber}
											</div>
										)}
										{cartItem && (
											<div className="absolute top-1.5 right-1.5 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 font-bold text-primary-foreground text-[10px] shadow-md">
												{cartItem.quantity}
											</div>
										)}

										<div className="relative aspect-[4/3] overflow-hidden bg-muted">
											{product.image ? (
												<img
													alt={product.name}
													className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
													height={150}
													loading="lazy"
													src={product.image}
													width={200}
												/>
											) : (
												<div className="flex h-full w-full items-center justify-center bg-primary/5">
													<span className="font-bold text-2xl text-primary/30">
														{product.name.charAt(0)}
													</span>
												</div>
											)}
										</div>

										<div className="flex flex-1 flex-col justify-between gap-0.5 p-2 md:p-3">
											<h3 className="line-clamp-2 font-semibold text-foreground text-[11px] leading-tight md:text-sm">
												{product.name}
											</h3>
											<span className="font-bold text-primary text-xs md:text-base">
												{formatCurrency(finalPrice)}
											</span>
										</div>
									</button>
								);
							})}
						</div>
					) : (
						<div className="grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
							{Array.from({ length: 12 }).map((_, i) => (
								<div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-0 overflow-hidden" key={i}>
									<Skeleton className="aspect-[4/3] w-full" />
									<div className="p-2 space-y-2">
										<Skeleton className="h-3 w-3/4" />
										<Skeleton className="h-4 w-1/2" />
									</div>
								</div>
							))}
						</div>
					)}
				</main>

				{/* Desktop Cart Sidebar */}
				<aside
					aria-label="Keranjang belanja"
					className="z-20 hidden h-full w-[340px] shrink-0 flex-col border-border border-l bg-muted/30 shadow-xl md:flex"
					id="cart-sidebar"
				>
					<div className="flex flex-1 flex-col overflow-hidden m-4 rounded-xl border border-border bg-white shadow-inner">
						{/* Receipt Header */}
						<div className="shrink-0 flex flex-col items-center p-6 text-center font-mono">
							{siteSettings?.receiptShowLogo && siteSettings?.receiptLogo && (
								<img 
									src={siteSettings.receiptLogo} 
									alt="Logo" 
									className="h-16 w-auto mb-3 grayscale contrast-125"
								/>
							)}
							<h2 className={`font-bold uppercase tracking-tight ${siteSettings?.receiptFontSize === 'large' ? 'text-xl' : siteSettings?.receiptFontSize === 'small' ? 'text-sm' : 'text-base'}`}>
								{siteSettings?.receiptHeader || siteSettings?.storeName || "YUMI POS"}
							</h2>
							{siteSettings?.receiptShowAddress && siteSettings?.storeAddress && (
								<p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] leading-tight">
									{siteSettings.storeAddress}
								</p>
							)}
							{siteSettings?.receiptShowPhone && siteSettings?.storePhone && (
								<p className="text-[10px] text-muted-foreground">
									Telp: {siteSettings.storePhone}
								</p>
							)}
							<div className="w-full border-b border-dashed border-border mt-4" />
						</div>

						{/* Receipt Items */}
						<div className="flex-1 overflow-y-auto px-6 py-2 scrollbar-thin scrollbar-thumb-muted">
							{items.length === 0 ? (
								<EmptyCart className="h-full justify-center" size="md" />
							) : (
								<div className="divide-y divide-dashed divide-border/50">
									{items.map((item) => (
										<ReceiptItemRow
											item={item}
											key={`${item.productId}-${item.variant}`}
											onUpdateQuantity={updateQuantity}
										/>
									))}
								</div>
							)}
						</div>

						{/* Receipt Footer & Summary */}
						<div className="shrink-0 p-6 pt-2 bg-white font-mono">
							{/* Order Info (Preview) */}
							<div className="mb-2 text-[10px] space-y-0.5">
								<p>TIPE: {appliedVoucher ? "PROMO" : "REGULER"}</p>
								{items.length > 0 && (
									<p className="text-primary font-bold">READY TO PRINT</p>
								)}
							</div>
							
							<div className="mb-4">
								<ReceiptPriceSummary
									discountAmount={discountAmount}
									finalTotal={finalTotal}
									serviceChargeAmount={serviceChargeAmount}
									serviceChargeRate={serviceChargeRate}
									taxAmount={taxAmount}
									taxRate={taxRate}
									totalAmount={totalAmount}
								/>
							</div>

							<div className="text-center border-t border-dashed border-border pt-4 mb-2">
								<p className="text-[10px] text-muted-foreground uppercase leading-relaxed">
									{siteSettings?.receiptFooter || "Terima Kasih Atas Kunjungan Anda!"}
								</p>
							</div>
						</div>
					</div>

					{/* CTA Buttons - Fixed at bottom of sidebar */}
					<div className="shrink-0 p-4 pt-0">
						<button
							className="mb-3 flex w-full items-center justify-between rounded-xl border border-emerald-500/30 border-dashed bg-emerald-50/50 px-4 py-3 transition-all hover:border-emerald-500 hover:bg-emerald-50 active:scale-[0.98]"
							onClick={() => setIsVoucherModalOpen(true)}
							type="button"
						>
							<div className="flex items-center gap-2">
								<Tag className="h-4 w-4 text-emerald-600" />
								<span className="font-bold text-emerald-700 text-xs uppercase tracking-wider">
									{appliedVoucher ? appliedVoucher.name : "Voucher / Diskon"}
								</span>
							</div>
							{appliedVoucher ? (
								<span className="rounded-full bg-emerald-600 px-2 py-0.5 font-bold text-white text-[10px]">
									TERPASANG
								</span>
							) : (
								<Plus className="h-3 w-3 text-emerald-400" />
							)}
						</button>

						<div className="grid grid-cols-4 gap-3">
							<button
								className="col-span-1 flex items-center justify-center rounded-xl border border-border bg-white p-3.5 font-bold text-muted-foreground text-xs uppercase tracking-widest transition-all hover:bg-muted active:scale-95"
								onClick={handleCancelAction}
								type="button"
							>
								Batal
							</button>
							<button
								aria-label="Bayar pesanan"
								className={`col-span-3 flex items-center justify-center rounded-xl bg-primary p-3.5 font-bold text-primary-foreground text-sm uppercase tracking-widest shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl active:scale-[0.98] ${
									items.length === 0 || isSubmitting
										? "cursor-not-allowed opacity-50"
										: ""
								}`}
								disabled={items.length === 0 || isSubmitting}
								onClick={() => handleCheckout()}
								type="button"
							>
								{isSubmitting ? "Memproses..." : "Bayar Sekarang"}
							</button>
						</div>
					</div>
				</aside>

			</div>

			{/* Mobile Bottom Bar */}
			<MobileBottomBar
				appliedVoucher={appliedVoucher}
				discountAmount={discountAmount}
				finalTotal={finalTotal}
				hasItems={items.length > 0}
				isSubmitting={isSubmitting}
				onCheckout={() => handleCheckout()}
				onOpenCart={() => setIsMobileCartOpen(true)}
				onOpenVoucher={() => setIsVoucherModalOpen(true)}
				onRemoveVoucher={() => applyVoucher(null)}
				totalAmount={totalAmount}
				totalItems={totalItems}
			/>

			<MobileCartDrawer
				appliedVoucher={appliedVoucher}
				discountAmount={discountAmount}
				finalTotal={finalTotal}
				isOpen={isMobileCartOpen}
				isSubmitting={isSubmitting}
				items={items}
				onCancel={() => {
					clearCart();
					setIsMobileCartOpen(false);
				}}
				onCheckout={() => handleCheckout()}
				onClearCart={() => clearCart()}
				onOpenChange={setIsMobileCartOpen}
				onOpenVoucher={() => setIsVoucherModalOpen(true)}
				onUpdateQuantity={updateQuantity}
				serviceChargeAmount={serviceChargeAmount}
				serviceChargeRate={serviceChargeRate}
				taxAmount={taxAmount}
				taxRate={taxRate}
				totalAmount={totalAmount}
				totalItems={totalItems}
			/>

			<PaymentConfirmationModal
				isSubmitting={isSubmitting}
				isOpen={isPaymentModalOpen}
				onClose={() => setIsPaymentModalOpen(false)}
				onConfirm={(amount, discId, method, extra) => 
					handleCheckout(amount, discId, method, extra)
				}
			/>

			<AnimatePresence>
				{flyingItems.map(item => (
					<FlyingItem
						key={item.id}
						startPos={item.start}
						targetPos={{ 
							x: window.innerWidth > 768 ? window.innerWidth - 170 : window.innerWidth - 50, 
							y: window.innerWidth > 768 ? 300 : window.innerHeight - 50 
						}}
						image={item.image}
						onComplete={() => setFlyingItems(prev => prev.filter(i => i.id !== item.id))}
					/>
				))}
			</AnimatePresence>

			<VoucherModal
				appliedVoucher={appliedVoucher}
				cartTotal={totalAmount}
				isOpen={isVoucherModalOpen}
				onApplyVoucher={applyVoucher}
				onClose={() => setIsVoucherModalOpen(false)}
			/>
		</div>
	);
}

export const Route = createLazyFileRoute("/menu")({
	component: MenuPage,
});
