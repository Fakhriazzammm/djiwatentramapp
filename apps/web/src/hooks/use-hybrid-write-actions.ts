import { createClient } from "@/lib/client";
import { useAction, useMutation } from "@/lib/backend-bridge";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { useCallback } from "react";

type FunctionReference<_Kind extends "mutation" | "action"> = unknown;
const api = new Proxy(
	{},
	{
		get: () =>
			new Proxy(
				{},
				{
					get: () => undefined,
				}
			),
	}
) as any;

const hasSupabaseConfig = Boolean(
	import.meta.env.VITE_SUPABASE_URL &&
		import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);
const supabaseStorageBucket = (
	import.meta.env.VITE_SUPABASE_STORAGE_BUCKET as string | undefined
)
	?.trim()
	|| "app-assets";

function makeSourceId(prefix: string) {
	const random =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID().replace(/-/g, "")
			: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	return `${prefix}_${random.slice(0, 24)}`;
}

function getOrderSourcePrefix(source?: "pos" | "customer_self_service" | "booking") {
	if (source === "customer_self_service") return "SO";
	if (source === "booking") return "BKO";
	return "ORD";
}

function getOrderTypeCode(orderType?: "dine_in" | "takeaway") {
	if (orderType === "dine_in") return "D";
	if (orderType === "takeaway") return "T";
	return "X";
}

function generateOrderNumber(args: {
	source?: "pos" | "customer_self_service" | "booking";
	orderType?: "dine_in" | "takeaway";
	createdAt: number;
	customerName?: string;
	receiptNo?: number;
}) {
	const d = new Date(args.createdAt);
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const yy = String(d.getFullYear()).slice(-2);
	const dateCode = `${dd}${mm}${yy}`;
	const typeCode = getOrderTypeCode(args.orderType);
	const custCode = (args.customerName || "UMUM")
		.replace(/[^a-zA-Z0-9]/g, "")
		.toUpperCase()
		.slice(0, 5) || "UMUM";
	const noCode = args.receiptNo != null ? String(args.receiptNo).padStart(3, "0") : "000";
	return `ORD-${typeCode}-${custCode}${noCode}${dateCode}`;
}

function generateBookingCode(timestamp: number) {
	const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
	return `BK-${rand}${timestamp.toString(36).toUpperCase().slice(-3)}`;
}

function getLocalDateKey(timestamp: number) {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
		2,
		"0"
	)}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildFinancialSourceRef(args: {
	type: "income" | "expense";
	category: string;
	date: number;
	source?: string;
	syncSource?: string;
	seed?: string;
}) {
	const category = (args.category || "").trim().toLowerCase();
	const source = (args.source || "").trim().toLowerCase();
	const syncSource = (args.syncSource || "").trim().toLowerCase();
	let prefix = args.type === "income" ? "INC" : "EXP";

	if (category === "modal awal") {
		prefix = "SHF-OPEN";
	} else if (category === "setoran akhir") {
		prefix = "SHF-CLOSE";
	} else if (source === "ai_receipt_scan") {
		prefix = args.type === "income" ? "INC-RCT" : "EXP-RCT";
	} else if (source.startsWith("ai_")) {
		prefix = args.type === "income" ? "AI-INC" : "AI-EXP";
	} else if (
		syncSource.includes("inventory") ||
		category.includes("stok") ||
		category.includes("inventory") ||
		category.includes("bahan")
	) {
		prefix = args.type === "income" ? "INV-IN" : "INV-OUT";
	}

	const datePart = getLocalDateKey(args.date).replace(/-/g, "").slice(2);
	const seedClean = (args.seed || "")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "");
	const suffix = seedClean
		? seedClean.slice(-6).padStart(6, "0")
		: `${args.date.toString(36).toUpperCase().slice(-4)}${Math.random()
				.toString(36)
				.toUpperCase()
				.slice(2, 4)}`;

	return `${prefix}-${datePart}-${suffix}`;
}

function enrichFinancialMetadataWithRef(args: {
	type: "income" | "expense";
	category: string;
	date: number;
	metadata?: Record<string, any>;
	seed?: string;
}) {
	const metadata = args.metadata ? { ...args.metadata } : {};
	const currentSourceRef = String(metadata.sourceRef || "").trim();
	if (!currentSourceRef) {
		metadata.sourceRef = buildFinancialSourceRef({
			type: args.type,
			category: args.category,
			date: args.date,
			source: metadata.source,
			syncSource: metadata.syncSource,
			seed: args.seed,
		});
	}
	return metadata;
}

async function sha256Hex(value: string) {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Euclidean distance between two face descriptor vectors.
 * Returns a value between 0 (identical) and ~2 (completely different).
 * Threshold 0.6 is the standard for face recognition.
 */
function euclideanDistance(a: number[], b: number[]): number {
	if (a.length !== b.length) return Infinity;
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const diff = a[i] - b[i];
		sum += diff * diff;
	}
	return Math.sqrt(sum);
}

/**
 * Verify attendance identity via PIN (SHA-256) and/or face descriptor (euclidean distance ≤ 0.6).
 * At least one of pinCode or faceDescriptor must pass for the identity to be verified.
 * Throws if verification fails.
 */
async function verifyAttendanceIdentity(args: {
	userId: string;
	pinCode?: string;
	faceDescriptor?: number[];
}): Promise<void> {
	const { userId, pinCode, faceDescriptor } = args;
	if (!pinCode && (!faceDescriptor || faceDescriptor.length === 0)) {
		throw new Error("Verifikasi identitas diperlukan: PIN atau wajah");
	}

	const supabase = createClient();
	const { data: user, error } = await supabase
		.from("yumi_users")
		.select("source_id, is_active, home_pin_fingerprint, raw")
		.eq("source_id", userId)
		.maybeSingle();

	if (error) throw error;
	if (!user || user.is_active === false) {
		throw new Error("User tidak ditemukan atau tidak aktif");
	}

	// Verify PIN via SHA-256
	let pinVerified = !pinCode;
	if (pinCode) {
		const fingerprint = await sha256Hex(pinCode.trim());
		if (user.home_pin_fingerprint && fingerprint !== user.home_pin_fingerprint) {
			pinVerified = false;
		} else if (!user.home_pin_fingerprint) {
			pinVerified = false;
		} else {
			pinVerified = true;
		}
	}

	// Verify face via euclidean distance
	let faceVerified = !faceDescriptor || faceDescriptor.length === 0;
	if (faceDescriptor && faceDescriptor.length > 0) {
		const raw = user.raw as Record<string, any> | null;
		const storedDescriptor = raw?.faceDescriptor as number[] | undefined;
		if (!storedDescriptor || storedDescriptor.length === 0) {
			faceVerified = false;
		} else {
			const distance = euclideanDistance(faceDescriptor, storedDescriptor);
			faceVerified = distance <= 0.6;
		}
	}

	if (!pinVerified && !faceVerified) {
		throw new Error("Verifikasi identitas gagal: PIN atau wajah tidak cocok");
	}
}

async function getSessionUserByToken(token: string) {
	const supabase = createClient();
	const nowIso = new Date().toISOString();
	const { data: session, error: sessionError } = await supabase
		.from("yumi_sessions")
		.select("user_source_id, expires_at")
		.eq("token", token)
		.gt("expires_at", nowIso)
		.maybeSingle();
	if (sessionError) throw sessionError;
	if (!session) return null;

	const { data: user, error: userError } = await supabase
		.from("yumi_users")
		.select("*")
		.eq("source_id", session.user_source_id)
		.maybeSingle();
	if (userError) throw userError;
	return user ?? null;
}

async function insertMirrorDocument(args: {
	tableName: string;
	documentId: string;
	creationTime?: number;
	document: Record<string, unknown>;
}) {
	const { error } = await createClient()
		.schema("legacy_mirror")
		.from("documents")
		.insert({
			table_name: args.tableName,
			document_id: args.documentId,
			creation_time: Number(args.creationTime ?? Date.now()),
			document: args.document,
		});
	if (error) throw error;
}

async function updateMirrorDocument(args: {
	tableName: string;
	documentId: string;
	document: Record<string, unknown>;
}) {
	const { error } = await createClient()
		.schema("legacy_mirror")
		.from("documents")
		.update({
			document: args.document,
		})
		.eq("table_name", args.tableName)
		.eq("document_id", args.documentId);
	if (error) throw error;
}

async function getMirrorDocument(tableName: string, documentId: string) {
	const { data, error } = await createClient()
		.schema("legacy_mirror")
		.from("documents")
		.select("document")
		.eq("table_name", tableName)
		.eq("document_id", documentId)
		.maybeSingle();
	if (error) throw error;
	return (data?.document as Record<string, unknown> | null) ?? null;
}

export function useHybridMutationRef<T extends FunctionReference<"mutation">>(
	ref: T
) {
	return useMutation(ref);
}

export function useHybridActionRef<T extends FunctionReference<"action">>(
	ref: T
) {
	return useAction(ref);
}

function useLegacyFallbackMutation<T extends FunctionReference<"mutation">>(
	ref: T
) {
	const mutation = useMutation(ref);
	return useCallback((args: any) => mutation(args), [mutation]);
}

function useLegacyFallbackAction<T extends FunctionReference<"action">>(ref: T) {
	const action = useAction(ref);
	return useCallback((args: any) => action(args), [action]);
}

type HybridStorageUploadArgs = {
	file: Blob;
	contentType?: string;
	fileName?: string;
	folder?: string;
};

function getExtensionFromFileName(fileName?: string) {
	if (!fileName) return "";
	const match = fileName.match(/\.([a-zA-Z0-9]+)$/);
	return match ? match[1].toLowerCase() : "";
}

function getExtensionFromContentType(contentType?: string) {
	const type = String(contentType || "").toLowerCase();
	if (type.includes("jpeg")) return "jpg";
	if (type.includes("png")) return "png";
	if (type.includes("webp")) return "webp";
	if (type.includes("gif")) return "gif";
	if (type.includes("svg")) return "svg";
	return "";
}

function buildStoragePath(args: {
	folder: string;
	fileName?: string;
	contentType?: string;
}) {
	const extension =
		getExtensionFromFileName(args.fileName) ||
		getExtensionFromContentType(args.contentType) ||
		"bin";
	const random =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID().replace(/-/g, "")
			: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	return `${args.folder}/${Date.now()}-${random.slice(0, 20)}.${extension}`;
}

async function uploadViaLegacyUrl(
	fallback: (args: any) => Promise<any>,
	args: HybridStorageUploadArgs
) {
	const postUrl = await fallback({});
	const result = await fetch(postUrl, {
		method: "POST",
		headers: { "Content-Type": args.contentType || "application/octet-stream" },
		body: args.file,
	});
	if (!result.ok) throw new Error(`Upload failed: ${result.status}`);
	const payload = await result.json();
	const storageId = String(payload?.storageId ?? "");
	if (!storageId) throw new Error("storageId not found in upload response");
	return storageId;
}

function useHybridStorageUpload(
	fallbackRef: any,
	defaultFolder: string
) {
	const fallback = useMutation(fallbackRef);
	return useCallback(
		async (args: HybridStorageUploadArgs) => {
			if (!args?.file) {
				throw new Error("file is required");
			}
			if (!hasSupabaseConfig) {
				return uploadViaLegacyUrl(fallback, args);
			}
			try {
				const supabase = createClient();
				const folder = String(args.folder || defaultFolder).replace(/^\/+|\/+$/g, "") || defaultFolder;
				const objectPath = buildStoragePath({
					folder,
					fileName: args.fileName,
					contentType: args.contentType,
				});
				const { error } = await supabase.storage
					.from(supabaseStorageBucket)
					.upload(objectPath, args.file, {
						contentType: args.contentType || "application/octet-stream",
						upsert: false,
					});
				if (error) throw error;
				const { data } = supabase.storage
					.from(supabaseStorageBucket)
					.getPublicUrl(objectPath);
				return data.publicUrl || objectPath;
			} catch (error) {
				console.error("[supabase-hybrid:storage-upload] fallback disabled", error);
				return uploadViaLegacyUrl(fallback, args);
			}
		},
		[defaultFolder, fallback]
	);
}

async function invokeYumiAiAction(action: string, payload: Record<string, unknown>) {
	const supabase = createClient();
	const { data, error } = await supabase.functions.invoke("yumi-ai", {
		body: { action, ...payload },
	});
	if (error) throw new Error(error.message || "Gagal menghubungi AI");
	if ((data as any)?.error) throw new Error((data as any).error);
	return data;
}

export function useHybridBulkCreateProducts() {
	const fallback = useMutation(api.products.bulkCreateProducts);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const products = Array.isArray(args?.products) ? args.products : [];
			if (products.length === 0) return [];
			const rows = products.map((product: any) => {
				const sourceId = String(product?._id ?? makeSourceId("prod"));
				return {
					source_id: sourceId,
					category_source_id: product?.categoryId ?? null,
					name: String(product?.name ?? "Produk").trim() || "Produk",
					description: product?.description ?? null,
					price: Number(product?.price ?? 0),
					promo_price:
						product?.promoPrice === undefined ? null : Number(product.promoPrice ?? 0),
					image: product?.image ?? null,
					is_available: product?.isAvailable === undefined ? true : Boolean(product.isAvailable),
					quantity: product?.quantity === undefined ? null : Number(product.quantity ?? 0),
					menu_number:
						product?.menuNumber === undefined ? null : Number(product.menuNumber ?? 0),
					variations: Array.isArray(product?.variations) ? product.variations : null,
					creation_time: Number(product?._creationTime ?? Date.now()),
					raw: product ?? {},
				};
			});
			const { error } = await createClient().schema("pos").from("products").insert(rows);
			if (error) throw error;
			return rows.map((row: any) => row.source_id);
		},
		[fallback]
	);
}

export function useHybridCreateCategory() {
	const fallback = useMutation(api.products.createCategory);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const sourceId = makeSourceId("cat");
			const row = {
				source_id: sourceId,
				name: String(args?.name ?? "").trim() || "Kategori",
				display_order: Number(args?.displayOrder ?? 0),
				parent_source_id: args?.parentId ?? null,
				track: args?.track ?? null,
				creation_time: Date.now(),
				raw: args ?? {},
			};
			const { error } = await createClient().schema("pos").from("categories").insert(row);
			if (error) throw error;
			return sourceId;
		},
		[fallback]
	);
}

export function useHybridUpdateCategory() {
	const fallback = useMutation(api.products.updateCategory);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id kategori wajib diisi");
			const updates: Record<string, unknown> = {};
			if (args?.name !== undefined) updates.name = String(args.name ?? "").trim() || "Kategori";
			if (args?.displayOrder !== undefined) updates.display_order = Number(args.displayOrder ?? 0);
			if (args?.parentId !== undefined) updates.parent_source_id = args.parentId ?? null;
			if (args?.track !== undefined) updates.track = args.track ?? null;
			if (Object.keys(updates).length === 0) return;
			const { error } = await createClient()
				.schema("pos")
				.from("categories")
				.update(updates)
				.eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridDeleteCategory() {
	const fallback = useMutation(api.products.deleteCategory);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id kategori wajib diisi");
			const { error } = await createClient().schema("pos").from("categories").delete().eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridAddProduct() {
	return useHybridCreateProduct();
}

export function useHybridCreateProduct() {
	const fallback = useMutation(api.products.createProduct);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const sourceId = String(args?._id ?? makeSourceId("prod"));
			const row = {
				source_id: sourceId,
				category_source_id: args?.categoryId ?? null,
				name: String(args?.name ?? "").trim() || "Produk",
				description: args?.description ?? null,
				price: Number(args?.price ?? 0),
				promo_price: args?.promoPrice === undefined ? null : Number(args.promoPrice ?? 0),
				image: args?.image ?? null,
				is_available: args?.isAvailable === undefined ? true : Boolean(args.isAvailable),
				quantity: args?.quantity === undefined ? null : Number(args.quantity ?? 0),
				menu_number: args?.menuNumber === undefined ? null : Number(args.menuNumber ?? 0),
				variations: Array.isArray(args?.variations) ? args.variations : null,
				creation_time: Number(args?._creationTime ?? Date.now()),
				raw: args ?? {},
			};
			const { error } = await createClient().schema("pos").from("products").insert(row);
			if (error) throw error;
			return sourceId;
		},
		[fallback]
	);
}

export function useHybridUpdateProduct() {
	const fallback = useMutation(api.products.updateProduct);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id produk wajib diisi");
			const updates: Record<string, unknown> = {};
			if (args?.categoryId !== undefined) updates.category_source_id = args.categoryId ?? null;
			if (args?.name !== undefined) updates.name = String(args.name ?? "").trim() || "Produk";
			if (args?.description !== undefined) updates.description = args.description ?? null;
			if (args?.price !== undefined) updates.price = Number(args.price ?? 0);
			if (args?.promoPrice !== undefined) {
				updates.promo_price = args.promoPrice === null ? null : Number(args.promoPrice ?? 0);
			}
			if (args?.image !== undefined) updates.image = args.image ?? null;
			if (args?.isAvailable !== undefined) updates.is_available = Boolean(args.isAvailable);
			if (args?.quantity !== undefined) updates.quantity = Number(args.quantity ?? 0);
			if (args?.menuNumber !== undefined) updates.menu_number = Number(args.menuNumber ?? 0);
			if (args?.variations !== undefined) {
				updates.variations = Array.isArray(args.variations) ? args.variations : null;
			}
			if (Object.keys(updates).length === 0) return;
			const { error } = await createClient()
				.schema("pos")
				.from("products")
				.update(updates)
				.eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

type MenuRecipeIngredient = {
	inventoryId: string;
	amount: number;
};

type MenuRecipeSnapshot = {
	_id?: string;
	productId?: string;
	variantName?: string | null;
	ingredients?: MenuRecipeIngredient[];
};

export function useHybridAdjustMenuStockWithRecipe() {
	const updateProduct = useHybridUpdateProduct();
	const applyInventoryStockAction = useHybridApplyInventoryStockAction();

	return useCallback(
		async (args: {
			productId: string;
			deltaMenu: number;
			currentQuantity?: number;
			source?: string;
			notes?: string;
			recipe?: MenuRecipeSnapshot | null;
		}) => {
			const productId = String(args?.productId ?? "").trim();
			const deltaMenu = Number(args?.deltaMenu ?? 0);
			if (!productId) throw new Error("productId wajib diisi");
			if (!Number.isFinite(deltaMenu) || deltaMenu === 0) {
				throw new Error("deltaMenu tidak valid");
			}

			const source = String(args?.source ?? "manual").trim() || "manual";
			let recipe = args?.recipe ?? null;

			if (!recipe && hasSupabaseConfig) {
				const { data: recipeRow, error: recipeError } = await createClient()
					.from("pos_recipes")
					.select("_id, productId, variantName, ingredients")
					.eq("productId", productId)
					.is("variantName", null)
					.maybeSingle();
				if (recipeError) throw recipeError;
				recipe = (recipeRow as MenuRecipeSnapshot | null) ?? null;
			}

			if (!recipe) {
				throw new Error("Menu belum punya recipe. Buat recipe dulu.");
			}

			const ingredients = Array.isArray(recipe.ingredients)
				? recipe.ingredients.filter(
						(ingredient) =>
							typeof ingredient?.inventoryId === "string" &&
							ingredient.inventoryId.trim() !== "" &&
							Number(ingredient?.amount ?? 0) > 0
				  )
				: [];
			if (ingredients.length === 0) {
				throw new Error("Recipe menu belum punya komposisi bahan baku.");
			}

			let currentQuantity = Number(args?.currentQuantity);
			if (!Number.isFinite(currentQuantity)) {
				if (!hasSupabaseConfig) {
					throw new Error("currentQuantity wajib dikirim saat Supabase tidak aktif.");
				}
				const { data: productRow, error: productError } = await createClient()
					.from("pos_products_all")
					.select("quantity")
					.eq("_id", productId)
					.maybeSingle();
				if (productError) throw productError;
				currentQuantity = Number(productRow?.quantity ?? 0);
			}

			const nextQuantityRaw = currentQuantity + deltaMenu;
			if (deltaMenu < 0 && nextQuantityRaw < 0) {
				throw new Error("Stok menu tidak mencukupi.");
			}
			const nextQuantity = Math.max(0, nextQuantityRaw);

			const inventoryAction = deltaMenu > 0 ? "add" : "usage";
			const multiplier = Math.abs(deltaMenu);

			// --- ATOMIC SECTION ---
			// Pre-flight: verifikasi semua ingredient ada dan cukup stok (untuk usage)
			if (inventoryAction === "usage" && hasSupabaseConfig) {
				const pos = createClient().schema("pos");
				for (const ingredient of ingredients) {
					const { data: inv, error: invError } = await pos
						.from("inventory")
						.select("quantity, ingredient_name")
						.eq("source_id", ingredient.inventoryId)
						.maybeSingle();
					if (invError) throw invError;
					if (!inv) {
						throw new Error(
							`Bahan baku "${ingredient.inventoryId}" tidak ditemukan di inventory.`
						);
					}
					const needed = Number(ingredient.amount) * multiplier;
					if (Number(inv.quantity ?? 0) < needed) {
						throw new Error(
							`Stok "${(inv as any).ingredient_name ?? ingredient.inventoryId}" tidak cukup (butuh ${needed}, tersedia ${inv.quantity}).`
						);
					}
				}
			}

			// Step 1: Update product quantity
			await updateProduct({
				id: productId as any,
				quantity: nextQuantity,
			});

			// Step 2: Update semua ingredient dengan rollback on failure
			const updatedIngredients: string[] = [];
			try {
				for (const ingredient of ingredients) {
					await applyInventoryStockAction({
						inventoryId: ingredient.inventoryId,
						action: inventoryAction,
						quantity: Number(ingredient.amount) * multiplier,
						notes:
							args?.notes ??
							`Sinkron stok menu (${deltaMenu > 0 ? "+" : ""}${deltaMenu}) dari ${source}`,
					});
					updatedIngredients.push(ingredient.inventoryId);
				}
			} catch (error) {
				// Rollback product quantity
				console.error(
					`[atomic-adjust-menu-stock] Gagal update ingredient, rollback product ${productId}`,
					error
				);
				try {
					await updateProduct({
						id: productId as any,
						quantity: currentQuantity,
					});
				} catch (rollbackError) {
					console.error(
						`[atomic-adjust-menu-stock] CRITICAL: rollback gagal! Product ${productId} quantity mismatch. Previous: ${currentQuantity}, attempted: ${nextQuantity}`,
						rollbackError
					);
				}

				// Rollback ingredient yang sudah terlanjur di-update
				const rollbackAction = inventoryAction === "add" ? "usage" : "add";
				for (const rolledBackId of updatedIngredients) {
					const ing = ingredients.find((i) => i.inventoryId === rolledBackId);
					if (!ing) continue;
					try {
						await applyInventoryStockAction({
							inventoryId: rolledBackId,
							action: rollbackAction,
							quantity: Number(ing.amount) * multiplier,
							notes: `ROLLBACK: ${error instanceof Error ? error.message : "unknown error"}`,
						});
					} catch (rbError) {
						console.error(
							`[atomic-adjust-menu-stock] CRITICAL: ingredient rollback gagal untuk ${rolledBackId}`,
							rbError
						);
					}
				}

				throw error;
			}

			return {
				productId,
				deltaMenu,
				previousQuantity: currentQuantity,
				nextQuantity,
				ingredientUpdatedCount: ingredients.length,
			};
		},
		[applyInventoryStockAction, updateProduct]
	);
}

export function useHybridDeleteProduct() {
	const fallback = useMutation(api.products.deleteProduct);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id produk wajib diisi");
			const { error } = await createClient().schema("pos").from("products").delete().eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridBulkUpdateProducts() {
	const fallback = useMutation(api.products.bulkUpdateProducts);
	const updateProduct = useHybridUpdateProduct();
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const ids = Array.isArray(args?.ids) ? args.ids : [];
			const updates = args?.updates ?? {};
			await Promise.all(ids.map((id: string) => updateProduct({ id, ...updates })));
			return { updatedCount: ids.length };
		},
		[fallback, updateProduct]
	);
}

