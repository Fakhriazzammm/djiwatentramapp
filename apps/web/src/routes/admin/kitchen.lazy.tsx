import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import {
	Check,
	CheckCircle2,
	ChefHat,
	ClipboardList,
	Clock,
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
} from "lucide-react";
import { useMemo } from "react";
import {
	useHybridAllProducts,
	useHybridCategories,
	useHybridInventory,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridRecipes } from "@/hooks/use-hybrid-inventory-admin-data";
import { useHybridTrackOrders } from "@/hooks/use-hybrid-ops-data";
import { FastStockTable } from "@/components/inventory/fast-stock-table";

export const Route = createLazyFileRoute("/admin/kitchen" as any)({
	component: KitchenMonitorPage,
});

function KitchenMonitorPage() {
	const { tab = "orders" } = Route.useSearch() as { tab?: string };
	const orders = useHybridTrackOrders("kitchen");
	
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
						<div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500 uppercase tracking-widest ring-1 ring-slate-200 md:gap-1.5 md:px-3 md:py-1 md:text-[10px]">
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
							className="h-full"
							exit={{ opacity: 0, y: 10 }}
							initial={{ opacity: 0, y: 10 }}
							key="orders-tab"
						>
							<ItemsKanban orders={orders} />
						</motion.div>
					) : (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="p-3 pb-28 md:p-4 md:pb-32"
							exit={{ opacity: 0, y: 10 }}
							initial={{ opacity: 0, y: 10 }}
							key="stock-tab"
						>
\t\t\t\t\t\t\t<FastStockTable categories={allCategories} inventory={inventory} products={products} recipes={recipes} source="/admin/kitchen" placeholder="Cari menu dapur..." />
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

function ItemsKanban({ orders }: { orders: any[] | undefined }) {
	const updateStatus = useHybridUpdateOrderItemStatus();

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
				color="bg-slate-200"
				items={categories.pending}
				label="Antrian"
				onItemAction={(item: KanbanItem) => updateStatus({ orderId: item.orderId, itemIndex: item.originalIndex, status: "preparing" })}
				status="pending"
				textColor="text-slate-600"
			/>
			<KanbanColumn
				color="bg-orange-100"
				items={categories.preparing}
				label="Diproses"
				onItemAction={(item: KanbanItem) => updateStatus({ orderId: item.orderId, itemIndex: item.originalIndex, status: "ready" })}
				status="preparing"
				textColor="text-orange-700"
			/>
			<KanbanColumn
				color="bg-green-100"
				items={categories.ready}
				label="Selesai"
				onItemAction={(item: KanbanItem) => updateStatus({ orderId: item.orderId, itemIndex: item.originalIndex, status: "preparing" })} // Back to prep
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
	onItemAction 
}: { 
	label: string; 
	items: KanbanItem[]; 
	status: string; 
	color: string; 
	textColor: string; 
	onItemAction: (item: KanbanItem) => void;
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
							<KanbanCard item={item} key={`${item.orderId}-${item.originalIndex}`} onAction={() => onItemAction(item)} status={status} />
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
	onAction 
}: { 
	item: KanbanItem; 
	status: string; 
	onAction: () => void; 
}) {
	const minutesAgo = Math.floor((Date.now() - item.orderCreatedAt) / 60000);
	const isLate = minutesAgo > 20;

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
						<div className="mt-1 flex items-center gap-1 font-bold text-[9px] text-slate-400 uppercase tracking-wider md:gap-1.5 md:text-[10px]">
							<span>Meja {item.tableNumber || "Takeaway"}</span>
							<span>•</span>
							<span>#{item.orderNumber.split("-").pop()}</span>
						</div>
					</div>
				</div>
				{status === "pending" && (
					<div className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-black md:px-2 md:text-[9px] ${isLate ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400"}`}>
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
