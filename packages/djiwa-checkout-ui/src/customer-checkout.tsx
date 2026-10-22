import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import {
	CheckoutActionBar,
	CheckoutHeader,
	CheckoutPage,
	CheckoutSection,
	OrderSummary,
	PaymentMethodCard,
	PaymentNotice,
} from "./components";

/* ------------------------------------------------------------------ *
 * Djiwa Checkout Standard v2 - canonical customer checkout flow.
 *
 * ONE implementation for every customer-facing commerce app. Apps supply
 * data and app-specific field slots only; they never re-implement layout.
 *
 * Built on the existing shared primitives (CheckoutPage / CheckoutSection /
 * CheckoutHeader / PaymentMethodCard / OrderSummary / CheckoutActionBar /
 * PaymentNotice) so there is a single class system, and authored
 * Tailwind-free so it also renders in apps that do not ship Tailwind
 * (e.g. apps/djiwapay).
 * ------------------------------------------------------------------ */

export type CheckoutCartItem = {
	productId: string;
	variant?: string;
	name: string;
	image?: string | null;
	price: number;
	quantity: number;
};

export type CheckoutPaymentOption = { key: string; label: string; description: string };

export type CustomerCheckoutProps = {
	/** `review` = edit order, `payment` = pay only, `checkout` = both. */
	mode?: "checkout" | "review" | "payment";
	step: number;
	totalSteps: number;
	eyebrow: string;
	title: string;
	description?: string;
	headerIcon?: ReactNode;

	cart: readonly CheckoutCartItem[];
	currency: (value: number) => string;
	emptyState?: { title?: string; description?: string; actionLabel?: string };

	editMenu?: { label: string; onClick: () => void };
	updateQuantity?: (productId: string, variant: string | undefined, delta: number) => void;
	removeItem?: (productId: string, variant: string | undefined) => void;

	/** `false` hides the order-detail block (payment-only step). */
	showOrderDetail?: boolean;
	orderDetailExtra?: ReactNode;
	/** App-owned fields: table number, shipping address, customer name, ... */
	fields?: ReactNode;

	notesLabel: string;
	notesPlaceholder: string;
	notes: string;
	setNotes: (value: string) => void;
  /** `false` removes the notes field for non-order services such as wallet top-up. */
  showNotes?: boolean;
	notesExtra?: ReactNode;

	/** `false` hides the payment block (review-only step). */
	showPayment?: boolean;
	paymentHeading: string;
	paymentOptions: readonly CheckoutPaymentOption[];
	paymentChoice: string;
	setPaymentChoice: (key: never) => void;
	walletBalance: number;
	/** When set, the wallet option is disabled and shows the shortage. */
	walletShortage?: string | null;
	topupLabel?: string;
	onTopup?: () => void;
	/** Rendered inside the payment section (e.g. QRIS guest data). */
	paymentExtra?: ReactNode;
	/** Replaces the payment section entirely (e.g. login required). */
	paymentGate?: ReactNode;
	/** `false` hides the Djiwa Pay reward notice. */
	showReward?: boolean;
	rewardTitle?: string;
	rewardDescription?: string;

	/** Shared summary lines element (see CheckoutSummaryLines). */
	summary: ReactNode;
	notices?: ReactNode;
	error?: string | null;

	onBack?: () => void;
	backLabel?: string;
	primaryLabel: string;
	onPrimary: () => void;
	primaryDisabled?: boolean;
	busy?: boolean;
	busyLabel?: string;
};

