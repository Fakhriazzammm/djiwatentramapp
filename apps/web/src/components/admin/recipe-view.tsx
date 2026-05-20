// @ts-nocheck
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
	Search,
	BookOpen,
	ChevronRight,
	ChevronDown,
	FileText,
	Package,
	CheckCircle2,
	Beaker,
	Utensils,
	Scale,
	Clock,
	ShoppingBag,
	Coffee,
	Wrench,
	Flame,
	Droplets,
	Combine,
	Sparkles,
	Gauge,
	AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
	useHybridAllProducts,
	useHybridCategories,
	useHybridInventory,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridBaseRecipes,
	useHybridRecipes,
} from "@/hooks/use-hybrid-inventory-admin-data";
import { getSmallestUnitLabel } from "@/lib/inventory-units";

function cn(...classes: (string | false | null | undefined)[]) {
	return classes.filter(Boolean).join(" ");
}

// ─── Step Icon ──────────────────────────────────────────

function StepIcon({ iconName }: { iconName: string }) {
	const size = "h-3.5 w-3.5 shrink-0";
	switch (iconName) {
		case "coffee":
			return <Coffee className={`${size} text-amber-600`} />;
		case "grinder":
			return <Wrench className={`${size} text-gray-600`} />;
		case "scale":
			return <Scale className={`${size} text-blue-600`} />;
		case "espresso":
			return <Flame className={`${size} text-orange-600`} />;
		case "milk":
			return <Droplets className={`${size} text-sky-600`} />;
		case "pour":
			return <Combine className={`${size} text-emerald-600`} />;
		case "tool":
			return <Wrench className={`${size} text-gray-600`} />;
		case "thermometer":
			return <Gauge className={`${size} text-red-600`} />;
		case "timer":
			return <Clock className={`${size} text-purple-600`} />;
		case "garnish":
			return <Sparkles className={`${size} text-indigo-600`} />;
		default:
			return <Utensils className={`${size} text-primary/60`} />;
	}
}

// ─── Vertical Connector ─────────────────────────────────

function VerticalConnector() {
	return (
		<div className="absolute left-[17px] top-3 bottom-3 w-0.5 bg-border" />
	);
}

// ─── Step Card ──────────────────────────────────────────

function StepCard({ step, index, inventoryMap }) {
	return (
		<li className="relative pl-10 pb-6 last:pb-0">
			{/* Circle number */}
			<div className="absolute left-1 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground z-10">
				{index + 1}
			</div>
			{/* Content card */}
			<div className="rounded-lg border border-border bg-card p-3 space-y-2">
				<div className="flex items-center gap-2">
					{step.icon && <StepIcon iconName={step.icon} />}
					<h3 className="font-semibold text-xs">{step.title}</h3>
				</div>
				<p className="text-[11px] text-foreground/80 leading-relaxed">
					{step.description}
				</p>
				{/* Metadata badges */}
				<div className="flex flex-wrap gap-1.5">
					{step.temperature && (
						<Badge
							variant="secondary"
							className="text-[9px] h-4 px-1.5 gap-0.5"
						>
							<Gauge className="h-2.5 w-2.5" /> {step.temperature}
						</Badge>
					)}
					{step.timerSeconds && (
						<Badge
							variant="secondary"
							className="text-[9px] h-4 px-1.5 gap-0.5"
						>
							<Clock className="h-2.5 w-2.5" /> {step.timerSeconds}dtk
						</Badge>
					)}
				</div>
				{/* Linked ingredients */}
				{step.ingredientIds && step.ingredientIds.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{step.ingredientIds.map((id: string) => {
							const item = inventoryMap.get(id);
							return item ? (
								<Badge
									key={id}
									variant="outline"
									className="text-[9px] h-4 px-1"
								>
									{item.ingredientName || "Bahan"}
								</Badge>
							) : null;
						})}
					</div>
				)}
			</div>
		</li>
	);
}

// ─── Collapsible Ingredient List ────────────────────────

