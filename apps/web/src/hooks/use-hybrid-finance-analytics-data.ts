import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";

function safeNum(value: unknown) {
	const n = Number(value ?? 0);
	return Number.isFinite(n) ? n : 0;
}

function useSupabaseValue<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[]
) {
	return useSupabaseLiveValue(key, load, deps);
}

function monthStartMs() {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function getRange(args?: { startDate?: number; endDate?: number }) {
	return {
		startDate: safeNum(args?.startDate ?? monthStartMs()),
		endDate: safeNum(args?.endDate ?? Date.now()),
	};
}

function groupBy(items: any[], key: (item: any) => string) {
	const map = new Map<string, any[]>();
	for (const item of items) {
		const k = key(item);
		map.set(k, [...(map.get(k) ?? []), item]);
	}
	return map;
}

async function fetchFinancialTransactions(args?: {
	type?: "income" | "expense";
	startDate?: number;
	endDate?: number;
}): Promise<any[]> {
	const supabase = createClient();
	const { startDate, endDate } = getRange(args);
	let query = supabase
		.from("pos_financial_transactions")
		.select("*")
		.gte("date", startDate)
		.lte("date", endDate)
		.order("date", { ascending: false });
	if (args?.type) query = query.eq("type", args.type);
	const { data, error } = await query;
	if (error) throw error;
	const mapped = (data ?? []).map((row: any) => ({
		_id: row._id,
		type: row.type ?? "expense",
		amount: safeNum(row.amount),
		category: row.category ?? "",
		merchant: row.merchant ?? "",
		description: row.description ?? "",
		date: safeNum(row.date),
		paymentMethod: row.paymentMethod ?? "cash",
		status: row.status ?? "completed",
		orderId: row.orderId ?? null,
		bookingOrderId: row.bookingOrderId ?? null,
		attachmentUrl: row.attachmentUrl ?? null,
		sourceFingerprint: row.sourceFingerprint ?? null,
		isRecurring: Boolean(row.isRecurring),
		recurringInterval: row.recurringInterval ?? null,
		tags: Array.isArray(row.tags) ? row.tags : [],
		metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
	}));
	// ── Batch-fetch order items untuk income transaksi ──
	const orderTxIds = mapped
		.filter((tx: any) => tx.type === "income" && tx.orderId)
		.map((tx: any) => tx.orderId);
	if (orderTxIds.length > 0) {
		const { data: orderItems, error: oiError } = await supabase
			.from("pos_order_items")
			.select("*")
			.in("order_source_id", orderTxIds);
		if (!oiError && orderItems) {
			const itemsByOrder = new Map<string, any[]>();
			for (const item of orderItems) {
				const oid = String(item.order_source_id);
				if (!itemsByOrder.has(oid)) itemsByOrder.set(oid, []);
				itemsByOrder.get(oid)!.push({
					name: item.product_name ?? `Item ${item.line_no}`,
					quantity: safeNum(item.quantity) || 1,
					price: safeNum(item.price) || 0,
					total: (safeNum(item.quantity) || 1) * (safeNum(item.price) || 0),
				});
			}
			for (const tx of mapped) {
				if (tx.type === "income" && tx.orderId) {
					const items = itemsByOrder.get(String(tx.orderId));
					if (items && items.length > 0) {
						tx.metadata = { ...tx.metadata, scanItems: items };
					}
				}
			}
		}
	}
	// ── Safety dedup ──
	const seen = new Set<string>();
	const deduped: typeof mapped = [];
	for (const tx of mapped) {
		const key = tx.sourceFingerprint ||
			`${tx.type}|${tx.amount}|${tx.category}|${tx.description}|${Math.floor(tx.date / 60000)}`;
		if (!seen.has(key)) {
			seen.add(key);
			deduped.push(tx);
		}
	}
	return deduped;
}

async function fetchOrders(args?: { startDate?: number; endDate?: number }) {
	const supabase = createClient();
	const { startDate, endDate } = getRange(args);
	const { data, error } = await supabase
		.from("pos_orders")
		.select("*")
		.gte("createdAt", startDate)
		.lte("createdAt", endDate)
		.order("createdAt", { ascending: false });
	if (error) throw error;
	return (data ?? []) as any[];
}

function summarizeTransactions(transactions: any[]) {
	const completed = transactions.filter(
		(tx) => (tx.status ?? "completed") === "completed"
	);
	const totalIncome = completed
		.filter(
			(tx) =>
				tx.type === "income" &&
				tx.category !== "Modal Awal" &&
				tx.category !== "Setoran Akhir"
		)
		.reduce((sum, tx) => sum + safeNum(tx.amount), 0);
	const totalExpense = completed
		.filter((tx) => tx.type === "expense")
		.reduce((sum, tx) => sum + safeNum(tx.amount), 0);
	return {
		totalIncome,
		totalExpense,
		netBalance: totalIncome - totalExpense,
	};
}

function buildTrendRows(
	transactions: any[],
	buckets: Array<{ label: string; start: number; end: number }>
) {
	return buckets.map((bucket) => {
		const rows = transactions.filter(
			(tx) =>
				(tx.status ?? "completed") === "completed" &&
				tx.date >= bucket.start &&
				tx.date <= bucket.end
		);
		const income = rows
			.filter(
				(tx) =>
					tx.type === "income" &&
					tx.category !== "Modal Awal" &&
					tx.category !== "Setoran Akhir"
			)
			.reduce((sum, tx) => sum + safeNum(tx.amount), 0);
		const expense = rows
			.filter((tx) => tx.type === "expense")
			.reduce((sum, tx) => sum + safeNum(tx.amount), 0);
		return { label: bucket.label, income, expense, net: income - expense };
	});
}

function mapTransactionRows(transactions: any[], mode: "transaction" | "item") {
	if (mode === "transaction") {
		return transactions.map((tx) => ({
			...tx,
			displayTitle: tx.merchant || tx.description || tx.category || "Transaksi",
			displaySummary: tx.description || tx.category || "-",
			receiptGroupLabel: tx.metadata?.receiptNumber || tx._id,
			referenceValue: tx.orderId || tx.bookingOrderId || "",
			sourceLabel: tx.metadata?.sourceLabel || tx.type,
			sourceRef: tx.metadata?.sourceRef || "",
		}));
	}

	const rows: any[] = [];
	for (const tx of transactions) {
		const items = Array.isArray(tx.metadata?.scanItems) ? tx.metadata.scanItems : [];
		if (items.length === 0) {
			rows.push({
				...tx,
				itemIndex: 0,
				itemName: tx.description || tx.category || "Item",
				qty: 1,
				price: safeNum(tx.amount),
				total: safeNum(tx.amount),
				displayTitle: tx.merchant || tx.description || tx.category || "Transaksi",
				displaySummary: tx.description || tx.category || "-",
				receiptGroupLabel: tx.metadata?.receiptNumber || tx._id,
				referenceValue: tx.orderId || tx.bookingOrderId || "",
				sourceLabel: tx.metadata?.sourceLabel || tx.type,
				sourceRef: tx.metadata?.sourceRef || "",
			});
			continue;
		}
		items.forEach((item: any, index: number) => {
			const qty = safeNum(item.quantity ?? item.qty ?? 1) || 1;
			// Jangan fallback ke tx.amount — gunakan item.total / item.price saja.
			// Jika item.total=0 dan item.price=0, total=0 (bukan penuh transaksi).
			const itemTotal = safeNum(item.total ?? item.subtotal);
			const total = itemTotal > 0 ? itemTotal : safeNum(item.price ?? 0) * qty;
			const price = safeNum(item.price ?? (qty > 0 ? total / qty : 0));
			rows.push({
				...tx,
				amount: total, // override ke total item, bukan full transaksi
				itemIndex: index,
				itemName: item.name ?? `Item ${index + 1}`,
				qty,
				price,
				total,
				displayTitle: tx.merchant || tx.description || tx.category || "Transaksi",
				displaySummary: `${item.name ?? "Item"} x${qty}`,
				receiptGroupLabel: tx.metadata?.receiptNumber || tx._id,
				referenceValue: tx.orderId || tx.bookingOrderId || "",
			sourceLabel: tx.metadata?.sourceLabel || tx.type,
			sourceRef: tx.metadata?.sourceRef || "",
			});
		});
	}
	return rows;
}

async function fetchHppCalculations() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_hpp_calculations")
		.select("*")
		.order("updatedAt", { ascending: false });
	if (error) throw error;
	return (data ?? []) as any[];
}

