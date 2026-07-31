import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
	Check,
	ChefHat,
	Minus,
	Plus,
	RotateCcw,
	Search,
	Utensils,
	BarChart3,
	AlertTriangle,
	PackageX,
	Activity,
} from "lucide-react";
import { useCallback, useState, useMemo } from "react";
import { toast } from "sonner";
import {
	triggerHybridRefresh,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridAdjustMenuStockWithRecipe,
	useHybridBulkUpdateProducts,
	useHybridDeleteProduct,
	useHybridUpdateOrderItemStatus,
	useHybridUpdateProduct,
} from "@/hooks/use-hybrid-write-actions";

/* ─── Types ─── */

type FastStockTableProps = {
	products: any[] | undefined;
	inventory: any[] | undefined;
	recipes: any[] | undefined;
	categories: any[] | undefined;
	source: string;
	placeholder: string;
	emptyIcon?: React.ReactNode;
	emptyTitle?: string;
	emptyDesc?: string;
};

/* ─── Gauge Color Helpers ─── */

function getStockLevel(quantity: number, lowThreshold = 10): {
	level: "critical" | "low" | "medium" | "good";
	color: string;
	bg: string;
	barColor: string;
	label: string;
} {
	if (quantity <= 0)
		return {
			level: "critical",
			color: "text-red-600",
			bg: "bg-red-50",
			barColor: "bg-red-500",
			label: "Habis",
		};
	if (quantity <= lowThreshold * 0.5)
		return {
			level: "critical",
			color: "text-red-500",
			bg: "bg-red-50",
			barColor: "bg-red-400",
			label: "Kritis",
		};
	if (quantity <= lowThreshold)
		return {
			level: "low",
			color: "text-amber-500",
			bg: "bg-amber-50",
			barColor: "bg-amber-400",
			label: "Menipis",
		};
	if (quantity <= lowThreshold * 3)
		return {
			level: "medium",
			color: "text-emerald-500",
			bg: "bg-emerald-50",
			barColor: "bg-emerald-400",
			label: "Cukup",
		};
	return {
		level: "good",
		color: "text-emerald-600",
		bg: "bg-emerald-50",
		barColor: "bg-emerald-500",
		label: "Limpah",
	};
}

/* ─── Stock Gauge Component ─── */

function StockGaugeBar({
	quantity,
	lowThreshold = 10,
	maxBar = 50,
}: {
	quantity: number;
	lowThreshold?: number;
	maxBar?: number;
}) {
	const gauge = getStockLevel(quantity, lowThreshold);
	const pct = Math.min((quantity / maxBar) * 100, 100);

	return (
		<div className="flex items-center gap-2">
			<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
				<motion.div
					animate={{ width: `${pct}%` }}
					className={`h-full rounded-full ${gauge.barColor}`}
					initial={{ width: 0 }}
					transition={{ duration: 0.4, ease: "easeOut" }}
				/>
			</div>
			<span
				className={`shrink-0 text-[11px] font-black uppercase tracking-wider ${gauge.color}`}
			>
				{gauge.label}
			</span>
		</div>
	);
}

/* ─── Main Component ─── */

