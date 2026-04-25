import { createClient } from "@/lib/client";
import { useAction, useMutation } from "@/lib/backend-bridge";
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
}) {
	const sourcePrefix = getOrderSourcePrefix(args.source);
	const typeCode = getOrderTypeCode(args.orderType);
	const timeCode = args.createdAt.toString(36).toUpperCase().slice(-6);
	const randomCode = Math.random().toString(36).toUpperCase().slice(2, 4);
	return `${sourcePrefix}-${typeCode}-${timeCode}${randomCode}`;
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
				console.warn("[supabase-hybrid:storage-upload] fallback disabled", error);
				return uploadViaLegacyUrl(fallback, args);
			}
		},
		[defaultFolder, fallback]
	);
}

export function useHybridBulkCreateProducts() {
	return useLegacyFallbackMutation(api.products.bulkCreateProducts);
}

export function useHybridCreateCategory() {
	return useLegacyFallbackMutation(api.products.createCategory);
}

export function useHybridUpdateCategory() {
	return useLegacyFallbackMutation(api.products.updateCategory);
}

export function useHybridDeleteCategory() {
	return useLegacyFallbackMutation(api.products.deleteCategory);
}

export function useHybridAddProduct() {
	return useLegacyFallbackMutation(api.products.addProduct);
}

export function useHybridCreateProduct() {
	return useLegacyFallbackMutation(api.products.createProduct);
}

export function useHybridUpdateProduct() {
	return useLegacyFallbackMutation(api.products.updateProduct);
}

export function useHybridDeleteProduct() {
	return useLegacyFallbackMutation(api.products.deleteProduct);
}

export function useHybridBulkUpdateProducts() {
	return useLegacyFallbackMutation(api.products.bulkUpdateProducts);
}

export function useHybridGenerateProductUploadUrl() {
	return useHybridStorageUpload(api.products.generateUploadUrl, "products");
}

export function useHybridAddVariationPreset() {
	return useLegacyFallbackMutation(api.products.addVariationPreset);
}

export function useHybridUpdateVariationPreset() {
	return useLegacyFallbackMutation(api.products.updateVariationPreset);
}

export function useHybridDeleteVariationPreset() {
	return useLegacyFallbackMutation(api.products.deleteVariationPreset);
}

export function useHybridCreateBaseRecipe() {
	return useLegacyFallbackMutation(api.inventory.createBaseRecipe);
}

export function useHybridUpdateBaseRecipe() {
	return useLegacyFallbackMutation(api.inventory.updateBaseRecipe);
}

export function useHybridDeleteBaseRecipe() {
	return useLegacyFallbackMutation(api.inventory.deleteBaseRecipe);
}

export function useHybridSaveRecipe() {
	return useLegacyFallbackMutation(api.inventory.saveRecipe);
}

export function useHybridDeleteRecipe() {
	return useLegacyFallbackMutation(api.inventory.deleteRecipe);
}

export function useHybridEnsureInventoryItemForBaseRecipe() {
	return useLegacyFallbackMutation(api.inventory.ensureInventoryItemForBaseRecipe);
}

export function useHybridCreateInventoryItem() {
	return useLegacyFallbackMutation(api.inventory.createInventoryItem);
}

export function useHybridUpdateInventoryItem() {
	return useLegacyFallbackMutation(api.inventory.updateInventoryItem);
}

export function useHybridDeleteInventoryItem() {
	return useLegacyFallbackMutation(api.inventory.deleteInventoryItem);
}

export function useHybridCreateInventoryStore() {
	return useLegacyFallbackMutation(api.inventory.createInventoryStore);
}

export function useHybridSetInventoryReferencePrice() {
	return useLegacyFallbackMutation(api.inventory.setInventoryReferencePrice);
}

export function useHybridAddStock() {
	return useLegacyFallbackMutation(api.inventory.addStock);
}

export function useHybridSuggestInventoryAutofill() {
	return useLegacyFallbackAction(api.inventory.suggestInventoryAutofill);
}

export function useHybridUpdateOrderItemStatus() {
	return useLegacyFallbackMutation(api.kitchenBar.updateOrderItemStatus);
}

export function useHybridCreateDiscount() {
	return useLegacyFallbackMutation(api.discounts.createDiscount);
}

export function useHybridUpdateDiscount() {
	return useLegacyFallbackMutation(api.discounts.updateDiscount);
}

export function useHybridDeleteDiscount() {
	return useLegacyFallbackMutation(api.discounts.deleteDiscount);
}

export function useHybridCreateHppCalculation() {
	return useLegacyFallbackMutation(api.hpp.createHppCalculation);
}

export function useHybridUpdateHppCalculation() {
	return useLegacyFallbackMutation(api.hpp.updateHppCalculation);
}

