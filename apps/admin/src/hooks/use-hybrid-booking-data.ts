import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";

const publicAssetBaseUrl = (
	import.meta.env.VITE_SUPABASE_STORAGE_PUBLIC_URL as string | undefined
)
	?.trim()
	?.replace(/\/+$/, "");

function toPublicAssetUrl(value?: string | null) {
	if (!value) {
		return value ?? null;
	}
	if (/^https?:\/\//i.test(value)) {
		return value;
	}
	if (!publicAssetBaseUrl) {
		return value;
	}
	return `${publicAssetBaseUrl}/${String(value).replace(/^\/+/, "")}`;
}

function useSupabaseValue<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[]
) {
	return useSupabaseLiveValue(key, load, deps);
}

async function fetchBookingSettings(slug: string) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_booking_settings")
		.select("*")
		.eq("slug", slug)
		.maybeSingle();

	if (error) throw error;
	if (!data) return null;

	return {
		_id: data._id,
		slug: data.slug,
		title: data.title,
		description: data.description ?? undefined,
		logoUrl: toPublicAssetUrl(data.logoUrl),
		bannerUrl: toPublicAssetUrl(data.bannerUrl),
		themeColor: data.themeColor ?? undefined,
		socialLinks: Array.isArray(data.socialLinks) ? data.socialLinks : undefined,
		featuredProductIds: Array.isArray(data.featuredProductIds)
			? data.featuredProductIds
			: undefined,
		paymentMethods: Array.isArray(data.paymentMethods)
			? data.paymentMethods
			: undefined,
		bankDetails: data.bankDetails ?? undefined,
		qrisImage: toPublicAssetUrl(data.qrisImage),
		isActive: Boolean(data.isActive),
		bookingWindowDays: Math.max(1, Number(data.bookingWindowDays ?? 90)),
		defaultMaxPeople: Math.max(0, Number(data.defaultMaxPeople ?? 100)),
		defaultMaxTables: Math.max(0, Number(data.defaultMaxTables ?? 25)),
		defaultPeoplePerTable: Math.max(1, Number(data.defaultPeoplePerTable ?? 4)),
		customFields: Array.isArray(data.customFields) ? data.customFields : undefined,
		raw: data.raw,
	};
}

async function fetchBookingOrders(args: {
	slug: string;
	date?: string;
	startDate?: string;
	endDate?: string;
}) {
	const supabase = createClient();
	let query = supabase
		.from("pos_booking_orders")
		.select("*")
		.eq("slug", args.slug)
		.order("createdAt", { ascending: false });

	if (args.date) {
		query = query.eq("bookingDate", args.date);
	} else {
		if (args.startDate) query = query.gte("bookingDate", args.startDate);
		if (args.endDate) query = query.lte("bookingDate", args.endDate);
	}

	const { data, error } = await query;
	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		_creationTime: Number(row._creationTime ?? row.createdAt ?? 0),
		slug: row.slug ?? "booking",
		bookingCode: row.bookingCode ?? "",
		customerName: row.customerName ?? "",
		customerPhone: row.customerPhone ?? "",
		customerEmail: row.customerEmail ?? "",
		notes: row.notes ?? null,
		bookingDate: row.bookingDate ?? "",
		totalAmount: Number(row.totalAmount ?? 0),
		paymentMethod: row.paymentMethod ?? null,
		paymentStatus: row.paymentStatus ?? null,
		bookingStatus: row.bookingStatus ?? null,
		guestCount:
			row.guestCount === null || row.guestCount === undefined
				? null
				: Number(row.guestCount),
		tableCount:
			row.tableCount === null || row.tableCount === undefined
				? null
				: Number(row.tableCount),
		paymentProofImage: toPublicAssetUrl(row.paymentProofImage),
		transferredAmount:
			row.transferredAmount === null || row.transferredAmount === undefined
				? null
				: Number(row.transferredAmount),
		customAnswers:
			row.customAnswers && typeof row.customAnswers === "object"
				? row.customAnswers
				: null,
		createdAt: Number(row.createdAt ?? 0),
		items: Array.isArray(row.items)
			? row.items.map((item: any) => ({
					productId: item.productId ?? null,
					name: item.name ?? "",
					price: Number(item.price ?? 0),
					quantity: Number(item.quantity ?? 0),
			  }))
			: [],
	}));
}

