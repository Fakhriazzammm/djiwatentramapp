import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";
import { readGuestOrderReferences } from "@/components/customer/types";

const CUSTOMER_ORDER_API = import.meta.env.VITE_CUSTOMER_API_URL?.trim() || "https://api.djiwatentram.web.id/v1/customer";

function useSupabaseValue<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[]
) {
	return useSupabaseLiveValue(key, load, deps);
}

function resolveMayarConfig() {
	return {
		configured: true,
		missing: [],
		baseUrl: "",
	};
}

async function fetchOrderById(id: string, signal: AbortSignal) {
	const accessToken = readGuestOrderReferences().find((reference) => reference.orderId === id)?.accessToken;
	if (accessToken) {
		const response = await fetch(`${CUSTOMER_ORDER_API}/guest-orders`, {
			method: "POST",
			signal,
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ orders: [{ orderId: id, accessToken }] }),
		});
		if (!response.ok) throw new Error(`Order fetch HTTP ${response.status}`);
		const payload = (await response.json()) as { success?: boolean; orders?: unknown[] };
		return (payload.success ? payload.orders?.[0] : null) ?? null;
	}

	// Members authenticate through Better Auth, so the protected member endpoint
	// is the source of truth. The previous implementation sent an empty guest
	// request for members, which produced an empty receipt after live tracking.
	const response = await fetch(`${CUSTOMER_ORDER_API}/orders`, {
		signal,
		credentials: "include",
		headers: { Accept: "application/json" },
	});
	if (!response.ok) throw new Error(`Order fetch HTTP ${response.status}`);
	const payload = (await response.json()) as { success?: boolean; orders?: Array<Record<string, unknown>> };
	return (payload.success ? payload.orders ?? [] : []).find((row) => String(row._id ?? row.id ?? row.source_id) === id) ?? null;
}

async function fetchVariationPresets() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_variation_presets")
		.select("*")
		.order("name", { ascending: true });

	if (error) throw error;
	return (data ?? []).map((row: any) => ({
		_id: row._id,
		name: row.name ?? "",
		options: Array.isArray(row.options) ? row.options : [],
	}));
}

async function fetchTrackOrders(track: "kitchen" | "bar") {
	const supabase = createClient();

	const [categoryResult, productResult, orderResult] = await Promise.all([
		supabase.from("pos_categories").select("*"),
		supabase.from("pos_products_all").select("*"),
		supabase
			.from("pos_orders")
			.select("*")
			.neq("status", "completed")
			.neq("status", "cancelled")
			.order("createdAt", { ascending: true }),
	]);

	if (categoryResult.error) throw categoryResult.error;
	if (productResult.error) throw productResult.error;
	if (orderResult.error) throw orderResult.error;

	const categories = categoryResult.data ?? [];
	const products = productResult.data ?? [];
	const orders = orderResult.data ?? [];

	const trackCategoryIds = new Set(
		categories
			.filter((category: any) => {
				if (category.track === track) return true;
				if (!category.parentId) return false;
				const parent = categories.find(
					(candidate: any) => candidate._id === category.parentId
				);
				return parent?.track === track;
			})
			.map((category: any) => category._id)
	);

	const productToTrack = new Map<string, "kitchen" | "bar">();
	for (const product of products as any[]) {
		if (trackCategoryIds.has(product.categoryId)) {
			productToTrack.set(product._id, track);
		}
	}

	return orders
		.map((order: any) => {
			const orderItems = Array.isArray(order.items) ? order.items : [];
			const itemsWithMetadata = orderItems
				.map((item: any, index: number) => ({ ...item, originalIndex: index }))
				.filter((item: any) => productToTrack.get(String(item.productId)) === track);

			if (itemsWithMetadata.length === 0) return null;

			return {
				...order,
				items: itemsWithMetadata.map((item: any) => ({
					productId: item.productId,
					productName: item.productName,
					variant: item.variant,
					quantity: Number(item.quantity ?? 0),
					price: Number(item.price ?? 0),
					originalPrice:
						item.originalPrice === null || item.originalPrice === undefined
							? undefined
							: Number(item.originalPrice),
					status: item.status,
				})),
				originalItemCount: orderItems.length,
				itemsWithMetadata,
			};
		})
		.filter(Boolean);
}

export function useHybridMayarConfig() {
	const localConfig = useMemo(() => resolveMayarConfig(), []);
	return localConfig as any;
}

export function useHybridOrderById(id?: string | null, refreshTrigger = 0) {
	const [order, setOrder] = useState<Awaited<ReturnType<typeof fetchOrderById>> | undefined>();
	const reloadRef = useRef<(() => void) | null>(null);
	const previousTriggerRef = useRef(refreshTrigger);

	useEffect(() => {
		setOrder(id ? undefined : null);
		if (!id) return;
		const controller = new AbortController();
		let active = true;
		let inFlight = false;
		let pending = false;
		const reload = async () => {
			if (!active) return;
			if (inFlight) {
				pending = true;
				return;
			}
			inFlight = true;
			do {
				pending = false;
				try {
					const next = await fetchOrderById(id, controller.signal);
					if (active) setOrder(next);
				} catch (error) {
					if (active) console.warn("[customer-order-refresh]", error);
				}
			} while (active && pending);
			inFlight = false;
		};
		reloadRef.current = () => { void reload(); };
		void reload();
		return () => {
			active = false;
			pending = false;
			reloadRef.current = null;
			controller.abort();
		};
	}, [id]);

	useEffect(() => {
		if (previousTriggerRef.current === refreshTrigger) return;
		previousTriggerRef.current = refreshTrigger;
		reloadRef.current?.();
	}, [refreshTrigger]);
	return order as any;
}

export function useHybridVariationPresets() {
	const supabaseData = useSupabaseValue(
		"variation-presets",
		fetchVariationPresets,
		[]
	);
	return supabaseData as any;
}

export function useHybridTrackOrders(track: "kitchen" | "bar") {
	const supabaseData = useSupabaseValue(
		`track-orders:${track}`,
		() => fetchTrackOrders(track),
		[track]
	);
	return supabaseData as any;
}

async function fetchOrderStatus(track: "barista" | "kitchen") {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_order_status")
		.select("*")
		.neq("status", "selesai")
		.eq("group_type", track)
		.order("created_at", { ascending: false });
	if (error) throw error;
	return (data ?? []) as any[];
}

export function useHybridOrderStatus(track: "barista" | "kitchen") {
	const supabaseData = useSupabaseValue(
		`order-status:${track}`,
		() => fetchOrderStatus(track),
		[track]
	);
	return supabaseData as any;
}

export function useHybridAllOrderStatus() {
	const supabase = createClient();
	const [records, setRecords] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		fetchAllActiveOrderStatus().then(setRecords).finally(() => setLoading(false));
	}, []);
	return { records, loading };
}

async function fetchAllActiveOrderStatus() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_order_status")
		.select("*")
		.neq("status", "selesai")
		.order("created_at", { ascending: false });
	if (error) throw error;
	return (data ?? []) as any[];
}

