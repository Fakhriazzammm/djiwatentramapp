import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "./use-supabase-live-value";

export type CustomerAnalyticsPeriod = "today" | "7d" | "30d" | "month";

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
	const end = new Date();
	const start = new Date(end);
	if (period === "today") {
		start.setHours(0, 0, 0, 0);
	} else if (period === "7d") {
		start.setDate(start.getDate() - 6);
		start.setHours(0, 0, 0, 0);
	} else if (period === "30d") {
		start.setDate(start.getDate() - 29);
		start.setHours(0, 0, 0, 0);
	} else {
		start.setDate(1);
		start.setHours(0, 0, 0, 0);
	}
	return { start, end };
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

function dateKey(value: unknown) {
	const date = value ? new Date(String(value)) : null;
	return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function displayDateKey(value: string) {
	const [, month, day] = value.split("-");
	return `${day ?? "-"}/${month ?? "-"}`;
}

function buildAnalytics(period: CustomerAnalyticsPeriod, customers: CustomerRow[], orders: OrderRow[]): CustomerAnalytics {
	const { start, end } = periodBounds(period);
	const startTime = start.getTime();
	const endTime = end.getTime();
	const inPeriod = (value: unknown) => {
		const time = value ? new Date(String(value)).getTime() : 0;
		return time >= startTime && time <= endTime;
	};
	const customerMap = new Map(customers.map((customer) => [String(customer.source_id), customer]));
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
	for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
		const key = cursor.toISOString().slice(0, 10);
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
		periodLabel: period === "today" ? "Hari ini" : period === "7d" ? "7 hari terakhir" : period === "30d" ? "30 hari terakhir" : "Bulan ini",
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
		const [{ data: customers, error: customersError }, { data: orders, error: ordersError }] = await Promise.all([
			supabase.from("pos_customers_view").select("*").order("total_spent", { ascending: false }),
			supabase.from("pos_orders").select("*").order("createdAt", { ascending: false }).limit(2000),
		]);
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