function computeHppMetrics(calc: any) {
	const ingredients = Array.isArray(calc.ingredients) ? calc.ingredients : [];
	const overheads = Array.isArray(calc.overheadCosts) ? calc.overheadCosts : [];
	const ingredientsCost = ingredients.reduce((sum: number, item: any) => {
		const price = safeNum(item.purchasePrice);
		const qty = safeNum(item.purchaseQuantity);
		const factor = safeNum(item.conversionFactor) || 1;
		const usage = safeNum(item.usagePerServing);
		if (price <= 0 || qty <= 0 || factor <= 0 || usage <= 0) return sum;
		return sum + (price / (qty * factor)) * usage;
	}, 0);
	const overheadCost = overheads.reduce(
		(sum: number, item: any) => sum + safeNum(item.costPerServing),
		0
	);
	const hppPerServing = ingredientsCost + overheadCost;
	const sellingPrice = safeNum(calc.sellingPrice);
	const profitPerServing = sellingPrice - hppPerServing;
	const marginPercent =
		sellingPrice > 0 ? (profitPerServing / sellingPrice) * 100 : 0;
	return { hppPerServing, sellingPrice, profitPerServing, marginPercent };
}

async function fetchCurrentMonthProgress() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_current_month_progress")
		.select("*")
		.maybeSingle();
	if (error) throw error;
	return data ?? null;
}

async function fetchAiConversationMemory(sessionId?: string | null) {
	const supabase = createClient();
	let query = supabase
		.from("pos_ai_conversation_memory")
		.select("*")
		.order("timestamp", { ascending: true });
	if (sessionId) query = query.eq("sessionId", sessionId);
	const { data, error } = await query;
	if (error) throw error;
	return (data ?? []) as any[];
}

async function fetchFollowUpTasks(category?: string) {
	const supabase = createClient();
	let query = supabase
		.from("pos_follow_up_tasks")
		.select("*")
		.in("status", ["pending", "acknowledged"])
		.order("createdAt", { ascending: false });
	if (category) query = query.eq("category", category);
	const { data, error } = await query;
	if (error) throw error;
	return (data ?? []) as any[];
}

async function fetchCustomerServiceRequests(args?: {
	status?: string;
	limit?: number;
}) {
	try {
		const supabase = createClient();
		let query = supabase
			.schema("legacy_mirror")
			.from("documents")
			.select("document_id, creation_time, document")
			.eq("table_name", "customerService")
			.order("creation_time", { ascending: false });
		if (args?.limit) query = query.limit(args.limit);
		const { data, error } = await query;
		if (error) throw error;
		let rows: any[] = (data ?? []).map((row: any) => {
			const doc = row.document || {};
			return {
				_id: row.document_id,
				status: doc.status ?? "pending",
				name: doc.customerName ?? doc.name ?? "Pelanggan",
				phone: doc.customerPhone ?? doc.phone ?? "",
				description: doc.description ?? doc.issue ?? "",
				category: doc.category ?? "general",
				createdAt: safeNum(doc.createdAt ?? row.creation_time),
			};
		});
		if (args?.status) rows = rows.filter((row: any) => row.status === args.status);
		return rows;
	} catch {
		return [];
	}
}

