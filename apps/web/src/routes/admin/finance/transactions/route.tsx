import { createFileRoute } from "@tanstack/react-router";
import { TransactionsTabs } from "./-components/transaction-tabs";

export const Route = createFileRoute("/admin/finance/transactions")({
	component: TransactionsTabs,
});
