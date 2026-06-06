import { Loader2, QrCode, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentChoice } from "./types";
import { CUSTOMER_ORDERING_DEFAULTS, currency } from "./types";
import { SummaryCardLines } from "./shared-components";

export interface CheckoutSectionProps {
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
		<div className="space-y-2 px-2 py-2">
			<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Wallet className="h-4 w-4" />
					</div>
					<div>
						<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/70">Step akhir</p>
						<h2 className="text-sm font-black">Checkout pesanan</h2>
					</div>
				</div>
				<div className="mt-2.5 space-y-2">
					<div className="space-y-0.5">
						<label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nama customer</label>
						<input className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium outline-none" value={props.customerName} onChange={(event) => props.setCustomerName(event.target.value)} placeholder="Opsional" type="text" />
					</div>
					<div className="space-y-0.5">
						<label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nomor meja</label>
						<input className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium outline-none" value={props.tableNumber} onChange={(event) => props.setTableNumber(event.target.value.replace(/[^\dA-Za-z-]/g, ""))} placeholder="Contoh 12" type="text" />
					</div>
					<div className="space-y-0.5">
						<label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Catatan order</label>
						<textarea className="min-h-[52px] w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium outline-none" value={props.notes} onChange={(event) => props.setNotes(event.target.value)} placeholder="Contoh: saus dipisah, tanpa es" />
					</div>
					{props.config.enableDessertLater && props.hasDessertInCart ? <label className="flex items-center justify-between rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-2"><div><p className="font-bold text-[10px] text-foreground">Bawakan dessert nanti</p><p className="text-[10px] text-muted-foreground">Bisa dipanggil saat sudah siap.</p></div><button type="button" className={cn("relative h-5 w-9 rounded-full transition-all", props.dessertLater ? "bg-primary" : "bg-muted-foreground/20")} onClick={() => props.setDessertLater((value: boolean) => !value)}><span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all", props.dessertLater ? "right-0.5" : "left-0.5")} /></button></label> : null}
				</div>
			</div>
			<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
				<div className="flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5 text-primary" /><h3 className="text-sm font-black">Pilih pembayaran</h3></div>
				<div className="mt-2.5 space-y-1.5">{props.paymentOptions.map((option) => <button type="button" key={option.key} className={cn("flex w-full items-start justify-between rounded-lg border px-2.5 py-2.5 text-left transition-all", props.paymentChoice === option.key ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background")} onClick={() => props.setPaymentChoice(option.key)}><div><p className="font-black text-xs">{option.label}</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{option.description}</p></div><div className={cn("mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2", props.paymentChoice === option.key ? "border-primary bg-primary" : "border-muted-foreground/30")}>{props.paymentChoice === option.key ? <div className="h-1.5 w-1.5 rounded-full bg-white" /> : null}</div></button>)}</div>
			</div>
			<div className="rounded-xl border border-border bg-card p-3 shadow-sm">
				<SummaryCardLines productGrossSubtotal={props.productGrossSubtotal} freeRefillCharge={props.freeRefillCharge} promoDiscount={props.promoDiscount} taxAmount={props.taxAmount} taxRate={props.taxRate} serviceChargeAmount={props.serviceChargeAmount} serviceChargeRate={props.serviceChargeRate} total={props.total} />
				<button type="button" className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-black text-primary-foreground shadow-sm transition-all disabled:opacity-60" onClick={props.checkout} disabled={props.isSubmitting}>{props.isSubmitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Memproses...</> : <>Checkout {props.currency(props.total)}</>}</button>
			</div>
		</div>
	);
}
