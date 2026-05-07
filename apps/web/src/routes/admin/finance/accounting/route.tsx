import { createFileRoute } from "@tanstack/react-router";
import { AccountingManager } from "./-components/accounting-manager";

export const Route = createFileRoute("/admin/finance/accounting")({
	component: AccountingManager,
});
