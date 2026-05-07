import { createFileRoute } from "@tanstack/react-router";
import { TransactionsView } from "./-components/transactions-view";

export const Route = createFileRoute("/admin/finance/transactions")({
	component: TransactionsView,
});
