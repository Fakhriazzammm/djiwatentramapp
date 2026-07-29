import { createFileRoute } from "@tanstack/react-router";
import { ShiftReportsPage } from "./-components/shift-reports-page";

export const Route = createFileRoute("/admin/finance/shift-reports")({
	component: ShiftReportsPage,
});
