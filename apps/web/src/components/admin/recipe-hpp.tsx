// @ts-nocheck
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { Doc, Id } from "@/types/backend-compat";
import { motion, AnimatePresence } from "framer-motion";
import { getSmallestUnitLabel } from "@/lib/inventory-units";
import {
	AlertTriangle,
	Archive,
	ArrowDown,
	ArrowUp,
	BookOpen,
	Calculator,
	CheckCircle2,
	ChevronDown,
	CircleDollarSign,
	Database,
	Link2,
	Package,
	Plus,
	RefreshCw,
	Search,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	useHybridAllProducts,
	useHybridInventory,
	useHybridLatestInventoryCosts,
	useHybridAllDiscounts,
	triggerHybridRefresh,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridRecipes,
	useHybridBaseRecipes,
} from "@/hooks/use-hybrid-inventory-admin-data";
import {
	useHybridCreateHppCalculation,
	useHybridUpdateHppCalculation,
	useHybridDeleteHppCalculation,
	useHybridUpsertHppFromRecipe,
	useHybridSaveRecipe,
} from "@/hooks/use-hybrid-write-actions";

// ─── Types ───────────────────────────────────────────────────

type IngredientRow = {
	id: string;
	inventoryId?: string;
	ingredientName: string;
	purchasePrice: number;
	purchaseQuantity: number;
	purchaseUnit: string;
	usagePerServing: number;
	usageUnit: string;
	conversionFactor: number;
	costSource: "inventory" | "transaction" | "manual" | "ai";
};

type HppFormData = {
	name: string;
	description: string;
	ingredients: IngredientRow[];
	overheadCosts: { id: string; name: string; costPerServing: number }[];
	servingsPerBatch: number;
	sellingPrice: number;
	happyHourPrice: number;
	productId?: string;
	sourceType: "manual" | "recipe_based";
};

type HppMetrics = {
	ingredientCostPerServing: number;
	totalHppPerServing: number;
	totalHppPerBatch: number;
	profitPerServing: number;
	marginPercent: number;
	markupPercent: number;
	breakEvenServings: number;
};

type PriceSource = "inventory" | "transaction" | "manual" | "ai";

interface InventoryItem {
	_id: string;
	ingredientName: string;
	unit: string;
	displayUnit?: string;
	conversionFactor?: number;
	quantity: number;
	latestReferencePrice?: number;
	preferredPurchaseQuantity?: number;
	preferredPurchaseUnit?: string;
	contentToBaseFactor?: number;
	packNetQuantity?: number;
	packNetUnit?: string;
}

interface ProductItem {
	_id: string;
	name: string;
	price: number;
	promoPrice?: number;
	categoryId?: string;
}

interface RecipeData {
	_id: string;
	productId: string;
	variantName?: string;
	ingredients: { inventoryId: string; amount: number }[];
}

// ─── Helpers ─────────────────────────────────────────────────

function generateId() {
	return Math.random().toString(36).slice(2, 9);
}

