import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import type { Doc, Id } from "@/types/backend-compat";
import { motion } from "framer-motion";
import { getSmallestUnitLabel } from "@/lib/inventory-units";
import {
	AlertTriangle,
	ArrowRight,
	BarChart3,
	Calculator,
	CheckCircle2,
	ChevronRight,
	CircleDollarSign,
	Database,
	FilePenLine,
	Package,
	Plus,
	RefreshCw,
	Search,
	Sparkles,
	Target,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, SetStateAction } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	useHybridAllProducts,
	useHybridInventory,
	useHybridLatestInventoryCosts,
} from "@/hooks/use-hybrid-pos-data";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import {
	useHybridHppPortfolio,
	useHybridHppPriceSimulation,
	useHybridHppWithMarginAnalysis,
} from "@/hooks/use-hybrid-finance-analytics-data";
import {
	useHybridApplyHppSellingPriceToProduct,
	useHybridCreateHppCalculation,
	useHybridDeleteHppCalculation,
	useHybridFillHppInventoryCostsFromTransactions,
	useHybridSyncHppWithInventoryPrices,
	useHybridUpdateHppCalculation,
	useHybridUpsertHppFromRecipe,
} from "@/hooks/use-hybrid-write-actions";

export const Route = createLazyFileRoute("/admin/hpp-calculator")({
	component: HppCalculatorPage,
});

type IngredientRow = {
	id: string;
	inventoryId?: Id<"inventory">;
	ingredientName: string;
	purchasePrice: number;
	purchaseQuantity: number;
	purchaseUnit: string;
	usagePerServing: number;
	usageUnit: string;
	conversionFactor: number;
};

type OverheadRow = {
	id: string;
	name: string;
	costPerServing: number;
};

type HppSourceType = "manual" | "recipe_based";
type PortfolioStatus =
	| "linked"
	| "outdated"
	| "missing_recipe"
	| "missing_cost";

type HppFormData = {
	name: string;
	description: string;
	ingredients: IngredientRow[];
	overheadCosts: OverheadRow[];
	servingsPerBatch: number;
	sellingPrice: number;
	productId?: Id<"products">;
	sourceType: HppSourceType;
};

type HppMetrics = {
	ingredientCostPerServing: number;
	overheadCostPerServing: number;
	totalHppPerServing: number;
	totalHppPerBatch: number;
	profitPerServing: number;
	marginPercent: number;
	markupPercent: number;
	breakEvenServings: number;
};

type PortfolioRecipeItem = {
	inventoryId: Id<"inventory">;
	ingredientName: string;
	amount: number;
	unit: string;
	displayUnit?: string;
	conversionFactor: number;
	latestCostPerUnit?: number;
	currentStock?: number;
};

type PortfolioRow = {
	product: Doc<"products">;
	recipe: Doc<"recipes"> | null;
	recipeItems: PortfolioRecipeItem[];
	calculation: Doc<"hppCalculations"> | null;
	metrics: HppMetrics | null;
	status: PortfolioStatus;
	reason: string;
	linkedIngredientCount: number;
	ingredientCount: number;
	missingInventoryLinks: number;
	missingCostCount: number;
	outdatedIngredientCount: number;
	recommendedSellingPrice: number | null;
};

type PortfolioSummary = {
	totalProducts: number;
	linkedProducts: number;
	outdatedProducts: number;
	missingRecipeProducts: number;
	missingCostProducts: number;
	draftCount: number;
	averageMargin: number;
	lowMarginCount: number;
};

type AiCostSuggestion = {
	inventoryId: Id<"inventory">;
	costPerUnit: number;
	sourceTransactionId?: Id<"financialTransactions">;
	sourceLabel?: string;
	confidence?: number;
	reason?: string;
};

type RecipeSyncResult = {
	id: Id<"hppCalculations">;
	created: boolean;
	ingredientCount: number;
	missingCostCount: number;
	calculation?: Doc<"hppCalculations">;
};

type PortfolioData = {
	summary: PortfolioSummary;
	alerts: {
		productId: Id<"products">;
		productName: string;
		status: PortfolioStatus;
		reason: string;
	}[];
	portfolio: PortfolioRow[];
	drafts: {
		calculation: Doc<"hppCalculations">;
		metrics: HppMetrics;
		status: "draft";
	}[];
};

type MarginAnalysisRow = {
	id: Id<"hppCalculations">;
	name: string;
	productId?: Id<"products">;
	hppPerServing: number;
	currentSellingPrice: number;
	currentMarginPercent: number;
	currentProfitPerServing: number;
	targetMarginPercent: number;
	recommendedSellingPrice: number;
	priceDiff: number;
	isLowMargin: boolean;
	status: "ok" | "warning" | "critical";
};

type SimulationResult = {
	hppId: Id<"hppCalculations">;
	name: string;
	priceChangePercent: number;
	ingredientIndex?: number;
	original: {
		hppPerServing: number;
		sellingPrice: number;
		profitPerServing: number;
		marginPercent: number;
	};
	simulated: {
		hppPerServing: number;
		sellingPrice: number;
		profitPerServing: number;
		marginPercent: number;
	};
	delta: {
		hppDelta: number;
		profitDelta: number;
		marginDelta: number;
	};
	recommendedSellingPrice: number;
} | null | undefined;

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

function getCostPerBaseUnit(ingredient: IngredientRow) {
	const totalBaseUnits =
		ingredient.purchaseQuantity * ingredient.conversionFactor;
	if (totalBaseUnits <= 0) {
		return 0;
	}
	return ingredient.purchasePrice / totalBaseUnits;
}

function getIngredientCostPerServing(ingredient: IngredientRow) {
	return getCostPerBaseUnit(ingredient) * ingredient.usagePerServing;
}

function computeHpp(form: HppFormData): HppMetrics {
	const ingredientCostPerServing = form.ingredients.reduce(
		(sum, ingredient) => sum + getIngredientCostPerServing(ingredient),
		0
	);
	const overheadCostPerServing = form.overheadCosts.reduce(
		(sum, overhead) => sum + overhead.costPerServing,
		0
	);
	const totalHppPerServing =
		ingredientCostPerServing + overheadCostPerServing;
	const totalHppPerBatch = totalHppPerServing * form.servingsPerBatch;
	const profitPerServing = form.sellingPrice - totalHppPerServing;
	const marginPercent =
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
		marginPercent,
		markupPercent,
		breakEvenServings,
	};
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
	return {
		id: generateId(),
		name: "",
		costPerServing: 0,
	};
}

function createInitialForm(): HppFormData {
	return {
		name: "",
		description: "",
		ingredients: [createEmptyIngredient()],
		overheadCosts: [createEmptyOverhead()],
		servingsPerBatch: 1,
		sellingPrice: 0,
		sourceType: "manual",
	};
}

function toFormFromCalculation(calc: Doc<"hppCalculations">): HppFormData {
	return {
		name: calc.name,
			description: calc.description ?? "",
			ingredients: calc.ingredients.map((ingredient: any) => ({
				...ingredient,
				id: generateId(),
			})),
			overheadCosts:
				calc.overheadCosts.length > 0
					? calc.overheadCosts.map((overhead: any) => ({
							...overhead,
							id: generateId(),
						}))
				: [createEmptyOverhead()],
		servingsPerBatch: calc.servingsPerBatch,
		sellingPrice: calc.sellingPrice,
		productId: calc.productId,
		sourceType: calc.sourceType ?? "manual",
	};
}

function toFormFromPortfolioRow(row: PortfolioRow): HppFormData {
	if (row.calculation) {
		return toFormFromCalculation(row.calculation);
	}

	const ingredients =
		row.recipeItems.length > 0
			? row.recipeItems.map((item) => ({
					id: generateId(),
					inventoryId: item.inventoryId,
					ingredientName: item.ingredientName,
					purchasePrice:
						(item.latestCostPerUnit ?? 0) * (item.conversionFactor ?? 1),
					purchaseQuantity: 1,
					purchaseUnit: item.displayUnit ?? item.unit,
					usagePerServing: item.amount,
					usageUnit: item.unit,
					conversionFactor: item.conversionFactor ?? 1,
				}))
			: [createEmptyIngredient()];

	return {
		name: `HPP ${row.product.name}`,
		description: row.recipe
			? `Costing produk ${row.product.name} dari recipe aktif`
			: `Draft costing manual untuk ${row.product.name}`,
		ingredients,
		overheadCosts: [createEmptyOverhead()],
		servingsPerBatch: 1,
		sellingPrice: row.product.promoPrice ?? row.product.price,
		productId: row.product._id,
		sourceType: row.recipe ? "recipe_based" : "manual",
	};
}

function toRecipeSyncForm(row: PortfolioRow): HppFormData {
	const overheadCosts = row.calculation
		? row.calculation.overheadCosts.map((overhead: any) => ({
				...overhead,
				id: generateId(),
			}))
		: [createEmptyOverhead()];

	return {
		name: row.calculation?.name ?? `HPP ${row.product.name}`,
		description: `Sinkron dari recipe ${row.product.name}`,
		ingredients:
			row.recipeItems.length > 0
				? row.recipeItems.map((item) => ({
						id: generateId(),
						inventoryId: item.inventoryId,
						ingredientName: item.ingredientName,
						purchasePrice:
							(item.latestCostPerUnit ?? 0) * (item.conversionFactor ?? 1),
						purchaseQuantity: 1,
						purchaseUnit: item.displayUnit ?? item.unit,
						usagePerServing: item.amount,
						usageUnit: item.unit,
						conversionFactor: item.conversionFactor ?? 1,
					}))
				: [createEmptyIngredient()],
		overheadCosts,
		servingsPerBatch: row.calculation?.servingsPerBatch ?? 1,
		sellingPrice: row.product.promoPrice ?? row.product.price,
		productId: row.product._id,
		sourceType: "recipe_based",
	};
}