function CollapsibleIngredientList({ recipe, inventoryMap }) {
	const [open, setOpen] = useState(false);

	return (
		<div>
			<button
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-left text-[10px] text-muted-foreground hover:bg-muted/40"
			>
				<FileText className="h-3 w-3 shrink-0" />
				<span className="flex-1">
					{recipe.ingredients.length} bahan total
				</span>
				<ChevronDown
					className={cn(
						"h-3 w-3 transition-transform",
						open && "rotate-180"
					)}
				/>
			</button>
			{open && (
				<div className="mt-2 space-y-1.5">
					{(recipe.ingredients ?? []).map(
						(ing: any, index: number) => {
							const item = inventoryMap.get(
								String(ing.inventoryId)
							);
							return (
								<div
									key={index}
									className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2"
								>
									<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
										{index + 1}
									</div>
									<Scale className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									<span className="flex-1 text-xs">
										{item?.ingredientName || "Bahan"}
									</span>
									<span className="shrink-0 text-xs font-semibold tabular-nums">
										{ing.amount}{" "}
										{item ? getSmallestUnitLabel(item) : ""}
									</span>
								</div>
							);
						}
					)}
				</div>
			)}
		</div>
	);
}

// ─── Recipe View Page ───────────────────────────────────

export function RecipeViewPage() {
	const products = useHybridAllProducts();
	const categories = useHybridCategories();
	const inventory = useHybridInventory();
	const recipes = useHybridRecipes();
	const baseRecipes = useHybridBaseRecipes();

	const [search, setSearch] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedType, setSelectedType] =
		useState<"product" | "base_recipe" | null>(null);

	const loading = !products || !inventory || !recipes;

	// ── Derived ──

	const categoryById = useMemo(() => {
		const map = new Map<string, string>();
		for (const cat of categories ?? []) {
			map.set(String(cat._id), cat.name ?? "");
		}
		return map;
	}, [categories]);

	const inventoryMap = useMemo(
		() =>
			new Map(
				(inventory ?? []).map((item: any) => [String(item._id), item])
			),
		[inventory]
	);

	const productRecipes = useMemo(() => {
		if (!products || !recipes) return [];
		const recipeByProduct = new Map<string, any>();
		for (const r of recipes ?? []) {
			if (!r.variantName) {
				recipeByProduct.set(String(r.productId), r);
			}
		}
		const keyword = search.trim().toLowerCase();
		return (products ?? [])
			.filter((p) => {
				const hasRecipe = recipeByProduct.has(String(p._id));
				if (!hasRecipe) return false;
				if (!keyword) return true;
				const cat = categoryById.get(String(p.categoryId)) ?? "";
				return (
					(p.name ?? "").toLowerCase().includes(keyword) ||
					cat.toLowerCase().includes(keyword)
				);
			})
			.map((p) => ({
				product: p,
				recipe: recipeByProduct.get(String(p._id)),
				categoryName: categoryById.get(String(p.categoryId)) ?? "",
			}))
			.sort((a, b) =>
				(a.product.name ?? "").localeCompare(
					b.product.name ?? "",
					"id"
				)
			);
	}, [products, recipes, categoryById, search]);

	const filteredBase = useMemo(() => {
		if (!baseRecipes) return [];
		const keyword = search.trim().toLowerCase();
		return (baseRecipes ?? []).filter((r: any) => {
			if (!keyword) return true;
			const matchIng = (r.ingredients ?? []).some((ing: any) => {
				const inv = inventoryMap.get(String(ing.inventoryId));
				return inv?.ingredientName?.toLowerCase().includes(keyword);
			});
			return r.name.toLowerCase().includes(keyword) || matchIng;
		});
	}, [baseRecipes, search, inventoryMap]);

	// ── Selected item detail ──

	const selectedDetail = useMemo(() => {
		if (!selectedId || !selectedType) return null;
		if (selectedType === "base_recipe") {
			const recipe = (baseRecipes ?? []).find(
				(r: any) => r._id === selectedId
			);
			if (!recipe) return null;
			return { type: "base_recipe" as const, item: recipe };
		}
		const row = productRecipes.find((r) => r.product._id === selectedId);
		if (!row) return null;
		return { type: "product" as const, item: row };
	}, [selectedId, selectedType, baseRecipes, productRecipes]);

	if (loading) {
		return (
			<div className="mx-auto max-w-4xl space-y-3 p-4">
				<div className="h-7 w-48 bg-muted animate-pulse rounded" />
				<div className="h-8 w-full bg-muted animate-pulse rounded" />
				<div className="h-96 bg-muted animate-pulse rounded-2xl" />
			</div>
		);
	}

	const totalRecipes = filteredBase.length + productRecipes.length;

	return (
		<div className="mx-auto max-w-4xl space-y-4 p-3 md:p-6">
			{/* Header */}
			<div className="flex items-center gap-2">
				<BookOpen className="h-5 w-5 text-primary" />
				<div>
					<h1 className="font-bold text-lg tracking-tight">
						Resep &amp; Panduan
					</h1>
					<p className="text-xs text-muted-foreground">
						{totalRecipes} resep tersedia • Klik untuk lihat
						langkah-langkah
					</p>
				</div>
			</div>

			{/* Search */}
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					placeholder="Cari resep, produk, atau bahan..."
					value={search}
					onChange={(e) => {
						setSearch(e.target.value);
						setSelectedId(null);
						setSelectedType(null);
					}}
					className="h-10 pl-10 text-sm"
				/>
			</div>

			{/* Recipe Cards Grid */}
			{selectedDetail ? (
				/* ── Detail View ── */
				<div className="space-y-4">
					<button
						onClick={() => {
							setSelectedId(null);
							setSelectedType(null);
						}}
						className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						<ChevronRight className="h-3 w-3 rotate-180" />
						Kembali ke daftar
					</button>

					{selectedDetail.type === "base_recipe" ? (
						<BaseRecipeDetail
							recipe={selectedDetail.item}
							inventoryMap={inventoryMap}
						/>
					) : (
						<ProductRecipeDetail
							row={selectedDetail.item}
							inventoryMap={inventoryMap}
							baseRecipes={baseRecipes ?? []}
						/>
					)}
				</div>
			) : (
				/* ── List View ── */
				<div className="space-y-6">
					{/* Base Recipes */}
					{filteredBase.length > 0 && (
						<section>
							<div className="mb-2 flex items-center gap-2">
								<Beaker className="h-4 w-4 text-amber-500" />
								<h2 className="font-bold text-sm">
									Base Recipe
								</h2>
								<Badge
									variant="outline"
									className="text-[9px] h-4 px-1"
								>
									{filteredBase.length}
								</Badge>
							</div>
							<div className="grid gap-2 sm:grid-cols-2">
								{filteredBase.map((recipe: any) => (
									<button
										key={recipe._id}
										onClick={() => {
											setSelectedId(recipe._id);
											setSelectedType("base_recipe");
										}}
										className="group rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm"
									>
										<div className="flex items-center justify-between">
											<p className="font-semibold text-xs">
												{recipe.name}
											</p>
											<ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
										</div>
										<p className="text-[10px] text-muted-foreground">
											{recipe.targetQuantity}{" "}
											{recipe.targetUnit} •{" "}
											{recipe.ingredients.length} bahan
										</p>
									</button>
								))}
							</div>
						</section>
					)}

					{/* Product Recipes */}
					{productRecipes.length > 0 && (
						<section>
							<div className="mb-2 flex items-center gap-2">
								<Utensils className="h-4 w-4 text-primary" />
								<h2 className="font-bold text-sm">
									Recipe Produk
								</h2>
								<Badge
									variant="outline"
									className="text-[9px] h-4 px-1"
								>
									{productRecipes.length}
								</Badge>
							</div>
							<div className="space-y-2">
								{productRecipes.map((row) => (
									<button
										key={row.product._id}
										onClick={() => {
											setSelectedId(row.product._id);
											setSelectedType("product");
										}}
										className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm"
									>
										<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
											{row.recipe.ingredients.length}
										</div>
										<div className="flex-1 min-w-0">
											<p className="font-semibold text-xs truncate">
												{row.product.name}
											</p>
											<p className="text-[10px] text-muted-foreground truncate">
												{row.categoryName} •{" "}
												{row.recipe.ingredients.length} bahan
											</p>
										</div>
										<ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
									</button>
								))}
							</div>
						</section>
					)}

					{totalRecipes === 0 && (
						<div className="flex flex-col items-center gap-3 py-16 text-center">
							<BookOpen className="h-12 w-12 text-muted-foreground/30" />
							<p className="text-sm text-muted-foreground">
								{search
									? `Tidak ada resep "${search}"`
									: "Belum ada resep yang tersedia"}
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ─── Base Recipe Detail ─────────────────────────────────

function BaseRecipeDetail({
	recipe,
	inventoryMap,
}: {
	recipe: any;
	inventoryMap: Map<string, any>;
}) {
	const steps = recipe.steps;
	const hasSteps = steps && steps.length > 0;

	return (
		<Card className="border-amber-200/50">
			<CardContent className="p-4 space-y-4">
				<div className="flex items-center gap-2">
					<Beaker className="h-5 w-5 text-amber-500" />
					<div>
						<h2 className="font-bold text-sm">{recipe.name}</h2>
						<p className="text-[10px] text-muted-foreground">
							{recipe.category || "Lainnya"}
						</p>
					</div>
					<Badge variant="outline" className="ml-auto text-[10px]">
						{recipe.targetQuantity} {recipe.targetUnit}
					</Badge>
				</div>

				{hasSteps ? (
					/* Timeline Steps */
					<ol className="relative">
						<VerticalConnector />
						{steps.map((step: any, i: number) => (
							<StepCard
								key={i}
								step={step}
								index={i}
								inventoryMap={inventoryMap}
							/>
						))}
					</ol>
				) : (
					/* Ingredient list fallback */
					<div>
						<h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
							Bahan-bahan
						</h3>
						<div className="space-y-1.5">
							{(recipe.ingredients ?? []).map(
								(ing: any, index: number) => {
									const item = inventoryMap.get(
										String(ing.inventoryId)
									);
									return (
										<div
											key={index}
											className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2"
										>
											<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
												{index + 1}
											</div>
											<Scale className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
											<span className="flex-1 text-xs">
												{item?.ingredientName || "Bahan"}
											</span>
											<span className="shrink-0 text-xs font-semibold tabular-nums">
												{ing.amount}{" "}
												{item
													? getSmallestUnitLabel(item)
													: ""}
											</span>
										</div>
									);
								}
							)}
						</div>
					</div>
				)}

				<div className="rounded-lg bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
					<strong>Petunjuk:</strong> Campur semua bahan sesuai takaran di
					atas. Hasil: {recipe.targetQuantity} {recipe.targetUnit}.
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Product Recipe Detail ──────────────────────────────

function ProductRecipeDetail({
	row,
	inventoryMap,
	baseRecipes,
}: {
	row: any;
	inventoryMap: Map<string, any>;
	baseRecipes: any[];
}) {
	const { product, recipe, categoryName } = row;
	const steps = recipe.steps;
	const hasSteps = steps && steps.length > 0;

	return (
		<Card className="border-primary/20">
			<CardContent className="p-4 space-y-4">
				{/* Product Info Header */}
				<div className="flex items-center gap-2">
					<Utensils className="h-5 w-5 text-primary" />
					<div>
						<h2 className="font-bold text-sm">{product.name}</h2>
						<p className="text-[10px] text-muted-foreground">
							{categoryName}
						</p>
					</div>
					<Badge variant="outline" className="ml-auto text-[10px]">
						{hasSteps
							? `${steps.length} langkah`
							: `${recipe.ingredients.length} bahan`}
					</Badge>
				</div>

				{hasSteps ? (
					/* Timeline Steps */
					<ol className="relative">
						<VerticalConnector />
						{steps.map((step: any, i: number) => (
							<StepCard
								key={i}
								step={step}
								index={i}
								inventoryMap={inventoryMap}
							/>
						))}
					</ol>
				) : (
					/* Empty state: call to action */
					<div className="flex flex-col items-center gap-3 py-8 text-center rounded-lg border border-dashed">
						<AlertCircle className="h-8 w-8 text-muted-foreground/50" />
						<p className="text-xs text-muted-foreground">
							Belum ada langkah-langkah untuk resep ini.
						</p>
						<p className="text-[10px] text-muted-foreground/70">
							Kelola langkah di halaman Resep atau edit resep ini.
						</p>
					</div>
				)}

				{/* Collapsible Ingredient List */}
				{hasSteps && (
					<CollapsibleIngredientList
						recipe={recipe}
						inventoryMap={inventoryMap}
					/>
				)}
			</CardContent>
		</Card>
	);
}
