import { Loader2, QrCode, ShoppingCart, Wallet } from "lucide-react";
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
	shippingReceiverName: string;
	shippingAddress: string;
	shippingPhone: string;
	guestEmail: string;
	isAuthenticated: boolean;
	djiwaPayDiscount?: number;
	isSubmitting: boolean;
	notes: string;
	paymentChoice: PaymentChoice;
	paymentOptions: Array<{ key: PaymentChoice; label: string; description: string }>;
	productGrossSubtotal: number;
	promoDiscount: number;
	serviceChargeAmount: number;
	serviceChargeRate: number;
	setCustomerName: (v: string) => void;
	setShippingReceiverName: (v: string) => void;
	setShippingAddress: (v: string) => void;
	setShippingPhone: (v: string) => void;
	setGuestEmail: (v: string) => void;
	setNotes: (v: string) => void;
	setPaymentChoice: (v: PaymentChoice) => void;
	onBackToMenu: () => void;
	taxAmount: number;
	taxEnabled: boolean;
	taxRate: number;
	total: number;
	walletBalance: number;
	onTopup: () => void;
	checkoutError: string | null;
}

export function renderCheckoutSection(props: CheckoutSectionProps) {
	if (!props.cart.length) {
		return (
			<div className="space-y-2 px-2 py-2">
				<div className="rounded-3xl border border-dashed border-border bg-card p-6 text-center shadow-sm">
					<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><ShoppingCart className="h-6 w-6" aria-hidden="true" /></div>
					<h2 className="mt-3 text-base font-black">Keranjang masih kosong</h2>
					<p className="mt-1 text-xs leading-relaxed text-muted-foreground">Tambahkan menu terlebih dahulu untuk melanjutkan checkout.</p>
					<button type="button" onClick={props.onBackToMenu} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[14px] bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground">Kembali ke menu</button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-2 px-2 py-2">
			<div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Wallet className="h-4 w-4" />
					</div>
					<div>
						<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/70">Step 4 · Preorder Merchandise</p>
						<h2 className="text-sm font-black">Detail pengiriman & pembayaran</h2>
						<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Bayar penuh saat checkout. Produk akan disiapkan dan dikirim setelah pembayaran terkonfirmasi.</p>
					</div>
				</div>
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
					<div className="space-y-0.5"><label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nama penerima <span className="text-destructive">*</span></label><input aria-label="Nama penerima" autoComplete="shipping name" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none" value={props.shippingReceiverName} onChange={(event) => props.setShippingReceiverName(event.target.value)} placeholder="Nama lengkap penerima" type="text" /></div>
					<div className="space-y-0.5"><label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Alamat pengiriman <span className="text-destructive">*</span></label><textarea aria-label="Alamat pengiriman" autoComplete="shipping street-address" className="min-h-[88px] w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none" value={props.shippingAddress} onChange={(event) => props.setShippingAddress(event.target.value)} placeholder="Alamat lengkap, kecamatan, kota, kode pos" /></div>
					<div className="space-y-0.5"><label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nomor WhatsApp penerima <span className="text-destructive">*</span></label><input aria-label="Nomor WhatsApp penerima" autoComplete="shipping tel" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none" value={props.shippingPhone} onChange={(event) => props.setShippingPhone(event.target.value.replace(/[^0-9+ ]/g, ""))} placeholder="08xxxxxxxxxx" type="tel" inputMode="tel" /></div>
					{props.paymentChoice === "mayar" && !props.isAuthenticated ? (
						<div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
							<p className="text-[10px] font-black uppercase tracking-[0.12em] text-primary">Data untuk pembayaran QRIS</p>
							<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Email diperlukan untuk menyiapkan pembayaran QRIS.</p>
							<div className="mt-2 space-y-2">
								<div className="space-y-0.5">
									<label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Email <span className="text-destructive">*</span></label>
									<input aria-label="Email untuk pembayaran QRIS" autoComplete="email" className="min-h-11 w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none" value={props.guestEmail} onChange={(event) => props.setGuestEmail(event.target.value)} placeholder="nama@email.com" type="email" inputMode="email" />
								</div>
								<div className="space-y-0.5">
									<input type="hidden" value={props.shippingPhone} readOnly aria-hidden="true" />
								</div>
							</div>
						</div>
					) : null}
					<div className="space-y-0.5">
						<label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Catatan order</label>
						<textarea aria-label="Catatan order" className="min-h-[88px] w-full rounded-[14px] border border-border bg-background px-3 py-2 text-xs font-medium outline-none" value={props.notes} onChange={(event) => props.setNotes(event.target.value)} placeholder="Contoh: saus dipisah, tanpa es" />
					</div>

				</div>
			</div>
			<div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
				<div className="flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5 text-primary" /><h3 className="text-sm font-black">Pilih pembayaran</h3></div>
				<div className="mt-2.5 space-y-1.5" role="radiogroup" aria-label="Metode pembayaran">{props.paymentOptions.map((option) => { const walletInsufficient = option.key === "wallet" && props.walletBalance < props.total; return <div key={option.key} className={cn("rounded-lg border transition-all", props.paymentChoice === option.key && !walletInsufficient ? "border-primary bg-primary/5 shadow-sm" : walletInsufficient ? "border-amber-200 bg-amber-50/60" : "border-border bg-background")}><button type="button" role="radio" aria-checked={props.paymentChoice === option.key && !walletInsufficient} aria-disabled={walletInsufficient} disabled={walletInsufficient} className={cn("flex min-h-11 w-full items-start justify-between px-2.5 py-2.5 text-left transition-all", walletInsufficient ? "cursor-not-allowed opacity-80" : "cursor-pointer")} onClick={() => props.setPaymentChoice(option.key)}><div><p className="font-black text-xs">{option.label}</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{walletInsufficient ? `Saldo tersedia ${currency(props.walletBalance)}, masih kurang ${currency(props.total - props.walletBalance)}.` : option.description}</p></div><div aria-hidden="true" className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2", props.paymentChoice === option.key && !walletInsufficient ? "border-primary bg-primary" : "border-muted-foreground/30")}>{props.paymentChoice === option.key && !walletInsufficient ? <div className="h-1.5 w-1.5 rounded-full bg-white" /> : null}</div></button>{walletInsufficient ? <div className="flex items-center justify-between gap-2 border-t border-amber-200/80 px-2.5 py-2"><p className="text-[10px] font-semibold leading-relaxed text-amber-800">Isi saldo Djiwa Pay dulu sebelum menggunakan metode ini.</p><button type="button" onClick={props.onTopup} className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[10px] font-black text-white">Top up</button></div> : null}</div>; })}</div><p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Pembayaran penuh diperlukan saat checkout. Djiwa Pay menggunakan penahanan lalu capture saldo yang sudah terverifikasi.</p>
			</div>
			{props.checkoutError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold leading-relaxed text-red-800">{props.checkoutError}</div> : null}
			<div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
				<SummaryCardLines productGrossSubtotal={props.productGrossSubtotal} freeRefillCharge={0} promoDiscount={props.promoDiscount} djiwaPayDiscount={props.djiwaPayDiscount} paymentChoice={props.paymentChoice} taxAmount={props.taxAmount} taxEnabled={props.taxEnabled} taxRate={props.taxRate} serviceChargeAmount={props.serviceChargeAmount} serviceChargeRate={props.serviceChargeRate} total={props.total} />
				<button type="button" className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-3 py-2.5 text-xs font-black text-primary-foreground shadow-sm transition-all disabled:opacity-60" onClick={props.checkout} disabled={props.isSubmitting}>{props.isSubmitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Memproses...</> : <>Checkout {props.currency(props.total)}</>}</button>
			</div>
		</div>
	);
}
