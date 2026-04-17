import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	AlertCircle,
	BadgeAlert,
	BarChart3,
	Boxes,
	ArrowDown,
	ArrowUp,
	Edit,
	History,
	PackageSearch,
	PanelRight,
	Minus,
	Plus,
	Search,
	Settings2,
	ShieldAlert,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

interface ConfirmConfig {
	isOpen: boolean;
	title: string;
	message: string;
	onConfirm: () => void;
	variant?: "danger" | "warning" | "info";
}

type InventoryViewPreset = "operational" | "priceMonitor" | "yumiAi";

type InventoryWorkspaceRow = {
	inventoryId: Id<"inventory">;
	ingredientName: string;
	currentStock: number;
	unit: string;
	displayUnit?: string;
	conversionFactor?: number;
	unitConversions?: Array<{
		unit: string;
		factor: number;
	}>;
	defaultBrandName: string | null;
	preferredStoreId: Id<"inventoryStores"> | null;
	preferredStoreName: string | null;
	preferredPurchaseQuantity: number | null;
	preferredPurchaseUnit: string | null;
	lastPurchaseStoreName: string | null;
	lastPurchasePrice: number | null;
	lastPurchaseBrandName?: string | null;
	lowStockThreshold: number;
	avgDailyUsage: number;
	daysUntilStockout: number | null;
	reorderPoint: number;
	suggestedOrderQty: number;
	riskLevel: "high" | "medium" | "low";
	status: "critical" | "warning" | "healthy";
	relatedProductCount: number;
	relatedRecipeCount: number;
	relatedBaseRecipeCount: number;
	activeRelatedProductCount: number;
	producedByBaseRecipeName: string | null;
	latestTransaction: {
		type: string;
		quantity: number;
		timestamp: number;
		notes?: string;
		costPerUnit?: number;
		storeId?: Id<"inventoryStores">;
		purchaseQuantity?: number;
		purchaseUnit?: string;
	} | null;
};

type InventoryWorkspaceData = {
	summary: {
		totalItems: number;
		totalStockUnits: number;
		lowStockCount: number;
		riskHighCount: number;
		riskMediumCount: number;
		recentUsageTxCount: number;
		recentRestockTxCount: number;
		daysWindow: number;
	};
	rows: InventoryWorkspaceRow[];
};

type InventoryStore = Doc<"inventoryStores">;

type InventoryPriceInsights = {
	item: {
		inventoryId: Id<"inventory">;
		ingredientName: string;
		defaultBrandName: string | null;
		preferredStoreId: Id<"inventoryStores"> | null;
		preferredStoreName: string | null;
		lastPurchasePrice: number | null;
		lastPurchaseAt: number | null;
		lastPurchaseStoreName: string | null;
	};
	priceSnapshot: {
		lastPrice: number | null;
		lastPurchaseAt: number | null;
		lowestPrice: number | null;
		averagePrice: number | null;
	};
	storeComparison: Array<{
		storeId: Id<"inventoryStores"> | null;
		storeName: string;
		storeType: InventoryStore["type"] | null;
		lastPrice: number | null;
		lowestPrice: number | null;
		lastPurchaseAt: number | null;
		purchaseCount: number;
	}>;
	brandComparison: Array<{
		brandName: string;
		lastStoreName: string | null;
		lastPrice: number | null;
		lastPurchaseAt: number | null;
		purchaseCount: number;
	}>;
	recentPurchases: Array<{
		transactionId: Id<"inventoryTransactions">;
		timestamp: number;
		quantity: number;
		costPerUnit: number | null;
		lineTotal: number | null;
		brandName: string | null;
		storeName: string;
		purchaseQuantity: number | null;
		purchaseUnit: string | null;
		notes: string | null;
	}>;
};

type RealtimePriceMonitorData = {
	rows: Array<{
		inventoryId: Id<"inventory"> | null;
		ingredientName: string;
		nameKey: string;
		unit: string;
		displayUnit: string | null;
		conversionFactor: number | null;
		lastPrice: number;
		previousPrice: number | null;
		priceDelta: number | null;
		lastPurchaseAt: number;
		lastStoreName: string | null;
		lastBrandName: string | null;
		storeCount: number;
		brandCount: number;
		totalPurchases: number;
	}>;
	summary: {
		totalUniqueNames: number;
		totalRawTransactions: number;
		totalExpenseLines: number;
		totalRestockRows: number;
	};
};

type InventoryYumiAiInsightsData = {
	stockoutPredictions: Array<{
		inventoryId: Id<"inventory">;
		ingredientName: string;
		unit: string;
		currentStock: number;
		avgDailyUsage: number;
		daysUntilStockout: number | null;
		reorderPoint: number;
		suggestedOrderQty: number;
		urgency: "high" | "medium" | "low";
	}>;
	supplierIntelligence: Array<{
		inventoryId: Id<"inventory">;
		ingredientName: string;
		lastStoreName: string | null;
		lastPrice: number;
		recommendedStoreName: string | null;
		recommendedPrice: number | null;
		potentialSavings: number;
		storeOptions: Array<{
			storeName: string;
			avgPrice: number;
			minPrice: number;
			sampleCount: number;
		}>;
	}>;
	usageAnomalies: Array<{
		inventoryId: Id<"inventory">;
		ingredientName: string;
		unit: string;
		avgDailyUsage7d: number;
		avgDailyUsage30d: number;
		anomalyType: "spike" | "drop" | null;
		reason: string;
	}>;
	summary: {
		predictionCount: number;
		supplierInsightCount: number;
		anomalyCount: number;
		refreshedAt: number;
	};
};

type InventoryAutofillSuggestion = {
	unit: string;
	lowStockThreshold: number;
	defaultBrandName: string;
	displayUnit: string;
	conversionFactor: number | null;
	unitConversionsText: string;
	category?: string;
	confidence: number;
	fieldConfidence?: {
		unit: number;
		lowStockThreshold: number;
		defaultBrandName: number;
		conversion: number;
	};
	fieldReason?: {
		unit: string;
		lowStockThreshold: string;
		defaultBrandName: string;
		conversion: string;
	};
	conflictWarning?: string | null;
	reason: string;
};

type InventoryAutofillActionResult = {
	ok: boolean;
	message: string;
	suggestion: InventoryAutofillSuggestion | null;
	fallbackPath?: string[];
	refreshedAt?: number;
	sources: Array<{ title: string; url: string; snippet: string }>;
};

const INVENTORY_UNIT_OPTIONS = [
	"gram",
	"ml",
	"pcs",
	"dus",
	"karton",
	"pack",
	"box",
	"botol",
	"sachet",
	"liter",
	"kg",
];

function normalizeUnitOption(value?: string | null) {
	return (value || "").trim().toLowerCase();
}

function collectDynamicUnitOptions({
	inventoryItems,
	workspaceRows,
}: {
	inventoryItems?: Doc<"inventory">[];
	workspaceRows?: InventoryWorkspaceRow[];
}) {
	const set = new Set<string>(INVENTORY_UNIT_OPTIONS.map((unit) => unit.toLowerCase()));

	for (const item of inventoryItems ?? []) {
		const unit = normalizeUnitOption(item.unit);
		if (unit) {
			set.add(unit);
		}
		const displayUnit = normalizeUnitOption(item.displayUnit);
		if (displayUnit) {
			set.add(displayUnit);
		}
		for (const conversion of item.unitConversions ?? []) {
			const conversionUnit = normalizeUnitOption(conversion.unit);
			if (conversionUnit) {
				set.add(conversionUnit);
			}
		}
	}

	for (const row of workspaceRows ?? []) {
		const unit = normalizeUnitOption(row.unit);
		if (unit) {
			set.add(unit);
		}
		const displayUnit = normalizeUnitOption(row.displayUnit);
		if (displayUnit) {
			set.add(displayUnit);
		}
		for (const conversion of row.unitConversions ?? []) {
			const conversionUnit = normalizeUnitOption(conversion.unit);
			if (conversionUnit) {
				set.add(conversionUnit);
			}
		}
	}

	const pinnedOrder = new Map(
		INVENTORY_UNIT_OPTIONS.map((unit, index) => [unit.toLowerCase(), index])
	);

	return [...set].sort((a, b) => {
		const aPinned = pinnedOrder.get(a);
		const bPinned = pinnedOrder.get(b);
		if (aPinned != null && bPinned != null) {
			return aPinned - bPinned;
		}
		if (aPinned != null) {
			return -1;
		}
		if (bPinned != null) {
			return 1;
		}
		return a.localeCompare(b, "id-ID");
	});
}

function normalizeLookupText(text: string) {
	return text
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^\w\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function getNameMatchScore(keyword: string, candidate: string) {
	if (!keyword || !candidate) {
		return 0;
	}
	if (keyword === candidate) {
		return 100;
	}
	if (candidate.startsWith(keyword) || keyword.startsWith(candidate)) {
		return 88;
	}
	if (candidate.includes(keyword) || keyword.includes(candidate)) {
		return 74;
	}
	const keywordTokens = keyword.split(" ").filter(Boolean);
	const candidateTokens = new Set(candidate.split(" ").filter(Boolean));
	if (keywordTokens.length === 0) {
		return 0;
	}
	let overlap = 0;
	for (const token of keywordTokens) {
		if (candidateTokens.has(token)) {
			overlap += 1;
		}
	}
	return Math.round((overlap / keywordTokens.length) * 60);
}

const AUTOFILL_CACHE_KEY = "inventory:ai-autofill-cache:v2";
const AUTOFILL_LEARN_KEY = "inventory:ai-learned-profile:v2";
const AUTOFILL_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type AutofillCacheEntry = {
	updatedAt: number;
	result: InventoryAutofillActionResult;
};

function readJsonStorage<T>(key: string): T | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) {
			return null;
		}
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function writeJsonStorage<T>(key: string, value: T) {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// ignore quota/storage errors
	}
}

function formatCurrency(value?: number | null) {
	if (value == null || Number.isNaN(value)) {
		return "-";
	}
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: value >= 100 ? 0 : 2,
	}).format(value);
}

function normalizeUnitLabel(unit?: string | null) {
	const normalized = (unit || "").trim().toLowerCase();
	if (!normalized) {
		return "";
	}
	return normalized;
}

function buildConversionHint(
	unit?: string | null,
	displayUnit?: string | null,
	conversionFactor?: number | null
) {
	const baseUnit = normalizeUnitLabel(unit);
	const showUnit = normalizeUnitLabel(displayUnit);
	const factor = conversionFactor ?? 0;

	if (!showUnit || factor <= 0) {
		return null;
	}

	if (baseUnit === "pcs") {
		return `1 pcs = ${factor} ${showUnit}`;
	}

	return `1 ${showUnit} = ${factor} ${baseUnit}`;
}

function getInventorySizeLabel({
	unit,
	displayUnit,
	conversionFactor,
	unitConversionsText,
}: {
	unit?: string | null;
	displayUnit?: string | null;
	conversionFactor?: number | string | null;
	unitConversionsText?: string | null;
}) {
	const parsedConversionFactor =
		typeof conversionFactor === "string"
			? Number(conversionFactor)
			: conversionFactor ?? undefined;
	const parsedConversions = parseUnitConversionsText(unitConversionsText || "");
	const primaryConversion = getPrimaryConversionFromChain(parsedConversions);
	const selectedDisplayUnit =
		normalizeUnitLabel(displayUnit) || primaryConversion.displayUnit;
	const selectedFactor =
		typeof parsedConversionFactor === "number" &&
		Number.isFinite(parsedConversionFactor) &&
		parsedConversionFactor > 0
			? parsedConversionFactor
			: primaryConversion.conversionFactor;

	return buildConversionHint(unit, selectedDisplayUnit, selectedFactor);
}

function parseUnitConversionsText(input: string) {
	const rows = input
		.split(/[\n,;]+/)
		.map((chunk) => chunk.trim())
		.filter(Boolean);

	const parsed: Array<{ unit: string; factor: number }> = [];
	for (const row of rows) {
		const [rawUnit, rawFactor] = row.split(/[:=]/).map((part) => part.trim());
		const factor = Number(rawFactor);
		if (!rawUnit || Number.isNaN(factor) || factor <= 0) {
			continue;
		}
		parsed.push({ unit: rawUnit.toLowerCase(), factor });
	}

	if (parsed.length === 0) {
		return undefined;
	}
	return parsed;
}

function getPrimaryConversionFromChain(
	unitConversions?: Array<{ unit: string; factor: number }>
) {
	const first = unitConversions?.[0];
	if (!first) {
		return {
			displayUnit: undefined as string | undefined,
			conversionFactor: undefined as number | undefined,
		};
	}
	return {
		displayUnit: first.unit,
		conversionFactor: first.factor,
	};
}

function formatUnitConversionsText(
	unitConversions?: Array<{ unit: string; factor: number }>,
	displayUnit?: string,
	conversionFactor?: number
) {
	const values = [...(unitConversions ?? [])];
	if (
		displayUnit &&
		typeof conversionFactor === "number" &&
		conversionFactor > 0 &&
		!values.some((row) => row.unit.toLowerCase() === displayUnit.toLowerCase())
	) {
		values.push({ unit: displayUnit, factor: conversionFactor });
	}
	return values.map((row) => `${row.unit}:${row.factor}`).join(", ");
}

function buildUnitChainSummary(
	baseUnit: string,
	unitConversions?: Array<{ unit: string; factor: number }>,
	displayUnit?: string,
	conversionFactor?: number
) {
	const text = formatUnitConversionsText(unitConversions, displayUnit, conversionFactor);
	if (!text) {
		return null;
	}
	return text
		.split(",")
		.map((row) => row.trim())
		.filter(Boolean)
		.map((row) => {
			const [unit, factor] = row.split(":").map((part) => part.trim());
			return unit && factor ? `1 ${unit} = ${factor} ${baseUnit}` : null;
		})
		.filter((row): row is string => Boolean(row))
		.join(" • ");
}

function getPurchaseUnitOptions(
	item?: Pick<Doc<"inventory">, "unit" | "displayUnit" | "unitConversions"> | null
) {
	if (!item) {
		return [];
	}
	const options = new Set<string>();
	if (item.unit) {
		options.add(item.unit);
	}
	if (item.displayUnit) {
		options.add(item.displayUnit);
	}
	for (const row of item.unitConversions ?? []) {
		if (row.unit) {
			options.add(row.unit);
		}
	}
	return [...options];
}

function hasMissingConversion(row: Pick<
	InventoryWorkspaceRow,
	"unit" | "displayUnit" | "conversionFactor" | "unitConversions"
>) {
	return (
		row.unit === "pcs" &&
		!(row.unitConversions?.length ?? 0) &&
		!(
			(row.displayUnit || "").trim() &&
			typeof row.conversionFactor === "number" &&
			row.conversionFactor > 0
		)
	);
}

function getUsageInsight(row: Pick<
	InventoryWorkspaceRow,
	"avgDailyUsage" | "currentStock" | "daysUntilStockout" | "status"
>) {
	if (row.currentStock <= 0 || row.status === "critical") {
		return {
			label: "Cepat habis",
			tone: "border-rose-200 bg-rose-50 text-rose-700",
		};
	}
	if (row.avgDailyUsage === 0) {
		return {
			label: "Stok diam",
			tone: "border-slate-200 bg-slate-50 text-slate-700",
		};
	}
	if ((row.daysUntilStockout ?? 999) <= 7) {
		return {
			label: "Perlu order",
			tone: "border-amber-200 bg-amber-50 text-amber-700",
		};
	}
	return {
		label: "Lancar",
		tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
	};
}


export const Route = createLazyFileRoute("/admin/inventory")({
	component: InventoryPage,
});

