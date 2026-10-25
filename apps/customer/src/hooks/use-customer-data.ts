import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/client";
import { invokeEdgeFunction } from "@/lib/api-helper";
import { readGuestOrderReferences } from "@/components/customer/types";
import { useCustomerAuth, type CustomerUser } from "@/hooks/use-customer-auth";
import type { CustomerWalletTransaction } from "@/lib/customer-wallet-adapter";

// ── Types ──────────────────────────────────────────────────────

export type CustomerOrder = {
	id: string;
	orderNumber: string;
	status: string;
	totalAmount: number;
	discountAmount?: number;
	taxAmount?: number;
	serviceChargeAmount?: number;
	paymentReceiptKind?: string | null;
	receiptMeta?: Record<string, unknown> | null;
	paymentMethod: string | null;
	orderType: string | null;
	tableNumber: string | null;
	items: CustomerOrderItem[];
	createdAt: number;
	trackingStatus?: string | null;
	paymentDeadlineAt?: string | null;
	estimatedReadyAt?: string | null;
	slaStartedAt?: string | null;
	slaDeadlineAt?: string | null;
	isLate?: boolean;
	lateMinutes?: number;
	trackingGroupCount?: number;
	trackingFinishedGroupCount?: number;
	trackingGroups?: Array<{ groupType: string; status: string; completedAt?: string | null; updatedAt?: string | null }>;
};

export type CustomerOrderItem = {
	productId: string;
	productName: string;
	quantity: number;
	price: number;
	originalPrice?: number;
	variant?: string | null;
	status?: string | null;
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
		id: String(row._id ?? row.source_id ?? row.id ?? ""),
		orderNumber: String(row.orderNumber ?? row.order_number ?? ""),
		status: String(row.status ?? ""),
		totalAmount: Number(row.totalAmount ?? row.total_amount ?? 0),
		discountAmount: Number(row.discountAmount ?? row.discount_amount ?? 0),
		taxAmount: Number(row.taxAmount ?? row.tax_amount ?? 0),
		serviceChargeAmount: Number(row.serviceChargeAmount ?? row.service_charge_amount ?? 0),
		paymentReceiptKind: (row.paymentReceiptKind as string) ?? (row.payment_receipt_kind as string) ?? null,
		receiptMeta: (row.receiptMeta ?? row.receipt_meta) && typeof (row.receiptMeta ?? row.receipt_meta) === "object" ? (row.receiptMeta ?? row.receipt_meta) as Record<string, unknown> : null,
		paymentMethod: (row.paymentMethod as string) ?? (row.payment_method as string) ?? null,
		orderType: (row.orderType as string) ?? (row.order_type as string) ?? null,
		tableNumber: (row.tableNumber as string) ?? (row.table_number as string) ?? null,
		items: Array.isArray(row.items)
			? row.items.map((item: Record<string, unknown>) => ({
					productId: String(item.productId ?? item.product_id ?? ""),
					productName: String(item.productName ?? item.product_name ?? ""),
					quantity: Number(item.quantity ?? 0),
					price: Number(item.price ?? 0),
					originalPrice: item.originalPrice == null ? undefined : Number(item.originalPrice),
					variant: (item.variant as string | null | undefined) ?? null,
					status: (item.status as string | null | undefined) ?? null,
				}))
			: [],
		createdAt: Number(row.createdAt ?? row.created_at ?? row._creationTime ?? 0),
		trackingStatus: (row.trackingStatus ?? row.tracking_status) as string | null | undefined,
		paymentDeadlineAt: (row.paymentDeadlineAt ?? row.payment_deadline_at) as string | null | undefined,
		estimatedReadyAt: (row.estimatedReadyAt ?? row.estimated_ready_at) as string | null | undefined,
		slaStartedAt: (row.slaStartedAt ?? row.sla_started_at) as string | null | undefined,
		slaDeadlineAt: (row.slaDeadlineAt ?? row.sla_deadline_at) as string | null | undefined,
		isLate: Boolean(row.isLate ?? row.is_late ?? false),
		lateMinutes: Number(row.lateMinutes ?? row.late_minutes ?? 0),
		trackingGroupCount: Number(row.trackingGroupCount ?? row.tracking_group_count ?? 0),
		trackingFinishedGroupCount: Number(row.trackingFinishedGroupCount ?? row.tracking_finished_group_count ?? 0),
		trackingGroups: Array.isArray(row.trackingGroups ?? row.tracking_groups) ? (row.trackingGroups ?? row.tracking_groups) as CustomerOrder["trackingGroups"] : [],
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

const CUSTOMER_API_BASE = import.meta.env.VITE_CUSTOMER_API_URL?.trim() || "https://api.djiwatentram.web.id/v1/customer";

// ── useCustomerOrders ──────────────────────────────────────────
// Query pos_orders WHERE customer_source_id = user.id.
// Realtime: reload otomatis saat ada perubahan di schema pos
// (status order berubah dari kasir/dapur → notifikasi ikut ter-update).
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";

export function useCustomerOrders(options?: { onRealtimeUpdate?: () => void }) {
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
					body: JSON.stringify({ orders: references.map((item) => ({ orderId: item.orderId, accessToken: item.accessToken })) }),
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
			onRealtimeUpdate: options?.onRealtimeUpdate,
			cacheKey: undefined,
			cacheTtlMs: 0,
		},
	);

	return {
		orders: data ?? [],
		isLoading: authLoading || data === undefined,
		error: null,
	};
}

