import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/client";
import { readGuestOrderReferences } from "@/components/customer/types";
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
	productId: string;
	productName: string;
	quantity: number;
	price: number;
	variant?: string | null;
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
					productId: String(item.productId ?? item.product_id ?? ""),
					productName: String(item.productName ?? ""),
					quantity: Number(item.quantity ?? 0),
					price: Number(item.price ?? 0),
					variant: (item.variant as string | null | undefined) ?? null,
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

const CUSTOMER_API_BASE = "https://api.yumme.id/v1/customer";

// ── useCustomerOrders ──────────────────────────────────────────
// Query pos_orders WHERE customer_source_id = user.id.
// Realtime: reload otomatis saat ada perubahan di schema pos
// (status order berubah dari kasir/dapur → notifikasi ikut ter-update).
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";

export function useCustomerOrders() {
	const { customer, isLoading: authLoading } = useCustomerAuth();
	const sourceId = customer?.sourceId ?? null;

	const data = useSupabaseLiveValue<CustomerOrder[]>(
		`customer-orders-${sourceId ?? "guest"}`,
		async () => {
			if (!sourceId) {
				const references = readGuestOrderReferences();
				if (references.length === 0) return [];
				const response = await fetch(`${CUSTOMER_API_BASE}/guest-orders`, {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ orderIds: references.map((item) => item.orderId) }),
				});
				if (!response.ok) throw new Error(`Guest orders HTTP ${response.status}`);
				const payload = await response.json() as { success?: boolean; orders?: Record<string, unknown>[] };
				const rows = payload.success ? payload.orders ?? [] : [];
				const byId = new Map(rows.map((row) => [String(row._id ?? row.id), row]));
				return references.map((item) => byId.get(item.orderId)).filter(Boolean).map((row) => mapOrder(row as Record<string, unknown>));
			}

			const response = await fetch(`${CUSTOMER_API_BASE}/orders`, {
				credentials: "include",
				headers: { Accept: "application/json" },
			});
			if (!response.ok) throw new Error(`Customer orders HTTP ${response.status}`);
			const payload = await response.json() as { success?: boolean; orders?: Record<string, unknown>[] };
			return (payload.success ? payload.orders ?? [] : []).map((row) => mapOrder(row));
		},
		[sourceId],
		{
			realtimeSchemas: ["pos"],
			cacheKey: sourceId ? `customer:orders:${sourceId}` : undefined,
			cacheTtlMs: 300_000,
		},
	);

	return {
		orders: data ?? [],
		isLoading: authLoading || data === undefined,
		error: null,
	};
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
