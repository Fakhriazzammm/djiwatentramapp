import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	Beer,
	Check,
	CheckCircle2,
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
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/admin/bar" as any)({
	component: BarMonitorPage,
});

function BarMonitorPage() {
	const { tab = "orders" } = Route.useSearch() as { tab?: string };
	const orders = useQuery(api.kitchenBar.getTrackOrders, { track: "bar" });
	const products = useQuery(api.kitchenBar.getTrackProducts, { track: "bar" });

	return (
		<div className="flex h-full flex-col bg-background pb-12 md:pb-0">
			{/* Desktop Header Navigation */}
			<div className="mb-4 hidden items-center justify-between overflow-x-auto border-border border-b pb-1 md:flex">
				<div className="flex gap-1 md:gap-2">
					<Link
						className={`relative whitespace-nowrap px-3 py-2 font-bold text-xs transition-colors md:px-4 md:text-sm ${
							tab === "orders"
								? "text-primary"
								: "text-muted-foreground hover:text-foreground"
						}`}
						search={{ tab: "orders" } as any}
						to={"/admin/bar" as any}
					>
						Pesanan Bar
						{tab === "orders" && (
							<motion.div
								className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
								layoutId="activeTabBar"
							/>
						)}
					</Link>
					<Link
						className={`relative whitespace-nowrap px-3 py-2 font-bold text-xs transition-colors md:px-4 md:text-sm ${
							tab === "stock"
								? "text-primary"
								: "text-muted-foreground hover:text-foreground"
						}`}
						search={{ tab: "stock" } as any}
						to={"/admin/bar" as any}
					>
						Stok Bar
						{tab === "stock" && (
							<motion.div
								className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
								layoutId="activeTabBar"
							/>
						)}
					</Link>
				</div>
			</div>

			<div className="flex-1 overflow-auto p-1">
				<AnimatePresence mode="wait">
					{tab === "orders" ? (
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
							<FastStockTable products={products} />
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

function FastStockTable({ products }: { products: any[] | undefined }) {
	const [searchQuery, setSearchQuery] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState<any>({});

	const updateProduct = useMutation(api.products.updateProduct);
	const deleteProduct = useMutation(api.products.deleteProduct);

	if (!products) {
		return <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <div className="h-16 animate-pulse rounded-2xl bg-slate-100" key={i} />)}</div>;
	}

	const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

	const handleEdit = (product: any) => {
		setEditingId(product._id);
		setEditForm({
			name: product.name,
			price: product.price,
			quantity: product.quantity || 0,
			isAvailable: product.isAvailable,
		});
	};

	const handleSave = async (id: any) => {
		try {
			await updateProduct({
				id,
				...editForm,
			});
			setEditingId(null);
			toast.success("Produk berhasil diperbarui");
		} catch (error) {
			toast.error("Gagal memperbarui produk");
		}
	};

	const handleToggleAvailability = async (product: any) => {
		try {
			await updateProduct({
				id: product._id,
				isAvailable: !product.isAvailable,
			});
			toast.success(`${product.name} ${!product.isAvailable ? "Tersedia" : "Habis"}`);
		} catch (error) {
			toast.error("Gagal mengubah status");
		}
	};

	const handleDelete = async (id: any) => {
		if (window.confirm("Apakah Anda yakin ingin menghapus produk ini secara permanen?")) {
			try {
				await deleteProduct({ id });
				toast.success("Produk dihapus");
			} catch (error) {
				toast.error("Gagal menghapus produk");
			}
		}
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Search */}
			<div className="relative">
				<Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
				<input
					className="w-full rounded-[20px] border-none bg-white p-4 pl-12 font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 outline-none transition-all focus:ring-2 focus:ring-indigo-100"
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Cari produk bar..."
					type="text"
					value={searchQuery}
				/>
			</div>

			{/* High-Speed Table */}
			<div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
				<div className="overflow-x-auto">
					<table className="w-full text-left">
						<thead className="bg-slate-50 font-bold text-[10px] text-slate-500 uppercase tracking-widest">
							<tr>
								<th className="px-5 py-4">Produk</th>
								<th className="px-5 py-4">Harga</th>
								<th className="px-5 py-4">Stok</th>
								<th className="px-5 py-4">Status</th>
								<th className="px-5 py-4 text-right">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{filteredProducts.map((product) => (
								<tr className={`transition-colors hover:bg-slate-50/50 ${editingId === product._id ? "bg-indigo-50/30" : ""}`} key={product._id}>
									<td className="px-5 py-3">
										{editingId === product._id ? (
											<input 
												autoFocus
												className="w-full rounded-lg border-none bg-white p-2 font-bold text-slate-800 ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none"
												onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
												value={editForm.name}
											/>
										) : (
											<div className="flex items-center gap-3">
												<div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-100">
													{product.image && <img alt={product.name} className="h-full w-full object-cover" src={product.image} />}
												</div>
												<span className="font-bold text-slate-800 text-sm">{product.name}</span>
											</div>
										)}
									</td>
									<td className="px-5 py-3">
										{editingId === product._id ? (
											<input 
												className="w-24 rounded-lg border-none bg-white p-2 font-bold text-slate-800 ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none"
												onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
												type="number"
												value={editForm.price}
											/>
										) : (
											<span className="font-black text-indigo-600 text-sm whitespace-nowrap">
												Rp {product.price.toLocaleString()}
											</span>
										)}
									</td>
									<td className="px-5 py-3">
										{editingId === product._id ? (
											<div className="flex items-center gap-1">
												<button 
													className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 active:scale-95"
													onClick={() => setEditForm({ ...editForm, quantity: Math.max(0, editForm.quantity - 1) })}
												>
													<Minus className="h-3 w-3" />
												</button>
												<input 
													className="w-16 rounded-lg border-none bg-white p-2 text-center font-bold text-slate-800 ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-400 outline-none"
													onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
													type="number"
													value={editForm.quantity}
												/>
												<button 
													className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 active:scale-95"
													onClick={() => setEditForm({ ...editForm, quantity: editForm.quantity + 1 })}
												>
													<Plus className="h-3 w-3" />
												</button>
											</div>
										) : (
											<span className={`inline-flex items-center rounded-lg px-2.5 py-1 font-bold text-xs ${product.quantity <= 5 ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"}`}>
												{product.quantity || 0}
											</span>
										)}
									</td>
									<td className="px-5 py-3">
										<button
											className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-black text-[10px] uppercase tracking-wider transition-all active:scale-95 ${
												product.isAvailable 
													? "bg-green-50 text-green-600 hover:bg-green-100" 
													: "bg-slate-100 text-slate-400 hover:bg-slate-200"
											}`}
											onClick={() => handleToggleAvailability(product)}
											type="button"
										>
											{product.isAvailable ? (
												<><CheckCircle2 className="h-3.5 w-3.5" /> ADA</>
											) : (
												<><XCircle className="h-3.5 w-3.5" /> HABIS</>
											)}
										</button>
									</td>
									<td className="px-5 py-3 text-right">
										<div className="flex items-center justify-end gap-2">
											{editingId === product._id ? (
												<>
													<button
														className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 active:scale-95"
														onClick={() => handleSave(product._id)}
														title="Simpan"
													>
														<Save className="h-4 w-4" />
													</button>
													<button
														className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 active:scale-95"
														onClick={() => setEditingId(null)}
														title="Batal"
													>
														<XCircle className="h-4 w-4" />
													</button>
												</>
											) : (
												<>
													<button
														className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-colors active:scale-95"
														onClick={() => handleEdit(product)}
														title="Edit"
													>
														<RotateCcw className="h-4 w-4" />
													</button>
													<button
														className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors active:scale-95"
														onClick={() => handleDelete(product._id)}
														title="Hapus"
													>
														<Trash2 className="h-4 w-4" />
													</button>
												</>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
