import { formatPaymentLabel } from "@yumipos/web-shared/lib/payment-label";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Check, ChevronDown, ChefHat, FileText, Loader2, Receipt, SlidersHorizontal, Trash2, Undo2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Doc } from "@/types/backend-compat";
import type { ReceiptPrintMode } from "@/lib/bluetooth-printer";
import { createClient } from "@/lib/client";
import { cn } from "@/lib/utils";
import { triggerHybridRefresh, useHybridOrders, useHybridShiftStatus } from "@/hooks/use-hybrid-pos-data";
import { useHybridDeleteOrdersBulk, useHybridUpdateOrder } from "@/hooks/use-hybrid-write-actions";
import { ConfirmSheet, formatClock, formatRp, IOS_SPRING, IOS_SPRING_SOFT, IosChip, IosSheet, StatusPill, listItemMotion } from "./ios-kit";
import { OrderDetailSheet, statusMeta } from "./order-detail-sheet";
import { displayOrderNumber, isCashierPending, isDeliveryOrder, orderTypeLabel, statusGroup, timeRange, TIME_LABELS, type TimeFilter } from "./order-helpers";

type Chip = "all" | "open" | "paid" | "cancelled";
type Sort = "desc" | "asc";

export interface OrdersScreenProps {
	onPrint?: (order: Doc<"orders">, mode: ReceiptPrintMode) => void;
	onRestore: (order: Doc<"orders">) => void;
	onUpdate: (id: Doc<"orders">["_id"], data: Record<string, unknown>) => Promise<void>;
}

function SourceMark({ order }: { order: any }) {
	const label = order.source === "customer_self_service" ? "APP" : order.source === "booking" ? "BK" : "POS";
	return <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold", label === "APP" ? "bg-blue-50 text-blue-700" : label === "BK" ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700")}>{label}</span>;
}