function statusTone(status: PortfolioStatus | "draft") {
	switch (status) {
		case "linked":
			return "bg-emerald-100 text-emerald-700";
		case "outdated":
			return "bg-amber-100 text-amber-700";
		case "missing_recipe":
			return "bg-rose-100 text-rose-700";
		case "missing_cost":
			return "bg-orange-100 text-orange-700";
		case "draft":
		default:
			return "bg-slate-200 text-slate-700";
	}
}

function statusLabel(status: PortfolioStatus | "draft") {
	switch (status) {
		case "linked":
			return "Linked";
		case "outdated":
			return "Outdated";
		case "missing_recipe":
			return "Missing Recipe";
		case "missing_cost":
			return "Missing Cost";
		case "draft":
		default:
			return "Draft";
	}
}

function HppCalculatorPage() {
	const navigate = useNavigate();
	const workspace = useHybridHppPortfolio() as PortfolioData | undefined;
	const products = useHybridAllProducts();
	const inventory = useHybridInventory();
	const inventoryCosts = useHybridLatestInventoryCosts();
	const createHpp = useHybridCreateHppCalculation();
	const updateHpp = useHybridUpdateHppCalculation();
	const deleteHpp = useHybridDeleteHppCalculation();
	const syncPrices = useHybridSyncHppWithInventoryPrices();
	const syncFromRecipe = useHybridUpsertHppFromRecipe();
	const applySellingPrice = useHybridApplyHppSellingPriceToProduct();
	const fillFromTransactions = useHybridFillHppInventoryCostsFromTransactions();

	const [activeView, setActiveView] = useState<"portfolio" | "editor" | "impact">(
		"portfolio"
	);
	const [selectedProductId, setSelectedProductId] = useState<Id<"products"> | null>(
		null
	);
	const [selectedDraftId, setSelectedDraftId] = useState<
		Id<"hppCalculations"> | null
	>(null);
	const [editingId, setEditingId] = useState<Id<"hppCalculations"> | null>(null);
	const [form, setForm] = useState<HppFormData>(createInitialForm());
	const [deleteTarget, setDeleteTarget] = useState<Id<"hppCalculations"> | null>(
		null
	);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<
		"all" | PortfolioStatus
	>("all");
	const [saving, setSaving] = useState(false);
	const [syncingId, setSyncingId] = useState<Id<"hppCalculations"> | null>(null);
	const [aiFillingId, setAiFillingId] = useState<Id<"hppCalculations"> | null>(null);
	const [recipeSyncProductId, setRecipeSyncProductId] =
		useState<Id<"products"> | null>(null);
	const [targetMargin, setTargetMargin] = useState(30);
	const [simulateId, setSimulateId] = useState<Id<"hppCalculations"> | null>(null);
	const [simChangePercent, setSimChangePercent] = useState(10);
	const [simIngredientIdx, setSimIngredientIdx] = useState<number | undefined>(
		undefined
	);
	const marginAnalysis = useHybridHppWithMarginAnalysis(
		targetMargin
	) as MarginAnalysisRow[] | undefined;

	const portfolioRows = workspace?.portfolio ?? [];
	const drafts = workspace?.drafts ?? [];
	const currentMetrics = useMemo(() => computeHpp(form), [form]);

	const selectedProductRow = selectedProductId
		? portfolioRows.find((row) => row.product._id === selectedProductId) ?? null
		: null;
	const selectedDraft =
		selectedDraftId != null
			? drafts.find((draft) => draft.calculation._id === selectedDraftId) ?? null
			: null;

	const filteredPortfolio = useMemo(() => {
		const searchLower = safeLower(search);
		return portfolioRows.filter((row) => {
			const matchesSearch =
				safeLower(row.product?.name).includes(searchLower) ||
				safeLower(row.calculation?.name).includes(searchLower);
			const matchesStatus =
				statusFilter === "all" ? true : row.status === statusFilter;
			return matchesSearch && matchesStatus;
		});
	}, [portfolioRows, search, statusFilter]);

	const impactRows = useMemo(() => {
		return (marginAnalysis ?? [])
			.filter((item) => item.productId != null)
			.sort((left, right) => left.currentMarginPercent - right.currentMarginPercent);
	}, [marginAnalysis]);

	const productSearchOptions = useMemo(() => {
		const merged = new Map<
			Id<"products">,
			{ id: Id<"products">; name: string; hasPortfolio: boolean }
		>();
		for (const row of portfolioRows) {
			merged.set(row.product._id, {
				id: row.product._id,
				name: row.product.name,
				hasPortfolio: true,
			});
		}
		for (const product of products ?? []) {
			if (!merged.has(product._id)) {
				merged.set(product._id, {
					id: product._id,
					name: product.name,
					hasPortfolio: false,
				});
			}
		}
		return [...merged.values()].sort((left, right) =>
			left.name.localeCompare(right.name, "id-ID")
		);
	}, [portfolioRows, products]);

	const simulation = useHybridHppPriceSimulation(
		simulateId
			? {
					id: simulateId,
					priceChangePercent: simChangePercent,
					ingredientIndex: simIngredientIdx,
				}
			: "skip"
	);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const isTypingElement =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target?.isContentEditable;

			if (
				event.key === "/" &&
				activeView === "portfolio" &&
				!isTypingElement &&
				!event.ctrlKey &&
				!event.metaKey
			) {
				event.preventDefault();
				const searchInput = document.querySelector<HTMLInputElement>(
					'[data-hpp-search="true"]'
				);
				searchInput?.focus();
				return;
			}

			if (
				safeLower(event.key) === "s" &&
				(event.ctrlKey || event.metaKey) &&
				activeView === "editor"
			) {
				event.preventDefault();
				void handleSave();
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activeView, form, editingId]);

	function openProductEditor(row: PortfolioRow) {
		setSelectedProductId(row.product._id);
		setSelectedDraftId(null);
		setEditingId(row.calculation?._id ?? null);
		setForm(toFormFromPortfolioRow(row));
		setActiveView("editor");
	}

	function openDraftEditor(draft: PortfolioData["drafts"][number]) {
		setSelectedDraftId(draft.calculation._id);
		setSelectedProductId(null);
		setEditingId(draft.calculation._id);
		setForm(toFormFromCalculation(draft.calculation));
		setActiveView("editor");
	}

	function openNewDraft() {
		setSelectedDraftId(null);
		setSelectedProductId(null);
		setEditingId(null);
		setForm(createInitialForm());
		setActiveView("editor");
	}

	function selectProductForEditor(productId: Id<"products">) {
		const portfolioRow =
			portfolioRows.find((row) => row.product._id === productId) ?? null;
		if (portfolioRow) {
			setSelectedProductId(productId);
			setSelectedDraftId(null);
			setEditingId(portfolioRow.calculation?._id ?? null);
			setForm(toFormFromPortfolioRow(portfolioRow));
			return;
		}

		const product = products?.find((item: any) => item._id === productId);
		if (!product) {
			return;
		}

		setSelectedProductId(productId);
		setSelectedDraftId(null);
		setEditingId(null);
		setForm((prev) => ({
			...prev,
			name: prev.name.trim().length > 0 ? prev.name : `HPP ${product.name}`,
			description:
				prev.description.trim().length > 0
					? prev.description
					: `Draft costing manual untuk ${product.name}`,
			sellingPrice: product.promoPrice ?? product.price,
			productId: product._id,
			sourceType: "manual",
		}));
	}

	function resetEditor() {
		if (selectedProductRow) {
			setForm(toFormFromPortfolioRow(selectedProductRow));
			setEditingId(selectedProductRow.calculation?._id ?? null);
			return;
		}

		if (selectedDraft) {
			setForm(toFormFromCalculation(selectedDraft.calculation));
			setEditingId(selectedDraft.calculation._id);
			return;
		}

		setForm(createInitialForm());
		setEditingId(null);
	}

	async function handleSave() {
		const ingredients = form.ingredients.filter(
			(ingredient) => ingredient.ingredientName.trim().length > 0
		);
		const overheadCosts = form.overheadCosts.filter(
			(overhead) => overhead.name.trim().length > 0 || overhead.costPerServing > 0
		);

		if (!form.name.trim()) {
			toast.error("Nama costing harus diisi");
			return;
		}

		if (ingredients.length === 0) {
			toast.error("Tambahkan minimal satu bahan baku");
			return;
		}

		setSaving(true);
		try {
			if (editingId) {
				await updateHpp({
					id: editingId,
					name: form.name,
					description: form.description || undefined,
					ingredients: ingredients.map(({ id, ...rest }) => rest),
					overheadCosts: overheadCosts.map(({ id, ...rest }) => rest),
					servingsPerBatch: form.servingsPerBatch,
					sellingPrice: form.sellingPrice,
					productId: form.productId,
					sourceType: form.sourceType,
				});
				toast.success("Workspace costing berhasil diperbarui"); triggerHybridRefresh();
			} else {
				const createdId = await createHpp({
					name: form.name,
					description: form.description || undefined,
					ingredients: ingredients.map(({ id, ...rest }) => rest),
					overheadCosts: overheadCosts.map(({ id, ...rest }) => rest),
					servingsPerBatch: form.servingsPerBatch,
					sellingPrice: form.sellingPrice,
					productId: form.productId,
					sourceType: form.sourceType,
				});
				setEditingId(createdId);
				toast.success("Workspace costing berhasil dibuat"); triggerHybridRefresh();
			}
		} catch {
			toast.error("Gagal menyimpan workspace costing");
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		if (!deleteTarget) {
			return;
		}

		try {
			await deleteHpp({ id: deleteTarget });
			if (editingId === deleteTarget) {
				openNewDraft();
			}
			toast.success("Kalkulasi HPP berhasil dihapus"); triggerHybridRefresh();
		} catch {
			toast.error("Gagal menghapus kalkulasi HPP");
		}
	}

	async function handleSyncPrices(id: Id<"hppCalculations">) {
		setSyncingId(id);
		try {
			const result = await syncPrices({ id });
			if (result.updatedCount > 0) {
				toast.success(`${result.updatedCount} harga bahan berhasil diperbarui`); triggerHybridRefresh();
			} else {
				toast.info("Harga bahan sudah sinkron");
			}
		} catch {
			toast.error("Gagal sinkron harga bahan");
		} finally {
			setSyncingId(null);
		}
	}

	async function handleSyncRecipe(row: PortfolioRow) {
		setRecipeSyncProductId(row.product._id);
		try {
			const result = (await syncFromRecipe({
				productId: row.product._id,
			})) as RecipeSyncResult;
			setEditingId(result.id);
			setSelectedProductId(row.product._id);
			setSelectedDraftId(null);
			if (result.calculation) {
				setForm(toFormFromCalculation(result.calculation));
			} else {
				setForm(toRecipeSyncForm(row));
			}
			setActiveView("editor");
			toast.success(
				result.created
					? "Costing produk dibuat dari recipe"
					: "Costing produk berhasil disinkronkan dari recipe"
			);
		} catch {
			toast.error("Recipe belum siap untuk disinkronkan");
		} finally {
			setRecipeSyncProductId(null);
		}
	}

	async function handleApplyRecommendedPrice(
		hppId: Id<"hppCalculations">,
		price: number
	) {
		try {
			const result = await applySellingPrice({
				id: hppId,
				sellingPrice: price,
				syncProductPrice: true,
			});
			toast.success(
				result.productUpdated
					? "Harga jual di HPP dan produk berhasil diperbarui"
					: "Harga jual HPP berhasil diperbarui"
			);
		} catch {
			toast.error("Gagal menerapkan rekomendasi harga");
		}
	}

	async function handleAiFillFromTransactions(id: Id<"hppCalculations">) {
		setAiFillingId(id);
		try {
			const result = await fillFromTransactions({
				hppCalculationId: id,
				maxTransactions: 48,
			});

			const suggestions = (result.suggestions ?? []) as AiCostSuggestion[];
			if (suggestions.length === 0) {
				toast.info("AI belum menemukan referensi biaya yang cukup jelas");
				return;
			}

			setForm((prev) => ({
				...prev,
				ingredients: prev.ingredients.map((ingredient) => {
					if (!ingredient.inventoryId) {
						return ingredient;
					}
					const match = suggestions.find(
						(suggestion) => suggestion.inventoryId === ingredient.inventoryId
					);
					if (!match) {
						return ingredient;
					}
					return {
						...ingredient,
						purchasePrice: match.costPerUnit * ingredient.conversionFactor,
					};
				}),
			}));

			toast.success(
				`${result.updatedIngredients} bahan diperbarui dari ${result.appliedCount} referensi biaya transaksi`
			);
		} catch {
			toast.error("AI gagal menarik referensi biaya dari transaksi");
		} finally {
			setAiFillingId(null);
		}
	}

	function updateIngredient(
		id: string,
		field: keyof IngredientRow,
		value: string | number | Id<"inventory"> | undefined
	) {
		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.map((ingredient) =>
				ingredient.id === id ? { ...ingredient, [field]: value } : ingredient
			),
		}));
	}

	function linkIngredientToInventory(ingredientId: string, inventoryItemId: string) {
		const inventoryItem = inventory?.find(
			(item: Doc<"inventory">) => item._id === inventoryItemId
		);
		if (!inventoryItem) {
			return;
		}

		const latestCost = inventoryCosts?.[inventoryItemId]?.latestCostPerUnit ?? 0;
		const conversionFactor = inventoryItem.conversionFactor ?? 1;
		const fallbackInventoryCost =
			typeof inventoryItem.lastPurchasePrice === "number" &&
			inventoryItem.lastPurchasePrice > 0
				? inventoryItem.lastPurchasePrice
				: undefined;

		setForm((prev) => ({
			...prev,
			ingredients: prev.ingredients.map((ingredient) =>
				ingredient.id === ingredientId
					? {
							...ingredient,
							inventoryId: inventoryItem._id,
							ingredientName: inventoryItem.ingredientName,
							purchasePrice:
								latestCost > 0
									? latestCost * conversionFactor
									: fallbackInventoryCost != null
										? fallbackInventoryCost * conversionFactor
										: ingredient.purchasePrice,
							purchaseQuantity:
								ingredient.purchaseQuantity > 0 ? ingredient.purchaseQuantity : 1,
							purchaseUnit: inventoryItem.displayUnit ?? inventoryItem.unit,
							usageUnit: inventoryItem.unit,
							conversionFactor,
							usagePerServing:
								ingredient.usagePerServing > 0 ? ingredient.usagePerServing : 1,
						}
					: ingredient
			),
		}));
	}

	function updateOverhead(
		id: string,
		field: keyof OverheadRow,
		value: string | number
	) {
		setForm((prev) => ({
			...prev,
			overheadCosts: prev.overheadCosts.map((overhead) =>
				overhead.id === id ? { ...overhead, [field]: value } : overhead
			),
		}));
	}

	return (
		<div className="flex flex-col gap-4 overflow-x-hidden">
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(20,184,166,0.12),transparent_30%),linear-gradient(135deg,#fff7ed,#f8fafc_55%,#f0fdfa)] p-4 shadow-sm"
				initial={{ opacity: 0, y: 12 }}
			>
				<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
					<div className="max-w-3xl">
						<p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-orange-600">
							Product Costing Workspace
						</p>
						<h2 className="text-xl font-black tracking-tight text-slate-900 md:text-2xl">
							HPP Workspace yang ringkas dan fokus keputusan.
						</h2>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
							Cari produk lebih cepat, edit costing lebih padat, dan cek dampak
							margin tanpa perlu scroll panjang.
						</p>
					</div>

					<div className="flex flex-wrap gap-2">
						<Button onClick={openNewDraft} variant="outline">
							<Plus className="h-4 w-4" />
							Draft Manual
						</Button>
						<Button
							onClick={() => navigate({ to: "/admin/products" })}
							variant="outline"
						>
							<FilePenLine className="h-4 w-4" />
							Buka Produk
						</Button>
						<Button
							onClick={() => navigate({ to: "/admin/inventory" })}
							variant="outline"
						>
							<Database className="h-4 w-4" />
							Buka Inventory
						</Button>
					</div>
				</div>
			</motion.div>

			<div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
				<SummaryCard label="Total Produk" value={workspace?.summary.totalProducts} />
				<SummaryCard
					label="Linked"
					tone="emerald"
					value={workspace?.summary.linkedProducts}
				/>
				<SummaryCard
					label="Outdated"
					tone="amber"
					value={workspace?.summary.outdatedProducts}
				/>
				<SummaryCard
					label="Missing Recipe"
					tone="rose"
					value={workspace?.summary.missingRecipeProducts}
				/>
				<SummaryCard
					label="Missing Cost"
					tone="orange"
					value={workspace?.summary.missingCostProducts}
				/>
				<SummaryCard
					label="Avg Margin"
					tone="teal"
					value={
						workspace ? `${workspace.summary.averageMargin.toFixed(1)}%` : undefined
					}
				/>
			</div>

			<div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white/80 p-1.5 shadow-sm">
				<TabButton
					active={activeView === "portfolio"}
					icon={Package}
					label="Portfolio"
					onClick={() => setActiveView("portfolio")}
				/>
				<TabButton
					active={activeView === "editor"}
					icon={Calculator}
					label="Editor"
					onClick={() => setActiveView("editor")}
				/>
				<TabButton
					active={activeView === "impact"}
					icon={BarChart3}
					label="Impact"
					onClick={() => setActiveView("impact")}
				/>
			</div>

			{activeView === "portfolio" && (
				<PortfolioView
					filteredPortfolio={filteredPortfolio}
					onOpenEditor={openProductEditor}
					onOpenNewDraft={openNewDraft}
					onOpenDraft={openDraftEditor}
					onSyncPrices={handleSyncPrices}
					onSyncRecipe={handleSyncRecipe}
					recipeSyncProductId={recipeSyncProductId}
					search={search}
					setSearch={setSearch}
					statusFilter={statusFilter}
					setStatusFilter={setStatusFilter}
					syncingId={syncingId}
					workspace={workspace}
				/>
			)}

			{activeView === "editor" && (
				<EditorView
					currentMetrics={currentMetrics}
					editingId={editingId}
					form={form}
					inventory={inventory}
					inventoryCosts={inventoryCosts}
					productSearchOptions={productSearchOptions}
					onSelectProduct={selectProductForEditor}
					onApplyRecommendedPrice={handleApplyRecommendedPrice}
					onDelete={() => editingId && setDeleteTarget(editingId)}
					onOpenInventory={() => navigate({ to: "/admin/inventory" })}
					onOpenProducts={() => navigate({ to: "/admin/products" })}
					onReset={resetEditor}
					onSave={handleSave}
					onAiAutofill={() => editingId && handleAiFillFromTransactions(editingId)}
					onSyncPrices={() => editingId && handleSyncPrices(editingId)}
					onSyncRecipe={() =>
						selectedProductRow && handleSyncRecipe(selectedProductRow)
					}
					aiFilling={aiFillingId === editingId}
					recipeSyncing={recipeSyncProductId === selectedProductId}
					saving={saving}
					selectedDraft={selectedDraft}
					selectedProductRow={selectedProductRow}
					setForm={setForm}
					syncingId={syncingId}
					updateIngredient={updateIngredient}
					updateOverhead={updateOverhead}
					linkIngredientToInventory={linkIngredientToInventory}
				/>
			)}

			{activeView === "impact" && (
				<ImpactView
					impactRows={impactRows}
					onApplyRecommendedPrice={handleApplyRecommendedPrice}
					onOpenEditor={(hppId) => {
						const row = portfolioRows.find(
							portfolioRow => portfolioRow.calculation?._id === hppId
						);
						if (row) {
							openProductEditor(row);
						}
					}}
					setSimChangePercent={setSimChangePercent}
					setSimIngredientIdx={setSimIngredientIdx}
					setSimulateId={setSimulateId}
					setTargetMargin={setTargetMargin}
					simChangePercent={simChangePercent}
					simIngredientIdx={simIngredientIdx}
					simulateId={simulateId}
					simulation={simulation}
					targetMargin={targetMargin}
				/>
			)}

			<ConfirmationModal
				cancelText="Batal"
				confirmText="Hapus"
				isOpen={deleteTarget != null}
				message="Kalkulasi yang dihapus akan hilang dari workspace dan tidak lagi dipakai sebagai referensi costing produk."
				onClose={() => setDeleteTarget(null)}
				onConfirm={handleDelete}
				title="Hapus Kalkulasi HPP?"
				variant="danger"
			/>
		</div>
	);
}

