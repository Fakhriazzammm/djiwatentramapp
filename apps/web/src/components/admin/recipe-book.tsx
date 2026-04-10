// @ts-nocheck
import { Link } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	BookOpen,
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
import { Button } from "@/components/ui/button";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type BaseRecipeForm = {
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

function IngredientEditor({
	inventory,
	ingredients,
	setIngredients,
}: {
	inventory: Doc<"inventory">[];
	ingredients: { inventoryId: Id<"inventory">; amount: number }[];
	setIngredients: (next: { inventoryId: Id<"inventory">; amount: number }[]) => void;
}) {
	const [ingredientQuery, setIngredientQuery] = useState("");

	const sortedInventory = useMemo(() => sortByName(inventory), [inventory]);
	const filteredInventory = useMemo(() => {
		const keyword = ingredientQuery.trim().toLowerCase();
		if (!keyword) return sortedInventory;
		return sortedInventory.filter((item) =>
			`${item.ingredientName} ${item.unit}`.toLowerCase().includes(keyword)
		);
	}, [ingredientQuery, sortedInventory]);

	const addIngredient = (inventoryId: Id<"inventory">) => {
		if (!inventoryId) return;
		if (ingredients.some((item) => item.inventoryId === inventoryId)) {
			toast.error("Bahan sudah ada");
			return;
		}
		setIngredients([...ingredients, { inventoryId, amount: 0 }]);
		setIngredientQuery("");
	};

	const resolveIngredientId = (rawValue: string) => {
		const value = rawValue.trim().toLowerCase();
		if (!value) return null;
		const exact = sortedInventory.find(
			(item) =>
				item.ingredientName.toLowerCase() === value ||
				`${item.ingredientName} (${item.unit})`.toLowerCase() === value
		);
		if (exact) return exact._id as Id<"inventory">;
		const partial = sortedInventory.find((item) =>
			`${item.ingredientName} ${item.unit}`.toLowerCase().includes(value)
		);
		return (partial?._id as Id<"inventory">) ?? null;
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
							const resolvedId = resolveIngredientId(ingredientQuery);
							if (!resolvedId) return toast.error("Bahan tidak ditemukan");
							addIngredient(resolvedId);
						}}
						placeholder="+ Tambah bahan (ketik untuk cari)"
						value={ingredientQuery}
					/>
					<Button
						onClick={() => {
							const resolvedId = resolveIngredientId(ingredientQuery);
							if (!resolvedId) return toast.error("Bahan tidak ditemukan");
							addIngredient(resolvedId);
						}}
						type="button"
						variant="outline"
					>
						Tambah
					</Button>
				</div>
				<datalist id="ingredient-options">
					{filteredInventory.map((item) => (
						<option key={item._id} value={`${item.ingredientName} (${item.unit})`} />
					))}
				</datalist>
			</div>
			<div className="space-y-2">
				{ingredients.map((ingredient, index) => {
					const inv = inventory.find((item) => item._id === ingredient.inventoryId);
					return (
						<div className="grid gap-2 rounded-xl border border-border bg-background p-3 md:grid-cols-[1fr_130px_70px]" key={`${ingredient.inventoryId}-${index}`}>
							<p className={`font-semibold ${tableCellSingleLine()}`}>{inv?.ingredientName || "-"}</p>
							<Input
								min="0"
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
			</div>
		</div>
	);
}

export function RecipeStudioPage() {
	const products = useQuery(api.products.getAllProductsAdmin);
	const categories = useQuery(api.products.getCategories);
	const inventory = useQuery(api.inventory.getInventory);
	const baseRecipes = useQuery(api.inventory.getBaseRecipes);
	const productRecipes = useQuery(api.inventory.getRecipes);
	const hppProductMap = useQuery(api.hpp.getHppProductMap);
	const createBaseRecipe = useMutation(api.inventory.createBaseRecipe);
	const updateBaseRecipe = useMutation(api.inventory.updateBaseRecipe);
	const deleteBaseRecipe = useMutation(api.inventory.deleteBaseRecipe);
	const saveRecipe = useMutation(api.inventory.saveRecipe);
	const deleteRecipe = useMutation(api.inventory.deleteRecipe);
	const [searchBase, setSearchBase] = useState("");
	const [searchProduct, setSearchProduct] = useState("");
	const [baseModalOpen, setBaseModalOpen] = useState(false);
	const [productModalOpen, setProductModalOpen] = useState(false);
	const [editingBaseId, setEditingBaseId] = useState<Id<"baseRecipes"> | null>(null);
	const [deletingBaseId, setDeletingBaseId] = useState<Id<"baseRecipes"> | null>(null);
	const [deletingProductRecipeId, setDeletingProductRecipeId] = useState<Id<"recipes"> | null>(
		null
	);
	const [baseForm, setBaseForm] = useState<BaseRecipeForm>({
		name: "",
		description: "",
		category: "Lainnya",
		targetUnit: "ml",
		targetQuantity: "1000",
		ingredients: [],
	});
	const [productForm, setProductForm] = useState<ProductRecipeForm>({
		productId: "",
		ingredients: [],
	});
	const [productQuery, setProductQuery] = useState("");

	const loading =
		!products || !categories || !inventory || !baseRecipes || !productRecipes;

	const recipeByProductId = useMemo(() => {
		const map = new Map<string, Doc<"recipes">>();
		for (const recipe of productRecipes ?? []) {
			if (!recipe.variantName) {
				map.set(String(recipe.productId), recipe);
			}
		}
		return map;
	}, [productRecipes]);

	const filteredBaseRecipes = useMemo(() => {
		const keyword = searchBase.trim().toLowerCase();
		return sortByName(baseRecipes ?? []).filter((item) => {
			if (!keyword) return true;
			return (
				item.name.toLowerCase().includes(keyword) ||
				(item.description ?? "").toLowerCase().includes(keyword) ||
				(item.category ?? "").toLowerCase().includes(keyword)
			);
		});
	}, [baseRecipes, searchBase]);

	const productRows = useMemo(() => {
		const keyword = searchProduct.trim().toLowerCase();
		return sortByName(products ?? [])
			.map((product) => {
				const recipe = recipeByProductId.get(String(product._id)) ?? null;
				const categoryName =
					categories?.find((category) => category._id === product.categoryId)?.name ??
					"Tanpa kategori";
				return {
					product,
					recipe,
					categoryName,
					hpp: hppProductMap?.[String(product._id)] ?? null,
				};
			})
			.filter((row) => {
				if (!keyword) return true;
				return (
					row.product.name.toLowerCase().includes(keyword) ||
					row.categoryName.toLowerCase().includes(keyword)
				);
			});
	}, [categories, hppProductMap, products, recipeByProductId, searchProduct]);

	const sortedProducts = useMemo(() => sortByName(products ?? []), [products]);

	const resolveProductId = (rawValue: string) => {
		const value = rawValue.trim().toLowerCase();
		if (!value) return "";
		const exact = sortedProducts.find((product) => product.name.toLowerCase() === value);
		if (exact) return String(exact._id);
		const partial = sortedProducts.find((product) =>
			product.name.toLowerCase().includes(value)
		);
		return partial ? String(partial._id) : "";
	};

	if (loading) {
		return (
			<div className="space-y-4">
				<HeaderCard mode="manage" />
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					{Array.from({ length: 4 }).map((_, index) => (
						<Skeleton className="h-28 rounded-xl" key={index} />
					))}
				</div>
				<Skeleton className="h-72 rounded-2xl" />
				<Skeleton className="h-72 rounded-2xl" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<HeaderCard mode="manage" />

			<StatGrid
				items={[
					{
						label: "Base Recipe",
						value: baseRecipes.length,
						help: "Formula dasar",
					},
					{
						label: "Recipe Produk",
						value: productRows.filter((row) => row.recipe).length,
						help: "Produk dengan recipe",
					},
					{
						label: "Produk Total",
						value: products.length,
						help: "Menu aktif/nonaktif",
					},
					{
						label: "Inventory Item",
						value: inventory.length,
						help: "Bahan terdaftar",
					},
				]}
			/>

			<div className="space-y-3 rounded-2xl border border-border bg-card p-4">
				<SectionHeader
					addLabel="Tambah Base"
					onAdd={() => {
						setEditingBaseId(null);
						setBaseForm({
							name: "",
							description: "",
							category: "Lainnya",
							targetUnit: "ml",
							targetQuantity: "1000",
							ingredients: [],
						});
						setBaseModalOpen(true);
					}}
					search={searchBase}
					setSearch={setSearchBase}
					title="Base Recipe"
				/>
				<BaseRecipeTable
					onDelete={(id) => setDeletingBaseId(id)}
					onEdit={(row) => {
						setEditingBaseId(row._id);
						setBaseForm({
							name: row.name,
							description: row.description ?? "",
							category: row.category ?? "Lainnya",
							targetUnit: row.targetUnit,
							targetQuantity: String(row.targetQuantity),
							ingredients: row.ingredients,
						});
						setBaseModalOpen(true);
					}}
					rows={filteredBaseRecipes}
				/>
			</div>

			<div className="space-y-3 rounded-2xl border border-border bg-card p-4">
				<SectionHeader
					addLabel="Tambah Recipe Produk"
					onAdd={() => {
						setProductForm({ productId: "", ingredients: [] });
						setProductQuery("");
						setProductModalOpen(true);
					}}
					search={searchProduct}
					setSearch={setSearchProduct}
					title="Recipe Produk"
				/>
				<ProductRecipeTable
					onDelete={(id) => setDeletingProductRecipeId(id)}
					onEdit={(row) => {
						setProductForm({
							productId: String(row.product._id),
							ingredients: row.recipe?.ingredients ?? [],
						});
						setProductQuery(row.product.name);
						setProductModalOpen(true);
					}}
					rows={productRows}
				/>
			</div>

			{baseModalOpen && (
				<ModalScaffold
					onClose={() => setBaseModalOpen(false)}
					title={editingBaseId ? "Edit Base Recipe" : "Buat Base Recipe"}
				>
					<form
						className="space-y-4"
						onSubmit={async (event) => {
							event.preventDefault();
							if (!baseForm.name.trim()) return toast.error("Nama recipe wajib diisi");
							if (baseForm.ingredients.length === 0)
								return toast.error("Tambahkan minimal satu bahan");
							if (baseForm.ingredients.some((item) => item.amount <= 0))
								return toast.error("Jumlah bahan harus lebih dari 0");
							const payload = {
								name: baseForm.name.trim(),
								description: baseForm.description.trim() || undefined,
								category: baseForm.category,
								targetUnit: baseForm.targetUnit.trim(),
								targetQuantity: Number(baseForm.targetQuantity),
								ingredients: baseForm.ingredients,
							};
							if (editingBaseId) {
								await updateBaseRecipe({ id: editingBaseId, ...payload });
								toast.success("Base recipe diperbarui");
							} else {
								await createBaseRecipe(payload);
								toast.success("Base recipe ditambahkan");
							}
							setBaseModalOpen(false);
						}}
					>
						<div className="grid gap-3 md:grid-cols-2">
							<Input
								onChange={(event) =>
									setBaseForm((current) => ({ ...current, name: event.target.value }))
								}
								placeholder="Nama recipe"
								required
								value={baseForm.name}
							/>
							<select
								className="h-10 rounded-md border border-input bg-background px-3 text-sm"
								onChange={(event) =>
									setBaseForm((current) => ({
										...current,
										category: event.target.value,
									}))
								}
								value={baseForm.category}
							>
								{BASE_RECIPE_CATEGORIES.map((category) => (
									<option key={category} value={category}>
										{category}
									</option>
								))}
							</select>
							<Input
								onChange={(event) =>
									setBaseForm((current) => ({
										...current,
										targetUnit: event.target.value,
									}))
								}
								placeholder="Unit hasil"
								required
								value={baseForm.targetUnit}
							/>
							<Input
								min="1"
								onChange={(event) =>
									setBaseForm((current) => ({
										...current,
										targetQuantity: event.target.value,
									}))
								}
								required
								type="number"
								value={baseForm.targetQuantity}
							/>
						</div>
						<Textarea
							onChange={(event) =>
								setBaseForm((current) => ({
									...current,
									description: event.target.value,
								}))
							}
							placeholder="Deskripsi atau catatan"
							value={baseForm.description}
						/>
						<IngredientEditor
							ingredients={baseForm.ingredients}
							inventory={inventory}
							setIngredients={(next) =>
								setBaseForm((current) => ({ ...current, ingredients: next }))
							}
						/>
						<div className="flex justify-end gap-2">
							<Button onClick={() => setBaseModalOpen(false)} type="button" variant="outline">
								Batal
							</Button>
							<Button type="submit">Simpan</Button>
						</div>
					</form>
				</ModalScaffold>
			)}

			{productModalOpen && (
				<ModalScaffold onClose={() => setProductModalOpen(false)} title="Recipe Produk">
					<form
						className="space-y-4"
						onSubmit={async (event) => {
							event.preventDefault();
							if (!productForm.productId) return toast.error("Pilih produk");
							if (productForm.ingredients.length === 0)
								return toast.error("Tambahkan minimal satu bahan");
							if (productForm.ingredients.some((item) => item.amount <= 0))
								return toast.error("Jumlah bahan harus lebih dari 0");
							await saveRecipe({
								productId: productForm.productId as Id<"products">,
								ingredients: productForm.ingredients,
							});
							toast.success("Recipe produk disimpan");
							setProductModalOpen(false);
						}}
					>
						<div className="space-y-2">
							<Input
								className="h-10 w-full"
								list="product-options"
								onChange={(event) => {
									const value = event.target.value;
									setProductQuery(value);
									const productId = resolveProductId(value);
									setProductForm((current) => ({
										...current,
										productId,
									}));
								}}
								placeholder="Pilih produk (ketik untuk cari)"
								required
								value={productQuery}
							/>
							<datalist id="product-options">
								{sortedProducts.map((product) => (
									<option key={product._id} value={product.name} />
								))}
							</datalist>
						</div>
						<IngredientEditor
							ingredients={productForm.ingredients}
							inventory={inventory}
							setIngredients={(next) =>
								setProductForm((current) => ({ ...current, ingredients: next }))
							}
						/>
						<div className="flex justify-end gap-2">
							<Button onClick={() => setProductModalOpen(false)} type="button" variant="outline">
								Batal
							</Button>
							<Button type="submit">Simpan</Button>
						</div>
					</form>
				</ModalScaffold>
			)}

			<ConfirmationModal
				confirmText="Hapus"
				isOpen={!!deletingBaseId}
				message="Hapus base recipe ini?"
				onClose={() => setDeletingBaseId(null)}
				onConfirm={async () => {
					if (!deletingBaseId) return;
					await deleteBaseRecipe({ id: deletingBaseId });
					toast.success("Base recipe dihapus");
					setDeletingBaseId(null);
				}}
				title="Konfirmasi Hapus"
				variant="danger"
			/>

			<ConfirmationModal
				confirmText="Hapus"
				isOpen={!!deletingProductRecipeId}
				message="Hapus recipe produk ini?"
				onClose={() => setDeletingProductRecipeId(null)}
				onConfirm={async () => {
					if (!deletingProductRecipeId) return;
					await deleteRecipe({ id: deletingProductRecipeId });
					toast.success("Recipe produk dihapus");
					setDeletingProductRecipeId(null);
				}}
				title="Konfirmasi Hapus"
				variant="danger"
			/>
		</div>
	);
}

function SectionHeader({
	title,
	search,
	setSearch,
	addLabel,
	onAdd,
}: {
	title: string;
	search: string;
	setSearch: (value: string) => void;
	addLabel: string;
	onAdd: () => void;
}) {
	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<h2 className="text-lg font-black tracking-tight text-foreground">{title}</h2>
			<div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
				<div className="relative w-full md:w-72">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="h-10 pl-9"
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Cari..."
						value={search}
					/>
				</div>
				<Button className="h-10" onClick={onAdd} type="button">
					<Plus className="mr-2 h-4 w-4" /> {addLabel}
				</Button>
			</div>
		</div>
	);
}

function ModalScaffold({
	title,
	children,
	onClose,
}: {
	title: string;
	children: React.ReactNode;
	onClose: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
			<div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
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

export function RecipeBookViewPage() {
	const products = useQuery(api.products.getAllProductsAdmin);
	const categories = useQuery(api.products.getCategories);
	const inventory = useQuery(api.inventory.getInventory);
	const baseRecipes = useQuery(api.inventory.getBaseRecipes);
	const productRecipes = useQuery(api.inventory.getRecipes);
	const [search, setSearch] = useState("");

	const loading =
		!products || !categories || !inventory || !baseRecipes || !productRecipes;

	const inventoryMap = useMemo(
		() => new Map((inventory ?? []).map((item) => [String(item._id), item])),
		[inventory]
	);

	const baseRows = useMemo(() => {
		const keyword = search.trim().toLowerCase();
		return sortByName(baseRecipes ?? []).filter((recipe) => {
			if (!keyword) return true;
			return (
				recipe.name.toLowerCase().includes(keyword) ||
				(recipe.description ?? "").toLowerCase().includes(keyword)
			);
		});
	}, [baseRecipes, search]);

	const productRows = useMemo(() => {
		const keyword = search.trim().toLowerCase();
		const productMap = new Map((products ?? []).map((product) => [String(product._id), product]));
		return (productRecipes ?? [])
			.filter((recipe) => !recipe.variantName)
			.map((recipe) => {
				const product = productMap.get(String(recipe.productId));
				if (!product) return null;
				const categoryName =
					categories?.find((category) => category._id === product.categoryId)?.name ??
					"Tanpa kategori";
				return {
					product,
					recipe,
					categoryName,
				};
			})
			.filter((row): row is NonNullable<typeof row> => row !== null)
			.filter((row) => {
				if (!keyword) return true;
				return (
					row.product.name.toLowerCase().includes(keyword) ||
					row.categoryName.toLowerCase().includes(keyword)
				);
			});
	}, [categories, productRecipes, products, search]);

	if (loading) {
		return (
			<div className="space-y-4">
				<HeaderCard mode="view" />
				<Skeleton className="h-64 rounded-2xl" />
				<Skeleton className="h-64 rounded-2xl" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<HeaderCard mode="view" />
			<div className="rounded-2xl border border-border bg-card p-4">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 className="text-lg font-black tracking-tight">Mode Baca Recipe</h2>
						<p className="text-sm text-muted-foreground">
							Daftar resep untuk barista dan kitchen, disusun ringkas step-by-step.
						</p>
					</div>
					<div className="relative w-full md:w-72">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="h-10 pl-9"
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Cari recipe..."
							value={search}
						/>
					</div>
				</div>
			</div>

			<div className="rounded-2xl border border-border bg-card p-4">
				<div className="mb-3 flex items-center gap-2">
					<FileText className="h-4 w-4 text-primary" />
					<h3 className="font-black tracking-tight">Base Recipe</h3>
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					{baseRows.map((recipe) => (
						<div className="rounded-xl border border-border bg-background p-3" key={recipe._id}>
							<p className="font-semibold">{recipe.name}</p>
							<p className="text-xs text-muted-foreground">
								{recipe.targetQuantity} {recipe.targetUnit} | {recipe.category || "Lainnya"}
							</p>
							<div className="mt-2 space-y-1">
								{recipe.ingredients.map((ingredient, index) => {
									const item = inventoryMap.get(String(ingredient.inventoryId));
									return (
										<div className="flex items-center gap-2 text-sm" key={`${recipe._id}-${index}`}>
											<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
											<p className={tableCellSingleLine()}>
												{item?.ingredientName || "Bahan"}: {ingredient.amount}{" "}
												{item?.unit || "unit"}
											</p>
										</div>
									);
								})}
							</div>
						</div>
					))}
				</div>
			</div>

			<div className="rounded-2xl border border-border bg-card p-4">
				<div className="mb-3 flex items-center gap-2">
					<CheckCircle2 className="h-4 w-4 text-primary" />
					<h3 className="font-black tracking-tight">Recipe Produk (Step by Step)</h3>
				</div>
				<div className="space-y-3">
					{productRows.map((row) => (
						<div className="rounded-xl border border-border bg-background p-3" key={row.recipe._id}>
							<div className="mb-2">
								<p className="font-semibold">{row.product.name}</p>
								<p className="text-xs text-muted-foreground">{row.categoryName}</p>
							</div>
							<div className="space-y-1">
								{row.recipe.ingredients.map((ingredient, index) => {
									const item = inventoryMap.get(String(ingredient.inventoryId));
									return (
										<div
											className="grid grid-cols-[30px_1fr] items-start gap-2 rounded-lg border border-border/70 bg-card px-2 py-1.5"
											key={`${row.recipe._id}-${index}`}
										>
											<div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
												{index + 1}
											</div>
											<p className="text-sm leading-5">
												{item?.ingredientName || "Bahan"} sebanyak {ingredient.amount}{" "}
												{item?.unit || "unit"}
											</p>
										</div>
									);
								})}
							</div>
							<div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
								Final check: cek takaran, rasa, suhu, dan presentasi sebelum disajikan.
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

