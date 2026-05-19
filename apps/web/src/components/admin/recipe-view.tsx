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


const ALA_CARTE_PROCESS_CONFIGS = {
	"nasi ayam mentega": {
		baseKeywords: ["mentega sauce", "based ayam mentega sauce", "based paha ayam mentega"],
		garnishKeywords: ["bawang goreng", "biji wijen", "selada", "timun"],
	},
	"nasi ayam rempah kemangi": {
		baseKeywords: ["rempah kemangi sauce", "kemangi sauce", "based kemangi sauce", "based paha ayam mentega"],
		garnishKeywords: ["bawang goreng", "biji wijen", "selada", "timun", "kemangi"],
	},
} as const;

function formatIngredientAmount(ing: any, item: any, productName: string) {
	const ingredientName = (item?.ingredientName ?? "").toLowerCase();
	const menuName = (productName ?? "").toLowerCase();
	const isAlaCarteTarget =
		menuName.includes("nasi ayam mentega") || menuName.includes("nasi ayam rempah kemangi");
	const isChicken = ingredientName.includes("ayam");

	if (isAlaCarteTarget && isChicken) {
		return "1 paha utuh";
	}

	const unit = item ? getSmallestUnitLabel(item) : "";
	const normalizedUnit = unit.toLowerCase() === "gram" ? "gr" : unit;
	return `${ing.amount} ${normalizedUnit}`.trim();
}

function buildProcessBuckets({
	productName,
	recipe,
	inventoryMap,
	baseRecipes,
}: {
	productName: string;
	recipe: any;
	inventoryMap: Map<string, any>;
	baseRecipes: any[];
}) {
	const menu = (productName ?? "").toLowerCase();
	const config = Object.entries(ALA_CARTE_PROCESS_CONFIGS).find(([key]) => menu.includes(key))?.[1];

	const baseItems: any[] = [];
	const garnishItems: any[] = [];
	const directItems: any[] = [];

	for (const ing of recipe.ingredients ?? []) {
		const item = inventoryMap.get(String(ing.inventoryId));
		const name = (item?.ingredientName ?? "").toLowerCase();
		const matchedBase = (baseRecipes ?? []).find((br: any) => {
			const brName = br.name?.toLowerCase() ?? "";
			return name.includes(brName) || brName.includes(name);
		});

		const isBaseByConfig = !!config?.baseKeywords?.some((kw: string) => name.includes(kw));
		const isGarnishByConfig = !!config?.garnishKeywords?.some((kw: string) => name.includes(kw));

		if (matchedBase || isBaseByConfig) {
			baseItems.push(ing);
			continue;
		}
		if (isGarnishByConfig) {
			garnishItems.push(ing);
			continue;
		}
		directItems.push(ing);
	}

	return { baseItems, garnishItems, directItems };
}


