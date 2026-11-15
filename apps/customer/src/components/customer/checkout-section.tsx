import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { CheckoutHeader, CheckoutPage, PaymentMethodCard } from "@djiwaapps/djiwa-checkout-ui";
import { Djiwa3DIcon } from "@djiwaapps/web-shared";
import { cn } from "@/lib/utils";
import { GhostButton, PrimaryButton, Rise, SPRING, StepScreen, StepTitle, tap } from "@/components/order-flow/step-parts";
import type { CartItem, PaymentChoice } from "./types";
import { CUSTOMER_ORDERING_DEFAULTS, currency } from "./types";
import { SummaryCardLines } from "./shared-components";

export interface CheckoutSectionProps {
	cart: CartItem[];
	checkout: () => Promise<void>;
	config: typeof CUSTOMER_ORDERING_DEFAULTS;
	currency: (v: number) => string;
	customerName: string;
	customerDescription: string;
	guestEmail: string;
	guestPhone: string;
	isAuthenticated: boolean;
	dessertLater: boolean;
	djiwaPayDiscount?: number;
	djiwaPayDiscountRate?: number;
	freeRefillCharge: number;
	shippingFee?: number;
	shippingQuotePending?: boolean;
	shippingQuoteError?: string | null;
	canPay?: boolean;
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
	setCustomerDescription: (v: string) => void;
	setGuestEmail: (v: string) => void;
	setGuestPhone: (v: string) => void;
	setDessertLater: React.Dispatch<React.SetStateAction<boolean>>;
	setNotes: (v: string) => void;
	setPaymentChoice: (v: PaymentChoice) => void;
	setTableNumber: (v: string) => void;
	tableNumber: string;
	updateCartQuantity: (productId: string, variant: string | undefined, delta: number) => void;
	onRemoveItem: (productId: string, variant: string | undefined) => void;
	onEditMenu: () => void;
	mode?: "review" | "payment";
	onContinueToPayment?: () => void;
	onBackToMenu: () => void;
	taxAmount: number;
	taxEnabled: boolean;
	taxRate: number;
	total: number;
	walletBalance: number;
	/** Delivery: nomor meja tidak relevan, jadi kolomnya disembunyikan. */
	isDelivery?: boolean;
	onTopup: () => void;
	checkoutError: string | null;
}

/** Angka rupiah yang bergulir ke nilai baru, supaya perubahan total terasa hidup. */
function AnimatedMoney({ value }: { value: number }) {
	const reduce = useReducedMotion();
	const motionValue = useMotionValue(value);
	const [text, setText] = useState(currency(value));
	useEffect(() => {
		if (reduce) { setText(currency(value)); return; }
		const controls = animate(motionValue, value, { duration: 0.55, ease: [0.32, 0.72, 0, 1] });
		const stop = motionValue.on("change", (latest) => setText(currency(Math.round(latest))));
		return () => { controls.stop(); stop(); };
	}, [value, reduce, motionValue]);
	return <span className="tabular-nums">{text}</span>;
}

const fieldClass = "w-full rounded-2xl bg-white px-4 py-3 text-[16px] font-medium outline-none shadow-[inset_0_0_0_1px_rgba(60,60,67,0.16)] transition-shadow focus:shadow-[inset_0_0_0_2px_var(--primary)]";

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
	return (
		<label className="block">
			<span className="mb-1.5 ml-1 block text-xs font-semibold text-muted-foreground">{label}{optional ? <span className="font-normal"> (opsional)</span> : null}</span>
			{children}
		</label>
	);
}

