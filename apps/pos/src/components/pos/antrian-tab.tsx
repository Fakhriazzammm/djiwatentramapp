import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Clock, Coffee, ChefHat, Loader2, CheckCircle2, Timer, User, ChevronDown, Pencil, AlertCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useHybridOrderStatus, useHybridShiftStatus } from "@/hooks/use-hybrid-pos-data";
import type { OrderStatusRecord } from "@/hooks/use-hybrid-pos-data";
import { useHybridWriteOrderStatus, useHybridUpdateOrderStaff } from "@/hooks/use-hybrid-write-actions";

function formatTimeAgo(isoStr?: string | null): string {
	if (!isoStr) return "--";
	const then = new Date(isoStr.replace("Z", "+00:00")).getTime();
	const now = Date.now();
	const diff = Math.floor((now - then) / 60000);
	if (diff < 1) return "Baru saja";
	if (diff < 60) return `${diff}m`;
	const h = Math.floor(diff / 60);
	const m = diff % 60;
	return `${h}j ${m}m`;
}

function formatTimeFull(isoStr?: string | null): string {
	if (!isoStr) return "-";
	const d = new Date(isoStr.replace("Z", "+00:00"));
	return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) +
		" · " + d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

// ── Edit window: 60 menit setelah selesai ──
const EDIT_WINDOW_MS = 60 * 60 * 1000;

function isWithinEditWindow(selesai_at?: string | null): boolean {
	if (!selesai_at) return true; // belum selesai → selalu bisa
	const selesai = new Date(selesai_at.replace("Z", "+00:00")).getTime();
	return (Date.now() - selesai) < EDIT_WINDOW_MS;
}

