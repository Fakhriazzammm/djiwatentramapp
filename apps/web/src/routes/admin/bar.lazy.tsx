import { createLazyFileRoute, Link } from "@tanstack/react-router";
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
import { useCallback, useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
	useHybridAllProducts,
	useHybridCategories,
	useHybridInventory,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridRecipes } from "@/hooks/use-hybrid-inventory-admin-data";
import { useHybridTrackOrders } from "@/hooks/use-hybrid-ops-data";
import {
	useHybridApplyInventoryStockAction,
	useHybridBulkUpdateProducts,
	useHybridDeleteProduct,
	useHybridUpdateOrderItemStatus,
	useHybridUpdateProduct,
} from "@/hooks/use-hybrid-write-actions";

export const Route = createLazyFileRoute("/admin/bar" as any)({
	component: BarMonitorPage,
});

function BarMonitorPage() {
	const { tab = "orders" } = Route.useSearch() as { tab?: string };
	const orders = useHybridTrackOrders("bar");
	
	const allProducts = useHybridAllProducts();
	const allCategories = useHybridCategories();
	const inventory = useHybridInventory();
	const recipes = useHybridRecipes();

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
		<div className="flex h-full flex-col bg-slate-50">
			{/* Header - App Like */}
			<div className="sticky top-0 z-30 flex flex-col gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur-md md:gap-3 md:px-4 md:py-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="rounded-lg bg-indigo-600 p-1.5 text-white shadow-lg shadow-indigo-200 md:rounded-xl md:p-2">
							<Beer className="h-4 w-4 md:h-5 md:w-5" />
						</div>
						<h1 className="font-black text-lg tracking-tight md:text-xl">Bar</h1>
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
						to={"/admin/bar" as any}
					>
						<ClipboardList className="h-4 w-4" />
						Pesanan
					</Link>
					<Link
						className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-bold text-[11px] transition-all md:gap-2 md:rounded-xl md:py-2 md:text-xs ${
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
							className="p-3 pb-28 md:p-4 md:pb-32"
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
	const isLate = minutesAgo > 10; // Bar drinks are faster

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
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white font-black text-xs shadow-lg shadow-indigo-100 md:h-8 md:w-8 md:rounded-xl md:text-sm">
						{item.quantity}x
					</div>
					<div>
						<h4 className="font-bold text-slate-800 leading-tight">{item.productName}</h4>
						<div className="mt-1 flex items-center gap-1 font-bold text-[9px] text-slate-400 uppercase tracking-wider md:gap-1.5 md:text-[10px]">
							<span>Meja {item.tableNumber || "Takeaway"}</span>
							<span>â€¢</span>
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
				<div className="mt-2 rounded-lg bg-indigo-50/50 p-1.5 text-[10px] font-bold text-indigo-800 italic ring-1 ring-indigo-100/50 md:mt-3 md:rounded-xl md:p-2 md:text-[11px]">
					{item.variant}
				</div>
			)}

			<div className="mt-3 flex gap-2 md:mt-4">
				<button
					className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 font-black text-[10px] uppercase tracking-widest transition-all md:gap-2 md:rounded-2xl md:py-3 md:text-[11px] ${
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

	const updateProduct = useHybridUpdateProduct();
	const deleteProduct = useHybridDeleteProduct();
	const bulkUpdate = useHybridBulkUpdateProducts();
	const applyInventoryStockAction = useHybridApplyInventoryStockAction();
	const [syncingProductIds, setSyncingProductIds] = useState<Set<string>>(new Set());

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
	const productsWithoutRecipe = useMemo(() => {
		if (!filteredProducts.length) return [] as any[];
		return filteredProducts.filter(
			(product) => !recipes?.some((r: any) => r.productId === product._id && !r.variantName)
		);
	}, [filteredProducts, recipes]);

	const handleAdjustMenuStock = useCallback(
		async (product: any, delta: number) => {
			if (!delta) return;
			const recipe = recipes?.find(
				(r: any) => r.productId === product._id && !r.variantName
			);
			if (!recipe) {
				toast.error(`Menu ${product.name} belum punya recipe. Buat recipe dulu.`);
				return;
			}
			const ingredients = Array.isArray(recipe.ingredients)
				? recipe.ingredients.filter(
					(ing: any) =>
						typeof ing?.inventoryId === "string" && Number(ing?.amount ?? 0) > 0
				)
				: [];
			if (ingredients.length === 0) {
				toast.error(`Recipe ${product.name} belum punya komposisi bahan baku.`);
				return;
			}

			const currentQuantity = Number(product.quantity ?? 0);
			if (delta < 0 && currentQuantity <= 0) {
				toast.error("Stok menu sudah 0");
				return;
			}

			setSyncingProductIds((prev) => {
				const next = new Set(prev);
				next.add(String(product._id));
				return next;
			});

			try {
				const nextQuantity = Math.max(0, currentQuantity + delta);
				await updateProduct({ id: product._id, quantity: nextQuantity });

				const action = delta > 0 ? "add" : "usage";
				const multiplier = Math.abs(delta);
				for (const ingredient of ingredients) {
					await applyInventoryStockAction({
						inventoryId: ingredient.inventoryId,
						action,
						quantity: Number(ingredient.amount) * multiplier,
						notes: `Sinkron stok menu ${product.name} (${delta > 0 ? "+" : ""}${delta} porsi) dari /admin/bar`,
					});
				}

				toast.success(
					`Stok ${product.name} ${delta > 0 ? "bertambah" : "berkurang"} ${Math.abs(delta)} porsi dan bahan baku tersinkron.`
				);
			} catch (error: any) {
				toast.error(
					error?.message || "Gagal sinkron stok menu dengan bahan baku"
				);
			} finally {
				setSyncingProductIds((prev) => {
					const next = new Set(prev);
					next.delete(String(product._id));
					return next;
				});
			}
		},
		[applyInventoryStockAction, recipes, updateProduct]
	);


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
		
		// Validation: Ensure numbers are valid
		if (updates.quantity !== undefined && (isNaN(updates.quantity) || updates.quantity === null)) {
			toast.error("Jumlah stok tidak valid");
			return;
		}

		// Sanitize: Remove undefined/null fields to keep mutation args clean
		const cleanUpdates = Object.fromEntries(
			Object.entries(updates).filter(([_, v]) => v !== undefined && v !== null)
		);

		try {
			await bulkUpdate({
				ids: Array.from(selectedIds) as any,
				updates: cleanUpdates,
			});
			toast.success(`Berhasil memperbarui ${selectedIds.size} produk`);
			setSelectedIds(new Set());
		} catch (error: any) {
			console.error("Bulk update error:", error);
			toast.error(`Gagal melakukan pembaruan massal: ${error.message || "Kesalahan tidak dikenal"}`);
		}
	};

	return (
		<div className="relative flex flex-col gap-4">
			{/* Search - Mobile Friendlier */}
			<div className="relative">
				<Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
				<input
					className="w-full rounded-2xl border-none bg-white p-3 pl-11 font-bold text-sm text-slate-800 shadow-sm ring-1 ring-slate-200 outline-none transition-all focus:ring-2 focus:ring-indigo-100 md:rounded-[24px] md:p-4 md:pl-12 md:text-base"
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Cari menu bar..."
					type="text"
					value={searchQuery}
				/>
			</div>

			{productsWithoutRecipe.length > 0 && (
				<div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
					<p className="font-black text-[11px] uppercase tracking-wider">
						⚠ {productsWithoutRecipe.length} menu belum punya recipe
					</p>
					<p className="mt-1 text-xs">
						Menu tanpa recipe tidak bisa update stok sinkron bahan baku.
					</p>
					<div className="mt-2 flex gap-2">
						<a
							className="inline-flex items-center rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white"
							href="/admin/recipe"
						>
							Buat Recipe
						</a>
					</div>
				</div>
			)}

			<div className="space-y-6 md:space-y-8">
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
							const recipeMissing = !recipe;
							const isSyncing = syncingProductIds.has(String(product._id));
							
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
									className="absolute top-0 left-0 bottom-0 z-10 flex w-9 cursor-pointer items-center justify-center md:w-12"
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

									<div className={!editingId ? "pl-8 md:pl-10" : ""}>
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
										<div className="flex flex-col gap-3 md:gap-4">
											<div className="flex items-start justify-between gap-2">
												<div className="flex min-w-0 items-center gap-2.5 md:gap-3">
													<div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-100 md:h-12 md:w-12 md:rounded-2xl">
														{product.image ? (
															<img alt={product.name} className="h-full w-full object-cover" src={product.image} />
														) : (
															<div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
																<Utensils className="h-5 w-5" />
															</div>
														)}
													</div>
													<div>
														<h4 className="line-clamp-2 font-bold text-slate-800 leading-tight">{product.name}</h4>
														<div className="mt-1 flex flex-wrap items-center gap-1.5 font-bold text-[9px] uppercase tracking-widest md:gap-2 md:text-[10px]">
															<span className="text-indigo-600">Rp {product.price.toLocaleString()}</span>
															<span className="text-slate-300">â€¢</span>
															<div className="flex items-center gap-1.5">
																<span className={product.quantity <= 0 ? "text-red-500" : "text-green-600"}>Ready: {product.quantity}</span>
																<div className="ml-1 flex items-center gap-1">
																	<button 
																		className="flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-slate-500 shadow-sm active:scale-90"
																		disabled={recipeMissing || isSyncing || (product.quantity || 0) <= 0}
												onClick={() => void handleAdjustMenuStock(product, -1)}
																	>
																		<Minus className="h-3 w-3" />
																	</button>
																	<button 
																		className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-white shadow-sm active:scale-90"
																		disabled={recipeMissing || isSyncing}
												onClick={() => void handleAdjustMenuStock(product, 1)}
																	>
																		<Plus className="h-3 w-3" />
																	</button>
																</div>
															</div>
														</div>
													</div>
												</div>
												
												<div className="flex shrink-0 items-center gap-1.5 md:gap-2">
													<button
														className={`flex h-8 items-center gap-1 rounded-lg px-2.5 font-black text-[9px] uppercase tracking-wider transition-all active:scale-95 md:h-10 md:rounded-xl md:px-3 md:text-[10px] ${
															product.isAvailable 
																? "bg-green-50 text-green-600 ring-1 ring-green-100" 
																: "bg-red-50 text-red-600 ring-1 ring-red-100"
														}`}
														onClick={() => handleToggleAvailability(product)}
													>
														{product.isAvailable ? "AKTIF" : "OFF"}
													</button>
													<button
														className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-400 ring-1 ring-slate-100 transition-all active:scale-95 md:h-10 md:w-10 md:rounded-xl"
														onClick={() => handleEdit(product)}
													>
														<RotateCcw className="h-4 w-4" />
													</button>
												</div>
											</div>

											{recipeMissing && (
												<div className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-[10px] font-semibold text-amber-900">
													Menu ini belum punya recipe. Stok menu tidak bisa disinkronkan ke bahan baku.
													<a className="ml-1 underline" href="/admin/recipe">
														Buat recipe
													</a>
												</div>
											)}

											{/* Inventory Integration Section */}
											{recipe && (
												<div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100 md:rounded-2xl md:p-3">
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
																	<span className="opacity-50">â€¢</span>
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
						className="fixed bottom-24 left-3 right-3 z-50 flex flex-col items-stretch gap-3 rounded-2xl bg-slate-900/95 p-3 shadow-2xl backdrop-blur-lg ring-1 ring-white/10 md:bottom-8 md:left-auto md:right-8 md:w-[600px] md:flex-row md:items-center md:justify-between md:gap-2 md:rounded-[32px] md:p-2 md:pl-6"
						exit={{ y: 100, opacity: 0 }}
						initial={{ y: 100, opacity: 0 }}
					>
						<div className="flex flex-col">
							<span className="font-black text-white text-xs uppercase tracking-widest">{selectedIds.size} Dipilih</span>
							<button onClick={() => setSelectedIds(new Set())} className="text-left font-bold text-[10px] text-slate-400 hover:text-indigo-400">Batal Selesksi</button>
						</div>

						<div className="flex flex-col gap-2 md:flex-row md:items-center">
							<div className="flex items-center gap-1 rounded-xl bg-white/10 p-1 md:rounded-2xl">
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

							<div className="mx-1 hidden h-8 w-px bg-white/10 md:block" />

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
