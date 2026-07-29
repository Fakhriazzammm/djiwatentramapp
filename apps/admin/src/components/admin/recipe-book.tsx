// @ts-nocheck
import { Link } from "@tanstack/react-router";
import type { Doc, Id } from "@/types/backend-compat";
import { convertToSmallestUnit, getSmallestUnitInfo, getSmallestUnitLabel } from "@/lib/inventory-units";
import {
	useHybridCreateBaseRecipe,
	useHybridDeleteBaseRecipe,
	useHybridDeleteRecipe,
	useHybridEnsureInventoryItemForBaseRecipe,
	useHybridSaveRecipe,
	useHybridUpdateBaseRecipe,
} from "@/hooks/use-hybrid-write-actions";
import {
	BookOpen,
	Calculator,
	CheckCircle2,
	ChevronRight,
	Edit,
	Eye,
	FileText,
	Package,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useHybridAllProducts,
	useHybridCategories,
	useHybridHppProductMap,
	useHybridInventory,
	useHybridLatestInventoryCosts,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridBaseRecipes,
	useHybridRecipes,
} from "@/hooks/use-hybrid-inventory-admin-data";
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export type BaseRecipeForm = {
	name: string;
	description: string;
	category: string;
	targetUnit: string;
	targetQuantity: string;
	ingredients: { inventoryId: Id<"inventory">; amount: number }[];
};

type ProductRecipeForm = {
	productId: string;
	ingredients: { inventoryId: Id<"inventory">; amount: number }[];
};

type InventoryCostMap = Record<
	string,
	{
		latestCostPerUnit?: number;
		avgCostPerUnit?: number;
	}
>;

const BASE_RECIPE_CATEGORIES = [
	"Base Susu",
	"Base Sauce",
	"Base Sirup",
	"Base Teh",
	"Kopi",
	"Dessert",
	"Lainnya",
];

function sortByName<T extends { name?: string; ingredientName?: string }>(rows: T[]) {
	return [...rows].sort((a, b) =>
		(a.name ?? a.ingredientName ?? "").localeCompare(
			b.name ?? b.ingredientName ?? "",
			"id"
		)
	);
}

function formatRupiah(value: number) {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(value);
}

function getRecipeAmountHint(item?: Doc<"inventory">) {
	if (!item) {
		return "Isi angka sesuai satuan bahan di inventory.";
	}
	const smallest = getSmallestUnitInfo(item);
	if (smallest && smallest.factor > 1) {
		return `Satuan recipe: ${smallest.unit}. Patokan: 1 ${item.unit} = ${smallest.factor} ${smallest.unit}.`;
	}
	return `Satuan recipe: ${smallest?.unit || item.unit} per porsi.`;
}

