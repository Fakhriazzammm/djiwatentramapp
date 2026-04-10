import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import {
	getBookingFinancialSnapshot,
	getOrderFinancialSnapshot,
	isSettledBooking,
	isSettledOrder,
} from "./financialMetrics";

type ProductLookup = Record<
	string,
	{
		productName: string;
		categoryName: string;
	}
>;

type ShiftReportDetail = {
	totalRevenue: number;
	totalGrossSales: number;
	totalDiscount: number;
	totalExpenses: number;
	totalItemsSold: number;
	posRevenue: number;
	bookingRevenue: number;
	cashRevenue: number;
	qrisRevenue: number;
	otherRevenue: number;
	orderCount: number;
	bookingCount: number;
	paymentMethods: Record<string, number>;
	productBreakdown: Array<{
		categoryName: string;
		totalQuantity: number;
		items: Array<{
			productName: string;
			quantity: number;
		}>;
	}>;
	topProducts: Array<{
		productName: string;
		quantity: number;
	}>;
	expenseBreakdown: Array<{
		category: string;
		amount: number;
	}>;
	recentTransactions: Array<{
		type: "pos" | "booking";
		id: string;
		amount: number;
		status: string;
		time: number;
		name: string;
		paymentMethod?: string;
	}>;
};

// Helper to get start/end of a month
function getMonthRange(year: number, month: number) {
	const start = new Date(year, month, 1, 0, 0, 0, 0).getTime();
	const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
	return { start, end };
}

