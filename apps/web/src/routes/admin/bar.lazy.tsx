import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
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
	ExternalLink,
	Database,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/admin/bar" as any)({
	component: BarMonitorPage,
});

function BarMonitorPage() {
	const { tab = "orders" } = Route.useSearch() as { tab?: string };
	const orders = useQuery(api.kitchenBar.getTrackOrders, { track: "bar" });
	
	const allProducts = useQuery(api.products.getAllProductsAdmin);
	const allCategories = useQuery(api.products.getCategories);
	const inventory = useQuery(api.inventory.getInventory);
	const recipes = useQuery(api.inventory.getRecipes);

	const products = useMemo(() => {
		if (!allProducts || !allCategories) return undefined;
		
		const isBarCategory = (catId: any): boolean => {
			const cat = allCategories.find((c: any) => c._id === catId);
			if (!cat) return false;
			// Check if this is the root "Minuman" category
			if (!cat.parentId && cat.name.toLowerCase().includes("minuman")) return true;
			// If it has a parent, check the parent recursively
			if (cat.parentId) return isBarCategory(cat.parentId);
			return false;
		};

		return allProducts.filter((p: any) => isBarCategory(p.categoryId));
	}, [allProducts, allCategories]);

	return (
		<div className="flex h-full flex-col bg-slate-50/50 pb-12 md:pb-0">
			{/* Header - App Like */}
			<div className="sticky top-0 z-30 flex flex-col gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur-md">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="rounded-xl bg-indigo-600 p-2 text-white shadow-lg shadow-indigo-200">
							<Beer className="h-5 w-5" />
						</div>
						<h1 className="font-black text-xl tracking-tight">Bar</h1>
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
						to={"/admin/bar" as any}
					>
						<ClipboardList className="h-4 w-4" />
						Pesanan
					</Link>
					<Link
						className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 font-bold text-xs transition-all ${
							tab === "stock" ? "bg-white shadow-sm ring-1 ring-slate-200" : "text-muted-foreground"
						}`}
						search={{ tab: "stock" } as any}
						to={"/admin/bar" as any}
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
							<FastStockTable categories={allCategories} inventory={inventory} products={products} recipes={recipes} />
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
		<div className="flex h-full flex-nowrap gap-4 overflow-x-auto overflow-y-hidden p-4 snap-x snap-mandatory focus-visible:outline-none scrollbar-hide md:grid md:grid-cols-3">
			<KanbanColumn
				color="bg-slate-200"
				items={categories.pending}
				label="Baru"
				onItemAction={(item: KanbanItem) => updateStatus({ orderId: item.orderId, itemIndex: item.originalIndex, status: "preparing" })}
				status="pending"
				textColor="text-slate-600"
			/>
			<KanbanColumn
				color="bg-indigo-100"
				items={categories.preparing}
				label="Dibuat"
				onItemAction={(item: KanbanItem) => updateStatus({ orderId: item.orderId, itemIndex: item.originalIndex, status: "ready" })}
				status="preparing"
				textColor="text-indigo-700"
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
	const isLate = minutesAgo > 10; // Bar drinks are faster

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
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white font-black text-sm shadow-lg shadow-indigo-100">
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
				<div className="mt-3 rounded-xl bg-indigo-50/50 p-2 text-[11px] font-bold text-indigo-800 italic ring-1 ring-indigo-100/50">
					{item.variant}
				</div>
			)}

			<div className="mt-4 flex gap-2">
				<button
					className={`flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 font-black text-[11px] uppercase tracking-widest transition-all ${
						status === "pending" 
							? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" 
							: status === "preparing"
							? "bg-green-500 text-white shadow-lg shadow-green-100"
							: "bg-slate-100 text-slate-400"
					}`}
					onClick={onAction}
					type="button"
				>
					{status === "pending" ? (
						<>BUAT</>
					) : status === "preparing" ? (
						<>SIAP</>
					) : (
						<><RotateCcw className="h-3.5 w-3.5" /> ULANG</>
					)}
				</button>
			</div>
		</motion.div>
	);
}function FastStockTable({ 
	products, 
	inventory, 
	recipes,
	categories
}: { 
	products: any[] | undefined;
	inventory: any[] | undefined;
	recipes: any[] | undefined;
	categories: any[] | undefined;
}) {
	const [searchQuery, setSearchQuery] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState<any>({});
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [bulkQuantity, setBulkQuantity] = useState<number>(0);

	const updateProduct = useMutation(api.products.updateProduct);
	const deleteProduct = useMutation(api.products.deleteProduct);
	const bulkUpdate = useMutation(api.products.bulkUpdateProducts);

	const filteredProducts = useMemo(() => {
		if (!products) return [];
		return products.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
	}, [products, searchQuery]);

	const groupedProducts = useMemo(() => {
		if (!products) return {};
		const groups: Record<string, any[]> = {};
		filteredProducts.forEach((product) => {
			const category = categories?.find((c: any) => c._id === product.categoryId);
			const categoryName = category?.name || "Uncategorized";
			if (!groups[categoryName]) groups[categoryName] = [];
			groups[categoryName].push(product);
		});
		return groups;
	}, [filteredProducts, categories, products]);

	if (!products) {
		return <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <div className="h-16 animate-pulse rounded-2xl bg-slate-100" key={i} />)}</div>;
	}

	if (products.length === 0) {
		return (
			<div className="flex h-[60vh] flex-col items-center justify-center gap-6 text-center">
				<div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-300">
					<Utensils className="h-10 w-10" />
				</div>
				<div className="space-y-2">
					<h3 className="font-black text-xl text-slate-800 tracking-tight">Katalog Bar Kosong</h3>
					<p className="max-w-[280px] font-medium text-slate-500 text-sm leading-relaxed">
						Belum ada produk yang dikategorikan sebagai menu bar. Silakan atur kategori produk di Dashboard.
					</p>
				</div>
				<Link
					className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-8 py-4 font-black text-xs uppercase tracking-widest text-white shadow-xl transition-all active:scale-95"
					to="/admin/products"
				>
					<Search className="h-4 w-4" /> Buka Menu Produk
				</Link>
			</div>
		);
	}

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

	const handleToggleSelect = (id: string) => {
		const newSelected = new Set<string>(selectedIds);
		if (newSelected.has(id)) {
			newSelected.delete(id);
		} else {
			newSelected.add(id);
		}
		setSelectedIds(newSelected);
	};

	const handleSelectAllCategory = (items: any[]) => {
		const allSelected = items.every((i) => selectedIds.has(i._id));
		const newSelected = new Set<string>(selectedIds);
		if (allSelected) {
			items.forEach((i) => newSelected.delete(i._id));
		} else {
			items.forEach((i) => newSelected.add(i._id));
		}
		setSelectedIds(newSelected);
	};

	const handleBulkUpdate = async (updates: any) => {
		if (selectedIds.size === 0) return;
		try {
			await bulkUpdate({
				ids: Array.from(selectedIds) as any,
				updates,
			});
			toast.success(`Berhasil memperbarui ${selectedIds.size} produk`);
			setSelectedIds(new Set());
		} catch (error) {
			toast.error("Gagal melakukan pembaruan massal");
		}
	};

	return (
		<div className="relative flex flex-col gap-4">
			{/* Search - Mobile Friendlier */}
			<div className="relative">
				<Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
				<input
					className="w-full rounded-[24px] border-none bg-white p-4 pl-12 font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 outline-none transition-all focus:ring-2 focus:ring-indigo-100"
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Cari menu bar..."
					type="text"
					value={searchQuery}
				/>
			</div>

			<div className="space-y-8">
				{Object.entries(groupedProducts).map(([categoryName, items]) => (
					<div className="space-y-3" key={categoryName}>
						<div className="flex items-center justify-between px-2">
							<div className="h-px flex-1 bg-slate-200" />
							<div className="flex items-center gap-2 px-4">
								<button 
									className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
										items.every(i => selectedIds.has(i._id)) 
											? "bg-indigo-600 border-indigo-600 text-white" 
											: "bg-white border-slate-300"
									}`}
									onClick={() => handleSelectAllCategory(items)}
								>
									{items.every(i => selectedIds.has(i._id)) && <Check className="h-3 w-3" />}
								</button>
								<h3 className="font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">{categoryName}</h3>
							</div>
							<div className="h-px flex-1 bg-slate-200" />
						</div>
						
						{items.map((product) => {
							const recipe = recipes?.find((r: any) => r.productId === product._id && !r.variantName);
							
							// Calculate potential portions based on inventory
							let potentialStock: number | null = null;
							if (recipe && inventory) {
								const stockLimits = recipe.ingredients.map((ing: any) => {
									const invItem = inventory.find((i: any) => i._id === ing.inventoryId);
									if (!invItem) return 0;
									return Math.floor(invItem.quantity / ing.amount);
								});
								potentialStock = Math.min(...stockLimits);
							}

							return (
								<motion.div 
									className={`group relative overflow-hidden rounded-[24px] border bg-white p-4 shadow-sm transition-all ${
										selectedIds.has(product._id) ? "border-indigo-200 bg-indigo-50/20" : "border-slate-200"
									} ${editingId === product._id ? "ring-2 ring-indigo-500/20" : ""}`} 
									key={product._id}
									layout
								>
									{/* Checkbox Trigger Area */}
									{!editingId && (
										<div 
											className="absolute top-0 left-0 bottom-0 w-12 cursor-pointer z-10 flex items-center justify-center"
											onClick={() => handleToggleSelect(product._id)}
										>
											<div className={`h-5 w-5 rounded-lg border transition-all flex items-center justify-center ${
												selectedIds.has(product._id) 
													? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100" 
													: "bg-slate-50 border-slate-200 group-hover:border-indigo-300"
											}`}>
												{selectedIds.has(product._id) && <Check className="h-3.5 w-3.5 stroke-[3]" />}
											</div>
										</div>
									)}

									<div className={!editingId ? "pl-10" : ""}>
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
														className="w-full rounded-xl bg-slate-50 p-3 font-bold text-indigo-600 ring-1 ring-slate-200"
														onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
														type="number"
														value={editForm.price}
													/>
												</div>
												<div className="flex-1">
													<p className="mb-1 ml-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">Siap Saji</p>
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
													className="flex-1 rounded-2xl bg-indigo-600 py-3 font-black text-xs text-white shadow-xl transition-all active:scale-95"
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
										<div className="flex flex-col gap-4">
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-3">
													<div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-100">
														{product.image ? (
															<img alt={product.name} className="h-full w-full object-cover" src={product.image} />
														) : (
															<div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
																<Utensils className="h-5 w-5" />
															</div>
														)}
													</div>
													<div>
														<h4 className="font-bold text-slate-800 leading-tight">{product.name}</h4>
														<div className="mt-1 flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest">
															<span className="text-indigo-600">Rp {product.price.toLocaleString()}</span>
															<span className="text-slate-300">•</span>
															<div className="flex items-center gap-1.5">
																<span className={product.quantity <= 0 ? "text-red-500" : "text-green-600"}>Ready: {product.quantity}</span>
																<div className="flex items-center gap-1 ml-1">
																	<button 
																		className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-slate-500 shadow-sm active:scale-90"
																		onClick={() => updateProduct({ id: product._id, quantity: Math.max(0, (product.quantity || 0) - 1) })}
																	>
																		<Minus className="h-3 w-3" />
																	</button>
																	<button 
																		className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-white shadow-sm active:scale-90"
																		onClick={() => updateProduct({ id: product._id, quantity: (product.quantity || 0) + 1 })}
																	>
																		<Plus className="h-3 w-3" />
																	</button>
																</div>
															</div>
														</div>
													</div>
												</div>
												
												<div className="flex items-center gap-2">
													<button
														className={`flex h-10 items-center gap-1 rounded-xl px-3 font-black text-[10px] uppercase tracking-wider transition-all active:scale-95 ${
															product.isAvailable 
																? "bg-green-50 text-green-600 ring-1 ring-green-100" 
																: "bg-red-50 text-red-600 ring-1 ring-red-100"
														}`}
														onClick={() => handleToggleAvailability(product)}
													>
														{product.isAvailable ? "AKTIF" : "OFF"}
													</button>
													<button
														className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-400 ring-1 ring-slate-100 transition-all active:scale-95"
														onClick={() => handleEdit(product)}
													>
														<RotateCcw className="h-4 w-4" />
													</button>
												</div>
											</div>

											{/* Inventory Integration Section */}
											{recipe && (
												<div className="flex flex-col gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
													<div className="flex items-center justify-between">
														<span className="font-black text-[9px] text-slate-400 uppercase tracking-widest">Ketersediaan Bahan (Inventory)</span>
														<div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black ${potentialStock === 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
															POTENSI: {potentialStock} PORSI
														</div>
													</div>
													<div className="flex flex-wrap gap-1.5 mt-1">
														{recipe.ingredients.map((ing: any) => {
															const invItem = inventory?.find((i: any) => i._id === ing.inventoryId);
															const isLow = invItem ? invItem.quantity < (invItem.lowStockThreshold || 10) : true;
															return (
																<div 
																	className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold ${isLow ? "bg-red-50 text-red-600 ring-1 ring-red-100" : "bg-white text-slate-600 ring-1 ring-slate-100"}`} 
																	key={ing.inventoryId}
																>
																	{invItem?.ingredientName || "Unknown"}
																	<span className="opacity-50">•</span>
																	{invItem ? `${invItem.quantity} ${invItem.unit}` : "Kosong"}
																</div>
															);
														})}
													</div>
												</div>
											)}
										</div>
									)}
								</div>
								</motion.div>
							);
						})}
					</div>
				))}
			</div>

			{/* Floating Bulk Action Bar */}
			<AnimatePresence>
				{selectedIds.size > 0 && (
					<motion.div 
						animate={{ y: 0, opacity: 1 }}
						className="fixed bottom-6 left-4 right-4 z-50 flex items-center justify-between rounded-[32px] bg-slate-900/95 p-2 pl-6 shadow-2xl backdrop-blur-lg ring-1 ring-white/10 md:left-auto md:right-8 md:w-[600px]"
						exit={{ y: 100, opacity: 0 }}
						initial={{ y: 100, opacity: 0 }}
					>
						<div className="flex flex-col">
							<span className="font-black text-white text-xs uppercase tracking-widest">{selectedIds.size} Dipilih</span>
							<button onClick={() => setSelectedIds(new Set())} className="text-left font-bold text-[10px] text-slate-400 hover:text-indigo-400">Batal Selesksi</button>
						</div>

						<div className="flex items-center gap-2">
							<div className="flex items-center gap-1 rounded-2xl bg-white/10 p-1">
								<input 
									className="w-12 bg-transparent text-center font-black text-white text-sm outline-none"
									onChange={(e) => setBulkQuantity(Number(e.target.value))}
									placeholder="Stok"
									type="number"
									value={bulkQuantity}
								/>
								<button 
									className="rounded-xl bg-indigo-600 px-3 py-2 font-black text-[10px] text-white transition-all active:scale-95"
									onClick={() => handleBulkUpdate({ quantity: bulkQuantity })}
								>
									SET STOK
								</button>
							</div>

							<div className="h-8 w-px bg-white/10 mx-1" />

							<div className="flex items-center gap-1">
								<button 
									className="rounded-xl bg-green-500/20 px-3 py-2.5 font-black text-[10px] text-green-400 transition-all hover:bg-green-500 hover:text-white active:scale-95"
									onClick={() => handleBulkUpdate({ isAvailable: true })}
								>
									AKTIFKAN
								</button>
								<button 
									className="rounded-xl bg-red-500/20 px-3 py-2.5 font-black text-[10px] text-red-400 transition-all hover:bg-red-500 hover:text-white active:scale-95"
									onClick={() => handleBulkUpdate({ isAvailable: false })}
								>
									NON-AKTIF
								</button>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
