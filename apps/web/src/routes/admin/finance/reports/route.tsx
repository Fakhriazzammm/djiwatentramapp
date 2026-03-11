import { createFileRoute } from "@tanstack/react-router";
import { FinancialReports } from "./-components/financial-reports";

export const Route = createFileRoute("/admin/finance/reports")({
	component: FinancialReports,
});
