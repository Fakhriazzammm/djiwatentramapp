import { api } from "@yumipos/backend/convex/_generated/api";
import type { Doc, Id } from "@yumipos/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Download, Upload } from "lucide-react";
import Papa from "papaparse";
import { useRef, useState } from "react";
import { toast } from "sonner";

interface CSVProductRow {
	// Normalized keys (lowercase)
	name?: string;
	nama?: string;
	price?: string;
	harga?: string;
	category?: string;
	kategori?: string;
	description?: string;
	deskripsi?: string;
	promoprice?: string;
	hargapromo?: string;
	image?: string;
	gambar?: string;
	available?: string;
	tersedia?: string;
	[key: string]: string | undefined;
}

interface ParsedProduct {
	name: string;
	price: number;
	categoryId: Id<"categories">;
	description?: string;
	promoPrice?: number;
	image?: string;
	isAvailable: boolean;
}

const DEFAULT_CATEGORY_NAME = "Umum";
const DEFAULT_PRODUCT_NAME = "Produk Tanpa Nama";
const DEFAULT_PRODUCT_PRICE = 0;

async function handleCategoryCreation(
	categoryName: string,
	currentCategories: { _id: Id<"categories">; name: string }[],
	createCategory: (args: { name: string }) => Promise<Id<"categories">>
) {
	try {
		const categoryId = await createCategory({ name: categoryName });
		currentCategories.push({ _id: categoryId, name: categoryName });
		return categoryId;
	} catch (error) {
		console.error(`Failed to create category ${categoryName}:`, error);
		return null;
	}
}

function mapRowToProduct(
	row: CSVProductRow,
	categoryId: Id<"categories">,
	index: number
): ParsedProduct {
	const name = (row.name || row.nama || "").trim();
	const priceStr = (row.price || row.harga || "").trim();
	const description = (row.description || row.deskripsi || "").trim();
	const promoPriceStr = (row.promoprice || row.hargapromo || "").trim();
	const image = (row.image || row.gambar || "").trim();
	const availableStr = (row.available || row.tersedia || "TRUE").trim();

	return {
		name: name || `${DEFAULT_PRODUCT_NAME} ${index + 1}`,
		price: Number(priceStr || DEFAULT_PRODUCT_PRICE),
		categoryId,
		description: description || undefined,
		promoPrice: promoPriceStr ? Number(promoPriceStr) : undefined,
		image: image || undefined,
		isAvailable: availableStr.toUpperCase() !== "FALSE" && availableStr !== "0",
	};
}

async function processCSVRows(
	rows: CSVProductRow[],
	categories: { _id: Id<"categories">; name: string }[] | undefined,
	createCategory: (args: { name: string }) => Promise<Id<"categories">>
) {
	const validProducts: ParsedProduct[] = [];
	const skippedRows: { row: CSVProductRow; reason: string }[] = [];
	const createdCategoriesNames: string[] = [];
	const currentCategories = categories ? [...categories] : [];

	for (const row of rows) {
		const priceStr = (row.price || row.harga || "").trim();
		const productPrice = Number(priceStr);
		const categoryName = (
			row.category ||
			row.kategori ||
			DEFAULT_CATEGORY_NAME
		).trim();
		const productName = (row.name || row.nama || "").trim();

		if (!productName) {
			skippedRows.push({ row, reason: "Nama produk wajib diisi" });
			continue;
		}

		if (priceStr && Number.isNaN(productPrice)) {
			skippedRows.push({ row, reason: `Harga tidak valid: ${priceStr}` });
			continue;
		}

		let categoryId = currentCategories.find(
			(c) => c.name.toLowerCase() === categoryName.toLowerCase()
		)?._id;

		if (!categoryId) {
			const newId = await handleCategoryCreation(
				categoryName,
				currentCategories,
				createCategory
			);
			if (!newId) {
				skippedRows.push({
					row,
					reason: `Gagal membuat kategori: ${categoryName}`,
				});
				continue;
			}
			categoryId = newId;
			createdCategoriesNames.push(categoryName);
		}

		validProducts.push(
			mapRowToProduct(row, categoryId as Id<"categories">, validProducts.length)
		);
	}

	return { validProducts, skippedRows, createdCategoriesNames };
}

