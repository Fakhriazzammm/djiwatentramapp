import { createFileRoute } from "@tanstack/react-router";
import { MoneyFlowPage } from "./-components/money-flow-page";

export const Route = createFileRoute("/admin/finance/flow")({
	component: MoneyFlowPage,
});
