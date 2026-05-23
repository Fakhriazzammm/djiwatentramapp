// @ts-nocheck
import { Link } from "@tanstack/react-router";
import type { Doc, Id } from "@/types/backend-compat";
import { convertToSmallestUnit, getSmallestUnitInfo, getSmallestUnitLabel } from "@/lib/inventory-units";
import {
	BookOpen,
	Calculator,
	CheckCircle2,
	ChevronRight,
	Edit,
	Eye,
	FileText,
	ListOrdered,
	Loader2,
	Package,
	Plus,
	Search,
	Settings2,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
	useHybridAllProducts,
	useHybridCategories,
	useHybridHppProductMap,
	useHybridInventory,
	useHybridLatestInventoryCosts,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridRecipes, filterProductsWithoutRecipes } from "@/hooks/use-hybrid-inventory-admin-data";
import { ModalScaffold } from "@/components/admin/recipe-book";
import { RecipeStepsEditor } from "@/components/admin/recipe-steps-editor";
import type { RecipeStep } from "@/hooks/use-hybrid-inventory-admin-data";
import { useHybridSaveRecipe, useHybridDeleteRecipe, useHybridUpsertHppFromRecipe } from "@/hooks/use-hybrid-write-actions";

import { ProductSelector } from "@/components/admin/product-selector";
import { MissingRecipeTab } from "@/components/admin/missing-recipe-tab";
import PerProductRecipeEditor from "@/components/admin/per-product-recipe-editor";
import QuickProductForm from "@/components/admin/quick-product-form";
import { useNavigate } from "@tanstack/react-router";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";

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

function safeLower(value: unknown) {
	return typeof value === "string" ? value.toLowerCase() : "";
}

const COMMON_UNIT_PAIRS = [
	{ purchase: "liter", usage: "ml", factor: 1000 },
	{ purchase: "kg", usage: "gram", factor: 1000 },
	{ purchase: "box (1L)", usage: "ml", factor: 1000 },
	{ purchase: "box (500ml)", usage: "ml", factor: 500 },
	{ purchase: "box (250ml)", usage: "ml", factor: 250 },
	{ purchase: "karung (25kg)", usage: "gram", factor: 25_000 },
	{ purchase: "karung (50kg)", usage: "gram", factor: 50_000 },
	{ purchase: "pack", usage: "pcs", factor: 1 },
	{ purchase: "lusin", usage: "pcs", factor: 12 },
	{ purchase: "dus", usage: "pcs", factor: 1 },
];

