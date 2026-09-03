import { CheckCircle2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Doc } from "@/types/backend-compat";
import type { CartItem, ReceiptState } from "./types";
import { currency } from "./types";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";
import { BarcodeLines, ReceiptTotalsBreakdown } from "./shared-components";
import { ReceiptActions } from "./split-bill-sheet";
import { ReceiptPrinterAnimation } from "./receipt-printer-animation";

// Status lifecycle order — live tracker di struk
const STATUS_STEPS = [
	{ key: "pending", label: "Diterima" },
	{ key: "preparing", label: "Diproses" },
	{ key: "ready", label: "Siap" },
	{ key: "served", label: "Disajikan" },
	{ key: "completed", label: "Selesai" },
] as const;

function getStatusStepIndex(status?: string) {
	const s = String(status ?? "").toLowerCase();
	const idx = STATUS_STEPS.findIndex((step) => step.key === s);
	// "processing" → step "Diproses"
	if (idx === -1 && (s === "processing" || s === "paid")) return 1;
	return idx;
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
	onOpenTracking: () => void;
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
		brandSlug: currentOrder?.brandSlug ?? currentOrder?.brand_slug ?? "b2b",
	}) || props.receipt.fallbackReference;
	const currentOrderData = props.currentOrder as any;
	const orderStatus = String(currentOrderData?.status ?? currentOrderData?.raw?.status ?? "").trim().toLowerCase();
	const paymentReceiptKind = String(currentOrderData?.paymentReceiptKind ?? currentOrderData?.payment_receipt_kind ?? currentOrderData?.raw?.paymentReceiptKind ?? "").trim().toLowerCase();
	const isSettledOrder = ["paid", "completed", "settled", "selesai", "lunas"].includes(orderStatus) || ["gateway_paid", "wallet_paid"].includes(paymentReceiptKind);
	const mode = isSettledOrder ? "paid" : props.receipt.mode;
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
	const orderType = props.currentOrder?.orderType === "delivery" ? "B2B / Delivery" : "B2B Order";
	const customerNotes = props.currentOrder?.notes || "-";
	const deliveryProvider = props.currentOrder?.deliveryProvider || props.currentOrder?.delivery_provider || "-";
	const deliveryDate = props.currentOrder?.deliveryDate || props.currentOrder?.delivery_date;
	const deliveryAddress = props.currentOrder?.deliveryAddress || props.currentOrder?.delivery_address || "-";

	const unifiedStatusLabel = isSettledOrder && orderStatus !== "completed" && orderStatus !== "selesai" ? "LUNAS"
		: isSettledOrder ? "SELESAI"
		: "OPEN BILL";
	const unifiedStatusColor = !isSettledOrder ? "text-amber-600"
		: orderStatus === "paid" || orderStatus === "lunas" || ["gateway_paid", "wallet_paid"].includes(paymentReceiptKind) ? "text-blue-600"
		: "text-emerald-600";
	const normalizedPaymentMethod = String(props.currentOrder?.paymentMethod ?? (props.currentOrder as any)?.payment_method ?? props.receipt.paymentChoice).toLowerCase();
	const canRetryPayment = mode !== "paid" && (normalizedPaymentMethod.includes("wallet") || normalizedPaymentMethod.includes("djiwa") || normalizedPaymentMethod.includes("qris") || normalizedPaymentMethod.includes("mayar") || props.receipt.paymentChoice === "mayar");

	const currentStepIndex = getStatusStepIndex(orderStatus);
	const currentStepLabel = currentStepIndex >= 0 ? STATUS_STEPS[currentStepIndex].label : null;
	const paymentLabel = props.receipt.paymentChoice === "wallet" ? "Djiwa Pay" : props.receipt.paymentChoice === "mayar" ? "QRIS Mayar" : "Bayar di Kasir";
	const printerStatusLabel = mode === "paid" ? "Pembayaran berhasil" : props.receipt.mode === "mayar_pending" ? "Invoice siap dibayar" : "Struk siap ditunjukkan ke kasir";
	// Do not reconstruct historical totals from item prices. Show this breakdown
	// only when the backend stored the authoritative tax calculation.
	const persistedTaxBase = Number(props.currentOrder?.taxBaseAmount ?? props.currentOrder?.tax_base_amount);
	const persistedRawTotal = Number(props.currentOrder?.rawTotalAmount ?? props.currentOrder?.raw_total_amount);
	const persistedRounding = Number(props.currentOrder?.roundingAdjustment ?? props.currentOrder?.rounding_adjustment);
	const persistedTotal = Number(props.currentOrder?.totalAmount ?? props.currentOrder?.total_amount);
	const hasPersistedTotals = [persistedTaxBase, persistedRawTotal, persistedRounding, persistedTotal].every(Number.isFinite);

	return (
		<div className="space-y-2 px-2 py-2 pb-32">
			<ReceiptPrinterAnimation
				orderReference={orderReference}
				total={props.currentOrder?.totalAmount ?? props.total}
				paymentLabel={paymentLabel}
				statusLabel={printerStatusLabel}
			>
				<div className="rounded-3xl border border-border bg-card p-4 text-center shadow-sm">
				<div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">{mode === "paid" ? <CheckCircle2 className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}</div>
				<p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary/70">Step 5 · Selesai / Struk</p>
				<h2 className="mt-1 font-display text-lg font-black tracking-tight">{mode === "paid" ? "Struk lunas" : "Tunjukkan ke kasir"}</h2>
				<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{mode === "cashier_pending" ? "Silakan tunjukkan layar ini ke kasir untuk menyelesaikan pembayaran." : mode === "mayar_pending" ? "Invoice pembayaran sudah dibuat. Status struk akan berubah otomatis setelah dibayar." : "Pembayaran sudah diterima. Pesanan akan diproses tim produksi."}</p>
				<div className="mt-3 rounded-xl border border-border bg-background px-2.5 py-2.5">{props.logoUrl ? <img alt={props.storeName} className="mx-auto h-10 object-contain" src={props.logoUrl} /> : null}<div className="mt-2.5 space-y-0.5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Nomor order</p><p className="text-xl font-black tracking-[0.12em] text-foreground">{orderReference}</p></div><div className="mt-2.5 rounded-lg bg-muted/35 px-2.5 py-2.5"><div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Metode</span><span className="font-bold">{props.receipt.paymentChoice === "mayar" ? "QRIS" : "Kasir"}</span></div><div className="mt-1 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Status</span><span className={cn("font-bold", unifiedStatusColor)}>{unifiedStatusLabel}</span></div><div className="mt-1 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Total</span><span className="font-black">{currency(props.currentOrder?.totalAmount ?? props.total)}</span></div></div>
					{hasPersistedTotals ? <ReceiptTotalsBreakdown rawTotal={persistedRawTotal} taxBase={persistedTaxBase} taxAmount={Number(props.currentOrder?.taxAmount ?? 0)} taxRate={Number((props.currentOrder?.receiptMeta as any)?.taxRateSnapshot ?? 0)} taxEnabled={Number(props.currentOrder?.taxAmount ?? 0) > 0 || Number((props.currentOrder?.receiptMeta as any)?.taxRateSnapshot ?? 0) > 0} serviceChargeAmount={Number(props.currentOrder?.serviceChargeAmount ?? 0)} roundingAdjustment={persistedRounding} total={persistedTotal} /> : null}
					<div className="mt-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left">
						<p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Data customer</p>
						<div className="mt-1.5 space-y-1">
							<div className="flex items-center justify-between gap-2 text-[11px]">
								<span className="text-muted-foreground">Nama</span>
								<span className="font-semibold text-foreground">{customerName}</span>
							</div>
							<div className="flex items-center justify-between gap-2 text-[11px]">
								<span className="text-muted-foreground">Tipe</span>
								<span className="font-semibold text-foreground">{orderType}</span>
							</div>
							<div className="flex items-center justify-between gap-2 text-[11px]"><span className="text-muted-foreground">Kurir</span><span className="font-semibold text-foreground">{deliveryProvider}</span></div>
							<div className="flex items-start justify-between gap-2 text-[11px]"><span className="text-muted-foreground">Jadwal kirim</span><span className="max-w-[70%] text-right font-semibold text-foreground">{deliveryDate ? new Date(deliveryDate).toLocaleDateString("id-ID", { dateStyle: "long" }) : "-"}</span></div>
							<div className="flex items-start justify-between gap-2 text-[11px]"><span className="text-muted-foreground">Alamat</span><span className="max-w-[70%] break-words text-right font-semibold text-foreground">{deliveryAddress}</span></div>
							<div className="flex items-start justify-between gap-2 text-[11px]">
								<span className="text-muted-foreground">Catatan</span>
								<span className="max-w-[70%] text-right font-semibold text-foreground">{customerNotes}</span>
							</div>
						</div>
					</div>
					{orderItems.length > 0 ? <div data-receipt-section="items" className="mt-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Detail item</p><div className="mt-1.5 space-y-1">{orderItems.map((item: any, index: number) => <div className="flex items-start justify-between gap-2 text-[11px]" key={`${item.productId}-${item.variant || "default"}-${index}`}><span className="min-w-0 break-words text-foreground">{item.quantity}x {item.productName}{item.variant ? ` (${item.variant})` : ""}</span><span className="shrink-0 font-semibold">{currency((item.price || 0) * (item.quantity || 0))}</span></div>)}</div></div> : null}
					<BarcodeLines value={orderReference} />
					</div>
					</div>
					</ReceiptPrinterAnimation>
			{/* ── Live status tracker ─────────────────────────── */}
			{!props.actionsHidden ? <ReceiptActions items={exportItems} storeName={props.storeName} orderReference={orderReference} payment={paymentLabel} status={unifiedStatusLabel} total={Number(props.currentOrder?.totalAmount ?? props.total)} onRetryPayment={canRetryPayment ? props.onRetryPayment : undefined} retryPaymentLabel="Buat link pembayaran baru" retryingPayment={props.retryingPayment} /> : null}
				{currentStepLabel ? (
					<div className="mt-3 rounded-3xl border border-border bg-card p-3.5 shadow-sm">
						<div className="flex items-center justify-between">
							<p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Status pesanan</p>
							<p className={cn("text-xs font-black", unifiedStatusColor)}>{currentStepLabel}</p>
						</div>
						<div className="mt-3 flex items-center">
							{STATUS_STEPS.map((step, index) => {
								const reached = index <= currentStepIndex;
								const isLast = index === STATUS_STEPS.length - 1;
								return (
									<div key={step.key} className="flex flex-1 flex-col items-center">
										<div className="flex w-full items-center">
											<div className={cn("h-0.5 flex-1", index === 0 ? "opacity-0" : reached ? "bg-primary" : "bg-muted")} />
											<div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black transition-colors", reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground/60")}>
												{reached ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
											</div>
											<div className={cn("h-0.5 flex-1", isLast ? "opacity-0" : reached ? "bg-primary" : "bg-muted")} />
										</div>
										<p className={cn("mt-1.5 text-[9px] font-bold leading-tight", reached ? "text-foreground" : "text-muted-foreground/60")}>{step.label}</p>
									</div>
								);
							})}
						</div>
						<p className="mt-2.5 text-center text-[10px] text-muted-foreground/70">Pembaruan otomatis — pesananmu sedang {currentStepLabel.toLowerCase()}.</p>
					</div>
				) : null}
			<div className="space-y-2 pb-2"><button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-2.5 py-2.5 text-[10px] font-black text-primary-foreground shadow-sm" onClick={props.onOpenTracking}>Lacak pesanan <span aria-hidden="true">→</span></button><div className="grid grid-cols-2 gap-2"><button type="button" className="min-h-11 rounded-[14px] border border-border bg-card px-2.5 py-2.5 text-[10px] font-black shadow-sm" onClick={props.onOrderAgain}>Pesan lagi</button><button type="button" className="min-h-11 rounded-[14px] border border-primary/20 bg-primary/5 px-2.5 py-2.5 text-[10px] font-black text-primary shadow-sm" onClick={props.onOpenService}>{props.dessertLater ? "Panggil staff / dessert" : "Panggil staff"}</button></div><button type="button" className="min-h-11 w-full rounded-[14px] border border-border bg-card px-2.5 py-2.5 text-[10px] font-black shadow-sm" onClick={props.onHome}>Kembali ke Home</button></div>
		</div>
	);
}
