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
	Search,
	Sparkles,
	Trash2,
	XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { compressFileToLimit, isOversized } from "@/lib/image-compress";
import { Skeleton } from "@/components/ui/skeleton";
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

type SavedViewKey =
	| "all"
	| "draft"
	| "out-of-stock"
	| "promo"
	| "inactive";

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
	const bulkUpdateProducts = useMutation(api.products.bulkUpdateProducts);
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
	const [viewMode, setViewMode] = useState<"grid" | "table">("table");
	const [searchKeyword, setSearchKeyword] = useState("");
	const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
	const [selectedStatusFilter, setSelectedStatusFilter] = useState<
		"all" | "active" | "inactive"
	>("all");
	const [selectedStockFilter, setSelectedStockFilter] = useState<
		"all" | "in-stock" | "out-of-stock"
	>("all");
	const [savedView, setSavedView] = useState<SavedViewKey>("all");
	const [selectedIds, setSelectedIds] = useState<Id<"products">[]>([]);
	const [bulkCategoryId, setBulkCategoryId] = useState("");
	const [bulkDiscount, setBulkDiscount] = useState("10");
	const [isSavingInline, setIsSavingInline] = useState<
		Record<string, { price?: boolean; quantity?: boolean; promoPrice?: boolean; menuNumber?: boolean }>
	>({});
	const searchInputRef = useRef<HTMLInputElement | null>(null);

	const generateDescription = useAction(api.ai.generateProductDescription);

	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

	const filteredProducts = useMemo(() => {
		if (!products) {
			return [];
		}
		let next = [...products];
		const keyword = searchKeyword.trim().toLowerCase();
		if (keyword) {
			next = next.filter((product) => {
				const categoryName =
					categories?.find((category) => category._id === product.categoryId)?.name ??
					"";
				return (
					product.name.toLowerCase().includes(keyword) ||
					(product.description ?? "").toLowerCase().includes(keyword) ||
					categoryName.toLowerCase().includes(keyword)
				);
			});
		}

		if (selectedCategoryFilter !== "all") {
			next = next.filter((product) => product.categoryId === selectedCategoryFilter);
		}

		if (selectedStatusFilter !== "all") {
			next = next.filter((product) =>
				selectedStatusFilter === "active"
					? product.isAvailable
					: !product.isAvailable
			);
		}

		if (selectedStockFilter !== "all") {
			next = next.filter((product) =>
				selectedStockFilter === "out-of-stock"
					? (product.quantity ?? 0) <= 0
					: (product.quantity ?? 0) > 0
			);
		}

		if (savedView === "draft") {
			next = next.filter((product) => !product.image || !product.description);
		}
		if (savedView === "out-of-stock") {
			next = next.filter((product) => (product.quantity ?? 0) <= 0);
		}
		if (savedView === "promo") {
			next = next.filter(
				(product) => typeof product.promoPrice === "number" && product.promoPrice < product.price
			);
		}
		if (savedView === "inactive") {
			next = next.filter((product) => !product.isAvailable);
		}

		return next.sort((a, b) => (a.menuNumber ?? 9999) - (b.menuNumber ?? 9999));
	}, [
		categories,
		products,
		savedView,
		searchKeyword,
		selectedCategoryFilter,
		selectedStatusFilter,
		selectedStockFilter,
	]);

	const allVisibleSelected =
		filteredProducts.length > 0 &&
		filteredProducts.every((product) => selectedSet.has(product._id));

	const selectedProducts = useMemo(
		() => (products ?? []).filter((product) => selectedSet.has(product._id)),
		[products, selectedSet]
	);

	const selectedSummary = useMemo(
		() =>
			selectedProducts.reduce(
				(acc, product) => {
					acc.totalPrice += product.price;
					acc.outOfStock += (product.quantity ?? 0) <= 0 ? 1 : 0;
					return acc;
				},
				{ totalPrice: 0, outOfStock: 0 }
			),
		[selectedProducts]
	);

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

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement
			) {
				return;
			}
			if (event.key === "/") {
				event.preventDefault();
				searchInputRef.current?.focus();
			}
			if (event.key.toLowerCase() === "n") {
				event.preventDefault();
				resetForm();
				setIsModalOpen(true);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	const formatRupiah = (value: number) =>
		new Intl.NumberFormat("id-ID", {
			style: "currency",
			currency: "IDR",
			maximumFractionDigits: 0,
		}).format(value);

	const getHealthScore = (product: Doc<"products">) => {
		let score = 0;
		if (product.name.length >= 4) score += 20;
		if ((product.description ?? "").length >= 30) score += 30;
		if (product.image) score += 25;
		if (product.categoryId) score += 15;
		if ((product.variations as Variation[] | undefined)?.length) score += 10;
		return score;
	};

	const toggleSelected = (id: Id<"products">) => {
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((current) => current !== id) : [...prev, id]
		);
	};

	const toggleAllVisible = () => {
		if (allVisibleSelected) {
			setSelectedIds((prev) =>
				prev.filter(
					(id) => !filteredProducts.some((product) => product._id === id)
				)
			);
			return;
		}
		setSelectedIds((prev) => {
			const merged = new Set(prev);
			for (const product of filteredProducts) {
				merged.add(product._id);
			}
			return Array.from(merged);
		});
	};

	const handleImageUpload = async () => {
		if (imageFile) {
			let uploadBlob: Blob = imageFile;
			let contentType = imageFile.type || "image/jpeg";

			if (isOversized(imageFile)) {
				toast.loading("Mengompresi gambar...", { id: "compress-product" });
				const compressed = await compressFileToLimit(imageFile);
				toast.dismiss("compress-product");
				uploadBlob = await fetch(compressed).then((r) => r.blob());
				contentType = "image/jpeg";
			}

			const postUrl = await generateUploadUrl();
			const result = await fetch(postUrl, {
				method: "POST",
				headers: { "Content-Type": contentType },
				body: uploadBlob,
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
		toast.success("Status produk diperbarui");
	};

	const runBulkAvailability = async (isAvailable: boolean) => {
		if (selectedIds.length === 0) {
			return;
		}
		await bulkUpdateProducts({
			ids: selectedIds,
			updates: { isAvailable },
		});
		toast.success(
			`${selectedIds.length} produk ${
				isAvailable ? "diaktifkan" : "dinonaktifkan"
			}`
		);
	};

	const runBulkCategory = async () => {
		if (!bulkCategoryId || selectedIds.length === 0) {
			toast.error("Pilih kategori dan produk terlebih dahulu");
			return;
		}
		await Promise.all(
			selectedIds.map((id) =>
				updateProduct({
					id,
					categoryId: bulkCategoryId as Id<"categories">,
				})
			)
		);
		toast.success(`${selectedIds.length} produk dipindahkan kategori`);
	};

	const runBulkDiscount = async () => {
		const discountPercent = Number(bulkDiscount);
		if (selectedIds.length === 0 || Number.isNaN(discountPercent)) {
			toast.error("Diskon tidak valid");
			return;
		}
		await Promise.all(
			selectedProducts.map((product) =>
				updateProduct({
					id: product._id,
					promoPrice: Math.max(
						Math.round(product.price * (1 - discountPercent / 100)),
						0
					),
				})
			)
		);
		toast.success(`Diskon ${discountPercent}% diterapkan ke ${selectedIds.length} produk`);
	};

	const runBulkDelete = async () => {
		if (selectedIds.length === 0) {
			return;
		}
		await Promise.all(selectedIds.map((id) => deleteProduct({ id })));
		setSelectedIds([]);
		toast.success("Produk terpilih berhasil dihapus");
	};

	const handleInlineNumberUpdate = async (
		id: Id<"products">,
		field: "price" | "quantity" | "promoPrice" | "menuNumber",
		value: string,
		currentValue: number
	) => {
		const parsed = value === "" ? 0 : Number(value);
		if (Number.isNaN(parsed) || parsed < 0) {
			const label =
				field === "price"
					? "Harga"
					: field === "quantity"
						? "Stok"
						: field === "promoPrice"
							? "Harga promo"
							: "Nomor menu";
			toast.error(`${label} tidak valid`);
			return;
		}
		if (parsed === currentValue) {
			return;
		}
		setIsSavingInline((prev) => ({
			...prev,
			[id]: { ...(prev[id] ?? {}), [field]: true },
		}));
		try {
			await updateProduct({
				id,
				[field]: parsed,
			});
			const label =
				field === "price"
					? "Harga"
					: field === "quantity"
						? "Stok"
						: field === "promoPrice"
							? "Harga promo"
							: "Nomor menu";
			toast.success(`${label} diperbarui`);
		} finally {
			setIsSavingInline((prev) => ({
				...prev,
				[id]: { ...(prev[id] ?? {}), [field]: false },
			}));
		}
	};

	const handleInlineTextUpdate = async (
		id: Id<"products">,
		field: "name" | "description",
		value: string,
		currentValue: string
	) => {
		const normalized = value.trim();
		if (normalized === currentValue.trim()) {
			return;
		}
		if (field === "name" && normalized.length < 2) {
			toast.error("Nama produk minimal 2 karakter");
			return;
		}
		await updateProduct({ id, [field]: normalized });
		toast.success(`${field === "name" ? "Nama" : "Deskripsi"} diperbarui`);
	};

	const handleInlineCategoryUpdate = async (
		id: Id<"products">,
		value: Id<"categories">,
		currentValue: Id<"categories">
	) => {
		if (value === currentValue) {
			return;
		}
		await updateProduct({ id, categoryId: value });
		toast.success("Kategori diperbarui");
	};

	return (
		<>
			<div className="space-y-4">
				<div className="space-y-4">
					<div className="rounded-xl border border-border bg-card p-4">
						<div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div>
								<h2 className="font-bold text-xl">Product Workspace</h2>
								<p className="text-muted-foreground text-xs">
									Kelola produk lebih cepat dengan filter, bulk action, dan quick edit.
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
									<button
										className={`rounded px-2 py-1 transition-all ${viewMode === "grid" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
										onClick={() => setViewMode("grid")}
										type="button"
									>
										<LayoutGrid className="h-4 w-4" />
									</button>
									<button
										className={`rounded px-2 py-1 transition-all ${viewMode === "table" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
										onClick={() => setViewMode("table")}
										type="button"
									>
										<List className="h-4 w-4" />
									</button>
								</div>
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

						<div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
							<div className="relative md:col-span-2">
								<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
								<input
									className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
									onChange={(event) => setSearchKeyword(event.target.value)}
									placeholder="Cari produk, deskripsi, kategori... (/)"
									ref={searchInputRef}
									value={searchKeyword}
								/>
							</div>
							<select
								className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
								onChange={(event) => setSelectedCategoryFilter(event.target.value)}
								value={selectedCategoryFilter}
							>
								<option value="all">Semua kategori</option>
								{categories?.map((category) => (
									<option key={category._id} value={category._id}>
										{category.name}
									</option>
								))}
							</select>
							<select
								className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
								onChange={(event) =>
									setSelectedStatusFilter(
										event.target.value as "all" | "active" | "inactive"
									)
								}
								value={selectedStatusFilter}
							>
								<option value="all">Semua status</option>
								<option value="active">Active</option>
								<option value="inactive">Inactive</option>
							</select>
							<select
								className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
								onChange={(event) =>
									setSelectedStockFilter(
										event.target.value as "all" | "in-stock" | "out-of-stock"
									)
								}
								value={selectedStockFilter}
							>
								<option value="all">Semua stok</option>
								<option value="in-stock">In stock</option>
								<option value="out-of-stock">Out of stock</option>
							</select>
						</div>

						<div className="mb-4 flex flex-wrap items-center gap-2">
							{[
								{ key: "all", label: "Semua" },
								{ key: "draft", label: "Draft" },
								{ key: "out-of-stock", label: "Out of stock" },
								{ key: "promo", label: "Promo" },
								{ key: "inactive", label: "Inactive" },
							].map((view) => (
								<button
									className={`rounded-full border px-3 py-1 text-xs transition-colors ${
										savedView === view.key
											? "border-primary bg-primary/10 text-primary"
											: "border-border bg-background text-muted-foreground hover:text-foreground"
									}`}
									key={view.key}
									onClick={() => setSavedView(view.key as SavedViewKey)}
									type="button"
								>
									{view.label}
								</button>
							))}
						</div>

						{selectedIds.length > 0 && (
							<div className="sticky top-2 z-10 mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
								<div className="mb-2 flex items-center justify-between">
									<p className="font-semibold text-sm">
										{selectedIds.length} produk dipilih
									</p>
									<p className="text-muted-foreground text-xs">
										Total: {formatRupiah(selectedSummary.totalPrice)}
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<button
										className="rounded-md bg-green-600 px-3 py-1.5 font-medium text-white text-xs"
										onClick={() => runBulkAvailability(true)}
										type="button"
									>
										Publish
									</button>
									<button
										className="rounded-md bg-slate-700 px-3 py-1.5 font-medium text-white text-xs"
										onClick={() => runBulkAvailability(false)}
										type="button"
									>
										Unpublish
									</button>
									<select
										className="h-8 rounded-md border border-border bg-background px-2 text-xs"
										onChange={(event) => setBulkCategoryId(event.target.value)}
										value={bulkCategoryId}
									>
										<option value="">Pindah kategori...</option>
										{categories?.map((category) => (
											<option key={category._id} value={category._id}>
												{category.name}
											</option>
										))}
									</select>
									<button
										className="rounded-md border border-border px-3 py-1.5 text-xs"
										onClick={runBulkCategory}
										type="button"
									>
										Apply Kategori
									</button>
									<input
										className="h-8 w-16 rounded-md border border-border bg-background px-2 text-xs"
										onChange={(event) => setBulkDiscount(event.target.value)}
										type="number"
										value={bulkDiscount}
									/>
									<button
										className="rounded-md border border-border px-3 py-1.5 text-xs"
										onClick={runBulkDiscount}
										type="button"
									>
										Set Promo %
									</button>
									<button
										className="rounded-md bg-destructive px-3 py-1.5 font-medium text-destructive-foreground text-xs"
										onClick={runBulkDelete}
										type="button"
									>
										Hapus
									</button>
								</div>
							</div>
						)}

						{viewMode === "grid" ? (
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
								{!products &&
									Array.from({ length: 8 }).map((_, i) => (
										<div className="rounded-xl border border-border bg-card p-3" key={i}>
											<Skeleton className="aspect-square w-full rounded-lg" />
											<Skeleton className="mt-2 h-3 w-3/4" />
										</div>
									))}
								{products &&
									filteredProducts.map((product) => (
										<div className="group rounded-xl border border-border bg-card p-3" key={product._id}>
											<div className="mb-2 flex items-center justify-between">
												<input
													checked={selectedSet.has(product._id)}
													onChange={() => toggleSelected(product._id)}
													type="checkbox"
												/>
												<button
													className="rounded p-1 text-destructive hover:bg-destructive/10"
													onClick={() => setDeleteId(product._id)}
													type="button"
												>
													<Trash2 className="h-3.5 w-3.5" />
												</button>
											</div>
											<div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
												{product.image ? (
													<img alt={product.name} className="h-full w-full object-cover" src={product.image} />
												) : (
													<div className="flex h-full items-center justify-center text-muted-foreground text-xs">
														No image
													</div>
												)}
											</div>
											<p className="mt-2 truncate font-semibold text-sm">{product.name}</p>
											<p className="text-primary text-xs">{formatRupiah(product.price)}</p>
										</div>
									))}
							</div>
						) : (
							<div className="rounded-xl border border-border bg-card shadow-sm">
								<div className="overflow-x-auto">
									<table className="w-full min-w-[1240px] text-left text-xs">
										<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider">
											<tr>
												<th className="px-3 py-3 text-center">
													<input checked={allVisibleSelected} onChange={toggleAllVisible} type="checkbox" />
												</th>
												<th className="px-3 py-3 text-center">No.</th>
												<th className="px-3 py-3">Nama</th>
												<th className="px-3 py-3">Deskripsi</th>
												<th className="px-3 py-3">Kategori</th>
												<th className="px-3 py-3">Harga</th>
												<th className="px-3 py-3">Promo</th>
												<th className="px-3 py-3">Stok</th>
												<th className="px-3 py-3">Status</th>
												<th className="px-3 py-3">Health</th>
												<th className="px-3 py-3 text-right">Aksi</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-border">
											{products &&
												filteredProducts.map((product) => {
													const health = getHealthScore(product);
													const hpp = hppProductMap?.[product._id];

													return (
														<tr className="group transition-colors hover:bg-muted/40" key={product._id}>
															<td className="px-3 py-3 text-center">
																<input
																	checked={selectedSet.has(product._id)}
																	onChange={() => toggleSelected(product._id)}
																	type="checkbox"
																/>
															</td>
															<td className="px-3 py-3 text-center text-xs">
																<input
																	className="h-7 w-14 rounded-md border border-border bg-background px-2 text-center"
																	defaultValue={product.menuNumber ?? ""}
																	onBlur={(event) =>
																		handleInlineNumberUpdate(
																			product._id,
																			"menuNumber",
																			event.target.value,
																			product.menuNumber ?? 0
																		)
																	}
																	type="number"
																/>
															</td>
															<td className="px-3 py-3">
																<div className="flex items-center gap-2">
																	<div className="h-8 w-8 overflow-hidden rounded-md bg-muted">
																		{product.image ? (
																			<img alt={product.name} className="h-full w-full object-cover" src={product.image} />
																		) : (
																			<div className="flex h-full w-full items-center justify-center text-[8px] text-muted-foreground">NA</div>
																		)}
																	</div>
																	<input
																		className="h-7 w-48 rounded-md border border-border bg-background px-2"
																		defaultValue={product.name}
																		onBlur={(event) =>
																			handleInlineTextUpdate(
																				product._id,
																				"name",
																				event.target.value,
																				product.name
																			)
																		}
																		type="text"
																	/>
																</div>
															</td>
															<td className="px-3 py-3">
																<input
																	className="h-7 w-56 rounded-md border border-border bg-background px-2"
																	defaultValue={product.description ?? ""}
																	onBlur={(event) =>
																		handleInlineTextUpdate(
																			product._id,
																			"description",
																			event.target.value,
																			product.description ?? ""
																		)
																	}
																	type="text"
																/>
															</td>
															<td className="px-3 py-3">
																<select
																	className="h-7 w-36 rounded-md border border-border bg-background px-2"
																	onChange={(event) =>
																		handleInlineCategoryUpdate(
																			product._id,
																			event.target.value as Id<"categories">,
																			product.categoryId
																		)
																	}
																	value={product.categoryId}
																>
																	{categories?.map((category) => (
																		<option key={category._id} value={category._id}>
																			{category.name}
																		</option>
																	))}
																</select>
															</td>
															<td className="px-3 py-3">
																<input
																	className="h-8 w-28 rounded-md border border-border bg-background px-2 text-xs"
																	defaultValue={product.price}
																	onBlur={(event) =>
																		handleInlineNumberUpdate(
																			product._id,
																			"price",
																			event.target.value,
																			product.price
																		)
																	}
																	onKeyDown={(event) => {
																		if (event.key === "Enter") {
																			(event.target as HTMLInputElement).blur();
																		}
																	}}
																	type="number"
																/>
																{isSavingInline[product._id]?.price && (
																	<p className="mt-1 text-[10px] text-muted-foreground">Saving...</p>
																)}
															</td>
															<td className="px-3 py-3">
																<input
																	className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs"
																	defaultValue={product.promoPrice ?? ""}
																	onBlur={(event) =>
																		handleInlineNumberUpdate(
																			product._id,
																			"promoPrice",
																			event.target.value,
																			product.promoPrice ?? 0
																		)
																	}
																	type="number"
																/>
															</td>
															<td className="px-3 py-3">
																<input
																	className="h-8 w-20 rounded-md border border-border bg-background px-2 text-xs"
																	defaultValue={product.quantity ?? 0}
																	onBlur={(event) =>
																		handleInlineNumberUpdate(
																			product._id,
																			"quantity",
																			event.target.value,
																			product.quantity ?? 0
																		)
																	}
																	onKeyDown={(event) => {
																		if (event.key === "Enter") {
																			(event.target as HTMLInputElement).blur();
																		}
																	}}
																	type="number"
																/>
																{isSavingInline[product._id]?.quantity && (
																	<p className="mt-1 text-[10px] text-muted-foreground">Saving...</p>
																)}
															</td>
															<td className="px-3 py-3">
																<div className="flex flex-col gap-1">
																	<button
																		className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${product.isAvailable ? "bg-green-600" : "bg-red-500"}`}
																		onClick={() => toggleAvailability(product._id, product.isAvailable)}
																		type="button"
																	>
																		{product.isAvailable ? "Active" : "Inactive"}
																	</button>
																	{hpp && (
																		<span className="text-[10px] text-muted-foreground">
																			Margin {hpp.marginPercent.toFixed(0)}%
																		</span>
																	)}
																</div>
															</td>
															<td className="px-3 py-3">
																<div className="space-y-1">
																	<div className="h-1.5 w-24 rounded-full bg-muted">
																		<div
																			className={`${health > 80 ? "bg-green-500" : health > 50 ? "bg-amber-500" : "bg-red-500"} h-full rounded-full`}
																			style={{ width: `${health}%` }}
																		/>
																	</div>
																	<p className="text-[10px] text-muted-foreground">{health}/100</p>
																</div>
															</td>
															<td className="px-3 py-3">
																<div className="flex justify-end gap-1">
																	<button className="rounded-md p-1.5 text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(product._id)} type="button">
																		<Trash2 className="h-3.5 w-3.5" />
																	</button>
																</div>
															</td>
														</tr>
													);
												})}
											{products && filteredProducts.length === 0 && (
												<tr>
													<td className="px-3 py-10 text-center text-muted-foreground" colSpan={11}>
														Belum ada produk sesuai filter. Coba ubah filter atau tambah produk baru.
													</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							</div>
						)}
					</div>
				</div>

			</div>

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
												{categories?.filter(c => !c.parentId).map((parent: any) => (
													<optgroup key={parent._id} label={parent.name}>
														<option value={parent._id}>{parent.name} (Utama)</option>
														{categories?.filter(c => c.parentId === parent._id).map((sub: any) => (
															<option key={sub._id} value={sub._id}>
																↳ {sub.name}
															</option>
														))}
													</optgroup>
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
										{formData.variations.length === 0 ? (
											<p className="text-center font-medium text-muted-foreground/70 text-[10px] italic">
												Belum ada variasi. Pilih preset di atas.
											</p>
										) : (
											<div className="space-y-3">
												{formData.variations.map((v: any, vIdx: number) => (
													<div
														className="rounded-lg border border-border bg-card p-4"
														key={v.name}
													>
														<div className="mb-3 flex items-center justify-between">
															<span className="font-bold text-foreground text-[11px] uppercase tracking-wider">
																{v.name}
															</span>
															<button
																className="text-muted-foreground transition-colors hover:text-destructive"
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
														<div className="space-y-2">
															{v.options.map((opt: any, oIdx: number) => (
																<div
																	className="flex items-center gap-3"
																	key={opt.name}
																>
																	<span className="flex-1 text-foreground/80 text-[11px]">
																		{opt.name}
																	</span>
																	<div className="flex items-center gap-1.5">
																		<span className="text-muted-foreground text-[10px]">
																			+Rp
																		</span>
																		<input
																			className="w-24 rounded-md bg-muted px-2 py-1 text-right font-bold text-foreground text-[11px] outline-none focus:ring-1 focus:ring-primary/30"
																			min="0"
																			onChange={(e) => {
																				const newVariations =
																					formData.variations.map(
																						(variation: any, vi: number) => {
																							if (vi !== vIdx)
																								return variation;
																							return {
																								...variation,
																								options:
																									variation.options.map(
																										(
																											o: any,
																											oi: number
																										) =>
																											oi !== oIdx
																												? o
																												: {
																														...o,
																														price:
																															Number(
																																e
																																	.target
																																	.value
																															) || 0,
																													}
																									),
																							};
																						}
																					);
																				setFormData({
																					...formData,
																					variations: newVariations,
																				});
																			}}
																			type="number"
																			value={opt.price}
																		/>
																	</div>
																</div>
															))}
														</div>
													</div>
												))}
											</div>
										)}
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
	const [settingsSearch, setSettingsSearch] = useState("");

	const [categoryModal, setCategoryModal] = useState<{
		isOpen: boolean;
		editingId: Id<"categories"> | null;
		name: string;
		parentId?: Id<"categories"> | null;
		track?: "kitchen" | "bar" | null;
	}>({ isOpen: false, editingId: null, name: "", parentId: null, track: null });

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

	const normalizedSettingsSearch = settingsSearch.trim().toLowerCase();
	const filteredCategories = useMemo(() => {
		if (!categories) {
			return [];
		}
		if (!normalizedSettingsSearch) {
			return categories;
		}
		return categories.filter((category) =>
			category.name.toLowerCase().includes(normalizedSettingsSearch)
		);
	}, [categories, normalizedSettingsSearch]);

	const filteredVariationPresets = useMemo(() => {
		if (!variationPresets) {
			return [];
		}
		if (!normalizedSettingsSearch) {
			return variationPresets;
		}
		return variationPresets.filter((preset) =>
			preset.name.toLowerCase().includes(normalizedSettingsSearch)
		);
	}, [normalizedSettingsSearch, variationPresets]);

	const handleCategorySubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			if (categoryModal.editingId) {
				await updateCategory({
					id: categoryModal.editingId,
					name: categoryModal.name,
					parentId: categoryModal.parentId || undefined,
					track: categoryModal.track || undefined,
				});
				toast.success("Kategori diperbarui");
			} else {
				await createCategory({ 
					name: categoryModal.name,
					parentId: categoryModal.parentId || undefined,
					track: categoryModal.track || undefined,
				});
				toast.success("Kategori ditambahkan");
			}
			setCategoryModal({ isOpen: false, editingId: null, name: "", parentId: null, track: null });
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
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Total Kategori</p>
					<p className="font-bold text-lg">{categories?.length ?? 0}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Kategori Utama</p>
					<p className="font-bold text-lg">{categories?.filter((c) => !c.parentId).length ?? 0}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Preset Variasi</p>
					<p className="font-bold text-lg">{variationPresets?.length ?? 0}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Track Kitchen/Bar</p>
					<p className="font-bold text-lg">{categories?.filter((c) => !!c.track).length ?? 0}</p>
				</div>
			</div>

			<div className="rounded-lg border border-border bg-card p-3">
				<input
					className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
					onChange={(event) => setSettingsSearch(event.target.value)}
					placeholder="Cari kategori atau preset variasi..."
					value={settingsSearch}
				/>
			</div>

		<div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
			{/* Categories Section */}
			<div className="rounded-xl border border-border bg-card p-6 shadow-sm">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="font-bold text-lg">Manajemen Kategori</h3>
					<button
						className="rounded-lg bg-primary/10 px-3 py-1.5 font-bold text-primary text-xs hover:bg-primary/20"
						onClick={() =>
							setCategoryModal({ isOpen: true, editingId: null, name: "", track: null })
						}
						type="button"
					>
						<Plus className="mr-1 inline-block h-3.5 w-3.5" /> Tambah
					</button>
				</div>
				<div className="space-y-2">
					{filteredCategories.filter(c => !c.parentId).map((c) => (
						<div key={c._id} className="space-y-2">
							<div
								className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
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
												parentId: c.parentId,
												track: c.track as any,
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
							
							{/* Render Sub-categories */}
							{filteredCategories.filter(sub => sub.parentId === c._id).length > 0 && (
								<div className="ml-6 space-y-2 border-l-2 border-border pl-4">
									{filteredCategories.filter(sub => sub.parentId === c._id).map(sub => (
										<div
											className="flex items-center justify-between rounded-lg bg-muted/30 p-2"
											key={sub._id}
										>
											<span className="text-sm text-muted-foreground">{sub.name}</span>
											<div className="flex gap-1">
												<button
													className="rounded-md p-1 text-muted-foreground hover:bg-muted"
													onClick={() =>
														setCategoryModal({
															isOpen: true,
															editingId: sub._id,
															name: sub.name,
															parentId: sub.parentId,
															track: sub.track as any,
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
															title: "Hapus Sub-Kategori?",
															message: `Hapus sub-kategori "${sub.name}"?`,
															onConfirm: () => deleteCategory({ id: sub._id }),
														})
													}
													type="button"
												>
													<Trash2 className="h-3.5 w-3.5" />
												</button>
											</div>
										</div>
									))}
								</div>
							)}
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
					{filteredVariationPresets.map((v) => (
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
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-md">
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="w-full max-w-sm rounded-[40px] border border-border bg-card p-8 shadow-2xl"
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<h3 className="mb-6 font-bold text-2xl text-foreground tracking-tight">
								{categoryModal.editingId ? "Edit Kategori" : "Tambah Kategori"}
							</h3>
							<form className="space-y-6" onSubmit={handleCategorySubmit}>
								<div className="space-y-2">
									<label
										className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
										htmlFor="cat-name"
									>
										Nama Kategori
									</label>
									<input
										autoFocus
										className="w-full rounded-2xl bg-muted p-4 font-bold text-foreground text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20"
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
								
								<div className="space-y-2">
									<label
										className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
										htmlFor="cat-parent"
									>
										Sub dari Kategori (Opsional)
									</label>
									<select
										className="w-full rounded-2xl bg-muted p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
										id="cat-parent"
										onChange={(e) =>
											setCategoryModal({
												...categoryModal,
												parentId: e.target.value ? (e.target.value as Id<"categories">) : null,
											})
										}
										value={categoryModal.parentId || ""}
									>
										<option value="">- Tidak ada (Kategori Utama) -</option>
										{categories?.filter((c) => c._id !== categoryModal.editingId && !c.parentId).map((c) => (
											<option key={c._id} value={c._id}>
												{c.name}
											</option>
										))}
									</select>
								</div>

								<div className="space-y-2">
									<label
										className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
										htmlFor="cat-track"
									>
										Track Order (Monitor)
									</label>
									<div className="flex gap-2">
										<button
											className={`flex-1 rounded-xl py-3 font-bold text-xs transition-all ${
												categoryModal.track === "kitchen"
													? "bg-primary text-primary-foreground shadow-sm"
													: "bg-muted text-muted-foreground hover:bg-muted/80"
											}`}
											onClick={() =>
												setCategoryModal({ ...categoryModal, track: "kitchen" })
											}
											type="button"
										>
											Kitchen
										</button>
										<button
											className={`flex-1 rounded-xl py-3 font-bold text-xs transition-all ${
												categoryModal.track === "bar"
													? "bg-primary text-primary-foreground shadow-sm"
													: "bg-muted text-muted-foreground hover:bg-muted/80"
											}`}
											onClick={() =>
												setCategoryModal({ ...categoryModal, track: "bar" })
											}
											type="button"
										>
											Bar
										</button>
										<button
											className={`flex-1 rounded-xl py-3 font-bold text-xs transition-all ${
												!categoryModal.track
													? "bg-primary text-primary-foreground shadow-sm"
													: "bg-muted text-muted-foreground hover:bg-muted/80"
											}`}
											onClick={() =>
												setCategoryModal({ ...categoryModal, track: null })
											}
											type="button"
										>
											None
										</button>
									</div>
								</div>

								<div className="flex gap-4">
									<button
										className="flex-1 rounded-[20px] bg-muted py-4 font-bold text-foreground text-[10px] uppercase tracking-widest transition-all hover:bg-muted/80 active:scale-95"
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
										className="flex-1 rounded-[20px] bg-primary py-4 font-bold text-primary-foreground text-[10px] uppercase tracking-[0.2em] shadow-lg transition-all hover:brightness-110 active:scale-95"
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
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-md">
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[40px] border border-border bg-card"
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<div className="border-border/50 border-b p-8 pb-3">
								<h3 className="font-bold text-2xl text-foreground tracking-tight">
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
											className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
											htmlFor="var-name"
										>
											Nama Grup Variasi
										</label>
										<input
											autoFocus
											className="w-full rounded-2xl bg-muted p-4 font-bold text-foreground text-sm outline-none transition-all placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20"
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
										<p className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest">
											Opsi Variasi
										</p>
										<div className="space-y-3">
											{variationModal.options.map((opt, idx) => (
												<div className="flex gap-3" key={opt.id}>
													<input
														className="flex-1 rounded-xl bg-muted/50 p-3 font-bold text-foreground text-xs outline-none focus:ring-1 focus:ring-primary/20"
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
														className="w-28 rounded-xl bg-muted/50 p-3 font-bold text-foreground text-xs outline-none focus:ring-1 focus:ring-primary/20"
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
															className="rounded-xl p-2 text-destructive transition-colors hover:bg-destructive/10"
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
											className="w-full rounded-2xl border border-border border-dashed py-3 font-bold text-muted-foreground/60 text-[10px] uppercase tracking-widest transition-all hover:bg-muted/30"
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

								<div className="flex gap-4 border-border/50 border-t p-8">
									<button
										className="flex-1 rounded-[20px] bg-muted py-4 font-bold text-foreground text-[10px] uppercase tracking-widest transition-all hover:bg-muted/80 active:scale-95"
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
										className="flex-1 rounded-[20px] bg-primary py-4 font-bold text-primary-foreground text-[10px] uppercase tracking-[0.2em] shadow-lg transition-all hover:brightness-110 active:scale-95"
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
		</div>
	);
}

function BaseRecipesTab() {
	const baseRecipes = useQuery(api.inventory.getBaseRecipes);
	const inventory = useQuery(api.inventory.getInventory);
	const products = useQuery(api.products.getAllProductsAdmin);
	const recipes = useQuery(api.inventory.getRecipes);
	const createBaseRecipe = useMutation(api.inventory.createBaseRecipe);
	const updateBaseRecipe = useMutation(api.inventory.updateBaseRecipe);
	const deleteBaseRecipe = useMutation(api.inventory.deleteBaseRecipe);
	const [searchRecipe, setSearchRecipe] = useState("");

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

	const filteredBaseRecipes = useMemo(() => {
		if (!baseRecipes) {
			return [];
		}
		const keyword = searchRecipe.trim().toLowerCase();
		if (!keyword) {
			return baseRecipes;
		}
		return baseRecipes.filter((recipe) =>
			recipe.name.toLowerCase().includes(keyword)
		);
	}, [baseRecipes, searchRecipe]);

	return (
		<>
			<div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<h2 className="font-bold text-xl">Daftar Resep Base (Pre-mix)</h2>
				<div className="flex items-center gap-2">
					<input
						className="h-9 w-56 rounded-md border border-border bg-background px-3 text-sm"
						onChange={(event) => setSearchRecipe(event.target.value)}
						placeholder="Cari resep base..."
						value={searchRecipe}
					/>
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
			</div>

			<div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Total Base</p>
					<p className="font-bold text-lg">{baseRecipes?.length ?? 0}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Tampil</p>
					<p className="font-bold text-lg">{filteredBaseRecipes.length}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Dipakai Produk</p>
					<p className="font-bold text-lg">{new Set((recipes ?? []).map((r) => r.productId)).size}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Menu Aktif</p>
					<p className="font-bold text-lg">{products?.filter((p) => p.isAvailable).length ?? 0}</p>
				</div>
			</div>

			<div className="overflow-x-auto rounded-xl border border-border bg-card">
				<table className="w-full min-w-[900px] text-left text-xs">
					<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase">
						<tr>
							<th className="px-3 py-2">Nama</th>
							<th className="px-3 py-2">Deskripsi</th>
							<th className="px-3 py-2">Target</th>
							<th className="px-3 py-2">Bahan</th>
							<th className="px-3 py-2 text-right">Aksi</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{filteredBaseRecipes.map((recipe: any) => (
							<tr key={recipe._id}>
								<td className="px-3 py-2 font-semibold">{recipe.name}</td>
								<td className="px-3 py-2 text-muted-foreground">{recipe.description || "-"}</td>
								<td className="px-3 py-2">{recipe.targetQuantity} {recipe.targetUnit}</td>
								<td className="px-3 py-2">{recipe.ingredients.length} item</td>
								<td className="px-3 py-2">
									<div className="flex justify-end gap-1">
										<button
											className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
											onClick={() => handleEdit(recipe)}
											type="button"
										>
											<Edit className="h-4 w-4" />
										</button>
										<button
											className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
											onClick={() => setConfirmDeleteId(recipe._id)}
											type="button"
										>
											<Trash2 className="h-4 w-4" />
										</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<AnimatePresence>
				{isModalOpen && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-md">
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[40px] border border-border bg-card"
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<div className="border-border/50 border-b p-8 pb-3">
								<h3 className="font-bold text-2xl text-foreground tracking-tight">
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
											className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
											htmlFor="base-recipe-name"
										>
											Nama Resep (e.g., Based Susu)
										</label>
										<input
											autoFocus
											className="w-full rounded-2xl bg-muted p-4 font-bold text-foreground text-sm outline-none transition-all placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20"
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
											className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
											htmlFor="base-recipe-desc"
										>
											Deskripsi
										</label>
										<input
											className="w-full rounded-2xl bg-muted p-4 font-medium text-foreground text-sm outline-none transition-all placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20"
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
												className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
												htmlFor="base-recipe-unit"
											>
												Batch Unit
											</label>
											<input
												className="w-full rounded-2xl bg-muted p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
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
												className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
												htmlFor="base-recipe-qty"
											>
												Batch Quantity
											</label>
											<input
												className="w-full rounded-2xl bg-muted p-4 font-bold text-foreground text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20"
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

									<div className="space-y-4 rounded-[32px] border border-border bg-muted/50 p-6">
										<div className="flex items-center justify-between">
											<h4 className="font-bold text-foreground text-xs uppercase tracking-widest">
												Komposisi Bahan
											</h4>
											<select
												className="rounded-xl bg-muted px-3 py-1.5 font-bold text-foreground text-[10px] outline-none"
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
														className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3"
														key={ing.inventoryId || `new-${idx}`}
													>
														<span className="flex-1 truncate font-bold text-foreground text-[11px] uppercase tracking-tight">
															{inv?.ingredientName}
														</span>
														<div className="flex items-center gap-2">
															<input
																className="w-20 rounded-xl bg-muted px-3 py-1.5 font-bold text-foreground text-xs outline-none focus:ring-1 focus:ring-primary/20"
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
															<span className="min-w-[40px] font-bold text-muted-foreground/60 text-[10px] uppercase">
																{inv?.unit}
															</span>
														</div>
														<button
															className="rounded-xl p-2 text-destructive transition-colors hover:bg-destructive/10"
															onClick={() => removeIngredient(idx)}
															type="button"
														>
															<Trash2 className="h-4 w-4" />
														</button>
													</div>
												);
											})}
											{formData.ingredients.length === 0 && (
												<p className="py-2 text-center font-medium text-muted-foreground/60 text-[10px] italic">
													Belum ada bahan ditambahkan
												</p>
											)}
										</div>
									</div>
								</div>

								<div className="flex gap-6 border-border/50 border-t p-8">
									<button
										className="flex-1 rounded-[24px] bg-muted py-5 font-bold text-foreground text-[10px] uppercase tracking-widest transition-all hover:bg-muted/80 active:scale-95"
										onClick={resetForm}
										type="button"
									>
										Batal
									</button>
									<button
										className="flex-1 rounded-[24px] bg-primary py-5 font-bold text-primary-foreground text-xs uppercase tracking-[0.2em] shadow-xl transition-all hover:brightness-110 active:scale-[0.98]"
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
	const hppProductMap = useQuery(api.hpp.getHppProductMap);
	const [searchMixed, setSearchMixed] = useState("");

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

	const filteredProducts = useMemo(() => {
		if (!products) {
			return [];
		}
		const keyword = searchMixed.trim().toLowerCase();
		if (!keyword) {
			return products;
		}
		return products.filter((product) => product.name.toLowerCase().includes(keyword));
	}, [products, searchMixed]);

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
				<h2 className="font-bold text-xl">Resep Gabungan</h2>
				<p className="text-muted-foreground text-sm">
					Daftar lengkap semua resep produk dan resep base.
				</p>
				</div>
				<input
					className="h-9 w-64 rounded-md border border-border bg-background px-3 text-sm"
					onChange={(event) => setSearchMixed(event.target.value)}
					placeholder="Cari produk..."
					value={searchMixed}
				/>
			</div>

			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Base Recipes</p>
					<p className="font-bold text-lg">{baseRecipes?.length ?? 0}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Produk Dengan Resep</p>
					<p className="font-bold text-lg">{Object.keys(recipesByProduct ?? {}).length}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Produk Ditampilkan</p>
					<p className="font-bold text-lg">{filteredProducts.length}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Bahan Inventory</p>
					<p className="font-bold text-lg">{inventory?.length ?? 0}</p>
				</div>
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
					<div className="overflow-x-auto rounded-xl border border-border bg-card">
						<table className="w-full min-w-[960px] text-left text-xs">
							<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase">
								<tr>
									<th className="px-3 py-2">Produk</th>
									<th className="px-3 py-2">Resep</th>
									<th className="px-3 py-2">Komponen</th>
									<th className="px-3 py-2">Status</th>
									<th className="px-3 py-2">HPP/Margin</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
						{filteredProducts?.map((product: any) => {
							// Get recipes for this product from the recipes table
							const productRecipes = recipesByProduct?.[product._id];
							if (!productRecipes || productRecipes.length === 0) {
								return null;
							}

							const ingredientCount = productRecipes.reduce(
								(total: number, recipe: any) => total + recipe.ingredients.length,
								0
							);
							const hpp = hppProductMap?.[product._id];

							return (
								<tr key={product._id}>
									<td className="px-3 py-2 font-semibold">{product.name}</td>
									<td className="px-3 py-2">{productRecipes.length} resep</td>
									<td className="px-3 py-2">{ingredientCount} komponen</td>
									<td className="px-3 py-2">
										<span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${product.isAvailable ? "bg-green-600" : "bg-red-500"}`}>
											{product.isAvailable ? "Aktif" : "Nonaktif"}
										</span>
									</td>
									<td className="px-3 py-2">
										{hpp ? `HPP ${Math.round(hpp.hppPerServing).toLocaleString("id-ID")} | Margin ${hpp.marginPercent.toFixed(0)}%` : "-"}
									</td>
								</tr>
							);
						})}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	);
}
