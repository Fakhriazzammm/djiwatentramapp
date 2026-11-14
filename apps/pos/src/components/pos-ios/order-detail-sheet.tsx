import { formatPaymentLabel } from "@djiwaapps/web-shared/lib/payment-label";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Doc } from "@/types/backend-compat";
import type { ReceiptPrintMode } from "@/lib/bluetooth-printer";
import { cn } from "@/lib/utils";
import { formatRp, IOS_SPRING, IosChip, IosSheet, StatusPill, type StatusTone } from "./ios-kit";
import { displayOrderNumber, orderTypeLabel, statusGroup } from "./order-helpers";

const STATUS_OPTIONS = [
	{ value: "pending", label: "Bayar di Kasir" },
	{ value: "paid", label: "Lunas" },
	{ value: "completed", label: "Selesai" },
	{ value: "cancelled", label: "Batal" },
] as const;
const TYPE_OPTIONS = [
	{ value: "dine_in", label: "Makan di tempat" },
	{ value: "takeaway", label: "Bungkus" },
	{ value: "online", label: "Online" },
] as const;
const PAY_OPTIONS = [
	{ value: "tunai", label: "Tunai" },
	{ value: "qris", label: "QRIS" },
	{ value: "transfer", label: "Transfer" },
	{ value: "edc", label: "EDC" },
] as const;

export function statusMeta(status: string): { label: string; tone: StatusTone } {
	const group = statusGroup(status);
	if (group === "paid") return { label: status === "completed" ? "Selesai" : "Lunas", tone: "ok" };
	if (group === "pending") return { label: "Bayar di Kasir", tone: "warn" };
	return { label: "Batal", tone: "bad" };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="mb-3.5">
			<p className="mb-1.5 text-[11px] font-bold tracking-wider text-muted-foreground">{label.toUpperCase()}</p>
			{children}
		</div>
	);
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
	return <input {...props} className="h-11 w-full rounded-[13px] bg-muted px-3.5 text-[15px] outline-none placeholder:text-muted-foreground focus:bg-background focus:shadow-[0_0_0_1px_var(--border)]" />;
}