export function useHybridAllTransactions(args?: {
	type?: "income" | "expense";
	startDate?: number;
	endDate?: number;
}) {
	return useSupabaseValue(
		`all-transactions:${args?.type ?? "all"}:${args?.startDate ?? ""}:${args?.endDate ?? ""}`,
		() => fetchFinancialTransactions(args),
		[args?.type, args?.startDate, args?.endDate]
	) as any;
}

export function useHybridFinancialSummary(args?: {
	startDate?: number;
	endDate?: number;
}) {
	return useSupabaseValue(
		`financial-summary:${args?.startDate ?? ""}:${args?.endDate ?? ""}`,
		async () => summarizeTransactions(await fetchFinancialTransactions(args)),
		[args?.startDate, args?.endDate]
	) as any;
}

export function useHybridPeriodComparison() {
	return useSupabaseValue(
		"period-comparison",
		async () => {
			const now = new Date();
			const currStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
			const currEnd = Date.now();
			const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
			const prevEnd = new Date(
				now.getFullYear(),
				now.getMonth(),
				0,
				23,
				59,
				59,
				999
			).getTime();
			const [curr, prev] = await Promise.all([
				fetchFinancialTransactions({ startDate: currStart, endDate: currEnd }),
				fetchFinancialTransactions({ startDate: prevStart, endDate: prevEnd }),
			]);
			const c = summarizeTransactions(curr);
			const p = summarizeTransactions(prev);
			const pct = (current: number, previous: number) =>
				previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;
			return {
				current: { income: c.totalIncome, expense: c.totalExpense, net: c.netBalance },
				previous: { income: p.totalIncome, expense: p.totalExpense, net: p.netBalance },
				changes: {
					incomePct: pct(c.totalIncome, p.totalIncome),
					expensePct: pct(c.totalExpense, p.totalExpense),
					netPct: pct(c.netBalance, p.netBalance),
				},
			};
		},
		[]
	) as any;
}

export function useHybridMonthlyTrend(months = 6) {
	return useSupabaseValue(
		`monthly-trend:${months}`,
		async () => {
			const now = new Date();
			const buckets = Array.from({ length: Math.max(1, months) }, (_, i) => {
				const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
				const start = d.getTime();
				const end = new Date(
					d.getFullYear(),
					d.getMonth() + 1,
					0,
					23,
					59,
					59,
					999
				).getTime();
				return {
					label: d.toLocaleDateString("id-ID", { month: "short" }),
					start,
					end,
				};
			});
			const txs = await fetchFinancialTransactions({
				startDate: buckets[0].start,
				endDate: buckets[buckets.length - 1].end,
			});
			return buildTrendRows(txs, buckets);
		},
		[months]
	) as any;
}

export function useHybridWeeklyTrend(weeks = 8) {
	return useSupabaseValue(
		`weekly-trend:${weeks}`,
		async () => {
			const now = Date.now();
			const buckets = Array.from({ length: Math.max(1, weeks) }, (_, i) => {
				const end = now - (weeks - 1 - i) * 7 * 24 * 60 * 60 * 1000;
				const start = end - 6 * 24 * 60 * 60 * 1000;
				return { label: `M${i + 1}`, start, end };
			});
			const txs = await fetchFinancialTransactions({
				startDate: buckets[0].start,
				endDate: buckets[buckets.length - 1].end,
			});
			return buildTrendRows(txs, buckets);
		},
		[weeks]
	) as any;
}

export function useHybridDailyTrend(days = 14) {
	return useSupabaseValue(
		`daily-trend:${days}`,
		async () => {
			const now = new Date();
			const buckets = Array.from({ length: Math.max(1, days) }, (_, i) => {
				const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
				const start = d.getTime();
				const end = new Date(
					d.getFullYear(),
					d.getMonth(),
					d.getDate(),
					23,
					59,
					59,
					999
				).getTime();
				return {
					label: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
					start,
					end,
				};
			});
			const txs = await fetchFinancialTransactions({
				startDate: buckets[0].start,
				endDate: buckets[buckets.length - 1].end,
			});
			return buildTrendRows(txs, buckets);
		},
		[days]
	) as any;
}

export function useHybridExpenseCategoryBreakdown(args?: {
	startDate?: number;
	endDate?: number;
}) {
	return useSupabaseValue(
		`expense-breakdown:${args?.startDate ?? ""}:${args?.endDate ?? ""}`,
		async () => {
			const txs = await fetchFinancialTransactions(args);
			const completed = txs.filter(
				(tx: any) => (tx.status ?? "completed") === "completed"
			);
			const buildRows = (type: "income" | "expense") => {
				const rows = Array.from(
					groupBy(
						completed.filter((tx: any) => tx.type === type),
						(tx: any) =>
							String(tx.category || (type === "income" ? "Penjualan" : "lainnya"))
					).entries()
				).map(([category, items]) => ({
					category,
					amount: items.reduce(
						(sum: number, item: any) => sum + safeNum(item.amount),
						0
					),
				}));
				const total = rows.reduce((sum: number, row: any) => sum + row.amount, 0);
				return {
					total,
					rows: rows
						.sort((a: any, b: any) => b.amount - a.amount)
						.map((row: any) => ({
							...row,
							percentage: total > 0 ? (row.amount / total) * 100 : 0,
						})),
				};
			};
			const expense = buildRows("expense");
			const income = buildRows("income");
			return {
				expenseBreakdown: expense.rows,
				incomeBreakdown: income.rows,
				totalExpense: expense.total,
				totalIncome: income.total,
			};
		},
		[args?.startDate, args?.endDate]
	) as any;
}

