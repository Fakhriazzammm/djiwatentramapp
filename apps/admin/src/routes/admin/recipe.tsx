import { ManualStockGate } from "@djiwaapps/web-shared/components/inventory/manual-stock-page";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/recipe")({
	component: () => <ManualStockGate disabled><Outlet /></ManualStockGate>,
});
