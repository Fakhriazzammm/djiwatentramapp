import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	Beer,
	Check,
	CheckCircle2,
	ClipboardList,
	Clock,
	RotateCcw,
	Search,
	Timer,
	Utensils,
	XCircle,
} from "lucide-react";
import { useState } from "react";

export const Route = createLazyFileRoute("/admin/bar")({
	component: BarMonitorPage,
});

function BarMonitorPage() {
	const [activeTab, setActiveTab] = useState<"orders" | "stock">("orders");
	const orders = useQuery(api.kitchenBar.getTrackOrders, { track: "bar" });
	const products = useQuery(api.kitchenBar.getTrackProducts, { track: "bar" });

	return (
		<div className="flex h-full flex-col bg-background">
			{/* Header - In Admin, we use tabs similar to other admin pages */}
			<div className="mb-4 flex items-center justify-between overflow-x-auto border-border border-b pb-1">
				<div className="flex gap-1 md:gap-2">
					<button
						className={`relative whitespace-nowrap px-3 py-2 font-bold text-xs transition-colors md:px-4 md:text-sm ${
							activeTab === "orders"
								? "text-primary"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => setActiveTab("orders")}
						type="button"
					>
						Pesanan Bar
						{activeTab === "orders" && (
							<motion.div
								className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
								layoutId="activeTabBar"
							/>
						)}
					</button>
					<button
						className={`relative whitespace-nowrap px-3 py-2 font-bold text-xs transition-colors md:px-4 md:text-sm ${
							activeTab === "stock"
								? "text-primary"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => setActiveTab("stock")}
						type="button"
					>
						Stok Bar
						{activeTab === "stock" && (
							<motion.div
								className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
								layoutId="activeTabBar"
							/>
						)}
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-auto p-1">
				<AnimatePresence mode="wait">
					{activeTab === "orders" ? (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 10 }}
							initial={{ opacity: 0, y: 10 }}
							key="orders-tab"
						>
							<OrdersMonitor orders={orders} />
						</motion.div>
					) : (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 10 }}
							initial={{ opacity: 0, y: 10 }}
							key="stock-tab"
						>
							<StockManager products={products} />
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

function OrdersMonitor({ orders }: { orders: any[] | undefined }) {
	if (!orders) {
		return (
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{Array.from({ length: 6 }).map((_, i) => (
					<div className="h-64 animate-pulse rounded-[32px] bg-slate-200" key={i} />
				))}
			</div>
		);
	}

	if (orders.length === 0) {
		return (
			<div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
				<div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-300">
					<ClipboardList className="h-8 w-8" />
				</div>
				<div>
					<h3 className="font-bold text-slate-800">Tidak ada minuman aktif</h3>
					<p className="text-slate-500 text-sm">Semua minuman sudah selesai diproses.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{orders.map((order) => (
				<OrderCard key={order._id} order={order} />
			))}
		</div>
	);
}

function OrderCard({ order }: { order: any }) {
	const updateStatus = useMutation(api.kitchenBar.updateOrderItemStatus);

	const getMinutesAgo = (timestamp: number) => {
		const diff = Date.now() - timestamp;
		return Math.floor(diff / 60000);
	};

	const minutesAgo = getMinutesAgo(order.createdAt);
	const isLate = minutesAgo > 8; // Bar is faster usually

	return (
		<motion.div
			className="flex flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100"
			layout
		>
			{/* Card Header */}
			<div className={`p-5 ${isLate ? "bg-red-50" : "bg-indigo-50"}`}>
				<div className="flex items-center justify-between">
					<span className="font-black text-2xl text-slate-800">#{order.orderNumber.split("-").pop()}</span>
					<div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold shadow-sm ring-1 ring-slate-200">
						<Clock className={`h-3 w-3 ${isLate ? "text-red-500" : "text-indigo-400"}`} />
						<span className={isLate ? "text-red-600" : "text-indigo-600"}>{minutesAgo}m ago</span>
					</div>
				</div>
				<div className="mt-2 flex items-center gap-2">
					<span className="rounded-lg bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
						Table {order.tableNumber || "Takeaway"}
					</span>
					<span className="text-slate-400 text-xs">•</span>
					<span className="text-slate-500 text-xs font-bold truncate max-w-[100px]">{order.customerName || "Customer"}</span>
				</div>
			</div>

			{/* Item List */}
			<div className="flex-1 space-y-4 p-5">
				{order.itemsWithMetadata.map((item: any) => (
					<div className="flex flex-col gap-3 border-b border-slate-100 pb-4 last:border-0 last:pb-0" key={item.originalIndex}>
						<div className="flex items-start justify-between">
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-indigo-600 font-bold text-white text-xs">
										{item.quantity}x
									</div>
									<h4 className="font-bold text-slate-800 leading-tight truncate">{item.productName}</h4>
								</div>
								{item.variant && (
									<p className="ml-8 mt-1 text-[11px] font-medium text-slate-500 italic">
										{item.variant}
									</p>
								)}
							</div>
							
							<div className="flex gap-2">
								{item.status === "ready" ? (
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
										<Check className="h-4 w-4" />
									</div>
								) : item.status === "preparing" ? (
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
										<Timer className="h-4 w-4 animate-spin-slow" />
									</div>
								) : null}
							</div>
						</div>

						{/* Action Buttons */}
						<div className="ml-8 flex gap-2">
							{(!item.status || item.status === "pending") && (
								<button
									className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-black text-[10px] uppercase tracking-widest text-white shadow-lg shadow-indigo-100 transition-all active:scale-95"
									onClick={() => updateStatus({ orderId: order._id, itemIndex: item.originalIndex, status: "preparing" })}
									type="button"
								>
									BUAT
								</button>
							)}
							{item.status === "preparing" && (
								<button
									className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 font-black text-[10px] uppercase tracking-widest text-white shadow-lg shadow-green-100 transition-all active:scale-95"
									onClick={() => updateStatus({ orderId: order._id, itemIndex: item.originalIndex, status: "ready" })}
									type="button"
								>
									SIAP
								</button>
							)}
							{item.status === "ready" && (
								<button
									className="rounded-xl bg-slate-100 p-3 text-slate-400 transition-all hover:bg-slate-200 active:scale-95"
									onClick={() => updateStatus({ orderId: order._id, itemIndex: item.originalIndex, status: "preparing" })}
									type="button"
									title="Ulang Proses"
								>
									<RotateCcw className="h-4 w-4" />
								</button>
							)}
						</div>
					</div>
				))}
			</div>

			{/* Notes if any */}
			{order.notes && (
				<div className="bg-amber-50 mx-4 mb-4 rounded-xl p-3 border border-amber-100">
					<p className="text-[10px] font-bold text-amber-800 uppercase tracking-widest mb-1 italic">Catatan:</p>
					<p className="text-amber-800 text-xs font-medium">{order.notes}</p>
				</div>
			)}
		</motion.div>
	);
}

function StockManager({ products }: { products: any[] | undefined }) {
	const [searchQuery, setSearchQuery] = useState("");
	const toggleAvailability = useMutation(api.kitchenBar.toggleProductAvailability);

	if (!products) {
		return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div className="aspect-square h-40 animate-pulse rounded-3xl bg-slate-200" key={i} />)}</div>;
	}

	const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

	return (
		<div className="space-y-6">
			{/* Search */}
			<div className="relative">
				<Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
				<input
					className="w-full rounded-[24px] border-none bg-white p-4 pl-12 font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 outline-none transition-all focus:ring-2 focus:ring-indigo-200"
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Cari produk bar..."
					type="text"
					value={searchQuery}
				/>
			</div>

			<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
				{filteredProducts.map((product) => (
					<motion.div
						className={`relative flex flex-col overflow-hidden rounded-[32px] border bg-white p-2 transition-all ${
							product.isAvailable ? "border-slate-100 pb-4 shadow-sm" : "border-slate-200 opacity-60 grayscale shadow-none"
						}`}
						key={product._id}
						layout
					>
						<div className="relative aspect-square overflow-hidden rounded-[24px] bg-slate-100">
							{product.image ? (
								<img alt={product.name} className="h-full w-full object-cover" src={product.image} />
							) : (
								<div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-300">
									NO IMAGE
								</div>
							)}
						</div>

						<div className="mt-3 px-2 text-center">
							<h3 className="line-clamp-1 font-bold text-[13px] text-slate-800">{product.name}</h3>
							<p className="mt-1 font-black text-indigo-600 text-[11px]">
								{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(product.price)}
							</p>
						</div>

						<div className="mt-4 px-2 pb-2">
							<button
								className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${
									product.isAvailable ? "bg-slate-100 text-slate-600" : "bg-indigo-600 text-white shadow-lg shadow-indigo-100"
								}`}
								onClick={() => toggleAvailability({ productId: product._id, isAvailable: !product.isAvailable })}
								type="button"
							>
								{product.isAvailable ? (
									<>
										<XCircle className="h-3.5 w-3.5" /> HABIS
									</>
								) : (
									<>
										<CheckCircle2 className="h-3.5 w-3.5" /> ADA
									</>
								)}
							</button>
						</div>
					</motion.div>
				))}
			</div>
		</div>
	);
}
