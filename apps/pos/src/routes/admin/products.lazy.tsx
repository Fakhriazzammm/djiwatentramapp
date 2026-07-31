import { createLazyFileRoute, Link } from "@tanstack/react-router";
import type { Doc, Id } from "@/types/backend-compat";
import {
	useHybridAddProduct,
	useHybridAddVariationPreset,
	useHybridBulkUpdateProducts,
	useHybridCreateBaseRecipe,
	useHybridCreateCategory,
	useHybridDeleteBaseRecipe,
	useHybridDeleteCategory,
	useHybridDeleteProduct,
	useHybridDeleteVariationPreset,
	useHybridGenerateProductDescription,
	useHybridGenerateProductUploadUrl,
	useHybridUpdateBaseRecipe,
	useHybridUpdateCategory,
	useHybridUpdateProduct,
	useHybridUpdateVariationPreset,
} from "@/hooks/use-hybrid-write-actions";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	BarChart3,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Edit,
	Eye,
	EyeOff,
	LayoutGrid,
	List,
	Plus,
	Search,
	Sparkles,
	Trash2,
	Upload,
	X,
	XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	useHybridAllProducts,
	useHybridCategories,
	useHybridHppProductMap,
	useHybridInventory,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridVariationPresets } from "@/hooks/use-hybrid-ops-data";