function InventoryPage() {
	const [searchQuery, setSearchQuery] = useState("");
	const inventory = useQuery(api.inventory.getInventory);
	const stores = useQuery(api.inventory.listInventoryStores) as
		| InventoryStore[]
		| undefined;
	const workspace = useQuery(api.inventory.getInventoryWorkspace, {
		daysWindow: 30,
	}) as InventoryWorkspaceData | undefined;
	const realtimePriceMonitor = useQuery(api.inventory.getRealtimePriceMonitor, {
		limit: 300,
		search: searchQuery || undefined,
	}) as RealtimePriceMonitorData | undefined;
	const yumiAiInsights = useQuery(api.inventory.getInventoryYumiAiInsights, {
		limit: 40,
	}) as InventoryYumiAiInsightsData | undefined;
	const applyStockAction = useMutation(api.inventory.applyInventoryStockAction);
	const createItem = useMutation(api.inventory.createInventoryItem);
	const updateItem = useMutation(api.inventory.updateInventoryItem);
	const deleteItem = useMutation(api.inventory.deleteInventoryItem);
	const createStore = useMutation(api.inventory.createInventoryStore);
	const setReferencePrice = useMutation(api.inventory.setInventoryReferencePrice);

	const [selectedItem, setSelectedItem] = useState<Doc<"inventory"> | null>(
		null
	);
	const [actionType, setActionType] = useState<
		"add" | "usage" | "history" | "create" | "edit" | "adjust" | "delete" | null
	>(null);
	const [amount, setAmount] = useState("");
	const [filterLowStock, setFilterLowStock] = useState(false);
	const [advancedFilter, setAdvancedFilter] = useState<
		"all" | "priceUp" | "missingConversion"
	>("all");
	const [tableMode, setTableMode] = useState<"simple" | "detail">("simple");
	const [viewPreset, setViewPreset] = useState<InventoryViewPreset>("operational");
	const [detailItem, setDetailItem] = useState<Doc<"inventory"> | null>(null);
	const [newItem, setNewItem] = useState({
		ingredientName: "",
		unit: "gram",
		quantity: "0",
		lowStockThreshold: "100",
		displayUnit: "",
		conversionFactor: "",
		unitConversionsText: "",
		baseRecipeId: "" as string,
		defaultBrandName: "",
		preferredStoreId: "" as string,
		newStoreName: "",
	});
	const [notes, setNotes] = useState("");
	const [costPerUnit, setCostPerUnit] = useState("");
	const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
	const [purchaseMeta, setPurchaseMeta] = useState({
		brandName: "",
		storeId: "" as string,
		newStoreName: "",
		purchaseQuantity: "",
		purchaseUnit: "",
		lineTotal: "",
	});
	const [sortConfig, setSortConfig] = useState<{
		key:
			| "ingredientName"
			| "currentStock"
			| "lowStockThreshold"
			| "avgDailyUsage"
			| "daysUntilStockout";
		direction: "asc" | "desc";
	}>({ key: "ingredientName", direction: "asc" });
	const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig>({
		isOpen: false,
		title: "",
		message: "",
		onConfirm: () => {
			/* no-op */
		},
	});

	const priceMonitorDeltaMap = useMemo(() => {
		const map = new Map<string, number>();
		for (const row of realtimePriceMonitor?.rows ?? []) {
			map.set(row.nameKey, row.priceDelta ?? 0);
		}
		return map;
	}, [realtimePriceMonitor]);

	useEffect(() => {
		if (actionType !== null) {
			setDetailItem(null);
		}
	}, [actionType]);

	useEffect(() => {
		if (!selectedItem) {
			return;
		}

		if (actionType === "edit") {
			setNewItem({
				ingredientName: selectedItem.ingredientName,
				unit: selectedItem.unit,
				quantity: String(selectedItem.quantity),
				lowStockThreshold: String(selectedItem.lowStockThreshold),
				displayUnit: selectedItem.displayUnit || "",
				conversionFactor: selectedItem.conversionFactor
					? String(selectedItem.conversionFactor)
					: "",
				unitConversionsText: formatUnitConversionsText(
					selectedItem.unitConversions,
					selectedItem.displayUnit,
					selectedItem.conversionFactor
				),
				baseRecipeId: (selectedItem.baseRecipeId as string) || "",
				defaultBrandName: selectedItem.defaultBrandName || "",
				preferredStoreId: (selectedItem.preferredStoreId as string) || "",
				newStoreName: "",
			});
		}

		if (actionType === "add") {
			setPurchaseMeta({
				brandName: selectedItem.defaultBrandName || "",
				storeId: (selectedItem.preferredStoreId as string) || "",
				newStoreName: "",
				purchaseQuantity: "",
				purchaseUnit: selectedItem.displayUnit || selectedItem.unit || "",
				lineTotal: "",
			});
			setCostPerUnit(selectedItem.lastPurchasePrice ? String(selectedItem.lastPurchasePrice) : "");
		}
	}, [actionType, selectedItem]);

	const inventoryMap = useMemo(() => {
		const nextMap = new Map<Id<"inventory">, Doc<"inventory">>();
		for (const item of inventory ?? []) {
			nextMap.set(item._id, item);
		}
		return nextMap;
	}, [inventory]);

	const filteredRows = useMemo(() => {
		if (!workspace) {
			return [];
		}
		const result = workspace.rows.filter((row) => {
			const query = searchQuery.toLowerCase();
			const matchesSearch = [
				row.ingredientName,
				row.defaultBrandName || "",
				row.lastPurchaseStoreName || "",
				row.preferredStoreName || "",
			]
				.join(" ")
				.toLowerCase()
				.includes(query);
			const matchesFilter = filterLowStock
				? row.status === "critical" || row.currentStock <= row.lowStockThreshold
				: true;
			const matchesPreset = viewPreset === "operational";
			const missingConversion =
				row.unit === "pcs" &&
				!row.unitConversions?.length &&
				!(
					(row.displayUnit || "").trim() &&
					typeof row.conversionFactor === "number" &&
					row.conversionFactor > 0
				);
			const isPriceUp =
				(priceMonitorDeltaMap.get(row.ingredientName.trim().toLowerCase()) ?? 0) > 0;
			const matchesAdvanced =
				advancedFilter === "all"
					? true
					: advancedFilter === "missingConversion"
						? missingConversion
						: isPriceUp;
			return matchesSearch && matchesFilter && matchesPreset && matchesAdvanced;
		});

		result.sort((a, b) => {
			const aValue = a[sortConfig.key] ?? "";
			const bValue = b[sortConfig.key] ?? "";
			if (aValue < bValue) {
				return sortConfig.direction === "asc" ? -1 : 1;
			}
			if (aValue > bValue) {
				return sortConfig.direction === "asc" ? 1 : -1;
			}
			return 0;
		});

		return result;
	}, [
		workspace,
		searchQuery,
		filterLowStock,
		viewPreset,
		sortConfig,
		advancedFilter,
		priceMonitorDeltaMap,
	]);

	const unitOptions = useMemo(
		() =>
			collectDynamicUnitOptions({
				inventoryItems: inventory,
				workspaceRows: workspace?.rows,
			}),
		[inventory, workspace?.rows]
	);

	const handleSort = (
		key:
			| "ingredientName"
			| "currentStock"
			| "lowStockThreshold"
			| "avgDailyUsage"
			| "daysUntilStockout"
	) => {
		setSortConfig((prev) => ({
			key,
			direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
		}));
	};

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) {
				return;
			}
			const target = event.target as HTMLElement | null;
			const isTypingTarget =
				target != null &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable);
			if (isTypingTarget) {
				return;
			}
			if (event.key.toLowerCase() === "f") {
				event.preventDefault();
				const input = document.getElementById("inventory-search-input");
				if (input instanceof HTMLInputElement) {
					input.focus();
					input.select();
				}
				return;
			}
			if (event.key.toLowerCase() === "s") {
				event.preventDefault();
				toast.success("Autosave aktif. Perubahan baris disimpan saat blur/enter.");
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const handleApplyReferencePrice = async (
		row: RealtimePriceMonitorData["rows"][number]
	) => {
		if (!row.inventoryId) {
			toast.error("Baris ini belum terhubung ke item inventory");
			return;
		}
		try {
			await setReferencePrice({
				inventoryId: row.inventoryId,
				price: row.lastPrice,
				notes: "Sinkron dari monitoring harga",
			});
			toast.success("Harga terbaru dijadikan referensi inventory");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Gagal sinkron harga");
		}
	};

	const handleCreateItem = async () => {
		const normalizedUnit = normalizeUnitOption(newItem.unit);
		if (!normalizedUnit) {
			toast.error("Satuan dasar wajib diisi");
			return;
		}
		const parsedUnitConversions = parseUnitConversionsText(newItem.unitConversionsText);
		const primaryConversion = getPrimaryConversionFromChain(parsedUnitConversions);
		if (
			newItem.unit === "pcs" &&
			!(parsedUnitConversions && parsedUnitConversions.length > 0) &&
			!(
				normalizeUnitOption(newItem.displayUnit) &&
				!Number.isNaN(Number(newItem.conversionFactor)) &&
				Number(newItem.conversionFactor) > 0
			)
		) {
			toast.error(
				"Untuk unit pcs, isi minimal satu konversi (contoh: gram:200 atau dus:12)"
			);
			return;
		}
		const preferredStoreId =
			newItem.preferredStoreId === "__new__"
				? await createStore({
						name: newItem.newStoreName.trim(),
				  })
				: newItem.preferredStoreId
					? (newItem.preferredStoreId as Id<"inventoryStores">)
					: undefined;

		await createItem({
			ingredientName: newItem.ingredientName,
			unit: normalizedUnit,
			quantity: Number(newItem.quantity),
			lowStockThreshold: Number(newItem.lowStockThreshold),
			displayUnit:
				primaryConversion.displayUnit ||
				normalizeUnitOption(newItem.displayUnit) ||
				undefined,
			conversionFactor:
				primaryConversion.conversionFactor ||
				(newItem.conversionFactor ? Number(newItem.conversionFactor) : undefined),
			unitConversions: parsedUnitConversions,
			baseRecipeId: (newItem.baseRecipeId as Id<"baseRecipes">) || undefined,
			defaultBrandName: newItem.defaultBrandName.trim() || undefined,
			preferredStoreId,
		});
		toast.success("Bahan baku ditambahkan");
	};

	const handleEditItem = async (selected: Doc<"inventory">) => {
		const normalizedUnit = normalizeUnitOption(newItem.unit);
		if (!normalizedUnit) {
			toast.error("Satuan dasar wajib diisi");
			return;
		}
		const parsedUnitConversions = parseUnitConversionsText(newItem.unitConversionsText);
		const primaryConversion = getPrimaryConversionFromChain(parsedUnitConversions);
		if (
			newItem.unit === "pcs" &&
			!(parsedUnitConversions && parsedUnitConversions.length > 0) &&
			!(
				normalizeUnitOption(newItem.displayUnit) &&
				!Number.isNaN(Number(newItem.conversionFactor)) &&
				Number(newItem.conversionFactor) > 0
			)
		) {
			toast.error(
				"Untuk unit pcs, isi minimal satu konversi (contoh: gram:200 atau dus:12)"
			);
			return;
		}
		const preferredStoreId =
			newItem.preferredStoreId === "__new__"
				? await createStore({
						name: newItem.newStoreName.trim(),
				  })
				: newItem.preferredStoreId
					? (newItem.preferredStoreId as Id<"inventoryStores">)
					: undefined;

		await updateItem({
			id: selected._id,
			ingredientName: newItem.ingredientName,
			unit: normalizedUnit,
			lowStockThreshold: Number(newItem.lowStockThreshold),
			displayUnit:
				primaryConversion.displayUnit ||
				normalizeUnitOption(newItem.displayUnit) ||
				undefined,
			conversionFactor:
				primaryConversion.conversionFactor ||
				(newItem.conversionFactor ? Number(newItem.conversionFactor) : undefined),
			unitConversions: parsedUnitConversions,
			baseRecipeId: (newItem.baseRecipeId as Id<"baseRecipes">) || undefined,
			defaultBrandName: newItem.defaultBrandName.trim() || undefined,
			preferredStoreId,
		});
		toast.success("Bahan baku diperbarui");
	};

	const handleStockAction = async (
		selected: Doc<"inventory">,
		type: "add" | "usage" | "adjust"
	) => {
		const numAmount = Number(amount);
		const storeId =
			purchaseMeta.storeId === "__new__"
				? await createStore({
						name: purchaseMeta.newStoreName.trim(),
				  })
				: purchaseMeta.storeId
					? (purchaseMeta.storeId as Id<"inventoryStores">)
					: undefined;
		const baseArgs = {
			inventoryId: selected._id,
			quantity: numAmount,
			notes,
			brandName: purchaseMeta.brandName.trim() || undefined,
			storeId,
			purchaseQuantity: purchaseMeta.purchaseQuantity
				? Number(purchaseMeta.purchaseQuantity)
				: undefined,
			purchaseUnit: purchaseMeta.purchaseUnit.trim() || undefined,
			lineTotal: purchaseMeta.lineTotal ? Number(purchaseMeta.lineTotal) : undefined,
		};

		if (type === "add") {
			await applyStockAction({
				...baseArgs,
				action: "add",
				costPerUnit: costPerUnit ? Number(costPerUnit) : undefined,
				timestamp: entryDate ? new Date(entryDate).getTime() : undefined,
			});
			toast.success(`Stok ${selected.ingredientName} ditambahkan`);
		} else if (type === "usage") {
			await applyStockAction({
				...baseArgs,
				action: "usage",
			});
			toast.success(`Penggunaan ${selected.ingredientName} dicatat`);
		} else if (type === "adjust") {
			await applyStockAction({
				...baseArgs,
				action: "adjust",
			});
			toast.success(`Stok ${selected.ingredientName} disesuaikan`);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		try {
			if (actionType === "create") {
				await handleCreateItem();
			} else if (actionType === "edit" && selectedItem) {
				await handleEditItem(selectedItem);
			} else if (actionType === "delete" && selectedItem) {
				await deleteItem({ id: selectedItem._id });
				toast.success("Bahan baku dihapus");
			} else if (
				selectedItem &&
				(actionType === "add" ||
					actionType === "usage" ||
					actionType === "adjust")
			) {
				await handleStockAction(selectedItem, actionType);
			}

			setSelectedItem(null);
			setActionType(null);
			setAmount("");
			setNotes("");
			setCostPerUnit("");
			setEntryDate(new Date().toISOString().split("T")[0]);
			setNewItem({
				ingredientName: "",
				unit: "gram",
				quantity: "0",
				lowStockThreshold: "100",
				displayUnit: "",
				conversionFactor: "",
				unitConversionsText: "",
				baseRecipeId: "",
				defaultBrandName: "",
				preferredStoreId: "",
				newStoreName: "",
			});
			setPurchaseMeta({
				brandName: "",
				storeId: "",
				newStoreName: "",
				purchaseQuantity: "",
				purchaseUnit: "",
				lineTotal: "",
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Terjadi kesalahan";
			toast.error(message);
		}
	};

	return (
		<div className="space-y-4">
			<div className="sticky top-0 z-50 bg-background pb-3">
				<InventoryHeader
				advancedFilter={advancedFilter}
				filterLowStock={filterLowStock}
				onAdvancedFilterChange={setAdvancedFilter}
				onFilterLowStockChange={setFilterLowStock}
				onSearchQueryChange={setSearchQuery}
				onTableModeChange={setTableMode}
				onViewPresetChange={setViewPreset}
				searchQuery={searchQuery}
				tableMode={tableMode}
				viewPreset={viewPreset}
				/>
			</div>

			{viewPreset === "priceMonitor" ? (
				<RealtimePriceMonitorTable
					data={realtimePriceMonitor}
					onApplyReferencePrice={handleApplyReferencePrice}
				/>
			) : viewPreset === "yumiAi" ? (
				<YumiAiInventoryPanel data={yumiAiInsights} />
			) : (
				<InventoryTable
				filteredRows={filteredRows}
				inventoryMap={inventoryMap}
					stores={stores ?? []}
					onActionTypeChange={setActionType}
					onDetailItemChange={setDetailItem}
					onSelectedItemChange={setSelectedItem}
					onSort={handleSort}
					sortConfig={sortConfig}
					tableMode={tableMode}
					unitOptions={unitOptions}
					viewPreset={viewPreset}
				/>
			)}

			<InventoryActionModal
				actionType={actionType}
				amount={amount}
				costPerUnit={costPerUnit}
				entryDate={entryDate}
				newItem={newItem}
				notes={notes}
				purchaseMeta={purchaseMeta}
				stores={stores}
				unitOptions={unitOptions}
				onActionTypeChange={setActionType}
				onAmountChange={setAmount}
				onCostPerUnitChange={setCostPerUnit}
				onEntryDateChange={setEntryDate}
				onNewItemChange={setNewItem}
				onNotesChange={setNotes}
				onPurchaseMetaChange={setPurchaseMeta}
				onSelectedItemChange={setSelectedItem}
				onSubmit={handleSubmit}
				selectedItem={selectedItem}
				setConfirmConfig={setConfirmConfig}
			/>

			{/* Modal Views Mapping */}
			{/* Instead of nested ternaries, we use early returns or conditional blocks above */}

			{/* History Modal */}
			{selectedItem && actionType === "history" && (
				<InventoryHistoryModal
					item={selectedItem}
					onClose={() => {
						setSelectedItem(null);
						setActionType(null);
					}}
				/>
			)}

			{detailItem && (
				<InventoryDetailDrawer
					item={detailItem}
					onClose={() => setDetailItem(null)}
				/>
			)}

			<ConfirmationModal
				isOpen={confirmConfig.isOpen}
				message={confirmConfig.message}
				onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
				onConfirm={confirmConfig.onConfirm}
				title={confirmConfig.title}
			/>
		</div>
	);
}

function InventoryModalContent({
	selectedItem,
	onSelectedItemChange,
	actionType,
	onActionTypeChange,
	newItem,
	onNewItemChange,
	amount,
	onAmountChange,
	notes,
	onNotesChange,
	costPerUnit,
	onCostPerUnitChange,
	entryDate,
	onEntryDateChange,
	baseRecipes,
	stores,
	unitOptions,
	purchaseMeta,
	onPurchaseMetaChange,
	produceBatch,
	setConfirmConfig,
}: {
	selectedItem: Doc<"inventory"> | null;
	onSelectedItemChange: (item: Doc<"inventory"> | null) => void;
	actionType:
		| "add"
		| "usage"
		| "edit"
		| "adjust"
		| "delete"
		| "create"
		| "history"
		| null;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "create"
			| "history"
			| null
	) => void;
	newItem: {
		ingredientName: string;
		unit: string;
		quantity: string;
		lowStockThreshold: string;
		displayUnit: string;
		conversionFactor: string;
		unitConversionsText: string;
		baseRecipeId: string;
		defaultBrandName: string;
		preferredStoreId: string;
		newStoreName: string;
	};
	onNewItemChange: (item: {
		ingredientName: string;
		unit: string;
		quantity: string;
		lowStockThreshold: string;
		displayUnit: string;
		conversionFactor: string;
		unitConversionsText: string;
		baseRecipeId: string;
		defaultBrandName: string;
		preferredStoreId: string;
		newStoreName: string;
	}) => void;
	amount: string;
	onAmountChange: (amount: string) => void;
	notes: string;
	onNotesChange: (notes: string) => void;
	costPerUnit: string;
	onCostPerUnitChange: (cost: string) => void;
	entryDate: string;
	onEntryDateChange: (date: string) => void;
	baseRecipes: Doc<"baseRecipes">[] | undefined;
	stores: InventoryStore[] | undefined;
	unitOptions: string[];
	purchaseMeta: {
		brandName: string;
		storeId: string;
		newStoreName: string;
		purchaseQuantity: string;
		purchaseUnit: string;
		lineTotal: string;
	};
	onPurchaseMetaChange: (value: {
		brandName: string;
		storeId: string;
		newStoreName: string;
		purchaseQuantity: string;
		purchaseUnit: string;
		lineTotal: string;
	}) => void;
	produceBatch: (args: {
		baseRecipeId: Id<"baseRecipes">;
		inventoryId: Id<"inventory">;
		batchMultiplier: number;
	}) => Promise<unknown>;
	setConfirmConfig: (config: ConfirmConfig) => void;
}) {
	const purchaseUnitOptions = getPurchaseUnitOptions(selectedItem);

	if (actionType === "create" || actionType === "edit") {
		return (
			<div className="space-y-6">
				<div className="space-y-2">
					<label
						className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
						htmlFor="ingredientName"
					>
						Nama Bahan
					</label>
					<input
						autoFocus
						className="w-full rounded-md bg-background border border-border p-4 font-bold text-foreground text-sm outline-none transition-all placeholder:text-foreground/30 focus:ring-2 focus:ring-ring"
						id="ingredientName"
						onChange={(e) =>
							onNewItemChange({
								...newItem,
								ingredientName: e.target.value,
							})
						}
						placeholder="Contoh: Fresh Milk"
						required
						value={newItem.ingredientName}
					/>
				</div>
				<div className="grid grid-cols-2 gap-5">
					<div className="space-y-2">
						<label
							className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
							htmlFor="unit"
						>
							Satuan Dasar
						</label>
						<input
							className="w-full rounded-md bg-background border border-border p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
							id="unit"
							list="inventory-unit-options-modal"
							onChange={(e) =>
								onNewItemChange({
									...newItem,
									unit: normalizeUnitOption(e.target.value),
								})
							}
							placeholder="gram / ml / pcs / dus / karton / custom"
							value={newItem.unit}
						/>
						<datalist id="inventory-unit-options-modal">
							{unitOptions.map((unit) => (
								<option key={unit} value={unit} />
							))}
						</datalist>
					</div>
					<div className="space-y-2">
						<label
							className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
							htmlFor="quantity"
						>
							{actionType === "create" ? "Stok Awal" : "Ambang Rendah"}
						</label>
						<input
							className="w-full rounded-md bg-background border border-border p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
							id={actionType === "create" ? "quantity" : "editThreshold"}
							onChange={(e) =>
								onNewItemChange({
									...newItem,
									[actionType === "create" ? "quantity" : "lowStockThreshold"]:
										e.target.value,
								})
							}
							type="number"
							value={
								actionType === "create"
									? newItem.quantity
									: newItem.lowStockThreshold
							}
						/>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-5">
					<div className="space-y-2">
						<label
							className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
							htmlFor="defaultBrandName"
						>
							Brand Utama
						</label>
						<input
							className="w-full rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
							id="defaultBrandName"
							onChange={(e) =>
								onNewItemChange({
									...newItem,
									defaultBrandName: e.target.value,
								})
							}
							placeholder="Contoh: Indomilk"
							value={newItem.defaultBrandName}
						/>
					</div>
					<div className="space-y-2">
						<label
							className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
							htmlFor="preferredStoreId"
						>
							Toko Preferensi
						</label>
						<select
							className="w-full appearance-none rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
							id="preferredStoreId"
							onChange={(e) =>
								onNewItemChange({
									...newItem,
									preferredStoreId: e.target.value,
									newStoreName: e.target.value === "__new__" ? newItem.newStoreName : "",
								})
							}
							value={newItem.preferredStoreId}
						>
							<option value="">PILIH NANTI</option>
							{stores?.map((store) => (
								<option key={store._id} value={store._id}>
									{store.name.toUpperCase()}
								</option>
							))}
							<option value="__new__">+ BUAT TOKO BARU</option>
						</select>
					</div>
				</div>
				{newItem.preferredStoreId === "__new__" && (
					<div className="space-y-2">
						<label
							className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
							htmlFor="newPreferredStoreName"
						>
							Nama Toko Baru
						</label>
						<input
							className="w-full rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
							id="newPreferredStoreName"
							onChange={(e) =>
								onNewItemChange({
									...newItem,
									newStoreName: e.target.value,
								})
							}
							placeholder="Contoh: Toko Susu Makmur"
							value={newItem.newStoreName}
						/>
					</div>
				)}

				<div className="space-y-4 rounded-lg border border-border bg-muted/30 p-6">
					<p className="font-bold text-foreground text-[11px] uppercase tracking-widest">
						Takaran Multi Satuan (Wajib untuk item pcs)
					</p>
					<div className="space-y-1.5">
						<label
							className="font-bold text-foreground/60 text-[9px] uppercase tracking-wider"
							htmlFor="unitConversionsText"
						>
							Rantai Konversi
						</label>
						<input
							className="w-full rounded-md bg-background border border-border p-3 font-medium text-foreground text-xs outline-none transition-all focus:ring-1 focus:ring-ring"
							id="unitConversionsText"
							onChange={(e) =>
								onNewItemChange({
									...newItem,
									unitConversionsText: e.target.value,
								})
							}
							placeholder="Contoh: gram:200, dus:12, karton:144"
							value={newItem.unitConversionsText}
						/>
					</div>
					<p className="text-foreground/50 text-[10px] italic leading-snug">
						* Format: namaSatuan:isiDalamSatuanDasar. Contoh: satuan dasar gram,
						isian "pcs:200" berarti 1 pcs = 200 gram. Contoh lain: satuan dasar
						pcs, isian "dus:12, karton:144" berarti 1 dus = 12 pcs dan 1 karton =
						144 pcs.
					</p>
				</div>

				<div className="space-y-2">
					<label
						className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
						htmlFor="baseRecipeId"
					>
						Link ke Resep Base (Produksi)
					</label>
					<select
						className="w-full appearance-none rounded-md bg-background border border-border p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
						id="baseRecipeId"
						onChange={(e) =>
							onNewItemChange({
								...newItem,
								baseRecipeId: e.target.value,
							})
						}
						value={newItem.baseRecipeId}
					>
						<option value="">BUKAN RACIKAN / PRE-MIX</option>
						{baseRecipes?.map((r: any) => (
							<option key={r._id} value={r._id}>
								{r.name.toUpperCase()}
							</option>
						))}
					</select>
				</div>
			</div>
		);
	}

	if (
		actionType === "add" ||
		actionType === "usage" ||
		actionType === "adjust"
	) {
		return (
			<div className="space-y-6">
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<label
							className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
							htmlFor="inventory-amount"
						>
							{actionType === "adjust"
								? "Stok Akhir"
								: `Jumlah (${selectedItem?.unit})`}
						</label>
						{selectedItem?.baseRecipeId && actionType === "add" && (
							<button
								className="font-bold text-foreground text-[10px] hover:underline"
								onClick={() => {
									setConfirmConfig({
										isOpen: true,
										title: "Konfirmasi Produksi",
										message: `Produksi 1 batch "${selectedItem.ingredientName}"? Ini akan mengurangi stok bahan dasarnya.`,
										onConfirm: async () => {
											try {
												if (!selectedItem.baseRecipeId) {
													return;
												}
												await produceBatch({
													baseRecipeId: selectedItem.baseRecipeId,
													inventoryId: selectedItem._id,
													batchMultiplier: 1,
												});
												toast.success("Produksi berhasil");
												onActionTypeChange(null);
												onSelectedItemChange(null);
											} catch (e: unknown) {
												const error = e as Error;
												toast.error(error.message);
											}
										},
									});
								}}
								type="button"
							>
								PRODUKSI VIA RESEP
							</button>
						)}
					</div>
					<input
						autoFocus
						className="w-full rounded-md bg-background border border-border p-6 font-black text-4xl text-foreground outline-none ring-ring transition-all focus:ring-4"
						id="inventory-amount"
						onChange={(e) => onAmountChange(e.target.value)}
						placeholder="0"
						required
						type="number"
						value={amount}
					/>
				</div>

				{actionType === "add" && (
					<div className="space-y-4 rounded-lg border border-border bg-muted/30 p-5">
						<p className="font-bold text-[11px] uppercase tracking-widest text-foreground">
							Info Pembelian
						</p>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<label
									className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
									htmlFor="purchase-brand"
								>
									Brand
								</label>
								<input
									className="w-full rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
									id="purchase-brand"
									onChange={(e) =>
										onPurchaseMetaChange({
											...purchaseMeta,
											brandName: e.target.value,
										})
									}
									placeholder="Contoh: Greenfields"
									value={purchaseMeta.brandName}
								/>
							</div>
							<div className="space-y-2">
								<label
									className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
									htmlFor="entry-date"
								>
									Tanggal Masuk
								</label>
								<input
									className="w-full rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
									id="entry-date"
									onChange={(e) => onEntryDateChange(e.target.value)}
									type="date"
									value={entryDate}
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<label
									className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
									htmlFor="purchase-store"
								>
									Toko
								</label>
								<select
									className="w-full appearance-none rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
									id="purchase-store"
									onChange={(e) =>
										onPurchaseMetaChange({
											...purchaseMeta,
											storeId: e.target.value,
											newStoreName: e.target.value === "__new__" ? purchaseMeta.newStoreName : "",
										})
									}
									value={purchaseMeta.storeId}
								>
									<option value="">TANPA TOKO</option>
									{stores?.map((store) => (
										<option key={store._id} value={store._id}>
											{store.name.toUpperCase()}
										</option>
									))}
									<option value="__new__">+ BUAT TOKO BARU</option>
								</select>
							</div>
							<div className="space-y-2">
								<label
									className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
									htmlFor="cost-per-unit"
								>
									Harga Basis / Unit
								</label>
								<input
									className="w-full rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all placeholder:text-foreground/30 focus:ring-2 focus:ring-ring"
									id="cost-per-unit"
									onChange={(e) => onCostPerUnitChange(e.target.value)}
									placeholder="Kosongkan agar hitung otomatis"
									type="number"
									value={costPerUnit}
								/>
							</div>
						</div>
						{purchaseMeta.storeId === "__new__" && (
							<div className="space-y-2">
								<label
									className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
									htmlFor="purchase-new-store"
								>
									Nama Toko Baru
								</label>
								<input
									className="w-full rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
									id="purchase-new-store"
									onChange={(e) =>
										onPurchaseMetaChange({
											...purchaseMeta,
											newStoreName: e.target.value,
										})
									}
									placeholder="Contoh: Pasar Pagi"
									value={purchaseMeta.newStoreName}
								/>
							</div>
						)}
						<div className="grid grid-cols-3 gap-4">
							<div className="space-y-2">
								<label
									className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
									htmlFor="purchase-quantity"
								>
									Qty Beli
								</label>
								<input
									className="w-full rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
									id="purchase-quantity"
									onChange={(e) =>
										onPurchaseMetaChange({
											...purchaseMeta,
											purchaseQuantity: e.target.value,
										})
									}
									placeholder="1"
									type="number"
									value={purchaseMeta.purchaseQuantity}
								/>
							</div>
							<div className="space-y-2">
								<label
									className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
									htmlFor="purchase-unit"
								>
									Satuan Beli
								</label>
								<input
									className="w-full rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
									id="purchase-unit"
									list="purchase-unit-options"
									onChange={(e) =>
										onPurchaseMetaChange({
											...purchaseMeta,
											purchaseUnit: e.target.value,
										})
									}
									placeholder="pcs / dus / karton / liter"
									value={purchaseMeta.purchaseUnit}
								/>
								<datalist id="purchase-unit-options">
									{purchaseUnitOptions.map((unit) => (
										<option key={unit} value={unit} />
									))}
								</datalist>
							</div>
							<div className="space-y-2">
								<label
									className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
									htmlFor="line-total"
								>
									Total Belanja
								</label>
								<input
									className="w-full rounded-md border border-border bg-background p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
									id="line-total"
									onChange={(e) =>
										onPurchaseMetaChange({
											...purchaseMeta,
											lineTotal: e.target.value,
										})
									}
									placeholder="50000"
									type="number"
									value={purchaseMeta.lineTotal}
								/>
							</div>
						</div>
						<p className="text-[11px] leading-relaxed text-muted-foreground">
							Jika harga basis dikosongkan, sistem akan menghitung otomatis dari
							total belanja dan qty beli.
						</p>
					</div>
				)}

				<div className="space-y-2">
					<label
						className="font-bold text-foreground/60 text-[10px] uppercase tracking-widest"
						htmlFor="inventory-notes"
					>
						Catatan
					</label>
					<input
						className="w-full rounded-md bg-background border border-border p-4 font-medium text-foreground text-sm outline-none transition-all placeholder:text-foreground/30 focus:ring-2 focus:ring-ring"
						id="inventory-notes"
						onChange={(e) => onNotesChange(e.target.value)}
						placeholder="Catatan tambahan..."
						value={notes}
					/>
				</div>
			</div>
		);
	}

	return null;
}

function InventoryActionModal({
	selectedItem,
	onSelectedItemChange,
	actionType,
	onActionTypeChange,
	newItem,
	onNewItemChange,
	amount,
	onAmountChange,
	notes,
	onNotesChange,
	costPerUnit,
	onCostPerUnitChange,
	entryDate,
	onEntryDateChange,
	stores,
	unitOptions,
	purchaseMeta,
	onPurchaseMetaChange,
	onSubmit,
	setConfirmConfig,
}: {
	selectedItem: Doc<"inventory"> | null;
	onSelectedItemChange: (item: Doc<"inventory"> | null) => void;
	actionType:
		| "add"
		| "usage"
		| "edit"
		| "adjust"
		| "delete"
		| "create"
		| "history"
		| null;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "create"
			| "history"
			| null
	) => void;
	newItem: {
		ingredientName: string;
		unit: string;
		quantity: string;
		lowStockThreshold: string;
		displayUnit: string;
		conversionFactor: string;
		unitConversionsText: string;
		baseRecipeId: string;
		defaultBrandName: string;
		preferredStoreId: string;
		newStoreName: string;
	};
	onNewItemChange: (item: {
		ingredientName: string;
		unit: string;
		quantity: string;
		lowStockThreshold: string;
		displayUnit: string;
		conversionFactor: string;
		unitConversionsText: string;
		baseRecipeId: string;
		defaultBrandName: string;
		preferredStoreId: string;
		newStoreName: string;
	}) => void;
	amount: string;
	onAmountChange: (amount: string) => void;
	notes: string;
	onNotesChange: (notes: string) => void;
	costPerUnit: string;
	onCostPerUnitChange: (cost: string) => void;
	entryDate: string;
	onEntryDateChange: (date: string) => void;
	stores: InventoryStore[] | undefined;
	unitOptions: string[];
	purchaseMeta: {
		brandName: string;
		storeId: string;
		newStoreName: string;
		purchaseQuantity: string;
		purchaseUnit: string;
		lineTotal: string;
	};
	onPurchaseMetaChange: (value: {
		brandName: string;
		storeId: string;
		newStoreName: string;
		purchaseQuantity: string;
		purchaseUnit: string;
		lineTotal: string;
	}) => void;
	onSubmit: (e: React.FormEvent) => void;
	setConfirmConfig: (config: ConfirmConfig) => void;
}) {
	const baseRecipes = useQuery(api.inventory.getBaseRecipes);
	const produceBatch = useMutation(api.inventory.produceBaseRecipeBatch);

	if (
		!(selectedItem || actionType === "create") ||
		actionType === "history" ||
		actionType === null
	) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl"
				exit={{ opacity: 0, scale: 0.95 }}
				initial={{ opacity: 0, scale: 0.95 }}
			>
				<div className="border-border border-b p-8 pb-3">
					<h3 className="font-bold text-2xl text-foreground tracking-tight">
						{actionType === "create" && "Tambah Bahan Baru"}
						{actionType === "edit" && "Edit Bahan Baku"}
						{actionType === "add" && "Update Stok"}
						{actionType === "adjust" && "Sesuaikan Stok"}
						{actionType === "usage" && "Catat Penggunaan"}
						{actionType === "delete" && "Hapus Bahan Baku"}
					</h3>
				</div>

				<form className="space-y-6" onSubmit={onSubmit}>
					<div className="custom-scrollbar max-h-[70vh] overflow-y-auto p-8">
						{actionType === "delete" ? (
							<div className="rounded-lg border border-destructive/20 bg-destructive/10 p-6 text-center">
								<p className="font-bold text-[#EF4444] text-sm">
									Yakin ingin menghapus {selectedItem?.ingredientName}?
								</p>
								<p className="mt-2 text-destructive/80 text-xs">
									Tindakan ini tidak dapat dibatalkan.
								</p>
							</div>
						) : (
							<InventoryModalContent
								actionType={actionType}
								amount={amount}
								baseRecipes={baseRecipes}
								costPerUnit={costPerUnit}
								entryDate={entryDate}
								newItem={newItem}
								notes={notes}
								onActionTypeChange={onActionTypeChange}
								onAmountChange={onAmountChange}
								onCostPerUnitChange={onCostPerUnitChange}
								onEntryDateChange={onEntryDateChange}
								onNewItemChange={onNewItemChange}
								onNotesChange={onNotesChange}
								onPurchaseMetaChange={onPurchaseMetaChange}
								onSelectedItemChange={onSelectedItemChange}
								purchaseMeta={purchaseMeta}
								produceBatch={produceBatch}
								selectedItem={selectedItem}
								setConfirmConfig={setConfirmConfig}
								stores={stores}
								unitOptions={unitOptions}
							/>
						)}
					</div>

					<div className="flex gap-6 border-border border-t p-8">
						<button
							className="flex-1 rounded-md bg-background border border-border py-5 font-bold text-foreground text-[10px] uppercase tracking-widest transition-all hover:bg-muted active:scale-95"
							onClick={() => {
								onSelectedItemChange(null);
								onActionTypeChange(null);
							}}
							type="button"
						>
							Batal
						</button>
						<button
							className={`flex-1 rounded-md py-5 font-bold text-xs uppercase tracking-[0.2em] transition-all active:scale-[0.98] ${
								actionType === "delete"
									? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
									: "bg-primary text-primary-foreground hover:bg-primary/90"
							}`}
							type="submit"
						>
							{actionType === "delete" ? "HAPUS SEKARANG" : "KONFIRMASI"}
						</button>
					</div>
				</form>
			</motion.div>
		</div>
	);
}

