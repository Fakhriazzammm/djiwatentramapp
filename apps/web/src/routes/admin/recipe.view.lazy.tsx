import { createLazyFileRoute } from "@tanstack/react-router";
import { RecipeBookViewPage } from "@/components/admin/recipe-book";

export const Route = createLazyFileRoute("/admin/recipe/view")({
	component: RecipeBookViewPage,
});