export function useHybridProfitLossReport(args?: {
	startDate?: number;
	endDate?: number;
}) {
	return useSupabaseValue(
		`profit-loss:${args?.startDate ?? ""}:${args?.endDate ?? ""}`,
		async () => {
			const txs = await fetchFinancialTransactions(args);
			const completed = txs.filter(
				(tx: any) => (tx.status ?? "completed") === "completed"
			);
			const incomeRows = completed.filter((tx: any) => tx.type === "income");
			const expenseRows = completed.filter((tx: any) => tx.type === "expense");
			const totalIncome = incomeRows.reduce(
				(sum: number, tx: any) => sum + safeNum(tx.amount),
				0
			);
			const totalExpense = expenseRows.reduce(
				(sum: number, tx: any) => sum + safeNum(tx.amount),
				0
			);
			const hppAmount = expenseRows
				.filter((tx: any) =>
					String(tx.category || "").toLowerCase().match(/hpp|cogs|pokok|bahan/)
				)
				.reduce((sum: number, tx: any) => sum + safeNum(tx.amount), 0);
			const grossSalesRevenue = totalIncome;
			const totalDiscount = incomeRows.reduce(
				(sum: number, tx: any) => sum + safeNum((tx.metadata as any)?.discount ?? 0),
				0
			);
			const salesRevenue = Math.max(0, grossSalesRevenue - totalDiscount);
			const grossProfit = salesRevenue - hppAmount;
			const netProfit = totalIncome - totalExpense;
			const netMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
			return {
				income: {
					total: totalIncome,
					grossSalesRevenue,
					totalDiscount,
					salesRevenue,
					sources: Array.from(
						groupBy(incomeRows, (tx: any) => String(tx.category || "Penjualan")).entries()
					).map(([category, items]) => ({
						category,
						amount: items.reduce(
							(sum: number, item: any) => sum + safeNum(item.amount),
							0
						),
					})),
				},
				expense: {
					total: totalExpense,
					hppAmount,
					operatingExpenses: Array.from(
						groupBy(expenseRows, (tx: any) => String(tx.category || "lainnya")).entries()
					).map(([category, items]) => ({
						category,
						amount: items.reduce(
							(sum: number, item: any) => sum + safeNum(item.amount),
							0
						),
					})),
				},
				grossProfit,
				netProfit,
				netMargin,
			};
		},
		[args?.startDate, args?.endDate]
	) as any;
}

export function useHybridCashFlowReport(args?: {
	startDate?: number;
	endDate?: number;
}) {
	return useSupabaseValue(
		`cash-flow:${args?.startDate ?? ""}:${args?.endDate ?? ""}`,
		async () => {
			const txs = await fetchFinancialTransactions(args);
			const completed = txs.filter(
				(tx: any) => (tx.status ?? "completed") === "completed"
			);
			const totalInflow = completed
				.filter((tx: any) => tx.type === "income")
				.reduce((sum: number, tx: any) => sum + safeNum(tx.amount), 0);
			const totalOutflow = completed
				.filter((tx: any) => tx.type === "expense")
				.reduce((sum: number, tx: any) => sum + safeNum(tx.amount), 0);
			const byDay = groupBy(
				completed,
				(tx: any) => new Date(tx.date).toISOString().slice(0, 10)
			);
			let runningBalance = 0;
			const dailyCashFlow = Array.from(byDay.entries())
				.sort((a, b) => a[0].localeCompare(b[0]))
				.map(([date, items]) => {
					const inflow = items
						.filter((tx: any) => tx.type === "income")
						.reduce((sum: number, tx: any) => sum + safeNum(tx.amount), 0);
					const outflow = items
						.filter((tx: any) => tx.type === "expense")
						.reduce((sum: number, tx: any) => sum + safeNum(tx.amount), 0);
					const net = inflow - outflow;
					runningBalance += net;
					return { date, inflow, outflow, net, balance: runningBalance };
				});
			const byPaymentMethod: Record<string, { inflow: number; outflow: number }> = {};
			for (const tx of completed) {
				const method = String(tx.paymentMethod || "cash");
				if (!byPaymentMethod[method]) {
					byPaymentMethod[method] = { inflow: 0, outflow: 0 };
				}
				if (tx.type === "income") byPaymentMethod[method].inflow += safeNum(tx.amount);
				else byPaymentMethod[method].outflow += safeNum(tx.amount);
			}
			return {
				totalInflow,
				totalOutflow,
				netCashFlow: totalInflow - totalOutflow,
				dailyCashFlow,
				byPaymentMethod,
			};
		},
		[args?.startDate, args?.endDate]
	) as any;
}

