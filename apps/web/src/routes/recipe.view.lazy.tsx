import { createLazyFileRoute } from "@tanstack/react-router";
import { RecipeBookViewPage } from "@/components/admin/recipe-book";

export const Route = createLazyFileRoute("/recipe/view")({
	component: RecipeBookViewPage,
});
