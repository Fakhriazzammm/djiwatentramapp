export type CustomerQueryResult<T> = {
	data: T | null;
	error: unknown | null;
};

export async function loadAllRows<Row>(
	loadPage: (range: [number, number]) => Promise<Row[]>,
	pageSize = 1000,
) {
	if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error("pageSize must be a positive integer");
	const rows: Row[] = [];
	for (let start = 0; ; start += pageSize) {
		const page = await loadPage([start, start + pageSize - 1]);
		rows.push(...page);
		if (page.length < pageSize) return rows;
	}
}

/**
 * Customer rows are the primary dataset. Order data is enrichment only:
 * hardened Supabase projects may deny that read until the staff session is
 * established, but that must not make the customer list disappear.
 */
export async function loadCustomerRows<CustomerRow, OrderRow>(
	loadCustomers: () => Promise<CustomerQueryResult<CustomerRow[]>>,
	loadOrders: () => Promise<CustomerQueryResult<OrderRow[]>>,
	mergeOrders: (customers: CustomerRow[], orders: OrderRow[]) => CustomerRow[] = (customers) => customers,
	onOrderError: (error: unknown) => void = (error) => console.warn("[admin-customers] order enrichment unavailable:", error),
) {
	const orderPromise = loadOrders().catch((error): CustomerQueryResult<OrderRow[]> => ({
		data: null,
		error,
	}));
	const [customerResult, orderResult] = await Promise.all([loadCustomers(), orderPromise]);

	if (customerResult.error) throw customerResult.error;

	const customers = customerResult.data ?? [];
	if (orderResult.error) {
		onOrderError(orderResult.error);
		return customers;
	}

	return mergeOrders(customers, orderResult.data ?? []);
}