export function useHybridTransactionDetailReport(
	args:
		| {
				startDate?: number;
				endDate?: number;
				type?: "income" | "expense";
				category?: string;
				viewMode?: "transaction" | "item";
				page?: number;
				pageSize?: number;
		  }
		| "skip"
) {
	return useSupabaseValue(
		args === "skip"
			? "transaction-detail:skip"
			: `transaction-detail:${args.startDate ?? ""}:${args.endDate ?? ""}:${args.type ?? "all"}:${args.category ?? "all"}:${args.viewMode ?? "transaction"}:${args.page ?? 1}:${args.pageSize ?? 50}`,
		async () => {
			if (args === "skip") return null;
			let txs = await fetchFinancialTransactions({
				startDate: args.startDate,
				endDate: args.endDate,
				type: args.type,
			});
			if (args.category) txs = txs.filter((tx: any) => tx.category === args.category);
			const rows = mapTransactionRows(txs, args.viewMode ?? "transaction");
			const pageSize = Math.max(1, Math.min(2000, Math.floor(args.pageSize ?? 50)));
			const page = Math.max(1, Math.floor(args.page ?? 1));
			const count = rows.length;
			const pageCount = Math.max(1, Math.ceil(count / pageSize));
			const start = (page - 1) * pageSize;
			const transactions = rows.slice(start, start + pageSize);
			const { totalIncome, totalExpense, netBalance } = summarizeTransactions(txs);
			return {
				transactions,
				count,
				page,
				pageCount,
				totalIncome,
				totalExpense,
				netBalance,
			};
		},
		[
			args === "skip" ? "skip" : args.startDate,
			args === "skip" ? "skip" : args.endDate,
			args === "skip" ? "skip" : args.type,
			args === "skip" ? "skip" : args.category,
			args === "skip" ? "skip" : args.viewMode,
			args === "skip" ? "skip" : args.page,
			args === "skip" ? "skip" : args.pageSize,
		]
	) as any;
}

export function useHybridShiftTargetProgress() {
	return useSupabaseValue(
		"shift-target-progress",
		async () => {
			const data = await fetchCurrentMonthProgress();
			if (!data) return null;
			return {
				month: data.month,
				targetRevenue: safeNum(data.target_revenue),
				currentRevenue: safeNum(data.current_income),
				progressPct: safeNum(data.progress_pct),
				remaining: safeNum(data.remaining),
				dailyTarget: safeNum(data.daily_target),
				shiftTarget: safeNum(data.shift_target),
				dailyCollected: safeNum(data.daily_collected),
				shiftCollected: safeNum(data.shift_collected),
			};
		},
		[]
	) as any;
}

export function useHybridOrdersCogs(args?: { startDate?: number; endDate?: number }) {
	return useSupabaseValue(
		`orders-cogs:${args?.startDate ?? ""}:${args?.endDate ?? ""}`,
		async () => {
			const orders = await fetchOrders(args);
			const completed = orders.filter(
				(order: any) => order.status === "completed" || order.status === "paid"
			);
			let matchedOrders = 0;
			let totalRevenue = 0;
			let totalCogs = 0;
			const dailyMap = new Map<
				string,
				{ orders: number; revenue: number; cogs: number; profit: number }
			>();
			for (const order of completed) {
				const revenue = safeNum(order.totalAmount);
				totalRevenue += revenue;
				let orderCogs = 0;
				for (const item of Array.isArray(order.items) ? order.items : []) {
					const qty = safeNum(item.quantity) || 1;
					const hppPerServing = safeNum(
						item?.hppSnapshot?.hppPerServing ?? item?.hppSnapshot?.totalHppPerServing
					);
					if (hppPerServing > 0) orderCogs += hppPerServing * qty;
				}
				if (orderCogs > 0) matchedOrders += 1;
				totalCogs += orderCogs;
				const key = new Date(safeNum(order.createdAt)).toISOString().slice(0, 10);
				const row = dailyMap.get(key) ?? {
					orders: 0,
					revenue: 0,
					cogs: 0,
					profit: 0,
				};
				row.orders += 1;
				row.revenue += revenue;
				row.cogs += orderCogs;
				row.profit += revenue - orderCogs;
				dailyMap.set(key, row);
			}
			const totalProfit = totalRevenue - totalCogs;
			const grossMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
			return {
				totalRevenue,
				totalCogs,
				totalProfit,
				grossMargin,
				matchedOrders,
				totalCompletedOrders: completed.length,
				dailySummary: Array.from(dailyMap.entries())
					.sort((a, b) => a[0].localeCompare(b[0]))
					.map(([date, row]) => ({ date, ...row })),
			};
		},
		[args?.startDate, args?.endDate]
	) as any;
}

export function useHybridHppPortfolio() {
	return useSupabaseValue(
		"hpp-portfolio",
		async () => {
			const calculations = await fetchHppCalculations();
			const portfolio = calculations.map((calc: any) => {
				const metrics = computeHppMetrics(calc);
				const status =
					metrics.marginPercent >= 55
						? "excellent"
						: metrics.marginPercent >= 35
							? "healthy"
							: metrics.marginPercent >= 20
								? "watch"
								: "critical";
				return {
					id: calc._id,
					productId: calc.productId ?? undefined,
					productName: calc.name ?? "Produk",
					name: calc.name ?? "HPP",
					hppPerServing: metrics.hppPerServing,
					sellingPrice: metrics.sellingPrice,
					marginPercent: metrics.marginPercent,
					profitPerServing: metrics.profitPerServing,
					status,
					updatedAt: safeNum(calc.updatedAt),
					calculation: calc,
					metrics,
				};
			});
			return {
				summary: {
					totalProducts: portfolio.length,
					criticalCount: portfolio.filter((row: any) => row.marginPercent < 20).length,
					watchCount: portfolio.filter((row: any) => row.marginPercent >= 20 && row.marginPercent < 35).length,
					healthyCount: portfolio.filter((row: any) => row.marginPercent >= 35).length,
					avgMarginPercent:
						portfolio.length > 0
							? portfolio.reduce((sum: number, row: any) => sum + row.marginPercent, 0) / portfolio.length
							: 0,
				},
				alerts: portfolio
					.filter((row: any) => row.marginPercent < 35)
					.map((row: any) => ({
						productId: row.productId ?? row.id,
						productName: row.productName,
						status: row.marginPercent < 20 ? "critical" : "warning",
						reason:
							row.marginPercent < 20
								? "Margin terlalu rendah"
								: "Margin perlu dipantau",
					})),
				portfolio,
				drafts: [],
			};
		},
		[]
	) as any;
}

