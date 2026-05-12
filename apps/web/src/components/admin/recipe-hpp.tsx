// @ts-nocheck
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { Doc, Id } from "@/types/backend-compat";
import { motion, AnimatePresence } from "framer-motion";
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
	Link2,
	Package,
	Plus,
	RefreshCw,
	Search,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import {
	useHybridAllProducts,
	useHybridInventory,
	useHybridLatestInventoryCosts,
	triggerHybridRefresh,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridRecipes,
} from "@/hooks/use-hybrid-inventory-admin-data";
import {
	useHybridCreateHppCalculation,
	useHybridUpdateHppCalculation,
	useHybridDeleteHppCalculation,
	useHybridUpsertHppFromRecipe,
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
		const totalBaseUnits = ing.purchaseQuantity * ing.conversionFactor;
		if (totalBaseUnits <= 0) return sum;
		const costPerBaseUnit = ing.purchasePrice / totalBaseUnits;
		return sum + costPerBaseUnit * ing.usagePerServing;
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
	const ref = useRef<HTMLDivElement>(null);

	const filtered = useMemo(() => {
		return inventoryItems.filter((item) => {
			if (item._id && usedInventoryIds.has(item._id) && item._id !== value) return false;
			return safeLower(item.ingredientName).includes(safeLower(search));
		});
	}, [inventoryItems, usedInventoryIds, search, value]);

	const selectedItem = inventoryItems.find((item) => item._id === value);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	return (
		<div ref={ref} className="relative">
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
			{open && (
				<div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-lg border bg-popover p-1 shadow-lg">
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
									{item.displayUnit || item.unit}
								</span>
							</div>
						))
					)}
				</div>
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

// ─── Main Component ──────────────────────────────────────────

