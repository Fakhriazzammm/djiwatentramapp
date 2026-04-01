import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
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
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/admin/kitchen" as any)({
	component: KitchenMonitorPage,
});

function KitchenMonitorPage() {
	const { tab = "orders" } = Route.useSearch() as { tab?: string };
	const orders = useQuery(api.kitchenBar.getTrackOrders, { track: "kitchen" });
	
	const allProducts = useQuery(api.products.getAllProductsAdmin);
	const allCategories = useQuery(api.products.getCategories);

	const products = useMemo(() => {
		if (!allProducts || !allCategories) return undefined;
		
		const trackCategoryIds = new Set(
			allCategories
				.filter((c: any) => c.track === "kitchen" || (c.parentId && allCategories.find((p: any) => p._id === c.parentId)?.track === "kitchen"))
				.map((c: any) => c._id)
		);

		return allProducts.filter((p: any) => trackCategoryIds.has(p.categoryId));
	}, [allProducts, allCategories]);

	return (
		<div className="flex h-full flex-col bg-slate-50/50 pb-12 md:pb-0">
			{/* Header - App Like */}
			<div className="sticky top-0 z-30 flex flex-col gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur-md">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="rounded-xl bg-orange-600 p-2 text-white shadow-lg shadow-orange-200">
							<ChefHat className="h-5 w-5" />
						</div>
						<h1 className="font-black text-xl tracking-tight">Dapur</h1>
					</div>
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500 uppercase tracking-widest ring-1 ring-slate-200">
							<span className="relative flex h-2 w-2">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
								<span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
							</span>
							LIVE
						</div>
					</div>
				</div>

				{/* Tab Selector - App Like */}
				<div className="flex gap-1 rounded-2xl bg-slate-100 p-1 ring-1 ring-slate-200">
					<Link
						className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 font-bold text-xs transition-all ${
							tab === "orders" ? "bg-white shadow-sm ring-1 ring-slate-200" : "text-muted-foreground"
						}`}
						search={{ tab: "orders" } as any}
						to={"/admin/kitchen" as any}
					>
						<ClipboardList className="h-4 w-4" />
						Pesanan
					</Link>
					<Link
						className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 font-bold text-xs transition-all ${
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
							className="p-4"
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
	const seedData = useMutation(api.kitchenBar.seedOperationalData);
	const updateStatus = useMutation(api.kitchenBar.updateOrderItemStatus);

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
			<div className="grid h-full grid-cols-1 gap-4 p-4 md:grid-cols-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<div className="h-full animate-pulse rounded-[32px] bg-slate-200" key={i} />
				))}
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="flex h-[70vh] flex-col items-center justify-center gap-6 p-10 text-center">
				<div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-slate-400">
					<Database className="h-10 w-10" />
				</div>
				<div className="space-y-2">
					<h3 className="font-black text-xl text-slate-800 tracking-tight">Tidak Ada Pesanan Aktif</h3>
					<p className="max-w-[280px] font-medium text-slate-500 text-sm leading-relaxed">
						Layar monitor Anda sedang kosong. Ingin mencoba simulasi dengan data contoh?
					</p>
				</div>
				<button
					className="flex items-center gap-2 rounded-2xl bg-orange-600 px-6 py-3 font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-orange-200 transition-all active:scale-95"
					onClick={async () => {
						const res = await seedData({ track: "kitchen" });
						toast.success(res.message);
					}}
				>
					Generate Test Data
				</button>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-nowrap gap-4 overflow-x-auto overflow-y-hidden p-4 snap-x snap-mandatory focus-visible:outline-none scrollbar-hide md:grid md:grid-cols-3">
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
		<div className="flex h-full w-[85vw] shrink-0 flex-col gap-3 snap-center md:w-auto">
			<div className="flex items-center justify-between px-2">
				<div className="flex items-center gap-2">
					<div className={`h-2.5 w-2.5 rounded-full ${color}`} />
					<h3 className="font-black text-sm text-slate-800 uppercase tracking-widest">{label}</h3>
				</div>
				<span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500 tracking-tight ring-1 ring-slate-200">
					{items.length}
				</span>
			</div>
			
			<div className="flex-1 space-y-3 overflow-y-auto rounded-[32px] bg-slate-100/50 p-2 scrollbar-hide md:p-3">
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
			className="group relative flex flex-col overflow-hidden rounded-[24px] bg-white p-4 shadow-sm ring-1 ring-slate-200/60 transition-all hover:shadow-md active:scale-[0.98]"
			exit={{ opacity: 0, scale: 0.9, y: 10 }}
			initial={{ opacity: 0, scale: 0.95, y: -10 }}
			layout
		>
			<div className="flex items-start justify-between">
				<div className="flex items-center gap-2.5">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white font-black text-sm shadow-lg shadow-slate-200">
						{item.quantity}x
					</div>
					<div>
						<h4 className="font-bold text-slate-800 leading-tight">{item.productName}</h4>
						<div className="mt-1 flex items-center gap-1.5 font-bold text-[10px] text-slate-400 uppercase tracking-wider">
							<span>Meja {item.tableNumber || "Takeaway"}</span>
							<span>•</span>
							<span>#{item.orderNumber.split("-").pop()}</span>
						</div>
					</div>
				</div>
				{status === "pending" && (
					<div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black ${isLate ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400"}`}>
						<Clock className="h-3 w-3" />
						{minutesAgo}m
					</div>
				)}
			</div>

			{item.variant && (
				<div className="mt-3 rounded-xl bg-orange-50/50 p-2 text-[11px] font-bold text-orange-800 italic ring-1 ring-orange-100/50">
					{item.variant}
				</div>
			)}

			<div className="mt-4 flex gap-2">
				<button
					className={`flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 font-black text-[11px] uppercase tracking-widest transition-all ${
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

function FastStockTable({ products }: { products: any[] | undefined }) {
	const [searchQuery, setSearchQuery] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState<any>({});
	const seedData = useMutation(api.kitchenBar.seedOperationalData);

	const updateProduct = useMutation(api.products.updateProduct);
	const deleteProduct = useMutation(api.products.deleteProduct);

	if (!products) {
		return <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <div className="h-16 animate-pulse rounded-2xl bg-slate-100" key={i} />)}</div>;
	}

	if (products.length === 0) {
		return (
			<div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
				<div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-300">
					<Database className="h-8 w-8" />
				</div>
				<div className="space-y-2">
					<h3 className="font-black text-slate-800">Daftar Stok Kosong</h3>
					<p className="max-w-[240px] text-slate-500 text-xs">Produk dapur belum terdaftar di track ini.</p>
				</div>
				<button
					className="mt-4 rounded-2xl bg-slate-800 px-6 py-3 font-black text-[10px] uppercase tracking-widest text-white shadow-xl transition-all active:scale-95"
					onClick={async () => {
						const res = await seedData({ track: "kitchen" });
						toast.success(res.message);
					}}
				>
					Seed Data Produk
				</button>
			</div>
		);
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
			{/* Search - Mobile Friendlier */}
			<div className="relative">
				<Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
				<input
					className="w-full rounded-[24px] border-none bg-white p-4 pl-12 font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 outline-none transition-all focus:ring-2 focus:ring-primary/20"
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Cari produk produk..."
					type="text"
					value={searchQuery}
				/>
			</div>

			{/* High-Speed Table - Card List on Mobile, Table on Desktop */}
			<div className="space-y-3">
				{filteredProducts.map((product) => (
					<motion.div 
						className={`overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition-all ${editingId === product._id ? "ring-2 ring-primary/20" : ""}`} 
						key={product._id}
						layout
					>
						{editingId === product._id ? (
							<div className="space-y-4">
								<div className="flex items-center gap-3">
									<input 
										autoFocus
										className="flex-1 rounded-xl bg-slate-50 p-3 font-bold text-slate-800 ring-1 ring-slate-200"
										onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
										value={editForm.name}
									/>
								</div>
								<div className="flex items-center gap-2">
									<div className="flex-1">
										<p className="mb-1 ml-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">Harga</p>
										<input 
											className="w-full rounded-xl bg-slate-50 p-3 font-bold text-primary ring-1 ring-slate-200"
											onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
											type="number"
											value={editForm.price}
										/>
									</div>
									<div className="flex-1">
										<p className="mb-1 ml-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">Stok</p>
										<div className="flex items-center gap-1 rounded-xl bg-slate-50 p-1 ring-1 ring-slate-200">
											<button 
												className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm"
												onClick={() => setEditForm({ ...editForm, quantity: Math.max(0, editForm.quantity - 1) })}
											>
												<Minus className="h-4 w-4" />
											</button>
											<input 
												className="w-full bg-transparent text-center font-black text-slate-800 outline-none"
												onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
												type="number"
												value={editForm.quantity}
											/>
											<button 
												className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm"
												onClick={() => setEditForm({ ...editForm, quantity: editForm.quantity + 1 })}
											>
												<Plus className="h-4 w-4" />
											</button>
										</div>
									</div>
								</div>
								<div className="flex gap-2 pt-2">
									<button
										className="flex-1 rounded-2xl bg-slate-800 py-3 font-black text-xs text-white shadow-xl transition-all active:scale-95"
										onClick={() => handleSave(product._id)}
									>
										SIMPAN
									</button>
									<button
										className="rounded-2xl bg-slate-100 px-6 py-3 font-black text-xs text-slate-400"
										onClick={() => setEditingId(null)}
									>
										BATAL
									</button>
								</div>
							</div>
						) : (
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-100">
										{product.image && <img alt={product.name} className="h-full w-full object-cover" src={product.image} />}
									</div>
									<div>
										<h4 className="font-bold text-slate-800 leading-tight">{product.name}</h4>
										<div className="mt-1 flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-widest">
											<span className="text-secondary">Rp {product.price.toLocaleString()}</span>
											<span className="text-slate-300">•</span>
											<span className={product.quantity <= 10 ? "text-red-500" : "text-slate-400"}>Stok: {product.quantity || 0}</span>
										</div>
									</div>
								</div>
								
								<div className="flex items-center gap-2">
									<button
										className={`flex h-10 items-center gap-1 rounded-xl px-3 font-black text-[10px] uppercase tracking-wider transition-all active:scale-95 ${
											product.isAvailable 
												? "bg-green-50 text-green-600 ring-1 ring-green-100" 
												: "bg-slate-50 text-slate-400 ring-1 ring-slate-100"
										}`}
										onClick={() => handleToggleAvailability(product)}
									>
										{product.isAvailable ? "ADA" : "HABIS"}
									</button>
									<button
										className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-400 ring-1 ring-slate-100 transition-all active:scale-95"
										onClick={() => handleEdit(product)}
									>
										<RotateCcw className="h-4 w-4" />
									</button>
								</div>
							</div>
						)}
					</motion.div>
				))}
			</div>
		</div>
	);
}
