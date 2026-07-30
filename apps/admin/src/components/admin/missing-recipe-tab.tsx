import { Search, AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

interface ProductItem {
	_id: string;
	name: string;
	price?: number;
	categoryId?: string;
}

interface RecipeRecord {
	_id: string;
	productId: string;
	variantName?: string | null;
	ingredients: Array<{
		inventoryId: string;
		amount: number;
	}>;
	steps?: Array<{
		description: string;
		order: number;
	}> | null;
}

interface MissingRecipeTabProps {
	products: ProductItem[];
	recipes: RecipeRecord[];
	onSelectProduct: (productId: string) => void;
}

function formatRupiah(n: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		maximumFractionDigits: 0,
	}).format(n);
}

export function MissingRecipeTab({
	products,
	recipes,
	onSelectProduct,
}: MissingRecipeTabProps) {
	const [search, setSearch] = useState("");

	// Build a set of product IDs that already have a recipe
	const recipeProductIds = useMemo(() => {
		return new Set(recipes.map((r) => String(r.productId)));
	}, [recipes]);

	// Filter to products without recipes, then by search text
	const missingProducts = useMemo(() => {
		const withoutRecipe = products.filter(
			(p) => !recipeProductIds.has(String(p._id)),
		);

		if (!search.trim()) return withoutRecipe;

		const q = search.trim().toLowerCase();
		return withoutRecipe.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				(p.categoryId && p.categoryId.toLowerCase().includes(q)),
		);
	}, [products, recipeProductIds, search]);

	return (
		<div className="space-y-2">
			{/* Header */}
			<div className="flex items-center gap-1.5 px-1">
				<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
				<span className="text-[11px] font-medium text-amber-600">
					Produk Tanpa Resep
				</span>
				<span className="ml-auto text-[10px] text-muted-foreground">
					{missingProducts.length} produk
				</span>
			</div>

			{/* Search input */}
			<div className="relative">
				<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Cari produk..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="h-7 pl-6 text-[11px]"
				/>
			</div>

			{/* Product list */}
			<div className="space-y-1">
				{missingProducts.length === 0 ? (
					<div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
						Semua produk sudah punya resep ✅
					</div>
				) : (
					missingProducts.map((product) => (
						<div
							key={product._id}
							className="flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-accent/50"
						>
							{/* Product info */}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-1.5">
									<span className="text-[11px] font-medium truncate">
										{product.name}
									</span>
									{product.categoryId && (
										<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
											{product.categoryId}
										</span>
									)}
								</div>
								{product.price != null && (
									<div className="text-[10px] text-muted-foreground tabular-nums">
										{formatRupiah(product.price)}
									</div>
								)}
							</div>

							{/* Atur Resep button */}
							<button
								type="button"
								onClick={() => onSelectProduct(product._id)}
								className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
							>
								Atur Resep
							</button>
						</div>
					))
				)}
			</div>
		</div>
	);
}