export function RecipeHppPage() {
	const navigate = useNavigate();
	const search = useSearch({ from: "/admin/recipe/hpp" }) as { productId?: string };
	const products = useHybridAllProducts() as ProductItem[] | undefined;
	const inventory = useHybridInventory() as InventoryItem[] | undefined;
	const inventoryCosts = useHybridLatestInventoryCosts();
	const recipes = useHybridRecipes();

	// Loading state
	const loading = !products || !inventory || !recipes;
	const emptyProductList = products && products.length === 0;

	// Auto-select product from query param
	useEffect(() => {
		if (search?.productId && products && !selectedProductId) {
			setSelectedProductId(search.productId);
		}
	}, [search?.productId, products]);

	const createHpp = useHybridCreateHppCalculation();
	const updateHpp = useHybridUpdateHppCalculation();
	const deleteHpp = useHybridDeleteHppCalculation();
	const upsertFromRecipe = useHybridUpsertHppFromRecipe();

	// ── State ──
	const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
	const [productSearch, setProductSearch] = useState("");
	const [productDropdownOpen, setProductDropdownOpen] = useState(false);

	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<HppFormData>({
		name: "",
		description: "",
		ingredients: [createEmptyIngredient()],
		overheadCosts: [],
		servingsPerBatch: 1,
		sellingPrice: 0,
		sourceType: "manual",
	});
	const [saving, setSaving] = useState(false);
	const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
	const [aiPanelOpen, setAiPanelOpen] = useState(false);
	const [syncPanelOpen, setSyncPanelOpen] = useState(false);
	const [aiAnalyzing, setAiAnalyzing] = useState(false);

	// ── Derived ──
	const metrics = useMemo(() => computeHpp(form), [form]);

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
		if (!products) return [];
		if (!productSearch) return products;
		return products.filter((p) =>
			safeLower(p.name).includes(safeLower(productSearch))
		);
	}, [products, productSearch]);

	const usedInventoryIds = useMemo(() => {
		return new Set(form.ingredients.map((ing) => ing.inventoryId).filter(Boolean) as string[]);
	}, [form.ingredients]);

	const hasUnsavedChanges = useRef(false);

	// ── Handlers ──

	const handleSelectProduct = useCallback((productId: string) => {
		setSelectedProductId(productId);
		setProductDropdownOpen(false);
		setProductSearch("");

		const product = products?.find((p) => p._id === productId);
		if (!product) return;

		// Try to find existing HPP or load from recipe
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

					return {
						id: generateId(),
						inventoryId: ing.inventoryId,
						ingredientName: invItem?.ingredientName ?? "",
						purchasePrice: price * (unitPair.factor),
						purchaseQuantity: 1,
						purchaseUnit: invItem?.unit ?? unitPair.purchase,
						usagePerServing: ing.amount,
						usageUnit: invItem?.displayUnit ?? unitPair.usage,
						conversionFactor: unitPair.factor,
						costSource: source,
					};
				})
				: [createEmptyIngredient()],
			overheadCosts: [],
			servingsPerBatch: 1,
			sellingPrice: product.promoPrice ?? product.price,
			productId,
			sourceType: recipe ? "recipe_based" : "manual",
		};
		setForm(newForm);
		setSelectedRows(new Set());
		setEditingId(null);
	}, [products, recipes, inventory, inventoryCosts]);

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

		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.map((ing) =>
				ing.id === rowId
					? {
						...ing,
						inventoryId,
						ingredientName: item.ingredientName,
						purchasePrice: price * unitPair.factor,
						purchaseQuantity: 1,
						purchaseUnit: item.unit ?? unitPair.purchase,
						usageUnit: item.displayUnit ?? unitPair.usage,
						conversionFactor: unitPair.factor,
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

	const handleInsertRow = useCallback((afterId: string) => {
		setForm((prev) => {
			const idx = prev.ingredients.findIndex((ing) => ing.id === afterId);
			const newRow = createEmptyIngredient();
			const copy = [...prev.ingredients];
			copy.splice(idx + 1, 0, newRow);
			return { ...prev, ingredients: copy };
		});
	}, []);

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
		hasUnsavedChanges.current = true;
	}, []);

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
		} catch (err: any) {
			toast.error(err?.message ?? "Gagal menyimpan HPP");
		} finally {
			setSaving(false);
		}
	}, [form, editingId, createHpp, updateHpp]);

	const handleSyncFromRecipe = useCallback(async () => {
		if (!selectedProductId) {
			toast.error("Pilih produk dulu");
			return;
		}
		setSaving(true);
		try {
			const result = await upsertFromRecipe({
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

	const handleAiAnalyze = useCallback(async () => {
		if (form.ingredients.length === 0) {
			toast.error("Tidak ada bahan untuk dianalisis");
			return;
		}
		setAiAnalyzing(true);
		// Simulasi AI — akan diganti dengan panggilan Yumi AI
		setTimeout(() => {
			setAiAnalyzing(false);
			setAiPanelOpen(true);
			toast.success("Analisis AI selesai 🤖");
		}, 1500);
	}, [form]);

	// ── Render ──

	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
			{/* ── Header Bar ── */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<Calculator className="h-5 w-5 text-primary" />
					<h1 className="text-lg font-bold">HPP Resep</h1>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="h-8 text-xs"
						onClick={() => navigate({ to: "/admin/hpp-calculator" as any })}
					>
						<BookOpen className="mr-1 h-3.5 w-3.5" />
						Lihat Portfolio
					</Button>
				</div>
			</div>

			{/* ── Product Selector ── */}
			<Card className="border-border/50">
				<CardContent className="p-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
						<div className="flex-1">
							<Label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
								Pilih Produk
							</Label>
							<div className="relative">
								<div
									className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:border-primary/50"
									onClick={() => setProductDropdownOpen(!productDropdownOpen)}
									role="combobox"
									tabIndex={0}
									onKeyDown={(e) => { if (e.key === "Enter") setProductDropdownOpen(!productDropdownOpen); }}
								>
									<Search className="h-4 w-4 shrink-0 text-muted-foreground" />
									<span className={`flex-1 ${!selectedProduct ? "text-muted-foreground" : ""}`}>
										{selectedProduct ? selectedProduct.name : "Cari produk..."}
									</span>
									<ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${productDropdownOpen ? "rotate-180" : ""}`} />
								</div>
								{productDropdownOpen && (
									<div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-lg border bg-popover p-1 shadow-lg">
										<div className="sticky top-0 mb-1 bg-popover px-1 pt-1">
											<Input
												placeholder="Cari produk..."
												value={productSearch}
												onChange={(e) => setProductSearch(e.target.value)}
												className="h-8 text-xs"
												autoFocus
											/>
										</div>
										{filteredProducts.length === 0 ? (
											<div className="px-2 py-4 text-center text-xs text-muted-foreground">
												Tidak ada produk ditemukan
											</div>
										) : (
											filteredProducts.map((product) => (
												<div
													key={product._id}
													className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-accent ${product._id === selectedProductId ? "bg-accent font-medium" : ""}`}
													onClick={() => handleSelectProduct(product._id)}
												>
													<span className="flex-1 truncate">{product.name}</span>
													<span className="shrink-0 text-[10px] text-muted-foreground">
														{formatCurrency(product.price)}
													</span>
												</div>
											))
										)}
									</div>
								)}
							</div>
						</div>

						<div className="w-full sm:w-32">
							<Label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
								Porsi/Batch
							</Label>
							<Input
								type="number"
								value={form.servingsPerBatch}
								onChange={(e) =>
									setForm((prev) => ({ ...prev, servingsPerBatch: Math.max(1, parseInt(e.target.value) || 1) }))
								}
								className="h-9 text-xs"
								min={1}
							/>
						</div>

						<div className="flex gap-2">
							<Button
								size="sm"
								className="h-9 text-xs"
								onClick={handleSave}
								disabled={saving || !selectedProduct}
							>
								{saving ? (
									<RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
								) : (
									<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
								)}
								{editingId ? "Perbarui" : "Simpan"}
							</Button>
						</div>
					</div>

					{/* Recipe info banner — data source indicators */}
					{selectedProduct && (
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
				</CardContent>
			</Card>

			{/* ── Loading / Empty State ── */}
			{!selectedProduct && (
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
			)}

			{/* ── Ingredients Table ── */}
			{selectedProduct && (
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
									onClick={handleAiAnalyze}
									disabled={aiAnalyzing}
								>
									<Sparkles className="mr-1 h-3 w-3" />
									{aiAnalyzing ? "Menganalisis..." : "AI Analisis"}
								</Button>
							</div>
						</div>
					</CardHeader>
					<CardContent className="p-0">
						{/* Table container */}
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
										<th className="w-16 px-1 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
											Aksi
										</th>
									</tr>
								</thead>
								<tbody>
									<AnimatePresence mode="popLayout">
										{form.ingredients.map((ing, idx) => {
											const subtotal = ing.purchaseQuantity > 0 && ing.conversionFactor > 0
												? (ing.purchasePrice / (ing.purchaseQuantity * ing.conversionFactor)) * ing.usagePerServing
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
																className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
																onClick={() => handleMoveRow(ing.id, "up")}
																disabled={idx === 0}
																title="Naik"
															>
																<ArrowUp className="h-3 w-3" />
															</button>
															<button
																className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
																onClick={() => handleMoveRow(ing.id, "down")}
																disabled={idx === form.ingredients.length - 1}
																title="Turun"
															>
																<ArrowDown className="h-3 w-3" />
															</button>
															<button
																className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
																onClick={() => handleInsertRow(ing.id)}
																title="Sisip"
															>
																<Plus className="h-3 w-3" />
															</button>
															<button
																className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
																onClick={() => handleDeleteRow(ing.id)}
																title="Hapus"
															>
																<X className="h-3 w-3" />
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

						{/* Table footer */}
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
			)}

			{/* ── Summary Bar ── */}
			{selectedProduct && form.ingredients.some((ing) => ing.ingredientName) && (
				<Card className="border-primary/20 bg-primary/[0.02]">
					<CardContent className="p-4">
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
							<div>
								<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
									HPP/Porsi
								</p>
								<p className="mt-0.5 text-sm font-bold tabular-nums">
									{formatCurrency(metrics.totalHppPerServing)}
								</p>
							</div>
							<div>
								<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
									HPP/Batch
								</p>
								<p className="mt-0.5 text-sm font-bold tabular-nums">
									{formatCurrency(metrics.totalHppPerBatch)}
								</p>
							</div>
							<div>
								<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
									Harga Jual
								</p>
								<p className="mt-0.5 text-sm font-bold tabular-nums">
									{formatCurrency(form.sellingPrice)}
								</p>
							</div>
							<div>
								<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
									Laba/Porsi
								</p>
								<p className={`mt-0.5 text-sm font-bold tabular-nums ${metrics.profitPerServing >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
									{formatCurrency(metrics.profitPerServing)}
								</p>
							</div>
							<div>
								<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
									Margin
								</p>
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
								<p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
									Markup
								</p>
								<p className="mt-0.5 text-sm font-bold tabular-nums">
									{formatNumber(metrics.markupPercent)}%
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* ── AI Insights Panel ── */}
			{selectedProduct && (
				<Card className="border-emerald-200/50">
									<button
										className="flex w-full items-center gap-2 px-4 py-3 text-left"
										onClick={() => setAiPanelOpen(!aiPanelOpen)}
									>
										<Sparkles className="h-4 w-4 text-emerald-500" />
										<span className="text-sm font-bold flex-1">AI Cost Insights</span>
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
														{form.ingredients.length > 0
															? (() => {
																const costs = form.ingredients.map((ing) => {
																	const sub = ing.purchaseQuantity > 0 && ing.conversionFactor > 0
																		? (ing.purchasePrice / (ing.purchaseQuantity * ing.conversionFactor)) * ing.usagePerServing
																		: 0;
																	return { name: ing.ingredientName || "(kosong)", cost: sub };
																});
																const max = costs.reduce((a, b) => a.cost > b.cost ? a : b, { name: "", cost: 0 });
																const pct = metrics.totalHppPerServing > 0 ? ((max.cost / metrics.totalHppPerServing) * 100).toFixed(0) : "0";
																return `${max.name || "—"} (${pct}% dari HPP)`;
															})()
															: "—"}
													</p>
												</div>
												<div className="rounded-lg border border-border/50 bg-muted/20 p-3">
													<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
														💰 Harga Jual Rekomendasi
													</p>
													<p className="mt-1 font-medium">
														{metrics.totalHppPerServing > 0
															? formatCurrency(Math.round(metrics.totalHppPerServing / 0.7))
															: "—"} <span className="text-[10px] text-muted-foreground">(30% margin)</span>
													</p>
												</div>
												<div className="rounded-lg border border-border/50 bg-muted/20 p-3">
													<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
														📊 Jumlah Bahan
													</p>
													<p className="mt-1 font-medium">
														{form.ingredients.length} bahan
														{form.ingredients.filter((i) => !i.ingredientName).length > 0 && (
															<span className="ml-1 text-[10px] text-amber-600">
																({form.ingredients.filter((i) => !i.ingredientName).length} belum diisi)
															</span>
														)}
													</p>
												</div>
											</div>
										</div>
									)}
								</Card>
			)}

			{/* ── Purchasing Sync Panel ── */}
			{selectedProduct && (
				<Card className="border-blue-200/50">
									<button
										className="flex w-full items-center gap-2 px-4 py-3 text-left"
										onClick={() => setSyncPanelOpen(!syncPanelOpen)}
									>
										<RefreshCw className="h-4 w-4 text-blue-500" />
										<span className="text-sm font-bold flex-1">Sync: Purchasing Agent</span>
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
			)}
		</div>
	);
}