export function CustomerCheckout(props: CustomerCheckoutProps) {
	const { cart, currency } = props;
	const isReview = props.mode === "review";
	const isPaymentOnly = props.mode === "payment";
	const showOrderDetail = props.showOrderDetail ?? !isPaymentOnly;
	const showPayment = props.showPayment ?? !isReview;
	const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

	if (!cart.length) {
		return (
			<CheckoutPage className="djiwa-checkout-page">
				<div className="djiwa-checkout-empty">
					<span className="djiwa-checkout-empty-icon" aria-hidden="true">🛒</span>
					<h2>{props.emptyState?.title ?? "Keranjang masih kosong"}</h2>
					<p>{props.emptyState?.description ?? "Tambahkan item terlebih dahulu untuk melanjutkan checkout."}</p>
					{props.onBack ? (
						<button type="button" className="djiwa-checkout-empty-action" onClick={props.onBack}>
							{props.emptyState?.actionLabel ?? "Kembali ke menu"}
						</button>
					) : null}
				</div>
			</CheckoutPage>
		);
	}

	return (
		<CheckoutPage className="djiwa-checkout-page">
			<CheckoutSection className="djiwa-checkout-card">
				<CheckoutHeader
					step={props.step}
					totalSteps={props.totalSteps}
					eyebrow={props.eyebrow}
					title={props.title}
					description={props.description}
				/>

				{props.headerIcon || props.editMenu ? (
					<div className="djiwa-checkout-head-row">
						{props.headerIcon ? <span className="djiwa-checkout-head-icon" aria-hidden="true">{props.headerIcon}</span> : null}
						{props.editMenu ? (
							<button type="button" className="djiwa-checkout-edit" onClick={props.editMenu.onClick}>
								{props.editMenu.label}
							</button>
						) : null}
					</div>
				) : null}

				{showOrderDetail ? (
					<div className="djiwa-checkout-detail" aria-label="Detail pesanan">
						<div className="djiwa-checkout-detail-head">
							<p>Detail pesanan</p>
							<span>{itemCount} item</span>
						</div>
						<ul className="djiwa-checkout-items">
							{cart.map((item) => (
								<li key={`${item.productId}-${item.variant || "default"}`} className="djiwa-checkout-item">
									<span className="djiwa-checkout-item-image">
										{item.image ? <img src={item.image} alt="" /> : null}
									</span>
									<span className="djiwa-checkout-item-copy">
										<strong>{item.name}</strong>
										<small>
											{item.variant ? `${item.variant} · ` : ""}
											{item.quantity} × {currency(item.price)}
										</small>
										{isReview && props.updateQuantity ? (
											<span className="djiwa-checkout-qty">
												<button type="button" aria-label={`Kurangi jumlah ${item.name}`} onClick={() => props.updateQuantity?.(item.productId, item.variant, -1)}>−</button>
												<span>{item.quantity}</span>
												<button type="button" aria-label={`Tambah jumlah ${item.name}`} onClick={() => props.updateQuantity?.(item.productId, item.variant, 1)}>+</button>
											</span>
										) : null}
									</span>
									<span className="djiwa-checkout-item-price">{currency(item.price * item.quantity)}</span>
									{isReview && props.removeItem ? (
										<button type="button" className="djiwa-checkout-item-remove" aria-label={`Hapus ${item.name}`} onClick={() => props.removeItem?.(item.productId, item.variant)}>×</button>
									) : null}
								</li>
							))}
						</ul>
						{props.orderDetailExtra}
					</div>
				) : null}

				{props.fields}

				{props.showNotes === false ? null : (
					<div className="djiwa-checkout-field">
						<label className="djiwa-checkout-label" htmlFor="djiwa-checkout-notes">{props.notesLabel}</label>
						<textarea
							id="djiwa-checkout-notes"
							className="djiwa-checkout-textarea"
							placeholder={props.notesPlaceholder}
							value={props.notes}
							onChange={(event) => props.setNotes(event.currentTarget.value)}
						/>
					</div>
				)}
				{props.notesExtra}
			</CheckoutSection>

			{showPayment
				? props.paymentGate ?? (
					<CheckoutSection className="djiwa-checkout-card">
						<div className="djiwa-checkout-section-heading">
							<span className="ppob-payment-icon" aria-hidden="true">💳</span>
							<div>
								<strong>{props.paymentHeading}</strong>
								<small>Pilih satu metode untuk menyelesaikan pembayaran.</small>
							</div>
						</div>
						<div className="djiwa-payment-methods" role="radiogroup" aria-label="Metode pembayaran">
							{props.paymentOptions.map((option) => {
								const disabled = option.key === "wallet" && Boolean(props.walletShortage);
								return (
									<div className="djiwa-payment-option-wrap" key={option.key}>
										<PaymentMethodCard
											icon={option.key === "wallet" ? <span aria-hidden="true">👛</span> : <span aria-hidden="true">🔳</span>}
											label={option.label}
											description={option.description}
											disabledDescription={disabled && props.walletShortage ? props.walletShortage : undefined}
											selected={props.paymentChoice === option.key && !disabled}
											disabled={disabled}
											onSelect={() => props.setPaymentChoice(option.key as never)}
										/>
										{disabled ? (
											<div className="djiwa-payment-topup">
												<p>Isi saldo Djiwa Pay dulu sebelum memakai metode ini.</p>
												<button type="button" onClick={props.onTopup}>{props.topupLabel ?? "Top up"}</button>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
						{props.paymentExtra}
					</CheckoutSection>
				)
				: null}

			{props.showReward === false ? null : (
				<PaymentNotice title={props.rewardTitle ?? "Djiwa Pay +Rp1.000"} tone="success">
					{props.rewardDescription ?? "Dapatkan saldo Djiwa Pay senilai Rp1.000 setiap transaksi memakai Djiwa Pay hari ini."}
				</PaymentNotice>
			)}

			{props.error ? <p role="alert" className="djiwa-checkout-alert">{props.error}</p> : null}

			<OrderSummary className="djiwa-checkout-card djiwa-checkout-summary-card">
				{props.summary}
				{props.notices}
				<CheckoutActionBar
					className="djiwa-checkout-actions"
					onBack={props.onBack}
					backLabel={props.backLabel ?? "Kembali"}
					primaryLabel={props.primaryLabel}
					onPrimary={props.onPrimary}
					primaryDisabled={props.primaryDisabled}
					busy={props.busy}
					busyLabel={props.busyLabel}
				/>
			</OrderSummary>
		</CheckoutPage>
	);
}

/* --------------------------- field primitives --------------------------- */

export function CheckoutField({ label, hint, required = false, htmlFor, children }: { label: string; hint?: string; required?: boolean; htmlFor?: string; children: ReactNode }) {
	return (
		<div className="djiwa-checkout-field">
			<label className="djiwa-checkout-label" htmlFor={htmlFor}>
				{label}
				{required ? <span className="djiwa-checkout-required" aria-hidden="true">*</span> : null}
			</label>
			{children}
			{hint ? <small className="djiwa-checkout-hint">{hint}</small> : null}
		</div>
	);
}

export function CheckoutInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
	return <input {...rest} className={`djiwa-checkout-input ${className}`.trim()} />;
}

export function CheckoutTextarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea {...rest} className={`djiwa-checkout-textarea ${className}`.trim()} />;
}

export function CheckoutSwitch({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (next: boolean) => void }) {
	return (
		<div className="djiwa-checkout-switch">
			<span className="djiwa-checkout-switch-copy">
				<strong>{label}</strong>
				{description ? <small>{description}</small> : null}
			</span>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-label={label}
				className={`djiwa-switch${checked ? " is-on" : ""}`}
				onClick={() => onChange(!checked)}
			>
				<span className="djiwa-switch-knob" />
			</button>
		</div>
	);
}

/* ------------------------------ summary ------------------------------ */

function SummaryLine({ label, value, tone = "" }: { label: string; value: ReactNode; tone?: string }) {
	return (
		<div className={`djiwa-order-summary-row${tone ? ` ${tone}` : ""}`}>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

export type CheckoutSummaryLinesProps = {
	currency: (value: number) => string;
	productGrossSubtotal: number;
	freeRefillCharge?: number;
	promoDiscount?: number;
	djiwaPayDiscount?: number;
	/** Live Djiwa Pay rate (campaign 50 / site setting). Never hardcode. */
	djiwaPayDiscountRate?: number;
	shippingFee?: number;
	/** Label for shippingFee; food apps say "Biaya pengantaran". */
	shippingLabel?: string;
	serviceChargeAmount: number;
	serviceChargeRate: number;
	taxEnabled?: boolean;
	taxAmount?: number;
	taxRate?: number;
	total: number;
	paymentChoice?: string;
};

/**
 * Shared fee/total lines for every customer app. Figures come from the caller;
 * the breakdown, ordering, labels and rounding row stay identical everywhere.
 * Labels mirror `apps/customer` (the reference storefront) exactly.
 */
export function CheckoutSummaryLines({
	currency,
	productGrossSubtotal,
	freeRefillCharge = 0,
	promoDiscount = 0,
	djiwaPayDiscount = 0,
	djiwaPayDiscountRate,
	shippingFee = 0,
	shippingLabel = "Biaya pengantaran",
	serviceChargeAmount,
	serviceChargeRate,
	taxEnabled = false,
	taxAmount = 0,
	taxRate = 0,
	total,
	paymentChoice,
}: CheckoutSummaryLinesProps) {
	const taxBase = Math.max(0, productGrossSubtotal + freeRefillCharge - promoDiscount - djiwaPayDiscount);
	const rawTotal = taxBase + shippingFee + serviceChargeAmount + taxAmount;
	const roundingAdjustment = total - rawTotal;
	const isCashierFree = paymentChoice === "cashier";
	const payDiscountLabel = djiwaPayDiscountRate ? `Djiwa Pay ${djiwaPayDiscountRate}%` : "Diskon Djiwa Pay";

	return (
		<div className="djiwa-order-summary-rows djiwa-summary-rows">
			<SummaryLine label="Subtotal produk" value={currency(productGrossSubtotal)} />
			{freeRefillCharge > 0 ? <SummaryLine label="Free refill minuman" value={currency(freeRefillCharge)} /> : null}
			{promoDiscount > 0 ? <SummaryLine label="Promo / diskon" value={`-${currency(promoDiscount)}`} tone="is-promo" /> : null}
			{djiwaPayDiscount > 0 ? <SummaryLine label={payDiscountLabel} value={`-${currency(djiwaPayDiscount)}`} tone="is-reward" /> : null}
			{shippingFee > 0 ? <SummaryLine label={shippingLabel} value={currency(shippingFee)} /> : null}
			<SummaryLine label={`Service Charge (${serviceChargeRate}%)`} value={isCashierFree ? "Gratis / Rp0" : currency(serviceChargeAmount)} />
			{taxEnabled ? <SummaryLine label={`PBJT/Pajak Restoran (${taxRate}%)`} value={isCashierFree ? "Gratis / Rp0" : currency(taxAmount)} /> : null}
			{taxEnabled ? <SummaryLine label="Dasar pajak" value={currency(taxBase)} /> : null}
			<p className="djiwa-summary-note">
				{taxEnabled
					? (isCashierFree
						? "Pembayaran tunai di kasir: PBJT dan service charge Rp0 sesuai kebijakan operasional."
						: `PBJT makanan dan minuman Kota Tasikmalaya ${taxRate}%. Service charge ditampilkan terpisah dan bukan pajak daerah.`)
					: "Harga menu sudah termasuk Pajak Barang dan Jasa Tertentu (PBJT) atas makanan dan/atau minuman sesuai ketentuan yang berlaku di Kota Tasikmalaya."}
			</p>
			{roundingAdjustment !== 0 ? (
				<SummaryLine
					label="Pembulatan"
					value={currency(roundingAdjustment)}
					tone={roundingAdjustment > 0 ? "is-adjust-up" : "is-adjust-down"}
				/>
			) : null}
			<div className="djiwa-order-summary-row is-total djiwa-summary-total-row">
				<span>Total</span>
				<strong>{currency(total)}</strong>
			</div>
		</div>
	);
}
