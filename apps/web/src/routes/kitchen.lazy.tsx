import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	Check,
	CheckCircle2,
	ChefHat,
	ClipboardList,
	Clock,
	RotateCcw,
	Search,
	Timer,
	Utensils,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/kitchen")({
	component: KitchenMonitorPage,
});

function KitchenMonitorPage() {
	const [activeTab, setActiveTab] = useState<"orders" | "stock">("orders");
	const orders = useQuery(api.kitchenBar.getTrackOrders, { track: "kitchen" });
	const products = useQuery(api.kitchenBar.getTrackProducts, { track: "kitchen" });

	return (
		<div className="flex min-h-screen flex-col bg-[#F8FAFC]">
			{/* Header (App Bar) */}
			<header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-200">
						<ChefHat className="h-6 w-6" />
					</div>
					<div>
						<h1 className="font-black text-xl tracking-tight text-slate-800">KITCHEN</h1>
						<p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
							Monitor Pesanan Aktif
						</p>
					</div>
				</div>

				<div className="flex h-10 items-center gap-1 rounded-2xl bg-slate-100 p-1">
					<button
						className={`flex items-center gap-2 rounded-xl px-4 py-1.5 font-bold text-xs transition-all ${
							activeTab === "orders"
								? "bg-white text-orange-600 shadow-sm"
								: "text-slate-500 hover:text-slate-700"
						}`}
						onClick={() => setActiveTab("orders")}
						type="button"
					>
						<ClipboardList className="h-3.5 w-3.5" /> Pesanan
					</button>
					<button
						className={`flex items-center gap-2 rounded-xl px-4 py-1.5 font-bold text-xs transition-all ${
							activeTab === "stock"
								? "bg-white text-orange-600 shadow-sm"
								: "text-slate-500 hover:text-slate-700"
						}`}
						onClick={() => setActiveTab("stock")}
						type="button"
					>
						<Utensils className="h-3.5 w-3.5" /> Stok
					</button>
				</div>
			</header>

			<main className="flex-1 overflow-auto p-4 md:p-6">
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
			</main>
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
			<div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
				<div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-300">
					<ClipboardList className="h-10 w-10" />
				</div>
				<div>
					<h3 className="font-bold text-slate-800">Tidak ada pesanan aktif</h3>
					<p className="text-slate-500 text-sm">Semua pesanan sudah selesai diproses.</p>
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
	const isLate = minutesAgo > 15;

	return (
		<motion.div
			className="flex flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100"
			layout
		>
			{/* Card Header */}
			<div className={`p-5 ${isLate ? "bg-red-50" : "bg-slate-50"}`}>
				<div className="flex items-center justify-between">
					<span className="font-black text-2xl text-slate-800">#{order.orderNumber.split("-").pop()}</span>
					<div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold shadow-sm ring-1 ring-slate-200">
						<Clock className={`h-3 w-3 ${isLate ? "text-red-500" : "text-slate-400"}`} />
						<span className={isLate ? "text-red-600" : "text-slate-600"}>{minutesAgo}m ago</span>
					</div>
				</div>
				<div className="mt-2 flex items-center gap-2">
					<span className="rounded-lg bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
						Table {order.tableNumber || "Takeaway"}
					</span>
					<span className="text-slate-400 text-xs">•</span>
					<span className="text-slate-500 text-xs font-bold">{order.customerName || "Customer"}</span>
				</div>
			</div>

			{/* Item List */}
			<div className="flex-1 space-y-4 p-5">
				{order.itemsWithMetadata.map((item: any) => (
					<div className="flex flex-col gap-3 border-b border-slate-100 pb-4 last:border-0 last:pb-0" key={item.originalIndex}>
						<div className="flex items-start justify-between">
							<div className="flex-1">
								<div className="flex items-center gap-2">
									<div className="flex h-6 w-6 items-center justify-center rounded bg-slate-800 font-bold text-white text-xs">
										{item.quantity}x
									</div>
									<h4 className="font-bold text-slate-800 leading-tight">{item.productName}</h4>
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
									<div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600">
										<Timer className="h-4 w-4 animate-spin-slow" />
									</div>
								) : null}
							</div>
						</div>

						{/* Action Buttons */}
						<div className="ml-8 flex gap-2">
							{(!item.status || item.status === "pending") && (
								<button
									className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 font-black text-[10px] uppercase tracking-widest text-white shadow-lg shadow-orange-100 transition-all active:scale-95"
									onClick={() => updateStatus({ orderId: order._id, itemIndex: item.originalIndex, status: "preparing" })}
									type="button"
								>
									PROSES
								</button>
							)}
							{item.status === "preparing" && (
								<button
									className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 font-black text-[10px] uppercase tracking-widest text-white shadow-lg shadow-green-100 transition-all active:scale-95"
									onClick={() => updateStatus({ orderId: order._id, itemIndex: item.originalIndex, status: "ready" })}
									type="button"
								>
									SAJIKAN
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
					className="w-full rounded-[24px] border-none bg-white p-4 pl-12 font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 outline-none transition-all focus:ring-2 focus:ring-orange-200"
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Cari produk kitchen..."
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
							<p className="mt-1 font-black text-orange-600 text-[11px]">
								{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(product.price)}
							</p>
						</div>

						<div className="mt-4 px-2 pb-2">
							<button
								className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${
									product.isAvailable ? "bg-slate-100 text-slate-600" : "bg-orange-600 text-white shadow-lg shadow-orange-100"
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
