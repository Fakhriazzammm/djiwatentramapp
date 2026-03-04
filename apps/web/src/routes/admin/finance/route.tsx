import { createFileRoute } from "@tanstack/react-router";
import { FinanceDashboard } from "./-components/finance-dashboard";

export const Route = createFileRoute("/admin/finance")({
	component: FinanceDashboard,
});
