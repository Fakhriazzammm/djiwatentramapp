import { CheckCircle2, QrCode, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Doc } from "@/types/backend-compat";
import type { CartItem, ReceiptState } from "./types";
import { currency } from "./types";
import { BarcodeLines } from "./shared-components";

export interface ReceiptSectionProps {
	cartSnapshot: CartItem[];
	currentOrder: Doc<"orders"> | undefined;
	dessertLater: boolean;
	logoUrl: string;
	onOpenService: () => void;
	onOrderAgain: () => void;
	receipt: ReceiptState;
	storeName: string;
	total: number;
}

export function renderReceiptSection(props: ReceiptSectionProps) {
	const orderReference = props.currentOrder?.orderNumber || props.receipt.fallbackReference;
	const orderStatus = props.currentOrder?.status;
	const mode = orderStatus === "paid" || orderStatus === "completed" ? "paid" : props.receipt.mode;
	const cartSnapshotItems = (props.cartSnapshot ?? []).map((item: CartItem) => ({
		productId: item.productId,
		productName: item.name,
		quantity: item.quantity,
		price: item.price,
		variant: item.variant,
	}));
	const orderItems = props.currentOrder?.items ?? cartSnapshotItems;
	const customerName = props.currentOrder?.customerName || "-";
	const tableNumber = props.currentOrder?.tableNumber || "-";
	const orderType = props.currentOrder?.orderType === "takeaway" ? "Takeaway" : "Dine In";
	const customerNotes = props.currentOrder?.notes || "-";

	const unifiedStatusLabel = orderStatus === "paid" ? "LUNAS"
		: orderStatus === "completed" ? "SELESAI"
		: "OPEN BILL";
	const unifiedStatusColor = orderStatus === "paid" ? "text-blue-600"
		: orderStatus === "completed" ? "text-emerald-600"
		: "text-amber-600";

	return (
		<div className="space-y-2 px-2 py-2 pb-6">
			<div className="rounded-xl border border-border bg-card p-3 text-center shadow-sm">
				<div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">{mode === "paid" ? <CheckCircle2 className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}</div>
				<p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary/70">{mode === "paid" ? "Payment completed" : "Payment receipt"}</p>
				<h2 className="mt-1 text-lg font-black tracking-tight">{mode === "paid" ? "Struk lunas" : "Tunjukkan ke kasir"}</h2>
				<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{mode === "cashier_pending" ? "Silakan tunjukkan layar ini ke kasir untuk menyelesaikan pembayaran." : mode === "mayar_pending" ? "Invoice Mayar sudah dibuat. Status struk akan berubah otomatis setelah dibayar." : "Pembayaran sudah diterima. Pesanan akan diproses restoran."}</p>
				<div className="mt-3 rounded-xl border border-border bg-background px-2.5 py-2.5">{props.logoUrl ? <img alt={props.storeName} className="mx-auto h-10 object-contain" src={props.logoUrl} /> : null}<div className="mt-2.5 space-y-0.5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Nomor order</p><p className="text-xl font-black tracking-[0.12em] text-foreground">{orderReference}</p></div><div className="mt-2.5 rounded-lg bg-muted/35 px-2.5 py-2.5"><div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Metode</span><span className="font-bold">{props.receipt.paymentChoice === "mayar" ? "QRIS" : "Kasir"}</span></div><div className="mt-1 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Status</span><span className={cn("font-bold", unifiedStatusColor)}>{unifiedStatusLabel}</span></div><div className="mt-1 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Total</span><span className="font-black">{currency(props.currentOrder?.totalAmount ?? props.total)}</span></div></div>
					<div className="mt-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left">
						<p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Data customer</p>
						<div className="mt-1.5 space-y-1">
							<div className="flex items-center justify-between gap-2 text-[11px]">
								<span className="text-muted-foreground">Nama</span>
								<span className="font-semibold text-foreground">{customerName}</span>
							</div>
							<div className="flex items-center justify-between gap-2 text-[11px]">
								<span className="text-muted-foreground">Meja</span>
								<span className="font-semibold text-foreground">{tableNumber}</span>
							</div>
							<div className="flex items-center justify-between gap-2 text-[11px]">
								<span className="text-muted-foreground">Tipe</span>
								<span className="font-semibold text-foreground">{orderType}</span>
							</div>
							<div className="flex items-start justify-between gap-2 text-[11px]">
								<span className="text-muted-foreground">Catatan</span>
								<span className="max-w-[70%] text-right font-semibold text-foreground">{customerNotes}</span>
							</div>
						</div>
					</div>
					{orderItems.length > 0 ? <div className="mt-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Detail item</p><div className="mt-1.5 space-y-1">{orderItems.map((item: any, index: number) => <div className="flex items-start justify-between gap-2 text-[11px]" key={`${item.productId}-${item.variant || "default"}-${index}`}><span className="line-clamp-2 text-foreground">{item.quantity}x {item.productName}{item.variant ? ` (${item.variant})` : ""}</span><span className="shrink-0 font-semibold">{currency((item.price || 0) * (item.quantity || 0))}</span></div>)}</div></div> : null}
					<BarcodeLines value={orderReference} />
				</div>
				{props.receipt.invoiceUrl && mode === "mayar_pending" ? <a className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-[10px] font-black text-primary-foreground shadow-sm" href={props.receipt.invoiceUrl} rel="noreferrer" target="_blank"><QrCode className="h-3 w-3" />Bayar via DjiwaApp</a> : null}
			</div>
			<div className="grid grid-cols-2 gap-1.5 pb-4"><button type="button" className="rounded-lg border border-border bg-card px-2.5 py-2.5 text-[10px] font-black shadow-sm" onClick={props.onOrderAgain}>Pesan lagi</button><button type="button" className="rounded-lg bg-primary px-2.5 py-2.5 text-[10px] font-black text-primary-foreground shadow-sm" onClick={props.onOpenService}>{props.dessertLater ? "Call staff / dessert" : "Call staff"}</button></div>
		</div>
	);
}