export function useCustomerOrderCount() {
	const { orders, isLoading, error } = useCustomerOrders();
	const orderCount = (orders ?? []).reduce(
		(total, order) => total + order.items.reduce((itemsTotal, item) => itemsTotal + Math.max(0, Number(item.quantity) || 0), 0),
		0,
	);
	return { orderCount, isLoading, error };
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


export type CustomerWallet = {
  customer_id: string;
  currency: "IDR";
  available_balance: number;
  held_balance: number;
  total_credited: number;
  total_debited: number;
  status: "active" | "blocked";
  updated_at: string;
};

export type CustomerWalletLedgerEntry = {
  id: number;
  amount: number;
  direction: "credit" | "debit";
  balance_after: number;
  status: string;
  transaction_type: string;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_at: string;
};

export function useCustomerWallet() {
  const { customer, isLoading: authLoading } = useCustomerAuth();
  const [wallet, setWallet] = useState<CustomerWallet | null>(null);
  const [ledger, setLedger] = useState<CustomerWalletLedgerEntry[]>([]);
  const [transactions, setTransactions] = useState<CustomerWalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedWallet = useRef(false);

  const loadWallet = useCallback(async (): Promise<{ wallet: CustomerWallet | null; ledger: CustomerWalletLedgerEntry[]; transactions: CustomerWalletTransaction[] } | null> => {
    if (!customer?.sourceId || !customer.email) {
      setWallet(null); setLedger([]); setTransactions([]); setIsLoading(false); return null;
    }
    if (!hasLoadedWallet.current) setIsLoading(true);
    setError(null);
    try {
      const result = await invokeEdgeFunction<{ wallet: CustomerWallet; ledger: CustomerWalletLedgerEntry[]; transactions?: CustomerWalletTransaction[] }>("customer-wallet", {
        action: "get", sourceId: customer.sourceId, email: customer.email,
      });
      setWallet(result.wallet ?? null);
      setLedger(result.ledger ?? []);
      setTransactions(result.transactions ?? []);
      hasLoadedWallet.current = true;
      return { wallet: result.wallet ?? null, ledger: result.ledger ?? [], transactions: result.transactions ?? [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal memuat saldo wallet";
      console.error("[useCustomerWallet]", message);
      setError(message);
      if (!hasLoadedWallet.current) {
        setWallet(null);
        setLedger([]);
        setTransactions([]);
      }
      return null;
    } finally { setIsLoading(false); }
  }, [customer?.email, customer?.sourceId]);

  useEffect(() => {
    if (authLoading) return;
    void loadWallet();
  }, [authLoading, loadWallet]);

  return { wallet, ledger, transactions, isLoading: authLoading || isLoading, error, refetch: loadWallet };
}