export function useHybridGenerateProductUploadUrl() {
	return useHybridStorageUpload(api.products.generateUploadUrl, "products");
}

export function useHybridAddVariationPreset() {
	const fallback = useMutation(api.products.addVariationPreset);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = makeSourceId("variation");
			await insertMirrorDocument({
				tableName: "variationPresets",
				documentId: id,
				document: {
					_id: id,
					name: String(args?.name ?? "").trim() || "Preset Variasi",
					options: Array.isArray(args?.options) ? args.options : [],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
			});
			return id;
		},
		[fallback]
	);
}

export function useHybridUpdateVariationPreset() {
	const fallback = useMutation(api.products.updateVariationPreset);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id preset wajib diisi");
			const current = (await getMirrorDocument("variationPresets", id)) ?? {};
			await updateMirrorDocument({
				tableName: "variationPresets",
				documentId: id,
				document: {
					...current,
					...args,
					_id: id,
					name: args?.name === undefined ? current.name : args.name,
					options: args?.options === undefined ? current.options : args.options,
					updatedAt: Date.now(),
				},
			});
		},
		[fallback]
	);
}

export function useHybridDeleteVariationPreset() {
	const fallback = useMutation(api.products.deleteVariationPreset);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id preset wajib diisi");
			const { error } = await createClient()
				.schema("legacy_mirror")
				.from("documents")
				.delete()
				.eq("table_name", "variationPresets")
				.eq("document_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridCreateBaseRecipe() {
	const fallback = useMutation(api.inventory.createBaseRecipe);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = makeSourceId("baser");
			const row = {
				source_id: id,
				name: String(args?.name ?? "").trim() || "Base Recipe",
				description: args?.description ?? null,
				category: args?.category ?? null,
				target_unit: String(args?.targetUnit ?? "ml").trim() || "ml",
				target_quantity: Number(args?.targetQuantity ?? 0),
				ingredients: Array.isArray(args?.ingredients) ? args.ingredients : [],
				creation_time: Date.now(),
				raw: args ?? {},
			};
			const { error } = await createClient().schema("pos").from("base_recipes").insert(row);
			if (error) throw error;
			return id;
		},
		[fallback]
	);
}

export function useHybridUpdateBaseRecipe() {
	const fallback = useMutation(api.inventory.updateBaseRecipe);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id base recipe wajib diisi");
			const updates: Record<string, unknown> = {};
			if (args?.name !== undefined) updates.name = String(args.name ?? "").trim() || "Base Recipe";
			if (args?.description !== undefined) updates.description = args.description ?? null;
			if (args?.category !== undefined) updates.category = args.category ?? null;
			if (args?.targetUnit !== undefined) updates.target_unit = String(args.targetUnit ?? "").trim() || "ml";
			if (args?.targetQuantity !== undefined) updates.target_quantity = Number(args.targetQuantity ?? 0);
			if (args?.ingredients !== undefined) {
				updates.ingredients = Array.isArray(args.ingredients) ? args.ingredients : [];
			}
			if (Object.keys(updates).length === 0) return;
			const { error } = await createClient().schema("pos").from("base_recipes").update(updates).eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridDeleteBaseRecipe() {
	const fallback = useMutation(api.inventory.deleteBaseRecipe);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id base recipe wajib diisi");
			const pos = createClient().schema("pos");
			await pos.from("inventory").update({ base_recipe_source_id: null }).eq("base_recipe_source_id", id);
			const { error } = await pos.from("base_recipes").delete().eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridSaveRecipe() {
	const fallback = useMutation(api.inventory.saveRecipe);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const productId = String(args?.productId ?? "");
			if (!productId) throw new Error("productId wajib diisi");
			const variantName = args?.variantName ?? null;
			const pos = createClient().schema("pos");
			const { data: existing, error: existingError } = await pos
				.from("recipes")
				.select("source_id")
				.eq("product_source_id", productId)
				.is("variant_name", variantName)
				.maybeSingle();
			if (existingError) throw existingError;
			const recipeId = String(existing?.source_id ?? makeSourceId("recipe"));
			const payload = {
				source_id: recipeId,
				product_source_id: productId,
				variant_name: variantName,
				ingredients: Array.isArray(args?.ingredients) ? args.ingredients : [],
				creation_time: Date.now(),
				raw: args ?? {},
			};
			if (existing?.source_id) {
				const { error } = await pos.from("recipes").update(payload).eq("source_id", recipeId);
				if (error) throw error;
			} else {
				const { error } = await pos.from("recipes").insert(payload);
				if (error) throw error;
			}
			return recipeId;
		},
		[fallback]
	);
}

export function useHybridDeleteRecipe() {
	const fallback = useMutation(api.inventory.deleteRecipe);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id recipe wajib diisi");
			const { error } = await createClient().schema("pos").from("recipes").delete().eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridEnsureInventoryItemForBaseRecipe() {
	const fallback = useMutation(api.inventory.ensureInventoryItemForBaseRecipe);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const baseRecipeId = String(args?.baseRecipeId ?? "");
			if (!baseRecipeId) throw new Error("baseRecipeId wajib diisi");
			const pos = createClient().schema("pos");
			const { data: existing, error: existingError } = await pos
				.from("inventory")
				.select("source_id")
				.eq("base_recipe_source_id", baseRecipeId)
				.maybeSingle();
			if (existingError) throw existingError;
			if (existing?.source_id) {
				return { inventoryId: existing.source_id, created: false };
			}

			const { data: baseRecipe, error: baseError } = await pos
				.from("base_recipes")
				.select("*")
				.eq("source_id", baseRecipeId)
				.maybeSingle();
			if (baseError) throw baseError;
			if (!baseRecipe) throw new Error("Base recipe tidak ditemukan");

			const inventoryId = makeSourceId("inv");
			const row = {
				source_id: inventoryId,
				ingredient_name: String(baseRecipe.name ?? "Base Recipe"),
				unit: String(baseRecipe.target_unit ?? "pcs"),
				quantity: Number(baseRecipe.target_quantity ?? 0),
				low_stock_threshold: 0,
				display_unit: String(baseRecipe.target_unit ?? "pcs"),
				conversion_factor: 1,
				unit_conversions: [],
				base_recipe_source_id: baseRecipeId,
				default_brand_name: null,
				preferred_store_source_id: null,
				preferred_purchase_quantity: null,
				preferred_purchase_unit: null,
				aliases: [],
				last_purchase_price: null,
				last_purchase_at: null,
				last_purchase_store_source_id: null,
				creation_time: Date.now(),
				raw: {
					source: "ensureInventoryItemForBaseRecipe",
					baseRecipeId,
				},
			};
			const { error } = await pos.from("inventory").insert(row);
			if (error) throw error;
			return { inventoryId, created: true };
		},
		[fallback]
	);
}

export function useHybridCreateInventoryItem() {
	const fallback = useMutation(api.inventory.createInventoryItem);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			// #2: Duplicate check — before INSERT, verify ingredientName doesn't already exist
			const ingredientName = String(args?.ingredientName ?? "").trim() || "Bahan";
			const { data: existingItem } = await createClient()
				.from("pos_inventory")
				.select("source_id")
				.ilike("ingredientName", ingredientName)
				.limit(1)
				.maybeSingle();
			if (existingItem) {
				throw new Error(`Item '${ingredientName}' sudah ada di inventory`);
			}

			// #3: CF Validation — if conversionFactor > 1, must be integer between 2 and 100000
			let cf = args?.conversionFactor === undefined ? null : Number(args.conversionFactor ?? 0);
			if (cf !== null && cf > 1) {
				if (!Number.isInteger(cf) || cf < 2 || cf > 100000) {
					throw new Error(
						`Faktor konversi harus bilangan bulat antara 2 dan 100.000. Nilai saat ini: ${cf}. Gunakan 1 atau kosongkan jika tidak ada konversi.`
					);
				}
			}

			const sourceId = makeSourceId("inv");
			const row = {
				source_id: sourceId,
				ingredient_name: ingredientName,
				unit: String(args?.unit ?? "").trim() || "pcs",
				quantity: Number(args?.quantity ?? 0),
				low_stock_threshold: Number(args?.lowStockThreshold ?? 0),
				display_unit: args?.displayUnit ?? null,
				conversion_factor: cf,
				unit_conversions: Array.isArray(args?.unitConversions) ? args.unitConversions : null,
				base_recipe_source_id: args?.baseRecipeId ?? null,
				default_brand_name: args?.defaultBrandName ?? null,
				preferred_store_source_id: args?.preferredStoreId ?? null,
				preferred_purchase_quantity:
					args?.preferredPurchaseQuantity === undefined
						? null
						: Number(args.preferredPurchaseQuantity ?? 0),
				preferred_purchase_unit: args?.preferredPurchaseUnit ?? null,
				aliases: Array.isArray(args?.aliases) ? args.aliases : null,
				last_purchase_price:
					args?.lastPurchasePrice === undefined ? null : Number(args.lastPurchasePrice ?? 0),
				last_purchase_at:
					args?.lastPurchaseAt === undefined ? null : Number(args.lastPurchaseAt ?? 0),
				last_purchase_store_source_id: args?.lastPurchaseStoreId ?? null,
				creation_time: Date.now(),
				category: args?.category ?? "kitchen",
				raw: args ?? {},
			};
			const { error } = await createClient().schema("pos").from("inventory").insert(row);
			if (error) throw error;
			return sourceId;
		},
		[fallback]
	);
}

export function useHybridUpdateInventoryItem() {
	const fallback = useMutation(api.inventory.updateInventoryItem);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id inventory wajib diisi");
			const updates: Record<string, unknown> = {};
			if (args?.ingredientName !== undefined) updates.ingredient_name = args.ingredientName ?? null;
			if (args?.unit !== undefined) updates.unit = args.unit ?? null;
			if (args?.quantity !== undefined) updates.quantity = Number(args.quantity ?? 0);
			if (args?.lowStockThreshold !== undefined) updates.low_stock_threshold = Number(args.lowStockThreshold ?? 0);
			if (args?.displayUnit !== undefined) updates.display_unit = args.displayUnit ?? null;
			if (args?.conversionFactor !== undefined) {
				// #3: CF Validation
				const cfVal = args.conversionFactor === null ? null : Number(args.conversionFactor ?? 0);
				if (cfVal !== null && cfVal > 1) {
					if (!Number.isInteger(cfVal) || cfVal < 2 || cfVal > 100000) {
						throw new Error(
							`Faktor konversi harus bilangan bulat antara 2 dan 100.000. Nilai saat ini: ${cfVal}. Gunakan 1 atau kosongkan jika tidak ada konversi.`
						);
					}
				}
				updates.conversion_factor = cfVal;
			}
			if (args?.unitConversions !== undefined) updates.unit_conversions = Array.isArray(args.unitConversions) ? args.unitConversions : null;
			if (args?.baseRecipeId !== undefined) updates.base_recipe_source_id = args.baseRecipeId ?? null;
			if (args?.defaultBrandName !== undefined) updates.default_brand_name = args.defaultBrandName ?? null;
			if (args?.preferredStoreId !== undefined) updates.preferred_store_source_id = args.preferredStoreId ?? null;
			if (args?.preferredPurchaseQuantity !== undefined) updates.preferred_purchase_quantity = Number(args.preferredPurchaseQuantity ?? 0);
			if (args?.preferredPurchaseUnit !== undefined) updates.preferred_purchase_unit = args.preferredPurchaseUnit ?? null;
			if (args?.netWeight !== undefined) updates.net_weight = args.netWeight ?? null;
			if (args?.category !== undefined) updates.category = args.category ?? null;
			if (args?.lastPurchasePrice !== undefined) updates.last_purchase_price = Number(args.lastPurchasePrice ?? 0);
			if (args?.lastPurchaseAt !== undefined) updates.last_purchase_at = Number(args.lastPurchaseAt ?? 0);
			if (args?.lastPurchaseStoreId !== undefined) updates.last_purchase_store_source_id = args.lastPurchaseStoreId ?? null;
			if (Object.keys(updates).length === 0) return;
			const { error } = await createClient().schema("pos").from("inventory").update(updates).eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridDeleteInventoryItem() {
	const fallback = useMutation(api.inventory.deleteInventoryItem);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id inventory wajib diisi");
			const pos = createClient().schema("pos");
			await pos.from("inventory_transactions").delete().eq("inventory_source_id", id);
			const { error } = await pos.from("inventory").delete().eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridCreateInventoryStore() {
	const fallback = useMutation(api.inventory.createInventoryStore);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = makeSourceId("store");
			const row = {
				source_id: id,
				name: String(args?.name ?? "").trim() || "Store",
				store_type: args?.type ?? "store",
				phone: args?.phone ?? null,
				address: args?.address ?? null,
				notes: args?.notes ?? null,
				is_active: args?.isActive === undefined ? true : Boolean(args.isActive),
				creation_time: Date.now(),
				raw: args ?? {},
			};
			const { error } = await createClient().schema("pos").from("inventory_stores").insert(row);
			if (error) throw error;
			return id;
		},
		[fallback]
	);
}

export function useHybridSetInventoryReferencePrice() {
	const fallback = useMutation(api.inventory.setInventoryReferencePrice);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const inventoryId = String(args?.inventoryId ?? "");
			const price = Number(args?.price ?? 0);
			if (!inventoryId || price <= 0) throw new Error("inventoryId dan price wajib valid");
			const now = Date.now();
			const pos = createClient().schema("pos");
			const { error: txError } = await pos.from("inventory_transactions").insert({
				source_id: makeSourceId("invtx"),
				inventory_source_id: inventoryId,
				quantity: 0,
				tx_type: "costing_reference",
				cost_per_unit: price,
				remaining_quantity: null,
				tx_timestamp: now,
				notes: args?.notes ?? "Harga referensi",
				expiry_date: null,
				brand_name: args?.brandName ?? null,
				store_source_id: args?.storeId ?? null,
				purchase_unit: args?.purchaseUnit ?? null,
				purchase_quantity: null,
				line_total: null,
				source_transaction_id: null,
				source_label: "manual_reference",
				source_fingerprint: null,
				creation_time: now,
				raw: args ?? {},
			});
			if (txError) throw txError;

			const { error: invError } = await pos
				.from("inventory")
				.update({
					last_purchase_price: price,
					last_purchase_at: now,
					last_purchase_store_source_id: args?.storeId ?? null,
				})
				.eq("source_id", inventoryId);
			if (invError) throw invError;
			return { ok: true };
		},
		[fallback]
	);
}

export function useHybridAddStock() {
	const fallback = useMutation(api.inventory.addStock);
	const applyInventoryStockAction = useHybridApplyInventoryStockAction();
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			return applyInventoryStockAction({
				inventoryId: args?.inventoryId,
				action: "add",
				quantity: Number(args?.quantity ?? 0),
				notes: args?.notes,
				costPerUnit: args?.costPerUnit,
				timestamp: args?.timestamp,
				expiryDate: args?.expiryDate,
				brandName: args?.brandName,
				storeId: args?.storeId,
				purchaseUnit: args?.purchaseUnit,
				purchaseQuantity: args?.purchaseQuantity,
				lineTotal: args?.lineTotal,
			});
		},
		[applyInventoryStockAction, fallback]
	);
}

export function useHybridSuggestInventoryAutofill() {
	const fallback = useAction(api.inventory.suggestInventoryAutofill);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const ingredientName = String(args?.ingredientName ?? "").trim();
			if (!ingredientName) throw new Error("ingredientName wajib diisi");
			const { data, error } = await createClient()
				.from("pos_inventory")
				.select("*")
				.ilike("ingredientName", `%${ingredientName}%`)
				.limit(5);
			if (error) throw error;
			const best = Array.isArray(data) && data.length > 0 ? data[0] : null;
			const suggestion = {
				unit: best?.unit ?? "gram",
				lowStockThreshold: Number(best?.lowStockThreshold ?? 100),
				defaultBrandName: best?.defaultBrandName ?? "",
				displayUnit: best?.displayUnit ?? "",
				conversionFactor:
					best?.conversionFactor === undefined || best?.conversionFactor === null
						? null
						: Number(best.conversionFactor),
				unitConversionsText: Array.isArray(best?.unitConversions)
					? best.unitConversions
							.map((row: any) => `${row?.unit ?? ""}:${row?.factor ?? ""}`)
							.filter((txt: string) => txt !== ":")
							.join(", ")
					: "",
				confidence: best ? 0.82 : 0.45,
				category: best ? "history" : "default",
				fieldConfidence: {
					unit: best ? 0.85 : 0.5,
					lowStockThreshold: best ? 0.8 : 0.45,
					defaultBrandName: best ? 0.7 : 0.3,
					conversion: best?.conversionFactor ? 0.72 : 0.35,
				},
				fieldReason: {
					unit: best ? "Menggunakan data item serupa di inventory" : "Fallback default",
					lowStockThreshold: best ? "Rata-rata dari item serupa" : "Fallback default",
					defaultBrandName: best ? "Merek terakhir yang sering dipakai" : "Belum ada riwayat",
					conversion: best ? "Konversi dari item serupa" : "Belum ada riwayat",
				},
				reason: best
					? `Saran berdasarkan item serupa: ${best.ingredientName ?? ingredientName}`
					: "Saran default karena belum ada riwayat item serupa",
				conflictWarning: null,
			};
			return {
				ok: true,
				message: "Saran inventory berhasil dibuat",
				suggestion,
				fallbackPath: best ? ["inventory_history"] : ["default_profile"],
				refreshedAt: Date.now(),
				sources: best ? [best._id] : [],
			};
		},
		[fallback]
	);
}

export function useHybridUpdateOrderItemStatus() {
	const fallback = useMutation(api.kitchenBar.updateOrderItemStatus);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const orderId = String(args?.orderId ?? "");
			const itemIndex = Number(args?.itemIndex ?? -1);
			const status = String(args?.status ?? "").trim();
			if (!orderId || itemIndex < 0 || !status) throw new Error("Payload update status item order tidak valid");
			const lineNo = itemIndex + 1;
			const { error } = await createClient()
				.schema("pos")
				.from("order_items")
				.update({ status })
				.eq("order_source_id", orderId)
				.eq("line_no", lineNo);
			if (error) throw error;
			return { ok: true };
		},
		[fallback]
	);
}

