import { CheckCircle2, MapPin, Truck, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Doc } from "@/types/backend-compat";
import type { CartItem, ReceiptState } from "./types";
import { currency } from "./types";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";
import { BarcodeLines, ReceiptTotalsBreakdown } from "./shared-components";
import { ReceiptActions } from "./split-bill-sheet";
import { PaymentDocumentAnimation } from "./payment-document-animation";

// Status lifecycle order — live tracker di struk
const STATUS_STEPS = [
	{ key: "pending", label: "Diterima" },
	{ key: "preparing", label: "Diproses" },
	{ key: "ready", label: "Siap" },
	{ key: "served", label: "Disajikan" },
	{ key: "completed", label: "Selesai" },
] as const;

const DELIVERY_STEPS = [
	{ key: "confirmed", label: "Diterima" },
	{ key: "allocated", label: "Kurir ditemukan" },
	{ key: "picking_up", label: "Kurir menuju cafe" },
	{ key: "picked", label: "Pesanan diambil" },
	{ key: "dropping_off", label: "Menuju kamu" },
	{ key: "delivered", label: "Terkirim" },
] as const;

function getStatusStepIndex(status?: string) {
	const s = String(status ?? "").toLowerCase();
	const idx = STATUS_STEPS.findIndex((step) => step.key === s);
	if (idx === -1 && (s === "processing" || s === "paid")) return 1;
	return idx;
}

function getDeliveryStepIndex(status?: string) {
	const normalized = String(status ?? "").toLowerCase();
	if (normalized === "cancelled" || normalized === "canceled") return -1;
	const idx = DELIVERY_STEPS.findIndex((step) => step.key === normalized);
	return idx >= 0 ? idx : 0;
}

function getCourierLabel(provider?: string) {
	const normalized = String(provider ?? "").toLowerCase();
	if (normalized === "grab") return "Grab Instant";
	if (normalized === "gojek") return "Gojek Instant";
	return provider || "Kurir dipilih";
}

function getCreatedAtMs(value: unknown) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const parsed = Date.parse(String(value ?? ""));
	return Number.isFinite(parsed) ? parsed : Date.now();
}

function CashierPaymentTimer({ createdAt, onExpire }: { createdAt: unknown; onExpire: () => void }) {
	const expiredRef = useRef(false);
	const deadline = getCreatedAtMs(createdAt) + 5 * 60 * 1000;
	const [remainingMs, setRemainingMs] = useState(() => Math.max(0, deadline - Date.now()));

	useEffect(() => {
		const tick = () => {
			const next = Math.max(0, deadline - Date.now());
			setRemainingMs(next);
			if (next === 0 && !expiredRef.current) {
				expiredRef.current = true;
				onExpire();
			}
		};
		tick();
		const timer = window.setInterval(tick, 1000);
		return () => window.clearInterval(timer);
	}, [deadline, onExpire]);

	const totalSeconds = Math.ceil(remainingMs / 1000);
	const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
	const seconds = (totalSeconds % 60).toString().padStart(2, "0");
	return (
		<div className={cn("rounded-2xl border px-3 py-2.5 text-center", remainingMs > 0 ? "border-amber-200 bg-amber-50 text-amber-950" : "border-red-200 bg-red-50 text-red-950")} role="timer" aria-live="polite">
			<p className="text-[10px] font-black uppercase tracking-[0.14em]">Batas pembayaran ke kasir</p>
			<p className="mt-0.5 text-2xl font-black tabular-nums tracking-[0.12em]">{remainingMs > 0 ? `${minutes}:${seconds}` : "00:00"}</p>
			<p className="mt-0.5 text-[10px] leading-tight">{remainingMs > 0 ? "Bayar dalam 5 menit agar pesanan diproses Bar & Kitchen." : "Batas pembayaran telah lewat. Pesanan dibatalkan dan tidak diproses Bar & Kitchen."}</p>
		</div>
	);
}
export interface ReceiptSectionProps {
	cartSnapshot: CartItem[];
	currentOrder: Doc<"orders"> | undefined;
	dessertLater: boolean;
	logoUrl: string;
	onOpenService: () => void;
	onOrderAgain: () => void;
	onRetryPayment: () => Promise<void>;
	retryPaymentLabel: string;
	retryingPayment: boolean;
	onHome: () => void;
	onCashierPaymentExpired?: () => void;
	actionsHidden?: boolean;
	receipt: ReceiptState;
	storeName: string;
	total: number;
}

