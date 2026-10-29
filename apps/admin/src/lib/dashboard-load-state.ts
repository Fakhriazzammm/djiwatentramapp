export type DashboardLoadStatus = "loading" | "ready" | "error";

export function getDashboardLoadState(
	status: DashboardLoadStatus,
	data: unknown,
): "loading" | "ready" | "error" {
	if (data !== null && data !== undefined) return "ready";
	return status === "error" ? "error" : "loading";
}