export function useHybridCreateDiscount() {
	const fallback = useMutation(api.discounts.createDiscount);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const sourceId = makeSourceId("disc");
			const row = {
				source_id: sourceId,
				name: String(args?.name ?? "").trim() || "Diskon",
				code: args?.code ?? null,
				discount_type: args?.type ?? "PERCENTAGE",
				value: Number(args?.value ?? 0),
				target_type: args?.targetType ?? "ALL",
				target_id: args?.targetId ?? null,
				target_ids: Array.isArray(args?.targetIds) ? args.targetIds : null,
				formatted_id: args?.formattedId ?? null,
				is_active: args?.isActive === undefined ? true : Boolean(args.isActive),
				min_order_value:
					args?.minOrderValue === undefined ? null : Number(args.minOrderValue ?? 0),
				start_date: args?.startDate === undefined ? null : Number(args.startDate ?? 0),
				end_date: args?.endDate === undefined ? null : Number(args.endDate ?? 0),
				start_time: args?.startTime ?? null,
				end_time: args?.endTime ?? null,
				days: Array.isArray(args?.days) ? args.days : null,
				is_happy_hour: args?.isHappyHour === undefined ? null : Boolean(args.isHappyHour),
				product_prices: Array.isArray(args?.productPrices) ? args.productPrices : null,
				is_free_refill:
					args?.isFreeRefill === undefined ? null : Boolean(args.isFreeRefill),
				refill_price:
					args?.refillPrice === undefined ? null : Number(args.refillPrice ?? 0),
				refill_availability: args?.refillAvailability ?? null,
				creation_time: Date.now(),
				raw: args ?? {},
			};
			const { error } = await createClient().schema("pos").from("discounts").insert(row);
			if (error) throw error;
			return sourceId;
		},
		[fallback]
	);
}

export function useHybridUpdateDiscount() {
	const fallback = useMutation(api.discounts.updateDiscount);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id diskon wajib diisi");
			const updates: Record<string, unknown> = {};
			if (args?.name !== undefined) updates.name = args.name ?? null;
			if (args?.code !== undefined) updates.code = args.code ?? null;
			if (args?.type !== undefined) updates.discount_type = args.type ?? null;
			if (args?.value !== undefined) updates.value = Number(args.value ?? 0);
			if (args?.targetType !== undefined) updates.target_type = args.targetType ?? null;
			if (args?.targetId !== undefined) updates.target_id = args.targetId ?? null;
			if (args?.targetIds !== undefined) updates.target_ids = Array.isArray(args.targetIds) ? args.targetIds : null;
			if (args?.formattedId !== undefined) updates.formatted_id = args.formattedId ?? null;
			if (args?.isActive !== undefined) updates.is_active = Boolean(args.isActive);
			if (args?.minOrderValue !== undefined) updates.min_order_value = Number(args.minOrderValue ?? 0);
			if (args?.startDate !== undefined) updates.start_date = args.startDate === null ? null : Number(args.startDate ?? 0);
			if (args?.endDate !== undefined) updates.end_date = args.endDate === null ? null : Number(args.endDate ?? 0);
			if (args?.startTime !== undefined) updates.start_time = args.startTime ?? null;
			if (args?.endTime !== undefined) updates.end_time = args.endTime ?? null;
			if (args?.days !== undefined) updates.days = Array.isArray(args.days) ? args.days : null;
			if (args?.isHappyHour !== undefined) updates.is_happy_hour = Boolean(args.isHappyHour);
			if (args?.productPrices !== undefined) updates.product_prices = Array.isArray(args.productPrices) ? args.productPrices : null;
			if (args?.isFreeRefill !== undefined) updates.is_free_refill = Boolean(args.isFreeRefill);
			if (args?.refillPrice !== undefined) updates.refill_price = Number(args.refillPrice ?? 0);
			if (args?.refillAvailability !== undefined) updates.refill_availability = args.refillAvailability ?? null;
			if (Object.keys(updates).length === 0) return;
			const { error } = await createClient().schema("pos").from("discounts").update(updates).eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridDeleteDiscount() {
	const fallback = useMutation(api.discounts.deleteDiscount);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id diskon wajib diisi");
			const { error } = await createClient().schema("pos").from("discounts").delete().eq("source_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridCreateHppCalculation() {
	const fallback = useMutation(api.hpp.createHppCalculation);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = makeSourceId("hpp");
			await insertMirrorDocument({
				tableName: "hppCalculations",
				documentId: id,
        document: {
          _id: id,
          name: String(args?.name ?? "").trim() || "HPP Calculation",
          description: args?.description ?? null,
          productId: args?.productId ?? null,
          sellingPrice: Number(args?.sellingPrice ?? 0),
          happyHourPrice: Number(args?.happyHourPrice ?? 0),
          servingsPerBatch: Number(args?.servingsPerBatch ?? 1),
					ingredients: Array.isArray(args?.ingredients) ? args.ingredients : [],
					overheadCosts: Array.isArray(args?.overheadCosts) ? args.overheadCosts : [],
					sourceType: args?.sourceType ?? "manual",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
			});
			return id;
		},
		[fallback]
	);
}

export function useHybridUpdateHppCalculation() {
	const fallback = useMutation(api.hpp.updateHppCalculation);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id HPP wajib diisi");
			const current = (await getMirrorDocument("hppCalculations", id)) ?? {};
			await updateMirrorDocument({
				tableName: "hppCalculations",
				documentId: id,
				document: {
					...current,
					...args,
					_id: id,
					updatedAt: Date.now(),
				},
			});
		},
		[fallback]
	);
}

export function useHybridDeleteHppCalculation() {
	const fallback = useMutation(api.hpp.deleteHppCalculation);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id HPP wajib diisi");
			const { error } = await createClient()
				.schema("legacy_mirror")
				.from("documents")
				.delete()
				.eq("table_name", "hppCalculations")
				.eq("document_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridSyncHppWithInventoryPrices() {
	const fallback = useMutation(api.hpp.syncHppWithInventoryPrices);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id HPP wajib diisi");
			const doc = await getMirrorDocument("hppCalculations", id);
			if (!doc) throw new Error("Data HPP tidak ditemukan");
			const ingredients = Array.isArray((doc as any).ingredients) ? (doc as any).ingredients : [];
			const inventoryIds = ingredients
				.map((item: any) => String(item?.inventoryId ?? ""))
				.filter((value: string) => value.length > 0);
			if (inventoryIds.length === 0) return { updatedCount: 0 };
			const { data: costs, error } = await createClient()
				.from("pos_inventory_latest_costs")
				.select("*")
				.in("inventoryId", inventoryIds);
			if (error) throw error;
			const costMap = new Map<string, number>();
			for (const row of costs ?? []) {
				costMap.set(String((row as any).inventoryId), Number((row as any).latestCostPerUnit ?? 0));
			}
			let updatedCount = 0;
			const nextIngredients = ingredients.map((item: any) => {
				const inventoryId = String(item?.inventoryId ?? "");
				const latestCost = costMap.get(inventoryId);
				if (latestCost === undefined) return item;
				updatedCount += 1;
				const conversionFactor = Number(item?.conversionFactor ?? 1);
				return {
					...item,
					purchasePrice: latestCost * conversionFactor,
					purchaseQuantity: Number(item?.purchaseQuantity ?? 1) || 1,
					usagePerServing: Number(item?.usagePerServing ?? 1) || 1,
				};
			});
			await updateMirrorDocument({
				tableName: "hppCalculations",
				documentId: id,
				document: {
					...(doc as any),
					ingredients: nextIngredients,
					updatedAt: Date.now(),
				},
			});
			return { updatedCount };
		},
		[fallback]
	);
}

export function useHybridUpsertHppFromRecipe() {
	const fallback = useMutation(api.hpp.upsertHppFromRecipe);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const productId = String(args?.productId ?? "");
			if (!productId) throw new Error("productId wajib diisi");
			const supabase = createClient();
			const pos = supabase.schema("pos");
			const { data: recipe, error: recipeError } = await pos
				.from("recipes")
				.select("*")
				.eq("product_source_id", productId)
				.is("variant_name", null)
				.maybeSingle();
			if (recipeError) throw recipeError;
			if (!recipe) throw new Error("Recipe produk belum tersedia");

			const ingredientRows = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
			const inventoryIds = ingredientRows.map((item: any) => String(item?.inventoryId ?? "")).filter(Boolean);
			let costMap = new Map<string, any>();
			if (inventoryIds.length > 0) {
				const { data: costs, error: costsError } = await supabase
					.from("pos_inventory_latest_costs")
					.select("*")
					.in("inventoryId", inventoryIds);
				if (costsError) throw costsError;
				costMap = new Map<string, any>((costs ?? []).map((row: any) => [String(row.inventoryId), row]));
			}

			const { data: product, error: productError } = await supabase
				.from("pos_products_all")
				.select("*")
				.eq("_id", productId)
				.maybeSingle();
			if (productError) throw productError;

			const ingredients = ingredientRows.map((item: any) => {
				const inventoryId = String(item?.inventoryId ?? "");
				const costRow = costMap.get(inventoryId);
				const latestCost = Number(costRow?.latestCostPerUnit ?? 0);
				const conversionFactor = Number(costRow?.conversionFactor ?? 1);
				return {
					inventoryId,
					ingredientName: costRow?.ingredientName ?? item?.ingredientName ?? "Bahan",
					purchasePrice: latestCost * conversionFactor,
					purchaseQuantity: 1,
					purchaseUnit: costRow?.displayUnit ?? costRow?.unit ?? "unit",
					usagePerServing: Number(item?.amount ?? 0),
					usageUnit: costRow?.unit ?? "unit",
					conversionFactor,
				};
			});

			const { data: existingDoc, error: existingError } = await supabase
				.schema("legacy_mirror")
				.from("documents")
				.select("document_id")
				.eq("table_name", "hppCalculations")
				.eq("document->>productId", productId)
				.limit(1)
				.maybeSingle();
			if (existingError) throw existingError;

			const id = String(existingDoc?.document_id ?? makeSourceId("hpp"));
			const nextDocument = {
				_id: id,
				productId,
				name: `HPP ${String(product?.name ?? "Produk")}`,
				description: `Sinkron dari recipe ${String(product?.name ?? "produk")}`,
				servingsPerBatch: 1,
				sellingPrice: Number(product?.promoPrice ?? product?.price ?? 0),
				ingredients,
				overheadCosts: [],
				sourceType: "recipe_based",
				updatedAt: Date.now(),
				createdAt: Number(Date.now()),
			};

			if (existingDoc?.document_id) {
				await updateMirrorDocument({
					tableName: "hppCalculations",
					documentId: id,
					document: nextDocument,
				});
			} else {
				await insertMirrorDocument({
					tableName: "hppCalculations",
					documentId: id,
					document: nextDocument,
				});
			}
			return {
				id,
				created: !existingDoc?.document_id,
				calculation: nextDocument,
			};
		},
		[fallback]
	);
}


export function useHybridCreateGame() {
	const fallback = useMutation(api.minigames.createGame);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = makeSourceId("game");
			await insertMirrorDocument({
				tableName: "miniGames",
				documentId: id,
				document: {
					_id: id,
					brandSlug: String(args?.brandSlug ?? "").trim(),
					name: String(args?.name ?? "").trim() || "Mini Game",
					slug: String(args?.slug ?? "").trim() || `minigame-${Date.now()}`,
					description: args?.description ?? null,
					isActive: args?.isActive === undefined ? true : Boolean(args.isActive),
					requireUniqueContact:
						args?.requireUniqueContact === undefined ? true : Boolean(args.requireUniqueContact),
					maxSpinsPerContact: Number(args?.maxSpinsPerContact ?? 1),
					startAt: args?.startAt ?? null,
					endAt: args?.endAt ?? null,
					spinDurationMs: Number(args?.spinDurationMs ?? 5200),
					thankYouMessage:
						args?.thankYouMessage ??
						"Terima kasih sudah bermain. Tim kami akan menghubungi Anda.",
					prizes: Array.isArray(args?.prizes) ? args.prizes : [],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
			});
			return id;
		},
		[fallback]
	);
}

export function useHybridUpdateGame() {
	const fallback = useMutation(api.minigames.updateGame);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id game wajib diisi");
			const current = (await getMirrorDocument("miniGames", id)) ?? {};
			await updateMirrorDocument({
				tableName: "miniGames",
				documentId: id,
				document: {
					...current,
					...args,
					_id: id,
					updatedAt: Date.now(),
				},
			});
		},
		[fallback]
	);
}

export function useHybridDeleteGame() {
	const fallback = useMutation(api.minigames.deleteGame);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id game wajib diisi");
			const supabase = createClient();
			await supabase
				.schema("legacy_mirror")
				.from("documents")
				.delete()
				.eq("table_name", "miniGameEntries")
				.eq("document->>gameId", id);
			const { error } = await supabase
				.schema("legacy_mirror")
				.from("documents")
				.delete()
				.eq("table_name", "miniGames")
				.eq("document_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridCreateEntryManually() {
	const fallback = useMutation(api.minigames.createEntryManually);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = makeSourceId("entry");
			await insertMirrorDocument({
				tableName: "miniGameEntries",
				documentId: id,
				document: {
					_id: id,
					gameId: args?.gameId ?? null,
					brandSlug: args?.brandSlug ?? "",
					fullName: args?.fullName ?? null,
					email: args?.email ?? null,
					whatsapp: args?.whatsapp ?? null,
					instagram: args?.instagram ?? null,
					prizeId: args?.prizeId ?? null,
					prizeLabel: args?.prizeLabel ?? null,
					prizeDescription: args?.prizeDescription ?? null,
					voucherCode: args?.voucherCode ?? null,
					spinAngle: args?.spinAngle ?? null,
					contactStatus: args?.contactStatus ?? "new",
					adminNotes: args?.adminNotes ?? null,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
			});
			return id;
		},
		[fallback]
	);
}

export function useHybridUpdateEntry() {
	const fallback = useMutation(api.minigames.updateEntry);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id entry wajib diisi");
			const current = (await getMirrorDocument("miniGameEntries", id)) ?? {};
			await updateMirrorDocument({
				tableName: "miniGameEntries",
				documentId: id,
				document: {
					...current,
					...args,
					_id: id,
					updatedAt: Date.now(),
				},
			});
		},
		[fallback]
	);
}

export function useHybridDeleteEntry() {
	const fallback = useMutation(api.minigames.deleteEntry);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const id = String(args?.id ?? "");
			if (!id) throw new Error("id entry wajib diisi");
			const { error } = await createClient()
				.schema("legacy_mirror")
				.from("documents")
				.delete()
				.eq("table_name", "miniGameEntries")
				.eq("document_id", id);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridSpin() {
	const fallback = useMutation(api.minigames.spin);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const gameId = String(args?.gameId ?? "");
			if (!gameId) throw new Error("gameId wajib diisi");
			const game = await getMirrorDocument("miniGames", gameId);
			if (!game) throw new Error("Mini game tidak ditemukan");
			if (!(game as any).isActive) throw new Error("Mini game tidak aktif");
			const now = Date.now();
			const startAt = Number((game as any).startAt ?? 0);
			const endAt = Number((game as any).endAt ?? 0);
			if (startAt > 0 && now < startAt) throw new Error("Mini game belum dimulai");
			if (endAt > 0 && now > endAt) throw new Error("Mini game sudah berakhir");

			const supabase = createClient();
			const contactQuery = supabase
				.schema("legacy_mirror")
				.from("documents")
				.select("document")
				.eq("table_name", "miniGameEntries")
				.eq("document->>gameId", gameId);
			if (args?.email) {
				contactQuery.eq("document->>email", String(args.email));
			} else if (args?.whatsapp) {
				contactQuery.eq("document->>whatsapp", String(args.whatsapp));
			}
			const { data: previousEntries, error: previousError } = await contactQuery.limit(100);
			if (previousError) throw previousError;
			const priorCount = Array.isArray(previousEntries) ? previousEntries.length : 0;
			if (Boolean((game as any).requireUniqueContact) && priorCount > 0) {
				throw new Error("Kontak ini sudah pernah spin di mini game ini");
			}
			const maxSpins = Math.max(1, Number((game as any).maxSpinsPerContact ?? 1));
			if (priorCount >= maxSpins) throw new Error("Batas spin untuk kontak ini sudah tercapai");

			const allPrizes = Array.isArray((game as any).prizes) ? (game as any).prizes : [];
			const availablePrizes = allPrizes.filter((prize: any) => {
				if (!prize?.isActive) return false;
				if (prize?.stock === undefined || prize?.stock === null) return true;
				const stock = Number(prize.stock ?? 0);
				const claimed = Number(prize.claimedCount ?? 0);
				return claimed < stock;
			});
			if (availablePrizes.length === 0) throw new Error("Hadiah sedang tidak tersedia");

			const weightedPool: any[] = [];
			for (const prize of availablePrizes) {
				const weight = Math.max(1, Number(prize?.weight ?? 1));
				for (let i = 0; i < weight; i += 1) weightedPool.push(prize);
			}
			const winner = weightedPool[Math.floor(Math.random() * weightedPool.length)];
			const spinDurationMs = Math.max(2500, Number((game as any).spinDurationMs ?? 5200));
			const spinAngle = 360 * (4 + Math.floor(Math.random() * 3)) + Math.floor(Math.random() * 360);

			const updatedPrizes = allPrizes.map((prize: any) => {
				if (String(prize?.id ?? "") !== String(winner?.id ?? "")) return prize;
				return {
					...prize,
					claimedCount: Number(prize?.claimedCount ?? 0) + 1,
				};
			});
			await updateMirrorDocument({
				tableName: "miniGames",
				documentId: gameId,
				document: {
					...(game as any),
					prizes: updatedPrizes,
					updatedAt: Date.now(),
				},
			});

			const entryId = makeSourceId("entry");
			await insertMirrorDocument({
				tableName: "miniGameEntries",
				documentId: entryId,
				document: {
					_id: entryId,
					gameId,
					brandSlug: (game as any).brandSlug ?? "",
					fullName: args?.fullName ?? null,
					email: args?.email ?? null,
					whatsapp: args?.whatsapp ?? null,
					instagram: args?.instagram ?? null,
					prizeId: winner?.id ?? null,
					prizeLabel: winner?.label ?? "Hadiah",
					prizeDescription: winner?.description ?? null,
					voucherCode: winner?.voucherCode ?? null,
					spinAngle,
					contactStatus: "new",
					adminNotes: null,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
			});

			return {
				entryId,
				prizeId: winner?.id ?? null,
				prizeLabel: winner?.label ?? "Hadiah",
				prizeDescription: winner?.description ?? undefined,
				voucherCode: winner?.voucherCode ?? undefined,
				spinAngle,
				spinDurationMs,
				thankYouMessage:
					(game as any).thankYouMessage ??
					"Terima kasih sudah bermain. Tim kami akan menghubungi Anda.",
			};
		},
		[fallback]
	);
}

export function useHybridProcessReceipt() {
	const fallback = useAction(api.ai.processReceipt);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const image = String(args?.image ?? "");
			if (!image) throw new Error("image wajib diisi");
			const batch = (await invokeYumiAiAction("bulkScanImageData", {
				images: [image],
			})) as any[];
			const first = Array.isArray(batch) ? batch[0] : null;
			if (!first?.success || !first?.data) {
				throw new Error(first?.error || "Gagal memproses gambar");
			}
			const data = first.data ?? {};
			const mappedItems = Array.isArray(data.items)
				? data.items.map((item: any) => ({
						name: String(item?.name ?? "").trim() || "Item",
						quantity: Number(item?.qty ?? item?.quantity ?? 1) || 1,
						price: Number(item?.price ?? 0) || 0,
				  }))
				: [];
			return {
				type:
					String(data.type ?? data.transactionType ?? "expense").toLowerCase() === "income"
						? "transaction"
						: "expense",
				data: {
					amount: Number(data.total ?? data.amount ?? 0),
					items: mappedItems,
					category: data.category ?? "Lainnya",
					description: data.notes ?? data.name ?? "",
					paymentMethod: data.paymentMethod ?? "cash",
					notes: data.rawText ?? "",
				},
				confidence: Number(data.confidence ?? 0.75),
				rawText: String(data.rawText ?? ""),
			};
		},
		[fallback]
	);
}