export function renderReceiptSection(props: ReceiptSectionProps) {
	const currentOrder = props.currentOrder as any;
	const orderReference = getDisplayOrderNumber(currentOrder?.orderNumber, {
		sequence: currentOrder?.dailyReceiptNo ?? currentOrder?.daily_receipt_no,
		createdAt: currentOrder?.createdAt,
		source: currentOrder?.source,
		sourceApp: currentOrder?.sourceApp,
		businessUnit: currentOrder?.businessUnit,
		orderType: currentOrder?.orderType,
		platform: currentOrder?.platform,
	}) || props.receipt.fallbackReference;
	const orderStatus = props.currentOrder?.status;
	const mode = orderStatus === "paid" || orderStatus === "completed" ? "paid" : props.receipt.mode;
	const isExpired = mode === "cashier_expired" || String(orderStatus ?? "").toLowerCase() === "cancelled" || String(orderStatus ?? "").toLowerCase() === "expired";
	// The refreshed order is authoritative; receipt state can still contain the
	// pre-settlement choice while the order read is catching up.
	const normalizedPaymentMethod = String(props.currentOrder?.paymentMethod ?? (props.currentOrder as any)?.payment_method ?? props.receipt.paymentChoice).toLowerCase();
	const isWalletPayment = normalizedPaymentMethod.includes("wallet") || normalizedPaymentMethod.includes("djiwa");
	const isCashierPayment = normalizedPaymentMethod === "cash" || normalizedPaymentMethod.includes("cashier") || normalizedPaymentMethod.includes("tunai");
	const isCashierTicket = isCashierPayment && mode === "cashier_pending";
	const cartSnapshotItems = (props.cartSnapshot ?? []).map((item: CartItem) => ({
		productId: item.productId,
		productName: item.name,
		quantity: item.quantity,
		price: item.price,
		variant: item.variant,
	}));
	const orderItems = props.currentOrder?.items ?? cartSnapshotItems;
	const exportItems = orderItems.map((item: any, index: number) => ({
		id: `${item.productId ?? item.productName ?? "item"}-${item.variant ?? "default"}-${index}`,
		name: String(item.productName ?? item.name ?? "Item"),
		quantity: Number(item.quantity ?? 0),
		unitPrice: Number(item.price ?? 0),
		variant: item.variant ? String(item.variant) : undefined,
	}));
	const customerName = props.currentOrder?.customerName || "-";
	const customerDescription = props.currentOrder?.customerDescription || "-";
	const tableNumber = props.currentOrder?.tableNumber || "-";
	const orderTypeValue = String(props.currentOrder?.orderType ?? (props.currentOrder as any)?.order_type ?? "").toLowerCase();
	const orderType = orderTypeValue === "delivery" ? "Delivery" : props.currentOrder?.orderType === "takeaway" ? "Takeaway" : "Dine In";
	const customerNotes = props.currentOrder?.notes || "-";
	const deliveryAddress = (props.currentOrder as any)?.deliveryAddress ?? (props.currentOrder as any)?.delivery_address;
	const deliveryTrackingId = (props.currentOrder as any)?.deliveryTrackingId ?? (props.currentOrder as any)?.delivery_tracking_id;
	const deliveryWaybillId = (props.currentOrder as any)?.deliveryWaybillId ?? (props.currentOrder as any)?.delivery_waybill_id;

	const unifiedStatusLabel = mode === "cashier_expired" ? "DIBATALKAN" : orderStatus === "paid" ? "LUNAS"
		: orderStatus === "completed" ? "SELESAI"
		: "OPEN BILL";
	const unifiedStatusColor = mode === "cashier_expired" ? "text-red-600" : orderStatus === "paid" ? "text-blue-600"
		: orderStatus === "completed" ? "text-emerald-600"
		: "text-amber-600";
	const isQrisPayment = normalizedPaymentMethod.includes("qris") || normalizedPaymentMethod.includes("mayar");
	const canRetryPayment = mode !== "paid" && (isWalletPayment || isQrisPayment || isCashierPayment);

	const isDeliveryOrder = orderTypeValue === "delivery";
	const deliveryStatus = (props.currentOrder as any)?.deliveryStatus ?? (props.currentOrder as any)?.delivery_status;
	const courierLabel = getCourierLabel((props.currentOrder as any)?.deliveryProvider ?? (props.currentOrder as any)?.delivery_provider);
	const deliveryStepIndex = getDeliveryStepIndex(deliveryStatus);
	const deliveryCancelled = String(deliveryStatus ?? "").toLowerCase() === "cancelled" || String(deliveryStatus ?? "").toLowerCase() === "canceled";
	const currentStepIndex = isExpired || (isDeliveryOrder && deliveryCancelled) ? -1 : isDeliveryOrder ? deliveryStepIndex : getStatusStepIndex(orderStatus);
	const currentStepLabel = currentStepIndex >= 0 ? (isDeliveryOrder ? DELIVERY_STEPS[currentStepIndex].label : STATUS_STEPS[currentStepIndex].label) : null;
	const paymentLabel = isWalletPayment ? "Djiwa Pay" : isQrisPayment ? "QRIS" : "Bayar di Kasir";
	const printerStatusLabel = isCashierTicket ? "Menunggu pembayaran" : mode === "paid" ? "Pembayaran berhasil" : mode === "cashier_expired" ? "Tiket kedaluwarsa" : isQrisPayment ? "Invoice siap dibayar" : "Menyiapkan pembayaran";
	const receiptTitle = mode === "paid" ? "Struk lunas" : mode === "cashier_expired" ? "Tiket kedaluwarsa" : isCashierTicket ? "Tunjukkan ke kasir" : isQrisPayment ? "Lanjutkan pembayaran QRIS" : "Pembayaran Djiwa Pay";
	const receiptDescription = mode === "cashier_pending" ? "Silakan tunjukkan layar ini ke kasir untuk menyelesaikan pembayaran sebelum waktu habis." : mode === "cashier_expired" ? "Batas 5 menit pembayaran telah lewat. Pesanan dibatalkan dan tidak diproses Bar & Kitchen. Silakan pesan ulang." : mode === "mayar_pending" ? "Invoice QRIS sudah dibuat. Status struk akan berubah otomatis setelah dibayar." : mode === "paid" ? "Pembayaran sudah diterima. Pesanan akan diproses restoran." : isWalletPayment ? "Pembayaran Djiwa Pay sedang diproses. Kamu tidak perlu menunjukkan layar ini ke kasir." : "Menyiapkan pembayaran.";
	// Do not reconstruct historical totals from item prices. Show this breakdown
	// only when the backend stored the authoritative tax calculation.
	const persistedTaxBase = Number(props.currentOrder?.taxBaseAmount ?? props.currentOrder?.tax_base_amount);
	const persistedRawTotal = Number(props.currentOrder?.rawTotalAmount ?? props.currentOrder?.raw_total_amount);
	const persistedRounding = Number(props.currentOrder?.roundingAdjustment ?? props.currentOrder?.rounding_adjustment);
	const persistedTotal = Number(props.currentOrder?.totalAmount ?? props.currentOrder?.total_amount);
	const persistedShippingFee = Number(props.currentOrder?.shippingFeeAmount ?? (props.currentOrder as any)?.shipping_fee_amount ?? 0);
	const hasPersistedTotals = [persistedTaxBase, persistedRawTotal, persistedRounding, persistedTotal].every(Number.isFinite);

	return (
		<div className="space-y-2 px-2 py-2 pb-[calc(11rem+env(safe-area-inset-bottom))]">
			{currentStepLabel ? (
				<div className="mx-auto w-full max-w-sm px-3 py-3">
					<div className="flex items-center justify-between gap-2">
						<p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{isDeliveryOrder ? "Progress pengantaran" : "Status pesanan"}</p>
						<p className={cn("text-right text-xs font-black", unifiedStatusColor)}>{currentStepLabel}</p>
					</div>
					{isDeliveryOrder ? <div className="mt-2 flex items-center gap-2 border-t border-border pt-2"><Truck className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Kurir</p><p className="truncate text-xs font-black text-foreground">{courierLabel}</p></div></div> : null}
					<div className="mt-3 flex items-center">
						{(isDeliveryOrder ? DELIVERY_STEPS : STATUS_STEPS).map((step, index) => {
							const reached = index <= currentStepIndex;
							const active = index === currentStepIndex;
							const steps = isDeliveryOrder ? DELIVERY_STEPS : STATUS_STEPS;
							const isLast = index === steps.length - 1;
							return (
								<div key={step.key} className="flex flex-1 flex-col items-center">
									<div className="flex w-full items-center">
										<div className={cn("h-0.5 flex-1 transition-colors duration-700", index === 0 ? "opacity-0" : reached ? "bg-primary" : "bg-muted")} />
										<div className={cn("relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black transition-all duration-700", active && "animate-pulse ring-4 ring-primary/15", reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground/60")}>
											{reached ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
										</div>
										<div className={cn("h-0.5 flex-1 transition-colors duration-700", isLast ? "opacity-0" : reached ? "bg-primary" : "bg-muted")} />
									</div>
									<p className={cn("mt-1.5 text-center text-[9px] font-bold leading-tight", active && "animate-pulse", reached ? "text-foreground" : "text-muted-foreground/60")}>{step.label}</p>
								</div>
							);
						})}
					</div>
				</div>
			) : null}
			{isCashierTicket ? <CashierPaymentTimer createdAt={props.currentOrder?.createdAt} onExpire={() => props.onCashierPaymentExpired?.()} /> : props.receipt.mode === "cashier_expired" ? <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-center text-red-950"><p className="text-[10px] font-black uppercase tracking-[0.14em]">Pembayaran kedaluwarsa</p><p className="mt-0.5 text-[10px] leading-tight">Order dibatalkan karena tidak dibayar dalam 5 menit. Silakan gunakan Pesan lagi.</p></div> : null}
			<PaymentDocumentAnimation
				isCashierTicket={isCashierTicket || mode === "cashier_expired"}
				orderReference={orderReference}
				total={props.currentOrder?.totalAmount ?? props.total}
				paymentLabel={paymentLabel}
				statusLabel={printerStatusLabel}
			>
				<div className="text-center">
				<div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">{mode === "paid" ? <CheckCircle2 className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}</div>
				<p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary/70">{isExpired ? "Order dibatalkan" : "Langkah 6 dari 6 · Selesai / Struk"}</p>
				<h2 className="mt-1 font-display text-lg font-black tracking-tight">{receiptTitle}</h2>
				<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{receiptDescription}</p>
				<div className="mt-3 border-t border-border pt-3">{props.logoUrl ? <img alt={props.storeName} className="mx-auto h-10 object-contain" src={props.logoUrl} /> : null}<div className="mt-2.5 space-y-0.5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Nomor order</p><p className="text-xl font-black tracking-[0.12em] text-foreground">{orderReference}</p></div><div className="mt-3 border-t border-border pt-3"><div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Metode</span><span className="font-bold">{paymentLabel}</span></div><div className="mt-1 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Status</span><span className={cn("font-bold", unifiedStatusColor)}>{unifiedStatusLabel}</span></div><div className="mt-1 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Total</span><span className="font-black">{currency(props.currentOrder?.totalAmount ?? props.total)}</span></div></div>
					{isDeliveryOrder && persistedShippingFee > 0 ? <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[11px]"><span className="text-muted-foreground">Ongkir {courierLabel}</span><span className="font-black text-primary">{currency(persistedShippingFee)}</span></div> : null}
					{hasPersistedTotals ? <ReceiptTotalsBreakdown rawTotal={persistedRawTotal} taxBase={persistedTaxBase} taxAmount={Number(props.currentOrder?.taxAmount ?? 0)} taxRate={Number((props.currentOrder?.receiptMeta as any)?.taxRateSnapshot ?? 0)} taxEnabled={Number(props.currentOrder?.taxAmount ?? 0) > 0 || Number((props.currentOrder?.receiptMeta as any)?.taxRateSnapshot ?? 0) > 0} serviceChargeAmount={Number(props.currentOrder?.serviceChargeAmount ?? 0)} roundingAdjustment={persistedRounding} total={persistedTotal} /> : null}
					<div className="mt-3 border-t border-border pt-3 text-left">
						<p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Data customer</p>
						<div className="mt-1.5 space-y-1">
							<div className="flex items-center justify-between gap-2 text-[11px]">
								<span className="text-muted-foreground">Nama</span>
								<span className="font-semibold text-foreground">{customerName}</span>
							</div>
							<div className="flex items-start justify-between gap-2 text-[11px]">
								<span className="text-muted-foreground">Ciri</span>
								<span className="max-w-[70%] text-right font-semibold text-foreground">{customerDescription}</span>
							</div>
							{isDeliveryOrder ? <>
								<div className="flex items-start justify-between gap-2 text-[11px]"><span className="text-muted-foreground">Kurir</span><span className="text-right font-semibold text-foreground">{courierLabel}</span></div>
								<div className="flex items-start justify-between gap-2 text-[11px]"><span className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3" />Alamat</span><span className="max-w-[70%] text-right font-semibold text-foreground">{deliveryAddress || "-"}</span></div>
								{deliveryTrackingId || deliveryWaybillId ? <div className="flex items-start justify-between gap-2 text-[11px]"><span className="text-muted-foreground">Tracking</span><span className="max-w-[70%] text-right font-semibold text-foreground">{deliveryTrackingId || deliveryWaybillId}</span></div> : null}
							</> : <div className="flex items-center justify-between gap-2 text-[11px]"><span className="text-muted-foreground">Meja</span><span className="font-semibold text-foreground">{tableNumber}</span></div>}
							<div className="flex items-center justify-between gap-2 text-[11px]"><span className="text-muted-foreground">Tipe</span><span className="font-semibold text-foreground">{orderType}</span></div>
							<div className="flex items-start justify-between gap-2 text-[11px]">
								<span className="text-muted-foreground">Catatan</span>
								<span className="max-w-[70%] text-right font-semibold text-foreground">{customerNotes}</span>
							</div>
						</div>
					</div>
					{orderItems.length > 0 ? <div data-receipt-section="items" className="mt-3 border-t border-border pt-3 text-left"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Detail item</p><div className="mt-1.5 space-y-1">{orderItems.map((item: any, index: number) => <div className="flex items-start justify-between gap-2 text-[11px]" key={`${item.productId}-${item.variant || "default"}-${index}`}><span className="min-w-0 break-words text-foreground">{item.quantity}x {item.productName}{item.variant ? ` (${item.variant})` : ""}</span><span className="shrink-0 font-semibold">{currency((item.price || 0) * (item.quantity || 0))}</span></div>)}</div></div> : null}
					<BarcodeLines value={orderReference} />
					</div>
					</div>
					</PaymentDocumentAnimation>
			{/* ── Live status tracker ─────────────────────────── */}
			{!props.actionsHidden && !isExpired ? <ReceiptActions items={exportItems} storeName={props.storeName} orderReference={orderReference} payment={paymentLabel} status={unifiedStatusLabel} total={Number(props.currentOrder?.totalAmount ?? props.total)} onRetryPayment={canRetryPayment ? props.onRetryPayment : undefined} retryPaymentLabel="Buat link pembayaran baru" retryingPayment={props.retryingPayment} /> : null}
			<div className="grid grid-cols-2 gap-2 pb-2"><button type="button" className="min-h-11 rounded-[14px] border border-border bg-card px-2.5 py-2.5 text-[10px] font-black shadow-sm" onClick={props.onOrderAgain}>Pesan lagi</button><button type="button" className="min-h-11 rounded-[14px] bg-primary px-2.5 py-2.5 text-[10px] font-black text-primary-foreground shadow-sm" onClick={props.onOpenService}>{props.dessertLater ? "Panggil staff / dessert" : "Panggil staff"}</button></div><button type="button" className="min-h-11 w-full rounded-[14px] border border-primary/20 bg-primary/5 px-2.5 py-2.5 text-[10px] font-black text-primary shadow-sm" onClick={props.onHome}>Kembali ke Home</button>
		</div>
	);
}
