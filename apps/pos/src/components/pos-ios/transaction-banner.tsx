import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CreditCard, MapPin, X } from "lucide-react";
import { useEffect } from "react";
import { isDeliveryNotification, type PosNotification } from "@/hooks/use-pos-notifications";
import { getDisplayOrderNumber } from "@djiwaapps/web-shared/lib/order-number";
import { IOS_SPRING } from "./ios-kit";

type Props = {
	notifications: PosNotification[];
	onOpenOrder: (notification: PosNotification) => void;
	onDismiss: (notificationId: string) => void;
	onMarkCashierPaid?: (notification: PosNotification) => void | Promise<void>;
};

const rp = (v: unknown) => `Rp ${Math.round(Number(v ?? 0)).toLocaleString("id-ID")}`;

function alerts(notifications: PosNotification[]) {
	const newest = new Map<string, PosNotification>();
	const out: PosNotification[] = [];
	for (const item of notifications) {
		const source = String(item.source ?? item.action_payload?.source ?? "").toLowerCase();
		const isApp = source === "customer_self_service" || source === "djiwaapp" || item.notification_type === "order_cashier_pending" || item.notification_type === "order_paid";
		if (!isApp || item.isRead) continue;
		if (item.notification_type !== "order_cashier_pending" && item.notification_type !== "order_paid") continue;
		const orderId = String(item.action_payload?.orderId ?? item.order_source_id ?? item.id);
		if (!isDeliveryNotification(item)) { out.push(item); continue; }
		const prev = newest.get(orderId);
		if (!prev || new Date(item.created_at).getTime() > new Date(prev.created_at).getTime()) newest.set(orderId, item);
	}
	return [...out, ...newest.values()].slice(0, 3);
}

function copyFor(item: PosNotification) {
	if (isDeliveryNotification(item)) {
		const paid = item.notification_type === "order_paid";
		return { title: "Pesanan Delivery Customer", sub: paid ? "Pembayaran sudah dikonfirmasi" : "Pesanan baru perlu diproses", tag: `DELIVERY · ${paid ? "LUNAS" : "BARU"}`, tone: paid ? "bg-emerald-500" : "bg-sky-500", Icon: MapPin };
	}
	const method = String(item.action_payload?.paymentMethod ?? "").toLowerCase();
	if (item.notification_type === "order_paid") {
		const wallet = method === "wallet" || method === "djiwa_pay";
		return { title: wallet ? "Pembayaran DJIWA PAY Berhasil" : "Pembayaran QRIS Berhasil", sub: wallet ? "Pesanan DjiwaApp dibayar dengan DJIWA PAY" : "Pesanan DjiwaApp sudah lunas", tag: wallet ? "DJIWA PAY" : "QRIS", tone: "bg-emerald-500", Icon: CheckCircle2 };
	}
	return { title: "Pesanan Baru dari DjiwaApp", sub: "Menunggu pembayaran di kasir", tag: "BAYAR DI KASIR", tone: "bg-amber-500", Icon: CreditCard };
}

function Banner({ item, onOpen, onDismiss, onPaid }: { item: PosNotification; onOpen: () => void; onDismiss: () => void; onPaid?: () => void | Promise<void> }) {
	const copy = copyFor(item);
	const pending = item.notification_type === "order_cashier_pending";
	const ms = pending ? 30_000 : 8_000;
	useEffect(() => {
		const t = window.setTimeout(onDismiss, ms);
		return () => window.clearTimeout(t);
	}, [onDismiss, ms]);
	const p = item.action_payload ?? {};
	const customer = String(p.customerName ?? "").trim();
	const count = Number(p.itemCount ?? 0);
	const total = Number(p.totalAmount ?? 0);
	const summary = [customer, count > 0 ? `${count} item` : "", total > 0 ? rp(total) : ""].filter(Boolean).join(" · ");
	const num = item.order_number ? getDisplayOrderNumber(item.order_number, { sequence: (item as any).daily_receipt_no, createdAt: (item as any).created_at, source: (item as any).source, orderType: (item as any).order_type }) : "";
	return (
		<motion.article
			layout
			initial={{ y: -140, opacity: 0, scale: 0.96 }}
			animate={{ y: 0, opacity: 1, scale: 1 }}
			exit={{ y: -140, opacity: 0, transition: { duration: 0.25 } }}
			transition={IOS_SPRING}
			drag="y"
			dragConstraints={{ top: 0, bottom: 0 }}
			dragElastic={{ top: 0.6, bottom: 0.05 }}
			onDragEnd={(_, info) => { if (info.offset.y < -30 || info.velocity.y < -400) onDismiss(); }}
			className="pointer-events-auto relative w-full touch-none overflow-hidden rounded-[22px] bg-card/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,.25)] ring-1 ring-black/5 backdrop-blur-xl"
		>
			<div className="flex items-center gap-3">
				<button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
					<span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${copy.tone}`}><copy.Icon className="h-5 w-5" /></span>
					<span className="min-w-0 flex-1">
						<span className="block truncate text-[14px] font-extrabold leading-tight">{copy.title}</span>
						<span className="block truncate text-[12px] text-muted-foreground">{copy.sub}</span>
						{(num || summary) ? <span className="mt-0.5 block truncate text-[12px] font-semibold">{num ? `#${num}` : ""}{num && summary ? " · " : ""}{summary}</span> : null}
					</span>
				</button>
				{pending && onPaid ? <button type="button" onClick={() => void onPaid()} className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black text-white active:scale-95">Sudah Dibayar</button> : null}
				<button type="button" onClick={onDismiss} aria-label="Tutup alert transaksi" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-muted-foreground active:scale-90"><X className="h-4 w-4" /></button>
			</div>
			<motion.span className={`absolute bottom-0 left-0 h-[3px] w-full origin-left ${copy.tone}`} initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: ms / 1000, ease: "linear" }} />
		</motion.article>
	);
}

export function TransactionBanner({ notifications, onOpenOrder, onDismiss, onMarkCashierPaid }: Props) {
	const list = alerts(notifications);
	return (
		<div className="pointer-events-none fixed inset-x-0 top-[max(0.625rem,env(safe-area-inset-top))] z-[70] mx-auto flex max-w-xl flex-col gap-2 px-2.5" aria-live="polite" aria-label="Alert transaksi baru">
			<AnimatePresence initial={false}>
				{list.map((item) => (
					<Banner key={item.id} item={item} onOpen={() => onOpenOrder(item)} onDismiss={() => onDismiss(item.id)} onPaid={onMarkCashierPaid ? () => onMarkCashierPaid(item) : undefined} />
				))}
			</AnimatePresence>
		</div>
	);
}
