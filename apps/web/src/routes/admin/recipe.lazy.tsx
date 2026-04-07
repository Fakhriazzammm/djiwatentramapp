import { createLazyFileRoute } from "@tanstack/react-router";
import { RecipeStudioPage } from "@/components/admin/recipe-book";

export const Route = createLazyFileRoute("/admin/recipe")({
	component: RecipeStudioPage,
});
