import { getDisplayOrderNumber } from "@djiwaapps/web-shared/lib/order-number";
import { Check, Loader2, MapPin, Truck } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { isDeliveryNotification, type PosNotification } from "@/hooks/use-pos-notifications";
import { cn } from "@/lib/utils";
import { formatRp, IOS_SPRING, IosSheet, StatusPill } from "./ios-kit";

const payload = (n: PosNotification | null): Record<string, any> => n?.action_payload ?? {};

function tableLabel(order: Record<string, any> | null, p: Record<string, any>) {
	const value = order?.tableNumber ?? order?.table_number ?? order?.tableName ?? order?.table_name ?? p.tableNumber ?? p.table_number;
	if (value === null || value === undefined || String(value).trim() === "") {
		const type = String(order?.orderType ?? order?.order_type ?? p.orderType ?? "").toLowerCase();
		return type.includes("take") || type.includes("delivery") ? "Takeaway" : "Belum ditentukan";
	}
	return String(value).startsWith("Meja") ? String(value) : `Meja ${value}`;
}
function extras(item: Record<string, any>) {
	const value = item.addOns ?? item.addons ?? item.options ?? item.customizations;
	if (Array.isArray(value)) return value.map((e) => (typeof e === "string" ? e : e?.name)).filter(Boolean).join(", ");
	return typeof value === "string" ? value : "";
}
function paymentLabel(order: Record<string, any> | null, p: Record<string, any>) {
	const method = String(order?.paymentMethod ?? order?.payment_method ?? p.paymentMethod ?? "").toLowerCase();
	if (method.includes("wallet") || method.includes("djiwa_pay") || method === "djiwaapp") return "Djiwa Pay";
	return method.includes("qris") || method.includes("mayar") ? "QRIS" : "Bayar di kasir";
}