export function RecipeViewPage() {
	const products = useHybridAllProducts();
	const categories = useHybridCategories();
	const inventory = useHybridInventory();
	const recipes = useHybridRecipes();
	const baseRecipes = useHybridBaseRecipes();

	const [search, setSearch] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedType, setSelectedType] = useState<"product" | "base_recipe" | null>(null);

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
		() => new Map((inventory ?? []).map((item: any) => [String(item._id), item])),
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
			.sort((a, b) => (a.product.name ?? "").localeCompare(b.product.name ?? "", "id"));
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
			const recipe = (baseRecipes ?? []).find((r: any) => r._id === selectedId);
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
					<h1 className="font-bold text-lg tracking-tight">Resep &amp; Panduan</h1>
					<p className="text-xs text-muted-foreground">
						{totalRecipes} resep tersedia • Klik untuk lihat langkah-langkah
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
						onClick={() => { setSelectedId(null); setSelectedType(null); }}
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
								<h2 className="font-bold text-sm">Base Recipe</h2>
								<Badge variant="outline" className="text-[9px] h-4 px-1">{filteredBase.length}</Badge>
							</div>
							<div className="grid gap-2 sm:grid-cols-2">
								{filteredBase.map((recipe: any) => (
									<button
										key={recipe._id}
										onClick={() => { setSelectedId(recipe._id); setSelectedType("base_recipe"); }}
										className="group rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm"
									>
										<div className="flex items-center justify-between">
											<p className="font-semibold text-xs">{recipe.name}</p>
											<ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
										</div>
										<p className="text-[10px] text-muted-foreground">
											{recipe.targetQuantity} {recipe.targetUnit} • {recipe.ingredients.length} bahan
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
								<h2 className="font-bold text-sm">Recipe Produk</h2>
								<Badge variant="outline" className="text-[9px] h-4 px-1">{productRecipes.length}</Badge>
							</div>
							<div className="space-y-2">
								{productRecipes.map((row) => (
									<button
										key={row.product._id}
										onClick={() => { setSelectedId(row.product._id); setSelectedType("product"); }}
										className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm"
									>
										<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
											{row.recipe.ingredients.length}
										</div>
										<div className="flex-1 min-w-0">
											<p className="font-semibold text-xs truncate">{row.product.name}</p>
											<p className="text-[10px] text-muted-foreground truncate">
												{row.categoryName} • {row.recipe.ingredients.length} bahan
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
								{search ? `Tidak ada resep "${search}"` : "Belum ada resep yang tersedia"}
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
	return (
		<Card className="border-amber-200/50">
			<CardContent className="p-4 space-y-4">
				<div className="flex items-center gap-2">
					<Beaker className="h-5 w-5 text-amber-500" />
					<div>
						<h2 className="font-bold text-sm">{recipe.name}</h2>
						<p className="text-[10px] text-muted-foreground">{recipe.category || "Lainnya"}</p>
					</div>
					<Badge variant="outline" className="ml-auto text-[10px]">
						{recipe.targetQuantity} {recipe.targetUnit}
					</Badge>
				</div>

				<div>
					<h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
						Bahan-bahan
					</h3>
					<div className="space-y-1.5">
						{(recipe.ingredients ?? []).map((ing: any, index: number) => {
							const item = inventoryMap.get(String(ing.inventoryId));
							return (
								<div
									key={index}
									className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2"
								>
									<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">
										{index + 1}
									</div>
									<Scale className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									<span className="flex-1 text-xs">{item?.ingredientName || "Bahan"}</span>
									<span className="shrink-0 text-xs font-semibold tabular-nums">
										{ing.amount} {item ? getSmallestUnitLabel(item) : ""}
									</span>
								</div>
							);
						})}
					</div>
				</div>

				<div className="rounded-lg bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
					<strong>Petunjuk:</strong> Campur semua bahan sesuai takaran di atas. Hasil: {recipe.targetQuantity} {recipe.targetUnit}.
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Product Recipe Detail ─────────────────────────────

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

	const splitIngredients = useMemo(() => {
		return buildProcessBuckets({
			productName: product.name ?? "",
			recipe,
			inventoryMap,
			baseRecipes,
		});
	}, [product.name, recipe, baseRecipes, inventoryMap]);

	const hasBaseItems = splitIngredients.baseItems.length > 0;
	const hasGarnishItems = splitIngredients.garnishItems.length > 0;

	return (
		<Card className="border-primary/20">
			<CardContent className="p-4 space-y-4">
				{/* Product Info */}
				<div className="flex items-center gap-2">
					<Utensils className="h-5 w-5 text-primary" />
					<div>
						<h2 className="font-bold text-sm">{product.name}</h2>
						<p className="text-[10px] text-muted-foreground">{categoryName}</p>
					</div>
					<Badge variant="outline" className="ml-auto text-[10px]">
						{recipe.ingredients.length} bahan
					</Badge>
				</div>

				{/* Steps */}
				<div className="relative">
					{/* Vertical connector line */}
					<div className="absolute left-[17px] top-3 bottom-3 w-0.5 bg-border" />

					{/* Step 1: Siapkan Bahan */}
					<div className="relative pl-10 pb-4">
						<div className="absolute left-2 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground z-10">
							1
						</div>
						<div className="rounded-lg border border-border bg-card p-3">
							<h3 className="font-semibold text-xs">Siapkan Bahan Baku</h3>
							<p className="mb-2 text-[10px] text-muted-foreground">Siapkan komponen utama ala carte:</p>
							<div className="space-y-1">
								{splitIngredients.directItems.map((ing: any, index: number) => {
									const item = inventoryMap.get(String(ing.inventoryId));
									return (
										<div key={index} className="flex items-center gap-2 text-xs">
											<CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
											<span className="flex-1">{item?.ingredientName || "Bahan"}</span>
											<span className="shrink-0 font-semibold tabular-nums">
												{formatIngredientAmount(ing, item, product.name ?? "")}
											</span>
										</div>
									);
								})}
								{splitIngredients.directItems.length === 0 && (
									<p className="text-[10px] text-muted-foreground italic">Tidak ada bahan langsung</p>
								)}
							</div>
						</div>
					</div>

					{/* Step 2: Base Recipe (optional) */}
					{hasBaseItems && (
						<div className="relative pl-10 pb-4">
							<div className="absolute left-2 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white z-10">
								2
							</div>
							<div className="rounded-lg border border-amber-200/50 bg-amber-50/50 p-3">
								<h3 className="font-semibold text-xs">Siapkan Base Recipe</h3>
								<p className="mb-2 text-[10px] text-muted-foreground">Base recipe yang diperlukan:</p>
								<div className="space-y-1">
									{splitIngredients.baseItems.map((ing: any, index: number) => {
										const item = inventoryMap.get(String(ing.inventoryId));
										const matchedBase = (baseRecipes ?? []).find((br: any) => {
											const brName = br.name?.toLowerCase() ?? "";
											return item?.ingredientName?.toLowerCase().includes(brName);
										});
										return (
											<div key={index} className="flex items-center gap-2 text-xs">
												<Beaker className="h-3 w-3 shrink-0 text-amber-600" />
												<span className="flex-1">
													{item?.ingredientName || "Bahan"}
													{matchedBase && (
														<span className="ml-1 text-[9px] text-amber-600">
															({matchedBase.targetQuantity} {matchedBase.targetUnit})
														</span>
													)}
												</span>
												<span className="shrink-0 font-semibold tabular-nums">
													{formatIngredientAmount(ing, item, product.name ?? "")}
												</span>
											</div>
										);
									})}
								</div>
							</div>
						</div>
					)}

					{/* Step 3: Garnish (optional) */}
					{hasGarnishItems && (
						<div className="relative pl-10 pb-4">
							<div className="absolute left-2 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-bold text-white z-10">
								{hasBaseItems ? 3 : 2}
							</div>
							<div className="rounded-lg border border-indigo-200/50 bg-indigo-50/50 p-3">
								<h3 className="font-semibold text-xs">Finishing & Garnish</h3>
								<p className="mb-2 text-[10px] text-muted-foreground">Tambahkan garnish sebelum sajikan:</p>
								<div className="space-y-1">
									{splitIngredients.garnishItems.map((ing: any, index: number) => {
										const item = inventoryMap.get(String(ing.inventoryId));
										return (
											<div key={index} className="flex items-center gap-2 text-xs">
												<CheckCircle2 className="h-3 w-3 shrink-0 text-indigo-600" />
												<span className="flex-1">{item?.ingredientName || "Bahan"}</span>
												<span className="shrink-0 font-semibold tabular-nums">{formatIngredientAmount(ing, item, product.name ?? "")}</span>
											</div>
										);
									})}
								</div>
							</div>
						</div>
					)}

					{/* Final Step: Sajikan */}
					<div className="relative pl-10">
						<div className="absolute left-2 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white z-10">
							{hasGarnishItems ? (hasBaseItems ? 4 : 3) : (hasBaseItems ? 3 : 2)}
						</div>
						<div className="rounded-lg border border-emerald-200/50 bg-emerald-50/50 p-3">
							<h3 className="font-semibold text-xs">Sajikan</h3>
							<p className="text-[10px] text-muted-foreground">
								Campur dan sajikan {product.name}.{' '}
								<Clock className="inline h-3 w-3 align-text-top" />
								{' '}Siap disajikan.
							</p>
						</div>
					</div>
				</div>

				{/* All ingredients list | Collapsible */}
				<button
					onClick={() => {}}
					className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-left text-[10px] text-muted-foreground hover:bg-muted/40"
				>
					<FileText className="h-3 w-3 shrink-0" />
					<span className="flex-1">{recipe.ingredients.length} bahan total</span>
					<ChevronDown className="h-3 w-3" />
				</button>
			</CardContent>
		</Card>
	);
}