async function fetchDateCapacities(slug: string) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_booking_date_capacity")
		.select("*")
		.eq("slug", slug)
		.order("date", { ascending: true });

	if (error) throw error;

	return (data ?? []).map((row: any) => ({
		_id: row._id,
		slug: row.slug,
		date: row.date,
		maxPeople: Number(row.maxPeople ?? 0),
		maxTables: Number(row.maxTables ?? 0),
		peoplePerTable: Number(row.peoplePerTable ?? 4),
		isClosed: Boolean(row.isClosed ?? row.is_closed),
		notes: row.notes ?? undefined,
	}));
}

function buildMonthSummary(
	orders: Array<any>,
	capacities: Array<any>,
	settings: any
): Record<
	string,
	{
		count: number;
		capacity: number;
		maxPeople: number;
		maxTables: number;
		peoplePerTable: number;
		bookedPeople: number;
		bookedTables: number;
		pending: number;
		confirmed: number;
		isClosed: boolean;
	}
> {
	const capMap: Record<string, { people: number; tables: number; perTable: number; isClosed: boolean }> = {};
	for (const capacity of capacities) {
		if (capacity.date) {
			capMap[capacity.date] = {
				people: Number(capacity.maxPeople ?? 0),
				tables: Number(capacity.maxTables ?? 0),
				perTable: Number(capacity.peoplePerTable ?? 4),
				isClosed: Boolean(capacity.isClosed),
			};
		}
	}

	const summary: Record<
		string,
		{
			count: number;
			capacity: number;
			maxPeople: number;
			maxTables: number;
			peoplePerTable: number;
			bookedPeople: number;
			bookedTables: number;
			pending: number;
			confirmed: number;
			isClosed: boolean;
		}
	> = {};

	const defaultCapacity = {
		people: Number(settings?.defaultMaxPeople ?? 100),
		tables: Number(settings?.defaultMaxTables ?? 25),
		perTable: Number(settings?.defaultPeoplePerTable ?? 4),
		isClosed: false,
	};
	const [year, month] = String(settings?._summaryMonth ?? "1970-01").split("-").map(Number);
	if (year && month) {
		const days = new Date(year, month, 0).getDate();
		for (let day = 1; day <= days; day += 1) {
			const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
			const cap = capMap[date] ?? defaultCapacity;
			summary[date] = { count: 0, capacity: cap.people, maxPeople: cap.people, maxTables: cap.tables, peoplePerTable: cap.perTable, bookedPeople: 0, bookedTables: 0, pending: 0, confirmed: 0, isClosed: cap.isClosed };
		}
	}

	for (const order of orders) {
		const bookingDate = String(order.bookingDate ?? "");
		if (!bookingDate) {
			continue;
		}

		if (!summary[bookingDate]) {
			const cap = capMap[bookingDate] ?? defaultCapacity;
			summary[bookingDate] = {
				count: 0,
				capacity: cap.people,
				maxPeople: cap.people,
				maxTables: cap.tables,
				peoplePerTable: cap.perTable,
				bookedPeople: 0,
				bookedTables: 0,
				pending: 0,
				confirmed: 0,
				isClosed: cap.isClosed,
			};
		}

		if (order.bookingStatus !== "cancelled") {
			summary[bookingDate]!.count += 1;
			summary[bookingDate]!.bookedPeople += Number(order.guestCount ?? 0);
			summary[bookingDate]!.bookedTables += Number(order.tableCount ?? 0);
			if (order.bookingStatus === "pending") summary[bookingDate]!.pending += 1;
			if (order.bookingStatus === "confirmed")
				summary[bookingDate]!.confirmed += 1;
		}
	}

	return summary;
}