function SummaryCard({
	label,
	value,
	tone = "slate",
}: {
	label: string;
	value: number | string | undefined;
	tone?: "slate" | "emerald" | "amber" | "rose" | "orange" | "teal";
}) {
	const toneClasses: Record<typeof tone, string> = {
		slate: "border-slate-200 bg-white text-slate-900",
		emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
		amber: "border-amber-200 bg-amber-50 text-amber-700",
		rose: "border-rose-200 bg-rose-50 text-rose-700",
		orange: "border-orange-200 bg-orange-50 text-orange-700",
		teal: "border-teal-200 bg-teal-50 text-teal-700",
	};

	return (
		<Card className={toneClasses[tone]}>
			<CardContent className="p-3">
				<p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
					{label}
				</p>
				<p className="mt-1.5 text-xl font-black tracking-tight">
					{value ?? <Skeleton className="h-8 w-16" />}
				</p>
			</CardContent>
		</Card>
	);
}

function TabButton({
	active,
	icon: Icon,
	label,
	onClick,
}: {
	active: boolean;
	icon: typeof Package;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
				active
					? "bg-slate-900 text-white shadow-sm"
					: "text-slate-600 hover:bg-slate-100"
			}`}
			onClick={onClick}
			type="button"
		>
			<Icon className="h-4 w-4" />
			{label}
		</button>
	);
}

function StatusPill({ status }: { status: PortfolioStatus | "draft" }) {
	return (
		<span
			className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone(status)}`}
		>
			{statusLabel(status)}
		</span>
	);
}

