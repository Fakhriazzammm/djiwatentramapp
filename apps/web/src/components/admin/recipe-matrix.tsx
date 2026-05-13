// @ts-nocheck
import { Link } from "@tanstack/react-router";
import type { Doc, Id } from "@/types/backend-compat";
import { convertToSmallestUnit, getSmallestUnitInfo } from "@/lib/inventory-units";
import {
	Calculator,
	Loader2,
	Package,
	Plus,
	Search,
	Settings2,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
	useHybridAllProducts,
	useHybridCategories,
	useHybridHppProductMap,
	useHybridInventory,
	useHybridLatestInventoryCosts,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridRecipes } from "@/hooks/use-hybrid-inventory-admin-data";
import { useHybridSaveRecipe, useHybridDeleteRecipe } from "@/hooks/use-hybrid-write-actions";

// ─── Helpers ─────────────────────────────────────────────────

function formatRupiah(value: number) {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
		minimumFractionDigits: 0,
	}).format(value);
}

function cn(...classes: (string | false | null | undefined)[]) {
	return classes.filter(Boolean).join(" ");
}

// ─── Cell Editor ─────────────────────────────────────────────

function CellEditor({
	value,
	unit,
	onSave,
	onCancel,
}: {
	value: string;
	unit: string;
	onSave: (val: number) => void;
	onCancel: () => void;
}) {
	const ref = useRef<HTMLInputElement>(null);
	const [temp, setTemp] = useState(value);

	useEffect(() => {
		ref.current?.focus();
		ref.current?.select();
	}, []);

	const commit = () => {
		const parsed = parseFloat(temp);
		if (!isNaN(parsed) && parsed >= 0) {
			onSave(parsed);
		} else {
			onCancel();
		}
	};

	return (
		<div className="flex items-center gap-0.5">
			<Input
				ref={ref}
				type="number"
				value={temp}
				onChange={(e) => setTemp(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") commit();
					if (e.key === "Escape") onCancel();
				}}
				className="h-5 w-14 text-[10px] px-1 py-0 text-center"
				min={0}
				step="0.1"
			/>
			<span className="text-[8px] text-muted-foreground shrink-0">{unit}</span>
		</div>
	);
}

// ─── Main Component ──────────────────────────────────────────