// Helper to get start of week (Monday)
function getWeekStart(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = (day === 0 ? -6 : 1) - day;
	d.setDate(d.getDate() + diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

function getMonthKey(timestamp: number) {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getLocalDateKey(timestamp: number) {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate(),
	).padStart(2, "0")}`;
}

function getDaysInMonth(timestamp: number) {
	const date = new Date(timestamp);
	return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function buildShiftTargetSummary(args: {
	targetRevenue?: number;
	shiftsPerDay: number;
	timestamp: number;
	shiftRevenue: number;
	dailyCollected: number;
}) {
	const { targetRevenue, shiftsPerDay, timestamp, shiftRevenue, dailyCollected } = args;

	if (!targetRevenue || targetRevenue <= 0) {
		return {
			hasTarget: false,
			targetMonth: getMonthKey(timestamp),
			dailyTarget: 0,
			shiftTarget: 0,
			dailyCollected,
			shiftCollected: shiftRevenue,
			dailyTargetProgress: 0,
			shiftTargetProgress: 0,
			isDailyTargetMet: false,
			isShiftTargetMet: false,
		};
	}

	const dailyTarget = targetRevenue / getDaysInMonth(timestamp);
	const safeShiftsPerDay = Math.max(1, shiftsPerDay);
	const shiftTarget = dailyTarget / safeShiftsPerDay;
	const dailyTargetProgress =
		dailyTarget > 0 ? Math.min((dailyCollected / dailyTarget) * 100, 100) : 0;
	const shiftTargetProgress =
		shiftTarget > 0 ? Math.min((shiftRevenue / shiftTarget) * 100, 100) : 0;

	return {
		hasTarget: true,
		targetMonth: getMonthKey(timestamp),
		dailyTarget,
		shiftTarget,
		dailyCollected,
		shiftCollected: shiftRevenue,
		dailyTargetProgress,
		shiftTargetProgress,
		isDailyTargetMet: dailyCollected >= dailyTarget,
		isShiftTargetMet: shiftRevenue >= shiftTarget,
	};
}

function normalizePaymentMethod(method?: string | null) {
	return (method || "").trim().toLowerCase();
}

function isCashMethod(method?: string | null) {
	const normalized = normalizePaymentMethod(method);
	return normalized === "cash" || normalized === "tunai";
}

function isNonCashMethod(method?: string | null) {
	const normalized = normalizePaymentMethod(method);
	return normalized === "qris" || normalized === "transfer" || normalized === "bank_transfer";
}

/**
 * Shared internal helper to fetch financial transactions with common filters
 */
async function fetchTransactionsInternal(
	ctx: QueryCtx,
	args: {
		type?: "income" | "expense";
		startDate?: number;
		endDate?: number;
		category?: string;
		status?: "completed" | "pending" | "cancelled";
	}
) {
	const { type, startDate, endDate, category, status } = args;

	let q =
		startDate !== undefined || endDate !== undefined
			? ctx.db.query("financialTransactions").withIndex("by_date", (q) => {
					if (startDate !== undefined && endDate !== undefined) {
						return q.gte("date", startDate).lte("date", endDate);
					}
					if (startDate !== undefined) {
						return q.gte("date", startDate);
					}
					if (endDate !== undefined) {
						return q.lte("date", endDate);
					}
					return q;
				})
			: ctx.db.query("financialTransactions").withIndex("by_date");

	if (type) {
		q = q.filter((f) => f.eq(f.field("type"), type));
	}
	if (category) {
		q = q.filter((f) => f.eq(f.field("category"), category));
	}
	if (status) {
		q = q.filter((f) => f.eq(f.field("status"), status));
	}

	return q;
}

async function buildShiftSummary(
	ctx: QueryCtx,
	startTime: number,
	endTime: number
) {
	const orders = await ctx.db
		.query("orders")
		.withIndex("by_createdAt", (q) => q.gte("createdAt", startTime).lte("createdAt", endTime))
		.collect();

	const bookings = await ctx.db
		.query("bookingOrders")
		.withIndex("by_createdAt", (q) => q.gte("createdAt", startTime).lte("createdAt", endTime))
		.collect();

	const shiftTransactions = await ctx.db
		.query("financialTransactions")
		.withIndex("by_date", (q) => q.gte("date", startTime).lte("date", endTime))
		.collect();

	let totalRevenue = 0;
	let cashRevenue = 0;
	let qrisRevenue = 0;
	let totalItemsSold = 0;
	let totalDiscount = 0;
	let totalExpenses = 0;

	orders.forEach((o) => {
		if (isSettledOrder(o)) {
			const snapshot = getOrderFinancialSnapshot(o);
			totalRevenue += snapshot.finalCollected;
			totalDiscount += snapshot.discount;
			if (isCashMethod(o.paymentMethod)) cashRevenue += snapshot.finalCollected;
			else if (isNonCashMethod(o.paymentMethod)) qrisRevenue += snapshot.finalCollected;
			totalItemsSold += (o.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
		}
	});

	bookings.forEach((b) => {
		if (isSettledBooking(b)) {
			const snapshot = getBookingFinancialSnapshot(b);
			totalRevenue += snapshot.finalCollected;
			if (isCashMethod(b.paymentMethod)) cashRevenue += snapshot.finalCollected;
			else if (isNonCashMethod(b.paymentMethod)) qrisRevenue += snapshot.finalCollected;
			totalItemsSold += (b.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
		}
	});

	shiftTransactions.forEach((t) => {
		if (t.type === "expense" && t.status === "completed") {
			totalExpenses += t.amount;
		}
	});

	return {
		totalRevenue,
		totalExpenses,
		totalItemsSold,
		cashRevenue,
		qrisRevenue,
		totalDiscount,
	};
}

async function buildProductLookup(ctx: QueryCtx): Promise<ProductLookup> {
	const [categories, products] = await Promise.all([
		ctx.db.query("categories").collect(),
		ctx.db.query("products").collect(),
	]);

	const categoryMap = new Map(
		categories.map((category) => [category._id, category.name]),
	);

	return products.reduce<ProductLookup>((lookup, product) => {
		lookup[product._id] = {
			productName: product.name,
			categoryName: categoryMap.get(product.categoryId) ?? "Lainnya",
		};
		return lookup;
	}, {});
}

function prettifyTransactionLabel(label: string) {
	return label
		.replace(/\[|\]/g, "")
		.replace(/_/g, " ")
		.trim();
}

function parseTransactionDetails(description?: string) {
	if (!description) {
		return {
			title: null,
			summary: null,
			details: [] as Array<{ label: string; value: string }>,
		};
	}

	const lines = description
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	let title: string | null = null;
	const details: Array<{ label: string; value: string }> = [];

	for (const line of lines) {
		if (/^\[.*\]$/.test(line)) {
			title = prettifyTransactionLabel(line);
			continue;
		}

		const pipeSegments = line.split("|").map((segment) => segment.trim()).filter(Boolean);
		if (pipeSegments.length > 1) {
			for (const segment of pipeSegments) {
				const separatorIndex = segment.indexOf(":");
				if (separatorIndex > 0) {
					details.push({
						label: prettifyTransactionLabel(segment.slice(0, separatorIndex)),
						value: segment.slice(separatorIndex + 1).trim(),
					});
				} else {
					details.push({ label: "Detail", value: segment });
				}
			}
			continue;
		}

		const separatorIndex = line.indexOf(":");
		if (separatorIndex > 0) {
			details.push({
				label: prettifyTransactionLabel(line.slice(0, separatorIndex)),
				value: line.slice(separatorIndex + 1).trim(),
			});
			continue;
		}

		if (!title) title = line;
		else details.push({ label: "Detail", value: line });
	}

	const summary = details
		.slice(0, 2)
		.map((detail) => `${detail.label}: ${detail.value}`)
		.join(" • ");

	return {
		title,
		summary: summary || null,
		details,
	};
}

function buildTransactionPresentation(
	transaction: any,
	relatedOrder: any,
	relatedBooking: any
) {
	const parsedDetails = parseTransactionDetails(transaction.description);
	const scanItems = Array.isArray(transaction.metadata?.scanItems)
		? transaction.metadata.scanItems
		: [];
	const receiptDetails = transaction.metadata?.receiptDetails || {};
	const receiptMetaDetails = [
		receiptDetails.merchantName
			? { label: "Merchant", value: receiptDetails.merchantName }
			: null,
		receiptDetails.receiptNumber
			? { label: "No Struk", value: receiptDetails.receiptNumber }
			: null,
		receiptDetails.date
			? {
					label: "Tanggal",
					value: `${receiptDetails.date}${receiptDetails.time ? ` ${receiptDetails.time}` : ""}`,
				}
			: null,
		receiptDetails.subtotal != null
			? {
					label: "Subtotal",
					value: `Rp${Math.round(Number(receiptDetails.subtotal) || 0).toLocaleString("id-ID")}`,
				}
			: null,
		receiptDetails.tax != null
			? {
					label: "Pajak",
					value: `Rp${Math.round(Number(receiptDetails.tax) || 0).toLocaleString("id-ID")}`,
				}
			: null,
		receiptDetails.serviceCharge != null
			? {
					label: "Service",
					value: `Rp${Math.round(Number(receiptDetails.serviceCharge) || 0).toLocaleString("id-ID")}`,
				}
			: null,
		receiptDetails.discount != null
			? {
					label: "Diskon",
					value: `Rp${Math.round(Number(receiptDetails.discount) || 0).toLocaleString("id-ID")}`,
				}
			: null,
	].filter(Boolean) as Array<{ label: string; value: string }>;
	const scanItemDetails = scanItems.slice(0, 4).map((item: any) => {
		const quantity = Number(item.quantity) || 1;
		const total =
			Number(item.total) ||
			((Number(item.price) || 0) * quantity);
		const unit = item.unit ? ` ${item.unit}` : "";
		return {
			label: item.name,
			value: `${quantity}${unit} • Rp${total.toLocaleString("id-ID")}`,
		};
	});
	const scanSummary =
		scanItems.length > 0
			? `${scanItems.length} item receipt tersimpan`
			: null;

	if (transaction.category === "Modal Awal") {
		return {
			displayTitle: transaction.merchant || "Modal Awal Shift",
			displaySummary: "Pembukaan shift dan modal kas awal",
			detailItems: parsedDetails.details,
		};
	}

	if (transaction.category === "Setoran Akhir") {
		return {
			displayTitle: transaction.merchant || "Setoran Akhir Shift",
			displaySummary: "Penutupan shift dan rekap setoran kas",
			detailItems: parsedDetails.details,
		};
	}

	if (relatedOrder) {
		const orderItems = Array.isArray(relatedOrder.items)
			? relatedOrder.items
					.slice(0, 4)
					.map((item: any) => `${item.productName} x${item.quantity}`)
					.join(", ")
			: "";
		return {
			displayTitle: relatedOrder.customerName || transaction.merchant || "Pesanan POS",
			displaySummary: orderItems || transaction.description || "Transaksi pesanan POS",
			detailItems: [
				{ label: "Order", value: relatedOrder.orderNumber || "-" },
				{ label: "Customer", value: relatedOrder.customerName || "Walk-in" },
				{ label: "Item", value: String(Array.isArray(relatedOrder.items) ? relatedOrder.items.length : 0) },
				{ label: "Pembayaran", value: relatedOrder.paymentMethod || transaction.paymentMethod || "-" },
				...(relatedOrder.tableNumber ? [{ label: "Meja", value: relatedOrder.tableNumber }] : []),
				...(relatedOrder.orderType ? [{ label: "Tipe", value: relatedOrder.orderType.replace(/_/g, " ") }] : []),
			],
		};
	}

	if (relatedBooking) {
		const bookingItems = Array.isArray(relatedBooking.items)
			? relatedBooking.items
					.slice(0, 4)
					.map((item: any) => `${item.name} x${item.quantity}`)
					.join(", ")
			: "";
		return {
			displayTitle: relatedBooking.customerName || transaction.merchant || "Booking",
			displaySummary: bookingItems || transaction.description || "Transaksi booking",
			detailItems: [
				{ label: "Booking", value: relatedBooking.bookingCode || "-" },
				{ label: "Tanggal", value: relatedBooking.bookingDate || "-" },
				{ label: "Tamu", value: String(relatedBooking.guestCount || 0) },
				{ label: "Status", value: relatedBooking.bookingStatus || "-" },
				{ label: "Pembayaran", value: relatedBooking.paymentStatus || "-" },
			],
		};
	}

	if (transaction.metadata?.source === "ai_bulk_finance") {
		return {
			displayTitle: transaction.merchant || parsedDetails.title || transaction.category,
			displaySummary:
				transaction.description ||
				scanSummary ||
				transaction.metadata?.rawText ||
				"Import bulk AI",
			detailItems: [
				{ label: "Sumber", value: "AI Bulk" },
				...(scanSummary ? [{ label: "Receipt", value: scanSummary }] : []),
				...scanItemDetails,
				...(transaction.metadata?.aiSessionId ? [{ label: "Sesi", value: transaction.metadata.aiSessionId }] : []),
				...(parsedDetails.details.length > 0 ? parsedDetails.details : []),
			].slice(0, 8),
		};
	}

	if (transaction.metadata?.source === "ai_receipt_scan") {
		return {
			displayTitle:
				transaction.merchant ||
				receiptDetails.merchantName ||
				parsedDetails.title ||
				transaction.category,
			displaySummary:
				transaction.description ||
				scanSummary ||
				"Hasil scan struk oleh AI",
			detailItems: [
				{ label: "Sumber", value: "AI Scan" },
				...receiptMetaDetails,
				...(scanSummary ? [{ label: "Receipt", value: scanSummary }] : []),
				...scanItemDetails,
				...(parsedDetails.details.length > 0 ? parsedDetails.details : []),
			].slice(0, 8),
		};
	}

	if (scanItems.length > 0) {
		return {
			displayTitle:
				parsedDetails.title ||
				transaction.merchant ||
				receiptDetails.merchantName ||
				transaction.category,
			displaySummary: parsedDetails.summary || scanSummary || transaction.description || null,
			detailItems: [
				...receiptMetaDetails,
				...(scanSummary ? [{ label: "Receipt", value: scanSummary }] : []),
				...scanItemDetails,
				...parsedDetails.details,
			].slice(0, 8),
		};
	}

	return {
		displayTitle: parsedDetails.title || transaction.merchant || transaction.category,
		displaySummary: parsedDetails.summary || transaction.description || null,
		detailItems: parsedDetails.details,
	};
}

async function buildShiftReportDetail(
	ctx: QueryCtx,
	startTime: number,
	endTime: number,
	productLookup: ProductLookup,
	shiftDoc?: {
		summary?: {
			totalRevenue: number;
			totalExpenses: number;
			totalItemsSold: number;
			cashRevenue: number;
			qrisRevenue: number;
			totalDiscount: number;
		};
	},
): Promise<ShiftReportDetail> {
	const [orders, bookings, shiftTransactions] = await Promise.all([
		ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) =>
				q.gte("createdAt", startTime).lte("createdAt", endTime),
			)
			.collect(),
		ctx.db
			.query("bookingOrders")
			.withIndex("by_createdAt", (q) =>
				q.gte("createdAt", startTime).lte("createdAt", endTime),
			)
			.collect(),
		ctx.db
			.query("financialTransactions")
			.withIndex("by_date", (q) => q.gte("date", startTime).lte("date", endTime))
			.collect(),
	]);

	const productItems = new Map<
		string,
		{ productName: string; categoryName: string; quantity: number }
	>();
	const paymentMethods: Record<string, number> = {};
	const expenseByCategory: Record<string, number> = {};
	let totalGrossSales = 0;
	let totalRevenue = 0;
	let totalDiscount = 0;
	let cashRevenue = 0;
	let qrisRevenue = 0;
	let otherRevenue = 0;
	let totalItemsSold = 0;
	let totalExpenses = 0;
	let posRevenue = 0;
	let bookingRevenue = 0;

	const accumulatePayment = (method: string | null | undefined, amount: number) => {
		const normalized = normalizePaymentMethod(method) || "lainnya";
		paymentMethods[normalized] = (paymentMethods[normalized] || 0) + amount;

		if (isCashMethod(normalized)) {
			cashRevenue += amount;
			return;
		}

		if (isNonCashMethod(normalized)) {
			qrisRevenue += amount;
			return;
		}

		otherRevenue += amount;
	};

	const addProductItem = (
		productKey: string,
		productName: string,
		categoryName: string,
		quantity: number,
	) => {
		const existing = productItems.get(productKey);
		if (existing) {
			existing.quantity += quantity;
			return;
		}

		productItems.set(productKey, {
			productName,
			categoryName,
			quantity,
		});
	};

	for (const order of orders) {
		if (!isSettledOrder(order)) continue;

		const snapshot = getOrderFinancialSnapshot(order);
		posRevenue += snapshot.finalCollected;
		totalRevenue += snapshot.finalCollected;
		totalGrossSales += snapshot.grossSales;
		totalDiscount += snapshot.discount;
		accumulatePayment(order.paymentMethod, snapshot.finalCollected);

		for (const item of order.items || []) {
			const quantity = item.quantity || 0;
			const lookup =
				productLookup[item.productId] ??
				productLookup[String(item.productId)] ?? {
					productName: item.productName,
					categoryName: "Lainnya",
				};

			totalItemsSold += quantity;
			addProductItem(
				`${item.productId}`,
				item.productName || lookup.productName,
				lookup.categoryName,
				quantity,
			);
		}
	}

	for (const booking of bookings) {
		if (!isSettledBooking(booking)) continue;

		const snapshot = getBookingFinancialSnapshot(booking);
		bookingRevenue += snapshot.finalCollected;
		totalRevenue += snapshot.finalCollected;
		totalGrossSales += snapshot.grossSales;
		accumulatePayment(booking.paymentMethod, snapshot.finalCollected);

		for (const item of booking.items || []) {
			const quantity = item.quantity || 0;
			totalItemsSold += quantity;
			addProductItem(
				`booking:${item.productId}:${item.name}`,
				item.name,
				"Booking",
				quantity,
			);
		}
	}

	for (const transaction of shiftTransactions) {
		if (transaction.type !== "expense" || transaction.status !== "completed") {
			continue;
		}

		totalExpenses += transaction.amount;
		expenseByCategory[transaction.category] =
			(expenseByCategory[transaction.category] || 0) + transaction.amount;
	}

	const groupedCategories = new Map<
		string,
		{ totalQuantity: number; items: Array<{ productName: string; quantity: number }> }
	>();

	for (const item of productItems.values()) {
		const category = groupedCategories.get(item.categoryName) ?? {
			totalQuantity: 0,
			items: [],
		};

		category.totalQuantity += item.quantity;
		category.items.push({
			productName: item.productName,
			quantity: item.quantity,
		});
		groupedCategories.set(item.categoryName, category);
	}

	const productBreakdown = Array.from(groupedCategories.entries())
		.map(([categoryName, value]) => ({
			categoryName,
			totalQuantity: value.totalQuantity,
			items: value.items.sort((a, b) => b.quantity - a.quantity),
		}))
		.sort((a, b) => b.totalQuantity - a.totalQuantity);

	const topProducts = Array.from(productItems.values())
		.sort((a, b) => b.quantity - a.quantity)
		.slice(0, 3)
		.map((item) => ({
			productName: item.productName,
			quantity: item.quantity,
		}));

	const recentTransactions = [
		...orders
			.filter(isSettledOrder)
			.map((order) => ({
				type: "pos" as const,
				id: `${order._id}`,
				amount: order.totalAmount,
				status: order.status,
				time: order.createdAt,
				name: order.orderNumber,
				paymentMethod: order.paymentMethod,
			})),
		...bookings
			.filter(isSettledBooking)
			.map((booking) => ({
				type: "booking" as const,
				id: `${booking._id}`,
				amount: booking.totalAmount,
				status: booking.paymentStatus ?? booking.bookingStatus,
				time: booking.createdAt,
				name: booking.customerName,
				paymentMethod: booking.paymentMethod,
			})),
	]
		.sort((a, b) => b.time - a.time)
		.slice(0, 50);

	return {
		totalRevenue: shiftDoc?.summary?.totalRevenue ?? totalRevenue,
		totalGrossSales,
		totalDiscount: shiftDoc?.summary?.totalDiscount ?? totalDiscount,
		totalExpenses: shiftDoc?.summary?.totalExpenses ?? totalExpenses,
		totalItemsSold: shiftDoc?.summary?.totalItemsSold ?? totalItemsSold,
		posRevenue,
		bookingRevenue,
		cashRevenue: shiftDoc?.summary?.cashRevenue ?? cashRevenue,
		qrisRevenue: shiftDoc?.summary?.qrisRevenue ?? qrisRevenue,
		otherRevenue,
		orderCount: orders.filter(isSettledOrder).length,
		bookingCount: bookings.filter(isSettledBooking).length,
		paymentMethods,
		productBreakdown,
		topProducts,
		expenseBreakdown: Object.entries(expenseByCategory)
			.map(([category, amount]) => ({
				category,
				amount,
			}))
			.sort((a, b) => b.amount - a.amount),
		recentTransactions,
	};
}

// Get transactions with optional filtering and pagination
export const getTransactions = query({
	args: {
		paginationOpts: paginationOptsValidator,
		type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const q = await fetchTransactionsInternal(ctx, args);
		return await q.order("desc").paginate(args.paginationOpts);
	},
});

// Get ALL transactions without pagination (for full detail view)
export const getAllTransactions = query({
	args: {
		type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const q = await fetchTransactionsInternal(ctx, args);
		return await q.order("desc").collect();
	},
});

// Create a new transaction
export const createTransaction = mutation({
	args: {
		type: v.union(v.literal("income"), v.literal("expense")),
		amount: v.number(),
		category: v.string(),
		merchant: v.optional(v.string()),
		description: v.optional(v.string()),
		date: v.number(),
		paymentMethod: v.optional(v.string()),
		status: v.union(
			v.literal("completed"),
			v.literal("pending"),
			v.literal("cancelled")
		),
		attachmentUrl: v.optional(v.string()),
		sourceFingerprint: v.optional(v.string()),
		isRecurring: v.optional(v.boolean()),
		recurringInterval: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
		tags: v.optional(v.array(v.string())),
		metadata: v.optional(
			v.object({
				source: v.optional(v.string()),
				inputMode: v.optional(v.string()),
				aiSessionId: v.optional(v.string()),
				importedAt: v.optional(v.number()),
				rawText: v.optional(v.string()),
				sourceRef: v.optional(v.string()),
				sourceLabel: v.optional(v.string()),
				syncSource: v.optional(v.string()),
				syncOutcome: v.optional(v.string()),
				syncWarnings: v.optional(v.array(v.string())),
				receiptDetails: v.optional(
					v.object({
						merchantName: v.optional(v.string()),
						receiptNumber: v.optional(v.string()),
						date: v.optional(v.string()),
						time: v.optional(v.string()),
						subtotal: v.optional(v.number()),
						tax: v.optional(v.number()),
						serviceCharge: v.optional(v.number()),
						discount: v.optional(v.number()),
						total: v.optional(v.number()),
					})
				),
				scanItems: v.optional(
					v.array(
						v.object({
							name: v.string(),
							quantity: v.number(),
							price: v.optional(v.number()),
							total: v.optional(v.number()),
							unit: v.optional(v.string()),
						})
					)
				),
			})
		),
	},
	handler: async (ctx, args) => {
		const id = await ctx.db.insert("financialTransactions", args);
		return id;
	},
});

export const upsertReceiptTransaction = mutation({
	args: {
		type: v.union(v.literal("income"), v.literal("expense")),
		amount: v.number(),
		category: v.string(),
		merchant: v.optional(v.string()),
		description: v.optional(v.string()),
		date: v.number(),
		paymentMethod: v.optional(v.string()),
		status: v.union(
			v.literal("completed"),
			v.literal("pending"),
			v.literal("cancelled")
		),
		attachmentUrl: v.optional(v.string()),
		sourceFingerprint: v.string(),
		isRecurring: v.optional(v.boolean()),
		recurringInterval: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
		tags: v.optional(v.array(v.string())),
		metadata: v.optional(
			v.object({
				source: v.optional(v.string()),
				inputMode: v.optional(v.string()),
				aiSessionId: v.optional(v.string()),
				importedAt: v.optional(v.number()),
				rawText: v.optional(v.string()),
				sourceRef: v.optional(v.string()),
				sourceLabel: v.optional(v.string()),
				syncSource: v.optional(v.string()),
				syncOutcome: v.optional(v.string()),
				syncWarnings: v.optional(v.array(v.string())),
				receiptDetails: v.optional(
					v.object({
						merchantName: v.optional(v.string()),
						receiptNumber: v.optional(v.string()),
						date: v.optional(v.string()),
						time: v.optional(v.string()),
						subtotal: v.optional(v.number()),
						tax: v.optional(v.number()),
						serviceCharge: v.optional(v.number()),
						discount: v.optional(v.number()),
						total: v.optional(v.number()),
					})
				),
				scanItems: v.optional(
					v.array(
						v.object({
							name: v.string(),
							quantity: v.number(),
							price: v.optional(v.number()),
							total: v.optional(v.number()),
							unit: v.optional(v.string()),
						})
					)
				),
			})
		),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("financialTransactions")
			.withIndex("by_source_fingerprint", (q) =>
				q.eq("sourceFingerprint", args.sourceFingerprint)
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				...args,
			});
			return {
				id: existing._id,
				created: false,
			};
		}

		const id = await ctx.db.insert("financialTransactions", args);
		return {
			id,
			created: true,
		};
	},
});

// Get profit & loss report for a period
export const getProfitLossReport = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { startDate, endDate } = args;
		const q = await fetchTransactionsInternal(ctx, { ...args, status: "completed" });
		const transactions = await q.collect();
		const completed = transactions.filter((t) => t.status === "completed" && t.category !== "Modal Awal" && t.category !== "Setoran Akhir");

		// Income breakdown by category
		const incomeByCategory: Record<string, number> = {};
		let totalIncome = 0;
		for (const t of completed.filter((t) => t.type === "income")) {
			const cat = t.category || "Lainnya";
			incomeByCategory[cat] = (incomeByCategory[cat] || 0) + t.amount;
			totalIncome += t.amount;
		}

		// Fetch orders in period to calculate discounts
		const ordersInPeriod = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => {
				if (startDate !== undefined && endDate !== undefined) return q.gte("createdAt", startDate).lte("createdAt", endDate);
				if (startDate !== undefined) return q.gte("createdAt", startDate);
				if (endDate !== undefined) return q.lte("createdAt", endDate);
				return q;
			})
			.collect();

		const settledOrdersInPeriod = ordersInPeriod.filter(isSettledOrder);
		const totalDiscount = settledOrdersInPeriod.reduce(
			(sum, order) => sum + getOrderFinancialSnapshot(order).discount,
			0
		);

		// Expense breakdown by category
		const expenseByCategory: Record<string, number> = {};
		let totalExpense = 0;
		for (const t of completed.filter((t) => t.type === "expense")) {
			const cat = t.category || "Lainnya";
			expenseByCategory[cat] = (expenseByCategory[cat] || 0) + t.amount;
			totalExpense += t.amount;
		}

		// Calculate Gross Profit and Net Profit
		// Map various category names to standard report terms
		const netSalesRevenue = settledOrdersInPeriod.reduce(
			(sum, order) => sum + getOrderFinancialSnapshot(order).netSales,
			0
		);
		const grossSalesRevenue = netSalesRevenue + totalDiscount;
		const hppAmount = (expenseByCategory["HPP"] || 0) + (expenseByCategory["belanja_stok"] || 0) + (expenseByCategory["COGS"] || 0);
		const otherIncome = totalIncome - netSalesRevenue;
		
		// Gross Profit = Net Sales - HPP (or Gross Sales - Discount - HPP)
		const grossProfit = netSalesRevenue - hppAmount;
		const netProfit = totalIncome - totalExpense;
		const netMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

		// Detailed Operating Expenses
		const operatingExpenses = Object.entries(expenseByCategory)
			.filter(([category]) => category !== "HPP")
			.map(([category, amount]) => ({
				category,
				amount,
			}));

		// Detailed Income Sources (excluding Sales if you want them separated, or just list all)
		const incomeSources = Object.entries(incomeByCategory)
			.map(([category, amount]) => ({
				category,
				amount,
			}));

		return {
			period: { startDate, endDate },
			income: {
				salesRevenue: netSalesRevenue,
				grossSalesRevenue,
				totalDiscount,
				otherIncome,
				total: totalIncome,
				byCategory: incomeByCategory,
				sources: incomeSources,
			},
			expense: {
				hppAmount,
				operatingExpenses,
				total: totalExpense,
				byCategory: expenseByCategory,
			},
			grossProfit,
			netProfit,
			netMargin,
			transactionCount: completed.length,
		};
	},
});

// Get cash flow report
export const getCashFlowReport = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { startDate, endDate } = args;
		const q = await fetchTransactionsInternal(ctx, { ...args, status: "completed" });
		const transactions = await q.order("asc").collect();
		const completed = transactions.filter((t) => t.status === "completed");

		// Group by date
		const dailyMap: Record<string, { inflow: number; outflow: number; date: string }> = {};
		for (const t of completed) {
			const date = new Date(t.date).toISOString().split("T")[0] as string;
			if (!dailyMap[date]) {
				dailyMap[date] = { inflow: 0, outflow: 0, date };
			}
			if (t.type === "income") {
				dailyMap[date].inflow += t.amount;
			} else {
				dailyMap[date].outflow += t.amount;
			}
		}

		// Breakdown by payment method
		const byPaymentMethod: Record<string, { inflow: number; outflow: number }> = {};
		for (const t of completed) {
			const method = t.paymentMethod || "Cash";
			if (!byPaymentMethod[method]) {
				byPaymentMethod[method] = { inflow: 0, outflow: 0 };
			}
			if (t.type === "income") {
				byPaymentMethod[method].inflow += t.amount;
			} else {
				byPaymentMethod[method].outflow += t.amount;
			}
		}

		const totalInflow = completed.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
		const totalOutflow = completed.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

		// Running balance per day
		let runningBalance = 0;
		const dailyCashFlow = Object.values(dailyMap)
			.sort((a, b) => a.date.localeCompare(b.date))
			.map((day) => {
				runningBalance += day.inflow - day.outflow;
				return {
					date: day.date,
					inflow: day.inflow,
					outflow: day.outflow,
					net: day.inflow - day.outflow,
					balance: runningBalance,
				};
			});

		return {
			period: { startDate, endDate },
			totalInflow,
			totalOutflow,
			netCashFlow: totalInflow - totalOutflow,
			byPaymentMethod,
			dailyCashFlow,
		};
	},
});

// Get transaction detail report
export const getTransactionDetailReport = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
		category: v.optional(v.string()),
		viewMode: v.optional(v.union(v.literal("transaction"), v.literal("item"))),
	},
	handler: async (ctx, args) => {
		const viewMode = args.viewMode ?? "transaction";
		const q = await fetchTransactionsInternal(ctx, args);
		const transactions = await q.order("desc").collect();
		const orderIds = [...new Set(transactions.map((t) => t.orderId).filter(Boolean))];
		const bookingIds = [...new Set(transactions.map((t) => t.bookingOrderId).filter(Boolean))];
		const [relatedOrders, relatedBookings] = await Promise.all([
			Promise.all(orderIds.map((id) => ctx.db.get(id!))),
			Promise.all(bookingIds.map((id) => ctx.db.get(id!))),
		]);
		const orderMap = new Map(
			relatedOrders
				.filter(Boolean)
				.map((order) => [order!._id, order!]),
		);
		const bookingMap = new Map(
			relatedBookings
				.filter(Boolean)
				.map((booking) => [booking!._id, booking!]),
		);

		let totalIncome = 0;
		let totalExpense = 0;
		for (const t of transactions) {
			if (t.status === "completed") {
				if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
				if (t.type === "income") totalIncome += t.amount;
				else totalExpense += t.amount;
			}
		}

		const enrichedTransactions: any[] = transactions.flatMap((transaction): any[] => {
			const relatedOrder = transaction.orderId ? orderMap.get(transaction.orderId) : null;
			const relatedBooking = transaction.bookingOrderId ? bookingMap.get(transaction.bookingOrderId) : null;
			const presentation = buildTransactionPresentation(transaction, relatedOrder, relatedBooking);
			const scanItems: Array<{
				name: string;
				quantity: number;
				price?: number;
				total?: number;
				unit?: string;
			}> = Array.isArray(transaction.metadata?.scanItems)
				? transaction.metadata?.scanItems ?? []
				: [];
			const sourceLabel =
				transaction.metadata?.sourceLabel ||
				(transaction.metadata?.source === "ai_bulk_finance"
					? "AI Bulk"
					: transaction.metadata?.source === "ai_tool"
						? "AI Chat"
						: transaction.metadata?.source === "ai_receipt_scan"
							? "AI Scan"
							: transaction.orderId
								? "Order"
								: transaction.bookingOrderId
									? "Booking"
									: "Manual");
			const referenceLabel = relatedOrder
				? "Order"
				: relatedBooking
					? "Booking"
					: transaction.metadata?.sourceRef
						? "Referensi"
						: null;
			const referenceValue = relatedOrder?.orderNumber ||
				relatedBooking?.bookingCode ||
				transaction.metadata?.sourceRef ||
				null;
			const baseRow = {
				...transaction,
				sourceLabel,
				sourceType: transaction.metadata?.source || "manual",
				inputMode: transaction.metadata?.inputMode || null,
				rawText: transaction.metadata?.rawText || null,
				referenceLabel,
				referenceValue,
				displayTitle: presentation.displayTitle,
				displaySummary: presentation.displaySummary,
				detailItems: presentation.detailItems,
			};

			const orderItems: Array<{
				productName?: string;
				name?: string;
				quantity?: number;
				price?: number;
				unitPrice?: number;
				totalPrice?: number;
				subtotal?: number;
			}> = Array.isArray(relatedOrder?.items)
				? ((relatedOrder?.items ?? []) as Array<{
						productName?: string;
						name?: string;
						quantity?: number;
						price?: number;
						unitPrice?: number;
						totalPrice?: number;
						subtotal?: number;
					}>)
				: [];
			const bookingItems: Array<{
				name?: string;
				quantity?: number;
				price?: number;
				unitPrice?: number;
				totalPrice?: number;
				subtotal?: number;
			}> = Array.isArray(relatedBooking?.items)
				? ((relatedBooking?.items ?? []) as Array<{
						name?: string;
						quantity?: number;
						price?: number;
						unitPrice?: number;
						totalPrice?: number;
						subtotal?: number;
					}>)
				: [];

			const shouldExpandReceiptItems =
				viewMode === "item" &&
				scanItems.length > 0;
			const shouldExpandOrderItems =
				viewMode === "item" &&
				transaction.type === "income" &&
				orderItems.length > 0;
			const shouldExpandBookingItems =
				viewMode === "item" &&
				transaction.type === "income" &&
				bookingItems.length > 0;

			if (shouldExpandReceiptItems) {
				const receiptGroupId = String(
					transaction.sourceFingerprint ||
						transaction.metadata?.sourceRef ||
						transaction._id
				);
				const receiptGroupLabel = `STRUK-${receiptGroupId.slice(-6).toUpperCase()}`;
				const itemCount = scanItems.length;
				const fallbackPerItemAmount =
					itemCount > 0 ? transaction.amount / itemCount : transaction.amount;

				return scanItems.map((item, index) => {
					const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
					const unitPrice = Number(item.price) > 0 ? Number(item.price) : 0;
					const lineTotalFromItem =
						Number(item.total) > 0
							? Number(item.total)
							: unitPrice > 0
								? unitPrice * quantity
								: 0;
					const lineTotal =
						lineTotalFromItem > 0 ? lineTotalFromItem : fallbackPerItemAmount;
					const unitSuffix = item.unit ? ` ${item.unit}` : "";
					const itemSummary = `${quantity}${unitSuffix} x Rp${Math.round(
						unitPrice
					).toLocaleString("id-ID")} = Rp${Math.round(lineTotal).toLocaleString(
						"id-ID"
					)}`;

					return {
						...baseRow,
						amount: lineTotal,
						displayTitle: item.name || baseRow.displayTitle,
						displaySummary: itemSummary,
						detailItems: [
							{
								label: "Item",
								value: `${index + 1}/${itemCount}`,
							},
							{
								label: "Grup",
								value: receiptGroupLabel,
							},
							{
								label: "Qty",
								value: `${quantity}${unitSuffix}`,
							},
							{
								label: "Harga",
								value: `Rp${Math.round(unitPrice).toLocaleString("id-ID")}`,
							},
							{
								label: "Subtotal",
								value: `Rp${Math.round(lineTotal).toLocaleString("id-ID")}`,
							},
							...baseRow.detailItems,
						].slice(0, 10),
						rowKey: `${transaction._id}::item::${index}`,
						rowType: "receipt_item",
						receiptGroupId,
						receiptGroupLabel,
						receiptItemIndex: index + 1,
						receiptItemCount: itemCount,
						itemGroupType: "struk",
					};
				});
			}

			if (shouldExpandOrderItems) {
				const receiptGroupId = String(
					referenceValue || relatedOrder?.orderNumber || transaction._id
				);
				const receiptGroupLabel = `ORDER-${receiptGroupId.slice(-6).toUpperCase()}`;
				const itemCount = orderItems.length;
				const fallbackPerItemAmount =
					itemCount > 0 ? transaction.amount / itemCount : transaction.amount;

				return orderItems.map((item, index) => {
					const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
					const unitPrice =
						Number(item.price) > 0
							? Number(item.price)
							: Number(item.unitPrice) > 0
								? Number(item.unitPrice)
								: 0;
					const lineTotalFromItem =
						Number(item.totalPrice) > 0
							? Number(item.totalPrice)
							: Number(item.subtotal) > 0
								? Number(item.subtotal)
								: unitPrice > 0
									? unitPrice * quantity
									: 0;
					const lineTotal =
						lineTotalFromItem > 0 ? lineTotalFromItem : fallbackPerItemAmount;
					const itemName = item.productName || item.name || baseRow.displayTitle;
					const itemSummary = `${quantity} x Rp${Math.round(
						unitPrice
					).toLocaleString("id-ID")} = Rp${Math.round(lineTotal).toLocaleString(
						"id-ID"
					)}`;

					return {
						...baseRow,
						amount: lineTotal,
						displayTitle: itemName,
						displaySummary: itemSummary,
						detailItems: [
							{
								label: "Item",
								value: `${index + 1}/${itemCount}`,
							},
							{
								label: "Grup",
								value: receiptGroupLabel,
							},
							{
								label: "Qty",
								value: String(quantity),
							},
							{
								label: "Harga",
								value: `Rp${Math.round(unitPrice).toLocaleString("id-ID")}`,
							},
							{
								label: "Subtotal",
								value: `Rp${Math.round(lineTotal).toLocaleString("id-ID")}`,
							},
							...baseRow.detailItems,
						].slice(0, 10),
						rowKey: `${transaction._id}::order_item::${index}`,
						rowType: "order_item",
						receiptGroupId,
						receiptGroupLabel,
						receiptItemIndex: index + 1,
						receiptItemCount: itemCount,
						itemGroupType: "order",
					};
				});
			}

			if (shouldExpandBookingItems) {
				const receiptGroupId = String(
					referenceValue || relatedBooking?.bookingCode || transaction._id
				);
				const receiptGroupLabel = `BOOK-${receiptGroupId.slice(-6).toUpperCase()}`;
				const itemCount = bookingItems.length;
				const fallbackPerItemAmount =
					itemCount > 0 ? transaction.amount / itemCount : transaction.amount;

				return bookingItems.map((item, index) => {
					const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
					const unitPrice =
						Number(item.price) > 0
							? Number(item.price)
							: Number(item.unitPrice) > 0
								? Number(item.unitPrice)
								: 0;
					const lineTotalFromItem =
						Number(item.totalPrice) > 0
							? Number(item.totalPrice)
							: Number(item.subtotal) > 0
								? Number(item.subtotal)
								: unitPrice > 0
									? unitPrice * quantity
									: 0;
					const lineTotal =
						lineTotalFromItem > 0 ? lineTotalFromItem : fallbackPerItemAmount;
					const itemName = item.name || baseRow.displayTitle;
					const itemSummary = `${quantity} x Rp${Math.round(
						unitPrice
					).toLocaleString("id-ID")} = Rp${Math.round(lineTotal).toLocaleString(
						"id-ID"
					)}`;

					return {
						...baseRow,
						amount: lineTotal,
						displayTitle: itemName,
						displaySummary: itemSummary,
						detailItems: [
							{
								label: "Item",
								value: `${index + 1}/${itemCount}`,
							},
							{
								label: "Grup",
								value: receiptGroupLabel,
							},
							{
								label: "Qty",
								value: String(quantity),
							},
							{
								label: "Harga",
								value: `Rp${Math.round(unitPrice).toLocaleString("id-ID")}`,
							},
							{
								label: "Subtotal",
								value: `Rp${Math.round(lineTotal).toLocaleString("id-ID")}`,
							},
							...baseRow.detailItems,
						].slice(0, 10),
						rowKey: `${transaction._id}::booking_item::${index}`,
						rowType: "booking_item",
						receiptGroupId,
						receiptGroupLabel,
						receiptItemIndex: index + 1,
						receiptItemCount: itemCount,
						itemGroupType: "booking",
					};
				});
			}

			return [
				{
					...baseRow,
					rowKey: String(transaction._id),
					rowType: "transaction",
					receiptGroupId: null,
					receiptGroupLabel: null,
					receiptItemIndex: null,
					receiptItemCount: null,
					itemGroupType: null,
				},
			];
		});

		return {
			transactions: enrichedTransactions,
			totalIncome,
			totalExpense,
			netBalance: totalIncome - totalExpense,
			count: enrichedTransactions.length,
		};
	},
});

// Delete a transaction
export const deleteTransaction = mutation({
	args: { id: v.id("financialTransactions") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

// Bulk delete transactions
export const deleteTransactionsBulk = mutation({
	args: {
		ids: v.array(v.id("financialTransactions")),
	},
	handler: async (ctx, args) => {
		for (const id of args.ids) {
			await ctx.db.delete(id);
		}
		return { deletedCount: args.ids.length };
	},
});

// Update a transaction
export const updateTransaction = mutation({
	args: {
		id: v.id("financialTransactions"),
		type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
		amount: v.optional(v.number()),
		category: v.optional(v.string()),
		merchant: v.optional(v.string()),
		description: v.optional(v.string()),
		date: v.optional(v.number()),
		paymentMethod: v.optional(v.string()),
		status: v.optional(v.union(v.literal("completed"), v.literal("pending"), v.literal("cancelled"))),
		attachmentUrl: v.optional(v.string()),
		sourceFingerprint: v.optional(v.string()),
		isRecurring: v.optional(v.boolean()),
		recurringInterval: v.optional(v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly"))),
		tags: v.optional(v.array(v.string())),
		metadata: v.optional(
			v.object({
				source: v.optional(v.string()),
				inputMode: v.optional(v.string()),
				aiSessionId: v.optional(v.string()),
				importedAt: v.optional(v.number()),
				rawText: v.optional(v.string()),
				sourceRef: v.optional(v.string()),
				sourceLabel: v.optional(v.string()),
				syncSource: v.optional(v.string()),
				syncOutcome: v.optional(v.string()),
				syncWarnings: v.optional(v.array(v.string())),
				receiptDetails: v.optional(
					v.object({
						merchantName: v.optional(v.string()),
						receiptNumber: v.optional(v.string()),
						date: v.optional(v.string()),
						time: v.optional(v.string()),
						subtotal: v.optional(v.number()),
						tax: v.optional(v.number()),
						serviceCharge: v.optional(v.number()),
						discount: v.optional(v.number()),
						total: v.optional(v.number()),
					})
				),
				scanItems: v.optional(
					v.array(
						v.object({
							name: v.string(),
							quantity: v.number(),
							price: v.optional(v.number()),
							total: v.optional(v.number()),
							unit: v.optional(v.string()),
						})
					)
				),
			})
		),
	},
	handler: async (ctx, args) => {
		const { id, ...data } = args;
		const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
		await ctx.db.patch(id, filtered);
	},
});

// Start a new shift
export const startShift = mutation({
	args: {
		cashierName: v.string(),
		shiftName: v.string(),
		teamMembers: v.optional(v.string()),
		startingCash: v.number(),
		notes: v.optional(v.string()),
		startTime: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const startTime = args.startTime ?? Date.now();
		
		// 1. Create entry in shifts table
		const shiftId = await ctx.db.insert("shifts", {
			...args,
			startTime,
		});

		// 2. Create financial transaction for Modal Awal (Legacy compatibility)
		const descParts = [];
		descParts.push(`Kasir: ${args.cashierName}`);
		descParts.push(`Shift: ${args.shiftName}`);
		if (args.teamMembers) descParts.push(`Tim: ${args.teamMembers}`);
		if (args.notes) descParts.push(`Catatan: ${args.notes}`);
		
		await ctx.db.insert("financialTransactions", {
			type: "income",
			amount: args.startingCash,
			category: "Modal Awal",
			description: descParts.join(" | "),
			date: startTime,
			status: "completed",
			paymentMethod: "tunai",
		});

		return shiftId;
	},
});

// End an ongoing shift
export const endShift = mutation({
	args: {
		shiftId: v.id("shifts"),
		endingCashPhysical: v.number(),
		nonCashConfirmed: v.number(),
		cashBreakdown: v.optional(
			v.object({
				bill100000: v.number(),
				bill50000: v.number(),
				bill20000: v.number(),
				bill10000: v.number(),
				bill5000: v.number(),
				bill2000: v.number(),
				bill1000: v.number(),
				bill500: v.number(),
				bill200: v.number(),
				bill100: v.number(),
			})
		),
		notes: v.optional(v.string()),
		closingTasks: v.optional(v.array(v.string())),
		endTime: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const endTimeArg = args.endTime ?? Date.now();
		const shift = await ctx.db.get(args.shiftId);
		if (!shift) throw new Error("Shift not found");
		if (shift.endTime) throw new Error("Shift already ended");
		if (endTimeArg < shift.startTime) throw new Error("Waktu akhir shift tidak boleh lebih awal dari waktu mulai");

		// 1. Calculate shift statistics
		const startTime = shift.startTime;
		const endTime = endTimeArg;

		const {
			totalRevenue,
			totalExpenses,
			totalItemsSold,
			cashRevenue,
			qrisRevenue,
			totalDiscount,
		} = await buildShiftSummary(ctx, startTime, endTime);

		const endingCashExpected = shift.startingCash + cashRevenue - totalExpenses;
		const nonCashExpected = qrisRevenue;

		// 2. Update shifts table
		await ctx.db.patch(args.shiftId, {
			endTime,
			endingCashPhysical: args.endingCashPhysical,
			endingCashExpected,
			nonCashConfirmed: args.nonCashConfirmed,
			nonCashExpected,
			cashBreakdown: args.cashBreakdown,
			notes: args.notes,
			closingTasks: args.closingTasks,
			summary: {
				totalRevenue,
				totalExpenses,
				totalItemsSold,
				cashRevenue,
				qrisRevenue,
				totalDiscount,
			},
		});

		// 3. Create financial transaction for Setoran Akhir (Legacy compatibility)
		const summaryText = `\n[RINGKASAN SHIFT]\nModal: Rp ${shift.startingCash.toLocaleString('id-ID')}\nCash: Rp ${cashRevenue.toLocaleString('id-ID')}\nQRIS: Rp ${qrisRevenue.toLocaleString('id-ID')}\nDiskon: Rp ${totalDiscount.toLocaleString('id-ID')}\nTotal Revenue (Net): Rp ${totalRevenue.toLocaleString('id-ID')}\nPengeluaran: Rp ${totalExpenses.toLocaleString('id-ID')}\nProduk Terjual: ${totalItemsSold}`;
		
		await ctx.db.insert("financialTransactions", {
			type: "income",
			amount: args.endingCashPhysical,
			category: "Setoran Akhir",
			description: (args.notes || "Akhiri Shift") + summaryText,
			date: endTime,
			status: "completed",
			paymentMethod: "tunai",
		});

		return args.shiftId;
	},
});

// Get ongoing shift if any
export const getOngoingShift = query({
	handler: async (ctx) => {
		return await ctx.db
			.query("shifts")
			.withIndex("by_endTime", (q) => q.eq("endTime", undefined))
			.first();
	},
});

// Get shift status (Updated to use shifts table)
export const getShiftStatus = query({
	handler: async (ctx) => {
		const ongoingShift = await ctx.db
			.query("shifts")
			.withIndex("by_endTime", (q) => q.eq("endTime", undefined))
			.first();

		const now = Date.now();
		const WIB_OFFSET = 7 * 60 * 60 * 1000;
		const nowWib = new Date(now + WIB_OFFSET);
		const todayStartWib = new Date(nowWib.getFullYear(), nowWib.getMonth(), nowWib.getDate());
		const todayStartTs = todayStartWib.getTime() - WIB_OFFSET;

		const allShiftsRaw = await ctx.db
			.query("shifts")
			.withIndex("by_startTime", q => q.gte("startTime", todayStartTs))
			.collect();

		const allShifts = await Promise.all(
			allShiftsRaw.map(async (s) => {
				const computedSummary =
					s.summary ??
					(await buildShiftSummary(ctx, s.startTime, s.endTime ?? now));

				return {
					...s,
					revenue: computedSummary.totalRevenue ?? 0,
					cashRevenue: computedSummary.cashRevenue ?? 0,
					qrisRevenue: computedSummary.qrisRevenue ?? 0,
					totalDiscount: computedSummary.totalDiscount ?? 0,
					modalAwal: s.startingCash,
					setoranAkhir: s.endingCashPhysical,
				};
			})
		);

		if (ongoingShift) {
			return {
				isOpen: true,
				latestMulai: ongoingShift.startTime,
				latestAkhir: 0,
				shiftInfo: {
					cashierName: ongoingShift.cashierName,
					shiftName: ongoingShift.shiftName,
					shiftId: ongoingShift._id,
				},
				ongoingShift,
				allShifts,
			};
		}

		// If no ongoing shift in new table, check legacy transactions for today
		const lastTx = await ctx.db
			.query("financialTransactions")
			.withIndex("by_date", (q) => q.gte("date", todayStartTs))
			.order("desc")
			.collect();

		const latestMulaiTx = lastTx.find(t => t.category === "Modal Awal");
		const latestAkhirTx = lastTx.find(t => t.category === "Setoran Akhir");

		const latestMulai = latestMulaiTx?.date ?? 0;
		const latestAkhir = latestAkhirTx?.date ?? 0;
		const isOpen = latestMulai > latestAkhir;

		let shiftInfo = null;
		if (isOpen && latestMulaiTx?.description) {
			const parts = latestMulaiTx.description.split(" | ");
			const cashierPart = parts.find(p => p.startsWith("Kasir: "));
			const shiftPart = parts.find(p => p.startsWith("Shift: "));
			shiftInfo = {
				cashierName: cashierPart ? cashierPart.replace("Kasir: ", "") : null,
				shiftName: shiftPart ? shiftPart.replace("Shift: ", "") : null,
			};
		}

		return {
			isOpen,
			latestMulai,
			latestAkhir,
			shiftInfo,
			allShifts,
		};
	},
});

// Get historical shifts for a date range
export const getHistoricalShifts = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const q = await fetchTransactionsInternal(ctx, args);
		const transactions = await q.collect();

		const allShifts: any[] = [];
		const sortedTx = [...transactions].sort((a, b) => a.date - b.date);
		
		let currentShiftObj: any = null;

		for (const t of sortedTx) {
			if (t.status === "completed") {
				if (t.category === "Modal Awal") {
					let parsedCashier = null;
					let parsedShift = null;
					let parsedTeam = null;
					if (t.description) {
						const parts = t.description.split(" | ");
						const cashierPart = parts.find(p => p.startsWith("Kasir: "));
						const shiftPart = parts.find(p => p.startsWith("Shift: "));
						const teamPart = parts.find(p => p.startsWith("Tim: "));
						
						parsedCashier = cashierPart ? cashierPart.replace("Kasir: ", "") : null;
						parsedShift = shiftPart ? shiftPart.replace("Shift: ", "") : null;
						parsedTeam = teamPart ? teamPart.replace("Tim: ", "") : null;
					}
					
					currentShiftObj = {
						id: t._id,
						startTime: t.date,
						endTime: null,
						cashierName: parsedCashier,
						shiftName: parsedShift,
						modalAwal: t.amount,
						teamMembers: parsedTeam,
					};
					allShifts.push(currentShiftObj);
				}
				if (t.category === "Setoran Akhir") {
					if (currentShiftObj && !currentShiftObj.endTime) {
						currentShiftObj.endTime = t.date;
						currentShiftObj.setoranAkhir = t.amount;
					}
				}
			}
		}

		return allShifts.sort((a, b) => b.startTime - a.startTime); // newest first
	},
});

export const getShiftReportTable = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const endBoundary = args.endDate ?? now;
		const shiftsQuery =
			args.startDate !== undefined || args.endDate !== undefined
				? ctx.db.query("shifts").withIndex("by_startTime", (q) => {
						if (args.startDate !== undefined && args.endDate !== undefined) {
							return q.gte("startTime", args.startDate).lte("startTime", args.endDate);
						}
						if (args.startDate !== undefined) {
							return q.gte("startTime", args.startDate);
						}
						if (args.endDate !== undefined) {
							return q.lte("startTime", args.endDate);
						}
						return q;
				  })
				: ctx.db.query("shifts").withIndex("by_startTime");

		const shifts = await shiftsQuery.order("desc").collect();
		const productLookup = await buildProductLookup(ctx);
		const siteSettings = await ctx.db.query("siteSettings").first();
		const shiftsPerDay = Math.max(
			1,
			siteSettings?.shiftSettings?.predefinedShifts?.length || 2,
		);

		const rows = await Promise.all(
			shifts.map(async (shift) => {
				const effectiveEndTime = shift.endTime ?? Math.min(endBoundary, now);
				const detail = await buildShiftReportDetail(
					ctx,
					shift.startTime,
					effectiveEndTime,
					productLookup,
					shift,
				);

				return {
					shiftId: shift._id,
					shiftName: shift.shiftName,
					cashierName: shift.cashierName,
					teamMembers: shift.teamMembers ?? "",
					startTime: shift.startTime,
					endTime: shift.endTime,
					status: shift.endTime ? "SELESAI" : "AKTIF",
					startingCash: shift.startingCash,
					cashRevenue: detail.cashRevenue,
					qrisRevenue: detail.qrisRevenue,
					otherRevenue: detail.otherRevenue,
					totalGrossSales: detail.totalGrossSales,
					totalDiscount: detail.totalDiscount,
					totalRevenue: detail.totalRevenue,
					totalExpenses: detail.totalExpenses,
					totalItemsSold: detail.totalItemsSold,
					orderCount: detail.orderCount,
					bookingCount: detail.bookingCount,
					endingCashExpected:
						shift.endingCashExpected ??
						shift.startingCash + detail.cashRevenue - detail.totalExpenses,
					endingCashPhysical: shift.endingCashPhysical,
					nonCashExpected: shift.nonCashExpected ?? detail.qrisRevenue,
					nonCashConfirmed: shift.nonCashConfirmed,
				};
			}),
		);

		const dateRevenueMap = rows.reduce<Record<string, number>>((acc, row) => {
			const dateKey = getLocalDateKey(row.startTime);
			acc[dateKey] = (acc[dateKey] ?? 0) + row.totalRevenue;
			return acc;
		}, {});

		const monthKeys = Array.from(new Set(rows.map((row) => getMonthKey(row.startTime))));
		const targets = await Promise.all(
			monthKeys.map(async (month) => {
				const target = await ctx.db
					.query("financialTargets")
					.withIndex("by_month", (q) => q.eq("month", month))
					.first();
				return [month, target] as const;
			}),
		);
		const targetMap = new Map(targets);

		return rows.map((row) => {
			const dateKey = getLocalDateKey(row.startTime);
			const monthKey = getMonthKey(row.startTime);
			const targetDoc = targetMap.get(monthKey);
			const targetSummary = buildShiftTargetSummary({
				targetRevenue: targetDoc?.targetRevenue,
				shiftsPerDay,
				timestamp: row.startTime,
				shiftRevenue: row.totalRevenue,
				dailyCollected: dateRevenueMap[dateKey] ?? row.totalRevenue,
			});

			return {
				...row,
				...targetSummary,
			};
		});
	},
});

// Get financial summary for a period
export const getFinancialSummary = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const q = await fetchTransactionsInternal(ctx, { ...args, status: "completed" });
		const transactions = await q.collect();

		let totalIncome = 0;
		let totalExpense = 0;

		for (const t of transactions) {
			if (t.status === "completed") {
				if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
				if (t.type === "income") {
					totalIncome += t.amount;
				} else if (t.type === "expense") {
					totalExpense += t.amount;
				}
			}
		}

		return {
			totalIncome,
			totalExpense,
			netBalance: totalIncome - totalExpense,
			transactionCount: transactions.length,
		};
	},
});

// ─── Monthly/Weekly Trend ───────────────────────────────────────────────────

// Get monthly income vs expense trend for last N months
export const getMonthlyTrend = query({
	args: { months: v.optional(v.number()) },
	handler: async (ctx, args) => {
		try {
			const n = args.months ?? 6;
			const now = new Date();
			const result: Array<{
				label: string;
				month: string;
				income: number;
				expense: number;
				net: number;
			}> = [];

			for (let i = n - 1; i >= 0; i--) {
				const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
				const year = d.getFullYear();
				const month = d.getMonth();
				const { start, end } = getMonthRange(year, month);

				const transactions = await ctx.db
					.query("financialTransactions")
					.withIndex("by_date", (q) => q.gte("date", start).lte("date", end))
					.collect();

				let income = 0;
				let expense = 0;
				for (const t of transactions) {
					if (t.status !== "completed") continue;
					if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
					if (t.type === "income") income += t.amount;
					else expense += t.amount;
				}

				const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
				const label = d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
				result.push({ label, month: monthStr, income, expense, net: income - expense });
			}

			return result;
		} catch (error) {
			console.error("Error in getMonthlyTrend:", error);
			throw new Error(error instanceof Error ? error.message : "Unknown error in getMonthlyTrend");
		}
	},
});

// Get weekly income vs expense trend for last N weeks
export const getWeeklyTrend = query({
	args: { weeks: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const n = args.weeks ?? 8;
		const now = new Date();
		const result: Array<{
			label: string;
			weekStart: string;
			income: number;
			expense: number;
			net: number;
		}> = [];

		for (let i = n - 1; i >= 0; i--) {
			const weekStartDate = getWeekStart(new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000));
			const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
			const start = weekStartDate.getTime();
			const end = weekEndDate.getTime();

			const transactions = await ctx.db
				.query("financialTransactions")
				.withIndex("by_date", (q) => q.gte("date", start).lte("date", end))
				.collect();

			let income = 0;
			let expense = 0;
			for (const t of transactions) {
				if (t.status !== "completed") continue;
				if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
				if (t.type === "income") income += t.amount;
				else expense += t.amount;
			}

			const weekStartStr = weekStartDate.toISOString().split("T")[0] as string;
			const label = weekStartDate.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
			result.push({ label, weekStart: weekStartStr, income, expense, net: income - expense });
		}

		return result;
	},
});

// Get daily income vs expense trend for last N days
export const getDailyTrend = query({
	args: { days: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const n = args.days ?? 14;
		const now = new Date();
		const startRange = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1), 0, 0, 0, 0).getTime();
		const endRange = now.getTime();

		const transactions = await ctx.db
			.query("financialTransactions")
			.withIndex("by_date", (q) => q.gte("date", startRange).lte("date", endRange))
			.collect();

		const dailyMap: Record<string, { income: number; expense: number }> = {};
		
		for (const t of transactions) {
			if (t.status !== "completed") continue;
			if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
			
			const d = new Date(t.date);
			const dateStr = d.toISOString().split("T")[0] as string;
			if (!dailyMap[dateStr]) {
				dailyMap[dateStr] = { income: 0, expense: 0 };
			}
			if (t.type === "income") dailyMap[dateStr].income += t.amount;
			else dailyMap[dateStr].expense += t.amount;
		}

		const result: Array<{
			label: string;
			date: string;
			income: number;
			expense: number;
			net: number;
		}> = [];

		for (let i = n - 1; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
			const dateStr = d.toISOString().split("T")[0] as string;
			const income = dailyMap[dateStr]?.income ?? 0;
			const expense = dailyMap[dateStr]?.expense ?? 0;
			const label = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
			result.push({ label, date: dateStr, income, expense, net: income - expense });
		}

		return result;
	},
});

// Get details for a specific shift/period
export const getShiftDetails = query({
	args: {
		startTime: v.number(),
		endTime: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const endTime = args.endTime ?? Date.now();
		const { startTime } = args;
		const productLookup = await buildProductLookup(ctx);
		const shiftDoc = await ctx.db
			.query("shifts")
			.withIndex("by_startTime", (q) => q.eq("startTime", startTime))
			.first();
		const detail = await buildShiftReportDetail(
			ctx,
			startTime,
			endTime,
			productLookup,
			shiftDoc ?? undefined,
		);
		const siteSettings = await ctx.db.query("siteSettings").first();
		const shiftsPerDay = Math.max(
			1,
			siteSettings?.shiftSettings?.predefinedShifts?.length || 2,
		);
		const monthKey = getMonthKey(startTime);
		const targetDoc = await ctx.db
			.query("financialTargets")
			.withIndex("by_month", (q) => q.eq("month", monthKey))
			.first();
		const dayStart = new Date(
			new Date(startTime).getFullYear(),
			new Date(startTime).getMonth(),
			new Date(startTime).getDate(),
			0,
			0,
			0,
			0,
		).getTime();
		const dayEnd = new Date(
			new Date(startTime).getFullYear(),
			new Date(startTime).getMonth(),
			new Date(startTime).getDate(),
			23,
			59,
			59,
			999,
		).getTime();
		const sameDayShifts = await ctx.db
			.query("shifts")
			.withIndex("by_startTime", (q) => q.gte("startTime", dayStart).lte("startTime", dayEnd))
			.collect();
		const dailyShiftDetails = await Promise.all(
			sameDayShifts.map(async (shift) => {
				const shiftEnd = shift.endTime ?? Date.now();
				return await buildShiftReportDetail(
					ctx,
					shift.startTime,
					shiftEnd,
					productLookup,
					shift,
				);
			}),
		);
		const dailyCollected = dailyShiftDetails.reduce(
			(sum, shiftDetail) => sum + shiftDetail.totalRevenue,
			0,
		);
		const targetSummary = buildShiftTargetSummary({
			targetRevenue: targetDoc?.targetRevenue,
			shiftsPerDay,
			timestamp: startTime,
			shiftRevenue: detail.totalRevenue,
			dailyCollected,
		});

		return {
			startTime,
			endTime,
			shiftDoc,
			shiftName: shiftDoc?.shiftName ?? "Shift",
			cashierName: shiftDoc?.cashierName ?? "",
			teamMembers: shiftDoc?.teamMembers ?? "",
			startingCash: shiftDoc?.startingCash ?? 0,
			status: shiftDoc?.endTime ? "SELESAI" : "AKTIF",
			posRevenue: detail.posRevenue,
			bookingRevenue: detail.bookingRevenue,
			totalRevenue: detail.totalRevenue,
			totalGrossSales: detail.totalGrossSales,
			cashRevenue: detail.cashRevenue,
			qrisRevenue: detail.qrisRevenue,
			otherRevenue: detail.otherRevenue,
			totalDiscount: detail.totalDiscount,
			totalExpenses: detail.totalExpenses,
			totalItemsSold: detail.totalItemsSold,
			endingCashExpected:
				shiftDoc?.endingCashExpected ??
				(shiftDoc
					? shiftDoc.startingCash + detail.cashRevenue - detail.totalExpenses
					: 0),
			endingCashPhysical: shiftDoc?.endingCashPhysical,
			nonCashExpected: shiftDoc?.nonCashExpected ?? detail.qrisRevenue,
			nonCashConfirmed: shiftDoc?.nonCashConfirmed,
			cashBreakdown: shiftDoc?.cashBreakdown,
			paymentMethods: detail.paymentMethods,
			orderCount: detail.orderCount,
			bookingCount: detail.bookingCount,
			productBreakdown: detail.productBreakdown,
			topProducts: detail.topProducts,
			expenseBreakdown: detail.expenseBreakdown,
			recentTransactions: detail.recentTransactions,
			...targetSummary,
		};
	},
});

// Get daily and shift-based target progress
export const getShiftTargetProgress = query({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

		// 1. Get Monthly Target
		const target = await ctx.db
			.query("financialTargets")
			.withIndex("by_month", (q) => q.eq("month", monthStr))
			.first();

		if (!target) return null;

		// 2. Calculate Daily Target
		const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		const dailyTarget = target.targetRevenue / daysInMonth;

		// 3. Get Current Daily Revenue
		// Local date range for today
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

		const todayPosOrders = await ctx.db
			.query("orders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", todayStart).lte("createdAt", todayEnd))
			.collect();

		const todayBookingOrders = await ctx.db
			.query("bookingOrders")
			.withIndex("by_createdAt", (q) => q.gte("createdAt", todayStart).lte("createdAt", todayEnd))
			.collect();

		const dailyCollected =
			todayPosOrders
				.filter((o) => o.status === "completed" || o.status === "paid")
				.reduce((s, o) => s + o.totalAmount, 0) +
			todayBookingOrders
				.filter(
					(b) =>
						b.paymentStatus === "paid" ||
						b.bookingStatus === "confirmed" ||
						b.bookingStatus === "completed"
				)
				.reduce((s, b) => s + b.totalAmount, 0);

		// 4. Calculate Shift Target (assuming 2 shifts per day: Pagi & Malam)
		const shiftsPerDay = 2;
		const shiftTarget = dailyTarget / shiftsPerDay;

		// 5. Get Current Shift Progress
		// We find the latest "Modal Awal" (which opens a shift)
		const latestModalAwal = await ctx.db
			.query("financialTransactions")
			.withIndex("by_type", (q) => q.eq("type", "income"))
			.filter((q) => q.eq(q.field("category"), "Modal Awal"))
			.order("desc")
			.first();

		let shiftStartTime = todayStart;
		if (latestModalAwal && latestModalAwal.date > todayStart) {
			shiftStartTime = latestModalAwal.date;
		}

		const shiftPosOrders = todayPosOrders.filter((o) => o.createdAt >= shiftStartTime);
		const shiftBookingOrders = todayBookingOrders.filter((b) => b.createdAt >= shiftStartTime);

		const shiftCollected =
			shiftPosOrders
				.filter((o) => o.status === "completed" || o.status === "paid")
				.reduce((s, o) => s + o.totalAmount, 0) +
			shiftBookingOrders
				.filter(
					(b) =>
						b.paymentStatus === "paid" ||
						b.bookingStatus === "confirmed" ||
						b.bookingStatus === "completed"
				)
				.reduce((s, b) => s + b.totalAmount, 0);

		return {
			monthStr,
			dailyTarget,
			dailyCollected,
			dailyProgress: Math.min((dailyCollected / dailyTarget) * 100, 100),
			shiftTarget,
			shiftCollected,
			shiftProgress: Math.min((shiftCollected / shiftTarget) * 100, 100),
			isDailyMet: dailyCollected >= dailyTarget,
			isShiftMet: shiftCollected >= shiftTarget,
		};
	},
});

// Compare two periods: current vs previous
export const getPeriodComparison = query({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const currYear = now.getFullYear();
		const currMonth = now.getMonth();

		// Current month
		const { start: currStart, end: currEnd } = getMonthRange(currYear, currMonth);
		// Previous month
		const prevDate = new Date(currYear, currMonth - 1, 1);
		const { start: prevStart, end: prevEnd } = getMonthRange(prevDate.getFullYear(), prevDate.getMonth());

		const [currTransactions, prevTransactions] = await Promise.all([
			(await fetchTransactionsInternal(ctx, { startDate: currStart, endDate: currEnd, status: "completed" })).collect(),
			(await fetchTransactionsInternal(ctx, { startDate: prevStart, endDate: prevEnd, status: "completed" })).collect(),
		]);

		function summarize(txs: typeof currTransactions) {
			let income = 0;
			let expense = 0;
			for (const t of txs) {
				if (t.status !== "completed") continue;
				if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
				if (t.type === "income") income += t.amount;
				else expense += t.amount;
			}
			return { income, expense, net: income - expense };
		}

		const curr = summarize(currTransactions);
		const prev = summarize(prevTransactions);

		function pct(curr: number, prev: number) {
			if (prev === 0) return curr > 0 ? 100 : 0;
			return ((curr - prev) / prev) * 100;
		}

		return {
			current: {
				...curr,
				label: now.toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
			},
			previous: {
				...prev,
				label: prevDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
			},
			changes: {
				incomePct: pct(curr.income, prev.income),
				expensePct: pct(curr.expense, prev.expense),
				netPct: pct(curr.net, prev.net),
			},
		};
	},
});

// Get expense breakdown by category for pie chart
export const getExpenseCategoryBreakdown = query({
	args: {
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { startDate, endDate } = args;
		const now = new Date();
		const defaultStart = getMonthRange(now.getFullYear(), now.getMonth()).start;

		const start = startDate ?? defaultStart;
		const end = endDate ?? Date.now();

		const transactions = await (await fetchTransactionsInternal(ctx, { startDate: start, endDate: end, status: "completed" })).collect();

		const expenseByCategory: Record<string, number> = {};
		const incomeByCategory: Record<string, number> = {};
		let totalExpense = 0;
		let totalIncome = 0;

		for (const t of transactions) {
			if (t.status !== "completed") continue;
			if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
			if (t.type === "expense") {
				expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
				totalExpense += t.amount;
			} else {
				incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
				totalIncome += t.amount;
			}
		}

		const expenseBreakdown = Object.entries(expenseByCategory)
			.map(([category, amount]) => ({
				category,
				amount,
				percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
			}))
			.sort((a, b) => b.amount - a.amount);

		const incomeBreakdown = Object.entries(incomeByCategory)
			.map(([category, amount]) => ({
				category,
				amount,
				percentage: totalIncome > 0 ? (amount / totalIncome) * 100 : 0,
			}))
			.sort((a, b) => b.amount - a.amount);

		return { expenseBreakdown, incomeBreakdown, totalExpense, totalIncome };
	},
});

// ─── Financial Targets ────────────────────────────────────────────────────────

// Get financial target for a specific month
export const getFinancialTargets = query({
	args: { month: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const now = new Date();
		const month = args.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		return await ctx.db
			.query("financialTargets")
			.withIndex("by_month", (q) => q.eq("month", month))
			.first();
	},
});

// Get all financial targets
export const getAllFinancialTargets = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("financialTargets").order("desc").collect();
	},
});

// Set / upsert financial target for a month
export const setFinancialTarget = mutation({
	args: {
		month: v.string(), // "YYYY-MM"
		targetRevenue: v.number(),
		targetProfit: v.optional(v.number()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("financialTargets")
			.withIndex("by_month", (q) => q.eq("month", args.month))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				targetRevenue: args.targetRevenue,
				targetProfit: args.targetProfit,
				notes: args.notes,
				updatedAt: Date.now(),
			});
			return existing._id;
		} else {
			return await ctx.db.insert("financialTargets", {
				month: args.month,
				targetRevenue: args.targetRevenue,
				targetProfit: args.targetProfit,
				notes: args.notes,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
		}
	},
});

// Delete a financial target
export const deleteFinancialTarget = mutation({
	args: { id: v.id("financialTargets") },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	},
});

// Get current month progress towards target
export const getCurrentMonthProgress = query({
	args: {},
	handler: async (ctx) => {
		const now = new Date();
		const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		const { start, end } = getMonthRange(now.getFullYear(), now.getMonth());

		const [target, transactions] = await Promise.all([
			ctx.db.query("financialTargets").withIndex("by_month", (q) => q.eq("month", month)).first(),
			(await fetchTransactionsInternal(ctx, { startDate: start, endDate: end, status: "completed" })).collect(),
		]);

		let income = 0;
		let expense = 0;
		for (const t of transactions) {
			if (t.status !== "completed") continue;
			if (t.category === "Modal Awal" || t.category === "Setoran Akhir") continue;
			if (t.type === "income") income += t.amount;
			else expense += t.amount;
		}

		const net = income - expense;
		const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		const daysPassed = now.getDate();
		const daysRemaining = daysInMonth - daysPassed;
		const dailyRate = daysPassed > 0 ? income / daysPassed : 0;
		const projectedMonthly = dailyRate * daysInMonth;

		const targetRevenue = target?.targetRevenue ?? 0;
		const remaining = Math.max(0, targetRevenue - income);
		const progressPct = targetRevenue > 0 ? Math.min(100, (income / targetRevenue) * 100) : 0;

		const dailyTarget = targetRevenue / daysInMonth;
		const shiftTarget = dailyTarget / 2; // Assuming 2 shifts per day

		// Today's starts for daily progress
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		const todayTransactions = transactions.filter(t => t.date >= todayStart);
		const dailyCollected = todayTransactions
			.filter(t => t.type === "income" && t.category !== "Modal Awal" && t.category !== "Setoran Akhir")
			.reduce((s, t) => s + t.amount, 0);

		// Current shift progress (since last Modal Awal)
		const latestModalAwal = transactions
			.filter(t => t.category === "Modal Awal" && t.type === "income")
			.sort((a, b) => b.date - a.date)[0];
		
		const shiftStart = latestModalAwal ? Math.max(latestModalAwal.date, todayStart) : todayStart;
		const shiftTransactions = todayTransactions.filter(t => t.date >= shiftStart);
		const shiftCollected = shiftTransactions
			.filter(t => t.type === "income" && t.category !== "Modal Awal" && t.category !== "Setoran Akhir")
			.reduce((s, t) => s + t.amount, 0);

		return {
			month,
			monthLabel: now.toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
			currentIncome: income,
			currentExpense: expense,
			currentNet: net,
			targetRevenue,
			targetProfit: target?.targetProfit,
			remaining,
			progressPct,
			daysRemaining,
			dailyRate,
			projectedMonthly,
			dailyTarget,
			dailyCollected,
			shiftTarget,
			shiftCollected,
			hasTarget: !!target,
			insight: (() => {
				if (!target) return null;
				if (progressPct >= 100) return `🎉 Target bulan ini sudah tercapai! Pendapatan Rp ${income.toLocaleString("id-ID")}`;
				if (remaining <= 0) return `✅ Target tercapai`;
				if (daysRemaining <= 0) return `⚠️ Bulan ini berakhir. Masih kurang Rp ${remaining.toLocaleString("id-ID")}`;
				const neededPerDay = daysRemaining > 0 ? remaining / daysRemaining : 0;
				if (neededPerDay > dailyRate * 1.5 && dailyRate > 0) {
					return `⚠️ Anda perlu Rp ${remaining.toLocaleString("id-ID")} lagi. Butuh Rp ${Math.round(neededPerDay).toLocaleString("id-ID")}/hari (saat ini Rp ${Math.round(dailyRate).toLocaleString("id-ID")}/hari)`;
				}
				return `💡 Anda perlu Rp ${remaining.toLocaleString("id-ID")} lagi untuk mencapai target bulan ini (${daysRemaining} hari tersisa)`;
			})(),
		};
	},
});