function SearchableSelect({
	onValueChange,
	options,
	placeholder,
	value,
}: {
	onValueChange: (value: string) => void;
	options: Array<{ label: string; value: string }>;
	placeholder: string;
	value: string;
}) {
	const listId = useId();
	const [inputValue, setInputValue] = useState("");

	useEffect(() => {
		const selected = options.find((option) => option.value === value);
		setInputValue(selected?.label ?? "");
	}, [value, options.length]);

	return (
		<div className="space-y-1">
			<Input
				className="h-9"
				list={listId}
				onBlur={() => {
					const matched = options.find(
						(option) =>
							safeLower(option.label) === safeLower(inputValue).trim()
					);
					if (!matched && value) {
						const selected = options.find((option) => option.value === value);
						setInputValue(selected?.label ?? "");
					}
				}}
				onChange={(event) => {
					const nextValue = event.target.value;
					setInputValue(nextValue);
					const matched = options.find(
						(option) =>
							safeLower(option.label) === safeLower(nextValue).trim()
					);
					if (matched) {
						onValueChange(matched.value);
					} else if (nextValue.trim() === "") {
						onValueChange("");
					}
				}}
				placeholder={placeholder}
				value={inputValue}
			/>
			<datalist id={listId}>
				{options.map((option) => (
					<option key={option.value || option.label} value={option.label} />
				))}
			</datalist>
		</div>
	);
}

