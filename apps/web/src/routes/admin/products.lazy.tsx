import { createLazyFileRoute } from "@tanstack/react-router";
import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	CheckCircle2,
	Edit,
	LayoutGrid,
	List,
	Plus,
	Sparkles,
	Trash2,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { BulkOperations } from "../../components/admin/bulk-operations";

interface VariationOption {
	name: string;
	price: number;
}

interface Variation {
	name: string;
	options: VariationOption[];
}

export const Route = createLazyFileRoute("/admin/products")({
	component: AdminProductsPage,
});

function AdminProductsPage() {
	const products = useQuery(api.products.getAllProductsAdmin);
	const categories = useQuery(api.products.getCategories);
	const variationPresets = useQuery(api.products.getVariationPresets);

	const [activeTab, setActiveTab] = useState<
		"products" | "base-recipes" | "mixed-recipes" | "settings"
	>("products");

	return (
		<div className="fade-in slide-in-from-bottom-4 flex animate-in flex-col gap-3 duration-500 md:gap-6">
			<div className="no-scrollbar flex items-center justify-between overflow-x-auto border-border border-b pb-1">
				<div className="flex gap-1 md:gap-2">
					<button
						className={`relative whitespace-nowrap px-3 py-2 font-bold text-xs transition-colors md:px-4 md:text-sm ${
							activeTab === "products"
								? "text-primary"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => setActiveTab("products")}
						type="button"
					>
						Produk
						{activeTab === "products" && (
							<motion.div
								className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
								layoutId="activeTab"
							/>
						)}
					</button>
					<button
						className={`relative whitespace-nowrap px-3 py-2 font-bold text-xs transition-colors md:px-4 md:text-sm ${
							activeTab === "base-recipes"
								? "text-primary"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => setActiveTab("base-recipes")}
						type="button"
					>
						Resep Base
						{activeTab === "base-recipes" && (
							<motion.div
								className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
								layoutId="activeTab"
							/>
						)}
					</button>
					<button
						className={`relative whitespace-nowrap px-3 py-2 font-bold text-xs transition-colors md:px-4 md:text-sm ${
							activeTab === "mixed-recipes"
								? "text-primary"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => setActiveTab("mixed-recipes")}
						type="button"
					>
						Resep Gabungan
						{activeTab === "mixed-recipes" && (
							<motion.div
								className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
								layoutId="activeTab"
							/>
						)}
					</button>
					<button
						className={`relative whitespace-nowrap px-3 py-2 font-bold text-xs transition-colors md:px-4 md:text-sm ${
							activeTab === "settings"
								? "text-primary"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => setActiveTab("settings")}
						type="button"
					>
						Pengaturan
						{activeTab === "settings" && (
							<motion.div
								className="absolute right-0 -bottom-[5px] left-0 h-1 bg-primary"
								layoutId="activeTab"
							/>
						)}
					</button>
				</div>
			</div>

			<AnimatePresence mode="wait">
				{(() => {
					if (activeTab === "products") {
						return (
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 10 }}
								initial={{ opacity: 0, y: 10 }}
								key="products-tab"
							>
								<ProductsTab
									categories={categories}
									products={products}
									variationPresets={variationPresets}
								/>
							</motion.div>
						);
					}
					if (activeTab === "base-recipes") {
						return (
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 10 }}
								initial={{ opacity: 0, y: 10 }}
								key="base-recipes-tab"
							>
								<BaseRecipesTab />
							</motion.div>
						);
					}
					if (activeTab === "mixed-recipes") {
						return (
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 10 }}
								initial={{ opacity: 0, y: 10 }}
								key="mixed-recipes-tab"
							>
								<MixedRecipesTab />
							</motion.div>
						);
					}
					return (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 10 }}
							initial={{ opacity: 0, y: 10 }}
							key="settings-tab"
						>
							<SettingsTab
								categories={categories}
								variationPresets={variationPresets}
							/>
						</motion.div>
					);
				})()}
			</AnimatePresence>
		</div>
	);
}