import {
	useHybridBaseRecipes,
	useHybridRecipes,
} from "@/hooks/use-hybrid-inventory-admin-data";
import { compressFileToLimit, isOversized } from "@/lib/image-compress";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkOperations } from "../../components/admin/bulk-operations";
import { withSaveToast } from "@/lib/with-save-toast";

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
	const products = useHybridAllProducts();
	const recipes = useHybridRecipes();
	const categories = useHybridCategories();
	const variationPresets = useHybridVariationPresets();

	const [activeTab, setActiveTab] = useState<"products" | "settings">("products");

	return (
		<div className="fade-in slide-in-from-bottom-4 flex animate-in flex-col gap-3 duration-500 md:gap-6">
			<div className="no-scrollbar flex items-center justify-between overflow-x-auto border-border border-b pb-1">
				<Tabs onValueChange={(value) => setActiveTab(value as typeof activeTab)} value={activeTab}>
					<TabsList variant="line">
						<TabsTrigger value="products">Produk</TabsTrigger>
						<TabsTrigger value="settings">Pengaturan</TabsTrigger>
					</TabsList>
				</Tabs>
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
								recipes={recipes}
								/>
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
	recipes,
}: {
	products: (Doc<"products"> & { storageId?: string })[] | undefined;
	categories: Doc<"categories">[] | undefined;
	variationPresets: Doc<"variationPresets">[] | undefined;
	recipes?: { productId?: string; variantName?: string | null }[] | null;
}) {
	const hppProductMap = useHybridHppProductMap();

	const addProduct = useHybridAddProduct();
	const updateProduct = useHybridUpdateProduct();
	const deleteProduct = useHybridDeleteProduct();
	const bulkUpdateProducts = useHybridBulkUpdateProducts();
	const generateUploadUrl = useHybridGenerateProductUploadUrl();

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
	const [isSavingInlineAdd, setIsSavingInlineAdd] = useState(false);
	const [isGeneratingInlineDesc, setIsGeneratingInlineDesc] = useState(false);
	const [generatingProductDescId, setGeneratingProductDescId] =
		useState<Id<"products"> | null>(null);
	const [inlineImageFile, setInlineImageFile] = useState<File | null>(null);
	const [inlineFormData, setInlineFormData] = useState({
		name: "",
		description: "",
		categoryId: "",
		price: "",
		promoPrice: "",
		quantity: "0",
		menuNumber: "",
		isAvailable: true,
	});
	const [isDragOver, setIsDragOver] = useState(false);
const [showVariations, setShowVariations] = useState(true);
const [showAdvanced, setShowAdvanced] = useState(false);
const searchInputRef = useRef<HTMLInputElement | null>(null);

	const generateDescription = useHybridGenerateProductDescription();

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

	const uploadImageFile = async (file: File) => {
		let uploadBlob: Blob = file;
		let contentType = file.type || "image/jpeg";
		if (isOversized(file)) {
				toast.loading("Mengompresi gambar...", { id: "compress-product" });
			const compressed = await compressFileToLimit(file);
			toast.dismiss("compress-product");
			uploadBlob = await fetch(compressed).then((r) => r.blob());
			contentType = "image/jpeg";
		}

		return await generateUploadUrl({
			file: uploadBlob,
			contentType,
			fileName: file.name,
			folder: "products",
		});
	};

	const handleImageUpload = async () => {
		if (imageFile) {
			return await uploadImageFile(imageFile);
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

			const result = await withSaveToast(
				() =>
					editingId
						? updateProduct({
								id: editingId,
								...productData,
								isAvailable: true,
							})
						: addProduct({ ...productData, isAvailable: true }),
				{ success: editingId ? "Produk diperbarui" : "Produk berhasil ditambahkan" }
			);
			if (result.success) {
				resetForm();
				triggerHybridRefresh();
			}
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
		const result = await withSaveToast(
			() => deleteProduct({ id: deleteId }),
			{ success: "Produk dihapus" }
		);
		if (result.success) {
			setDeleteId(null);
			triggerHybridRefresh();
		}
	};

	const toggleAvailability = async (id: Id<"products">, current: boolean) => {
		const result = await withSaveToast(
			() => updateProduct({ id, isAvailable: !current }),
			{ success: "Status produk diperbarui" }
		);
		if (result.success) triggerHybridRefresh();
	};

	const runBulkAvailability = async (isAvailable: boolean) => {
		if (selectedIds.length === 0) {
			return;
		}
		const result = await withSaveToast(
			() =>
				bulkUpdateProducts({
					ids: selectedIds,
					updates: { isAvailable },
				}),
			{
				success: `${selectedIds.length} produk ${
					isAvailable ? "diaktifkan" : "dinonaktifkan"
				}`,
			}
		);
		if (result.success) triggerHybridRefresh();
	};

	const runBulkCategory = async () => {
		if (!bulkCategoryId || selectedIds.length === 0) {
			toast.error("Pilih kategori dan produk terlebih dahulu");
			return;
		}
		const result = await withSaveToast(
			() =>
				Promise.all(
					selectedIds.map((id) =>
						updateProduct({
							id,
							categoryId: bulkCategoryId as Id<"categories">,
						})
					)
				),
			{ success: `${selectedIds.length} produk dipindahkan kategori` }
		);
		if (result.success) triggerHybridRefresh();
	};

	const runBulkDiscount = async () => {
		const discountPercent = Number(bulkDiscount);
		if (selectedIds.length === 0 || Number.isNaN(discountPercent)) {
			toast.error("Diskon tidak valid");
			return;
		}
		const result = await withSaveToast(
			() =>
				Promise.all(
					selectedProducts.map((product) =>
						updateProduct({
							id: product._id,
							promoPrice: Math.max(
								Math.round(product.price * (1 - discountPercent / 100)),
								0
							),
						})
					)
				),
			{ success: `Diskon ${discountPercent}% diterapkan ke ${selectedIds.length} produk` }
		);
		if (result.success) triggerHybridRefresh();
	};

	const runBulkDelete = async () => {
		if (selectedIds.length === 0) {
			return;
		}
		const result = await withSaveToast(
			() => Promise.all(selectedIds.map((id) => deleteProduct({ id }))),
			{ success: "Produk terpilih berhasil dihapus" }
		);
		if (result.success) {
			setSelectedIds([]);
			triggerHybridRefresh();
		}
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
		const label =
			field === "price"
				? "Harga"
				: field === "quantity"
					? "Stok"
					: field === "promoPrice"
						? "Harga promo"
						: "Nomor menu";
		setIsSavingInline((prev) => ({
			...prev,
			[id]: { ...(prev[id] ?? {}), [field]: true },
		}));
		try {
			const result = await withSaveToast(
				() => updateProduct({ id, [field]: parsed }),
				{ success: `${label} diperbarui` }
			);
			if (result.success) triggerHybridRefresh();
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
		toast.success(`${field === "name" ? "Nama" : "Deskripsi"} diperbarui`); triggerHybridRefresh();
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
		toast.success("Kategori diperbarui"); triggerHybridRefresh();
	};

	const resetInlineCreateRow = () => {
		setInlineFormData({
			name: "",
			description: "",
			categoryId: "",
			price: "",
			promoPrice: "",
			quantity: "0",
			menuNumber: "",
			isAvailable: true,
		});
		setInlineImageFile(null);
	};

	const saveInlineCreatedProduct = async () => {
		const name = inlineFormData.name.trim();
		if (name.length < 2) {
			toast.error("Nama produk minimal 2 karakter");
			return;
		}
		if (!inlineFormData.categoryId) {
			toast.error("Pilih kategori");
			return;
		}
		const price = Number(inlineFormData.price);
		if (Number.isNaN(price) || price < 0) {
			toast.error("Harga tidak valid");
			return;
		}
		const promoPrice =
			inlineFormData.promoPrice.trim() === ""
				? undefined
				: Number(inlineFormData.promoPrice);
		if (promoPrice !== undefined && (Number.isNaN(promoPrice) || promoPrice < 0)) {
			toast.error("Harga promo tidak valid");
			return;
		}
		const quantity =
			inlineFormData.quantity.trim() === ""
				? undefined
				: Number(inlineFormData.quantity);
		if (quantity !== undefined && (Number.isNaN(quantity) || quantity < 0)) {
			toast.error("Stok tidak valid");
			return;
		}
		const menuNumber =
			inlineFormData.menuNumber.trim() === ""
				? undefined
				: Number(inlineFormData.menuNumber);
		if (menuNumber !== undefined && (Number.isNaN(menuNumber) || menuNumber < 0)) {
			toast.error("Nomor menu tidak valid");
			return;
		}

		setIsSavingInlineAdd(true);
		try {
			const imageId = inlineImageFile
				? await uploadImageFile(inlineImageFile)
				: undefined;
			await addProduct({
				name,
				description: inlineFormData.description.trim() || undefined,
				categoryId: inlineFormData.categoryId as Id<"categories">,
				price,
				promoPrice,
				image: imageId,
				isAvailable: inlineFormData.isAvailable,
				quantity,
				menuNumber,
				variations: [],
			});
			toast.success("Produk berhasil ditambahkan. Kelola recipe dari halaman /admin/recipe bila diperlukan.", { duration: 4000 }); triggerHybridRefresh();
			resetInlineCreateRow();
		} catch (error) {
			console.error(error);
			toast.error("Gagal menambahkan produk");
		} finally {
			setIsSavingInlineAdd(false);
		}
	};

	const handleGenerateInlineDescription = async () => {
		if (!inlineFormData.name.trim() || !inlineFormData.categoryId) {
			toast.error("Isi nama dan kategori terlebih dahulu");
			return;
		}
		setIsGeneratingInlineDesc(true);
		try {
			const category = categories?.find(
				(c: any) => c._id === inlineFormData.categoryId
			);
			const desc = await generateDescription({
				productName: inlineFormData.name.trim(),
				category: category?.name || "Produk",
				price: Number(inlineFormData.price) || 0,
			});
			if (desc) {
				setInlineFormData((prev) => ({ ...prev, description: desc }));
				toast.success("Deskripsi berhasil di-generate"); triggerHybridRefresh();
			}
		} catch {
			toast.error("Gagal generate deskripsi");
		} finally {
			setIsGeneratingInlineDesc(false);
		}
	};

	const handleGenerateDescriptionForRow = async (
		product: Doc<"products"> & { storageId?: string }
	) => {
		setGeneratingProductDescId(product._id);
		try {
			const category = categories?.find((c: any) => c._id === product.categoryId);
			const desc = await generateDescription({
				productName: product.name,
				category: category?.name || "Produk",
				price: Number(product.price) || 0,
			});
			if (desc) {
				await updateProduct({ id: product._id, description: desc });
				toast.success("Deskripsi produk diperbarui"); triggerHybridRefresh();
			}
		} catch {
			toast.error("Gagal generate deskripsi");
		} finally {
			setGeneratingProductDescId(null);
		}
	};

	return (
		<>
			<div className="space-y-4">
				<div className="space-y-4">
					<div className="rounded-xl border border-border bg-card p-3 md:p-3.5">
						<div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
							<div>
								<h2 className="font-bold text-lg md:text-xl">Product Workspace</h2>
								<p className="text-[11px] text-muted-foreground md:text-xs">
									Kelola produk lebih cepat dengan filter, bulk action, dan quick edit.
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-1.5 md:gap-2">
								<div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
									<button
										className={`rounded px-1.5 py-1 transition-all ${viewMode === "grid" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
										onClick={() => setViewMode("grid")}
										type="button"
									>
										<LayoutGrid className="h-4 w-4" />
									</button>
									<button
										className={`rounded px-1.5 py-1 transition-all ${viewMode === "table" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
										onClick={() => setViewMode("table")}
										type="button"
									>
										<List className="h-4 w-4" />
									</button>
								</div>
								<BulkOperations />
							</div>
						</div>

						<div className="mb-3 grid gap-1.5 md:grid-cols-2 xl:grid-cols-5">
							<div className="relative md:col-span-2">
								<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
								<input
									className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
									onChange={(event) => setSearchKeyword(event.target.value)}
									placeholder="Cari produk, deskripsi, kategori... (/)"
									ref={searchInputRef}
									value={searchKeyword}
								/>
							</div>
							<select
								className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
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
								className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
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
								className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
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

						<div className="mb-3 flex flex-wrap items-center gap-1.5">
							{[
								{ key: "all", label: "Semua" },
								{ key: "draft", label: "Draft" },
								{ key: "out-of-stock", label: "Out of stock" },
								{ key: "promo", label: "Promo" },
								{ key: "inactive", label: "Inactive" },
							].map((view) => (
								<button
									className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
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
														<div className="flex gap-0.5">
															<button
																className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
																onClick={() => handleEdit(product)}
																type="button"
																title="Edit produk"
															>
																<Edit className="h-3.5 w-3.5" />
															</button>
															<button
																className="rounded p-1 text-destructive hover:bg-destructive/10"
																onClick={() => setDeleteId(product._id)}
																type="button"
															>
																<Trash2 className="h-3.5 w-3.5" />
															</button>
														</div>
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
											{(() => {
												const hasRecipe = recipes?.some(r => String(r.productId ?? "") === String(product._id) && !r.variantName);
												return (
													<div className="flex items-center gap-1.5 mt-1 flex-wrap">
														{hasRecipe
															? <span className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Ada Resep</span>
															: <span className="rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> Perlu Resep</span>
														}
														<Link
															to="/admin/recipe"
															search={{ productId: String(product._id) }}
															className="text-[11px] text-primary hover:underline"
														>
															Atur Resep
														</Link>
														<Link
															to="/admin/recipe/hpp"
															search={{ productId: String(product._id) }}
															className="text-[11px] text-muted-foreground hover:text-primary hover:underline"
														>
															HPP
														</Link>
													</div>
												);
											})()}
											<p className="text-primary text-xs">{formatRupiah(product.price)}</p>
										</div>
									))}
							</div>
						) : (
							<div className="rounded-xl border border-border bg-card shadow-sm">
								<div className="overflow-x-auto">
									<table className="w-full min-w-[1180px] text-left text-xs">
										<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider">
											<tr>
												<th className="px-3 py-3 text-center">
													<input checked={allVisibleSelected} onChange={toggleAllVisible} type="checkbox" />
												</th>
												<th className="min-w-[96px] px-3 py-3 text-center">No. Menu</th>
												<th className="px-3 py-3">Nama</th>
												<th className="px-3 py-3">Deskripsi</th>
												<th className="px-3 py-3">Kategori</th>
												<th className="px-3 py-3">Harga</th>
												<th className="px-3 py-3">Promo</th>
												<th className="px-3 py-3">Stok</th>
												<th className="px-3 py-3">Status</th>
												<th className="px-3 py-3">Resep</th>
												<th className="px-3 py-3">HPP</th>
												<th className="px-3 py-3 text-right">Aksi</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-border">
											<tr className="bg-primary/5">
													<td className="px-3 py-3 text-center text-muted-foreground">-</td>
													<td className="px-3 py-3 text-center text-xs">
														<input
															className="h-8 w-20 rounded-md border border-border bg-background px-2 text-center text-xs"
															onChange={(event) =>
																setInlineFormData((prev) => ({
																	...prev,
																	menuNumber: event.target.value,
																}))
															}
															placeholder="No"
															type="number"
															value={inlineFormData.menuNumber}
														/>
													</td>
													<td className="px-3 py-3">
														<div className="flex items-center gap-2">
															<div className="h-8 w-8 overflow-hidden rounded-md bg-muted">
																{inlineImageFile ? (
																	<div className="flex h-full w-full items-center justify-center font-semibold text-[10px] text-foreground">
																		IMG
																	</div>
																) : (
																	<div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
																		NA
																	</div>
																)}
															</div>
															<div className="flex flex-col gap-1">
																<input
																	className="h-7 w-48 rounded-md border border-border bg-background px-2"
																	onChange={(event) =>
																		setInlineFormData((prev) => ({
																			...prev,
																			name: event.target.value,
																		}))
																	}
																	placeholder="Nama produk"
																	type="text"
																	value={inlineFormData.name}
																/>
																<div className="flex items-center gap-2">
																	<input
																		accept="image/*"
																		className="hidden"
																		id="inline-create-image-upload"
																		onChange={(event) => {
																			const file = event.target.files?.[0];
																			if (file) {
																				setInlineImageFile(file);
																			}
																		}}
																		type="file"
																	/>
																	<label
																		className="cursor-pointer rounded-md border border-border bg-background px-2 py-1 font-semibold text-[10px] hover:bg-muted"
																		htmlFor="inline-create-image-upload"
																	>
																		Upload Gambar
																	</label>
																	<span className="max-w-[120px] truncate text-[10px] text-muted-foreground">
																		{inlineImageFile ? inlineImageFile.name : "Belum ada file"}
																	</span>
																</div>
															</div>
														</div>
													</td>
													<td className="px-3 py-3">
														<div className="flex items-center gap-2">
															<input
																className="h-7 w-52 rounded-md border border-border bg-background px-2"
																onChange={(event) =>
																	setInlineFormData((prev) => ({
																		...prev,
																		description: event.target.value,
																	}))
																}
																placeholder="Deskripsi"
																type="text"
																value={inlineFormData.description}
															/>
															<button
																className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 font-semibold text-[10px] hover:bg-muted disabled:opacity-60"
																disabled={isGeneratingInlineDesc}
																onClick={handleGenerateInlineDescription}
																type="button"
															>
																<Sparkles className="h-3 w-3" />
																{isGeneratingInlineDesc ? "Generate..." : "AI"}
															</button>
														</div>
													</td>
													<td className="px-3 py-3">
														<select
															className="h-7 w-36 rounded-md border border-border bg-background px-2"
															onChange={(event) =>
																setInlineFormData((prev) => ({
																	...prev,
																	categoryId: event.target.value,
																}))
															}
															value={inlineFormData.categoryId}
														>
															<option value="">Pilih kategori</option>
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
															onChange={(event) =>
																setInlineFormData((prev) => ({
																	...prev,
																	price: event.target.value,
																}))
															}
															placeholder="0"
															type="number"
															value={inlineFormData.price}
														/>
													</td>
													<td className="px-3 py-3">
														<input
															className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs"
															onChange={(event) =>
																setInlineFormData((prev) => ({
																	...prev,
																	promoPrice: event.target.value,
																}))
															}
															placeholder="0"
															type="number"
															value={inlineFormData.promoPrice}
														/>
													</td>
													<td className="px-3 py-3">
														<input
															className="h-8 w-20 rounded-md border border-border bg-background px-2 text-xs"
															onChange={(event) =>
																setInlineFormData((prev) => ({
																	...prev,
																	quantity: event.target.value,
																}))
															}
															type="number"
															value={inlineFormData.quantity}
														/>
													</td>
													<td className="px-3 py-3">
														<select
															className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs"
															onChange={(event) =>
																setInlineFormData((prev) => ({
																	...prev,
																	isAvailable: event.target.value === "true",
																}))
															}
															value={String(inlineFormData.isAvailable)}
														>
															<option value="true">Active</option>
															<option value="false">Inactive</option>
														</select>
													</td>
													<td className="px-3 py-3 text-[10px] text-muted-foreground">Baru</td>
													<td className="px-3 py-3">
														<div className="flex justify-end gap-2">
															<button
																className="rounded-md bg-green-600 px-3 py-1.5 font-semibold text-white text-xs hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
																disabled={isSavingInlineAdd}
																onClick={saveInlineCreatedProduct}
																type="button"
															>
																{isSavingInlineAdd ? "Menyimpan..." : "Simpan"}
															</button>
															<button
																className="rounded-md border border-border bg-background px-3 py-1.5 font-semibold text-foreground text-xs hover:bg-muted"
																disabled={isSavingInlineAdd}
																onClick={resetInlineCreateRow}
																type="button"
															>
																Reset
															</button>
														</div>
													</td>
												</tr>
											{products &&
												filteredProducts.map((product) => {
													const health = getHealthScore(product);
													const hpp = hppProductMap?.[product._id];
													const hasRecipe = recipes?.some(r => String(r.productId ?? "") === String(product._id) && !r.variantName);

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
																	className="h-8 w-20 rounded-md border border-border bg-background px-2 text-center text-xs"
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
																			<div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">NA</div>
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
																<div className="flex items-center gap-2">
																	<input
																		className="h-7 w-52 rounded-md border border-border bg-background px-2"
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
																	<button
																		className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 font-semibold text-[10px] hover:bg-muted disabled:opacity-60"
																		disabled={generatingProductDescId === product._id}
																		onClick={() =>
																			handleGenerateDescriptionForRow(product)
																		}
																		type="button"
																	>
																		<Sparkles className="h-3 w-3" />
																		{generatingProductDescId === product._id
																			? "Generate..."
																			: "AI"}
																	</button>
																</div>
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
														<Link to="/admin/recipe" search={{ productId: String(product._id) }}
															className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
																hasRecipe
																	? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
																	: "bg-amber-50 text-amber-700 hover:bg-amber-100"
																}`}
														>
															{hasRecipe ? <><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Resep</> : <><AlertTriangle className="h-3 w-3" aria-hidden="true" /> Atur</>}
														</Link>
													</td>

													<td className="px-3 py-3">
														<Link to="/admin/recipe/hpp" search={{ productId: String(product._id) }}
															className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
																hpp
																	? "bg-blue-50 text-blue-700 hover:bg-blue-100"
																	: "bg-muted text-muted-foreground"
																}`}
														>
															{hpp ? <><BarChart3 className="h-3 w-3" aria-hidden="true" /> HPP</> : "—"}
														</Link>
													</td>
															<td className="px-3 py-3">
								<div className="flex justify-end gap-1">
													<button className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={() => handleEdit(product)} type="button" title="Edit produk">
														<Edit className="h-3.5 w-3.5" />
													</button>
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

			{/* Product Add/Edit Modal — Redesigned */}
			<AnimatePresence>
				{isModalOpen && (
					<div
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
						data-admin-modal-backdrop
					>
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
							data-admin-modal-card
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							{/* Header */}
							<div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
								<div>
									<h3 className="font-bold text-lg text-foreground">
										{editingId ? "Edit Produk" : "Produk Baru"}
									</h3>
									{editingId && (
										<p className="mt-0.5 text-[11px] text-muted-foreground">
											Perbarui detail, gambar, dan variasi
										</p>
									)}
								</div>
								<button
									className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
									onClick={resetForm}
									type="button"
								>
									<X className="h-4 w-4" />
								</button>
							</div>

							<form
								className="flex flex-1 flex-col overflow-hidden"
								onSubmit={handleCreateOrUpdate}
							>
								<div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
									{/* Top Section: Image + Core Info */}
									<div className="flex flex-col gap-4 sm:flex-row">
										{/* Image Drop Zone */}
										<div className="shrink-0 sm:w-36">
											<label
												className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border-2 border-dashed transition-all ${
													isDragOver
														? "border-primary bg-primary/5"
														: formData.image || imageFile
															? "border-transparent"
															: "border-muted-foreground/25 bg-muted/50 hover:border-primary/40 hover:bg-muted"
												}`}
												htmlFor="product-image-upload"
												onDragLeave={(e) => {
													e.preventDefault();
													setIsDragOver(false);
												}}
												onDragOver={(e) => {
													e.preventDefault();
													setIsDragOver(true);
												}}
												onDrop={(e) => {
													e.preventDefault();
													setIsDragOver(false);
													const file = e.dataTransfer.files?.[0];
													if (file) setImageFile(file);
												}}
											>
												{imageFile ? (
													<img
														alt="Preview"
														className="absolute inset-0 h-full w-full object-cover"
														src={URL.createObjectURL(imageFile)}
													/>
												) : formData.image ? (
													<img
														alt={formData.name}
														className="absolute inset-0 h-full w-full object-cover"
														src={formData.image}
													/>
												) : (
													<>
														<Upload className="h-5 w-5 text-muted-foreground/60" />
														<span className="text-center text-[11px] font-medium text-muted-foreground/60 leading-tight">
															Tambah
															<br />
															Gambar
														</span>
													</>
												)}
												{(imageFile || formData.image) && (
													<div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
														<span className="rounded-md bg-white/90 px-2 py-1 text-[10px] font-semibold text-black">
															Ganti
														</span>
													</div>
												)}
											</label>
											<input
												accept="image/*"
												className="hidden"
												id="product-image-upload"
												onChange={(e) => {
													const file = e.target.files?.[0];
													if (file) setImageFile(file);
												}}
												type="file"
											/>
											{imageFile && (
												<p className="mt-1 truncate text-center text-[11px] text-muted-foreground">
													{imageFile.name}
												</p>
											)}
											{(imageFile || formData.image) && (
												<button
													className="mt-1 w-full rounded-md py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/5 transition-colors"
													onClick={() => {
														setImageFile(null);
														if (!imageFile) setFormData({ ...formData, image: "" });
													}}
													type="button"
												>
													Hapus Gambar
												</button>
											)}
										</div>

										{/* Core Form Fields */}
										<div className="min-w-0 flex-1 space-y-3">
											<div className="space-y-1.5">
												<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="product-name">
													Nama Produk
												</label>
												<input
													className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/10"
													id="product-name"
													onChange={(e) => setFormData({ ...formData, name: e.target.value })}
													placeholder="Nama menu..."
													required
													value={formData.name}
												/>
											</div>

											<div className="grid grid-cols-2 gap-3">
												<div className="space-y-1.5">
													<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="product-category">
														Kategori
													</label>
													<select
														className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm font-medium text-foreground outline-none transition-all focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/10"
														id="product-category"
														onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
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
												<div className="space-y-1.5">
													<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="product-price">
														Harga
													</label>
													<div className="relative">
														<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">Rp</span>
														<input
															className="w-full rounded-lg border border-border bg-muted/50 py-2.5 pl-9 pr-3 text-sm font-medium text-foreground outline-none transition-all focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/10"
															id="product-price"
															onChange={(e) => setFormData({ ...formData, price: e.target.value })}
															placeholder="0"
															required
															type="number"
															value={formData.price}
														/>
													</div>
												</div>
											</div>
										</div>
									</div>

									{/* Description */}
									<div className="space-y-1.5">
										<div className="flex items-center justify-between">
											<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="product-desc">
												Deskripsi
											</label>
											<button
												className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 px-2.5 py-1 text-[10px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
												disabled={isGeneratingDesc || !formData.name || !formData.categoryId}
												onClick={async () => {
													if (!(formData.name && formData.categoryId)) {
														toast.error("Isi nama dan kategori terlebih dahulu");
														return;
													}
													setIsGeneratingDesc(true);
													try {
														const category = categories?.find((c: any) => c._id === formData.categoryId);
														const desc = await generateDescription({
															productName: formData.name,
															category: category?.name || "Produk",
															price: Number(formData.price) || 0,
														});
														if (desc) {
															setFormData({ ...formData, description: desc });
															toast.success("Deskripsi berhasil di-generate!"); triggerHybridRefresh();
														}
													} catch {
														toast.error("Gagal generate deskripsi");
													} finally {
														setIsGeneratingDesc(false);
													}
												}}
												type="button"
											>
												<Sparkles className={`h-3 w-3 ${isGeneratingDesc ? "animate-pulse" : ""}`} />
												AI
											</button>
										</div>
										<textarea
											className="h-20 w-full resize-none rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/10"
											id="product-desc"
											onChange={(e) => setFormData({ ...formData, description: e.target.value })}
											placeholder="Deskripsi singkat produk..."
											value={formData.description}
										/>
									</div>

									{/* Variations — Collapsible */}
									<div className="rounded-xl border border-border/60 bg-muted/20">
										<button
											className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/30"
											onClick={() => setShowVariations(!showVariations)}
											type="button"
										>
											<div className="flex items-center gap-2">
												<List className="h-3.5 w-3.5 text-muted-foreground" />
												<span className="text-sm font-semibold text-foreground">Variasi</span>
												{formData.variations.length > 0 && (
													<span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
														{formData.variations.length}
													</span>
												)}
											</div>
											{showVariations ? (
												<ChevronUp className="h-4 w-4 text-muted-foreground" />
											) : (
												<ChevronDown className="h-4 w-4 text-muted-foreground" />
											)}
										</button>
										{showVariations && (
											<div className="border-t border-border/50 px-4 py-3 space-y-3">
												<select
													className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/10"
													onChange={(e) => addVariationFromPreset(e.target.value)}
													value=""
												>
													<option value="">+ Tambah dari preset</option>
													{variationPresets?.map((vp: any) => (
														<option key={vp._id} value={vp._id}>
															{vp.name}
														</option>
													))}
												</select>
												{formData.variations.length === 0 ? (
													<p className="text-center text-[10px] italic text-muted-foreground/60">
														Belum ada variasi
													</p>
												) : (
													<div className="space-y-2">
														{formData.variations.map((v: any, vIdx: number) => (
															<div className="rounded-lg border border-border/60 bg-background p-3" key={v.name}>
																<div className="mb-2 flex items-center justify-between">
																	<span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
																		{v.name}
																	</span>
																	<button
																		className="text-muted-foreground hover:text-destructive transition-colors"
																		onClick={() => removeVariation(formData.variations.findIndex((vari: any) => vari.name === v.name))}
																		type="button"
																	>
																		<XCircle className="h-3.5 w-3.5" />
																	</button>
																</div>
																<div className="space-y-1.5">
																	{v.options.map((opt: any, oIdx: number) => (
																		<div className="flex items-center gap-2" key={opt.name}>
																			<span className="flex-1 text-[11px] text-foreground/80">{opt.name}</span>
																			<div className="flex items-center gap-1">
																				<span className="text-[10px] text-muted-foreground">+Rp</span>
																				<input
																					className="w-20 rounded-md border border-border bg-muted/50 px-2 py-1 text-right text-[11px] font-bold outline-none focus:ring-1 focus:ring-primary/20"
																					min="0"
																					onChange={(e) => {
																						const newVariations = formData.variations.map((variation: any, vi: number) => {
																							if (vi !== vIdx) return variation;
																							return {
																								...variation,
																								options: variation.options.map((o: any, oi: number) =>
																									oi !== oIdx ? o : { ...o, price: Number(e.target.value) || 0 }
																								),
																							};
																						});
																						setFormData({ ...formData, variations: newVariations });
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
										)}
									</div>

									{/* Advanced — Collapsible */}
									<div className="rounded-xl border border-border/60 bg-muted/20">
										<button
											className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/30"
											onClick={() => setShowAdvanced(!showAdvanced)}
											type="button"
										>
											<div className="flex items-center gap-2">
												<Edit className="h-3.5 w-3.5 text-muted-foreground" />
												<span className="text-sm font-semibold text-foreground">Lanjutan</span>
											</div>
											{showAdvanced ? (
												<ChevronUp className="h-4 w-4 text-muted-foreground" />
											) : (
												<ChevronDown className="h-4 w-4 text-muted-foreground" />
											)}
										</button>
										{showAdvanced && (
											<div className="border-t border-border/50 px-4 py-3 space-y-3">
												<div className="space-y-1.5">
													<label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="product-menu-number">
														Nomor Menu
													</label>
													<input
														className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/10"
														id="product-menu-number"
														min="1"
														onChange={(e) => setFormData({ ...formData, menuNumber: e.target.value })}
														placeholder="Urutan di menu (opsional)"
														type="number"
														value={formData.menuNumber}
													/>
												</div>
												<div className="rounded-lg border border-border/40 bg-muted/20 p-3">
													<p className="text-[11px] leading-relaxed text-muted-foreground">
														Recipe dikelola terpisah di{" "}
														<a className="font-semibold text-primary underline" href="/admin/recipe">
															/admin/recipe
														</a>
														. Simpan produk dulu, lalu atur formula racik di sana.
													</p>
												</div>
											</div>
										)}
									</div>
								</div>

								{/* Footer */}
								<div className="flex gap-3 border-t border-border/60 bg-card/95 px-5 py-3 backdrop-blur">
									<button
										className="flex-1 rounded-lg border border-border bg-muted/50 py-2 text-sm font-semibold text-foreground transition-all hover:bg-muted"
										onClick={resetForm}
										type="button"
									>
										Batal
									</button>
									<button
										className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110"
										type="submit"
									>
										{editingId ? "Simpan Perubahan" : "Simpan Produk"}
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
	const createCategory = useHybridCreateCategory();
	const updateCategory = useHybridUpdateCategory();
	const deleteCategory = useHybridDeleteCategory();

	const createVariationPreset = useHybridAddVariationPreset();
	const updateVariationPreset = useHybridUpdateVariationPreset();
	const deleteVariationPreset = useHybridDeleteVariationPreset();
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
				toast.success("Kategori diperbarui"); triggerHybridRefresh();
			} else {
				await createCategory({ 
					name: categoryModal.name,
					parentId: categoryModal.parentId || undefined,
					track: categoryModal.track || undefined,
				});
				toast.success("Kategori ditambahkan"); triggerHybridRefresh();
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
				toast.success("Variasi diperbarui"); triggerHybridRefresh();
			} else {
				await createVariationPreset({
					name: variationModal.name,
					options: formattedOptions,
				});
				toast.success("Variasi ditambahkan"); triggerHybridRefresh();
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
															<div className="flex items-center gap-2 min-w-0">
																<button
																	className={"rounded-md p-1.5 shrink-0 " + (c.track === "hidden" ? "text-muted-foreground hover:text-foreground" : "text-green-600 hover:text-green-700")}
																	onClick={async () => {
																		const newTrack = c.track === "hidden" ? null : "hidden";
																		try {
																			await updateCategory({ id: c._id, track: newTrack });
																			toast.success(newTrack === "hidden" ? `Kategori "${c.name}" disembunyikan` : `Kategori "${c.name}" ditampilkan`);
																			triggerHybridRefresh();
																		} catch { toast.error("Gagal mengubah visibilitas"); }
																	}}
																	title={c.track === "hidden" ? "Tampilkan" : "Sembunyikan"}
																	type="button"
																>
																	{c.track === "hidden" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
																</button>
																<span className={"font-medium text-sm truncate " + (c.track === "hidden" ? "text-muted-foreground line-through" : "")}>{c.name}</span>
															</div>
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
					<div
						className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-md"
						data-admin-modal-backdrop
					>
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
							data-admin-modal-card
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<h3 className="mb-4 font-bold text-xl text-foreground">
								{categoryModal.editingId ? "Edit Kategori" : "Tambah Kategori"}
							</h3>
							<form className="space-y-4" onSubmit={handleCategorySubmit}>
								<div className="space-y-2">
									<label
										className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
										htmlFor="cat-name"
									>
										Nama Kategori
									</label>
									<input
										autoFocus
										className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
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
										className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
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
									<div className="grid grid-cols-3 gap-2">
										<button
											className={`rounded-lg py-2 font-bold text-xs transition-all ${
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
											className={`rounded-lg py-2 font-bold text-xs transition-all ${
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
											className={`rounded-lg py-2 font-bold text-xs transition-all ${
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

								<div className="flex gap-3 pt-1">
									<button
										className="flex-1 rounded-lg border border-border bg-muted py-2.5 font-semibold text-sm transition-all hover:bg-muted/80"
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
										className="flex-1 rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground text-sm shadow-sm transition-all hover:brightness-110"
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
					<div
						className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-md"
						data-admin-modal-backdrop
					>
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
							data-admin-modal-card
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<div className="border-border/60 border-b p-5">
								<h3 className="font-bold text-xl text-foreground">
									{variationModal.editingId ? "Edit Variasi" : "Tambah Variasi"}
								</h3>
							</div>
							<form
								className="flex flex-1 flex-col overflow-hidden"
								onSubmit={handleVariationSubmit}
							>
								<div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
									<div className="space-y-2">
										<label
											className="font-bold text-muted-foreground text-[10px] uppercase tracking-widest"
											htmlFor="var-name"
										>
											Nama Grup Variasi
										</label>
										<input
											autoFocus
											className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
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
														className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary/20"
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
														className="h-9 w-32 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary/20"
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
											className="w-full rounded-lg border border-border border-dashed py-2.5 font-semibold text-muted-foreground text-xs transition-all hover:bg-muted/30"
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

								<div className="flex gap-3 border-border/60 border-t p-4">
									<button
										className="flex-1 rounded-lg border border-border bg-muted py-2.5 font-semibold text-sm transition-all hover:bg-muted/80"
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
										className="flex-1 rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground text-sm shadow-sm transition-all hover:brightness-110"
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
	const BASE_RECIPE_CATEGORIES = [
		"Base Susu",
		"Base Sauce",
		"Base Sirup",
		"Base Teh",
		"Lainnya",
	] as const;
	const baseRecipes = useHybridBaseRecipes();
	const inventory = useHybridInventory();
	const products = useHybridAllProducts();
	const recipes = useHybridRecipes();
	const createBaseRecipe = useHybridCreateBaseRecipe();
	const updateBaseRecipe = useHybridUpdateBaseRecipe();
	const deleteBaseRecipe = useHybridDeleteBaseRecipe();
	const [searchRecipe, setSearchRecipe] = useState("");
	const [searchBahan, setSearchBahan] = useState("");

	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingId, setEditingId] = useState<Id<"baseRecipes"> | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] =
		useState<Id<"baseRecipes"> | null>(null);
	const [ingredientQuery, setIngredientQuery] = useState("");
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		category: "Lainnya",
		targetUnit: "ml",
		targetQuantity: "1000",
		ingredients: [] as { inventoryId: Id<"inventory">; amount: number }[],
	});

	const resetForm = () => {
		setFormData({
			name: "",
			description: "",
			category: "Lainnya",
			targetUnit: "ml",
			targetQuantity: "1000",
			ingredients: [],
		});
		setIngredientQuery("");
		setEditingId(null);
		setIsModalOpen(false);
	};

	const handleEdit = (recipe: Doc<"baseRecipes">) => {
		setEditingId(recipe._id);
		setFormData({
			name: recipe.name,
			description: recipe.description || "",
			category: (recipe as any).category || "Lainnya",
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
			category: formData.category,
			targetUnit: formData.targetUnit,
			targetQuantity: Number(formData.targetQuantity),
			ingredients: formData.ingredients,
		};

		try {
			if (editingId) {
				await updateBaseRecipe({ id: editingId, ...data });
				toast.success("Resep base diperbarui"); triggerHybridRefresh();
			} else {
				await createBaseRecipe(data);
				toast.success("Resep base dibuat"); triggerHybridRefresh();
			}
			resetForm();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Gagal menyimpan resep"
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

	const baseRecipeById = useMemo(() => {
		const map = new Map<string, any>();
		for (const recipe of baseRecipes ?? []) {
			map.set(recipe._id as string, recipe);
		}
		return map;
	}, [baseRecipes]);
	const groupedIngredients = useMemo(() => {
		const rawIngredients = inventory?.filter((item: any) => !item.baseRecipeId) ?? [];
		const baseGroups: Record<string, any[]> = {};
		for (const item of inventory?.filter((inv: any) => inv.baseRecipeId) ?? []) {
			const baseRecipe = item.baseRecipeId
				? baseRecipeById.get(item.baseRecipeId as string)
				: null;
			const category =
				typeof baseRecipe?.category === "string" && baseRecipe.category.trim()
					? baseRecipe.category.trim()
					: "Lainnya";
			if (!baseGroups[category]) {
				baseGroups[category] = [];
			}
			baseGroups[category].push(item);
		}
		return {
			rawIngredients,
			baseGroups: Object.entries(baseGroups).sort((a, b) =>
				a[0].localeCompare(b[0], "id")
			),
		};
	}, [baseRecipeById, inventory]);
	const allIngredients = useMemo(
		() => [
			...groupedIngredients.rawIngredients,
			...groupedIngredients.baseGroups.flatMap(([, items]) => items),
		],
		[groupedIngredients]
	);
	const productNameOptions = useMemo<string[]>(() => {
		if (!products) {
			return [];
		}
		const names = (products as any[])
			.map((product) => (typeof product?.name === "string" ? product.name.trim() : ""))
			.filter((name): name is string => Boolean(name));
		return [...new Set(names)].sort((a, b) => a.localeCompare(b, "id"));
	}, [products]);

	const addIngredientFromQuery = () => {
		const query = ingredientQuery.trim().toLowerCase();
		if (!query) {
			return;
		}
		const exact = allIngredients.find(
			(item: any) =>
				item.ingredientName.toLowerCase() === query || item._id === ingredientQuery
		);
		const matched =
			exact ||
			allIngredients.find((item: any) =>
				item.ingredientName.toLowerCase().includes(query)
			);
		if (!matched) {
			toast.error("Bahan tidak ditemukan");
			return;
		}
		addIngredient(matched._id as Id<"inventory">);
		setIngredientQuery("");
	};

	const filteredBaseRecipes = useMemo(() => {
		if (!baseRecipes) {
			return [];
		}
		const rowKeyword = searchRecipe.trim().toLowerCase();
		const colKeyword = searchBahan.trim().toLowerCase();
		return baseRecipes.filter((recipe: any) => {
			// Row filter: nama / deskripsi / kategori
			const category =
				typeof recipe.category === "string" ? recipe.category.toLowerCase() : "";
			const matchesRow =
				!rowKeyword ||
				recipe.name.toLowerCase().includes(rowKeyword) ||
				(recipe.description ?? "").toLowerCase().includes(rowKeyword) ||
				category.includes(rowKeyword);
			if (!matchesRow) return false;

			// Column filter: bahan baku
			if (!colKeyword) return true;
			return (recipe.ingredients ?? []).some((ing: any) => {
				const inv = (inventory ?? []).find(
					(v: any) => v._id === ing.inventoryId
				);
				return inv?.ingredientName?.toLowerCase().includes(colKeyword);
			});
		});
	}, [baseRecipes, inventory, searchRecipe, searchBahan]);

	return (
		<>
			<div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<h2 className="font-bold text-xl">Daftar Resep</h2>
				<div className="flex items-center gap-2">
					<div className="relative">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="h-9 w-44 pl-8"
							onChange={(event) => setSearchRecipe(event.target.value)}
							placeholder="Cari baris resep..."
							value={searchRecipe}
						/>
					</div>
					<div className="relative">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="h-9 w-44 pl-8"
							onChange={(event) => setSearchBahan(event.target.value)}
							placeholder="Cari bahan baku..."
							value={searchBahan}
						/>
					</div>
					<Button
						className="h-9 gap-2"
						onClick={() => {
							resetForm();
							setIsModalOpen(true);
						}}
						size="sm"
						type="button"
					>
						<Plus className="h-4 w-4" /> Tambah Resep
					</Button>
				</div>
			</div>

			<div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Total Resep</p>
					<p className="font-bold text-lg">{baseRecipes?.length ?? 0}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Tampil</p>
					<p className="font-bold text-lg">{filteredBaseRecipes.length}</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Kategori Resep</p>
					<p className="font-bold text-lg">
						{
							new Set(
								(filteredBaseRecipes as any[]).map((recipe) =>
									recipe.category?.trim() ? recipe.category.trim() : "Lainnya"
								)
							).size
						}
					</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Dipakai Produk</p>
					<p className="font-bold text-lg">{new Set((recipes ?? []).map((r: any) => r.productId)).size}</p>
				</div>
			</div>

			<div className="overflow-x-auto rounded-xl border border-border bg-card">
				<table className="w-full min-w-[900px] text-left text-xs">
					<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase">
						<tr>
							<th className="px-3 py-2">Nama</th>
							<th className="px-3 py-2">Kategori</th>
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
								<td className="px-3 py-2">
									<span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-[10px] text-primary">
										{recipe.category?.trim() ? recipe.category : "Lainnya"}
									</span>
								</td>
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
					<div
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm"
						data-admin-modal-backdrop
					>
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
							data-admin-modal-card
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
						>
							<div className="border-border/60 border-b p-5">
								<h3 className="font-bold text-xl text-foreground">
									{editingId ? "Edit Resep" : "Buat Resep Baru"}
								</h3>
								<p className="mt-1 text-muted-foreground text-xs">
									Susun formula resep dengan struktur yang lebih ringkas dan mudah dicek.
								</p>
							</div>

							<form
								className="flex flex-1 flex-col overflow-hidden"
								onSubmit={handleSubmit}
							>
								<div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
									<div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
										<div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
											<div className="space-y-2">
												<label className="font-semibold text-[11px] uppercase tracking-wide" htmlFor="base-recipe-name">
													Nama Resep
												</label>
												<input
													autoFocus
													className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
													id="base-recipe-name"
													list="base-recipe-name-options"
													onChange={(e) => setFormData({ ...formData, name: e.target.value })}
													placeholder="Contoh: Base Susu Premium"
													required
													value={formData.name}
												/>
												<datalist id="base-recipe-name-options">
													{productNameOptions.map((name) => (
														<option key={name} value={name} />
													))}
												</datalist>
											</div>
											<div className="space-y-2">
												<label className="font-semibold text-[11px] uppercase tracking-wide" htmlFor="base-recipe-desc">
													Deskripsi
												</label>
												<input
													className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
													id="base-recipe-desc"
													onChange={(e) => setFormData({ ...formData, description: e.target.value })}
													placeholder="Fungsi atau catatan penggunaan"
													value={formData.description}
												/>
											</div>
											<div className="space-y-2">
												<label className="font-semibold text-[11px] uppercase tracking-wide" htmlFor="base-recipe-category">
													Kategori Resep
												</label>
												<select
													className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
													id="base-recipe-category"
													onChange={(e) =>
														setFormData({ ...formData, category: e.target.value })
													}
													value={formData.category}
												>
													{BASE_RECIPE_CATEGORIES.map((category) => (
														<option key={category} value={category}>
															{category}
														</option>
													))}
												</select>
											</div>
										</div>

										<div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
											<div className="space-y-2">
												<label className="font-semibold text-[11px] uppercase tracking-wide" htmlFor="base-recipe-unit">
													Batch Unit
												</label>
												<input
													className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
													id="base-recipe-unit"
													onChange={(e) => setFormData({ ...formData, targetUnit: e.target.value })}
													placeholder="ml / gram / pcs"
													required
													value={formData.targetUnit}
												/>
												<div className="flex gap-2">
													{["ml", "gram", "pcs"].map((unit) => (
														<button
															className={`rounded-full border px-2.5 py-1 text-[11px] ${formData.targetUnit === unit ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
															key={unit}
															onClick={() => setFormData({ ...formData, targetUnit: unit })}
															type="button"
														>
															{unit}
														</button>
													))}
												</div>
											</div>
											<div className="space-y-2">
												<label className="font-semibold text-[11px] uppercase tracking-wide" htmlFor="base-recipe-qty">
													Batch Quantity
												</label>
												<input
													className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
													id="base-recipe-qty"
													onChange={(e) => setFormData({ ...formData, targetQuantity: e.target.value })}
													required
													type="number"
													value={formData.targetQuantity}
												/>
											</div>
										</div>
									</div>

									<div className="space-y-3 rounded-xl border border-border bg-card p-4">
										<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
											<h4 className="font-semibold text-sm">Komposisi Bahan</h4>
											<div className="flex w-full max-w-md items-center gap-2">
												<input
													className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs"
													list="base-ingredient-options"
													onChange={(event) => setIngredientQuery(event.target.value)}
													onKeyDown={(event) => {
														if (event.key === "Enter") {
															event.preventDefault();
															addIngredientFromQuery();
														}
													}}
													placeholder="+ Tambah bahan atau base resep"
													value={ingredientQuery}
												/>
												<datalist id="base-ingredient-options">
													{allIngredients.map((inv: any) => (
														<option key={inv._id} value={inv.ingredientName}>
															{inv.unit}
														</option>
													))}
												</datalist>
												<button
													className="h-9 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted"
													onClick={addIngredientFromQuery}
													type="button"
												>
													Tambah
												</button>
											</div>
										</div>

										<div className="overflow-x-auto rounded-lg border border-border">
											<table className="w-full min-w-[560px] text-left text-xs">
												<thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase">
													<tr>
														<th className="px-3 py-2">Bahan</th>
														<th className="px-3 py-2">Jumlah</th>
														<th className="px-3 py-2">Unit</th>
														<th className="px-3 py-2 text-right">Hapus</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-border">
													{formData.ingredients.map((ing: any, idx: number) => {
														const inv = inventory?.find((v: any) => v._id === ing.inventoryId);
														return (
															<tr key={ing.inventoryId || `new-${idx}`}>
																<td className="px-3 py-2 font-medium">{inv?.ingredientName || "-"}</td>
																<td className="px-3 py-2">
																	<input
																		className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs"
																		onChange={(e) => {
																			const newIngs = [...formData.ingredients];
																			newIngs[idx].amount = Number(e.target.value);
																			setFormData({ ...formData, ingredients: newIngs });
																		}}
																		placeholder="0"
																		required
																		type="number"
																		value={ing.amount}
																	/>
																</td>
																<td className="px-3 py-2 text-muted-foreground">{inv?.unit ?? "-"}</td>
																<td className="px-3 py-2 text-right">
																	<button
																		className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
																		onClick={() => removeIngredient(idx)}
																		type="button"
																	>
																		<Trash2 className="h-4 w-4" />
																	</button>
																</td>
															</tr>
														);
													})}
													{formData.ingredients.length === 0 && (
														<tr>
															<td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
																Belum ada bahan ditambahkan.
															</td>
														</tr>
													)}
												</tbody>
											</table>
										</div>
									</div>
								</div>

								<div className="sticky bottom-0 flex gap-3 border-border/60 border-t bg-card/95 p-4 backdrop-blur">
									<button
										className="flex-1 rounded-lg border border-border bg-muted py-2.5 font-semibold text-sm transition-all hover:bg-muted/80"
										onClick={resetForm}
										type="button"
									>
										Batal
									</button>
									<button
										className="flex-1 rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground text-sm shadow-sm transition-all hover:brightness-110"
										type="submit"
									>
										{editingId ? "Simpan Perubahan" : "Simpan Resep"}
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
				message="Hapus resep ini? Semua produk yang menggunakan resep ini mungkin terpengaruh."
				onClose={() => setConfirmDeleteId(null)}
				onConfirm={async () => {
					if (confirmDeleteId) {
						const result = await withSaveToast(
							() => deleteBaseRecipe({ id: confirmDeleteId }),
							{ success: "Resep base dihapus" }
						);
						if (result.success) triggerHybridRefresh();
					}
				}}
				title="Konfirmasi Hapus"
				variant="danger"
			/>
		</>
	);
}

function MixedRecipesTab() {
	const products = useHybridAllProducts();
	const baseRecipes = useHybridBaseRecipes();
	const recipes = useHybridRecipes();
	const inventory = useHybridInventory();
	const hppProductMap = useHybridHppProductMap();
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
		return products.filter((product: any) => product.name.toLowerCase().includes(keyword));
	}, [products, searchMixed]);

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
				<h2 className="font-bold text-xl">List Resep</h2>
				<p className="text-muted-foreground text-sm">
					Daftar lengkap semua resep produk dan resep.
				</p>
				</div>
				<Input
					className="h-9 w-64"
					onChange={(event) => setSearchMixed(event.target.value)}
					placeholder="Cari produk..."
					value={searchMixed}
				/>
			</div>

			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<div className="rounded-lg border border-border bg-card p-3">
					<p className="text-muted-foreground text-[10px] uppercase">Total Resep</p>
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
				{/* Section 1: Recipes */}
				<div className="space-y-4">
					<div className="flex items-center gap-2">
						<div className="h-6 w-1 rounded-full bg-primary" />
						<h3 className="font-bold text-lg">Resep</h3>
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
								Belum ada resep.
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
										{hpp ? (
											<Link
												className="text-primary underline hover:text-primary/80"
												to={`/admin/recipe/hpp?productId=${product._id}` as any}
											>
												HPP {Math.round(hpp.hppPerServing).toLocaleString("id-ID")} | Margin {hpp.marginPercent.toFixed(0)}%
											</Link>
										) : (
											<span className="text-muted-foreground">-</span>
										)}
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



