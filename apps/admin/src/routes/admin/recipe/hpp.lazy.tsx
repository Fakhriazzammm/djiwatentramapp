import { createLazyFileRoute } from "@tanstack/react-router";
import { RecipeHppPage } from "@/components/admin/recipe-hpp";

import { FinanceWorkspace } from "@/components/finance/finance-workspace";

export const Route = createLazyFileRoute("/admin/recipe/hpp")({
	component: () => <FinanceWorkspace><RecipeHppPage /></FinanceWorkspace>,
});
