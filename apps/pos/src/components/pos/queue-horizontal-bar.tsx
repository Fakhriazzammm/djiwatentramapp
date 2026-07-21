import { useMemo, useState, useCallback } from "react";
import { Clock, Coffee, ChefHat, Loader2, CheckCircle2, Pencil, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useHybridOrderStatus, useHybridShiftStatus } from "@/hooks/use-hybrid-pos-data";
import type { OrderStatusRecord } from "@/hooks/use-hybrid-pos-data";
import { useHybridWriteOrderStatus, useHybridUpdateOrderStaff } from "@/hooks/use-hybrid-write-actions";
import {
	formatTimeAgo,
	getStatusBadge,
	isWithinEditWindow,
	CompletedDetailModal,
	AutoCountdown,
} from "@/components/pos/antrian-tab";

// ── Compact status badge ──
function CompactBadge({ status }: { status: string }) {
	const info = getStatusBadge(status);
	return (
		<span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none", info.color)}>
			<span className={cn("h-1.5 w-1.5 rounded-full", info.dot)} />
			{info.label}
		</span>
	);
}

// ── Group icon ──
function GroupIcon({ group_type }: { group_type: "barista" | "kitchen" }) {
	if (group_type === "barista") return <Coffee className="h-3 w-3 text-amber-600 shrink-0" />;
	return <ChefHat className="h-3 w-3 text-orange-600 shrink-0" />;
}