export function useHybridProcessImageAndGenerate() {
	const fallback = useAction(api.ai.processImageAndGenerate);
	const processReceipt = useHybridProcessReceipt();
	const createTransaction = useHybridCreateTransaction();
	const createInventoryItem = useHybridCreateInventoryItem();
	const addStock = useHybridAddStock();
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const scan = (await processReceipt({ image: args?.image })) as any;
			const parsedType = String(args?.generateType ?? scan?.type ?? "auto").toLowerCase();
			const normalizedType =
				parsedType === "income" || parsedType === "order" ? "income" : "expense";
			const amount = Number(scan?.data?.amount ?? 0);
			let transactionId: string | null = null;

			if (args?.syncMode !== "none") {
				transactionId = await createTransaction({
					type: normalizedType,
					amount,
					category: scan?.data?.category ?? (normalizedType === "income" ? "Pemasukan" : "Pengeluaran"),
					description: scan?.data?.description ?? "Hasil scan AI",
					paymentMethod: scan?.data?.paymentMethod ?? "cash",
					date: Date.now(),
					status: "completed",
					metadata: {
						source: "ai_receipt_scan",
						scanType: scan?.type ?? "expense",
					},
				});
			}

			if (args?.syncMode === "finance_plus_inventory" && normalizedType === "expense") {
				const items = Array.isArray(scan?.data?.items) ? scan.data.items : [];
				for (const item of items) {
					const ingredientName = String(item?.name ?? "").trim();
					if (!ingredientName) continue;
					const quantity = Number(item?.quantity ?? 0);
					const price = Number(item?.price ?? 0);
					const { data: existing } = await createClient()
						.from("pos_inventory")
						.select("*")
						.ilike("ingredientName", ingredientName)
						.limit(1)
						.maybeSingle();
					let inventoryId = String((existing as any)?._id ?? "");
					if (!inventoryId) {
						inventoryId = await createInventoryItem({
							ingredientName,
							unit: "pcs",
							quantity: 0,
							lowStockThreshold: 1,
						});
					}
					if (quantity > 0) {
						await addStock({
							inventoryId,
							quantity,
							costPerUnit: price > 0 ? price : undefined,
							notes: "Sinkron item dari AI scanner",
						});
					}
				}
			}

			return {
				success: true,
				message: "Scan dan generate berhasil diproses",
				generated: {
					type: normalizedType === "expense" ? "transaction" : "income",
					transactionId,
					amount,
					payload: scan,
				},
			};
		},
		[addStock, createInventoryItem, createTransaction, fallback, processReceipt]
	);
}

export function useHybridBatchProcessReceipts() {
	const fallback = useAction(api.ai.batchProcessReceipts);
	const processReceipt = useHybridProcessReceipt();
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const images = Array.isArray(args?.images) ? args.images : [];
			const results: any[] = [];
			let totalFailed = 0;
			for (const image of images) {
				try {
					results.push(await processReceipt({ image }));
				} catch {
					totalFailed += 1;
					results.push(null);
				}
			}
			return {
				results,
				summary: {
					totalProcessed: images.length - totalFailed,
					totalFailed,
					totalImages: images.length,
				},
			};
		},
		[fallback, processReceipt]
	);
}

export function useHybridBatchGenerateTransactions() {
	const fallback = useAction(api.ai.batchGenerateTransactions);
	const processAndGenerate = useHybridProcessImageAndGenerate();
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const images = Array.isArray(args?.images) ? args.images : [];
			const generated: any[] = [];
			let totalFailed = 0;
			let totalAmount = 0;
			for (const image of images) {
				try {
					const result = await processAndGenerate({
						image,
						generateType: args?.generateType ?? "auto",
						syncMode: args?.syncMode ?? "auto",
					});
					if (result?.generated) {
						generated.push(result.generated);
						totalAmount += Number(result.generated.amount ?? 0);
					}
				} catch {
					totalFailed += 1;
				}
			}
			return {
				generated,
				summary: {
					totalGenerated: generated.length,
					totalFailed,
					totalAmount,
				},
			};
		},
		[fallback, processAndGenerate]
	);
}

export function useHybridGenerateScanReport() {
	const fallback = useAction(api.ai.generateScanReport);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const period = String(args?.period ?? "daily") as "daily" | "weekly" | "monthly";
			const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
			const start = Date.now() - days * 24 * 60 * 60 * 1000;
			const { data, error } = await createClient()
				.from("pos_financial_transactions")
				.select("*")
				.gte("date", start)
				.order("date", { ascending: false });
			if (error) throw error;
			const expenseRows = (data ?? []).filter((row: any) => String(row.type) === "expense");
			const totalExpense = expenseRows.reduce(
				(sum: number, row: any) => sum + Number(row.amount ?? 0),
				0
			);
			const txCount = expenseRows.length;
			const byCategory = new Map<string, number>();
			for (const row of expenseRows) {
				const key = String(row.category ?? "lainnya").toLowerCase();
				byCategory.set(key, (byCategory.get(key) ?? 0) + Number(row.amount ?? 0));
			}
			const topCategories = Array.from(byCategory.entries())
				.map(([category, total]) => ({
					category,
					total,
					percentage: totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0,
				}))
				.sort((a, b) => b.total - a.total)
				.slice(0, 5);
			return {
				period,
				summary: {
					totalExpense,
					transactionCount: txCount,
					avgPerTransaction: txCount > 0 ? totalExpense / txCount : 0,
				},
				topCategories,
			};
		},
		[fallback]
	);
}

export function useHybridGenerateDiscountStrategy() {
	const fallback = useAction(api.ai.generateDiscountStrategy);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const prompt = [
				"Kamu adalah analis promo F&B Indonesia.",
				"Susun strategi diskon yang actionable, singkat, dan spesifik.",
				"Data ringkas penjualan: ",
				String(args?.salesSummary ?? "[]"),
				"Diskon yang sudah ada:",
				String(args?.existingDiscounts ?? "[]"),
			].join("\n");
			const response = (await invokeYumiAiAction("yumiChat", {
				message: prompt,
				history: [],
				contextHint: "Berikan rekomendasi diskon dalam poin-poin markdown.",
			})) as any;
			return String(response?.content ?? "").trim();
		},
		[fallback]
	);
}


export function useHybridGenerateProductDescription() {
	const fallback = useAction(api.ai.generateProductDescription);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const prompt = `Buat deskripsi menu restoran dalam Bahasa Indonesia.
Nama produk: ${String(args?.productName ?? "Produk")}
Kategori: ${String(args?.category ?? "Menu")}
Harga: ${Number(args?.price ?? 0)}
Panjang maksimal 2 kalimat, tone menarik dan mudah dipahami.`;
			const response = (await invokeYumiAiAction("yumiChat", {
				message: prompt,
				history: [],
			})) as any;
			return String(response?.content ?? "").trim();
		},
		[fallback]
	);
}

export function useHybridYumiChat() {
	return useCallback(
		async (args: {
			sessionId?: string;
			message: string;
			history?: Array<{ role: string; content: string }>;
			images?: string[];
			contextHint?: string;
		}) => {
			const supabase = createClient();
			const { data, error } = await supabase.functions.invoke("yumi-ai", {
				body: { action: "yumiChat", ...args },
			});
			if (error) throw new Error(error.message || "Gagal menghubungi AI");
			if (data?.error) throw new Error(data.error);
			return data as { content: string; toolCalls: unknown[] };
		},
		[]
	);
}

export function useHybridBulkScanImageData() {
	return useCallback(async (args: { images: string[] }) => {
		const supabase = createClient();
		const { data, error } = await supabase.functions.invoke("yumi-ai", {
			body: { action: "bulkScanImageData", ...args },
		});
		if (error) throw new Error(error.message || "Gagal menganalisis gambar");
		if (data?.error) throw new Error(data.error);
		return data;
	}, []);
}

export function useHybridGenerateBusinessBriefing() {
	return useCallback(
		async (args: { localHour: number; context?: string }) => {
			const supabase = createClient();
			const { data, error } = await supabase.functions.invoke("yumi-ai", {
				body: { action: "generateBusinessBriefing", ...args },
			});
			if (error) throw new Error(error.message || "Gagal membuat briefing");
			if (data?.error) throw new Error(data.error);
			return data as { content: string };
		},
		[]
	);
}

export function useHybridCreateChatSession() {
	const fallback = useMutation(api.aiMemory.createChatSession);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const sessionId = makeSourceId("chat");
			await insertMirrorDocument({
				tableName: "conversationMemory",
				documentId: makeSourceId("memory"),
				document: {
					sessionId,
					role: "system",
					content: String(args?.title ?? "Percakapan Baru"),
					metadata: {
						kind: "session_bootstrap",
					},
					timestamp: Date.now(),
				},
			});
			return { sessionId };
		},
		[fallback]
	);
}

export function useHybridDeleteChatSession() {
	const fallback = useMutation(api.aiMemory.deleteChatSession);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const sessionId = String(args?.sessionId ?? "");
			if (!sessionId) throw new Error("sessionId wajib diisi");
			const { error } = await createClient()
				.schema("legacy_mirror")
				.from("documents")
				.delete()
				.eq("table_name", "conversationMemory")
				.eq("document->>sessionId", sessionId);
			if (error) throw error;
		},
		[fallback]
	);
}

export function useHybridSaveConversationContext() {
	const fallback = useMutation(api.aiMemory.saveConversationContext);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const sessionId = String(args?.sessionId ?? "").trim() || "default";
			const role = String(args?.role ?? "user").trim() || "user";
			const content = String(args?.content ?? "").trim();
			if (!content) return;
			await insertMirrorDocument({
				tableName: "conversationMemory",
				documentId: makeSourceId("memory"),
				document: {
					sessionId,
					role,
					content,
					metadata: args?.metadata ?? {},
					timestamp: Date.now(),
				},
			});
			return { ok: true };
		},
		[fallback]
	);
}

export function useHybridCompleteTask() {
	const fallback = useMutation(api.aiMemory.completeTask);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const taskId = String(args?.taskId ?? "");
			if (!taskId) throw new Error("taskId wajib diisi");
			const doc = await getMirrorDocument("followUpTasks", taskId);
			if (!doc) throw new Error("Task tidak ditemukan");
			await updateMirrorDocument({
				tableName: "followUpTasks",
				documentId: taskId,
				document: {
					...(doc as any),
					status: "completed",
					completedAt: Date.now(),
					completedBy: (args?.completedBy as string | undefined) ?? "system",
				},
			});
			return { ok: true };
		},
		[fallback]
	);
}

export function useHybridDismissTask() {
	const fallback = useMutation(api.aiMemory.dismissTask);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			const taskId = String(args?.taskId ?? "");
			if (!taskId) throw new Error("taskId wajib diisi");
			const doc = await getMirrorDocument("followUpTasks", taskId);
			if (!doc) throw new Error("Task tidak ditemukan");
			await updateMirrorDocument({
				tableName: "followUpTasks",
				documentId: taskId,
				document: {
					...(doc as any),
					status: "dismissed",
					dismissalReason: args?.reason ?? "manual_dismiss",
					completedAt: Date.now(),
				},
			});
			return { ok: true };
		},
		[fallback]
	);
}

export function useHybridRecordStockPurchase() {
	const fallback = useMutation(api.stockPurchases.recordStockPurchase);
	const addStock = useHybridAddStock();
	const createTransaction = useHybridCreateTransaction();
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			await addStock({
				inventoryId: args?.inventoryId,
				quantity: Number(args?.quantity ?? 0),
				costPerUnit: args?.costPerUnit,
				notes: args?.notes ?? "Pembelian stok",
				brandName: args?.brandName,
				storeId: args?.storeId,
				purchaseUnit: args?.purchaseUnit,
				purchaseQuantity: args?.purchaseQuantity,
				lineTotal: args?.lineTotal,
			});
			const totalAmount =
				args?.lineTotal !== undefined
					? Number(args.lineTotal ?? 0)
					: Number(args?.quantity ?? 0) * Number(args?.costPerUnit ?? 0);
			if (totalAmount > 0) {
				await createTransaction({
					type: "expense",
					amount: totalAmount,
					category: args?.category ?? "Stok Bahan",
					merchant: args?.merchant ?? args?.storeName ?? null,
					description: args?.notes ?? "Pembelian stok",
					paymentMethod: args?.paymentMethod ?? "cash",
					date: Number(args?.date ?? Date.now()),
					status: "completed",
					metadata: {
						source: "inventory_stock_purchase",
						inventoryId: args?.inventoryId ?? null,
					},
				});
			}
			return { ok: true };
		},
		[addStock, createTransaction, fallback]
	);
}

export function useHybridCreateOrder() {
	const fallback = useMutation(api.orders.createOrder);
	const { user: currentUser } = useYumiAuth();
	const deductInventory = useHybridDeductOrderInventory();
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}

			try {
				const supabase = createClient();
				const pos = supabase.schema("pos");

			const orderCreatedAt = Number(args?.createdAt ?? Date.now());
			const isOpenBill = Boolean(args?.isOpenBill);
			const autoComplete = Boolean(args?.autoComplete);
			const nextStatus = isOpenBill
				? "pending"
				: autoComplete
					? "completed"
					: "paid";

			// Daily receipt numbering
			const kind = args?.source === "pos"
				? (args?.orderType === "takeaway" ? "takeaway" : "dine_in")
				: "online";
			let dailyReceiptNo = null;
			try {
				const { data: rpcData, error: rpcErr } = await supabase.rpc(
					"next_daily_receipt_no",
					{ p_order_kind: kind }
				);
				if (!rpcErr && rpcData != null) dailyReceiptNo = rpcData;
			} catch (_) {} // best-effort

			const orderNumber = generateOrderNumber({
				source: args?.source,
				orderType: args?.orderType,
				createdAt: orderCreatedAt,
				customerName: args?.customerName || undefined,
				receiptNo: dailyReceiptNo ?? undefined,
			});
				const orderId = makeSourceId("order");

				const orderRow = {
					source_id: orderId,
					order_number: orderNumber,
					total_amount: Number(args?.totalAmount ?? 0),
					status: nextStatus,
					payment_method: args?.paymentMethod ?? null,
					customer_name: args?.customerName ?? null,
					table_number: args?.tableNumber ?? null,
					order_type: args?.orderType ?? null,
					source: args?.source ?? null,
					brand_slug: args?.brandSlug ?? null,
					guest_count:
						args?.guestCount === undefined ? null : Number(args.guestCount ?? 0),
					free_refill_selected:
						args?.freeRefillSelected === undefined
							? null
							: Boolean(args.freeRefillSelected),
					dessert_later:
						args?.dessertLater === undefined ? null : Boolean(args.dessertLater),
					notes: args?.notes ?? null,
					created_at: orderCreatedAt,
					voucher_source_id: args?.voucherId ?? null,
					discount_amount:
						args?.discountAmount === undefined
							? null
							: Number(args.discountAmount ?? 0),
					tax_amount:
						args?.taxAmount === undefined ? null : Number(args.taxAmount ?? 0),
					service_charge_amount:
						args?.serviceChargeAmount === undefined
							? null
							: Number(args.serviceChargeAmount ?? 0),
					receipt_meta: args?.receiptMeta ?? null,
					payment_receipt_kind: args?.paymentReceiptKind ?? null,
					daily_receipt_no: dailyReceiptNo,
					receipt_kind: kind,
					payment_gateway: args?.paymentGateway ?? null,
					gateway_invoice_id: args?.paymentGateway?.invoiceId ?? null,
					creation_time: orderCreatedAt,
					raw: { ...(args ?? {}), authUserId: currentUser?._id ?? null },
				};

				const { error: orderError } = await pos.from("orders").insert(orderRow);
				if (orderError) throw orderError;

				const orderItems = Array.isArray(args?.items)
					? args.items.map((item: any, index: number) => ({
							order_source_id: orderId,
							line_no: index + 1,
							product_source_id: item?.productId ?? null,
							product_name: item?.productName ?? null,
							variant: item?.variant ?? null,
							quantity: Number(item?.quantity ?? 0),
							price: Number(item?.price ?? 0),
						original_price:
							item?.originalPrice === undefined
								? null
								: Number(item.originalPrice ?? 0),
							status: item?.status ?? null,
							hpp_snapshot: item?.hppSnapshot ?? null,
							raw: item ?? {},
					  }))
					: [];

				if (orderItems.length > 0) {
					const { error: itemsError } = await pos.from("order_items").insert(orderItems);
					if (itemsError) throw itemsError;
				}

\t\t\t\tif (!isOpenBill) {
					const financialRow = {
						source_id: makeSourceId("fin"),
						tx_type: "income",
						amount: Number(args?.totalAmount ?? 0),
						category: "Penjualan",
						description: `Penjualan Pesanan #${orderNumber}`,
						merchant: args?.customerName ?? null,
						tx_date: orderCreatedAt,
						payment_method: args?.paymentMethod ?? null,
						status: "completed",
						order_source_id: orderId,
						creation_time: Date.now(),
						metadata: {
							dailyReceiptNo: dailyReceiptNo ?? undefined,
							orderNumber,
							source: "pos",
						},
						raw: {
							kind: "order_settlement",
							orderId,
						},
					};
					const { error: financialError } = await pos
						.from("financial_transactions")
						.insert(financialRow);
					if (financialError) throw financialError;
				}

				// Auto-deduct inventory untuk order completed (direct create)
				if (nextStatus === "completed" || nextStatus === "paid") {
					try {
						const result = await deductInventory({
							orderId,
							orderNumber,
						});
						console.log(
							`[create-order-deduct] Order #${orderNumber}: ${result.deductedCount} deducted, ${result.skippedCount} skipped`
						);
						if (result.lowStockWarnings?.length) {
							console.warn("[create-order-deduct] Menu stock warnings:", result.lowStockWarnings.join("; "));
						}
						if (result.inventoryWarnings?.length) {
							console.warn("[create-order-deduct] Inventory restock needed:", result.inventoryWarnings.join("; "));
						}
					} catch (deductError) {
						// Jangan throw — deduct gagal tidak boleh batalkan order
						console.error("[create-order-deduct] Failed:", deductError);
					}
				}

				return orderId;
			} catch (error) {
				console.error("[supabase-hybrid:write-create-order] fallback disabled", error);
				throw error;
			}
		},
		[fallback, deductInventory]
	);
}

export function useHybridUpdateOrder() {
	const fallback = useMutation(api.orders.updateOrder);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}

			try {
				const id = args?.id as string | undefined;
				if (!id) {
					throw new Error("Order id is required");
				}

				const updates: Record<string, unknown> = {};
				if (args.customerName !== undefined) {
					updates.customer_name = args.customerName ?? null;
				}
				if (args.paymentMethod !== undefined) {
					updates.payment_method = args.paymentMethod ?? null;
				}
				if (args.status !== undefined) {
					updates.status = args.status ?? null;
				}
				if (args.notes !== undefined) {
					updates.notes = args.notes ?? null;
				}
				if (args.orderType !== undefined) {
					updates.order_type = args.orderType ?? null;
				}
				if (args.tableNumber !== undefined) {
					updates.table_number = args.tableNumber ?? null;
				}

				if (Object.keys(updates).length === 0) {
					return;
				}

				const supabase = createClient();

				// Jika status berubah ke paid/completed, buat financial transaction
				const newStatus = updates.status as string | null;
				if (newStatus === "paid" || newStatus === "completed") {
					const { data: order, error: getError } = await supabase
						.schema("pos")
						.from("orders")
\t\t\t\t\t\t.select("source_id, status, order_number, total_amount, payment_method, created_at, daily_receipt_no")
						.eq("source_id", id)
						.maybeSingle();
					if (getError) throw getError;
					if (!order) throw new Error("Order not found");

					const wasPaid =
						order.status === "paid" || order.status === "completed";
					if (!wasPaid) {
						const txDate = Number(args?.date ?? order.created_at ?? Date.now());
						const { error: txError } = await supabase
							.schema("pos")
							.from("financial_transactions")
							.insert({
								source_id: makeSourceId("fin"),
								tx_type: "income",
								amount: Number(order.total_amount ?? 0),
								category: "Penjualan",
								description: `Penjualan Pesanan #${order.order_number ?? "-"}`,
								tx_date: txDate,
								payment_method: order.payment_method ?? null,
								status: "completed",
								order_source_id: id,
								creation_time: Date.now(),
								metadata: {
									dailyReceiptNo: (order as any).daily_receipt_no ?? undefined,
									orderNumber: order.order_number ?? undefined,
									source: "pos",
								},
								raw: {
									kind: "order_settlement_update_order",
									orderId: id,
								},
							});
						if (txError) throw txError;
					}
				}

				const { error } = await supabase
					.schema("pos")
					.from("orders")
					.update(updates)
					.eq("source_id", id);
				if (error) throw error;
				return;
			} catch (error) {
				console.error("[supabase-hybrid:write-update-order] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridDeleteOrder() {
	const fallback = useMutation(api.orders.deleteOrder);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const id = args?.id as string | undefined;
				if (!id) {
					throw new Error("Order id is required");
				}
				const supabase = createClient();
				const pos = supabase.schema("pos");

				const { error: txError } = await pos
					.from("financial_transactions")
					.delete()
					.eq("order_source_id", id);
				if (txError) throw txError;

				const { error: itemsError } = await pos
					.from("order_items")
					.delete()
					.eq("order_source_id", id);
				if (itemsError) throw itemsError;

				const { error: orderError } = await pos
					.from("orders")
					.delete()
					.eq("source_id", id);
				if (orderError) throw orderError;

				return;
			} catch (error) {
				console.error("[supabase-hybrid:write-delete-order] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUpdateOrderStatus() {
	const fallback = useMutation(api.orders.updateOrderStatus);
	const deductInventory = useHybridDeductOrderInventory();

	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const id = args?.id as string | undefined;
				const status = args?.status as
					| "pending"
					| "paid"
					| "completed"
					| "cancelled"
					| undefined;
				if (!id || !status) {
					throw new Error("Order id and status are required");
				}

				const supabase = createClient();
				const pos = supabase.schema("pos");

				const { data: order, error: getError } = await pos
					.from("orders")
\t\t\t\t\t\t.select(
						"source_id, status, order_number, total_amount, payment_method, created_at, daily_receipt_no"
					)
					.eq("source_id", id)
					.maybeSingle();
				if (getError) throw getError;
				if (!order) throw new Error("Order not found");

				const isNowPaid = status === "paid" || status === "completed";
				const wasPaid =
					order.status === "paid" || order.status === "completed";
				if (isNowPaid && !wasPaid) {
					const transactionDate = Number(
						args?.transactionDate ?? order.created_at ?? Date.now()
					);
					const { error: txError } = await pos
						.from("financial_transactions")
						.insert({
							source_id: makeSourceId("fin"),
							tx_type: "income",
							amount: Number(order.total_amount ?? 0),
							category: "Penjualan",
							description: `Penjualan Pesanan #${order.order_number ?? "-"}`,
							tx_date: transactionDate,
							payment_method: order.payment_method ?? null,
							status: "completed",
							order_source_id: id,
							creation_time: Date.now(),
							metadata: {
								dailyReceiptNo: (order as any).daily_receipt_no ?? undefined,
								orderNumber: order.order_number ?? undefined,
								source: "pos",
							},
							raw: {
								kind: "order_settlement_status_update",
								orderId: id,
							},
						});
					if (txError) throw txError;
				}

				const { error: updateError } = await pos
					.from("orders")
					.update({ status })
					.eq("source_id", id);
				if (updateError) throw updateError;

				// Auto-deduct inventory saat order completed
				if (status === "completed") {
					try {
					const result = await deductInventory({
							orderId: id,
							orderNumber: String(order.order_number ?? ""),
						});
						console.log(
							`[auto-deduct] Order #${order.order_number}: ${result.deductedCount} deducted, ${result.skippedCount} skipped`
						);
						if (result.lowStockWarnings?.length) {
							console.warn("[auto-deduct] Menu stock warnings:", result.lowStockWarnings.join("; "));
						}
						if (result.inventoryWarnings?.length) {
							console.warn("[auto-deduct] Inventory restock needed:", result.inventoryWarnings.join("; "));
						}
					} catch (deductError) {
						// Jangan throw — deduct gagal tidak boleh batalkan order
						console.error("[auto-deduct] Failed:", deductError);
					}
				}

				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-update-order-status]",
					error
				);
				throw error;
			}
		},
		[fallback, deductInventory]
	);
}