export function FastStockTable({
	products,
	inventory,
	recipes,
	categories,
	source,
	placeholder,
	emptyIcon,
	emptyTitle,
	emptyDesc,
}: FastStockTableProps) {
	/* ── State ── */
	const [searchQuery, setSearchQuery] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState<any>({});
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [bulkQuantity, setBulkQuantity] = useState<number>(0);
	const [activeCategory, setActiveCategory] = useState<string | null>(null);

	const updateProduct = useHybridUpdateProduct();
	const deleteProduct = useHybridDeleteProduct();
	const bulkUpdate = useHybridBulkUpdateProducts();
	const adjustMenuStockWithRecipe = useHybridAdjustMenuStockWithRecipe();
	const [syncingProductIds, setSyncingProductIds] = useState<Set<string>>(
		new Set()
	);
	const [stockInputValues, setStockInputValues] = useState<
		Record<string, string>
	>({});

	/* ── Derived Data ── */

	const allCategoryNames = useMemo(() => {
		if (!categories || !products) return [];
		const names = new Set<string>();
		products.forEach((p) => {
			const cat = categories.find((c: any) => c._id === p.categoryId);
			names.add(cat?.name || "Uncategorized");
		});
		return Array.from(names).sort();
	}, [categories, products]);

	const stats = useMemo(() => {
		if (!products) return { total: 0, lowStock: 0, outOfStock: 0 };
		const low = products.filter(
			(p) => p.quantity > 0 && p.quantity <= 10
		).length;
		const out = products.filter((p) => !p.quantity || p.quantity <= 0).length;
		return { total: products.length, lowStock: low, outOfStock: out };
	}, [products]);

	const filteredProducts = useMemo(() => {
		if (!products) return [];
		return products.filter((p) => {
			const matchesSearch = p.name
				.toLowerCase()
				.includes(searchQuery.toLowerCase());
			const matchesCategory =
				!activeCategory ||
				categories?.find(
					(c: any) =>
						c._id === p.categoryId && c.name === activeCategory
				);
			return matchesSearch && matchesCategory;
		});
	}, [products, searchQuery, activeCategory, categories]);

	const groupedProducts = useMemo(() => {
		if (!products) return {};
		const groups: Record<string, any[]> = {};
		filteredProducts.forEach((product) => {
			const category =
				categories?.find((c: any) => c._id === product.categoryId);
			const categoryName = category?.name || "Uncategorized";
			if (!groups[categoryName]) groups[categoryName] = [];
			groups[categoryName].push(product);
		});
		return groups;
	}, [filteredProducts, categories, products]);

	const productsWithoutRecipe = useMemo(() => {
		if (!filteredProducts.length) return [] as any[];
		return filteredProducts.filter(
			(product) =>
				!recipes?.some(
					(r: any) => r.productId === product._id && !r.variantName
				)
		);
	}, [filteredProducts, recipes]);

	/* ── Handlers ── */

	const handleStockChangeDirect = useCallback(
		async (product: any, newQuantity: number) => {
			if (newQuantity < 0) {
				toast.error("Stok tidak boleh negatif");
				return;
			}
			const currentQuantity = Number(product.quantity ?? 0);
			const delta = newQuantity - currentQuantity;
			if (delta === 0) return;
			const recipe = recipes?.find(
				(r: any) => r.productId === product._id && !r.variantName
			);
			if (!recipe) {
				toast.error(
					`Menu ${product.name} belum punya recipe. Buat recipe dulu.`
				);
				return;
			}
			const ingredients = Array.isArray(recipe.ingredients)
				? recipe.ingredients.filter(
						(ing: any) =>
							typeof ing?.inventoryId === "string" &&
							Number(ing?.amount ?? 0) > 0
				  )
				: [];
			if (ingredients.length === 0) {
				toast.error(
					`Recipe ${product.name} belum punya komposisi bahan baku.`
				);
				return;
			}

			setSyncingProductIds((prev) => {
				const next = new Set(prev);
				next.add(String(product._id));
				return next;
			});

			try {
				await adjustMenuStockWithRecipe({
					productId: String(product._id),
					deltaMenu: delta,
					currentQuantity,
					source,
					recipe,
					notes: `Sinkron stok menu ${product.name} (${
						delta > 0 ? "+" : ""
					}${delta} porsi) dari ${source}`,
				});

				toast.success(
					`Stok ${product.name} ${
						delta > 0 ? "bertambah" : "berkurang"
					} ${Math.abs(delta)} porsi dan bahan baku tersinkron.`
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
		[adjustMenuStockWithRecipe, recipes, source]
	);

	const handleQuickStock = useCallback(
		async (product: any, delta: number) => {
			const newVal = Number(product.quantity ?? 0) + delta;
			setStockInputValues((prev) => ({
				...prev,
				[String(product._id)]: String(newVal),
			}));
			await handleStockChangeDirect(product, newVal);
		},
		[handleStockChangeDirect]
	);

	if (!products) {
		return (
			<div className="space-y-4">
				{Array.from({ length: 5 }).map((_, i) => (
					<div
						className="h-16 animate-pulse rounded-2xl bg-slate-100"
						key={i}
					/>
				))}
			</div>
		);
	}

	if (products.length === 0) {
		return (
			<div className="flex h-[60vh] flex-col items-center justify-center gap-6 text-center">
				<div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-300">
					{emptyIcon || <ChefHat className="h-10 w-10" />}
				</div>
				<div className="space-y-2">
					<h3 className="font-black text-xl text-slate-800 tracking-tight">
						{emptyTitle || "Katalog Kosong"}
					</h3>
					<p className="max-w-[280px] font-medium text-slate-500 text-sm leading-relaxed">
						{emptyDesc || "Belum ada produk yang tersedia."}
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
			triggerHybridRefresh();
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
			toast.success(
				`${product.name} ${
					!product.isAvailable ? "Tersedia" : "Habis"
				}`
			);
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

		if (
			updates.quantity !== undefined &&
			(isNaN(updates.quantity) || updates.quantity === null)
		) {
			toast.error("Jumlah stok tidak valid");
			return;
		}

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
			toast.error(
				`Gagal melakukan pembaruan massal: ${
					error.message || "Kesalahan tidak dikenal"
				}`
			);
		}
	};

	return (
		<div className="relative flex flex-col gap-4">
			{/* ── Summary Stats Card ── */}
			<div className="grid grid-cols-3 gap-2 md:gap-3">
				<div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100 md:p-4">
					<BarChart3 className="h-4 w-4 text-indigo-500 md:h-5 md:w-5" />
					<span className="font-black text-lg text-slate-800 md:text-xl">
						{stats.total}
					</span>
					<span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
						Total
					</span>
				</div>
				<div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100 md:p-4">
					<AlertTriangle className="h-4 w-4 text-amber-500 md:h-5 md:w-5" />
					<span className="font-black text-lg text-amber-600 md:text-xl">
						{stats.lowStock}
					</span>
					<span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
						Menipis
					</span>
				</div>
				<div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100 md:p-4">
					<PackageX className="h-4 w-4 text-red-500 md:h-5 md:w-5" />
					<span className="font-black text-lg text-red-600 md:text-xl">
						{stats.outOfStock}
					</span>
					<span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
						Habis
					</span>
				</div>
			</div>

			{/* ── Category Filter Chips ── */}
			{allCategoryNames.length > 1 && (
				<div className="flex flex-wrap gap-1.5">
					<button
						className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${
							!activeCategory
								? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
								: "bg-white text-slate-500 ring-1 ring-slate-200 hover:ring-indigo-300"
						}`}
						onClick={() => setActiveCategory(null)}
					>
						Semua
					</button>
					{allCategoryNames.map((name) => (
						<button
							className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${
								activeCategory === name
									? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
									: "bg-white text-slate-500 ring-1 ring-slate-200 hover:ring-indigo-300"
							}`}
							key={name}
							onClick={() =>
								setActiveCategory(
									activeCategory === name ? null : name
								)
							}
						>
							{name}
						</button>
					))}
				</div>
			)}

			{/* ── Search ── */}
			<div className="relative">
				<Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
				<input
					className="w-full rounded-2xl border-none bg-white p-3 pl-11 font-bold text-sm text-slate-800 shadow-sm ring-1 ring-slate-200 outline-none transition-all focus:ring-2 focus:ring-indigo-100 md:rounded-[24px] md:p-4 md:pl-12 md:text-base"
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder={placeholder}
					type="text"
					value={searchQuery}
				/>
			</div>

			{/* ── Recipe Warning ── */}
			{productsWithoutRecipe.length > 0 && (
				<div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
					<p className="font-black text-[11px] uppercase tracking-wider">
						<AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {productsWithoutRecipe.length} menu belum punya recipe
					</p>
					<p className="mt-1 text-xs">
						Menu tanpa recipe tidak bisa update stok sinkron bahan
						baku.
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

			{/* ── Product List ── */}
			<div className="space-y-6 md:space-y-8">
				{Object.entries(groupedProducts).map(
					([categoryName, items]) => (
						<div className="space-y-3" key={categoryName}>
							{/* Category Header */}
							<div className="flex items-center justify-between px-2">
								<div className="h-px flex-1 bg-slate-200" />
								<div className="flex items-center gap-2 px-4">
									<button
										className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
											items.every((i) =>
												selectedIds.has(i._id)
											)
												? "bg-indigo-600 border-indigo-600 text-white"
												: "bg-white border-slate-300"
										}`}
										onClick={() =>
											handleSelectAllCategory(items)
										}
									>
										{items.every((i) =>
											selectedIds.has(i._id)
										) && <Check className="h-3 w-3" />}
									</button>
									<h3 className="font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">
										{categoryName}
									</h3>
									<span className="text-[11px] font-bold text-slate-300">
										{items.length}
									</span>
								</div>
								<div className="h-px flex-1 bg-slate-200" />
							</div>

							{/* Product Cards */}
							{items.map((product) => {
								const recipe = recipes?.find(
									(r: any) =>
										r.productId === product._id &&
										!r.variantName
								);
								const recipeMissing = !recipe;
								const isSyncing = syncingProductIds.has(
									String(product._id)
								);

								// Calculate potential portions
								let potentialStock: number | null = null;
								if (recipe && inventory) {
									const stockLimits = recipe.ingredients.map(
										(ing: any) => {
											const invItem = inventory.find(
												(i: any) =>
													i._id === ing.inventoryId
											);
											if (!invItem) return 0;
											return Math.floor(
												invItem.quantity / ing.amount
											);
										}
									);
									potentialStock =
										Math.min(...stockLimits);
								}

								const gauge = getStockLevel(
									Number(product.quantity ?? 0)
								);

								return (
									<motion.div
										className={`group relative overflow-hidden rounded-[24px] border bg-white p-4 shadow-sm transition-all ${
											selectedIds.has(product._id)
												? "border-indigo-200 bg-indigo-50/20"
												: "border-slate-200"
										} ${
											editingId === product._id
												? "ring-2 ring-indigo-500/20"
												: ""
										}`}
										key={product._id}
										layout
									>
										{/* ── Stock Gauge Bar (top gradient) ── */}
										<div className="absolute -top-0.5 left-0 right-0 h-1 overflow-hidden rounded-t-[24px] bg-slate-100">
											<motion.div
												animate={{
													width: `${Math.min(
														(Number(
															product.quantity ??
																0
														) /
															50) *
															100,
														100
													)}%`,
												}}
												className={`h-full ${gauge.barColor}`}
												initial={{ width: 0 }}
												transition={{
													duration: 0.5,
													ease: "easeOut",
												}}
											/>
										</div>

										{/* Checkbox */}
										{!editingId && (
											<div
												className="absolute top-0 left-0 bottom-0 z-10 flex w-9 cursor-pointer items-center justify-center md:w-12"
												onClick={() =>
													handleToggleSelect(
														product._id
													)
												}
											>
												<div
													className={`flex h-5 w-5 items-center justify-center rounded-lg border transition-all ${
														selectedIds.has(
															product._id
														)
															? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
															: "bg-slate-50 border-slate-200 group-hover:border-indigo-300"
													}`}
												>
													{selectedIds.has(
														product._id
													) && (
														<Check className="h-3.5 w-3.5 stroke-[3]" />
													)}
												</div>
											</div>
										)}

										<div
											className={
												!editingId
													? "pl-8 md:pl-10"
													: ""
											}
										>
											{editingId === product._id ? (
												/* ── Edit Mode ── */
												<div className="space-y-4">
													<div className="flex items-center gap-3">
														<input
															autoFocus
															className="flex-1 rounded-xl bg-slate-50 p-3 font-bold text-slate-800 ring-1 ring-slate-200"
															onChange={(e) =>
																setEditForm({
																	...editForm,
																	name: e
																		.target
																		.value,
																})
															}
															value={editForm.name}
														/>
													</div>
													<div className="flex items-center gap-2">
														<div className="flex-1">
															<p className="mb-1 ml-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
																Harga
															</p>
															<input
																className="w-full rounded-xl bg-slate-50 p-3 font-bold text-indigo-600 ring-1 ring-slate-200"
																onChange={(
																	e
																) =>
																	setEditForm(
																		{
																			...editForm,
																			price: Number(
																				e
																					.target
																					.value
																			),
																		}
																	)
																}
																type="number"
																value={
																	editForm.price
																}
															/>
														</div>
														<div className="flex-1">
															<p className="mb-1 ml-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
																Siap Saji
															</p>
															<div className="flex items-center gap-1 rounded-xl bg-slate-50 p-1 ring-1 ring-slate-200">
																<button
																	className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm"
																	onClick={() =>
																		setEditForm(
																			{
																				...editForm,
																				quantity:
																					Math.max(
																						0,
																						editForm.quantity -
																							1
																					),
																			}
																		)
																	}
																>
																	<Minus className="h-4 w-4" />
																</button>
																<input
																	className="w-full bg-transparent text-center font-black text-slate-800 outline-none"
																	onChange={(
																		e
																	) =>
																		setEditForm(
																			{
																				...editForm,
																				quantity:
																					Number(
																						e
																							.target
																							.value
																					),
																			}
																		)
																	}
																	type="number"
																	value={
																		editForm.quantity
																	}
																/>
																<button
																	className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm"
																	onClick={() =>
																		setEditForm(
																			{
																				...editForm,
																				quantity:
																					editForm.quantity +
																					1,
																			}
																		)
																	}
																>
																	<Plus className="h-4 w-4" />
																</button>
															</div>
														</div>
													</div>
													<div className="flex gap-2 pt-2">
														<button
															className="flex-1 rounded-2xl bg-indigo-600 py-3 font-black text-xs text-white shadow-xl transition-all active:scale-95"
															onClick={() =>
																handleSave(
																	product._id
																)
															}
														>
															SIMPAN
														</button>
														<button
															className="rounded-2xl bg-slate-100 px-6 py-3 font-black text-xs text-slate-400"
															onClick={() =>
																setEditingId(
																	null
																)
															}
														>
															BATAL
														</button>
													</div>
												</div>
											) : (
												/* ── View Mode ── */
												<div className="flex flex-col gap-3 md:gap-4">
													{/* Top Row: Info + Actions */}
													<div className="flex items-start justify-between gap-2">
														<div className="flex min-w-0 items-center gap-2.5 md:gap-3">
															<div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-100 md:h-12 md:w-12 md:rounded-2xl">
																{product.image ? (
																	<img
																		alt={
																			product.name
																		}
																		className="h-full w-full object-cover"
																		src={
																			product.image
																		}
																	/>
																) : (
																	<div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
																		<ChefHat className="h-5 w-5" />
																	</div>
																)}
															</div>
															<div className="min-w-0">
																<h4 className="line-clamp-2 font-bold text-slate-800 leading-tight">
																	{
																		product.name
																	}
																</h4>
																<div className="mt-1 flex flex-wrap items-center gap-1.5 font-bold text-[11px] uppercase tracking-widest md:gap-2 md:text-[10px]">
																	<span className="text-indigo-600">
																		Rp{" "}
																		{product.price.toLocaleString()}
																	</span>
																	<span className="text-slate-300">
																		•
																	</span>
																	<div className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 ${gauge.bg}`}>
																		<Activity className={`h-2.5 w-2.5 ${gauge.color}`} />
																		<span className={`${gauge.color}`}>
																			{gauge.label}
																		</span>
																	</div>
																</div>
															</div>
														</div>

														<div className="flex shrink-0 items-center gap-1.5 md:gap-2">
															<button
																className={`flex h-8 items-center gap-1 rounded-lg px-2.5 font-black text-[11px] uppercase tracking-wider transition-all active:scale-95 md:h-10 md:rounded-xl md:px-3 md:text-[10px] ${
																	product.isAvailable
																		? "bg-green-50 text-green-600 ring-1 ring-green-100"
																		: "bg-red-50 text-red-600 ring-1 ring-red-100"
																}`}
																onClick={() =>
																	handleToggleAvailability(
																		product
																	)
																}
															>
																{product.isAvailable
																	? "AKTIF"
																	: "OFF"}
															</button>
															<button
																className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-400 ring-1 ring-slate-100 transition-all active:scale-95 md:h-10 md:w-10 md:rounded-xl"
																onClick={() =>
																	handleEdit(
																		product
																	)
																}
															>
																<RotateCcw className="h-4 w-4" />
															</button>
														</div>
													</div>

													{/* ── Stock Gauge + Quick Actions ── */}
													<div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
														<button
															className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm transition-all hover:text-indigo-600 active:scale-95"
															disabled={
																recipeMissing ||
																isSyncing ||
																(Number(
																	product.quantity ??
																		0
																) <= 0)
															}
															onClick={() =>
																handleQuickStock(
																	product,
																	-1
																)
															}
														>
															<Minus className="h-3.5 w-3.5" />
														</button>

														<div className="flex flex-1 flex-col gap-1">
															<div className="flex items-center justify-between">
																<span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
																	Stok
																</span>
																<input
																	type="number"
																	min={0}
																	className="w-14 rounded border bg-white text-center font-bold text-[13px] outline-none transition-all focus:ring-2 focus:ring-indigo-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
																	disabled={
																		recipeMissing ||
																		isSyncing
																	}
																	value={
																		stockInputValues[
																			String(
																				product._id
																			)
																		] ??
																		String(
																			product.quantity ??
																				0
																		)
																	}
																	onChange={(
																		e
																	) =>
																		setStockInputValues(
																			(
																				prev
																			) => ({
																				...prev,
																				[String(
																					product._id
																				)]:
																					e
																						.target
																						.value,
																			})
																		)
																	}
																	onBlur={(
																		e
																	) => {
																		const newVal =
																			Number(
																				e
																					.target
																					.value
																			);
																		const currentQuantity =
																			Number(
																				product.quantity ??
																					0
																			);
																		if (
																			isNaN(
																				newVal
																			) ||
																			newVal <
																				0 ||
																			newVal ===
																				currentQuantity
																		) {
																			setStockInputValues(
																				(
																					prev
																				) => {
																					const next =
																						{
																							...prev,
																						};
																					delete next[
																						String(
																							product._id
																						)
																					];
																					return next;
																				}
																			);
																			return;
																		}
																		void handleStockChangeDirect(
																			product,
																			newVal
																		);
																	}}
																	onKeyDown={(
																		e
																	) => {
																		if (
																			e.key ===
																			"Enter"
																		)
																			e.currentTarget.blur();
																	}}
																/>
															</div>
															<StockGaugeBar
																quantity={Number(
																	product.quantity ??
																		0
																)}
															/>
														</div>

														<button
															className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm transition-all hover:text-indigo-600 active:scale-95"
															disabled={
																recipeMissing ||
																isSyncing
															}
															onClick={() =>
																handleQuickStock(
																	product,
																	1
																)
															}
														>
															<Plus className="h-3.5 w-3.5" />
														</button>
													</div>

													{/* ── Recipe Missing Warning ── */}
													{recipeMissing && (
														<div className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-[10px] font-semibold text-amber-900">
															Menu ini belum
															punya recipe. Stok
															menu tidak bisa
															disinkronkan ke
															bahan baku.
															<a
																className="ml-1 underline"
																href="/admin/recipe"
															>
																Buat recipe
															</a>
														</div>
													)}

													{/* ── Inventory Integration ── */}
													{recipe && (
														<div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100 md:rounded-2xl md:p-3">
															<div className="flex items-center justify-between">
																<span className="font-black text-[11px] text-slate-400 uppercase tracking-widest">
																	Ketersediaan
																	Bahan
																	(Inventory)
																</span>
																<div
																	className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ${
																		potentialStock ===
																		0
																			? "bg-red-100 text-red-600"
																			: "bg-green-100 text-green-600"
																	}`}
																>
																	POTENSI:{" "}
																	{potentialStock}{" "}
																	PORSI
																</div>
															</div>
															<div className="mt-1 flex flex-wrap gap-1.5">
																{recipe.ingredients.map(
																	(
																		ing: any
																	) => {
																		const invItem =
																			inventory?.find(
																				(
																					i: any
																				) =>
																					i._id ===
																					ing.inventoryId
																			);
																		const isLow =
																			invItem
																				? invItem.quantity <
																				  (invItem.lowStockThreshold ||
																						10)
																				: true;
																		return (
																			<div
																				className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-bold ${
																					isLow
																						? "bg-red-50 text-red-600 ring-1 ring-red-100"
																						: "bg-white text-slate-600 ring-1 ring-slate-100"
																				}`}
																				key={
																					ing.inventoryId
																				}
																			>
																				{invItem?.ingredientName ||
																					"Unknown"}
																				<span className="opacity-50">
																					•
																				</span>
																				{invItem
																					? invItem.displayUnit &&
																					  invItem.conversionFactor &&
																					  invItem.conversionFactor >
																							0
																						? `${(
																								invItem.quantity /
																								invItem.conversionFactor
																						  ).toFixed(
																								2
																						  )} ${invItem.displayUnit}`
																						: `${invItem.quantity} ${invItem.unit}`
																					: "Kosong"}
																			</div>
																		);
																	}
																)}
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
					)
				)}
			</div>

			{/* ── Floating Bulk Action Bar ── */}
			<AnimatePresence>
				{selectedIds.size > 0 && (
					<motion.div
						animate={{ y: 0, opacity: 1 }}
						className="fixed bottom-24 left-3 right-3 z-50 flex flex-col items-stretch gap-3 rounded-2xl bg-slate-900/95 p-3 shadow-2xl backdrop-blur-lg ring-1 ring-white/10 md:bottom-8 md:left-auto md:right-8 md:w-[600px] md:flex-row md:items-center md:justify-between md:gap-2 md:rounded-[32px] md:p-2 md:pl-6"
						exit={{ y: 100, opacity: 0 }}
						initial={{ y: 100, opacity: 0 }}
					>
						<div className="flex flex-col">
							<span className="font-black text-white text-xs uppercase tracking-widest">
								{selectedIds.size} Dipilih
							</span>
							<button
								className="text-left font-bold text-[10px] text-slate-400 hover:text-indigo-400"
								onClick={() => setSelectedIds(new Set())}
							>
								Batal Seleksi
							</button>
						</div>

						<div className="flex flex-col gap-2 md:flex-row md:items-center">
							<div className="flex items-center gap-1 rounded-xl bg-white/10 p-1 md:rounded-2xl">
								<input
									className="w-12 bg-transparent text-center font-black text-white text-sm outline-none"
									onChange={(e) =>
										setBulkQuantity(
											Number(e.target.value)
										)
									}
									placeholder="Stok"
									type="number"
									value={bulkQuantity}
								/>
								<button
									className="rounded-xl bg-indigo-600 px-3 py-2 font-black text-[10px] text-white transition-all active:scale-95"
									onClick={() =>
										handleBulkUpdate({
											quantity: bulkQuantity,
										})
									}
								>
									SET STOK
								</button>
							</div>

							<div className="mx-1 hidden h-8 w-px bg-white/10 md:block" />

							<div className="flex items-center gap-1">
								<button
									className="rounded-xl bg-green-500/20 px-3 py-2.5 font-black text-[10px] text-green-400 transition-all hover:bg-green-500 hover:text-white active:scale-95"
									onClick={() =>
										handleBulkUpdate({
											isAvailable: true,
										})
									}
								>
									AKTIFKAN
								</button>
								<button
									className="rounded-xl bg-red-500/20 px-3 py-2.5 font-black text-[10px] text-red-400 transition-all hover:bg-red-500 hover:text-white active:scale-95"
									onClick={() =>
										handleBulkUpdate({
											isAvailable: false,
										})
									}
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
