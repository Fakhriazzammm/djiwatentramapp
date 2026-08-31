import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { CartItem } from "./types";
import { currency } from "./types";

export function BadgePill({ label }: { label: string }) {
	return <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur">{label}</span>;
}

export function chipClassName(active: boolean) {
	return cn(
		"min-h-11 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-all",
		active ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-background text-muted-foreground"
	);
}

export function BottomButton({
	badge,
	disabled,
	icon,
	label,
	onClick,
	primary,
}: {
	badge?: string;
	disabled?: boolean;
	icon: ReactNode;
	label: string;
	onClick: () => void;
	primary?: boolean;
}) {
	const shouldReduceMotion = useReducedMotion();
	const tapScale = shouldReduceMotion ? 1 : 0.92;
	const spring = { type: "spring" as const, stiffness: 420, damping: 28, mass: 0.7 };

	return (
		<motion.button
			type="button"
			whileTap={{ scale: tapScale }}
			whileHover={shouldReduceMotion ? undefined : { y: -1 }}
			transition={spring}
			className={cn(
				"relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[14px] px-1.5 py-1.5 text-[10px] font-bold",
				primary ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
				disabled ? "opacity-40" : ""
			)}
			disabled={disabled}
			onClick={onClick}
		>
			{badge ? (
				<motion.span
					initial={shouldReduceMotion ? false : { scale: 0.7, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={spring}
					className="absolute right-1.5 top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] text-white"
				>
					{badge}
				</motion.span>
			) : null}
			<motion.span
				animate={shouldReduceMotion ? { scale: 1 } : { scale: 1.06, y: -1 }}
				transition={spring}
				className="flex h-4 items-center justify-center"
			>
				{icon}
			</motion.span>
			<span>{label}</span>
		</motion.button>
	);
}

export function CartRow({
	item,
	onDecrease,
	onIncrease,
	onRemove,
}: {
	item: CartItem;
	onDecrease: () => void;
	onIncrease: () => void;
	onRemove: () => void;
}) {
	return (
		<div className="rounded-[20px] border border-border bg-card p-3 shadow-sm">
			<div className="flex gap-2.5">
				<div className="h-12 w-12 overflow-hidden rounded-xl bg-muted">
					{item.image ? (
						<img alt={item.name} className="h-full w-full object-cover" src={item.image} />
					) : null}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-2">
						<div>
							<p className="text-xs font-black leading-snug">{item.name}</p>
							{item.variant ? (
								<p className="mt-0.5 text-[10px] text-muted-foreground">{item.variant}</p>
							) : null}
						</div>
						<button
							type="button"
							className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"
							aria-label={`Hapus ${item.name} dari keranjang`}
							onClick={onRemove}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					</div>
					<div className="mt-2.5 flex items-center justify-between">
						<p className="text-xs font-black text-primary">{currency(item.price * item.quantity)}</p>
						<div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-1.5 py-0.5">
							<button
								type="button"
								className="flex h-11 w-11 items-center justify-center rounded-full bg-muted"
								aria-label={`Kurangi jumlah ${item.name}`}
								onClick={onDecrease}
							>
								<Minus className="h-3.5 w-3.5" />
							</button>
							<span className="min-w-[1.25rem] text-center text-xs font-black">{item.quantity}</span>
							<button
								type="button"
								className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"
								aria-label={`Tambah jumlah ${item.name}`}
								onClick={onIncrease}
							>
								<Plus className="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export function SummaryCardLines({
	freeRefillCharge,
	productGrossSubtotal,
	promoDiscount,
	djiwaPayDiscount = 0,
	paymentChoice,
	serviceChargeAmount,
	serviceChargeRate,
	taxEnabled = false,
	taxAmount,
	taxRate,
	total,
}: {
	freeRefillCharge: number;
	productGrossSubtotal: number;
	promoDiscount: number;
	djiwaPayDiscount?: number;
	paymentChoice?: "cashier" | "wallet" | "mayar";
	serviceChargeAmount: number;
	serviceChargeRate: number;
	taxEnabled?: boolean;
	taxAmount: number;
	taxRate: number;
	total: number;
}) {
	// The checkout caller predates the persisted tax fields. Derive these values
	// from the values it already supplies; receipt history uses persisted values.
	const taxBase = Math.max(0, productGrossSubtotal + freeRefillCharge - promoDiscount - djiwaPayDiscount);
	const rawTotal = taxBase + serviceChargeAmount + taxAmount;
	const roundingAdjustment = total - rawTotal;
	const isCashierFree = paymentChoice === "cashier";

	return (
		<div className="space-y-1.5 rounded-xl bg-muted/35 p-3">
			<Line label="Subtotal produk" value={currency(productGrossSubtotal)} />
			{freeRefillCharge > 0 ? <Line label="Free refill minuman" value={currency(freeRefillCharge)} /> : null}
			{promoDiscount > 0 ? (
				<Line label="Promo / diskon" value={`-${currency(promoDiscount)}`} className="text-orange-600" />
			) : null}
			{djiwaPayDiscount > 0 ? (
				<Line label="Voucher Djiwa Pay (20%)" value={`-${currency(djiwaPayDiscount)}`} className="text-emerald-600" />
			) : null}
			<Line label={`Service Charge (${serviceChargeRate}%)`} value={isCashierFree ? "Gratis / Rp0" : currency(serviceChargeAmount)} />
			{taxEnabled ? <Line label={`PBJT/Pajak Restoran (${taxRate}%)`} value={isCashierFree ? "Gratis / Rp0" : currency(taxAmount)} /> : null}
			{taxEnabled ? <Line label="Dasar pajak" value={currency(taxBase)} /> : null}
			{taxEnabled ? <p className="text-[10px] leading-relaxed text-muted-foreground">
				{isCashierFree ? "Pembayaran tunai di kasir: PBJT dan service charge Rp0 sesuai kebijakan operasional." : `PBJT makanan dan minuman Kota Tasikmalaya ${taxRate}%. Service charge ditampilkan terpisah dan bukan pajak daerah.`}
			</p> : <p className="text-[10px] leading-relaxed text-muted-foreground">Harga menu sudah termasuk Pajak Barang dan Jasa Tertentu (PBJT) atas makanan dan/atau minuman sesuai ketentuan yang berlaku di Kota Tasikmalaya.</p>}
			{roundingAdjustment !== 0 ? <Line label="Pembulatan" value={currency(roundingAdjustment)} className={roundingAdjustment > 0 ? "text-amber-700" : "text-emerald-700"} /> : null}
			<div className="flex items-center justify-between border-t border-border pt-2">
				<span className="text-xs font-black uppercase tracking-[0.16em] text-foreground">Total</span>
				<span className="text-lg font-black text-foreground">{currency(total)}</span>
			</div>

		</div>
	);
}

/** Breakdown for an order whose tax calculation was persisted by the backend. */
export function ReceiptTotalsBreakdown({
	rawTotal,
	taxBase,
	taxAmount = 0,
	taxRate = 10,
	taxEnabled = true,
	serviceChargeAmount = 0,
	roundingAdjustment,
	total,
}: {
	rawTotal: number;
	taxBase: number;
	taxAmount?: number;
	taxRate?: number;
	taxEnabled?: boolean;
	serviceChargeAmount?: number;
	roundingAdjustment: number;
	total: number;
}) {
	return (
		<div className="mt-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left">
			<p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Rincian pembulatan</p>
			<div className="mt-1.5 space-y-1">
				{taxEnabled ? <Line label="Dasar pajak" value={currency(taxBase)} /> : null}
				{taxEnabled ? <Line label={`PBJT/Pajak Restoran (${taxRate}%)`} value={currency(taxAmount)} /> : null}
				{!taxEnabled ? <p className="text-[10px] leading-relaxed text-muted-foreground">Harga menu sudah termasuk PBJT atas makanan dan/atau minuman sesuai ketentuan yang berlaku di Kota Tasikmalaya.</p> : null}
				<Line label="Service charge" value={currency(serviceChargeAmount)} />
				<Line label="Sebelum pembulatan" value={currency(rawTotal)} />
				{roundingAdjustment !== 0 ? <Line label="Pembulatan" value={currency(roundingAdjustment)} className={roundingAdjustment > 0 ? "text-amber-700" : "text-emerald-700"} /> : null}
				<Line label="Total dibayar" value={currency(total)} />
			</div>

		</div>
	);
}

export function Line({
	className,
	label,
	value,
}: {
	className?: string;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3 text-xs">
			<span className="text-muted-foreground">{label}</span>
			<span className={cn("font-semibold text-foreground", className)}>{value}</span>
		</div>
	);
}

export function BarcodeLines({ value }: { value: string }) {
	const pattern = Array.from(value.replace(/\s+/g, ""))
		.map((character, index) => ((character.charCodeAt(0) + index * 7) % 4) + 1)
		.flatMap((width) => [width, 1]);
	return (
		<div className="mt-4 rounded-xl border border-border bg-white px-3 py-3 shadow-inner">
			<div className="flex h-20 items-end justify-center gap-[2px]">
				{pattern.map((width, index) => (
					<span
						key={`${value}-${index}`}
						className="bg-black"
						style={{ width: `${Math.max(2, width * 2)}px`, height: `${index % 2 === 0 ? 74 : 64}px` }}
					/>
				))}
			</div>
			<p className="mt-3 text-center font-mono text-xs font-bold tracking-[0.28em] text-foreground">{value}</p>
		</div>
	);
}

export function CustomerOrderProgress({ step }: { step: "party" | "refill" | "menu" | "checkout" | "receipt" }) {
	const steps = [
		{ key: "party", label: "Data meja" },
		{ key: "menu", label: "Menu" },
		{ key: "checkout", label: "Checkout" },
		{ key: "receipt", label: "Selesai" },
	] as const;
	const normalizedStep = step === "refill" ? "party" : step;
	const activeIndex = steps.findIndex((item) => item.key === normalizedStep);
	return (
		<div className="flex items-center gap-1.5 px-3 pb-1 pt-2" aria-label={`Progress order: ${steps[Math.max(0, activeIndex)]?.label ?? "Order"}`}>
			{steps.map((item, index) => (
				<div key={item.key} className="flex min-w-0 flex-1 items-center gap-1.5">
					<div className={cn("h-1.5 flex-1 rounded-full", index <= activeIndex ? "bg-primary" : "bg-muted")} />
					<span className={cn("hidden text-[9px] font-bold sm:inline", index === activeIndex ? "text-primary" : "text-muted-foreground")}>{item.label}</span>
				</div>
			))}
		</div>
	);
}