async function fetchMonthSummary(slug: string, yearMonth: string) {
	const start = `${yearMonth}-01`;
	const end = `${yearMonth}-31`;
	const [orders, capacities, settings] = await Promise.all([
		fetchBookingOrders({ slug, startDate: start, endDate: end }),
		(async () => {
			const supabase = createClient();
			const { data, error } = await supabase
				.from("pos_booking_date_capacity")
				.select("*")
				.eq("slug", slug)
				.gte("date", start)
				.lte("date", end);
			if (error) throw error;
			return data ?? [];
		})(),
		fetchBookingSettings(slug),
	]);
	return buildMonthSummary(orders, capacities, { ...(settings ?? {}), _summaryMonth: yearMonth });
}

async function fetchBookingProducts(slug: string) {
	const [settings, products] = await Promise.all([
		fetchBookingSettings(slug),
		(async () => {
			const supabase = createClient();
			const { data, error } = await supabase
				.from("pos_products_all")
				.select("*")
				.eq("isAvailable", true)
				.order("menuNumber", { ascending: true, nullsFirst: false });
			if (error) throw error;
			return data ?? [];
		})(),
	]);

	const mappedProducts = products.map((row: any) => ({
		_id: row._id,
		categoryId: row.categoryId,
		name: row.name,
		description: row.description,
		price: Number(row.price ?? 0),
		promoPrice:
			row.promoPrice === null || row.promoPrice === undefined
				? null
				: Number(row.promoPrice),
		image: toPublicAssetUrl(row.image),
		isAvailable: Boolean(row.isAvailable),
		quantity:
			row.quantity === null || row.quantity === undefined
				? null
				: Number(row.quantity),
		menuNumber:
			row.menuNumber === null || row.menuNumber === undefined
				? null
				: Number(row.menuNumber),
		variations: row.variations,
	}));

	const featuredIds = Array.isArray(settings?.featuredProductIds)
		? settings?.featuredProductIds
		: [];
	if (!featuredIds || featuredIds.length === 0) {
		return mappedProducts;
	}

	const byId = new Map(
		mappedProducts.map(
			(product: (typeof mappedProducts)[number]) => [String(product._id), product]
		)
	);
	const orderedFeatured = featuredIds
		.map((id) => byId.get(String(id)))
		.filter((product): product is (typeof mappedProducts)[number] => product != null);

	return orderedFeatured;
}

export function useHybridBookingSettings(slug: string) {
	const supabaseData = useSupabaseValue(
		`booking-settings:${slug}`,
		() => fetchBookingSettings(slug),
		[slug]
	);
	return supabaseData as any;
}

export function useHybridBookingOrders(
	args:
		| {
				slug: string;
				date?: string;
				startDate?: string;
				endDate?: string;
		  }
		| "skip"
) {
	const supabaseData = useSupabaseValue(
		args === "skip"
			? "booking-orders:skip"
			: `booking-orders:${args.slug}:${args.date ?? ""}:${args.startDate ?? ""}:${args.endDate ?? ""}`,
		() => (args === "skip" ? Promise.resolve(null) : fetchBookingOrders(args)),
		[
			args === "skip" ? "__skip__" : args.slug,
			args === "skip" ? "" : args.date,
			args === "skip" ? "" : args.startDate,
			args === "skip" ? "" : args.endDate,
		]
	);
	return supabaseData as any;
}

export function useHybridBookingDateCapacities(slug: string) {
	const supabaseData = useSupabaseValue(
		`booking-date-capacities:${slug}`,
		() => fetchDateCapacities(slug),
		[slug]
	);
	return supabaseData as any;
}

export function useHybridBookingMonthSummary(slug: string, yearMonth: string) {
	const supabaseData = useSupabaseValue(
		`booking-month-summary:${slug}:${yearMonth}`,
		() => fetchMonthSummary(slug, yearMonth),
		[slug, yearMonth]
	);
	return supabaseData as any;
}

export function useHybridBookingProducts(slug: string) {
	const supabaseData = useSupabaseValue(
		`booking-products:${slug}`,
		() => fetchBookingProducts(slug),
		[slug]
	);
	return supabaseData as any;
}