export function useHybridDeleteHppCalculation() {
	return useLegacyFallbackMutation(api.hpp.deleteHppCalculation);
}

export function useHybridSyncHppWithInventoryPrices() {
	return useLegacyFallbackMutation(api.hpp.syncHppWithInventoryPrices);
}

export function useHybridUpsertHppFromRecipe() {
	return useLegacyFallbackMutation(api.hpp.upsertHppFromRecipe);
}

export function useHybridApplyHppSellingPriceToProduct() {
	return useLegacyFallbackMutation(api.hpp.applyHppSellingPriceToProduct);
}

export function useHybridCreateGame() {
	return useLegacyFallbackMutation(api.minigames.createGame);
}

export function useHybridUpdateGame() {
	return useLegacyFallbackMutation(api.minigames.updateGame);
}

export function useHybridDeleteGame() {
	return useLegacyFallbackMutation(api.minigames.deleteGame);
}

export function useHybridCreateEntryManually() {
	return useLegacyFallbackMutation(api.minigames.createEntryManually);
}

export function useHybridUpdateEntry() {
	return useLegacyFallbackMutation(api.minigames.updateEntry);
}

export function useHybridDeleteEntry() {
	return useLegacyFallbackMutation(api.minigames.deleteEntry);
}

export function useHybridSpin() {
	return useLegacyFallbackMutation(api.minigames.spin);
}

export function useHybridProcessReceipt() {
	return useLegacyFallbackAction(api.ai.processReceipt);
}

export function useHybridProcessImageAndGenerate() {
	return useLegacyFallbackAction(api.ai.processImageAndGenerate);
}

export function useHybridBatchProcessReceipts() {
	return useLegacyFallbackAction(api.ai.batchProcessReceipts);
}

export function useHybridBatchGenerateTransactions() {
	return useLegacyFallbackAction(api.ai.batchGenerateTransactions);
}

export function useHybridGenerateScanReport() {
	return useLegacyFallbackAction(api.ai.generateScanReport);
}

export function useHybridGenerateDiscountStrategy() {
	return useLegacyFallbackAction(api.ai.generateDiscountStrategy);
}

export function useHybridFillHppInventoryCostsFromTransactions() {
	return useLegacyFallbackAction(api.ai.fillHppInventoryCostsFromTransactions);
}

export function useHybridGenerateProductDescription() {
	return useLegacyFallbackAction(api.ai.generateProductDescription);
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
	return useLegacyFallbackMutation(api.aiMemory.createChatSession);
}

export function useHybridDeleteChatSession() {
	return useLegacyFallbackMutation(api.aiMemory.deleteChatSession);
}

export function useHybridSaveConversationContext() {
	return useLegacyFallbackMutation(api.aiMemory.saveConversationContext);
}

export function useHybridCompleteTask() {
	return useLegacyFallbackMutation(api.aiMemory.completeTask);
}

export function useHybridDismissTask() {
	return useLegacyFallbackMutation(api.aiMemory.dismissTask);
}

export function useHybridRecordStockPurchase() {
	return useLegacyFallbackMutation(api.stockPurchases.recordStockPurchase);
}

export function useHybridCreateOrder() {
	const fallback = useMutation(api.orders.createOrder);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) {
				return fallback(args);
			}

			try {
				const supabase = createClient();
				const pos = supabase.schema("pos");

				const orderCreatedAt = Number(args?.createdAt ?? Date.now());
				const orderNumber = generateOrderNumber({
					source: args?.source,
					orderType: args?.orderType,
					createdAt: orderCreatedAt,
				});
				const isOpenBill = Boolean(args?.isOpenBill);
				const autoComplete = Boolean(args?.autoComplete);
				const nextStatus = isOpenBill
					? "pending"
					: autoComplete
						? "completed"
						: "paid";
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
					payment_gateway: args?.paymentGateway ?? null,
					gateway_invoice_id: args?.paymentGateway?.invoiceId ?? null,
					creation_time: orderCreatedAt,
					raw: args ?? {},
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

				if (!isOpenBill) {
					const financialRow = {
						source_id: makeSourceId("fin"),
						tx_type: "income",
						amount: Number(args?.totalAmount ?? 0),
						category: "Penjualan",
						description: `Penjualan Pesanan #${orderNumber}`,
						tx_date: orderCreatedAt,
						payment_method: args?.paymentMethod ?? null,
						status: "completed",
						order_source_id: orderId,
						creation_time: Date.now(),
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

				return orderId;
			} catch (error) {
				console.warn("[supabase-hybrid:write-create-order] fallback disabled", error);
				return fallback(args);
			}
		},
		[fallback]
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

				if (Object.keys(updates).length === 0) {
					return;
				}

				const supabase = createClient();
				const { error } = await supabase
					.schema("pos")
					.from("orders")
					.update(updates)
					.eq("source_id", id);
				if (error) throw error;
				return;
			} catch (error) {
				console.warn("[supabase-hybrid:write-update-order] fallback disabled", error);
				return fallback(args);
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
				console.warn("[supabase-hybrid:write-delete-order] fallback disabled", error);
				return fallback(args);
			}
		},
		[fallback]
	);
}

