import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	ArrowRight,
	Calculator,
	ChevronDown,
	ChevronUp,
	CircleDollarSign,
	Copy,
	Database,
	Edit,
	FileDown,
	GlassWater,
	Link2,
	Package,
	Percent,
	Plus,
	RefreshCw,
	Scale,
	Trash2,
	TrendingUp,
	X,
	Zap,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createLazyFileRoute("/admin/hpp-calculator")({
	component: HppCalculatorPage,
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface IngredientRow {
	id: string;
	inventoryId?: Id<"inventory">;
	ingredientName: string;
	purchasePrice: number;
	purchaseQuantity: number;
	purchaseUnit: string;
	usagePerServing: number;
	usageUnit: string;
	conversionFactor: number;
}

interface OverheadRow {
	id: string;
	name: string;
	costPerServing: number;
}

interface HppFormData {
	name: string;
	description: string;
	ingredients: IngredientRow[];
	overheadCosts: OverheadRow[];
	servingsPerBatch: number;
	sellingPrice: number;
	productId?: Id<"products">;
}

interface HppCalcResult {
	ingredientCostPerServing: number;
	overheadCostPerServing: number;
	totalHppPerServing: number;
	totalHppPerBatch: number;
	profitPerServing: number;
	profitMarginPercent: number;
	markupPercent: number;
	breakEvenServings: number;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function generateId(): string {
	return Math.random().toString(36).substring(2, 9);
}

function formatCurrency(value: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(value);
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat("id-ID", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(value);
}

function getCostPerBaseUnit(ingredient: IngredientRow): number {
	const totalBaseUnits =
		ingredient.purchaseQuantity * ingredient.conversionFactor;
	if (totalBaseUnits === 0) {
		return 0;
	}
	return ingredient.purchasePrice / totalBaseUnits;
}

function getIngredientCostPerServing(ingredient: IngredientRow): number {
	return getCostPerBaseUnit(ingredient) * ingredient.usagePerServing;
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
	};
}

function createEmptyOverhead(): OverheadRow {
	return { id: generateId(), name: "", costPerServing: 0 };
}

const INITIAL_FORM: HppFormData = {
	name: "",
	description: "",
	ingredients: [createEmptyIngredient()],
	overheadCosts: [createEmptyOverhead()],
	servingsPerBatch: 1,
	sellingPrice: 0,
};

const COMMON_UNITS = [
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

function computeHpp(form: HppFormData): HppCalcResult {
	const ingredientCostPerServing = form.ingredients.reduce(
		(sum, ing) => sum + getIngredientCostPerServing(ing),
		0
	);
	const overheadCostPerServing = form.overheadCosts.reduce(
		(sum, oh) => sum + oh.costPerServing,
		0
	);
	const totalHppPerServing = ingredientCostPerServing + overheadCostPerServing;
	const totalHppPerBatch = totalHppPerServing * form.servingsPerBatch;
	const profitPerServing = form.sellingPrice - totalHppPerServing;
	const profitMarginPercent =
		form.sellingPrice > 0 ? (profitPerServing / form.sellingPrice) * 100 : 0;
	const markupPercent =
		totalHppPerServing > 0 ? (profitPerServing / totalHppPerServing) * 100 : 0;
	const breakEvenServings =
		totalHppPerBatch > 0 && profitPerServing > 0
			? Math.ceil(totalHppPerBatch / profitPerServing)
			: 0;
	return {
		ingredientCostPerServing,
		overheadCostPerServing,
		totalHppPerServing,
		totalHppPerBatch,
		profitPerServing,
		profitMarginPercent,
		markupPercent,
		breakEvenServings,
	};
}

/** Compute HPP for a saved calculation doc */
function computeHppFromDoc(calc: Doc<"hppCalculations">) {
	const ingredientCost = calc.ingredients.reduce((sum, ing) => {
		const totalBase = ing.purchaseQuantity * ing.conversionFactor;
		const costBase = totalBase > 0 ? ing.purchasePrice / totalBase : 0;
		return sum + costBase * ing.usagePerServing;
	}, 0);
	const overheadCost = calc.overheadCosts.reduce(
		(sum, oh) => sum + oh.costPerServing,
		0
	);
	const totalHpp = ingredientCost + overheadCost;
	const profit = calc.sellingPrice - totalHpp;
	const margin = calc.sellingPrice > 0 ? (profit / calc.sellingPrice) * 100 : 0;
	return { ingredientCost, overheadCost, totalHpp, profit, margin };
}

// ─── Main Component ──────────────────────────────────────────────────────────

function HppCalculatorPage() {
	const hppCalculations = useQuery(api.hpp.getHppCalculations);
	const inventory = useQuery(api.inventory.getInventory);
	const products = useQuery(api.products.getAllProductsAdmin);
	const inventoryCosts = useQuery(api.hpp.getLatestInventoryCosts);
	const productsWithRecipes = useQuery(api.hpp.getProductsWithRecipes);

	const createHpp = useMutation(api.hpp.createHppCalculation);
	const updateHpp = useMutation(api.hpp.updateHppCalculation);
	const deleteHpp = useMutation(api.hpp.deleteHppCalculation);
	const syncPrices = useMutation(api.hpp.syncHppWithInventoryPrices);

	const [activeTab, setActiveTab] = useState<"calculator" | "saved">(
		"calculator"
	);
	const [form, setForm] = useState<HppFormData>(INITIAL_FORM);
	const [editingId, setEditingId] = useState<Id<"hppCalculations"> | null>(
		null
	);
	const [deleteTarget, setDeleteTarget] =
		useState<Id<"hppCalculations"> | null>(null);
	const [expandedCard, setExpandedCard] =
		useState<Id<"hppCalculations"> | null>(null);
	const [showImportModal, setShowImportModal] = useState(false);
	const [syncingId, setSyncingId] = useState<Id<"hppCalculations"> | null>(
		null
	);

	const calculations = useMemo(() => computeHpp(form), [form]);

	// ─── Check for price changes on saved calculations ─────────────────────

	const priceAlerts = useMemo(() => {
		if (!(hppCalculations && inventoryCosts)) {
			return [];
		}
		const alerts: {
			hppId: Id<"hppCalculations">;
			hppName: string;
			changes: {
				ingredientName: string;
				oldPrice: number;
				newPrice: number;
				diff: number;
			}[];
		}[] = [];

		for (const calc of hppCalculations) {
			const changes: (typeof alerts)[number]["changes"] = [];
			for (const ing of calc.ingredients) {
				if (!ing.inventoryId) {
					continue;
				}
				const cost = inventoryCosts[ing.inventoryId];
				if (!cost?.latestCostPerUnit) {
					continue;
				}

				const currentPurchasePrice =
					cost.latestCostPerUnit * ing.conversionFactor;
				// Only alert if difference > 1%
				if (
					ing.purchasePrice > 0 &&
					Math.abs(currentPurchasePrice - ing.purchasePrice) /
						ing.purchasePrice >
						0.01
				) {
					changes.push({
						ingredientName: ing.ingredientName,
						oldPrice: ing.purchasePrice,
						newPrice: currentPurchasePrice,
						diff:
							((currentPurchasePrice - ing.purchasePrice) / ing.purchasePrice) *
							100,
					});
				}
			}
			if (changes.length > 0) {
				alerts.push({
					hppId: calc._id,
					hppName: calc.name,
					changes,
				});
			}
		}
		return alerts;
	}, [hppCalculations, inventoryCosts]);

	// ─── Ingredient Helpers ───────────────────────────────────────────────────

	const updateIngredient = useCallback(
		(id: string, field: keyof IngredientRow, value: string | number) => {
			setForm((prev) => ({
				...prev,
				ingredients: prev.ingredients.map((ing) =>
					ing.id === id ? { ...ing, [field]: value } : ing
				),
			}));
		},
		[]
	);

	const applyUnitPreset = useCallback((id: string, presetIndex: number) => {
		const preset = COMMON_UNITS[presetIndex];
		if (!preset) {
			return;
		}
		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.map((ing) =>
				ing.id === id
					? {
							...ing,
							purchaseUnit: preset.purchase,
							usageUnit: preset.usage,
							conversionFactor: preset.factor,
						}
					: ing
			),
		}));
	}, []);

	const linkIngredientToInventory = useCallback(
		(ingredientId: string, inventoryItemId: string) => {
			if (!inventoryCosts) {
				return;
			}
			const cost = inventoryCosts[inventoryItemId];
			if (!cost) {
				return;
			}

			const invItem = inventory?.find((i) => i._id === inventoryItemId);
			if (!invItem) {
				return;
			}

			const convFactor = invItem.conversionFactor || 1;
			const displayUnit = invItem.displayUnit || invItem.unit;
			const purchasePrice = (cost.latestCostPerUnit ?? 0) * convFactor;

			setForm((prev) => ({
				...prev,
				ingredients: prev.ingredients.map((ing) =>
					ing.id === ingredientId
						? {
								...ing,
								inventoryId: inventoryItemId as Id<"inventory">,
								ingredientName: invItem.ingredientName,
								purchaseUnit: displayUnit,
								usageUnit: invItem.unit,
								conversionFactor: convFactor,
								purchasePrice,
								purchaseQuantity: 1,
							}
						: ing
				),
			}));
		},
		[inventoryCosts, inventory]
	);

	const addIngredient = useCallback(() => {
		setForm((prev) => ({
			...prev,
			ingredients: [...prev.ingredients, createEmptyIngredient()],
		}));
	}, []);

	const removeIngredient = useCallback((id: string) => {
		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.filter((ing) => ing.id !== id),
		}));
	}, []);

	// ─── Overhead Helpers ─────────────────────────────────────────────────────

	const updateOverhead = useCallback(
		(id: string, field: keyof OverheadRow, value: string | number) => {
			setForm((prev) => ({
				...prev,
				overheadCosts: prev.overheadCosts.map((oh) =>
					oh.id === id ? { ...oh, [field]: value } : oh
				),
			}));
		},
		[]
	);

	const addOverhead = useCallback(() => {
		setForm((prev) => ({
			...prev,
			overheadCosts: [...prev.overheadCosts, createEmptyOverhead()],
		}));
	}, []);

	const removeOverhead = useCallback((id: string) => {
		setForm((prev) => ({
			...prev,
			overheadCosts: prev.overheadCosts.filter((oh) => oh.id !== id),
		}));
	}, []);

	// ─── Import from Recipe ───────────────────────────────────────────────────

	const _handleImportFromRecipe = useCallback(
		async (productId: Id<"products">, _variantName?: string) => {
			// We use the query result reactively, but for import we need to
			// call via the already-fetched productsWithRecipes + inventoryCosts.
			// Since generateHppFromRecipe is a query, we use a client-side approach:
			const product = products?.find((p) => p._id === productId);
			if (!product) {
				return;
			}

			const recipes = productsWithRecipes?.find(
				(p) => p.product._id === productId
			);
			if (!recipes) {
				return;
			}

			// Build ingredients from inventory data
			// We'll need to call the query via a different approach—
			// actually let's just build it client-side from the data we already have
			const _allRecipes = await fetch(""); // Not needed, we have the data

			// Actually, let's use the data we already have
			toast.info("Mengimpor resep...");
			setShowImportModal(false);
		},
		[products, productsWithRecipes]
	);

	// ─── Save / Edit / Delete ─────────────────────────────────────────────────

	const handleSave = async () => {
		if (!form.name.trim()) {
			toast.error("Nama kalkulasi harus diisi");
			return;
		}
		if (form.ingredients.length === 0) {
			toast.error("Tambahkan minimal 1 bahan baku");
			return;
		}

		const payload = {
			name: form.name,
			description: form.description || undefined,
			ingredients: form.ingredients.map(({ id, ...rest }) => rest),
			overheadCosts: form.overheadCosts.map(({ id, ...rest }) => rest),
			servingsPerBatch: form.servingsPerBatch,
			sellingPrice: form.sellingPrice,
			productId: form.productId || undefined,
		};

		try {
			if (editingId) {
				await updateHpp({ id: editingId, ...payload });
				toast.success("Kalkulasi HPP berhasil diperbarui");
				setEditingId(null);
			} else {
				await createHpp(payload);
				toast.success("Kalkulasi HPP berhasil disimpan");
			}
			setForm(INITIAL_FORM);
			setActiveTab("saved");
		} catch {
			toast.error("Gagal menyimpan kalkulasi HPP");
		}
	};

	const handleEdit = (calc: Doc<"hppCalculations">) => {
		setForm({
			name: calc.name,
			description: calc.description || "",
			ingredients: calc.ingredients.map((ing) => ({
				...ing,
				id: generateId(),
			})),
			overheadCosts: calc.overheadCosts.map((oh) => ({
				...oh,
				id: generateId(),
			})),
			servingsPerBatch: calc.servingsPerBatch,
			sellingPrice: calc.sellingPrice,
			productId: calc.productId,
		});
		setEditingId(calc._id);
		setActiveTab("calculator");
	};

	const handleDuplicate = (calc: Doc<"hppCalculations">) => {
		setForm({
			name: `${calc.name} (Salinan)`,
			description: calc.description || "",
			ingredients: calc.ingredients.map((ing) => ({
				...ing,
				id: generateId(),
			})),
			overheadCosts: calc.overheadCosts.map((oh) => ({
				...oh,
				id: generateId(),
			})),
			servingsPerBatch: calc.servingsPerBatch,
			sellingPrice: calc.sellingPrice,
			productId: undefined,
		});
		setEditingId(null);
		setActiveTab("calculator");
	};

	const handleDelete = async () => {
		if (!deleteTarget) {
			return;
		}
		try {
			await deleteHpp({ id: deleteTarget });
			toast.success("Kalkulasi HPP berhasil dihapus");
		} catch {
			toast.error("Gagal menghapus kalkulasi HPP");
		}
		setDeleteTarget(null);
	};

	const handleReset = () => {
		setForm(INITIAL_FORM);
		setEditingId(null);
	};

	const handleSyncPrices = async (id: Id<"hppCalculations">) => {
		setSyncingId(id);
		try {
			const result = await syncPrices({ id });
			if (result.updatedCount > 0) {
				toast.success(`${result.updatedCount} harga bahan berhasil diperbarui`);
			} else {
				toast.info("Semua harga sudah sesuai, tidak ada perubahan");
			}
		} catch {
			toast.error("Gagal sinkronisasi harga");
		}
		setSyncingId(null);
	};

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="fade-in slide-in-from-bottom-4 flex animate-in flex-col gap-6 duration-500">
			{/* Page Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-bold text-xl tracking-tight">Kalkulator HPP</h2>
					<p className="text-muted-foreground text-sm">
						Hitung Harga Pokok Produksi bahan baku per porsi/gelas
					</p>
				</div>
			</div>

			{/* Price Change Alerts */}
			{priceAlerts.length > 0 && (
				<div className="flex flex-col gap-2">
					{priceAlerts.map((alert) => (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30"
							initial={{ opacity: 0, y: -5 }}
							key={alert.hppId}
						>
							<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
							<div className="flex-1">
								<p className="font-semibold text-amber-800 text-xs dark:text-amber-200">
									Perubahan harga terdeteksi: {alert.hppName}
								</p>
								<div className="mt-1 flex flex-col gap-0.5">
									{alert.changes.map((c) => (
										<p
											className="text-[11px] text-amber-700 dark:text-amber-300"
											key={c.ingredientName}
										>
											{c.ingredientName}: {formatCurrency(c.oldPrice)}{" "}
											<ArrowRight className="inline h-3 w-3" />{" "}
											{formatCurrency(c.newPrice)}{" "}
											<span
												className={
													c.diff > 0 ? "text-red-600" : "text-green-600"
												}
											>
												({c.diff > 0 ? "+" : ""}
												{formatNumber(c.diff)}%)
											</span>
										</p>
									))}
								</div>
							</div>
							<Button
								className="shrink-0"
								onClick={() => handleSyncPrices(alert.hppId)}
								size="sm"
								variant="outline"
							>
								<RefreshCw
									className={`h-3 w-3 ${syncingId === alert.hppId ? "animate-spin" : ""}`}
								/>
								Sync
							</Button>
						</motion.div>
					))}
				</div>
			)}

			{/* Tabs */}
			<div className="flex items-center gap-2 border-border border-b pb-1">
				<button
					className={`relative px-4 py-2 font-bold text-sm transition-colors ${
						activeTab === "calculator"
							? "text-primary"
							: "text-muted-foreground hover:text-foreground"
					}`}
					onClick={() => setActiveTab("calculator")}
					type="button"
				>
					Kalkulator
					{activeTab === "calculator" && (
						<motion.div
							className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
							layoutId="hppTab"
						/>
					)}
				</button>
				<button
					className={`relative px-4 py-2 font-bold text-sm transition-colors ${
						activeTab === "saved"
							? "text-primary"
							: "text-muted-foreground hover:text-foreground"
					}`}
					onClick={() => setActiveTab("saved")}
					type="button"
				>
					Tersimpan
					{hppCalculations && hppCalculations.length > 0 && (
						<span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-primary text-xs">
							{hppCalculations.length}
						</span>
					)}
					{activeTab === "saved" && (
						<motion.div
							className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
							layoutId="hppTab"
						/>
					)}
				</button>
			</div>

			{activeTab === "calculator" && (
				<CalculatorView
					addIngredient={addIngredient}
					addOverhead={addOverhead}
					applyUnitPreset={applyUnitPreset}
					calculations={calculations}
					editingId={editingId}
					form={form}
					inventory={inventory}
					inventoryCosts={inventoryCosts}
					linkIngredientToInventory={linkIngredientToInventory}
					onReset={handleReset}
					onSave={handleSave}
					products={products}
					productsWithRecipes={productsWithRecipes}
					removeIngredient={removeIngredient}
					removeOverhead={removeOverhead}
					setForm={setForm}
					setShowImportModal={setShowImportModal}
					showImportModal={showImportModal}
					updateIngredient={updateIngredient}
					updateOverhead={updateOverhead}
				/>
			)}

			{activeTab === "saved" && (
				<SavedCalculationsView
					calculations={hppCalculations}
					expandedCard={expandedCard}
					inventoryCosts={inventoryCosts}
					onDelete={(id) => setDeleteTarget(id)}
					onDuplicate={handleDuplicate}
					onEdit={handleEdit}
					onSync={handleSyncPrices}
					products={products}
					setExpandedCard={setExpandedCard}
					syncingId={syncingId}
				/>
			)}

			{/* Delete Confirmation */}
			<ConfirmationModal
				isOpen={!!deleteTarget}
				message="Apakah Anda yakin ingin menghapus kalkulasi HPP ini? Tindakan ini tidak dapat dibatalkan."
				onClose={() => setDeleteTarget(null)}
				onConfirm={handleDelete}
				title="Hapus Kalkulasi HPP"
			/>
		</div>
	);
}