// ── Countdown sisa waktu edit ──
function EditTimeLeft({ selesai_at }: { selesai_at?: string | null }) {
	const calcRemaining = useCallback(() => {
		if (!selesai_at) return EDIT_WINDOW_MS;
		const selesai = new Date(selesai_at.replace("Z", "+00:00")).getTime();
		return Math.max(0, EDIT_WINDOW_MS - (Date.now() - selesai));
	}, [selesai_at]);

	const [remaining, setRemaining] = useState(calcRemaining);

	useEffect(() => {
		const interval = setInterval(() => {
			setRemaining(calcRemaining());
		}, 1000);
		return () => clearInterval(interval);
	}, [calcRemaining]);

	const minutes = Math.floor(remaining / 60000);
	const seconds = Math.floor((remaining % 60000) / 1000);
	const pct = (remaining / EDIT_WINDOW_MS) * 100;
	const isUrgent = remaining < 300000; // < 5 menit
	const isWarning = remaining < 600000; // < 10 menit

	if (remaining <= 0) return null;

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between text-[11px]">
				<span className="text-muted-foreground">Sisa waktu edit</span>
				<span className={cn(
					"font-mono font-bold tabular-nums",
					isUrgent ? "text-red-500" : isWarning ? "text-amber-500" : "text-emerald-500"
				)}>
					{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
				</span>
			</div>
			<div className="h-1 w-full rounded-full bg-muted overflow-hidden">
				<div
					className={cn(
						"h-full rounded-full transition-all duration-1000",
						isUrgent ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
					)}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

// ── Countdown timer before auto-process (300 detik) ──
const AUTO_PROCESS_SECONDS = 300;

function AutoCountdown({ created_at }: { created_at?: string | null }) {
	const calcRemaining = useCallback(() => {
		if (!created_at) return 0;
		const created = new Date(created_at.replace("Z", "+00:00")).getTime();
		const deadline = created + AUTO_PROCESS_SECONDS * 1000;
		const remaining = Math.ceil((deadline - Date.now()) / 1000);
		return Math.max(0, remaining);
	}, [created_at]);

	const [remaining, setRemaining] = useState(calcRemaining);

	useEffect(() => {
		if (remaining <= 0) return;
		const interval = setInterval(() => {
			const r = calcRemaining();
			setRemaining(r);
			if (r <= 0) clearInterval(interval);
		}, 1000);
		return () => clearInterval(interval);
	}, [calcRemaining, remaining]);

	if (remaining <= 0) return null;

	const minutes = Math.floor(remaining / 60);
	const seconds = remaining % 60;
	const isUrgent = remaining < 60;

	return (
		<span className={cn(
			"inline-flex items-center gap-1 text-[10px] font-mono tabular-nums",
			isUrgent ? "text-red-500 font-bold" : "text-muted-foreground",
		)}>
			<AlertCircle className={cn("h-3 w-3", isUrgent && "animate-pulse")} />
			Otomatis {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
		</span>
	);
}

function getStatusBadge(status: string) {
	switch (status) {
		case "new":
			return { label: "Baru", color: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500 animate-pulse" };
		case "dibuat":
			return { label: "Dibuat", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" };
		case "selesai":
			return { label: "Selesai", color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
		default:
			return { label: status, color: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
	}
}

// ── Staff Dropdown (compact) ──
function StaffPicker({
	staffList,
	selected,
	onSelect,
	position = "up",
}: {
	staffList: string[];
	selected: string;
	onSelect: (name: string) => void;
	position?: "up" | "down";
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useMemo(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	return (
		<div className="relative inline-block" ref={ref}>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
			>
				<User className="h-3 w-3 shrink-0" />
				<span className="truncate max-w-[80px]">{selected || "Pilih"}</span>
				<ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} />
			</button>
			{open && (
				<div className={cn(
					"absolute z-50 min-w-[140px] rounded-lg border bg-popover p-1 shadow-lg",
					position === "up" ? "bottom-full left-0 mb-1" : "top-full left-0 mt-1"
				)}>
					{staffList.length > 0 ? (
						staffList.map((name) => (
							<button
								key={name}
								type="button"
								onClick={() => { onSelect(name); setOpen(false); }}
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
									selected === name
										? "bg-primary/10 text-primary font-semibold"
										: "hover:bg-muted text-foreground"
								)}
							>
								<User className="h-3 w-3 shrink-0" />
								{name}
							</button>
						))
					) : (
						<p className="px-2 py-1.5 text-xs text-muted-foreground text-center">Tidak ada staff</p>
					)}
				</div>
			)}
		</div>
	);
}

// ── Detail Modal for Completed Orders ──
function CompletedDetailModal({
	order,
	onDutyStaff,
	onClose,
	onSave,
	saving,
	canEdit = true,
}: {
	order: OrderStatusRecord;
	onDutyStaff: string[];
	onClose: () => void;
	onSave: (dibuatBy: string | null, selesaiBy: string | null) => void;
	saving: boolean;
	canEdit?: boolean;
}) {
	const [dibuatBy, setDibuatBy] = useState(order.dibuat_by || "");
	const [selesaiBy, setSelesaiBy] = useState(order.selesai_by || "");

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						{order.group_type === "barista" ? <Coffee className="h-4 w-4 text-amber-600" /> : <ChefHat className="h-4 w-4 text-orange-600" />}
						<span className="font-mono">{order.order_no}</span>
						<span className="text-[10px] font-bold uppercase rounded-full border border-emerald-200 bg-emerald-100 text-emerald-700 px-2 py-0.5">🏁 Selesai</span>
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-3">
					{/* Info */}
					<div className="grid grid-cols-2 gap-2 text-xs">
						<div className="text-muted-foreground">Dibuat</div>
						<div className="text-right">{formatTimeFull(order.dibuat_at)}</div>
						<div className="text-muted-foreground">Selesai</div>
						<div className="text-right">{formatTimeFull(order.selesai_at)}</div>
					</div>

					{/* Sisa waktu edit */}
					<EditTimeLeft selesai_at={order.selesai_at} />

					{canEdit ? (
						<>
							{/* Edit Staff: dibuat_by */}
							<div className="space-y-1">
								<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
									Diproses oleh
								</label>
								<div className="flex items-center gap-2">
									<div className="flex-1">
										<StaffPicker
											staffList={onDutyStaff}
											selected={dibuatBy}
											onSelect={setDibuatBy}
											position="down"
										/>
									</div>
									{dibuatBy !== (order.dibuat_by || "") && (
										<span className="text-[9px] text-amber-600 font-medium">berubah</span>
									)}
								</div>
							</div>

							{/* Edit Staff: selesai_by */}
							<div className="space-y-1">
								<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
									Diselesaikan oleh
								</label>
								<div className="flex items-center gap-2">
									<div className="flex-1">
										<StaffPicker
											staffList={onDutyStaff}
											selected={selesaiBy}
											onSelect={setSelesaiBy}
											position="down"
										/>
									</div>
									{selesaiBy !== (order.selesai_by || "") && (
										<span className="text-[9px] text-amber-600 font-medium">berubah</span>
									)}
								</div>
							</div>
						</>
					) : (
						<div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-center">
							<Lock className="h-4 w-4 mx-auto text-muted-foreground/60 mb-1" />
							<p className="text-[11px] font-medium text-muted-foreground">Waktu edit sudah habis</p>
							<p className="text-[9px] text-muted-foreground/60 mt-0.5">Edit hanya berlaku 60 menit setelah pesanan selesai</p>
						</div>
					)}

					{/* Actions */}
					<div className="flex gap-2 pt-1">
						<Button variant="outline" size="sm" className="flex-1" onClick={onClose}>
							Tutup
						</Button>
						{canEdit && (
							<Button
								size="sm"
								className="flex-1"
								disabled={saving}
								onClick={() => onSave(dibuatBy || null, selesaiBy || null)}
							>
								{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
								Simpan
							</Button>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ── Order Card ──
function OrderCard({
order,
onDutyStaff,
onUpdate,
updating,
onShowDetail,
canEdit = true,
}: {
order: OrderStatusRecord;
onDutyStaff: string[];
onUpdate: (orderNo: string, groupType: "barista" | "kitchen", status: "dibuat" | "selesai", by: string) => void;
updating: boolean;
onShowDetail?: (order: OrderStatusRecord) => void;
canEdit?: boolean;
}) {
	const badge = getStatusBadge(order.status);
	const isNew = order.status === "new";
	const isDibuat = order.status === "dibuat";
	const isSelesai = order.status === "selesai";

	// Untuk order BARU: staff picker untuk pilih nama sebelum klik Proses
	const fromDb = order.dibuat_by && order.dibuat_by !== "Otomatis";
	const [cardStaff, setCardStaff] = useState(onDutyStaff[0] || "Staff");

	// Saat shift berganti, reset pilihan staff
	useEffect(() => {
		if (isNew && onDutyStaff.length > 0) {
			setCardStaff(onDutyStaff[0]);
		}
	}, [onDutyStaff[0], isNew]);

	return (
		<div
			className={cn(
				"rounded-xl border p-3 transition-all",
				isSelesai
					? "border-emerald-100 bg-emerald-50/30 opacity-60 cursor-pointer hover:opacity-80 hover:shadow-sm"
					: isDibuat
						? "border-amber-200 bg-amber-50/30 shadow-sm"
						: "border-blue-200 bg-white shadow-sm",
			)}
			onClick={isSelesai && canEdit && onShowDetail ? () => onShowDetail(order) : undefined}
		>
			<div className="flex items-start justify-between mb-2">
				<div className="flex items-center gap-1.5 min-w-0">
					<span className="font-mono font-bold text-xs truncate">{order.order_no}</span>
					<div className={cn("h-1.5 w-1.5 rounded-full shrink-0", badge.dot)} />
				</div>
				<div className="flex items-center gap-1 shrink-0">
						{isSelesai && canEdit && <Pencil className="h-2.5 w-2.5 text-muted-foreground/50" />}
					{isSelesai && !canEdit && <Lock className="h-2.5 w-2.5 text-muted-foreground/30" />}
					<Timer className="h-3 w-3 text-muted-foreground" />
					<span className="text-[10px] font-medium text-muted-foreground">
						{formatTimeAgo(order.created_at)}
					</span>
				</div>
			</div>

			<div className="flex items-center gap-2 mb-2.5 flex-wrap">
				<span
					className={cn(
						"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
						badge.color,
					)}
				>
					{order.status === "selesai" ? "🏁" : order.status === "dibuat" ? "✅" : "🆕"} {badge.label}
				</span>

				{/* KASUS 1: Baru — belum ada dari database → tampilkan dropdown + countdown */}
				{isNew && !fromDb && (
					<>
						<StaffPicker
							staffList={onDutyStaff}
							selected={cardStaff}
							onSelect={(name) => setCardStaff(name)}
						/>
						<AutoCountdown created_at={order.created_at} />
					</>
				)}

				{/* KASUS 2: Ada data dari database (Telegram sudah klik) → tampilkan nama read-only */}
				{fromDb && (
					<span className="text-[10px] text-muted-foreground flex items-center gap-1">
						<User className="h-3 w-3" /> {order.dibuat_by}
					</span>
				)}

				{/* Status "Dibuat" — nama dari DB */}
				{isDibuat && !fromDb && (
					<span className="text-[10px] text-muted-foreground/50 flex items-center gap-1 italic">
						{order.dibuat_by || cardStaff}
					</span>
				)}

				{/* Selesai — tampilkan selesai_by */}
				{isSelesai && order.selesai_by && order.selesai_by !== "Otomatis" && (
					<span className="text-[10px] text-muted-foreground flex items-center gap-1">
						<CheckCircle2 className="h-3 w-3 text-emerald-500" /> {order.selesai_by}
					</span>
				)}
			</div>

			{/* Time info — seperti di Telegram */}
			<div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t border-border/40 pt-2 mt-1">
				<span className="flex items-center gap-1">
					<span className="font-medium text-foreground/70">Dibuat</span>
					{formatTimeAgo(order.created_at)}
				</span>
				{isSelesai && order.selesai_at && (
					<span className="flex items-center gap-1">
						<span className="font-medium text-foreground/70">Selesai</span>
						{formatTimeAgo(order.selesai_at)}
					</span>
				)}
			</div>

			{!isSelesai && (
				<div className="flex gap-2 mt-1">
					{isNew && !fromDb && (
						<Button
							size="sm"
							variant="default"
							className="flex-1 h-8 text-[11px] font-bold"
							onClick={(e) => { e.stopPropagation(); onUpdate(order.order_no, order.group_type, "dibuat", cardStaff); }}
							disabled={updating || !cardStaff}
						>
							{updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
							Proses
						</Button>
					)}
					{isNew && fromDb && (
						<Button
							size="sm"
							variant="default"
							className="flex-1 h-8 text-[11px] font-bold bg-amber-500 hover:bg-amber-600"
							onClick={(e) => { e.stopPropagation(); onUpdate(order.order_no, order.group_type, "selesai", order.dibuat_by || "Staff"); }}
							disabled={updating}
						>
							{updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
							Selesai
						</Button>
					)}
					{isDibuat && (
						<Button
							size="sm"
							variant="default"
							className="flex-1 h-8 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700"
							onClick={(e) => { e.stopPropagation(); onUpdate(order.order_no, order.group_type, "selesai", order.dibuat_by || cardStaff); }}
							disabled={updating}
						>
							{updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
							Selesai
						</Button>
					)}
				</div>
			)}
		</div>
	);
}

// ── Main Antrian Tab ──
export function AntrianTab({ onClose }: { onClose?: () => void }) {
	const orders = useHybridOrderStatus();
	const shiftStatus = useHybridShiftStatus();
	const { updateStatus } = useHybridWriteOrderStatus();
	const { updateStaff, saving } = useHybridUpdateOrderStaff();
	const [updatingOrders, setUpdatingOrders] = useState<Set<string>>(new Set());
	const [detailOrder, setDetailOrder] = useState<OrderStatusRecord | null>(null);

	// Parse on-duty staff from shift
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

	// Group by type
	const { baristaActive, kitchenActive, baristaDone, kitchenDone, totalActive } = useMemo(() => {
		if (!orders) return { baristaActive: [], kitchenActive: [], baristaDone: [], kitchenDone: [], totalActive: 0 };

		const barista: OrderStatusRecord[] = [];
		const kitchen: OrderStatusRecord[] = [];
		const baristaDoneList: OrderStatusRecord[] = [];
		const kitchenDoneList: OrderStatusRecord[] = [];

		for (const o of orders) {
			if (o.status === "selesai") {
				if (o.group_type === "barista") baristaDoneList.push(o);
				else kitchenDoneList.push(o);
			} else {
				if (o.group_type === "barista") barista.push(o);
				else kitchen.push(o);
			}
		}

		return {
			baristaActive: barista.slice(0, 20),
			kitchenActive: kitchen.slice(0, 20),
			baristaDone: baristaDoneList.slice(0, 5),
			kitchenDone: kitchenDoneList.slice(0, 5),
			totalActive: barista.length + kitchen.length,
		};
	}, [orders]);

	const handleUpdate = async (
		orderNo: string,
		groupType: "barista" | "kitchen",
		status: "dibuat" | "selesai",
		by: string,
	) => {
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
	};

	const handleSaveStaff = async (dibuatBy: string | null, selesaiBy: string | null) => {
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
	};

	if (orders === undefined) {
		return (
			<div className="flex flex-col items-center justify-center py-16 gap-3">
				<Loader2 className="h-6 w-6 animate-spin text-primary" />
				<p className="text-xs text-muted-foreground">Memuat antrian...</p>
			</div>
		);
	}

	return (
		<>
			<div className="space-y-3">
				{/* Summary */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<span className="text-sm font-bold">Antrian Produksi</span>
						{totalActive > 0 && (
							<span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
								{totalActive}
							</span>
						)}
					</div>
					{onClose && (
						<button
							onClick={onClose}
							className="text-[10px] text-muted-foreground hover:text-foreground font-medium"
							type="button"
						>
							Tutup
						</button>
					)}
				</div>

				{totalActive === 0 ? (
					<div className="rounded-xl border border-dashed border-border py-10 text-center">
						<CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
						<p className="text-sm font-medium text-muted-foreground">Semua pesanan selesai ✅</p>
						<p className="text-[10px] text-muted-foreground/60 mt-0.5">Tidak ada antrian aktif</p>
					</div>
				) : (
					<>
						{/* Barista Section */}
						{baristaActive.length > 0 && (
							<div className="space-y-2">
								<div className="flex items-center gap-1.5">
									<Coffee className="h-3.5 w-3.5 text-amber-600" />
									<span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Barista</span>
									<span className="text-[10px] text-muted-foreground">({baristaActive.length})</span>
								</div>
								<div className="grid gap-2">
									{baristaActive.map((o) => (
										<OrderCard
											key={`barista-${o.order_no}`}
											order={o}
											onDutyStaff={onDutyStaff}
											onUpdate={handleUpdate}
											updating={updatingOrders.has(`${o.order_no}-${o.group_type}-dibuat`) || updatingOrders.has(`${o.order_no}-${o.group_type}-selesai`)}
											canEdit={isWithinEditWindow(o.selesai_at)}
											/>
											))}
											</div>
											</div>
											)}

											{/* Kitchen Section */}
											{kitchenActive.length > 0 && (
											<div className="space-y-2">
											<div className="flex items-center gap-1.5">
											<ChefHat className="h-3.5 w-3.5 text-orange-600" />
											<span className="text-[11px] font-bold uppercase tracking-wider text-orange-700">Kitchen</span>
											<span className="text-[10px] text-muted-foreground">({kitchenActive.length})</span>
											</div>
											<div className="grid gap-2">
											{kitchenActive.map((o) => (
											<OrderCard
											key={`kitchen-${o.order_no}`}
											order={o}
											onDutyStaff={onDutyStaff}
											onUpdate={handleUpdate}
											updating={updatingOrders.has(`${o.order_no}-${o.group_type}-dibuat`) || updatingOrders.has(`${o.order_no}-${o.group_type}-selesai`)}
											canEdit={isWithinEditWindow(o.selesai_at)}
											/>
									))}
								</div>
							</div>
						)}
					</>
				)}

				{/* Recent completed — clickable */}
				{(baristaDone.length > 0 || kitchenDone.length > 0) && (
					<div className="pt-2 border-t border-border/50">
						<div className="flex items-center gap-1 mb-2">
							<CheckCircle2 className="h-3 w-3 text-emerald-500" />
							<span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
								Selesai ({baristaDone.length + kitchenDone.length})
							</span>
						</div>
						<div className="space-y-1">
							{[...baristaDone, ...kitchenDone].slice(0, 5).map((o) => (
								<div
									key={`done-${o.group_type}-${o.order_no}`}
									className="flex items-center justify-between rounded-lg bg-muted/30 px-2.5 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
									onClick={() => isWithinEditWindow(o.selesai_at) && setDetailOrder(o)}
								>
									<div className="flex items-center gap-2 min-w-0">
										{o.group_type === "barista" ? (
											<Coffee className="h-3 w-3 shrink-0 text-amber-500/60" />
										) : (
											<ChefHat className="h-3 w-3 shrink-0 text-orange-500/60" />
										)}
										<span className="font-mono text-[10px] font-medium truncate">{o.order_no}</span>
										<span className="text-[9px] text-muted-foreground/60">• {o.selesai_by || "?"}</span>
									</div>
									<div className="flex items-center gap-1.5">
										<span className="text-[9px] text-muted-foreground">{formatTimeAgo(o.selesai_at)}</span>
										<Pencil className="h-2.5 w-2.5 text-muted-foreground/40" />
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			{/* Detail Modal */}
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