export function useHybridHppWithMarginAnalysis(targetMarginPercent = 30) {
	return useSupabaseValue(
		`hpp-margin-analysis:${targetMarginPercent}`,
		async () => {
			const calculations = await fetchHppCalculations();
			return calculations.map((calc: any) => {
				const metrics = computeHppMetrics(calc);
				const recommendedSellingPrice =
					metrics.hppPerServing / Math.max(0.01, 1 - targetMarginPercent / 100);
				const priceDiff = recommendedSellingPrice - metrics.sellingPrice;
				return {
					id: calc._id,
					name: calc.name ?? "HPP",
					productId: calc.productId ?? undefined,
					hppPerServing: metrics.hppPerServing,
					currentSellingPrice: metrics.sellingPrice,
					currentMarginPercent: metrics.marginPercent,
					currentProfitPerServing: metrics.profitPerServing,
					targetMarginPercent,
					recommendedSellingPrice,
					priceDiff,
					isLowMargin: metrics.marginPercent < targetMarginPercent,
					status:
						metrics.marginPercent < 20
							? "critical"
							: metrics.marginPercent < targetMarginPercent
								? "warning"
								: "ok",
				};
			});
		},
		[targetMarginPercent]
	) as any;
}

export function useHybridPredictStockOut(daysAhead = 7) {
	return useSupabaseValue(
		`predict-stockout:${daysAhead}`,
		async () => {
			const supabase = createClient();
			const { data, error } = await supabase.from("pos_inventory").select("*");
			if (error) throw error;
			return (data ?? [])
				.map((item: any) => {
					const currentStock = safeNum(item.quantity);
					const threshold = Math.max(1, safeNum(item.lowStockThreshold));
					const dailyUsage = Math.max(0.1, threshold / 7);
					const daysUntilEmpty = currentStock / dailyUsage;
					return {
						inventoryId: item._id,
						ingredientName: item.ingredientName ?? "Item",
						currentStock,
						unit: item.unit ?? "",
						dailyUsage,
						daysUntilEmpty,
						risk:
							daysUntilEmpty <= 3
								? "high"
								: daysUntilEmpty <= 7
									? "medium"
									: "low",
					};
				})
				.filter((row: any) => row.daysUntilEmpty <= Math.max(7, daysAhead * 2))
				.sort((a: any, b: any) => a.daysUntilEmpty - b.daysUntilEmpty);
		},
		[daysAhead]
	) as any;
}

export function useHybridPredictBusyHours() {
	return useSupabaseValue(
		"predict-busy-hours",
		async () => {
			const orders = await fetchOrders({
				startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
				endDate: Date.now(),
			});
			const byHour = new Map<number, number>();
			const byDay = new Map<number, number>();
			for (const order of orders) {
				const d = new Date(safeNum((order as any).createdAt));
				byHour.set(d.getHours(), (byHour.get(d.getHours()) ?? 0) + 1);
				byDay.set(d.getDay(), (byDay.get(d.getDay()) ?? 0) + 1);
			}
			const max = Math.max(1, ...Array.from(byHour.values()));
			const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
			return {
				totalOrders: orders.length,
				peakHours: Array.from(byHour.entries())
					.map(([hour, orderCount]) => ({
						hour,
						orderCount,
						percentage: (orderCount / max) * 100,
					}))
					.sort((a, b) => b.orderCount - a.orderCount),
				peakDays: Array.from(byDay.entries())
					.map(([day, orderCount]) => ({
						day,
						dayName: dayNames[day] ?? String(day),
						orderCount,
					}))
					.sort((a, b) => b.orderCount - a.orderCount),
			};
		},
		[]
	) as any;
}

export function useHybridPredictDailyRevenue(daysAhead = 7) {
	const data = useSupabaseValue(
		`predict-daily-revenue:${daysAhead}`,
		async () => {
			const txs = await fetchFinancialTransactions({
				startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
				endDate: Date.now(),
				type: "income",
			});
			const grouped = groupBy(
				txs.filter((tx: any) => (tx.status ?? "completed") === "completed"),
				(tx: any) => new Date(tx.date).toISOString().slice(0, 10)
			);
			const dailyValues = Array.from(grouped.values()).map((rows) =>
				rows.reduce((sum, row: any) => sum + safeNum(row.amount), 0)
			);
			const avg =
				dailyValues.length > 0
					? dailyValues.reduce((sum: number, v: number) => sum + v, 0) /
					  dailyValues.length
					: 0;
			return Array.from({ length: Math.max(1, daysAhead) }, (_, i) => {
				const d = new Date();
				d.setDate(d.getDate() + i + 1);
				const weekendFactor = [0, 6].includes(d.getDay()) ? 1.1 : 1;
				return {
					date: d.toISOString().slice(0, 10),
					dayName: d.toLocaleDateString("id-ID", { weekday: "long" }),
					predictedAmount: Math.round(avg * weekendFactor),
				};
			});
		},
		[daysAhead]
	) as any;
	if (Array.isArray(data)) return data;
	if (Array.isArray(data?.predictions)) return data.predictions;
	return data;
}