function ReviewRow({ item, onMinus, onPlus, onRemove }: { item: CartItem; onMinus: () => void; onPlus: () => void; onRemove: () => void }) {
	const reduce = useReducedMotion();
	return (
		<motion.div layout initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, x: -40, height: 0, marginBottom: 0 }} transition={SPRING} className="mb-2 flex items-center gap-3 rounded-[20px] bg-white p-2.5 shadow-[0_4px_14px_rgba(15,35,71,0.05)]">
			<div className="h-[58px] w-[58px] shrink-0 overflow-hidden rounded-2xl bg-muted">{item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : null}</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-[15px] font-bold leading-tight">{item.name}</p>
				<p className="text-[12.5px] text-muted-foreground">{item.variant ? `${item.variant} · ` : ""}{currency(item.price)}</p>
				<div className="mt-1.5 flex w-fit items-center rounded-full bg-primary/10 text-primary">
					<motion.button type="button" aria-label={item.quantity <= 1 ? `Hapus ${item.name}` : `Kurangi jumlah ${item.name}`} whileTap={reduce ? undefined : { scale: 0.8 }} transition={SPRING} onClick={() => { tap(); item.quantity <= 1 ? onRemove() : onMinus(); }} className="flex h-8 w-9 items-center justify-center">{item.quantity <= 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-4 w-4" strokeWidth={2.8} />}</motion.button>
					<span className="relative flex h-8 min-w-6 items-center justify-center overflow-hidden text-sm font-bold tabular-nums" aria-live="polite">
						<AnimatePresence initial={false} mode="popLayout"><motion.span key={item.quantity} initial={reduce ? false : { y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? undefined : { y: -12, opacity: 0 }} transition={SPRING}>{item.quantity}</motion.span></AnimatePresence>
					</span>
					<motion.button type="button" aria-label={`Tambah jumlah ${item.name}`} whileTap={reduce ? undefined : { scale: 0.8 }} transition={SPRING} onClick={() => { tap(); onPlus(); }} className="flex h-8 w-9 items-center justify-center"><Plus className="h-4 w-4" strokeWidth={2.8} /></motion.button>
				</div>
			</div>
			<p className="shrink-0 text-[15px] font-bold tabular-nums"><AnimatedMoney value={item.price * item.quantity} /></p>
		</motion.div>
	);
}

const PAYMENT_ICON: Record<string, "payment-wallet" | "order-receipt" | "cashier-terminal"> = { wallet: "payment-wallet", mayar: "order-receipt", cashier: "cashier-terminal" };

function PaymentCard({ option, selected, insufficient, balance, total, onSelect, onTopup }: { option: { key: PaymentChoice; label: string; description: string }; selected: boolean; insufficient: boolean; balance: number; total: number; onSelect: () => void; onTopup: () => void }) {
	const reduce = useReducedMotion();
	const on = selected && !insufficient;
	return (
		<motion.div layout animate={{ scale: on ? 1.01 : 1 }} transition={SPRING} className={cn("overflow-hidden rounded-[22px] transition-colors", on ? "bg-[#f4f9ff] shadow-[inset_0_0_0_2px_var(--primary)]" : insufficient ? "bg-amber-50 shadow-[inset_0_0_0_1px_rgba(245,165,36,0.5)]" : "bg-white shadow-[inset_0_0_0_1px_rgba(60,60,67,0.16)]")}>
			<motion.button type="button" role="radio" aria-checked={on} aria-disabled={insufficient} disabled={insufficient} onClick={() => { tap(); onSelect(); }} whileTap={reduce || insufficient ? undefined : { scale: 0.985 }} className={cn("flex w-full items-start gap-3 p-3.5 text-left", insufficient ? "cursor-not-allowed opacity-80" : "cursor-pointer")}>
				<Djiwa3DIcon name={PAYMENT_ICON[option.key] ?? "order-receipt"} size="sm" alt="" className="h-11 w-11 object-contain" />
				<span className="min-w-0 flex-1">
					<span className="block text-base font-bold">{option.label}</span>
					<span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{insufficient ? `Saldo tersedia ${currency(balance)}, masih kurang ${currency(total - balance)}.` : option.description}</span>
				</span>
				<span aria-hidden="true" className={cn("mt-1 h-[22px] w-[22px] shrink-0 rounded-full transition-all", on ? "shadow-[inset_0_0_0_7px_var(--primary)]" : "shadow-[inset_0_0_0_2px_#c4c7d0]")} />
			</motion.button>
			{insufficient ? (
				<div className="flex items-center justify-between gap-2 border-t border-amber-200/80 px-3.5 py-2.5">
					<p className="text-xs font-semibold leading-relaxed text-amber-800">Isi saldo Djiwa Pay dulu sebelum menggunakan metode ini.</p>
					<button type="button" onClick={onTopup} className="shrink-0 rounded-full bg-amber-600 px-3.5 py-2 text-xs font-bold text-white">Top up</button>
				</div>
			) : null}
		</motion.div>
	);
}