function ProductsTab({
	products,
	categories,
	variationPresets,
}: {
	products: (Doc<"products"> & { storageId?: string })[] | undefined;
	categories: Doc<"categories">[] | undefined;
	variationPresets: Doc<"variationPresets">[] | undefined;
}) {
	const inventory = useQuery(api.inventory.getInventory);
	const recipes = useQuery(api.inventory.getRecipes);
	const hppProductMap = useQuery(api.hpp.getHppProductMap);
	const saveRecipe = useMutation(api.inventory.saveRecipe);

	const addProduct = useMutation(api.products.addProduct);
	const updateProduct = useMutation(api.products.updateProduct);
	const deleteProduct = useMutation(api.products.deleteProduct);
	const generateUploadUrl = useMutation(api.products.generateUploadUrl);

	const [isModalOpen, setIsModalOpen] = useState(false);
	const [deleteId, setDeleteId] = useState<Id<"products"> | null>(null);
	const [editingId, setEditingId] = useState<Id<"products"> | null>(null);
	const [formData, setFormData] = useState({
		name: "",
		price: "",
		categoryId: "",
		description: "",
		image: "",
		menuNumber: "",
		variations: [] as Variation[],
	});
	const [recipeData, setRecipeData] = useState<
		{ inventoryId: Id<"inventory">; amount: number }[]
	>([]);
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [originalStorageId, setOriginalStorageId] = useState<string | null>(
		null
	);
	const [_isUploading, setIsUploading] = useState(false);
	const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
	const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

	const generateDescription = useAction(api.ai.generateProductDescription);

	const resetForm = () => {
		setFormData({
			name: "",
			price: "",
			categoryId: "",
			description: "",
			image: "",
			menuNumber: "",
			variations: [],
		});
		setRecipeData([]);
		setImageFile(null);
		setOriginalStorageId(null);
		setEditingId(null);
		setIsModalOpen(false);
	};

	const handleImageUpload = async () => {
		if (imageFile) {
			const postUrl = await generateUploadUrl();
			const result = await fetch(postUrl, {
				method: "POST",
				headers: { "Content-Type": imageFile.type },
				body: imageFile,
			});

			if (!result.ok) {
				throw new Error("Upload failed");
			}

			const { storageId } = await result.json();
			return storageId;
		}
		if (originalStorageId && formData.image) {
			return originalStorageId;
		}
		return formData.image;
	};

	const handleCreateOrUpdate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formData.categoryId) {
			toast.error("Pilih kategori");
			return;
		}

		setIsUploading(true);
		try {
			const imageId = await handleImageUpload();

			const productData = {
				name: formData.name,
				price: Number(formData.price),
				categoryId: formData.categoryId as Id<"categories">,
				description: formData.description,
				image: imageId,
				menuNumber: formData.menuNumber ? Number(formData.menuNumber) : undefined,
				variations: formData.variations,
			};

			let activeId: Id<"products">;
			if (editingId) {
				await updateProduct({
					id: editingId,
					...productData,
					isAvailable: true,
				});
				activeId = editingId;
			} else {
				activeId = await addProduct({ ...productData, isAvailable: true });
			}

			// Save recipe if any
			if (recipeData.length > 0) {
				await saveRecipe({
					productId: activeId,
					ingredients: recipeData,
				});
			}

			toast.success(
				editingId ? "Produk diperbarui" : "Produk berhasil ditambahkan"
			);
			resetForm();
		} catch (error) {
			console.error(error);
			toast.error("Gagal menyimpan produk");
		} finally {
			setIsUploading(false);
		}
	};

	const handleEdit = (product: Doc<"products"> & { storageId?: string }) => {
		setFormData({
			name: product.name,
			price: String(product.price),
			categoryId: product.categoryId,
			description: product.description || "",
			image: product.image || "",
			menuNumber: product.menuNumber != null ? String(product.menuNumber) : "",
			variations: (product.variations as Variation[]) || [],
		});
		setOriginalStorageId(product.storageId || null);
		setEditingId(product._id);

		// Load existing recipe
		const existingRecipe = recipes?.find((recipe: any) => recipe.productId === product._id && !recipe.variantName);
		if (existingRecipe) {
			setRecipeData(
				existingRecipe.ingredients as {
					inventoryId: Id<"inventory">;
					amount: number;
				}[]
			);
		} else {
			setRecipeData([]);
		}

		setIsModalOpen(true);
	};

	const addVariationFromPreset = (presetId: string) => {
		if (!presetId) {
			return;
		}
		const preset = variationPresets?.find((v: any) => v._id === presetId);
		if (!preset) {
			return;
		}

		// Check if already exists
		const existing = formData.variations.some((variation: any) => variation.name === preset.name);
		if (existing) {
			toast.error("Variasi ini sudah ditambahkan");
			return;
		}

		setFormData({
			...formData,
			variations: [
				...formData.variations,
				{
					name: preset.name,
					options: preset.options.map((o: any) => ({
						name: o.name,
						price: o.price,
					})),
				},
			],
		});
	};

	const removeVariation = (index: number) => {
		const newVariations = [...formData.variations];
		newVariations.splice(index, 1);
		setFormData({ ...formData, variations: newVariations });
	};

	const confirmDelete = async () => {
		if (!deleteId) {
			return;
		}
		try {
			await deleteProduct({ id: deleteId });
			toast.success("Produk dihapus");
			setDeleteId(null);
		} catch (error) {
			console.error(error);
			toast.error("Gagal menghapus produk");
		}
	};

	const toggleAvailability = async (id: Id<"products">, current: boolean) => {
		await updateProduct({ id, isAvailable: !current });
	};

	return (
		<>
			<div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="flex items-center gap-3">
					<h2 className="font-bold text-xl">Produk</h2>
					<div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
						<button
							className={`rounded px-2 py-1 transition-all ${viewMode === "grid" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
							onClick={() => setViewMode("grid")}
							title="Grid View"
							type="button"
						>
							<LayoutGrid className="h-4 w-4" />
						</button>
						<button
							className={`rounded px-2 py-1 transition-all ${viewMode === "table" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
							onClick={() => setViewMode("table")}
							title="Table View"
							type="button"
						>
							<List className="h-4 w-4" />
						</button>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<BulkOperations />
					<button
						className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground text-sm transition-all hover:brightness-110"
						onClick={() => {
							resetForm();
							setIsModalOpen(true);
						}}
						type="button"
					>
						<Plus className="h-4 w-4" /> Tambah Produk
					</button>
				</div>
			</div>

			{viewMode === "grid" ? (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{!products &&
						["sk1", "sk2", "sk3", "sk4", "sk5", "sk6", "sk7", "sk8", "sk9", "sk10"].map(
							(skId) => (
								<div
									className="animate-pulse rounded-xl border border-border bg-card p-3"
									key={skId}
								>
									<div className="aspect-square rounded-lg bg-muted/50" />
									<div className="mt-2 h-3 w-3/4 rounded bg-muted/50" />
									<div className="mt-2 h-2 w-1/2 rounded bg-muted/50" />
									<div className="mt-3 flex items-center justify-between">
										<div className="h-4 w-12 rounded bg-muted/50" />
										<div className="h-6 w-12 rounded bg-muted/50" />
									</div>
								</div>
							)
						)}

					{products &&
						products.length > 0 &&
						products.map((product: any) => (
							<div
								className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-all hover:border-primary/20 hover:shadow-sm"
								key={product._id}
							>
								<div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
									{product.image ? (
										<img
											alt={product.name}
											className="h-full w-full object-cover transition-transform group-hover:scale-105"
											src={product.image}
										/>
									) : (
										<div className="flex h-full w-full items-center justify-center text-muted-foreground text-[10px]">
											No Image
										</div>
									)}
									{product.menuNumber != null && (
										<div className="absolute top-1.5 left-1.5 flex h-5 min-w-5 items-center justify-center rounded px-1 bg-black text-white font-bold text-[9px] leading-none shadow">
											{product.menuNumber}
										</div>
									)}
									<div className="absolute top-1.5 right-1.5">
										<button
											className={`rounded-full p-1 shadow-sm transition-transform hover:scale-110 ${product.isAvailable ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}
											onClick={() =>
												toggleAvailability(product._id, product.isAvailable)
											}
											type="button"
										>
											{product.isAvailable ? (
												<CheckCircle2 className="h-3 w-3" />
											) : (
												<XCircle className="h-3 w-3" />
											)}
										</button>
									</div>
								</div>

								<div className="flex-1 min-w-0">
									<h3 className="font-bold text-[13px] leading-tight truncate">
										{product.name}
									</h3>
									<p className="mt-0.5 line-clamp-1 text-muted-foreground text-[11px]">
										{product.description || "Tanpa deskripsi"}
									</p>
								</div>

								<div className="mt-1 flex flex-col gap-1.5">
									<div className="flex items-center justify-between">
										<span className="font-bold text-primary text-[13px]">
											{new Intl.NumberFormat("id-ID", {
												style: "currency",
												currency: "IDR",
												maximumFractionDigits: 0,
											}).format(product.price)}
										</span>
										<div className="flex gap-0.5">
											<button
												className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
												onClick={() => handleEdit(product)}
												type="button"
											>
												<Edit className="h-3.5 w-3.5" />
											</button>
											<button
												className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10"
												onClick={() => setDeleteId(product._id)}
												type="button"
											>
												<Trash2 className="h-3.5 w-3.5" />
											</button>
										</div>
									</div>
									
									{hppProductMap?.[product._id] && (
										<div className="flex flex-col gap-0.5">
											{(() => {
												const hpp = hppProductMap[product._id];
												const isLowMargin = hpp.marginPercent < 30;
												const isLoss = hpp.hppPerServing > product.price;
												
												return (
													<>
														<div className={`flex items-center justify-between rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
															isLoss ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
															isLowMargin ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
															"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
														}`}>
															<span>Margin {hpp.marginPercent.toFixed(0)}%</span>
															<span>{new Intl.NumberFormat("id-ID", {
																maximumFractionDigits: 0,
															}).format(hpp.hppPerServing)}</span>
														</div>
														{isLoss && (
															<span className="text-[9px] text-red-600 font-bold animate-pulse">
																⚠ Harga &lt; HPP
															</span>
														)}
													</>
												);
											})()}
										</div>
									)}
								</div>
							</div>
						))}

					{products && products.length === 0 && (
						<div className="col-span-full py-12 text-center text-muted-foreground">
							Belum ada produk. Klik "Tambah Produk" untuk memulai.
						</div>
					)}
				</div>
			) : (
				<div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
								<tr>
									<th className="px-4 py-3 text-center w-12">No.</th>
									<th className="px-4 py-3">Produk</th>
									<th className="px-4 py-3">Kategori</th>
									<th className="px-4 py-3">Harga</th>
									<th className="px-4 py-3">HPP & Margin</th>
									<th className="px-4 py-3 text-center">Status</th>
									<th className="px-4 py-3 text-right">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{!products && Array.from({ length: 5 }).map((_, i) => (
									<tr className="animate-pulse" key={i}>
										<td className="px-4 py-3"><div className="mx-auto h-5 w-5 bg-muted rounded" /></td>
										<td className="px-4 py-3"><div className="h-8 w-32 bg-muted rounded" /></td>
										<td className="px-4 py-3"><div className="h-4 w-20 bg-muted rounded" /></td>
										<td className="px-4 py-3"><div className="h-4 w-16 bg-muted rounded" /></td>
										<td className="px-4 py-3"><div className="h-4 w-24 bg-muted rounded" /></td>
										<td className="px-4 py-3"><div className="mx-auto h-6 w-12 bg-muted rounded" /></td>
										<td className="px-4 py-3 text-right"><div className="ml-auto h-8 w-16 bg-muted rounded" /></td>
									</tr>
								))}

								{products && products.map((product: any) => {
									const cat = categories?.find(c => c._id === product.categoryId);
									const hpp = hppProductMap?.[product._id];

									return (
										<tr className="group hover:bg-muted/30 transition-colors" key={product._id}>
											<td className="px-4 py-2 text-center">
												{product.menuNumber != null ? (
													<span className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 bg-black text-white font-bold text-[9px] leading-none">
														{product.menuNumber}
													</span>
												) : (
													<span className="text-muted-foreground text-[10px]">—</span>
												)}
											</td>
											<td className="px-4 py-2">
												<div className="flex items-center gap-3">
													<div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
														{product.image ? (
															<img alt={product.name} className="h-full w-full object-cover" src={product.image} />
														) : (
															<div className="flex h-full w-full items-center justify-center text-[8px] text-muted-foreground">NA</div>
														)}
													</div>
													<div className="min-w-0">
														<p className="font-bold text-sm leading-none">{product.name}</p>
														<p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground whitespace-nowrap">
															{product.description || "Tanpa deskripsi"}
														</p>
													</div>
												</div>
											</td>
											<td className="px-4 py-2">
												<Badge className="font-normal text-[10px] bg-muted text-muted-foreground hover:bg-muted" variant="secondary">
													{cat?.name || "Uncategorized"}
												</Badge>
											</td>
											<td className="px-4 py-2 font-bold text-primary tabular-nums">
												{new Intl.NumberFormat("id-ID", {
													style: "currency",
													currency: "IDR",
													maximumFractionDigits: 0,
												}).format(product.price)}
											</td>
											<td className="px-4 py-2">
												{hpp ? (
													<div className="flex flex-col gap-0.5">
														<div className="flex items-center gap-2">
															<span className={`text-[11px] font-bold ${hpp.marginPercent < 30 ? "text-orange-500" : "text-green-600"}`}>
																{hpp.marginPercent.toFixed(0)}%
															</span>
															<span className="text-[10px] text-muted-foreground tabular-nums">
																HPP: {new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(hpp.hppPerServing)}
															</span>
														</div>
														{hpp.hppPerServing > product.price && (
															<span className="text-[9px] font-bold text-red-500 uppercase tracking-tighter">⚠ Under Margin</span>
														)}
													</div>
												) : (
													<span className="text-muted-foreground text-xs italic">No data</span>
												)}
											</td>
											<td className="px-4 py-2 text-center">
												<button
													className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white transition-transform active:scale-95 ${product.isAvailable ? "bg-green-500" : "bg-red-500"}`}
													onClick={() => toggleAvailability(product._id, product.isAvailable)}
													type="button"
												>
													{product.isAvailable ? (
														<>
															<CheckCircle2 className="h-3 w-3" /> <span>On</span>
														</>
													) : (
														<>
															<XCircle className="h-3 w-3" /> <span>Off</span>
														</>
													)}
												</button>
											</td>
											<td className="px-4 py-2 text-right">
												<div className="flex justify-end gap-1">
													<button
														className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
														onClick={() => handleEdit(product)}
														type="button"
													>
														<Edit className="h-3.5 w-3.5" />
													</button>
													<button
														className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
														onClick={() => setDeleteId(product._id)}
														type="button"
													>
														<Trash2 className="h-3.5 w-3.5" />
													</button>
												</div>
											</td>
										</tr>
									);
								})}

								{products && products.length === 0 && (
									<tr>
										<td className="py-12 text-center text-muted-foreground" colSpan={7}>
											Belum ada produk.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Post Modals for Products */}
			<AnimatePresence>
				{isModalOpen && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card"
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<div className="border-b border-border p-8 pb-3">
								<h3 className="font-bold text-2xl text-foreground tracking-tight">
									{editingId ? "Edit Produk" : "Tambah Produk Baru"}
								</h3>
							</div>

							<form
								className="flex flex-1 flex-col overflow-hidden"
								onSubmit={handleCreateOrUpdate}
							>
								<div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-8">
									<div className="space-y-2">
										<label
											className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
											htmlFor="product-name"
										>
											Nama Produk
										</label>
										<input
											className="w-full rounded-md bg-muted p-4 font-bold text-foreground text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring/20"
											id="product-name"
											onChange={(e) =>
												setFormData({ ...formData, name: e.target.value })
											}
											placeholder="Pesen Es Kopi..."
											required
											value={formData.name}
										/>
									</div>

									<div className="grid grid-cols-2 gap-5">
										<div className="col-span-1 space-y-2">
											<label
												className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
												htmlFor="product-category"
											>
												Kategori
											</label>
											<select
												className="w-full appearance-none rounded-md bg-muted p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring/20"
												id="product-category"
												onChange={(e) =>
													setFormData({
														...formData,
														categoryId: e.target.value,
													})
												}
												required
												value={formData.categoryId}
											>
												<option value="">Pilih Kategori</option>
												{categories?.map((c: any) => (
													<option key={c._id} value={c._id}>
														{c.name}
													</option>
												))}
											</select>
										</div>
										<div className="col-span-1 space-y-2">
											<label
												className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
												htmlFor="product-price"
											>
												Harga (Rp)
											</label>
											<input
												className="w-full rounded-md bg-muted p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-ring/20"
												id="product-price"
												onChange={(e) =>
													setFormData({ ...formData, price: e.target.value })
												}
												placeholder="20000"
												required
												type="number"
												value={formData.price}
											/>
										</div>
									</div>

									<div className="space-y-2">
										<label
											className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
											htmlFor="product-menu-number"
										>
											Nomor Menu
										</label>
										<input
											className="w-full rounded-md bg-muted p-4 font-bold text-foreground text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring/20"
											id="product-menu-number"
											min="1"
											onChange={(e) =>
												setFormData({ ...formData, menuNumber: e.target.value })
											}
											placeholder="Contoh: 1, 2, 3..."
											type="number"
											value={formData.menuNumber}
										/>
										<p className="text-muted-foreground text-[10px]">
											Nomor urut yang tampil di pojok kiri atas thumbnail menu. Kosongkan jika tidak diperlukan.
										</p>
									</div>

									<div className="relative space-y-2">
										<label
											className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
											htmlFor="product-desc"
										>
											Deskripsi
										</label>
										<div className="relative">
											<textarea
												className="h-28 w-full rounded-md bg-muted p-4 pr-12 font-medium text-foreground text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring/20"
												id="product-desc"
												onChange={(e) =>
													setFormData({
														...formData,
														description: e.target.value,
													})
												}
												placeholder="Perpaduan espresso pilihan..."
												value={formData.description}
											/>
											<button
												className="absolute top-3 right-3 rounded-xl bg-gradient-to-br from-[#A855F7] to-[#EC4899] p-2 text-white transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
												disabled={
													isGeneratingDesc ||
													!formData.name ||
													!formData.categoryId
												}
												onClick={async () => {
													if (!(formData.name && formData.categoryId)) {
														toast.error(
															"Isi nama dan kategori terlebih dahulu"
														);
														return;
													}
													setIsGeneratingDesc(true);
													try {
														const category = categories?.find(
															(c: any) => c._id === formData.categoryId
														);
														const desc = await generateDescription({
															productName: formData.name,
															category: category?.name || "Produk",
															price: Number(formData.price) || 0,
														});
														if (desc) {
															setFormData({ ...formData, description: desc });
															toast.success("Deskripsi berhasil di-generate!");
														}
													} catch {
														toast.error("Gagal generate deskripsi");
													} finally {
														setIsGeneratingDesc(false);
													}
												}}
												title="Generate deskripsi dengan AI"
												type="button"
											>
												<Sparkles
													className={`h-4 w-4 ${isGeneratingDesc ? "animate-pulse" : ""}`}
												/>
											</button>
										</div>
									</div>

									<div className="space-y-2">
										<label
											className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
											htmlFor="product-image-upload"
										>
											Gambar Produk
										</label>
										{formData.image && !imageFile && (
											<div className="relative mb-3 h-32 w-full overflow-hidden rounded-md border border-border bg-muted">
												<img
													alt="Preview"
													className="h-full w-full object-cover"
													height={225}
													src={formData.image}
													width={400}
												/>
												<button
													className="absolute top-2 right-2 rounded-full bg-destructive p-1.5 text-destructive-foreground transition-all hover:scale-110"
													onClick={() =>
														setFormData({ ...formData, image: "" })
													}
													type="button"
												>
													<Trash2 className="h-4 w-4" />
												</button>
											</div>
										)}
										<div className="relative">
											<input
												accept="image/*"
												className="hidden"
												id="product-image-upload"
												onChange={(e) => {
													const file = e.target.files?.[0];
													if (file) {
														setImageFile(file);
													}
												}}
												type="file"
											/>
											<label
												className="flex cursor-pointer items-center justify-between rounded-md bg-muted p-4 font-bold text-muted-foreground text-xs transition-all hover:bg-muted/80"
												htmlFor="product-image-upload"
											>
												<span className="flex items-center gap-2">
													<div className="rounded-lg bg-foreground px-3 py-1.5 text-background">
														Choose File
													</div>
													{imageFile ? imageFile.name : "No file chosen"}
												</span>
											</label>
										</div>
									</div>

									{/* Variations Section */}
									<div className="space-y-4 rounded-lg border border-border bg-muted/30 p-6">
										<div className="flex items-center justify-between">
											<h4 className="font-bold text-foreground text-xs uppercase tracking-widest">
												Variasi
											</h4>
											<select
												className="rounded-md bg-muted px-3 py-1.5 font-bold text-foreground text-[10px] outline-none"
												onChange={(e) => addVariationFromPreset(e.target.value)}
												value=""
											>
												<option value="">+ Preset</option>
												{variationPresets?.map((vp: any) => (
													<option key={vp._id} value={vp._id}>
														{vp.name}
													</option>
												))}
											</select>
										</div>
										<div className="flex flex-wrap gap-2">
											{formData.variations.map((v: any) => (
												<div
													className="flex items-center gap-2 rounded-md bg-foreground px-4 py-1.5 font-bold text-background text-[10px]"
													key={v.name}
												>
													<span className="uppercase">{v.name}</span>
													<button
														className="text-background/60 hover:text-destructive"
														onClick={() =>
															removeVariation(
																formData.variations.findIndex(
																	(vari) => vari.name === v.name
																)
															)
														}
														type="button"
													>
														<XCircle className="h-4 w-4" />
													</button>
												</div>
											))}
											{formData.variations.length === 0 && (
												<p className="w-full text-center font-medium text-muted-foreground/70 text-[10px] italic">
													Belum ada variasi
												</p>
											)}
										</div>
									</div>

									{/* Recipe Section */}
									<div className="space-y-4 rounded-lg border border-border bg-muted/30 p-6">
										<div className="flex items-center justify-between">
											<h4 className="font-bold text-foreground text-xs uppercase tracking-widest">
												Resep
											</h4>
											<select
												className="rounded-md bg-muted px-3 py-1.5 font-bold text-foreground text-[10px] outline-none"
												onChange={(e) => {
													const invId = e.target.value as Id<"inventory">;
													if (!invId) {
														return;
													}
													if (recipeData.some((r) => r.inventoryId === invId)) {
														toast.error("Bahan ini sudah ada");
														return;
													}
													setRecipeData([
														...recipeData,
														{ inventoryId: invId, amount: 0 },
													]);
												}}
												value=""
											>
												<option value="">+ Resep/Bahan</option>
												{(() => {
													const raw = inventory?.filter((i: any) => !i.baseRecipeId);
													const bases = inventory?.filter(
														(i: any) => i.baseRecipeId
													);
													return (
														<>
															{raw && raw.length > 0 && (
																<optgroup label="Bahan Mentah">
																	{raw.map((inv: any) => (
																		<option key={inv._id} value={inv._id}>
																			{inv.ingredientName} ({inv.unit})
																		</option>
																	))}
																</optgroup>
															)}
															{bases && bases.length > 0 && (
																<optgroup label="Resep Base">
																	{bases.map((inv: any) => (
																		<option key={inv._id} value={inv._id}>
																			{inv.ingredientName} ({inv.unit})
																		</option>
																	))}
																</optgroup>
															)}
														</>
													);
												})()}
											</select>
										</div>
										<div className="space-y-3">
											{recipeData.map((item: any, idx: number) => {
												const inv = inventory?.find(
													(i: any) => i._id === item.inventoryId
												);
												return (
													<div
														className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3"
														key={item.inventoryId}
													>
														<span className="flex-1 truncate font-bold text-foreground text-[11px] uppercase tracking-tight">
															{inv?.ingredientName || "Loading..."}
														</span>
														<div className="flex items-center gap-2">
															<input
																className="w-20 rounded-xl bg-muted px-3 py-1.5 font-bold text-foreground text-xs outline-none focus:ring-1 focus:ring-ring/20"
																onChange={(e) => {
																	const newData = [...recipeData];
																	newData[idx].amount = Number(e.target.value);
																	setRecipeData(newData);
																}}
																placeholder="0"
																type="number"
																value={item.amount}
															/>
															<span className="min-w-[40px] font-bold text-muted-foreground/70 text-[10px] uppercase">
																{inv?.unit}
															</span>
														</div>
														<button
															className="rounded-xl p-2 text-destructive transition-colors hover:bg-destructive/10"
															onClick={() => {
																const newData = [...recipeData];
																newData.splice(idx, 1);
																setRecipeData(newData);
															}}
															type="button"
														>
															<Trash2 className="h-4 w-4" />
														</button>
													</div>
												);
											})}
											{recipeData.length === 0 && (
												<p className="text-center font-medium text-muted-foreground/70 text-[10px] italic">
													Belum ada resep
												</p>
											)}
										</div>
									</div>
								</div>

								<div className="flex gap-6 border-t border-border p-8">
									<button
										className="flex-1 rounded-[24px] bg-muted py-5 font-bold text-foreground text-[10px] uppercase tracking-widest transition-all hover:bg-muted/80 active:scale-95"
										onClick={resetForm}
										type="button"
									>
										Batal
									</button>
									<button
										className="flex-1 rounded-[24px] bg-primary py-5 font-bold text-primary-foreground text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/20 transition-all hover:brightness-110 active:scale-[0.98]"
										type="submit"
									>
										Simpan
									</button>
								</div>
							</form>
						</motion.div>
					</div>
				)}
			</AnimatePresence>

			<ConfirmationModal
				confirmText="Hapus"
				isOpen={!!deleteId}
				message="Apakah Anda yakin ingin menghapus produk ini? Tindakan ini tidak dapat dibatalkan."
				onClose={() => setDeleteId(null)}
				onConfirm={confirmDelete}
				title="Konfirmasi Hapus"
				variant="danger"
			/>
		</>
	);
}

function SettingsTab({
	categories,
	variationPresets,
}: {
	categories: Doc<"categories">[] | undefined;
	variationPresets: Doc<"variationPresets">[] | undefined;
}) {
	const createCategory = useMutation(api.products.createCategory);
	const updateCategory = useMutation(api.products.updateCategory);
	const deleteCategory = useMutation(api.products.deleteCategory);

	const createVariationPreset = useMutation(api.products.addVariationPreset);
	const updateVariationPreset = useMutation(api.products.updateVariationPreset);
	const deleteVariationPreset = useMutation(api.products.deleteVariationPreset);

	const [categoryModal, setCategoryModal] = useState<{
		isOpen: boolean;
		editingId: Id<"categories"> | null;
		name: string;
	}>({ isOpen: false, editingId: null, name: "" });

	const [variationModal, setVariationModal] = useState<{
		isOpen: boolean;
		editingId: Id<"variationPresets"> | null;
		name: string;
		options: { id: string; name: string; price: string }[];
	}>({
		isOpen: false,
		editingId: null,
		name: "",
		options: [
			{ id: Math.random().toString(36).substring(7), name: "", price: "0" },
		],
	});

	const [confirmConfig, setConfirmConfig] = useState<{
		isOpen: boolean;
		title: string;
		message: string;
		onConfirm: () => void;
	}>({
		isOpen: false,
		title: "",
		message: "",
		onConfirm: () => {
			/* no-op */
		},
	});

	const handleCategorySubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			if (categoryModal.editingId) {
				await updateCategory({
					id: categoryModal.editingId,
					name: categoryModal.name,
				});
				toast.success("Kategori diperbarui");
			} else {
				await createCategory({ name: categoryModal.name });
				toast.success("Kategori ditambahkan");
			}
			setCategoryModal({ isOpen: false, editingId: null, name: "" });
		} catch (_error) {
			toast.error("Gagal menyimpan kategori");
		}
	};

	const handleVariationSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const formattedOptions = variationModal.options.map((opt) => ({
			name: opt.name,
			price: Number(opt.price) || 0,
		}));

		try {
			if (variationModal.editingId) {
				await updateVariationPreset({
					id: variationModal.editingId,
					name: variationModal.name,
					options: formattedOptions,
				});
				toast.success("Variasi diperbarui");
			} else {
				await createVariationPreset({
					name: variationModal.name,
					options: formattedOptions,
				});
				toast.success("Variasi ditambahkan");
			}
			setVariationModal({
				isOpen: false,
				editingId: null,
				name: "",
				options: [
					{ id: Math.random().toString(36).substring(7), name: "", price: "0" },
				],
			});
		} catch (_error) {
			toast.error("Gagal menyimpan variasi");
		}
	};

	return (
		<div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
			{/* Categories Section */}
			<div className="rounded-xl border border-border bg-card p-6 shadow-sm">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="font-bold text-lg">Manajemen Kategori</h3>
					<button
						className="rounded-lg bg-primary/10 px-3 py-1.5 font-bold text-primary text-xs hover:bg-primary/20"
						onClick={() =>
							setCategoryModal({ isOpen: true, editingId: null, name: "" })
						}
						type="button"
					>
						<Plus className="mr-1 inline-block h-3.5 w-3.5" /> Tambah
					</button>
				</div>
				<div className="space-y-2">
					{categories?.map((c) => (
						<div
							className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
							key={c._id}
						>
							<span className="font-medium text-sm">{c.name}</span>
							<div className="flex gap-1">
								<button
									className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
									onClick={() =>
										setCategoryModal({
											isOpen: true,
											editingId: c._id,
											name: c.name,
										})
									}
									type="button"
								>
									<Edit className="h-4 w-4" />
								</button>
								<button
									className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
									onClick={() =>
										setConfirmConfig({
											isOpen: true,
											title: "Hapus Kategori?",
											message: `Hapus kategori "${c.name}"? Produk dalam kategori ini mungkin akan terpengaruh.`,
											onConfirm: () => deleteCategory({ id: c._id }),
										})
									}
									type="button"
								>
									<Trash2 className="h-4 w-4" />
								</button>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Variation Presets Section */}
			<div className="rounded-xl border border-border bg-card p-6 shadow-sm">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="font-bold text-lg">Preset Variasi</h3>
					<button
						className="rounded-lg bg-primary/10 px-3 py-1.5 font-bold text-primary text-xs hover:bg-primary/20"
						onClick={() =>
							setVariationModal({
								isOpen: true,
								editingId: null,
								name: "",
								options: [
									{
										id: Math.random().toString(36).substring(7),
										name: "",
										price: "0",
									},
								],
							})
						}
						type="button"
					>
						<Plus className="mr-1 inline-block h-3.5 w-3.5" /> Tambah
					</button>
				</div>
				<div className="space-y-4">
					{variationPresets?.map((v) => (
						<div
							className="rounded-lg border border-border bg-muted/30 p-4"
							key={v._id}
						>
							<div className="mb-2 flex items-center justify-between">
								<span className="font-bold text-sm tracking-tight">
									{v.name}
								</span>
								<div className="flex gap-1">
									<button
										className="rounded-md p-1 text-muted-foreground hover:bg-muted"
										onClick={() =>
											setVariationModal({
												isOpen: true,
												editingId: v._id,
												name: v.name,
												options: v.options.map((o: any) => ({
													id: Math.random().toString(36).substring(7),
													name: o.name,
													price: String(o.price),
												})),
											})
										}
										type="button"
									>
										<Edit className="h-3.5 w-3.5" />
									</button>
									<button
										className="rounded-md p-1 text-destructive hover:bg-destructive/10"
										onClick={() =>
											setConfirmConfig({
												isOpen: true,
												title: "Hapus Preset?",
												message: `Hapus preset "${v.name}"?`,
												onConfirm: () => deleteVariationPreset({ id: v._id }),
											})
										}
										type="button"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
							</div>
							<div className="flex flex-wrap gap-2">
								{v.options.map((opt: any) => (
									<span
										className="rounded-full bg-background px-2.5 py-1 text-[10px] text-muted-foreground"
										key={opt.name}
									>
										{opt.name} (+{opt.price.toLocaleString("id-ID")})
									</span>
								))}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Category Modal */}
			<AnimatePresence>
				{categoryModal.isOpen && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4A3728]/40 p-4 backdrop-blur-md">
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="w-full max-w-sm rounded-[40px] border border-[#4A3728]/10 bg-[#F5F0E1] p-8 shadow-2xl"
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<h3 className="mb-6 font-bold text-2xl text-[#4A3728] tracking-tight">
								{categoryModal.editingId ? "Edit Kategori" : "Tambah Kategori"}
							</h3>
							<form className="space-y-6" onSubmit={handleCategorySubmit}>
								<div className="space-y-2">
									<label
										className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
										htmlFor="cat-name"
									>
										Nama Kategori
									</label>
									<input
										autoFocus
										className="w-full rounded-2xl bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all placeholder:text-[#4A3728]/30 focus:ring-2 focus:ring-[#4A3728]/20"
										id="cat-name"
										onChange={(e) =>
											setCategoryModal({
												...categoryModal,
												name: e.target.value,
											})
										}
										placeholder="e.g. Minuman Dingin"
										required
										value={categoryModal.name}
									/>
								</div>
								<div className="flex gap-4">
									<button
										className="flex-1 rounded-[20px] bg-[#E8E1CF] py-4 font-bold text-[#4A3728] text-[10px] uppercase tracking-widest transition-all hover:bg-[#E8E1CF]/80 active:scale-95"
										onClick={() =>
											setCategoryModal({
												isOpen: false,
												editingId: null,
												name: "",
											})
										}
										type="button"
									>
										Batal
									</button>
									<button
										className="flex-1 rounded-[20px] bg-[#4A3728] py-4 font-bold text-[#F5F0E1] text-[10px] uppercase tracking-[0.2em] shadow-[#4A3728]/20 shadow-lg transition-all hover:brightness-110 active:scale-95"
										type="submit"
									>
										Simpan
									</button>
								</div>
							</form>
						</motion.div>
					</div>
				)}
			</AnimatePresence>

			{/* Variation Modal */}
			<AnimatePresence>
				{variationModal.isOpen && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4A3728]/40 p-4 backdrop-blur-md">
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[40px] border border-[#4A3728]/10 bg-[#F5F0E1]"
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<div className="border-[#4A3728]/5 border-b p-8 pb-3">
								<h3 className="font-bold text-2xl text-[#4A3728] tracking-tight">
									{variationModal.editingId ? "Edit Variasi" : "Tambah Variasi"}
								</h3>
							</div>
							<form
								className="flex flex-1 flex-col overflow-hidden"
								onSubmit={handleVariationSubmit}
							>
								<div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-8">
									<div className="space-y-2">
										<label
											className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
											htmlFor="var-name"
										>
											Nama Grup Variasi
										</label>
										<input
											autoFocus
											className="w-full rounded-2xl bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all placeholder:text-[#4A3728]/30 focus:ring-2 focus:ring-[#4A3728]/20"
											id="var-name"
											onChange={(e) =>
												setVariationModal({
													...variationModal,
													name: e.target.value,
												})
											}
											placeholder="e.g. Level Pedas / Toping"
											required
											value={variationModal.name}
										/>
									</div>
									<div className="space-y-3">
										<p className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest">
											Opsi Variasi
										</p>
										<div className="space-y-3">
											{variationModal.options.map((opt, idx) => (
												<div className="flex gap-3" key={opt.id}>
													<input
														className="flex-1 rounded-xl bg-[#F0EAD6]/50 p-3 font-bold text-[#4A3728] text-xs outline-none focus:ring-1 focus:ring-[#4A3728]/20"
														onChange={(e) => {
															const newOptions = [...variationModal.options];
															newOptions[idx].name = e.target.value;
															setVariationModal({
																...variationModal,
																options: newOptions,
															});
														}}
														placeholder="Nama Opsi"
														required
														value={opt.name}
													/>
													<input
														className="w-28 rounded-xl bg-[#F0EAD6]/50 p-3 font-bold text-[#4A3728] text-xs outline-none focus:ring-1 focus:ring-[#4A3728]/20"
														onChange={(e) => {
															const newOptions = [...variationModal.options];
															newOptions[idx].price = e.target.value;
															setVariationModal({
																...variationModal,
																options: newOptions,
															});
														}}
														placeholder="Harga"
														required
														type="number"
														value={opt.price}
													/>
													{variationModal.options.length > 1 && (
														<button
															className="rounded-xl p-2 text-[#EF4444] transition-colors hover:bg-[#EF4444]/10"
															onClick={() => {
																const newOptions =
																	variationModal.options.filter(
																		(_, i) => i !== idx
																	);
																setVariationModal({
																	...variationModal,
																	options: newOptions,
																});
															}}
															type="button"
														>
															<Trash2 className="h-4 w-4" />
														</button>
													)}
												</div>
											))}
										</div>
										<button
											className="w-full rounded-2xl border border-[#4A3728]/10 border-dashed py-3 font-bold text-[#4A3728]/40 text-[10px] uppercase tracking-widest transition-all hover:bg-[#E8E1CF]/30"
											onClick={() =>
												setVariationModal({
													...variationModal,
													options: [
														...variationModal.options,
														{
															id: Math.random().toString(36).substring(7),
															name: "",
															price: "0",
														},
													],
												})
											}
											type="button"
										>
											+ Tambah Opsi
										</button>
									</div>
								</div>

								<div className="flex gap-4 border-[#4A3728]/5 border-t p-8">
									<button
										className="flex-1 rounded-[20px] bg-[#E8E1CF] py-4 font-bold text-[#4A3728] text-[10px] uppercase tracking-widest transition-all hover:bg-[#E8E1CF]/80 active:scale-95"
										onClick={() =>
											setVariationModal({
												isOpen: false,
												editingId: null,
												name: "",
												options: [
													{
														id: Math.random().toString(36).substring(7),
														name: "",
														price: "0",
													},
												],
											})
										}
										type="button"
									>
										Batal
									</button>
									<button
										className="flex-1 rounded-[20px] bg-[#4A3728] py-4 font-bold text-[#F5F0E1] text-[10px] uppercase tracking-[0.2em] shadow-[#4A3728]/20 shadow-lg transition-all hover:brightness-110 active:scale-95"
										type="submit"
									>
										Simpan
									</button>
								</div>
							</form>
						</motion.div>
					</div>
				)}
			</AnimatePresence>

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

function BaseRecipesTab() {
	const baseRecipes = useQuery(api.inventory.getBaseRecipes);
	const inventory = useQuery(api.inventory.getInventory);
	const createBaseRecipe = useMutation(api.inventory.createBaseRecipe);
	const updateBaseRecipe = useMutation(api.inventory.updateBaseRecipe);
	const deleteBaseRecipe = useMutation(api.inventory.deleteBaseRecipe);

	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingId, setEditingId] = useState<Id<"baseRecipes"> | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] =
		useState<Id<"baseRecipes"> | null>(null);
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		targetUnit: "ml",
		targetQuantity: "1000",
		ingredients: [] as { inventoryId: Id<"inventory">; amount: number }[],
	});

	const resetForm = () => {
		setFormData({
			name: "",
			description: "",
			targetUnit: "ml",
			targetQuantity: "1000",
			ingredients: [],
		});
		setEditingId(null);
		setIsModalOpen(false);
	};

	const handleEdit = (recipe: Doc<"baseRecipes">) => {
		setEditingId(recipe._id);
		setFormData({
			name: recipe.name,
			description: recipe.description || "",
			targetUnit: recipe.targetUnit,
			targetQuantity: String(recipe.targetQuantity),
			ingredients: recipe.ingredients as {
				inventoryId: Id<"inventory">;
				amount: number;
			}[],
		});
		setIsModalOpen(true);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const data = {
			name: formData.name,
			description: formData.description,
			targetUnit: formData.targetUnit,
			targetQuantity: Number(formData.targetQuantity),
			ingredients: formData.ingredients,
		};

		try {
			if (editingId) {
				await updateBaseRecipe({ id: editingId, ...data });
				toast.success("Resep base diperbarui");
			} else {
				await createBaseRecipe(data);
				toast.success("Resep base dibuat");
			}
			resetForm();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Gagal menyimpan resep base"
			);
		}
	};

	const addIngredient = (id: Id<"inventory">) => {
		if (formData.ingredients.some((i) => i.inventoryId === id)) {
			return;
		}
		setFormData({
			...formData,
			ingredients: [...formData.ingredients, { inventoryId: id, amount: 0 }],
		});
	};

	const removeIngredient = (idx: number) => {
		const newIngs = [...formData.ingredients];
		newIngs.splice(idx, 1);
		setFormData({ ...formData, ingredients: newIngs });
	};

	return (
		<>
			<div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<h2 className="font-bold text-xl">Daftar Resep Base (Pre-mix)</h2>
				<button
					className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground text-sm hover:brightness-110"
					onClick={() => {
						resetForm();
						setIsModalOpen(true);
					}}
					type="button"
				>
					<Plus className="h-4 w-4" /> Tambah Resep Base
				</button>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{baseRecipes?.map((recipe: any) => (
					<div
						className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
						key={recipe._id}
					>
						<div className="flex items-center justify-between">
							<h3 className="font-bold text-sm">{recipe.name}</h3>
							<div className="flex gap-1">
								<button
									className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
									onClick={() => handleEdit(recipe)}
									type="button"
								>
									<Edit className="h-4 w-4" />
								</button>
								<button
									className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
									onClick={() => setConfirmDeleteId(recipe._id)}
									type="button"
								>
									<Trash2 className="h-4 w-4" />
								</button>
							</div>
						</div>
						<p className="text-muted-foreground text-xs">
							{recipe.description}
						</p>
						<div className="flex items-center gap-2 border-border/50 border-t pt-3">
							<span className="font-bold text-xs">Target Produksi:</span>
							<span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-[10px] text-primary">
								{recipe.targetQuantity} {recipe.targetUnit}
							</span>
						</div>
						<div className="space-y-1">
							<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
								Bahan Komposisi:
							</p>
							{recipe.ingredients.map((ing: any, _i: number) => {
								const inv = inventory?.find((v: any) => v._id === ing.inventoryId);
								return (
									<div
										className="flex justify-between text-[11px]"
										key={ing.inventoryId}
									>
										<span className="text-muted-foreground">
											{inv?.ingredientName || "Unknown"}
										</span>
										<span className="font-bold font-mono">
											{ing.amount} {inv?.unit}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				))}
			</div>

			<AnimatePresence>
				{isModalOpen && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#4A3728]/40 p-4 backdrop-blur-md">
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[40px] border border-[#4A3728]/10 bg-[#F5F0E1]"
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<div className="border-[#4A3728]/5 border-b p-8 pb-3">
								<h3 className="font-bold text-2xl text-[#4A3728] tracking-tight">
									{editingId ? "Edit Resep Base" : "Buat Resep Base Baru"}
								</h3>
							</div>

							<form
								className="flex flex-1 flex-col overflow-hidden"
								onSubmit={handleSubmit}
							>
								<div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-8">
									<div className="space-y-2">
										<label
											className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
											htmlFor="base-recipe-name"
										>
											Nama Resep (e.g., Based Susu)
										</label>
										<input
											autoFocus
											className="w-full rounded-2xl bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all placeholder:text-[#4A3728]/30 focus:ring-2 focus:ring-[#4A3728]/20"
											id="base-recipe-name"
											onChange={(e) =>
												setFormData({ ...formData, name: e.target.value })
											}
											placeholder="Pesen Es Kopi..."
											required
											value={formData.name}
										/>
									</div>
									<div className="space-y-2">
										<label
											className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
											htmlFor="base-recipe-desc"
										>
											Deskripsi
										</label>
										<input
											className="w-full rounded-2xl bg-[#E8E1CF] p-4 font-medium text-[#4A3728] text-sm outline-none transition-all placeholder:text-[#4A3728]/30 focus:ring-2 focus:ring-[#4A3728]/20"
											id="base-recipe-desc"
											onChange={(e) =>
												setFormData({
													...formData,
													description: e.target.value,
												})
											}
											placeholder="Kegunaan resep ini..."
											value={formData.description}
										/>
									</div>
									<div className="grid grid-cols-2 gap-5">
										<div className="space-y-2">
											<label
												className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
												htmlFor="base-recipe-unit"
											>
												Batch Unit
											</label>
											<input
												className="w-full rounded-2xl bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all focus:ring-2 focus:ring-[#4A3728]/20"
												id="base-recipe-unit"
												onChange={(e) =>
													setFormData({
														...formData,
														targetUnit: e.target.value,
													})
												}
												placeholder="ml / liter / pcs"
												required
												value={formData.targetUnit}
											/>
										</div>
										<div className="space-y-2">
											<label
												className="font-bold text-[#4A3728]/60 text-[10px] uppercase tracking-widest"
												htmlFor="base-recipe-qty"
											>
												Batch Quantity
											</label>
											<input
												className="w-full rounded-2xl bg-[#E8E1CF] p-4 font-bold text-[#4A3728] text-sm outline-none transition-all focus:ring-2 focus:ring-[#4A3728]/20"
												id="base-recipe-qty"
												onChange={(e) =>
													setFormData({
														...formData,
														targetQuantity: e.target.value,
													})
												}
												required
												type="number"
												value={formData.targetQuantity}
											/>
										</div>
									</div>

									<div className="space-y-4 rounded-[32px] border border-[#4A3728]/10 bg-[#F0EAD6]/50 p-6">
										<div className="flex items-center justify-between">
											<h4 className="font-bold text-[#4A3728] text-xs uppercase tracking-widest">
												Komposisi Bahan
											</h4>
											<select
												className="rounded-xl bg-[#E8E1CF] px-3 py-1.5 font-bold text-[#4A3728] text-[10px] outline-none"
												onChange={(e) =>
													addIngredient(e.target.value as Id<"inventory">)
												}
												value=""
											>
												<option value="">+ Pilih Bahan</option>
												{inventory
													?.filter((i: any) => !i.baseRecipeId)
													.map((inv: any) => (
														<option key={inv._id} value={inv._id}>
															{inv.ingredientName} ({inv.unit})
														</option>
													))}
											</select>
										</div>
										<div className="space-y-3">
											{formData.ingredients.map((ing: any, idx: number) => {
												const inv = inventory?.find(
													(v: any) => v._id === ing.inventoryId
												);
												return (
													<div
														className="flex items-center gap-3 rounded-2xl bg-[#E8E1CF]/50 p-3"
														key={ing.inventoryId || `new-${idx}`}
													>
														<span className="flex-1 truncate font-bold text-[#4A3728] text-[11px] uppercase tracking-tight">
															{inv?.ingredientName}
														</span>
														<div className="flex items-center gap-2">
															<input
																className="w-20 rounded-xl bg-[#E8E1CF] px-3 py-1.5 font-bold text-[#4A3728] text-xs outline-none focus:ring-1 focus:ring-[#4A3728]/20"
																onChange={(e) => {
																	const newIngs = [...formData.ingredients];
																	newIngs[idx].amount = Number(e.target.value);
																	setFormData({
																		...formData,
																		ingredients: newIngs,
																	});
																}}
																placeholder="0"
																required
																type="number"
																value={ing.amount}
															/>
															<span className="min-w-[40px] font-bold text-[#4A3728]/40 text-[10px] uppercase">
																{inv?.unit}
															</span>
														</div>
														<button
															className="rounded-xl p-2 text-[#EF4444] transition-colors hover:bg-[#EF4444]/10"
															onClick={() => removeIngredient(idx)}
															type="button"
														>
															<Trash2 className="h-4 w-4" />
														</button>
													</div>
												);
											})}
											{formData.ingredients.length === 0 && (
												<p className="py-2 text-center font-medium text-[#4A3728]/40 text-[10px] italic">
													Belum ada bahan ditambahkan
												</p>
											)}
										</div>
									</div>
								</div>

								<div className="flex gap-6 border-[#4A3728]/5 border-t p-8">
									<button
										className="flex-1 rounded-[24px] bg-[#E8E1CF] py-5 font-bold text-[#4A3728] text-[10px] uppercase tracking-widest transition-all hover:bg-[#E8E1CF]/80 active:scale-95"
										onClick={resetForm}
										type="button"
									>
										Batal
									</button>
									<button
										className="flex-1 rounded-[24px] bg-[#4A3728] py-5 font-bold text-[#F5F0E1] text-xs uppercase tracking-[0.2em] shadow-[#4A3728]/20 shadow-xl transition-all hover:brightness-110 active:scale-[0.98]"
										type="submit"
									>
										Simpan
									</button>
								</div>
							</form>
						</motion.div>
					</div>
				)}
			</AnimatePresence>
			<ConfirmationModal
				confirmText="Hapus"
				isOpen={!!confirmDeleteId}
				message="Hapus resep base ini? Semua produk yang menggunakan resep ini mungkin terpengaruh."
				onClose={() => setConfirmDeleteId(null)}
				onConfirm={async () => {
					if (confirmDeleteId) {
						await deleteBaseRecipe({ id: confirmDeleteId });
						toast.success("Resep base dihapus");
					}
				}}
				title="Konfirmasi Hapus"
				variant="danger"
			/>
		</>
	);
}

function MixedRecipesTab() {
	const products = useQuery(api.products.getAllProductsAdmin);
	const baseRecipes = useQuery(api.inventory.getBaseRecipes);
	const recipes = useQuery(api.inventory.getRecipes);
	const inventory = useQuery(api.inventory.getInventory);

	// Group recipes by productId for easy lookup
	const recipesByProduct = recipes?.reduce(
		(acc: any, recipe: any) => {
			const productId = recipe.productId;
			if (!acc[productId]) {
				acc[productId] = [];
			}
			acc[productId].push(recipe);
			return acc;
		},
		{} as Record<string, typeof recipes>
	);

	return (
		<div className="space-y-6">
			<div>
				<h2 className="font-bold text-xl">Resep Gabungan</h2>
				<p className="text-muted-foreground text-sm">
					Daftar lengkap semua resep produk dan resep base.
				</p>
			</div>

			<div className="grid gap-6">
				{/* Section 1: Base Recipes */}
				<div className="space-y-4">
					<div className="flex items-center gap-2">
						<div className="h-6 w-1 rounded-full bg-primary" />
						<h3 className="font-bold text-lg">Resep Base (Pre-mix)</h3>
					</div>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{baseRecipes?.map((recipe: any) => (
							<div
								className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
								key={recipe._id}
							>
								<div className="flex items-center justify-between">
									<h3 className="font-bold text-sm">{recipe.name}</h3>
									<span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-[10px] text-primary">
										BASE
									</span>
								</div>
								<div className="space-y-1">
									<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
										Komposisi:
									</p>
									{recipe.ingredients.map((ing: any) => {
										const inv = inventory?.find(
											(v: any) => v._id === ing.inventoryId
										);
										return (
											<div
												className="flex justify-between text-[11px]"
												key={ing.inventoryId}
											>
												<span className="text-muted-foreground">
													{inv?.ingredientName || "Unknown"}
												</span>
												<span className="font-bold font-mono">
													{ing.amount} {inv?.unit}
												</span>
											</div>
										);
									})}
								</div>
							</div>
						))}
						{baseRecipes?.length === 0 && (
							<div className="col-span-full py-8 text-center text-muted-foreground text-sm">
								Belum ada resep base.
							</div>
						)}
					</div>
				</div>

				{/* Section 2: Product Recipes */}
				<div className="space-y-4">
					<div className="flex items-center gap-2">
						<div className="h-6 w-1 rounded-full bg-blue-500" />
						<h3 className="font-bold text-lg">Resep Produk (Menu)</h3>
					</div>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{products?.map((product: any) => {
							// Get recipes for this product from the recipes table
							const productRecipes = recipesByProduct?.[product._id];
							if (!productRecipes || productRecipes.length === 0) {
								return null;
							}

							return (
								<div
									className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
									key={product._id}
								>
									<div className="flex items-center justify-between">
										<h3 className="font-bold text-sm">{product.name}</h3>
										<span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-bold text-[10px] text-blue-500">
											MENU
										</span>
									</div>
									<div className="space-y-1">
										<p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
											Komposisi:
										</p>
										{productRecipes.map((recipe: any) =>
											recipe.ingredients.map(
												(ing: { inventoryId: string; amount: number }) => {
													const inv = inventory?.find(
														(v: any) => v._id === ing.inventoryId
													);
													return (
														<div
															className="flex justify-between text-[11px]"
															key={`${recipe._id}-${ing.inventoryId}`}
														>
															<span className="text-muted-foreground">
																{inv?.ingredientName || "Unknown"}
															</span>
															<span className="font-bold font-mono">
																{ing.amount} {inv?.unit}
															</span>
														</div>
													);
												}
											)
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
