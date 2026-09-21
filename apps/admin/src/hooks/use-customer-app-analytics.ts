import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "./use-supabase-live-value";

export type CustomerAnalyticsPeriod =
	| "today"
	| "yesterday"
	| "this_week"
	| "last_week"
	| "this_month"
	| "last_month"
	| "this_3_months"
	| "last_3_months"
	| "this_6_months"
	| "last_6_months"
	| "this_year"
	| "last_year";

type CustomerRow = Record<string, any>;
type OrderRow = Record<string, any>;

export type CustomerAnalytics = {
	period: CustomerAnalyticsPeriod;
	periodLabel: string;
	activeCustomers: number;
	newCustomers: number;
	activeInPeriod: number;
	appOrders: number;
	appSpending: number;
	appVisits: number;
	walletBalance: number;
	trend: Array<{ label: string; orders: number; spending: number }>;
	topProducts: Array<{ name: string; quantity: number; spending: number }>;
	topCustomers: Array<{
		id: string;
		name: string;
		email: string;
		orders: number;
		spending: number;
		visits: number;
		lastActiveAt: string | null;
	}>;
};

function periodBounds(period: CustomerAnalyticsPeriod) {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const day = 24 * 60 * 60 * 1000;
	const startOfWeek = new Date(today);
	const mondayOffset = (today.getDay() + 6) % 7;
	startOfWeek.setDate(today.getDate() - mondayOffset);
	const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	const startOfYear = new Date(today.getFullYear(), 0, 1);
	let start: Date;
	let endExclusive: Date;

	switch (period) {
		case "today":
			start = today;
			endExclusive = new Date(today.getTime() + day);
			break;
		case "yesterday":
			start = new Date(today.getTime() - day);
			endExclusive = today;
			break;
		case "this_week":
			start = startOfWeek;
			endExclusive = new Date(startOfWeek.getTime() + 7 * day);
			break;
		case "last_week":
			start = new Date(startOfWeek.getTime() - 7 * day);
			endExclusive = startOfWeek;
			break;
		case "this_month":
			start = startOfMonth;
			endExclusive = new Date(today.getFullYear(), today.getMonth() + 1, 1);
			break;
		case "last_month":
			start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
			endExclusive = startOfMonth;
			break;
		case "this_3_months":
			start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
			endExclusive = new Date(today.getFullYear(), today.getMonth() + 1, 1);
			break;
		case "last_3_months":
			start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
			endExclusive = new Date(today.getFullYear(), today.getMonth() - 2, 1);
			break;
		case "this_6_months":
			start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
			endExclusive = new Date(today.getFullYear(), today.getMonth() + 1, 1);
			break;
		case "last_6_months":
			start = new Date(today.getFullYear(), today.getMonth() - 11, 1);
			endExclusive = new Date(today.getFullYear(), today.getMonth() - 5, 1);
			break;
		case "this_year":
			start = startOfYear;
			endExclusive = new Date(today.getFullYear() + 1, 0, 1);
			break;
		case "last_year":
			start = new Date(today.getFullYear() - 1, 0, 1);
			endExclusive = startOfYear;
			break;
	}
	return { start, endExclusive };
}

function isSettled(order: OrderRow) {
	return ["paid", "completed"].includes(String(order.status ?? "").toLowerCase());
}

function isCustomerAppOrder(order: OrderRow) {
	return String(order.source ?? "").toLowerCase() === "customer_self_service"
		|| String(order.orderChannel ?? order.order_channel ?? "").toLowerCase() === "app";
}

function orderId(order: OrderRow) {
	return String(order._id ?? order.id ?? order.orderNumber ?? "");
}

function money(value: unknown) {
	return Number(value ?? 0) || 0;
}