export function useHybridPredictTrendingProducts(_daysAhead = 7) {
	return useSupabaseValue(
		"predict-trending-products",
		async () => {
			const orders = await fetchOrders({
				startDate: Date.now() - 14 * 24 * 60 * 60 * 1000,
				endDate: Date.now(),
			});
			const valid = orders.filter(
				(order: any) => order.status === "completed" || order.status === "paid"
			);
			const splitDate = Date.now() - 7 * 24 * 60 * 60 * 1000;
			const map = new Map<
				string,
				{ productName: string; recentSales: number; oldSales: number }
			>();
			for (const order of valid) {
				const isRecent = safeNum((order as any).createdAt) >= splitDate;
				for (const item of Array.isArray((order as any).items) ? (order as any).items : []) {
					const key = String(item.productId ?? item.productName ?? "unknown");
					const row = map.get(key) ?? {
						productName: item.productName ?? "Produk",
						recentSales: 0,
						oldSales: 0,
					};
					if (isRecent) row.recentSales += safeNum(item.quantity);
					else row.oldSales += safeNum(item.quantity);
					map.set(key, row);
				}
			}
			return Array.from(map.values())
				.map((row) => ({
					productName: row.productName,
					recentSales: row.recentSales,
					totalSales: row.recentSales + row.oldSales,
					growthRate:
						row.oldSales > 0
							? ((row.recentSales - row.oldSales) / row.oldSales) * 100
							: row.recentSales > 0
								? 100
								: 0,
				}))
				.sort((a, b) => b.recentSales - a.recentSales)
				.slice(0, 10);
		},
		[]
	) as any;
}

export function useHybridPredictBestPromoTime() {
	return useSupabaseValue(
		"predict-best-promo-time",
		async () => {
			const orders = await fetchOrders({
				startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
				endDate: Date.now(),
			});
			const byHour = new Map<number, number>();
			for (const order of orders) {
				const hour = new Date(safeNum((order as any).createdAt)).getHours();
				byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
			}
			const low = Array.from(byHour.entries())
				.sort((a, b) => a[1] - b[1])
				.slice(0, 3)
				.map(([hour]) => `${String(hour).padStart(2, "0")}:00`);
			return {
				recommendedHours: low,
				reason: "Jam cenderung sepi dan cocok untuk promo booster traffic.",
			};
		},
		[]
	) as any;
}

export function useHybridProactiveSuggestions() {
	const stockPredictions = useHybridPredictStockOut(7) as any[] | undefined;
	const revenuePrediction = useHybridPredictDailyRevenue(7) as any[] | undefined;
	return useMemo(() => {
		const suggestions: any[] = [];
		for (const row of (stockPredictions ?? []).filter((s) => s.risk === "high").slice(0, 3)) {
			suggestions.push({
				id: `stock-${row.inventoryId}`,
				type: "inventory",
				title: `Restock ${row.ingredientName}`,
				description: `Prediksi habis dalam ${row.daysUntilEmpty.toFixed(1)} hari.`,
				priority: "high",
				createdAt: Date.now(),
				action: { type: "navigate", args: { to: "/admin/inventory" } },
			});
		}
		if ((revenuePrediction ?? []).length > 0) {
			suggestions.push({
				id: "revenue-plan",
				type: "finance",
				title: "Atur target promo harian",
				description: "Gunakan prediksi revenue 7 hari sebagai acuan target tim.",
				priority: "medium",
				createdAt: Date.now(),
				action: { type: "navigate", args: { to: "/admin/forecasting" } },
			});
		}
		return suggestions;
	}, [stockPredictions, revenuePrediction]);
}

export function useHybridChatSessions() {
	return useSupabaseValue(
		"chat-sessions",
		async () => {
			const rows = await fetchAiConversationMemory();
			const grouped = groupBy(rows, (row: any) => String(row.sessionId || "default"));
			return Array.from(grouped.entries())
				.map(([sessionId, items]) => {
					const sorted = [...items].sort(
						(a: any, b: any) => safeNum(a.timestamp) - safeNum(b.timestamp)
					);
					const first = sorted[0] as any;
					return {
						sessionId,
						title: (first?.content || "Percakapan Baru").slice(0, 60),
						createdAt: safeNum(first?.timestamp ?? Date.now()),
						messageCount: sorted.length,
					};
				})
				.sort((a, b) => b.createdAt - a.createdAt);
		},
		[]
	) as any;
}

export function useHybridPendingTasks(args?: { category?: string }) {
	return useSupabaseValue(
		`pending-tasks:${args?.category ?? "all"}`,
		() => fetchFollowUpTasks(args?.category),
		[args?.category]
	) as any;
}

export function useHybridConversationContext(sessionId?: string | null) {
	return useSupabaseValue(
		`conversation-context:${sessionId ?? "skip"}`,
		() => (sessionId ? fetchAiConversationMemory(sessionId) : Promise.resolve(null)),
		[sessionId]
	) as any;
}

export function useHybridStreamingMessage(_sessionId?: string | null) {
	return useMemo(() => ({ status: "completed", content: "" }), []) as any;
}

export function useHybridCustomerServiceRequests(args?: {
	status?: "pending" | "acknowledged" | "completed" | "cancelled";
	limit?: number;
}) {
	return useSupabaseValue(
		`customer-service-requests:${args?.status ?? "all"}:${args?.limit ?? 200}`,
		() => fetchCustomerServiceRequests(args),
		[args?.status, args?.limit]
	) as any;
}