// ─── Import from Recipe Modal ────────────────────────────────────────────────

function ImportRecipeModal({
	productsWithRecipes,
	inventoryCosts,
	inventory,
	products,
	onImport,
	onClose,
}: {
	productsWithRecipes:
		| { product: Doc<"products">; variants: string[] }[]
		| undefined;
	inventoryCosts: Record<string, { latestCostPerUnit?: number }> | undefined;
	inventory: Doc<"inventory">[] | undefined;
	products: Doc<"products">[] | undefined;
	onImport: (data: HppFormData) => void;
	onClose: () => void;
}) {
	const recipes = useQuery(api.inventory.getRecipes);
	const [selectedProduct, setSelectedProduct] = useState<Id<"products"> | null>(
		null
	);
	const [selectedVariant, setSelectedVariant] = useState<string>("");

	const selectedProductData = productsWithRecipes?.find(
		(p) => p.product._id === selectedProduct
	);

	const handleImport = () => {
		if (!(selectedProduct && recipes && inventory)) {
			return;
		}

		// Find the matching recipe
		const recipe = recipes.find(
			(r) =>
				r.productId === selectedProduct &&
				(selectedVariant ? r.variantName === selectedVariant : !r.variantName)
		);
		// Fallback: try base recipe
		const recipeToUse =
			recipe ||
			recipes.find((r) => r.productId === selectedProduct && !r.variantName);

		if (!recipeToUse) {
			toast.error("Resep tidak ditemukan untuk produk ini");
			return;
		}

		const product = products?.find((p) => p._id === selectedProduct);
		if (!product) {
			return;
		}

		// Build ingredient rows from recipe
		const ingredients: IngredientRow[] = recipeToUse.ingredients
			.map((recipeIng) => {
				const invItem = inventory.find((i) => i._id === recipeIng.inventoryId);
				if (!invItem) {
					return null;
				}

				const convFactor = invItem.conversionFactor || 1;
				const displayUnit = invItem.displayUnit || invItem.unit;
				const costData = inventoryCosts?.[invItem._id];
				const purchasePrice = (costData?.latestCostPerUnit ?? 0) * convFactor;

				return {
					id: generateId(),
					inventoryId: invItem._id,
					ingredientName: invItem.ingredientName,
					purchasePrice,
					purchaseQuantity: 1,
					purchaseUnit: displayUnit,
					usagePerServing: recipeIng.amount,
					usageUnit: invItem.unit,
					conversionFactor: convFactor,
				} satisfies IngredientRow;
			})
			.filter((i): i is IngredientRow => i !== null);

		if (ingredients.length === 0) {
			toast.error("Tidak ada bahan yang bisa diimpor dari resep ini");
			return;
		}

		const variantLabel = selectedVariant ? ` (${selectedVariant})` : "";

		onImport({
			name: `HPP ${product.name}${variantLabel}`,
			description: `Auto-generated dari resep ${product.name}${variantLabel}`,
			ingredients,
			overheadCosts: [createEmptyOverhead()],
			servingsPerBatch: 1,
			sellingPrice: product.promoPrice ?? product.price,
			productId: product._id,
		});

		toast.success(`Resep ${product.name}${variantLabel} berhasil diimpor`);
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg"
				exit={{ opacity: 0, scale: 0.95 }}
				initial={{ opacity: 0, scale: 0.95 }}
			>
				<div className="mb-4 flex items-center justify-between">
					<h3 className="flex items-center gap-2 font-bold text-base">
						<FileDown className="h-4 w-4 text-primary" />
						Impor dari Resep
					</h3>
					<button
						className="rounded p-1 text-muted-foreground hover:bg-muted"
						onClick={onClose}
						type="button"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				{!productsWithRecipes || productsWithRecipes.length === 0 ? (
					<div className="py-8 text-center text-muted-foreground text-sm">
						Belum ada produk dengan resep. Buat resep terlebih dahulu di halaman
						Produk.
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label>Pilih Produk</Label>
							<select
								className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:border-ring"
								onChange={(e) => {
									setSelectedProduct(
										(e.target.value || null) as Id<"products"> | null
									);
									setSelectedVariant("");
								}}
								value={selectedProduct || ""}
							>
								<option value="">-- Pilih produk --</option>
								{productsWithRecipes.map((p) => (
									<option key={p.product._id} value={p.product._id}>
										{p.product.name} (
										{p.variants.length > 0
											? `${p.variants.length + 1} resep`
											: "1 resep"}
										)
									</option>
								))}
							</select>
						</div>

						{selectedProductData && selectedProductData.variants.length > 0 && (
							<div className="flex flex-col gap-1.5">
								<Label>Varian (Opsional)</Label>
								<select
									className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:border-ring"
									onChange={(e) => setSelectedVariant(e.target.value)}
									value={selectedVariant}
								>
									<option value="">Resep Dasar</option>
									{selectedProductData.variants.map((v) => (
										<option key={v} value={v}>
											{v}
										</option>
									))}
								</select>
							</div>
						)}

						{selectedProduct && (
							<div className="rounded-lg bg-muted/50 p-3 text-xs">
								<p className="font-medium text-muted-foreground">Informasi:</p>
								<ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
									<li>Bahan baku akan diimpor dari resep produk</li>
									<li>
										Harga beli diambil dari transaksi restock terbaru di
										inventaris
									</li>
									<li>Anda bisa mengedit semua data setelah impor</li>
								</ul>
							</div>
						)}

						<div className="flex justify-end gap-2">
							<Button onClick={onClose} variant="outline">
								Batal
							</Button>
							<Button disabled={!selectedProduct} onClick={handleImport}>
								<FileDown className="h-3.5 w-3.5" />
								Impor Resep
							</Button>
						</div>
					</div>
				)}
			</motion.div>
		</div>
	);
}