function HeaderCard({
	mode,
}: {
	mode: "manage" | "view";
}) {
	const isManage = mode === "manage";
	return (
		<div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div className="max-w-3xl">
					<p className="font-semibold text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
						Recipe Workspace
					</p>
					<h1 className="mt-2 text-2xl font-black tracking-tight text-foreground md:text-3xl">
						{isManage ? "Admin Recipe Studio" : "Buku Resep Operasional"}
					</h1>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						{isManage
							? "Kelola resep secara terpisah dari produk. Semua formula tetap terhubung ke inventory dan costing."
							: "Mode baca resep untuk barista dan kitchen. Fokus pada bahan, urutan langkah, dan final check."}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{isManage ? (
						<>
							<Link
								className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
								to="/admin/recipe/view"
							>
								<Eye className="h-4 w-4" /> Mode Baca
							</Link>
							<Link
								className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
								to="/admin/products"
							>
								<Package className="h-4 w-4" /> Produk
							</Link>
						</>
					) : (
						<>
							<Link
								className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
								to="/admin/recipe"
							>
								<BookOpen className="h-4 w-4" /> Kembali Kelola
							</Link>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

function StatGrid({
	items,
}: {
	items: { label: string; value: string | number; help: string }[];
}) {
	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			{items.map((item) => (
				<div className="rounded-xl border border-border bg-card p-4" key={item.label}>
					<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
						{item.label}
					</p>
					<p className="mt-2 text-2xl font-black tracking-tight text-foreground">
						{item.value}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">{item.help}</p>
				</div>
			))}
		</div>
	);
}

function tableCellSingleLine() {
	return "overflow-hidden text-ellipsis whitespace-nowrap";
}

function BaseRecipeTable({
	rows,
	onEdit,
	onDelete,
}: {
	rows: Doc<"baseRecipes">[];
	onEdit: (row: Doc<"baseRecipes">) => void;
	onDelete: (id: Id<"baseRecipes">) => void;
}) {
	return (
		<div className="rounded-2xl border border-border bg-card">
			<table className="w-full table-fixed text-sm">
				<colgroup>
					<col className="w-[26%]" />
					<col className="w-[16%]" />
					<col className="w-[16%]" />
					<col className="w-[12%]" />
					<col className="w-[18%]" />
				</colgroup>
				<thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
					<tr>
						<th className="px-3 py-2 text-left">Nama</th>
						<th className="px-3 py-2 text-left">Kategori</th>
						<th className="px-3 py-2 text-left">Target</th>
						<th className="px-3 py-2 text-left">Bahan</th>
						<th className="px-3 py-2 text-right">Aksi</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr className="border-b border-border/60 last:border-b-0" key={row._id}>
							<td className={`px-3 py-2 font-semibold text-xs ${tableCellSingleLine()}`}>{row.name}</td>
							<td className={`px-3 py-2 text-xs ${tableCellSingleLine()}`}>{row.category || "Lainnya"}</td>
							<td className={`px-3 py-2 text-xs ${tableCellSingleLine()}`}>
								{row.targetQuantity} {row.targetUnit}
							</td>
							<td className={`px-3 py-2 text-xs ${tableCellSingleLine()}`}>{row.ingredients.length} item</td>
							<td className="px-3 py-2">
								<div className="flex justify-end gap-1">
									<Button className="h-8 w-8 p-0" onClick={() => onEdit(row)} size="sm" type="button" variant="outline">
										<Edit className="h-4 w-4" />
									</Button>
									<Button className="h-8 w-8 p-0" onClick={() => onDelete(row._id)} size="sm" type="button" variant="destructive">
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</td>
						</tr>
					))}
					{rows.length === 0 && (
						<tr>
							<td className="px-3 py-10 text-center text-sm text-muted-foreground" colSpan={5}>
								Belum ada base recipe.
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

function ProductRecipeTable({
	rows,
	onEdit,
	onDelete,
}: {
	rows: {
		product: Doc<"products">;
		recipe: Doc<"recipes"> | null;
		categoryName: string;
		hpp: { hppPerServing: number; marginPercent: number } | null;
	}[];
	onEdit: (row: { product: Doc<"products">; recipe: Doc<"recipes"> | null }) => void;
	onDelete: (id: Id<"recipes">) => void;
}) {
	return (
		<div className="rounded-2xl border border-border bg-card">
			<table className="w-full table-fixed text-sm">
				<colgroup>
					<col className="w-[22%]" />
					<col className="w-[16%]" />
					<col className="w-[10%]" />
					<col className="w-[12%]" />
					<col className="w-[22%]" />
					<col className="w-[18%]" />
				</colgroup>
				<thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
					<tr>
						<th className="px-3 py-2 text-left">Produk</th>
						<th className="px-3 py-2 text-left">Kategori</th>
						<th className="px-3 py-2 text-left">Recipe</th>
						<th className="px-3 py-2 text-left">Komponen</th>
						<th className="px-3 py-2 text-left">HPP / Margin</th>
						<th className="px-3 py-2 text-right">Aksi</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr className="border-b border-border/60 last:border-b-0" key={row.product._id}>
							<td className={`px-3 py-2 font-semibold text-xs ${tableCellSingleLine()}`}>{row.product.name}</td>
							<td className={`px-3 py-2 text-xs ${tableCellSingleLine()}`}>{row.categoryName}</td>
							<td className={`px-3 py-2 text-xs ${tableCellSingleLine()}`}>
								{row.recipe ? "Siap" : "Belum"}
							</td>
							<td className={`px-3 py-2 text-xs ${tableCellSingleLine()}`}>
								{row.recipe?.ingredients.length ?? 0} item
							</td>
							<td className={`px-3 py-2 text-xs ${tableCellSingleLine()}`}>
								{row.hpp
									? `${formatRupiah(Math.round(row.hpp.hppPerServing))} | ${row.hpp.marginPercent.toFixed(0)}%`
									: "-"}
							</td>
							<td className="px-3 py-2">
								<div className="flex justify-end gap-1">
									<Button className="h-8 w-8 p-0" onClick={() => onEdit(row)} size="sm" type="button" variant="outline">
										<Edit className="h-4 w-4" />
									</Button>
									{row.recipe && (
										<Button
											className="h-8 w-8 p-0"
											onClick={() => onDelete(row.recipe!._id)}
											size="sm"
											type="button"
											variant="destructive"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									)}
								</div>
							</td>
						</tr>
					))}
					{rows.length === 0 && (
						<tr>
							<td className="px-3 py-10 text-center text-sm text-muted-foreground" colSpan={6}>
								Tidak ada produk sesuai filter.
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

export function IngredientEditor({
	inventory,
	baseRecipes = [],
	ingredients,
	setIngredients,
	latestInventoryCosts,
	ensureInventoryItemForBaseRecipe,
	sellingPrice,
}: {
	inventory: Doc<"inventory">[];
	baseRecipes?: Doc<"baseRecipes">[];
	ingredients: { inventoryId: Id<"inventory">; amount: number }[];
	setIngredients: (next: { inventoryId: Id<"inventory">; amount: number }[]) => void;
	latestInventoryCosts?: InventoryCostMap;
	ensureInventoryItemForBaseRecipe?: (args: {
		baseRecipeId: Id<"baseRecipes">;
	}) => Promise<{ inventoryId: Id<"inventory">; created: boolean }>;
	sellingPrice?: number;
}) {
	const [ingredientQuery, setIngredientQuery] = useState("");

	const sortedInventory = useMemo(() => sortByName(inventory), [inventory]);
	const sortedBaseRecipes = useMemo(() => sortByName(baseRecipes), [baseRecipes]);
	const filteredInventory = useMemo(() => {
		const keyword = ingredientQuery.trim().toLowerCase();
		if (!keyword) return sortedInventory;
		return sortedInventory.filter((item) =>
			`${item.ingredientName} ${getSmallestUnitLabel(item)}`.toLowerCase().includes(keyword)
		);
	}, [ingredientQuery, sortedInventory]);
	const filteredBaseRecipes = useMemo(() => {
		const keyword = ingredientQuery.trim().toLowerCase();
		if (!keyword) return sortedBaseRecipes;
		return sortedBaseRecipes.filter((recipe) =>
			`${recipe.name} ${recipe.category ?? ""}`.toLowerCase().includes(keyword)
		);
	}, [ingredientQuery, sortedBaseRecipes]);
	const totalEstimatedCost = useMemo(
		() =>
			ingredients.reduce((sum, ingredient) => {
				const costInfo = latestInventoryCosts?.[String(ingredient.inventoryId)];
				const unitCost = costInfo?.latestCostPerUnit;
				if (unitCost == null || unitCost <= 0) {
					return sum;
				}
				// Normalize ke base unit (gram/ml) via conversionFactor
				const cf = costInfo.conversionFactor;
				const baseUnitCost = cf != null && cf > 0 ? unitCost / cf : unitCost;
				return sum + baseUnitCost * ingredient.amount;
			}, 0),
		[ingredients, latestInventoryCosts]
	);

	const addIngredient = (inventoryId: Id<"inventory">) => {
		if (!inventoryId) return;
		if (ingredients.some((item) => item.inventoryId === inventoryId)) {
			toast.error("Bahan sudah ada");
			return;
		}
		setIngredients([...ingredients, { inventoryId, amount: 0 }]);
		setIngredientQuery("");
	};

	const baseRecipeLabel = (recipe: Doc<"baseRecipes">) =>
		`${recipe.name} [Base Recipe - ${recipe.targetQuantity} ${recipe.targetUnit}]`;

	const resolveIngredient = (rawValue: string) => {
		const value = rawValue.trim().toLowerCase();
		if (!value) return null;

		const exactInventory = sortedInventory.find(
			(item) =>
				item.ingredientName.toLowerCase() === value ||
				`${item.ingredientName} (${getSmallestUnitLabel(item)})`.toLowerCase() === value
		);
		if (exactInventory) {
			return {
				type: "inventory" as const,
				inventoryId: exactInventory._id as Id<"inventory">,
			};
		}

		const exactBaseRecipe = sortedBaseRecipes.find(
			(recipe) =>
				recipe.name.toLowerCase() === value ||
				baseRecipeLabel(recipe).toLowerCase() === value
		);
		if (exactBaseRecipe) {
			return {
				type: "baseRecipe" as const,
				baseRecipeId: exactBaseRecipe._id as Id<"baseRecipes">,
			};
		}

		const partialInventory = sortedInventory.find((item) =>
			`${item.ingredientName} ${getSmallestUnitLabel(item)}`.toLowerCase().includes(value)
		);
		if (partialInventory) {
			return {
				type: "inventory" as const,
				inventoryId: partialInventory._id as Id<"inventory">,
			};
		}

		const partialBaseRecipe = sortedBaseRecipes.find((recipe) =>
			`${recipe.name} ${recipe.category ?? ""}`.toLowerCase().includes(value)
		);
		if (partialBaseRecipe) {
			return {
				type: "baseRecipe" as const,
				baseRecipeId: partialBaseRecipe._id as Id<"baseRecipes">,
			};
		}

		return null;
	};

	const addIngredientFromQuery = async () => {
		const resolved = resolveIngredient(ingredientQuery);
		if (!resolved) {
			toast.error("Bahan atau base recipe tidak ditemukan");
			return;
		}

		if (resolved.type === "inventory") {
			addIngredient(resolved.inventoryId);
			return;
		}

		if (!ensureInventoryItemForBaseRecipe) {
			toast.error("Pilih base recipe hanya tersedia di recipe produk");
			return;
		}

		const linkedInventory = await ensureInventoryItemForBaseRecipe({
			baseRecipeId: resolved.baseRecipeId,
		});
		addIngredient(linkedInventory.inventoryId);
		if (linkedInventory.created) {
			toast.success("Base recipe ditambahkan ke inventory dan dipakai di recipe");
		}
	};

	return (
		<div className="space-y-3">
			<div className="space-y-2">
				<div className="flex gap-2">
					<Input
						className="h-10"
						list="ingredient-options"
						onChange={(event) => setIngredientQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key !== "Enter") return;
							event.preventDefault();
							void addIngredientFromQuery();
						}}
						placeholder="+ Tambah bahan atau base resep (ketik untuk cari)"
						value={ingredientQuery}
					/>
					<Button
						onClick={() => {
							void addIngredientFromQuery();
						}}
						type="button"
						variant="outline"
					>
						Tambah
					</Button>
				</div>
				<datalist id="ingredient-options">
					{filteredInventory.map((item) => (
						<option key={item._id} value={`${item.ingredientName} (${getSmallestUnitLabel(item)})`} />
					))}
					{filteredBaseRecipes.map((recipe) => (
						<option key={recipe._id} value={baseRecipeLabel(recipe)} />
					))}
				</datalist>
			</div>
			<div className="space-y-2">
				<p className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
					Input jumlah di recipe harus mengikuti satuan dasar inventory:{" "}
					<span className="font-semibold text-foreground">gram / ml / pcs</span> per porsi.
				</p>
				{ingredients.map((ingredient, index) => {
					const inv = inventory.find((item) => item._id === ingredient.inventoryId);
					const costInfo = latestInventoryCosts?.[String(ingredient.inventoryId)];
					const latestCost = costInfo?.latestCostPerUnit;
					const conversionFactor = costInfo?.conversionFactor;
					const displayUnit = costInfo?.displayUnit;
					const fallbackCost =
						typeof inv?.lastPurchasePrice === "number" && inv.lastPurchasePrice > 0
							? inv.lastPurchasePrice
							: undefined;
					const unitCost = latestCost ?? fallbackCost;
					// Normalize: latestCostPerUnit adalah per inventory unit (kg/L), konversi ke base unit (gram/ml)
					const costPerBaseUnit =
						unitCost != null && conversionFactor != null && conversionFactor > 0
							? unitCost / conversionFactor
							: unitCost;
					const lineCost = costPerBaseUnit != null ? costPerBaseUnit * ingredient.amount : null;
					return (
						<div className="grid gap-2 rounded-xl border border-border bg-background p-3 md:grid-cols-[1fr_130px_70px]" key={`${ingredient.inventoryId}-${index}`}>
							<div>
								<p className={`font-semibold ${tableCellSingleLine()}`}>{inv?.ingredientName || "-"}</p>
								<p className={`text-xs text-muted-foreground ${tableCellSingleLine()}`}>
									{unitCost != null && inv
										? <>{formatRupiah(Math.round(unitCost))}/{getSmallestUnitLabel(inv)}{conversionFactor != null && conversionFactor > 0 && displayUnit ? <> → {formatRupiah(Math.round(costPerBaseUnit ?? 0))}/{displayUnit}</> : ""} • {formatRupiah(Math.round(lineCost ?? 0))}</>
										: "Harga bahan belum tersedia di inventory"}
								</p>
								<p className={`text-[11px] text-muted-foreground ${tableCellSingleLine()}`}>
									{getRecipeAmountHint(inv)}
								</p>
							</div>
							<Input
								min="0"
								placeholder={inv ? `${getSmallestUnitLabel(inv)} / porsi` : "jumlah / porsi"}
								step="0.01"
								onChange={(event) => {
									const amount = Number(event.target.value);
									setIngredients(
										ingredients.map((item, itemIndex) =>
											itemIndex === index ? { ...item, amount } : item
										)
									);
								}}
								type="number"
								value={ingredient.amount}
							/>
							<Button
								onClick={() =>
									setIngredients(
										ingredients.filter((_, itemIndex) => itemIndex !== index)
									)
								}
								type="button"
								variant="outline"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					);
				})}
				{ingredients.length === 0 && (
					<p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
						Belum ada bahan.
					</p>
				)}
				{ingredients.length > 0 && (
					<div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
						Estimasi biaya bahan per porsi (berdasarkan satuan input recipe):{" "}
						<span className="font-semibold text-foreground">
							{formatRupiah(Math.round(totalEstimatedCost))}
						</span>{" "}
						(dari harga terbaru inventory)
					</div>
				)}
				{sellingPrice != null && sellingPrice > 0 && ingredients.length > 0 && totalEstimatedCost > 0 && (
					<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
						<span className="text-emerald-800">
							Harga Jual: <span className="font-semibold">{formatRupiah(Math.round(sellingPrice))}</span>
							{" • "}Margin:{" "}
							<span className={`font-semibold ${sellingPrice - totalEstimatedCost >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
								{formatRupiah(Math.round(sellingPrice - totalEstimatedCost))}
							</span>
							{" "}({((sellingPrice - totalEstimatedCost) / sellingPrice * 100).toFixed(0)}%)
						</span>
					</div>
				)}
			</div>
		</div>
	);
}


/* REMOVED: RecipeStudioPage - dead code, all CRUD is in recipe-matrix.tsx */

export function ModalScaffold({
	title,
	children,
	onClose,
}: {
	title: string;
	children: React.ReactNode;
	onClose: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" data-admin-modal-backdrop>
			<div
				className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl"
				data-admin-modal-card
			>
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-xl font-black tracking-tight">{title}</h3>
					<Button onClick={onClose} size="sm" type="button" variant="outline">
						<X className="h-4 w-4" />
					</Button>
				</div>
				{children}
			</div>
		</div>
	);
}

/* REMOVED: RecipeBookViewPage - consolidated into recipe-matrix.tsx */