export function OrderDetailSheet({
	order,
	onClose,
	onPrint,
	onDelete,
	onSave,
}: {
	order: Doc<"orders"> | null;
	onClose: () => void;
	onPrint?: (order: Doc<"orders">, mode: ReceiptPrintMode) => void;
	onDelete: (order: Doc<"orders">) => void;
	onSave: (id: Doc<"orders">["_id"], data: Record<string, unknown>) => Promise<void>;
}) {
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [form, setForm] = useState({ customerName: "", tableNumber: "", notes: "", status: "pending", orderType: "dine_in", paymentMethod: "tunai" });
	useEffect(() => {
		setEditing(false);
		if (order) setForm({ customerName: order.customerName || "", tableNumber: order.tableNumber || "", notes: order.notes || "", status: order.status, orderType: order.orderType || "dine_in", paymentMethod: String(order.paymentMethod ?? "tunai") });
	}, [order]);

	const items: any[] = order?.items ?? [];
	const subtotal = items.reduce((sum, item) => sum + item.price * (item.quantity || 0), 0);
	const meta = order ? statusMeta(order.status) : null;
	const promoLabels: string[] = order?.receiptMeta?.promotionLabels ?? [];

	const save = async () => {
		if (!order) return;
		setSaving(true);
		try {
			await onSave(order._id, { customerName: form.customerName, tableNumber: form.tableNumber, notes: form.notes, status: form.status, orderType: form.orderType, paymentMethod: form.paymentMethod });
			setEditing(false);
		} finally {
			setSaving(false);
		}
	};

	return (
		<IosSheet
			open={Boolean(order)}
			onClose={onClose}
			heightClass="max-h-[88dvh]"
			title={order ? (
				<span className="flex items-center justify-between gap-2">
					<span className="truncate">#{displayOrderNumber(order)}</span>
					{meta ? <StatusPill tone={meta.tone}>{meta.label}</StatusPill> : null}
				</span>
			) : undefined}
			footer={
				order ? (
					editing ? (
						<div className="flex gap-2.5">
							<button type="button" onClick={() => setEditing(false)} className="h-12 flex-1 rounded-2xl bg-muted text-[15px] font-bold">Batal</button>
							<motion.button type="button" whileTap={{ scale: 0.97 }} disabled={saving} onClick={() => void save()} className="h-12 flex-[1.4] rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-60">{saving ? "Menyimpan…" : "Simpan perubahan"}</motion.button>
						</div>
					) : (
						<div className="flex gap-2.5">
							<button type="button" onClick={() => onDelete(order)} aria-label="Hapus pesanan" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Trash2 className="h-5 w-5" /></button>
							<button type="button" onClick={() => setEditing(true)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-muted text-[15px] font-bold"><Pencil className="h-4 w-4" />Ubah</button>
							{onPrint ? (
								<motion.button type="button" whileTap={{ scale: 0.97 }} transition={IOS_SPRING} onClick={() => onPrint(order, statusGroup(order.status) === "pending" ? "open_bill" : "paid")} className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground"><Printer className="h-4 w-4" />{statusGroup(order.status) === "pending" ? "Cetak open bill" : "Cetak struk"}</motion.button>
							) : null}
						</div>
					)
				) : undefined
			}
		>
			{order ? (
				editing ? (
					<div className="pb-2 pt-1">
						<Field label="Nama pelanggan"><TextInput value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field>
						<Field label="Nomor meja"><TextInput value={form.tableNumber} onChange={(e) => setForm({ ...form, tableNumber: e.target.value })} placeholder="Cth: 7" /></Field>
						<Field label="Status"><div className="flex flex-wrap gap-2">{STATUS_OPTIONS.map((o) => <IosChip key={o.value} active={form.status === o.value} onClick={() => setForm({ ...form, status: o.value })}>{o.label}</IosChip>)}</div></Field>
						<Field label="Tipe order"><div className="flex flex-wrap gap-2">{TYPE_OPTIONS.map((o) => <IosChip key={o.value} active={form.orderType === o.value} onClick={() => setForm({ ...form, orderType: o.value })}>{o.label}</IosChip>)}</div></Field>
						<Field label="Metode pembayaran"><div className="flex flex-wrap gap-2">{PAY_OPTIONS.map((o) => <IosChip key={o.value} active={form.paymentMethod === o.value} onClick={() => setForm({ ...form, paymentMethod: o.value })}>{o.label}</IosChip>)}</div></Field>
						<Field label="Catatan"><TextInput value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan pesanan…" /></Field>
					</div>
				) : (
					<div className="pb-2">
						<p className="mb-3 text-[13px] text-muted-foreground">
							{new Date(order.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} · {new Date(order.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
							{" · "}{orderTypeLabel(order.orderType)}{order.tableNumber ? ` · Meja ${order.tableNumber}` : ""}
						</p>
						<div className="rounded-2xl bg-muted/50 px-3.5">
							{items.map((item, index) => (
								<div key={index} className={cn("flex items-start justify-between gap-3 py-2.5 text-[14px]", index > 0 && "border-t border-border/60")}>
									<span className="min-w-0"><b>{item.quantity}×</b> {item.productName}{item.variant ? <span className="block text-[12px] text-muted-foreground">{item.variant}</span> : null}</span>
									<b className="shrink-0 tabular-nums">{formatRp(item.price * item.quantity)}</b>
								</div>
							))}
						</div>
						<dl className="mt-3 space-y-1.5 text-[14px]">
							<div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatRp(subtotal)}</dd></div>
							{order.discountAmount > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Diskon</dt><dd className="tabular-nums text-rose-600">−{formatRp(order.discountAmount)}</dd></div> : null}
							{order.taxAmount > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Pajak</dt><dd className="tabular-nums">{formatRp(order.taxAmount)}</dd></div> : null}
							{order.serviceChargeAmount > 0 ? <div className="flex justify-between"><dt className="text-muted-foreground">Service</dt><dd className="tabular-nums">{formatRp(order.serviceChargeAmount)}</dd></div> : null}
							<div className="flex justify-between"><dt className="text-muted-foreground">Pembayaran</dt><dd>{formatPaymentLabel({ source: order.source, paymentMethod: order.paymentMethod, paymentReceiptKind: order.paymentReceiptKind, paymentGateway: order.paymentGateway })}</dd></div>
							<div className="flex justify-between border-t border-border pt-2 text-[17px] font-extrabold"><dt>Total</dt><dd className="tabular-nums">{formatRp(order.totalAmount)}</dd></div>
						</dl>
						{promoLabels.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{promoLabels.map((label) => <StatusPill key={label} tone="warn">{label}</StatusPill>)}</div> : null}
						{order.customerName && order.customerName !== "Pelanggan" ? <p className="mt-3 text-[13px] text-muted-foreground">Pelanggan: <b className="text-foreground">{order.customerName}</b></p> : null}
						{order.notes ? <p className="mt-1 text-[13px] text-muted-foreground">Catatan: {order.notes}</p> : null}
					</div>
				)
			) : null}
		</IosSheet>
	);
}