export function useHybridUpdateOrderPaymentGateway() {
	const fallback = useMutation(api.orders.updateOrderPaymentGateway);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const id = args?.id as string | undefined;
				const paymentGateway = args?.paymentGateway as
					| { status?: string; invoiceId?: string; paidAt?: number }
					| undefined;
				if (!id || !paymentGateway) {
					throw new Error("Order id and paymentGateway are required");
				}

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const { data: order, error: getError } = await pos
					.from("orders")
\t\t\t\t\t.select(
						"source_id, status, order_number, total_amount, payment_method, payment_receipt_kind, daily_receipt_no"
					)
					.eq("source_id", id)
					.maybeSingle();
				if (getError) throw getError;
				if (!order) throw new Error("Order not found");

				const nextStatus =
					paymentGateway.status === "cancelled"
						? "cancelled"
						: paymentGateway.status === "paid"
							? "paid"
							: order.status;
				const wasPaid =
					order.status === "paid" || order.status === "completed";
				if (paymentGateway.status === "paid" && !wasPaid) {
					const settledAt = Number(paymentGateway.paidAt ?? Date.now());
					const { error: txError } = await pos
						.from("financial_transactions")
						.insert({
							source_id: makeSourceId("fin"),
							tx_type: "income",
							amount: Number(order.total_amount ?? 0),
							category: "Penjualan",
							description: `Penjualan Pesanan #${order.order_number ?? "-"}`,
							tx_date: settledAt,
							payment_method: order.payment_method ?? null,
							status: "completed",
							order_source_id: id,
							creation_time: Date.now(),
							metadata: {
								dailyReceiptNo: (order as any).daily_receipt_no ?? undefined,
								orderNumber: order.order_number ?? undefined,
								source: "pos",
							},
							raw: {
								kind: "order_gateway_paid",
								orderId: id,
							},
						});
					if (txError) throw txError;
				}

				const patch: Record<string, unknown> = {
					payment_gateway: paymentGateway,
					status: nextStatus,
					gateway_invoice_id: paymentGateway.invoiceId ?? null,
					payment_receipt_kind:
						args?.paymentReceiptKind ?? order.payment_receipt_kind ?? null,
				};
				const { error: patchError } = await pos
					.from("orders")
					.update(patch)
					.eq("source_id", id);
				if (patchError) throw patchError;
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-update-order-payment-gateway]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridCreateBookingOrder() {
	const fallback = useMutation(api.booking.createBookingOrder);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const supabase = createClient();
				const pos = supabase.schema("pos");
				const slug = String(args?.slug ?? "");
				const bookingDate = String(args?.bookingDate ?? "");
				const guestCount = Number(args?.guestCount ?? 0);
				if (!slug || !bookingDate) {
					throw new Error("slug and bookingDate are required");
				}

				const { data: capacity, error: capError } = await pos
					.from("booking_date_capacity")
					.select("source_id, max_people, max_tables, people_per_table")
					.eq("slug", slug)
					.eq("booking_date", bookingDate)
					.maybeSingle();
				if (capError) throw capError;

				const peoplePerTable = Number(capacity?.people_per_table ?? 4);
				const tableCount = Math.ceil(guestCount / peoplePerTable);

				if (capacity) {
					const { data: existingRows, error: existingError } = await pos
						.from("booking_orders")
						.select("guest_count, table_count, booking_status")
						.eq("slug", slug)
						.eq("booking_date", bookingDate);
					if (existingError) throw existingError;

					const activeOrders = (existingRows ?? []).filter(
						(row: any) => row.booking_status !== "cancelled"
					);
					const totalBookedPeople = activeOrders.reduce(
						(sum: number, row: any) => sum + Number(row.guest_count ?? 0),
						0
					);
					const totalBookedTables = activeOrders.reduce(
						(sum: number, row: any) => sum + Number(row.table_count ?? 0),
						0
					);

					if (
						Number(capacity.max_people ?? 0) > 0 &&
						totalBookedPeople + guestCount > Number(capacity.max_people)
					) {
						throw new Error("Kapasitas orang untuk tanggal ini sudah habis");
					}
					if (
						Number(capacity.max_tables ?? 0) > 0 &&
						totalBookedTables + tableCount > Number(capacity.max_tables)
					) {
						throw new Error("Kapasitas meja untuk tanggal ini sudah habis");
					}
				}

				const timestamp = Date.now();
				const bookingCode = generateBookingCode(timestamp);
				const bookingId = makeSourceId("booking");
				const bookingRow = {
					source_id: bookingId,
					slug,
					booking_code: bookingCode,
					customer_name: args?.customerName ?? "",
					customer_phone: args?.customerPhone ?? "",
					customer_email: args?.customerEmail ?? "",
					notes: args?.notes ?? null,
					booking_date: bookingDate,
					total_amount: Number(args?.totalAmount ?? 0),
					payment_method: args?.paymentMethod ?? null,
					payment_status: "pending",
					booking_status: "pending",
					guest_count: guestCount,
					table_count: tableCount,
					custom_answers: args?.customAnswers ?? null,
					created_at: timestamp,
					creation_time: timestamp,
					raw: args ?? {},
				};
				const { error: bookingError } = await pos
					.from("booking_orders")
					.insert(bookingRow);
				if (bookingError) throw bookingError;

				const bookingItems = Array.isArray(args?.items)
					? args.items.map((item: any, index: number) => ({
							booking_order_source_id: bookingId,
							line_no: index + 1,
							product_source_id: item?.productId ?? null,
							product_name: item?.name ?? null,
							price: Number(item?.price ?? 0),
							quantity: Number(item?.quantity ?? 0),
							raw: item ?? {},
					  }))
					: [];
				if (bookingItems.length > 0) {
					const { error: itemsError } = await pos
						.from("booking_order_items")
						.insert(bookingItems);
					if (itemsError) throw itemsError;
				}

				return bookingId;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-create-booking-order]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUpdateBookingStatus() {
	const fallback = useMutation(api.booking.updateBookingStatus);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const id = args?.id as string | undefined;
				if (!id) {
					throw new Error("Booking id is required");
				}

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const { data: booking, error: getError } = await pos
					.from("booking_orders")
					.select(
						"source_id, payment_status, total_amount, booking_code, customer_name, booking_date, payment_method"
					)
					.eq("source_id", id)
					.maybeSingle();
				if (getError) throw getError;
				if (!booking) throw new Error("Booking not found");

				if (args?.paymentStatus === "paid" && booking.payment_status !== "paid") {
					const { error: txError } = await pos
						.from("financial_transactions")
						.insert({
							source_id: makeSourceId("fin"),
							tx_type: "income",
							amount: Number(booking.total_amount ?? 0),
							category: "Booking",
							description: `Booking #${booking.booking_code} - ${booking.customer_name} (${booking.booking_date})`,
							tx_date: Number(args?.paymentDate ?? Date.now()),
							payment_method: booking.payment_method ?? null,
							status: "completed",
							booking_order_source_id: id,
							creation_time: Date.now(),
							raw: {
								kind: "booking_payment_confirmation",
								bookingOrderId: id,
							},
						});
					if (txError) throw txError;
				}

				const updates: Record<string, unknown> = {};
				if (args?.bookingStatus !== undefined) {
					updates.booking_status = args.bookingStatus ?? null;
				}
				if (args?.paymentStatus !== undefined) {
					updates.payment_status = args.paymentStatus ?? null;
				}
				if (Object.keys(updates).length === 0) {
					return;
				}

				const { error: updateError } = await pos
					.from("booking_orders")
					.update(updates)
					.eq("source_id", id);
				if (updateError) throw updateError;
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-update-booking-status]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridPatchBookingOrder() {
	const fallback = useMutation(api.booking.patchBookingOrder);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const id = args?.id as string | undefined;
				if (!id) {
					throw new Error("Booking id is required");
				}

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const { data: currentBooking, error: currentError } = await pos
					.from("booking_orders")
					.select(
						"source_id, slug, booking_code, customer_name, booking_date, total_amount, payment_status"
					)
					.eq("source_id", id)
					.maybeSingle();
				if (currentError) throw currentError;
				if (!currentBooking) throw new Error("Booking not found");

				const updates: Record<string, unknown> = {};
				if (args?.customerName !== undefined) {
					updates.customer_name = args.customerName ?? null;
				}
				if (args?.customerPhone !== undefined) {
					updates.customer_phone = args.customerPhone ?? null;
				}
				if (args?.customerEmail !== undefined) {
					updates.customer_email = args.customerEmail ?? null;
				}
				if (args?.notes !== undefined) {
					updates.notes = args.notes ?? null;
				}
				if (args?.bookingDate !== undefined) {
					updates.booking_date = args.bookingDate ?? null;
				}
				if (args?.guestCount !== undefined) {
					updates.guest_count = Number(args.guestCount ?? 0);
				}
				if (args?.totalAmount !== undefined) {
					updates.total_amount = Number(args.totalAmount ?? 0);
				}
				if (args?.paymentMethod !== undefined) {
					updates.payment_method = args.paymentMethod ?? null;
				}

				if (args?.guestCount !== undefined) {
					const nextDate = String(
						args?.bookingDate ?? currentBooking.booking_date ?? ""
					);
					const { data: capacity, error: capError } = await pos
						.from("booking_date_capacity")
						.select("people_per_table")
						.eq("slug", currentBooking.slug)
						.eq("booking_date", nextDate)
						.maybeSingle();
					if (capError) throw capError;
					const peoplePerTable = Number(capacity?.people_per_table ?? 4);
					updates.table_count = Math.ceil(
						Number(args.guestCount ?? 0) / Math.max(1, peoplePerTable)
					);
				}

				if (Object.keys(updates).length > 0) {
					const { error: patchError } = await pos
						.from("booking_orders")
						.update(updates)
						.eq("source_id", id);
					if (patchError) throw patchError;
				}

				if (Array.isArray(args?.items)) {
					const { error: deleteItemsError } = await pos
						.from("booking_order_items")
						.delete()
						.eq("booking_order_source_id", id);
					if (deleteItemsError) throw deleteItemsError;

					if (args.items.length > 0) {
						const mappedItems = args.items.map((item: any, index: number) => ({
							booking_order_source_id: id,
							line_no: index + 1,
							product_source_id: item?.productId ?? null,
							product_name: item?.name ?? null,
							price: Number(item?.price ?? 0),
							quantity: Number(item?.quantity ?? 0),
							raw: item ?? {},
						}));
						const { error: insertItemsError } = await pos
							.from("booking_order_items")
							.insert(mappedItems);
						if (insertItemsError) throw insertItemsError;
					}
				}

				if (
					args?.totalAmount !== undefined ||
					args?.customerName !== undefined ||
					args?.bookingDate !== undefined
				) {
					const nextCustomerName =
						args?.customerName ?? currentBooking.customer_name ?? "";
					const nextBookingDate =
						args?.bookingDate ?? currentBooking.booking_date ?? "";
					const txUpdates: Record<string, unknown> = {};
					if (args?.totalAmount !== undefined) {
						txUpdates.amount = Number(args.totalAmount ?? 0);
					}
					if (
						args?.customerName !== undefined ||
						args?.bookingDate !== undefined
					) {
						txUpdates.description = `Booking #${currentBooking.booking_code} - ${nextCustomerName} (${nextBookingDate})`;
					}
					if (Object.keys(txUpdates).length > 0) {
						const { error: txPatchError } = await pos
							.from("financial_transactions")
							.update(txUpdates)
							.eq("booking_order_source_id", id);
						if (txPatchError) throw txPatchError;
					}
				}

				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-patch-booking-order]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridDeleteBookingOrder() {
	const fallback = useMutation(api.booking.deleteBookingOrder);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const id = args?.id as string | undefined;
				if (!id) {
					throw new Error("Booking id is required");
				}

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const { error: txError } = await pos
					.from("financial_transactions")
					.delete()
					.eq("booking_order_source_id", id);
				if (txError) throw txError;

				const { error: itemsError } = await pos
					.from("booking_order_items")
					.delete()
					.eq("booking_order_source_id", id);
				if (itemsError) throw itemsError;

				const { error: bookingError } = await pos
					.from("booking_orders")
					.delete()
					.eq("source_id", id);
				if (bookingError) throw bookingError;
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-delete-booking-order]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUploadBookingPaymentProof() {
	const fallback = useMutation(api.booking.uploadPaymentProof);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = String(args?.id ?? "");
				if (!id) throw new Error("Booking id is required");
				const storageId = String(args?.storageId ?? "");
				if (!storageId) throw new Error("storageId is required");
				const transferredAmount =
					args?.transferredAmount === undefined
						? undefined
						: Number(args.transferredAmount ?? 0);

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const { data: booking, error: bookingError } = await pos
					.from("booking_orders")
					.select(
						"source_id,payment_status,total_amount,booking_code,customer_name,booking_date,payment_method"
					)
					.eq("source_id", id)
					.maybeSingle();
				if (bookingError) throw bookingError;
				if (!booking) throw new Error("Booking not found");

				if (booking.payment_status !== "paid") {
					const { error: txError } = await pos
						.from("financial_transactions")
						.insert({
							source_id: makeSourceId("fin"),
							tx_type: "income",
							amount:
								transferredAmount === undefined
									? Number(booking.total_amount ?? 0)
									: transferredAmount,
							category: "Booking",
							description: `Booking #${booking.booking_code} - ${booking.customer_name} (QRIS/Transfer)`,
							tx_date: Date.now(),
							payment_method: booking.payment_method ?? null,
							status: "completed",
							booking_order_source_id: id,
							creation_time: Date.now(),
							raw: {
								kind: "booking_payment_proof",
								bookingOrderId: id,
							},
						});
					if (txError) throw txError;
				}

				const { error: patchError } = await pos
					.from("booking_orders")
					.update({
						payment_proof_image: storageId,
						transferred_amount:
							transferredAmount === undefined ? null : transferredAmount,
						payment_status: "paid",
					})
					.eq("source_id", id);
				if (patchError) throw patchError;
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-upload-booking-payment-proof]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridGenerateBookingUploadUrl() {
	return useHybridStorageUpload(api.booking.generateUploadUrl, "booking-proofs");
}