// ── Compact Horizontal Card (for "Sedang Dibuat" row) ──
function CompactActionCard({
	order,
	onDutyStaff,
	onUpdate,
	updating,
}: {
	order: OrderStatusRecord;
	onDutyStaff: string[];
	onUpdate: (orderNo: string, groupType: "barista" | "kitchen", status: "dibuat" | "selesai", by: string) => void;
	updating: boolean;
}) {
	const isNew = order.status === "new";
	const isDibuat = order.status === "dibuat";
	const fromDb = order.dibuat_by && order.dibuat_by !== "Otomatis";
	const assignedStaff = order.dibuat_by || onDutyStaff[0] || "Staff";

	return (
		<div
			className={cn(
				"w-44 shrink-0 snap-start rounded-xl border p-2.5 transition-all",
				isNew ? "border-blue-200 bg-white shadow-sm" : "border-amber-200 bg-amber-50/30 shadow-sm",
			)}
		>
			{/* Top row: order no + group icon + time */}
			<div className="flex items-center justify-between mb-1.5">
				<span className="font-mono font-bold text-[11px] truncate">{order.order_no}</span>
				<div className="flex items-center gap-1 shrink-0">
					<GroupIcon group_type={order.group_type} />
					<span className="text-[9px] text-muted-foreground font-medium tabular-nums">
						{formatTimeAgo(order.created_at)}
					</span>
				</div>
			</div>

			{/* Status badge + staff */}
			<div className="flex items-center justify-between mb-1.5">
				<CompactBadge status={order.status} />
				{fromDb && (
					<span className="text-[9px] text-muted-foreground truncate max-w-[60px]">{order.dibuat_by}</span>
				)}
				{isDibuat && !fromDb && (
					<span className="text-[9px] text-muted-foreground/60 italic truncate max-w-[60px]">{assignedStaff}</span>
				)}
			</div>

			{/* Auto-countdown for new without staff */}
			{isNew && !fromDb && (
				<div className="mb-1.5">
					<AutoCountdown created_at={order.created_at} />
				</div>
			)}

			{/* Action button */}
			{isNew && (
				<Button
					size="sm"
					variant="default"
					className="w-full h-7 text-[10px] font-bold"
					onClick={(e) => {
						e.stopPropagation();
						onUpdate(order.order_no, order.group_type, "dibuat", assignedStaff);
					}}
					disabled={updating}
				>
					{updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
					Proses
				</Button>
			)}
			{isDibuat && (
				<Button
					size="sm"
					variant="default"
					className="w-full h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700"
					onClick={(e) => {
						e.stopPropagation();
						onUpdate(order.order_no, order.group_type, "selesai", assignedStaff);
					}}
					disabled={updating}
				>
					{updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
					Selesai
				</Button>
			)}
		</div>
	);
}

// ── Compact Card for "Selesai" row (clickable) ──
function CompactDoneCard({
	order,
	onClick,
}: {
	order: OrderStatusRecord;
	onClick: (order: OrderStatusRecord) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onClick(order)}
			className={cn(
				"w-40 shrink-0 snap-start rounded-xl border border-emerald-100 bg-emerald-50/30 p-2.5 text-left transition-all",
				"hover:opacity-80 hover:shadow-sm cursor-pointer"
			)}
		>
			{/* Top row: order no + group icon + time */}
			<div className="flex items-center justify-between mb-1.5">
				<span className="font-mono font-bold text-[11px] truncate">{order.order_no}</span>
				<div className="flex items-center gap-1 shrink-0">
					<GroupIcon group_type={order.group_type} />
					<span className="text-[9px] text-muted-foreground font-medium tabular-nums">
						{formatTimeAgo(order.selesai_at)}
					</span>
				</div>
			</div>

			{/* Badge + staff */}
			<div className="flex items-center justify-between">
				<span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 leading-none">
					🏁 Selesai
				</span>
				<div className="flex items-center gap-1">
					{order.selesai_by && (
						<span className="text-[9px] text-muted-foreground truncate max-w-[50px]">{order.selesai_by}</span>
					)}
					<Pencil className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
				</div>
			</div>
		</button>
	);
}

// ── Scroll container ──
function ScrollRow({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory -mx-3 px-3">
			{children}
		</div>
	);
}

// ── Main QueueHorizontalBar ──
export function QueueHorizontalBar() {
	const orders = useHybridOrderStatus();
	const shiftStatus = useHybridShiftStatus();
	const { updateStatus } = useHybridWriteOrderStatus();
	const { updateStaff, saving } = useHybridUpdateOrderStaff();

	const [updatingOrders, setUpdatingOrders] = useState<Set<string>>(new Set());
	const [detailOrder, setDetailOrder] = useState<OrderStatusRecord | null>(null);

	// Parse on-duty staff
	const onDutyStaff = useMemo(() => {
		const names = new Set<string>();
		const cashierName = shiftStatus?.ongoingShift?.cashierName || shiftStatus?.shiftInfo?.cashierName;
		if (cashierName) names.add(cashierName.trim());
		const teamRaw = shiftStatus?.ongoingShift?.teamMembers || "";
		teamRaw
			.split(/[,\n;|]/g)
			.map((name: string) => name.trim())
			.filter(Boolean)
			.forEach((name: string) => names.add(name));
		if (names.size === 0) names.add("Kasir");
		return Array.from(names);
	}, [shiftStatus?.ongoingShift?.cashierName, shiftStatus?.ongoingShift?.teamMembers, shiftStatus?.shiftInfo?.cashierName]);

	// Group orders into "sedang dibuat" and "selesai" (newest first)
	const { inProgress, completed } = useMemo(() => {
		if (!orders) return { inProgress: [], completed: [] };

		const prog: OrderStatusRecord[] = [];
		const done: OrderStatusRecord[] = [];

		for (const o of orders) {
			if (o.status === "selesai") {
				done.push(o);
			} else {
				prog.push(o);
			}
		}

		// Already sorted by created_at DESC from query
		return {
			inProgress: prog.slice(0, 20),
			completed: done.slice(0, 15),
		};
	}, [orders]);

	// Handle update
	const handleUpdate = useCallback(
		async (orderNo: string, groupType: "barista" | "kitchen", status: "dibuat" | "selesai", by: string) => {
			const key = `${orderNo}-${groupType}-${status}`;
			setUpdatingOrders((prev) => new Set(prev).add(key));
			try {
				const result = await updateStatus({ order_no: orderNo, group_type: groupType, status, by });
				if (result.success) {
					toast.success(`#${orderNo} — ${status === "dibuat" ? "Diproses" : "Selesai"} oleh ${by}`);
				} else {
					toast.error(result.error || "Gagal update status");
				}
			} finally {
				setUpdatingOrders((prev) => {
					const next = new Set(prev);
					next.delete(key);
					return next;
				});
			}
		},
		[updateStatus]
	);

	// Handle save staff from edit modal
	const handleSaveStaff = useCallback(
		async (dibuatBy: string | null, selesaiBy: string | null) => {
			if (!detailOrder) return;
			const result = await updateStaff({
				order_no: detailOrder.order_no,
				group_type: detailOrder.group_type,
				dibuat_by: dibuatBy,
				selesai_by: selesaiBy,
			});
			if (result.success) {
				toast.success(`#${detailOrder.order_no} — Staff berhasil diupdate`);
				setDetailOrder(null);
			} else {
				toast.error(result.error || "Gagal update staff");
			}
		},
		[updateStaff, detailOrder]
	);

	const totalActive = inProgress.length;

	// Don't render anything if no orders at all
	if (!orders || (inProgress.length === 0 && completed.length === 0)) return null;

	return (
		<>
			<div className="border-t border-border/50 bg-muted/5 px-3 py-2 transition-all">
				{/* ── SEDANG DIBUAT ── */}
				{inProgress.length > 0 && (
					<div className="mb-2 last:mb-0">
						<div className="flex items-center gap-1.5 mb-2">
							<Clock className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />
							<span className="text-[10px] font-black uppercase tracking-widest text-foreground/80">
								Sedang Dibuat
							</span>
							<span className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-amber-100 px-1.5 text-[9px] font-bold text-amber-700">
								{totalActive}
							</span>
						</div>
						<ScrollRow>
							{inProgress.map((o) => (
								<CompactActionCard
									key={`ip-${o.group_type}-${o.order_no}`}
									order={o}
									onDutyStaff={onDutyStaff}
									onUpdate={handleUpdate}
									updating={updatingOrders.has(`${o.order_no}-${o.group_type}-dibuat`) || updatingOrders.has(`${o.order_no}-${o.group_type}-selesai`)}
								/>
							))}
						</ScrollRow>
					</div>
				)}

				{/* ── SELESAI ── */}
				{completed.length > 0 && (
					<div className={cn(inProgress.length > 0 && "mt-2")}>
						<div className="flex items-center gap-1.5 mb-2">
							<TrendingUp className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
							<span className="text-[10px] font-black uppercase tracking-widest text-foreground/80">
								Selesai
							</span>
							<span className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-emerald-100 px-1.5 text-[9px] font-bold text-emerald-700">
								{completed.length}
							</span>
						</div>
						<ScrollRow>
							{completed.map((o) => (
								<CompactDoneCard
									key={`done-${o.group_type}-${o.order_no}`}
									order={o}
									onClick={(order) => isWithinEditWindow(order.selesai_at) && setDetailOrder(order)}
								/>
							))}
						</ScrollRow>
					</div>
				)}
			</div>

			{/* Detail modal for completed orders */}
			{detailOrder && (
				<CompletedDetailModal
					order={detailOrder}
					onDutyStaff={onDutyStaff}
					onClose={() => setDetailOrder(null)}
					onSave={handleSaveStaff}
					saving={saving}
					canEdit={isWithinEditWindow(detailOrder.selesai_at)}
				/>
			)}
		</>
	);
}
