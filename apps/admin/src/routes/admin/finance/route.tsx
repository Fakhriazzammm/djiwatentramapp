import { createFileRoute, Outlet } from "@tanstack/react-router";

import { FinanceWorkspace } from "@/components/finance/finance-workspace";

export const Route = createFileRoute("/admin/finance")({
	component: () => <FinanceWorkspace><Outlet /></FinanceWorkspace>,
});