export function useHybridUpdateBookingSettings() {
	const fallback = useMutation(api.booking.updateSettings);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const slug = String(args?.slug ?? "");
				if (!slug) {
					throw new Error("slug is required");
				}
				const supabase = createClient();
				const pos = supabase.schema("pos");
				const { data: existing, error: existingError } = await pos
					.from("booking_settings")
					.select("source_id")
					.eq("slug", slug)
					.maybeSingle();
				if (existingError) throw existingError;

				const row = {
					slug,
					title: args?.title ?? "",
					description: args?.description ?? null,
					logo_url: args?.logoUrl ?? null,
					banner_url: args?.bannerUrl ?? null,
					theme_color: args?.themeColor ?? null,
					social_links: args?.socialLinks ?? null,
					featured_product_ids: args?.featuredProductIds ?? null,
					payment_methods: args?.paymentMethods ?? null,
					bank_details: args?.bankDetails ?? null,
					qris_image: args?.qrisImage ?? null,
					is_active: Boolean(args?.isActive),
					custom_fields: args?.customFields ?? null,
					raw: args ?? {},
				};

				if (existing?.source_id) {
					const { error: updateError } = await pos
						.from("booking_settings")
						.update(row)
						.eq("source_id", existing.source_id);
					if (updateError) throw updateError;
					return existing.source_id;
				}

				const sourceId = makeSourceId("booking_settings");
				const { error: insertError } = await pos
					.from("booking_settings")
					.insert({
						source_id: sourceId,
						creation_time: Date.now(),
						...row,
					});
				if (insertError) throw insertError;
				return sourceId;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-update-booking-settings]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridSetBookingDateCapacity() {
	const fallback = useMutation(api.booking.setDateCapacity);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const slug = String(args?.slug ?? "");
				const date = String(args?.date ?? "");
				if (!slug || !date) {
					throw new Error("slug and date are required");
				}

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const row = {
					slug,
					booking_date: date,
					max_people: Number(args?.maxPeople ?? 0),
					max_tables: Number(args?.maxTables ?? 0),
					people_per_table: Number(args?.peoplePerTable ?? 4),
					notes: args?.notes ?? null,
					raw: args ?? {},
				};

				const { data: existing, error: existingError } = await pos
					.from("booking_date_capacity")
					.select("source_id")
					.eq("slug", slug)
					.eq("booking_date", date)
					.maybeSingle();
				if (existingError) throw existingError;

				if (existing?.source_id) {
					const { error: updateError } = await pos
						.from("booking_date_capacity")
						.update(row)
						.eq("source_id", existing.source_id);
					if (updateError) throw updateError;
					return;
				}

				const { error: insertError } = await pos
					.from("booking_date_capacity")
					.insert({
						source_id: makeSourceId("booking_cap"),
						creation_time: Date.now(),
						...row,
					});
				if (insertError) throw insertError;
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-set-booking-date-capacity]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridSetBookingBulkDateCapacity() {
	const fallback = useMutation(api.booking.setBulkDateCapacity);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const slug = String(args?.slug ?? "");
				const startDate = new Date(String(args?.startDate ?? ""));
				const endDate = new Date(String(args?.endDate ?? ""));
				if (!slug || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
					throw new Error("slug, startDate, and endDate are required");
				}

				const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
				const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
				if (diffDays > 366) {
					throw new Error("Date range cannot exceed 1 year");
				}

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const currentDate = new Date(startDate);
				while (currentDate <= endDate) {
					const dateStr = currentDate.toISOString().split("T")[0];
					const { data: existing, error: existingError } = await pos
						.from("booking_date_capacity")
						.select("source_id")
						.eq("slug", slug)
						.eq("booking_date", dateStr)
						.maybeSingle();
					if (existingError) throw existingError;

					const row = {
						slug,
						booking_date: dateStr,
						max_people: Number(args?.maxPeople ?? 0),
						max_tables: Number(args?.maxTables ?? 0),
						people_per_table: Number(args?.peoplePerTable ?? 4),
						notes: args?.notes ?? null,
						raw: {
							slug,
							date: dateStr,
							maxPeople: Number(args?.maxPeople ?? 0),
							maxTables: Number(args?.maxTables ?? 0),
							peoplePerTable: Number(args?.peoplePerTable ?? 4),
							notes: args?.notes ?? undefined,
						},
					};

					if (existing?.source_id) {
						const { error: updateError } = await pos
							.from("booking_date_capacity")
							.update(row)
							.eq("source_id", existing.source_id);
						if (updateError) throw updateError;
					} else {
						const { error: insertError } = await pos
							.from("booking_date_capacity")
							.insert({
								source_id: makeSourceId("booking_cap"),
								creation_time: Date.now(),
								...row,
							});
						if (insertError) throw insertError;
					}

					currentDate.setDate(currentDate.getDate() + 1);
				}
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-set-booking-bulk-date-capacity]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridCreateServiceRequest() {
	const fallback = useMutation(api.customerService.createRequest);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = makeSourceId("csr");
				const createdAt = Date.now();
				await insertMirrorDocument({
					tableName: "customerServiceRequests",
					documentId: id,
					creationTime: createdAt,
					document: {
						brandSlug: args?.brandSlug ?? "default",
						orderId: args?.orderId ?? null,
						requestType: args?.requestType ?? "call_staff",
						tableNumber: args?.tableNumber ?? null,
						customerName: args?.customerName ?? null,
						notes: args?.notes ?? null,
						status: "pending",
						source: "customer_page",
						createdAt,
					},
				});
				return id;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-create-customer-service]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUpdateCustomerServiceStatus() {
	const fallback = useMutation(api.customerService.updateRequestStatus);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = String(args?.id ?? "");
				if (!id) throw new Error("id is required");
				const existing = await getMirrorDocument("customerServiceRequests", id);
				if (!existing) throw new Error("Request not found");
				await updateMirrorDocument({
					tableName: "customerServiceRequests",
					documentId: id,
					document: {
						...existing,
						status: args?.status ?? "pending",
						...(args?.status === "completed" || args?.status === "cancelled"
							? { resolvedAt: Date.now() }
							: {}),
					},
				});
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-update-customer-service-status]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridCreateTransaction() {
	const fallback = useMutation(api.finance.createTransaction);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const type = args?.type as "income" | "expense" | undefined;
				const category = String(args?.category ?? "");
				const date = Number(args?.date ?? Date.now());
				if (!type || !category) {
					throw new Error("type and category are required");
				}

				const metadata = enrichFinancialMetadataWithRef({
					type,
					category,
					date,
					metadata: (args?.metadata as Record<string, any> | undefined) ?? undefined,
				});

				const fingerprint = args?.sourceFingerprint;

				// ── Dedup: cek apakah transaksi sudah ada ──
				const client = createClient();
				if (fingerprint) {
					const { data: existing } = await client
						.schema("pos")
						.from("financial_transactions")
						.select("source_id")
						.eq("source_fingerprint", fingerprint)
						.maybeSingle();
					if (existing) {
						return existing.source_id;
					}
				}

				// Fallback dedup: cek combination type+amount+category+description dalam 2 menit
				const description = args?.description ?? "";
				const amount = Number(args?.amount ?? 0);
				if (!fingerprint && amount > 0 && type && category) {
					const { data: similar } = await client
						.schema("pos")
						.from("financial_transactions")
						.select("source_id")
						.eq("tx_type", type)
						.eq("amount", amount)
						.eq("category", category)
						.eq("description", description)
						.gte("tx_date", date - 2 * 60 * 1000)
						.lte("tx_date", date + 60 * 1000)
						.limit(1)
						.maybeSingle();
				if (similar) {
					console.log("[DEDUP] Duplicate detected by match, returning existing source_id", similar.source_id);
					return similar.source_id;
				}
			}

			// ── Call API Gateway (edge function) ────────────────
			const { data: gwResult, error: gwError } = await createClient().functions.invoke(
				"record-financial-transaction",
				{
					body: {
						tx_type: type,
						amount,
						category,
						description: description || undefined,
						merchant: args?.merchant || undefined,
						tx_date: date,
						payment_method: args?.paymentMethod || "cash",
						status: args?.status || "completed",
						source_fingerprint: fingerprint || undefined,
						metadata,
					},
				}
			);
			if (gwError) throw new Error(gwError.message || "Gateway error");
			const sourceId = (gwResult as any)?.sourceId;
			if (!sourceId) throw new Error("Gateway returned no sourceId");

				// Fire-and-forget: notify Yumi Finance Analyzer for real-time AI analysis
				const analyzerUrl = (typeof import.meta !== "undefined" && import.meta.env?.VITE_ANALYZER_URL) ||
					"http://43.129.54.5:8002";
				fetch(`${analyzerUrl}/analyze-transaction`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ source_id: sourceId }),
					keepalive: true,
				}).catch(() => {}); // silent fail

				return sourceId;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-create-transaction]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUpdateTransaction() {
	const fallback = useMutation(api.finance.updateTransaction);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const id = args?.id as string | undefined;
				if (!id) {
					throw new Error("id is required");
				}

				const updates: Record<string, unknown> = {};
				if (args?.type !== undefined) updates.tx_type = args.type ?? null;
				if (args?.amount !== undefined) updates.amount = Number(args.amount ?? 0);
				if (args?.category !== undefined) updates.category = args.category ?? null;
				if (args?.merchant !== undefined) updates.merchant = args.merchant ?? null;
				if (args?.description !== undefined)
					updates.description = args.description ?? null;
				if (args?.date !== undefined) updates.tx_date = Number(args.date ?? 0);
				if (args?.paymentMethod !== undefined)
					updates.payment_method = args.paymentMethod ?? null;
				if (args?.status !== undefined) updates.status = args.status ?? null;
				if (args?.attachmentUrl !== undefined)
					updates.attachment_url = args.attachmentUrl ?? null;
				if (args?.sourceFingerprint !== undefined)
					updates.source_fingerprint = args.sourceFingerprint ?? null;
				if (args?.isRecurring !== undefined)
					updates.is_recurring = Boolean(args.isRecurring);
				if (args?.recurringInterval !== undefined)
					updates.recurring_interval = args.recurringInterval ?? null;
				if (args?.tags !== undefined)
					updates.tags = Array.isArray(args.tags) ? args.tags : null;
				if (args?.metadata !== undefined)
					updates.metadata = args.metadata ?? null;

				if (Object.keys(updates).length === 0) {
					return;
				}

				const { error } = await createClient()
					.schema("pos")
					.from("financial_transactions")
					.update(updates)
					.eq("source_id", id);
				if (error) throw error;
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-update-transaction]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridRecordExpenseIntake() {
	const fallback = useMutation((api as any).expenseIntake.recordExpense);
	const createInventoryItem = useHybridCreateInventoryItem();
	const addStock = useHybridAddStock();
	const syncMenuStock = useHybridSyncMenuStockFromInventory();
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const tx = args?.transaction ?? {};
				const type = (tx.type as "income" | "expense" | undefined) ?? "expense";
				const amount = Number(tx.amount ?? 0);
				const category = String(tx.category ?? "Lainnya").trim() || "Lainnya";
				const date = Number(tx.date ?? Date.now());
				const source = String(args?.source ?? "manual_form");
				const normalizedItems = Array.isArray(args?.items) ? args.items : [];
				const allowCreateInventoryItem = args?.allowCreateInventoryItem === undefined
					? true
					: Boolean(args.allowCreateInventoryItem);
				const metadata = enrichFinancialMetadataWithRef({
					type,
					category,
					date,
					metadata: {
						...(args?.metadata ?? {}),
						source,
						rawText: args?.rawText,
						scanItems:
							normalizedItems.length > 0
								? normalizedItems.map((item: any) => ({
										name: item?.name ?? "",
										quantity: Number(item?.quantity ?? 1),
										price:
											item?.price === undefined
												? undefined
												: Number(item.price ?? 0),
										total:
											item?.total === undefined
												? undefined
												: Number(item.total ?? 0),
										unit: item?.unit ?? undefined,
								  }))
								: undefined,
					},
				});

				// Auto-detect syncMode from category if not explicitly set by user
				const explicitSyncMode = String(args?.syncMode ?? "").trim().toLowerCase();
				let effectiveSyncMode: "finance_only" | "finance_plus_inventory" = "finance_only";
				if (explicitSyncMode === "finance_plus_inventory" || explicitSyncMode === "finance_only") {
					effectiveSyncMode = explicitSyncMode as "finance_only" | "finance_plus_inventory";
				} else {
					const normalizedCat = category.trim().toLowerCase().replace(/\s+/g, "_");
					if (normalizedCat === "belanja_stok" || normalizedCat === "bahan_baku" || normalizedCat === "pembelian_stok") {
						effectiveSyncMode = "finance_plus_inventory";
					}
				}

				// #10: Tag description as template when isRecurring=true
				const isRecurringTx = tx?.isRecurring === undefined ? false : Boolean(tx.isRecurring);
				const effectiveDescription = isRecurringTx
					? (tx?.description ? `${tx.description} (Template pengeluaran berulang)` : "Template pengeluaran berulang")
					: (tx?.description ?? null);

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const existingId = args?.existingTransactionId
					? String(args.existingTransactionId)
					: "";

				let transactionId: string;

				if (existingId) {
					const { error: updateError } = await pos
						.from("financial_transactions")
						.update({
							tx_type: type,
							amount,
							category,
							merchant: tx?.merchant ?? null,
							description: effectiveDescription,
							tx_date: date,
							payment_method: tx?.paymentMethod ?? null,
							status: tx?.status ?? "completed",
							attachment_url: tx?.attachmentUrl ?? null,
							source_fingerprint:
								args?.sourceFingerprint ?? null,
							is_recurring:
								tx?.isRecurring === undefined
									? null
									: Boolean(tx.isRecurring),
							recurring_interval: tx?.recurringInterval ?? null,
							tags: Array.isArray(tx?.tags) ? tx.tags : null,
							metadata,
							raw: {
								...(args ?? {}),
								transaction: tx,
							},
						})
						.eq("source_id", existingId);
					if (updateError) throw updateError;
					transactionId = existingId;
				} else {
					// ── Create via API Gateway ──────────────────────
					const { data: gwResult, error: gwError } = await createClient().functions.invoke(
						"record-financial-transaction",
						{
							body: {
								tx_type: type,
								amount,
								category,
								description: effectiveDescription || undefined,
								merchant: tx?.merchant || undefined,
								tx_date: date,
								payment_method: tx?.paymentMethod || "cash",
								status: tx?.status || "completed",
								source_fingerprint: args?.sourceFingerprint || undefined,
								metadata,
							},
						}
					);
					const gwSourceId = (gwResult as any)?.sourceId;
					if (gwError || !gwSourceId) {
						console.warn("[supabase-hybrid:write-record-expense-intake] gateway failed, using direct insert", gwError);
						const directSourceId =
							typeof crypto !== "undefined" && "randomUUID" in crypto
								? crypto.randomUUID()
								: `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`;
						const { error: insertError } = await pos
							.from("financial_transactions")
							.insert({
								source_id: directSourceId,
								tx_type: type,
								amount,
								category,
								merchant: tx?.merchant ?? null,
								description: effectiveDescription,
								tx_date: date,
								payment_method: tx?.paymentMethod ?? "cash",
								status: tx?.status ?? "completed",
								attachment_url: tx?.attachmentUrl ?? null,
								source_fingerprint: args?.sourceFingerprint ?? null,
								is_recurring:
									tx?.isRecurring === undefined
										? null
										: Boolean(tx.isRecurring),
								recurring_interval: tx?.recurringInterval ?? null,
								tags: Array.isArray(tx?.tags) ? tx.tags : null,
								metadata,
								raw: {
									...(args ?? {}),
									transaction: tx,
								},
							});
						if (insertError) throw insertError;
						transactionId = directSourceId;
					} else {
						transactionId = gwSourceId;
					}
				}

				// Sync to inventory if finance_plus_inventory and expense
				let createdCount = 0;
				let matchedCount = 0;
				if (effectiveSyncMode === "finance_plus_inventory" && type === "expense" && normalizedItems.length > 0) {
					for (const item of normalizedItems) {
						const ingredientName = String(item?.name ?? "").trim();
						if (!ingredientName) continue;
						const quantity = Number(item?.quantity ?? 0);
						const price = Number(item?.price ?? 0);
						const { data: existing } = await supabase
							.from("pos_inventory")
							.select("*")
							.ilike("ingredientName", ingredientName)
							.limit(1)
							.maybeSingle();
						let inventoryId = String((existing as any)?._id ?? "");
						if (!inventoryId) {
							if (!allowCreateInventoryItem) {
								throw new Error(`Item inventory "${ingredientName}" tidak ditemukan. Pilih dari database inventory atau aktifkan item baru.`);
							}
							try {
								inventoryId = await createInventoryItem({
									ingredientName,
									unit: item?.unit || "pcs",
									quantity: 0,
									lowStockThreshold: 1,
								});
								createdCount++;
							} catch {
								// inventory creation failed, skip stock add
								continue;
							}
						} else {
							matchedCount++;
						}
						if (quantity > 0) {
							try {
								await addStock({
									inventoryId,
									quantity,
									costPerUnit: price > 0 ? price : undefined,
									notes: `Sinkron dari transaksi ${transactionId}`,
								});
							} catch {
								// stock add failed, non-fatal
							}
						}
					}
				}

				// Sync menu stock from inventory after expense intake
				let syncMenuStockResult = { updatedCount: 0 };
				if (type === "expense" && normalizedItems.length > 0) {
					try {
						syncMenuStockResult = await syncMenuStock();
					} catch (syncError) {
						console.warn(
							"[supabase-hybrid:write-record-expense-intake] syncMenuStock failed",
							syncError
						);
					}
				}

				return {
					transactionId,
					createdTransaction: !existingId,
					syncOutcome: effectiveSyncMode,
					warnings: [] as string[],
					createdCount,
					matchedCount,
					updatedCount: existingId ? 1 : 0,
					hppUpdatedCalculations: 0,
					hppUpdatedIngredients: 0,
					items: normalizedItems,
					message: existingId
						? "Transaksi keuangan berhasil diperbarui"
						: "Transaksi keuangan berhasil disimpan",
				};
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-record-expense-intake]",
					error
				);
				throw error;
			}
		},
		[fallback, createInventoryItem, addStock, syncMenuStock]
	);
}