// ─── Calculator View ─────────────────────────────────────────────────────────

function CalculatorView({
	form,
	setForm,
	calculations,
	inventory,
	inventoryCosts,
	products,
	productsWithRecipes,
	editingId,
	updateIngredient,
	applyUnitPreset,
	linkIngredientToInventory,
	addIngredient,
	removeIngredient,
	updateOverhead,
	addOverhead,
	removeOverhead,
	onSave,
	onReset,
	showImportModal,
	setShowImportModal,
}: {
	form: HppFormData;
	setForm: React.Dispatch<React.SetStateAction<HppFormData>>;
	calculations: HppCalcResult;
	inventory: Doc<"inventory">[] | undefined;
	inventoryCosts: Record<string, { latestCostPerUnit?: number }> | undefined;
	products: Doc<"products">[] | undefined;
	productsWithRecipes:
		| { product: Doc<"products">; variants: string[] }[]
		| undefined;
	editingId: Id<"hppCalculations"> | null;
	updateIngredient: (
		id: string,
		field: keyof IngredientRow,
		value: string | number
	) => void;
	applyUnitPreset: (id: string, presetIndex: number) => void;
	linkIngredientToInventory: (
		ingredientId: string,
		inventoryItemId: string
	) => void;
	addIngredient: () => void;
	removeIngredient: (id: string) => void;
	updateOverhead: (
		id: string,
		field: keyof OverheadRow,
		value: string | number
	) => void;
	addOverhead: () => void;
	removeOverhead: (id: string) => void;
	onSave: () => void;
	onReset: () => void;
	showImportModal: boolean;
	setShowImportModal: (v: boolean) => void;
}) {
	return (
		<>
			<div className="grid gap-6 lg:grid-cols-[1fr_380px]">
				{/* Left Column - Form */}
				<div className="flex flex-col gap-6">
					{/* Basic Info */}
					<Card>
						<CardHeader className="border-b">
							<CardTitle className="flex items-center justify-between">
								<span className="flex items-center gap-2">
									<Calculator className="h-4 w-4 text-primary" />
									Informasi Dasar
								</span>
								<Button
									onClick={() => setShowImportModal(true)}
									size="sm"
									variant="outline"
								>
									<FileDown className="h-3.5 w-3.5" />
									Impor dari Resep
								</Button>
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="hpp-name">Nama Kalkulasi *</Label>
									<Input
										id="hpp-name"
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												name: e.target.value,
											}))
										}
										placeholder="cth: HPP Es Susu Coklat"
										value={form.name}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="hpp-desc">Deskripsi</Label>
									<Input
										id="hpp-desc"
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												description: e.target.value,
											}))
										}
										placeholder="cth: Perhitungan untuk 1 gelas 300ml"
										value={form.description}
									/>
								</div>
							</div>
							<div className="grid gap-4 sm:grid-cols-3">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="hpp-servings">Porsi per Batch</Label>
									<Input
										id="hpp-servings"
										min={1}
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												servingsPerBatch: Number(e.target.value) || 0,
											}))
										}
										type="number"
										value={form.servingsPerBatch || ""}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="hpp-selling">Harga Jual /Porsi</Label>
									<Input
										id="hpp-selling"
										min={0}
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												sellingPrice: Number(e.target.value) || 0,
											}))
										}
										placeholder="15000"
										type="number"
										value={form.sellingPrice || ""}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label>Produk Terkait</Label>
									<select
										className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:border-ring"
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												productId: (e.target.value || undefined) as
													| Id<"products">
													| undefined,
											}))
										}
										value={form.productId || ""}
									>
										<option value="">-- Tidak ada --</option>
										{products?.map((p) => (
											<option key={p._id} value={p._id}>
												{p.name}
											</option>
										))}
									</select>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Ingredients */}
					<Card>
						<CardHeader className="border-b">
							<CardTitle className="flex items-center justify-between">
								<span className="flex items-center gap-2">
									<Package className="h-4 w-4 text-primary" />
									Bahan Baku
								</span>
								<Button onClick={addIngredient} size="sm" variant="outline">
									<Plus className="h-3.5 w-3.5" />
									Tambah Bahan
								</Button>
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<AnimatePresence mode="popLayout">
								{form.ingredients.map((ing, idx) => (
									<motion.div
										animate={{ opacity: 1, y: 0 }}
										className="rounded-lg border border-border bg-muted/30 p-3"
										exit={{ opacity: 0, y: -10 }}
										initial={{ opacity: 0, y: 10 }}
										key={ing.id}
										layout
									>
										<div className="mb-3 flex items-center justify-between">
											<span className="flex items-center gap-2 font-semibold text-muted-foreground text-xs">
												Bahan #{idx + 1}
												{ing.inventoryId && (
													<span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 dark:bg-green-900/30 dark:text-green-400">
														<Link2 className="h-2.5 w-2.5" />
														Terhubung Inventaris
													</span>
												)}
											</span>
											{form.ingredients.length > 1 && (
												<button
													className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
													onClick={() => removeIngredient(ing.id)}
													type="button"
												>
													<X className="h-3.5 w-3.5" />
												</button>
											)}
										</div>

										<div className="grid gap-3 sm:grid-cols-3">
											<div className="flex flex-col gap-1">
												<Label className="text-[11px] text-muted-foreground">
													Nama Bahan
												</Label>
												<Input
													onChange={(e) =>
														updateIngredient(
															ing.id,
															"ingredientName",
															e.target.value
														)
													}
													placeholder="cth: Susu UHT"
													value={ing.ingredientName}
												/>
											</div>
											<div className="flex flex-col gap-1">
												<Label className="text-[11px] text-muted-foreground">
													<Database className="inline h-3 w-3" /> Link ke
													Inventaris
												</Label>
												<select
													className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:border-ring"
													onChange={(e) => {
														if (e.target.value) {
															linkIngredientToInventory(ing.id, e.target.value);
														}
													}}
													value={ing.inventoryId || ""}
												>
													<option value="">-- Manual --</option>
													{inventory?.map((inv) => (
														<option key={inv._id} value={inv._id}>
															{inv.ingredientName} ({inv.unit})
														</option>
													))}
												</select>
											</div>
											<div className="flex flex-col gap-1">
												<Label className="text-[11px] text-muted-foreground">
													Preset Satuan
												</Label>
												<select
													className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:border-ring"
													onChange={(e) => {
														if (e.target.value !== "") {
															applyUnitPreset(ing.id, Number(e.target.value));
														}
													}}
													value=""
												>
													<option value="">Pilih preset...</option>
													{COMMON_UNITS.map((u, i) => (
														<option key={`${u.purchase}-${u.usage}`} value={i}>
															{u.purchase} → {u.usage} (1:
															{u.factor})
														</option>
													))}
												</select>
											</div>
										</div>

										<div className="mt-3 grid gap-3 sm:grid-cols-4">
											<div className="flex flex-col gap-1">
												<Label className="text-[11px] text-muted-foreground">
													Harga Beli
												</Label>
												<Input
													min={0}
													onChange={(e) =>
														updateIngredient(
															ing.id,
															"purchasePrice",
															Number(e.target.value) || 0
														)
													}
													placeholder="18000"
													type="number"
													value={ing.purchasePrice || ""}
												/>
											</div>
											<div className="flex flex-col gap-1">
												<Label className="text-[11px] text-muted-foreground">
													Jumlah Beli
												</Label>
												<Input
													min={0}
													onChange={(e) =>
														updateIngredient(
															ing.id,
															"purchaseQuantity",
															Number(e.target.value) || 0
														)
													}
													placeholder="1"
													type="number"
													value={ing.purchaseQuantity || ""}
												/>
											</div>
											<div className="flex flex-col gap-1">
												<Label className="text-[11px] text-muted-foreground">
													Satuan Beli
												</Label>
												<Input
													onChange={(e) =>
														updateIngredient(
															ing.id,
															"purchaseUnit",
															e.target.value
														)
													}
													placeholder="liter"
													value={ing.purchaseUnit}
												/>
											</div>
											<div className="flex flex-col gap-1">
												<Label className="text-[11px] text-muted-foreground">
													Konversi
												</Label>
												<Input
													min={1}
													onChange={(e) =>
														updateIngredient(
															ing.id,
															"conversionFactor",
															Number(e.target.value) || 0
														)
													}
													placeholder="1000"
													type="number"
													value={ing.conversionFactor || ""}
												/>
											</div>
										</div>

										<div className="mt-3 grid gap-3 sm:grid-cols-3">
											<div className="flex flex-col gap-1">
												<Label className="text-[11px] text-muted-foreground">
													Pemakaian /Porsi
												</Label>
												<Input
													min={0}
													onChange={(e) =>
														updateIngredient(
															ing.id,
															"usagePerServing",
															Number(e.target.value) || 0
														)
													}
													placeholder="200"
													type="number"
													value={ing.usagePerServing || ""}
												/>
											</div>
											<div className="flex flex-col gap-1">
												<Label className="text-[11px] text-muted-foreground">
													Satuan Pakai
												</Label>
												<Input
													onChange={(e) =>
														updateIngredient(
															ing.id,
															"usageUnit",
															e.target.value
														)
													}
													placeholder="ml"
													value={ing.usageUnit}
												/>
											</div>
											<div className="flex flex-col gap-1.5">
												<Label className="text-[11px] text-muted-foreground">
													Biaya /Porsi
												</Label>
												<div className="flex h-8 items-center rounded-md bg-primary/5 px-2.5 font-semibold text-primary text-xs">
													{formatCurrency(getIngredientCostPerServing(ing))}
												</div>
											</div>
										</div>

										{/* Conversion info */}
										{ing.purchasePrice > 0 && ing.conversionFactor > 0 && (
											<div className="mt-2 flex flex-wrap items-center gap-1.5 rounded bg-blue-50 px-2 py-1.5 text-[11px] text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
												<Scale className="h-3 w-3 shrink-0" />
												<span>
													1 {ing.purchaseUnit} ={" "}
													{formatNumber(ing.conversionFactor)} {ing.usageUnit}
												</span>
												<ArrowRight className="h-3 w-3 shrink-0" />
												<span>
													Harga per {ing.usageUnit}:{" "}
													{formatCurrency(getCostPerBaseUnit(ing))}
												</span>
												{ing.usagePerServing > 0 && (
													<>
														<ArrowRight className="h-3 w-3 shrink-0" />
														<span>
															1 {ing.purchaseUnit} ={" "}
															{formatNumber(
																(ing.purchaseQuantity * ing.conversionFactor) /
																	ing.usagePerServing
															)}{" "}
															porsi
														</span>
													</>
												)}
											</div>
										)}

										{/* Inventory price info badge */}
										{ing.inventoryId && inventoryCosts?.[ing.inventoryId] && (
											<div className="mt-1.5 flex items-center gap-1.5 rounded bg-green-50 px-2 py-1 text-[11px] text-green-700 dark:bg-green-950/30 dark:text-green-300">
												<Zap className="h-3 w-3 shrink-0" />
												<span>
													Harga inventaris terbaru:{" "}
													{formatCurrency(
														(inventoryCosts[ing.inventoryId]
															?.latestCostPerUnit ?? 0) * ing.conversionFactor
													)}
													/{ing.purchaseUnit}
												</span>
											</div>
										)}
									</motion.div>
								))}
							</AnimatePresence>
						</CardContent>
					</Card>

					{/* Overhead Costs */}
					<Card>
						<CardHeader className="border-b">
							<CardTitle className="flex items-center justify-between">
								<span className="flex items-center gap-2">
									<CircleDollarSign className="h-4 w-4 text-primary" />
									Biaya Overhead /Porsi
								</span>
								<Button onClick={addOverhead} size="sm" variant="outline">
									<Plus className="h-3.5 w-3.5" />
									Tambah Biaya
								</Button>
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<p className="text-[11px] text-muted-foreground">
								Biaya tambahan per porsi seperti cup, sedotan, gas, listrik,
								dll.
							</p>
							<AnimatePresence mode="popLayout">
								{form.overheadCosts.map((oh, idx) => (
									<motion.div
										animate={{ opacity: 1, x: 0 }}
										className="flex items-end gap-2"
										exit={{ opacity: 0, x: -10 }}
										initial={{ opacity: 0, x: 10 }}
										key={oh.id}
										layout
									>
										<div className="flex flex-1 flex-col gap-1">
											<Label className="text-[11px] text-muted-foreground">
												{idx === 0 ? "Nama Biaya" : ""}
											</Label>
											<Input
												onChange={(e) =>
													updateOverhead(oh.id, "name", e.target.value)
												}
												placeholder="cth: Cup Plastik"
												value={oh.name}
											/>
										</div>
										<div className="flex w-36 flex-col gap-1">
											<Label className="text-[11px] text-muted-foreground">
												{idx === 0 ? "Biaya /Porsi" : ""}
											</Label>
											<Input
												min={0}
												onChange={(e) =>
													updateOverhead(
														oh.id,
														"costPerServing",
														Number(e.target.value) || 0
													)
												}
												placeholder="500"
												type="number"
												value={oh.costPerServing || ""}
											/>
										</div>
										{form.overheadCosts.length > 1 && (
											<button
												className="mb-0.5 rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
												onClick={() => removeOverhead(oh.id)}
												type="button"
											>
												<X className="h-3.5 w-3.5" />
											</button>
										)}
									</motion.div>
								))}
							</AnimatePresence>
						</CardContent>
					</Card>
				</div>

				{/* Right Column - Results Panel */}
				<div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
					{/* HPP Summary */}
					<Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
						<CardHeader className="border-b">
							<CardTitle className="flex items-center gap-2">
								<GlassWater className="h-4 w-4 text-primary" />
								Ringkasan HPP
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							{/* Ingredient cost breakdown */}
							<div>
								<p className="mb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
									Biaya Bahan Baku
								</p>
								{form.ingredients
									.filter((ing) => ing.ingredientName)
									.map((ing) => (
										<div
											className="flex items-center justify-between py-0.5 text-xs"
											key={ing.id}
										>
											<span className="flex items-center gap-1 text-muted-foreground">
												{ing.ingredientName}
												{ing.inventoryId && (
													<Link2 className="h-2.5 w-2.5 text-green-500" />
												)}
											</span>
											<span>
												{formatCurrency(getIngredientCostPerServing(ing))}
											</span>
										</div>
									))}
								<div className="mt-1 flex items-center justify-between border-border border-t pt-1 font-semibold text-xs">
									<span>Subtotal Bahan</span>
									<span>
										{formatCurrency(calculations.ingredientCostPerServing)}
									</span>
								</div>
							</div>

							{/* Overhead breakdown */}
							<div>
								<p className="mb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
									Biaya Overhead
								</p>
								{form.overheadCosts
									.filter((oh) => oh.name)
									.map((oh) => (
										<div
											className="flex items-center justify-between py-0.5 text-xs"
											key={oh.id}
										>
											<span className="text-muted-foreground">{oh.name}</span>
											<span>{formatCurrency(oh.costPerServing)}</span>
										</div>
									))}
								<div className="mt-1 flex items-center justify-between border-border border-t pt-1 font-semibold text-xs">
									<span>Subtotal Overhead</span>
									<span>
										{formatCurrency(calculations.overheadCostPerServing)}
									</span>
								</div>
							</div>

							{/* Total HPP */}
							<div className="rounded-lg bg-primary/10 p-3">
								<div className="flex items-center justify-between">
									<span className="font-bold text-sm">HPP /Porsi</span>
									<span className="font-bold text-lg text-primary">
										{formatCurrency(calculations.totalHppPerServing)}
									</span>
								</div>
								{form.servingsPerBatch > 1 && (
									<div className="mt-1 flex items-center justify-between text-muted-foreground text-xs">
										<span>HPP /Batch ({form.servingsPerBatch} porsi)</span>
										<span>{formatCurrency(calculations.totalHppPerBatch)}</span>
									</div>
								)}
							</div>
						</CardContent>
					</Card>

					{/* Profit Analysis */}
					{form.sellingPrice > 0 && (
						<Card
							className={
								calculations.profitMarginPercent >= 30
									? "border-green-200 dark:border-green-900"
									: calculations.profitMarginPercent >= 15
										? "border-yellow-200 dark:border-yellow-900"
										: "border-red-200 dark:border-red-900"
							}
						>
							<CardHeader className="border-b">
								<CardTitle className="flex items-center gap-2">
									<TrendingUp className="h-4 w-4 text-primary" />
									Analisis Keuntungan
								</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-2">
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">Harga Jual</span>
									<span className="font-semibold">
										{formatCurrency(form.sellingPrice)}
									</span>
								</div>
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">HPP</span>
									<span>{formatCurrency(calculations.totalHppPerServing)}</span>
								</div>
								<div className="border-border border-t pt-2">
									<div className="flex items-center justify-between text-xs">
										<span className="font-semibold">Laba /Porsi</span>
										<span
											className={`font-bold text-sm ${
												calculations.profitPerServing >= 0
													? "text-green-600 dark:text-green-400"
													: "text-red-600 dark:text-red-400"
											}`}
										>
											{formatCurrency(calculations.profitPerServing)}
										</span>
									</div>
								</div>

								{/* Margin & Markup bars */}
								<div className="mt-1 flex flex-col gap-2">
									<div>
										<div className="mb-1 flex items-center justify-between text-[11px]">
											<span className="text-muted-foreground">Margin Laba</span>
											<span className="font-semibold">
												{formatNumber(calculations.profitMarginPercent)}%
											</span>
										</div>
										<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
											<motion.div
												animate={{
													width: `${Math.min(Math.max(calculations.profitMarginPercent, 0), 100)}%`,
												}}
												className={`h-full rounded-full ${
													calculations.profitMarginPercent >= 30
														? "bg-green-500"
														: calculations.profitMarginPercent >= 15
															? "bg-yellow-500"
															: "bg-red-500"
												}`}
												initial={{ width: 0 }}
												transition={{
													duration: 0.5,
												}}
											/>
										</div>
									</div>
									<div>
										<div className="mb-1 flex items-center justify-between text-[11px]">
											<span className="text-muted-foreground">Markup</span>
											<span className="font-semibold">
												{formatNumber(calculations.markupPercent)}%
											</span>
										</div>
										<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
											<motion.div
												animate={{
													width: `${Math.min(Math.max(calculations.markupPercent / 3, 0), 100)}%`,
												}}
												className="h-full rounded-full bg-primary"
												initial={{ width: 0 }}
												transition={{
													duration: 0.5,
												}}
											/>
										</div>
									</div>
								</div>

								{calculations.breakEvenServings > 0 && (
									<div className="mt-1 rounded bg-muted/50 p-2 text-center text-[11px] text-muted-foreground">
										Break-even setelah{" "}
										<span className="font-bold text-foreground">
											{calculations.breakEvenServings} porsi
										</span>{" "}
										terjual (dari biaya batch)
									</div>
								)}
							</CardContent>
						</Card>
					)}

					{/* Action Buttons */}
					<div className="flex gap-2">
						<Button className="flex-1" onClick={onSave} variant="default">
							{editingId ? "Perbarui" : "Simpan"} Kalkulasi
						</Button>
						<Button onClick={onReset} variant="outline">
							Reset
						</Button>
					</div>
				</div>
			</div>

			{/* Import Modal */}
			{showImportModal && (
				<ImportRecipeModal
					inventory={inventory}
					inventoryCosts={inventoryCosts}
					onClose={() => setShowImportModal(false)}
					onImport={(data) => {
						setForm(data);
						setShowImportModal(false);
					}}
					products={products}
					productsWithRecipes={productsWithRecipes}
				/>
			)}
		</>
	);
}

