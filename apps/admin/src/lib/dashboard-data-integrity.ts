export type DashboardReadStatuses = {
	orders: "fulfilled" | "rejected";
	booking: "fulfilled" | "rejected";
	products: "fulfilled" | "rejected";
	inventory: "fulfilled" | "rejected";
	shifts: "fulfilled" | "rejected";
	finance: "fulfilled" | "rejected";
};

/** Order data is the source of truth for revenue/order cards; never render a fake zero when it failed. */
export function getCriticalDashboardReadFailure(statuses: DashboardReadStatuses): string | null {
	return statuses.orders === "rejected"
		? "Data order belum dapat dimuat dari Supabase. Dashboard akan mencoba lagi otomatis."
		: null;
}