/** Detail pesanan dari notifikasi (DjiwaApp / delivery) sebagai sheet iOS. Data & aturan sama dengan sheet lama. */
export function OrderNotificationSheet({ open, order, notification, onClose, onMarkCashierPaid }: { open: boolean; order: Record<string, any> | null; notification: PosNotification | null; onClose: () => void; onMarkCashierPaid?: () => void | Promise<void> }) {
	const [busy, setBusy] = useState(false);
	const p = payload(notification);
	const items: any[] = (Array.isArray(order?.items) && order!.items.length > 0 ? order!.items : p.items) ?? [];
	const orderNumber = getDisplayOrderNumber(order?.orderNumber ?? notification?.order_number ?? p.orderNumber, { sequence: order?.dailyReceiptNo ?? (notification as any)?.daily_receipt_no, createdAt: order?.createdAt ?? (notification as any)?.created_at, source: order?.source ?? notification?.source });
	const status = String(order?.status ?? p.paymentStatus ?? "").toLowerCase();
	const paid = status === "paid" || status === "completed";
	const delivery = isDeliveryNotification(notification) || String(order?.orderType ?? order?.order_type ?? "").toLowerCase().includes("delivery");
	const total = Number(order?.totalAmount ?? p.totalAmount ?? 0);
	const canPay = Boolean(order) && status === "pending" && String(order?.paymentMethod ?? order?.payment_method ?? "").toLowerCase() === "cash" && Boolean(onMarkCashierPaid);
	const fee = Number(order?.shippingFee ?? order?.deliveryFee ?? p.shippingFee ?? p.deliveryFee ?? 0);
	const note = order?.customerDescription ?? order?.customer_description ?? p.customerDescription ?? p.customer_description ?? "";

	const pay = async () => {
		if (!onMarkCashierPaid || busy) return;
		setBusy(true);
		try { await onMarkCashierPaid(); } finally { setBusy(false); }
	};

	return (
		<IosSheet
			open={open}
			onClose={onClose}
			heightClass="max-h-[90dvh]"
			title={<span className="flex items-center justify-between gap-2"><span>Detail pesanan</span><StatusPill tone={paid ? "ok" : "warn"}>{paid ? "Lunas" : "Menunggu bayar"}</StatusPill></span>}
			footer={canPay ? (
				<motion.button type="button" whileTap={{ scale: 0.97 }} transition={IOS_SPRING} disabled={busy} onClick={() => void pay()} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[16px] font-bold text-white disabled:opacity-60">
					{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}Sudah dibayar · {formatRp(total)}
				</motion.button>
			) : undefined}
		>
			<div className="pb-2">
				<p className="mb-3 break-all text-[12px] font-semibold text-muted-foreground">#{orderNumber} · {delivery ? "Delivery customer" : "Pesanan DjiwaApp"}</p>
				<div className="grid grid-cols-2 gap-2">
					<div className="rounded-2xl bg-muted/60 p-3"><p className="text-[10.5px] font-bold tracking-wider text-muted-foreground">PELANGGAN</p><p className="mt-0.5 break-words text-[14px] font-bold">{order?.customerName ?? p.customerName ?? "Pelanggan DjiwaApp"}</p></div>
					<div className="rounded-2xl bg-muted/60 p-3"><p className="text-[10.5px] font-bold tracking-wider text-muted-foreground">MEJA</p><p className="mt-0.5 text-[14px] font-bold">{tableLabel(order, p)}</p></div>
					<div className="rounded-2xl bg-muted/60 p-3"><p className="text-[10.5px] font-bold tracking-wider text-muted-foreground">METODE</p><p className="mt-0.5 text-[14px] font-bold">{paymentLabel(order, p)}</p></div>
					<div className="rounded-2xl bg-muted/60 p-3"><p className="text-[10.5px] font-bold tracking-wider text-muted-foreground">SUMBER</p><p className="mt-0.5 text-[14px] font-bold">DjiwaApp</p></div>
				</div>
				{note ? <div className="mt-2 rounded-2xl bg-amber-50 p-3"><p className="text-[10.5px] font-bold tracking-wider text-amber-700">CIRI KHUSUS CUSTOMER</p><p className="mt-0.5 text-[14px] text-amber-900">{String(note)}</p></div> : null}
				{delivery ? (
					<div className="mt-2 space-y-2">
						<div className="flex items-start gap-2 rounded-2xl bg-sky-50 p-3 text-[14px] font-semibold text-sky-900"><Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{String(order?.deliveryProvider ?? order?.delivery_provider ?? p.deliveryProvider ?? p.shippingProvider ?? "Kurir belum dipilih")}</div>
						<div className="flex items-start gap-2 rounded-2xl bg-muted/60 p-3 text-[14px]"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />{String(order?.deliveryAddress ?? order?.delivery_address ?? p.deliveryAddress ?? p.delivery_address ?? "Alamat belum tersedia")}</div>
					</div>
				) : null}
				<p className="px-1 pb-1.5 pt-4 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">ITEM · {items.length}</p>
				<div className="rounded-2xl bg-muted/50 px-3.5">
					{items.length === 0 ? <p className="py-4 text-center text-[13px] text-muted-foreground">Detail item belum tersedia.</p> : items.map((item, index) => (
						<div key={index} className={cn("flex items-start justify-between gap-3 py-2.5 text-[14px]", index > 0 && "border-t border-border/60")}>
							<span className="min-w-0"><b>{Number(item.quantity ?? 0)}×</b> {String(item.productName ?? item.name ?? item.title ?? "Item pesanan")}{extras(item) ? <span className="block text-[12px] text-muted-foreground">{extras(item)}</span> : null}</span>
							<b className="shrink-0 tabular-nums">{formatRp(Number(item.price ?? 0) * Number(item.quantity ?? 0))}</b>
						</div>
					))}
				</div>
				<dl className="mt-3 space-y-1.5 text-[14px]">
					<div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatRp(order?.subtotalAmount ?? order?.subtotal ?? total)}</dd></div>
					{Number(order?.discountAmount ?? 0) > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Diskon</dt><dd className="tabular-nums text-rose-600">−{formatRp(order?.discountAmount)}</dd></div> : null}
					{fee > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Biaya pengantaran</dt><dd className="tabular-nums">{formatRp(fee)}</dd></div> : null}
					<div className="flex items-baseline justify-between border-t border-border pt-2"><dt className="text-[15px] font-extrabold">Total</dt><dd className="text-[22px] font-extrabold tabular-nums text-primary">{formatRp(total)}</dd></div>
				</dl>
			</div>
		</IosSheet>
	);
}