export function useHybridDeleteTransaction() {
	const fallback = useMutation(api.finance.deleteTransaction);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const id = args?.id as string | undefined;
				if (!id) {
					throw new Error("id is required");
				}
				const { error } = await createClient()
					.schema("pos")
					.from("financial_transactions")
					.delete()
					.eq("source_id", id);
				if (error) throw error;
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-delete-transaction]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridDeleteTransactionsBulk() {
	const fallback = useMutation(api.finance.deleteTransactionsBulk);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}
			try {
				const ids = Array.isArray(args?.ids) ? args.ids : [];
				if (ids.length === 0) {
					return { deletedCount: 0 };
				}

				const { error } = await createClient()
					.schema("pos")
					.from("financial_transactions")
					.delete()
					.in("source_id", ids);
				if (error) throw error;
				return { deletedCount: ids.length };
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-delete-transactions-bulk]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridDeleteTransactionScanItem() {
	const fallback = useMutation((api as any).finance.deleteTransactionScanItem);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = String(args?.id ?? "");
				const itemIndex = Number(args?.itemIndex ?? -1);
				if (!id || itemIndex < 0) throw new Error("id dan itemIndex wajib");
				const supabase = createClient();
				const { data: tx, error: getError } = await supabase
					.schema("pos")
					.from("financial_transactions")
					.select("amount, metadata")
					.eq("source_id", id)
					.maybeSingle();
				if (getError) throw getError;
				if (!tx) throw new Error("Transaksi tidak ditemukan");

				const scanItems = Array.isArray((tx.metadata as any)?.scanItems)
					? [...((tx.metadata as any).scanItems as Array<any>)]
					: [];
				if (itemIndex >= scanItems.length) throw new Error("Item tidak valid");
				scanItems.splice(itemIndex, 1);
				const recomputedAmount = Math.round(
					scanItems.reduce((sum, item) => {
						const quantity = Number(item?.quantity ?? 0) || 0;
						const total = Number(item?.total ?? 0);
						const price = Number(item?.price ?? 0);
						return sum + (total > 0 ? total : price * quantity);
					}, 0)
				);
				const nextMetadata = tx.metadata
					? {
							...(tx.metadata as any),
							scanItems: scanItems.length > 0 ? scanItems : undefined,
					  }
					: undefined;

				const { error: patchError } = await supabase
					.schema("pos")
					.from("financial_transactions")
					.update({
						amount: recomputedAmount > 0 ? recomputedAmount : Number(tx.amount ?? 0),
						metadata: nextMetadata ?? null,
					})
					.eq("source_id", id);
				if (patchError) throw patchError;
				return { success: true, remainingItems: scanItems.length };
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-delete-transaction-scan-item]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUpdateTransactionScanItem() {
	const fallback = useMutation((api as any).finance.updateTransactionScanItem);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = String(args?.id ?? "");
				const itemIndex = Number(args?.itemIndex ?? -1);
				if (!id || itemIndex < 0) throw new Error("id dan itemIndex wajib");
				const supabase = createClient();
				const { data: tx, error: getError } = await supabase
					.schema("pos")
					.from("financial_transactions")
					.select("amount, metadata")
					.eq("source_id", id)
					.maybeSingle();
				if (getError) throw getError;
				if (!tx) throw new Error("Transaksi tidak ditemukan");

				const scanItems = Array.isArray((tx.metadata as any)?.scanItems)
					? [...((tx.metadata as any).scanItems as Array<any>)]
					: [];
				if (itemIndex >= scanItems.length) throw new Error("Item tidak valid");
				const current = scanItems[itemIndex] ?? {};
				scanItems[itemIndex] = {
					name: String(args?.name ?? current.name ?? "").trim() || current.name,
					quantity: Number(args?.quantity ?? current.quantity ?? 1) || 1,
					price:
						args?.price !== undefined
							? Number(args.price)
							: current.price ?? undefined,
					total:
						args?.total !== undefined
							? Number(args.total)
							: current.total ?? undefined,
					unit: args?.unit !== undefined ? args.unit : current.unit,
				};

				const recomputedAmount = Math.round(
					scanItems.reduce((sum, item) => {
						const quantity = Number(item?.quantity ?? 0) || 0;
						const total = Number(item?.total ?? 0);
						const price = Number(item?.price ?? 0);
						return sum + (total > 0 ? total : price * quantity);
					}, 0)
				);

				const nextMetadata = tx.metadata
					? { ...(tx.metadata as any), scanItems }
					: { scanItems };
				const { error: patchError } = await supabase
					.schema("pos")
					.from("financial_transactions")
					.update({
						amount: recomputedAmount > 0 ? recomputedAmount : Number(tx.amount ?? 0),
						metadata: nextMetadata,
					})
					.eq("source_id", id);
				if (patchError) throw patchError;
				return { success: true };
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-update-transaction-scan-item]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridStartShift() {
	const fallback = useMutation(api.finance.startShift);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const startTime = Number(args?.startTime ?? Date.now());
				const shiftId = makeSourceId("shift");
				const supabase = createClient();
				const pos = supabase.schema("pos");

				// Cegah shift ganda: tolak jika sudah ada shift AKTIF
				const { data: existingActive, error: checkError } = await pos
					.from("shifts")
					.select("source_id, shift_name, cashier_name")
					.is("end_time", null)
					.limit(1);
				if (checkError) throw checkError;
				if (existingActive && existingActive.length > 0) {
					const active = existingActive[0];
					throw new Error(
						`Shift masih berjalan: ${active.shift_name} oleh ${active.cashier_name ?? "?"}. Tutup shift aktif terlebih dahulu sebelum membuka shift baru.`
					);
				}

				const { error: shiftError } = await pos.from("shifts").insert({
					source_id: shiftId,
					shift_name: args?.shiftName ?? "Shift",
					cashier_name: args?.cashierName ?? null,
					team_members: args?.teamMembers ?? null,
					start_time: startTime,
					starting_cash: Number(args?.startingCash ?? 0),
					notes: args?.notes ?? null,
					creation_time: startTime,
					raw: args ?? {},
				});
				if (shiftError) throw shiftError;

				const descParts = [
					`Kasir: ${args?.cashierName ?? "-"}`,
					`Shift: ${args?.shiftName ?? "-"}`,
				];
				if (args?.teamMembers) descParts.push(`Tim: ${args.teamMembers}`);
				if (args?.notes) descParts.push(`Catatan: ${args.notes}`);
				const metadata = enrichFinancialMetadataWithRef({
					type: "income",
					category: "Modal Awal",
					date: startTime,
					metadata: {
						source: "shift_open",
						sourceLabel: "Shift Open",
					},
					seed: `${startTime}:${args?.shiftName ?? ""}:${args?.cashierName ?? ""}`,
				});
				const { error: txError } = await pos.from("financial_transactions").insert({
					source_id: makeSourceId("fin"),
					tx_type: "income",
					amount: Number(args?.startingCash ?? 0),
					category: "Modal Awal",
					description: descParts.join(" | "),
					tx_date: startTime,
					status: "completed",
					payment_method: "tunai",
					metadata,
					creation_time: Date.now(),
					raw: {
						shiftId,
						kind: "shift_open",
					},
				});
				if (txError) throw txError;
				return shiftId;
			} catch (error) {
				console.error("[supabase-hybrid:write-start-shift]", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridEndShift() {
	const fallback = useMutation(api.finance.endShift);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const shiftId = String(args?.shiftId ?? "");
				if (!shiftId) throw new Error("shiftId wajib");
				const endTime = Number(args?.endTime ?? Date.now());
				const supabase = createClient();

				const { data: shift, error: shiftError } = await supabase
					.from("pos_shifts")
					.select("*")
					.eq("_id", shiftId)
					.maybeSingle();
				if (shiftError) throw shiftError;
				if (!shift) throw new Error("Shift not found");
				if (shift.endTime) throw new Error("Shift already ended");
				if (endTime < Number(shift.startTime ?? 0)) {
					throw new Error("Waktu akhir shift tidak boleh lebih awal dari waktu mulai");
				}

				const { data: txRows, error: txError } = await supabase
					.from("pos_financial_transactions")
					.select("type, amount, category, paymentMethod, status")
					.gte("date", Number(shift.startTime))
					.lte("date", endTime);
				if (txError) throw txError;
				const rows = txRows ?? [];
				const completed = rows.filter(
					(row: any) => String(row.status ?? "completed") === "completed"
				);
				let cashRevenue = 0;
				let qrisRevenue = 0;
				let totalRevenue = 0;
				let totalExpenses = 0;
				for (const row of completed) {
					const amount = Number(row.amount ?? 0);
					if (String(row.type) === "income") {
						if (row.category === "Modal Awal" || row.category === "Setoran Akhir") {
							continue;
						}
						totalRevenue += amount;
						const method = String(row.paymentMethod ?? "").toLowerCase();
						if (method === "cash" || method === "tunai") cashRevenue += amount;
						else qrisRevenue += amount;
					} else {
						totalExpenses += amount;
					}
				}

				const endingCashExpected =
					Number(shift.startingCash ?? 0) + cashRevenue - totalExpenses;
				const nonCashExpected = qrisRevenue;
				const summary = {
					totalRevenue,
					totalExpenses,
					totalItemsSold: Number((shift.summary as any)?.totalItemsSold ?? 0),
					cashRevenue,
					qrisRevenue,
					totalDiscount: Number((shift.summary as any)?.totalDiscount ?? 0),
				};

				const { error: updateError } = await supabase
					.schema("pos")
					.from("shifts")
					.update({
						end_time: endTime,
						ending_cash_physical: Number(args?.endingCashPhysical ?? 0),
						ending_cash_expected: endingCashExpected,
						non_cash_confirmed: Number(args?.nonCashConfirmed ?? 0),
						non_cash_expected: nonCashExpected,
						cash_breakdown: args?.cashBreakdown ?? null,
						notes: args?.notes ?? shift.notes ?? null,
						summary,
						raw: {
							...(shift.raw ?? {}),
							closingTasks: args?.closingTasks ?? null,
						},
					})
					.eq("source_id", shiftId);
				if (updateError) throw updateError;

				const summaryText = `\n[RINGKASAN SHIFT]\nModal: Rp ${Number(
					shift.startingCash ?? 0
				).toLocaleString("id-ID")}\nCash: Rp ${cashRevenue.toLocaleString(
					"id-ID"
				)}\nQRIS: Rp ${qrisRevenue.toLocaleString(
					"id-ID"
				)}\nTotal Revenue (Net): Rp ${totalRevenue.toLocaleString(
					"id-ID"
				)}\nPengeluaran: Rp ${totalExpenses.toLocaleString("id-ID")}`;
				const metadata = enrichFinancialMetadataWithRef({
					type: "income",
					category: "Setoran Akhir",
					date: endTime,
					metadata: {
						source: "shift_close",
						sourceLabel: "Shift Close",
					},
					seed: `${endTime}:${shift.shiftName ?? ""}:${shift.cashierName ?? ""}`,
				});
				const { error: closingTxError } = await supabase
					.schema("pos")
					.from("financial_transactions")
					.insert({
						source_id: makeSourceId("fin"),
						tx_type: "income",
						amount: 0,  // Setoran Akhir selalu amount=0 (informational only)
						category: "Setoran Akhir",
						description: `${args?.notes || "Akhiri Shift"}${summaryText}`,
						tx_date: endTime,
						status: "completed",
						payment_method: "tunai",
						metadata,
						creation_time: Date.now(),
						raw: { shiftId, kind: "shift_close" },
					});
				if (closingTxError) {
					console.warn("[supabase-hybrid:write-end-shift] failed to insert closing transaction", closingTxError);
				}
				return shiftId;
			} catch (error) {
				console.error("[supabase-hybrid:write-end-shift] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridSetFinancialTarget() {
	const fallback = useMutation(api.finance.setFinancialTarget);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const month = String(args?.month ?? "");
				if (!month) throw new Error("month wajib");
				const supabase = createClient();
				const pos = supabase.schema("pos");
				const { data: existing, error: existingError } = await pos
					.from("financial_targets")
					.select("source_id")
					.eq("month", month)
					.maybeSingle();
				if (existingError) throw existingError;
				const payload = {
					month,
					target_revenue: Number(args?.targetRevenue ?? 0),
					target_profit:
						args?.targetProfit === undefined
							? null
							: Number(args.targetProfit ?? 0),
					updated_at: Date.now(),
					raw: args ?? {},
				};
				if (existing?.source_id) {
					const { error } = await pos
						.from("financial_targets")
						.update(payload)
						.eq("source_id", existing.source_id);
					if (error) throw error;
					return existing.source_id;
				}
				const id = makeSourceId("financial_target");
				const { error } = await pos.from("financial_targets").insert({
					source_id: id,
					created_at: Date.now(),
					creation_time: Date.now(),
					...payload,
				});
				if (error) throw error;
				return id;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-set-financial-target]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridAdminUpdateShift() {
	const fallback = useMutation(api.finance.adminUpdateShift);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const shiftId = String(args?.shiftId ?? "");
				if (!shiftId) throw new Error("shiftId wajib");
				const updates: Record<string, unknown> = {};
				if (args?.cashierName !== undefined) updates.cashier_name = args.cashierName;
				if (args?.teamMembers !== undefined) updates.team_members = args.teamMembers;
				if (args?.shiftName !== undefined) updates.shift_name = args.shiftName;
				if (args?.notes !== undefined) updates.notes = args.notes;
				if (args?.startingCash !== undefined)
					updates.starting_cash = Number(args.startingCash ?? 0);
				if (Object.keys(updates).length === 0) return shiftId;
				const { error } = await createClient()
					.schema("pos")
					.from("shifts")
					.update(updates)
					.eq("source_id", shiftId);
				if (error) throw error;
				return shiftId;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-admin-update-shift]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridAdminDeleteShift() {
	const fallback = useMutation(api.finance.adminDeleteShift);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const shiftId = String(args?.shiftId ?? "");
				if (!shiftId) throw new Error("shiftId wajib");
				const { error } = await createClient()
					.schema("pos")
					.from("shifts")
					.delete()
					.eq("source_id", shiftId);
				if (error) throw error;
				return shiftId;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-admin-delete-shift]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridAdminBulkDeleteShifts() {
	const fallback = useMutation(api.finance.adminBulkDeleteShifts);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const ids = Array.isArray(args?.shiftIds) ? args.shiftIds : [];
				if (ids.length === 0) return 0;
				const { error } = await createClient()
					.schema("pos")
					.from("shifts")
					.delete()
					.in("source_id", ids);
				if (error) throw error;
				return ids.length;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-admin-bulk-delete-shifts]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}


/**
 * Validate that the user's location is within the cafe's geofence radius.
 * Fetches site settings from the pos schema and computes haversine distance.
 * Throws if location is invalid or outside radius.
 */
async function validateGeofence(location?: { lat: number; lng: number } | null): Promise<void> {
	if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
		throw new Error("Lokasi tidak tersedia — aktifkan GPS dan coba lagi");
	}

	const supabase = createClient();
	const { data: settings, error } = await supabase
		.from("pos_site_settings")
		.select("attendance_lat, attendance_lng, attendance_radius")
		.maybeSingle();

	if (error || !settings) {
		// If settings don't exist yet, allow (first-time setup)
		return;
	}

	const storeLat = Number(settings.attendance_lat);
	const storeLng = Number(settings.attendance_lng);
	const radius = Number(settings.attendance_radius) || 50;

	if (!storeLat || !storeLng) return; // Not configured yet

	// Haversine distance in meters
	const R = 6371e3;
	const phi1 = (location.lat * Math.PI) / 180;
	const phi2 = (storeLat * Math.PI) / 180;
	const dPhi = ((storeLat - location.lat) * Math.PI) / 180;
	const dLambda = ((storeLng - location.lng) * Math.PI) / 180;
	const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
	const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	if (distance > radius) {
		throw new Error(
			`Anda berada di luar radius kafe (${Math.round(distance)}m dari ${radius}m yang diizinkan)`
		);
	}
}

export function useHybridClockIn() {
	const fallback = useMutation(api.attendance.clockIn);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const userId = String(args?.userId ?? "");
				if (!userId) throw new Error("userId wajib");

				// Bug #11: Validate geofence server-side
				await validateGeofence(args?.location ?? null);

				const { data: user, error: userError } = await createClient()
					.from("yumi_users")
					.select("source_id,is_active,home_pin_fingerprint")
					.eq("source_id", userId)
					.maybeSingle();
				if (userError) throw userError;
				if (!user || user.is_active === false) {
					throw new Error("User not found or inactive");
				}
				if (args?.pinCode) {
					const pinFingerprint = await sha256Hex(String(args.pinCode).trim());
					if (
						user.home_pin_fingerprint &&
						pinFingerprint !== user.home_pin_fingerprint
					) {
						throw new Error("PIN tidak valid");
					}
				}
				const id = makeSourceId("attendance");
				const timestamp = Date.now();
				await insertMirrorDocument({
					tableName: "attendance",
					documentId: id,
					creationTime: timestamp,
					document: {
						userId,
						type: "check_in",
						timestamp,
						photoUrl: args?.photoUrl ?? null,
						location: args?.location ?? null,
						notes: args?.notes ?? null,
						shiftName: args?.shiftName ?? null,
						shiftOpenTimeSnapshot: args?.shiftOpenTimeSnapshot ?? null,
					},
				});
				return id;
			} catch (error) {
				console.error("[supabase-hybrid:write-clock-in] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridClockOut() {
	const fallback = useMutation(api.attendance.clockOut);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const userId = String(args?.userId ?? "");
				if (!userId) throw new Error("userId wajib");

				// Bug #11: Validate geofence server-side
				await validateGeofence(args?.location ?? null);

				// Verify identity before clocking out
				await verifyAttendanceIdentity({
					userId,
					pinCode: args?.pinCode ?? undefined,
					faceDescriptor: args?.faceDescriptor ?? undefined,
				});

				const id = makeSourceId("attendance");
				const timestamp = Date.now();
				await insertMirrorDocument({
					tableName: "attendance",
					documentId: id,
					creationTime: timestamp,
					document: {
						userId,
						type: "check_out",
						timestamp,
						location: args?.location ?? null,
						notes: args?.notes ?? null,
					},
				});
				return id;
			} catch (error) {
				console.error("[supabase-hybrid:write-clock-out] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridVerifyHomePin() {
	const fallback = useMutation(api.users.verifyHomePin);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const pin = String(args?.pinCode ?? "").trim();
				if (!/^\d{6}$/.test(pin)) {
					throw new Error("PIN harus terdiri dari 6 digit angka");
				}
				const pinFingerprint = await sha256Hex(pin);
				const supabase = createClient();
				const { data: user, error } = await supabase
					.from("yumi_users")
					.select("source_id, name, role_source_id, is_active, home_pin_fingerprint")
					.eq("home_pin_fingerprint", pinFingerprint)
					.maybeSingle();
				if (error) throw error;
				if (!user || user.is_active === false) {
					throw new Error("PIN tidak valid atau pengguna tidak aktif");
				}
				const { data: role, error: roleError } = await supabase
					.from("yumi_roles")
					.select("name")
					.eq("source_id", user.role_source_id)
					.maybeSingle();
				if (roleError) throw roleError;

				return {
					userId: user.source_id,
					name: user.name,
					role: role?.name || "user",
				};
			} catch (error) {
				console.error("[supabase-hybrid:write-verify-home-pin] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridEnrollFace() {
	const fallback = useMutation(api.users.enrollFace);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const userId = String(args?.userId ?? "");
				const pin = String(args?.pin ?? "").trim();
				const faceDescriptor = Array.isArray(args?.faceDescriptor)
					? args.faceDescriptor
					: [];
				if (!userId || !/^\d{6}$/.test(pin) || faceDescriptor.length === 0) {
					throw new Error("Data pendaftaran wajah tidak valid");
				}
				const pinFingerprint = await sha256Hex(pin);
				const supabase = createClient();
				const { data: user, error: userError } = await supabase
					.from("yumi_users")
					.select("source_id, home_pin_fingerprint, is_active, raw")
					.eq("source_id", userId)
					.maybeSingle();
				if (userError) throw userError;
				if (!user || user.is_active === false) {
					throw new Error("User tidak ditemukan");
				}
				if (
					user.home_pin_fingerprint &&
					user.home_pin_fingerprint !== pinFingerprint
				) {
					throw new Error("PIN salah. Pendaftaran wajah dibatalkan.");
				}

				const { error: patchError } = await supabase
					.from("yumi_users")
					.update({
						face_descriptor: faceDescriptor,
						raw: {
							...(user.raw ?? {}),
							faceDescriptor,
						},
					})
					.eq("source_id", userId);
				if (patchError) throw patchError;
				return { success: true };
			} catch (error) {
				console.error("[supabase-hybrid:write-enroll-face] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUpdateUserPin() {
	const fallback = useMutation(api.users.updatePin);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const token = String(args?.token ?? "");
				const newPin = String(args?.newPin ?? "").trim();
				const oldPin = args?.oldPin ? String(args.oldPin).trim() : undefined;
				if (!token) throw new Error("Sesi tidak valid atau telah berakhir");
				if (!/^\d{6}$/.test(newPin)) {
					throw new Error("PIN baru harus 6 digit angka");
				}
				const user = await getSessionUserByToken(token);
				if (!user) throw new Error("Sesi tidak valid atau telah berakhir");

				if (oldPin) {
					const oldFingerprint = await sha256Hex(oldPin);
					if (
						user.home_pin_fingerprint &&
						user.home_pin_fingerprint !== oldFingerprint
					) {
						throw new Error("PIN lama salah");
					}
				}
				const nextFingerprint = await sha256Hex(newPin);
				const raw =
					user.raw && typeof user.raw === "object" && !Array.isArray(user.raw)
						? { ...user.raw, requiresPinChange: false }
						: { requiresPinChange: false };
				const { error } = await createClient()
					.from("yumi_users")
					.update({
						home_pin_fingerprint: nextFingerprint,
						raw,
					})
					.eq("source_id", user.source_id);
				if (error) throw error;
				return { success: true };
			} catch (error) {
				console.error("[supabase-hybrid:write-update-user-pin] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUpdateUserProfile() {
	const fallback = useMutation(api.users.updateProfile);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const token = String(args?.token ?? "");
				if (!token) throw new Error("Sesi tidak valid atau telah berakhir");
				const user = await getSessionUserByToken(token);
				if (!user) throw new Error("Sesi tidak valid atau telah berakhir");

				const updates: Record<string, unknown> = {};
				if (args?.name !== undefined) updates.name = String(args.name).trim();
				if (args?.username !== undefined)
					updates.username = String(args.username).trim().toLowerCase();
				if (args?.slug !== undefined) updates.slug = String(args.slug).trim();
				if (args?.password !== undefined) {
					updates.raw = {
						...(user.raw ?? {}),
						password: String(args.password),
					};
				}
				if (Object.keys(updates).length === 0) return { success: true };

				const { error } = await createClient()
					.from("yumi_users")
					.update(updates)
					.eq("source_id", user.source_id);
				if (error) throw error;
				return { success: true };
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-update-user-profile]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUpdateSiteSettings() {
	const fallback = useMutation(api.site_settings.updateSettings);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const supabase = createClient();
				const pos = supabase.schema("pos");
				const { data: existing, error: existingError } = await pos
					.from("site_settings")
					.select("*")
					.order("creation_time", { ascending: false })
					.limit(1)
					.maybeSingle();
				if (existingError) throw existingError;

			const payload: any = {
				raw: {
					...(existing?.raw ?? {}),
					...(args ?? {}),
				},
			};

			// Preserve existing image URLs if the new value is empty
			const existingRaw = existing?.raw as Record<string, unknown> | undefined;
			if (existingRaw) {
				const imageFields = ["receiptLogo", "qrisImage", "paymentPopupImage", "headerLogoUrl", "faviconUrl", "pwaIcon192Url", "pwaIcon512Url", "seoShareImageUrl"];
				for (const field of imageFields) {
					if (!payload.raw[field] && existingRaw[field]) {
						payload.raw[field] = existingRaw[field];
					}
				}
			}

				if (args?.storeName !== undefined) payload.store_name = args.storeName;
				if (args?.storeAddress !== undefined) payload.store_address = args.storeAddress;
				if (args?.storePhone !== undefined) payload.store_phone = args.storePhone;
				if (args?.appName !== undefined) payload.app_name = args.appName;
				if (args?.appVersion !== undefined) payload.app_version = args.appVersion;
				if (args?.taxRate !== undefined) payload.tax_rate = Number(args.taxRate ?? 0);
				if (args?.serviceChargeRate !== undefined)
					payload.service_charge_rate = Number(args.serviceChargeRate ?? 0);

				if (existing?.source_id) {
					const { error } = await pos
						.from("site_settings")
						.update(payload)
						.eq("source_id", existing.source_id);
					if (error) throw error;
					return existing.source_id;
				}

				const sourceId = makeSourceId("site_settings");
				const { error } = await pos.from("site_settings").insert({
					source_id: sourceId,
					creation_time: Date.now(),
					...payload,
				});
				if (error) throw error;
				return sourceId;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-update-site-settings]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridGenerateSiteUploadUrl() {
	return useHybridStorageUpload(api.site_settings.generateUploadUrl, "site-settings");
}

export function useHybridAdminCreateAttendanceLog() {
	const fallback = useMutation(api.attendance.adminCreateLog);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = makeSourceId("attendance");
				await insertMirrorDocument({
					tableName: "attendance",
					documentId: id,
					creationTime: Number(args?.timestamp ?? Date.now()),
					document: {
						userId: args?.userId ?? null,
						type: args?.type ?? "check_in",
						timestamp: Number(args?.timestamp ?? Date.now()),
						notes: args?.notes ?? null,
						shiftName: args?.shiftName ?? null,
					},
				});
				return id;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-admin-create-attendance-log]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridAdminUpdateAttendanceLog() {
	const fallback = useMutation(api.attendance.adminUpdateLog);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = String(args?.id ?? "");
				if (!id) throw new Error("id wajib");
				const existing = await getMirrorDocument("attendance", id);
				if (!existing) throw new Error("Log tidak ditemukan");
				const next = {
					...existing,
					...(args?.type !== undefined ? { type: args.type } : {}),
					...(args?.timestamp !== undefined
						? { timestamp: Number(args.timestamp) }
						: {}),
					...(args?.notes !== undefined ? { notes: args.notes ?? null } : {}),
					...(args?.shiftName !== undefined
						? { shiftName: args.shiftName ?? null }
						: {}),
				};
				await updateMirrorDocument({
					tableName: "attendance",
					documentId: id,
					document: next,
				});
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-admin-update-attendance-log]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridAdminDeleteAttendanceLog() {
	const fallback = useMutation(api.attendance.adminDeleteLog);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = String(args?.id ?? "");
				if (!id) throw new Error("id wajib");
				const { error } = await createClient()
					.schema("legacy_mirror")
					.from("documents")
					.delete()
					.eq("table_name", "attendance")
					.eq("document_id", id);
				if (error) throw error;
				return id;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-admin-delete-attendance-log]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridAdminBulkDeleteAttendanceLogs() {
	const fallback = useMutation(api.attendance.adminBulkDeleteLogs);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const ids = Array.isArray(args?.ids) ? args.ids : [];
				if (ids.length === 0) return { deleted: 0 };
				const { error } = await createClient()
					.schema("legacy_mirror")
					.from("documents")
					.delete()
					.eq("table_name", "attendance")
					.in("document_id", ids);
				if (error) throw error;
				return { deleted: ids.length };
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-admin-bulk-delete-attendance-logs]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridCreateUser() {
	const fallback = useMutation((api as any).users.createUser);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const username = String(args?.username ?? "").trim().toLowerCase();
				const roleId = String(args?.roleId ?? "");
				const name = String(args?.name ?? "").trim();
				if (!username || !roleId || !name) throw new Error("Data user tidak lengkap");
				const sourceId = makeSourceId("user");
				const homePin = args?.homePin ? String(args.homePin).trim() : "";
				const homePinFingerprint = /^\d{6}$/.test(homePin)
					? await sha256Hex(homePin)
					: null;
				const slug =
					args?.slug !== undefined && String(args.slug).trim() !== ""
						? String(args.slug).trim()
						: username.split("@")[0];
				const { homePin: _rawHomePin, ...safeRawArgs } = args ?? {};
				const raw = {
					...safeRawArgs,
					requiresPinChange: Boolean(args?.requiresPinChange),
				};
				const { error } = await createClient().from("yumi_users").insert({
					source_id: sourceId,
					username,
					name,
					role_source_id: roleId,
					is_active: true,
					receive_report_emails: Boolean(args?.receiveReportEmails ?? false),
					auth_user_id: args?.authUserId ?? null,
					slug,
					home_pin_fingerprint: homePinFingerprint,
					raw,
				});
				if (error) throw error;
				return sourceId;
			} catch (error) {
				console.error("[supabase-hybrid:write-create-user] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUpdateUser() {
	const fallback = useMutation((api as any).users.updateUser);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = String(args?.id ?? "");
				if (!id) throw new Error("id user wajib");
				const supabase = createClient();
				const { data: existing, error: existingError } = await supabase
					.from("yumi_users")
					.select("raw")
					.eq("source_id", id)
					.maybeSingle();
				if (existingError) throw existingError;
				const updates: Record<string, unknown> = {};
				if (args?.username !== undefined)
					updates.username = String(args.username).trim().toLowerCase();
				if (args?.name !== undefined) updates.name = String(args.name).trim();
				if (args?.roleId !== undefined) updates.role_source_id = args.roleId ?? null;
				if (args?.isActive !== undefined) updates.is_active = Boolean(args.isActive);
				if (args?.receiveReportEmails !== undefined) {
					updates.receive_report_emails = Boolean(args.receiveReportEmails);
				}
				if (args?.authUserId !== undefined) updates.auth_user_id = args.authUserId ?? null;
				if (args?.slug !== undefined) updates.slug = String(args.slug ?? "").trim() || null;
				if (args?.faceDescriptor !== undefined) {
					updates.face_descriptor = Array.isArray(args.faceDescriptor)
						? args.faceDescriptor
						: null;
				}
				if (args?.homePin !== undefined) {
					const homePin = String(args.homePin ?? "").trim();
					updates.home_pin_fingerprint =
						homePin && /^\d{6}$/.test(homePin) ? await sha256Hex(homePin) : null;
				}
				updates.raw = {
					...(existing?.raw ?? {}),
					...Object.fromEntries(
						Object.entries(args ?? {}).filter(([key]) => key !== "homePin")
					),
				};
				const { error } = await supabase
					.from("yumi_users")
					.update(updates)
					.eq("source_id", id);
				if (error) throw error;
				return id;
			} catch (error) {
				console.error("[supabase-hybrid:write-update-user] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridDeleteUser() {
	const fallback = useMutation((api as any).users.deleteUser);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = String(args?.id ?? "");
				if (!id) throw new Error("id user wajib");
				const { error } = await createClient()
					.from("yumi_users")
					.delete()
					.eq("source_id", id);
				if (error) throw error;
				return id;
			} catch (error) {
				console.error("[supabase-hybrid:write-delete-user] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridCreateRole() {
	const fallback = useMutation((api as any).roles.createRole);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const name = String(args?.name ?? "").trim();
				if (!name) throw new Error("Nama role wajib");
				const id = makeSourceId("role");
				const { error } = await createClient().from("yumi_roles").insert({
					source_id: id,
					name,
					permissions: Array.isArray(args?.permissions) ? args.permissions : [],
					raw: args ?? {},
				});
				if (error) throw error;
				return id;
			} catch (error) {
				console.error("[supabase-hybrid:write-create-role] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridUpdateRole() {
	const fallback = useMutation((api as any).roles.updateRole);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = String(args?.id ?? "");
				if (!id) throw new Error("id role wajib");
			const { error } = await createClient()
				.from("yumi_roles")
				.update({
					name: String(args?.name ?? "").trim(),
					permissions: Array.isArray(args?.permissions) ? args.permissions : [],
					raw: args ?? {},
				})
				.eq("source_id", id);
				if (error) throw error;
				return id;
			} catch (error) {
				console.error("[supabase-hybrid:write-update-role] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridDeleteRole() {
	const fallback = useMutation((api as any).roles.deleteRole);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const id = String(args?.id ?? "");
				if (!id) throw new Error("id role wajib");
				const { data: usedUser, error: usedError } = await createClient()
					.from("yumi_users")
					.select("source_id")
					.eq("role_source_id", id)
					.limit(1)
					.maybeSingle();
				if (usedError) throw usedError;
				if (usedUser) throw new Error("Cannot delete role assigned to users");
				const { error } = await createClient()
					.from("yumi_roles")
					.delete()
					.eq("source_id", id);
				if (error) throw error;
				return id;
			} catch (error) {
				console.error("[supabase-hybrid:write-delete-role] fallback disabled", error);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridBindUserProfile() {
	const fallback = useMutation((api as any).users.bindProfile);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const authUserId = String(args?.authUserId ?? "").trim();
				const email = String(args?.email ?? "").trim().toLowerCase();
				const name = String(args?.name ?? "").trim();
				if (!authUserId || !email || !name) {
					throw new Error("Data profil tidak lengkap");
				}

				const supabase = createClient();
				const { data: existingByAuth, error: byAuthError } = await supabase
					.from("yumi_users")
					.select("source_id")
					.eq("auth_user_id", authUserId)
					.maybeSingle();
				if (byAuthError) throw byAuthError;
				if (existingByAuth?.source_id) return existingByAuth.source_id;

				const { data: existingByEmail, error: byEmailError } = await supabase
					.from("yumi_users")
					.select("source_id")
					.eq("username", email)
					.maybeSingle();
				if (byEmailError) throw byEmailError;
				if (existingByEmail?.source_id) {
					const { error: updateError } = await supabase
						.from("yumi_users")
						.update({ auth_user_id: authUserId })
						.eq("source_id", existingByEmail.source_id);
					if (updateError) throw updateError;
					return existingByEmail.source_id;
				}

				let roleId = args?.roleId ? String(args.roleId) : "";
				if (!roleId) {
					const ownerEmail = "fakhriazzamm@gmail.com";
					const preferredRole = email === ownerEmail ? "admin" : "staff";
					const { data: role, error: roleError } = await supabase
						.from("yumi_roles")
						.select("source_id")
						.ilike("name", preferredRole)
						.maybeSingle();
					if (roleError) throw roleError;
					roleId = String(role?.source_id ?? "");
				}
				if (!roleId) throw new Error("No default role found");

				const sourceId = makeSourceId("user");
				const { error: createError } = await supabase.from("yumi_users").insert({
					source_id: sourceId,
					username: email,
					name,
					role_source_id: roleId,
					auth_user_id: authUserId,
					is_active: true,
					receive_report_emails: false,
					raw: {
						authUserId,
						username: email,
						name,
					},
				});
				if (createError) throw createError;
				return sourceId;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-bind-user-profile]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridApplyInventoryStockAction() {
	const fallback = useMutation(api.inventory.applyInventoryStockAction);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const inventoryId = String(args?.inventoryId ?? "");
				const action = String(args?.action ?? "");
				const quantity = Number(args?.quantity ?? 0);
				if (!inventoryId || !["add", "usage", "adjust"].includes(action)) {
					throw new Error("Aksi stok tidak valid");
				}
				if (quantity <= 0) throw new Error("Quantity harus lebih dari 0");

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const { data: inventory, error: inventoryError } = await pos
					.from("inventory")
					.select("*")
					.eq("source_id", inventoryId)
					.maybeSingle();
				if (inventoryError) throw inventoryError;
				if (!inventory) throw new Error("Inventory item tidak ditemukan");

				const currentQty = Number(inventory.quantity ?? 0);
				const nextQty =
					action === "add"
						? currentQty + quantity
						: action === "usage"
							? Math.max(0, currentQty - quantity)
							: quantity;
				const now = Number(args?.timestamp ?? Date.now());

				const { error: updateError } = await pos
					.from("inventory")
					.update({
						quantity: nextQty,
						last_purchase_price:
							args?.costPerUnit === undefined
								? inventory.last_purchase_price ?? null
								: Number(args.costPerUnit ?? 0),
						last_purchase_at:
							action === "add" ? now : inventory.last_purchase_at ?? null,
						last_purchase_store_source_id:
							args?.storeId ?? inventory.last_purchase_store_source_id ?? null,
					})
					.eq("source_id", inventoryId);
				if (updateError) throw updateError;

				const txQuantity = action === "usage" ? -quantity : action === "add" ? quantity : nextQty - currentQty;
				const { error: txError } = await pos
					.from("inventory_transactions")
					.insert({
						source_id: makeSourceId("invtx"),
						inventory_source_id: inventoryId,
						quantity: txQuantity,
						tx_type: action,
						cost_per_unit:
							args?.costPerUnit === undefined ? null : Number(args.costPerUnit ?? 0),
						remaining_quantity: action === "add" ? quantity : null,
						tx_timestamp: now,
						notes: args?.notes ?? null,
						expiry_date:
							args?.expiryDate === undefined
								? null
								: Number(args.expiryDate ?? 0),
						brand_name: args?.brandName ?? null,
						store_source_id: args?.storeId ?? null,
						purchase_unit: args?.purchaseUnit ?? null,
						purchase_quantity:
							args?.purchaseQuantity === undefined
								? null
								: Number(args.purchaseQuantity ?? 0),
						line_total:
							args?.lineTotal === undefined
								? null
								: Number(args.lineTotal ?? 0),
						creation_time: Date.now(),
						raw: args ?? {},
					});
				if (txError) throw txError;
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-apply-inventory-stock-action]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridProduceBaseRecipeBatch() {
	const fallback = useMutation(api.inventory.produceBaseRecipeBatch);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const baseRecipeId = String(args?.baseRecipeId ?? "");
				const inventoryId = String(args?.inventoryId ?? "");
				const batchMultiplier = Number(args?.batchMultiplier ?? 0);
				if (!baseRecipeId || !inventoryId || batchMultiplier <= 0) {
					throw new Error("Data produksi batch tidak valid");
				}

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const { data: recipe, error: recipeError } = await pos
					.from("base_recipes")
					.select("*")
					.eq("source_id", baseRecipeId)
					.maybeSingle();
				if (recipeError) throw recipeError;
				if (!recipe) throw new Error("Recipe not found");

				const { data: targetItem, error: targetError } = await pos
					.from("inventory")
					.select("*")
					.eq("source_id", inventoryId)
					.maybeSingle();
				if (targetError) throw targetError;
				if (!targetItem) throw new Error("Target inventory item not found");

				const ingredients = Array.isArray(recipe.ingredients)
					? recipe.ingredients
					: [];
				const now = Date.now();

				for (const ingredient of ingredients) {
					const ingredientId = String((ingredient as any)?.inventoryId ?? "");
					const amount = Number((ingredient as any)?.amount ?? 0) * batchMultiplier;
					if (!ingredientId || amount <= 0) continue;
					const { data: ingredientRow, error: ingredientError } = await pos
						.from("inventory")
						.select("quantity")
						.eq("source_id", ingredientId)
						.maybeSingle();
					if (ingredientError) throw ingredientError;
					if (!ingredientRow) continue;
					const currentQty = Number(ingredientRow.quantity ?? 0);
					const nextQty = Math.max(0, currentQty - amount);
					const { error: deductError } = await pos
						.from("inventory")
						.update({ quantity: nextQty })
						.eq("source_id", ingredientId);
					if (deductError) throw deductError;

					const { error: usageTxError } = await pos
						.from("inventory_transactions")
						.insert({
							source_id: makeSourceId("invtx"),
							inventory_source_id: ingredientId,
							quantity: -amount,
							tx_type: "usage",
							tx_timestamp: now,
							notes: "Automated deduction for recipe use/production",
							creation_time: Date.now(),
							raw: {
								baseRecipeId,
								inventoryId,
								batchMultiplier,
								ingredientId,
							},
						});
					if (usageTxError) throw usageTxError;
				}

				const addedQuantity =
					Number(recipe.target_quantity ?? 0) * batchMultiplier;
				const { error: targetUpdateError } = await pos
					.from("inventory")
					.update({
						quantity: Number(targetItem.quantity ?? 0) + addedQuantity,
						last_purchase_at: now,
					})
					.eq("source_id", inventoryId);
				if (targetUpdateError) throw targetUpdateError;

				const { error: productionTxError } = await pos
					.from("inventory_transactions")
					.insert({
						source_id: makeSourceId("invtx"),
						inventory_source_id: inventoryId,
						quantity: addedQuantity,
						remaining_quantity: addedQuantity,
						tx_type: "production",
						tx_timestamp: now,
						notes: args?.notes || `Produced from recipe: ${recipe.name ?? ""}`,
						creation_time: Date.now(),
						raw: {
							baseRecipeId,
							inventoryId,
							batchMultiplier,
						},
					});
				if (productionTxError) throw productionTxError;
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-produce-base-recipe-batch]",
					error
				);
				throw error;
			}
		},
		[fallback]
	);
}

export function useHybridMayarCreateInvoice() {
	const fallback = useAction(api.mayar.createInvoice);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				// TODO: add Supabase Edge Function replacement for Mayar integration.
				throw new Error("Supabase Mayar function not configured");
			} catch {
				return fallback(args);
			}
		},
		[fallback]
	);
}

export function useHybridMayarGetInvoiceDetail() {
	const fallback = useAction(api.mayar.getInvoiceDetail);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				// TODO: add Supabase Edge Function replacement for Mayar integration.
				throw new Error("Supabase Mayar function not configured");
			} catch {
				return fallback(args);
			}
		},
		[fallback]
	);
}

export function useHybridSendShiftReportEmail() {
	const fallback = useAction(api.reportsEmail.sendShiftReportEmail);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				// TODO: move to Supabase Edge Function email sender.
				throw new Error("Supabase report email function not configured");
			} catch {
				return fallback(args);
			}
		},
		[fallback]
	);
}