function PortfolioView({
	filteredPortfolio,
	onOpenEditor,
	onOpenNewDraft,
	onOpenDraft,
	onSyncPrices,
	onSyncRecipe,
	recipeSyncProductId,
	search,
	setSearch,
	statusFilter,
	setStatusFilter,
	syncingId,
	workspace,
}: {
	filteredPortfolio: PortfolioRow[];
	onOpenEditor: (row: PortfolioRow) => void;
	onOpenNewDraft: () => void;
	onOpenDraft: (draft: PortfolioData["drafts"][number]) => void;
	onSyncPrices: (id: Id<"hppCalculations">) => void;
	onSyncRecipe: (row: PortfolioRow) => void;
	recipeSyncProductId: Id<"products"> | null;
	search: string;
	setSearch: (value: string) => void;
	statusFilter: "all" | PortfolioStatus;
	setStatusFilter: (value: "all" | PortfolioStatus) => void;
	syncingId: Id<"hppCalculations"> | null;
	workspace: PortfolioData | undefined;
}) {
	return (
		<div className="space-y-6">
			<Card className="border-slate-200 bg-white">
				<CardContent className="grid gap-3 p-3 lg:grid-cols-[1fr_180px_160px_auto]">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
						<Input
							className="pl-9"
							data-hpp-search="true"
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Cari produk atau nama costing..."
							value={search}
						/>
					</div>
					<select
						className="h-9 rounded-md border border-input bg-background px-3 text-sm"
						onChange={(event) =>
							setStatusFilter(event.target.value as "all" | PortfolioStatus)
						}
						value={statusFilter}
					>
						<option value="all">Semua status</option>
						<option value="linked">Linked</option>
						<option value="outdated">Outdated</option>
						<option value="missing_recipe">Missing Recipe</option>
						<option value="missing_cost">Missing Cost</option>
					</select>
					<div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
						{filteredPortfolio.length} produk tampil
					</div>
					<Button onClick={onOpenNewDraft}>
						<Plus className="h-4 w-4" />
						Buat Draft
					</Button>
				</CardContent>
			</Card>

			{workspace?.alerts && workspace.alerts.length > 0 && (
				<div className="grid gap-3 lg:grid-cols-2">
					{workspace.alerts.slice(0, 4).map((alert) => (
						<div
							className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
							key={alert.productId}
						>
							<div className="flex items-start gap-3">
								<div className="rounded-xl bg-white p-2 text-amber-600">
									<AlertTriangle className="h-4 w-4" />
								</div>
								<div className="min-w-0">
									<p className="font-semibold text-slate-900">{alert.productName}</p>
									<p className="mt-1 text-sm leading-6 text-slate-600">
										{alert.reason}
									</p>
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			<Card className="hidden border-slate-200 lg:block">
				<CardContent className="p-0">
					<table className="w-full table-fixed text-sm">
						<thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-600">
							<tr>
								<th className="px-3 py-2 text-left font-semibold">Produk</th>
								<th className="px-3 py-2 text-left font-semibold">Status</th>
								<th className="px-3 py-2 text-left font-semibold">HPP</th>
								<th className="px-3 py-2 text-left font-semibold">Margin</th>
								<th className="px-3 py-2 text-left font-semibold">Harga</th>
								<th className="px-3 py-2 text-left font-semibold">Link</th>
								<th className="px-3 py-2 text-left font-semibold">Aksi</th>
							</tr>
						</thead>
						<tbody>
							{workspace == null &&
								Array.from({ length: 4 }).map((_, index) => (
									<tr className="border-t border-slate-200" key={index}>
										<td className="px-3 py-3" colSpan={7}>
											<Skeleton className="h-5 w-full" />
										</td>
									</tr>
								))}
							{filteredPortfolio.map((row) => (
								<tr
									className="border-t border-slate-200 align-middle"
									key={row.product._id}
								>
									<td className="px-3 py-2">
										<p className="font-semibold text-slate-900">{row.product.name}</p>
										<p className="text-xs text-slate-500">{row.reason}</p>
									</td>
									<td className="px-3 py-2">
										<StatusPill status={row.status} />
									</td>
									<td className="px-3 py-2 font-semibold text-slate-900">
										{row.metrics ? formatCurrency(row.metrics.totalHppPerServing) : "-"}
									</td>
									<td className="px-3 py-2 font-semibold text-slate-900">
										{row.metrics ? `${row.metrics.marginPercent.toFixed(1)}%` : "-"}
									</td>
									<td className="px-3 py-2 font-semibold text-slate-900">
										{formatCurrency(row.product.promoPrice ?? row.product.price)}
									</td>
									<td className="px-3 py-2 text-slate-700">
										{row.linkedIngredientCount}/{row.ingredientCount}
									</td>
									<td className="px-3 py-2">
										<div className="flex flex-wrap gap-1.5">
											<Button
												className="h-8 px-2 text-xs"
												onClick={() => onOpenEditor(row)}
												variant="outline"
											>
												Edit
											</Button>
											{row.recipe && (
												<Button
													className="h-8 px-2 text-xs"
													onClick={() => onSyncRecipe(row)}
													variant="outline"
												>
													<RefreshCw
														className={`h-3.5 w-3.5 ${recipeSyncProductId === row.product._id ? "animate-spin" : ""}`}
													/>
													Sync Recipe
												</Button>
											)}
											{row.calculation && (
												<Button
													className="h-8 px-2 text-xs"
													onClick={() => onSyncPrices(row.calculation!._id)}
													variant="outline"
												>
													<Database
														className={`h-3.5 w-3.5 ${syncingId === row.calculation._id ? "animate-pulse" : ""}`}
													/>
													Sync Harga
												</Button>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</CardContent>
			</Card>

			<div className="grid gap-3 lg:hidden">
				{filteredPortfolio.map((row) => (
					<Card className="border-slate-200 shadow-sm" key={row.product._id}>
						<CardContent className="space-y-3 p-3">
							<div className="flex items-center justify-between gap-2">
								<h3 className="text-sm font-bold text-slate-900">{row.product.name}</h3>
								<StatusPill status={row.status} />
							</div>
							<div className="grid grid-cols-2 gap-2 text-xs">
								<div className="rounded-lg bg-slate-50 p-2">
									HPP:{" "}
									<span className="font-semibold">
										{row.metrics ? formatCurrency(row.metrics.totalHppPerServing) : "-"}
									</span>
								</div>
								<div className="rounded-lg bg-slate-50 p-2">
									Margin:{" "}
									<span className="font-semibold">
										{row.metrics ? `${row.metrics.marginPercent.toFixed(1)}%` : "-"}
									</span>
								</div>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button className="h-8 px-2 text-xs" onClick={() => onOpenEditor(row)}>
									Edit
								</Button>
								{row.recipe && (
									<Button
										className="h-8 px-2 text-xs"
										onClick={() => onSyncRecipe(row)}
										variant="outline"
									>
										Sync Recipe
									</Button>
								)}
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			<Card className="border-slate-200 bg-slate-950 text-white">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-white">
						<FilePenLine className="h-4 w-4 text-orange-300" />
						Draft Manual
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{workspace?.drafts.length ? (
						workspace.drafts.map((draft) => (
							<button
								className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
								key={draft.calculation._id}
								onClick={() => onOpenDraft(draft)}
								type="button"
							>
								<div>
									<div className="flex items-center gap-2">
										<p className="font-semibold">{draft.calculation.name}</p>
										<StatusPill status="draft" />
									</div>
									<p className="mt-1 text-sm text-slate-300">
										HPP {formatCurrency(draft.metrics.totalHppPerServing)} | Margin{" "}
										{draft.metrics.marginPercent.toFixed(1)}%
									</p>
								</div>
								<ChevronRight className="h-4 w-4 text-slate-400" />
							</button>
						))
					) : (
						<div className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-slate-300">
							Belum ada draft manual. Gunakan tombol "Buat Draft" untuk
							membuat sandbox costing di luar produk.
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function EditorView({
	aiFilling,
	currentMetrics,
	editingId,
	form,
	inventory,
	inventoryCosts,
	productSearchOptions,
	onAiAutofill,
	onApplyRecommendedPrice,
	onDelete,
	onOpenInventory,
	onOpenProducts,
	onReset,
	onSave,
	onSelectProduct,
	onSyncPrices,
	onSyncRecipe,
	recipeSyncing,
	saving,
	selectedDraft,
	selectedProductRow,
	setForm,
	syncingId,
	updateIngredient,
	updateOverhead,
	linkIngredientToInventory,
}: {
	aiFilling: boolean;
	currentMetrics: HppMetrics;
	editingId: Id<"hppCalculations"> | null;
	form: HppFormData;
	inventory: Doc<"inventory">[] | undefined;
	inventoryCosts:
		| Record<string, { latestCostPerUnit?: number }>
		| undefined;
	productSearchOptions: {
		id: Id<"products">;
		name: string;
		hasPortfolio: boolean;
	}[];
	onAiAutofill: () => void;
	onApplyRecommendedPrice: (hppId: Id<"hppCalculations">, price: number) => void;
	onDelete: () => void;
	onOpenInventory: () => void;
	onOpenProducts: () => void;
	onReset: () => void;
	onSave: () => void;
	onSelectProduct: (productId: Id<"products">) => void;
	onSyncPrices: () => void;
	onSyncRecipe: () => void;
	recipeSyncing: boolean;
	saving: boolean;
	selectedDraft: PortfolioData["drafts"][number] | null;
	selectedProductRow: PortfolioRow | null;
					setForm: Dispatch<SetStateAction<HppFormData>>;
	syncingId: Id<"hppCalculations"> | null;
	updateIngredient: (
		id: string,
		field: keyof IngredientRow,
		value: string | number | Id<"inventory"> | undefined
	) => void;
	updateOverhead: (
		id: string,
		field: keyof OverheadRow,
		value: string | number
	) => void;
	linkIngredientToInventory: (ingredientId: string, inventoryItemId: string) => void;
}) {
	const [quickMode, setQuickMode] = useState(false);
	const [productQuery, setProductQuery] = useState("");
	const [isEditingProductQuery, setIsEditingProductQuery] = useState(false);
	const recommendedPrice = currentMetrics.totalHppPerServing
		? Math.ceil(
				(currentMetrics.totalHppPerServing / (1 - 0.3)) / 100
			) * 100
		: 0;

	const ingredientValidation = useMemo(
		() =>
			form.ingredients.map((ingredient) => ({
				name: ingredient.ingredientName.trim().length > 0,
				price: ingredient.purchasePrice > 0,
				quantity: ingredient.purchaseQuantity > 0,
				conversion: ingredient.conversionFactor > 0,
				usage: ingredient.usagePerServing > 0,
			})),
		[form.ingredients]
	);

	const hasValidationIssue = ingredientValidation.some(
		(item) =>
			!item.name || !item.price || !item.quantity || !item.conversion || !item.usage
	);

	function getInventoryItem(inventoryId?: Id<"inventory">) {
		if (!inventoryId) {
			return undefined;
		}
		return inventory?.find((item) => item._id === inventoryId);
	}

	function getLatestInventoryUnitCost(inventoryId?: Id<"inventory">) {
		if (!inventoryId) {
			return undefined;
		}
		const fromTransactions = inventoryCosts?.[inventoryId]?.latestCostPerUnit;
		if (typeof fromTransactions === "number" && fromTransactions > 0) {
			return fromTransactions;
		}
		const inventoryItem = getInventoryItem(inventoryId);
		const fallbackInventoryPrice = inventoryItem?.lastPurchasePrice;
		if (typeof fallbackInventoryPrice === "number" && fallbackInventoryPrice > 0) {
			return fallbackInventoryPrice;
		}
		return undefined;
	}

	function getIngredientPriceInfo(ingredient: IngredientRow) {
		if (!ingredient.inventoryId) {
			return null;
		}
		const inventoryItem = getInventoryItem(ingredient.inventoryId);
		if (!inventoryItem) {
			return {
				tone: "warning" as const,
				text: "Bahan tidak ditemukan di Inventory. Cek /admin/inventory.",
			};
		}
		const latestFromTransactions =
			inventoryCosts?.[ingredient.inventoryId]?.latestCostPerUnit;
		const latestUnitCost = getLatestInventoryUnitCost(ingredient.inventoryId);
		if (latestUnitCost && latestUnitCost > 0) {
			const sourceLabel =
				typeof latestFromTransactions === "number" && latestFromTransactions > 0
					? "transaksi inventory"
					: "harga terakhir item";
			return {
				tone: "ok" as const,
				text: `Harga inventory: ${formatCurrency(latestUnitCost)} / ${getSmallestUnitLabel(inventoryItem)} (${sourceLabel})`,
			};
		}
		return {
			tone: "warning" as const,
			text: "Belum ada harga terakhir di Inventory. Isi manual atau update di /admin/inventory.",
		};
	}

	useEffect(() => {
		if (!inventory || inventory.length === 0) {
			return;
		}
		setForm((prev) => {
			let updated = false;
			const nextIngredients = prev.ingredients.map((ingredient) => {
				if (!ingredient.inventoryId || ingredient.purchasePrice > 0) {
					return ingredient;
				}
				const inventoryItem = getInventoryItem(ingredient.inventoryId);
				const latestUnitCost = getLatestInventoryUnitCost(ingredient.inventoryId);
				if (!(latestUnitCost && latestUnitCost > 0)) {
					return ingredient;
				}
				const conversionFactor =
					ingredient.conversionFactor > 0
						? ingredient.conversionFactor
						: (inventoryItem?.conversionFactor ?? 1);
				const nextPurchasePrice = latestUnitCost * conversionFactor;
				if (!(nextPurchasePrice > 0)) {
					return ingredient;
				}
				updated = true;
				return {
					...ingredient,
					purchasePrice: nextPurchasePrice,
					conversionFactor,
					purchaseUnit:
						ingredient.purchaseUnit ||
						inventoryItem?.displayUnit ||
						inventoryItem?.unit ||
						ingredient.purchaseUnit,
					usageUnit: ingredient.usageUnit || inventoryItem?.unit || ingredient.usageUnit,
				};
			});
			return updated ? { ...prev, ingredients: nextIngredients } : prev;
		});
	}, [inventory, inventoryCosts, setForm]);

	useEffect(() => {
		if (isEditingProductQuery) {
			return;
		}
		if (!form.productId) {
			if (productQuery !== "") {
				setProductQuery("");
			}
			return;
		}
		const selected = productSearchOptions.find(
			(option) => option.id === form.productId
		);
		if (selected && selected.name !== productQuery) {
			setProductQuery(selected.name);
		}
	}, [form.productId, productSearchOptions, productQuery, isEditingProductQuery]);

	function resolveProductFromInput(value: string) {
		const normalized = safeLower(value).trim();
		if (!normalized) {
			return null;
		}
		return (
			productSearchOptions.find(
				(option) => safeLower(option.name).trim() === normalized
			) ??
			productSearchOptions.find((option) =>
				safeLower(option.name).includes(normalized)
			) ??
			null
		);
	}

	function handleProductQueryInput(rawValue: string) {
		setIsEditingProductQuery(true);
		setProductQuery(rawValue);
		if (!rawValue.trim()) {
			setForm((prev) => ({
				...prev,
				productId: undefined,
				sourceType: "manual",
			}));
		}
		const matched = resolveProductFromInput(rawValue);
		if (
			matched &&
			safeLower(matched.name).trim() === safeLower(rawValue).trim()
		) {
			onSelectProduct(matched.id);
			setIsEditingProductQuery(false);
		}
	}

	function handleIngredientNameInput(ingredientId: string, rawValue: string) {
		updateIngredient(ingredientId, "ingredientName", rawValue);
		const trimmed = safeLower(rawValue).trim();
		if (!trimmed) {
			updateIngredient(ingredientId, "inventoryId", undefined);
			return;
		}
		const normalize = (value: string) => safeLower(value).trim();
			const matched =
				inventory?.find((item) => normalize(item.ingredientName) === trimmed) ??
				inventory?.find((item) =>
					(item.aliases ?? []).some((alias: any) => normalize(alias) === trimmed)
				);
		if (matched) {
			linkIngredientToInventory(ingredientId, matched._id);
			return;
		}
		// Keep text editable: if user changes to non-matching text, detach inventory link.
		updateIngredient(ingredientId, "inventoryId", undefined);
	}

	function appendIngredient() {
		setForm((prev) => {
			const last = prev.ingredients[prev.ingredients.length - 1];
			const next = createEmptyIngredient();
			if (last) {
				next.purchaseUnit = last.purchaseUnit;
				next.usageUnit = last.usageUnit;
				next.conversionFactor = last.conversionFactor;
				next.purchaseQuantity = last.purchaseQuantity || 1;
			}
			return {
				...prev,
				ingredients: [...prev.ingredients, next],
			};
		});
	}

	function focusGridCell(
		row: number,
		col: number,
		type: "ingredient" | "overhead"
	) {
		const next = document.querySelector<HTMLInputElement>(
			`[data-grid="${type}"][data-row="${row}"][data-col="${col}"]`
		);
		next?.focus();
		next?.select();
	}

	function onGridCellKeyDown(
		event: ReactKeyboardEvent<HTMLInputElement>,
		row: number,
		col: number,
		maxCol: number,
		type: "ingredient" | "overhead"
	) {
		if (event.key !== "Enter") {
			return;
		}

		event.preventDefault();
		if (event.ctrlKey && type === "ingredient") {
			appendIngredient();
			setTimeout(() => focusGridCell(row + 1, 0, "ingredient"), 0);
			return;
		}

		if (event.shiftKey) {
			focusGridCell(row, Math.max(0, col - 1), type);
			return;
		}

		focusGridCell(row, Math.min(maxCol, col + 1), type);
	}

	return (
		<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
			<div className="space-y-4">
				<div className="sticky top-2 z-10 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<Button className="h-8" disabled={saving} onClick={onSave}>
								{saving ? (
									<RefreshCw className="h-4 w-4 animate-spin" />
								) : (
									<CheckCircle2 className="h-4 w-4" />
								)}
								Simpan
							</Button>
							<Button className="h-8" onClick={onReset} variant="outline">
								Reset
							</Button>
							{editingId && (
								<Button className="h-8" onClick={onSyncPrices} variant="outline">
									<Database
										className={`h-4 w-4 ${syncingId === editingId ? "animate-pulse" : ""}`}
									/>
									Sync Harga
								</Button>
							)}
						</div>
						<div className="flex items-center gap-2">
							<Button
								className="h-8"
								onClick={() => setQuickMode((prev) => !prev)}
								variant={quickMode ? "default" : "outline"}
							>
								{quickMode ? "Mode Cepat: ON" : "Mode Cepat"}
							</Button>
							<p className="hidden text-xs text-slate-500 sm:block">
								Shortcut: <span className="font-semibold">Ctrl+S</span>,{" "}
								<span className="font-semibold">Enter</span>,{" "}
								<span className="font-semibold">Ctrl+Enter</span>
							</p>
						</div>
					</div>
				</div>

				<Card className="border-slate-200">
					<CardHeader className="border-b border-slate-200">
						<CardTitle className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-600">
									Workspace Editor
								</p>
								<h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">
									{selectedProductRow?.product.name ??
										selectedDraft?.calculation.name ??
										"Draft costing baru"}
								</h3>
							</div>
							<div className="flex flex-wrap gap-2">
								{selectedProductRow && <StatusPill status={selectedProductRow.status} />}
								{selectedDraft && <StatusPill status="draft" />}
							</div>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4 p-4">
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label>Produk Terkait (Portfolio / Produk)</Label>
								<Input
									list="hpp-product-options"
									onBlur={() => {
										const trimmed = productQuery.trim();
										if (!trimmed) {
											setIsEditingProductQuery(false);
											setForm((prev) => ({
												...prev,
												productId: undefined,
												sourceType: "manual",
											}));
											return;
										}
										const matched = resolveProductFromInput(trimmed);
										if (
											matched &&
											safeLower(matched.name).trim() === safeLower(trimmed).trim()
										) {
											onSelectProduct(matched.id);
										}
										setIsEditingProductQuery(false);
									}}
									onChange={(event) =>
										handleProductQueryInput(event.target.value)
									}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											const matched = resolveProductFromInput(productQuery);
											if (
												matched &&
												safeLower(matched.name).trim() ===
													safeLower(productQuery).trim()
											) {
												onSelectProduct(matched.id);
											}
											setIsEditingProductQuery(false);
										}
									}}
									placeholder="Ketik nama produk untuk auto isi form..."
									value={productQuery}
								/>
								<datalist id="hpp-product-options">
									{productSearchOptions.map((option) => (
										<option key={option.id} value={option.name}>
											{option.hasPortfolio ? "Portfolio" : "Produk"}
										</option>
									))}
								</datalist>
							</div>
							<div className="space-y-2">
								<Label>Nama Costing</Label>
								<Input
									onChange={(event) =>
										setForm((prev) => ({ ...prev, name: event.target.value }))
									}
									placeholder="cth. HPP Es Kopi Susu"
									value={form.name}
								/>
							</div>
							<div className="space-y-2">
								<Label>Harga Jual / Porsi</Label>
								<Input
									min={0}
									onChange={(event) =>
										setForm((prev) => ({
											...prev,
											sellingPrice: Number(event.target.value) || 0,
										}))
									}
									type="number"
									value={form.sellingPrice || ""}
								/>
							</div>
						</div>

						<div className="grid gap-4 md:grid-cols-[1fr_200px]">
							{!quickMode ? (
								<div className="space-y-2">
									<Label>Deskripsi</Label>
									<Textarea
										onChange={(event) =>
											setForm((prev) => ({
												...prev,
												description: event.target.value,
											}))
										}
										placeholder="Catatan batch, asumsi waste, atau konteks costing..."
										value={form.description}
									/>
								</div>
							) : (
								<div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
									Mode cepat aktif: deskripsi disembunyikan agar fokus input kolom.
								</div>
							)}
							<div className="space-y-2">
								<Label>Porsi per Batch</Label>
								<Input
									min={1}
									onChange={(event) =>
										setForm((prev) => ({
											...prev,
											servingsPerBatch: Number(event.target.value) || 1,
										}))
									}
									type="number"
									value={form.servingsPerBatch || ""}
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="border-slate-200">
					<CardHeader className="border-b border-slate-200">
						<CardTitle className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<Package className="h-4 w-4 text-orange-600" />
								<span>Bahan Baku</span>
								{hasValidationIssue && (
									<span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
										Ada data belum valid
									</span>
								)}
							</div>
							<Button
								onClick={appendIngredient}
								size="sm"
								variant="outline"
							>
								<Plus className="h-4 w-4" />
								Tambah
							</Button>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 p-4">
						<div className="hidden rounded-lg border border-slate-200 xl:block">
							<table className="w-full table-fixed text-xs">
								<thead className="bg-slate-50 uppercase tracking-[0.12em] text-slate-600">
									<tr>
										<th className="w-10 px-1 py-2 text-left font-semibold">#</th>
										<th className="sticky left-0 z-[2] w-40 bg-slate-50 px-1 py-2 text-left font-semibold">
											Nama Bahan
										</th>
										<th className="sticky left-40 z-[2] w-40 bg-slate-50 px-1 py-2 text-left font-semibold">
											Link Inventory
										</th>
										<th className="w-28 px-1 py-2 text-left font-semibold">Preset</th>
										<th className="w-24 px-1 py-2 text-left font-semibold">Harga</th>
										<th className="w-20 px-1 py-2 text-left font-semibold">Qty</th>
										<th className="w-20 px-1 py-2 text-left font-semibold">Sat Beli</th>
										<th className="w-20 px-1 py-2 text-left font-semibold">Konversi</th>
										<th className="w-24 px-1 py-2 text-left font-semibold">Pakai</th>
										<th className="w-20 px-1 py-2 text-left font-semibold">Sat Pakai</th>
										<th className="w-24 px-1 py-2 text-left font-semibold">Biaya</th>
										<th className="w-16 px-1 py-2 text-left font-semibold">Aksi</th>
									</tr>
								</thead>
								<tbody>
									{form.ingredients.map((ingredient, index) => {
										const validation = ingredientValidation[index];
										const priceInfo = getIngredientPriceInfo(ingredient);
										return (
											<tr className="border-t border-slate-200 align-top" key={ingredient.id}>
												<td className="px-1 py-1.5 text-slate-500">{index + 1}</td>
												<td className="sticky left-0 z-[1] bg-white px-1 py-1.5">
													<Input
														className={`h-8 ${!validation.name ? "border-rose-300 focus-visible:ring-rose-300" : ""}`}
														data-col={0}
														data-grid="ingredient"
														data-row={index}
														list={`inventory-ingredient-options-${ingredient.id}`}
														onChange={(event) =>
															handleIngredientNameInput(
																ingredient.id,
																event.target.value
															)
														}
														onKeyDown={(event) =>
															onGridCellKeyDown(event, index, 0, 7, "ingredient")
														}
														placeholder="Ketik nama bahan..."
														value={ingredient.ingredientName}
													/>
													<datalist id={`inventory-ingredient-options-${ingredient.id}`}>
														{(inventory ?? []).map((item) => (
										<option key={item._id} value={item.ingredientName}>
												{getSmallestUnitLabel(item)}
											</option>
														))}
													</datalist>
												</td>
												<td className="sticky left-40 z-[1] bg-white px-1 py-1.5">
													<SearchableSelect
														onValueChange={(value) => {
															if (!value) {
																updateIngredient(
																	ingredient.id,
																	"inventoryId",
																	undefined
																);
																return;
															}
															linkIngredientToInventory(ingredient.id, value);
														}}
														options={[
															{ label: "Manual (tanpa link)", value: "" },
															...(inventory ?? []).map((item) => ({
																label: `${item.ingredientName} (${getSmallestUnitLabel(item)})`,
																value: item._id,
															})),
														]}
														placeholder="Ketik..."
														value={ingredient.inventoryId ?? ""}
													/>
												</td>
												<td className="px-1 py-1.5">
													<SearchableSelect
														onValueChange={(value) => {
															const preset = COMMON_UNITS[Number(value)];
															if (!preset) {
																return;
															}
															updateIngredient(
																ingredient.id,
																"purchaseUnit",
																preset.purchase
															);
															updateIngredient(ingredient.id, "usageUnit", preset.usage);
															updateIngredient(
																ingredient.id,
																"conversionFactor",
																preset.factor
															);
														}}
														options={COMMON_UNITS.map((unit, indexPreset) => ({
															label: `${unit.purchase} -> ${unit.usage}`,
															value: String(indexPreset),
														}))}
														placeholder="Preset"
														value=""
													/>
												</td>
												<td className="px-1 py-1.5">
													<div className="space-y-1">
														<Input
															className={`h-8 ${!validation.price ? "border-rose-300 focus-visible:ring-rose-300" : ""}`}
															data-col={1}
															data-grid="ingredient"
															data-row={index}
															min={0}
															onChange={(event) =>
																updateIngredient(
																	ingredient.id,
																	"purchasePrice",
																	Number(event.target.value) || 0
																)
															}
															onKeyDown={(event) =>
																onGridCellKeyDown(event, index, 1, 7, "ingredient")
															}
															type="number"
															value={ingredient.purchasePrice || ""}
														/>
														{priceInfo && (
															<p
																className={`text-[10px] leading-4 ${
																	priceInfo.tone === "warning"
																		? "text-amber-700"
																		: "text-emerald-700"
																}`}
															>
																{priceInfo.text}
															</p>
														)}
													</div>
												</td>
												<td className="px-1 py-1.5">
													<Input
														className={`h-8 ${!validation.quantity ? "border-rose-300 focus-visible:ring-rose-300" : ""}`}
														data-col={2}
														data-grid="ingredient"
														data-row={index}
														min={0}
														onChange={(event) =>
															updateIngredient(
																ingredient.id,
																"purchaseQuantity",
																Number(event.target.value) || 0
															)
														}
														onKeyDown={(event) =>
															onGridCellKeyDown(event, index, 2, 7, "ingredient")
														}
														type="number"
														value={ingredient.purchaseQuantity || ""}
													/>
												</td>
												<td className="px-1 py-1.5">
													<Input
														className="h-8"
														data-col={3}
														data-grid="ingredient"
														data-row={index}
														onChange={(event) =>
															updateIngredient(
																ingredient.id,
																"purchaseUnit",
																event.target.value
															)
														}
														onKeyDown={(event) =>
															onGridCellKeyDown(event, index, 3, 7, "ingredient")
														}
														value={ingredient.purchaseUnit}
													/>
												</td>
												<td className="px-1 py-1.5">
													<Input
														className={`h-8 ${!validation.conversion ? "border-rose-300 focus-visible:ring-rose-300" : ""}`}
														data-col={4}
														data-grid="ingredient"
														data-row={index}
														min={1}
														onChange={(event) =>
															updateIngredient(
																ingredient.id,
																"conversionFactor",
																Number(event.target.value) || 1
															)
														}
														onKeyDown={(event) =>
															onGridCellKeyDown(event, index, 4, 7, "ingredient")
														}
														type="number"
														value={ingredient.conversionFactor || ""}
													/>
												</td>
												<td className="px-1 py-1.5">
													<Input
														className={`h-8 ${!validation.usage ? "border-rose-300 focus-visible:ring-rose-300" : ""}`}
														data-col={5}
														data-grid="ingredient"
														data-row={index}
														min={0}
														onChange={(event) =>
															updateIngredient(
																ingredient.id,
																"usagePerServing",
																Number(event.target.value) || 0
															)
														}
														onKeyDown={(event) =>
															onGridCellKeyDown(event, index, 5, 7, "ingredient")
														}
														type="number"
														value={ingredient.usagePerServing || ""}
													/>
												</td>
												<td className="px-1 py-1.5">
													<Input
														className="h-8"
														data-col={6}
														data-grid="ingredient"
														data-row={index}
														onChange={(event) =>
															updateIngredient(
																ingredient.id,
																"usageUnit",
																event.target.value
															)
														}
														onKeyDown={(event) =>
															onGridCellKeyDown(event, index, 6, 7, "ingredient")
														}
														value={ingredient.usageUnit}
													/>
												</td>
												<td className="px-1 py-1.5">
													<div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-800">
														{formatCurrency(getIngredientCostPerServing(ingredient))}
													</div>
												</td>
												<td className="px-1 py-1.5">
													{form.ingredients.length > 1 && (
														<Button
															className="h-8 px-2 text-xs"
															onClick={() =>
																setForm((prev) => ({
																	...prev,
																	ingredients: prev.ingredients.filter(
																		(item) => item.id !== ingredient.id
																	),
																}))
															}
															variant="outline"
														>
															Hapus
														</Button>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>

						<div className="space-y-2 xl:hidden">
							{form.ingredients.map((ingredient, index) => {
								const validation = ingredientValidation[index];
								const priceInfo = getIngredientPriceInfo(ingredient);
								return (
									<div className="rounded-lg border border-slate-200 p-2" key={ingredient.id}>
										<div className="mb-2 flex items-center justify-between">
											<p className="text-xs font-semibold text-slate-700">
												Bahan #{index + 1}
											</p>
											{form.ingredients.length > 1 && (
												<Button
													className="h-7 px-2 text-xs"
													onClick={() =>
														setForm((prev) => ({
															...prev,
															ingredients: prev.ingredients.filter(
																(item) => item.id !== ingredient.id
															),
														}))
													}
													variant="outline"
												>
													Hapus
												</Button>
											)}
										</div>
										<div className="grid grid-cols-2 gap-2">
											<Input
												className={`h-8 ${!validation.name ? "border-rose-300" : ""}`}
												onChange={(event) =>
													handleIngredientNameInput(ingredient.id, event.target.value)
												}
												list={`inventory-ingredient-options-mobile-${ingredient.id}`}
												placeholder="Nama bahan"
												value={ingredient.ingredientName}
											/>
											<datalist id={`inventory-ingredient-options-mobile-${ingredient.id}`}>
												{(inventory ?? []).map((item) => (
								<option key={`${item._id}-mobile`} value={item.ingredientName}>
									{getSmallestUnitLabel(item)}
								</option>
												))}
											</datalist>
											<Input
												className={`h-8 ${!validation.price ? "border-rose-300" : ""}`}
												min={0}
												onChange={(event) =>
													updateIngredient(
														ingredient.id,
														"purchasePrice",
														Number(event.target.value) || 0
													)
												}
												placeholder="Harga"
												type="number"
												value={ingredient.purchasePrice || ""}
											/>
											<Input
												className={`h-8 ${!validation.quantity ? "border-rose-300" : ""}`}
												min={0}
												onChange={(event) =>
													updateIngredient(
														ingredient.id,
														"purchaseQuantity",
														Number(event.target.value) || 0
													)
												}
												placeholder="Qty"
												type="number"
												value={ingredient.purchaseQuantity || ""}
											/>
											<Input
												className={`h-8 ${!validation.usage ? "border-rose-300" : ""}`}
												min={0}
												onChange={(event) =>
													updateIngredient(
														ingredient.id,
														"usagePerServing",
														Number(event.target.value) || 0
													)
												}
												placeholder="Pakai/porsi"
												type="number"
												value={ingredient.usagePerServing || ""}
											/>
											{priceInfo && (
												<p
													className={`col-span-2 text-[11px] leading-4 ${
														priceInfo.tone === "warning"
															? "text-amber-700"
															: "text-emerald-700"
													}`}
												>
													{priceInfo.text}
												</p>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</CardContent>
				</Card>

				<Card className="border-slate-200">
					<CardHeader className="border-b border-slate-200">
						<CardTitle className="flex items-center justify-between">
							<span className="flex items-center gap-2">
								<CircleDollarSign className="h-4 w-4 text-teal-600" />
								Overhead & Packaging
							</span>
							<Button
								onClick={() =>
									setForm((prev) => ({
										...prev,
										overheadCosts: [...prev.overheadCosts, createEmptyOverhead()],
									}))
								}
								size="sm"
								variant="outline"
							>
								<Plus className="h-4 w-4" />
								Tambah
							</Button>
						</CardTitle>
					</CardHeader>
					<CardContent className="p-4">
						<div className="rounded-lg border border-slate-200">
							<table className="w-full table-fixed text-sm">
								<thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-600">
									<tr>
										<th className="px-2 py-2 text-left font-semibold">#</th>
										<th className="px-2 py-2 text-left font-semibold">Nama Biaya</th>
										<th className="px-2 py-2 text-left font-semibold">Biaya / Porsi</th>
										<th className="px-2 py-2 text-left font-semibold">Aksi</th>
									</tr>
								</thead>
								<tbody>
									{form.overheadCosts.map((overhead, index) => (
										<tr
											className="border-t border-slate-200 align-middle"
											key={overhead.id}
										>
											<td className="px-2 py-2 text-slate-500">{index + 1}</td>
											<td className="px-2 py-2">
												<Input
													className="h-8"
													data-col={0}
													data-grid="overhead"
													data-row={index}
													onChange={(event) =>
														updateOverhead(overhead.id, "name", event.target.value)
													}
													onKeyDown={(event) =>
														onGridCellKeyDown(event, index, 0, 1, "overhead")
													}
													placeholder="Cup, sedotan, gas, fee packing..."
													value={overhead.name}
												/>
											</td>
											<td className="px-2 py-2">
												<Input
													className="h-8"
													data-col={1}
													data-grid="overhead"
													data-row={index}
													min={0}
													onChange={(event) =>
														updateOverhead(
															overhead.id,
															"costPerServing",
															Number(event.target.value) || 0
														)
													}
													onKeyDown={(event) =>
														onGridCellKeyDown(event, index, 1, 1, "overhead")
													}
													type="number"
													value={overhead.costPerServing || ""}
												/>
											</td>
											<td className="px-2 py-2">
												{form.overheadCosts.length > 1 && (
													<Button
														className="h-8 px-2"
														onClick={() =>
															setForm((prev) => ({
																...prev,
																overheadCosts: prev.overheadCosts.filter(
																	(item) => item.id !== overhead.id
																),
															}))
														}
														variant="outline"
													>
														Hapus
													</Button>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
				<Card className="border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white">
					<CardContent className="space-y-3 p-3">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-300">
								Cost Health
							</p>
							<div className="mt-3 flex items-center gap-2">
								{selectedProductRow ? (
									<StatusPill status={selectedProductRow.status} />
								) : selectedDraft ? (
									<StatusPill status="draft" />
								) : (
									<StatusPill status="draft" />
								)}
							</div>
							{!quickMode && (
								<p className="mt-2 text-xs leading-5 text-slate-300">
									{selectedProductRow?.reason ??
										"Draft manual ini belum terhubung ke produk tertentu."}
								</p>
							)}
						</div>

						<div className="grid grid-cols-2 gap-3">
							<MetricTile
								label="HPP / Porsi"
								value={formatCurrency(currentMetrics.totalHppPerServing)}
							/>
							<MetricTile
								label="Margin"
								value={`${currentMetrics.marginPercent.toFixed(1)}%`}
							/>
							<MetricTile
								label="Laba / Porsi"
								value={formatCurrency(currentMetrics.profitPerServing)}
							/>
							<MetricTile
								label="BEP Batch"
								value={formatNumber(currentMetrics.breakEvenServings)}
							/>
						</div>

						<div className="rounded-xl border border-white/10 bg-white/5 p-3">
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
										Rekomendasi Harga
									</p>
									<p className="mt-2 text-2xl font-black">
										{formatCurrency(recommendedPrice)}
									</p>
								</div>
								<Target className="h-5 w-5 text-orange-300" />
							</div>
							<p className="mt-1 text-xs text-slate-300">
								Dihitung untuk target margin 30%. Cocok dipakai sebagai baseline
								di halaman produk.
							</p>
						</div>

						<div className="grid gap-2">
							{editingId && (
								<Button
									className="border-cyan-400/30 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/20 hover:text-white"
									disabled={aiFilling}
									onClick={onAiAutofill}
									variant="outline"
								>
									{aiFilling ? (
										<RefreshCw className="h-4 w-4 animate-spin" />
									) : (
										<Sparkles className="h-4 w-4" />
									)}
									AI dari Transaksi
								</Button>
							)}
							{selectedProductRow?.recipe && (
								<Button
									className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
									onClick={onSyncRecipe}
									variant="outline"
								>
									<RefreshCw
										className={`h-4 w-4 ${recipeSyncing ? "animate-spin" : ""}`}
									/>
									Sync dari Recipe
								</Button>
							)}
							{editingId && (
								<Button
									className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
									onClick={onSyncPrices}
									variant="outline"
								>
									<Database
										className={`h-4 w-4 ${syncingId === editingId ? "animate-pulse" : ""}`}
									/>
									Sync Harga Bahan
								</Button>
							)}
							{editingId && recommendedPrice > 0 && (
								<Button
									className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
									onClick={() => onApplyRecommendedPrice(editingId, recommendedPrice)}
									variant="outline"
								>
									<TrendingUp className="h-4 w-4" />
									Terapkan ke Harga Produk
								</Button>
							)}
							<div className="grid grid-cols-2 gap-2">
								<Button
									className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
									onClick={onOpenProducts}
									variant="outline"
								>
									Produk
								</Button>
								<Button
									className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white"
									onClick={onOpenInventory}
									variant="outline"
								>
									Inventory
								</Button>
							</div>
							{editingId && (
								<Button onClick={onDelete} variant="destructive">
									Hapus Kalkulasi
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function MetricTile({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-2xl border border-white/10 bg-white/5 p-3">
			<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
				{label}
			</p>
			<p className="mt-2 text-lg font-black text-white">{value}</p>
		</div>
	);
}

function ImpactView({
	impactRows,
	onApplyRecommendedPrice,
	onOpenEditor,
	setSimChangePercent,
	setSimIngredientIdx,
	setSimulateId,
	setTargetMargin,
	simChangePercent,
	simIngredientIdx,
	simulateId,
	simulation,
	targetMargin,
}: {
	impactRows: MarginAnalysisRow[];
	onApplyRecommendedPrice: (hppId: Id<"hppCalculations">, price: number) => void;
	onOpenEditor: (hppId: Id<"hppCalculations">) => void;
	setSimChangePercent: (value: number) => void;
	setSimIngredientIdx: (value: number | undefined) => void;
	setSimulateId: (value: Id<"hppCalculations"> | null) => void;
	setTargetMargin: (value: number) => void;
	simChangePercent: number;
	simIngredientIdx: number | undefined;
	simulateId: Id<"hppCalculations"> | null;
	simulation: SimulationResult;
	targetMargin: number;
}) {
	const selectedImpact = simulateId
		? impactRows.find((row) => row.id === simulateId) ?? null
		: null;

	return (
		<div className="space-y-6">
			<Card className="border-slate-200">
				<CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-600">
							Margin Guardrail
						</p>
						<h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">
							Tentukan target margin dan lihat produk mana yang perlu tindakan.
						</h3>
					</div>
					<div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
						<input
							className="w-40"
							max={80}
							min={10}
							onChange={(event) => setTargetMargin(Number(event.target.value))}
							type="range"
							value={targetMargin}
						/>
						<span className="min-w-12 text-right text-lg font-black text-slate-900">
							{targetMargin}%
						</span>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-4 xl:grid-cols-2">
				{impactRows.map((row) => (
					<Card className="border-slate-200 shadow-sm" key={row.id}>
						<CardContent className="space-y-4 p-5">
							<div className="flex items-start justify-between gap-3">
								<div>
									<div className="flex items-center gap-2">
										<h4 className="font-black tracking-tight text-slate-900">
											{row.name}
										</h4>
										<span
											className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
												row.status === "ok"
													? "bg-emerald-100 text-emerald-700"
													: row.status === "warning"
														? "bg-amber-100 text-amber-700"
														: "bg-rose-100 text-rose-700"
											}`}
										>
											{row.currentMarginPercent.toFixed(1)}%
										</span>
									</div>
									<p className="mt-2 text-sm text-slate-600">
										HPP {formatCurrency(row.hppPerServing)} | Harga jual{" "}
										{formatCurrency(row.currentSellingPrice)}
									</p>
								</div>
								<Sparkles className="h-5 w-5 text-orange-500" />
							</div>

							<div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
								<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700">
									Recommended Price
								</p>
								<div className="mt-2 flex items-center justify-between">
									<p className="text-2xl font-black text-slate-900">
										{formatCurrency(row.recommendedSellingPrice)}
									</p>
									<p className="text-sm font-semibold text-slate-600">
										Delta {formatCurrency(row.priceDiff)}
									</p>
								</div>
							</div>

							<div className="flex flex-wrap gap-2">
								<Button
									onClick={() =>
										onApplyRecommendedPrice(row.id, row.recommendedSellingPrice)
									}
								>
									<TrendingUp className="h-4 w-4" />
									Terapkan Harga
								</Button>
								<Button onClick={() => onOpenEditor(row.id)} variant="outline">
									<FilePenLine className="h-4 w-4" />
									Buka Editor
								</Button>
								<Button
									onClick={() => setSimulateId(row.id)}
									variant="outline"
								>
									<TrendingDown className="h-4 w-4" />
									Simulasi
								</Button>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			<Card className="border-slate-200">
				<CardHeader className="border-b border-slate-200">
					<CardTitle className="flex items-center gap-2">
						<BarChart3 className="h-4 w-4 text-teal-600" />
						What-if Simulation
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-5 p-5">
					<SearchableSelect
						onValueChange={(value) =>
							setSimulateId((value || null) as Id<"hppCalculations"> | null)
						}
						options={[
							{ label: "Pilih produk / HPP", value: "" },
							...impactRows.map((row) => ({
								label: row.name,
								value: row.id,
							})),
						]}
						placeholder="Ketik nama produk..."
						value={simulateId ?? ""}
					/>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label>Perubahan harga bahan</Label>
							<Input
								max={100}
								min={-50}
								onChange={(event) => setSimChangePercent(Number(event.target.value))}
								type="number"
								value={simChangePercent}
							/>
						</div>
						<div className="space-y-2">
							<Label>Index bahan yang diubah</Label>
							<Input
								onChange={(event) =>
									setSimIngredientIdx(
										event.target.value === ""
											? undefined
											: Number(event.target.value)
									)
								}
								placeholder="Kosongkan untuk semua bahan"
								type="number"
								value={simIngredientIdx ?? ""}
							/>
						</div>
					</div>

					{selectedImpact && simulation ? (
						<div className="grid gap-4 md:grid-cols-2">
							<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
								<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
									Sebelum
								</p>
								<p className="mt-2 text-sm text-slate-700">
									HPP {formatCurrency(simulation.original.hppPerServing)}
								</p>
								<p className="mt-1 text-sm text-slate-700">
									Margin {simulation.original.marginPercent.toFixed(1)}%
								</p>
							</div>
							<div className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
								<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">
									Setelah
								</p>
								<p className="mt-2 text-sm text-slate-700">
									HPP {formatCurrency(simulation.simulated.hppPerServing)}
								</p>
								<p className="mt-1 text-sm text-slate-700">
									Margin {simulation.simulated.marginPercent.toFixed(1)}%
								</p>
							</div>
							<div className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
											Dampak
										</p>
										<p className="mt-2 text-sm text-slate-700">
											Profit berubah {formatCurrency(simulation.delta.profitDelta)} dan
											margin berubah {simulation.delta.marginDelta.toFixed(1)}%.
										</p>
									</div>
									<Button
										onClick={() =>
											onApplyRecommendedPrice(
												selectedImpact.id,
												simulation.recommendedSellingPrice
											)
										}
									>
										<ArrowRight className="h-4 w-4" />
										Pakai Harga Simulasi
									</Button>
								</div>
							</div>
						</div>
					) : (
						<div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
							Pilih satu HPP di atas untuk melihat dampak kenaikan atau penurunan
							harga bahan ke profit dan margin.
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}


