import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/client";
import { useCustomerAuth, type CustomerUser } from "@/hooks/use-customer-auth";

// ── Types ──────────────────────────────────────────────────────

export type CustomerOrder = {
	id: string;
	orderNumber: string;
	status: string;
	totalAmount: number;
	paymentMethod: string | null;
	orderType: string | null;
	tableNumber: string | null;
	items: CustomerOrderItem[];
	createdAt: number;
};

export type CustomerOrderItem = {
	productName: string;
	quantity: number;
	price: number;
};

export type CustomerPointEntry = {
	id: number;
	customerId: string;
	points: number;
	balanceAfter: number;
	reason: string;
	referenceId: string | null;
	note: string | null;
	createdAt: string;
};

// ── Mappers ────────────────────────────────────────────────────

function mapOrder(row: Record<string, unknown>): CustomerOrder {
	return {
		id: String(row._id ?? row.id ?? ""),
		orderNumber: String(row.orderNumber ?? ""),
		status: String(row.status ?? ""),
		totalAmount: Number(row.totalAmount ?? 0),
		paymentMethod: (row.paymentMethod as string) ?? null,
		orderType: (row.orderType as string) ?? null,
		tableNumber: (row.tableNumber as string) ?? null,
		items: Array.isArray(row.items)
			? row.items.map((item: Record<string, unknown>) => ({
					productName: String(item.productName ?? ""),
					quantity: Number(item.quantity ?? 0),
					price: Number(item.price ?? 0),
				}))
			: [],
		createdAt: Number(row.createdAt ?? row._creationTime ?? 0),
	};
}

function mapPointEntry(row: Record<string, unknown>): CustomerPointEntry {
	return {
		id: Number(row.id ?? 0),
		customerId: String(row.customer_id ?? ""),
		points: Number(row.points ?? 0),
		balanceAfter: Number(row.balance_after ?? 0),
		reason: String(row.reason ?? ""),
		referenceId: (row.reference_id as string) ?? null,
		note: (row.note as string) ?? null,
		createdAt: String(row.created_at ?? ""),
	};
}

// ── useCustomerOrders ──────────────────────────────────────────
// Query pos_orders WHERE customer_source_id = user.id

export function useCustomerOrders() {
	const { customer, isLoading: authLoading } = useCustomerAuth();
	const [orders, setOrders] = useState<CustomerOrder[] | undefined>(
		undefined,
	);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadOrders = useCallback(async (cust: CustomerUser) => {
		setIsLoading(true);
		setError(null);
		try {
			const supabase = createClient();
			const { data, error: queryError } = await supabase
				.from("pos_orders")
				.select("*")
				.eq("customerSourceId", cust.sourceId)
				.order("createdAt", { ascending: false })
				.limit(50);

			if (queryError) throw queryError;

			setOrders(
				(data ?? []).map((row: unknown) =>
					mapOrder(row as Record<string, unknown>),
				),
			);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Gagal memuat riwayat pesanan";
			console.error("[useCustomerOrders]", message);
			setError(message);
			setOrders([]);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (authLoading) return;
		if (!customer) {
			setOrders(undefined);
			setIsLoading(false);
			return;
		}
		void loadOrders(customer);
	}, [customer, authLoading, loadOrders]);

	return { orders, isLoading, error, refetch: loadOrders };
}

// ── useCustomerPoints ──────────────────────────────────────────
// Query pos.customer_point_ledger WHERE customer_id = user.id

export function useCustomerPoints() {
	const { customer, isLoading: authLoading } = useCustomerAuth();
	const [points, setPoints] = useState<CustomerPointEntry[] | undefined>(
		undefined,
	);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Derived totals from the ledger
	const totalPoints = useMemo(() => {
		if (!points || points.length === 0) return 0;
		// The last entry's balanceAfter is the current total
		return points[0]?.balanceAfter ?? 0;
	}, [points]);

	const loadPoints = useCallback(async (cust: CustomerUser) => {
		setIsLoading(true);
		setError(null);
		try {
			const supabase = createClient();
			const { data, error: queryError } = await supabase
				.schema("pos")
				.from("customer_point_ledger")
				.select("*")
				.eq("customer_id", cust.sourceId)
				.order("created_at", { ascending: false })
				.limit(100);

			if (queryError) throw queryError;

			setPoints(
				(data ?? []).map((row: unknown) =>
					mapPointEntry(row as Record<string, unknown>),
				),
			);
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Gagal memuat riwayat poin";
			console.error("[useCustomerPoints]", message);
			setError(message);
			setPoints([]);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (authLoading) return;
		if (!customer) {
			setPoints(undefined);
			setIsLoading(false);
			return;
		}
		void loadPoints(customer);
	}, [customer, authLoading, loadPoints]);

	return {
		points,
		isLoading,
		error,
		totalPoints,
		refetch: loadPoints,
	};
}