export function useHybridUpdateOrderStatus() {
	const fallback = useMutation(api.orders.updateOrderStatus);
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
					.select(
						"source_id, status, order_number, total_amount, payment_method, created_at"
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
				return;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-update-order-status] fallback disabled",
					error
				);
				return fallback(args);
			}
		},
		[fallback]
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
					.select(
						"source_id, status, order_number, total_amount, payment_method, payment_receipt_kind"
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
					"[supabase-hybrid:write-update-order-payment-gateway] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-create-booking-order] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-update-booking-status] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-patch-booking-order] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-delete-booking-order] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-upload-booking-payment-proof] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-update-booking-settings] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-set-booking-date-capacity] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-set-booking-bulk-date-capacity] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-create-customer-service] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-update-customer-service-status] fallback disabled",
					error
				);
				return fallback(args);
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

				const sourceId = makeSourceId("fin");
				const row = {
					source_id: sourceId,
					tx_type: type,
					amount: Number(args?.amount ?? 0),
					category,
					merchant: args?.merchant ?? null,
					description: args?.description ?? null,
					tx_date: date,
					payment_method: args?.paymentMethod ?? null,
					status: args?.status ?? "completed",
					attachment_url: args?.attachmentUrl ?? null,
					source_fingerprint: args?.sourceFingerprint ?? null,
					is_recurring:
						args?.isRecurring === undefined ? null : Boolean(args.isRecurring),
					recurring_interval: args?.recurringInterval ?? null,
					tags: Array.isArray(args?.tags) ? args.tags : null,
					metadata,
					creation_time: Date.now(),
					raw: args ?? {},
				};

				const { error } = await createClient()
					.schema("pos")
					.from("financial_transactions")
					.insert(row);
				if (error) throw error;
				return sourceId;
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-create-transaction] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-update-transaction] fallback disabled",
					error
				);
				return fallback(args);
			}
		},
		[fallback]
	);
}

export function useHybridRecordExpenseIntake() {
	const fallback = useMutation((api as any).expenseIntake.recordExpense);
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

				const supabase = createClient();
				const pos = supabase.schema("pos");
				const existingId = args?.existingTransactionId
					? String(args.existingTransactionId)
					: "";

				if (existingId) {
					const { error: updateError } = await pos
						.from("financial_transactions")
						.update({
							tx_type: type,
							amount,
							category,
							merchant: tx?.merchant ?? null,
							description: tx?.description ?? null,
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
					return {
						transactionId: existingId,
						createdTransaction: false,
						syncOutcome: "finance_only",
						warnings: [] as string[],
						createdCount: 0,
						matchedCount: 0,
						updatedCount: 0,
						hppUpdatedCalculations: 0,
						hppUpdatedIngredients: 0,
						items: [],
						message: "Transaksi keuangan berhasil diperbarui",
					};
				}

				const transactionId = makeSourceId("fin");
				const { error: createError } = await pos
					.from("financial_transactions")
					.insert({
						source_id: transactionId,
						tx_type: type,
						amount,
						category,
						merchant: tx?.merchant ?? null,
						description: tx?.description ?? null,
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
						creation_time: Date.now(),
						raw: {
							...(args ?? {}),
							transaction: tx,
						},
					});
				if (createError) throw createError;

				return {
					transactionId,
					createdTransaction: true,
					syncOutcome: "finance_only",
					warnings: [] as string[],
					createdCount: 0,
					matchedCount: 0,
					updatedCount: 0,
					hppUpdatedCalculations: 0,
					hppUpdatedIngredients: 0,
					items: [],
					message: "Transaksi keuangan berhasil disimpan",
				};
			} catch (error) {
				console.warn(
					"[supabase-hybrid:write-record-expense-intake] fallback disabled",
					error
				);
				return fallback(args);
			}
		},
		[fallback]
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
					"[supabase-hybrid:write-delete-transaction] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-delete-transactions-bulk] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-delete-transaction-scan-item] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-update-transaction-scan-item] fallback disabled",
					error
				);
				return fallback(args);
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
				console.warn("[supabase-hybrid:write-start-shift] fallback disabled", error);
				return fallback(args);
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
					.from("pos_shifts")
					.update({
						endTime: endTime,
						endingCashPhysical: Number(args?.endingCashPhysical ?? 0),
						endingCashExpected: endingCashExpected,
						nonCashConfirmed: Number(args?.nonCashConfirmed ?? 0),
						nonCashExpected: nonCashExpected,
						cashBreakdown: args?.cashBreakdown ?? null,
						notes: args?.notes ?? shift.notes ?? null,
						summary,
						raw: {
							...(shift.raw ?? {}),
							closingTasks: args?.closingTasks ?? null,
						},
					})
					.eq("_id", shiftId);
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
					.from("pos_financial_transactions")
					.insert({
						_id: makeSourceId("fin"),
						type: "income",
						amount: Number(args?.endingCashPhysical ?? 0),
						category: "Setoran Akhir",
						description: `${args?.notes || "Akhiri Shift"}${summaryText}`,
						date: endTime,
						status: "completed",
						paymentMethod: "tunai",
						metadata,
					});
				if (closingTxError) {
					console.warn("[supabase-hybrid:write-end-shift] failed to insert closing transaction", closingTxError);
				}
				return shiftId;
			} catch (error) {
				console.warn("[supabase-hybrid:write-end-shift] fallback disabled", error);
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
					"[supabase-hybrid:write-set-financial-target] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-admin-update-shift] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-admin-delete-shift] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-admin-bulk-delete-shifts] fallback disabled",
					error
				);
				return fallback(args);
			}
		},
		[fallback]
	);
}