export function OrdersScreen({ onPrint, onRestore, onUpdate }: OrdersScreenProps) {
	const orders = useHybridOrders();
	const openBills = useHybridOrders({ status: "pending" });
	const shiftStatus = useHybridShiftStatus();
	const updateOrder = useHybridUpdateOrder();
	const deleteOrders = useHybridDeleteOrdersBulk();

	const [chip, setChip] = useState<Chip>("all");
	const [time, setTime] = useState<TimeFilter>("today");
	const [sort, setSort] = useState<Sort>("desc");
	const [shiftFilter, setShiftFilter] = useState("active");
	const [filterOpen, setFilterOpen] = useState(false);
	const [expanded, setExpanded] = useState<string | null>(null);
	const [detail, setDetail] = useState<Doc<"orders"> | null>(null);
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
	const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
	const [cancelledLocal, setCancelledLocal] = useState<Set<string>>(new Set());
	const [delivered, setDelivered] = useState<Set<string>>(new Set());
	const [paidLocal, setPaidLocal] = useState<Set<string>>(new Set());
	const [paying, setPaying] = useState<string | null>(null);

	const shifts: any[] = useMemo(() => shiftStatus?.allShifts ?? [], [shiftStatus?.allShifts]);
	const activeShift = shifts.find((shift) => !shift.endTime);
	const shiftLabel = shiftFilter === "active" ? (activeShift?.shiftName ? `Shift ${activeShift.shiftName}` : "Shift aktif") : shiftFilter === "all" ? "Semua shift" : shifts.find((s) => s._id === shiftFilter)?.shiftName ?? "Shift";

	const shiftFor = useCallback((createdAt: number) => shifts.find((shift) => createdAt >= shift.startTime && createdAt <= (shift.endTime ?? Date.now())), [shifts]);

	const history = useMemo(() => {
		if (!orders) return null;
		const range = timeRange(time);
		let list = (orders as any[]).filter((order) => (order.source === "pos" || order.source === "customer_self_service" || order.source == null) && order.createdAt >= range.from && order.createdAt < range.to);
		if (shiftFilter === "active") {
			if (activeShift) list = list.filter((order) => order.createdAt >= activeShift.startTime && order.createdAt <= (activeShift.endTime ?? Date.now()));
		} else if (shiftFilter !== "all") {
			const picked = shifts.find((shift) => shift._id === shiftFilter);
			list = picked ? list.filter((order) => order.createdAt >= picked.startTime && order.createdAt <= (picked.endTime ?? Date.now())) : [];
		}
		return list;
	}, [orders, time, shiftFilter, activeShift, shifts]);

	const effectiveStatus = useCallback((order: any) => (paidLocal.has(String(order._id)) ? "paid" : cancelledLocal.has(String(order._id)) ? "cancelled" : order.status), [paidLocal, cancelledLocal]);

		// Baris yang sedang/sudah dihapus disembunyikan dulu (optimistis); dikembalikan bila penghapusannya gagal.
		const visibleHistory = useMemo(() => (history ? history.filter((o: any) => !hiddenIds.has(String(o._id))) : null), [history, hiddenIds]);
		const visibleOpen = useMemo(() => (openBills ? (openBills as any[]).filter((o) => !hiddenIds.has(String(o._id)) && !cancelledLocal.has(String(o._id))) : undefined), [openBills, hiddenIds, cancelledLocal]);
const orderById = useMemo(() => new Map(((orders as any[]) ?? []).map((o) => [String(o._id), o] as const)), [orders]);
const isDeliveryId = (id: string) => isDeliveryOrder(orderById.get(id));
// Judul & teks konfirmasi mengikuti jenis pesanan yang dipilih (delivery = dibatalkan, lainnya = dihapus).
const confirmCopy = useMemo(() => {
	const ids = confirmIds ?? [];
	const total = ids.length;
	if (total === 0) return { title: "Hapus pesanan?", message: "", confirmLabel: "Hapus" };
	const delivery = ids.filter(isDeliveryId).length;
	if (delivery === total) {
		return {
			title: total > 1 ? `Batalkan ${total} pesanan delivery?` : "Batalkan pesanan delivery?",
			message: "Pesanan delivery tidak dapat dihapus permanen. Pesanan akan dibatalkan dan tetap tercatat di riwayat Batal.",
			confirmLabel: "Batalkan",
		};
	}
	if (delivery === 0) {
		return {
			title: total > 1 ? `Hapus ${total} Open Bill?` : "Hapus pesanan?",
			message: "Pesanan beserta item dan catatan transaksinya akan dihapus. Tindakan ini tidak dapat dibatalkan.",
			confirmLabel: "Hapus",
		};
	}
	return {
		title: `Hapus atau batalkan ${total} pesanan?`,
		message: `${delivery} pesanan delivery tidak dapat dihapus permanen, jadi akan dibatalkan dan tetap tercatat di riwayat Batal. ${total - delivery} pesanan lain akan dihapus.`,
		confirmLabel: "Lanjutkan",
	};
}, [confirmIds, orderById]);

	const counts = useMemo(() => {
		const base = visibleHistory ?? [];
		return {
			all: base.length,
			open: (visibleOpen ?? []).length,
			paid: base.filter((o) => statusGroup(effectiveStatus(o)) === "paid").length,
			cancelled: base.filter((o) => statusGroup(effectiveStatus(o)) === "cancelled").length,
		};
	}, [visibleHistory, visibleOpen, effectiveStatus]);

	const list = useMemo(() => {
		const source: any[] = chip === "open" ? [...(visibleOpen ?? [])] : [...(visibleHistory ?? [])];
		const filtered = chip === "paid" ? source.filter((o) => statusGroup(effectiveStatus(o)) === "paid") : chip === "cancelled" ? source.filter((o) => statusGroup(effectiveStatus(o)) === "cancelled") : source;
		filtered.sort((a, b) => (sort === "asc" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt));
		return filtered;
	}, [chip, visibleHistory, visibleOpen, sort, effectiveStatus]);

	const loading = orders === undefined || (chip === "open" && openBills === undefined);

	const markPaid = useCallback(async (order: any) => {
		setPaying(String(order._id));
		try {
			await updateOrder({ id: order._id, status: "paid", paymentMethod: "cash", paymentReceiptKind: "cashier" });
			triggerHybridRefresh();
			window.setTimeout(() => triggerHybridRefresh(), 350);
			window.setTimeout(() => triggerHybridRefresh(), 1200);
			setPaidLocal((prev) => new Set(prev).add(String(order._id)));
			toast.success(`Pesanan #${displayOrderNumber(order)} ditandai sudah dibayar`);
		} catch (error) {
			console.error("[orders] mark paid failed", error);
			toast.error(error instanceof Error ? error.message : "Gagal menandai pesanan sudah dibayar");
		} finally {
			setPaying(null);
		}
	}, [updateOrder]);

	const toggleDelivered = useCallback(async (order: any) => {
		const id = String(order._id);
		const current = delivered.has(id) ? !order.is_delivered : !!order.is_delivered;
		setDelivered((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
		try {
			await createClient().schema("pos").from("orders").update({ is_delivered: !current }).eq("_id", order._id);
		} catch (error) {
			console.warn("[orders] delivered toggle failed", error);
		}
	}, [delivered]);

	const confirmDelete = useCallback(() => {
			if (!confirmIds) return;
			const ids = confirmIds;
			// Sheet langsung tertutup dan baris langsung hilang; prosesnya berjalan di latar belakang dan progresnya tampil di toast.
			setConfirmIds(null);
			setSelected(new Set());
			setSelectMode(false);
			setExpanded((current) => (current && ids.includes(current) ? null : current));
			setDetail((current: Doc<"orders"> | null) => (current && ids.includes(String(current._id)) ? null : current));
			setHiddenIds((prev) => new Set([...prev, ...ids]));
			const toastId = toast.loading(ids.length > 1 ? `Memproses ${ids.length} pesanan…` : "Memproses pesanan…");
			const setHidden = (targets: string[], on: boolean) =>
				setHiddenIds((prev) => {
					const next = new Set(prev);
					targets.forEach((id) => (on ? next.add(id) : next.delete(id)));
					return next;
				});
			void (async () => {
				try {
					const result = await deleteOrders(ids, {
						onProgress: (done, total) => {
							if (total > 1) toast.loading(`Memproses ${done} dari ${total}…`, { id: toastId });
						},
					});
					// Yang dibatalkan tetap tampil di riwayat (chip Batal); yang gagal kembali ke daftar.
					setHidden([...result.cancelled, ...result.failed], false);
					setCancelledLocal((prev) => new Set([...prev, ...result.cancelled]));
					const parts = [
						result.deleted.length ? `${result.deleted.length} dihapus` : "",
						result.cancelled.length ? `${result.cancelled.length} dibatalkan` : "",
					].filter(Boolean);
					if (result.failed.length > 0) {
						toast.error(`${result.failed.length} dari ${ids.length} pesanan gagal diproses. ${parts.length ? `${parts.join(" · ")}. ` : ""}Coba lagi.`, { id: toastId });
					} else {
						toast.success(parts.join(" · ") || "Selesai", { id: toastId });
					}
				} catch (error) {
					console.error("[orders] process failed", error);
					setHidden(ids, false);
					toast.error("Proses gagal. Coba lagi.", { id: toastId });
				} finally {
					triggerHybridRefresh();
				}
			})();
		}, [confirmIds, deleteOrders]);

	const chips: Array<{ id: Chip; label: string; count: number }> = [
		{ id: "all", label: "Semua", count: counts.all },
		{ id: "open", label: "Bayar di Kasir", count: counts.open },
		{ id: "paid", label: "Lunas", count: counts.paid },
		{ id: "cancelled", label: "Batal", count: counts.cancelled },
	];
	const canSelect = chip === "open" && list.length > 0;
	const filterActive = time !== "today" || shiftFilter !== "active" || sort !== "desc";

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center gap-2">
				<div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{chips.map((item) => <IosChip key={item.id} active={chip === item.id} count={item.count} onClick={() => { setChip(item.id); setExpanded(null); setSelectMode(false); setSelected(new Set()); }}>{item.label}</IosChip>)}
				</div>
				<motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => setFilterOpen(true)} aria-label="Filter pesanan" className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-muted">
					<SlidersHorizontal className="h-[18px] w-[18px]" />
					{filterActive ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" /> : null}
				</motion.button>
			</div>
			<div className="flex items-center justify-between pb-2 pt-1 text-[12px] text-muted-foreground">
				<span>{chip === "open" ? "Semua Open Bill yang belum dibayar" : `${shiftLabel} · ${TIME_LABELS[time]} · ${sort === "desc" ? "Terbaru" : "Terlama"}`}</span>
				{canSelect ? <button type="button" onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }} className="font-bold text-primary">{selectMode ? "Batal" : "Pilih"}</button> : null}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28">
				{loading ? [1, 2, 3].map((i) => <div key={i} className="mb-2 h-[72px] animate-pulse rounded-2xl bg-muted" />) : null}
				{!loading && list.length === 0 ? (
					<div className="flex flex-col items-center py-16 text-center">
						<Receipt className="mb-3 h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
						<p className="text-[14px] font-bold text-muted-foreground">{chip === "open" ? "Tidak ada Open Bill" : "Belum ada transaksi"}</p>
						<p className="mt-1 text-[12px] text-muted-foreground/80">{chip === "open" ? "Pesanan yang disimpan atau menunggu pembayaran muncul di sini." : "Coba ganti filter shift atau rentang waktu."}</p>
					</div>
				) : null}
				<AnimatePresence initial={false} mode="popLayout">
					{list.map((order, index) => {
						const id = String(order._id);
						const status = effectiveStatus(order);
						const group = statusGroup(status);
						const meta = group === "pending" && !isCashierPending(order) ? { label: "Menunggu bayar", tone: "warn" as const } : statusMeta(status);
						const items: any[] = order.items ?? [];
						const qty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
						const open = expanded === id;
						const isSelected = selected.has(id);
						const isDelivered = delivered.has(id) ? !order.is_delivered : !!order.is_delivered;
						const matchedShift = shiftFor(order.createdAt);
						const who = order.customerName && order.customerName !== "Pelanggan" ? order.customerName : orderTypeLabel(order.orderType);
						return (
							<motion.div key={id} layout="position" {...listItemMotion(index)} className={cn("mb-2 overflow-hidden rounded-[18px] border bg-card", isSelected ? "border-primary bg-primary/[0.04]" : "border-border")}>
								<div className="flex items-center gap-3 px-3 py-3">
									<AnimatePresence initial={false}>
										{selectMode ? (
											<motion.button key="cb" type="button" initial={{ width: 0, opacity: 0 }} animate={{ width: 24, opacity: 1 }} exit={{ width: 0, opacity: 0 }} onClick={() => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })} aria-label={`Pilih ${displayOrderNumber(order)}`} aria-pressed={isSelected} className={cn("flex h-6 shrink-0 items-center justify-center overflow-hidden rounded-full border-2", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
												{isSelected ? <Check className="h-3.5 w-3.5" /> : null}
											</motion.button>
										) : null}
									</AnimatePresence>
									<button type="button" onClick={() => (selectMode ? setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }) : setExpanded(open ? null : id))} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
										<SourceMark order={order} />
										<div className="min-w-0 flex-1">
											<p className="truncate text-[14px] font-bold">{who}{order.tableNumber ? ` · Meja ${order.tableNumber}` : ""}</p>
											<p className="truncate text-[12px] text-muted-foreground">#{displayOrderNumber(order)} · {formatClock(order.createdAt)} · {qty} item</p>
										</div>
										<div className="shrink-0 text-right">
											<p className="text-[14px] font-extrabold tabular-nums">{formatRp(order.totalAmount)}</p>
											<StatusPill tone={meta.tone}>{group === "paid" ? formatPaymentLabel({ source: order.source, paymentMethod: order.paymentMethod, paymentReceiptKind: order.paymentReceiptKind, paymentGateway: order.paymentGateway }) : meta.label}</StatusPill>
										</div>
										{!selectMode ? <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} aria-hidden="true" /> : null}
									</button>
								</div>
								<AnimatePresence initial={false}>
									{open ? (
										<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={IOS_SPRING_SOFT} className="overflow-hidden">
											<div className="border-t border-border/70 px-3 pb-3 pt-2.5">
												<div className="space-y-1 text-[13px]">
													{items.slice(0, 6).map((item, i) => <div key={i} className="flex justify-between gap-3 text-muted-foreground"><span className="truncate">{item.quantity}× {item.productName}{item.variant ? ` (${item.variant})` : ""}</span><span className="shrink-0 tabular-nums">{formatRp(item.price * item.quantity)}</span></div>)}
													{items.length > 6 ? <p className="text-[12px] text-muted-foreground">+{items.length - 6} item lain</p> : null}
												</div>
												<p className="mt-2 text-[11.5px] text-muted-foreground">{matchedShift?.shiftName || "Di luar shift"} · {matchedShift?.cashierName || "—"} (kasir) · {orderTypeLabel(order.orderType)}</p>
												<div className="mt-3 flex flex-wrap gap-2">
													{group === "pending" ? (
														<>
															<ActionButton primary onClick={() => onRestore(order)} icon={<Undo2 className="h-4 w-4" />}>Lanjutkan</ActionButton>
															{isCashierPending(order) ? <ActionButton tone="ok" busy={paying === id} onClick={() => void markPaid(order)} icon={<Check className="h-4 w-4" />}>Sudah dibayar</ActionButton> : null}
														</>
													) : (
														<ActionButton tone={isDelivered ? "ok" : undefined} onClick={() => void toggleDelivered(order)} icon={<Check className="h-4 w-4" />}>{isDelivered ? "Diantar" : "Sudah diantar?"}</ActionButton>
													)}
													{onPrint ? (
														<>
															<ActionButton onClick={() => onPrint(order, group === "pending" ? "open_bill" : "paid")} icon={group === "pending" ? <FileText className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}>{group === "pending" ? "Open bill" : "Struk"}</ActionButton>
															<ActionButton onClick={() => onPrint(order, "kitchen")} icon={<ChefHat className="h-4 w-4" />}>Kitchen</ActionButton>
														</>
													) : null}
													<ActionButton onClick={() => setDetail(order)}>Detail</ActionButton>
													{group === "pending" ? <ActionButton tone="bad" onClick={() => setConfirmIds([id])} icon={isDeliveryOrder(order) ? <Ban className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}>{isDeliveryOrder(order) ? "Batalkan" : "Hapus"}</ActionButton> : null}
												</div>
											</div>
										</motion.div>
									) : null}
								</AnimatePresence>
							</motion.div>
						);
					})}
				</AnimatePresence>
			</div>

			<AnimatePresence>
				{selectMode && selected.size > 0 && confirmIds === null ? (
						/* Disembunyikan saat sheet konfirmasi terbuka: bar (z-75) menutupi tombol Batal/Hapus di sheet (z-70). */
					<motion.div key="selbar" initial={{ y: 110, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 110, opacity: 0 }} transition={IOS_SPRING} className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[75] flex items-center gap-2 rounded-[18px] bg-foreground p-2.5 pl-4 text-background shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
						<span className="flex-1 text-[14px] font-bold">{selected.size} dipilih</span>
						<button type="button" onClick={() => setSelected(new Set(list.map((o) => String(o._id))))} className="h-10 rounded-xl bg-white/15 px-3.5 text-[13px] font-bold">Semua</button>
						<button type="button" onClick={() => setConfirmIds([...selected])} className="flex h-10 items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-[13px] font-bold text-white">{[...selected].every(isDeliveryId) ? <Ban className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}{[...selected].every(isDeliveryId) ? "Batalkan" : "Hapus"}</button>
					</motion.div>
				) : null}
			</AnimatePresence>

			<IosSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter" heightClass="max-h-[80dvh]" footer={<button type="button" onClick={() => setFilterOpen(false)} className="h-12 w-full rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground">Terapkan</button>}>
				<div className="pb-2">
					<p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground">SHIFT</p>
					<div className="mb-4 flex flex-wrap gap-2">
						<IosChip active={shiftFilter === "active"} onClick={() => setShiftFilter("active")}>{activeShift?.shiftName ? `Aktif: ${activeShift.shiftName}` : "Shift aktif"}</IosChip>
						<IosChip active={shiftFilter === "all"} onClick={() => setShiftFilter("all")}>Semua shift</IosChip>
						{shifts.map((shift) => <IosChip key={shift._id} active={shiftFilter === shift._id} onClick={() => setShiftFilter(shift._id)}>{`${shift.shiftName || "Tanpa nama"} · ${shift.cashierName || "Kasir"}`}</IosChip>)}
					</div>
					<p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground">RENTANG</p>
					<div className="mb-4 flex flex-wrap gap-2">{(Object.keys(TIME_LABELS) as TimeFilter[]).map((key) => <IosChip key={key} active={time === key} onClick={() => setTime(key)}>{TIME_LABELS[key]}</IosChip>)}</div>
					<p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground">URUTAN</p>
					<div className="flex flex-wrap gap-2"><IosChip active={sort === "desc"} onClick={() => setSort("desc")}>Terbaru</IosChip><IosChip active={sort === "asc"} onClick={() => setSort("asc")}>Terlama</IosChip></div>
				</div>
			</IosSheet>

			<OrderDetailSheet order={detail} onClose={() => setDetail(null)} onPrint={onPrint} onDelete={(order) => setConfirmIds([String(order._id)])} onSave={async (id, data) => { await onUpdate(id, data); setDetail((current: Doc<"orders"> | null) => (current ? ({ ...current, ...data } as Doc<"orders">) : current)); }} />
			<ConfirmSheet open={confirmIds !== null} title={confirmCopy.title} message={confirmCopy.message} confirmLabel={confirmCopy.confirmLabel} destructive={confirmCopy.confirmLabel !== "Batalkan"} onConfirm={() => void confirmDelete()} onClose={() => setConfirmIds(null)} />
		</div>
	);
}

function ActionButton({ children, onClick, icon, primary, tone, busy }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; primary?: boolean; tone?: "ok" | "bad"; busy?: boolean }) {
	return (
		<motion.button type="button" whileTap={{ scale: 0.94 }} transition={IOS_SPRING} disabled={busy} onClick={onClick} className={cn("inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-bold disabled:opacity-60", primary ? "bg-primary text-primary-foreground" : tone === "ok" ? "bg-emerald-50 text-emerald-700" : tone === "bad" ? "bg-rose-50 text-rose-700" : "bg-muted text-foreground")}>
			{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
			{children}
		</motion.button>
	);
}
