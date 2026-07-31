import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import {
	Check,
	CheckCircle2,
	ChefHat,
	ClipboardList,
	Circle,
	Clock,
	Flag,
	Wrench,
	Minus,
	Plus,
	RotateCcw,
	Save,
	Search,
	Timer,
	Trash2,
	Utensils,
	XCircle,
	ExternalLink,
	Database,
	Bot as BotIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	useHybridAllProducts,
	useHybridCategories,
	useHybridInventory,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridRecipes } from "@/hooks/use-hybrid-inventory-admin-data";
import { useHybridTrackOrders, useHybridOrderStatus } from "@/hooks/use-hybrid-ops-data";
import { FastStockTable } from "@/components/inventory/fast-stock-table";
import { useHybridUpdateOrderItemStatus } from "@/hooks/use-hybrid-write-actions";
import { createClient } from "@/lib/client";

export const Route = createLazyFileRoute("/admin/kitchen")({
	component: KitchenMonitorPage,
});

function KitchenMonitorPage() {
	const { tab = "orders" } = Route.useSearch() as { tab?: string };
	const orders = useHybridTrackOrders("kitchen");
	const botOrders = useHybridOrderStatus("kitchen");
	
	const allProducts = useHybridAllProducts();
	const allCategories = useHybridCategories();
	const inventory = useHybridInventory();
	const recipes = useHybridRecipes();

	const products = useMemo(() => {
		if (!allProducts || !allCategories) return undefined;
		
		const isKitchenCategory = (catId: any): boolean => {
			const cat = allCategories.find((c: any) => c._id === catId);
			if (!cat) return false;
			// Check if this is the root "Makanan" category
			if (!cat.parentId && cat.name.toLowerCase().includes("makanan")) return true;
			// If it has a parent, check the parent recursively
			if (cat.parentId) return isKitchenCategory(cat.parentId);
			return false;
		};

		return allProducts.filter((p: any) => isKitchenCategory(p.categoryId));
	}, [allProducts, allCategories]);

	return (
		<div className="flex h-full flex-col bg-slate-50">
			{/* Header - App Like */}
			<div className="sticky top-0 z-30 flex flex-col gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur-md md:gap-3 md:px-4 md:py-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="rounded-lg bg-orange-600 p-1.5 text-white shadow-lg shadow-orange-200 md:rounded-xl md:p-2">
							<ChefHat className="h-4 w-4 md:h-5 md:w-5" />
						</div>
						<h1 className="font-black text-lg tracking-tight md:text-xl">Dapur</h1>
					</div>
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500 uppercase tracking-widest ring-1 ring-slate-200 md:gap-1.5 md:px-3 md:py-1 md:text-[10px]">
							<span className="relative flex h-2 w-2">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
								<span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
							</span>
							LIVE
						</div>
					</div>
				</div>

				{/* Tab Selector - App Like */}
				<div className="flex gap-1 rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200 md:rounded-2xl">
					<Link
						className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-bold text-[11px] transition-all md:gap-2 md:rounded-xl md:py-2 md:text-xs ${
							tab === "orders" ? "bg-white shadow-sm ring-1 ring-slate-200" : "text-muted-foreground"
						}`}
						search={{ tab: "orders" } as any}
						to={"/admin/kitchen" as any}
					>
						<ClipboardList className="h-4 w-4" />
						Pesanan
					</Link>
					<Link
						className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-bold text-[11px] transition-all md:gap-2 md:rounded-xl md:py-2 md:text-xs ${
							tab === "stock" ? "bg-white shadow-sm ring-1 ring-slate-200" : "text-muted-foreground"
						}`}
						search={{ tab: "stock" } as any}
						to={"/admin/kitchen" as any}
					>
						<Utensils className="h-4 w-4" />
						Stok
					</Link>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
			<AnimatePresence mode="wait">
					{tab === "orders" ? (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="min-h-full pb-28"
							exit={{ opacity: 0, y: 10 }}
							initial={{ opacity: 0, y: 10 }}
							key="orders-tab"
						>
							<ItemsKanban botOrders={botOrders} orders={orders} />
							<div className="px-3 md:px-4">
								<BotOrdersView orders={botOrders} track="kitchen" />
							</div>
						</motion.div>
					) : (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="p-3 pb-28 md:p-4 md:pb-32"
							exit={{ opacity: 0, y: 10 }}
							initial={{ opacity: 0, y: 10 }}
							key="stock-tab"
						>
							<FastStockTable categories={allCategories} inventory={inventory} products={products} recipes={recipes} source="/admin/kitchen" placeholder="Cari menu dapur..." />
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

interface KanbanItem {
	orderId: any;
	originalIndex: number;
	productName: string;
	quantity: number;
	variant?: string;
	status: string;
	orderNumber: string;
	tableNumber?: string;
	customerName?: string;
	orderCreatedAt: number;
}

function ItemsKanban({ orders, botOrders }: { orders: any[] | undefined; botOrders?: any[] }) {
	const updateStatus = useHybridUpdateOrderItemStatus();

	const safeBotArr = Array.isArray(botOrders) ? botOrders.filter(Boolean) : [];
	const botStatusMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const o of safeBotArr) {
			map.set(o.order_no, o.status);
		}
		return map;
	}, [safeBotArr]);

	// Flatten orders into individual items
	const items = useMemo<KanbanItem[]>(() => {
		if (!orders) return [];
		return orders.flatMap((order) =>
			order.itemsWithMetadata.map((item: any) => ({
				...item,
				orderId: order._id,
				orderNumber: order.orderNumber,
				tableNumber: order.tableNumber,
				customerName: order.customerName,
				orderCreatedAt: order.createdAt,
			}))
		);
	}, [orders]);

	const categories = {
		pending: items.filter((i) => !i.status || i.status === "pending"),
		preparing: items.filter((i) => i.status === "preparing"),
		ready: items.filter((i) => i.status === "ready"),
	};

	if (!orders) {
		return (
			<div className="grid h-full grid-cols-1 gap-3 p-3 md:grid-cols-3 md:gap-4 md:p-4">
				{Array.from({ length: 3 }).map((_, i) => (
					<div className="h-full animate-pulse rounded-[32px] bg-slate-200" key={i} />
				))}
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="flex h-[70vh] flex-col items-center justify-center gap-4 p-6 text-center md:gap-6 md:p-10">
				<div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-slate-400">
					<ClipboardList className="h-10 w-10" />
				</div>
				<div className="space-y-2">
					<h3 className="font-black text-xl text-slate-800 tracking-tight">Tidak Ada Pesanan Aktif</h3>
					<p className="max-w-[280px] font-medium text-slate-500 text-sm leading-relaxed">
						Pesanan pelanggan atau kasir akan muncul di sini secara otomatis.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-nowrap gap-3 overflow-x-auto overflow-y-hidden p-3 snap-x snap-mandatory focus-visible:outline-none scrollbar-hide md:grid md:grid-cols-3 md:gap-4 md:p-4">
			<KanbanColumn
				botStatusMap={botStatusMap}
				color="bg-slate-200"
				items={categories.pending}
				label="Antrian"
				onItemAction={(item: KanbanItem) => updateStatus({ orderId: item.orderId, itemIndex: item.originalIndex, status: "preparing" })}
				status="pending"
				textColor="text-slate-600"
			/>
			<KanbanColumn
				botStatusMap={botStatusMap}
				color="bg-orange-100"
				items={categories.preparing}
				label="Diproses"
				onItemAction={(item: KanbanItem) => updateStatus({ orderId: item.orderId, itemIndex: item.originalIndex, status: "ready" })}
				status="preparing"
				textColor="text-orange-700"
			/>
			<KanbanColumn
				botStatusMap={botStatusMap}
				color="bg-green-100"
				items={categories.ready}
				label="Selesai"
				onItemAction={(item: KanbanItem) => updateStatus({ orderId: item.orderId, itemIndex: item.originalIndex, status: "preparing" })}
				status="ready"
				textColor="text-green-700"
			/>
		</div>
	);
}

function KanbanColumn({ 
	label, 
	items, 
	status, 
	color, 
	textColor, 
	onItemAction,
	botStatusMap,
}: { 
	label: string; 
	items: KanbanItem[]; 
	status: string; 
	color: string; 
	textColor: string; 
	onItemAction: (item: KanbanItem) => void;
	botStatusMap: Map<string, string>;
}) {
	return (
		<div className="flex h-full w-[82vw] max-w-[340px] shrink-0 flex-col gap-2 snap-center sm:w-[72vw] md:w-auto md:max-w-none md:gap-3">
			<div className="flex items-center justify-between px-2">
				<div className="flex items-center gap-2">
					<div className={`h-2.5 w-2.5 rounded-full ${color}`} />
					<h3 className="font-black text-xs text-slate-800 uppercase tracking-widest md:text-sm">{label}</h3>
				</div>
				<span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500 tracking-tight ring-1 ring-slate-200">
					{items.length}
				</span>
			</div>
			
			<div className="flex-1 space-y-2 overflow-y-auto rounded-2xl bg-slate-100/50 p-2 scrollbar-hide md:space-y-3 md:rounded-[32px] md:p-3">
				<LayoutGroup>
					<AnimatePresence>
						{items.map((item) => (
							<KanbanCard botStatusMap={botStatusMap} item={item} key={`${item.orderId}-${item.originalIndex}`} onAction={() => onItemAction(item)} status={status} />
						))}
					</AnimatePresence>
				</LayoutGroup>
			</div>
		</div>
	);
}

function KanbanCard({ 
	item, 
	status, 
	onAction,
	botStatusMap,
}: { 
	item: KanbanItem; 
	status: string; 
	onAction: () => void;
	botStatusMap: Map<string, string>;
}) {
	const minutesAgo = Math.floor((Date.now() - item.orderCreatedAt) / 60000);
	const isLate = minutesAgo > 20;
	const botStatus = botStatusMap.get(item.orderNumber) || null;

	const botBadge = botStatus === "new" ? { label: "Baru", icon: Circle, class: "bg-amber-100 text-amber-700" }
		: botStatus === "dibuat" ? { label: "Dibuat", icon: Wrench, class: "bg-indigo-100 text-indigo-700" }
		: botStatus === "selesai" ? { label: "Selesai", icon: CheckCircle2, class: "bg-green-100 text-green-700" }
		: null;
	const BotBadgeIcon = botBadge?.icon;

	return (
		<motion.div
			animate={{ opacity: 1, scale: 1, y: 0 }}
			className="group relative flex flex-col overflow-hidden rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/60 transition-all hover:shadow-md active:scale-[0.98] md:rounded-[24px] md:p-4"
			exit={{ opacity: 0, scale: 0.9, y: 10 }}
			initial={{ opacity: 0, scale: 0.95, y: -10 }}
			layout
		>
			<div className="flex items-start justify-between">
				<div className="flex items-center gap-2.5">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white font-black text-xs shadow-lg shadow-slate-200 md:h-8 md:w-8 md:rounded-xl md:text-sm">
						{item.quantity}x
					</div>
					<div>
						<h4 className="font-bold text-slate-800 leading-tight">{item.productName}</h4>
						<div className="mt-1 flex items-center gap-1 font-bold text-[11px] text-slate-400 uppercase tracking-wider md:gap-1.5 md:text-[10px]">
							<span>Meja {item.tableNumber || "Takeaway"}</span>
							<span>•</span>
							<span>#{item.orderNumber.split("-").pop()}</span>
							{botBadge && BotBadgeIcon && (
								<span className={`ml-1 inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] ${botBadge.class}`}><BotBadgeIcon className="h-2.5 w-2.5" aria-hidden="true" />{botBadge.label}</span>
							)}
						</div>
					</div>
				</div>
				{status === "pending" && (
					<div className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-black md:px-2 md:text-[11px] ${isLate ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400"}`}>
						<Clock className="h-3 w-3" />
						{minutesAgo}m
					</div>
				)}
			</div>

			{item.variant && (
				<div className="mt-2 rounded-lg bg-orange-50/50 p-1.5 text-[10px] font-bold text-orange-800 italic ring-1 ring-orange-100/50 md:mt-3 md:rounded-xl md:p-2 md:text-[11px]">
					{item.variant}
				</div>
			)}

			<div className="mt-3 flex gap-2 md:mt-4">
				<button
					className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 font-black text-[10px] uppercase tracking-widest transition-all md:gap-2 md:rounded-2xl md:py-3 md:text-[11px] ${
						status === "pending" 
							? "bg-orange-600 text-white shadow-lg shadow-orange-100" 
							: status === "preparing"
							? "bg-green-500 text-white shadow-lg shadow-green-100"
							: "bg-slate-100 text-slate-400"
					}`}
					onClick={onAction}
					type="button"
				>
					{status === "pending" ? (
						<>PROSES</>
					) : status === "preparing" ? (
						<>SELESAI</>
					) : (
						<><RotateCcw className="h-3.5 w-3.5" /> ULANG</>
					)}
				</button>
			</div>
		</motion.div>
	);
}

function BotOrdersView({ orders, track }: { orders: any[]; track: string }) {
	const supabase = createClient();
	const [refreshing, setRefreshing] = useState(false);

	const updateStatus = async (orderNo: string, status: string) => {
		setRefreshing(true);
		try {
			const now = new Date().toISOString();
			const payload: any = { status, updated_at: now };
			if (status === "dibuat") payload.dibuat_at = now;
			if (status === "selesai") payload.selesai_at = now;
			const { error } = await supabase
				.from("pos_order_status")
				.update(payload)
				.eq("order_no", orderNo)
				.eq("group_type", track);
			if (error) console.error("Update error:", error);
		} catch (e) {
			console.error(e);
		}
		setRefreshing(false);
	};

	const safeArr = Array.isArray(orders) ? orders.filter(Boolean) : [];

	if (safeArr.length === 0) {
		return (
			<div className="flex h-[30vh] flex-col items-center justify-center gap-3 text-center">
				<div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-300">
					<BotIcon className="h-6 w-6" />
				</div>
				<div className="space-y-1">
					<h3 className="font-black text-base text-slate-600">Tidak Ada Notifikasi Bot</h3>
					<p className="max-w-[260px] font-medium text-slate-400 text-xs">
						Notifikasi dari Telegram Bot akan muncul di sini.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-3 pt-4">
			<div className="flex items-center justify-between">
				<h3 className="font-black text-sm text-slate-500 uppercase tracking-widest">
					Status Bot — {track === "barista" ? "Barista" : "Kitchen"}
				</h3>
				<span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">
					{safeArr.length}
				</span>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{safeArr.map((order: any) => {
					const items = typeof order.items === "string" ? JSON.parse(order.items) : (order.items ?? []);
					const itemSummary = Array.isArray(items) ? items.map((i: any) => `${i.qty || "?"}× ${i.name || "?"}`).join(", ") : "";
					const createdAt = order.created_at ? new Date(order.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }) : "-";
					const dibuatAt = order.dibuat_at ? new Date(order.dibuat_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }) : null;
					const selesaiAt = order.selesai_at ? new Date(order.selesai_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }) : null;

					const statusColors: Record<string, string> = {
						new: "border-l-4 border-l-amber-400 bg-amber-50/50",
						dibuat: "border-l-4 border-l-indigo-400 bg-indigo-50/50",
						selesai: "border-l-4 border-l-green-400 bg-green-50/50 opacity-70",
					};
					const statusBadge: Record<string, { label: string; icon: typeof Circle; class: string }> = {
						new: { label: "Baru", icon: Circle, class: "bg-amber-100 text-amber-800" },
						dibuat: { label: "Dibuat", icon: Wrench, class: "bg-indigo-100 text-indigo-800" },
						selesai: { label: "Selesai", icon: CheckCircle2, class: "bg-green-100 text-green-800" },
					};
					const badge = statusBadge[order.status] || statusBadge.new;
					const StatusIcon = badge.icon;

					const timerText = order.status === "new"
						? "Klik tombol Dibuat atau otomatis dalam 10 detik"
						: order.status === "dibuat"
							? "Klik tombol Selesai atau otomatis dalam 10 menit"
							: null;

					return (
						<div
							className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60 ${statusColors[order.status] || ""}`}
							key={order.id || order.order_no}
						>
							<div className="flex items-start justify-between">
								<div>
									<h4 className="font-black text-sm text-slate-800">#{order.order_no}</h4>
									<span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${badge.class}`}>
										<StatusIcon className="h-3 w-3" aria-hidden="true" />{badge.label}
									</span>
								</div>
								<span className="text-[10px] font-bold text-slate-400">{createdAt}</span>
							</div>
							{itemSummary && (
								<p className="mt-2 text-[11px] font-medium text-slate-500 leading-relaxed">{itemSummary}</p>
							)}
							{timerText && (
								<p className="mt-1.5 text-[10px] font-bold text-slate-400 italic">{timerText}</p>
							)}
							{order.dibuat_by && (
								<p className="mt-1 text-[10px] font-bold text-indigo-600">
									Dibuat oleh: {order.dibuat_by} {dibuatAt ? <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" aria-hidden="true" />{dibuatAt}</span> : null}
								</p>
							)}
							{order.selesai_by && (
								<p className="mt-1 text-[10px] font-bold text-green-600">
									Selesai oleh: {order.selesai_by} {selesaiAt ? <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" aria-hidden="true" />{selesaiAt}</span> : null}
								</p>
							)}
							{order.status !== "selesai" && (
								<div className="mt-3 flex gap-2">
									{order.status === "new" && (
										<button
											className="flex-1 rounded-xl bg-indigo-600 py-2 text-[10px] font-black text-white uppercase tracking-widest transition-all hover:bg-indigo-700 disabled:opacity-50"
											disabled={refreshing}
											onClick={() => updateStatus(order.order_no, "dibuat")}
										>
											<CheckCircle2 className="mr-1 inline h-3 w-3" aria-hidden="true" /> Dibuat
										</button>
									)}
									{(order.status === "new" || order.status === "dibuat") && (
										<button
											className="flex-1 rounded-xl bg-green-500 py-2 text-[10px] font-black text-white uppercase tracking-widest transition-all hover:bg-green-600 disabled:opacity-50"
											disabled={refreshing}
											onClick={() => updateStatus(order.order_no, "selesai")}
										>
											<Flag className="mr-1 inline h-3 w-3" aria-hidden="true" /> Selesai
										</button>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