export function useHybridHppPriceSimulation(
	args:
		| {
				id: string;
				priceChangePercent: number;
				ingredientIndex?: number;
		  }
		| "skip"
) {
	return useSupabaseValue(
		args === "skip"
			? "hpp-price-sim:skip"
			: `hpp-price-sim:${args.id}:${args.priceChangePercent}:${args.ingredientIndex ?? "all"}`,
		async () => {
			if (args === "skip") return null;
			const calculations = await fetchHppCalculations();
			const calc = calculations.find((row: any) => row._id === args.id);
			if (!calc) return null;
			const original = computeHppMetrics(calc);
			const simulatedCalc = JSON.parse(JSON.stringify(calc));
			if (
				typeof args.ingredientIndex === "number" &&
				Array.isArray(simulatedCalc.ingredients) &&
				simulatedCalc.ingredients[args.ingredientIndex]
			) {
				simulatedCalc.ingredients[args.ingredientIndex].purchasePrice =
					safeNum(simulatedCalc.ingredients[args.ingredientIndex].purchasePrice) *
					(1 + args.priceChangePercent / 100);
			} else if (Array.isArray(simulatedCalc.ingredients)) {
				simulatedCalc.ingredients = simulatedCalc.ingredients.map((ingredient: any) => ({
					...ingredient,
					purchasePrice:
						safeNum(ingredient.purchasePrice) * (1 + args.priceChangePercent / 100),
				}));
			}
			const simulated = computeHppMetrics(simulatedCalc);
			const recommendedSellingPrice = simulated.hppPerServing / (1 - 0.3);
			return {
				hppId: calc._id,
				name: calc.name ?? "HPP",
				priceChangePercent: args.priceChangePercent,
				ingredientIndex: args.ingredientIndex,
				original,
				simulated,
				delta: {
					hppDelta: simulated.hppPerServing - original.hppPerServing,
					profitDelta: simulated.profitPerServing - original.profitPerServing,
					marginDelta: simulated.marginPercent - original.marginPercent,
				},
				recommendedSellingPrice,
			};
		},
		[
			args === "skip" ? "skip" : args.id,
			args === "skip" ? "skip" : args.priceChangePercent,
			args === "skip" ? "skip" : args.ingredientIndex,
		]
	) as any;
}

// ── Accounting Data ─────────────────────────────────────

async function fetchAccountingEntries(args?: {
	startDate?: number;
	endDate?: number;
}): Promise<any[]> {
	const supabase = createClient();
	const { startDate, endDate } = getRange(args);
	const { data: txDates, error: txError } = await supabase
		.from("pos_financial_transactions")
		.select("_id, description, metadata")
		.gte("date", startDate)
		.lte("date", endDate);
	if (txError) throw txError;
	const ids = (txDates ?? []).map((r: any) => r._id);
	if (ids.length === 0) return [];

	const { data: entries, error: eError } = await supabase
		.from("accounting_entries")
		.select("*")
		.in("transaction_source_id", ids)
		.order("transaction_source_id", { ascending: true })
		.order("item_index", { ascending: true });
	if (eError) throw eError;

	const { data: coas, error: cError } = await supabase
		.from("accounting_chart_of_accounts")
		.select("id, code, name, type, normal_balance")
		.limit(100);
	if (cError) throw cError;

	const coaMap = new Map<string, any>();
	for (const c of coas ?? []) coaMap.set(c.id, c);

	const txMap = new Map<string, any>();
	for (const t of txDates ?? []) txMap.set(t._id, t);

	return (entries ?? []).map((e: any) => {
		const tx = txMap.get(e.transaction_source_id);
		const metadata = tx?.metadata || {};
		const sourceLabel =
			typeof metadata === "object" && metadata !== null
				? (metadata as any).sourceLabel ||
				  (metadata as any).source ||
				  ""
				: "";
		return {
			...e,
			coa: coaMap.get(e.coa_id) ?? null,
			coaCode: coaMap.get(e.coa_id)?.code ?? "",
			coaName: coaMap.get(e.coa_id)?.name ?? "",
			coaType: coaMap.get(e.coa_id)?.type ?? "",
			source_label: sourceLabel,
			tx_description: tx?.description || "",
		};
	});
}

async function fetchAccountingSummary(args?: {
	startDate?: number;
	endDate?: number;
}): Promise<any> {
	const entries = await fetchAccountingEntries(args);
	let totalDebit = 0;
	let totalKredit = 0;
	for (const e of entries) {
		if (e.entry_type === "debit") totalDebit += safeNum(e.amount);
		else totalKredit += safeNum(e.amount);
	}
	return {
		totalDebit,
		totalKredit,
		selisih: totalDebit - totalKredit,
		balance: Math.abs(totalDebit - totalKredit) < 0.01,
		count: entries.length,
	};
}

export function useHybridAccountingReport(args?: {
	startDate?: number;
	endDate?: number;
}): {
	entries: any[];
	summary: { totalDebit: number; totalKredit: number; selisih: number; balance: boolean; count: number };
	loading: boolean;
} {
	const key = args
		? `accounting:${args.startDate ?? ""}:${args.endDate ?? ""}`
		: "accounting:skip";

	const entries = useSupabaseValue(
		`${key}:entries`,
		() => {
			if (!args) return Promise.resolve([]);
			return fetchAccountingEntries(args);
		},
		[args?.startDate, args?.endDate]
	) as any[];

	const summary = useSupabaseValue(
		`${key}:summary`,
		() => {
			if (!args)
				return Promise.resolve({
					totalDebit: 0,
					totalKredit: 0,
					selisih: 0,
					balance: true,
					count: 0,
				});
			return fetchAccountingSummary(args);
		},
		[args?.startDate, args?.endDate]
	) as any;

	return {
		entries: entries ?? [],
		summary: summary ?? { totalDebit: 0, totalKredit: 0, selisih: 0, balance: true, count: 0 },
		loading: entries === undefined,
	};
}

