import { AnimatePresence, motion } from "framer-motion";
import { ChefHat, Coffee, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { getDisplayOrderNumber } from "@yumipos/web-shared/lib/order-number";
import { useHybridOrderStatus, useHybridShiftStatus, type OrderStatusRecord } from "@/hooks/use-hybrid-pos-data";
import { useHybridWriteOrderStatus } from "@/hooks/use-hybrid-write-actions";
import { IOS_SPRING, IosSegmented, IosSheet, StatusPill, listItemMotion } from "./ios-kit";

export function formatAgo(iso?: string | null): string {
	if (!iso) return "--";
	const then = new Date(iso.replace("Z", "+00:00")).getTime();
	const minutes = Math.floor((Date.now() - then) / 60000);
	if (minutes < 1) return "Baru saja";
	if (minutes < 60) return `${minutes}m`;
	return `${Math.floor(minutes / 60)}j ${minutes % 60}m`;
}

/** Data antrian produksi (barista/kitchen) + aksi ubah status. Logika sama dengan bar antrian lama. */
export function useProductionQueue() {
	const orders = useHybridOrderStatus();
	const shiftStatus = useHybridShiftStatus();
	const { updateStatus } = useHybridWriteOrderStatus();
	const [updating, setUpdating] = useState<Set<string>>(new Set());

	const defaultStaff = useMemo(() => {
		const cashier = shiftStatus?.ongoingShift?.cashierName || shiftStatus?.shiftInfo?.cashierName;
		const team = String(shiftStatus?.ongoingShift?.teamMembers ?? "").split(/[,\n;|]/g).map((name) => name.trim()).filter(Boolean);
		return cashier?.trim() || team[0] || "Kasir";
	}, [shiftStatus?.ongoingShift?.cashierName, shiftStatus?.ongoingShift?.teamMembers, shiftStatus?.shiftInfo?.cashierName]);

	const { active, done } = useMemo(() => {
		const active: OrderStatusRecord[] = [];
		const done: OrderStatusRecord[] = [];
		for (const order of orders ?? []) (order.status === "selesai" ? done : active).push(order);
		return { active: active.slice(0, 30), done: done.slice(0, 30) };
	}, [orders]);

	const advance = useCallback(
		async (order: OrderStatusRecord) => {
			const next = order.status === "new" ? "dibuat" : "selesai";
			const key = `${order.order_no}-${order.group_type}`;
			setUpdating((prev) => new Set(prev).add(key));
			try {
				const by = order.dibuat_by && order.dibuat_by !== "Otomatis" ? order.dibuat_by : defaultStaff;
				const result = await updateStatus({ order_no: order.order_no, group_type: order.group_type, status: next, by });
				if (result.success) toast.success(`#${getDisplayOrderNumber(order.order_no, { createdAt: order.created_at ? Date.parse(order.created_at) : undefined })} — ${next === "dibuat" ? "Diproses" : "Selesai"}`);
				else toast.error(result.error || "Gagal update status");
			} finally {
				setUpdating((prev) => {
					const nextSet = new Set(prev);
					nextSet.delete(key);
					return nextSet;
				});
			}
		},
		[defaultStaff, updateStatus],
	);

	return { active, done, advance, updating, loading: orders === undefined };
}

type Queue = ReturnType<typeof useProductionQueue>;

export function QueueSheet({ open, onClose, initialTab = "active", queue }: { open: boolean; onClose: () => void; initialTab?: "active" | "done"; queue: Queue }) {
	const [tab, setTab] = useState<"active" | "done">(initialTab);
	const [lastOpen, setLastOpen] = useState(open);
	if (open !== lastOpen) {
		setLastOpen(open);
		if (open) setTab(initialTab);
	}
	const list = tab === "active" ? queue.active : queue.done;
	return (
		<IosSheet open={open} onClose={onClose} title="Pesanan" heightClass="h-[72dvh]">
			<IosSegmented
				id="queue-tab"
				value={tab}
				onChange={setTab}
				options={[
					{ value: "active", label: `Antrian ${queue.active.length}` },
					{ value: "done", label: `Selesai ${queue.done.length}` },
				]}
			/>
			<div className="mt-3 space-y-2.5 pb-4">
				{queue.loading ? <p className="py-10 text-center text-sm text-muted-foreground">Memuat antrian…</p> : null}
				<AnimatePresence initial={false} mode="popLayout">
					{list.map((order, index) => {
						const key = `${order.order_no}-${order.group_type}`;
						const busy = queue.updating.has(key);
						const isNew = order.status === "new";
						return (
							<motion.div key={key} layout {...listItemMotion(index)} className="rounded-2xl border border-border bg-card p-3">
								<div className="flex items-center justify-between text-[13px] font-bold">
									<span className="flex items-center gap-1.5">
										{order.group_type === "barista" ? <Coffee className="h-4 w-4 text-amber-600" aria-hidden="true" /> : <ChefHat className="h-4 w-4 text-orange-600" aria-hidden="true" />}
										{getDisplayOrderNumber(order.order_no, { createdAt: order.created_at ? Date.parse(order.created_at) : undefined })}
									</span>
									<span className="text-muted-foreground">{formatAgo(tab === "done" ? order.selesai_at : order.created_at)}</span>
								</div>
								{order.items?.length ? <p className="mt-1.5 line-clamp-2 text-[13px] text-muted-foreground">{order.items.map((item: any) => `${item.quantity ?? 1}× ${item.name ?? item.productName ?? ""}`).join(", ")}</p> : null}
								<div className="mt-2.5 flex items-center justify-between">
									{tab === "done" ? <StatusPill tone="ok">Selesai</StatusPill> : <StatusPill tone={isNew ? "info" : "warn"}>{isNew ? "Baru" : "Diproses"}</StatusPill>}
									{tab === "active" ? (
										<motion.button
											type="button"
											whileTap={{ scale: 0.94 }}
											transition={IOS_SPRING}
											disabled={busy}
											onClick={() => void queue.advance(order)}
											className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
										>
											{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
											{isNew ? "Proses" : "Selesai"}
										</motion.button>
									) : (
										<span className="text-[12px] text-muted-foreground">{order.selesai_by && order.selesai_by !== "Otomatis" ? order.selesai_by : ""}</span>
									)}
								</div>
							</motion.div>
						);
					})}
				</AnimatePresence>
				{!queue.loading && list.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">{tab === "active" ? "Tidak ada antrian" : "Belum ada yang selesai"}</p> : null}
			</div>
		</IosSheet>
	);
}