export function BulkOperations() {
	const products = useQuery(api.products.getAllProductsAdmin);
	const categories = useQuery(api.products.getCategories);
	const bulkCreate = useMutation(api.products.bulkCreateProducts);
	const createCategory = useMutation(api.products.createCategory);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);

	const handleDownloadTemplate = () => {
		const template = [
			{
				Name: "Contoh Kopi",
				Price: 15_000,
				Category: "Minuman",
				Description: "Kopi hitam manis",
				PromoPrice: "",
				Image: "",
				Available: "TRUE",
			},
		];
		const csv = Papa.unparse(template);
		const blob = new Blob([csv], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "products_template.csv";
		a.click();
		window.URL.revokeObjectURL(url);
	};

	const handleDownloadProducts = () => {
		if (!products || products.length === 0) {
			toast.error("Tidak ada produk untuk diunduh");
			return;
		}

		const data = products.map((p: Doc<"products">) => {
			const categoryName =
				categories?.find((c: Doc<"categories">) => c._id === p.categoryId)?.name ||
				"Unknown";
			return {
				Name: p.name,
				Price: p.price,
				Category: categoryName,
				Description: p.description || "",
				PromoPrice: p.promoPrice || "",
				Image: p.image || "",
				Available: p.isAvailable ? "TRUE" : "FALSE",
			};
		});

		const csv = Papa.unparse(data);
		const blob = new Blob([csv], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `products_export_${new Date().toISOString().split("T")[0]}.csv`;
		a.click();
		window.URL.revokeObjectURL(url);
	};

	const handleParsedRows = async (rows: CSVProductRow[]) => {
		if (rows.length === 0) {
			toast.warning("File CSV kosong");
			return;
		}

		const { validProducts, skippedRows, createdCategoriesNames } =
			await processCSVRows(rows, categories, createCategory);

		if (validProducts.length > 0) {
			await bulkCreate({ products: validProducts });
			let msg = `Berhasil mengimpor ${validProducts.length} produk`;
			if (createdCategoriesNames.length > 0) {
				msg += `. Kategori baru: ${createdCategoriesNames.join(", ")}`;
			}
			toast.success(msg);

			if (skippedRows.length > 0) {
				toast.warning(
					`${skippedRows.length} baris dilewati. Periksa format data.`
				);
			}
		} else if (skippedRows.length > 0) {
			toast.error(
				`Gagal mengimpor ${skippedRows.length} baris. Periksa kategori dan field wajib.`
			);
		} else {
			toast.info("Tidak ada data yang diproses");
		}
	};

	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}

		setIsUploading(true);
		Papa.parse(file, {
			header: true,
			skipEmptyLines: true,
			transformHeader: (header) => header.trim().toLowerCase(),
			complete: async (results) => {
				try {
					await handleParsedRows(results.data as CSVProductRow[]);
				} catch (error) {
					console.error(error);
					toast.error("Terjadi kesalahan saat upload");
				} finally {
					setIsUploading(false);
					if (fileInputRef.current) {
						fileInputRef.current.value = "";
					}
				}
			},
			error: (error) => {
				console.error(error);
				toast.error("Gagal membaca file CSV");
				setIsUploading(false);
			},
		});
	};

	return (
		<div className="flex gap-2">
			<button
				className="flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 font-medium text-sm hover:bg-accent hover:text-accent-foreground"
				onClick={handleDownloadTemplate}
				type="button"
			>
				<Download className="h-4 w-4" /> Template CSV
			</button>
			<button
				className="flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 font-medium text-sm hover:bg-accent hover:text-accent-foreground"
				onClick={handleDownloadProducts}
				type="button"
			>
				<Download className="h-4 w-4" /> Export Data
			</button>
			<div className="relative">
				<input
					accept=".csv"
					className="hidden"
					disabled={isUploading}
					id="csv-upload"
					onChange={handleFileUpload}
					ref={fileInputRef}
					type="file"
				/>
				<label
					className={`flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground text-sm transition-all hover:bg-primary/90 ${
						isUploading ? "cursor-not-allowed opacity-50" : ""
					}`}
					htmlFor="csv-upload"
				>
					<Upload className="h-4 w-4" />
					{isUploading ? "Uploading..." : "Import CSV"}
				</label>
			</div>
		</div>
	);
}