function toDate(value: unknown) {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number") return new Date(value);
	if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) return new Date(Number(value));
	const date = new Date(String(value));
	return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value: unknown) {
	const date = toDate(value);
	if (!date) return "";
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function displayDateKey(value: string) {
	const [, month, day] = value.split("-");
	return `${day ?? "-"}/${month ?? "-"}`;
}

function buildAnalytics(period: CustomerAnalyticsPeriod, customers: CustomerRow[], orders: OrderRow[]): CustomerAnalytics {
	const { start, endExclusive } = periodBounds(period);
	const startTime = start.getTime();
	const endTime = endExclusive.getTime();
	const inPeriod = (value: unknown) => {
		const date = toDate(value);
		const time = date?.getTime() ?? 0;
		return time >= startTime && time < endTime;
	};
	const appOrders = new Map<string, OrderRow>();
	for (const order of orders) {
		if (!isCustomerAppOrder(order) || !isSettled(order) || !inPeriod(order.createdAt ?? order.created_at)) continue;
		const id = orderId(order);
		if (id) appOrders.set(id, order);
	}
	const settledOrders = [...appOrders.values()];
	const trendMap = new Map<string, { orders: number; spending: number }>();
	const productMap = new Map<string, { quantity: number; spending: number }>();
	for (const order of settledOrders) {
		const key = dateKey(order.createdAt ?? order.created_at);
		if (key) {
			const current = trendMap.get(key) ?? { orders: 0, spending: 0 };
			current.orders += 1;
			current.spending += money(order.totalAmount ?? order.total_amount);
			trendMap.set(key, current);
		}
		for (const item of Array.isArray(order.items) ? order.items : []) {
			const name = String(item?.productName ?? item?.name ?? "Item").trim() || "Item";
			const current = productMap.get(name) ?? { quantity: 0, spending: 0 };
			current.quantity += money(item?.quantity);
			current.spending += money(item?.quantity) * money(item?.price);
			productMap.set(name, current);
		}
	}
	const trend: CustomerAnalytics["trend"] = [];
	for (const cursor = new Date(start); cursor < endExclusive; cursor.setDate(cursor.getDate() + 1)) {
		const key = dateKey(cursor);
		const current = trendMap.get(key) ?? { orders: 0, spending: 0 };
		trend.push({ label: displayDateKey(key), ...current });
	}
	const activeInPeriod = customers.filter((customer) => inPeriod(customer.last_active_at)).length;
	const newCustomers = customers.filter((customer) => inPeriod(customer.created_at)).length;
	const appVisits = customers.reduce((sum, customer) => sum + money(customer.djiwaapp_visit_count), 0);
	const walletBalance = customers.reduce((sum, customer) => sum + money(customer.wallet_balance), 0);
	const topCustomers = customers
		.map((customer) => {
			const customerOrders = settledOrders.filter((order) => {
				const id = String(order.customerSourceId ?? order.customer_source_id ?? "");
				return id && id === String(customer.source_id);
			});
			return {
				id: String(customer.source_id),
				name: String(customer.name ?? "Tanpa Nama"),
				email: String(customer.email ?? customer.phone ?? "-"),
				orders: customerOrders.length,
				spending: customerOrders.reduce((sum, order) => sum + money(order.totalAmount ?? order.total_amount), 0),
				visits: money(customer.djiwaapp_visit_count),
				lastActiveAt: customer.last_active_at ?? null,
			};
		})
		.filter((customer) => customer.orders > 0 || customer.visits > 0)
		.sort((a, b) => b.spending - a.spending || b.orders - a.orders)
		.slice(0, 8);
	return {
		period,
		periodLabel:
			period === "today" ? "Hari ini" :
			period === "yesterday" ? "Kemarin" :
			period === "this_week" ? "Minggu ini" :
			period === "last_week" ? "Minggu kemarin" :
			period === "this_month" ? "Bulan ini" :
			period === "last_month" ? "Bulan kemarin" :
			period === "this_3_months" ? "3 bulan ini" :
			period === "last_3_months" ? "3 bulan lalu" :
			period === "this_6_months" ? "6 bulan ini" :
			period === "last_6_months" ? "6 bulan lalu" :
			period === "this_year" ? "Tahun ini" : "Tahun lalu",
		activeCustomers: customers.length,
		newCustomers,
		activeInPeriod,
		appOrders: settledOrders.length,
		appSpending: settledOrders.reduce((sum, order) => sum + money(order.totalAmount ?? order.total_amount), 0),
		appVisits,
		walletBalance,
		trend,
		topProducts: [...productMap.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => b.quantity - a.quantity).slice(0, 8),
		topCustomers,
	};
}

export function useCustomerAppAnalytics(period: CustomerAnalyticsPeriod) {
	const [refreshTrigger, setRefreshTrigger] = useState(0);
	const bounds = useMemo(() => periodBounds(period), [period]);
	const load = useCallback(async () => {
		const supabase = createClient();
		const orderRequests = Array.from({ length: 10 }, (_, page) =>
			supabase.from("pos_orders").select("*").order("createdAt", { ascending: false }).range(page * 1000, page * 1000 + 999),
		);
		const [{ data: customers, error: customersError }, ...orderPages] = await Promise.all([
			supabase.from("pos_customers_view").select("*").order("total_spent", { ascending: false }),
			...orderRequests,
		]);
		const ordersError = orderPages.find((page) => page.error)?.error;
		const orders = orderPages.flatMap((page) => page.data ?? []);
		if (customersError) throw customersError;
		if (ordersError) throw ordersError;
		return buildAnalytics(period, (customers ?? []) as CustomerRow[], (orders ?? []) as OrderRow[]);
	}, [period]);
	const data = useSupabaseLiveValue<CustomerAnalytics>("customer-app-analytics", load, [period, refreshTrigger], {
		tables: ["customers", "orders", "customer_wallets", "order_items"],
		refreshMs: 60000,
	});
	return { data, isLoading: data === undefined, isError: data === null, periodStart: bounds.start, refresh: () => setRefreshTrigger((value) => value + 1) };
}