function CheckoutView(props: CheckoutSectionProps) {
	const reduce = useReducedMotion();
	const isPaymentOnly = props.mode === "payment";
	const isReview = props.mode === "review";
	const totalItems = props.cart.reduce((sum, item) => sum + item.quantity, 0);

	if (!props.cart.length) {
		return (
			<StepScreen label="Keranjang kosong">
				<Rise className="my-auto text-center">
					<motion.div animate={reduce ? undefined : { y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="flex justify-center"><Djiwa3DIcon name="shopping-cart-order" size="lg" alt="" className="h-28 w-28 object-contain drop-shadow-[0_18px_18px_rgba(15,35,71,0.2)]" /></motion.div>
					<h2 className="mt-2 font-display text-[22px] font-extrabold">Keranjang masih kosong</h2>
					<p className="mt-1 text-[15px] text-muted-foreground">Tambahkan menu terlebih dahulu untuk melanjutkan checkout.</p>
					<div className="mt-5"><PrimaryButton onClick={props.onBackToMenu}>Kembali ke menu</PrimaryButton></div>
				</Rise>
			</StepScreen>
		);
	}

	const mayarGuest = props.paymentChoice === "mayar" && !props.isAuthenticated;
	const actionDisabled = isReview ? !props.onContinueToPayment || props.canPay === false : props.isSubmitting || props.canPay === false;

	return (
		<CheckoutPage className="contents">
		<StepScreen label={isReview ? "Review pesanan" : "Pembayaran"} className="pb-0">
			<CheckoutHeader className="sr-only" step={isReview ? 4 : 5} totalSteps={5} eyebrow={isReview ? "Review pesanan" : "Pembayaran"} title={isReview ? "Periksa dan edit pesanan" : "Pilih metode pembayaran"} />
			<StepTitle center={false} title={isReview ? "Review pesanan" : "Pilih pembayaran"} lead={isReview ? `${totalItems} item · periksa dan ubah bila perlu` : "Pilih cara bayar yang paling mudah untukmu."} />

			{isReview ? (
				<Rise className="mt-4">
					<div role="list" aria-label="Detail pesanan">
						<AnimatePresence initial={false}>
							{props.cart.map((item) => (
								<ReviewRow key={`${item.productId}-${item.variant || "default"}`} item={item} onMinus={() => props.updateCartQuantity(item.productId, item.variant, -1)} onPlus={() => props.updateCartQuantity(item.productId, item.variant, 1)} onRemove={() => props.onRemoveItem(item.productId, item.variant)} />
							))}
						</AnimatePresence>
					</div>
					<motion.button type="button" onClick={props.onEditMenu} whileTap={reduce ? undefined : { scale: 0.97 }} transition={SPRING} className="mb-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-primary shadow-[inset_0_0_0_1.5px_rgba(10,103,189,0.28)]"><Plus className="h-4 w-4" strokeWidth={3} />Tambah menu lagi</motion.button>
				</Rise>
			) : null}

			{!isPaymentOnly ? (
				<Rise className="space-y-3">
					<Field label="Nama customer"><input aria-label="Nama customer" className={fieldClass} value={props.customerName} onChange={(event) => props.setCustomerName(event.target.value)} placeholder="Nama untuk pesanan" /></Field>
					<Field label="Ciri khusus customer" optional><input aria-label="Ciri khusus customer" maxLength={160} className={fieldClass} value={props.customerDescription} onChange={(event) => props.setCustomerDescription(event.target.value)} placeholder="Contoh: kaos hitam, dekat jendela" /></Field>
					{props.isDelivery ? null : <Field label="Nomor meja"><input aria-label="Nomor meja" inputMode="numeric" className={fieldClass} value={props.tableNumber} onChange={(event) => props.setTableNumber(event.target.value.replace(/[^0-9]/g, "").slice(0, 8))} placeholder="Contoh: 4" /></Field>}
					<AnimatePresence initial={false}>
						{mayarGuest ? (
							<motion.div initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-[22px] bg-primary/5">
								<div className="space-y-3 p-4">
									<p className="text-sm font-bold text-primary">Data untuk pembayaran QRIS</p>
									<p className="text-xs leading-relaxed text-muted-foreground">Email dan nomor WhatsApp diperlukan untuk menyiapkan pembayaran QRIS.</p>
									<Field label="Email *"><input aria-label="Email untuk pembayaran QRIS" autoComplete="email" className={fieldClass} value={props.guestEmail} onChange={(event) => props.setGuestEmail(event.target.value)} placeholder="nama@email.com" /></Field>
									<Field label="Nomor WhatsApp *"><input aria-label="Nomor WhatsApp untuk pembayaran QRIS" autoComplete="tel" className={fieldClass} value={props.guestPhone} onChange={(event) => props.setGuestPhone(event.target.value)} placeholder="08xxxxxxxxxx" /></Field>
								</div>
							</motion.div>
						) : null}
					</AnimatePresence>
					<Field label="Catatan order"><textarea aria-label="Catatan order" rows={3} className={cn(fieldClass, "resize-none")} value={props.notes} onChange={(event) => props.setNotes(event.target.value)} placeholder="Contoh: tanpa pedas, es dipisah" /></Field>
					{props.config.enableDessertLater && props.hasDessertInCart ? (
						<div className="flex items-center justify-between gap-3 rounded-[20px] bg-white p-3.5 shadow-[inset_0_0_0_1px_rgba(60,60,67,0.16)]">
							<div><p className="text-sm font-bold">Bawakan dessert nanti</p><p className="text-xs text-muted-foreground">Bisa dipanggil saat sudah siap.</p></div>
							<button type="button" role="switch" aria-checked={props.dessertLater} aria-label="Bawakan dessert nanti" onClick={() => { tap(); props.setDessertLater((value: boolean) => !value); }} className={cn("relative h-8 w-14 shrink-0 rounded-full transition-colors", props.dessertLater ? "bg-primary" : "bg-black/15")}>
								<motion.span layout transition={SPRING} className={cn("absolute top-1 h-6 w-6 rounded-full bg-white shadow", props.dessertLater ? "right-1" : "left-1")} />
							</button>
						</div>
					) : null}
				</Rise>
			) : null}

			{!isReview ? (
				<Rise className="mt-1">
					<div className="space-y-2.5" role="radiogroup" aria-label="Metode pembayaran">
						{props.paymentOptions.map((option) => (
							<PaymentMethodCard key={option.key}><PaymentCard option={option} selected={props.paymentChoice === option.key} insufficient={option.key === "wallet" && props.walletBalance < props.total} balance={props.walletBalance} total={props.total} onSelect={() => props.setPaymentChoice(option.key)} onTopup={props.onTopup} /></PaymentMethodCard>
						))}
					</div>
				</Rise>
			) : null}

			<AnimatePresence initial={false}>
				{props.checkoutError ? <motion.div key="err" initial={reduce ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold leading-relaxed text-red-800">{props.checkoutError}</motion.div> : null}
			</AnimatePresence>

			<Rise className="mt-4">
				<div className="rounded-[24px] bg-white p-4 shadow-[0_10px_30px_rgba(15,35,71,0.07)]">
					<SummaryCardLines productGrossSubtotal={props.productGrossSubtotal} freeRefillCharge={props.freeRefillCharge} shippingFee={props.shippingFee} promoDiscount={props.promoDiscount} djiwaPayDiscount={props.djiwaPayDiscount} djiwaPayDiscountRate={props.djiwaPayDiscountRate} paymentChoice={props.paymentChoice === "cashier" ? "cashier" : props.paymentChoice} serviceChargeAmount={props.serviceChargeAmount} serviceChargeRate={props.serviceChargeRate} taxEnabled={props.taxEnabled} taxAmount={props.taxAmount} taxRate={props.taxRate} total={props.total} />
					{props.shippingQuotePending ? <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs font-semibold text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" />Memuat tarif pengantaran…</p> : null}
					{props.shippingQuoteError ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold leading-relaxed text-red-800">{props.shippingQuoteError}</p> : null}
					<p className={cn("mt-3 rounded-xl px-3 py-2 text-xs font-semibold leading-relaxed", props.paymentChoice === "wallet" ? "bg-emerald-50 text-emerald-800" : "bg-muted/60 text-muted-foreground")}>{props.paymentChoice === "wallet" ? "Bayar dengan Djiwa Pay dan dapatkan saldo Djiwa Pay +Rp1.000 setelah transaksi berhasil." : "Reward +Rp1.000 saldo Djiwa Pay diberikan setelah transaksi berhasil."}</p>
				</div>
			</Rise>

			<div className="sticky bottom-0 z-20 -mx-5 mt-4 bg-gradient-to-t from-[#f2f2f7] via-[#f2f2f7]/95 to-[#f2f2f7]/0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
				<div className="mb-2 flex items-center justify-between px-1 text-[13px] text-muted-foreground"><span>Total bayar</span><b className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-foreground"><AnimatedMoney value={props.total} /></b></div>
				<PrimaryButton arrow={!props.isSubmitting} disabled={actionDisabled} onClick={() => { if (isReview) props.onContinueToPayment?.(); else void props.checkout(); }}>
					{props.isSubmitting ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Memproses...</span> : isReview ? "Lanjut ke pembayaran" : <>Bayar {props.currency(props.total)}</>}
				</PrimaryButton>
				<div className="mt-2"><GhostButton onClick={props.onBackToMenu}>{isReview ? "Kembali ke menu" : "Kembali"}</GhostButton></div>
			</div>
		</StepScreen>
		</CheckoutPage>
	);
}

export function renderCheckoutSection(props: CheckoutSectionProps) {
	return <CheckoutView {...props} />;
}
