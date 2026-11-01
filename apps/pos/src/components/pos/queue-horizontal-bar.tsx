import { useMemo, useState, useCallback } from "react";
import { Clock, Coffee, ChefHat, Loader2, CheckCircle2, Pencil, TrendingUp, ChevronDown, ChevronUp, ClipboardList, Users, Flag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useHybridOrderStatus, useHybridShiftStatus, useHybridStaffUsers } from "@/hooks/use-hybrid-pos-data";
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
		<span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none", info.color)}>
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

// ── Role → Production Track mapping (sync with checkout-sidebar) ──
const STAFF_ROLE_TRACK_MAP: Record<string, "bar" | "kitchen" | "both"> = {
	barista: "bar",
	bartender: "bar",
	bar: "bar",
	chef: "kitchen",
	koki: "kitchen",
	kitchen: "kitchen",
	cook: "kitchen",
};

function getStaffTrack(roleName: string | null | undefined): "bar" | "kitchen" | "both" | null {
	if (!roleName) return null;
	return STAFF_ROLE_TRACK_MAP[roleName.toLowerCase().trim()] ?? null;
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
	const effectiveStaff = order.dibuat_by && order.dibuat_by !== "Otomatis" ? order.dibuat_by : null;
	const fromDb = !!effectiveStaff;
	const assignedStaff = effectiveStaff || onDutyStaff[0] || "Staff";

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
					<span className="text-[11px] text-muted-foreground font-medium tabular-nums">
						{formatTimeAgo(order.created_at)}
					</span>
				</div>
			</div>

			{/* Status badge + staff */}
			<div className="flex items-center justify-between mb-1.5">
				<CompactBadge status={order.status} />
				{fromDb && (
					<span className="text-[11px] text-muted-foreground truncate max-w-[60px]">{order.dibuat_by}</span>
				)}
				{isDibuat && !fromDb && (
					<span className="text-[11px] text-muted-foreground/60 italic truncate max-w-[60px]">{assignedStaff}</span>
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
					<span className="text-[11px] text-muted-foreground font-medium tabular-nums">
						{formatTimeAgo(order.selesai_at)}
					</span>
				</div>
			</div>

			{/* Badge + staff */}
			<div className="flex items-center justify-between">
				<span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold uppercase text-emerald-700 leading-none">
					<Flag aria-hidden="true" className="h-3 w-3" /> Selesai
				</span>
				<div className="flex items-center gap-1">
					{order.selesai_by && order.selesai_by !== "Otomatis" && (
						<span className="text-[11px] text-muted-foreground truncate max-w-[50px]">{order.selesai_by}</span>
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
	const [isQueueExpanded, setIsQueueExpanded] = useState(false);

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

	// Staff users data for role-based filtering
	const staffUsers = useHybridStaffUsers();
	const staffRoleMap = useMemo(() => {
		const map = new Map<string, string | null>();
		for (const u of staffUsers ?? []) {
			const key = u.name?.toLowerCase().trim();
			if (key) map.set(key, u.roleName || null);
		}
		return map;
	}, [staffUsers]);

	// Filter on-duty staff by role track for each production group
	const filteredStaffByGroup = useMemo(() => ({
		barista: onDutyStaff.filter(name => {
			const role = staffRoleMap.get(name.toLowerCase().trim());
			const track = getStaffTrack(role);
			return track === "bar" || track === "both";
		}),
		kitchen: onDutyStaff.filter(name => {
			const role = staffRoleMap.get(name.toLowerCase().trim());
			const track = getStaffTrack(role);
			return track === "kitchen" || track === "both";
		}),
	}), [onDutyStaff, staffRoleMap]);

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

		// Staff production stats — count items per staff (shift only)
		const staffStats = useMemo(() => {
			if (!orders || orders.length === 0 || onDutyStaff.length === 0) return [];

			// Filter orders to current shift only
			const shiftStartMs = shiftStatus?.ongoingShift?.startTime || shiftStatus?.shiftInfo?.startTime;
			const currentShiftOrders = shiftStartMs
				? orders.filter(o => {
						const createdMs = new Date(o.created_at ?? 0).getTime();
						return createdMs >= shiftStartMs;
				  })
				: orders;

			if (currentShiftOrders.length === 0) return [];

			// Initialize all on-duty staff with 0 counts
			const counts = new Map<string, { dibuat: number; selesai: number; groups: Set<string> }>();
			const nameVariants = new Map<string, string>(); // normalized → display name
			for (const name of onDutyStaff) {
				const key = name.toLowerCase().trim();
				counts.set(key, { dibuat: 0, selesai: 0, groups: new Set() });
				nameVariants.set(key, name.trim());
			}
			// Count only explicitly assigned staff (non-Otomatis) in current shift
			for (const o of currentShiftOrders) {
				const candidates = new Set<string>();
				if (o.dibuat_by && o.dibuat_by !== "Otomatis") candidates.add(o.dibuat_by.trim());
				if (o.selesai_by && o.selesai_by !== "Otomatis") candidates.add(o.selesai_by.trim());
				for (const candidate of candidates) {
					if (!candidate) continue;
					const cKey = candidate.toLowerCase();
					// Try exact match first, then check if one contains the other
					let matchedKey: string | null = null;
					if (counts.has(cKey)) {
						matchedKey = cKey;
					} else {
						for (const dutyKey of counts.keys()) {
							if (dutyKey.includes(cKey) || cKey.includes(dutyKey)) {
								matchedKey = dutyKey;
								break;
							}
						}
					}
					if (!matchedKey) continue;
					const entry = counts.get(matchedKey)!;
					const isDibuat = candidate === (o.dibuat_by?.trim() ?? "");
					const isSelesai = candidate === (o.selesai_by?.trim() ?? "");
					if (isDibuat) entry.dibuat += 1;
					if (isSelesai) entry.selesai += 1;
					entry.groups.add(o.group_type);
				}
			}
			return Array.from(counts.entries())
				.map(([key, data]) => ({
					name: nameVariants.get(key) || key,
					total: data.dibuat + data.selesai,
					dibuat: data.dibuat,
					selesai: data.selesai,
					groups: Array.from(data.groups) as ("barista" | "kitchen")[],
				}))
				.sort((a, b) => b.selesai - a.selesai);
		}, [orders, onDutyStaff, shiftStatus?.ongoingShift?.startTime, shiftStatus?.shiftInfo?.startTime]);

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
	const totalAll = inProgress.length + completed.length;

	// Don't render anything if no orders at all
	const hasOrders = orders && totalAll > 0;

	return (
		<>
			{/* ── STAFF PRODUCTION STATS (above antrian, always visible) ── */}
			{staffStats.length > 0 && (
				<div className="border-t border-border/50 bg-muted/5 px-3 py-2 transition-all">
					<div className="flex items-center gap-1.5 mb-2">
						<Users className="h-3.5 w-3.5 text-indigo-600" strokeWidth={2.5} />
						<span className="text-[10px] font-black uppercase tracking-widest text-foreground/80">
							Produksi Staff
						</span>
					</div>
					<div className="flex gap-2 overflow-x-auto scrollbar-none snap-x snap-mandatory -mx-3 px-3">
						{staffStats.map((staff) => {
						  return (
						  <div key={staff.name} className="shrink-0 snap-start rounded-lg border border-indigo-100 bg-white px-2 py-1.5 shadow-sm min-w-0">
						      <div className="flex items-center gap-2">
						        <span className="text-[10px] font-black leading-tight">{staff.name}</span>
						        <span className="text-[10px] font-bold text-indigo-600 ml-auto whitespace-nowrap tabular-nums">{staff.selesai} selesai</span>
						      </div>
						      {(staff.dibuat > 0 || staff.groups.length > 0) && (
						        <div className="flex items-center gap-1 mt-0.5">
						          {staff.groups.includes("barista") && <Coffee className="h-2.5 w-2.5 text-amber-600 shrink-0" />}
						          {staff.groups.includes("kitchen") && <ChefHat className="h-2.5 w-2.5 text-orange-600 shrink-0" />}
						          {staff.dibuat > 0 && <span className="text-[11px] text-muted-foreground">{staff.dibuat} dibuat</span>}
						        </div>
						      )}
						    </div>
						  );
						})}
					</div>
				</div>
			)}

			{/* ── ANTRIAN CONTAINER ── */}
			{hasOrders && (<>
				{/* ── COLLAPSE HEADER ── */}
				<div className="flex w-full items-center justify-between mb-1.5">
					<div className="flex items-center gap-1.5">
						<ClipboardList className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
						<span className="text-[10px] font-black uppercase tracking-widest text-foreground/80">
							Antrian
						</span>
						<span className="inline-flex items-center justify-center h-4 min-w-[20px] rounded-full bg-primary/10 px-1.5 text-[11px] font-bold text-primary">
							{totalAll}
						</span>
					</div>
					<button
						type="button"
						onClick={() => setIsQueueExpanded(!isQueueExpanded)}
						className="flex items-center gap-1.5 rounded-full border-2 border-primary/20 px-2 py-0.5 hover:bg-primary/5 text-primary transition-all active:scale-95"
					>
						<span className="text-[10px] font-bold uppercase tracking-widest">
							{isQueueExpanded ? "Tutup" : "Buka"}
						</span>
						{isQueueExpanded ? <ChevronUp className="h-3 w-3" strokeWidth={3} /> : <ChevronDown className="h-3 w-3" strokeWidth={3} />}
					</button>
				</div>

				{/* ── COLLAPSIBLE CONTENT ── */}
				{isQueueExpanded && (
					<>
						{/* ── SEDANG DIBUAT ── */}
						{inProgress.length > 0 && (
							<div className="mb-2 last:mb-0">
								<div className="flex items-center gap-1.5 mb-2">
									<Clock className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />
									<span className="text-[10px] font-black uppercase tracking-widest text-foreground/80">
										Sedang Dibuat
									</span>
									<span className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700">
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
									<span className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-emerald-100 px-1.5 text-[11px] font-bold text-emerald-700">
										{completed.length}
									</span>
								</div>
								<ScrollRow>
									{completed.map((o) => (
										<CompactDoneCard
											key={`done-${o.group_type}-${o.order_no}`}
											order={o}
											onClick={(order) => setDetailOrder(order)}
										/>
									))}
								</ScrollRow>
							</div>
						)}
					</>
				)}
			</>)}

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
