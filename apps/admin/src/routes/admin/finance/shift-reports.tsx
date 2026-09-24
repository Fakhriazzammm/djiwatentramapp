import { createFileRoute } from "@tanstack/react-router";
import { ShiftReportsPage } from "./-components/shift-reports-page";

export const Route = createFileRoute("/admin/finance/shift-reports")({
	validateSearch: (search: Record<string, unknown>) => ({
		selectedStartTime: Number(search.selectedStartTime) || undefined,
	}),
	component: ShiftReportsRoute,
});

function ShiftReportsRoute() {
	const { selectedStartTime } = Route.useSearch();
	return <ShiftReportsPage selectedStartTime={selectedStartTime} />;
}
