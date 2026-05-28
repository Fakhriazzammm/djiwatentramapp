import { createFileRoute } from "@tanstack/react-router";
import { AccountingPage } from "./-components/accounting-page";

export const Route = createFileRoute("/admin/finance/accounting")({
	component: AccountingPage,
});