export function useHybridClockIn() {
	const fallback = useMutation(api.attendance.clockIn);
	return useCallback(
		async (args: any) => {
			if (!hasSupabaseConfig) return fallback(args);
			try {
				const userId = String(args?.userId ?? "");
				if (!userId) throw new Error("userId wajib");
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
				console.warn("[supabase-hybrid:write-clock-in] fallback disabled", error);
				return fallback(args);
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
				console.warn("[supabase-hybrid:write-clock-out] fallback disabled", error);
				return fallback(args);
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
				console.warn("[supabase-hybrid:write-verify-home-pin] fallback disabled", error);
				return fallback(args);
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
				console.warn("[supabase-hybrid:write-enroll-face] fallback disabled", error);
				return fallback(args);
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
				const { error } = await createClient()
					.from("yumi_users")
					.update({
						home_pin_fingerprint: nextFingerprint,
						raw: {
							...(user.raw ?? {}),
							homePin: newPin,
						},
					})
					.eq("source_id", user.source_id);
				if (error) throw error;
				return { success: true };
			} catch (error) {
				console.warn("[supabase-hybrid:write-update-user-pin] fallback disabled", error);
				return fallback(args);
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
					"[supabase-hybrid:write-update-user-profile] fallback disabled",
					error
				);
				return fallback(args);
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
					.select("source_id, raw")
					.order("creation_time", { ascending: false })
					.limit(1)
					.maybeSingle();
				if (existingError) throw existingError;

				const payload = {
					store_name: args?.storeName ?? null,
					store_address: args?.storeAddress ?? null,
					store_phone: args?.storePhone ?? null,
					app_name: args?.appName ?? null,
					app_version: args?.appVersion ?? null,
					tax_rate:
						args?.taxRate === undefined ? null : Number(args.taxRate ?? 0),
					service_charge_rate:
						args?.serviceChargeRate === undefined
							? null
							: Number(args.serviceChargeRate ?? 0),
					raw: {
						...(existing?.raw ?? {}),
						...(args ?? {}),
					},
				};

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
					"[supabase-hybrid:write-update-site-settings] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-admin-create-attendance-log] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-admin-update-attendance-log] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-admin-delete-attendance-log] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-admin-bulk-delete-attendance-logs] fallback disabled",
					error
				);
				return fallback(args);
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
					raw: {
						...(args ?? {}),
						homePin: homePin || undefined,
					},
				});
				if (error) throw error;
				return sourceId;
			} catch (error) {
				console.warn("[supabase-hybrid:write-create-user] fallback disabled", error);
				return fallback(args);
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
					...(args ?? {}),
				};
				const { error } = await supabase
					.from("yumi_users")
					.update(updates)
					.eq("source_id", id);
				if (error) throw error;
				return id;
			} catch (error) {
				console.warn("[supabase-hybrid:write-update-user] fallback disabled", error);
				return fallback(args);
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
				console.warn("[supabase-hybrid:write-delete-user] fallback disabled", error);
				return fallback(args);
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
				console.warn("[supabase-hybrid:write-create-role] fallback disabled", error);
				return fallback(args);
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
				console.warn("[supabase-hybrid:write-update-role] fallback disabled", error);
				return fallback(args);
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
				console.warn("[supabase-hybrid:write-delete-role] fallback disabled", error);
				return fallback(args);
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
					"[supabase-hybrid:write-bind-user-profile] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-apply-inventory-stock-action] fallback disabled",
					error
				);
				return fallback(args);
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
					"[supabase-hybrid:write-produce-base-recipe-batch] fallback disabled",
					error
				);
				return fallback(args);
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