function formatCurrency(value: number) {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

function formatNumber(value: number) {
	return new Intl.NumberFormat("id-ID", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(value);
}

function safeLower(value: unknown) {
	return typeof value === "string" ? value.toLowerCase() : "";
}

function createEmptyIngredient(): IngredientRow {
	return {
		id: generateId(),
		ingredientName: "",
		purchasePrice: 0,
		purchaseQuantity: 1,
		purchaseUnit: "liter",
		usagePerServing: 0,
		usageUnit: "ml",
		conversionFactor: 1000,
		costSource: "manual",
	};
}

function computeHpp(form: HppFormData): HppMetrics {
	const ingredientCostPerServing = form.ingredients.reduce((sum, ing) => {
		if (!ing.purchasePrice || !ing.usagePerServing) return sum;
		return sum + ing.purchasePrice * ing.usagePerServing;
	}, 0);

	const totalHppPerServing = ingredientCostPerServing;
	const totalHppPerBatch = totalHppPerServing * form.servingsPerBatch;
	const profitPerServing = form.sellingPrice - totalHppPerServing;
	const marginPercent = form.sellingPrice > 0 ? (profitPerServing / form.sellingPrice) * 100 : 0;
	const markupPercent = totalHppPerServing > 0 ? (profitPerServing / totalHppPerServing) * 100 : 0;
	const breakEvenServings = totalHppPerBatch > 0 && profitPerServing > 0
		? Math.ceil(totalHppPerBatch / profitPerServing) : 0;

	return {
		ingredientCostPerServing,
		totalHppPerServing,
		totalHppPerBatch,
		profitPerServing,
		marginPercent,
		markupPercent,
		breakEvenServings,
	};
}

function getPriceSourceBadge(source: PriceSource) {
	switch (source) {
		case "inventory": return { icon: "💾", label: "Inventory", class: "bg-blue-50 text-blue-700" };
		case "transaction": return { icon: "📄", label: "Transaksi", class: "bg-purple-50 text-purple-700" };
		case "manual": return { icon: "✏️", label: "Manual", class: "bg-amber-50 text-amber-700" };
		case "ai": return { icon: "🤖", label: "AI", class: "bg-emerald-50 text-emerald-700" };
	}
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

// ─── Cell Components ─────────────────────────────────────────

function ComboboxCell({
	value,
	inventoryItems,
	usedInventoryIds,
	onChange,
	placeholder = "Pilih Bahan...",
}: {
	value: string;
	inventoryItems: InventoryItem[];
	usedInventoryIds: Set<string>;
	onChange: (inventoryId: string, item: InventoryItem) => void;
	placeholder?: string;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const triggerRef = useRef<HTMLDivElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

	const filtered = useMemo(() => {
		return inventoryItems.filter((item) => {
			if (item._id && usedInventoryIds.has(item._id) && item._id !== value) return false;
			return safeLower(item.ingredientName).includes(safeLower(search));
		});
	}, [inventoryItems, usedInventoryIds, search, value]);

	const selectedItem = inventoryItems.find((item) => item._id === value);

	useLayoutEffect(() => {
		if (!open || !triggerRef.current) {
			setPos(null);
			return;
		}
		const rect = triggerRef.current.getBoundingClientRect();
		setPos({
			left: rect.left,
			top: rect.top + rect.height + 4,
			width: Math.max(rect.width, 280),
		});
	}, [open]);

	useEffect(() => {
		if (!open) return;
		function handleClickOutside(e: MouseEvent) {
			if (
				triggerRef.current &&
				!triggerRef.current.contains(e.target as Node) &&
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setOpen(false);
				setSearch("");
			}
		}
		function handleScrollOrResize() {
			setOpen(false);
			setSearch("");
		}
		document.addEventListener("mousedown", handleClickOutside);
		window.addEventListener("scroll", handleScrollOrResize, true);
		window.addEventListener("resize", handleScrollOrResize);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			window.removeEventListener("scroll", handleScrollOrResize, true);
			window.removeEventListener("resize", handleScrollOrResize);
		};
	}, [open]);

	return (
		<div ref={triggerRef}>
			<div
				className="flex cursor-pointer items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:border-primary/50"
				onClick={() => setOpen(!open)}
				role="combobox"
				tabIndex={0}
				onKeyDown={(e) => { if (e.key === "Enter") setOpen(!open); }}
			>
				<span className={`flex-1 truncate ${!selectedItem ? "text-muted-foreground" : ""}`}>
					{selectedItem ? selectedItem.ingredientName : placeholder}
				</span>
				<ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
			</div>
			{open &&
				pos &&
				createPortal(
					<div
						ref={dropdownRef}
						style={{
							position: "fixed",
							left: pos.left,
							top: pos.top,
							width: pos.width,
							zIndex: 9999,
						}}
						className="max-h-48 overflow-auto rounded-lg border bg-popover p-1 shadow-lg"
					>
						<div className="sticky top-0 mb-1 bg-popover px-1 pt-1">
							<Input
								placeholder="Cari bahan..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="h-7 text-xs"
								autoFocus
							/>
						</div>
						{filtered.length === 0 ? (
							<div className="px-2 py-3 text-center text-[10px] text-muted-foreground">
								Tidak ada bahan ditemukan
							</div>
						) : (
							filtered.map((item) => (
								<div
									key={item._id}
									className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent ${item._id === value ? "bg-accent font-medium" : ""}`}
									onClick={() => {
										onChange(item._id, item);
										setOpen(false);
										setSearch("");
									}}
								>
									<Package className="h-3 w-3 shrink-0 text-muted-foreground" />
									<span className="flex-1 truncate">{item.ingredientName}</span>
									<span className="shrink-0 text-[10px] text-muted-foreground">
										{getSmallestUnitLabel(item)}
									</span>
								</div>
							))
						)}
					</div>,
					document.body
				)}
		</div>
	);
}

function NumberCell({
	value,
	onChange,
	min = 0,
	placeholder = "0",
	format,
}: {
	value: number;
	onChange: (val: number) => void;
	min?: number;
	placeholder?: string;
	format?: "currency" | "number";
}) {
	const [editing, setEditing] = useState(false);
	const [temp, setTemp] = useState(String(value));

	const displayValue = format === "currency" ? formatCurrency(value) : format === "number" ? formatNumber(value) : String(value);

	return editing ? (
		<Input
			type="number"
			value={temp}
			onChange={(e) => setTemp(e.target.value)}
			onBlur={() => {
				const parsed = parseFloat(temp);
				onChange(isNaN(parsed) ? min : Math.max(min, parsed));
				setEditing(false);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					const parsed = parseFloat(temp);
					onChange(isNaN(parsed) ? min : Math.max(min, parsed));
					setEditing(false);
				}
				if (e.key === "Escape") {
					setTemp(String(value));
					setEditing(false);
				}
			}}
			className="h-7 text-xs px-1.5"
			min={min}
			step="any"
			autoFocus
		/>
	) : (
		<div
			className="cursor-pointer rounded px-1.5 py-1 text-xs tabular-nums hover:bg-accent/50"
			onClick={() => {
				setTemp(String(value));
				setEditing(true);
			}}
			title="Klik untuk edit"
		>
			{value > 0 ? displayValue : <span className="text-muted-foreground">{placeholder}</span>}
		</div>
	);
}

function UnitSelectCell({
	value,
	onChange,
	options,
}: {
	value: string;
	onChange: (val: string) => void;
	options: string[];
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className="h-7 text-xs px-1.5 gap-0.5">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((opt) => (
					<SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

// ─── Sub-Components ─────────────────────────────────────────

function ProductSelectorCard({
	productSearch,
	setProductSearch,
	productDropdownOpen,
	setProductDropdownOpen,
	hppType,
	setHppType,
	recipeFilter,
	setRecipeFilter,
	filteredProducts,
	selectedProductId,
	handleSelectProduct,
	form,
	setForm,
	products,
	selectedProduct,
	selectedBaseRecipe,
	selectedRecipe,
	inventory,
	inventoryCosts,
	recipes,
	loading,
}: {
	productSearch: string;
	setProductSearch: (v: string) => void;
	productDropdownOpen: boolean;
	setProductDropdownOpen: (v: boolean) => void;
	hppType: "product" | "base_recipe";
	setHppType: (v: "product" | "base_recipe") => void;
	recipeFilter: boolean;
	setRecipeFilter: (v: boolean) => void;
	filteredProducts: any[];
	selectedProductId: string | null;
	handleSelectProduct: (id: string) => void;
	form: HppFormData;
	setForm: (updater: ((prev: HppFormData) => HppFormData) | HppFormData) => void;
	products: ProductItem[] | undefined;
	selectedProduct: ProductItem | null;
	selectedBaseRecipe: any;
	selectedRecipe: RecipeData | null;
	inventory: InventoryItem[] | undefined;
	inventoryCosts: any;
	recipes: any;
	loading: boolean;
}) {
	const navigate = useNavigate();
	return (
		<Card className="border-border/50">
			<CardContent className="p-4">
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
						<div className="relative flex-1">
							<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Cari produk... (nama, kategori)"
								value={productSearch}
								onChange={(e) => {
									setProductSearch(e.target.value);
									if (!productDropdownOpen) setProductDropdownOpen(true);
								}}
								className="h-9 pl-8 text-xs"
								onFocus={() => setProductDropdownOpen(true)}
							/>
						</div>
						<div className="flex items-center gap-2">
							<div className="flex items-center rounded-md border bg-background p-0.5">
								<Button
									variant={hppType === "product" ? "default" : "ghost"}
									size="sm"
									className="h-7 px-2 text-[10px]"
									onClick={() => setHppType("product")}
								>
									<Package className="mr-1 h-3 w-3" />
									Produk
								</Button>
								<Button
									variant={hppType === "base_recipe" ? "default" : "ghost"}
									size="sm"
									className="h-7 px-2 text-[10px]"
									onClick={() => setHppType("base_recipe")}
								>
									<BookOpen className="mr-1 h-3 w-3" />
									Base Recipe
								</Button>
							</div>
							<Button
								variant={recipeFilter ? "default" : "outline"}
								size="sm"
								className="h-8 text-[10px]"
								onClick={() => setRecipeFilter(!recipeFilter)}
							>
								<BookOpen className="mr-1 h-3 w-3" />
								Ada Resep
								{recipeFilter && ` (${filteredProducts.length})`}
							</Button>
							<div className="w-28 sm:w-32">
								<Label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
									Porsi
								</Label>
								<Input
									type="number"
									value={form.servingsPerBatch}
									onChange={(e) =>
										setForm((prev) => ({ ...prev, servingsPerBatch: Math.max(1, parseInt(e.target.value) || 1) }))
									}
									className="h-8 text-xs"
									min={1}
								/>
							</div>
						</div>
					</div>

					{productDropdownOpen && (
						<div className="relative">
							<div className="max-h-52 overflow-auto rounded-lg border bg-popover p-1 shadow-lg">
								{filteredProducts.length === 0 ? (
									<div className="px-3 py-4 text-center text-xs text-muted-foreground">
										{productSearch
											? `Tidak ada produk "${productSearch}" ${recipeFilter ? "dengan resep" : ""}`
											: recipeFilter
												? "Semua produk sudah punya resep"
												: "Tidak ada produk tersedia"}
									</div>
								) : (
									filteredProducts.map((product: any) => {
										const isBaseRecipe = hppType === "base_recipe";
										const hasRecipe = !isBaseRecipe && new Map((recipes as any[] | undefined)?.map((r: any) => [r.productId, true]) ?? []).has(product._id);
										return (
											<div
												key={product._id}
												className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-accent ${product._id === selectedProductId ? "bg-accent font-medium" : ""}`}
												onClick={() => {
													handleSelectProduct(product._id);
													setProductDropdownOpen(false);
												}}
											>
												<span className="flex-1 truncate">{product.name}</span>
												{isBaseRecipe && (
													<span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">
														<BookOpen className="h-2.5 w-2.5" />
														{product.targetQuantity} {product.targetUnit}
													</span>
												)}
												{hasRecipe && (
													<span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600">
														<BookOpen className="h-2.5 w-2.5" />
														Resep
													</span>
												)}
												{!isBaseRecipe && (
													<span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
														{formatCurrency(product.promoPrice ?? product.price)}
													</span>
												)}
											</div>
										);
									})
								)}
							</div>
						</div>
					)}

					{selectedProduct && !selectedBaseRecipe && (
						<div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
							<div className="flex items-center gap-2 text-[11px] text-blue-800">
								<BookOpen className="h-3.5 w-3.5 shrink-0 text-blue-500" />
								<span className="flex-1">
									{selectedRecipe
										? `Resep: ${selectedProduct.name} — ${form.ingredients.length} bahan baku`
										: `${selectedProduct.name} — Belum ada resep. Bisa input manual.`}
								</span>
								<span className="shrink-0 font-medium">
									{formatCurrency(selectedProduct.promoPrice ?? selectedProduct.price)}
								</span>
							</div>
							<div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-blue-600/70">
								<span className="inline-flex items-center gap-1 rounded bg-white/60 px-1.5 py-0.5">
									<Package className="h-3 w-3" />
									Produk: {products?.length ?? 0} item
								</span>
								<span className="inline-flex items-center gap-1 rounded bg-white/60 px-1.5 py-0.5">
									<Archive className="h-3 w-3" />
									Inventaris: {inventory?.length ?? 0} bahan
								</span>
								<span className="inline-flex items-center gap-1 rounded bg-white/60 px-1.5 py-0.5">
									<BookOpen className="h-3 w-3" />
									Resep: {(recipes as any[] | undefined)?.length ?? 0} resep
								</span>
								{inventoryCosts && Object.keys(inventoryCosts).length > 0 && (
									<span className="inline-flex items-center gap-1 rounded bg-white/60 px-1.5 py-0.5">
										<CircleDollarSign className="h-3 w-3" />
										Harga: {Object.keys(inventoryCosts).length} item
									</span>
								)}
							</div>
						</div>
					)}

					{selectedBaseRecipe && (
						<div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
							<div className="flex items-center gap-2 text-[11px] text-amber-800">
								<BookOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
								<span className="flex-1">
									Base Recipe: {selectedBaseRecipe.name} — {form.ingredients.length} bahan baku
								</span>
								<span className="shrink-0 font-medium">
									{selectedBaseRecipe.targetQuantity} {selectedBaseRecipe.targetUnit}
								</span>
							</div>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function EmptyStateCard({
	loading,
	emptyProductList,
}: {
	loading: boolean;
	emptyProductList: boolean;
}) {
	const navigate = useNavigate();
	return (
		<Card className="border-dashed">
			<CardContent className="flex flex-col items-center justify-center py-12">
				{loading ? (
					<>
						<div className="mb-3 flex flex-col items-center gap-2">
							<Skeleton className="h-10 w-10 rounded-full" />
							<Skeleton className="h-4 w-48" />
							<Skeleton className="h-3 w-32" />
						</div>
						<p className="text-xs text-muted-foreground/50">Memuat data...</p>
					</>
				) : emptyProductList ? (
					<>
						<Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
						<p className="text-sm font-medium text-muted-foreground">
							Belum ada produk
						</p>
						<p className="mt-1 text-xs text-muted-foreground/60">
							Tambahkan produk dulu di halaman Produk
						</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-4 h-8 text-xs"
							onClick={() => navigate({ to: "/admin/products" as any })}
						>
							<Package className="mr-1 h-3.5 w-3.5" />
							Buka Produk
						</Button>
					</>
				) : (
					<>
						<Calculator className="mb-3 h-10 w-10 text-muted-foreground/40" />
						<p className="text-sm font-medium text-muted-foreground">
							Pilih produk dulu untuk memulai perhitungan HPP
						</p>
						<p className="mt-1 text-xs text-muted-foreground/60">
							Gunakan pencarian di atas untuk memilih menu
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}

function IngredientsTableCard({
	form,
	setForm,
	selectedRows,
	setSelectedRows,
	inventory,
	usedInventoryIds,
	selectedRecipe,
	handleSelectInventoryItem,
	handleIngredientChange,
	handleToggleRow,
	handleToggleAll,
	handleAddRow,
	handleBulkDelete,
	handleSyncFromRecipe,
	handleSyncFromInventory,
	handleAiAnalyze,
	handleSave,
	saving,
	editingId,
	aiAnalyzing,
	selectedProduct,
	selectedBaseRecipe,
}: {
	form: HppFormData;
	setForm: (updater: ((prev: HppFormData) => HppFormData) | HppFormData) => void;
	selectedRows: Set<string>;
	setSelectedRows: (v: Set<string>) => void;
	inventory: InventoryItem[] | undefined;
	usedInventoryIds: Set<string>;
	selectedRecipe: RecipeData | null;
	handleSelectInventoryItem: (rowId: string, inventoryId: string, item: InventoryItem) => void;
	handleIngredientChange: (id: string, field: keyof IngredientRow, value: any) => void;
	handleToggleRow: (id: string) => void;
	handleToggleAll: () => void;
	handleAddRow: () => void;
	handleBulkDelete: () => void;
	handleSyncFromRecipe: () => void;
	handleSyncFromInventory: () => void;
	handleAiAnalyze: () => void;
	handleSave: () => void;
	saving: boolean;
	editingId: string | null;
	aiAnalyzing: boolean;
	selectedProduct: ProductItem | null;
	selectedBaseRecipe: any;
}) {
	const hasUnsavedChanges = useRef(false);

	const handleMoveRow = useCallback((id: string, direction: "up" | "down") => {
		setForm((prev) => {
			const idx = prev.ingredients.findIndex((ing) => ing.id === id);
			if (direction === "up" && idx === 0) return prev;
			if (direction === "down" && idx === prev.ingredients.length - 1) return prev;
			const copy = [...prev.ingredients];
			const swapIdx = direction === "up" ? idx - 1 : idx + 1;
			[copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]];
			return { ...prev, ingredients: copy };
		});
	}, [setForm]);

	const handleInsertRow = useCallback((afterId: string) => {
		setForm((prev) => {
			const idx = prev.ingredients.findIndex((ing) => ing.id === afterId);
			const newRow = createEmptyIngredient();
			const copy = [...prev.ingredients];
			copy.splice(idx + 1, 0, newRow);
			return { ...prev, ingredients: copy };
		});
	}, [setForm]);

	const handleDeleteRow = useCallback((id: string) => {
		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.filter((ing) => ing.id !== id),
		}));
		setSelectedRows((prev) => {
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}, [setForm, setSelectedRows]);

	return (
		<Card className="border-border/50">
			<CardHeader className="border-b border-border/50 px-4 py-3">
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2 text-sm font-bold">
						<Package className="h-4 w-4 text-primary" />
						Bahan Baku
						<Badge variant="secondary" className="text-[10px]">
							{form.ingredients.length} item
						</Badge>
					</CardTitle>
					<div className="flex items-center gap-2">
						{selectedRecipe && (
							<Button
								variant="outline"
								size="sm"
								className="h-7 text-[10px]"
								onClick={handleSyncFromRecipe}
								disabled={saving}
							>
								<Link2 className="mr-1 h-3 w-3" />
								Sinkron Resep
							</Button>
						)}
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-[10px]"
							onClick={handleSyncFromInventory}
							disabled={saving}
						>
							<Database className="mr-1 h-3 w-3" />
							Sinkron Bahan Baku
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-[10px]"
							onClick={handleAiAnalyze}
							disabled={aiAnalyzing}
						>
							<Sparkles className="mr-1 h-3 w-3" />
							{aiAnalyzing ? "Menganalisis..." : "AI Analisis"}
						</Button>
						{(selectedProduct || selectedBaseRecipe) && (
							<Button
								size="sm"
								className="h-7 text-[10px]"
								onClick={handleSave}
								disabled={saving}
							>
								{saving ? (
									<RefreshCw className="mr-1 h-3 w-3 animate-spin" />
								) : (
									<CheckCircle2 className="mr-1 h-3 w-3" />
								)}
								{editingId ? "Perbarui" : "Simpan"}
							</Button>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				<div className="overflow-x-auto">
					<table className="w-full border-collapse">
						<thead className="sticky top-0 z-10 bg-muted/50">
							<tr className="border-b border-border/50">
								<th className="w-8 px-2 py-2.5 text-left">
									<Checkbox
										checked={form.ingredients.length > 0 && selectedRows.size === form.ingredients.length}
										onCheckedChange={handleToggleAll}
									/>
								</th>
								<th className="px-1 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
									Bahan Baku
								</th>
								<th className="w-20 px-1 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
									Jumlah
								</th>
								<th className="w-20 px-1 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
									Satuan
								</th>
								<th className="w-28 px-1 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
									Harga
								</th>
								<th className="w-12 px-1 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
									Src
								</th>
								<th className="w-24 px-1 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
									Subtotal
								</th>
								<th className="w-24 px-1 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
									Aksi
								</th>
							</tr>
						</thead>
						<tbody>
							<AnimatePresence mode="popLayout">
								{form.ingredients.map((ing, idx) => {
									const subtotal = ing.purchasePrice > 0
										? ing.purchasePrice * ing.usagePerServing
										: 0;
									const badge = getPriceSourceBadge(ing.costSource);
									const usageOptions = ing.usageUnit ? [ing.usageUnit, "ml", "gram", "pcs", "sdm", "sdt"] : ["ml", "gram", "pcs"];
									return (
										<motion.tr
											key={ing.id}
											initial={{ opacity: 0, y: -8 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, x: 20 }}
											transition={{ duration: 0.2 }}
											className={`border-b border-border/30 transition-colors hover:bg-accent/30 ${ing.costSource === "manual" && ing.ingredientName ? "bg-amber-50/30" : ""}`}
										>
											<td className="px-2 py-1.5">
												<Checkbox
													checked={selectedRows.has(ing.id)}
													onCheckedChange={() => handleToggleRow(ing.id)}
												/>
											</td>
											<td className="px-1 py-1.5 min-w-[180px]">
												<ComboboxCell
													value={ing.inventoryId ?? ""}
													inventoryItems={(inventory ?? []) as InventoryItem[]}
													usedInventoryIds={usedInventoryIds}
													onChange={(invId, item) => handleSelectInventoryItem(ing.id, invId, item)}
													placeholder={ing.ingredientName || "Pilih Bahan..."}
												/>
											</td>
											<td className="px-1 py-1.5">
												<NumberCell
													value={ing.usagePerServing}
													onChange={(val) => handleIngredientChange(ing.id, "usagePerServing", val)}
													min={0}
													placeholder="0"
												/>
											</td>
											<td className="px-1 py-1.5">
												<UnitSelectCell
													value={ing.usageUnit}
													onChange={(val) => handleIngredientChange(ing.id, "usageUnit", val)}
													options={usageOptions}
												/>
											</td>
											<td className="px-1 py-1.5">
												<NumberCell
													value={ing.purchasePrice}
													onChange={(val) => handleIngredientChange(ing.id, "purchasePrice", val)}
													min={0}
													format="currency"
													placeholder="Rp 0"
												/>
											</td>
											<td className="px-1 py-1.5 text-center">
												{ing.ingredientName && (
													<span
														className={`inline-block rounded px-1 py-0.5 text-[9px] font-bold leading-none ${badge.class}`}
														title={badge.label}
													>
														{badge.icon}
													</span>
												)}
											</td>
											<td className="px-1 py-1.5 text-right">
												<span className="text-xs tabular-nums font-medium">
													{subtotal > 0 ? formatCurrency(subtotal) : (
														<span className="text-muted-foreground">—</span>
													)}
												</span>
											</td>
											<td className="px-1 py-1.5">
												<div className="flex items-center justify-center gap-0.5">
													<button
														className="rounded p-1 text-foreground/50 hover:bg-accent hover:text-accent-foreground"
														onClick={() => handleMoveRow(ing.id, "up")}
														disabled={idx === 0}
														title="Naik"
													>
														<ArrowUp className="h-3.5 w-3.5" />
													</button>
													<button
														className="rounded p-1 text-foreground/50 hover:bg-accent hover:text-accent-foreground"
														onClick={() => handleMoveRow(ing.id, "down")}
														disabled={idx === form.ingredients.length - 1}
														title="Turun"
													>
														<ArrowDown className="h-3.5 w-3.5" />
													</button>
													<button
														className="rounded p-1 text-foreground/50 hover:bg-accent hover:text-accent-foreground"
														onClick={() => handleInsertRow(ing.id)}
														title="Sisip"
													>
														<Plus className="h-3.5 w-3.5" />
													</button>
													<button
														className="rounded p-1 text-foreground/50 hover:bg-destructive/10 hover:text-destructive"
														onClick={() => handleDeleteRow(ing.id)}
														title="Hapus"
													>
														<X className="h-3.5 w-3.5" />
													</button>
												</div>
											</td>
										</motion.tr>
									);
								})}
							</AnimatePresence>
						</tbody>
					</table>
				</div>

				<div className="flex items-center justify-between border-t border-border/50 px-4 py-2.5">
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-[10px]"
							onClick={handleAddRow}
						>
							<Plus className="mr-1 h-3 w-3" />
							Tambah Bahan
						</Button>
						{selectedRows.size > 0 && (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 text-[10px] text-destructive hover:text-destructive"
								onClick={handleBulkDelete}
							>
								<Trash2 className="mr-1 h-3 w-3" />
								Hapus {selectedRows.size}
							</Button>
						)}
					</div>
					<div className="flex items-center gap-3 text-xs text-muted-foreground">
						{selectedRows.size > 0 && (
							<span>{selectedRows.size} dipilih</span>
						)}
						{hasUnsavedChanges.current && (
							<span className="flex items-center gap-1 text-amber-600">
								<span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
								Belum disimpan
							</span>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}


function SummaryBar({ form, setForm, metrics, activeHappyHour }: {
	form: HppFormData;
	setForm: (updater: ((prev: HppFormData) => HppFormData) | HppFormData) => void;
	metrics: HppMetrics;
	activeHappyHour: {
		discountName: string;
		discountId: string;
		computedPrice: number;
		type: string;
		value: number;
		timeRange: string;
		days: number[];
	} | null;
}) {
	const daysLabel = activeHappyHour?.days?.length
		? ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
			.filter((_, i) => activeHappyHour.days.includes(i))
			.join(", ")
		: "";

	return (
		<Card className="border-primary/20 bg-primary/[0.02]">
			<CardContent className="p-4">
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-7">
					<div>
						<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">HPP/Porsi</p>
						<p className="mt-0.5 text-sm font-bold tabular-nums">{formatCurrency(metrics.totalHppPerServing)}</p>
					</div>
					<div>
						<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">HPP/Batch</p>
						<p className="mt-0.5 text-sm font-bold tabular-nums">{formatCurrency(metrics.totalHppPerBatch)}</p>
					</div>
					<div>
						<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Harga Jual</p>
						<p className="mt-0.5 text-sm font-bold tabular-nums">{formatCurrency(form.sellingPrice)}</p>
					</div>
					<div>
						<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">🎉 Happy Hour</p>
						{activeHappyHour ? (
							<div className="group relative mt-0.5">
								<p className="cursor-pointer text-sm font-bold tabular-nums text-amber-600 transition-colors hover:text-amber-700"
									title={activeHappyHour.discountName}
								>
									{formatCurrency(activeHappyHour.computedPrice)}
								</p>
								<div className="mt-0.5 flex items-center gap-1">
									<span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[8px] font-bold text-amber-700">
										💾 {activeHappyHour.discountName}
									</span>
									{activeHappyHour.timeRange && (
										<span className="text-[8px] text-muted-foreground/60">{activeHappyHour.timeRange}</span>
									)}
								</div>
								<a
									href="/admin/discounts"
									className="mt-0.5 inline-flex items-center gap-0.5 text-[8px] text-blue-500 opacity-0 transition-opacity hover:underline group-hover:opacity-100"
									target="_blank"
									rel="noopener noreferrer"
								>
									Kelola Diskon →
								</a>
							</div>
						) : form.happyHourPrice > 0 ? (
							<div className="group relative mt-0.5">
								<p className="text-sm font-bold tabular-nums text-amber-600">
									{formatCurrency(form.happyHourPrice)}
								</p>
								<a
									href="/admin/discounts"
									className="mt-0.5 inline-flex items-center gap-0.5 text-[8px] text-blue-500 opacity-0 transition-opacity hover:underline group-hover:opacity-100"
									target="_blank"
									rel="noopener noreferrer"
								>
									Buat Happy Hour →
								</a>
							</div>
						) : (
							<a
								href="/admin/discounts"
								className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-blue-500 hover:underline"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Plus className="h-3 w-3" />
								Atur Diskon
							</a>
						)}
					</div>
					<div>
						<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Laba/Porsi</p>
						<p className={`mt-0.5 text-sm font-bold tabular-nums ${metrics.profitPerServing >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
							{formatCurrency(metrics.profitPerServing)}
						</p>
					</div>
					<div>
						<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Margin</p>
						<p className={`mt-0.5 flex items-center gap-1 text-sm font-bold tabular-nums ${metrics.marginPercent >= 30 ? "text-emerald-600" : metrics.marginPercent >= 15 ? "text-amber-600" : "text-rose-600"}`}>
							{formatNumber(metrics.marginPercent)}%
							{metrics.marginPercent >= 30 ? (
								<CheckCircle2 className="h-3.5 w-3.5" />
							) : metrics.marginPercent >= 15 ? (
								<AlertTriangle className="h-3.5 w-3.5" />
							) : (
								<X className="h-3.5 w-3.5" />
							)}
						</p>
					</div>
					<div>
						<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Markup</p>
						<p className="mt-0.5 text-sm font-bold tabular-nums">{formatNumber(metrics.markupPercent)}%</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function AiInsightsPanel({
	aiPanelOpen,
	setAiPanelOpen,
	aiAnalyzing,
	form,
	metrics,
}: {
	aiPanelOpen: boolean;
	setAiPanelOpen: (v: boolean) => void;
	aiAnalyzing: boolean;
	form: HppFormData;
	metrics: HppMetrics;
}) {
	const mostExpensive = useMemo(() => {
		if (form.ingredients.length === 0) return { name: null as string | null, pct: "0" };
		const costs = form.ingredients.map((ing) => {
			const sub = ing.purchaseQuantity > 0 && ing.conversionFactor > 0
				? (ing.purchasePrice / (ing.purchaseQuantity * ing.conversionFactor)) * ing.usagePerServing
				: 0;
			return { name: ing.ingredientName || "(kosong)", cost: sub };
		});
		const max = costs.reduce((a, b) => a.cost > b.cost ? a : b, { name: "", cost: 0 });
		const pct = metrics.totalHppPerServing > 0 ? ((max.cost / metrics.totalHppPerServing) * 100).toFixed(0) : "0";
		return { name: max.name, pct };
	}, [form.ingredients, metrics.totalHppPerServing]);

	const unfilledCount = useMemo(() =>
		form.ingredients.filter((i) => !i.ingredientName).length,
	[form.ingredients]);

	return (
		<Card className="border-emerald-200/50">
			<button
				className="flex w-full items-center gap-2 px-4 py-3 text-left"
				onClick={() => setAiPanelOpen(!aiPanelOpen)}
			>
				<Sparkles className="h-4 w-4 text-emerald-500" />
				<span className="flex-1 text-sm font-bold">AI Cost Insights</span>
				{aiAnalyzing ? (
					<RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
				) : (
					<ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${aiPanelOpen ? "rotate-180" : ""}`} />
				)}
			</button>
			{aiPanelOpen && (
				<div className="border-t border-border/50 px-4 py-3">
					<div className="grid gap-2 text-xs sm:grid-cols-3">
						<div className="rounded-lg border border-border/50 bg-muted/20 p-3">
							<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
								💡 Bahan Termahal
							</p>
							<p className="mt-1 font-medium">
								{mostExpensive.name
									? `${mostExpensive.name} (${mostExpensive.pct}% dari HPP)`
									: "—"}
							</p>
						</div>
						<div className="rounded-lg border border-border/50 bg-muted/20 p-3">
							<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
								💰 Harga Jual Rekomendasi
							</p>
							<p className="mt-1 font-medium">
								{metrics.totalHppPerServing > 0
									? `${formatCurrency(Math.round(metrics.totalHppPerServing / 0.7))}`
									: "—"} <span className="text-[10px] text-muted-foreground">(30% margin)</span>
							</p>
						</div>
						<div className="rounded-lg border border-border/50 bg-muted/20 p-3">
							<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
								📊 Jumlah Bahan
							</p>
							<p className="mt-1 font-medium">
								{form.ingredients.length} bahan
								{unfilledCount > 0 && (
									<span className="ml-1 text-[10px] text-amber-600">
										({unfilledCount} belum diisi)
									</span>
								)}
							</p>
						</div>
					</div>
				</div>
			)}
		</Card>
	);
}

function SyncPanel({
	syncPanelOpen,
	setSyncPanelOpen,
	form,
}: {
	syncPanelOpen: boolean;
	setSyncPanelOpen: (v: boolean) => void;
	form: HppFormData;
}) {
	return (
		<Card className="border-blue-200/50">
			<button
				className="flex w-full items-center gap-2 px-4 py-3 text-left"
				onClick={() => setSyncPanelOpen(!syncPanelOpen)}
			>
				<RefreshCw className="h-4 w-4 text-blue-500" />
				<span className="flex-1 text-sm font-bold">Sync: Purchasing Agent</span>
				<ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${syncPanelOpen ? "rotate-180" : ""}`} />
			</button>
			{syncPanelOpen && (
				<div className="border-t border-border/50 px-4 py-3">
					<div className="flex items-center gap-3 text-xs">
						<span className="flex items-center gap-1 text-emerald-600">
							<CheckCircle2 className="h-3.5 w-3.5" />
							Terhubung
						</span>
						<span className="text-muted-foreground">•</span>
						<span className="text-muted-foreground">
							Harga dari inventory: {form.ingredients.filter((i) => i.costSource === "inventory").length} bahan
						</span>
						<span className="text-muted-foreground">•</span>
						<span className="text-muted-foreground">
							Manual: {form.ingredients.filter((i) => i.costSource === "manual").length} bahan
						</span>
					</div>
				</div>
			)}
		</Card>
	);
}

// ─── Main Component ──────────────────────────────────────────

export function RecipeHppPage() {
	const navigate = useNavigate();
	const search = useSearch({ from: "/admin/recipe/hpp" }) as { productId?: string; type?: string };
	const products = useHybridAllProducts() as ProductItem[] | undefined;
	const inventory = useHybridInventory() as InventoryItem[] | undefined;
	const inventoryCosts = useHybridLatestInventoryCosts();
	const recipes = useHybridRecipes();
	const baseRecipes = useHybridBaseRecipes() as any[] | undefined;
	const discounts = useHybridAllDiscounts() as any[] | undefined;

	const loading = !products || !inventory || !recipes;
	const emptyProductList = products && products.length === 0;

	const [hppType, setHppType] = useState<"product" | "base_recipe">(search?.type === "base_recipe" ? "base_recipe" : "product");



	const createHpp = useHybridCreateHppCalculation();
	const updateHpp = useHybridUpdateHppCalculation();
	const deleteHpp = useHybridDeleteHppCalculation();
	const upsertFromRecipe = useHybridUpsertHppFromRecipe();
	const saveRecipe = useHybridSaveRecipe();

	const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
	const [productSearch, setProductSearch] = useState("");
	const [productDropdownOpen, setProductDropdownOpen] = useState(false);
const [baseRecipeSearch, setBaseRecipeSearch] = useState("");
const [baseRecipeDropdownOpen, setBaseRecipeDropdownOpen] = useState(false);

	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<HppFormData>({
		name: "",
		description: "",
		ingredients: [createEmptyIngredient()],
		overheadCosts: [],
		servingsPerBatch: 1,
		sellingPrice: 0,
		happyHourPrice: 0,
		sourceType: "manual",
	});
	const [saving, setSaving] = useState(false);
	const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
	const [aiPanelOpen, setAiPanelOpen] = useState(false);
	const [syncPanelOpen, setSyncPanelOpen] = useState(false);
	const [aiAnalyzing, setAiAnalyzing] = useState(false);
	const [recipeFilter, setRecipeFilter] = useState(false);

	const metrics = useMemo(() => computeHpp(form), [form]);

	const selectedBaseRecipe = useMemo(() => {
		if (!selectedProductId || !baseRecipes || hppType !== "base_recipe") return null;
		return (baseRecipes as any[]).find((br: any) => br._id === selectedProductId) ?? null;
	}, [selectedProductId, baseRecipes, hppType]);

	const recipesByProduct = useMemo(() => {
		const map = new Map<string, boolean>();
		if (!recipes) return map;
		const allRecipes = recipes as RecipeData[];
		for (const r of allRecipes) {
			if (r.productId && !r.variantName) {
				map.set(r.productId, true);
			}
		}
		return map;
	}, [recipes]);

	const selectedProduct = useMemo(() => {
		if (!selectedProductId || !products) return null;
		return products.find((p) => p._id === selectedProductId) ?? null;
	}, [selectedProductId, products]);

	const selectedRecipe = useMemo(() => {
		if (!selectedProductId || !recipes) return null;
		const allRecipes = recipes as RecipeData[];
		return allRecipes.find((r) => r.productId === selectedProductId && !r.variantName) ?? null;
	}, [selectedProductId, recipes]);

	const filteredProducts = useMemo(() => {
		if (hppType === "base_recipe") {
			if (!baseRecipes) return [];
			let result = baseRecipes as any[];
			if (productSearch) {
				result = result.filter((br: any) =>
					safeLower(br.name).includes(safeLower(productSearch))
				);
			}
			return result;
		}
		if (!products) return [];
		let result = products;
		if (productSearch) {
			result = result.filter((p) =>
				safeLower(p.name).includes(safeLower(productSearch))
			);
		}
		if (recipeFilter) {
			result = result.filter((p) => recipesByProduct.has(p._id));
		}
		return result;
	}, [products, baseRecipes, productSearch, recipeFilter, recipesByProduct, hppType]);

	useEffect(() => {
		if (search?.type === "base_recipe") {
			setHppType("base_recipe");
		}
		if (search?.productId && products && !selectedProductId) {
			setSelectedProductId(search.productId);
		}
	}, [search?.productId, search?.type, products]);

	useEffect(() => {
		if (!selectedProductId || !products || !inventory || !recipes) return;
		if (form.productId === selectedProductId && form.ingredients.length > 0 && form.ingredients[0].inventoryId) {
		// Re-populate only if recipe ingredients actually changed (data refresh)
		const allRecipes = (recipes ?? []) as RecipeData[];
		const recipe = allRecipes.find((r) => r.productId === selectedProductId && !r.variantName);
		if (recipe && recipe.ingredients?.length === form.ingredients.length) {
			// Same ingredient count — check if IDs match
			const formInvIds = new Set(form.ingredients.map((i) => i.inventoryId).filter(Boolean));
			const recipeInvIds = new Set(recipe.ingredients.map((i) => String(i.inventoryId)));
			if (formInvIds.size === recipeInvIds.size && [...formInvIds].every((id) => recipeInvIds.has(id))) {
				return; // Already in sync
			}
		}
		// Ingredients differ — fall through to re-populate
		}

		if (hppType === "base_recipe" && baseRecipes) {
			const baseRecipe = (baseRecipes as any[]).find((br: any) => br._id === selectedProductId);
			if (!baseRecipe) return;

			const ingredients: IngredientRow[] = (baseRecipe.ingredients ?? []).map((ing: any) => {
				const invItem = (inventory ?? []).find((i) => i._id === ing.inventoryId);
				const costInfo = inventoryCosts?.[ing.inventoryId];
				const price = costInfo?.latestCostPerUnit ?? 0;
				const source: PriceSource = costInfo?.latestCostPerUnit ? "inventory" : "manual";
				const unitPair = findUnitPair(
					invItem?.unit ?? "liter",
					invItem?.displayUnit ?? "ml"
				);
				const baseFactor = invItem?.contentToBaseFactor ?? unitPair.factor;

				return {
					id: generateId(),
					inventoryId: ing.inventoryId,
					ingredientName: invItem?.ingredientName ?? "",
					purchasePrice: price / baseFactor,
					purchaseQuantity: invItem?.preferredPurchaseQuantity ?? 1,
					purchaseUnit: invItem?.preferredPurchaseUnit ?? invItem?.unit ?? unitPair.purchase,
					usagePerServing: ing.amount,
					usageUnit: invItem?.displayUnit ?? "ml",
					conversionFactor: baseFactor,
					costSource: source,
				};
			});

			const targetQty = parseInt(baseRecipe.targetQuantity) || 1;
			setForm({
				name: `HPP ${baseRecipe.name}`,
				description: `Perhitungan biaya base recipe ${baseRecipe.name} (${baseRecipe.category ?? ""})`,
				ingredients: ingredients.length > 0 ? ingredients : [createEmptyIngredient()],
				overheadCosts: [],
				servingsPerBatch: targetQty,
				sellingPrice: 0,
				happyHourPrice: 0,
				productId: selectedProductId,
				sourceType: "recipe_based",
			});
			setSelectedRows(new Set());
			setEditingId(null);
			return;
		}

		const product = products?.find((p) => p._id === selectedProductId);
		if (!product) return;

		const allRecipes = (recipes ?? []) as RecipeData[];
		const recipe = allRecipes.find((r) => r.productId === selectedProductId && !r.variantName);

		setForm({
			name: `HPP ${product.name}`,
			description: recipe ? `Perhitungan biaya dari resep ${product.name}` : "",
			ingredients: recipe && recipe.ingredients?.length > 0
				? recipe.ingredients.map((ing) => {
					const invItem = (inventory ?? []).find((i) => i._id === ing.inventoryId);
					const costInfo = inventoryCosts?.[ing.inventoryId];
					const price = costInfo?.latestCostPerUnit ?? 0;
					const source: PriceSource = costInfo?.latestCostPerUnit ? "inventory" : "manual";

					const unitPair = findUnitPair(
						invItem?.unit ?? "liter",
						invItem?.displayUnit ?? "ml"
					);
					const productFactor = invItem?.contentToBaseFactor ?? unitPair.factor;

					return {
						id: generateId(),
						inventoryId: ing.inventoryId,
						ingredientName: invItem?.ingredientName ?? "",
						purchasePrice: price / productFactor,
						purchaseQuantity: invItem?.preferredPurchaseQuantity ?? 1,
						purchaseUnit: invItem?.preferredPurchaseUnit ?? invItem?.unit ?? unitPair.purchase,
						usagePerServing: ing.amount,
						usageUnit: invItem?.displayUnit ?? "ml",
						conversionFactor: productFactor,
						costSource: source,
					};
				})
				: [createEmptyIngredient()],
			overheadCosts: [],
			servingsPerBatch: 1,
			sellingPrice: product.promoPrice ?? product.price,
			happyHourPrice: 0,
			productId: selectedProductId,
			sourceType: recipe ? "recipe_based" : "manual",
		});
		setSelectedRows(new Set());
		setEditingId(null);
	}, [selectedProductId, products, inventory, recipes, inventoryCosts, hppType, baseRecipes]);

	const usedInventoryIds = useMemo(() => {
		return new Set(form.ingredients.map((ing) => ing.inventoryId).filter(Boolean) as string[]);
	}, [form.ingredients]);

	// ── Active Happy Hour from Discounts ──
	type HappyHourInfo = {
		discountName: string;
		discountId: string;
		computedPrice: number;
		type: string;
		value: number;
		timeRange: string;
		days: number[];
	} | null;

	const activeHappyHour = useMemo((): HappyHourInfo => {
		if (!discounts || !selectedProduct) return null;
		const now = new Date();
		const timestamp = now.getTime();
		const currentDay = now.getDay();
		const currentMin = now.getHours() * 60 + now.getMinutes();

		const happyHourDiscounts = discounts.filter((d: any) => {
			// Handle both camelCase (view) and snake_case (raw table)
			const isHh = d.isHappyHour ?? d.is_happy_hour;
			const isAct = d.isActive ?? d.is_active;
			if (!isHh || !isAct) return false;
			if (d.startDate && timestamp < d.startDate) return false;
			if (d.endDate && timestamp > d.endDate) return false;
			const days = d.days ?? d.days_of_week;
			if (days && days.length > 0 && !days.includes(currentDay)) return false;
			const startTime = d.startTime ?? d.start_time;
			const endTime = d.endTime ?? d.end_time;
			if (startTime && endTime) {
				const [sh, sm] = startTime.split(":").map(Number);
				const [eh, em] = endTime.split(":").map(Number);
				const startMin = sh * 60 + sm;
				const endMin = eh * 60 + em;
				if (currentMin < startMin || currentMin > endMin) return false;
			}
			// Check if this discount applies to the selected product
			const tType = d.targetType ?? d.target_type;
			const tIds = d.targetIds ?? d.target_ids;
			if (tType === "PRODUCT" && tIds) {
				return tIds.includes(selectedProduct._id);
			}
			if (tType === "CATEGORY" && tIds && selectedProduct.categoryId) {
				return tIds.includes(selectedProduct.categoryId);
			}
			return tType === "ALL";
		});

		if (happyHourDiscounts.length === 0) return null;

		// Use the first matching happy hour discount
		const hh = happyHourDiscounts[0];
		const hhType = hh.type;
		const hhValue = hh.value ?? 0;
		const hhName = hh.name;
		const hhId = hh._id;
		const hhProductPrices = hh.productPrices ?? hh.product_prices;
		const hhStartTime = hh.startTime ?? hh.start_time;
		const hhEndTime = hh.endTime ?? hh.end_time;
		const hhDays = hh.days ?? hh.days_of_week ?? [];
		const basePrice = selectedProduct.promoPrice ?? selectedProduct.price;
		let computedPrice: number;

		switch (hhType) {
			case "PERCENTAGE":
				computedPrice = Math.round(basePrice * (1 - hhValue / 100));
				break;
			case "FIXED":
				computedPrice = Math.max(0, basePrice - hhValue);
				break;
			case "FLAT_PRICE": {
				// Check productPrices override
				if (hhProductPrices) {
					const override = hhProductPrices.find((p: any) => p.productId === selectedProduct._id);
					computedPrice = override ? override.price : (hhValue || basePrice);
				} else {
					computedPrice = hhValue || basePrice;
				}
				break;
			}
			default:
				computedPrice = basePrice;
		}

		const timeRange = hhStartTime && hhEndTime
			? `${hhStartTime}-${hhEndTime}`
			: "";

		return {
			discountName: hhName,
			discountId: hhId,
			computedPrice,
			type: hhType,
			value: hhValue,
			timeRange,
			days: hhDays,
		};
	}, [discounts, selectedProduct]);

	const hasUnsavedChanges = useRef(false);

	const handleSelectProduct = useCallback((productId: string, isBaseRecipe = false) => {
		setSelectedProductId(productId);
		if (!isBaseRecipe) {
			setProductDropdownOpen(false);
			setProductSearch("");
		} else {
			setBaseRecipeDropdownOpen(false);
			setBaseRecipeSearch("");
		}

		if (hppType === "base_recipe" && baseRecipes) {
			const baseRecipe = (baseRecipes as any[]).find((br: any) => br._id === productId);
			if (!baseRecipe) return;

			const ingredients: IngredientRow[] = (baseRecipe.ingredients ?? []).map((ing: any) => {
				const invItem = (inventory ?? []).find((i) => i._id === ing.inventoryId);
				const costInfo = inventoryCosts?.[ing.inventoryId];
				const price = costInfo?.latestCostPerUnit ?? 0;
				const source: PriceSource = costInfo?.latestCostPerUnit ? "inventory" : "manual";
				const unitPair = findUnitPair(
					invItem?.unit ?? "liter",
					invItem?.displayUnit ?? "ml"
				);
				const baseFactor = invItem?.contentToBaseFactor ?? unitPair.factor;

				return {
					id: generateId(),
					inventoryId: ing.inventoryId,
					ingredientName: invItem?.ingredientName ?? "",
					purchasePrice: price / baseFactor,
					purchaseQuantity: invItem?.preferredPurchaseQuantity ?? 1,
					purchaseUnit: invItem?.preferredPurchaseUnit ?? invItem?.unit ?? unitPair.purchase,
					usagePerServing: ing.amount,
					usageUnit: invItem?.displayUnit ?? "ml",
					conversionFactor: baseFactor,
					costSource: source,
				};
			});

			const targetQty = parseInt(baseRecipe.targetQuantity) || 1;
			const newForm: HppFormData = {
				name: `HPP ${baseRecipe.name}`,
				description: `Perhitungan biaya base recipe ${baseRecipe.name} (${baseRecipe.category ?? ""})`,
				ingredients: ingredients.length > 0 ? ingredients : [createEmptyIngredient()],
				overheadCosts: [],
				servingsPerBatch: targetQty,
				sellingPrice: 0,
				happyHourPrice: 0,
				productId,
				sourceType: "recipe_based",
			};
			setForm(newForm);
			setSelectedRows(new Set());
			setEditingId(null);
			return;
		}

		const product = products?.find((p) => p._id === productId);
		if (!product) return;

		const allRecipes = (recipes ?? []) as RecipeData[];
		const recipe = allRecipes.find((r) => r.productId === productId && !r.variantName);

		const newForm: HppFormData = {
			name: `HPP ${product.name}`,
			description: recipe ? `Perhitungan biaya dari resep ${product.name}` : "",
			ingredients: recipe && recipe.ingredients?.length > 0
				? recipe.ingredients.map((ing) => {
					const invItem = (inventory ?? []).find((i) => i._id === ing.inventoryId);
					const costInfo = inventoryCosts?.[ing.inventoryId];
					const price = costInfo?.latestCostPerUnit ?? 0;
					const source: PriceSource = costInfo?.latestCostPerUnit ? "inventory" : "manual";

					const unitPair = findUnitPair(
						invItem?.unit ?? "liter",
						invItem?.displayUnit ?? "ml"
					);
					const productFactor = invItem?.contentToBaseFactor ?? unitPair.factor;

					return {
						id: generateId(),
						inventoryId: ing.inventoryId,
						ingredientName: invItem?.ingredientName ?? "",
						purchasePrice: price / productFactor,
						purchaseQuantity: invItem?.preferredPurchaseQuantity ?? 1,
						purchaseUnit: invItem?.preferredPurchaseUnit ?? invItem?.unit ?? unitPair.purchase,
						usagePerServing: ing.amount,
						usageUnit: invItem?.displayUnit ?? "ml",
						conversionFactor: productFactor,
						costSource: source,
					};
				})
				: [createEmptyIngredient()],
			overheadCosts: [],
			servingsPerBatch: 1,
			sellingPrice: product.promoPrice ?? product.price,
			happyHourPrice: 0,
			productId,
			sourceType: recipe ? "recipe_based" : "manual",
		};
		setForm(newForm);
		setSelectedRows(new Set());
		setEditingId(null);
	}, [products, recipes, inventory, inventoryCosts, hppType, baseRecipes]);

	const handleIngredientChange = useCallback((id: string, field: keyof IngredientRow, value: any) => {
		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.map((ing) =>
				ing.id === id ? { ...ing, [field]: value } : ing
			),
		}));
		hasUnsavedChanges.current = true;
	}, []);

	const handleSelectInventoryItem = useCallback((rowId: string, inventoryId: string, item: InventoryItem) => {
		const costInfo = inventoryCosts?.[inventoryId];
		const price = costInfo?.latestCostPerUnit ?? 0;
		const source: PriceSource = costInfo?.latestCostPerUnit ? "inventory" : "manual";

		const unitPair = findUnitPair(item.unit, item.displayUnit ?? item.unit);
		const invFactor = item.contentToBaseFactor ?? unitPair.factor;

		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.map((ing) =>
				ing.id === rowId
					? {
						...ing,
						inventoryId,
						ingredientName: item.ingredientName,
						purchasePrice: price / invFactor,
						purchaseQuantity: item.preferredPurchaseQuantity ?? 1,
						purchaseUnit: item.preferredPurchaseUnit ?? item.unit ?? unitPair.purchase,

						conversionFactor: invFactor,
						costSource: source,
					}
					: ing
			),
		}));
		hasUnsavedChanges.current = true;
	}, [inventoryCosts]);

	const handleAddRow = useCallback(() => {
		setForm((prev) => ({
			...prev,
			ingredients: [...prev.ingredients, createEmptyIngredient()],
		}));
	}, []);

	const handleToggleRow = useCallback((id: string) => {
		setSelectedRows((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const handleToggleAll = useCallback(() => {
		if (selectedRows.size === form.ingredients.length) {
			setSelectedRows(new Set());
		} else {
			setSelectedRows(new Set(form.ingredients.map((ing) => ing.id)));
		}
	}, [form.ingredients, selectedRows]);

	const handleBulkDelete = useCallback(() => {
		if (selectedRows.size === 0) {
			toast.error("Pilih bahan yang ingin dihapus");
			return;
		}
		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.filter((ing) => !selectedRows.has(ing.id)),
		}));
		setSelectedRows(new Set());
		hasUnsavedChanges.current = true;
		toast.success(`${selectedRows.size} bahan dihapus`);
	}, [selectedRows]);

	const handleSave = useCallback(async () => {
		if (form.ingredients.length === 0) {
			toast.error("Tambahkan minimal 1 bahan baku");
			return;
		}
		if (!form.ingredients.some((ing) => ing.ingredientName && ing.usagePerServing > 0)) {
			toast.error("Isi minimal 1 bahan baku dengan jumlah > 0");
			return;
		}

		setSaving(true);
		try {
			if (editingId) {
				await updateHpp({
					id: editingId,
					productId: form.productId,
					name: form.name,
					description: form.description,
					sellingPrice: form.sellingPrice,
					happyHourPrice: form.happyHourPrice,
					servingsPerBatch: form.servingsPerBatch,
					ingredients: form.ingredients,
					overheadCosts: form.overheadCosts,
					sourceType: form.sourceType,
				});
				toast.success("HPP berhasil diperbarui ✅");
			} else {
				const newId = await createHpp({
					productId: form.productId,
					name: form.name,
					description: form.description,
					sellingPrice: form.sellingPrice,
					happyHourPrice: form.happyHourPrice,
					servingsPerBatch: form.servingsPerBatch,
					ingredients: form.ingredients,
					overheadCosts: form.overheadCosts,
					sourceType: form.sourceType,
				});
				setEditingId(newId);
				toast.success("HPP berhasil disimpan ✅");
			}
			triggerHybridRefresh();
			hasUnsavedChanges.current = false;

			if (form.sourceType === "recipe_based" && form.productId) {
				try {
					const ingredients = form.ingredients
						.filter((ing) => ing.inventoryId && ing.usagePerServing > 0)
						.map((ing) => ({
							inventoryId: ing.inventoryId as Id<"inventory">,
							amount: ing.usagePerServing,
						}));
					if (ingredients.length > 0) {
						await saveRecipe({
							productId: form.productId as Id<"products">,
							ingredients,
						});
					}
				} catch {
					// Non-blocking — recipe sync failure shouldn't fail the save
				}
			}
		} catch (err: any) {
			toast.error(err?.message ?? "Gagal menyimpan HPP");
		} finally {
			setSaving(false);
		}
	}, [form, editingId, createHpp, updateHpp, saveRecipe]);

	const handleSyncFromRecipe = useCallback(async () => {
		if (!selectedProductId) {
			toast.error("Pilih produk dulu");
			return;
		}
		setSaving(true);
		try {
			await upsertFromRecipe({
				productId: selectedProductId,
				overheadCosts: form.overheadCosts,
			});
			toast.success("HPP tersinkron dari resep ✅");
			triggerHybridRefresh();
		} catch (err: any) {
			toast.error(err?.message ?? "Gagal sinkron");
		} finally {
			setSaving(false);
		}
	}, [selectedProductId, form.overheadCosts, upsertFromRecipe]);

	const handleSyncFromInventory = useCallback(() => {
		let synced = 0;
		let unmatched = 0;
		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.map((ing) => {
				let costInfo = ing.inventoryId ? inventoryCosts?.[ing.inventoryId] : undefined;
				let matchedInvId = ing.inventoryId;

				if (!costInfo?.latestCostPerUnit && ing.ingredientName && inventory) {
					const byName = (inventory as InventoryItem[]).find(
						(item) => safeLower(item.ingredientName) === safeLower(ing.ingredientName)
					);
					if (byName) {
						matchedInvId = byName._id;
						costInfo = inventoryCosts?.[byName._id];
					}
				}

				if (costInfo?.latestCostPerUnit && costInfo.latestCostPerUnit > 0) {
					synced++;
					const syncInvItem = (inventory ?? []).find((si: any) => si._id === (matchedInvId ?? ing.inventoryId));
					const syncBaseFactor = syncInvItem?.contentToBaseFactor ?? costInfo.conversionFactor;
					const factor = syncBaseFactor ?? findUnitPair(
						costInfo.unit ?? ing.purchaseUnit,
						costInfo.displayUnit ?? ing.usageUnit
					).factor;
					const baseUnit = costInfo.displayUnit ?? costInfo.unit ?? "ml";
					return {
						...ing,
						inventoryId: matchedInvId ?? ing.inventoryId,
						purchasePrice: costInfo.latestCostPerUnit / factor,
						purchaseQuantity: syncInvItem?.preferredPurchaseQuantity ?? 1,
						purchaseUnit: syncInvItem?.preferredPurchaseUnit ?? costInfo.unit ?? ing.purchaseUnit,

						conversionFactor: factor,
						costSource: "inventory" as PriceSource,
					};
				}
				unmatched++;
				return ing;
			}),
		}));
		hasUnsavedChanges.current = true;

		if (synced > 0) {
			toast.success(`${synced} harga bahan disinkron dari Inventory ✅` + (unmatched > 0 ? ` (${unmatched} tidak cocok)` : ""));
		} else {
			toast.error("Tidak ada bahan yang bisa disinkron — periksa nama bahan atau data inventory");
		}
	}, [inventory, inventoryCosts]);

	const handleAiAnalyze = useCallback(async () => {
		if (form.ingredients.length === 0) {
			toast.error("Tidak ada bahan untuk dianalisis");
			return;
		}
		setAiAnalyzing(true);
		setTimeout(() => {
			setAiAnalyzing(false);
			setAiPanelOpen(true);
			toast.success("Analisis AI selesai 🤖");
		}, 1500);
	}, [form]);

	const hasSelection = selectedProduct || selectedBaseRecipe;

	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<Calculator className="h-5 w-5 text-primary" />
					<h1 className="text-lg font-bold">HPP Resep</h1>
				</div>
			</div>

			<ProductSelectorCard
				productSearch={productSearch}
				setProductSearch={setProductSearch}
				productDropdownOpen={productDropdownOpen}
				setProductDropdownOpen={setProductDropdownOpen}
				baseRecipeSearch={baseRecipeSearch}
				setBaseRecipeSearch={setBaseRecipeSearch}
				baseRecipeDropdownOpen={baseRecipeDropdownOpen}
				setBaseRecipeDropdownOpen={setBaseRecipeDropdownOpen}
				hppType={hppType}
				setHppType={setHppType}
				recipeFilter={recipeFilter}
				setRecipeFilter={setRecipeFilter}
				filteredProducts={filteredProducts}
				selectedProductId={selectedProductId}
				handleSelectProduct={handleSelectProduct}
				form={form}
				setForm={setForm}
				products={products}
				selectedProduct={selectedProduct}
				selectedBaseRecipe={selectedBaseRecipe}
				selectedRecipe={selectedRecipe}
				inventory={inventory}
				inventoryCosts={inventoryCosts}
				recipes={recipes}
				loading={loading}
			/>

			{!hasSelection && (
				<EmptyStateCard
					loading={loading}
					emptyProductList={!!emptyProductList}
				/>
			)}

			{hasSelection && (
				<>
					<IngredientsTableCard
						form={form}
						setForm={setForm}
						selectedRows={selectedRows}
						setSelectedRows={setSelectedRows}
						inventory={inventory}
						usedInventoryIds={usedInventoryIds}
						selectedRecipe={selectedRecipe}
						handleSelectInventoryItem={handleSelectInventoryItem}
						handleIngredientChange={handleIngredientChange}
						handleToggleRow={handleToggleRow}
						handleToggleAll={handleToggleAll}
						handleAddRow={handleAddRow}
						handleBulkDelete={handleBulkDelete}
						handleSyncFromRecipe={handleSyncFromRecipe}
						handleSyncFromInventory={handleSyncFromInventory}
						handleAiAnalyze={handleAiAnalyze}
						handleSave={handleSave}
						saving={saving}
						editingId={editingId}
						aiAnalyzing={aiAnalyzing}
						selectedProduct={selectedProduct}
						selectedBaseRecipe={selectedBaseRecipe}
					/>

					{form.ingredients.some((ing) => ing.ingredientName) && (
						<SummaryBar form={form} setForm={setForm} metrics={metrics} activeHappyHour={activeHappyHour} />
					)}

					<AiInsightsPanel
						aiPanelOpen={aiPanelOpen}
						setAiPanelOpen={setAiPanelOpen}
						aiAnalyzing={aiAnalyzing}
						form={form}
						metrics={metrics}
					/>

					<SyncPanel
						syncPanelOpen={syncPanelOpen}
						setSyncPanelOpen={setSyncPanelOpen}
						form={form}
					/>
				</>
			)}
		</div>
	);
}