export function RecipeMatrixPage() {
	// Data hooks
	const products = useHybridAllProducts();
	const categories = useHybridCategories();
	const inventory = useHybridInventory();
	const recipes = useHybridRecipes();
	const hppMap = useHybridHppProductMap();
	const costs = useHybridLatestInventoryCosts();
	const saveRecipe = useHybridSaveRecipe();
	const deleteRecipe = useHybridDeleteRecipe();

	// State
	const [search, setSearch] = useState("");
	const [searchBahan, setSearchBahan] = useState("");
	const [editingCell, setEditingCell] = useState<string | null>(null);
	const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
	const [localAmounts, setLocalAmounts] = useState<Record<string, number>>({});
	const [showAllIngredients, setShowAllIngredients] = useState(true);
	const [baseSectionOpen, setBaseSectionOpen] = useState(false);
	const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

	const loading = !products || !inventory || !recipes;

	// ── Derived Data ──

	const recipeByProduct = useMemo(() => {
		const map = new Map<string, Map<string, number>>();
		for (const recipe of recipes ?? []) {
			if (recipe.variantName) continue;
			const ingMap = new Map<string, number>();
			for (const ing of recipe.ingredients) {
				ingMap.set(String(ing.inventoryId), ing.amount);
			}
			map.set(String(recipe.productId), ingMap);
		}
		return map;
	}, [recipes]);

	const usedIngredientIds = useMemo(() => {
		const ids = new Set<string>();
		for (const [, ingMap] of recipeByProduct) {
			for (const id of ingMap.keys()) ids.add(id);
		}
		return ids;
	}, [recipeByProduct]);

	const categoryById = useMemo(() => {
		const map = new Map<string, string>();
		for (const cat of categories ?? []) {
			map.set(String(cat._id), cat.name ?? "");
		}
		return map;
	}, [categories]);

	const ingredientColumns = useMemo(() => {
		const filtered = (inventory ?? []).filter((item) =>
			showAllIngredients ? true : usedIngredientIds.has(String(item._id))
		);
		const keyword = searchBahan.trim().toLowerCase();
		return filtered
			.filter((item) => {
				if (!keyword) return true;
				return (item.ingredientName ?? "")
					.toLowerCase()
					.includes(keyword);
			})
			.sort((a, b) =>
				(a.ingredientName ?? "").localeCompare(
					(b.ingredientName ?? ""),
					"id"
				)
			);
	}, [inventory, usedIngredientIds, showAllIngredients, searchBahan]);

	const productRows = useMemo(() => {
		const keyword = search.trim().toLowerCase();
		return (products ?? [])
			.filter((p) => {
				if (!keyword) return true;
				const cat = categoryById.get(String(p.categoryId)) ?? "";
				return (
					(p.name ?? "").toLowerCase().includes(keyword) ||
					cat.toLowerCase().includes(keyword)
				);
			})
			.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "id"));
	}, [products, categoryById, search]);

	// ── Get amount (local override > recipe) ──

	const getAmount = useCallback(
		(productId: string, inventoryId: string): number | null => {
			const key = `${productId}:${inventoryId}`;
			if (key in localAmounts) return localAmounts[key];
			const ingMap = recipeByProduct.get(productId);
			const val = ingMap?.get(inventoryId);
			return val != null ? val : null;
		},
		[recipeByProduct, localAmounts]
	);

	// ── Save single cell ──

	const handleSaveCell = useCallback(
		async (productId: string, inventoryId: string, amount: number) => {
			const key = `${productId}:${inventoryId}`;
			setSavingCells((prev) => new Set(prev).add(key));

			try {
				const existingMap = recipeByProduct.get(productId);
				const ingredients: { inventoryId: Id<"inventory">; amount: number }[] = [];

				if (existingMap) {
					for (const [invId, amt] of existingMap) {
						if (String(invId) === String(inventoryId)) {
							if (amount > 0) ingredients.push({ inventoryId: invId as Id<"inventory">, amount });
						} else {
							ingredients.push({ inventoryId: invId as Id<"inventory">, amount: amt });
						}
					}
				}
				if (amount > 0 && !existingMap?.has(inventoryId)) {
					ingredients.push({ inventoryId: inventoryId as Id<"inventory">, amount });
				}

				await saveRecipe({
					productId: productId as Id<"products">,
					ingredients,
				});

				setLocalAmounts((prev) => {
					const next = { ...prev };
					delete next[key];
					return next;
				});
			} catch (err: any) {
				toast.error(err?.message ?? "Gagal menyimpan");
			} finally {
				setSavingCells((prev) => {
					const next = new Set(prev);
					next.delete(key);
					return next;
				});
			}
		},
		[recipeByProduct, saveRecipe]
	);

	// ── Delete recipe ──

	const handleDeleteRecipe = useCallback(async (productId: string) => {
		const recipe = [...(recipes ?? [])].find(
			(r) => String(r.productId) === productId && !r.variantName
		);
		if (!recipe) {
			toast.error("Resep tidak ditemukan");
			return;
		}
		setDeletingProductId(productId);
		try {
			await deleteRecipe({ id: recipe._id as Id<"recipes"> });
			toast.success("Resep dihapus");
		} catch (err: any) {
			toast.error(err?.message ?? "Gagal menghapus resep");
		} finally {
			setDeletingProductId(null);
		}
	}, [recipes, deleteRecipe]);

	// ── Cell interaction ──

	const handleCellClick = (productId: string, inventoryId: string) => {
		const currentVal = getAmount(productId, inventoryId);
		setEditingCell(`${productId}:${inventoryId}`);
	};

	const handleCellSave = (productId: string, inventoryId: string, val: number) => {
		const key = `${productId}:${inventoryId}`;
		setLocalAmounts((prev) => ({ ...prev, [key]: val }));
		handleSaveCell(productId, inventoryId, val);
		setEditingCell(null);
	};

	const handleCellCancel = () => setEditingCell(null);

	// ── Stats ──

	const hasRecipeCount = productRows.filter((p) => recipeByProduct.has(String(p._id))).length;
	const totalIngredients = usedIngredientIds.size;

	// ── Loading ──

	if (loading) {
		return (
			<div className="p-4 space-y-3">
				<div className="h-7 w-40 bg-muted animate-pulse rounded" />
				<div className="h-[60vh] bg-muted animate-pulse rounded-lg" />
			</div>
		);
	}

	// ── Render ──

	return (
		<div className="flex flex-col h-full">
			{/* ── Compact Header ── */}
			<div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-card shrink-0">
				<div className="flex items-center gap-2">
					<Package className="h-4 w-4 text-primary" />
					<h1 className="text-sm font-bold tracking-tight">Recipe Matrix</h1>
				</div>
				<div className="flex items-center gap-2 ml-auto">
					<Badge variant="secondary" className="text-[10px] h-5 px-1.5">
						{productRows.length} produk
					</Badge>
					<Badge variant="outline" className="text-[10px] h-5 px-1.5">
						{hasRecipeCount} resep
					</Badge>
					<Badge variant="outline" className="text-[10px] h-5 px-1.5">
						{totalIngredients} bahan
					</Badge>
				</div>
			</div>

			{/* ── Search + Filter ── */}
			<div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-background shrink-0">
				<div className="relative flex-1 max-w-[220px]">
					<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
					<Input
						placeholder="Cari produk..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="h-7 pl-7 text-[11px]"
					/>
				</div>
				<div className="relative flex-1 max-w-[220px]">
					<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
					<Input
						placeholder="Cari bahan..."
						value={searchBahan}
						onChange={(e) => setSearchBahan(e.target.value)}
						className="h-7 pl-7 text-[11px]"
					/>
				</div>
				<Button
					variant={showAllIngredients ? "default" : "outline"}
					size="sm"
					className="h-6 text-[10px] px-2"
					onClick={() => setShowAllIngredients(!showAllIngredients)}
				>
					{showAllIngredients ? "Bahan dipakai" : "Semua bahan"}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 text-[10px] px-2 ml-auto"
					onClick={() => setBaseSectionOpen(!baseSectionOpen)}
				>
					<Settings2 className="h-3 w-3 mr-1" />
					Base Recipe
				</Button>
			</div>

			{/* ── Matrix Table ── */}
			<div className="flex-1 overflow-auto">
				<table className="border-collapse w-max min-w-full">
					<thead>
						<tr>
							{/* Fixed columns */}
							<th className="sticky top-0 left-0 z-20 bg-muted/60 border-b border-r border-border/60 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[130px] backdrop-blur-sm">
								Produk
							</th>
							<th className="sticky top-0 left-[130px] z-20 bg-muted/60 border-b border-r border-border/60 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-14 backdrop-blur-sm">
								Kat
							</th>
							<th className="sticky top-0 z-10 bg-muted/60 border-b border-r border-border/60 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[88px] backdrop-blur-sm">
								HPP
							</th>
							{/* Ingredient columns */}
							{ingredientColumns.map((ing) => {
								const costInfo = costs?.[String(ing._id)];
								const costVal = costInfo?.latestCostPerUnit;
								const unitInfo = getSmallestUnitInfo(ing);
								const dispUnit = unitInfo?.unit || ing.displayUnit || ing.unit;
								const costPerSmallestUnit = costVal && unitInfo && unitInfo.factor > 1
									? costVal / unitInfo.factor
									: costVal;
								return (
									<th
										key={ing._id}
										className="sticky top-0 z-10 bg-muted/60 border-b border-r border-border/40 px-2 py-1.5 text-center min-w-[72px] backdrop-blur-sm"
										title={`${ing.ingredientName}
${costPerSmallestUnit ? formatRupiah(costPerSmallestUnit) + "/" + dispUnit : "harga -"}`}
									>
										<div className="text-[10px] font-bold text-muted-foreground leading-tight truncate max-w-[64px] mx-auto">
											{ing.ingredientName}
										</div>
										<div className="text-[8px] font-normal text-muted-foreground/50 truncate max-w-[64px] mx-auto">
											{costPerSmallestUnit ? formatRupiah(costPerSmallestUnit) : "-"}/{dispUnit}
										</div>
									</th>
								);
							})}
							{/* Add ingredient column button */}
							<th className="sticky top-0 z-10 bg-muted/40 border-b border-border/40 px-1 py-1.5 w-8">
								<Button
									variant="ghost"
									size="sm"
									className="h-6 w-6 p-0 text-muted-foreground/40 hover:text-muted-foreground"
									onClick={() => setShowAllIngredients(true)}
									title="Tampilkan semua bahan"
								>
									<Plus className="h-3 w-3" />
								</Button>
							</th>
						</tr>
					</thead>
					<tbody>
						{productRows.map((product) => {
							const hasRecipe = recipeByProduct.has(String(product._id));
							const hpp = hppMap?.[String(product._id)];
							const cat = categoryById.get(String(product.categoryId)) ?? "";

							return (
								<tr
									key={product._id}
									className={cn(
										"border-b border-border/20 transition-colors group",
										hasRecipe
											? "hover:bg-primary/[0.03]"
											: "bg-amber-50/20 hover:bg-amber-50/40"
									)}
								>
									{/* Product name */}
									<td className="sticky left-0 z-10 bg-card group-hover:bg-primary/[0.03] border-r border-border/40 px-3 py-1.5">
										<div className="flex items-center gap-1">
											<Link
												to="/admin/recipe/hpp"
												search={{ productId: String(product._id) }}
												className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary transition-colors flex-1 min-w-0"
											>
												<span className="truncate">{product.name}</span>
												<Calculator className="h-3 w-3 shrink-0 text-muted-foreground/30 group-hover:text-primary/50" />
											</Link>
											{hasRecipe && (
												<button
													className="shrink-0 rounded p-0.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
													onClick={(e) => {
														e.preventDefault();
														e.stopPropagation();
														handleDeleteRecipe(String(product._id));
													}}
													title="Hapus resep"
													disabled={deletingProductId === String(product._id)}
												>
													{deletingProductId === String(product._id) ? (
														<Loader2 className="h-3 w-3 animate-spin" />
													) : (
														<Trash2 className="h-3 w-3" />
													)}
												</button>
											)}
										</div>
									</td>
									{/* Category */}
									<td className="sticky left-[130px] z-10 bg-card group-hover:bg-primary/[0.03] border-r border-border/40 px-1 py-1.5 text-center text-[9px] text-muted-foreground tabular-nums">
										{cat ? cat.slice(0, 3).toUpperCase() : "—"}
									</td>
									{/* HPP */}
									<td className="border-r border-border/40 px-2 py-1.5 text-right text-[10px] tabular-nums">
										{hpp ? (
											<div className="flex flex-col items-end leading-tight">
												<span className="font-medium">{formatRupiah(Math.round(hpp.hppPerServing))}</span>
												<span
													className={cn(
														"text-[8px]",
														hpp.marginPercent >= 30
															? "text-emerald-600"
															: hpp.marginPercent >= 15
																? "text-amber-600"
																: "text-rose-600"
													)}
												>
													{hpp.marginPercent.toFixed(0)}%
												</span>
											</div>
										) : (
											<span className="text-muted-foreground/30 text-[10px]">—</span>
										)}
									</td>
									{/* Ingredient cells */}
									{ingredientColumns.map((ing) => {
										const invId = String(ing._id);
										const prodId = String(product._id);
										const amount = getAmount(prodId, invId);
										const key = `${prodId}:${invId}`;
										const isEditing = editingCell === key;
										const isSaving = savingCells.has(key);
										const cellUnitInfo = getSmallestUnitInfo(ing);
										const displayAmount = amount != null ? amount * (cellUnitInfo?.factor ?? 1) : null;

										if (isEditing) {
											return (
												<td key={invId} className="border-r border-border/40 px-1 py-0.5 bg-primary/[0.04]">
													<CellEditor
														value={amount != null ? String(amount) : ""}
														unit={(getSmallestUnitInfo(ing)?.unit || ing.displayUnit || ing.unit || "")}
														onSave={(val) => handleCellSave(prodId, invId, val)}
														onCancel={handleCellCancel}
													/>
												</td>
											);
										}

										return (
											<td
												key={invId}
												className={cn(
													"border-r border-border/40 px-2 py-1.5 text-center text-[10px] tabular-nums cursor-pointer transition-colors select-none",
													amount != null && amount > 0
														? "bg-primary/[0.04] hover:bg-primary/[0.08] font-medium text-foreground"
														: "text-muted-foreground/20 hover:bg-muted/30"
												)}
												onClick={() => handleCellClick(prodId, invId)}
												title={
													amount != null
														? `${amount} ${getSmallestUnitInfo(ing)?.unit || ing.displayUnit || ing.unit}`
														: "Klik untuk isi"
												}
											>
												{isSaving ? (
													<Loader2 className="h-3 w-3 animate-spin mx-auto text-muted-foreground" />
												) : amount != null ? (
													amount
												) : (
													<span className="text-[8px] opacity-40">·</span>
												)}
											</td>
										);
									})}
									{/* Empty cell for add-ingredient column */}
									<td className="border-r border-border/20 px-1 py-1.5" />
								</tr>
							);
						})}
						{productRows.length === 0 && (
							<tr>
								<td
									colSpan={4 + ingredientColumns.length}
									className="px-4 py-16 text-center text-xs text-muted-foreground"
								>
									{search ? (
										<>Tidak ada produk "{search}"</>
									) : (
										<div className="space-y-1">
											<p>Belum ada produk</p>
											<Link
												to="/admin/products"
												className="text-primary hover:underline text-[11px]"
											>
												Tambah produk →
											</Link>
										</div>
									)}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* ── Legend ── */}
			<div className="flex items-center gap-4 px-4 py-1.5 border-t border-border/30 bg-muted/20 shrink-0 text-[9px] text-muted-foreground">
				<span className="flex items-center gap-1">
					<span className="inline-block w-2.5 h-2.5 rounded bg-primary/[0.04] border border-border/30" />
					Ada resep
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block w-2.5 h-2.5 rounded bg-amber-50/20 border border-border/30" />
					Belum resep
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block w-2.5 h-2.5 rounded bg-muted/40" />
					Klik cell untuk edit
				</span>
				<span className="ml-auto flex items-center gap-1">
					<Calculator className="h-3 w-3" />
					Klik produk → HPP detail
				</span>
			</div>

			{/* ── Base Recipe Section (collapsible) ── */}
			{baseSectionOpen && (
				<div className="border-t-2 border-primary/20 bg-muted/10 px-4 py-3 shrink-0">
					<div className="flex items-center gap-2 mb-2">
						<Settings2 className="h-3.5 w-3.5 text-primary" />
						<p className="text-[11px] font-bold text-muted-foreground">
							Base Recipe
						</p>
						<Badge variant="outline" className="text-[9px] h-4 px-1">
							segera hadir di matrix
						</Badge>
					</div>
					<p className="text-[10px] text-muted-foreground/60">
						Base recipe (formula setengah jadi) masih dikelola di halaman sebelumnya. Akan diintegrasikan ke matrix ini.
					</p>
				</div>
			)}
		</div>
	);
}