function InventoryControlTowerSummary({
	data,
	viewPreset,
}: {
	data: InventoryWorkspaceData | undefined;
	viewPreset: InventoryViewPreset;
}) {
	const cards = [
		{
			label: "Item",
			value: data?.summary.totalItems ?? "-",
			icon: Boxes,
			tone: "text-slate-700 bg-slate-100 border-slate-200",
		},
		{
			label: "Kritis",
			value: data?.summary.riskHighCount ?? "-",
			icon: ShieldAlert,
			tone: "text-rose-700 bg-rose-100 border-rose-200",
		},
		{
			label: "Menipis",
			value: data?.summary.lowStockCount ?? "-",
			icon: BadgeAlert,
			tone: "text-amber-700 bg-amber-100 border-amber-200",
		},
		{
			label: `Aktivitas ${data?.summary.daysWindow ?? 30} Hari`,
			value:
				data != null
					? `${data.summary.recentUsageTxCount} pakai / ${data.summary.recentRestockTxCount} restock`
					: "-",
			icon: BarChart3,
			tone: "text-sky-700 bg-sky-100 border-sky-200",
		},
	];

	return (
		<div className="rounded-xl border border-border/80 bg-card px-3 py-3 shadow-sm">
			<div className="mb-2 flex items-center justify-between gap-3">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
						Inventory Workspace
					</p>
					<p className="text-sm font-semibold text-foreground">
						{viewPreset === "priceMonitor"
							? "Monitoring harga realtime"
							: viewPreset === "yumiAi"
								? "Insight Yumi AI"
								: "Operasional inventaris"}
					</p>
				</div>
				<p className="text-[11px] text-muted-foreground">
					Total stok {data?.summary.totalStockUnits ?? "-"}
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
				{cards.map((card) => (
					<div
						className="rounded-lg border border-border/70 bg-background px-3 py-2.5"
						key={card.label}
					>
						<div className="flex items-center justify-between">
							<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
								{card.label}
							</p>
							<span className={`rounded-lg border p-1.5 ${card.tone}`}>
								<card.icon className="h-4 w-4" />
							</span>
						</div>
						<p className="mt-1 font-black text-base text-foreground">{card.value}</p>
					</div>
				))}
			</div>
		</div>
	);
}
function InventoryPlanningPanel({
	data,
	onDetailItemChange,
	onActionTypeChange,
	setSelectedItem,
	onSearchQueryChange,
	onFilterLowStockChange,
}: {
	data:
		| {
				planningRows: Array<{
					inventoryId: Id<"inventory">;
					ingredientName: string;
					currentStock: number;
					unit: string;
					avgDailyUsage: number;
					daysUntilStockout: number | null;
					reorderPoint: number;
					suggestedOrderQty: number;
					riskLevel: "high" | "medium" | "low";
				}>;
		  }
		| undefined;
	onDetailItemChange: (item: Doc<"inventory">) => void;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "history"
			| "create"
			| null
	) => void;
	setSelectedItem: (item: Doc<"inventory"> | null) => void;
	onSearchQueryChange: (val: string) => void;
	onFilterLowStockChange: (val: boolean) => void;
}) {
	const inventory = useQuery(api.inventory.getInventory);
	const inventoryMap = useMemo(() => {
		const map = new Map<string, Doc<"inventory">>();
		for (const item of inventory ?? []) {
			map.set(item._id, item);
		}
		return map;
	}, [inventory]);

	return (
		<div className="space-y-4">
			<div className="rounded-xl border border-border bg-card p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="font-bold text-base text-foreground">Reorder Planner</p>
						<p className="text-muted-foreground text-xs">
							Prioritas restock berdasarkan konsumsi aktual dan risiko stok habis.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<button
							className="rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/80"
							onClick={() => onFilterLowStockChange(true)}
							type="button"
						>
							Tampilkan Stok Rendah
						</button>
						<button
							className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
							onClick={() => onSearchQueryChange("")}
							type="button"
						>
							Reset Filter
						</button>
					</div>
				</div>
			</div>
			<div className="overflow-hidden rounded-xl border border-border bg-card">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-xs md:text-sm">
						<thead className="border-b border-border bg-muted/30 text-muted-foreground">
							<tr>
								<th className="p-3 font-semibold">Bahan</th>
								<th className="p-3 text-center font-semibold">Avg/Hari</th>
								<th className="p-3 text-center font-semibold">ROP</th>
								<th className="p-3 text-center font-semibold">Saran Order</th>
								<th className="p-3 text-center font-semibold">Stockout</th>
								<th className="p-3 text-right font-semibold">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{data?.planningRows?.map((row) => {
								const itemDoc = inventoryMap.get(row.inventoryId as string);
								return (
									<tr className="hover:bg-muted/30" key={row.inventoryId}>
										<td className="p-3">
											<p className="font-bold text-foreground">{row.ingredientName}</p>
											<p className="text-[11px] text-muted-foreground">
												Stok saat ini {row.currentStock} {row.unit}
											</p>
										</td>
										<td className="p-3 text-center font-semibold">
											{row.avgDailyUsage.toFixed(2)} {row.unit}
										</td>
										<td className="p-3 text-center">{row.reorderPoint}</td>
										<td className="p-3 text-center font-bold text-primary">
											{row.suggestedOrderQty}
										</td>
										<td className="p-3 text-center">
											{row.daysUntilStockout == null ? (
												<span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
													AMAN
												</span>
											) : (
												<span
													className={`rounded-full px-2 py-1 text-[10px] font-bold ${
														row.riskLevel === "high"
															? "bg-rose-100 text-rose-700"
															: row.riskLevel === "medium"
																? "bg-amber-100 text-amber-700"
																: "bg-emerald-100 text-emerald-700"
													}`}
												>
													{row.daysUntilStockout.toFixed(1)} hari
												</span>
											)}
										</td>
										<td className="p-3 text-right">
											<div className="flex justify-end gap-1">
												<button
													className="rounded-lg p-2 text-primary hover:bg-primary/10"
													onClick={() => {
														if (!itemDoc) {
															return;
														}
														setSelectedItem(itemDoc);
														onActionTypeChange("add");
													}}
													title="Restock"
													type="button"
												>
													<Plus className="h-4 w-4" />
												</button>
												<button
													className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
													onClick={() => {
														if (!itemDoc) {
															return;
														}
														onDetailItemChange(itemDoc);
													}}
													title="Detail Impact"
													type="button"
												>
													<PackageSearch className="h-4 w-4" />
												</button>
											</div>
										</td>
									</tr>
								);
							})}
							{(data?.planningRows?.length ?? 0) === 0 && (
								<tr>
									<td className="p-6 text-center text-muted-foreground" colSpan={6}>
										Belum ada data planning.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}

function InventoryDetailDrawer({
	item,
	onClose,
}: {
	item: Doc<"inventory">;
	onClose: () => void;
}) {
	const impact = useQuery(api.inventory.getInventoryItemImpact, {
		inventoryId: item._id,
	});
	const batches = useQuery(api.inventory.getInventoryItemBatches, {
		inventoryId: item._id,
	});
	const priceInsights = useQuery(api.inventory.getInventoryPriceInsights, {
		inventoryId: item._id,
	}) as InventoryPriceInsights | undefined;

	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px]">
			<div className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-card p-5 shadow-2xl">
				<div className="mb-5 flex items-start justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
							Purchase Intelligence
						</p>
						<h3 className="mt-1 font-black text-2xl text-foreground">{item.ingredientName}</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Stok {item.quantity} {item.unit} · ambang {item.lowStockThreshold} {item.unit}
						</p>
					</div>
					<button
						className="rounded-full bg-muted p-2 hover:bg-muted/80"
						onClick={onClose}
						type="button"
					>
						<Plus className="h-4 w-4 rotate-45" />
					</button>
				</div>

				<div className="mb-4 grid grid-cols-2 gap-3">
					<div className="rounded-2xl border border-border bg-muted/20 p-4">
						<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Status
						</p>
						<p className="mt-2 font-black text-xl text-foreground">
							{item.quantity <= item.lowStockThreshold ? "Perlu restock" : "Aman"}
						</p>
					</div>
					<div className="rounded-2xl border border-border bg-muted/20 p-4">
						<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Korelasi
						</p>
						<p className="mt-2 font-black text-xl text-foreground">
							{impact?.impact.productCount ?? 0} produk
						</p>
					</div>
				</div>

				<div className="mb-4 rounded-2xl border border-border p-4">
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Identitas Pembelian
					</p>
					<div className="mt-3 grid grid-cols-2 gap-3 text-sm text-foreground">
						<div className="rounded-xl bg-muted/40 px-3 py-2">
							<p className="text-[10px] uppercase tracking-widest text-muted-foreground">
								Brand utama
							</p>
							<p className="mt-1 font-semibold">
								{priceInsights?.item.defaultBrandName || "-"}
							</p>
						</div>
						<div className="rounded-xl bg-muted/40 px-3 py-2">
							<p className="text-[10px] uppercase tracking-widest text-muted-foreground">
								Toko preferensi
							</p>
							<p className="mt-1 font-semibold">
								{priceInsights?.item.preferredStoreName || "-"}
							</p>
						</div>
					</div>
				</div>

				<div className="mb-4 rounded-2xl border border-border p-4">
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Snapshot Harga
					</p>
					<div className="mt-3 grid grid-cols-3 gap-3">
						<div className="rounded-xl bg-muted/40 px-3 py-3">
							<p className="text-[10px] uppercase tracking-widest text-muted-foreground">
								Terakhir
							</p>
							<p className="mt-1 font-black text-lg text-foreground">
								{formatCurrency(priceInsights?.priceSnapshot.lastPrice)}
							</p>
						</div>
						<div className="rounded-xl bg-muted/40 px-3 py-3">
							<p className="text-[10px] uppercase tracking-widest text-muted-foreground">
								Termurah
							</p>
							<p className="mt-1 font-black text-lg text-foreground">
								{formatCurrency(priceInsights?.priceSnapshot.lowestPrice)}
							</p>
						</div>
						<div className="rounded-xl bg-muted/40 px-3 py-3">
							<p className="text-[10px] uppercase tracking-widest text-muted-foreground">
								Rata-rata
							</p>
							<p className="mt-1 font-black text-lg text-foreground">
								{formatCurrency(priceInsights?.priceSnapshot.averagePrice)}
							</p>
						</div>
					</div>
					<p className="mt-3 text-[11px] text-muted-foreground">
						Toko terakhir: {priceInsights?.item.lastPurchaseStoreName || "-"} ·
						Update:{" "}
						{priceInsights?.priceSnapshot.lastPurchaseAt
							? new Date(priceInsights.priceSnapshot.lastPurchaseAt).toLocaleDateString("id-ID")
							: "-"}
					</p>
				</div>

				<div className="mb-4 rounded-2xl border border-border p-4">
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Dampak Lintas Fitur
					</p>
					<div className="mt-3 space-y-2 text-sm text-foreground">
						<p>Produk terdampak: <span className="font-bold">{impact?.impact.productCount ?? 0}</span></p>
						<p>Recipe terdampak: <span className="font-bold">{impact?.impact.recipeCount ?? 0}</span></p>
						<p>Base recipe pemakai: <span className="font-bold">{impact?.impact.consumedByBaseRecipeCount ?? 0}</span></p>
						{impact?.impact.producedByBaseRecipeName && (
							<p>Diproduksi dari: <span className="font-bold">{impact.impact.producedByBaseRecipeName}</span></p>
						)}
					</div>
				</div>

				<div className="mb-4 rounded-2xl border border-border p-4">
					<p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Perbandingan Toko
					</p>
					<div className="space-y-2">
						{priceInsights?.storeComparison.map((store) => (
							<div
								className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-3 rounded-xl bg-muted/40 px-3 py-2"
								key={store.storeId ?? store.storeName}
							>
								<div>
									<p className="text-sm font-semibold text-foreground">{store.storeName}</p>
									<p className="text-[11px] text-muted-foreground">
										{store.purchaseCount} pembelian
									</p>
								</div>
								<div className="text-[11px] text-muted-foreground">
									<p>Terakhir</p>
									<p className="font-semibold text-foreground">
										{formatCurrency(store.lastPrice)}
									</p>
								</div>
								<div className="text-[11px] text-muted-foreground">
									<p>Termurah</p>
									<p className="font-semibold text-foreground">
										{formatCurrency(store.lowestPrice)}
									</p>
								</div>
								<div className="text-right text-[11px] text-muted-foreground">
									{store.lastPurchaseAt
										? new Date(store.lastPurchaseAt).toLocaleDateString("id-ID")
										: "-"}
								</div>
							</div>
						))}
						{(priceInsights?.storeComparison.length ?? 0) === 0 && (
							<p className="text-sm text-muted-foreground">
								Belum ada histori pembelian per toko.
							</p>
						)}
					</div>
				</div>

				<div className="mb-4 rounded-2xl border border-border p-4">
					<p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Perbandingan Brand
					</p>
					<div className="space-y-2">
						{priceInsights?.brandComparison.map((brand) => (
							<div
								className="grid grid-cols-[1.3fr_1fr_auto] items-center gap-3 rounded-xl bg-muted/40 px-3 py-2"
								key={brand.brandName}
							>
								<div>
									<p className="text-sm font-semibold text-foreground">{brand.brandName}</p>
									<p className="text-[11px] text-muted-foreground">
										Toko terakhir: {brand.lastStoreName || "-"}
									</p>
								</div>
								<div className="text-[11px] text-muted-foreground">
									<p>Harga terakhir</p>
									<p className="font-semibold text-foreground">
										{formatCurrency(brand.lastPrice)}
									</p>
								</div>
								<div className="text-right text-[11px] text-muted-foreground">
									{brand.purchaseCount}x
								</div>
							</div>
						))}
						{(priceInsights?.brandComparison.length ?? 0) === 0 && (
							<p className="text-sm text-muted-foreground">
								Belum ada histori pembelian per brand.
							</p>
						)}
					</div>
				</div>

				<div className="mb-4 rounded-2xl border border-border p-4">
					<p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Produk Terkorelasi
					</p>
					<div className="space-y-2">
						{impact?.impact.impactedProducts?.slice(0, 8).map((product: any) => (
							<div
								className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2"
								key={`${product.productId}-${product.variantName || "base"}`}
							>
								<div>
									<p className="text-sm font-semibold text-foreground">{product.productName}</p>
									{product.variantName && (
										<p className="text-[11px] text-muted-foreground">Varian: {product.variantName}</p>
									)}
								</div>
								<span
									className={`rounded-full px-2 py-1 text-[10px] font-bold ${
										product.isAvailable
											? "bg-emerald-100 text-emerald-700"
											: "bg-slate-200 text-slate-700"
									}`}
								>
									{product.isAvailable ? "Aktif" : "Nonaktif"}
								</span>
							</div>
						))}
						{(impact?.impact.impactedProducts?.length ?? 0) === 0 && (
							<p className="text-sm text-muted-foreground">Belum ada produk terkait.</p>
						)}
					</div>
				</div>

				<div className="mb-4 rounded-2xl border border-border p-4">
					<p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Info Batch FIFO
					</p>
					<div className="overflow-hidden rounded-xl border border-border">
						<table className="w-full text-left text-xs">
							<thead className="bg-muted/40">
								<tr className="border-border border-b text-muted-foreground">
									<th className="px-3 py-2 font-semibold">Tanggal Masuk</th>
									<th className="px-3 py-2 font-semibold">Harga/Unit</th>
									<th className="px-3 py-2 text-right font-semibold">Sisa Stok</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{batches?.map((batch: any) => (
									<tr key={batch._id}>
										<td className="px-3 py-2 text-foreground">
											{new Date(batch.timestamp).toLocaleDateString("id-ID", {
												dateStyle: "medium",
											})}
										</td>
										<td className="px-3 py-2 text-foreground">
											{batch.costPerUnit ? formatCurrency(batch.costPerUnit) : "-"}
										</td>
										<td className="px-3 py-2 text-right font-semibold text-foreground">
											{batch.remainingQuantity} {item.unit}
										</td>
									</tr>
								))}
								{(batches?.length ?? 0) === 0 && (
									<tr>
										<td className="px-3 py-6 text-center text-muted-foreground" colSpan={3}>
											Tidak ada batch aktif.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
					<p className="mt-2 text-[11px] text-muted-foreground">
						FIFO: pemakaian otomatis mengurangi batch paling lama lebih dulu.
					</p>
				</div>

				<div className="rounded-2xl border border-border p-4">
					<p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Histori Pembelian Terbaru
					</p>
					<div className="space-y-2">
						{priceInsights?.recentPurchases.map((purchase) => (
							<div className="rounded-xl bg-muted/40 px-3 py-2" key={purchase.transactionId}>
								<div className="flex items-center justify-between gap-4">
									<div>
										<p className="text-xs font-semibold uppercase text-foreground">
											{purchase.brandName || "Tanpa brand"} · {purchase.storeName}
										</p>
										<p className="mt-1 text-[11px] text-muted-foreground">
											{purchase.purchaseQuantity != null
												? `${purchase.purchaseQuantity} ${purchase.purchaseUnit || item.unit}`
												: `${purchase.quantity} ${item.unit}`}
											{" · "}
											{formatCurrency(purchase.lineTotal)}
										</p>
									</div>
									<p className="text-xs font-bold text-emerald-600">
										{formatCurrency(purchase.costPerUnit)}
									</p>
								</div>
								<p className="mt-1 text-[11px] text-muted-foreground">
									{new Date(purchase.timestamp).toLocaleString("id-ID")}
								</p>
								{purchase.notes && (
									<p className="mt-1 text-[11px] text-muted-foreground">
										{purchase.notes}
									</p>
								)}
							</div>
						))}
						{(priceInsights?.recentPurchases.length ?? 0) === 0 && (
							<p className="text-sm text-muted-foreground">Belum ada histori pembelian.</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function RealtimePriceMonitorTable({
	data,
	onApplyReferencePrice,
}: {
	data: RealtimePriceMonitorData | undefined;
	onApplyReferencePrice: (
		row: RealtimePriceMonitorData["rows"][number]
	) => Promise<void>;
}) {
	const [trendFilter, setTrendFilter] = useState<"all" | "up" | "down">("all");
	const visibleRows = useMemo(() => {
		const rows = [...(data?.rows ?? [])];
		const filtered = rows.filter((row) => {
			if (trendFilter === "up") {
				return (row.priceDelta ?? 0) > 0;
			}
			if (trendFilter === "down") {
				return (row.priceDelta ?? 0) < 0;
			}
			return true;
		});
		return filtered.sort((left, right) => {
			const leftAbs = Math.abs(left.priceDelta ?? 0);
			const rightAbs = Math.abs(right.priceDelta ?? 0);
			if (rightAbs !== leftAbs) {
				return rightAbs - leftAbs;
			}
			return right.lastPurchaseAt - left.lastPurchaseAt;
		});
	}, [data?.rows, trendFilter]);

	return (
		<div className="rounded-xl border border-border/80 bg-card shadow-sm">
			<div className="border-border border-b px-4 py-3">
				<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Monitoring Harga Realtime
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Nama bahan yang sama otomatis digabung. Saat ada input baru, harga lama tertimpa
					oleh harga terbaru. Sumber: restock inventory + data pengeluaran.
				</p>
				<div className="mt-2 flex flex-wrap gap-2">
					<button
						className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
							trendFilter === "all"
								? "bg-foreground text-background"
								: "border border-border bg-background text-foreground"
						}`}
						onClick={() => setTrendFilter("all")}
						type="button"
					>
						Semua
					</button>
					<button
						className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
							trendFilter === "up"
								? "bg-rose-600 text-white"
								: "border border-border bg-background text-foreground"
						}`}
						onClick={() => setTrendFilter("up")}
						type="button"
					>
						Harga Naik
					</button>
					<button
						className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
							trendFilter === "down"
								? "bg-emerald-600 text-white"
								: "border border-border bg-background text-foreground"
						}`}
						onClick={() => setTrendFilter("down")}
						type="button"
					>
						Harga Turun
					</button>
				</div>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full table-fixed text-left text-[10px] md:text-[11px]">
					<colgroup>
						<col className="w-[18%]" />
						<col className="w-[12%]" />
						<col className="w-[12%]" />
						<col className="w-[12%]" />
						<col className="w-[11%]" />
						<col className="w-[12%]" />
						<col className="w-[10%]" />
						<col className="w-[13%]" />
					</colgroup>
					<thead className="bg-card">
						<tr className="border-border border-b text-muted-foreground">
							<th className="px-2.5 py-2 font-semibold">Nama (Dedup)</th>
							<th className="px-2 py-2 font-semibold">Satuan</th>
							<th className="px-2 py-2 font-semibold">Harga Terbaru</th>
							<th className="px-2 py-2 font-semibold">Harga Sebelumnya</th>
							<th className="px-2 py-2 font-semibold">Delta</th>
							<th className="px-2 py-2 font-semibold">Toko / Brand Terakhir</th>
							<th className="px-2 py-2 font-semibold">Cakupan</th>
							<th className="px-2 py-2 font-semibold">Update</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{!data &&
							Array.from({ length: 8 }).map((_, i) => (
								<tr key={i}>
									<td className="p-4">
										<Skeleton className="h-4 w-32" />
									</td>
									<td className="p-4">
										<Skeleton className="h-4 w-24" />
									</td>
									<td className="p-4">
										<Skeleton className="h-4 w-28" />
									</td>
									<td className="p-4">
										<Skeleton className="h-4 w-28" />
									</td>
									<td className="p-4">
										<Skeleton className="h-4 w-20" />
									</td>
									<td className="p-4">
										<Skeleton className="h-4 w-36" />
									</td>
									<td className="p-4">
										<Skeleton className="h-4 w-20" />
									</td>
									<td className="p-4">
										<Skeleton className="h-4 w-24" />
									</td>
								</tr>
							))}
						{visibleRows.map((row) => {
							const deltaTone =
								row.priceDelta == null
									? "text-muted-foreground"
									: row.priceDelta > 0
										? "text-rose-600"
										: row.priceDelta < 0
											? "text-emerald-600"
											: "text-muted-foreground";
							const conversionHint = buildConversionHint(
								row.unit,
								row.displayUnit,
								row.conversionFactor
							);
							return (
								<tr className="transition-colors hover:bg-muted/20" key={row.nameKey}>
									<td className="px-2.5 py-2 align-middle">
										<p className="font-semibold text-foreground">{row.ingredientName}</p>
										<p className="text-[10px] text-muted-foreground">{row.nameKey}</p>
									</td>
									<td className="px-2 py-2 align-middle text-muted-foreground">
										<p className="font-semibold text-foreground">{row.unit}</p>
										{conversionHint && <p className="text-[10px]">{conversionHint}</p>}
									</td>
									<td className="px-2 py-2 align-middle font-semibold text-foreground">
										{formatCurrency(row.lastPrice)}
									</td>
									<td className="px-2 py-2 align-middle text-muted-foreground">
										{formatCurrency(row.previousPrice)}
									</td>
									<td className={`px-2 py-2 align-middle font-semibold ${deltaTone}`}>
										{row.priceDelta == null ? "-" : formatCurrency(row.priceDelta)}
										{row.priceDelta != null && row.priceDelta !== 0 && (
											<p className="text-[10px]">
												{row.priceDelta > 0 ? "Naik" : "Turun"}
											</p>
										)}
									</td>
									<td className="px-2 py-2 align-middle text-muted-foreground">
										<p className="font-semibold text-foreground">
											{row.lastStoreName || "Tanpa toko"}
										</p>
										<p className="text-[10px]">
											{row.lastBrandName || "Tanpa brand"}
										</p>
									</td>
									<td className="px-2 py-2 align-middle text-muted-foreground">
										<p>{row.storeCount} toko</p>
										<p>{row.brandCount} brand</p>
									</td>
									<td className="px-2 py-2 align-middle text-muted-foreground">
										<p>{new Date(row.lastPurchaseAt).toLocaleDateString("id-ID")}</p>
										<p className="text-[10px]">
											{new Date(row.lastPurchaseAt).toLocaleTimeString("id-ID")}
										</p>
										<button
											className="mt-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-semibold text-foreground hover:bg-muted"
											onClick={() => void onApplyReferencePrice(row)}
											type="button"
										>
											Pakai Harga Ini
										</button>
									</td>
								</tr>
							);
						})}
						{data && visibleRows.length === 0 && (
							<tr>
								<td className="p-8 text-center text-muted-foreground" colSpan={8}>
									Belum ada data harga realtime.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			{data && (
				<div className="border-border border-t px-4 py-2 text-[11px] text-muted-foreground">
					{data.summary.totalUniqueNames} nama unik dari{" "}
					{data.summary.totalRawTransactions} transaksi (restock + pengeluaran). Baris
					pengeluaran terproses: {data.summary.totalExpenseLines}.
				</div>
			)}
		</div>
	);
}

function YumiAiInventoryPanel({
	data,
}: {
	data: InventoryYumiAiInsightsData | undefined;
}) {
	const [activeSection, setActiveSection] = useState<
		"stockout" | "supplier" | "anomaly"
	>("stockout");
	const [keyword, setKeyword] = useState("");
	const normalizedKeyword = keyword.trim().toLowerCase();
	const stockoutRows = useMemo(
		() =>
			(data?.stockoutPredictions ?? []).filter((row) =>
				row.ingredientName.toLowerCase().includes(normalizedKeyword)
			),
		[data?.stockoutPredictions, normalizedKeyword]
	);
	const supplierRows = useMemo(
		() =>
			(data?.supplierIntelligence ?? []).filter((row) =>
				row.ingredientName.toLowerCase().includes(normalizedKeyword)
			),
		[data?.supplierIntelligence, normalizedKeyword]
	);
	const anomalyRows = useMemo(
		() =>
			(data?.usageAnomalies ?? []).filter((row) =>
				row.ingredientName.toLowerCase().includes(normalizedKeyword)
			),
		[data?.usageAnomalies, normalizedKeyword]
	);

	return (
		<div className="space-y-3">
			<div className="rounded-xl border border-border/80 bg-card px-4 py-3 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Yumi AI Inventory Assistant
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Fokus aksi cepat: prediksi habis, rekomendasi supplier, dan anomali pemakaian.
						</p>
					</div>
					{data && (
						<p className="text-xs text-muted-foreground">
							Updated {new Date(data.summary.refreshedAt).toLocaleString("id-ID")}
						</p>
					)}
				</div>
				<div className="mt-3 grid gap-2 md:grid-cols-3">
					<button
						className={`rounded-lg border px-3 py-2 text-left ${
							activeSection === "stockout"
								? "border-rose-200 bg-rose-50"
								: "border-border bg-background"
						}`}
						onClick={() => setActiveSection("stockout")}
						type="button"
					>
						<p className="text-xs font-semibold text-foreground">Prediksi Stok Habis</p>
						<p className="text-[11px] text-muted-foreground">
							{data?.summary.predictionCount ?? "-"} item
						</p>
					</button>
					<button
						className={`rounded-lg border px-3 py-2 text-left ${
							activeSection === "supplier"
								? "border-emerald-200 bg-emerald-50"
								: "border-border bg-background"
						}`}
						onClick={() => setActiveSection("supplier")}
						type="button"
					>
						<p className="text-xs font-semibold text-foreground">Supplier Intelligence</p>
						<p className="text-[11px] text-muted-foreground">
							{data?.summary.supplierInsightCount ?? "-"} insight
						</p>
					</button>
					<button
						className={`rounded-lg border px-3 py-2 text-left ${
							activeSection === "anomaly"
								? "border-amber-200 bg-amber-50"
								: "border-border bg-background"
						}`}
						onClick={() => setActiveSection("anomaly")}
						type="button"
					>
						<p className="text-xs font-semibold text-foreground">Anomali Pemakaian</p>
						<p className="text-[11px] text-muted-foreground">
							{data?.summary.anomalyCount ?? "-"} anomali
						</p>
					</button>
				</div>
			</div>

			<div className="rounded-xl border border-border/80 bg-card shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-3 py-2">
					<p className="text-xs font-semibold text-foreground">
						{activeSection === "stockout"
							? "Prediksi Stok Habis + Reorder Recommendation"
							: activeSection === "supplier"
								? "Harga Supplier Intelligence"
								: "Anomali Pemakaian"}
					</p>
					<div className="relative w-full max-w-xs">
						<Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<input
							className="w-full rounded-md border border-border bg-background py-1.5 pr-2 pl-8 text-xs outline-none"
							onChange={(event) => setKeyword(event.target.value)}
							placeholder="Cari bahan..."
							value={keyword}
						/>
					</div>
				</div>
				<div className="max-h-[500px] overflow-auto">
					{!data && (
						<div className="space-y-2 p-3">
							{Array.from({ length: 8 }).map((_, i) => (
								<Skeleton className="h-10 w-full" key={i} />
							))}
						</div>
					)}
					{data && activeSection === "stockout" && (
						<table className="w-full table-fixed text-left text-[11px]">
							<thead className="bg-muted/30">
								<tr className="border-border border-b text-muted-foreground">
									<th className="px-3 py-2 font-semibold">Bahan</th>
									<th className="px-3 py-2 font-semibold">Stok & Usage</th>
									<th className="px-3 py-2 font-semibold">Prediksi Habis</th>
									<th className="px-3 py-2 font-semibold">Saran Reorder</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{stockoutRows.map((row) => {
									const urgencyTone =
										row.urgency === "high"
											? "bg-rose-100 text-rose-700"
											: row.urgency === "medium"
												? "bg-amber-100 text-amber-700"
												: "bg-emerald-100 text-emerald-700";
									return (
										<tr className="hover:bg-muted/20" key={row.inventoryId}>
											<td className="px-3 py-2 font-semibold text-foreground">
												{row.ingredientName}
											</td>
											<td className="px-3 py-2 text-muted-foreground">
												{row.currentStock} {row.unit} · {row.avgDailyUsage}/hari
											</td>
											<td className="px-3 py-2">
												<span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${urgencyTone}`}>
													{row.urgency.toUpperCase()}
												</span>
												<p className="mt-1 text-muted-foreground">
													{row.daysUntilStockout == null ? "-" : `${row.daysUntilStockout} hari`}
												</p>
											</td>
											<td className="px-3 py-2 text-muted-foreground">
												ROP {row.reorderPoint} · Order {row.suggestedOrderQty}
											</td>
										</tr>
									);
								})}
								{stockoutRows.length === 0 && (
									<tr>
										<td className="p-6 text-center text-muted-foreground" colSpan={4}>
											Belum ada data prediksi.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					)}
					{data && activeSection === "supplier" && (
						<table className="w-full table-fixed text-left text-[11px]">
							<thead className="bg-muted/30">
								<tr className="border-border border-b text-muted-foreground">
									<th className="px-3 py-2 font-semibold">Bahan</th>
									<th className="px-3 py-2 font-semibold">Harga Terakhir</th>
									<th className="px-3 py-2 font-semibold">Supplier Rekomendasi</th>
									<th className="px-3 py-2 font-semibold">Potensi Hemat</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{supplierRows.map((row) => (
									<tr className="hover:bg-muted/20" key={row.inventoryId}>
										<td className="px-3 py-2 font-semibold text-foreground">{row.ingredientName}</td>
										<td className="px-3 py-2 text-muted-foreground">
											{formatCurrency(row.lastPrice)}
											<p className="text-[10px]">{row.lastStoreName || "Tanpa toko"}</p>
										</td>
										<td className="px-3 py-2 text-muted-foreground">
											{row.recommendedStoreName || "-"}
											<p className="text-[10px]">{formatCurrency(row.recommendedPrice)}</p>
										</td>
										<td className="px-3 py-2 font-semibold text-emerald-700">
											{formatCurrency(row.potentialSavings)}
										</td>
									</tr>
								))}
								{supplierRows.length === 0 && (
									<tr>
										<td className="p-6 text-center text-muted-foreground" colSpan={4}>
											Belum ada insight supplier.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					)}
					{data && activeSection === "anomaly" && (
						<table className="w-full table-fixed text-left text-[11px]">
							<thead className="bg-muted/30">
								<tr className="border-border border-b text-muted-foreground">
									<th className="px-3 py-2 font-semibold">Bahan</th>
									<th className="px-3 py-2 font-semibold">Perubahan 7d vs 30d</th>
									<th className="px-3 py-2 font-semibold">Keterangan</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{anomalyRows.map((row) => (
									<tr className="hover:bg-muted/20" key={row.inventoryId}>
										<td className="px-3 py-2 font-semibold text-foreground">{row.ingredientName}</td>
										<td className="px-3 py-2 text-muted-foreground">
											7d {row.avgDailyUsage7d}/hari · 30d {row.avgDailyUsage30d}/hari
										</td>
										<td className="px-3 py-2 text-muted-foreground">{row.reason}</td>
									</tr>
								))}
								{anomalyRows.length === 0 && (
									<tr>
										<td className="p-6 text-center text-muted-foreground" colSpan={3}>
											Belum ada anomali terdeteksi.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					)}
				</div>
			</div>
		</div>
	);
}

function InventoryTable({
	filteredRows,
	onSort,
	sortConfig,
	tableMode,
	onSelectedItemChange,
	onDetailItemChange,
	onActionTypeChange,
	inventoryMap,
	stores,
	viewPreset,
	unitOptions,
}: {
	filteredRows: InventoryWorkspaceRow[];
	onSort: (
		key:
			| "ingredientName"
			| "currentStock"
			| "lowStockThreshold"
			| "avgDailyUsage"
			| "daysUntilStockout"
	) => void;
	sortConfig: {
		key:
			| "ingredientName"
			| "currentStock"
			| "lowStockThreshold"
			| "avgDailyUsage"
			| "daysUntilStockout";
		direction: "asc" | "desc";
	};
	tableMode: "simple" | "detail";
	onSelectedItemChange: (item: Doc<"inventory">) => void;
	onDetailItemChange: (item: Doc<"inventory">) => void;
	onActionTypeChange: (
		type:
			| "add"
			| "usage"
			| "edit"
			| "adjust"
			| "delete"
			| "history"
			| "create"
			| null
	) => void;
	inventoryMap: Map<Id<"inventory">, Doc<"inventory">>;
	stores: InventoryStore[];
	viewPreset: InventoryViewPreset;
	unitOptions: string[];
}) {
	const updateItemMutation = useMutation(api.inventory.updateInventoryItem);
	const applyStockAction = useMutation(api.inventory.applyInventoryStockAction);
	const createItemMutation = useMutation(api.inventory.createInventoryItem);
	const createStoreMutation = useMutation(api.inventory.createInventoryStore);
	const setReferencePriceMutation = useMutation(
		api.inventory.setInventoryReferencePrice
	);
	const suggestInventoryAutofill = useAction(api.inventory.suggestInventoryAutofill);
	const quickAddNameRef = useRef<HTMLInputElement | null>(null);
	const [savingKey, setSavingKey] = useState<string | null>(null);
	const [saveStateByRow, setSaveStateByRow] = useState<
		Record<string, "idle" | "saving" | "saved" | "error">
	>({});
	const [aiReview, setAiReview] = useState<{
		row: InventoryWorkspaceRow;
		item: Doc<"inventory">;
		result: InventoryAutofillActionResult;
	} | null>(null);
	const [aiFieldApply, setAiFieldApply] = useState<{
		unit: boolean;
		lowStockThreshold: boolean;
		defaultBrandName: boolean;
		conversion: boolean;
	}>({
		unit: true,
		lowStockThreshold: true,
		defaultBrandName: true,
		conversion: true,
	});
	const inventoryItems = useMemo(() => [...inventoryMap.values()], [inventoryMap]);
	const [inlineValues, setInlineValues] = useState<
		Record<
			string,
			{
				ingredientName: string;
				quantity: string;
				unit: string;
				lowStockThreshold: string;
				defaultBrandName: string;
				preferredStoreName: string;
				preferredPurchaseQuantity: string;
				preferredPurchaseUnit: string;
				displayUnit: string;
				conversionFactor: string;
				unitConversionsText: string;
			}
		>
	>({});
	const [priceDraftByRow, setPriceDraftByRow] = useState<Record<string, string>>(
		{}
	);
	const [quickAdd, setQuickAdd] = useState({
		ingredientName: "",
		quantity: "0",
		unit: "gram",
		lowStockThreshold: "100",
		defaultBrandName: "",
		displayUnit: "",
		conversionFactor: "",
		unitConversionsText: "",
	});

	const getCachedAutofill = (ingredientName: string) => {
		const cache = readJsonStorage<Record<string, AutofillCacheEntry>>(AUTOFILL_CACHE_KEY) ?? {};
		const key = normalizeLookupText(ingredientName);
		const hit = cache[key];
		if (!hit) {
			return null;
		}
		if (Date.now() - hit.updatedAt > AUTOFILL_CACHE_MAX_AGE_MS) {
			return null;
		}
		return hit.result;
	};

	const saveCachedAutofill = (ingredientName: string, result: InventoryAutofillActionResult) => {
		const cache = readJsonStorage<Record<string, AutofillCacheEntry>>(AUTOFILL_CACHE_KEY) ?? {};
		const key = normalizeLookupText(ingredientName);
		cache[key] = {
			updatedAt: Date.now(),
			result,
		};
		writeJsonStorage(AUTOFILL_CACHE_KEY, cache);
	};

	const getLearnedProfile = (ingredientName: string) => {
		const learned = readJsonStorage<
			Record<
				string,
				{
					unit: string;
					lowStockThreshold: number;
					defaultBrandName: string;
					displayUnit: string;
					conversionFactor: string;
					unitConversionsText: string;
				}
			>
		>(AUTOFILL_LEARN_KEY) ?? {};
		return learned[normalizeLookupText(ingredientName)] ?? null;
	};

	const saveLearnedProfile = (
		ingredientName: string,
		payload: {
			unit: string;
			lowStockThreshold: number;
			defaultBrandName: string;
			displayUnit: string;
			conversionFactor: string;
			unitConversionsText: string;
		}
	) => {
		const learned = readJsonStorage<Record<string, typeof payload>>(AUTOFILL_LEARN_KEY) ?? {};
		learned[normalizeLookupText(ingredientName)] = payload;
		writeJsonStorage(AUTOFILL_LEARN_KEY, learned);
	};

	useEffect(() => {
		quickAddNameRef.current?.focus();
	}, []);

	const createInventoryFromDraft = async (draft: {
		ingredientName: string;
		quantity: string;
		unit: string;
		lowStockThreshold: string;
		defaultBrandName: string;
		displayUnit?: string;
		conversionFactor?: string;
		unitConversionsText: string;
	}) => {
		const ingredientName = draft.ingredientName.trim();
		const normalizedUnit = normalizeUnitOption(draft.unit);
		const quantity = Number(draft.quantity);
		const lowStockThreshold = Number(draft.lowStockThreshold);
		const conversionFactor = Number(draft.conversionFactor || "");
		const displayUnit = (draft.displayUnit || "").trim().toLowerCase();
		const parsedUnitConversions = parseUnitConversionsText(draft.unitConversionsText);
		const primaryConversion = getPrimaryConversionFromChain(parsedUnitConversions);

		if (!ingredientName) {
			throw new Error("Nama bahan wajib diisi");
		}
		if (!normalizedUnit) {
			throw new Error("Satuan wajib diisi");
		}
		if (Number.isNaN(quantity) || quantity < 0) {
			throw new Error("Stok awal tidak valid");
		}
		if (Number.isNaN(lowStockThreshold) || lowStockThreshold < 0) {
			throw new Error("Ambang stok tidak valid");
		}
		if (normalizedUnit === "pcs") {
			const hasLegacyConversion =
				displayUnit &&
				!Number.isNaN(conversionFactor) &&
				conversionFactor > 0;
			const hasChainConversion = (parsedUnitConversions?.length ?? 0) > 0;
			if (!hasLegacyConversion && !hasChainConversion) {
				throw new Error(
					`"${ingredientName}" perlu konversi pcs, contoh gram:200 atau dus:12`
				);
			}
		}

		await createItemMutation({
			ingredientName,
			unit: normalizedUnit,
			quantity,
			lowStockThreshold,
			defaultBrandName: draft.defaultBrandName.trim() || undefined,
			displayUnit:
				primaryConversion.displayUnit || displayUnit || undefined,
			conversionFactor:
				primaryConversion.conversionFactor ||
				(!Number.isNaN(conversionFactor) && conversionFactor > 0
					? conversionFactor
					: undefined),
			unitConversions: parsedUnitConversions,
		});
	};

	const applySuggestionFromExisting = (
		ingredientName: string,
		options?: { silent?: boolean }
	) => {
		const keyword = normalizeLookupText(ingredientName);
		if (!keyword) {
			return;
		}
		const matched = [...inventoryItems]
			.map((item) => ({
				item,
				score: getNameMatchScore(
					keyword,
					normalizeLookupText(item.ingredientName || "")
				),
			}))
			.sort((left, right) => right.score - left.score)[0];
		if (!matched || matched.score < 60) {
			if (ingredientName.trim() && !options?.silent) {
				toast.message("Belum ada referensi item mirip untuk autofill");
			}
			return;
		}
		const source = matched.item;
		setQuickAdd((prev) => ({
			...prev,
			defaultBrandName: prev.defaultBrandName || source.defaultBrandName || "",
			unit: source.unit || prev.unit,
			lowStockThreshold:
				prev.lowStockThreshold && prev.lowStockThreshold !== "0"
					? prev.lowStockThreshold
					: String(source.lowStockThreshold ?? 100),
			unitConversionsText:
				prev.unitConversionsText ||
				formatUnitConversionsText(
					source.unitConversions,
					source.displayUnit,
					source.conversionFactor
				),
		}));
		if (!options?.silent) {
			toast.success(`Autofill dari referensi "${source.ingredientName}"`);
		}
	};

	const getInlineValue = (row: InventoryWorkspaceRow) =>
		inlineValues[row.inventoryId] ?? {
			ingredientName: row.ingredientName,
			quantity: String(row.currentStock),
			unit: row.unit,
			lowStockThreshold: String(row.lowStockThreshold),
			defaultBrandName: row.defaultBrandName ?? "",
			preferredStoreName: row.lastPurchaseStoreName || row.preferredStoreName || "",
			preferredPurchaseQuantity:
				row.latestTransaction?.purchaseQuantity != null
					? String(row.latestTransaction.purchaseQuantity)
					: row.preferredPurchaseQuantity != null
						? String(row.preferredPurchaseQuantity)
						: "",
			preferredPurchaseUnit:
				normalizeUnitOption(row.latestTransaction?.purchaseUnit) ||
				normalizeUnitOption(row.preferredPurchaseUnit) ||
				"",
			displayUnit: row.displayUnit ?? "",
			conversionFactor:
				typeof row.conversionFactor === "number" && row.conversionFactor > 0
					? String(row.conversionFactor)
					: "",
			unitConversionsText: formatUnitConversionsText(
				row.unitConversions,
				row.displayUnit,
				row.conversionFactor
			),
		};

	const setInlineField = (
		row: InventoryWorkspaceRow,
		field:
			| "ingredientName"
			| "quantity"
			| "unit"
			| "lowStockThreshold"
			| "defaultBrandName"
			| "preferredStoreName"
			| "preferredPurchaseQuantity"
			| "preferredPurchaseUnit"
			| "displayUnit"
			| "conversionFactor"
			| "unitConversionsText",
		value: string
	) => {
		setInlineValues((prev) => {
			const current = prev[row.inventoryId] ?? {
				ingredientName: row.ingredientName,
				quantity: String(row.currentStock),
				unit: row.unit,
				lowStockThreshold: String(row.lowStockThreshold),
				defaultBrandName: row.defaultBrandName ?? "",
				preferredStoreName: row.lastPurchaseStoreName || row.preferredStoreName || "",
				preferredPurchaseQuantity:
					row.latestTransaction?.purchaseQuantity != null
						? String(row.latestTransaction.purchaseQuantity)
						: row.preferredPurchaseQuantity != null
							? String(row.preferredPurchaseQuantity)
							: "",
				preferredPurchaseUnit:
					normalizeUnitOption(row.latestTransaction?.purchaseUnit) ||
					normalizeUnitOption(row.preferredPurchaseUnit) ||
					"",
				displayUnit: row.displayUnit ?? "",
				conversionFactor:
					typeof row.conversionFactor === "number" && row.conversionFactor > 0
						? String(row.conversionFactor)
						: "",
				unitConversionsText: formatUnitConversionsText(
					row.unitConversions,
					row.displayUnit,
					row.conversionFactor
				),
			};
			return {
				...prev,
				[row.inventoryId]: {
					...current,
					[field]: value,
				},
			};
		});
	};

	useEffect(() => {
		if (!filteredRows.length) {
			return;
		}
		setInlineValues((prev) => {
			let changed = false;
			const next = { ...prev };
			for (const row of filteredRows) {
				const existing = next[row.inventoryId];
				if (!existing) {
					continue;
				}
				const latestStoreName = (row.lastPurchaseStoreName || "").trim();
				const latestPurchaseQuantity = row.latestTransaction?.purchaseQuantity;
				const latestPurchaseUnit = normalizeUnitOption(row.latestTransaction?.purchaseUnit);
				let updated = existing;
				if (latestStoreName && latestStoreName !== updated.preferredStoreName) {
					updated = {
						...updated,
						preferredStoreName: latestStoreName,
					};
				}
				if (latestPurchaseQuantity != null) {
					const normalizedQty = String(latestPurchaseQuantity);
					if (normalizedQty !== updated.preferredPurchaseQuantity) {
						updated = {
							...updated,
							preferredPurchaseQuantity: normalizedQty,
						};
					}
				}
				if (latestPurchaseUnit && latestPurchaseUnit !== normalizeUnitOption(updated.preferredPurchaseUnit)) {
					updated = {
						...updated,
						preferredPurchaseUnit: latestPurchaseUnit,
					};
				}
				if (updated !== existing) {
					next[row.inventoryId] = updated;
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [filteredRows]);

	const saveMeta = async (row: InventoryWorkspaceRow) => {
		const item = inventoryMap.get(row.inventoryId);
		if (!item) {
			return;
		}
		const current = getInlineValue(row);
		const ingredientName = current.ingredientName.trim();
		const normalizedUnit = normalizeUnitOption(current.unit);
		const lowStockThresholdNum = Number(current.lowStockThreshold);
		const conversionFactorNum = Number(current.conversionFactor);
		const normalizedDisplayUnit = current.displayUnit.trim().toLowerCase();
		const preferredStoreName = current.preferredStoreName.trim();
		const preferredStoreNameNorm = preferredStoreName.toLowerCase();
		const preferredPurchaseQuantityRaw = current.preferredPurchaseQuantity.trim();
		const preferredPurchaseQuantityNum =
			preferredPurchaseQuantityRaw === "" ? null : Number(preferredPurchaseQuantityRaw);
		const preferredPurchaseUnit = normalizeUnitOption(current.preferredPurchaseUnit);
		const parsedUnitConversions = parseUnitConversionsText(current.unitConversionsText);
		const primaryConversion = getPrimaryConversionFromChain(parsedUnitConversions);
		if (!ingredientName) {
			toast.error("Nama bahan tidak boleh kosong");
			setInlineField(row, "ingredientName", row.ingredientName);
			return;
		}
		if (Number.isNaN(lowStockThresholdNum) || lowStockThresholdNum < 0) {
			toast.error("Ambang stok harus angka >= 0");
			setInlineField(row, "lowStockThreshold", String(row.lowStockThreshold));
			return;
		}
		if (!normalizedUnit) {
			toast.error("Satuan wajib diisi");
			setInlineField(row, "unit", row.unit);
			return;
		}
		if (
			preferredPurchaseQuantityNum != null &&
			(!Number.isFinite(preferredPurchaseQuantityNum) || preferredPurchaseQuantityNum <= 0)
		) {
			toast.error("Jml pembelian harus angka lebih dari 0");
			setInlineField(
				row,
				"preferredPurchaseQuantity",
				row.preferredPurchaseQuantity != null ? String(row.preferredPurchaseQuantity) : ""
			);
			return;
		}
		if (normalizedUnit === "pcs") {
			const hasLegacyConversion =
				normalizedDisplayUnit &&
				!Number.isNaN(conversionFactorNum) &&
				conversionFactorNum > 0;
			const hasChainConversion = (parsedUnitConversions?.length ?? 0) > 0;
			if (!hasLegacyConversion && !hasChainConversion) {
				toast.error(
					"Untuk unit pcs, isi minimal satu konversi (contoh: gram:200 atau dus:12)"
				);
				return;
			}
		}
		if (
			ingredientName === row.ingredientName &&
			normalizedUnit === row.unit &&
			lowStockThresholdNum === row.lowStockThreshold &&
			current.defaultBrandName.trim() === (row.defaultBrandName ?? "") &&
			preferredStoreNameNorm === (row.preferredStoreName ?? "").trim().toLowerCase() &&
			preferredPurchaseQuantityNum === row.preferredPurchaseQuantity &&
			preferredPurchaseUnit === normalizeUnitOption(row.preferredPurchaseUnit) &&
			(current.displayUnit.trim() || "") === (row.displayUnit ?? "") &&
			(current.conversionFactor
				? Number(current.conversionFactor)
				: undefined) === row.conversionFactor &&
			current.unitConversionsText.trim() ===
				formatUnitConversionsText(
					row.unitConversions,
					row.displayUnit,
					row.conversionFactor
				)
		) {
			return;
		}

		try {
			setSavingKey(`${row.inventoryId}:meta`);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "saving" }));
			const existingStore = stores.find(
				(store) => store.name.trim().toLowerCase() === preferredStoreNameNorm
			);
			const preferredStoreId =
				preferredStoreName === ""
					? undefined
					: existingStore?._id ??
						(await createStoreMutation({
							name: preferredStoreName,
						}));
			await updateItemMutation({
				id: item._id,
				ingredientName,
				unit: normalizedUnit,
				lowStockThreshold: lowStockThresholdNum,
				displayUnit:
					primaryConversion.displayUnit ||
					(current.displayUnit.trim() || undefined),
				conversionFactor:
					primaryConversion.conversionFactor ||
					(current.conversionFactor
						? Number(current.conversionFactor)
						: undefined),
				unitConversions: parsedUnitConversions,
				baseRecipeId: item.baseRecipeId || undefined,
				defaultBrandName: current.defaultBrandName.trim() || undefined,
				preferredStoreId,
				preferredPurchaseQuantity: preferredPurchaseQuantityNum ?? undefined,
				preferredPurchaseUnit: preferredPurchaseUnit || undefined,
			});
			saveLearnedProfile(ingredientName, {
				unit: normalizedUnit,
				lowStockThreshold: lowStockThresholdNum,
				defaultBrandName: current.defaultBrandName.trim(),
				displayUnit: (current.displayUnit || "").trim(),
				conversionFactor: (current.conversionFactor || "").trim(),
				unitConversionsText: (current.unitConversionsText || "").trim(),
			});
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "saved" }));
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Gagal menyimpan perubahan";
			toast.error(message);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "error" }));
		} finally {
			setSavingKey(null);
		}
	};

	const saveQuantity = async (row: InventoryWorkspaceRow) => {
		const item = inventoryMap.get(row.inventoryId);
		if (!item) {
			return;
		}
		const current = getInlineValue(row);
		const quantityNum = Number(current.quantity);
		if (Number.isNaN(quantityNum) || quantityNum < 0) {
			toast.error("Stok harus angka >= 0");
			setInlineField(row, "quantity", String(row.currentStock));
			return;
		}
		if (quantityNum === row.currentStock) {
			return;
		}

		try {
			setSavingKey(`${row.inventoryId}:qty`);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "saving" }));
			await applyStockAction({
				inventoryId: item._id,
				action: "adjust",
				quantity: quantityNum,
				notes: "Quick inline update",
			});
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "saved" }));
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Gagal menyimpan stok";
			toast.error(message);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "error" }));
		} finally {
			setSavingKey(null);
		}
	};

	const getPriceDraft = (row: InventoryWorkspaceRow) =>
		priceDraftByRow[row.inventoryId] ??
		(row.lastPurchasePrice != null ? String(row.lastPurchasePrice) : "");

	const saveReferencePrice = async (row: InventoryWorkspaceRow) => {
		const rawValue = getPriceDraft(row).trim();
		if (!rawValue) {
			setPriceDraftByRow((prev) => {
				const next = { ...prev };
				delete next[row.inventoryId];
				return next;
			});
			return;
		}

		const parsed = Number(rawValue);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			toast.error("Harga terakhir harus angka lebih dari 0");
			setPriceDraftByRow((prev) => ({
				...prev,
				[row.inventoryId]:
					row.lastPurchasePrice != null ? String(row.lastPurchasePrice) : "",
			}));
			return;
		}

		if (row.lastPurchasePrice != null && Math.abs(row.lastPurchasePrice - parsed) < 1e-9) {
			setPriceDraftByRow((prev) => {
				const next = { ...prev };
				delete next[row.inventoryId];
				return next;
			});
			return;
		}

		try {
			setSavingKey(`${row.inventoryId}:price`);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "saving" }));
			const inline = getInlineValue(row);
			await setReferencePriceMutation({
				inventoryId: row.inventoryId,
				price: parsed,
				notes: "Koreksi manual harga terakhir dari tabel inventory",
				brandName: inline.defaultBrandName?.trim() || undefined,
			});
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "saved" }));
			toast.success("Harga terakhir diperbarui");
			setPriceDraftByRow((prev) => {
				const next = { ...prev };
				delete next[row.inventoryId];
				return next;
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Gagal memperbarui harga terakhir";
			toast.error(message);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "error" }));
		} finally {
			setSavingKey(null);
		}
	};

	const quickCreate = async () => {
		try {
			setSavingKey("quick-add");
			await createInventoryFromDraft(quickAdd);
			setQuickAdd((prev) => ({
				...prev,
				ingredientName: "",
				quantity: "0",
				defaultBrandName: "",
				displayUnit: "",
				conversionFactor: "",
				unitConversionsText: "",
			}));
			quickAddNameRef.current?.focus();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Gagal menambah item";
			toast.error(message);
		} finally {
			setSavingKey(null);
		}
	};

	const requestAutofillSuggestion = async (
		ingredientName: string,
		options?: { forceRefresh?: boolean }
	) => {
		const learned = getLearnedProfile(ingredientName);
		if (learned && !options?.forceRefresh) {
			return {
				ok: true,
				message: "Saran dari pembelajaran lokal",
				suggestion: {
					unit: learned.unit,
					lowStockThreshold: learned.lowStockThreshold,
					defaultBrandName: learned.defaultBrandName,
					displayUnit: learned.displayUnit,
					conversionFactor: learned.conversionFactor
						? Number(learned.conversionFactor)
						: null,
					unitConversionsText: learned.unitConversionsText,
					confidence: 0.9,
					category: "learned",
					fieldConfidence: {
						unit: 0.9,
						lowStockThreshold: 0.9,
						defaultBrandName: 0.82,
						conversion: learned.unitConversionsText ? 0.9 : 0.62,
					},
					fieldReason: {
						unit: "Belajar dari edit manual sebelumnya",
						lowStockThreshold: "Belajar dari edit manual sebelumnya",
						defaultBrandName: "Belajar dari edit manual sebelumnya",
						conversion: "Belajar dari edit manual sebelumnya",
					},
					reason: "Saran dari pembelajaran lokal",
					conflictWarning: null,
				},
				fallbackPath: ["learned_profile"],
				refreshedAt: Date.now(),
				sources: [],
			} as InventoryAutofillActionResult;
		}
		const cached = getCachedAutofill(ingredientName);
		if (cached && !options?.forceRefresh) {
			return cached;
		}
		const result = (await suggestInventoryAutofill({
			ingredientName,
		})) as InventoryAutofillActionResult;
		if (result.ok) {
			saveCachedAutofill(ingredientName, result);
		}
		return result;
	};

	const quickAutofillFromAI = async () => {
		const ingredientName = quickAdd.ingredientName.trim();
		if (!ingredientName) {
			toast.error("Isi nama bahan dulu sebelum autofill AI");
			return;
		}
		try {
			setSavingKey("quick-ai");
			const result = await requestAutofillSuggestion(ingredientName);
			if (!result.ok || !result.suggestion) {
				toast.error(result.message || "Autofill AI belum menemukan saran");
				return;
			}
			const suggestion = result.suggestion;
			setQuickAdd((prev) => ({
				...prev,
				unit: normalizeUnitOption(suggestion.unit) || prev.unit,
				lowStockThreshold:
					prev.lowStockThreshold && prev.lowStockThreshold !== "0"
						? prev.lowStockThreshold
						: String(suggestion.lowStockThreshold || 100),
				defaultBrandName: prev.defaultBrandName || suggestion.defaultBrandName || "",
				displayUnit: prev.displayUnit || suggestion.displayUnit || "",
				conversionFactor:
					prev.conversionFactor ||
					(suggestion.conversionFactor != null
						? String(suggestion.conversionFactor)
						: ""),
				unitConversionsText:
					prev.unitConversionsText || suggestion.unitConversionsText || "",
			}));
			const confidencePercent = Math.round(suggestion.confidence * 100);
			toast.success(`Autofill AI ${confidencePercent}%: ${suggestion.reason}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Autofill AI gagal dijalankan";
			toast.error(message);
		} finally {
			setSavingKey(null);
		}
	};

	const applyAiAutofillForRow = async (
		row: InventoryWorkspaceRow,
		item: Doc<"inventory">
	) => {
		const ingredientName = (row.ingredientName || item.ingredientName || "").trim();
		if (!ingredientName) {
			toast.error("Nama bahan kosong, tidak bisa autofill AI");
			return;
		}
		try {
			setSavingKey(`${row.inventoryId}:ai`);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "saving" }));
			const result = await requestAutofillSuggestion(ingredientName);
			if (!result.ok || !result.suggestion) {
				toast.error(result.message || "Autofill AI belum menemukan saran");
				setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "error" }));
				return;
			}
			const suggestion = result.suggestion;
			setAiFieldApply({
				unit: normalizeUnitOption(suggestion.unit) !== normalizeUnitOption(item.unit),
				lowStockThreshold:
					Number(suggestion.lowStockThreshold || 0) > 0 &&
					Number(suggestion.lowStockThreshold) !== Number(item.lowStockThreshold),
				defaultBrandName:
					(suggestion.defaultBrandName || "").trim() !==
					(item.defaultBrandName || "").trim(),
				conversion:
					(suggestion.unitConversionsText || "").trim() !==
						formatUnitConversionsText(
							item.unitConversions,
							item.displayUnit,
							item.conversionFactor
						).trim() ||
					normalizeUnitOption(suggestion.displayUnit) !==
						normalizeUnitOption(item.displayUnit) ||
					(suggestion.conversionFactor || 0) !== (item.conversionFactor || 0),
			});
			setAiReview({ row, item, result });
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "idle" }));
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Autofill AI untuk baris gagal";
			toast.error(message);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "error" }));
		} finally {
			setSavingKey(null);
		}
	};

	const applyAiReviewSelection = async () => {
		if (!aiReview || !aiReview.result.suggestion) {
			return;
		}
		const { row, item } = aiReview;
		const suggestion = aiReview.result.suggestion;
		const parsedAiConversions = parseUnitConversionsText(suggestion.unitConversionsText || "");
		const nextUnit = aiFieldApply.unit
			? normalizeUnitOption(suggestion.unit) || item.unit
			: item.unit;
		const nextThreshold = aiFieldApply.lowStockThreshold
			? suggestion.lowStockThreshold > 0
				? suggestion.lowStockThreshold
				: item.lowStockThreshold
			: item.lowStockThreshold;
		const nextDisplayUnit = aiFieldApply.conversion
			? normalizeUnitOption(suggestion.displayUnit) || item.displayUnit || undefined
			: item.displayUnit || undefined;
		const nextConversionFactor = aiFieldApply.conversion
			? suggestion.conversionFactor != null && suggestion.conversionFactor > 0
				? suggestion.conversionFactor
				: item.conversionFactor || undefined
			: item.conversionFactor || undefined;
		const nextConversions = aiFieldApply.conversion
			? parsedAiConversions ?? item.unitConversions
			: item.unitConversions;
		try {
			setSavingKey(`${row.inventoryId}:ai-apply`);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "saving" }));
			await updateItemMutation({
				id: item._id,
				ingredientName: item.ingredientName,
				unit: nextUnit,
				lowStockThreshold: nextThreshold,
				displayUnit: nextDisplayUnit,
				conversionFactor: nextConversionFactor,
				unitConversions: nextConversions,
				baseRecipeId: item.baseRecipeId || undefined,
				defaultBrandName: aiFieldApply.defaultBrandName
					? (suggestion.defaultBrandName || "").trim() || item.defaultBrandName || undefined
					: item.defaultBrandName || undefined,
				preferredStoreId: item.preferredStoreId || undefined,
			});
			setInlineValues((prev) => ({
				...prev,
				[row.inventoryId]: {
					...(prev[row.inventoryId] ?? {
						ingredientName: row.ingredientName,
						quantity: String(row.currentStock),
						unit: row.unit,
						lowStockThreshold: String(row.lowStockThreshold),
						defaultBrandName: row.defaultBrandName ?? "",
						preferredStoreName:
							row.lastPurchaseStoreName || row.preferredStoreName || "",
						preferredPurchaseQuantity:
							row.latestTransaction?.purchaseQuantity != null
								? String(row.latestTransaction.purchaseQuantity)
								: row.preferredPurchaseQuantity != null
									? String(row.preferredPurchaseQuantity)
									: "",
						preferredPurchaseUnit:
							normalizeUnitOption(row.latestTransaction?.purchaseUnit) ||
							normalizeUnitOption(row.preferredPurchaseUnit) ||
							"",
						displayUnit: row.displayUnit ?? "",
						conversionFactor:
							typeof row.conversionFactor === "number" && row.conversionFactor > 0
								? String(row.conversionFactor)
								: "",
						unitConversionsText: formatUnitConversionsText(
							row.unitConversions,
							row.displayUnit,
							row.conversionFactor
						),
					}),
					unit: nextUnit,
					lowStockThreshold: String(nextThreshold),
					defaultBrandName: aiFieldApply.defaultBrandName
						? (suggestion.defaultBrandName || "").trim() || item.defaultBrandName || ""
						: item.defaultBrandName || "",
					displayUnit: nextDisplayUnit || "",
					conversionFactor: nextConversionFactor ? String(nextConversionFactor) : "",
					unitConversionsText: formatUnitConversionsText(
						nextConversions,
						nextDisplayUnit,
						nextConversionFactor
					),
				},
			}));
			saveLearnedProfile(item.ingredientName, {
				unit: nextUnit,
				lowStockThreshold: nextThreshold,
				defaultBrandName: aiFieldApply.defaultBrandName
					? (suggestion.defaultBrandName || "").trim()
					: item.defaultBrandName || "",
				displayUnit: nextDisplayUnit || "",
				conversionFactor: nextConversionFactor ? String(nextConversionFactor) : "",
				unitConversionsText: formatUnitConversionsText(
					nextConversions,
					nextDisplayUnit,
					nextConversionFactor
				),
			});
			const confidencePercent = Math.round(suggestion.confidence * 100);
			toast.success(`Autofill baris diterapkan (${confidencePercent}%)`);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "saved" }));
			setAiReview(null);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Gagal menerapkan autofill AI";
			toast.error(message);
			setSaveStateByRow((prev) => ({ ...prev, [row.inventoryId]: "error" }));
		} finally {
			setSavingKey(null);
		}
	};

	const bulkAutofillMissingRows = async () => {
		const candidates = filteredRows
			.filter((row) => {
				const item = inventoryMap.get(row.inventoryId);
				if (!item) {
					return false;
				}
				const missingBrand = !(item.defaultBrandName || "").trim();
				const missingConversion = hasMissingConversion({
					unit: item.unit,
					displayUnit: item.displayUnit,
					conversionFactor: item.conversionFactor,
					unitConversions: item.unitConversions,
				});
				return missingBrand || missingConversion;
			})
			.slice(0, 40);
		if (candidates.length === 0) {
			toast.message("Tidak ada baris prioritas untuk bulk autofill");
			return;
		}

		let updated = 0;
		let skipped = 0;
		for (const row of candidates) {
			const item = inventoryMap.get(row.inventoryId);
			if (!item) {
				continue;
			}
			const result = await requestAutofillSuggestion(item.ingredientName);
			if (!result.ok || !result.suggestion) {
				skipped += 1;
				continue;
			}
			const suggestion = result.suggestion;
			if (suggestion.confidence < 0.7) {
				skipped += 1;
				continue;
			}
			try {
				await updateItemMutation({
					id: item._id,
					ingredientName: item.ingredientName,
					unit: normalizeUnitOption(suggestion.unit) || item.unit,
					lowStockThreshold:
						suggestion.lowStockThreshold > 0
							? suggestion.lowStockThreshold
							: item.lowStockThreshold,
					displayUnit:
						normalizeUnitOption(suggestion.displayUnit) || item.displayUnit || undefined,
					conversionFactor:
						suggestion.conversionFactor != null && suggestion.conversionFactor > 0
							? suggestion.conversionFactor
							: item.conversionFactor || undefined,
					unitConversions:
						parseUnitConversionsText(suggestion.unitConversionsText || "") ??
						item.unitConversions,
					baseRecipeId: item.baseRecipeId || undefined,
					defaultBrandName:
						(suggestion.defaultBrandName || "").trim() ||
						item.defaultBrandName ||
						undefined,
					preferredStoreId: item.preferredStoreId || undefined,
				});
				updated += 1;
			} catch {
				skipped += 1;
			}
		}
		toast.success(`Bulk autofill selesai: ${updated} update, ${skipped} skip`);
	};

	const getStatusMeta = (status: InventoryWorkspaceRow["status"]) => {
		if (status === "critical") {
			return {
				label: "Kritis",
				tone: "border-rose-200 bg-rose-50 text-rose-700",
			};
		}
		if (status === "warning") {
			return {
				label: "Menipis",
				tone: "border-amber-200 bg-amber-50 text-amber-700",
			};
		}
		return {
			label: "Aman",
			tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
		};
	};

	return (
		<div className="rounded-xl border border-border/80 bg-card shadow-sm">
			<div>
				<div className="flex justify-end px-2.5 py-2">
					<button
						className="rounded-lg border border-border bg-background px-2.5 py-1 text-[10px] font-semibold text-foreground hover:bg-muted"
						onClick={() => void bulkAutofillMissingRows()}
						type="button"
					>
						Bulk Autofill Prioritas
					</button>
				</div>
				<datalist id="inventory-unit-options-table">
					{unitOptions.map((unit) => (
						<option key={unit} value={unit} />
					))}
				</datalist>
				<datalist id="inventory-name-suggestions">
					{inventoryItems.slice(0, 400).map((item) => (
						<option key={item._id} value={item.ingredientName} />
					))}
				</datalist>
				<div className="overflow-x-auto">
				<table
					className={`min-w-[1360px] w-full table-fixed text-left ${
						tableMode === "detail" ? "text-[9px] md:text-[10px]" : "text-[8px] md:text-[9px]"
					}`}
				>
					<colgroup>
						<col className="w-[16%]" />
						<col className="w-[10%]" />
						<col className="w-[9%]" />
						<col className="w-[7%]" />
						<col className="w-[8%]" />
						<col className="w-[5%]" />
						<col className="w-[7%]" />
						<col className="w-[7%]" />
						<col className="w-[7%]" />
						<col className="w-[7%]" />
						<col className="w-[8%]" />
						<col className="w-[8%]" />
						<col className="w-[8%]" />
						<col className="w-[11rem]" />
					</colgroup>
					<thead className="bg-card">
						<tr className="border-border border-b text-muted-foreground">
							<th
								className="sticky left-0 z-20 cursor-pointer border-border/70 border-r bg-card px-2.5 py-2 font-semibold shadow-[6px_0_10px_-8px_rgba(15,23,42,0.35)] transition-colors hover:text-foreground"
								onClick={() => onSort("ingredientName")}
							>
								<div className="flex items-center gap-1">
									Bahan
									{sortConfig.key === "ingredientName" &&
										(sortConfig.direction === "asc" ? (
											<ArrowUp className="h-3 w-3" />
										) : (
											<ArrowDown className="h-3 w-3" />
									))}
								</div>
							</th>
							<th className="px-2 py-1.5 font-semibold">
								Brand
							</th>
							<th className="px-2 py-1.5 font-semibold">Toko</th>
							<th className="px-2 py-1.5 text-center font-semibold">Ukuran</th>
							<th className="px-2 py-1.5 text-center font-semibold">Satuan Ukuran</th>
							<th
								className="cursor-pointer px-2 py-1.5 text-center font-semibold transition-colors hover:text-foreground"
								onClick={() => onSort("lowStockThreshold")}
							>
								<div className="flex items-center justify-center gap-1">
									Min
									{sortConfig.key === "lowStockThreshold" &&
										(sortConfig.direction === "asc" ? (
											<ArrowUp className="h-3 w-3" />
										) : (
											<ArrowDown className="h-3 w-3" />
										))}
								</div>
							</th>
							<th
								className="cursor-pointer px-2 py-1.5 text-center font-semibold transition-colors hover:text-foreground"
								onClick={() => onSort("currentStock")}
							>
								<div className="flex items-center justify-center gap-1">
									Stock
									{sortConfig.key === "currentStock" &&
										(sortConfig.direction === "asc" ? (
											<ArrowUp className="h-3 w-3" />
										) : (
											<ArrowDown className="h-3 w-3" />
									))}
								</div>
							</th>
							<th className="px-2 py-1.5 text-center font-semibold">Satuan Stok</th>
							<th className="px-2 py-1.5 text-center font-semibold">Jml Pembelian</th>
							<th className="px-2 py-1.5 text-center font-semibold">Satuan Beli</th>
							<th
								className="cursor-pointer px-2 py-1.5 font-semibold transition-colors hover:text-foreground"
								onClick={() => onSort("avgDailyUsage")}
							>
								<div className="flex items-center gap-1">
									Pemakaian
									{sortConfig.key === "avgDailyUsage" &&
										(sortConfig.direction === "asc" ? (
											<ArrowUp className="h-3 w-3" />
										) : (
											<ArrowDown className="h-3 w-3" />
									))}
								</div>
							</th>
							<th className="px-2 py-1.5 font-semibold">Harga Terakhir</th>
							<th className="px-2 py-1.5 font-semibold">Status</th>
							<th className="px-2 py-1.5 text-right font-semibold">Aksi</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						<tr className="bg-primary/[0.04]">
							<td className="px-2.5 py-1.5">
								<input
									ref={quickAddNameRef}
									className="w-full rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold outline-none focus:border-primary"
									list="inventory-name-suggestions"
									onBlur={(e) =>
										applySuggestionFromExisting(e.target.value, { silent: true })
									}
									onChange={(e) =>
										setQuickAdd((prev) => ({
											...prev,
											ingredientName: e.target.value,
										}))
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											void quickCreate();
										}
									}}
									placeholder="Tambah cepat: nama bahan"
									value={quickAdd.ingredientName}
								/>
							</td>
							<td className="px-2 py-1.5">
								<input
									className="w-full rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-semibold outline-none focus:border-primary"
									onChange={(e) =>
										setQuickAdd((prev) => ({
											...prev,
											defaultBrandName: e.target.value,
										}))
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											void quickCreate();
										}
									}}
									placeholder="Brand opsional"
									value={quickAdd.defaultBrandName}
								/>
							</td>
							<td className="px-2 py-1.5 text-center">
								<div className="text-[10px] text-muted-foreground">-</div>
							</td>
							<td className="px-2 py-1.5 text-center">
								<input
									className="mx-auto w-16 rounded-lg border border-border bg-background px-1.5 py-0.5 text-center text-[10px] font-semibold outline-none focus:border-primary"
									onChange={(e) =>
										setQuickAdd((prev) => ({
											...prev,
											conversionFactor: e.target.value,
										}))
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											void quickCreate();
										}
									}}
									placeholder="1000"
									type="number"
									value={quickAdd.conversionFactor}
								/>
							</td>
							<td className="px-2 py-1.5 text-center">
								<input
									className="mx-auto w-20 rounded-lg border border-border bg-background px-1.5 py-0.5 text-center text-[10px] font-semibold outline-none focus:border-primary"
									list="inventory-unit-options-table"
									onChange={(e) =>
										setQuickAdd((prev) => ({
											...prev,
											displayUnit: normalizeUnitOption(e.target.value),
										}))
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											void quickCreate();
										}
									}}
									placeholder="gram / ml"
									value={quickAdd.displayUnit}
								/>
							</td>
							<td className="px-2 py-1.5 text-center">
								<input
									className="mx-auto w-14 rounded-lg border border-border bg-background px-1.5 py-1 text-center font-semibold text-[10px] outline-none focus:border-primary"
									onChange={(e) =>
										setQuickAdd((prev) => ({
											...prev,
											lowStockThreshold: e.target.value,
										}))
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											void quickCreate();
										}
									}}
									type="number"
									value={quickAdd.lowStockThreshold}
								/>
							</td>
							<td className="px-2 py-1.5 text-center">
								<input
									className="mx-auto w-14 rounded-lg border border-border bg-background px-1.5 py-1 text-center font-semibold text-[10px] outline-none focus:border-primary"
									onChange={(e) =>
										setQuickAdd((prev) => ({ ...prev, quantity: e.target.value }))
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											void quickCreate();
										}
									}}
									type="number"
									value={quickAdd.quantity}
								/>
							</td>
							<td className="px-2 py-1.5 text-center">
								<input
									className="mx-auto w-16 rounded-lg border border-border bg-background px-1.5 py-0.5 text-center text-[10px] font-semibold outline-none focus:border-primary"
									list="inventory-unit-options-table"
									onChange={(e) =>
										setQuickAdd((prev) => ({
											...prev,
											unit: normalizeUnitOption(e.target.value),
										}))
									}
									placeholder="satuan"
									value={quickAdd.unit}
								/>
							</td>
							<td className="px-2 py-1.5 text-center"><div className="text-[10px] text-muted-foreground">-</div></td>
							<td className="px-2 py-1.5 text-center"><div className="text-[10px] text-muted-foreground">-</div></td>
							<td className="px-2 py-1.5"><div className="text-[10px] text-muted-foreground">-</div></td>
							<td className="px-2 py-1.5"><div className="text-[10px] text-muted-foreground">-</div></td>
							<td className="px-2 py-1.5">
								<div className="rounded-lg border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground">
									Autosave
								</div>
							</td>
							<td className="px-2 py-1.5 text-right">
								<div className="flex items-center justify-end gap-1.5">
									<button
										className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-semibold text-foreground hover:bg-muted"
										disabled={savingKey === "quick-ai"}
										onClick={() => void quickAutofillFromAI()}
										type="button"
									>
										{savingKey === "quick-ai" ? "AI mencari..." : "Autofill AI"}
									</button>
									<button
										className="rounded-lg bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground hover:brightness-110"
										disabled={savingKey === "quick-add"}
										onClick={() => void quickCreate()}
										type="button"
									>
										{savingKey === "quick-add" ? "Menyimpan..." : "Tambah Baris"}
									</button>
								</div>
							</td>
						</tr>
						{inventoryMap.size === 0 &&
							Array.from({ length: 8 }).map((_, i) => (
								<tr key={i}>
									<td className="p-4">
										<Skeleton className="h-4 w-32" />
									</td>
									<td className="p-4">
										<Skeleton className="h-8 w-24" />
									</td>
									<td className="p-4">
										<Skeleton className="mx-auto h-4 w-12" />
									</td>
									<td className="p-4">
										<Skeleton className="mx-auto h-4 w-20" />
									</td>
									<td className="p-4">
										<Skeleton className="mx-auto h-4 w-16" />
									</td>
									<td className="p-4">
										<Skeleton className="mx-auto h-8 w-16" />
									</td>
									<td className="p-4">
										<Skeleton className="mx-auto h-8 w-16" />
									</td>
									<td className="p-4">
										<Skeleton className="h-8 w-24" />
									</td>
									<td className="p-4">
										<Skeleton className="mx-auto h-4 w-12" />
									</td>
									<td className="p-4">
										<Skeleton className="mx-auto h-4 w-12" />
									</td>
									<td className="p-4">
										<Skeleton className="h-4 w-20" />
									</td>
									<td className="p-4">
										<Skeleton className="h-4 w-20" />
									</td>
									<td className="p-4">
										<Skeleton className="h-6 w-20" />
									</td>
									<td className="p-4 text-right">
										<Skeleton className="ml-auto h-8 w-24 rounded-lg" />
									</td>
								</tr>
							))}
						{inventoryMap.size > 0 &&
							filteredRows.length > 0 &&
							filteredRows.map((row, index) => {
								const item = inventoryMap.get(row.inventoryId);
								if (!item) {
									return null;
								}
								const inline = getInlineValue(row);
								const statusMeta = getStatusMeta(row.status);
								return (
									<tr
										className={`transition-colors hover:bg-muted/20 ${
											row.status === "critical"
												? "bg-rose-50/40"
												: row.status === "warning"
													? "bg-amber-50/30"
													: index % 2 === 0
														? "bg-background"
														: "bg-muted/[0.12]"
										}`}
										key={row.inventoryId}
									>
										<td className="sticky left-0 z-10 border-border/60 border-r bg-card px-2.5 py-1.5 align-middle shadow-[6px_0_10px_-8px_rgba(15,23,42,0.2)]">
											<input
												className={`w-full truncate rounded-lg border border-transparent bg-transparent px-1.5 py-1 font-bold leading-4 outline-none focus:border-border focus:bg-background ${
													tableMode === "simple" ? "text-[10px]" : "text-[11px]"
												}`}
												onBlur={() => void saveMeta(row)}
												onChange={(e) =>
													setInlineField(row, "ingredientName", e.target.value)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														void saveMeta(row);
														(e.target as HTMLInputElement).blur();
													}
												}}
												title={inline.ingredientName}
												value={inline.ingredientName}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle">
											<input
												className="w-full truncate rounded-lg border border-transparent bg-transparent px-1.5 py-1 font-semibold text-[10px] outline-none focus:border-border focus:bg-background"
												onBlur={() => void saveMeta(row)}
												onChange={(e) =>
													setInlineField(row, "defaultBrandName", e.target.value)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														void saveMeta(row);
														(e.target as HTMLInputElement).blur();
													}
												}}
												placeholder="-"
												value={inline.defaultBrandName}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle">
											<input
												className="w-full truncate rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-[10px] font-semibold text-foreground outline-none focus:border-border focus:bg-background"
												onBlur={() => void saveMeta(row)}
												onChange={(e) =>
													setInlineField(row, "preferredStoreName", e.target.value)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														void saveMeta(row);
														(e.target as HTMLInputElement).blur();
													}
												}}
												placeholder={row.lastPurchaseStoreName || row.preferredStoreName || "Toko"}
												value={inline.preferredStoreName}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle text-center">
											<input
												className="mx-auto w-16 rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-center text-[10px] font-semibold outline-none focus:border-border focus:bg-background"
												min={0}
												onBlur={() => void saveMeta(row)}
												onChange={(e) =>
													setInlineField(row, "conversionFactor", e.target.value)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														void saveMeta(row);
														(e.target as HTMLInputElement).blur();
													}
												}}
												placeholder={
													typeof row.unitConversions?.[0]?.factor === "number"
														? String(row.unitConversions?.[0]?.factor)
														: "-"
												}
												type="number"
												value={inline.conversionFactor}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle text-center">
											<input
												className="mx-auto w-20 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold text-[10px] text-muted-foreground outline-none focus:border-border focus:bg-background"
												list="inventory-unit-options-table"
												onBlur={() => void saveMeta(row)}
												onChange={(e) =>
													setInlineField(
														row,
														"displayUnit",
														normalizeUnitOption(e.target.value)
													)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														void saveMeta(row);
														(e.target as HTMLInputElement).blur();
													}
												}}
												placeholder={row.unitConversions?.[0]?.unit || "ml / gram"}
												value={inline.displayUnit}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle text-center">
											<input
												className="mx-auto w-12 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold text-[10px] outline-none focus:border-border focus:bg-background"
												onBlur={() => void saveMeta(row)}
												onChange={(e) =>
													setInlineField(row, "lowStockThreshold", e.target.value)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														void saveMeta(row);
														(e.target as HTMLInputElement).blur();
													}
												}}
												type="number"
												value={inline.lowStockThreshold}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle text-center">
											<input
												className="mx-auto w-14 rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-center font-mono text-[12px] font-bold outline-none focus:border-border focus:bg-background"
												onBlur={() => void saveQuantity(row)}
												onChange={(e) =>
													setInlineField(row, "quantity", e.target.value)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														void saveQuantity(row);
														(e.target as HTMLInputElement).blur();
													}
												}}
												type="number"
												value={inline.quantity}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle text-center">
											<input
												className="mx-auto w-16 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold text-[10px] text-muted-foreground outline-none focus:border-border focus:bg-background"
												list="inventory-unit-options-table"
												onBlur={() => void saveMeta(row)}
												onChange={(e) =>
													setInlineField(
														row,
														"unit",
														normalizeUnitOption(e.target.value)
													)
												}
												placeholder="unit"
												value={inline.unit}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle text-center">
											<input
												className="mx-auto w-16 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold text-[10px] outline-none focus:border-border focus:bg-background"
												min={0}
												onBlur={() => void saveMeta(row)}
												onChange={(e) =>
													setInlineField(
														row,
														"preferredPurchaseQuantity",
														e.target.value
													)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														void saveMeta(row);
														(e.target as HTMLInputElement).blur();
													}
												}}
												placeholder="-"
												type="number"
												value={inline.preferredPurchaseQuantity}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle text-center">
											<input
												className="mx-auto w-16 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-center font-semibold text-[10px] text-muted-foreground outline-none focus:border-border focus:bg-background"
												list="inventory-unit-options-table"
												onBlur={() => void saveMeta(row)}
												onChange={(e) =>
													setInlineField(
														row,
														"preferredPurchaseUnit",
														normalizeUnitOption(e.target.value)
													)
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														void saveMeta(row);
														(e.target as HTMLInputElement).blur();
													}
												}}
												placeholder="-"
												value={inline.preferredPurchaseUnit}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle text-[10px] text-muted-foreground">
											<span className="font-semibold text-foreground">
												{row.avgDailyUsage.toFixed(2)}/hari
											</span>
										</td>
										<td className="px-2 py-1.5 align-middle text-[10px] text-muted-foreground">
											<input
												className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-[11px] font-semibold text-foreground outline-none focus:border-border focus:bg-background"
												min={0}
												onBlur={() => void saveReferencePrice(row)}
												onChange={(e) =>
													setPriceDraftByRow((prev) => ({
														...prev,
														[row.inventoryId]: e.target.value,
													}))
												}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														void saveReferencePrice(row);
														(e.target as HTMLInputElement).blur();
													}
												}}
												placeholder={
													row.lastPurchasePrice == null ? "Isi harga" : undefined
												}
												step="0.01"
												type="number"
												value={getPriceDraft(row)}
											/>
										</td>
										<td className="px-2 py-1.5 align-middle">
											<div className="flex items-center gap-1.5 whitespace-nowrap text-[10px]">
												<span
													className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${statusMeta.tone}`}
												>
													{row.status === "critical" && (
														<AlertCircle className="h-3.5 w-3.5" />
													)}
													{statusMeta.label}
												</span>
												<span className="text-muted-foreground">
													{row.latestTransaction?.timestamp
														? new Date(row.latestTransaction.timestamp).toLocaleDateString("id-ID")
														: "-"}
												</span>
											</div>
										</td>
										<td className="px-2 py-1.5 align-middle text-right">
											<div className="flex items-center justify-end gap-1 whitespace-nowrap">
												<button
													className={
														tableMode === "simple"
															? "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
															: "inline-flex items-center justify-center rounded-lg border border-border/90 bg-background p-0.5 text-foreground shadow-[inset_0_0_0_1px_rgba(15,23,42,0.03)] transition-colors hover:bg-muted"
													}
													onClick={() => void applyAiAutofillForRow(row, item)}
													title="Autofill AI"
													type="button"
												>
													<Settings2
														className={
															tableMode === "simple"
																? "h-4 w-4 text-slate-700"
																: "h-3.5 w-3.5 text-foreground"
														}
													/>
												</button>
												<button
													className={
														tableMode === "simple"
															? "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
															: "inline-flex items-center justify-center rounded-lg border border-border/90 bg-background p-0.5 text-foreground shadow-[inset_0_0_0_1px_rgba(15,23,42,0.03)] transition-colors hover:bg-muted"
													}
													onClick={() => onDetailItemChange(item)}
													title="Info"
													type="button"
												>
													<PanelRight
														className={
															tableMode === "simple"
																? "h-4 w-4 text-slate-700"
																: "h-3.5 w-3.5 text-foreground"
														}
													/>
												</button>
												<button
													className={
														tableMode === "simple"
															? "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
															: "inline-flex items-center justify-center rounded-lg border border-border/90 bg-background p-0.5 text-foreground shadow-[inset_0_0_0_1px_rgba(15,23,42,0.03)] transition-colors hover:bg-muted"
													}
													onClick={() => {
														onSelectedItemChange(item);
														onActionTypeChange("history");
													}}
													title="Riwayat"
													type="button"
												>
													<History
														className={
															tableMode === "simple"
																? "h-4 w-4 text-slate-700"
																: "h-3.5 w-3.5 text-foreground"
														}
													/>
												</button>
												<button
													className={
														tableMode === "simple"
															? "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-300 bg-rose-50 text-rose-600 shadow-sm transition-colors hover:bg-rose-100"
															: "inline-flex items-center justify-center rounded-lg border border-rose-200 bg-background p-0.5 text-rose-600 shadow-[inset_0_0_0_1px_rgba(225,29,72,0.05)] transition-colors hover:bg-rose-50"
													}
													onClick={() => {
														onSelectedItemChange(item);
														onActionTypeChange("delete");
													}}
													title="Hapus"
													type="button"
												>
													<Trash2
														className={
															tableMode === "simple"
																? "h-4 w-4 text-rose-600"
																: "h-3.5 w-3.5 text-rose-600"
														}
													/>
												</button>
											</div>
										</td>
									</tr>
								);
							})}
						{inventoryMap.size > 0 && filteredRows.length === 0 && (
							<tr>
								<td className="p-8 text-center text-muted-foreground" colSpan={14}>
									Tidak ada bahan baku ditemukan
								</td>
							</tr>
						)}
					</tbody>
				</table>
				</div>
			</div>
			{aiReview?.result.suggestion && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
					<div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-4 shadow-2xl">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
									Review Autofill AI
								</p>
								<p className="text-sm text-foreground">
									{aiReview.item.ingredientName} • confidence{" "}
									{Math.round(aiReview.result.suggestion.confidence * 100)}%
								</p>
								<p className="text-xs text-muted-foreground">
									{aiReview.result.suggestion.reason}
								</p>
								{aiReview.result.suggestion.conflictWarning && (
									<p className="mt-1 text-xs font-semibold text-amber-700">
										{aiReview.result.suggestion.conflictWarning}
									</p>
								)}
							</div>
							<button
								className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
								onClick={() => setAiReview(null)}
								type="button"
							>
								Tutup
							</button>
						</div>
						<div className="mt-3 space-y-2 rounded-lg border border-border p-3 text-xs">
							<label className="flex items-start gap-2">
								<input
									checked={aiFieldApply.unit}
									onChange={(event) =>
										setAiFieldApply((prev) => ({ ...prev, unit: event.target.checked }))
									}
									type="checkbox"
								/>
								<span>
									Unit: `{aiReview.item.unit}` → `
									{normalizeUnitOption(aiReview.result.suggestion.unit) || aiReview.item.unit}`
									{" • "}
									{Math.round((aiReview.result.suggestion.fieldConfidence?.unit ?? 0) * 100)}%
								</span>
							</label>
							<label className="flex items-start gap-2">
								<input
									checked={aiFieldApply.lowStockThreshold}
									onChange={(event) =>
										setAiFieldApply((prev) => ({
											...prev,
											lowStockThreshold: event.target.checked,
										}))
									}
									type="checkbox"
								/>
								<span>
									Threshold: `{aiReview.item.lowStockThreshold}` → `
									{aiReview.result.suggestion.lowStockThreshold || aiReview.item.lowStockThreshold}`
									{" • "}
									{Math.round(
										(aiReview.result.suggestion.fieldConfidence?.lowStockThreshold ?? 0) * 100
									)}
									%
								</span>
							</label>
							<label className="flex items-start gap-2">
								<input
									checked={aiFieldApply.defaultBrandName}
									onChange={(event) =>
										setAiFieldApply((prev) => ({
											...prev,
											defaultBrandName: event.target.checked,
										}))
									}
									type="checkbox"
								/>
								<span>
									Brand: `{aiReview.item.defaultBrandName || "-"}` → `
									{aiReview.result.suggestion.defaultBrandName || "-"}`
									{" • "}
									{Math.round(
										(aiReview.result.suggestion.fieldConfidence?.defaultBrandName ?? 0) * 100
									)}
									%
								</span>
							</label>
							<label className="flex items-start gap-2">
								<input
									checked={aiFieldApply.conversion}
									onChange={(event) =>
										setAiFieldApply((prev) => ({ ...prev, conversion: event.target.checked }))
									}
									type="checkbox"
								/>
								<span>
									Konversi/Takaran: `
									{formatUnitConversionsText(
										aiReview.item.unitConversions,
										aiReview.item.displayUnit,
										aiReview.item.conversionFactor
									) || "-"}
									` → `{aiReview.result.suggestion.unitConversionsText || "-"}`
									{" • "}
									{Math.round((aiReview.result.suggestion.fieldConfidence?.conversion ?? 0) * 100)}
									%
								</span>
							</label>
						</div>
						<div className="mt-3 rounded-lg border border-border p-3">
							<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
								Sumber
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Flow: {(aiReview.result.fallbackPath ?? []).join(" → ") || "-"}
							</p>
							<div className="mt-2 space-y-1 text-xs">
								{aiReview.result.sources.slice(0, 3).map((source) => (
									<div key={`${source.title}-${source.url}`}>
										<a
											className="font-semibold text-primary underline"
											href={source.url}
											rel="noreferrer"
											target="_blank"
										>
											{source.title}
										</a>
										<p className="text-muted-foreground">{source.snippet}</p>
									</div>
								))}
								{aiReview.result.sources.length === 0 && (
									<p className="text-muted-foreground">Sumber internal/cached.</p>
								)}
							</div>
						</div>
						<div className="mt-3 flex items-center justify-end gap-2">
							<button
								className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold"
								onClick={() => setAiReview(null)}
								type="button"
							>
								Batal
							</button>
							<button
								className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
								onClick={() => void applyAiReviewSelection()}
								type="button"
							>
								Apply Terpilih
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function InventoryHeader({
	advancedFilter,
	filterLowStock,
	onAdvancedFilterChange,
	onFilterLowStockChange,
	searchQuery,
	onSearchQueryChange,
	onTableModeChange,
	tableMode,
	viewPreset,
	onViewPresetChange,
}: {
	advancedFilter: "all" | "priceUp" | "missingConversion";
	filterLowStock: boolean;
	onAdvancedFilterChange: (val: "all" | "priceUp" | "missingConversion") => void;
	onFilterLowStockChange: (val: boolean) => void;
	searchQuery: string;
	onSearchQueryChange: (val: string) => void;
	onTableModeChange: (mode: "simple" | "detail") => void;
	tableMode: "simple" | "detail";
	viewPreset: InventoryViewPreset;
	onViewPresetChange: (preset: InventoryViewPreset) => void;
}) {
	return (
		<div className="rounded-xl border border-border bg-background px-3 py-3">
			<div className="flex flex-wrap items-center gap-2">
				<select
					className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none"
					onChange={(e) =>
						onViewPresetChange(e.target.value as InventoryViewPreset)
					}
					value={viewPreset}
				>
					<option value="operational">Operasional</option>
					<option value="priceMonitor">Monitoring Harga</option>
					<option value="yumiAi">Yumi AI</option>
				</select>
				<button
					className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
						filterLowStock
							? "border border-destructive/20 bg-destructive/10 text-destructive"
							: "border border-border bg-background text-muted-foreground hover:text-foreground"
					}`}
					disabled={viewPreset !== "operational"}
					onClick={() => onFilterLowStockChange(!filterLowStock)}
					type="button"
				>
					Kritis Saja
				</button>
				<select
					className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none"
					disabled={viewPreset !== "operational"}
					onChange={(e) =>
						onAdvancedFilterChange(
							e.target.value as "all" | "priceUp" | "missingConversion"
						)
					}
					value={advancedFilter}
				>
					<option value="all">Semua</option>
					<option value="priceUp">Harga Naik</option>
					<option value="missingConversion">Belum ada takaran</option>
				</select>
				<select
					className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none"
					disabled={viewPreset !== "operational"}
					onChange={(e) => onTableModeChange(e.target.value as "simple" | "detail")}
					value={tableMode}
				>
					<option value="simple">Mode Simple</option>
					<option value="detail">Mode Detail</option>
				</select>
				<div className="relative min-w-[260px] flex-1">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<input
						id="inventory-search-input"
						className="w-full rounded-lg border border-border bg-background py-2 pr-3 pl-9 text-sm outline-none transition-all focus:border-primary"
						onChange={(e) => onSearchQueryChange(e.target.value)}
						placeholder={
							viewPreset === "priceMonitor"
								? "Cari bahan, brand, toko..."
								: viewPreset === "yumiAi"
									? "Cari di tab Operasional/Monitoring..."
								: "Cari bahan atau satuan..."
						}
						value={searchQuery}
					/>
				</div>
			</div>
		</div>
	);
}
function InventoryHistoryModal({
	item,
	onClose,
}: {
	item: Doc<"inventory">;
	onClose: () => void;
}) {
	const transactions = useQuery(api.inventory.getInventoryTransactions, {
		inventoryId: item._id,
	});

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
			<motion.div
				animate={{ opacity: 1, scale: 1 }}
				className="w-full max-w-xl rounded-[40px] border border-border bg-card shadow-2xl"
				exit={{ opacity: 0, scale: 0.95 }}
				initial={{ opacity: 0, scale: 0.95 }}
			>
				<div className="flex items-center justify-between border-border border-b p-8 pb-4">
					<h3 className="font-bold text-2xl text-foreground tracking-tight">
						Riwayat: {item.ingredientName}
					</h3>
					<button
						className="rounded-full bg-muted p-2 text-foreground transition-all hover:bg-muted/80"
						onClick={onClose}
						type="button"
					>
						<Plus className="h-5 w-5 rotate-45" />
					</button>
				</div>
				<div className="p-8">
					<div className="max-h-[60vh] overflow-y-auto rounded-[32px] border border-border bg-muted/30">
						<table className="w-full text-left text-xs">
							<thead className="sticky top-0 border-border border-b bg-background border border-border">
								<tr className="text-foreground/40 uppercase tracking-widest">
									<th className="p-4 font-bold text-[9px]">Tanggal</th>
									<th className="p-4 font-bold text-[9px]">Tipe</th>
									<th className="p-4 text-right font-bold text-[9px]">
										Jumlah
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{transactions?.map((t: any) => (
									<tr
										className="transition-colors hover:bg-background border border-border/30"
										key={t._id}
									>
										<td className="whitespace-nowrap p-4 font-bold text-foreground/60">
											{new Date(t.timestamp).toLocaleString("id-ID", {
												dateStyle: "short",
												timeStyle: "short",
											})}
										</td>
										<td className="p-4">
											{(() => {
												const config = {
													restock: {
														label: "Restock",
														color: "bg-green-100 text-green-700",
													},
													usage: {
														label: "Penggunaan",
														color: "bg-red-100 text-red-700",
													},
													adjustment: {
														label: "Penyesuaian",
														color: "bg-blue-100 text-blue-700",
													},
													costing_reference: {
														label: "Referensi Biaya AI",
														color: "bg-cyan-100 text-cyan-700",
													},
												}[
													t.type as
														| "restock"
														| "usage"
														| "adjustment"
														| "costing_reference"
												] || {
													label: "Lainnya",
													color: "bg-gray-100 text-gray-700",
												};

												return (
													<div className="flex flex-col gap-1">
														<span
															className={`w-fit rounded-lg px-2 py-0.5 font-bold text-[9px] uppercase tracking-wider ${config.color}`}
														>
															{config.label}
														</span>
														{t.notes && (
															<span className="max-w-[140px] truncate text-foreground/40 text-[10px] italic">
																{t.notes}
															</span>
														)}
													</div>
												);
											})()}
										</td>
										<td
											className={`p-4 text-right font-black font-mono text-sm ${
												t.quantity > 0
													? "text-green-600"
													: t.quantity < 0
														? "text-destructive"
														: "text-cyan-700"
											}`}
										>
											{t.quantity > 0 ? "+" : ""}
											{t.quantity} {item.unit}
										</td>
									</tr>
								))}
								{transactions?.length === 0 && (
									<tr>
										<td
											className="p-12 text-center font-medium text-foreground/30 text-sm italic"
											colSpan={3}
										>
											Belum ada riwayat transaksi.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</motion.div>
		</div>
	);
}