function findUnitPair(purchaseUnit: string, usageUnit: string) {
	return COMMON_UNIT_PAIRS.find(
		(p) => safeLower(p.purchase).includes(safeLower(purchaseUnit)) && safeLower(p.usage).includes(safeLower(usageUnit))
	) ?? { purchase: purchaseUnit, usage: usageUnit, factor: 1 };
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

// ─── Ala Carte Keywords untuk filter & badge ──────────────────

// ─── Main Component ──────────────────────────────────────────

export function RecipeMatrixPage() {
	// Data hooks
	const products = useHybridAllProducts();
	const categories = useHybridCategories();
	const inventory = useHybridInventory();
	const recipes = useHybridRecipes();
	const savedHppMap = useHybridHppProductMap();
	const costs = useHybridLatestInventoryCosts();
	const saveRecipe = useHybridSaveRecipe();
	const deleteRecipe = useHybridDeleteRecipe();
	const upsertHppFromRecipe = useHybridUpsertHppFromRecipe();

	// State
	const [search, setSearch] = useState("");
	const [searchBahan, setSearchBahan] = useState("");
	const [editingCell, setEditingCell] = useState<string | null>(null);
	const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
	const [localAmounts, setLocalAmounts] = useState<Record<string, number>>({});
	const [showAllIngredients, setShowAllIngredients] = useState(true);
	const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
	const [readMode, setReadMode] = useState(false);
	const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
	const [productStepsModal, setProductStepsModal] = useState<{
		productId: string;
		productName: string;
		steps: RecipeStep[];
	} | null>(null);
	const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<'all' | 'missing'>('all');
	const [viewMode, setViewMode] = useState<'per-product' | 'matrix'>('matrix');
	const [showQuickProductForm, setShowQuickProductForm] = useState(false);
	const navigate = useNavigate();

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

	const inventoryById = useMemo(() => {
		const map = new Map<string, any>();
		for (const item of inventory ?? []) {
			map.set(String(item._id), item);
		}
		return map;
	}, [inventory]);

	const hppMap = useMemo(() => {
		const result: Record<string, { hppId: string; name: string; hppPerServing: number; sellingPrice: number; profitPerServing: number; marginPercent: number }> = {};

		for (const product of products ?? []) {
			const productId = String(product._id);
			const recipe = (recipes ?? []).find((r) => String(r.productId) === productId && !r.variantName);
			if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
				if (savedHppMap?.[productId]) {
					result[productId] = {
						...savedHppMap[productId],
						name: product.name ? `HPP ${product.name}` : (savedHppMap[productId]?.name ?? "HPP Produk"),
					};
				}
				continue;
			}

			const ingredientCostPerServing = recipe.ingredients.reduce((sum, ing) => {
				const inventoryId = String(ing.inventoryId ?? "");
				if (!inventoryId) return sum;

				const invItem = inventoryById.get(inventoryId);
				const costInfo = costs?.[inventoryId];
				const latestCostPerUnit = Number(costInfo?.latestCostPerUnit ?? 0);
				const usagePerServing = Number(ing.amount ?? 0);
				if (!(latestCostPerUnit > 0) || !(usagePerServing > 0)) return sum;

				const unitPair = findUnitPair(
					invItem?.unit ?? costInfo?.unit ?? "",
					invItem?.displayUnit ?? costInfo?.displayUnit ?? ""
				);
				const invFactor = Number(invItem?.contentToBaseFactor ?? 0);
				const costFactor = Number(costInfo?.conversionFactor ?? 0);
				const factor = invFactor > 0
					? invFactor
					: costFactor > 0
						? costFactor
						: unitPair.factor > 0
							? unitPair.factor
							: 1;

				const purchasePrice = latestCostPerUnit / factor;
				return sum + purchasePrice * usagePerServing;
			}, 0);

			const sellingPrice = Number(product.promoPrice ?? product.price ?? 0);
			const profitPerServing = sellingPrice - ingredientCostPerServing;
			const marginPercent = sellingPrice > 0 ? (profitPerServing / sellingPrice) * 100 : 0;

			result[productId] = {
				hppId: savedHppMap?.[productId]?.hppId ?? productId,
				name: product.name ? `HPP ${product.name}` : (savedHppMap?.[productId]?.name ?? "HPP Produk"),
				hppPerServing: ingredientCostPerServing,
				sellingPrice,
				profitPerServing,
				marginPercent,
			};
		}

		for (const [key, value] of Object.entries(savedHppMap ?? {})) {
			if (!result[key]) result[key] = value as any;
		}

		return result;
	}, [products, recipes, inventoryById, costs, savedHppMap]);

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
			.sort((a, b) =>
				(a.name ?? "").localeCompare(b.name ?? "", "id")
			);
	}, [products, search, categoryById]);

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

				// Keep value in localAmounts (already set optimistically by handleCellSave)
				// Don't delete — avoids flashback to stale recipeByProduct before realtime refresh

				// Sync HPP after recipe change (Recipe → HPP)
				upsertHppFromRecipe({
					productId,
					overheadCosts: [],
				}).catch(() => {
					// Non-blocking — HPP sync shouldn't fail the cell save
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
		[recipeByProduct, saveRecipe, upsertHppFromRecipe]
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
		setPendingDeleteIds((prev) => new Set(prev).add(`product:${productId}`));
		setDeletingProductId(productId);
		try {
			await deleteRecipe({ id: recipe._id as Id<"recipes"> });
			await new Promise((r) => setTimeout(r, 400));
			toast.success("Resep dihapus");
		} catch (err: any) {
			toast.error(err?.message ?? "Gagal menghapus resep");
		} finally {
			setDeletingProductId(null);
			setPendingDeleteIds((prev) => {
				const next = new Set(prev);
				next.delete(`product:${productId}`);
				return next;
			});
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

	// ── Selection & Bulk Delete ──

	const toggleRowSelection = useCallback((id: string) => {
		setSelectedRowIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const toggleSelectAll = useCallback(() => {
		setSelectedRowIds((prev) => {
			if (prev.size > 0) return new Set();
			const all = new Set<string>();
			for (const p of productRows) all.add(`product:${p._id}`);
			return all;
		});
	}, [productRows]);

	const handleBulkDelete = useCallback(async () => {
		const ids = [...selectedRowIds];
		if (ids.length === 0) return;
		setIsBulkDeleting(true);
		setPendingDeleteIds((prev) => {
			const next = new Set(prev);
			for (const id of ids) next.add(id);
			return next;
		});
		let deletedCount = 0;
		let errorCount = 0;
		for (const id of ids) {
			const [type, rawId] = id.split(":");
			try {
				if (type === "product") {
					const recipe = [...(recipes ?? [])].find(
						(r) => !r.variantName && String(r.productId) === rawId
					);
					if (recipe) {
						await deleteRecipe({ id: recipe._id as Id<"recipes"> });
						upsertHppFromRecipe({ productId: rawId, overheadCosts: [] }).catch(() => {});
					}
				}

				deletedCount++;
			} catch {
				errorCount++;
			}
		}
		await new Promise((r) => setTimeout(r, 400));
		setSelectedRowIds(new Set());
		setIsBulkDeleting(false);
		setPendingDeleteIds(new Set());
		if (errorCount === 0) {
			toast.success(`${deletedCount} resep berhasil dihapus`);
		} else {
			toast.warning(`${deletedCount} berhasil, ${errorCount} gagal`);
		}
	}, [selectedRowIds, recipes, deleteRecipe, upsertHppFromRecipe]);

	const hasRecipeCount = productRows.filter((p) => recipeByProduct.has(String(p._id))).length;
	const missingCount = useMemo(() => {
		if (!products || !recipes) return 0;
		return filterProductsWithoutRecipes(products, recipes).length;
	}, [products, recipes]);
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
				<Link to="/admin/recipe/view">
					<Button
						variant="outline"
						size="sm"
						className="h-6 text-[10px] px-2"
					>
						<Eye className="h-3 w-3 mr-1" />
						Mode Baca
					</Button>
				</Link>
			</div>

			{/* ── Search + Tabs + Mode ── */}
			<div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-background shrink-0">
				<>
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
				</>
			</div>

			<div className="flex items-center gap-3 mb-3 flex-wrap px-4 py-1">
				<ProductSelector
					products={(products ?? []) as any}
					recipes={(recipes ?? []) as any}
					selectedProductId={selectedProductId ?? undefined}
					onSelect={(id) => { setSelectedProductId(id); setViewMode('per-product'); }}
					onCreateNew={() => setShowQuickProductForm(true)}
				/>
				<div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
					<button className={cn("px-2.5 py-1 rounded text-[10px] font-medium transition-all", activeTab === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')} onClick={() => setActiveTab('all')}>📋 Semua Resep</button>
					<button className={cn("px-2.5 py-1 rounded text-[10px] font-medium transition-all flex items-center gap-1", activeTab === 'missing' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')} onClick={() => setActiveTab('missing')}>⚠️ Perlu Resep{missingCount > 0 ? ` (${missingCount})` : ''}</button>
				</div>
				<button className={cn("px-2.5 py-1 rounded text-[10px] border transition-all", viewMode === 'per-product' ? 'bg-primary/10 border-primary/20 text-primary' : 'border-border text-muted-foreground')} onClick={() => setViewMode(viewMode === 'per-product' ? 'matrix' : 'per-product')}>
					{viewMode === 'per-product' ? '📊 Matrix' : '🔍 Per Produk'}
				</button>
			</div>

			{activeTab === 'missing' && (
				<MissingRecipeTab
					products={(products ?? []) as any}
					recipes={(recipes ?? []) as any}
					onSelectProduct={(id) => { setSelectedProductId(id); setViewMode('per-product'); setActiveTab('all'); }}
				/>
			)}

			{viewMode === 'per-product' && selectedProductId && (
				<PerProductRecipeEditor
					product={products?.find(p => String(p._id) === selectedProductId) ?? null}
					recipe={recipes?.find(r => String(r.productId) === selectedProductId && !r.variantName) ?? null}
					inventory={(inventory ?? []) as any}
					latestCosts={costs as any}
					onSave={async (ingredients) => { await saveRecipe({ productId: selectedProductId as any, ingredients }); }}
					onNavigateToHpp={() => navigate({ to: '/admin/recipe/hpp', search: { productId: selectedProductId } })}
					onNavigateToProduct={() => navigate({ to: '/admin/products' })}
				/>
			)}

			{viewMode !== 'per-product' && (<React.Fragment>
		{/* ── Matrix Table ── */}
			<div className="flex-1 overflow-auto">
				<table className="border-collapse w-max min-w-full">
					<thead>
						<tr>
							{/* Fixed columns */}
							<th className="sticky top-0 left-0 z-20 bg-muted/60 border-b border-r border-border/60 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[130px] backdrop-blur-sm">
								<div className="flex items-center gap-1">
									<input
										type="checkbox"
										checked={selectedRowIds.size > 0 && selectedRowIds.size === productRows.length}
										ref={(el) => { if (el) el.indeterminate = selectedRowIds.size > 0 && selectedRowIds.size < productRows.length; }}
										onChange={toggleSelectAll}
										className="h-3 w-3 shrink-0 accent-primary"
									/>
									<span>Produk</span>
								</div>
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
							const isDeleting = pendingDeleteIds.has(`product:${product._id}`);

							return (
								<tr
									key={product._id}
									className={cn(
										"border-b border-border/20 transition-colors group",
										isDeleting && "opacity-40 pointer-events-none",
										hasRecipe
											? "hover:bg-primary/[0.03]"
											: "bg-amber-50/20 hover:bg-amber-50/40"
									)}
								>
									{/* Product name */}
									<td className={cn(
										"sticky left-0 z-10 border-r border-border/40 px-2 py-1.5",
										selectedRowIds.has(`product:${product._id}`) ? "bg-primary/[0.06]" : "bg-card group-hover:bg-primary/[0.03]"
									)}>
										<div className="flex items-center gap-1.5">
											<input
												type="checkbox"
												checked={selectedRowIds.has(`product:${product._id}`)}
												onChange={() => toggleRowSelection(`product:${product._id}`)}
												onClick={(e) => e.stopPropagation()}
												className="h-3 w-3 shrink-0 accent-primary"
											/>
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
													className="shrink-0 rounded p-0.5 text-muted-foreground/30 hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all"
													onClick={(e) => {
														e.preventDefault();
														e.stopPropagation();
														const existingRecipe = recipes?.find((r) => !r.variantName && String(r.productId) === String(product._id));
														setProductStepsModal({
															productId: String(product._id),
															productName: product.name ?? '',
															steps: existingRecipe?.steps ?? [],
														});
													}}
													title="Atur langkah-langkah"
													>
														<ListOrdered className="h-3 w-3" />
												</button>
											)}
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
														value={displayAmount != null ? String(displayAmount) : ""}
														unit={(getSmallestUnitInfo(ing)?.unit || ing.displayUnit || ing.unit || "")}
														onSave={(val) => { const f = cellUnitInfo?.factor ?? 1; handleCellSave(prodId, invId, Number(val) / f); }}
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
													displayAmount != null
														? `${displayAmount} ${getSmallestUnitInfo(ing)?.unit || ing.displayUnit || ing.unit}`
														: "Klik untuk isi"
												}
											>
												{isSaving ? (
													<Loader2 className="h-3 w-3 animate-spin mx-auto text-muted-foreground" />
												) : displayAmount != null ? (
													displayAmount
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

			{/* ── Bulk Action Bar ── */}
			{selectedRowIds.size > 0 && (
				<div className="flex items-center gap-3 px-4 py-2 border-t border-primary/30 bg-primary/[0.06] shrink-0">
					<span className="text-[10px] font-medium text-primary">
						{selectedRowIds.size} dipilih
					</span>
					<Button
						variant="destructive"
						size="sm"
						className="h-6 text-[10px] px-2"
						onClick={handleBulkDelete}
						disabled={isBulkDeleting}
					>
						{isBulkDeleting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
						Hapus ({selectedRowIds.size})
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 text-[10px] px-2 ml-auto"
						onClick={() => setSelectedRowIds(new Set())}
					>
						Batal
					</Button>
				</div>
			)}

			</React.Fragment>)}

			{/* ── Product Steps Modal ── */}
			{productStepsModal && (
				<ModalScaffold
					onClose={() => setProductStepsModal(null)}
					title={`Langkah-Langkah: ${productStepsModal.productName}`}
				>
					<div className="space-y-4">
						<RecipeStepsEditor
							steps={productStepsModal.steps}
							onChange={(next) => setProductStepsModal((prev) => prev ? { ...prev, steps: next } : null)}
						/>
						<div className="flex justify-end gap-2 pt-2 border-t border-border">
							<Button onClick={() => setProductStepsModal(null)} type="button" variant="outline" size="sm">Batal</Button>
							<Button
								type="button"
								size="sm"
								onClick={async () => {
									try {
										await saveRecipe({
											productId: productStepsModal.productId as any,
											ingredients: [],
											steps: productStepsModal.steps,
										});
										toast.success('Langkah-langkah tersimpan');
										setProductStepsModal(null);
									} catch (err) {
										toast.error(err?.message ?? 'Gagal menyimpan langkah');
									}
								}}
							>
								Simpan Langkah
							</Button>
						</div>
					</div>
				</ModalScaffold>
			)}
			{showQuickProductForm && (
				<QuickProductForm
					open={showQuickProductForm}
					onClose={() => setShowQuickProductForm(false)}
					onSuccess={(productId) => {
						setShowQuickProductForm(false);
						setSelectedProductId(productId);
						setViewMode('per-product');
						triggerHybridRefresh();
					}}
				/>
			)}

		</div>
	);
}

// ─── ReadOnlyView ─────────────────────────────────────────

function ReadOnlyView({
	baseRecipes,
	productRecipes,
	inventory,
	categoryById,
	search,
}: {
	baseRecipes: any[];
	productRecipes: any[];
	inventory: any[];
	categoryById: Map<string, string>;
	search: string;
}) {
	const inventoryMap = useMemo(
		() => new Map((inventory ?? []).map((item: any) => [String(item._id), item])),
		[inventory]
	);

	const keyword = search.trim().toLowerCase();
	const filteredBase = useMemo(() => {
		if (!keyword) return baseRecipes;
		return baseRecipes.filter((r: any) => {
			const matchIng = (r.ingredients ?? []).some((ing: any) => {
				const inv = inventoryMap.get(String(ing.inventoryId));
				return inv?.ingredientName?.toLowerCase().includes(keyword);
			});
			return r.name.toLowerCase().includes(keyword) || r.description?.toLowerCase().includes(keyword) || matchIng;
		});
	}, [baseRecipes, keyword, inventoryMap]);

	const filteredProduct = useMemo(() => {
		if (!keyword) return productRecipes;
		return productRecipes.filter((row: any) => {
			return row.product.name.toLowerCase().includes(keyword) || row.categoryName.toLowerCase().includes(keyword);
		});
	}, [productRecipes, keyword]);

	if (filteredBase.length === 0 && filteredProduct.length === 0) {
		return <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground p-8">Tidak ada recipe ditemukan.</div>;
	}

	return (
		<div className="flex-1 overflow-y-auto space-y-4 p-4">
			{/* Base Recipe */}
			{filteredBase.length > 0 && (
				<div className="rounded-2xl border border-border bg-card p-4">
					<div className="mb-3 flex items-center gap-2">
						<FileText className="h-4 w-4 text-primary" />
						<h3 className="font-black tracking-tight text-sm">Base Recipe</h3>
						<Badge variant="outline" className="text-[9px] h-4 px-1">{filteredBase.length}</Badge>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						{filteredBase.map((recipe: any) => (
							<div className="rounded-xl border border-border bg-background p-3" key={recipe._id}>
								<p className="font-semibold text-xs">{recipe.name}</p>
								<p className="text-[10px] text-muted-foreground">
									{recipe.targetQuantity} {recipe.targetUnit} | {recipe.category || "Lainnya"}
								</p>
								<div className="mt-2 space-y-1">
									{recipe.ingredients.map((ingredient: any, index: number) => {
										const item = inventoryMap.get(String(ingredient.inventoryId));
										return (
											<div className="flex items-center gap-2 text-[10px]" key={index}>
												<ChevronRight className="h-3 w-3 text-muted-foreground" />
												<p className="overflow-hidden text-ellipsis whitespace-nowrap">
													{item?.ingredientName || "Bahan"}: {ingredient.amount} {item ? getSmallestUnitLabel(item) : ""}
												</p>
											</div>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Product Recipe */}
			{filteredProduct.length > 0 && (
				<div className="rounded-2xl border border-border bg-card p-4">
					<div className="mb-3 flex items-center gap-2">
						<CheckCircle2 className="h-4 w-4 text-primary" />
						<h3 className="font-black tracking-tight text-sm">Recipe Produk</h3>
						<Badge variant="outline" className="text-[9px] h-4 px-1">{filteredProduct.length}</Badge>
					</div>
					<div className="space-y-3">
						{filteredProduct.map((row: any) => (
							<div className="rounded-xl border border-border bg-background p-3" key={row.recipe._id}>
								<div className="mb-2">
									<p className="font-semibold text-xs">{row.product.name}</p>
									<p className="text-[10px] text-muted-foreground">{row.categoryName}</p>
								</div>
								<div className="space-y-1">
									{row.recipe.ingredients.map((ingredient: any, index: number) => {
										const item = inventoryMap.get(String(ingredient.inventoryId));
										return (
											<div className="grid grid-cols-[30px_1fr] items-start gap-2 rounded-lg border border-border/70 bg-card px-2 py-1.5" key={index}>
												<div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">{index + 1}</div>
												<p className="text-xs leading-5">
													{item?.ingredientName || "Bahan"} sebanyak {ingredient.amount} {item ? getSmallestUnitLabel(item) : ""}
												</p>
											</div>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
			{showQuickProductForm && (
				<QuickProductForm
					open={showQuickProductForm}
					onClose={() => setShowQuickProductForm(false)}
					onSuccess={(productId) => {
						setShowQuickProductForm(false);
						setSelectedProductId(productId);
						setViewMode('per-product');
						triggerHybridRefresh();
					}}
				/>
			)}

		</div>
	);
}

