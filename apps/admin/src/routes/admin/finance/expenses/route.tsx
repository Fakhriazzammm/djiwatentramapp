import { createFileRoute } from "@tanstack/react-router";
import { ExpensesTable } from "./-components/expenses-table";

export const Route = createFileRoute("/admin/finance/expenses")({
	component: ExpensesTable,
});
