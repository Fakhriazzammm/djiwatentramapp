import { CheckoutActionBar, CheckoutHeader, CheckoutPage, OrderSummary, PaymentMethodCard } from "@yumipos/djiwa-checkout-ui";
import { Loader2, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CartItem, PaymentChoice } from "./types";
import { CUSTOMER_ORDERING_DEFAULTS, currency } from "./types";
import { SummaryCardLines } from "./shared-components";

export interface CheckoutSectionProps {
	cart: CartItem[];
	checkout: () => Promise<void>;
	config: typeof CUSTOMER_ORDERING_DEFAULTS;
	currency: (v: number) => string;
	customerName: string;
	dessertLater: boolean;
	freeRefillCharge: number;
	hasDessertInCart: boolean;
	isSubmitting: boolean;
	notes: string;
	paymentChoice: PaymentChoice;
	paymentOptions: Array<{ key: PaymentChoice; label: string; description: string }>;
	productGrossSubtotal: number;
	promoDiscount: number;
	serviceChargeAmount: number;
	serviceChargeRate: number;
	setCustomerName: (v: string) => void;
	setDessertLater: React.Dispatch<React.SetStateAction<boolean>>;
	setNotes: (v: string) => void;
	setPaymentChoice: (v: PaymentChoice) => void;
	setTableNumber: (v: string) => void;
	tableNumber: string;
	taxAmount: number;
	taxRate: number;
	total: number;
}

export function renderCheckoutSection(props: CheckoutSectionProps) {
	return (
		<CheckoutPage className="space-y-2 px-2 py-2">
			<div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
				<CheckoutHeader step={3} totalSteps={4} eyebrow="Pembayaran" title="Checkout pesanan" />
				<div className="mt-3 rounded-2xl border border-border bg-muted/25 p-3" aria-label="Detail pesanan">
					<div className="mb-2 flex items-center justify-between">
						<p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Detail pesanan</p>
						<span className="text-[10px] font-bold text-muted-foreground">{props.cart.reduce((sum, item) => sum + item.quantity, 0)} item</span>
					</div>
					<div className="space-y-2">
						{props.cart.map((item) => (
							<div key={`${item.productId}-${item.variant || "default"}`} className="flex items-center gap-2.5">
								<div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-muted">
									{item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : null}
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs font-black">{item.name}</p>
									<p className="mt-0.5 text-[10px] text-muted-foreground">{item.variant ? `${item.variant} · ` : ""}{item.quantity} × {currency(item.price)}</p>
								</div>
								<p className="shrink-0 text-xs font-black text-foreground">{currency(item.price * item.quantity)}</p>
							</div>
						))}
					</div>
				</div>
				<div className="mt-2.5 space-y-2">
					<div className="space-y-0.5">
						<label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nama customer</label>
						<input aria-label="Nama customer" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none" value={props.customerName} onChange={(event) => props.setCustomerName(event.target.value)} placeholder="Opsional" type="text" />
					</div>
					<div className="space-y-0.5">
						<label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nomor meja</label>
						<input aria-label="Nomor meja" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none" value={props.tableNumber} onChange={(event) => props.setTableNumber(event.target.value.replace(/[^\dA-Za-z-]/g, ""))} placeholder="Contoh 12" type="text" />
					</div>
					{props.paymentChoice === "mayar" && !props.isAuthenticated ? (
						<div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
							<p className="text-[10px] font-black uppercase tracking-[0.12em] text-primary">Data untuk pembayaran QRIS</p>
							<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Email dan nomor WhatsApp diperlukan untuk menyiapkan pembayaran QRIS.</p>
							<div className="mt-2 space-y-2">
								<div className="space-y-0.5">
									<label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Email <span className="text-destructive">*</span></label>
									<input aria-label="Email untuk pembayaran QRIS" autoComplete="email" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none" value={props.guestEmail} onChange={(event) => props.setGuestEmail(event.target.value)} placeholder="nama@email.com" type="email" inputMode="email" />
								</div>
								<div className="space-y-0.5">
									<label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nomor WhatsApp <span className="text-destructive">*</span></label>
									<input aria-label="Nomor WhatsApp untuk pembayaran QRIS" autoComplete="tel" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none" value={props.guestPhone} onChange={(event) => props.setGuestPhone(event.target.value.replace(/[^0-9+ ]/g, ""))} placeholder="08xxxxxxxxxx" type="tel" inputMode="tel" />
								</div>
							</div>
						</div>
					) : null}
					<div className="space-y-0.5">
						<label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Catatan order</label>
						<textarea aria-label="Catatan order" className="min-h-[88px] w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none" value={props.notes} onChange={(event) => props.setNotes(event.target.value)} placeholder="Contoh: saus dipisah, tanpa es" />
					</div>
					{props.config.enableDessertLater && props.hasDessertInCart ? <div className="flex items-center justify-between rounded-[14px] border border-primary/15 bg-primary/5 px-3 py-2"><div><p className="font-bold text-[10px] text-foreground">Bawakan dessert nanti</p><p className="text-[10px] text-muted-foreground">Bisa dipanggil saat sudah siap.</p></div><button type="button" role="switch" aria-checked={props.dessertLater} aria-label="Bawakan dessert nanti" className={cn("relative h-11 w-12 rounded-full transition-all", props.dessertLater ? "bg-primary" : "bg-muted-foreground/20")} onClick={() => props.setDessertLater((value: boolean) => !value)}><span className={cn("absolute top-2.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all", props.dessertLater ? "right-1" : "left-1")} /></button></div> : null}
				</div>
			</div>
			<div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
				<div className="flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5 text-primary" /><h3 className="text-sm font-black">Pilih pembayaran</h3></div>
				<div className="mt-2.5 space-y-1.5">
					{props.paymentOptions.map((option) => <PaymentMethodCard key={option.key} label={option.label} description={option.description} selected={props.paymentChoice === option.key} onSelect={() => props.setPaymentChoice(option.key)} />)}
				</div>
			</div>
			<OrderSummary className="rounded-3xl border border-border bg-card p-4 shadow-sm">
				<SummaryCardLines productGrossSubtotal={props.productGrossSubtotal} freeRefillCharge={props.freeRefillCharge} promoDiscount={props.promoDiscount} taxAmount={props.taxAmount} taxRate={props.taxRate} serviceChargeAmount={props.serviceChargeAmount} serviceChargeRate={props.serviceChargeRate} total={props.total} />
				<CheckoutActionBar primaryLabel={`Checkout ${props.currency(props.total)}`} onPrimary={() => { void props.checkout(); }} primaryDisabled={props.isSubmitting} busy={props.isSubmitting} />
			</OrderSummary>
		</CheckoutPage>
	);
}
