import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
	Package,
	AlertCircle,
	ChefHat,
	Beer,
	Archive,
	ShoppingCart,
	ArrowRight,
	TrendingDown,
	TrendingUp,
	Store,
	ClipboardList,
	AlertTriangle,
	Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
	useHybridInventory,
	useHybridAllProducts,
	useHybridLowStockItems,
	useHybridCategories,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridRecipes } from "@/hooks/use-hybrid-inventory-admin-data";
import {
	useHybridAdjustMenuStockWithRecipe,
	useHybridUpdateProduct,
} from "@/hooks/use-hybrid-write-actions";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { toast } from "sonner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createLazyFileRoute("/admin/stock-overview" as any)({
	component: StockOverviewPage,
});

function StockOverviewPage() {
	const inventory = useHybridInventory();
	const allProducts = useHybridAllProducts();
	const lowStockItems = useHybridLowStockItems();
	const categories = useHybridCategories();

	const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
	const recipes = useHybridRecipes();
	const adjustMenuStock = useHybridAdjustMenuStockWithRecipe();
	const updateProduct = useHybridUpdateProduct();

	// Restock dialog state
	const [restockTarget, setRestockTarget] = useState<any | null>(null);
	const [restockQty, setRestockQty] = useState("");
	const [restockPrice, setRestockPrice] = useState("");
	const [restockOpen, setRestockOpen] = useState(false);
	const [restocking, setRestocking] = useState(false);

	const handleRestock = async () => {
		const product = restockTarget;
		if (!product) return;
		const qty = Number(restockQty);
		if (!Number.isFinite(qty) || qty <= 0) {
			toast.error("Quantity harus lebih dari 0");
			return;
		}
		const price = restockPrice.trim() ? Number(restockPrice) : undefined;
		if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
			toast.error("Harga beli tidak valid");
			return;
		}
		setRestocking(true);
		try {
			// Try recipe-based stock adjustment first
			const recipe = (recipes ?? []).find(
				(r: any) => String(r.productId) === String(product._id) && !r.variantName
			);
			if (recipe) {
				await adjustMenuStock({
					productId: String(product._id),
					deltaMenu: qty,
					currentQuantity: Number(product.quantity ?? 0),
					notes:
						"Quick restock dari Stock Overview" +
						(price !== undefined ? ` (harga beli: Rp${price.toLocaleString("id-ID")})` : ""),
					recipe,
				});
			} else {
				// Fallback: update product quantity directly
				await updateProduct({
					id: product._id,
					quantity: Number(product.quantity ?? 0) + qty,
				});
			}
			triggerHybridRefresh();
			toast.success(`Berhasil restock ${product.name} +${qty}`);
			setRestockOpen(false);
			setRestockTarget(null);
			setRestockQty("");
			setRestockPrice("");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Gagal restock";
			toast.error(message);
		} finally {
			setRestocking(false);
		}
	};

	// Total inventory count
	const totalInventoryCount = useMemo(() => {
		if (!inventory) return 0;
		return inventory.length;
	}, [inventory]);

	// Low stock count
	const lowStockCount = useMemo(() => {
		if (!lowStockItems) return 0;
		return lowStockItems.length;
	}, [lowStockItems]);

	// Menu tersedia: quantity > 0 dan isAvailable true
	const availableMenuCount = useMemo(() => {
		if (!allProducts) return 0;
		return allProducts.filter(
			(p: any) => Number(p.quantity ?? 0) > 0 && p.isAvailable === true
		).length;
	}, [allProducts]);

	// Menu habis: quantity = 0 atau isAvailable false
	const unavailableMenuCount = useMemo(() => {
		if (!allProducts) return 0;
		return allProducts.filter(
			(p: any) => Number(p.quantity ?? 0) === 0 || p.isAvailable === false
		).length;
	}, [allProducts]);

	// Category filter options
	const categoryOptions = useMemo(() => {
		if (!categories) return [];
		return categories.map((c: any) => ({
			_id: c._id,
			name: c.name,
		}));
	}, [categories]);

	// Filtered products for the table
	const filteredProducts = useMemo(() => {
		if (!allProducts) return [];
		let products = allProducts;
		if (selectedCategoryId !== "all") {
			products = products.filter(
				(p: any) => p.categoryId === selectedCategoryId
			);
		}
		return products;
	}, [allProducts, selectedCategoryId]);

	// Get status info for a product
	const getProductStatus = (product: any) => {
		const qty = Number(product.quantity ?? 0);
		if (qty === 0 || !product.isAvailable) return { label: "Habis", color: "text-red-600 bg-red-50 border-red-200", level: "empty" };
		// Estimate max stock as 50 if no other benchmark
		const maxStock = 50;
		const pct = Math.min(qty / maxStock, 1);
		if (pct <= 0.2) return { label: "Kritis", color: "text-red-600 bg-red-50 border-red-200", level: "low" };
		if (pct <= 0.5) return { label: "Menipis", color: "text-yellow-600 bg-yellow-50 border-yellow-200", level: "medium" };
		return { label: "Tersedia", color: "text-green-600 bg-green-50 border-green-200", level: "high" };
	};

	// Get category name
	const getCategoryName = (categoryId: string) => {
		if (!categories) return "Uncategorized";
		const cat = categories.find((c: any) => c._id === categoryId);
		return cat?.name || "Uncategorized";
	};

	const isLoading = !inventory || !allProducts || !categories;

	// Empty state: data berhasil di-fetch tapi kosong
	const isDataEmpty =
		!isLoading &&
		totalInventoryCount === 0 &&
		availableMenuCount === 0;

	if (isLoading) {
		return (
			<div className="flex h-full flex-col bg-slate-50">
				<div className="sticky top-0 z-30 border-b bg-background/80 px-3 py-2 backdrop-blur-md md:px-4 md:py-3">
					<div className="flex items-center gap-2">
						<div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
						<div className="space-y-1">
							<div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
							<div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
						</div>
					</div>
				</div>
				<div className="flex-1 space-y-4 p-3 md:p-4">
					<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
						{Array.from({ length: 4 }).map((_, i) => (
							<div className="h-28 animate-pulse rounded-2xl bg-slate-100" key={i} />
						))}
					</div>
				</div>
			</div>
		);
	}

	// Empty state banner — ketika inventory/menu benar-benar kosong
	if (isDataEmpty) {
		return (
			<div className="flex h-full flex-col bg-slate-50">
				<div className="sticky top-0 z-30 border-b bg-background/80 px-3 py-2 backdrop-blur-md md:px-4 md:py-3">
					<div className="flex items-center gap-2">
						<div className="rounded-lg bg-emerald-600 p-1.5 text-white shadow-lg shadow-emerald-200 md:rounded-xl md:p-2">
							<Package className="h-4 w-4 md:h-5 md:w-5" />
						</div>
						<div>
							<h1 className="font-black text-lg tracking-tight md:text-xl">Stock Overview</h1>
							<p className="text-[10px] font-medium text-muted-foreground md:text-xs">
								Command center stok
							</p>
						</div>
					</div>
				</div>
				<div className="flex flex-1 items-center justify-center p-8">
					<div className="flex max-w-sm flex-col items-center gap-4 text-center">
						<div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100">
							<Package className="h-10 w-10 text-slate-300" />
						</div>
						<div>
							<h2 className="font-black text-lg text-slate-700">Belum Ada Data Stok</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								Data inventory masih kosong. Tambahkan bahan baku dan menu terlebih dahulu agar dashboard stok dapat menampilkan informasi.
							</p>
						</div>
						<Link
							className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-700"
							to="/admin/inventory"
						>
							<Package className="h-4 w-4" />
							Kelola Inventory
						</Link>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col bg-slate-50">
			{/* Header */}
			<div className="sticky top-0 z-30 flex flex-col gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur-md md:gap-3 md:px-4 md:py-3">
				<div className="flex items-center gap-2">
					<div className="rounded-lg bg-emerald-600 p-1.5 text-white shadow-lg shadow-emerald-200 md:rounded-xl md:p-2">
						<Package className="h-4 w-4 md:h-5 md:w-5" />
					</div>
					<div>
						<h1 className="font-black text-lg tracking-tight md:text-xl">Stock Overview</h1>
						<p className="text-[10px] font-medium text-muted-foreground md:text-xs">
							Command center stok
						</p>
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="space-y-4 p-3 pb-28 md:p-4 md:pb-32">
					{/* Summary Cards */}
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"
						initial={{ opacity: 0, y: 10 }}
						transition={{ duration: 0.3 }}
					>
						{/* Total Bahan Baku */}
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:shadow-md"
							initial={{ opacity: 0, scale: 0.95 }}
							transition={{ delay: 0.05, duration: 0.2 }}
						>
							<div className="flex items-center justify-between">
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
									<Archive className="h-5 w-5" />
								</div>
								<span className="text-2xl font-black tracking-tight">
									{totalInventoryCount}
								</span>
							</div>
							<p className="mt-2 font-semibold text-muted-foreground text-xs">Total Bahan Baku</p>
						</motion.div>

						{/* Low Stock */}
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className={cn(
								"rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md",
								lowStockCount > 0
									? "border-red-200 bg-red-50"
									: "border-border/70 bg-card"
							)}
							initial={{ opacity: 0, scale: 0.95 }}
							transition={{ delay: 0.1, duration: 0.2 }}
						>
							<div className="flex items-center justify-between">
								<div
									className={cn(
										"flex h-10 w-10 items-center justify-center rounded-xl",
										lowStockCount > 0
											? "bg-red-200 text-red-700"
											: "bg-green-100 text-green-600"
									)}
								>
									<AlertCircle className="h-5 w-5" />
								</div>
								<span
									className={cn(
										"text-2xl font-black tracking-tight",
										lowStockCount > 0 ? "text-red-700" : "text-green-600"
									)}
								>
									{lowStockCount}
								</span>
							</div>
							<p
								className={cn(
									"mt-2 font-semibold text-xs",
									lowStockCount > 0
										? "text-red-600"
										: "text-muted-foreground"
								)}
							>
								Low Stock
							</p>
						</motion.div>

						{/* Menu Tersedia */}
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:shadow-md"
							initial={{ opacity: 0, scale: 0.95 }}
							transition={{ delay: 0.15, duration: 0.2 }}
						>
							<div className="flex items-center justify-between">
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
									<TrendingUp className="h-5 w-5" />
								</div>
								<span className="text-2xl font-black tracking-tight text-emerald-600">
									{availableMenuCount}
								</span>
							</div>
							<p className="mt-2 font-semibold text-muted-foreground text-xs">Menu Tersedia</p>
						</motion.div>

						{/* Menu Habis */}
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:shadow-md"
							initial={{ opacity: 0, scale: 0.95 }}
							transition={{ delay: 0.2, duration: 0.2 }}
						>
							<div className="flex items-center justify-between">
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
									<TrendingDown className="h-5 w-5" />
								</div>
								<span className="text-2xl font-black tracking-tight text-orange-600">
									{unavailableMenuCount}
								</span>
							</div>
							<p className="mt-2 font-semibold text-muted-foreground text-xs">Menu Habis</p>
						</motion.div>
					</motion.div>

					{/* Quick Actions */}
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm md:p-4"
						initial={{ opacity: 0, y: 10 }}
						transition={{ delay: 0.25, duration: 0.3 }}
					>
						<h3 className="mb-3 font-bold text-sm tracking-tight">Quick Actions</h3>
						<div className="flex flex-wrap gap-2">
							<Link
								className="inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg border border-border bg-background px-3.5 py-2 font-semibold text-xs shadow-sm outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 h-9 gap-1"
								to="/admin/inventory"
							>
								<Package className="mr-1.5 h-3.5 w-3.5" />
								Update Stock
							</Link>
							<Link
								className="inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg border border-border bg-background px-3.5 py-2 font-semibold text-xs shadow-sm outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 h-9 gap-1"
								to="/attendance/stock-opname"
							>
								<ClipboardList className="mr-1.5 h-3.5 w-3.5" />
								Stock Opname
							</Link>
							<Link
								className="inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg border border-border bg-background px-3.5 py-2 font-semibold text-xs shadow-sm outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 h-9 gap-1"
								to={"/admin/kitchen" as any}
								search={{ tab: "stock" } as any}
							>
								<ChefHat className="mr-1.5 h-3.5 w-3.5" />
								Kitchen Stock
							</Link>
							<Link
								className="inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg border border-border bg-background px-3.5 py-2 font-semibold text-xs shadow-sm outline-none transition-all hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 h-9 gap-1"
								to={"/admin/bar" as any}
								search={{ tab: "stock" } as any}
							>
								<Beer className="mr-1.5 h-3.5 w-3.5" />
								Bar Stock
							</Link>
						</div>
					</motion.div>

					{/* Low Stock Alert List */}
					{lowStockItems && lowStockItems.length > 0 && (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="rounded-2xl border border-red-200 bg-red-50 p-3 shadow-sm md:p-4"
							initial={{ opacity: 0, y: 10 }}
							transition={{ delay: 0.3, duration: 0.3 }}
						>
							<div className="mb-3 flex items-center gap-2">
								<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-200 text-red-700">
									<AlertTriangle className="h-4 w-4" />
								</div>
								<h3 className="font-bold text-red-800 text-sm tracking-tight">
									Low Stock Alert
								</h3>
								<span className="ml-auto rounded-full bg-red-200 px-2 py-0.5 text-[10px] font-bold text-red-700">
									{lowStockItems.length} item
								</span>
							</div>
							<div className="space-y-1.5">
								{lowStockItems.map((item: any) => (
									<div
										className="flex items-center justify-between rounded-xl border border-red-100 bg-white p-2.5 transition-all hover:border-red-200 hover:shadow-sm md:p-3"
										key={item._id}
									>
										<div className="flex items-center gap-2.5">
											<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600 shrink-0">
												<Archive className="h-3.5 w-3.5" />
											</div>
											<div>
												<p className="font-semibold text-slate-800 text-sm leading-tight">
													{item.ingredientName}
												</p>
												<p className="text-[10px] font-medium text-red-600">
													Stok: {item.quantity} {item.unit} · Threshold: {item.lowStockThreshold} {item.unit}
												</p>
											</div>
										</div>
										<div className="flex items-center gap-1.5 shrink-0">
											<div
												className={cn(
													"h-2 w-2 rounded-full",
													item.quantity <= 0
														? "bg-red-500"
														: item.quantity <= item.lowStockThreshold / 2
														? "bg-orange-500"
														: "bg-yellow-500"
												)}
											/>
											<span className="text-[10px] font-bold text-slate-500">
												{item.quantity}/{item.lowStockThreshold}
											</span>
										</div>
									</div>
								))}
							</div>
						</motion.div>
					)}

					{/* Stock Overview Table */}
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm md:p-4"
						initial={{ opacity: 0, y: 10 }}
						transition={{ delay: 0.35, duration: 0.3 }}
					>
						<div className="mb-3 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
									<Store className="h-4 w-4" />
								</div>
								<h3 className="font-bold text-sm tracking-tight">Menu Stock</h3>
							</div>
							{/* Category Filter */}
							<select
								className="rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-xs font-medium shadow-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
								onChange={(e) => setSelectedCategoryId(e.target.value)}
								value={selectedCategoryId}
							>
								<option value="all">Semua Kategori</option>
								{categoryOptions.map((cat: any) => (
									<option key={cat._id} value={cat._id}>
										{cat.name}
									</option>
								))}
							</select>
						</div>

						{filteredProducts.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-10 text-center">
								<div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-300">
									<ShoppingCart className="h-6 w-6" />
								</div>
								<p className="font-medium text-muted-foreground text-sm">
									Tidak ada produk
								</p>
							</div>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full text-left text-xs">
									<thead>
										<tr className="border-b border-border/50">
											<th className="pb-2 pr-2 font-bold text-muted-foreground text-[10px] uppercase tracking-wider">
												Produk
											</th>
											<th className="pb-2 px-2 font-bold text-muted-foreground text-[10px] uppercase tracking-wider">
												Kategori
											</th>
											<th className="pb-2 px-2 font-bold text-muted-foreground text-[10px] uppercase tracking-wider text-right">
												Stok
											</th>
											<th className="pb-2 pl-2 font-bold text-muted-foreground text-[10px] uppercase tracking-wider text-right">
												Status
											</th>
											<th className="pb-2 pl-2 font-bold text-muted-foreground text-[10px] uppercase tracking-wider text-right">
												Aksi
											</th>
										</tr>
									</thead>
									<tbody>
										{filteredProducts.map((product: any) => {
											const status = getProductStatus(product);
											const qty = Number(product.quantity ?? 0);
											return (
												<tr
													className="border-b border-border/30 transition-colors hover:bg-muted/30"
													key={product._id}
												>
													<td className="py-2.5 pr-2 font-medium text-slate-800">
														<div className="flex items-center gap-2">
															<div
																className={cn(
																	"h-1.5 w-1.5 rounded-full shrink-0",
																	status.level === "high"
																		? "bg-green-500"
																		: status.level === "medium"
																		? "bg-yellow-500"
																		: "bg-red-500"
																)}
															/>
															<span className="truncate max-w-[180px]">
																{product.name}
															</span>
														</div>
													</td>
													<td className="px-2 py-2.5 text-muted-foreground">
														{getCategoryName(product.categoryId)}
													</td>
													<td className="px-2 py-2.5 text-right font-semibold">
														{qty}
													</td>
													<td className="pl-2 py-2.5 text-right">
												<span
													className={cn(
														"inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold",
														status.color
													)}
												>
													{status.label}
												</span>
											</td>
											<td className="pl-2 py-2.5 text-right">
												<button
													className="inline-flex items-center gap-0.5 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
													onClick={() => {
														setRestockTarget(product);
														setRestockQty("");
														setRestockPrice("");
														setRestockOpen(true);
													}}
													type="button"
												>
													<Plus className="h-3 w-3" />
													Restock
												</button>
											</td>
												</tr>
											);
										})}
							</tbody>
						</table>
					</div>
				)}
			</motion.div>
		</div>
	</div>

	{/* Restock Dialog */}
	<Dialog onOpenChange={(open) => { setRestockOpen(open); if (!open) setRestockTarget(null); }} open={restockOpen}>
		<DialogContent className="sm:max-w-[360px]">
			<DialogHeader>
				<DialogTitle>Restock Menu</DialogTitle>
				<DialogDescription>
					Tambah stok untuk <strong>{restockTarget?.name ?? "—"}</strong>
				</DialogDescription>
			</DialogHeader>
			<div className="space-y-3">
				<div className="space-y-1.5">
					<Label htmlFor="restock-qty">Quantity</Label>
					<Input
						autoFocus
						id="restock-qty"
						min="1"
						onChange={(e) => setRestockQty(e.target.value)}
						placeholder="Masukkan jumlah"
						type="number"
						value={restockQty}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="restock-price">Harga Beli (opsional)</Label>
					<Input
						id="restock-price"
						min="0"
						onChange={(e) => setRestockPrice(e.target.value)}
						placeholder="Rp 0"
						type="number"
						value={restockPrice}
					/>
				</div>
			</div>
			<DialogFooter>
				<Button disabled={restocking} onClick={handleRestock} variant="default">
					{restocking ? "Menyimpan..." : "Restock"}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</div>
);
}