export function useHybridSendDailySummaryEmail() {
	const fallback = useAction(api.reportsEmail.sendDailySummaryEmail);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				// TODO: move to Supabase Edge Function email sender.
				throw new Error("Supabase daily summary email function not configured");
			} catch {
				return fallback(args);
			}
		},
		[fallback]
	);
}

export function useHybridDeductOrderInventory() {
	const applyStockAction = useHybridApplyInventoryStockAction();

	return useCallback(
		async (args: { orderId: string; orderNumber?: string }) => {
			if (!hasSupabaseConfig) return { deductedCount: 0, skippedCount: 0, lowStockWarnings: [], inventoryWarnings: [] };

			const orderId = String(args?.orderId ?? "");
			if (!orderId) throw new Error("orderId wajib diisi");

			const supabase = createClient();
			const pos = supabase.schema("pos");

			const { data: items, error: itemsError } = await pos
				.from("order_items")
				.select("source_id, product_source_id, product_name, quantity")
				.eq("order_source_id", orderId);
			if (itemsError) throw itemsError;
			if (!items?.length) return { deductedCount: 0, skippedCount: 0, lowStockWarnings: [], inventoryWarnings: [] };

			const productIds: string[] = Array.from(
				new Set(items.map((i: any) => String(i.product_source_id)))
			);
			const { data: recipes, error: recipesError } = await pos
				.from("recipes")
				.select("source_id, product_source_id, variant_name, ingredients")
				.in("product_source_id", productIds)
				.is("variant_name", null);
			if (recipesError) throw recipesError;

			const recipeMap = new Map<string, any>();
			for (const r of recipes ?? []) {
				recipeMap.set(r.product_source_id, r);
			}

			let deductedCount = 0;
			let skippedCount = 0;
			const lowStockWarnings: string[] = [];
			const inventoryWarnings: string[] = [];
			const orderNumber = args?.orderNumber ?? orderId.slice(-6);

			for (const item of items as any[]) {
				const productId = String(item.product_source_id);
				const multiplier = Number(item.quantity ?? 1);
				const productName = String(item.product_name ?? "");

				// Step 1: Decrement menu product stock
				try {
					const { data: productRow } = await pos
						.from("products")
						.select("quantity")
						.eq("source_id", productId)
						.maybeSingle();
					if (productRow) {
						const currentQty = Number(productRow.quantity ?? 0);
						const newQty = Math.max(0, currentQty - multiplier);
						await pos
							.from("products")
							.update({ quantity: newQty })
							.eq("source_id", productId);
						if (newQty <= 2 && newQty > 0) {
							lowStockWarnings.push(`⚠️ Stok "${productName}" sisa ${newQty} porsi lagi!`);
						} else if (newQty <= 0) {
							lowStockWarnings.push(`❌ "${productName}" sudah habis!`);
						}
					}
				} catch (e) {
					console.warn(`[deduct-menu-stock] Gagal update stok menu ${productId}:`, e);
				}

				// Step 2: Deduct inventory ingredients (existing logic)
				const recipe = recipeMap.get(productId);
				if (!recipe) {
					skippedCount++;
					continue;
				}

				const ingredients = Array.isArray(recipe.ingredients)
					? recipe.ingredients.filter(
							(ing: any) =>
								typeof ing?.inventoryId === "string" &&
								Number(ing?.amount ?? 0) > 0
					  )
					: [];

				if (ingredients.length === 0) {
					skippedCount++;
					continue;
				}

				for (const ing of ingredients) {
					// Fetch current inventory qty and threshold BEFORE deducting
					let lowThreshold = 0;
					try {
						const { data: invRow } = await pos
							.from("inventory")
							.select("quantity, low_stock_threshold, ingredient_name")
							.eq("source_id", ing.inventoryId)
							.maybeSingle();
						if (invRow) {
							const invQty = Number(invRow.quantity ?? 0);
							lowThreshold = Number((invRow as any).low_stock_threshold ?? 0);
							const afterQty = invQty - Number(ing.amount) * multiplier;
							if (lowThreshold > 0 && afterQty <= lowThreshold && invQty > lowThreshold) {
								const invName = String((invRow as any).ingredient_name ?? ing.inventoryId);
								inventoryWarnings.push(`🛒 "${invName}" perlu dibeli! Stok sisa ${Math.max(0, afterQty)} (threshold: ${lowThreshold})`);
							}
						}
					} catch (_) {}

					await applyStockAction({
						inventoryId: ing.inventoryId,
						action: "usage",
						quantity: Number(ing.amount) * multiplier,
						notes: `Auto-deduct order #${orderNumber}: ${item.product_name} x${multiplier}`,
					});
					deductedCount++;
				}
			}

			return { deductedCount, skippedCount, lowStockWarnings, inventoryWarnings };
		},
		[applyStockAction]
	);
}
export function useHybridSyncMenuStockFromInventory() {
	return useCallback(
		async () => {
			if (!hasSupabaseConfig) return { updatedCount: 0 };

			const supabase = createClient();
			const pos = supabase.schema("pos");

			// 1. Fetch all recipes from pos_recipes view
			const { data: recipes, error: recipesError } = await supabase
				.from("pos_recipes")
				.select("_id, productId, ingredients");
			if (recipesError) throw recipesError;
			if (!recipes?.length) return { updatedCount: 0 };

			let updatedCount = 0;

			for (const recipe of recipes as any[]) {
				const ingredients = Array.isArray(recipe.ingredients)
					? recipe.ingredients.filter(
							(ing: any) =>
								typeof ing?.inventoryId === "string" &&
								Number(ing?.amount ?? 0) > 0
					  )
					: [];

				if (ingredients.length === 0) continue;
				if (!recipe.productId) continue;

				// 2. Extract all inventoryIds from ingredients
				const inventoryIds: string[] = ingredients.map(
					(ing: any) => ing.inventoryId
				);

				// 3. Fetch current quantities of those inventory items
				const { data: inventoryItems, error: invError } = await pos
					.from("inventory")
					.select("source_id, quantity")
					.in("source_id", inventoryIds);
				if (invError) throw invError;

				const invMap = new Map<string, number>();
				for (const inv of inventoryItems ?? []) {
					invMap.set(inv.source_id, Number(inv.quantity ?? 0));
				}

				// 4. Calculate potentialStock = min over ingredients of (inv.quantity / ing.amount) using FLOOR
				let potentialStock = Infinity;
				for (const ing of ingredients) {
					const invQty = invMap.get(ing.inventoryId) ?? 0;
					const amount = Number(ing.amount ?? 0);
					if (amount <= 0) continue;
					const possible = Math.floor(invQty / amount);
					if (possible < potentialStock) {
						potentialStock = possible;
					}
				}

				if (!Number.isFinite(potentialStock) || potentialStock < 0) {
					potentialStock = 0;
				}

				// 5. Get current product quantity from pos.products table
				const { data: productRow, error: prodError } = await pos
					.from("products")
					.select("quantity")
					.eq("source_id", recipe.productId)
					.maybeSingle();
				if (prodError) throw prodError;

				const currentQuantity = Number(productRow?.quantity ?? 0);

				// 6. Update product quantity to max(current, potentialStock)
				const newQuantity = Math.max(currentQuantity, potentialStock);
				if (newQuantity !== currentQuantity) {
					const { error: updateError } = await pos
						.from("products")
						.update({ quantity: newQuantity })
						.eq("source_id", recipe.productId);
					if (updateError) throw updateError;
					updatedCount++;
				}
			}

			return { updatedCount };
		},
		[]
	);
}

export function useHybridSendShiftTableReportEmail() {
	const fallback = useAction(api.reportsEmail.sendShiftTableReportEmail);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				// TODO: move to Supabase Edge Function email sender.
				throw new Error("Supabase shift table email function not configured");
			} catch {
				return fallback(args);
			}
		},
		[fallback]
	);
}




