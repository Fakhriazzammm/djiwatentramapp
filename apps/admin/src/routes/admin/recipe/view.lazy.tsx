import { createLazyFileRoute } from "@tanstack/react-router";
import { RecipeViewPage } from "@/components/admin/recipe-view";

export const Route = createLazyFileRoute("/admin/recipe/view")({
	component: RecipeViewPage,
});