// ─── Saved Calculations View ─────────────────────────────────────────────────

function SavedCalculationsView({
	calculations,
	products,
	inventoryCosts,
	expandedCard,
	setExpandedCard,
	onEdit,
	onDuplicate,
	onDelete,
	onSync,
	syncingId,
}: {
	calculations: Doc<"hppCalculations">[] | undefined;
	products: Doc<"products">[] | undefined;
	inventoryCosts: Record<string, { latestCostPerUnit?: number }> | undefined;
	expandedCard: Id<"hppCalculations"> | null;
	setExpandedCard: (id: Id<"hppCalculations"> | null) => void;
	onEdit: (calc: Doc<"hppCalculations">) => void;
	onDuplicate: (calc: Doc<"hppCalculations">) => void;
	onDelete: (id: Id<"hppCalculations">) => void;
	onSync: (id: Id<"hppCalculations">) => void;
	syncingId: Id<"hppCalculations"> | null;
}) {
	if (!calculations) {
		return (
			<div className="py-12 text-center text-muted-foreground text-sm">
				Memuat data...
			</div>
		);
	}

	if (calculations.length === 0) {
		return (
			<div className="flex flex-col items-center gap-3 py-16">
				<Calculator className="h-12 w-12 text-muted-foreground/40" />
				<p className="font-medium text-muted-foreground text-sm">
					Belum ada kalkulasi HPP tersimpan
				</p>
				<p className="text-muted-foreground text-xs">
					Gunakan tab Kalkulator untuk membuat perhitungan baru
				</p>
			</div>
		);
	}

	return (
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
			{calculations.map((calc) => {
				const { totalHpp, profit, margin } = computeHppFromDoc(calc);
				const linkedProduct = products?.find((p) => p._id === calc.productId);
				const isExpanded = expandedCard === calc._id;

				// Check if any ingredient has a price mismatch
				const hasLinkedIngredients = calc.ingredients.some(
					(ing) => ing.inventoryId
				);
				let hasPriceChange = false;
				if (hasLinkedIngredients && inventoryCosts) {
					for (const ing of calc.ingredients) {
						if (!ing.inventoryId) {
							continue;
						}
						const cost = inventoryCosts[ing.inventoryId];
						if (!cost?.latestCostPerUnit) {
							continue;
						}
						const currentPrice = cost.latestCostPerUnit * ing.conversionFactor;
						if (
							ing.purchasePrice > 0 &&
							Math.abs(currentPrice - ing.purchasePrice) / ing.purchasePrice >
								0.01
						) {
							hasPriceChange = true;
							break;
						}
					}
				}

				return (
					<Card
						className={`overflow-hidden ${hasPriceChange ? "border-amber-300 dark:border-amber-800" : ""}`}
						key={calc._id}
					>
						<CardHeader className="border-b">
							<CardTitle className="flex items-center justify-between">
								<div className="flex flex-col gap-0.5">
									<span className="flex items-center gap-1.5 truncate font-bold text-sm">
										{calc.name}
										{hasPriceChange && (
											<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
										)}
									</span>
									{linkedProduct && (
										<span className="text-[11px] text-muted-foreground">
											Produk: {linkedProduct.name}
										</span>
									)}
								</div>
								<button
									className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
									onClick={() => setExpandedCard(isExpanded ? null : calc._id)}
									title={isExpanded ? "Tutup" : "Detail"}
									type="button"
								>
									{isExpanded ? (
										<ChevronUp className="h-4 w-4" />
									) : (
										<ChevronDown className="h-4 w-4" />
									)}
								</button>
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							{/* Summary */}
							<div className="grid grid-cols-2 gap-2">
								<div className="rounded-md bg-muted/50 p-2 text-center">
									<p className="text-[10px] text-muted-foreground">
										HPP /Porsi
									</p>
									<p className="font-bold text-primary text-sm">
										{formatCurrency(totalHpp)}
									</p>
								</div>
								<div className="rounded-md bg-muted/50 p-2 text-center">
									<p className="text-[10px] text-muted-foreground">
										Laba /Porsi
									</p>
									<p
										className={`font-bold text-sm ${
											profit >= 0
												? "text-green-600 dark:text-green-400"
												: "text-red-600 dark:text-red-400"
										}`}
									>
										{formatCurrency(profit)}
									</p>
								</div>
							</div>

							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">Harga Jual</span>
								<span className="font-semibold">
									{formatCurrency(calc.sellingPrice)}
								</span>
							</div>
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">Margin</span>
								<span
									className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-[11px] ${
										margin >= 30
											? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
											: margin >= 15
												? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
												: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
									}`}
								>
									<Percent className="h-3 w-3" />
									{formatNumber(margin)}%
								</span>
							</div>

							{/* Linked ingredients indicator */}
							{hasLinkedIngredients && (
								<div className="flex items-center gap-1.5 text-[11px] text-green-600 dark:text-green-400">
									<Link2 className="h-3 w-3" />
									<span>
										{calc.ingredients.filter((i) => i.inventoryId).length}/
										{calc.ingredients.length} bahan terhubung ke inventaris
									</span>
								</div>
							)}

							{/* Expanded detail */}
							<AnimatePresence>
								{isExpanded && (
									<motion.div
										animate={{
											height: "auto",
											opacity: 1,
										}}
										className="overflow-hidden"
										exit={{ height: 0, opacity: 0 }}
										initial={{ height: 0, opacity: 0 }}
									>
										<div className="mt-2 flex flex-col gap-2 border-border border-t pt-2">
											<p className="font-semibold text-[11px] text-muted-foreground uppercase">
												Bahan Baku
											</p>
											{calc.ingredients.map((ing, i) => {
												const totalBase =
													ing.purchaseQuantity * ing.conversionFactor;
												const costBase =
													totalBase > 0 ? ing.purchasePrice / totalBase : 0;
												const cost = costBase * ing.usagePerServing;

												// Check price change
												let priceChanged = false;
												let latestPrice = 0;
												if (
													ing.inventoryId &&
													inventoryCosts?.[ing.inventoryId]
												) {
													latestPrice =
														(inventoryCosts[ing.inventoryId]
															?.latestCostPerUnit ?? 0) * ing.conversionFactor;
													priceChanged =
														ing.purchasePrice > 0 &&
														Math.abs(latestPrice - ing.purchasePrice) /
															ing.purchasePrice >
															0.01;
												}

												return (
													<div
														className="flex flex-col gap-0.5"
														key={`${calc._id}-ing-${i}`}
													>
														<div className="flex items-center justify-between text-[11px]">
															<span className="flex items-center gap-1">
																{ing.ingredientName}
																<span className="text-muted-foreground">
																	({ing.usagePerServing} {ing.usageUnit})
																</span>
																{ing.inventoryId && (
																	<Link2 className="h-2.5 w-2.5 text-green-500" />
																)}
															</span>
															<span>{formatCurrency(cost)}</span>
														</div>
														{priceChanged && (
															<div className="flex items-center gap-1 text-[10px] text-amber-600">
																<AlertTriangle className="h-2.5 w-2.5" />
																Harga terbaru: {formatCurrency(latestPrice)}/
																{ing.purchaseUnit}
															</div>
														)}
													</div>
												);
											})}
											{calc.overheadCosts.length > 0 && (
												<>
													<p className="mt-1 font-semibold text-[11px] text-muted-foreground uppercase">
														Overhead
													</p>
													{calc.overheadCosts.map((oh, i) => (
														<div
															className="flex items-center justify-between text-[11px]"
															key={`${calc._id}-oh-${i}`}
														>
															<span>{oh.name}</span>
															<span>{formatCurrency(oh.costPerServing)}</span>
														</div>
													))}
												</>
											)}
											{calc.description && (
												<p className="mt-1 text-[11px] text-muted-foreground italic">
													{calc.description}
												</p>
											)}
										</div>
									</motion.div>
								)}
							</AnimatePresence>

							{/* Actions */}
							<div className="flex gap-1.5 border-border border-t pt-2">
								<Button
									className="flex-1"
									onClick={() => onEdit(calc)}
									size="sm"
									variant="outline"
								>
									<Edit className="h-3 w-3" />
									Edit
								</Button>
								{hasLinkedIngredients && (
									<Button
										onClick={() => onSync(calc._id)}
										size="sm"
										title="Sync harga inventaris"
										variant="outline"
									>
										<RefreshCw
											className={`h-3 w-3 ${syncingId === calc._id ? "animate-spin" : ""}`}
										/>
									</Button>
								)}
								<Button
									onClick={() => onDuplicate(calc)}
									size="sm"
									title="Duplikasi"
									variant="outline"
								>
									<Copy className="h-3 w-3" />
								</Button>
								<Button
									onClick={() => onDelete(calc._id)}
									size="sm"
									title="Hapus"
									variant="destructive"
								>
									<Trash2 className="h-3 w-3" />
								</Button>
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
